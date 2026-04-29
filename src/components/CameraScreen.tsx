import { useCallback, useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { X, RefreshCw } from "lucide-react";
import { StoryCamera, isStoryCameraNative } from "@/integrations/storyCamera";
import { pickFromGallery, takePhoto } from "@/integrations/camera";
import StoryUploadModal, { type CapturedStoryMedia } from "@/components/StoryUploadModal";
import type { Group } from "@/context/AuthContext";
import { cn } from "@/lib/utils";

function base64ToFile(base64: string, mime: string, filename: string): File {
  const bin = atob(base64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new File([arr], filename, { type: mime });
}

type CameraScreenProps = {
  userId: string;
  groups: Group[];
  onClose: () => void;
};

export default function CameraScreen({ userId, groups, onClose }: CameraScreenProps) {
  const [uploadMedia, setUploadMedia] = useState<CapturedStoryMedia | null>(null);
  const [nativeReady, setNativeReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordProgress, setRecordProgress] = useState(0);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordStartedAt = useRef<number>(0);
  const pointerDownRef = useRef(false);
  const savedDocumentBackgrounds = useRef<{ body: string; html: string } | null>(null);

  const clearLongPressTimer = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const stopProgressTicker = () => {
    if (recordInterval.current) {
      clearInterval(recordInterval.current);
      recordInterval.current = null;
    }
  };

  const stopRecordingNative = useCallback(async () => {
    stopProgressTicker();
    setRecording(false);
    setRecordProgress(0);
    try {
      console.log("[CameraScreen] StoryCamera.stopRecording() calling");
      const out = await StoryCamera.stopRecording();
      console.log("[CameraScreen] StoryCamera.stopRecording() resolved", {
        base64Length: out?.base64?.length ?? 0,
      });
      const { base64 } = out;
      const file = base64ToFile(base64, "video/mp4", `story_${Date.now()}.mp4`);
      const previewUrl = URL.createObjectURL(file);
      setUploadMedia({ type: "video", file, previewUrl });
    } catch (err) {
      console.error("[CameraScreen] StoryCamera.stopRecording() error", err);
    }
  }, []);

  useEffect(() => {
    const native = isStoryCameraNative();
    if (native) {
      const body = document.body;
      const html = document.documentElement;
      savedDocumentBackgrounds.current = {
        body: body.style.background,
        html: html.style.background,
      };
      body.style.background = "transparent";
      html.style.background = "transparent";
    }
    return () => {
      if (!native) return;
      const saved = savedDocumentBackgrounds.current;
      if (!saved) return;
      document.body.style.background = saved.body;
      document.documentElement.style.background = saved.html;
      savedDocumentBackgrounds.current = null;
    };
  }, []);

  useEffect(() => {
    console.log("[CameraScreen] mount — platform", {
      getPlatform: Capacitor.getPlatform(),
      isNativePlatform: Capacitor.isNativePlatform(),
      isStoryCameraNative: isStoryCameraNative(),
    });

    let cancelled = false;
    (async () => {
      if (isStoryCameraNative()) {
        console.log("[CameraScreen] StoryCamera.openCamera() calling…");
        try {
          const openResult = await StoryCamera.openCamera();
          console.log("[CameraScreen] StoryCamera.openCamera() resolved", { openResult });
          if (!cancelled) setNativeReady(true);
        } catch (err) {
          console.error("[CameraScreen] StoryCamera.openCamera() error", err);
          if (!cancelled) setNativeReady(true);
        }
      } else {
        console.log("[CameraScreen] skipping openCamera (not iOS native per isStoryCameraNative)");
        setNativeReady(true);
      }
    })();
    return () => {
      cancelled = true;
      if (isStoryCameraNative()) {
        console.log("[CameraScreen] cleanup — StoryCamera.closeCamera() calling");
        void StoryCamera.closeCamera()
          .then(() => console.log("[CameraScreen] StoryCamera.closeCamera() resolved"))
          .catch((err) => console.error("[CameraScreen] StoryCamera.closeCamera() error", err));
      }
      stopProgressTicker();
      clearLongPressTimer();
    };
  }, []);

  const startRecordingNative = useCallback(async () => {
    try {
      console.log("[CameraScreen] StoryCamera.startRecording() calling");
      const sr = await StoryCamera.startRecording();
      console.log("[CameraScreen] StoryCamera.startRecording() resolved", { sr });
      setRecording(true);
      recordStartedAt.current = Date.now();
      stopProgressTicker();
      recordInterval.current = setInterval(() => {
        const elapsed = (Date.now() - recordStartedAt.current) / 1000;
        setRecordProgress(Math.min(1, elapsed / 10));
        if (elapsed >= 10) {
          void stopRecordingNative();
        }
      }, 50);
    } catch (err) {
      console.error("[CameraScreen] StoryCamera.startRecording() error", err);
      setRecording(false);
    }
  }, [stopRecordingNative]);

  const shutterTapPhoto = useCallback(async () => {
    if (isStoryCameraNative()) {
      try {
        console.log("[CameraScreen] StoryCamera.takePhoto() calling");
        const out = await StoryCamera.takePhoto();
        console.log("[CameraScreen] StoryCamera.takePhoto() resolved", {
          base64Length: out?.base64?.length ?? 0,
        });
        const { base64 } = out;
        const file = base64ToFile(base64, "image/jpeg", `story_${Date.now()}.jpg`);
        const previewUrl = URL.createObjectURL(file);
        setUploadMedia({ type: "photo", file, previewUrl });
      } catch (err) {
        console.error("[CameraScreen] StoryCamera.takePhoto() error", err);
      }
      return;
    }
    const file = await takePhoto();
    if (file) {
      const previewUrl = URL.createObjectURL(file);
      setUploadMedia({ type: "photo", file, previewUrl });
    }
  }, []);

  const onShutterPointerDown = () => {
    if (!isStoryCameraNative()) return;
    pointerDownRef.current = true;
    clearLongPressTimer();
    longPressTimer.current = setTimeout(() => {
      if (!pointerDownRef.current) return;
      void startRecordingNative();
    }, 280);
  };

  const onShutterPointerUp = async () => {
    pointerDownRef.current = false;
    clearLongPressTimer();
    if (recording) {
      await stopRecordingNative();
      return;
    }
    if (isStoryCameraNative()) {
      await shutterTapPhoto();
    }
  };

  const webPickVideo = async () => {
    const file = await pickFromGallery({ allowVideo: true });
    if (file && file.type.startsWith("video")) {
      const previewUrl = URL.createObjectURL(file);
      setUploadMedia({ type: "video", file, previewUrl });
    }
  };

  if (uploadMedia) {
    return (
      <StoryUploadModal
        userId={userId}
        groups={groups}
        media={uploadMedia}
        onClose={onClose}
        onRetake={() => {
          URL.revokeObjectURL(uploadMedia.previewUrl);
          setUploadMedia(null);
        }}
        onPosted={() => {
          URL.revokeObjectURL(uploadMedia.previewUrl);
        }}
      />
    );
  }

  const showWebFallback = !isStoryCameraNative();
  const nativeIosCamera = isStoryCameraNative();

  return (
    <div
      className={cn("flex flex-col", !nativeIosCamera && "fixed inset-0 z-[200] bg-black")}
      style={
        nativeIosCamera
          ? {
              position: "fixed",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              zIndex: 9999,
              background: "transparent",
            }
          : undefined
      }
    >
      <div className="flex items-center justify-between px-3 py-2 safe-area-top">
        {isStoryCameraNative() ? (
          <button
            type="button"
            onClick={() => {
              void (async () => {
                try {
                  console.log("[CameraScreen] StoryCamera.flipCamera() calling");
                  const fr = await StoryCamera.flipCamera();
                  console.log("[CameraScreen] StoryCamera.flipCamera() resolved", { fr });
                } catch (err) {
                  console.error("[CameraScreen] StoryCamera.flipCamera() error", err);
                }
              })();
            }}
            className="p-2 rounded-full bg-white/10 text-white"
            aria-label="Flip camera"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        ) : (
          <span className="w-10" />
        )}
        <button type="button" onClick={onClose} className="p-2 rounded-full bg-white/10 text-white" aria-label="Close">
          <X className="w-6 h-6" />
        </button>
      </div>

      <div className="flex-1 relative flex items-center justify-center">
        {showWebFallback && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center text-white/80">
            <p className="text-sm">Live preview uses the StoryCamera plugin on iOS.</p>
            <button
              type="button"
              onClick={() => void shutterTapPhoto()}
              className="px-4 py-2 rounded-full bg-white text-black text-sm font-semibold"
            >
              Take photo
            </button>
            <button
              type="button"
              onClick={() => void webPickVideo()}
              className="px-4 py-2 rounded-full bg-white/15 text-white text-sm font-semibold"
            >
              Choose video
            </button>
          </div>
        )}
        {!nativeReady && !showWebFallback && <p className="text-white text-sm">Starting camera…</p>}
      </div>

      {!showWebFallback && (
        <div className="pb-10 pt-4 flex flex-col items-center gap-3 safe-area-bottom">
          <div className="relative flex items-center justify-center w-20 h-20">
            {recording && (
              <svg className="absolute w-24 h-24 -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="44" stroke="rgba(255,255,255,0.2)" strokeWidth="6" fill="none" />
                <circle
                  cx="50"
                  cy="50"
                  r="44"
                  stroke="hsl(330 90% 55%)"
                  strokeWidth="6"
                  fill="none"
                  strokeDasharray={`${2 * Math.PI * 44}`}
                  strokeDashoffset={`${2 * Math.PI * 44 * (1 - recordProgress)}`}
                  strokeLinecap="round"
                />
              </svg>
            )}
            <button
              type="button"
              onPointerDown={onShutterPointerDown}
              onPointerUp={() => void onShutterPointerUp()}
              onPointerCancel={() => {
                pointerDownRef.current = false;
                clearLongPressTimer();
              }}
              className={cn(
                "w-16 h-16 rounded-full border-4 border-white shadow-lg transition-transform",
                recording ? "scale-90 bg-red-500/40" : "bg-white/90"
              )}
              aria-label="Shutter"
            />
          </div>
          <p className="text-[11px] text-white/60">Tap for photo · Hold for video</p>
        </div>
      )}

    </div>
  );
}
