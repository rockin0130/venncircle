import type { Workout } from "@/context/AppContext";

/**
 * Merges HealthKit-only workouts with app (Supabase) workouts for the current user.
 * When both share the same `externalId`, one row is kept with HealthKit metrics preferred.
 */
export function mergeAppWorkoutsWithHealthKit(
  appWorkouts: Workout[],
  hkWorkouts: Workout[],
  currentUserId: string
): Workout[] {
  if (!currentUserId) return appWorkouts;

  const isOwn = (w: Workout) => (w.ownerUserId || currentUserId) === currentUserId;
  const ownApp = appWorkouts.filter(isOwn);
  const partnerApp = appWorkouts.filter((w) => !isOwn(w));

  const hkByExt = new Map<string, Workout>();
  for (const h of hkWorkouts) {
    if (h.externalId) hkByExt.set(h.externalId, h);
  }

  const mergedOwn: Workout[] = [];
  const consumedHkExt = new Set<string>();

  for (const w of ownApp) {
    const ext = w.externalId;
    if (ext && hkByExt.has(ext)) {
      const hk = hkByExt.get(ext)!;
      consumedHkExt.add(ext);
      mergedOwn.push({
        ...w,
        cal: hk.cal ?? w.cal,
        distance: hk.distance ?? w.distance,
        distanceUnit: hk.distanceUnit ?? w.distanceUnit,
        heartRateAvg: hk.heartRateAvg ?? w.heartRateAvg,
        duration: hk.duration || w.duration,
        startTime: hk.startTime ?? w.startTime,
        endTime: hk.endTime ?? w.endTime,
        sourceApp: hk.sourceApp ?? w.sourceApp,
      });
    } else {
      mergedOwn.push(w);
    }
  }

  for (const hk of hkWorkouts) {
    const ext = hk.externalId;
    if (!ext || consumedHkExt.has(ext)) continue;
    mergedOwn.push(hk);
    consumedHkExt.add(ext);
  }

  return [...mergedOwn, ...partnerApp];
}
