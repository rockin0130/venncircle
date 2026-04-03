/**
 * Workout Sync - Matching & Deduplication Logic
 * 
 * Handles intelligent matching of imported workouts (from Apple Health / Health Connect)
 * against existing planned workout cards.
 */

// Normalized workout types mapping from native health APIs
const NORMALIZED_TYPE_MAP: Record<string, string> = {
  // Apple Health workout types
  "HKWorkoutActivityTypeRunning": "Run",
  "HKWorkoutActivityTypeWalking": "Walk",
  "HKWorkoutActivityTypeCycling": "Cycle",
  "HKWorkoutActivityTypeSwimming": "Swim",
  "HKWorkoutActivityTypeTraditionalStrengthTraining": "Strength",
  "HKWorkoutActivityTypeFunctionalStrengthTraining": "Strength",
  "HKWorkoutActivityTypeHighIntensityIntervalTraining": "HIIT",
  "HKWorkoutActivityTypeYoga": "Yoga",
  "HKWorkoutActivityTypeBoxing": "Boxing",
  "HKWorkoutActivityTypeGolf": "Golf",
  // Health Connect workout types
  "EXERCISE_SESSION_TYPE_RUNNING": "Run",
  "EXERCISE_SESSION_TYPE_WALKING": "Walk",
  "EXERCISE_SESSION_TYPE_BIKING": "Cycle",
  "EXERCISE_SESSION_TYPE_SWIMMING_POOL": "Swim",
  "EXERCISE_SESSION_TYPE_SWIMMING_OPEN_WATER": "Swim",
  "EXERCISE_SESSION_TYPE_STRENGTH_TRAINING": "Strength",
  "EXERCISE_SESSION_TYPE_HIGH_INTENSITY_INTERVAL_TRAINING": "HIIT",
  "EXERCISE_SESSION_TYPE_YOGA": "Yoga",
  "EXERCISE_SESSION_TYPE_BOXING": "Boxing",
  "EXERCISE_SESSION_TYPE_GOLF": "Golf",
  // Generic fallbacks from title keywords
  "run": "Run",
  "running": "Run",
  "walk": "Walk",
  "walking": "Walk",
  "cycle": "Cycle",
  "cycling": "Cycle",
  "bike": "Cycle",
  "biking": "Cycle",
  "swim": "Swim",
  "swimming": "Swim",
  "strength": "Strength",
  "weight": "Strength",
  "hiit": "HIIT",
  "yoga": "Yoga",
  "boxing": "Boxing",
  "golf": "Golf",
};

const NORMALIZED_TYPE_EMOJI: Record<string, string> = {
  "Run": "🏃",
  "Walk": "🚶",
  "Cycle": "🚴",
  "Swim": "🏊",
  "Strength": "💪",
  "HIIT": "🔥",
  "Yoga": "🧘",
  "Boxing": "🥊",
  "Golf": "⛳",
  "Other": "🏋️",
};

export interface ImportedWorkoutData {
  externalId: string;
  source: "apple_health" | "health_connect";
  sourceDevice?: string;
  nativeType?: string;
  title?: string;
  startTime: string; // ISO timestamp
  endTime: string;   // ISO timestamp
  durationMinutes: number;
  calories?: number;
  distance?: number;
  distanceUnit?: string;
  heartRateAvg?: number;
}

export interface MatchResult {
  type: "exact_match" | "strong_match" | "weak_match" | "no_match";
  matchedWorkoutId?: string;
  confidence: number; // 0-1
  needsReview: boolean;
  autoComplete: boolean;
}

/**
 * Normalize a native workout type string into an app-friendly type.
 */
export function normalizeWorkoutType(nativeType?: string, title?: string): string {
  if (nativeType && NORMALIZED_TYPE_MAP[nativeType]) {
    return NORMALIZED_TYPE_MAP[nativeType];
  }
  // Try to infer from title
  if (title) {
    const lower = title.toLowerCase().trim();
    for (const [key, value] of Object.entries(NORMALIZED_TYPE_MAP)) {
      if (lower.includes(key.toLowerCase())) {
        return value;
      }
    }
  }
  return "Other";
}

/**
 * Get the emoji for a normalized workout type.
 */
export function getWorkoutTypeEmoji(normalizedType: string): string {
  return NORMALIZED_TYPE_EMOJI[normalizedType] || "🏋️";
}

/**
 * Extract the effective date (YYYY-MM-DD) from a workout's start time.
 */
export function getEffectiveDateFromTimestamp(isoTimestamp: string): string {
  const d = new Date(isoTimestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Format duration in minutes to the app's duration string format.
 */
export function formatDurationMinutes(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hrs = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (mins === 0) return `${hrs} hr`;
  return `${hrs} hr ${mins} min`;
}

interface ExistingWorkout {
  id: string;
  title: string;
  normalizedType?: string | null;
  scheduledDate?: string;
  done: boolean;
  externalId?: string | null;
  originType?: string;
  duration: string;
  startTime?: string | null;
}

/**
 * Parse duration string to minutes for comparison.
 */
function parseDurationToMinutes(dur: string): number {
  if (!dur) return 0;
  let total = 0;
  const hrMatch = dur.match(/(\d+)\s*hr/i);
  const minMatch = dur.match(/(\d+)\s*min/i);
  if (hrMatch) total += parseInt(hrMatch[1]) * 60;
  if (minMatch) total += parseInt(minMatch[1]);
  if (!hrMatch && !minMatch) {
    const num = parseInt(dur);
    if (!isNaN(num)) total = num;
  }
  return total;
}

/**
 * Calculate time proximity in minutes between two ISO timestamps.
 */
function timeProximityMinutes(t1: string, t2: string): number {
  return Math.abs(new Date(t1).getTime() - new Date(t2).getTime()) / 60000;
}

/**
 * Match an imported workout against existing workouts.
 * Returns the best match result.
 */
export function matchImportedWorkout(
  imported: ImportedWorkoutData,
  existingWorkouts: ExistingWorkout[]
): MatchResult {
  const importedDate = getEffectiveDateFromTimestamp(imported.startTime);
  const importedNormType = normalizeWorkoutType(imported.nativeType, imported.title);

  // 1. Check for exact external_id match (already imported)
  if (imported.externalId) {
    const exactMatch = existingWorkouts.find(
      (w) => w.externalId === imported.externalId
    );
    if (exactMatch) {
      return {
        type: "exact_match",
        matchedWorkoutId: exactMatch.id,
        confidence: 1.0,
        needsReview: false,
        autoComplete: false, // Already exists, just update
      };
    }
  }

  // 2. Find unmatched planned cards of same type on same date
  const sameDateSameType = existingWorkouts.filter((w) => {
    const wDate = w.scheduledDate;
    if (!wDate || wDate !== importedDate) return false;
    if (w.done) return false; // Already completed
    if (w.externalId) return false; // Already matched to an import
    if (w.originType === "imported") return false; // Not a planned card

    const wNormType = w.normalizedType || normalizeWorkoutType(undefined, w.title);
    return wNormType === importedNormType;
  });

  if (sameDateSameType.length === 1) {
    const candidate = sameDateSameType[0];
    let confidence = 0.7; // Base confidence for same type + same date

    // 3. Time proximity bonus
    if (candidate.startTime && imported.startTime) {
      const proximity = timeProximityMinutes(candidate.startTime, imported.startTime);
      if (proximity < 30) confidence += 0.15;
      else if (proximity < 60) confidence += 0.1;
      else if (proximity < 120) confidence += 0.05;
    }

    // 4. Duration similarity bonus
    const candidateDur = parseDurationToMinutes(candidate.duration);
    if (candidateDur > 0 && imported.durationMinutes > 0) {
      const ratio = Math.min(candidateDur, imported.durationMinutes) /
        Math.max(candidateDur, imported.durationMinutes);
      if (ratio > 0.8) confidence += 0.1;
      else if (ratio > 0.5) confidence += 0.05;
    }

    confidence = Math.min(confidence, 1.0);

    return {
      type: confidence >= 0.8 ? "strong_match" : "weak_match",
      matchedWorkoutId: candidate.id,
      confidence,
      needsReview: confidence < 0.8,
      autoComplete: confidence >= 0.8,
    };
  }

  if (sameDateSameType.length > 1) {
    // Ambiguous - multiple planned cards of same type on same date
    return {
      type: "weak_match",
      matchedWorkoutId: sameDateSameType[0].id,
      confidence: 0.4,
      needsReview: true,
      autoComplete: false,
    };
  }

  // 5. No match found
  return {
    type: "no_match",
    confidence: 0,
    needsReview: false,
    autoComplete: false,
  };
}

/**
 * Check if an imported workout is a duplicate of an already-imported workout.
 */
export function isDuplicateImport(
  imported: ImportedWorkoutData,
  existingWorkouts: ExistingWorkout[]
): boolean {
  // Check external_id
  if (imported.externalId) {
    if (existingWorkouts.some((w) => w.externalId === imported.externalId)) {
      return true;
    }
  }

  // Check for same source + same date + same type + similar duration + similar time
  const importedDate = getEffectiveDateFromTimestamp(imported.startTime);
  const importedNormType = normalizeWorkoutType(imported.nativeType, imported.title);

  return existingWorkouts.some((w) => {
    if (w.originType !== "imported") return false;
    if (w.scheduledDate !== importedDate) return false;

    const wNormType = w.normalizedType || normalizeWorkoutType(undefined, w.title);
    if (wNormType !== importedNormType) return false;

    // Check time proximity (within 5 minutes = likely same workout)
    if (w.startTime && imported.startTime) {
      const proximity = timeProximityMinutes(w.startTime, imported.startTime);
      if (proximity < 5) return true;
    }

    // Check duration similarity
    const wDur = parseDurationToMinutes(w.duration);
    if (wDur > 0 && imported.durationMinutes > 0) {
      const ratio = Math.min(wDur, imported.durationMinutes) /
        Math.max(wDur, imported.durationMinutes);
      if (ratio > 0.95) return true;
    }

    return false;
  });
}

/**
 * Get the source display label for a workout.
 */
export function getSourceLabel(sourceApp?: string | null, originType?: string): string | null {
  if (originType === "imported" || originType === "merged") {
    if (sourceApp === "apple_health") return "Apple Health";
    if (sourceApp === "health_connect") return "Health Connect";
    if (sourceApp) return sourceApp;
    return "Imported";
  }
  return null;
}
