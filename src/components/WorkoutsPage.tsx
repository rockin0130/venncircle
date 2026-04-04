import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Clock, Flame, Check, Trash2, ChevronDown, ChevronUp, Loader2, X, Dumbbell, AlertTriangle, Target, ArrowRight, RotateCcw, Calendar as CalIcon, Plus, Pencil, Settings, Heart, Gauge, Mountain, Footprints, Smartphone, ImageIcon, History, CloudDownload, Bell } from "lucide-react";
import CustomWorkoutBuilder from "@/components/CustomWorkoutBuilder";
import WorkoutStatsCards from "@/components/WorkoutStatsCards";
import WorkoutAiSuggest from "@/components/WorkoutAiSuggest";
import GroupBadge from "@/components/GroupBadge";
import { useAppContext, Workout, isCardioWorkout } from "@/context/AppContext";
import WorkoutDetailModal from "@/components/WorkoutDetailModal";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import CongratsPopup from "@/components/CongratsPopup";
import PageGroupSelector from "@/components/PageGroupSelector";

import WorkoutPhotoPrompt, { isWorkoutPhotoPromptSuppressed } from "@/components/WorkoutPhotoPrompt";
import ExerciseHistoryPage from "@/components/ExerciseHistoryPage";
import ExerciseLibrarySheet from "@/components/ExerciseLibrarySheet";
import WorkoutUserFilter, { EVERYONE_SENTINEL } from "@/components/WorkoutUserFilter";
import { type UserWorkoutData } from "@/components/WorkoutStatsCards";
import { type GroupMember } from "@/context/AuthContext";

interface AIPlan {
  title: string;
  emoji: string;
  duration: string;
  cal: number;
  tag: string;
  exercises: { name: string; sets: number; reps: string }[];
}

interface AIDayPlan {
  date: string;
  dayLabel: string;
  isRest: boolean;
  workout?: AIPlan;
}

interface ExerciseDetail {
  steps: string[];
  formCues: string[];
  commonMistakes: string[];
  musclesWorked: string[];
  videoSearchQuery?: string;
}

const fmtDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const todayStr = () => fmtDate(new Date());

const MANUAL_ACTIVITIES = [
  { emoji: "🏃", title: "Running", tag: "Cardio", defaultDuration: "30 min", defaultCal: 300 },
  { emoji: "🧘", title: "Yoga", tag: "Flexibility", defaultDuration: "45 min", defaultCal: 200 },
  { emoji: "🚴", title: "Cycling", tag: "Cardio", defaultDuration: "40 min", defaultCal: 350 },
  { emoji: "🏊", title: "Swimming", tag: "Full Body", defaultDuration: "30 min", defaultCal: 400 },
  { emoji: "🚶", title: "Walking", tag: "Cardio", defaultDuration: "30 min", defaultCal: 150 },
  { emoji: "🤸", title: "Stretching", tag: "Flexibility", defaultDuration: "15 min", defaultCal: 50 },
  { emoji: "🥊", title: "Boxing", tag: "Cardio", defaultDuration: "30 min", defaultCal: 350 },
  { emoji: "⚽", title: "Sports", tag: "Full Body", defaultDuration: "60 min", defaultCal: 500 },
];

// Detect delete/management intent from natural language
function detectManagementIntent(prompt: string): { type: "delete"; filter: "all" | "week" | "month" | "date" | "tomorrow"; } | null {
  const lower = prompt.toLowerCase().trim();
  const deletePatterns = /\b(delete|remove|clear|wipe|erase|get rid of|cancel)\b/;
  if (!deletePatterns.test(lower)) return null;

  if (/\b(all|every|everything)\b/.test(lower)) return { type: "delete", filter: "all" };
  if (/\b(month|monthly|30.day|4.week)\b/.test(lower)) return { type: "delete", filter: "month" };
  if (/\b(week|weekly|7.day|this week|next week)\b/.test(lower)) return { type: "delete", filter: "week" };
  if (/\btomorrow\b/.test(lower)) return { type: "delete", filter: "tomorrow" };
  // Default broad delete = all
  return { type: "delete", filter: "all" };
}

const DEFAULT_QUICK_ADD_ORDER = ["Running", "Walking", "Cycling", "Yoga", "Swimming", "Stretching", "Boxing", "Sports"];

const SmartQuickAdd = ({ workouts, onAddActivity, onOpenCustomBuilder, onAddWorkouts, selectedDate }: {
  workouts: Workout[]; onAddActivity: (a: typeof MANUAL_ACTIVITIES[0]) => void; onOpenCustomBuilder: () => void; onAddWorkouts: (w: Workout[]) => void; selectedDate: string;
}) => {
  const [showLibrary, setShowLibrary] = useState(false);

  const { allItems, rankedItems } = useMemo(() => {
    const now = Date.now();
    const scores = new Map<string, { freq: number; recency: number }>();
    for (const w of workouts) {
      if (!w.done) continue;
      const prev = scores.get(w.title) || { freq: 0, recency: 0 };
      prev.freq += 1;
      const ct = w.completedDate ? new Date(w.completedDate + "T00:00:00").getTime() : (w.scheduledDate ? new Date(w.scheduledDate + "T00:00:00").getTime() : now);
      prev.recency = Math.max(prev.recency, 10 / Math.max(1, (now - ct) / 86400000));
      scores.set(w.title, prev);
    }
    type QuickItem = { type: "activity"; data: typeof MANUAL_ACTIVITIES[0]; score: number } | { type: "template"; title: string; emoji: string; exercises: { name: string; sets: number; reps: string }[]; tag: string; duration: string; cal: number; score: number };
    const items: QuickItem[] = [];
    for (const act of MANUAL_ACTIVITIES) {
      const s = scores.get(act.title);
      items.push({ type: "activity", data: act, score: s ? s.freq * 3 + s.recency * 2 : 0 });
    }
    const tplMap = new Map<string, { workout: Workout; freq: number; recency: number }>();
    for (const w of workouts) {
      if (!w.exercises || w.exercises.length === 0 || !w.done) continue;
      if (MANUAL_ACTIVITIES.some(a => a.title === w.title)) continue;
      const prev = tplMap.get(w.title);
      const ds = Math.max(1, (now - (w.completedDate ? new Date(w.completedDate + "T00:00:00").getTime() : now)) / 86400000);
      const rs = 10 / ds;
      if (!prev || rs > prev.recency) tplMap.set(w.title, { workout: w, freq: (prev?.freq || 0) + 1, recency: Math.max(prev?.recency || 0, rs) });
      else { prev.freq += 1; tplMap.set(w.title, prev); }
    }
    for (const [title, d] of tplMap) {
      items.push({ type: "template", title, emoji: d.workout.emoji, exercises: d.workout.exercises!, tag: d.workout.tag, duration: d.workout.duration, cal: d.workout.cal, score: d.freq * 3 + d.recency * 2 });
    }
    items.sort((a, b) => b.score !== a.score ? b.score - a.score : (a.type === "activity" && b.type === "activity" ? DEFAULT_QUICK_ADD_ORDER.indexOf(a.data.title) - DEFAULT_QUICK_ADD_ORDER.indexOf(b.data.title) : 0));
    return { allItems: items, rankedItems: items.slice(0, 8) };
  }, [workouts]);

  const handleAddTemplate = (item: { title: string; emoji: string; exercises: { name: string; sets: number; reps: string }[]; tag: string; duration: string; cal: number }) => {
    onAddWorkouts([{ id: Date.now().toString() + Math.random().toString(36).slice(2, 6), title: item.title, duration: item.duration, cal: item.cal, tag: item.tag, emoji: item.emoji, done: false, scheduledDate: selectedDate, exercises: [...item.exercises] }]);
    toast.success(`Added ${item.title}`);
  };

  const handleAddFromLibrary = (item: typeof allItems[0]) => {
    if (item.type === "activity") onAddActivity(item.data);
    else handleAddTemplate(item);
    setShowLibrary(false);
  };

  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Quick Add</h3>
        <button onClick={onOpenCustomBuilder} className="text-xs text-primary font-semibold flex items-center gap-1"><Plus size={12} /> Custom</button>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {rankedItems.map((item) =>
          item.type === "activity" ? (
            <button key={item.data.title} onClick={() => onAddActivity(item.data)} className="flex flex-col items-center min-w-[72px] p-3 rounded-xl bg-card border border-border hover:border-primary/50 transition-all active:scale-[0.97]">
              <span className="text-2xl mb-1">{item.data.emoji}</span>
              <span className="text-[11px] font-medium text-center">{item.data.title}</span>
            </button>
          ) : (
            <button key={item.title} onClick={() => handleAddTemplate(item)} className="flex flex-col items-center min-w-[72px] p-3 rounded-xl bg-card border border-border hover:border-primary/50 transition-all active:scale-[0.97]">
              <span className="text-2xl mb-1">{item.emoji}</span>
              <span className="text-[11px] font-medium text-center leading-tight max-w-[68px] truncate">{item.title}</span>
              {item.exercises && <span className="text-[9px] text-muted-foreground mt-0.5">{item.exercises.length} ex</span>}
            </button>
          )
        )}
        {/* See More card */}
        <button
          onClick={() => setShowLibrary(true)}
          className="flex flex-col items-center justify-center min-w-[72px] p-3 rounded-xl bg-secondary/60 border border-border hover:border-primary/50 transition-all active:scale-[0.97]"
        >
          <span className="w-8 h-8 rounded-full bg-muted flex items-center justify-center mb-1">
            <ChevronDown size={16} className="text-muted-foreground rotate-[-90deg]" />
          </span>
          <span className="text-[11px] font-medium text-muted-foreground">See More</span>
        </button>
      </div>

      {/* Full workout library sheet */}
      <Sheet open={showLibrary} onOpenChange={setShowLibrary}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-8 px-4 pt-4 max-h-[75vh]">
          <SheetHeader className="pb-3">
            <SheetTitle className="text-base font-bold text-foreground">All Workouts</SheetTitle>
          </SheetHeader>
          <ScrollArea className="h-[55vh]">
            <div className="space-y-2 pr-2">
              {allItems.map((item) => (
                <button
                  key={item.type === "activity" ? item.data.title : item.title}
                  onClick={() => handleAddFromLibrary(item)}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-secondary/60 transition-all text-left"
                >
                  <span className="text-2xl flex-shrink-0">{item.type === "activity" ? item.data.emoji : item.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{item.type === "activity" ? item.data.title : item.title}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {item.type === "activity" ? item.data.tag : `${item.exercises.length} exercises · ${item.tag}`}
                    </p>
                  </div>
                  <Plus size={16} className="text-muted-foreground flex-shrink-0" />
                </button>
              ))}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </div>
  );
};

const WorkoutsPage = ({ onOpenSettings }: { onOpenSettings?: () => void } = {}) => {
  const { workouts, filteredWorkouts, filteredPartnerWorkouts, toggleWorkout, removeWorkout, removeWorkoutsByFilter, updateWorkout, setWorkouts, addWorkouts, rescheduleWorkout, rescheduleWorkoutCascade } = useAppContext();
  const { user, profile, activeGroup, groups } = useAuth();
  const [showCongrats, setShowCongrats] = useState(false);
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);
  const [showCustomBuilder, setShowCustomBuilder] = useState(false);
  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<{ filter: "all" | "week" | "month" | "date" | "tomorrow"; message: string } | null>(null);
  const [exerciseDeleteConfirm, setExerciseDeleteConfirm] = useState<{ workoutId: string; index: number; exerciseName: string } | null>(null);
  // Exercise editing
  const [editingWorkout, setEditingWorkout] = useState<{ workoutId: string; exerciseIndex: number } | null>(null);
  const [editExName, setEditExName] = useState("");
  const [editExSets, setEditExSets] = useState("");
  const [editExReps, setEditExReps] = useState("");
  // Exercise logging
  const [loggingWorkout, setLoggingWorkout] = useState<Workout | null>(null);
  // Photo sharing prompt
  const [photoPromptWorkout, setPhotoPromptWorkout] = useState<Workout | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  // Nudge cooldown
  const [nudgeCooldown, setNudgeCooldown] = useState<Set<string>>(new Set());

  // Check for incoming nudges on mount
  useEffect(() => {
    if (!user) return;
    const checkNudges = async () => {
      const { data } = await supabase
        .from("nudges")
        .select("*, from_profiles:profiles!nudges_from_user_id_fkey(display_name)")
        .eq("to_user_id", user.id)
        .eq("seen", false)
        .is("habit_id", null);

      if (data && data.length > 0) {
        for (const nudge of data) {
          const fromName = (nudge as any).from_profiles?.display_name || "Someone";
          toast.info(`🔔 ${fromName} nudged you to work out!`, {
            description: nudge.message,
            duration: 5000,
          });
        }
        const ids = data.map((n: any) => n.id);
        await supabase.from("nudges").update({ seen: true }).in("id", ids);
      }
    };
    checkNudges();
  }, [user]);

  const sendWorkoutNudge = async (targetUserId: string, targetName: string) => {
    if (!user || nudgeCooldown.has(targetUserId)) return;
    const { error } = await supabase.from("nudges").insert({
      from_user_id: user.id,
      to_user_id: targetUserId,
      message: `Time to get moving! 💪`,
    });
    if (!error) {
      toast.success(`${targetName} has been nudged! 💪`);
      setNudgeCooldown(prev => new Set(prev).add(targetUserId));
      setTimeout(() => {
        setNudgeCooldown(prev => {
          const next = new Set(prev);
          next.delete(targetUserId);
          return next;
        });
      }, 10000);
    } else {
      toast.error("Couldn't send nudge");
    }
  };

  // Per-context user filter state (independent per group/view)
  const [userFilterMap, setUserFilterMap] = useState<Record<string, Set<string>>>({});
  const contextKey = useMemo(() => {
    if (!activeGroup) return "__all__";
    if ((activeGroup as any)?._personal) return "__personal__";
    return activeGroup.id;
  }, [activeGroup]);

  const userFilterIds = useMemo(() => userFilterMap[contextKey] ?? new Set([EVERYONE_SENTINEL]), [userFilterMap, contextKey]);
  const setUserFilterIds = useCallback((ids: Set<string>) => {
    setUserFilterMap((prev) => ({ ...prev, [contextKey]: ids }));
  }, [contextKey]);

  // Reset filter when context changes to ensure fresh Everyone default
  useEffect(() => {
    if (!userFilterMap[contextKey]) {
      setUserFilterMap((prev) => ({ ...prev, [contextKey]: new Set([EVERYONE_SENTINEL]) }));
    }
  }, [contextKey]);

  const isPersonalView = (activeGroup as any)?._personal === true;
  const isAllView = activeGroup === null && !isPersonalView;
  const isGroupView = !!activeGroup && !isPersonalView;

  // Combine own + partner workouts into a single list, then apply user filter
  const allContextWorkouts = useMemo(() => {
    if (isPersonalView) return filteredWorkouts; // Personal = only own, no partners
    // Merge own + partner workouts, deduplicate by id
    const combined = [...filteredWorkouts];
    const ids = new Set(combined.map(w => w.id));
    for (const pw of filteredPartnerWorkouts) {
      if (!ids.has(pw.id)) {
        combined.push(pw);
        ids.add(pw.id);
      }
    }
    return combined;
  }, [filteredWorkouts, filteredPartnerWorkouts, isPersonalView]);

  // Apply user filter pills
  const userFilteredWorkouts = useMemo(() => {
    if (isPersonalView) return filteredWorkouts;
    if (userFilterIds.has(EVERYONE_SENTINEL)) return allContextWorkouts;
    return allContextWorkouts.filter((w) => {
      const ownerId = w.ownerUserId || user?.id;
      return ownerId && userFilterIds.has(ownerId);
    });
  }, [allContextWorkouts, filteredWorkouts, userFilterIds, isPersonalView, user?.id]);

  // Compute selected user info for multi-user display
  const selectedUserInfos = useMemo(() => {
    const infos: { userId: string; label: string; initial: string; avatarUrl: string | null }[] = [];
    if (isPersonalView) {
      infos.push({ userId: user?.id || "me", label: "Mine", initial: profile?.display_name?.charAt(0)?.toUpperCase() || "?", avatarUrl: profile?.avatar_url || null });
      return infos;
    }

    // Build full member list for this context
    const allMembers: { userId: string; label: string; initial: string; avatarUrl: string | null }[] = [];
    allMembers.push({ userId: user?.id || "me", label: "Mine", initial: profile?.display_name?.charAt(0)?.toUpperCase() || "?", avatarUrl: profile?.avatar_url || null });

    if (isGroupView && activeGroup) {
      activeGroup.members.filter((m: GroupMember) => m.user_id !== user?.id && m.status === "active").forEach((m) => {
        const name = m.display_name || "Member";
        allMembers.push({ userId: m.user_id, label: name.split(" ")[0], initial: name.charAt(0).toUpperCase(), avatarUrl: m.avatar_url });
      });
    } else if (isAllView) {
      const seen = new Set<string>([user?.id || ""]);
      groups.filter((g) => g.shared_pages?.includes("workout")).forEach((g) => {
        g.members.filter((m: GroupMember) => m.status === "active" && !seen.has(m.user_id)).forEach((m) => {
          seen.add(m.user_id);
          const name = m.display_name || "Member";
          allMembers.push({ userId: m.user_id, label: name.split(" ")[0], initial: name.charAt(0).toUpperCase(), avatarUrl: m.avatar_url });
        });
      });
    }

    // Filter to only selected users
    const isEveryone = userFilterIds.has(EVERYONE_SENTINEL);
    for (const m of allMembers) {
      if (isEveryone || userFilterIds.has(m.userId)) infos.push(m);
    }
    return infos;
  }, [user, profile, activeGroup, groups, isPersonalView, isGroupView, isAllView, userFilterIds]);

  // Build per-user workout data for stats
  const userWorkoutData: UserWorkoutData[] = useMemo(() => {
    return selectedUserInfos.map((u) => ({
      ...u,
      workouts: userFilteredWorkouts.filter((w) => (w.ownerUserId || user?.id) === u.userId),
    }));
  }, [selectedUserInfos, userFilteredWorkouts, user?.id]);

  const isMultiUserView = selectedUserInfos.length > 1;

  const today = todayStr();

  const dateRange = useMemo(() => {
    const dates: string[] = [];
    const d = new Date();
    d.setDate(d.getDate() - 7);
    for (let i = 0; i < 28; i++) {
      dates.push(fmtDate(d));
      d.setDate(d.getDate() + 1);
    }
    return dates;
  }, []);

  const dateWorkouts = useMemo(() => {
    return userFilteredWorkouts.filter((w) => w.scheduledDate === selectedDate);
  }, [selectedDate, userFilteredWorkouts]);

  // Per-user date workouts for sectioned display
  const perUserDateWorkouts = useMemo(() => {
    if (!isMultiUserView) return [];
    return selectedUserInfos.map((u) => ({
      ...u,
      workouts: dateWorkouts.filter((w) => (w.ownerUserId || user?.id) === u.userId),
    }));
  }, [isMultiUserView, selectedUserInfos, dateWorkouts, user?.id]);

  const activeWorkouts = userFilteredWorkouts;

  const missedWorkouts = useMemo(() => {
    // Only show missed workouts for the user's own workouts
    return userFilteredWorkouts.filter((w) => w.ownerUserId === user?.id && w.scheduledDate && w.scheduledDate < today && !w.done);
  }, [userFilteredWorkouts, today, user?.id]);

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm) return;
    let filter = deleteConfirm.filter;
    let date: string | undefined;
    if (filter === "tomorrow") {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      date = fmtDate(d);
      filter = "date";
    }
    const count = await removeWorkoutsByFilter(filter as any, date);
    toast.success(`Deleted ${count} workout${count !== 1 ? "s" : ""}`);
    setDeleteConfirm(null);
  };

  const handleReschedule = (id: string, toDate: string) => {
    rescheduleWorkout(id, toDate);
    const dateLabel = toDate === today ? "today" : new Date(toDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    toast.success(`Moved to ${dateLabel}`);
  };

  const getNextDay = (dateStr: string) => {
    const d = new Date(dateStr + "T00:00:00");
    d.setDate(d.getDate() + 1);
    return fmtDate(d);
  };

  const addManualActivity = (activity: typeof MANUAL_ACTIVITIES[0]) => {
    const isCardio = isCardioWorkout(activity.title);
    const newWorkout: Workout = {
      id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
      title: activity.title,
      duration: activity.defaultDuration,
      cal: activity.defaultCal,
      tag: activity.tag,
      emoji: activity.emoji,
      done: false,
      scheduledDate: selectedDate,
      distance: isCardio ? 0 : undefined,
      distanceUnit: isCardio ? "km" : undefined,
    };
    addWorkouts([newWorkout]);
    toast.success(`Added ${activity.title}`);
  };

  // Custom activity via simple inline form removed — now uses CustomWorkoutBuilder

  const handleToggleWorkout = (id: string) => {
    const w = workouts.find((w) => w.id === id);
    const isOwnWorkout = !w?.ownerUserId || w.ownerUserId === user?.id;
    if (!isOwnWorkout) return;
    const workout = workouts.find((w) => w.id === id);
    if (workout && !workout.done) {
      setShowCongrats(true);
      // If workout belongs to a group, offer photo sharing
      if (workout.groupId && !isWorkoutPhotoPromptSuppressed()) {
        // Small delay so congrats shows first
        setTimeout(() => setPhotoPromptWorkout(workout), 1200);
      }
    }
    toggleWorkout(id);
  };

  const handlePhotoSent = (workoutId: string, photoUrl: string) => {
    updateWorkout(workoutId, { completionPhotoUrl: photoUrl });
  };

  const handleCopyWorkout = async (sourceWorkout: Workout, scheduledDate: string, groupIds?: (string | null)[]) => {
    if (!user) return;
    // Default: Personal only
    const contexts = groupIds || [null];

    // Deduplication check: look for same title on same date in user's workouts
    const existingDupe = workouts.find(
      (w) => w.title === sourceWorkout.title && w.scheduledDate === scheduledDate && !w.ownerUserId
    );
    if (existingDupe) {
      const dateLabel = new Date(scheduledDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      const confirmed = window.confirm(`You already have "${sourceWorkout.title}" on ${dateLabel}. Add again?`);
      if (!confirmed) return;
    }

    // Create one workout per context, linked together
    const linkedId = Date.now().toString() + Math.random().toString(36).slice(2, 6);
    const newWorkouts: Workout[] = contexts.map((gid, i) => ({
      id: linkedId + (i > 0 ? `-${i}` : ""),
      title: sourceWorkout.title,
      duration: sourceWorkout.duration,
      cal: 0,
      tag: sourceWorkout.tag,
      emoji: sourceWorkout.emoji,
      done: false,
      scheduledDate,
      exercises: sourceWorkout.exercises ? sourceWorkout.exercises.map(ex => ({ ...ex })) : [],
      distance: sourceWorkout.distance ? 0 : undefined,
      distanceUnit: sourceWorkout.distanceUnit,
      groupId: gid ?? undefined,
      linkedWorkoutId: contexts.length > 1 ? linkedId : undefined,
    }));
    addWorkouts(newWorkouts);
    const dateLabel = new Date(scheduledDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    toast.success(`"${sourceWorkout.title}" added to ${dateLabel}!`);
  };

  // Exercise editing handlers
  const startEditExercise = (workoutId: string, index: number, ex: { name: string; sets: number; reps: string }) => {
    setEditingWorkout({ workoutId, exerciseIndex: index });
    setEditExName(ex.name);
    setEditExSets(String(ex.sets));
    setEditExReps(ex.reps);
  };

  const saveExerciseEdit = () => {
    if (!editingWorkout) return;
    const workout = workouts.find((w) => w.id === editingWorkout.workoutId);
    if (!workout?.exercises) return;
    const updated = [...workout.exercises];
    updated[editingWorkout.exerciseIndex] = { name: editExName, sets: parseInt(editExSets) || 1, reps: editExReps };
    updateWorkout(editingWorkout.workoutId, { exercises: updated });
    setEditingWorkout(null);
    toast.success("Exercise updated");
  };

  const deleteExercise = (workoutId: string, index: number) => {
    const workout = workouts.find((w) => w.id === workoutId);
    const exerciseName = workout?.exercises?.[index]?.name;
    if (!workout?.exercises || !exerciseName) return;
    setExerciseDeleteConfirm({ workoutId, index, exerciseName });
  };


  // Track workout progress from exercise logs
  const [workoutProgress, setWorkoutProgress] = useState<Record<string, { progress: number; cal: number }>>({});

  const handleProgressUpdate = useCallback((workoutId: string, progress: number, cal: number) => {
    setWorkoutProgress(prev => ({
      ...prev,
      [workoutId]: { progress, cal },
    }));

    // Single source of truth: always write recalculated calories to workout
    updateWorkout(workoutId, { cal });

    // Auto-complete if 100% and not already done
    if (progress >= 100) {
      const w = workouts.find(w => w.id === workoutId);
      if (w && !w.done) {
        handleToggleWorkout(workoutId);
      }
    }
  }, [workouts, updateWorkout]);

  const handleCaloriesSaved = useCallback((workoutId: string, cal: number) => {
    updateWorkout(workoutId, { cal });
    setWorkoutProgress(prev => ({
      ...prev,
      [workoutId]: { ...prev[workoutId], cal },
    }));
  }, [updateWorkout]);

  if (showHistory) {
    return (
      <div className="px-5 pb-24 pt-12">
        <ExerciseHistoryPage onBack={() => setShowHistory(false)} />
      </div>
    );
  }

  return (
    <div className="px-5 pb-24">

      {showCongrats && (
        <CongratsPopup type="workout" show={true} onClose={() => setShowCongrats(false)} />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => { if (!open) setDeleteConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Workouts</AlertDialogTitle>
            <AlertDialogDescription>{deleteConfirm?.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!exerciseDeleteConfirm} onOpenChange={(open) => { if (!open) setExerciseDeleteConfirm(null); }}>
        <AlertDialogContent className="z-[95]" style={{ zIndex: 95 }}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Exercise</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <span className="font-medium text-foreground">{exerciseDeleteConfirm?.exerciseName}</span> from this workout?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!exerciseDeleteConfirm) return;
                const workout = workouts.find((w) => w.id === exerciseDeleteConfirm.workoutId);
                if (!workout?.exercises) return;
                const updated = workout.exercises.filter((_, i) => i !== exerciseDeleteConfirm.index);
                updateWorkout(exerciseDeleteConfirm.workoutId, { exercises: updated });
                setExerciseDeleteConfirm(null);
                toast.success("Exercise removed");
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Exercise Edit Dialog */}
      <Dialog open={!!editingWorkout} onOpenChange={(open) => { if (!open) setEditingWorkout(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Pencil size={16} /> Edit Exercise</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Exercise Name</label>
              <input value={editExName} onChange={(e) => setEditExName(e.target.value)} className="w-full bg-secondary rounded-lg px-3 py-2 text-sm outline-none mt-1 border border-border" />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs font-medium text-muted-foreground">Sets</label>
                <input type="number" value={editExSets} onChange={(e) => setEditExSets(e.target.value)} className="w-full bg-secondary rounded-lg px-3 py-2 text-sm outline-none mt-1 border border-border" />
              </div>
              <div className="flex-1">
                <label className="text-xs font-medium text-muted-foreground">Reps</label>
                <input value={editExReps} onChange={(e) => setEditExReps(e.target.value)} className="w-full bg-secondary rounded-lg px-3 py-2 text-sm outline-none mt-1 border border-border" />
              </div>
            </div>
            <button onClick={saveExerciseEdit} disabled={!editExName.trim()} className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">
              Save Changes
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <>

      <header className="pt-12 pb-4 flex items-center gap-2">
        <h1 className="text-[1.75rem] font-bold tracking-display">Workouts</h1>
        <div className="flex-1" />
        {onOpenSettings && (
          <button onClick={onOpenSettings} className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors" aria-label="Settings">
            <Settings size={18} />
          </button>
        )}
      </header>

      <PageGroupSelector page="workout" personalLabel="Mine" hideAllPill />

      {/* User filter pills — shown in All and Group views, not Personal */}
      {!isPersonalView && (
        <WorkoutUserFilter
          selectedUserIds={userFilterIds}
          onSelectionChange={setUserFilterIds}
        />
      )}


      {/* Main workout view */}
      {(
        <>
          {/* Top Stats Summary */}
          <WorkoutStatsCards workouts={activeWorkouts} selectedDate={selectedDate} todayStr={today} onResetToToday={() => setSelectedDate(todayStr())} userWorkouts={isMultiUserView ? userWorkoutData : undefined} />

          {/* Missed Workouts Banner */}
          {missedWorkouts.length > 0 && selectedDate === today && (
            <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-4 mb-5">
              <h3 className="text-sm font-semibold text-destructive flex items-center gap-2 mb-3">
                <AlertTriangle size={14} />
                {missedWorkouts.length} Missed Workout{missedWorkouts.length > 1 ? "s" : ""}
              </h3>
              <div className="space-y-2">
                {missedWorkouts.map((w) => (
                  <div key={w.id} className="flex items-center gap-3 bg-card rounded-lg p-3 border border-border">
                    <span className="text-xl">{w.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{w.title}</p>
                      <p className="text-xs text-muted-foreground">
                        Was: {new Date(w.scheduledDate! + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                      </p>
                    </div>
                    <div className="flex gap-1.5">
                      <button onClick={() => handleReschedule(w.id, today)} className="px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium flex items-center gap-1">
                        <RotateCcw size={10} /> Today
                      </button>
                      <button onClick={() => handleReschedule(w.id, getNextDay(today))} className="px-2.5 py-1.5 rounded-lg bg-secondary text-foreground text-xs font-medium flex items-center gap-1">
                        <ArrowRight size={10} /> Tomorrow
                      </button>
                      <button
                        onClick={() => {
                          if (confirm("Delete this missed workout?")) {
                            removeWorkout(w.id);
                            toast.success("Missed workout deleted");
                          }
                        }}
                        className="px-2 py-1.5 rounded-lg bg-destructive/10 text-destructive text-xs font-medium flex items-center"
                        title="Delete"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Date selector strip */}
          <div className="mb-5 -mx-5">
            <div
              className="flex gap-2 px-5 pb-2 overflow-x-auto scrollbar-hide"
              style={{ WebkitOverflowScrolling: "touch" }}
              ref={(el) => {
                if (el) {
                  const selectedEl = el.querySelector('[data-selected="true"]');
                  if (selectedEl) {
                    selectedEl.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
                  }
                }
              }}
            >
              {dateRange.map((date) => {
                const d = new Date(date + "T00:00:00");
                const dayNum = d.getDate();
                const dayName = d.toLocaleDateString("en-US", { weekday: "short" });
                const isSelected = date === selectedDate;
                const isT = date === today;
                const hasWorkouts = userFilteredWorkouts.some((w) => w.scheduledDate === date || w.completedDate === date);

                return (
                  <button
                    key={date}
                    data-selected={isSelected}
                    onClick={() => setSelectedDate(date)}
                    className={`flex flex-col items-center min-w-[48px] flex-shrink-0 py-2 px-1 rounded-xl border transition-all ${
                      isSelected
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-transparent text-muted-foreground hover:bg-secondary"
                    }`}
                  >
                    <span className="text-[10px] font-medium">{dayName}</span>
                    <span className={`text-base font-bold ${isT && !isSelected ? "text-primary" : ""}`}>{dayNum}</span>
                    {hasWorkouts && <span className="w-1.5 h-1.5 rounded-full bg-primary mt-0.5" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Smart Quick Add */}
          <SmartQuickAdd
            workouts={userFilteredWorkouts}
            onAddActivity={addManualActivity}
            onOpenCustomBuilder={() => setShowCustomBuilder(true)}
            onAddWorkouts={addWorkouts}
            selectedDate={selectedDate}
          />

          {/* Custom Workout Builder Modal */}
          <CustomWorkoutBuilder
            open={showCustomBuilder}
            onClose={() => setShowCustomBuilder(false)}
            onAdd={addWorkouts}
            selectedDate={selectedDate}
          />

          {/* Workout Section */}
          <section className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold flex items-center gap-1.5">
                <CalIcon size={14} className="text-muted-foreground" />
                {selectedDate === today
                  ? "Today's Workouts"
                  : selectedDate > today
                    ? "Upcoming Workout"
                    : `Workout for ${new Date(selectedDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
                <button
                  onClick={() => setShowHistory(true)}
                  className="w-6 h-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors ml-0.5"
                  aria-label="Exercise History"
                >
                  <History size={14} />
                </button>
              </h3>
              <div className="flex items-center gap-2">
                <WorkoutAiSuggest
                  selectedDate={selectedDate}
                  recentWorkouts={userFilteredWorkouts}
                  onAddWorkout={addWorkouts}
                />
              </div>
            </div>

            {isMultiUserView ? (
              /* Multi-user: sectioned per user */
              <div className="space-y-4">
                {perUserDateWorkouts.map((section) => {
                  const isOwnSection = section.userId === user?.id;
                  const hasWorkoutsToday = section.workouts.length > 0;
                  const allTodayComplete = hasWorkoutsToday && section.workouts.every(w => w.done);
                  const hasIncompleteToday = hasWorkoutsToday && section.workouts.some(w => !w.done);

                  // Compute weekly completed for this user
                  const now = new Date();
                  const dayOfWeek = now.getDay();
                  const weekStart = new Date(now);
                  weekStart.setDate(now.getDate() - ((dayOfWeek + 6) % 7)); // Monday
                  weekStart.setHours(0, 0, 0, 0);
                  const weekStartStr = fmtDate(weekStart);
                  const weeklyCompleted = userFilteredWorkouts.filter(w =>
                    (w.ownerUserId || user?.id) === section.userId &&
                    w.done &&
                    w.completedDate &&
                    w.completedDate >= weekStartStr
                  ).length;
                  const WEEKLY_GOAL = 4; // default
                  const weeklyGoalMet = weeklyCompleted >= WEEKLY_GOAL;

                  // Nudge logic: show only for other users
                  // Has workout today, not complete → Yes
                  // Has workout today, complete → No
                  // No workout today, weekly goal not complete → Yes
                  // No workout today, weekly goal complete → No
                  // Own section → Never
                  const showNudge = !isOwnSection && selectedDate === today && (
                    (hasIncompleteToday) ||
                    (!hasWorkoutsToday && !weeklyGoalMet)
                  ) && !allTodayComplete;

                  return (
                    <div key={section.userId}>
                      <div className="flex items-center gap-2 mb-2">
                        {section.avatarUrl ? (
                          <img src={section.avatarUrl} alt="" className="w-5 h-5 rounded-full object-cover" />
                        ) : (
                          <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[9px] font-bold">{section.initial}</span>
                        )}
                        <span className="text-xs font-semibold text-foreground">
                          {isOwnSection ? "Mine" : `${section.label}'s Workouts`}
                        </span>
                      </div>
                      {section.workouts.length === 0 ? (
                        <p className="text-xs text-muted-foreground pl-7 py-2">No workouts today</p>
                      ) : (
                        <div className="space-y-2">
                          {section.workouts.map((w) => (
                            <WorkoutCard
                              key={w.id}
                              workout={w}
                              onToggle={handleToggleWorkout}
                              onRemove={removeWorkout}
                              onReschedule={handleReschedule}
                              onRescheduleCascade={rescheduleWorkoutCascade}
                              allWorkouts={userFilteredWorkouts}
                              onSelectExercise={setSelectedExercise}
                              onEditExercise={startEditExercise}
                              onDeleteExercise={deleteExercise}
                              onLogWorkout={setLoggingWorkout}
                              onUpdateWorkout={updateWorkout}
                              onAddExercises={(id, newExercises) => {
                                const existing = workouts.find(wk => wk.id === id);
                                if (!existing) return;
                                const updated = [...(existing.exercises || []), ...newExercises];
                                updateWorkout(id, { exercises: updated });
                                toast.success(`Added ${newExercises.length} exercise${newExercises.length > 1 ? "s" : ""}`);
                              }}
                              onProgressUpdate={handleProgressUpdate}
                              onCaloriesSaved={handleCaloriesSaved}
                              readOnly={!!w.ownerUserId && w.ownerUserId !== user?.id}
                              progress={workoutProgress[w.id]?.progress}
                              onCopyWorkout={handleCopyWorkout}
                            />
                          ))}
                        </div>
                      )}
                      {/* Nudge button */}
                      {showNudge && (
                        <div className="flex items-center justify-end mt-1 mb-1 ml-7">
                          <button
                            onClick={() => sendWorkoutNudge(section.userId, section.label)}
                            disabled={nudgeCooldown.has(section.userId)}
                            className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 text-primary text-[11px] font-semibold hover:bg-primary/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Bell size={10} />
                            🔔 Nudge {section.label}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Single user: normal layout */
              (() => {
                // Nudge logic for single-user view of another user
                const singleOtherUser = !isPersonalView && selectedUserInfos.length === 1 && selectedUserInfos[0].userId !== user?.id ? selectedUserInfos[0] : null;
                const hasWorkoutsToday = dateWorkouts.length > 0;
                const allTodayComplete = hasWorkoutsToday && dateWorkouts.every(w => w.done);
                const hasIncompleteToday = hasWorkoutsToday && dateWorkouts.some(w => !w.done);
                const now2 = new Date();
                const dayOfWeek2 = now2.getDay();
                const weekStart2 = new Date(now2);
                weekStart2.setDate(now2.getDate() - ((dayOfWeek2 + 6) % 7));
                weekStart2.setHours(0, 0, 0, 0);
                const weekStartStr2 = fmtDate(weekStart2);
                const weeklyCompleted2 = singleOtherUser ? userFilteredWorkouts.filter(w =>
                  (w.ownerUserId || user?.id) === singleOtherUser.userId &&
                  w.done && w.completedDate && w.completedDate >= weekStartStr2
                ).length : 0;
                const weeklyGoalMet2 = weeklyCompleted2 >= 4;
                const showSingleNudge = singleOtherUser && selectedDate === today && (
                  hasIncompleteToday || (!hasWorkoutsToday && !weeklyGoalMet2)
                ) && !allTodayComplete;

                return (
                  <>
                    {dateWorkouts.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-6">
                        {selectedDate === today
                          ? "No workouts today. Generate a plan or add one above."
                          : "No workouts scheduled for this day."}
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {dateWorkouts.map((w) => (
                          <WorkoutCard
                            key={w.id}
                            workout={w}
                            onToggle={handleToggleWorkout}
                            onRemove={removeWorkout}
                            onReschedule={handleReschedule}
                            onRescheduleCascade={rescheduleWorkoutCascade}
                            allWorkouts={userFilteredWorkouts}
                            onSelectExercise={setSelectedExercise}
                            onEditExercise={startEditExercise}
                            onDeleteExercise={deleteExercise}
                            onLogWorkout={setLoggingWorkout}
                            onUpdateWorkout={updateWorkout}
                            onAddExercises={(id, newExercises) => {
                              const existing = workouts.find(wk => wk.id === id);
                              if (!existing) return;
                              const updated = [...(existing.exercises || []), ...newExercises];
                              updateWorkout(id, { exercises: updated });
                              toast.success(`Added ${newExercises.length} exercise${newExercises.length > 1 ? "s" : ""}`);
                            }}
                            onProgressUpdate={handleProgressUpdate}
                            onCaloriesSaved={handleCaloriesSaved}
                            readOnly={!!w.ownerUserId && w.ownerUserId !== user?.id}
                            progress={workoutProgress[w.id]?.progress}
                            onCopyWorkout={handleCopyWorkout}
                          />
                        ))}
                      </div>
                    )}
                    {/* Single-user nudge */}
                    {showSingleNudge && singleOtherUser && (
                      <div className="flex items-center justify-end mt-2 mb-1">
                        <button
                          onClick={() => sendWorkoutNudge(singleOtherUser.userId, singleOtherUser.label)}
                          disabled={nudgeCooldown.has(singleOtherUser.userId)}
                          className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 text-primary text-[11px] font-semibold hover:bg-primary/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Bell size={10} />
                          🔔 Nudge {singleOtherUser.label}
                        </button>
                      </div>
                    )}
                  </>
                );
              })()
            )}
          </section>
        </>
      )}

      {/* Exercise Detail Dialog */}
      <ExerciseDetailDialog
        exerciseName={selectedExercise}
        onClose={() => setSelectedExercise(null)}
      />

      {/* Exercise Log Modal - now integrated into WorkoutDetailModal */}

      {/* Workout Photo Sharing Prompt */}
      {photoPromptWorkout && (
        <WorkoutPhotoPrompt
          open={!!photoPromptWorkout}
          workout={photoPromptWorkout}
          onClose={() => setPhotoPromptWorkout(null)}
          onPhotoSent={(url) => handlePhotoSent(photoPromptWorkout.id, url)}
        />
      )}
    </>
    </div>
  );
};


const WorkoutCard = ({
  workout,
  onToggle,
  onRemove,
  onReschedule,
  onRescheduleCascade,
  allWorkouts,
  onSelectExercise,
  onEditExercise,
  onDeleteExercise,
  onLogWorkout,
  onUpdateWorkout,
  onAddExercises,
  onProgressUpdate,
  onCaloriesSaved,
  readOnly,
  progress,
  onCopyWorkout,
}: {
  workout: Workout;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onReschedule: (id: string, toDate: string) => void;
  onRescheduleCascade: (id: string, newDate: string, shiftFollowing: boolean) => Promise<void>;
  allWorkouts: Workout[];
  onSelectExercise: (name: string) => void;
  onEditExercise: (workoutId: string, index: number, ex: { name: string; sets: number; reps: string }) => void;
  onDeleteExercise: (workoutId: string, index: number) => void;
  onLogWorkout: (workout: Workout) => void;
  onUpdateWorkout: (id: string, updates: Partial<Workout>) => void;
  onAddExercises?: (workoutId: string, exercises: { name: string; sets: number; reps: string }[]) => void;
  onProgressUpdate?: (workoutId: string, progress: number, cal: number) => void;
  onCaloriesSaved?: (workoutId: string, cal: number) => void;
  readOnly?: boolean;
  progress?: number;
  onCopyWorkout?: (workout: Workout, scheduledDate: string) => void;
}) => {
  const [showDetail, setShowDetail] = useState(false);
  const [cascadeConfirm, setCascadeConfirm] = useState<{ newDate: string; diffDays: number; followingCount: number } | null>(null);

  const isCardio = isCardioWorkout(workout.title);
  const showDist = ["running", "cycling", "walking", "swimming"].some(t => workout.title.toLowerCase().includes(t));

  const fmtD = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const handleMoveToDate = (date: Date) => {
    const newDate = fmtD(date);
    if (!workout.scheduledDate) {
      onReschedule(workout.id, newDate);
      return;
    }
    const oldMs = new Date(workout.scheduledDate + "T00:00:00").getTime();
    const newMs = new Date(newDate + "T00:00:00").getTime();
    const diffDays = Math.round((newMs - oldMs) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return;

    const following = allWorkouts.filter(
      (w) => w.scheduledDate && w.scheduledDate > workout.scheduledDate! && !w.done && w.id !== workout.id
    );

    if (following.length > 0) {
      setCascadeConfirm({ newDate, diffDays, followingCount: following.length });
    } else {
      onReschedule(workout.id, newDate);
    }
  };

  const handleMoveToTomorrow = () => {
    const base = workout.scheduledDate || fmtD(new Date());
    const d = new Date(base + "T00:00:00");
    d.setDate(d.getDate() + 1);
    handleMoveToDate(d);
  };

  return (
    <>
      {/* Cascade Confirmation Dialog */}
      <AlertDialog open={!!cascadeConfirm} onOpenChange={(open) => { if (!open) setCascadeConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Shift following workouts?</AlertDialogTitle>
            <AlertDialogDescription>
              You're moving this workout by {cascadeConfirm ? Math.abs(cascadeConfirm.diffDays) : 0} day{cascadeConfirm && Math.abs(cascadeConfirm.diffDays) !== 1 ? "s" : ""} {cascadeConfirm && cascadeConfirm.diffDays > 0 ? "forward" : "back"}.
              There {cascadeConfirm?.followingCount === 1 ? "is" : "are"} {cascadeConfirm?.followingCount} upcoming workout{cascadeConfirm?.followingCount !== 1 ? "s" : ""} after this one. Would you like to shift them too?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (cascadeConfirm) {
                  onReschedule(workout.id, cascadeConfirm.newDate);
                  setCascadeConfirm(null);
                }
              }}
              className="bg-secondary text-foreground hover:bg-secondary/80"
            >
              Move only this one
            </AlertDialogAction>
            <AlertDialogAction
              onClick={() => {
                if (cascadeConfirm) {
                  onRescheduleCascade(workout.id, cascadeConfirm.newDate, true);
                  setCascadeConfirm(null);
                  toast.success(`Shifted ${cascadeConfirm.followingCount + 1} workouts`);
                }
              }}
            >
              Shift all following
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <motion.div layout className={`bg-card rounded-xl border shadow-card overflow-hidden ${workout.done ? "border-habit-green/50" : "border-border"}`}>
        <div className="p-4 flex items-center gap-3">
          {/* Completion circle - identical for all users, tappable only for owner */}
          <div
            role={readOnly ? undefined : "button"}
            onClick={readOnly ? undefined : (e) => { e.stopPropagation(); onToggle(workout.id); }}
            className={`relative w-8 h-8 flex items-center justify-center flex-shrink-0 ${readOnly ? "pointer-events-none" : "cursor-pointer"}`}
          >
            <svg className="absolute inset-0 w-8 h-8 -rotate-90" viewBox="0 0 32 32">
              <circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" className="text-muted-foreground/20" strokeWidth="2.5" />
              {(progress || 0) > 0 && !workout.done && (
                <circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" className="text-habit-green" strokeWidth="2.5"
                  strokeDasharray={`${((progress || 0) / 100) * 81.68} 81.68`} strokeLinecap="round" />
              )}
            </svg>
            <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all z-10 ${
              workout.done ? "bg-habit-green border-habit-green" : "border-transparent"
            }`}>
              {workout.done && <Check size={14} className="text-primary-foreground" />}
            </div>
          </div>

          {/* Tappable card body - opens detail */}
          <div
            className="flex-1 min-w-0 cursor-pointer"
            onClick={() => setShowDetail(true)}
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">{workout.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className={`text-[15px] font-semibold truncate ${workout.done ? "line-through text-muted-foreground" : ""}`}>{workout.title}</p>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock size={11} /> {workout.duration}
                  </span>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Flame size={11} /> {workout.cal} cal
                  </span>
                  {showDist && (workout.distance ?? 0) > 0 && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Footprints size={11} /> {workout.distance} {workout.distanceUnit || "km"}
                    </span>
                  )}
                </div>
                {/* Exercise count badge for strength workouts */}
                {workout.exercises && workout.exercises.length > 0 && (
                  <div className="flex items-center gap-1 mt-1">
                    <Dumbbell size={10} className="text-muted-foreground" />
                    <span className="text-[11px] text-muted-foreground">{workout.exercises.length} exercises</span>
                  </div>
                )}
                {/* Source badge for imported workouts */}
                {(workout.originType === "imported" || workout.originType === "merged") && (
                  <div className="flex items-center gap-1 mt-1">
                    <CloudDownload size={10} className="text-primary/70" />
                    <span className="text-[10px] font-medium text-primary/70">
                      {workout.sourceApp === "apple_health" ? "Apple Health" : workout.sourceApp === "health_connect" ? "Health Connect" : "Imported"}
                    </span>
                  </div>
                )}
                {/* Needs review indicator */}
                {workout.needsReview && (
                  <div className="flex items-center gap-1 mt-1">
                    <AlertTriangle size={10} className="text-destructive/70" />
                    <span className="text-[10px] font-medium text-destructive/70">Needs review</span>
                  </div>
                )}
              </div>
              <GroupBadge groupId={workout.groupId} />
            </div>
          </div>
        </div>
      </motion.div>

      {/* Detail Modal */}
      <WorkoutDetailModal
        workout={workout}
        open={showDetail}
        onClose={() => setShowDetail(false)}
        onRemove={onRemove}
        onMoveToTomorrow={handleMoveToTomorrow}
        onMoveToDate={handleMoveToDate}
        onUpdateCalories={(id, cal) => onUpdateWorkout(id, { cal })}
        onUpdateDuration={(id, duration) => onUpdateWorkout(id, { duration })}
        onUpdateDistance={(id, distance, unit) => onUpdateWorkout(id, { distance, distanceUnit: unit })}
        onEditExercise={onEditExercise}
        onDeleteExercise={onDeleteExercise}
        onAddExercises={onAddExercises || (() => {})}
        onLogWorkout={onLogWorkout}
        onSelectExercise={onSelectExercise}
        onProgressUpdate={onProgressUpdate}
        onCaloriesSaved={onCaloriesSaved}
        readOnly={readOnly}
        progress={progress}
        onCopyWorkout={onCopyWorkout}
      />
    </>
  );
};

const ExerciseDetailDialog = ({ exerciseName, onClose }: { exerciseName: string | null; onClose: () => void }) => {
  const [detail, setDetail] = useState<ExerciseDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!exerciseName) { setDetail(null); return; }
    setLoading(true);
    supabase.functions.invoke("exercise-detail", { body: { exerciseName } })
      .then(({ data, error }) => {
        if (!error && data && !data.error) setDetail(data);
        else setDetail(null);
      })
      .finally(() => setLoading(false));
  }, [exerciseName]);

  const searchQuery = detail?.videoSearchQuery || `how to do ${exerciseName} exercise form`;

  return (
      <Dialog open={!!exerciseName} onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogContent className="max-w-md max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Dumbbell size={18} />
            {exerciseName}
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[65vh] pr-2">
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ) : detail ? (
            <div className="space-y-5">
              <a
                href={`https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-3 rounded-xl bg-destructive/5 border border-destructive/20 hover:bg-destructive/10 transition-colors"
              >
                <span className="text-2xl">▶️</span>
                <div>
                  <p className="text-sm font-semibold">Watch Demo on YouTube</p>
                  <p className="text-xs text-muted-foreground">Opens YouTube search for "{exerciseName}"</p>
                </div>
              </a>

              <div>
                <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">📋 How to Perform</h4>
                <ol className="space-y-1.5">
                  {detail.steps.map((step, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex gap-2">
                      <span className="font-semibold text-foreground flex-shrink-0">{i + 1}.</span>
                      {step}
                    </li>
                  ))}
                </ol>
              </div>

              <div>
                <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">💪 Muscles Worked</h4>
                <div className="flex flex-wrap gap-1.5">
                  {detail.musclesWorked.map((m, i) => (
                    <span key={i} className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">{m}</span>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">🎯 Form Cues</h4>
                <ul className="space-y-1">
                  {detail.formCues.map((cue, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                      <Check size={14} className="text-habit-green flex-shrink-0 mt-0.5" />
                      {cue}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">⚠️ Common Mistakes</h4>
                <ul className="space-y-1">
                  {detail.commonMistakes.map((mistake, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                      <X size={14} className="text-destructive flex-shrink-0 mt-0.5" />
                      {mistake}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">Could not load exercise details.</p>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default WorkoutsPage;
