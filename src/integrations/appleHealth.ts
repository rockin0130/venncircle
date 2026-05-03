import { Capacitor } from "@capacitor/core";
import { Health } from "@capgo/capacitor-health";
import type { HealthDataType, Workout as HKWorkout, WorkoutType } from "@capgo/capacitor-health";
import type { Workout } from "@/types/workoutModels";
import { formatHealthKitWorkoutLabel } from "@/lib/healthKitWorkoutTypes";
import { getWorkoutTypeEmoji, normalizeWorkoutType, parseWorkoutDurationToMinutes } from "@/lib/workoutSync";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Types we can verify via checkAuthorization (excludes workouts — iOS does not expose workout read denial). */
const READ_TYPES_FOR_CHECK: HealthDataType[] = [
  "calories",
  "distance",
  "distanceCycling",
  "heartRate",
];

const READ_TYPES: HealthDataType[] = [...READ_TYPES_FOR_CHECK, "workouts" as HealthDataType];

export async function isHealthNativeAvailable(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const { available } = await Health.isAvailable();
    return available;
  } catch {
    return false;
  }
}

export async function requestHealthKitReadPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  const { available } = await Health.isAvailable();
  if (!available) return false;
  const status = await Health.requestAuthorization({ read: READ_TYPES });
  return READ_TYPES_FOR_CHECK.every((t) => status.readAuthorized.includes(t));
}

export async function hasHealthReadPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const { available } = await Health.isAvailable();
    if (!available) return false;
    const status = await Health.checkAuthorization({ read: READ_TYPES_FOR_CHECK });
    if (!READ_TYPES_FOR_CHECK.every((t) => status.readAuthorized.includes(t))) return false;
    const end = new Date();
    const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
    await Health.queryWorkouts({
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      limit: 1,
      ascending: false,
    });
    return true;
  } catch {
    return false;
  }
}

function resolveTimeBounds(w: Workout): { startIso: string; endIso: string } {
  if (w.startTime && w.endTime) {
    return { startIso: w.startTime, endIso: w.endTime };
  }
  const durMin = parseWorkoutDurationToMinutes(w.duration) || 30;
  const end = new Date();
  const start = new Date(end.getTime() - durMin * 60000);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

function pickBestWorkout(
  list: HKWorkout[],
  centerMs: number,
  filterType?: WorkoutType | null
): HKWorkout | undefined {
  if (list.length === 0) return undefined;
  let candidates = list;
  if (filterType) {
    const typed = list.filter((x) => x.workoutType === filterType);
    if (typed.length > 0) candidates = typed;
  }
  return candidates.reduce((best, cur) => {
    const curStart = new Date(cur.startDate).getTime();
    const bestStart = new Date(best.startDate).getTime();
    return Math.abs(curStart - centerMs) < Math.abs(bestStart - centerMs) ? cur : best;
  });
}

export interface HealthKitWorkoutMetrics {
  cal: number;
  distance: number;
  distanceUnit: string;
  heartRateAvg: number | null;
  externalId: string | null;
  sourceApp: string;
}

function isoToLocalDateString(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function tagFromNormalized(norm: string): string {
  if (["Run", "Walk", "Cycle", "Swim"].includes(norm)) return "Cardio";
  if (["Strength", "HIIT"].includes(norm)) return "Full Body";
  if (norm === "Yoga") return "Flexibility";
  if (norm === "Boxing") return "Boxing";
  if (norm === "Golf") return "Golf";
  return "Activity";
}

export function mapHealthKitWorkoutToWorkout(w: HKWorkout, metrics: HealthKitWorkoutMetrics, userId: string): Workout {
  const end = new Date(w.endDate);
  const start = new Date(w.startDate);
  const dateStr = isoToLocalDateString(w.startDate);
  const norm = normalizeWorkoutType(w.workoutType as string, undefined);
  const emoji = getWorkoutTypeEmoji(norm);
  const durationMin = Math.max(1, Math.round((w.duration || 0) / 60) || Math.round((end.getTime() - start.getTime()) / 60000));
  const platformId = w.platformId || `fallback-${w.startDate}-${w.workoutType}`;
  return {
    id: `hk-${platformId}`,
    title: formatHealthKitWorkoutLabel(w.workoutType as WorkoutType),
    duration: `${durationMin} min`,
    cal: metrics.cal,
    tag: tagFromNormalized(norm),
    emoji,
    done: true,
    scheduledDate: dateStr,
    completedDate: dateStr,
    distance: metrics.distance,
    distanceUnit: metrics.distanceUnit,
    heartRateAvg: metrics.heartRateAvg,
    externalId: platformId,
    normalizedType: w.workoutType,
    originType: "imported",
    sourceApp: "apple_health",
    startTime: w.startDate,
    endTime: w.endDate,
    ownerUserId: userId,
  };
}

async function buildMetricsFromHKWorkout(best: HKWorkout): Promise<HealthKitWorkoutMetrics> {
  let heartRateAvg: number | null = null;
  try {
    const { samples } = await Health.readSamples({
      dataType: "heartRate",
      startDate: best.startDate,
      endDate: best.endDate,
      limit: 500,
      ascending: true,
    });
    if (samples.length > 0) {
      heartRateAvg = samples.reduce((s, x) => s + x.value, 0) / samples.length;
    }
  } catch {
    /* heart rate optional */
  }

  /** Match source apps (e.g. Nike Run Club): use HKWorkout totalEnergyBurned only — do not add basal samples. */
  const totalKcal = Math.round(best.totalEnergyBurned ?? 0);

  const distanceM = best.totalDistance ?? 0;
  const distanceKm = distanceM / 1000;

  return {
    cal: totalKcal,
    distance: Math.round(distanceKm * 1000) / 1000,
    distanceUnit: "km",
    heartRateAvg: heartRateAvg != null ? Math.round(heartRateAvg) : null,
    externalId: best.platformId ?? null,
    sourceApp: "apple_health",
  };
}

export async function fetchHealthKitMetricsForWorkout(w: Workout): Promise<HealthKitWorkoutMetrics | null> {
  if (!Capacitor.isNativePlatform()) return null;
  const { available } = await Health.isAvailable();
  if (!available) return null;

  const { startIso, endIso } = resolveTimeBounds(w);
  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();
  const centerMs = (startMs + endMs) / 2;

  const padMs = 3 * 60 * 1000;
  const rangeStart = new Date(startMs - padMs).toISOString();
  const rangeEnd = new Date(endMs + padMs).toISOString();

  const filterType = (w.normalizedType as WorkoutType | undefined) || undefined;

  let list: HKWorkout[] = [];
  if (filterType) {
    const r = await Health.queryWorkouts({
      startDate: rangeStart,
      endDate: rangeEnd,
      workoutType: filterType,
      limit: 40,
      ascending: false,
    });
    list = r.workouts ?? [];
  }
  if (list.length === 0) {
    const r = await Health.queryWorkouts({
      startDate: rangeStart,
      endDate: rangeEnd,
      limit: 40,
      ascending: false,
    });
    list = r.workouts ?? [];
  }

  const best = pickBestWorkout(list, centerMs, null);
  if (!best) return null;
  return buildMetricsFromHKWorkout(best);
}

/**
 * Fetches all workouts in the last 90 days from HealthKit / Health Connect (not persisted to Supabase).
 * Note: Apple Health “weekly distance” can include walking/step distance; only sessions recorded as
 * HKWorkout (e.g. Running with distance) appear in queryWorkouts — not step totals alone.
 */
export async function fetchHealthKitWorkoutHistory90Days(userId: string): Promise<Workout[]> {
  if (!Capacitor.isNativePlatform()) return [];
  const { available } = await Health.isAvailable();
  if (!available) return [];

  const end = new Date();
  const start = new Date(end.getTime() - 90 * MS_PER_DAY);
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  const raw: HKWorkout[] = [];
  try {
    let anchor: string | undefined;
    let page = 0;
    const maxPages = 50;
    /** iOS only emits anchor when a full page is returned; use a high limit to reduce round-trips. */
    const pageLimit = 1000;

    while (page < maxPages) {
      const r = await Health.queryWorkouts({
        startDate: startIso,
        endDate: endIso,
        limit: pageLimit,
        ascending: true,
        anchor,
      });
      const batch = r.workouts ?? [];
      raw.push(...batch);
      page++;
      console.log(
        `[HealthKit] queryWorkouts page ${page}: batch=${batch.length}, totalRaw=${raw.length}, hasAnchor=${!!r.anchor}`
      );
      anchor = r.anchor;
      if (!r.anchor) break;
    }
  } catch (e) {
    console.warn("HealthKit queryWorkouts:", e);
    return [];
  }

  const seen = new Map<string, HKWorkout>();
  for (const w of raw) {
    const key = w.platformId || `${w.startDate}-${w.workoutType}-${w.endDate}`;
    if (!seen.has(key)) seen.set(key, w);
  }
  const unique = Array.from(seen.values());

  const CHUNK = 12;
  const out: Workout[] = [];
  for (let i = 0; i < unique.length; i += CHUNK) {
    const slice = unique.slice(i, i + CHUNK);
    const mapped = await Promise.all(
      slice.map(async (w) => {
        const metrics = await buildMetricsFromHKWorkout(w);
        return mapHealthKitWorkoutToWorkout(w, metrics, userId);
      })
    );
    out.push(...mapped);
  }
  return out;
}

export async function syncCompletedWorkoutFromHealthKit(
  workout: Workout,
  updateWorkout: (id: string, updates: Partial<Workout>) => Promise<void>,
  ids: string[]
): Promise<void> {
  try {
    const metrics = await fetchHealthKitMetricsForWorkout(workout);
    if (!metrics) return;
    for (const id of ids) {
      await updateWorkout(id, {
        cal: metrics.cal,
        distance: metrics.distance,
        distanceUnit: metrics.distanceUnit,
        heartRateAvg: metrics.heartRateAvg,
        sourceApp: metrics.sourceApp,
        externalId: metrics.externalId,
      });
    }
  } catch (e) {
    console.warn("Apple Health workout sync:", e);
  }
}
