import { registerPlugin } from "@capacitor/core";
import { Capacitor } from "@capacitor/core";

export interface StoryCameraPlugin {
  openCamera(): Promise<void>;
  closeCamera(): Promise<void>;
  flipCamera(): Promise<void>;
  takePhoto(): Promise<{ base64: string }>;
  startRecording(): Promise<void>;
  stopRecording(): Promise<{ base64: string }>;
}

const StoryCamera = registerPlugin<StoryCameraPlugin>("StoryCamera", {
  web: () => ({
    async openCamera() {
      /* Preview is web-only placeholder; capture uses file inputs in CameraScreen. */
    },
    async closeCamera() {},
    async flipCamera() {},
    async takePhoto() {
      throw new Error("StoryCamera.takePhoto is not available on web");
    },
    async startRecording() {
      throw new Error("StoryCamera.startRecording is not available on web");
    },
    async stopRecording() {
      throw new Error("StoryCamera.stopRecording is not available on web");
    },
  }),
});

export function isStoryCameraNative(): boolean {
  return Capacitor.getPlatform() === "ios";
}

export { StoryCamera };
