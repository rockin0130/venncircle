import { CapacitorCalendar } from '@ebarooni/capacitor-calendar';
import type { Calendar } from '@ebarooni/capacitor-calendar';
import { CalendarPermissionScope } from '@ebarooni/capacitor-calendar';
import type { AppleCalendarEvent } from '@/context/AppContext';

export async function requestCalendarPermission() {
  const result = await CapacitorCalendar.requestFullCalendarAccess();
  return result;
}

export async function hasCalendarReadPermission(): Promise<boolean> {
  const { result } = await CapacitorCalendar.checkPermission({
    scope: CalendarPermissionScope.READ_CALENDAR,
  });
  return result === "granted";
}

/** Native calendar list (names + colors) for CalendarsManager. */
export async function listDeviceCalendars(): Promise<Calendar[]> {
  const { result } = await CapacitorCalendar.listCalendars();
  return result ?? [];
}

/** Normalize plugin color strings for CSS (hex / rgb). */
export function normalizeAppleCalendarColor(color: string | null | undefined): string {
  if (!color || !color.trim()) return "hsl(210 100% 50%)";
  const c = color.trim();
  if (c.startsWith("#") || c.startsWith("rgb") || c.startsWith("hsl")) return c;
  if (/^[0-9a-fA-F]{6}$/.test(c)) return `#${c}`;
  return c;
}

/** Maps plugin {@link CalendarEvent} fields to our app shape (`isAllDay` → `allDay`). */
export async function getCalendarEvents(startDate: Date, endDate: Date): Promise<AppleCalendarEvent[]> {
  const { result } = await CapacitorCalendar.listEventsInRange({
    from: startDate.getTime(),
    to: endDate.getTime(),
  });
  const list = result ?? [];
  const calendars = await listDeviceCalendars();
  const titleById = new Map(calendars.map((c) => [c.id, c.title]));
  return list.map((e) => ({
    id: e.id,
    title: e.title ?? "",
    startDate: e.startDate,
    endDate: e.endDate,
    allDay: e.isAllDay,
    location: e.location,
    calendarId: e.calendarId ?? undefined,
    calendarTitle: e.calendarId ? titleById.get(e.calendarId) : undefined,
    calendarColor: e.color ?? undefined,
  }));
}

export async function addCalendarEvent(title: string, startDate: Date, endDate: Date) {
  const result = await CapacitorCalendar.createEventWithPrompt({
    title,
    startDate: startDate.getTime(),
    endDate: endDate.getTime(),
  });
  return result;
}