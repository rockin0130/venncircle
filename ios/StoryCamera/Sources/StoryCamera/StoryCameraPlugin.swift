import Foundation
import AVFoundation
import UIKit
import WebKit
import Capacitor

/// Hosts `AVCaptureVideoPreviewLayer` and keeps it sized to bounds (rotation / safe area).
private final class FullscreenPreviewHost: UIView {
    weak var capturePreviewLayer: AVCaptureVideoPreviewLayer?

    override func layoutSubviews() {
        super.layoutSubviews()
        capturePreviewLayer?.frame = bounds
    }
}

private final class StoryCameraManager: NSObject, AVCapturePhotoCaptureDelegate, AVCaptureFileOutputRecordingDelegate {
    static let shared = StoryCameraManager()

    private let sessionQueue = DispatchQueue(label: "com.venncircle.storycamera.session")
    private let session = AVCaptureSession()
    private let photoOutput = AVCapturePhotoOutput()
    private let movieOutput = AVCaptureMovieFileOutput()
    private var videoInput: AVCaptureDeviceInput?
    private var audioInput: AVCaptureDeviceInput?
    private var previewLayer: AVCaptureVideoPreviewLayer?
    private var previewContainer: FullscreenPreviewHost?
    private weak var hostWebView: WKWebView?

    private var savedWebOpaque: Bool = true
    private var savedWebBackground: UIColor?
    private var savedScrollOpaque: Bool = true
    private var savedScrollBackground: UIColor?
    private var savedUnderPageBackground: UIColor?
    /// Superviews from immediate parent up to and including `UIWindow` (if reached).
    private var savedAncestorAppearances: [(view: UIView, wasOpaque: Bool, backgroundColor: UIColor?)] = []
    private var savedScrollSubviewAppearances: [(view: UIView, wasOpaque: Bool, backgroundColor: UIColor?)] = []

    private var photoCompletion: ((Result<String, Error>) -> Void)?
    private var videoStopCallback: ((Result<String, Error>) -> Void)?
    private var completedRecordingBase64: String?
    private var recordingURL: URL?
    private var maxDurationTimer: Timer?
    private var currentPosition: AVCaptureDevice.Position = .front
    /// True while `beginConfiguration`…`commitConfiguration` is in progress on this queue. Mutate only on `sessionQueue`.
    private var isConfiguringSession = false

    private override init() {
        super.init()
    }

    /// Requests camera access; completion is called on an arbitrary queue. System prompt is scheduled on the main thread.
    private func ensureVideoAuthorized(completion: @escaping (Result<Void, Error>) -> Void) {
        let status = AVCaptureDevice.authorizationStatus(for: .video)
        NSLog("[StoryCamera] camera authorization status=%d", status.rawValue)

        switch status {
        case .authorized:
            completion(.success(()))
        case .notDetermined:
            DispatchQueue.main.async {
                NSLog("[StoryCamera] requesting camera access (main)")
                AVCaptureDevice.requestAccess(for: .video) { granted in
                    NSLog("[StoryCamera] camera access granted=%@", granted ? "YES" : "NO")
                    if granted {
                        completion(.success(()))
                    } else {
                        completion(.failure(NSError(domain: "StoryCamera", code: 1, userInfo: [NSLocalizedDescriptionKey: "Camera permission denied"])))
                    }
                }
            }
        case .denied, .restricted:
            completion(.failure(NSError(domain: "StoryCamera", code: 2, userInfo: [NSLocalizedDescriptionKey: "Camera permission denied"])))
        @unknown default:
            completion(.failure(NSError(domain: "StoryCamera", code: 2, userInfo: [NSLocalizedDescriptionKey: "Camera permission denied"])))
        }
    }

    func openCamera(bridge: CAPBridgeProtocol?, completion: @escaping (Error?) -> Void) {
        guard let webView = bridge?.webView as? WKWebView else {
            completion(NSError(domain: "StoryCamera", code: 0, userInfo: [NSLocalizedDescriptionKey: "WebView not available"]))
            return
        }

        ensureVideoAuthorized { [weak self] result in
            guard let self else { return }
            switch result {
            case .failure(let err):
                DispatchQueue.main.async { completion(err) }
            case .success:
                self.sessionQueue.async {
                    let configured = self.configureVideoSession()
                    NSLog("[StoryCamera] configureVideoSession ok=%@", configured ? "YES" : "NO")
                    guard configured else {
                        DispatchQueue.main.async {
                            completion(NSError(domain: "StoryCamera", code: 7, userInfo: [NSLocalizedDescriptionKey: "Could not configure camera (no device or session error)"]))
                        }
                        return
                    }

                    if self.session.isRunning {
                        NSLog("[StoryCamera] session already running; stopping before restart")
                        self.session.stopRunning()
                    }

                    NSLog("[StoryCamera] calling startRunning (inputs=%d outputs=%d)", self.session.inputs.count, self.session.outputs.count)
                    self.session.startRunning()
                    self.waitForSessionRunning(timeout: 2.0)
                    let running = self.session.isRunning
                    NSLog("[StoryCamera] after startRunning isRunning=%@", running ? "YES" : "NO")

                    guard running else {
                        DispatchQueue.main.async {
                            completion(NSError(domain: "StoryCamera", code: 11, userInfo: [NSLocalizedDescriptionKey: "Camera session failed to start"]))
                        }
                        return
                    }

                    DispatchQueue.main.async {
                        self.attachPreview(webView: webView)
                        completion(nil)
                    }
                }
            }
        }
    }

    /// Blocks the **session** queue until `isRunning` or timeout. `startRunning()` is synchronous but this confirms runtime state.
    private func waitForSessionRunning(timeout: TimeInterval) {
        let deadline = Date().addingTimeInterval(timeout)
        while !session.isRunning, Date() < deadline {
            Thread.sleep(forTimeInterval: 0.02)
        }
    }

    /// Video + photo + movie outputs only. **Do not** add microphone here — adding audio without mic permission can prevent the session from running.
    /// Call only from `sessionQueue`. Uses a single `commitConfiguration` in `defer` so `isConfiguringSession` always matches session state.
    private func configureVideoSession() -> Bool {
        session.beginConfiguration()
        isConfiguringSession = true
        defer {
            session.commitConfiguration()
            isConfiguringSession = false
        }

        session.sessionPreset = .high

        session.inputs.forEach { session.removeInput($0) }
        session.outputs.forEach { session.removeOutput($0) }
        audioInput = nil
        videoInput = nil

        if movieOutput.isRecording {
            movieOutput.stopRecording()
        }

        guard let device = Self.camera(position: currentPosition) else {
            NSLog("[StoryCamera] no video device for position=%d", currentPosition.rawValue)
            return false
        }

        do {
            let vIn = try AVCaptureDeviceInput(device: device)
            guard session.canAddInput(vIn) else {
                NSLog("[StoryCamera] cannot add video input")
                return false
            }
            session.addInput(vIn)
            videoInput = vIn
        } catch {
            NSLog("[StoryCamera] AVCaptureDeviceInput failed: %@", String(describing: error))
            return false
        }

        if session.canAddOutput(photoOutput) { session.addOutput(photoOutput) }
        if session.canAddOutput(movieOutput) { session.addOutput(movieOutput) }

        if let connection = movieOutput.connection(with: .video), connection.isVideoMirroringSupported, currentPosition == .front {
            connection.isVideoMirrored = true
        }

        let ok = videoInput != nil && session.inputs.contains(where: { ($0 as? AVCaptureDeviceInput)?.device.hasMediaType(.video) ?? false })
        if !ok {
            NSLog("[StoryCamera] video input validation failed (inputs=%d)", session.inputs.count)
        }
        return ok
    }

    /// Adds microphone input after user has authorized audio (e.g. from `startRecording`).
    private func addAudioInputIfAuthorized() -> Bool {
        let status = AVCaptureDevice.authorizationStatus(for: .audio)
        guard status == .authorized else {
            NSLog("[StoryCamera] skip addAudioInput; audio status=%d", status.rawValue)
            return false
        }
        if audioInput != nil { return true }
        guard let audioDevice = AVCaptureDevice.default(for: .audio) else {
            NSLog("[StoryCamera] no default audio device")
            return false
        }
        do {
            let aIn = try AVCaptureDeviceInput(device: audioDevice)
            session.beginConfiguration()
            isConfiguringSession = true
            defer {
                session.commitConfiguration()
                isConfiguringSession = false
            }
            guard session.canAddInput(aIn) else {
                NSLog("[StoryCamera] cannot add audio input")
                return false
            }
            session.addInput(aIn)
            audioInput = aIn
            NSLog("[StoryCamera] audio input added")
            return true
        } catch {
            NSLog("[StoryCamera] audio input error: %@", String(describing: error))
            return false
        }
    }

    /// Stops capture for close; re-queues on `sessionQueue` if a configuration block is active (`stopRunning` is invalid there).
    private func stopSessionForDetachIfPossible() {
        if isConfiguringSession {
            NSLog("[StoryCamera] detach: defer stopRunning until after commitConfiguration")
            sessionQueue.async { [weak self] in
                self?.stopSessionForDetachIfPossible()
            }
            return
        }
        if movieOutput.isRecording {
            movieOutput.stopRecording()
        }
        session.stopRunning()
        NSLog("[StoryCamera] session stopRunning completed (detach)")
    }

    /// Restores saved `UIView` appearance; **must run on the main thread**.
    private func restoreTransparentHostHierarchyOnMain() {
        assert(Thread.isMainThread)
        for (v, wasOpaque, bg) in savedScrollSubviewAppearances.reversed() {
            v.isOpaque = wasOpaque
            v.backgroundColor = bg
        }
        savedScrollSubviewAppearances.removeAll()
        for (v, wasOpaque, bg) in savedAncestorAppearances.reversed() {
            v.isOpaque = wasOpaque
            v.backgroundColor = bg
        }
        savedAncestorAppearances.removeAll()
    }

    private func restoreTransparentHostHierarchy() {
        if Thread.isMainThread {
            restoreTransparentHostHierarchyOnMain()
        } else {
            DispatchQueue.main.async { [weak self] in
                self?.restoreTransparentHostHierarchyOnMain()
            }
        }
    }

    /// Removes preview sublayers only. **Must not** stop `AVCaptureSession` — `attachPreview` runs after `startRunning`.
    private func removePreviewOverlayOnMain() {
        assert(Thread.isMainThread)
        previewLayer?.removeFromSuperlayer()
        previewLayer = nil
        previewContainer?.removeFromSuperview()
        previewContainer = nil
    }

    private func removePreviewOverlayIfNeeded() {
        if Thread.isMainThread {
            removePreviewOverlayOnMain()
        } else {
            DispatchQueue.main.async { [weak self] in
                self?.removePreviewOverlayOnMain()
            }
        }
    }

    private func attachPreview(webView: WKWebView) {
        restoreTransparentHostHierarchy()
        removePreviewOverlayIfNeeded()

        hostWebView = webView
        savedWebOpaque = webView.isOpaque
        savedWebBackground = webView.backgroundColor
        savedScrollOpaque = webView.scrollView.isOpaque
        savedScrollBackground = webView.scrollView.backgroundColor

        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.isOpaque = false
        webView.scrollView.backgroundColor = .clear

        if #available(iOS 15.0, *) {
            savedUnderPageBackground = webView.underPageBackgroundColor
            webView.underPageBackgroundColor = .clear
        }

        for sub in webView.scrollView.subviews {
            savedScrollSubviewAppearances.append((sub, sub.isOpaque, sub.backgroundColor))
            sub.isOpaque = false
            sub.backgroundColor = .clear
        }

        var ancestor: UIView? = webView.superview
        while let v = ancestor {
            savedAncestorAppearances.append((v, v.isOpaque, v.backgroundColor))
            v.isOpaque = false
            v.backgroundColor = .clear
            if v is UIWindow { break }
            ancestor = v.superview
        }

        guard let superview = webView.superview else {
            NSLog("[StoryCamera] attachPreview: webView has no superview")
            return
        }

        let container = FullscreenPreviewHost()
        container.backgroundColor = .black
        container.clipsToBounds = true
        container.autoresizingMask = [.flexibleWidth, .flexibleHeight]

        if let window = webView.window {
            container.frame = superview.convert(window.bounds, from: window)
        } else {
            container.frame = superview.bounds
        }

        superview.insertSubview(container, belowSubview: webView)

        let layer = AVCaptureVideoPreviewLayer(session: session)
        layer.videoGravity = .resizeAspectFill
        container.capturePreviewLayer = layer
        layer.frame = container.bounds
        container.layer.addSublayer(layer)

        previewContainer = container
        previewLayer = layer

        container.setNeedsLayout()
        container.layoutIfNeeded()

        NSLog("[StoryCamera] attachPreview: container frame=%@ webView.isOpaque=%@ scrollView.isOpaque=%@ ancestorViews=%ld",
              "\(container.frame)",
              webView.isOpaque ? "YES" : "NO",
              webView.scrollView.isOpaque ? "YES" : "NO",
              savedAncestorAppearances.count)
    }

    func detachPreview() {
        NSLog("[StoryCamera] detachPreview (stop session + remove UI)")

        sessionQueue.async { [weak self] in
            self?.stopSessionForDetachIfPossible()
        }

        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.maxDurationTimer?.invalidate()
            self.maxDurationTimer = nil
            self.videoStopCallback = nil
            self.completedRecordingBase64 = nil
            self.photoCompletion = nil

            self.removePreviewOverlayOnMain()

            if let webView = self.hostWebView {
                if #available(iOS 15.0, *), let bg = self.savedUnderPageBackground {
                    webView.underPageBackgroundColor = bg
                }
                self.savedUnderPageBackground = nil
                webView.isOpaque = self.savedWebOpaque
                webView.backgroundColor = self.savedWebBackground
                webView.scrollView.isOpaque = self.savedScrollOpaque
                webView.scrollView.backgroundColor = self.savedScrollBackground
            }
            self.restoreTransparentHostHierarchyOnMain()
            self.hostWebView = nil
        }
    }

    func flipCamera(completion: @escaping (Error?) -> Void) {
        currentPosition = currentPosition == .front ? .back : .front
        sessionQueue.async { [weak self] in
            guard let self else { return }
            let shouldRun = self.session.isRunning
            if shouldRun {
                NSLog("[StoryCamera] flipCamera: stop session")
                self.session.stopRunning()
            }
            guard self.configureVideoSession() else {
                DispatchQueue.main.async {
                    completion(NSError(domain: "StoryCamera", code: 12, userInfo: [NSLocalizedDescriptionKey: "Could not reconfigure camera"]))
                }
                return
            }
            if shouldRun {
                NSLog("[StoryCamera] flipCamera: start session")
                self.session.startRunning()
                self.waitForSessionRunning(timeout: 2.0)
            }
            let ok = !shouldRun || self.session.isRunning
            NSLog("[StoryCamera] flipCamera done shouldRun=%@ running=%@", shouldRun ? "YES" : "NO", self.session.isRunning ? "YES" : "NO")
            DispatchQueue.main.async {
                if ok {
                    completion(nil)
                } else {
                    completion(NSError(domain: "StoryCamera", code: 13, userInfo: [NSLocalizedDescriptionKey: "Camera session not running after flip"]))
                }
            }
        }
    }

    func takePhoto(completion: @escaping (Result<String, Error>) -> Void) {
        sessionQueue.async { [weak self] in
            guard let self else { return }
            guard self.session.isRunning else {
                NSLog("[StoryCamera] takePhoto rejected: session not running (inputs=%d)", self.session.inputs.count)
                DispatchQueue.main.async { completion(.failure(NSError(domain: "StoryCamera", code: 3, userInfo: [NSLocalizedDescriptionKey: "Camera not running"]))) }
                return
            }
            NSLog("[StoryCamera] takePhoto: capturing")
            self.photoCompletion = completion
            let settings = AVCapturePhotoSettings()
            self.photoOutput.capturePhoto(with: settings, delegate: self)
        }
    }

    func startRecording(completion: @escaping (Error?) -> Void) {
        func grantAndStart() {
            self.sessionQueue.async { [weak self] in
                guard let self else { return }
                guard self.session.isRunning else {
                    NSLog("[StoryCamera] startRecording: session not running")
                    DispatchQueue.main.async {
                        completion(NSError(domain: "StoryCamera", code: 14, userInfo: [NSLocalizedDescriptionKey: "Camera not running"]))
                    }
                    return
                }
                guard !self.movieOutput.isRecording else {
                    DispatchQueue.main.async { completion(nil) }
                    return
                }

                let addedAudio = self.addAudioInputIfAuthorized()
                NSLog("[StoryCamera] startRecording: audio input added=%@", addedAudio ? "YES" : "NO")

                let url = FileManager.default.temporaryDirectory.appendingPathComponent("story_\(UUID().uuidString).mov")
                self.recordingURL = url
                try? FileManager.default.removeItem(at: url)
                if let connection = self.movieOutput.connection(with: .video), connection.isVideoMirroringSupported, self.currentPosition == .front {
                    connection.isVideoMirrored = true
                }
                NSLog("[StoryCamera] startRecording: movieOutput.startRecording → %@", url.lastPathComponent)
                self.movieOutput.startRecording(to: url, recordingDelegate: self)

                DispatchQueue.main.async {
                    self.completedRecordingBase64 = nil
                    self.maxDurationTimer?.invalidate()
                    self.maxDurationTimer = Timer.scheduledTimer(withTimeInterval: 10.0, repeats: false) { [weak self] _ in
                        self?.forceStopRecording()
                    }
                    completion(nil)
                }
            }
        }

        let audioStatus = AVCaptureDevice.authorizationStatus(for: .audio)
        if audioStatus == .notDetermined {
            AVCaptureDevice.requestAccess(for: .audio) { granted in
                if granted {
                    grantAndStart()
                } else {
                    completion(NSError(domain: "StoryCamera", code: 4, userInfo: [NSLocalizedDescriptionKey: "Microphone permission denied"]))
                }
            }
            return
        }
        if audioStatus != .authorized {
            completion(NSError(domain: "StoryCamera", code: 5, userInfo: [NSLocalizedDescriptionKey: "Microphone permission denied"]))
            return
        }
        grantAndStart()
    }

    func stopRecording(completion: @escaping (Result<String, Error>) -> Void) {
        maxDurationTimer?.invalidate()
        maxDurationTimer = nil

        sessionQueue.async { [weak self] in
            guard let self else { return }
            if self.movieOutput.isRecording {
                self.videoStopCallback = completion
                self.movieOutput.stopRecording()
            } else if let pending = self.completedRecordingBase64 {
                let b64 = pending
                self.completedRecordingBase64 = nil
                DispatchQueue.main.async {
                    completion(.success(b64))
                }
            } else {
                DispatchQueue.main.async {
                    completion(.failure(NSError(domain: "StoryCamera", code: 6, userInfo: [NSLocalizedDescriptionKey: "Not recording"])))
                }
            }
        }
    }

    private func forceStopRecording() {
        maxDurationTimer?.invalidate()
        maxDurationTimer = nil
        sessionQueue.async { [weak self] in
            guard let self else { return }
            if self.movieOutput.isRecording {
                self.movieOutput.stopRecording()
            }
        }
    }

    // MARK: - AVCapturePhotoCaptureDelegate

    func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
        let finish: (Result<String, Error>) -> Void = { result in
            DispatchQueue.main.async {
                self.photoCompletion?(result)
                self.photoCompletion = nil
            }
        }
        if let error {
            finish(.failure(error))
            return
        }
        guard let data = photo.fileDataRepresentation() else {
            finish(.failure(NSError(domain: "StoryCamera", code: 8, userInfo: [NSLocalizedDescriptionKey: "No photo data"])))
            return
        }
        finish(.success(data.base64EncodedString()))
    }

    // MARK: - AVCaptureFileOutputRecordingDelegate

    func fileOutput(_ output: AVCaptureFileOutput, didFinishRecordingTo outputFileURL: URL, from connections: [AVCaptureConnection], error: Error?) {
        maxDurationTimer?.invalidate()
        maxDurationTimer = nil

        let deliver: (Result<String, Error>) -> Void = { result in
            switch result {
            case .success(let b64):
                self.completedRecordingBase64 = b64
                if let cb = self.videoStopCallback {
                    self.videoStopCallback = nil
                    self.completedRecordingBase64 = nil
                    DispatchQueue.main.async {
                        cb(.success(b64))
                    }
                }
            case .failure(let err):
                if let cb = self.videoStopCallback {
                    self.videoStopCallback = nil
                    DispatchQueue.main.async {
                        cb(.failure(err))
                    }
                }
            }
        }

        if let error {
            try? FileManager.default.removeItem(at: outputFileURL)
            deliver(.failure(error))
            return
        }

        sessionQueue.async { [weak self] in
            guard let self else { return }
            let asset = AVURLAsset(url: outputFileURL)
            guard let exporter = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetHighestQuality) else {
                try? FileManager.default.removeItem(at: outputFileURL)
                deliver(.failure(NSError(domain: "StoryCamera", code: 9, userInfo: [NSLocalizedDescriptionKey: "Export failed"])))
                return
            }
            let outMp4 = FileManager.default.temporaryDirectory.appendingPathComponent("story_\(UUID().uuidString).mp4")
            try? FileManager.default.removeItem(at: outMp4)
            exporter.outputURL = outMp4
            exporter.outputFileType = .mp4
            exporter.exportAsynchronously {
                try? FileManager.default.removeItem(at: outputFileURL)
                if exporter.status != .completed {
                    try? FileManager.default.removeItem(at: outMp4)
                    let err = exporter.error ?? NSError(domain: "StoryCamera", code: 10, userInfo: [NSLocalizedDescriptionKey: "Export failed"])
                    deliver(.failure(err))
                    return
                }
                do {
                    let mp4Data = try Data(contentsOf: outMp4)
                    try? FileManager.default.removeItem(at: outMp4)
                    deliver(.success(mp4Data.base64EncodedString()))
                } catch {
                    deliver(.failure(error))
                }
            }
        }
    }

    private static func camera(position: AVCaptureDevice.Position) -> AVCaptureDevice? {
        AVCaptureDevice.DiscoverySession(deviceTypes: [.builtInWideAngleCamera], mediaType: .video, position: position).devices.first
    }
}

@objc(StoryCameraPlugin)
public class StoryCameraPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "StoryCameraPlugin"
    public let jsName = "StoryCamera"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "openCamera", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "closeCamera", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "flipCamera", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "takePhoto", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startRecording", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopRecording", returnType: CAPPluginReturnPromise)
    ]

    @objc func openCamera(_ call: CAPPluginCall) {
        StoryCameraManager.shared.openCamera(bridge: bridge) { err in
            if let err {
                call.reject(err.localizedDescription)
                return
            }
            call.resolve([:])
        }
    }

    @objc func closeCamera(_ call: CAPPluginCall) {
        StoryCameraManager.shared.detachPreview()
        call.resolve([:])
    }

    @objc func flipCamera(_ call: CAPPluginCall) {
        StoryCameraManager.shared.flipCamera { err in
            if let err {
                call.reject(err.localizedDescription)
                return
            }
            call.resolve([:])
        }
    }

    @objc func takePhoto(_ call: CAPPluginCall) {
        StoryCameraManager.shared.takePhoto { result in
            switch result {
            case .success(let b64):
                call.resolve(["base64": b64])
            case .failure(let err):
                call.reject(err.localizedDescription)
            }
        }
    }

    @objc func startRecording(_ call: CAPPluginCall) {
        StoryCameraManager.shared.startRecording { err in
            if let err {
                call.reject(err.localizedDescription)
                return
            }
            call.resolve([:])
        }
    }

    @objc func stopRecording(_ call: CAPPluginCall) {
        StoryCameraManager.shared.stopRecording { result in
            switch result {
            case .success(let b64):
                call.resolve(["base64": b64])
            case .failure(let err):
                call.reject(err.localizedDescription)
            }
        }
    }
}
