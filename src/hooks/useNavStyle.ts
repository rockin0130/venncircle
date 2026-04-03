import { useState, useCallback } from "react";

export type NavStyle = "bottom" | "drawer";

const NAV_STYLE_KEY = "appNavStyle";

export function loadNavStyle(): NavStyle {
  try {
    const raw = localStorage.getItem(NAV_STYLE_KEY);
    if (raw === "drawer") return "drawer";
  } catch {}
  return "bottom";
}

export function saveNavStyle(style: NavStyle) {
  localStorage.setItem(NAV_STYLE_KEY, style);
}

export function useNavStyle() {
  const [navStyle, setNavStyleState] = useState<NavStyle>(() => loadNavStyle());

  const setNavStyle = useCallback((style: NavStyle) => {
    setNavStyleState(style);
    saveNavStyle(style);
  }, []);

  return { navStyle, setNavStyle };
}
