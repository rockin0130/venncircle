/**
 * Domain types shared by AppContext and native integrations (Apple Health / Calendar).
 * Import `Workout`, `AppleCalendarEvent`, etc. from **this module** — not from `@/context/AppContext` —
 * so `appleHealth.ts` / `appleCalendar.ts` never load the AppContext module graph (avoids Vite/Rollup
 * circular chunk warnings and TDZ errors when Settings/Workouts statically import integrations).
 */

export type WorkoutOriginType = "manual" | "ai" | "imported" | "merged";
export type WorkoutCompletionSource = "manual" | "auto_import" | "user_confirmed" | null;

export interface Workout {
  id: string;
  title: string;
  duration: string;
  cal: number;
  tag: string;
  emoji: string;
  done: boolean;
  scheduledDate?: string;
  completedDate?: string;
  exercises?: { name: string; sets: number; reps: string }[];
  hiddenFromPartner?: boolean;
  groupId?: string | null;
  ownerUserId?: string;
  distance?: number;
  distanceUnit?: string;
  heartRateAvg?: number | null;
  paceAvg?: string | null;
  speedAvg?: number | null;
  elevationGain?: number | null;
  cadenceAvg?: number | null;
  sourceApp?: string | null;
  sourceDevice?: string | null;
  routeData?: any | null;
  completionPhotoUrl?: string | null;
  externalId?: string | null;
  normalizedType?: string | null;
  originType?: WorkoutOriginType;
  completionSource?: WorkoutCompletionSource;
  matchedPlannedWorkoutId?: string | null;
  needsReview?: boolean;
  importedAt?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  linkedWorkoutId?: string | null;
}

export interface AppleCalendarEvent {
  id: string;
  title: string;
  startDate: number;
  endDate: number;
  allDay: boolean;
  location?: string | null;
  calendarId?: string;
  calendarTitle?: string;
  calendarColor?: string;
}
