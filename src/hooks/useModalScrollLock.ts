import { useEffect } from "react";

export function useModalScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;

    const html = document.documentElement;
    const body = document.body;
    const appScrollContainers = Array.from(document.querySelectorAll<HTMLElement>(".scroll-smooth-touch"));

    const prevHtmlOverflow = html.style.overflow;
    const prevHtmlOverscroll = html.style.overscrollBehavior;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyOverscroll = body.style.overscrollBehavior;
    const prevContainers = appScrollContainers.map((el) => ({
      el,
      overflowY: el.style.overflowY,
      overscrollBehaviorY: el.style.overscrollBehaviorY,
    }));

    html.style.overflow = "hidden";
    html.style.overscrollBehavior = "none";
    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";

    appScrollContainers.forEach((el) => {
      el.style.overflowY = "hidden";
      el.style.overscrollBehaviorY = "none";
    });

    return () => {
      html.style.overflow = prevHtmlOverflow;
      html.style.overscrollBehavior = prevHtmlOverscroll;
      body.style.overflow = prevBodyOverflow;
      body.style.overscrollBehavior = prevBodyOverscroll;

      prevContainers.forEach(({ el, overflowY, overscrollBehaviorY }) => {
        el.style.overflowY = overflowY;
        el.style.overscrollBehaviorY = overscrollBehaviorY;
      });
    };
  }, [locked]);
}
