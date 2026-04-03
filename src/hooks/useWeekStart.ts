import { useState, useCallback } from "react";

export type WeekStart = "sunday" | "monday";

const WEEK_START_KEY = "appWeekStart";

export function loadWeekStart(): WeekStart {
  try {
    const raw = localStorage.getItem(WEEK_START_KEY);
    if (raw === "monday") return "monday";
  } catch {}
  return "sunday";
}

export function saveWeekStart(start: WeekStart) {
  localStorage.setItem(WEEK_START_KEY, start);
}

/** Returns the start-of-week date string (YYYY-MM-DD) for a given date, respecting weekStart. */
export function getWeekStartDate(now: Date, weekStart: WeekStart): string {
  const d = new Date(now);
  const day = d.getDay(); // 0=Sun, 1=Mon, ...
  const diff = weekStart === "monday"
    ? (day === 0 ? 6 : day - 1) // Monday-based
    : day; // Sunday-based
  d.setDate(d.getDate() - diff);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function useWeekStart() {
  const [weekStart, setWeekStartState] = useState<WeekStart>(() => loadWeekStart());

  const setWeekStart = useCallback((start: WeekStart) => {
    setWeekStartState(start);
    saveWeekStart(start);
  }, []);

  return { weekStart, setWeekStart };
}
