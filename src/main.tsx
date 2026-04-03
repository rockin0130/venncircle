import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const isPreviewRuntime = (() => {
  const host = window.location.hostname;
  const isPreviewHost = host.includes("id-preview--") || host.includes("lovableproject.com") || host.includes("lovable.app");

  try {
    return isPreviewHost || window.self !== window.top;
  } catch {
    return true;
  }
})();

if (isPreviewRuntime && "serviceWorker" in navigator) {
  void navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => {
      void registration.unregister();
    });
  });

  if ("caches" in window) {
    void caches.keys().then((cacheKeys) => {
      cacheKeys.forEach((cacheKey) => {
        void caches.delete(cacheKey);
      });
    });
  }
}

createRoot(document.getElementById("root")!).render(<App />);
