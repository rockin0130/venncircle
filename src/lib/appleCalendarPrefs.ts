import {
  getHiddenAppleCalendarIds,
  APPLE_CALENDAR_VISIBILITY_CHANGED,
} from "@/lib/appleCalendarVisibility";

const PREFS_KEY = "venncircle_apple_calendar_prefs";

type Prefs = {
  colors: Record<string, string>;
  /** Per device calendar: visibility in group contexts only (__personal__ is implicit). */
  context: Record<string, Record<string, boolean>>;
};

function readPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { colors: {}, context: {} };
    const p = JSON.parse(raw) as Prefs;
    return { colors: p.colors || {}, context: p.context || {} };
  } catch {
    return { colors: {}, context: {} };
  }
}

function writePrefs(p: Prefs) {
  localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  window.dispatchEvent(new Event(APPLE_CALENDAR_VISIBILITY_CHANGED));
}

export function getAppleCalendarDisplayColor(deviceCalId: string, fallback: string): string {
  const c = readPrefs().colors[deviceCalId];
  return c || fallback;
}

export function setAppleCalendarDisplayColor(deviceCalId: string, color: string): void {
  const p = readPrefs();
  p.colors[deviceCalId] = color;
  writePrefs(p);
}

/** Mine / All: device calendars always shown unless legacy-hidden. Group: stored toggle, default off. */
export function isAppleDeviceCalendarVisible(
  deviceCalId: string | undefined,
  activeContextId: string | null
): boolean {
  if (!deviceCalId) return true;
  if (getHiddenAppleCalendarIds().has(deviceCalId)) return false;
  if (activeContextId === null || activeContextId === "__personal__") return true;

  const row = readPrefs().context[deviceCalId];
  if (row && Object.prototype.hasOwnProperty.call(row, activeContextId)) return !!row[activeContextId];
  return false;
}

export function setAppleContextVisibility(deviceCalId: string, contextId: string, visible: boolean): void {
  if (contextId === "__personal__") return;
  const p = readPrefs();
  if (!p.context[deviceCalId]) p.context[deviceCalId] = {};
  p.context[deviceCalId][contextId] = visible;
  writePrefs(p);
  if (visible) {
    const next = new Set(getHiddenAppleCalendarIds());
    if (next.has(deviceCalId)) {
      next.delete(deviceCalId);
      localStorage.setItem("venncircle_apple_hidden_calendar_ids", JSON.stringify([...next]));
      window.dispatchEvent(new Event(APPLE_CALENDAR_VISIBILITY_CHANGED));
    }
  }
}

/** For settings sheet: Mine is always on (matches Google). Groups read from prefs. */
export function isAppleVisibleInContext(deviceCalId: string, contextId: string): boolean {
  if (getHiddenAppleCalendarIds().has(deviceCalId)) return false;
  if (contextId === "__personal__") return true;
  const row = readPrefs().context[deviceCalId];
  if (row && Object.prototype.hasOwnProperty.call(row, contextId)) return !!row[contextId];
  return false;
}
