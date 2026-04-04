import { Capacitor } from "@capacitor/core";
import { Health } from "@capgo/capacitor-health";
import type { HealthDataType, Workout as HKWorkout, WorkoutType } from "@capgo/capacitor-health";
import type { Workout } from "@/context/AppContext";
import { parseWorkoutDurationToMinutes } from "@/lib/workoutSync";

const READ_TYPES: HealthDataType[] = ["calories", "distance", "distanceCycling", "heartRate"];

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
  return READ_TYPES.every((t) => status.readAuthorized.includes(t));
}

export async function hasHealthReadPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const { available } = await Health.isAvailable();
    if (!available) return false;
    const status = await Health.checkAuthorization({ read: READ_TYPES });
    return READ_TYPES.every((t) => status.readAuthorized.includes(t));
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

  const distanceM = best.totalDistance ?? 0;
  const distanceKm = distanceM / 1000;

  return {
    cal: Math.round(best.totalEnergyBurned ?? 0),
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
