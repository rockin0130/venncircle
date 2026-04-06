const STORAGE_KEY = "venncircle_apple_hidden_calendar_ids";

export const APPLE_CALENDAR_VISIBILITY_CHANGED = "apple-calendar-visibility-changed";

export function getHiddenAppleCalendarIds(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

function persistHidden(ids: Set<string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  window.dispatchEvent(new Event(APPLE_CALENDAR_VISIBILITY_CHANGED));
}

/** When `visible` is false, the calendar's events are hidden in the calendar view. */
export function setAppleCalendarVisibleInApp(calendarId: string, visible: boolean): void {
  const next = new Set(getHiddenAppleCalendarIds());
  if (visible) next.delete(calendarId);
  else next.add(calendarId);
  persistHidden(next);
}
