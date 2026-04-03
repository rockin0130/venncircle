import { createContext, useContext, useState, ReactNode, useCallback, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import {
  HabitSectionMeta,
  loadSectionsFromDB,
  addSectionToDB,
  createSharedSectionRPC,
  renameSectionInDB,
  deleteSectionFromDB,
} from "@/lib/habitSections";

export interface Habit {
  id: string;
  label: string;
  done: boolean;
  category: string;
  completionDates: string[];
  hiddenFromPartner?: boolean;
  groupId?: string | null;
  sharedGroupIds?: string[];
  ownerUserId?: string;
}

export interface ScheduledEvent {
  id: string;
  title: string;
  time: string;
  description?: string;
  day: number;
  month: number;
  year: number;
  endDay?: number;
  endMonth?: number;
  endYear?: number;
  endTime?: string;
  allDay?: boolean;
  user: "me" | "partner" | "both";
  done?: boolean;
  completedAt?: string | null;
  completedBy?: string | null;
  updatedAt?: string | null;
  hiddenFromPartner?: boolean;
  groupId?: string | null;
  ownerUserId?: string;
  calendarId?: string | null;
}

export interface Task {
  id: string;
  title: string;
  time: string;
  tag: "Work" | "Personal" | "Household";
  assignee: "me" | "partner" | "both";
  done: boolean;
  completedAt?: string | null;
  completedBy?: string | null;
  updatedAt?: string | null;
  scheduledDay?: number;
  scheduledMonth?: number;
  scheduledYear?: number;
  dueDate?: string | null;
  priorNoticeDays?: number;
  hiddenFromPartner?: boolean;
  groupId?: string | null;
  ownerUserId?: string;
}

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
  // Cardio metrics
  heartRateAvg?: number | null;
  paceAvg?: string | null;
  speedAvg?: number | null;
  elevationGain?: number | null;
  cadenceAvg?: number | null;
  // Device/source info
  sourceApp?: string | null;
  sourceDevice?: string | null;
  routeData?: any | null;
  // Completion photo
  completionPhotoUrl?: string | null;
  // Import/sync fields
  externalId?: string | null;
  normalizedType?: string | null;
  originType?: WorkoutOriginType;
  completionSource?: WorkoutCompletionSource;
  matchedPlannedWorkoutId?: string | null;
  needsReview?: boolean;
  importedAt?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  // Cross-group linking
  linkedWorkoutId?: string | null;
}

const CARDIO_TYPES = ["Running", "Walking", "Cycling", "Swimming"];
export const isCardioWorkout = (title: string) =>
  CARDIO_TYPES.some((t) => title.toLowerCase().includes(t.toLowerCase()));

export const mapWorkoutRow = (w: any, ownerUserId?: string): Workout => ({
  id: w.id,
  title: w.title,
  duration: w.duration,
  cal: w.cal,
  tag: w.tag,
  emoji: w.emoji,
  done: w.done,
  scheduledDate: w.scheduled_date,
  completedDate: w.completed_date,
  exercises: w.exercises || [],
  hiddenFromPartner: w.hidden_from_partner || false,
  groupId: w.group_id || null,
  ownerUserId,
  distance: Number(w.distance) || 0,
  distanceUnit: w.distance_unit || "km",
  heartRateAvg: w.heart_rate_avg ?? null,
  paceAvg: w.pace_avg ?? null,
  speedAvg: w.speed_avg != null ? Number(w.speed_avg) : null,
  elevationGain: w.elevation_gain != null ? Number(w.elevation_gain) : null,
  cadenceAvg: w.cadence_avg ?? null,
  sourceApp: w.source_app ?? null,
  sourceDevice: w.source_device ?? null,
  routeData: w.route_data ?? null,
  completionPhotoUrl: w.completion_photo_url ?? null,
  externalId: w.external_id ?? null,
  normalizedType: w.normalized_type ?? null,
  originType: w.origin_type ?? "manual",
  completionSource: w.completion_source ?? null,
  matchedPlannedWorkoutId: w.matched_planned_workout_id ?? null,
  needsReview: w.needs_review ?? false,
  importedAt: w.imported_at ?? null,
  startTime: w.start_time ?? null,
  endTime: w.end_time ?? null,
  linkedWorkoutId: w.linked_workout_id ?? null,
});

export interface GoogleCalendarEvent {
  id: string;
  title: string;
  description: string | null;
  start: string;
  end: string;
  allDay: boolean;
  location: string | null;
  htmlLink: string;
  ownerUserId?: string;
  assignee?: "me" | "partner" | "both";
  done?: boolean;
  completedAt?: string | null;
  completedBy?: string | null;
  calendarId?: string;
  calendarColor?: string | null;
}

interface AppContextType {
  habits: Habit[];
  filteredHabits: Habit[];
  toggleHabit: (id: string) => void;
  addHabit: (label: string, category: string, groupIds?: string[]) => void;
  removeHabit: (id: string) => void;
  updateHabitLabel: (id: string, newLabel: string) => Promise<void>;
  addSharedHabit: (label: string, category: string) => Promise<void>;
  renameHabitCategory: (oldCategory: string, newCategory: string) => Promise<void>;
  deleteHabitCategory: (category: string) => Promise<void>;
  // Habit sections (DB-backed)
  habitSections: HabitSectionMeta[];
  addHabitSection: (label: string, icon?: string, forEveryone?: boolean) => Promise<void>;
  renameHabitSection: (oldKey: string, newLabel: string) => Promise<void>;
  deleteHabitSection: (key: string) => Promise<void>;
  refreshHabitSections: () => Promise<void>;
  events: ScheduledEvent[];
  filteredEvents: ScheduledEvent[];
  addEvent: (event: Omit<ScheduledEvent, "id">) => void;
  removeEvent: (id: string) => void;
  updateEvent: (id: string, updates: Partial<Pick<ScheduledEvent, "title" | "time" | "endTime" | "day" | "month" | "year" | "endDay" | "endMonth" | "endYear" | "allDay" | "description">>) => Promise<void>;
  rescheduleEvent: (id: string, day: number, month: number, year: number) => Promise<void>;
  toggleEventCompletion: (id: string) => Promise<void>;
  tasks: Task[];
  filteredTasks: Task[];
  toggleTask: (id: string) => void;
  addTask: (task: Omit<Task, "id" | "done">) => void;
  removeTask: (id: string) => void;
  updateTask: (id: string, updates: Partial<Pick<Task, "title" | "tag" | "scheduledDay" | "scheduledMonth" | "scheduledYear" | "time" | "dueDate" | "priorNoticeDays">>) => void;
  waterIntake: number;
  waterGoal: number;
  setWaterIntake: (amount: number) => void;
  setWaterGoal: (goal: number) => void;
  resetWater: () => void;
  partnerWaterIntake: number;
  partnerWaterGoal: number;
  partnerWaterMap: Map<string, { intake: number; goal: number }>;
  workouts: Workout[];
  filteredWorkouts: Workout[];
  toggleWorkout: (id: string) => void;
  removeWorkout: (id: string) => void;
  removeWorkoutsByFilter: (filter: "all" | "week" | "month" | "date", date?: string) => Promise<number>;
  updateWorkout: (id: string, updates: Partial<Workout>) => void;
  setWorkouts: (workouts: Workout[]) => void;
  addWorkouts: (workouts: Workout[]) => void;
  rescheduleWorkout: (id: string, newDate: string) => void;
  rescheduleWorkoutCascade: (id: string, newDate: string, shiftFollowing: boolean) => Promise<void>;
  getHabitStreak: (id: string) => number;
  getHabitsForDate: (date: string) => Habit[];
  getWorkoutsForDate: (date: string) => Workout[];
  googleCalendarEvents: GoogleCalendarEvent[];
  hideGcalEvent: (eventId: string) => Promise<void>;
  toggleGcalCompletion: (eventId: string) => Promise<void>;
  toggleEventVisibility: (eventId: string) => Promise<void>;
  designateGcalEvent: (eventId: string, assignee: "me" | "partner" | "both") => Promise<void>;
  // Partner data (raw)
  partnerHabits: Habit[];
  partnerEvents: ScheduledEvent[];
  partnerTasks: Task[];
  partnerWorkouts: Workout[];
  // Partner data (group-filtered, matching own data filtering)
  filteredPartnerHabits: Habit[];
  filteredPartnerEvents: ScheduledEvent[];
  filteredPartnerTasks: Task[];
  filteredPartnerWorkouts: Workout[];
  getPartnerWorkoutsForDate: (date: string) => Workout[];
  getPartnerHabitsForDate: (date: string) => Habit[];
  getPartnerHabitStreak: (id: string) => number;
  refreshData: () => void;
  loading: boolean;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const fmtDateCtx = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const todayStr = () => fmtDateCtx(new Date());

type Assignee = "me" | "partner" | "both";

const toViewerPerspective = (assignee: Assignee, isOwnerView: boolean): Assignee => {
  if (isOwnerView) return assignee;
  if (assignee === "me") return "partner";
  if (assignee === "partner") return "me";
  return "both";
};

const upsertById = <T extends { id: string }>(items: T[], next: T): T[] => {
  const idx = items.findIndex((item) => item.id === next.id);
  if (idx === -1) return [...items, next];
  const copy = [...items];
  copy[idx] = { ...copy[idx], ...next };
  return copy;
};

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const { user, partner, activeGroup, groups } = useAuth();

  // Resolve the Personal sentinel: Personal means group_id IS NULL
  const isPersonalActive = (activeGroup as any)?._personal === true;
  // For writes: use null when Personal or All is active, actual group ID otherwise
  const resolvedGroupId = isPersonalActive ? null : (activeGroup?.id ?? null);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [events, setEvents] = useState<ScheduledEvent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [waterIntake, setWaterIntakeState] = useState(0);
  const [waterGoal, setWaterGoalState] = useState(3);
  const [partnerWaterIntake, setPartnerWaterIntake] = useState(0);
  const [partnerWaterGoal, setPartnerWaterGoal] = useState(3);
  const [partnerWaterMap, setPartnerWaterMap] = useState<Map<string, { intake: number; goal: number }>>(new Map());
  const [workouts, setWorkoutsState] = useState<Workout[]>([]);
  const [partnerHabits, setPartnerHabits] = useState<Habit[]>([]);
  const [partnerEvents, setPartnerEvents] = useState<ScheduledEvent[]>([]);
  const [partnerTasks, setPartnerTasks] = useState<Task[]>([]);
  const [partnerWorkouts, setPartnerWorkouts] = useState<Workout[]>([]);
  const [googleCalendarEvents, setGoogleCalendarEvents] = useState<GoogleCalendarEvent[]>([]);
  const [habitSectionsState, setHabitSectionsState] = useState<HabitSectionMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshCounter, setRefreshCounter] = useState(0);

  // Get ALL other user IDs in the active context (supports 3+ member groups)
  const contextOtherUserIds = useMemo(() => {
    if (!user) return [];

    if (activeGroup) {
      const otherMembers = activeGroup.members.filter((m) => m.user_id !== user.id);
      return otherMembers.map((m) => m.user_id);
    }

    // "All" view — gather all unique other user IDs from ALL groups
    const seen = new Set<string>();
    for (const g of groups) {
      for (const m of g.members) {
        if (m.user_id !== user.id && m.status === "active") {
          seen.add(m.user_id);
        }
      }
    }
    // Also include legacy partner if not already in a group
    if (partner?.id) seen.add(partner.id);
    return Array.from(seen);
  }, [activeGroup, partner?.id, user, groups]);

  // Backward compat: single partner ID (first other member or legacy partner)
  const contextOtherUserId = contextOtherUserIds.length > 0 ? contextOtherUserIds[0] : null;

  // Load all data from database on mount
  useEffect(() => {
    if (!user) {
      setHabits([]);
      setEvents([]);
      setTasks([]);
      setWorkoutsState([]);
      setPartnerHabits([]);
      setPartnerEvents([]);
      setPartnerTasks([]);
      setPartnerWorkouts([]);
      setWaterIntakeState(0);
      setWaterGoalState(3);
      setLoading(false);
      return;
    }

    const loadData = async () => {
      setLoading(true);
      try {
        // Load own habits with completions
        const { data: habitsData } = await supabase
          .from("habits")
          .select("*")
          .eq("user_id", user.id);

        const { data: completionsData } = await supabase
          .from("habit_completions")
          .select("*")
          .eq("user_id", user.id);

        if (habitsData) {
          const completionMap = new Map<string, string[]>();
          (completionsData || []).forEach((c: any) => {
            const dates = completionMap.get(c.habit_id) || [];
            dates.push(c.completed_date);
            completionMap.set(c.habit_id, dates);
          });

          const todayDate = todayStr();
          setHabits(habitsData.map((h: any) => {
            const completionDates = completionMap.get(h.id) || [];
            return {
              id: h.id,
              label: h.label,
              category: h.category as string,
              done: completionDates.includes(todayDate),
              completionDates,
              hiddenFromPartner: h.hidden_from_partner || false,
              groupId: h.group_id || null,
              sharedGroupIds: h.shared_group_ids || [],
            };
          }));
        }

        // Load tasks
        const { data: tasksData } = await supabase
          .from("tasks")
          .select("*")
          .eq("user_id", user.id);

        if (tasksData) {
          setTasks(tasksData.map((t: any) => ({
            id: t.id,
            title: t.title,
            time: t.time || "",
            tag: t.tag as "Work" | "Personal" | "Household",
            assignee: t.assignee as "me" | "partner" | "both",
            done: t.done,
            completedAt: t.completed_at ?? null,
            completedBy: t.completed_by ?? null,
            updatedAt: t.updated_at ?? null,
            scheduledDay: t.scheduled_day,
            scheduledMonth: t.scheduled_month,
            scheduledYear: t.scheduled_year,
            dueDate: t.due_date ?? null,
            priorNoticeDays: t.prior_notice_days ?? 0,
            hiddenFromPartner: t.hidden_from_partner || false,
            groupId: t.group_id || null,
          })));
        }

        // Load events
        const { data: eventsData } = await supabase
          .from("events")
          .select("*")
          .eq("user_id", user.id);

        if (eventsData) {
          setEvents(eventsData.map((e: any) => ({
            id: e.id,
            title: e.title,
            time: e.time || "",
            description: e.description,
            day: e.day,
            month: e.month,
            year: e.year,
            endDay: e.end_day ?? e.day,
            endMonth: e.end_month ?? e.month,
            endYear: e.end_year ?? e.year,
            endTime: e.end_time ?? "",
            allDay: e.all_day ?? false,
            user: e.assignee as "me" | "partner" | "both",
            done: e.done ?? false,
            completedAt: e.completed_at ?? null,
            completedBy: e.completed_by ?? null,
            updatedAt: e.updated_at ?? null,
            hiddenFromPartner: e.hidden_from_partner || false,
            groupId: e.group_id || null,
            calendarId: e.calendar_id || null,
          })));
        }

        // Load workouts
        const { data: workoutsData } = await supabase
          .from("workouts")
          .select("*")
          .eq("user_id", user.id);

        if (workoutsData) {
          setWorkoutsState(workoutsData.map((w: any) => mapWorkoutRow(w, user.id)));
        }

        // Load water tracking for today
        const { data: waterData } = await supabase
          .from("water_tracking")
          .select("*")
          .eq("user_id", user.id)
          .eq("date", todayStr())
          .maybeSingle();

        if (waterData) {
          setWaterIntakeState(Number(waterData.intake));
          setWaterGoalState(Number(waterData.goal));
        } else {
          setWaterIntakeState(0);
          setWaterGoalState(3);
        }
      } catch (err) {
        console.error("Error loading data:", err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [user, refreshCounter]);

  // ── Load habit sections from DB ──
  const groupIdRef = resolvedGroupId;

  const refreshHabitSections = useCallback(async () => {
    if (!user) return;
    const sections = await loadSectionsFromDB(user.id, groupIdRef);
    setHabitSectionsState(sections);
  }, [user, groupIdRef]);

  useEffect(() => {
    if (user) {
      refreshHabitSections();
    } else {
      setHabitSectionsState([]);
    }
  }, [user, groupIdRef, refreshHabitSections]);

  const addHabitSection = async (label: string, icon = "📋", forEveryone = false) => {
    if (!user) return;
    const key = label.trim().toLowerCase().replace(/\s+/g, "-");

    if (forEveryone && groupIdRef) {
      const result = await createSharedSectionRPC(key, label.trim(), icon, groupIdRef);
      if (result.error) {
        console.error("Shared section error:", result.error);
        return;
      }
    } else {
      await addSectionToDB(user.id, groupIdRef, { key, label: label.trim(), icon }, habitSectionsState.length);
    }
    await refreshHabitSections();
  };

  const renameHabitSectionFn = async (oldKey: string, newLabel: string) => {
    if (!user) return;
    const newKey = newLabel.trim().toLowerCase().replace(/\s+/g, "-");
    await renameSectionInDB(user.id, groupIdRef, oldKey, newKey, newLabel.trim());
    if (oldKey !== newKey) {
      // Also rename habit categories
      const habitIds = habits.filter((h) => h.category === oldKey).map((h) => h.id);
      if (habitIds.length > 0) {
        await supabase.from("habits").update({ category: newKey }).in("id", habitIds);
        setHabits((h) => h.map((item) => item.category === oldKey ? { ...item, category: newKey } : item));
      }
    }
    await refreshHabitSections();
  };

  const deleteHabitSectionFn = async (key: string) => {
    if (!user) return;
    // Delete only current user's habits in this category
    const toDelete = habits.filter((h) => h.category === key);
    for (const h of toDelete) {
      await supabase.from("habit_completions").delete().eq("habit_id", h.id);
      await supabase.from("habits").delete().eq("id", h.id);
    }
    setHabits((h) => h.filter((item) => item.category !== key));
    await deleteSectionFromDB(user.id, groupIdRef, key);
    await refreshHabitSections();
  };

  // Load Google Calendar events — supports both single group and "All" mode
  useEffect(() => {
    if (!user) {
      setGoogleCalendarEvents([]);
      return;
    }

    let cancelled = false;

    const getValidAccessToken = async () => {
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();

      if (currentSession?.access_token) {
        return currentSession.access_token;
      }

      const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) {
        console.warn("Unable to refresh auth session before Google Calendar sync:", refreshError.message);
      }

      return refreshed?.session?.access_token ?? null;
    };

    const loadGcalEvents = async () => {
      try {
        let accessToken = await getValidAccessToken();
        if (!accessToken) return;

        const now = new Date();
        const timeMin = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const timeMax = new Date(now.getFullYear(), now.getMonth() + 3, 0).toISOString();

        const buildSyncUrl = () =>
          activeGroup
            ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-calendar-sync?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&groupId=${encodeURIComponent(activeGroup.id)}&groupShared=true`
            : `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-calendar-sync?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&allGroups=true`;

        const requestSync = (token: string) =>
          fetch(buildSyncUrl(), {
            headers: {
              Authorization: `Bearer ${token}`,
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
          });

        let res = await requestSync(accessToken);

        if (res.status === 401) {
          const { data: refreshed } = await supabase.auth.refreshSession();
          const refreshedToken = refreshed?.session?.access_token ?? null;

          if (refreshedToken) {
            accessToken = refreshedToken;
            res = await requestSync(accessToken);
          }
        }

        if (!res.ok) {
          const errorBody = await res.text().catch(() => "");
          // 403 means we're not a member of this group anymore — silently return
          if (res.status === 403) {
            return;
          }
          console.warn("Google Calendar sync failed", {
            status: res.status,
            body: errorBody.slice(0, 200),
          });
          return;
        }

        const data = await res.json();
        const rawEvents: GoogleCalendarEvent[] = data.events || [];

        // Load completion states for these gcal events
        const gcalIds = rawEvents.map((ge) => ge.id);
        const { data: completions } = gcalIds.length > 0
          ? await supabase.from("gcal_event_completions").select("*").in("gcal_event_id", gcalIds)
          : { data: [] };
        const completionMap = new Map((completions || []).map((c: any) => [c.gcal_event_id, c]));

        const enriched = rawEvents.map((ge) => {
          const fallbackAssignee: Assignee = ge.ownerUserId === user.id ? "me" : "partner";
          const assignee = (ge.assignee as Assignee | undefined) ?? fallbackAssignee;
          const completion = completionMap.get(ge.id);
          return {
            ...ge,
            assignee,
            done: completion?.done ?? false,
            completedAt: completion?.completed_at ?? null,
            completedBy: completion?.completed_by ?? null,
          };
        });

        if (cancelled) return;
        setGoogleCalendarEvents(enriched);
      } catch (err) {
        console.error("Error loading Google Calendar events:", err);
      }
    };

    void loadGcalEvents();

    return () => {
      cancelled = true;
    };
  }, [user?.id, activeGroup?.id]);

  // Load "other member" data for the active context (group member if selected, otherwise linked partner)
  useEffect(() => {
    if (!user || contextOtherUserIds.length === 0) {
      setPartnerHabits([]);
      setPartnerEvents([]);
      setPartnerTasks([]);
      setPartnerWorkouts([]);
      return;
    }

    const loadPartnerData = async () => {
      try {
        // Load data for ALL other members in the group
        const allHabits: Habit[] = [];
        const allTasks: Task[] = [];
        const allEvents: ScheduledEvent[] = [];
        const allWorkouts: Workout[] = [];
        let totalWaterIntake = 0;
        let totalWaterGoal = 3;
        let waterCount = 0;
        const perUserWater = new Map<string, { intake: number; goal: number }>();

        for (const otherUserId of contextOtherUserIds) {
          // Other user's habits
          const { data: pHabits } = await supabase
            .from("habits")
            .select("*")
            .eq("user_id", otherUserId);

          const { data: pCompletions } = await supabase
            .from("habit_completions")
            .select("*")
            .eq("user_id", otherUserId);

          if (pHabits) {
            const completionMap = new Map<string, string[]>();
            (pCompletions || []).forEach((c: any) => {
              const dates = completionMap.get(c.habit_id) || [];
              dates.push(c.completed_date);
              completionMap.set(c.habit_id, dates);
            });

            const todayDate = todayStr();
            allHabits.push(...pHabits.map((h: any) => {
              const completionDates = completionMap.get(h.id) || [];
              return {
                id: h.id,
                label: h.label,
                category: h.category as string,
                done: completionDates.includes(todayDate),
                completionDates,
                hiddenFromPartner: h.hidden_from_partner || false,
                groupId: h.group_id || null,
                sharedGroupIds: h.shared_group_ids || [],
                ownerUserId: otherUserId,
              };
            }));
          }

          // Other user's tasks
          const { data: pTasks } = await supabase
            .from("tasks")
            .select("*")
            .eq("user_id", otherUserId);

          if (pTasks) {
            allTasks.push(...pTasks.map((t: any) => ({
              id: t.id,
              title: t.title,
              time: t.time || "",
              tag: t.tag as "Work" | "Personal" | "Household",
              assignee: toViewerPerspective(t.assignee as Assignee, false),
              done: t.done,
              completedAt: t.completed_at ?? null,
              completedBy: t.completed_by ?? null,
              updatedAt: t.updated_at ?? null,
              scheduledDay: t.scheduled_day,
              scheduledMonth: t.scheduled_month,
              scheduledYear: t.scheduled_year,
              hiddenFromPartner: t.hidden_from_partner || false,
              groupId: t.group_id || null,
              ownerUserId: otherUserId,
            })));
          }

          // Other user's events
          const { data: pEvents } = await supabase
            .from("events")
            .select("*")
            .eq("user_id", otherUserId);

          if (pEvents) {
            allEvents.push(...pEvents.map((e: any) => ({
              id: e.id,
              title: e.title,
              time: e.time || "",
              description: e.description,
              day: e.day,
              month: e.month,
              year: e.year,
              endDay: e.end_day ?? e.day,
              endMonth: e.end_month ?? e.month,
              endYear: e.end_year ?? e.year,
              endTime: e.end_time ?? "",
              allDay: e.all_day ?? false,
              user: toViewerPerspective(e.assignee as Assignee, false),
              done: e.done ?? false,
              completedAt: e.completed_at ?? null,
              completedBy: e.completed_by ?? null,
              updatedAt: e.updated_at ?? null,
              hiddenFromPartner: e.hidden_from_partner || false,
              groupId: e.group_id || null,
              ownerUserId: otherUserId,
            })));
          }

          // Other user's workouts
          const { data: pWorkouts } = await supabase
            .from("workouts")
            .select("*")
            .eq("user_id", otherUserId);

          if (pWorkouts) {
            allWorkouts.push(...pWorkouts.map((w: any) => mapWorkoutRow(w, otherUserId)));
          }

          // Other user's water tracking
          const { data: pWaterData } = await supabase
            .from("water_tracking")
            .select("*")
            .eq("user_id", otherUserId)
            .eq("date", todayStr())
            .maybeSingle();

          if (pWaterData) {
            totalWaterIntake += Number(pWaterData.intake);
            totalWaterGoal = Math.max(totalWaterGoal, Number(pWaterData.goal));
            waterCount++;
            perUserWater.set(otherUserId, { intake: Number(pWaterData.intake), goal: Number(pWaterData.goal) });
          } else {
            perUserWater.set(otherUserId, { intake: 0, goal: 3 });
          }
        }

        setPartnerHabits(allHabits);
        setPartnerTasks(allTasks);
        setPartnerEvents(allEvents);
        setPartnerWorkouts(allWorkouts);
        setPartnerWaterMap(perUserWater);

        // For water, use first partner's data for backward compat
        if (waterCount > 0) {
          setPartnerWaterIntake(totalWaterIntake);
          setPartnerWaterGoal(totalWaterGoal);
        } else {
          setPartnerWaterIntake(0);
          setPartnerWaterGoal(3);
        }
      } catch (err) {
        console.error("Error loading partner data:", err);
      }
    };

    loadPartnerData();
  }, [contextOtherUserIds.join(","), user]);

  // ── Realtime subscription for tasks/events/workouts (cross-user sync) ──
  useEffect(() => {
    if (!user) return;

    const otherIdsSet = new Set(contextOtherUserIds);

    const applyTaskUpdate = (row: any) => ({
      id: row.id,
      done: row.done,
      completedAt: row.completed_at ?? null,
      completedBy: row.completed_by ?? null,
      updatedAt: row.updated_at ?? null,
      time: row.time ?? "",
      assignee: row.assignee as "me" | "partner" | "both",
      scheduledDay: row.scheduled_day,
      scheduledMonth: row.scheduled_month,
      scheduledYear: row.scheduled_year,
      dueDate: row.due_date ?? null,
      priorNoticeDays: row.prior_notice_days ?? 0,
      hiddenFromPartner: row.hidden_from_partner || false,
      groupId: row.group_id || null,
      tag: row.tag as "Work" | "Personal" | "Household",
      title: row.title,
    });

    const applyEventUpdate = (row: any) => ({
      id: row.id,
      done: row.done ?? false,
      completedAt: row.completed_at ?? null,
      completedBy: row.completed_by ?? null,
      updatedAt: row.updated_at ?? null,
      title: row.title,
      time: row.time || "",
      description: row.description,
      day: row.day,
      month: row.month,
      year: row.year,
      endDay: row.end_day ?? row.day,
      endMonth: row.end_month ?? row.month,
      endYear: row.end_year ?? row.year,
      endTime: row.end_time ?? "",
      allDay: row.all_day ?? false,
      hiddenFromPartner: row.hidden_from_partner || false,
      groupId: row.group_id || null,
      user: row.assignee as "me" | "partner" | "both",
    });

    const applyWorkoutUpdate = (row: any) => ({
      id: row.id,
      title: row.title,
      duration: row.duration,
      cal: row.cal,
      tag: row.tag,
      emoji: row.emoji,
      done: row.done,
      scheduledDate: row.scheduled_date,
      completedDate: row.completed_date,
      exercises: row.exercises || [],
      hiddenFromPartner: row.hidden_from_partner || false,
      groupId: row.group_id || null,
    });

    const channel = supabase
      .channel("items-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks" },
        (payload) => {
          if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
            const row = payload.new as any;
            if (!row?.id || !row?.user_id) return;

            if (row.user_id === user.id) {
              const ownTask = applyTaskUpdate(row);
              setTasks((prev) => upsertById(prev, ownTask));
              setPartnerTasks((prev) => prev.filter((t) => t.id !== row.id));
              return;
            }

            if (otherIdsSet.has(row.user_id)) {
              const partnerTask = {
                ...applyTaskUpdate(row),
                assignee: toViewerPerspective(row.assignee as Assignee, false),
                ownerUserId: row.user_id,
              };
              setPartnerTasks((prev) => upsertById(prev, partnerTask));
              setTasks((prev) => prev.filter((t) => t.id !== row.id));
            }
          } else if (payload.eventType === "DELETE") {
            const deletedId = payload.old?.id;
            if (deletedId) {
              setTasks((prev) => prev.filter((t) => t.id !== deletedId));
              setPartnerTasks((prev) => prev.filter((t) => t.id !== deletedId));
            }
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "events" },
        (payload) => {
          if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
            const row = payload.new as any;
            if (!row?.id || !row?.user_id) return;

            if (row.user_id === user.id) {
              const ownEvent = applyEventUpdate(row);
              setEvents((prev) => upsertById(prev, ownEvent));
              setPartnerEvents((prev) => prev.filter((e) => e.id !== row.id));
              return;
            }

            if (otherIdsSet.has(row.user_id)) {
              const partnerEvent = {
                ...applyEventUpdate(row),
                user: toViewerPerspective(row.assignee as Assignee, false),
                ownerUserId: row.user_id,
              };
              setPartnerEvents((prev) => upsertById(prev, partnerEvent));
              setEvents((prev) => prev.filter((e) => e.id !== row.id));
            }
          } else if (payload.eventType === "DELETE") {
            const deletedId = payload.old?.id;
            if (deletedId) {
              setEvents((prev) => prev.filter((e) => e.id !== deletedId));
              setPartnerEvents((prev) => prev.filter((e) => e.id !== deletedId));
            }
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "workouts" },
        (payload) => {
          if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
            const row = payload.new as any;
            if (!row?.id || !row?.user_id) return;

            if (row.user_id === user.id) {
              const ownWorkout = applyWorkoutUpdate(row);
              setWorkoutsState((prev) => upsertById(prev, ownWorkout));
              setPartnerWorkouts((prev) => prev.filter((w) => w.id !== row.id));
              return;
            }

            if (otherIdsSet.has(row.user_id)) {
              const partnerWorkout = {
                ...applyWorkoutUpdate(row),
                ownerUserId: row.user_id,
              };
              setPartnerWorkouts((prev) => upsertById(prev, partnerWorkout));
              setWorkoutsState((prev) => prev.filter((w) => w.id !== row.id));
            }
          } else if (payload.eventType === "DELETE") {
            const deletedId = payload.old?.id;
            if (deletedId) {
              setWorkoutsState((prev) => prev.filter((w) => w.id !== deletedId));
              setPartnerWorkouts((prev) => prev.filter((w) => w.id !== deletedId));
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, contextOtherUserIds]);

  const toggleHabit = async (id: string) => {
    const dateKey = todayStr();
    const habit = habits.find((h) => h.id === id);
    if (!habit || !user) return;

    const wasDone = habit.completionDates.includes(dateKey);

    // Single record — update just this one habit
    setHabits((h) =>
      h.map((item) => {
        if (item.id !== id) return item;
        return {
          ...item,
          done: !wasDone,
          completionDates: wasDone
            ? item.completionDates.filter((d) => d !== dateKey)
            : [...item.completionDates, dateKey],
        };
      })
    );

    // Sync to database
    if (wasDone) {
      await supabase
        .from("habit_completions")
        .delete()
        .eq("habit_id", id)
        .eq("completed_date", dateKey);
    } else {
      await supabase
        .from("habit_completions")
        .insert({ habit_id: id, user_id: user.id, completed_date: dateKey });
    }
  };

  const addHabit = async (label: string, category: string, groupIds?: string[]) => {
    if (!user) return;
    // Single record with shared_group_ids
    const sharedGroupIds = groupIds && groupIds.length > 0 ? groupIds : [];
    const { data, error } = await supabase
      .from("habits")
      .insert({ user_id: user.id, label, category, group_id: null, shared_group_ids: sharedGroupIds } as any)
      .select()
      .single();

    if (data && !error) {
      setHabits((h) => [...h, {
        id: data.id,
        label,
        done: false,
        category,
        completionDates: [],
        groupId: null,
        sharedGroupIds: sharedGroupIds,
      }]);
    }
  };

  const renameHabitCategory = async (oldCategory: string, newCategory: string) => {
    if (!user || oldCategory === newCategory) return;
    // Update all habits with old category to new category
    const habitIds = habits.filter((h) => h.category === oldCategory).map((h) => h.id);
    if (habitIds.length === 0) return;
    await supabase.from("habits").update({ category: newCategory }).in("id", habitIds);
    setHabits((h) => h.map((item) => item.category === oldCategory ? { ...item, category: newCategory } : item));
  };

  const deleteHabitCategory = async (category: string) => {
    if (!user) return;
    const toDelete = habits.filter((h) => h.category === category);
    for (const h of toDelete) {
      await supabase.from("habit_completions").delete().eq("habit_id", h.id);
      await supabase.from("habits").delete().eq("id", h.id);
    }
    setHabits((h) => h.filter((item) => item.category !== category));
  };

  const removeHabit = async (id: string) => {
    setHabits((h) => h.filter((item) => item.id !== id));
    await supabase.from("habit_completions").delete().eq("habit_id", id);
    await supabase.from("habits").delete().eq("id", id);
  };

  const updateHabitLabel = async (id: string, newLabel: string) => {
    if (!user) return;
    setHabits((h) => h.map((item) => item.id === id ? { ...item, label: newLabel } : item));
    await supabase.from("habits").update({ label: newLabel }).eq("id", id);
  };

  const addSharedHabit = async (label: string, category: string) => {
    if (!user) return;
    const { data, error } = await supabase.rpc("create_shared_habit", {
      _label: label,
      _category: category,
    });

    if (error) {
      console.error("Error creating shared habit:", error);
      return;
    }

    const result = data as any;
    if (result?.error) {
      console.error("Shared habit error:", result.error);
      return;
    }

    // Add to own habits
    if (result?.my_habit_id) {
      setHabits((h) => [...h, { id: result.my_habit_id, label, done: false, category, completionDates: [] }]);
    }
    // Add to partner habits view
    if (result?.partner_habit_id) {
      setPartnerHabits((h) => [...h, { id: result.partner_habit_id, label, done: false, category, completionDates: [] }]);
    }
  };

  const addEvent = async (event: Omit<ScheduledEvent, "id">) => {
    if (!user) return;

    const normalizedTitle = event.title.trim().toLowerCase();
    const normalizedTime = (event.time || "All day").trim().toLowerCase();
    const duplicateInMemory = events.some((existing) =>
      existing.title.trim().toLowerCase() === normalizedTitle &&
      (existing.time || "All day").trim().toLowerCase() === normalizedTime &&
      existing.day === event.day &&
      existing.month === event.month &&
      existing.year === event.year &&
      existing.user === event.user
    );

    if (duplicateInMemory) return;

    const { data: existingRows } = await supabase
      .from("events")
      .select("id")
      .eq("user_id", user.id)
      .eq("title", event.title)
      .eq("time", event.time || "All day")
      .eq("day", event.day)
      .eq("month", event.month)
      .eq("year", event.year)
      .eq("assignee", event.user)
      .limit(1);

    if (existingRows && existingRows.length > 0) return;

    const groupId = resolvedGroupId;
    const isAllDay = event.allDay ?? (!event.time || event.time === "All day");
    const { data, error } = await supabase
      .from("events")
      .insert({
        user_id: user.id,
        title: event.title,
        time: isAllDay ? "All day" : (event.time || "All day"),
        description: event.description,
        day: event.day,
        month: event.month,
        year: event.year,
        end_day: event.endDay ?? event.day,
        end_month: event.endMonth ?? event.month,
        end_year: event.endYear ?? event.year,
        end_time: event.endTime ?? (isAllDay ? "" : (event.time || "")),
        all_day: isAllDay,
        assignee: event.user,
        done: false,
        completed_at: null,
        completed_by: null,
        group_id: groupId,
        calendar_id: event.calendarId || null,
      } as any)
      .select()
      .single();

    if (data && !error) {
      setEvents((e) => [...e, {
        ...event,
        time: isAllDay ? "All day" : (event.time || "All day"),
        id: data.id,
        groupId,
        done: false,
        completedAt: null,
        completedBy: null,
        updatedAt: data.updated_at ?? null,
        endDay: event.endDay ?? event.day,
        endMonth: event.endMonth ?? event.month,
        endYear: event.endYear ?? event.year,
        endTime: event.endTime ?? (isAllDay ? "" : (event.time || "")),
        allDay: isAllDay,
        calendarId: (data as any).calendar_id || event.calendarId || null,
      }]);
    }
  };

  const removeEvent = async (id: string) => {
    setEvents((e) => e.filter((item) => item.id !== id));
    await supabase.from("events").delete().eq("id", id);
  };

  const updateEvent = async (id: string, updates: Partial<Pick<ScheduledEvent, "title" | "time" | "endTime" | "day" | "month" | "year" | "endDay" | "endMonth" | "endYear" | "allDay" | "description">>) => {
    setEvents((e) => e.map((item) => item.id === id ? { ...item, ...updates } : item));
    const dbUpdates: any = {};
    if (updates.title !== undefined) dbUpdates.title = updates.title;
    if (updates.time !== undefined) dbUpdates.time = updates.time;
    if (updates.endTime !== undefined) dbUpdates.end_time = updates.endTime;
    if (updates.day !== undefined) dbUpdates.day = updates.day;
    if (updates.month !== undefined) dbUpdates.month = updates.month;
    if (updates.year !== undefined) dbUpdates.year = updates.year;
    if (updates.endDay !== undefined) dbUpdates.end_day = updates.endDay;
    if (updates.endMonth !== undefined) dbUpdates.end_month = updates.endMonth;
    if (updates.endYear !== undefined) dbUpdates.end_year = updates.endYear;
    if (updates.allDay !== undefined) dbUpdates.all_day = updates.allDay;
    if (updates.description !== undefined) dbUpdates.description = updates.description;
    await supabase.from("events").update(dbUpdates).eq("id", id);
  };

  const rescheduleEvent = async (id: string, day: number, month: number, year: number) => {
    setEvents((e) =>
      e.map((item) => item.id === id ? { ...item, day, month, year } : item)
    );
    await supabase.from("events").update({ day, month, year }).eq("id", id);
  };

  const applyTaskCompletionState = (taskId: string, done: boolean, completedAt: string | null, completedBy: string | null) => {
    setTasks((prev) => prev.map((item) => item.id === taskId ? { ...item, done, completedAt, completedBy } : item));
    setPartnerTasks((prev) => prev.map((item) => item.id === taskId ? { ...item, done, completedAt, completedBy } : item));
  };

  const applyEventCompletionState = (eventId: string, done: boolean, completedAt: string | null, completedBy: string | null) => {
    setEvents((prev) => prev.map((item) => item.id === eventId ? { ...item, done, completedAt, completedBy } : item));
    setPartnerEvents((prev) => prev.map((item) => item.id === eventId ? { ...item, done, completedAt, completedBy } : item));
  };

  const toggleTask = async (id: string) => {
    if (!user) return;
    const task = tasks.find((t) => t.id === id) || partnerTasks.find((t) => t.id === id);
    if (!task) return;

    const newDone = !task.done;
    const optimisticCompletedAt = newDone ? new Date().toISOString() : null;
    const optimisticCompletedBy = newDone ? user.id : null;
    applyTaskCompletionState(id, newDone, optimisticCompletedAt, optimisticCompletedBy);

    const { data, error } = await supabase.rpc("toggle_task_completion", {
      _task_id: id,
      _completed: newDone,
    });

    if (error) {
      console.error("Failed to persist task toggle:", error);
      applyTaskCompletionState(id, task.done, task.completedAt ?? null, task.completedBy ?? null);
      return;
    }

    if (data) {
      applyTaskCompletionState(id, data.done, data.completed_at ?? null, data.completed_by ?? null);
    }
  };

  const toggleEventCompletion = async (id: string) => {
    if (!user) return;
    const event = events.find((e) => e.id === id) || partnerEvents.find((e) => e.id === id);
    if (!event) return;

    const newDone = !event.done;
    const optimisticCompletedAt = newDone ? new Date().toISOString() : null;
    const optimisticCompletedBy = newDone ? user.id : null;
    applyEventCompletionState(id, newDone, optimisticCompletedAt, optimisticCompletedBy);

    const { data, error } = await supabase.rpc("toggle_event_completion", {
      _event_id: id,
      _completed: newDone,
    });

    if (error) {
      console.error("Failed to persist event toggle:", error);
      applyEventCompletionState(id, event.done ?? false, event.completedAt ?? null, event.completedBy ?? null);
      return;
    }

    if (data) {
      applyEventCompletionState(id, data.done ?? false, data.completed_at ?? null, data.completed_by ?? null);
    }
  };

  const addTask = async (task: Omit<Task, "id" | "done">) => {
    if (!user) return;
    const groupId = resolvedGroupId;
    const insertData: any = {
      user_id: user.id,
      title: task.title,
      time: task.time,
      tag: task.tag,
      assignee: task.assignee,
      done: false,
      completed_at: null,
      completed_by: null,
      scheduled_day: task.scheduledDay,
      scheduled_month: task.scheduledMonth,
      scheduled_year: task.scheduledYear,
      group_id: groupId,
    };
    if (task.dueDate !== undefined) insertData.due_date = task.dueDate;
    if (task.priorNoticeDays !== undefined) insertData.prior_notice_days = task.priorNoticeDays;

    const { data, error } = await supabase
      .from("tasks")
      .insert(insertData)
      .select()
      .single();

    if (data && !error) {
      setTasks((t) => [...t, {
        ...task,
        id: data.id,
        done: false,
        completedAt: null,
        completedBy: null,
        updatedAt: data.updated_at ?? null,
        dueDate: (data as any).due_date ?? null,
        priorNoticeDays: (data as any).prior_notice_days ?? 0,
        groupId,
      }]);
    }
  };

  const removeTask = async (id: string) => {
    setTasks((t) => t.filter((item) => item.id !== id));
    await supabase.from("tasks").delete().eq("id", id);
  };

  const updateTask = async (id: string, updates: Partial<Pick<Task, "title" | "tag" | "scheduledDay" | "scheduledMonth" | "scheduledYear" | "time" | "dueDate" | "priorNoticeDays">>) => {
    setTasks((t) => t.map((item) => (item.id === id ? { ...item, ...updates } : item)));
    const dbUpdates: any = {};
    if (updates.title !== undefined) dbUpdates.title = updates.title;
    if (updates.tag !== undefined) dbUpdates.tag = updates.tag;
    if (updates.scheduledDay !== undefined) dbUpdates.scheduled_day = updates.scheduledDay;
    if (updates.scheduledMonth !== undefined) dbUpdates.scheduled_month = updates.scheduledMonth;
    if (updates.scheduledYear !== undefined) dbUpdates.scheduled_year = updates.scheduledYear;
    if (updates.time !== undefined) dbUpdates.time = updates.time;
    if (updates.dueDate !== undefined) dbUpdates.due_date = updates.dueDate;
    if (updates.priorNoticeDays !== undefined) dbUpdates.prior_notice_days = updates.priorNoticeDays;
    await supabase.from("tasks").update(dbUpdates).eq("id", id);
  };

  const upsertWater = async (intake: number, goal: number) => {
    if (!user) return;
    await supabase
      .from("water_tracking")
      .upsert({
        user_id: user.id,
        date: todayStr(),
        intake,
        goal,
      }, { onConflict: "user_id,date" });
  };

  const setWaterIntake = (amount: number) => {
    const clamped = Math.max(0, Math.min(amount, waterGoal));
    setWaterIntakeState(clamped);
    upsertWater(clamped, waterGoal);
  };

  const resetWater = () => {
    setWaterIntakeState(0);
    upsertWater(0, waterGoal);
  };

  const setWaterGoal = (goal: number) => {
    setWaterGoalState(goal);
    upsertWater(waterIntake, goal);
  };

  const toggleWorkout = async (id: string) => {
    const workout = workouts.find((w) => w.id === id);
    if (!workout) return;

    const newDone = !workout.done;
    const effectiveDate = workout.scheduledDate || todayStr();

    // Find all linked workouts to sync completion
    const linkedIds = new Set<string>([id]);
    if (workout.linkedWorkoutId) {
      workouts.forEach((w) => {
        if (w.linkedWorkoutId === workout.linkedWorkoutId) {
          linkedIds.add(w.id);
        }
      });
    }

    setWorkoutsState((w) =>
      w.map((item) =>
        linkedIds.has(item.id)
          ? { ...item, done: newDone, completedDate: newDone ? (item.scheduledDate || effectiveDate) : undefined }
          : item
      )
    );

    // Update all linked workouts in DB
    for (const wid of linkedIds) {
      const linkedW = workouts.find((w) => w.id === wid);
      const linkedDate = linkedW?.scheduledDate || effectiveDate;
      await supabase.from("workouts").update({
        done: newDone,
        completed_date: newDone ? linkedDate : null,
      }).eq("id", wid);
    }
  };

  const removeWorkout = async (id: string) => {
    setWorkoutsState((w) => w.filter((item) => item.id !== id));
    await supabase.from("workouts").delete().eq("id", id);
  };

  const removeWorkoutsByFilter = async (filter: "all" | "week" | "month" | "date", date?: string): Promise<number> => {
    if (!user) return 0;
    const today = todayStr();
    // Base: only incomplete workouts scheduled today or in the future (never past completed ones)
    const eligible = workouts.filter((w) => !w.done && w.scheduledDate && w.scheduledDate >= today);
    let toRemove: Workout[] = [];

    if (filter === "all") {
      toRemove = eligible;
    } else if (filter === "date" && date) {
      toRemove = eligible.filter((w) => w.scheduledDate === date);
    } else if (filter === "week") {
      const end = new Date();
      end.setDate(end.getDate() + 7);
      const endStr = fmtDateCtx(end);
      toRemove = eligible.filter((w) => w.scheduledDate! <= endStr);
    } else if (filter === "month") {
      const end = new Date();
      end.setDate(end.getDate() + 30);
      const endStr = fmtDateCtx(end);
      toRemove = eligible.filter((w) => w.scheduledDate! <= endStr);
    }

    if (toRemove.length === 0) return 0;
    const ids = toRemove.map((w) => w.id);
    setWorkoutsState((w) => w.filter((item) => !ids.includes(item.id)));
    for (const id of ids) {
      await supabase.from("workouts").delete().eq("id", id);
    }
    return ids.length;
  };

  const updateWorkout = async (id: string, updates: Partial<Workout>) => {
    setWorkoutsState((w) =>
      w.map((item) => (item.id === id ? { ...item, ...updates } : item))
    );
    const dbUpdates: any = {};
    if (updates.title !== undefined) dbUpdates.title = updates.title;
    if (updates.exercises !== undefined) dbUpdates.exercises = updates.exercises;
    if (updates.duration !== undefined) dbUpdates.duration = updates.duration;
    if (updates.cal !== undefined) dbUpdates.cal = updates.cal;
    if (updates.tag !== undefined) dbUpdates.tag = updates.tag;
    if (updates.emoji !== undefined) dbUpdates.emoji = updates.emoji;
    if (updates.distance !== undefined) dbUpdates.distance = updates.distance;
    if (updates.distanceUnit !== undefined) dbUpdates.distance_unit = updates.distanceUnit;
    if (updates.heartRateAvg !== undefined) dbUpdates.heart_rate_avg = updates.heartRateAvg;
    if (updates.paceAvg !== undefined) dbUpdates.pace_avg = updates.paceAvg;
    if (updates.speedAvg !== undefined) dbUpdates.speed_avg = updates.speedAvg;
    if (updates.elevationGain !== undefined) dbUpdates.elevation_gain = updates.elevationGain;
    if (updates.cadenceAvg !== undefined) dbUpdates.cadence_avg = updates.cadenceAvg;
    if (updates.sourceApp !== undefined) dbUpdates.source_app = updates.sourceApp;
    if (updates.sourceDevice !== undefined) dbUpdates.source_device = updates.sourceDevice;
    if (updates.completionPhotoUrl !== undefined) dbUpdates.completion_photo_url = updates.completionPhotoUrl;
    if (Object.keys(dbUpdates).length > 0) {
      await supabase.from("workouts").update(dbUpdates).eq("id", id);
    }
  };

  const setWorkouts = (newWorkouts: Workout[]) => {
    setWorkoutsState(newWorkouts);
  };

  const addWorkouts = async (newWorkouts: Workout[]) => {
    if (!user || newWorkouts.length === 0) return;

    const now = Date.now();
    const optimisticWorkouts: Workout[] = newWorkouts.map((w, index) => ({
      ...w,
      id: w.id || `temp-workout-${now}-${index}`,
      groupId: 'groupId' in w ? w.groupId : resolvedGroupId,
      hiddenFromPartner: w.hiddenFromPartner ?? false,
    }));
    const tempIds = new Set(optimisticWorkouts.map((w) => w.id));

    setWorkoutsState((prev) => [...prev, ...optimisticWorkouts]);

    const rows = optimisticWorkouts.map((w) => ({
      user_id: user.id,
      title: w.title,
      duration: w.duration,
      cal: w.cal,
      tag: w.tag,
      emoji: w.emoji,
      done: w.done,
      scheduled_date: w.scheduledDate || null,
      completed_date: w.completedDate || null,
      exercises: w.exercises || [],
      hidden_from_partner: w.hiddenFromPartner ?? false,
      group_id: w.groupId ?? null,
      distance: w.distance || 0,
      distance_unit: w.distanceUnit || 'km',
      heart_rate_avg: w.heartRateAvg ?? null,
      pace_avg: w.paceAvg ?? null,
      speed_avg: w.speedAvg ?? null,
      elevation_gain: w.elevationGain ?? null,
      cadence_avg: w.cadenceAvg ?? null,
      source_app: w.sourceApp ?? null,
      source_device: w.sourceDevice ?? null,
      route_data: w.routeData ?? null,
      linked_workout_id: w.linkedWorkoutId ?? null,
    }));

    const { data, error } = await supabase
      .from("workouts")
      .insert(rows)
      .select();

    if (error || !data) {
      console.error("Error saving workouts:", error);
      setWorkoutsState((prev) => prev.filter((item) => !tempIds.has(item.id)));
      return;
    }

    const mapped: Workout[] = data.map((w: any) => mapWorkoutRow(w, user.id));

    setWorkoutsState((prev) => [
      ...prev.filter((item) => !tempIds.has(item.id)),
      ...mapped,
    ]);
  };

  const rescheduleWorkout = async (id: string, newDate: string) => {
    setWorkoutsState((w) =>
      w.map((item) =>
        item.id === id ? { ...item, scheduledDate: newDate } : item
      )
    );
    await supabase.from("workouts").update({ scheduled_date: newDate }).eq("id", id);
  };

  const rescheduleWorkoutCascade = async (id: string, newDate: string, shiftFollowing: boolean) => {
    const workout = workouts.find((w) => w.id === id);
    if (!workout?.scheduledDate) {
      await rescheduleWorkout(id, newDate);
      return;
    }

    const oldDate = workout.scheduledDate;
    const oldMs = new Date(oldDate + "T00:00:00").getTime();
    const newMs = new Date(newDate + "T00:00:00").getTime();
    const diffDays = Math.round((newMs - oldMs) / (1000 * 60 * 60 * 24));

    if (!shiftFollowing || diffDays === 0) {
      await rescheduleWorkout(id, newDate);
      return;
    }

    // Find all future workouts after oldDate (including the target) that are not done
    const toShift = workouts.filter(
      (w) => w.scheduledDate && w.scheduledDate >= oldDate && !w.done && w.id !== id
    );

    // Shift the target workout
    const updates: { id: string; newDate: string }[] = [{ id, newDate }];

    for (const w of toShift) {
      const d = new Date(w.scheduledDate! + "T00:00:00");
      d.setDate(d.getDate() + diffDays);
      const shifted = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      updates.push({ id: w.id, newDate: shifted });
    }

    // Optimistic update
    setWorkoutsState((prev) => {
      const map = new Map(updates.map((u) => [u.id, u.newDate]));
      return prev.map((w) => map.has(w.id) ? { ...w, scheduledDate: map.get(w.id)! } : w);
    });

    // Persist all
    await Promise.all(
      updates.map((u) =>
        supabase.from("workouts").update({ scheduled_date: u.newDate }).eq("id", u.id)
      )
    );
  };

  const getHabitStreak = useCallback((id: string) => {
    const habit = habits.find((h) => h.id === id);
    if (!habit) return 0;
    const sorted = [...habit.completionDates].sort().reverse();
    if (sorted.length === 0) return 0;

    let streak = 0;
    const d = new Date();
    for (let i = 0; i < 365; i++) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (sorted.includes(key)) {
        streak++;
      } else if (i > 0) {
        break;
      }
      d.setDate(d.getDate() - 1);
    }
    return streak;
  }, [habits]);

  const getPartnerHabitStreak = useCallback((id: string) => {
    const habit = partnerHabits.find((h) => h.id === id);
    if (!habit) return 0;
    const sorted = [...habit.completionDates].sort().reverse();
    if (sorted.length === 0) return 0;

    let streak = 0;
    const d = new Date();
    for (let i = 0; i < 365; i++) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (sorted.includes(key)) {
        streak++;
      } else if (i > 0) {
        break;
      }
      d.setDate(d.getDate() - 1);
    }
    return streak;
  }, [partnerHabits]);

  const getHabitsForDate = useCallback((date: string) => {
    return habits.map((h) => ({
      ...h,
      done: h.completionDates.includes(date),
    }));
  }, [habits]);

  const getPartnerHabitsForDate = useCallback((date: string) => {
    let scoped: Habit[];
    if (activeGroup) {
      scoped = partnerHabits.filter((h) => (h.sharedGroupIds || []).includes(activeGroup.id));
    } else {
      // "All" view — only show partner habits shared with at least one group the user is in
      const userGroupIds = new Set(groups.filter(g => g.shared_pages?.includes("habits")).map(g => g.id));
      scoped = partnerHabits.filter((h) => (h.sharedGroupIds || []).some(gid => userGroupIds.has(gid)));
    }
    return scoped.map((h) => ({
      ...h,
      done: h.completionDates.includes(date),
    }));
  }, [activeGroup, partnerHabits, groups]);

  const getWorkoutsForDate = useCallback((date: string) => {
    return workouts.filter((w) => w.scheduledDate === date);
  }, [workouts]);

  const getPartnerWorkoutsForDate = useCallback((date: string) => {
    let scoped: Workout[];
    if (activeGroup) {
      scoped = partnerWorkouts.filter((w) => w.groupId === activeGroup.id);
    } else {
      // "All" view — only show partner workouts from shared groups
      const userGroupIds = new Set(groups.filter(g => g.shared_pages?.includes("workout")).map(g => g.id));
      scoped = partnerWorkouts.filter((w) => w.groupId && userGroupIds.has(w.groupId));
    }
    return scoped.filter((w) => w.scheduledDate === date);
  }, [activeGroup, partnerWorkouts, groups]);

  // Group-filtered data
  const filterByGroup = useCallback(<T extends { groupId?: string | null }>(items: T[]): T[] => {
    if (!activeGroup) return items; // "All" mode — show everything
    if ((activeGroup as any)?._personal) {
      // Personal mode — only items with no group
      return items.filter((item) => !item.groupId);
    }
    return items.filter((item) => item.groupId === activeGroup.id);
  }, [activeGroup]);

  // Filter habits based on active group context using shared_group_ids
  // In group mode, show ALL user's own habits (they're always personal) plus any shared with this group
  const filteredHabits = useMemo(() => {
    if (!activeGroup) return habits; // "All" view — show everything
    if ((activeGroup as any)?._personal) {
      // Personal mode — show all user's habits (they all belong to personal)
      return habits;
    }
    // Group mode — show all user's own habits (since personal is always included)
    // This ensures "Mine" pill shows the user's habits even in a group view
    return habits;
  }, [habits, activeGroup]);
  const filteredEvents = useMemo(() => filterByGroup(events), [events, filterByGroup]);
  const filteredTasks = useMemo(() => filterByGroup(tasks), [tasks, filterByGroup]);
  const filteredWorkoutsRaw = useMemo(() => filterByGroup(workouts), [workouts, filterByGroup]);
  // Deduplicate linked workouts in "All" view (activeGroup === null)
  const filteredWorkouts = useMemo(() => {
    if (activeGroup !== null) return filteredWorkoutsRaw;
    const seen = new Set<string>();
    return filteredWorkoutsRaw.filter((w) => {
      if (!w.linkedWorkoutId) return true;
      if (seen.has(w.linkedWorkoutId)) return false;
      seen.add(w.linkedWorkoutId);
      return true;
    });
  }, [filteredWorkoutsRaw, activeGroup]);

  // Group-filtered partner data — applies the same activeGroup filter so cross-user views are consistent
  const filteredPartnerHabits = useMemo(() => {
    if ((activeGroup as any)?._personal) return []; // Personal mode — no partners
    if (!activeGroup) {
      // "All" view — only show partner habits that are shared with at least one group the user is in
      const userGroupIds = new Set(groups.filter(g => g.shared_pages?.includes("habits")).map(g => g.id));
      return partnerHabits.filter((h) => (h.sharedGroupIds || []).some(gid => userGroupIds.has(gid)));
    }
    // Group mode — show partner habits shared with this group
    return partnerHabits.filter((h) => (h.sharedGroupIds || []).includes(activeGroup.id));
  }, [partnerHabits, activeGroup, groups]);
  const filteredPartnerEvents = useMemo(() => filterByGroup(partnerEvents), [partnerEvents, filterByGroup]);
  const filteredPartnerTasks = useMemo(() => filterByGroup(partnerTasks), [partnerTasks, filterByGroup]);
  const filteredPartnerWorkouts = useMemo(() => {
    if ((activeGroup as any)?._personal) return []; // Personal mode — no partners
    if (!activeGroup) {
      // "All" view — only show partner workouts from groups the user is in
      const userGroupIds = new Set(groups.filter(g => g.shared_pages?.includes("workout")).map(g => g.id));
      const filtered = partnerWorkouts.filter((w) => w.groupId && userGroupIds.has(w.groupId));
      // Deduplicate by linkedWorkoutId
      const seen = new Set<string>();
      return filtered.filter((w) => {
        if (!w.linkedWorkoutId) return true;
        if (seen.has(w.linkedWorkoutId)) return false;
        seen.add(w.linkedWorkoutId);
        return true;
      });
    }
    // Group mode
    return partnerWorkouts.filter((w) => w.groupId === activeGroup.id);
  }, [partnerWorkouts, activeGroup, groups]);

  const hideGcalEvent = async (eventId: string) => {
    if (!user) return;
    // Remove from local state immediately
    setGoogleCalendarEvents((prev) => prev.filter((e) => e.id !== eventId));
    await supabase.from("hidden_gcal_events").upsert({
      user_id: user.id,
      gcal_event_id: eventId,
      group_id: resolvedGroupId,
    }, { onConflict: "user_id,gcal_event_id" });
  };

  const toggleEventVisibility = async (eventId: string) => {
    if (!user) return;
    const event = events.find((e) => e.id === eventId);
    if (!event) return;
    const newHidden = !event.hiddenFromPartner;
    setEvents((prev) =>
      prev.map((e) => e.id === eventId ? { ...e, hiddenFromPartner: newHidden } : e)
    );
    await supabase.from("events").update({ hidden_from_partner: newHidden }).eq("id", eventId);
  };

  const designateGcalEvent = async (eventId: string, assignee: "me" | "partner" | "both") => {
    if (!user) return;
    setGoogleCalendarEvents((prev) =>
      prev.map((e) => e.id === eventId ? { ...e, assignee } : e)
    );
    await supabase.from("gcal_event_designations").upsert({
      user_id: user.id,
      gcal_event_id: eventId,
      assignee,
    }, { onConflict: "user_id,gcal_event_id" });
  };

  const toggleGcalCompletion = async (eventId: string) => {
    if (!user) return;
    const ge = googleCalendarEvents.find((e) => e.id === eventId);
    if (!ge) return;
    const newDone = !ge.done;

    // Optimistic update
    setGoogleCalendarEvents((prev) =>
      prev.map((e) => e.id === eventId ? {
        ...e,
        done: newDone,
        completedAt: newDone ? new Date().toISOString() : null,
        completedBy: newDone ? user.id : null,
      } : e)
    );

    const { error } = await supabase.from("gcal_event_completions" as any).upsert({
      user_id: user.id,
      gcal_event_id: eventId,
      group_id: resolvedGroupId,
      done: newDone,
      completed_at: newDone ? new Date().toISOString() : null,
      completed_by: newDone ? user.id : null,
    }, { onConflict: "user_id,gcal_event_id" });

    if (error) {
      console.error("Failed to toggle gcal completion:", error);
      // Rollback
      setGoogleCalendarEvents((prev) =>
        prev.map((e) => e.id === eventId ? { ...e, done: ge.done, completedAt: ge.completedAt, completedBy: ge.completedBy } : e)
      );
    }
  };

  return (
    <AppContext.Provider value={{
      habits, filteredHabits, toggleHabit, addHabit, removeHabit, updateHabitLabel, addSharedHabit, renameHabitCategory, deleteHabitCategory,
      habitSections: habitSectionsState, addHabitSection, renameHabitSection: renameHabitSectionFn, deleteHabitSection: deleteHabitSectionFn, refreshHabitSections,
      events, filteredEvents, addEvent, removeEvent, updateEvent, rescheduleEvent, toggleEventCompletion,
      tasks, filteredTasks, toggleTask, addTask, removeTask, updateTask,
      waterIntake, waterGoal, setWaterIntake, setWaterGoal, resetWater,
      partnerWaterIntake, partnerWaterGoal, partnerWaterMap,
      workouts, filteredWorkouts, toggleWorkout, removeWorkout, removeWorkoutsByFilter, updateWorkout, setWorkouts, addWorkouts, rescheduleWorkout, rescheduleWorkoutCascade,
      getHabitStreak, getHabitsForDate, getWorkoutsForDate,
      googleCalendarEvents, hideGcalEvent, toggleGcalCompletion, toggleEventVisibility, designateGcalEvent,
      partnerHabits, partnerEvents, partnerTasks, partnerWorkouts,
      filteredPartnerHabits, filteredPartnerEvents, filteredPartnerTasks, filteredPartnerWorkouts,
      getPartnerWorkoutsForDate, getPartnerHabitsForDate, getPartnerHabitStreak,
      refreshData: () => setRefreshCounter((c) => c + 1),
      loading,
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error("useAppContext must be used within AppProvider");
  return context;
};
