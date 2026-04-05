const KM_TO_MI = 0.621371;

const MILES_REGIONS = new Set(["US", "GB", "MM", "LR"]);

/**
 * US, UK, Myanmar, and Liberia commonly use miles for informal distance;
 * other locales use metric (km) for display.
 */
export function userPrefersMilesForDistance(): boolean {
  if (typeof navigator === "undefined") return false;
  const lang = (navigator.language || "").toLowerCase();
  if (lang.startsWith("en-us")) return true;
  if (lang.startsWith("en-gb")) return true;
  if (lang.startsWith("my")) return true;
  try {
    const region = new Intl.Locale(navigator.language).maximize().region;
    if (region && MILES_REGIONS.has(region)) return true;
  } catch {
    /* ignore */
  }
  return false;
}

/** `distanceKm` is stored in kilometers (e.g. from HealthKit). */
export function formatDistanceFromKm(distanceKm: number | null | undefined): { value: number; unit: "km" | "mi" } {
  const km = Math.max(0, distanceKm ?? 0);
  if (userPrefersMilesForDistance()) {
    const mi = Math.round(km * KM_TO_MI * 1000) / 1000;
    return { value: mi, unit: "mi" };
  }
  return { value: Math.round(km * 1000) / 1000, unit: "km" };
}
