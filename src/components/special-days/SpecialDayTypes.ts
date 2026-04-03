export type EventType = "birthday" | "anniversary" | "first_met" | "wedding" | "holiday" | "custom";
export type DisplayMode = "auto" | "countdown" | "days_since" | "days_together" | "annual_countdown" | "anniversary_style";

export interface SpecialDay {
  id: string;
  title: string;
  icon: string;
  event_date: string;
  count_direction: "since" | "until";
  repeats_yearly: boolean;
  is_featured: boolean;
  group_id: string | null;
  user_id: string;
  photo_url: string | null;
  category: string;
  notes: string | null;
  reminder_minutes: number | null;
  event_type: EventType;
  display_mode: DisplayMode;
  inclusive_count?: boolean;
  shared_group_ids?: string[];
  context_group_id?: string | null;
}

export const EVENT_TYPE_OPTIONS: { value: EventType; label: string; icon: string; defaultDirection: "since" | "until"; defaultRepeats: boolean; defaultDisplayMode: DisplayMode }[] = [
  { value: "birthday", label: "Birthday", icon: "🎂", defaultDirection: "until", defaultRepeats: true, defaultDisplayMode: "annual_countdown" },
  { value: "anniversary", label: "Anniversary", icon: "💍", defaultDirection: "since", defaultRepeats: true, defaultDisplayMode: "days_together" },
  { value: "first_met", label: "First Met", icon: "💕", defaultDirection: "since", defaultRepeats: false, defaultDisplayMode: "days_together" },
  { value: "wedding", label: "Wedding", icon: "💒", defaultDirection: "since", defaultRepeats: true, defaultDisplayMode: "anniversary_style" },
  { value: "holiday", label: "Holiday", icon: "🎄", defaultDirection: "until", defaultRepeats: true, defaultDisplayMode: "annual_countdown" },
  { value: "custom", label: "Custom", icon: "⭐", defaultDirection: "until", defaultRepeats: false, defaultDisplayMode: "countdown" },
];

export const DISPLAY_MODE_OPTIONS: { value: DisplayMode; label: string; description: string }[] = [
  { value: "countdown", label: "Countdown", description: "\"X days to go\" — for future one-time events" },
  { value: "days_since", label: "Days Since", description: "\"X days ago\" — for past events" },
  { value: "days_together", label: "Days Together", description: "\"X days together\" — for relationships" },
  { value: "annual_countdown", label: "Annual Countdown", description: "\"X days to go\" — counts to next yearly occurrence" },
  { value: "anniversary_style", label: "Anniversary Style", description: "\"X days together\" + \"Next anniversary in Y days\"" },
];

export const ICON_OPTIONS = ["❤️", "💍", "🎂", "🎉", "🏆", "⭐", "🌹", "💐", "🥂", "👶", "🎓", "✈️", "🏠", "💪", "🙏", "🎊"];

export const CATEGORY_OPTIONS = [
  { value: "birthday", label: "Birthday", icon: "🎂" },
  { value: "anniversary", label: "Anniversary", icon: "💍" },
  { value: "family", label: "Family", icon: "👨‍👩‍👧" },
  { value: "holiday", label: "Holiday", icon: "🎄" },
  { value: "custom", label: "Custom", icon: "⭐" },
];

export const REMINDER_OPTIONS = [
  { value: 0, label: "On the day" },
  { value: 10080, label: "1 week before" },
  { value: -1, label: "Custom" },
];

export const fmtDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function daysBetween(a: Date, b: Date) {
  // Use UTC-normalised dates to avoid DST/timezone shifts
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((utcB - utcA) / 86400000);
}

/** Parse a YYYY-MM-DD string into a local-midnight Date without UTC shift */
export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function getNextOccurrence(dateStr: string, now: Date) {
  const d = parseLocalDate(dateStr);
  const thisYear = new Date(now.getFullYear(), d.getMonth(), d.getDate());
  if (thisYear >= now) return daysBetween(now, thisYear);
  const nextYear = new Date(now.getFullYear() + 1, d.getMonth(), d.getDate());
  return daysBetween(now, nextYear);
}

export function getAge(dateStr: string, now: Date): number {
  const d = parseLocalDate(dateStr);
  let age = now.getFullYear() - d.getFullYear();
  const thisYearBday = new Date(now.getFullYear(), d.getMonth(), d.getDate());
  if (now < thisYearBday) age--;
  return age;
}

export function getNextBirthdayAge(dateStr: string, now: Date): number {
  const d = parseLocalDate(dateStr);
  const thisYearBday = new Date(now.getFullYear(), d.getMonth(), d.getDate());
  if (thisYearBday >= now) {
    return now.getFullYear() - d.getFullYear();
  }
  return now.getFullYear() + 1 - d.getFullYear();
}

/** Core day count — uses display_mode to decide what number to show */
export function getDayCount(day: SpecialDay, now: Date): number {
  const eventDate = parseLocalDate(day.event_date);
  const mode = resolveDisplayMode(day);

  switch (mode) {
    case "annual_countdown":
      return getNextOccurrence(day.event_date, now);
    case "days_together":
    case "anniversary_style": {
      const raw = daysBetween(eventDate, now);
      return day.inclusive_count ? raw + 1 : raw;
    }
    case "days_since":
      return Math.max(0, daysBetween(eventDate, now));
    case "countdown":
    default:
      return Math.max(0, daysBetween(now, eventDate));
  }
}

/** Resolve 'auto' to a concrete mode based on event_type */
export function resolveDisplayMode(day: SpecialDay): DisplayMode {
  if (day.display_mode && day.display_mode !== "auto") return day.display_mode;
  const opt = EVENT_TYPE_OPTIONS.find((o) => o.value === day.event_type);
  return opt?.defaultDisplayMode || "countdown";
}

export function getDisplayLabel(day: SpecialDay, now: Date): { primary: string; secondary: string } {
  const mode = resolveDisplayMode(day);
  const count = getDayCount(day, now);
  const eventDate = parseLocalDate(day.event_date);

  // Birthday special handling
  if (day.event_type === "birthday" && mode === "annual_countdown") {
    if (count === 0) {
      const age = getAge(day.event_date, now);
      return { primary: "Today! 🎉", secondary: `Turns ${age} today` };
    }
    const nextAge = getNextBirthdayAge(day.event_date, now);
    const nextBday = new Date(now.getFullYear(), eventDate.getMonth(), eventDate.getDate());
    if (nextBday < now) nextBday.setFullYear(nextBday.getFullYear() + 1);
    const dateStr = nextBday.toLocaleDateString("en-US", { month: "long", day: "numeric" });
    return {
      primary: `${count.toLocaleString()} days to go`,
      secondary: `Turns ${nextAge} on ${dateStr}`,
    };
  }

  switch (mode) {
    case "annual_countdown": {
      if (count === 0) return { primary: "Today! 🎉", secondary: "Repeats yearly" };
      return { primary: `${count.toLocaleString()} days to go`, secondary: "Repeats yearly" };
    }
    case "days_together": {
      if (count === 0) return { primary: "Today! 🎉", secondary: "Day one" };
      return { primary: `${count.toLocaleString()} days together`, secondary: "" };
    }
    case "anniversary_style": {
      const daysSince = day.inclusive_count ? daysBetween(eventDate, now) + 1 : daysBetween(eventDate, now);
      const nextOcc = getNextOccurrence(day.event_date, now);
      if (nextOcc === 0) {
        const years = now.getFullYear() - eventDate.getFullYear();
        return { primary: "Today! 🎉", secondary: `${years} years together` };
      }
      return {
        primary: `${daysSince.toLocaleString()} days together`,
        secondary: `Next anniversary in ${nextOcc} days`,
      };
    }
    case "days_since":
      return { primary: `${count.toLocaleString()} days ago`, secondary: "" };
    case "countdown":
    default:
      if (count === 0) return { primary: "Today! 🎉", secondary: "" };
      return { primary: `${count.toLocaleString()} days to go`, secondary: "" };
  }
}

export function getUpcomingMilestones(startDate: Date, now: Date) {
  const daysSince = daysBetween(startDate, now);
  const milestones: { label: string; daysLeft: number }[] = [];
  for (let y = 1; y <= 100; y++) {
    const milestone = new Date(startDate);
    milestone.setFullYear(milestone.getFullYear() + y);
    const left = daysBetween(now, milestone);
    if (left > 0 && left <= 730) {
      milestones.push({ label: `${y} ${y === 1 ? "year" : "years"}`, daysLeft: left });
    }
  }
  [100, 200, 365, 500, 1000, 1500, 2000, 2500, 3000, 5000, 10000].forEach((d) => {
    const left = d - daysSince;
    if (left > 0 && left <= 365) {
      milestones.push({ label: `${d} days`, daysLeft: left });
    }
  });
  return milestones.sort((a, b) => a.daysLeft - b.daysLeft).slice(0, 4);
}
