import { Camera, MediaType, MediaTypeSelection, type MediaResult } from "@capacitor/camera";
import { Capacitor } from "@capacitor/core";

function isUserCancelledError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /cancel|dismiss|denied|abort/i.test(msg);
}

async function blobFromMediaResult(result: MediaResult): Promise<Blob> {
  if (result.webPath) {
    const res = await fetch(result.webPath);
    return res.blob();
  }
  if (result.uri && Capacitor.isNativePlatform()) {
    const url = Capacitor.convertFileSrc(result.uri);
    const res = await fetch(url);
    return res.blob();
  }
  throw new Error("Could not read captured media");
}

async function mediaResultToFile(result: MediaResult): Promise<File> {
  const blob = await blobFromMediaResult(result);
  const isVideo = result.type === MediaType.Video;
  const ext = isVideo ? "mp4" : blob.type.includes("png") ? "png" : "jpg";
  const mime =
    blob.type || (isVideo ? "video/mp4" : ext === "png" ? "image/png" : "image/jpeg");
  return new File([blob], `venn_${Date.now()}.${ext}`, { type: mime });
}

function pickWithFileInput(options: {
  accept: string;
  capture?: string;
}): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = options.accept;
    if (options.capture) input.setAttribute("capture", options.capture);
    input.style.position = "fixed";
    input.style.left = "-9999px";
    document.body.appendChild(input);
    input.addEventListener("change", () => {
      const file = input.files?.[0] ?? null;
      input.remove();
      resolve(file);
    });
    input.click();
  });
}

/**
 * Opens the device camera and returns a JPEG/PNG image as a `File`, or `null` if cancelled.
 * On web, uses a file input with `capture` when possible.
 */
export async function takePhoto(): Promise<File | null> {
  try {
    if (Capacitor.isNativePlatform()) {
      const result = await Camera.takePhoto({
        quality: 90,
        correctOrientation: true,
        saveToGallery: false,
        webUseInput: true,
      });
      return await mediaResultToFile(result);
    }
    return await pickWithFileInput({ accept: "image/*", capture: "environment" });
  } catch (e) {
    if (isUserCancelledError(e)) return null;
    console.warn("[camera] takePhoto", e);
    return null;
  }
}

export type PickFromGalleryOptions = {
  /** When true, gallery may return videos (e.g. chat attachments). Default: images only. */
  allowVideo?: boolean;
};

/**
 * Opens the photo library / gallery and returns a single `File`, or `null` if cancelled.
 */
export async function pickFromGallery(options?: PickFromGalleryOptions): Promise<File | null> {
  const allowVideo = options?.allowVideo === true;
  try {
    if (Capacitor.isNativePlatform()) {
      const { results } = await Camera.chooseFromGallery({
        mediaType: allowVideo ? MediaTypeSelection.All : MediaTypeSelection.Photo,
        allowMultipleSelection: false,
        quality: 90,
        correctOrientation: true,
        webUseInput: true,
      });
      const first = results[0];
      if (!first) return null;
      return await mediaResultToFile(first);
    }
    return await pickWithFileInput({
      accept: allowVideo ? "image/*,video/*" : "image/*",
    });
  } catch (e) {
    if (isUserCancelledError(e)) return null;
    console.warn("[camera] pickFromGallery", e);
    return null;
  }
}
