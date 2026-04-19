import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Clock, Flame, Check, Trash2, ChevronDown, ChevronUp, Loader2, X, Dumbbell, AlertTriangle, Target, ArrowRight, RotateCcw, Calendar as CalIcon, Plus, Pencil, Settings, Heart, Gauge, Mountain, Footprints, Smartphone, ImageIcon, History, CloudDownload, Bell, ClipboardList, MoreHorizontal } from "lucide-react";
import CustomWorkoutBuilder from "@/components/CustomWorkoutBuilder";
import WorkoutAiSuggest from "@/components/WorkoutAiSuggest";
import GroupBadge from "@/components/GroupBadge";
import { useAppContext, Workout, isCardioWorkout } from "@/context/AppContext";
import { mergeAppWorkoutsWithHealthKit } from "@/lib/healthKitWorkoutMerge";
import { formatDistanceFromKm } from "@/lib/distanceDisplay";
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
import { ModeToggleBar, GroupPillsRow, MemberSelectorPill, MemberSummaryCards, type WorkoutMode, type MemberOption } from "@/components/WorkoutModeToggle";

import WorkoutPhotoPrompt, { isWorkoutPhotoPromptSuppressed } from "@/components/WorkoutPhotoPrompt";
import ShareToFeedSheet from "@/components/ShareToFeedSheet";
import ExerciseHistoryPage from "@/components/ExerciseHistoryPage";
import ExerciseLibrarySheet from "@/components/ExerciseLibrarySheet";
import WorkoutUserFilter, { EVERYONE_SENTINEL } from "@/components/WorkoutUserFilter";
import { type UserWorkoutData } from "@/components/WorkoutStatsCards";
import { type GroupMember } from "@/context/AuthContext";
import WorkoutLogPage from "@/components/WorkoutLogPage";
import { getWeekStartDate, loadWeekStart } from "@/hooks/useWeekStart";

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
  { emoji: "🚴", title: "Cycling", tag: "Cardio", defaultDuration: "40 min", defaultCal: 350 },
  { emoji: "🧘", title: "Yoga", tag: "Flexibility", defaultDuration: "45 min", defaultCal: 200 },
  { emoji: "💪", title: "Strength", tag: "Full Body", defaultDuration: "45 min", defaultCal: 300 },
  { emoji: "🏊", title: "Swimming", tag: "Full Body", defaultDuration: "30 min", defaultCal: 400 },
  { emoji: "🚶", title: "Walking", tag: "Cardio", defaultDuration: "30 min", defaultCal: 150 },
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
  return { type: "delete", filter: "all" };
}

const DEFAULT_QUICK_ADD_ORDER = ["Running", "Cycling", "Yoga", "Strength", "Swimming", "Walking"];

/* ── Muscle group tag colors ── */
const TAG_COLORS: Record<string, string> = {
  "Legs": "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  "Back": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  "Full Body": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  "Cardio": "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
  "Flexibility": "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  "Upper Body": "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
  "Chest": "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
  "Arms": "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
};

const getTagColor = (tag: string) => TAG_COLORS[tag] || "bg-secondary text-muted-foreground";

/* ── Hero Card: Weekly Goal + Stats ── */
const HeroCard = ({ workouts, weeklyGoal, onGoalChange }: { workouts: Workout[]; weeklyGoal: number; onGoalChange: (g: number) => void }) => {
  const today = todayStr();
  const weekStart = loadWeekStart();
  const startStr = getWeekStartDate(new Date(), weekStart);

  const weekWorkouts = useMemo(() =>
    workouts.filter((w) => w.done && (w.completedDate || w.scheduledDate || "") >= startStr && (w.completedDate || w.scheduledDate || "") <= today),
    [workouts, startStr, today]
  );

  const weekDone = useMemo(() => new Set(weekWorkouts.map((w) => w.completedDate || w.scheduledDate!)).size, [weekWorkouts]);
  const weekCals = useMemo(() => weekWorkouts.reduce((s, w) => s + (w.cal || 0), 0), [weekWorkouts]);

  // Distance — per activity type
  const [distUnit, setDistUnit] = useState<"km" | "mi">(() => (localStorage.getItem("workout_distance_unit") as "km" | "mi") || "km");
  const [distFilter, setDistFilter] = useState<string[]>([]);
  const [distDropdownOpen, setDistDropdownOpen] = useState(false);

  const KM_TO_MI = 0.621371;

  const distByActivity = useMemo(() => {
    const map: Record<string, number> = {};
    weekWorkouts.forEach((w) => {
      if (!w.distance || w.distance <= 0) return;
      const name = w.title || "Other";
      map[name] = (map[name] || 0) + w.distance;
    });
    return map;
  }, [weekWorkouts]);

  const activityNames = useMemo(() => Object.keys(distByActivity).sort(), [distByActivity]);

  const totalDist = useMemo(() => {
    const selected = distFilter.length > 0 ? distFilter : activityNames;
    const km = selected.reduce((s, n) => s + (distByActivity[n] || 0), 0);
    return distUnit === "mi" ? Math.round(km * KM_TO_MI * 10) / 10 : Math.round(km * 10) / 10;
  }, [distByActivity, distFilter, activityNames, distUnit]);

  const toggleDistUnit = () => {
    const next = distUnit === "km" ? "mi" : "km";
    setDistUnit(next);
    localStorage.setItem("workout_distance_unit", next);
  };

  const toggleActivityFilter = (name: string) => {
    setDistFilter((prev) => {
      if (prev.includes(name)) {
        const next = prev.filter((n) => n !== name);
        return next;
      }
      return [...prev, name];
    });
  };

  const singleActivity = activityNames.length === 1 ? activityNames[0] : null;
  const filterLabel = distFilter.length === 0 ? "All types" : distFilter.join(" · ");

  const clamped = Math.min(weekDone, weeklyGoal);
  const pct = weeklyGoal > 0 ? (clamped / weeklyGoal) * 100 : 0;
  const remaining = Math.max(0, weeklyGoal - clamped);

  // SVG ring — 72px, 7px stroke
  const SIZE = 72;
  const STROKE = 7;
  const R = (SIZE - STROKE) / 2;
  const C = 2 * Math.PI * R;
  const offset = C - (pct / 100) * C;

  const ACTIVITY_COLORS: Record<string, string> = {
    Running: "#10B981", Cycling: "#3B82F6", Swimming: "#06B6D4", Walking: "#F59E0B", Yoga: "#8B5CF6", Strength: "#EF4444",
  };

  return (
    <div className="mb-5 p-5" style={{ background: "#fff", border: "0.5px solid rgba(0,0,0,0.07)", borderRadius: 16 }}>
      {/* Top section: Ring + Goal info */}
      <div className="flex items-center gap-5 mb-4">
        {/* Progress ring */}
        <div className="relative flex-shrink-0" style={{ width: SIZE, height: SIZE }}>
          <svg width={SIZE} height={SIZE} className="-rotate-90" viewBox={`0 0 ${SIZE} ${SIZE}`}>
            <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="#EEEDE8" strokeWidth={STROKE} />
            <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="#1a1a1a" strokeWidth={STROKE}
              strokeDasharray={C} strokeDashoffset={offset} strokeLinecap="round"
              className="transition-all duration-500" />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span style={{ fontSize: 24, fontWeight: 600, color: "#1A1A1A", lineHeight: 1 }}>{clamped}</span>
            <span style={{ fontSize: 12, color: "#999", lineHeight: 1, marginTop: 2 }}>/{weeklyGoal}</span>
          </div>
        </div>

        {/* Goal info + adjuster */}
        <div className="flex-1 min-w-0">
          <p style={{ fontSize: 12, color: "#999", fontWeight: 500 }}>Weekly goal</p>
          <p style={{ fontSize: 14, fontWeight: 500, color: "#1A1A1A", marginTop: 2 }}>
            {clamped >= weeklyGoal ? "Goal reached! 🎉" : `${remaining} workout${remaining !== 1 ? "s" : ""} to go`}
          </p>
          <div className="flex items-center gap-2.5 mt-2">
            <button
              onClick={() => onGoalChange(Math.max(1, weeklyGoal - 1))}
              className="w-[26px] h-[26px] rounded-full flex items-center justify-center text-sm"
              style={{ background: "#F4F3F0", border: "0.5px solid rgba(0,0,0,0.1)", color: "#666" }}
            >−</button>
            <span style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A", minWidth: 16, textAlign: "center" }}>{weeklyGoal}</span>
            <button
              onClick={() => onGoalChange(Math.min(14, weeklyGoal + 1))}
              className="w-[26px] h-[26px] rounded-full flex items-center justify-center text-sm"
              style={{ background: "#F4F3F0", border: "0.5px solid rgba(0,0,0,0.1)", color: "#666" }}
            >+</button>
            <span style={{ fontSize: 12, color: "#999" }}>per week</span>
          </div>
        </div>
      </div>

      {/* Stats row — three boxes */}
      <div className="grid grid-cols-3 gap-2.5">
        {/* Done */}
        <div className="flex flex-col items-center justify-center py-3 px-2" style={{ background: "#F9F8F6", borderRadius: 12 }}>
          <span style={{ fontSize: 17, fontWeight: 500, color: "#1A1A1A" }}>{weekDone}</span>
          <span style={{ fontSize: 11, color: "#999", marginTop: 2 }}>Done</span>
        </div>

        {/* Kcal */}
        <div className="flex flex-col items-center justify-center py-3 px-2" style={{ background: "#F9F8F6", borderRadius: 12 }}>
          <span style={{ fontSize: 17, fontWeight: 500, color: "#1A1A1A" }}>{weekCals.toLocaleString()}</span>
          <span style={{ fontSize: 11, color: "#999", marginTop: 2 }}>kcal</span>
        </div>

        {/* Distance */}
        <div className="relative">
          <button
            onClick={toggleDistUnit}
            className="w-full flex flex-col items-center justify-center py-3 px-2"
            style={{ background: "#F9F8F6", borderRadius: 12 }}
          >
            <div className="flex items-center gap-1">
              <span style={{ fontSize: 17, fontWeight: 500, color: "#1A1A1A" }}>{totalDist}</span>
            </div>
            <div className="flex items-center gap-1 mt-0.5">
              <span style={{ fontSize: 11, color: "#999" }}>
                {distUnit}{singleActivity ? ` · ${singleActivity}` : ""}
              </span>
              <span style={{ fontSize: 9, color: "#bbb" }}>
                {distUnit === "km" ? "mi" : "km"}
              </span>
            </div>
          </button>

          {/* Filter pill — only if multiple activity types */}
          {activityNames.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); setDistDropdownOpen((p) => !p); }}
              className="w-full mt-1.5 py-1 px-2.5 rounded-full text-center truncate"
              style={{
                fontSize: 10,
                fontWeight: 600,
                background: distFilter.length > 0 ? "#6C47FF" : "#1a1a1a",
                color: "#fff",
              }}
            >
              {filterLabel}
            </button>
          )}

          {/* Dropdown */}
          {distDropdownOpen && activityNames.length > 1 && (
            <div
              className="absolute right-0 top-full mt-1 z-50 py-1 min-w-[160px]"
              style={{ background: "#fff", borderRadius: 10, border: "0.5px solid rgba(0,0,0,0.1)", boxShadow: "0 4px 16px rgba(0,0,0,0.1)" }}
            >
              {activityNames.map((name) => {
                const active = distFilter.includes(name);
                const dist = distByActivity[name] || 0;
                const displayDist = distUnit === "mi" ? (dist * KM_TO_MI).toFixed(1) : dist.toFixed(1);
                const dotColor = ACTIVITY_COLORS[name] || "#999";
                return (
                  <button
                    key={name}
                    onClick={(e) => { e.stopPropagation(); toggleActivityFilter(name); }}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50"
                  >
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: dotColor }} />
                    <span className="flex-1 text-left truncate" style={{ fontSize: 12, fontWeight: 500, color: "#1A1A1A" }}>{name}</span>
                    <span style={{ fontSize: 11, color: "#999" }}>{displayDist} {distUnit}</span>
                    <div
                      className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
                      style={{ border: `1.5px solid ${active ? "#6C47FF" : "#ccc"}`, background: active ? "#6C47FF" : "transparent" }}
                    >
                      {active && <Check size={10} color="#fff" />}
                    </div>
                  </button>
                );
              })}
              {distFilter.length > 0 && (
                <button
                  onClick={(e) => { e.stopPropagation(); setDistFilter([]); setDistDropdownOpen(false); }}
                  className="w-full text-center py-1.5"
                  style={{ fontSize: 11, color: "#6C47FF", fontWeight: 600, borderTop: "0.5px solid rgba(0,0,0,0.05)" }}
                >
                  Reset
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/* ── Multi-user hero (group view) ── */
const MultiUserHeroCard = ({ userData, weeklyGoal }: { userData: UserWorkoutData[]; weeklyGoal: number }) => {
  const today = todayStr();
  const weekStart = loadWeekStart();
  const startStr = getWeekStartDate(new Date(), weekStart);

  const KM_TO_MI = 0.621371;

  const CARD_COLORS = [
    { dot: "#3B82F6", text: "#3B82F6", bar: "#3B82F6", avatarBg: "bg-blue-500" },
    { dot: "#10B981", text: "#10B981", bar: "#10B981", avatarBg: "bg-emerald-500" },
    { dot: "#EC4899", text: "#EC4899", bar: "#EC4899", avatarBg: "bg-pink-500" },
    { dot: "#8B5CF6", text: "#8B5CF6", bar: "#8B5CF6", avatarBg: "bg-purple-500" },
  ];

  const ACTIVITY_COLORS: Record<string, string> = {
    Running: "#10B981", Cycling: "#3B82F6", Swimming: "#06B6D4", Walking: "#F59E0B", Yoga: "#8B5CF6", Strength: "#EF4444",
  };

  return (
    <div className="flex gap-2.5 mb-5 overflow-x-auto scrollbar-hide pb-1" style={{ WebkitOverflowScrolling: "touch" }}>
      {userData.map((u, idx) => {
        const colors = CARD_COLORS[idx % CARD_COLORS.length];
        const weekWorkouts = u.workouts.filter(
          (w) => w.done && (w.completedDate || w.scheduledDate || "") >= startStr && (w.completedDate || w.scheduledDate || "") <= today
        );
        const weekDone = new Set(weekWorkouts.map((w) => w.completedDate || w.scheduledDate!)).size;
        const weekCals = weekWorkouts.reduce((s, w) => s + (w.cal || 0), 0);
        const pct = weeklyGoal > 0 ? Math.min(1, weekDone / weeklyGoal) : 0;

        return <MultiUserHeroColumn key={u.userId} u={u} colors={colors} weekDone={weekDone} weeklyGoal={weeklyGoal} weekCals={weekCals} pct={pct} weekWorkouts={weekWorkouts} KM_TO_MI={KM_TO_MI} ACTIVITY_COLORS={ACTIVITY_COLORS} />;
      })}
    </div>
  );
};

const MultiUserHeroColumn = ({ u, colors, weekDone, weeklyGoal, weekCals, pct, weekWorkouts, KM_TO_MI, ACTIVITY_COLORS }: {
  u: UserWorkoutData; colors: { dot: string; text: string; bar: string; avatarBg: string };
  weekDone: number; weeklyGoal: number; weekCals: number; pct: number;
  weekWorkouts: any[]; KM_TO_MI: number; ACTIVITY_COLORS: Record<string, string>;
}) => {
  const [distUnit, setDistUnit] = useState<"km" | "mi">(() => (localStorage.getItem("workout_distance_unit") as "km" | "mi") || "km");
  const [distFilter, setDistFilter] = useState<string[]>([]);
  const [distDropdownOpen, setDistDropdownOpen] = useState(false);

  const distByActivity = useMemo(() => {
    const map: Record<string, number> = {};
    weekWorkouts.forEach((w) => {
      if (!w.distance || w.distance <= 0) return;
      const name = w.title || "Other";
      map[name] = (map[name] || 0) + w.distance;
    });
    return map;
  }, [weekWorkouts]);

  const activityNames = useMemo(() => Object.keys(distByActivity).sort(), [distByActivity]);

  const totalDist = useMemo(() => {
    const selected = distFilter.length > 0 ? distFilter : activityNames;
    const km = selected.reduce((s, n) => s + (distByActivity[n] || 0), 0);
    return distUnit === "mi" ? Math.round(km * KM_TO_MI * 10) / 10 : Math.round(km * 10) / 10;
  }, [distByActivity, distFilter, activityNames, distUnit, KM_TO_MI]);

  const toggleDistUnit = () => {
    const next = distUnit === "km" ? "mi" : "km";
    setDistUnit(next);
    localStorage.setItem("workout_distance_unit", next);
  };

  const toggleActivityFilter = (name: string) => {
    setDistFilter((prev) => prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]);
  };

  const filterLabel = distFilter.length === 0 ? "All types" : distFilter.join(" · ");

  return (
    <div className="flex-shrink-0 flex flex-col" style={{ width: 118, background: "#fff", borderRadius: 12, border: "0.5px solid rgba(0,0,0,0.07)" }}>
      {/* Avatar + name */}
      <div className="flex items-center gap-1.5 px-2.5 pt-2.5 pb-1.5">
        {u.avatarUrl ? (
          <img src={u.avatarUrl} alt="" className="w-5 h-5 rounded-full object-cover" />
        ) : (
          <span className={`w-5 h-5 rounded-full ${colors.avatarBg} text-white flex items-center justify-center text-[9px] font-bold`}>{u.initial}</span>
        )}
        <span className="text-[11px] font-semibold truncate" style={{ color: colors.text }}>{u.label}</span>
      </div>

      {/* Done / goal */}
      <div className="px-2.5 pb-1">
        <div className="flex items-baseline gap-0.5">
          <span style={{ fontSize: 20, fontWeight: 500, color: colors.text }}>{weekDone}</span>
          <span style={{ fontSize: 12, color: "#999" }}>/{weeklyGoal}</span>
        </div>
        {/* Progress bar */}
        <div className="mt-1 h-[3px] rounded-full" style={{ background: "#EEEDE8" }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${pct * 100}%`, background: colors.bar }} />
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: "0.5px", background: "rgba(0,0,0,0.06)", margin: "4px 10px" }} />

      {/* kcal */}
      <div className="flex items-center justify-between px-2.5 py-1.5">
        <span style={{ fontSize: 10, color: "#999" }}>kcal</span>
        <span style={{ fontSize: 16, fontWeight: 500, color: "#1A1A1A" }}>{weekCals.toLocaleString()}</span>
      </div>

      {/* Divider */}
      <div style={{ height: "0.5px", background: "rgba(0,0,0,0.06)", margin: "0 10px" }} />

      {/* Distance section */}
      <div className="relative px-2.5 pt-1.5 pb-2.5" onClick={toggleDistUnit} style={{ cursor: "pointer" }}>
        <div className="flex items-center justify-between mb-1">
          <span style={{ fontSize: 10, color: "#999" }}>distance</span>
          <span style={{ fontSize: 10, color: "#6C47FF", fontWeight: 500 }}>↕{distUnit}</span>
        </div>
        <div style={{ fontSize: 16, fontWeight: 500, color: "#1A1A1A" }}>{totalDist}</div>

        {/* Filter pill */}
        {activityNames.length > 1 && (
          <button
            onClick={(e) => { e.stopPropagation(); setDistDropdownOpen((p) => !p); }}
            className="w-full mt-1.5 py-1 rounded-full text-center truncate"
            style={{
              fontSize: 9,
              fontWeight: 600,
              background: distFilter.length > 0 ? "#6C47FF" : "#1a1a1a",
              color: "#fff",
            }}
          >
            {filterLabel}
          </button>
        )}

        {/* Dropdown */}
        {distDropdownOpen && activityNames.length > 1 && (
          <div
            className="absolute left-0 right-0 top-full mt-1 z-50 py-1"
            style={{ background: "#fff", borderRadius: 10, border: "0.5px solid rgba(0,0,0,0.1)", boxShadow: "0 4px 16px rgba(0,0,0,0.1)", minWidth: 140 }}
            onClick={(e) => e.stopPropagation()}
          >
            {activityNames.map((name) => {
              const active = distFilter.includes(name);
              const dist = distByActivity[name] || 0;
              const displayDist = distUnit === "mi" ? (dist * KM_TO_MI).toFixed(1) : dist.toFixed(1);
              const dotColor = ACTIVITY_COLORS[name] || "#999";
              return (
                <button
                  key={name}
                  onClick={(e) => { e.stopPropagation(); toggleActivityFilter(name); }}
                  className="w-full flex items-center gap-1.5 px-2 py-1.5 hover:bg-gray-50"
                >
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: dotColor }} />
                  <span className="flex-1 text-left truncate" style={{ fontSize: 10, fontWeight: 500, color: "#1A1A1A" }}>{name}</span>
                  <span style={{ fontSize: 9, color: "#999" }}>{displayDist}</span>
                  <div
                    className="w-3.5 h-3.5 rounded flex items-center justify-center flex-shrink-0"
                    style={{ border: `1.5px solid ${active ? "#6C47FF" : "#ccc"}`, background: active ? "#6C47FF" : "transparent" }}
                  >
                    {active && <Check size={8} color="#fff" />}
                  </div>
                </button>
              );
            })}
            {distFilter.length > 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); setDistFilter([]); setDistDropdownOpen(false); }}
                className="w-full text-center py-1"
                style={{ fontSize: 9, color: "#6C47FF", fontWeight: 600, borderTop: "0.5px solid rgba(0,0,0,0.05)" }}
              >
                Reset
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

/* ── Quick Add Section ── */
const QuickAddSection = ({ workouts, onAddActivity, onOpenCustomBuilder, onAddWorkouts, selectedDate }: {
  workouts: Workout[]; onAddActivity: (a: typeof MANUAL_ACTIVITIES[0]) => void; onOpenCustomBuilder: () => void; onAddWorkouts: (w: Workout[]) => void; selectedDate: string;
}) => {
  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Quick Add</h3>
        <button onClick={onOpenCustomBuilder} className="text-xs text-primary font-semibold flex items-center gap-1"><Plus size={12} /> Custom</button>
      </div>
      <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-hide" style={{ WebkitOverflowScrolling: "touch" }}>
        {MANUAL_ACTIVITIES.map((act) => (
          <button
            key={act.title}
            onClick={() => onAddActivity(act)}
            className="flex flex-col items-center justify-center w-[68px] h-[68px] rounded-2xl bg-card border border-border hover:border-primary/40 transition-all active:scale-[0.95] flex-shrink-0"
          >
            <span className="text-xl mb-0.5">{act.emoji}</span>
            <span className="text-[10px] font-medium text-muted-foreground">{act.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

/* ── Member filter pills with colors ── */
const MEMBER_PILL_COLORS: Record<string, { active: string; dot: string }> = {};
const getMemberPillColor = (label: string, index: number) => {
  const colors = [
    { active: "border-blue-400/50 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300", dot: "bg-blue-500" },
    { active: "border-green-400/50 bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300", dot: "bg-green-500" },
    { active: "border-pink-400/50 bg-pink-50 dark:bg-pink-950/30 text-pink-700 dark:text-pink-300", dot: "bg-pink-500" },
    { active: "border-purple-400/50 bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300", dot: "bg-purple-500" },
  ];
  return colors[index % colors.length];
};

const USER_BORDER_COLORS = [
  "border-l-blue-400",
  "border-l-green-400",
  "border-l-pink-400",
  "border-l-purple-400",
];

const WorkoutsPage = ({
  onOpenSettings,
  onOpenMore,
  isActive = true,
  navigatedGroupId,
}: { onOpenSettings?: () => void; onOpenMore?: () => void; isActive?: boolean; navigatedGroupId?: string | null } = {}) => {
  const {
    workouts,
    filteredWorkouts,
    filteredPartnerWorkouts,
    toggleWorkout,
    removeWorkout,
    removeWorkoutsByFilter,
    updateWorkout,
    setWorkouts,
    addWorkouts,
    rescheduleWorkout,
    rescheduleWorkoutCascade,
    appleFitnessSyncEnabled,
  } = useAppContext();
  const { user, profile, activeGroup, groups, setActiveGroup } = useAuth();
  const [showCongrats, setShowCongrats] = useState(false);

  // ── Mode toggle state ──
  const [workoutMode, setWorkoutMode] = useState<WorkoutMode>(() => {
    if (navigatedGroupId) return "group";
    return (localStorage.getItem("workout_mode") as WorkoutMode) || "mine";
  });
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(() => {
    if (navigatedGroupId) return navigatedGroupId;
    return localStorage.getItem("workout_selected_group") || null;
  });
  const [memberFilterMap, setMemberFilterMap] = useState<Record<string, Set<string>>>({});

  // Auto-select first workout group if none selected
  const workoutGroups = useMemo(() => groups.filter((g) => g.shared_pages?.includes("workout")), [groups]);
  useEffect(() => {
    if (workoutMode === "group" && (!selectedGroupId || !workoutGroups.find((g) => g.id === selectedGroupId))) {
      if (workoutGroups.length > 0) setSelectedGroupId(workoutGroups[0].id);
    }
  }, [workoutMode, selectedGroupId, workoutGroups]);

  // Persist mode and group
  useEffect(() => { localStorage.setItem("workout_mode", workoutMode); }, [workoutMode]);
  useEffect(() => { if (selectedGroupId) localStorage.setItem("workout_selected_group", selectedGroupId); }, [selectedGroupId]);

  // Handle navigatedGroupId changes
  useEffect(() => {
    if (navigatedGroupId) {
      setWorkoutMode("group");
      setSelectedGroupId(navigatedGroupId);
    }
  }, [navigatedGroupId]);

  const handleGroupSelect = (gid: string) => {
    setSelectedGroupId(gid);
    // Reset member filter when switching groups
    setMemberFilterMap((prev) => ({ ...prev, [gid]: new Set(["__everyone__"]) }));
  };

  const memberFilter = useMemo(
    () => selectedGroupId ? (memberFilterMap[selectedGroupId] ?? new Set(["__everyone__"])) : new Set(["__everyone__"]),
    [selectedGroupId, memberFilterMap]
  );
  const setMemberFilter = useCallback((ids: Set<string>) => {
    if (selectedGroupId) setMemberFilterMap((prev) => ({ ...prev, [selectedGroupId]: ids }));
  }, [selectedGroupId]);

  // Sync activeGroup based on mode
  useEffect(() => {
    if (workoutMode === "mine") {
      setActiveGroup(null);
    } else if (workoutMode === "group" && selectedGroupId) {
      const g = groups.find((g) => g.id === selectedGroupId);
      if (g) setActiveGroup(g);
    }
  }, [workoutMode, selectedGroupId, groups]);

  // Sync new member filter → old userFilterIds for workout data filtering
  useEffect(() => {
    if (workoutMode === "group" && selectedGroupId) {
      const newIds = memberFilter.has("__everyone__")
        ? new Set([EVERYONE_SENTINEL])
        : memberFilter;
      setUserFilterMap((prev) => ({ ...prev, [selectedGroupId]: newIds }));
    }
  }, [workoutMode, selectedGroupId, memberFilter]);
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);
  const [showCustomBuilder, setShowCustomBuilder] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ filter: "all" | "week" | "month" | "date" | "tomorrow"; message: string } | null>(null);
  const [exerciseDeleteConfirm, setExerciseDeleteConfirm] = useState<{ workoutId: string; index: number; exerciseName: string } | null>(null);
  const [editingWorkout, setEditingWorkout] = useState<{ workoutId: string; exerciseIndex: number } | null>(null);
  const [editExName, setEditExName] = useState("");
  const [editExSets, setEditExSets] = useState("");
  const [editExReps, setEditExReps] = useState("");
  const [loggingWorkout, setLoggingWorkout] = useState<Workout | null>(null);
  const [photoPromptWorkout, setPhotoPromptWorkout] = useState<Workout | null>(null);
  const [feedShareWorkout, setFeedShareWorkout] = useState<Workout | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [nudgeCooldown, setNudgeCooldown] = useState<Set<string>>(new Set());
  const [healthKitWorkouts, setHealthKitWorkouts] = useState<Workout[]>([]);
  const [healthKitLoading, setHealthKitLoading] = useState(false);

  const selectedDate = todayStr(); // Main page always shows today

  const fetchHealthKitHistory = useCallback(async () => {
    if (!appleFitnessSyncEnabled || !user?.id) {
      setHealthKitWorkouts([]);
      return;
    }
    setHealthKitLoading(true);
    try {
      const { fetchHealthKitWorkoutHistory90Days } = await import("@/integrations/appleHealth");
      const list = await fetchHealthKitWorkoutHistory90Days(user.id);
      setHealthKitWorkouts(list);
    } catch (e) {
      console.warn("HealthKit workout history:", e);
    } finally {
      setHealthKitLoading(false);
    }
  }, [appleFitnessSyncEnabled, user?.id]);

  useEffect(() => {
    if (!isActive || !appleFitnessSyncEnabled || !user?.id) return;
    void fetchHealthKitHistory();
  }, [isActive, appleFitnessSyncEnabled, user?.id, fetchHealthKitHistory]);

  useEffect(() => {
    let remove: (() => void) | undefined;
    let cancelled = false;
    import("@capacitor/app").then(({ App }) => {
      if (cancelled) return;
      App.addListener("appStateChange", ({ isActive: appActive }) => {
        if (appActive && appleFitnessSyncEnabled && user?.id) void fetchHealthKitHistory();
      }).then((handle) => {
        remove = () => handle.remove();
      });
    });
    return () => {
      cancelled = true;
      remove?.();
    };
  }, [appleFitnessSyncEnabled, fetchHealthKitHistory, user?.id]);

  const [weeklyGoal, setWeeklyGoal] = useState(() => {
    const saved = localStorage.getItem("workout_weekly_goal");
    return saved ? parseInt(saved, 10) : 4;
  });

  const saveGoal = (g: number) => {
    setWeeklyGoal(g);
    localStorage.setItem("workout_weekly_goal", String(g));
  };

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

  // Per-context user filter state
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

  useEffect(() => {
    if (!userFilterMap[contextKey]) {
      setUserFilterMap((prev) => ({ ...prev, [contextKey]: new Set([EVERYONE_SENTINEL]) }));
    }
  }, [contextKey]);

  const isPersonalView = (activeGroup as any)?._personal === true;
  const isAllView = activeGroup === null && !isPersonalView;
  const isGroupView = !!activeGroup && !isPersonalView;

  const allContextWorkouts = useMemo(() => {
    if (isPersonalView) return filteredWorkouts;
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

  const userFilteredWorkouts = useMemo(() => {
    // Mine mode: only show logged-in user's workouts (aggregate personal view)
    if (workoutMode === "mine") {
      return allContextWorkouts.filter((w) => {
        const ownerId = w.ownerUserId || user?.id;
        return ownerId === user?.id;
      });
    }
    if (isPersonalView) return filteredWorkouts;
    if (userFilterIds.has(EVERYONE_SENTINEL)) return allContextWorkouts;
    return allContextWorkouts.filter((w) => {
      const ownerId = w.ownerUserId || user?.id;
      return ownerId && userFilterIds.has(ownerId);
    });
  }, [allContextWorkouts, filteredWorkouts, userFilterIds, isPersonalView, user?.id, workoutMode]);

  const displayWorkouts = useMemo(
    () => mergeAppWorkoutsWithHealthKit(userFilteredWorkouts, healthKitWorkouts, user?.id || ""),
    [userFilteredWorkouts, healthKitWorkouts, user?.id]
  );

  useEffect(() => {
    if (!appleFitnessSyncEnabled) setHealthKitWorkouts([]);
  }, [appleFitnessSyncEnabled]);

  const selectedUserInfos = useMemo(() => {
    const infos: { userId: string; label: string; initial: string; avatarUrl: string | null }[] = [];

    // Mine mode: always single-user (logged-in user only)
    if (workoutMode === "mine") {
      infos.push({ userId: user?.id || "me", label: "Mine", initial: profile?.display_name?.charAt(0)?.toUpperCase() || "?", avatarUrl: profile?.avatar_url || null });
      return infos;
    }

    if (isPersonalView) {
      infos.push({ userId: user?.id || "me", label: "Mine", initial: profile?.display_name?.charAt(0)?.toUpperCase() || "?", avatarUrl: profile?.avatar_url || null });
      return infos;
    }

    const allMembers: { userId: string; label: string; initial: string; avatarUrl: string | null }[] = [];
    allMembers.push({ userId: user?.id || "me", label: "Me", initial: profile?.display_name?.charAt(0)?.toUpperCase() || "?", avatarUrl: profile?.avatar_url || null });

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

    const isEveryone = userFilterIds.has(EVERYONE_SENTINEL);
    for (const m of allMembers) {
      if (isEveryone || userFilterIds.has(m.userId)) infos.push(m);
    }
    return infos;
  }, [user, profile, activeGroup, groups, isPersonalView, isGroupView, isAllView, userFilterIds, workoutMode]);

  const userWorkoutData: UserWorkoutData[] = useMemo(() => {
    return selectedUserInfos.map((u) => ({
      ...u,
      workouts: displayWorkouts.filter((w) => (w.ownerUserId || user?.id) === u.userId),
    }));
  }, [selectedUserInfos, displayWorkouts, user?.id]);

  const isMultiUserView = selectedUserInfos.length > 1;

  const today = todayStr();

  const dateWorkouts = useMemo(() => {
    return displayWorkouts.filter((w) => w.scheduledDate === selectedDate);
  }, [selectedDate, displayWorkouts]);

  const perUserDateWorkouts = useMemo(() => {
    if (!isMultiUserView) return [];
    return selectedUserInfos.map((u) => ({
      ...u,
      workouts: dateWorkouts.filter((w) => (w.ownerUserId || user?.id) === u.userId),
    }));
  }, [isMultiUserView, selectedUserInfos, dateWorkouts, user?.id]);

  const missedWorkouts = useMemo(() => {
    return displayWorkouts.filter((w) => w.ownerUserId === user?.id && w.scheduledDate && w.scheduledDate < today && !w.done);
  }, [displayWorkouts, today, user?.id]);

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
    if (id.startsWith("hk-")) return;
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

  const handleToggleWorkout = (id: string) => {
    if (id.startsWith("hk-")) return;
    const w = workouts.find((w) => w.id === id);
    const isOwnWorkout = !w?.ownerUserId || w.ownerUserId === user?.id;
    if (!isOwnWorkout) return;
    const workout = workouts.find((w) => w.id === id);
    if (workout && !workout.done) {
      setShowCongrats(true);
      if (workout.groupId && !isWorkoutPhotoPromptSuppressed()) {
        setTimeout(() => setPhotoPromptWorkout(workout), 1200);
      }
      // Trigger feed share prompt only when no photo prompt will show (avoid duplicate overlapping modals)
      if (!workout.groupId) {
        const workoutGroups = groups.filter(
          (g) => (workout as any).sharedGroupIds?.includes(g.id)
        );
        if (workoutGroups.length > 0) {
          setTimeout(() => setFeedShareWorkout(workout), 1200);
        }
      }
    }
    toggleWorkout(id);
  };

  const handlePhotoSent = (workoutId: string, photoUrl: string) => {
    updateWorkout(workoutId, { completionPhotoUrl: photoUrl });
  };

  const handleCopyWorkout = async (sourceWorkout: Workout, scheduledDate: string, groupIds?: (string | null)[]) => {
    if (!user) return;
    const contexts = groupIds || [null];
    const existingDupe = workouts.find(
      (w) => w.title === sourceWorkout.title && w.scheduledDate === scheduledDate && !w.ownerUserId
    );
    if (existingDupe) {
      const dateLabel = new Date(scheduledDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      const confirmed = window.confirm(`You already have "${sourceWorkout.title}" on ${dateLabel}. Add again?`);
      if (!confirmed) return;
    }
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

  const [workoutProgress, setWorkoutProgress] = useState<Record<string, { progress: number; cal: number }>>({});

  const handleProgressUpdate = useCallback((workoutId: string, progress: number, cal: number) => {
    setWorkoutProgress(prev => ({ ...prev, [workoutId]: { progress, cal } }));
    updateWorkout(workoutId, { cal });
    if (progress >= 100) {
      const w = workouts.find(w => w.id === workoutId);
      if (w && !w.done) handleToggleWorkout(workoutId);
    }
  }, [workouts, updateWorkout]);

  const handleCaloriesSaved = useCallback((workoutId: string, cal: number) => {
    updateWorkout(workoutId, { cal });
    setWorkoutProgress(prev => ({ ...prev, [workoutId]: { ...prev[workoutId], cal } }));
  }, [updateWorkout]);

  // Sub-pages
  if (showHistory) {
    return (
      <div className="px-5 pb-24 pt-12">
        <ExerciseHistoryPage onBack={() => setShowHistory(false)} />
      </div>
    );
  }

  if (showLog) {
    return (
      <WorkoutLogPage
        workoutsForLog={displayWorkouts}
        onBack={() => setShowLog(false)}
        onRecordWorkout={() => {
          setShowLog(false);
          setShowCustomBuilder(true);
        }}
      />
    );
  }

  const todayFormatted = new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });

  return (
    <div className="px-5 pb-24" style={{ background: "#F4F3F0", minHeight: "100vh" }}>

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

      {/* ── NEW HEADER ── */}
      <header className="pt-12 pb-3 flex items-start justify-between">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1a1a1a", fontFamily: "'DM Sans', sans-serif" }}>Workouts</h1>
          <p style={{ fontSize: 12, color: "#999", marginTop: 2 }}>{todayFormatted}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowLog(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors"
            style={{ background: "transparent", border: "0.5px solid rgba(0,0,0,0.15)", color: "#1a1a1a" }}
          >
            <ClipboardList size={13} />
            Log
          </button>
          {onOpenMore && (
            <button onClick={onOpenMore} className="w-[30px] h-[30px] rounded-full flex items-center justify-center" style={{ background: "#F4F3F0" }} aria-label="More">
              <MoreHorizontal size={15} color="#888" />
            </button>
          )}
        </div>
      </header>

      {/* ── Mode Toggle ── */}
      <ModeToggleBar mode={workoutMode} onModeChange={setWorkoutMode} />

      {/* ── Group Mode layers ── */}
      {workoutMode === "group" && (
        <>
          <GroupPillsRow selectedGroupId={selectedGroupId} onSelectGroup={handleGroupSelect} />
          {selectedGroupId && (
            <MemberSelectorPill
              groupId={selectedGroupId}
              selectedUserIds={memberFilter}
              onSelectionChange={setMemberFilter}
            />
          )}
          {/* Per-member summary cards */}
          {selectedGroupId && (() => {
            const group = groups.find((g) => g.id === selectedGroupId);
            if (!group) return null;
            const memberOptions: MemberOption[] = [];
            if (user) {
              memberOptions.push({
                userId: user.id,
                label: profile?.display_name?.split(" ")[0] || "Me",
                initial: (profile?.display_name || "U")[0].toUpperCase(),
                avatarUrl: profile?.avatar_url || null,
              });
            }
            group.members
              .filter((m: GroupMember) => m.user_id !== user?.id && m.status === "active")
              .forEach((m) => {
                const name = m.display_name || "Member";
                memberOptions.push({
                  userId: m.user_id,
                  label: name.split(" ")[0],
                  initial: name[0].toUpperCase(),
                  avatarUrl: m.avatar_url,
                });
              });
            // Filter to selected members
            const isEveryone = memberFilter.has("__everyone__");
            const visibleMembers = isEveryone ? memberOptions : memberOptions.filter((m) => memberFilter.has(m.userId));
            if (visibleMembers.length <= 1) return null;
            const weekStart = loadWeekStart();
            const startStr = getWeekStartDate(new Date(), weekStart);
            const today = todayStr();
            const memberData = visibleMembers.map((m) => {
              const mWorkouts = allContextWorkouts.filter((w) => (w.ownerUserId || user?.id) === m.userId);
              const weekWorkouts = mWorkouts.filter((w) => w.done && (w.completedDate || w.scheduledDate || "") >= startStr && (w.completedDate || w.scheduledDate || "") <= today);
              return {
                userId: m.userId,
                done: new Set(weekWorkouts.map((w) => w.completedDate || w.scheduledDate!)).size,
                kcal: weekWorkouts.reduce((s, w) => s + (w.cal || 0), 0),
                distance: weekWorkouts.reduce((s, w) => s + (w.distance || 0), 0),
              };
            });
            return <MemberSummaryCards members={visibleMembers} weeklyGoal={weeklyGoal} memberWorkouts={memberData} />;
          })()}
        </>
      )}

      {/* ── Hero Stats Card (Mine mode OR Group mode with single user selected) ── */}
      {(workoutMode === "mine" || (workoutMode === "group" && !isMultiUserView)) && (
        <HeroCard workouts={displayWorkouts} weeklyGoal={weeklyGoal} onGoalChange={saveGoal} />
      )}

        {/* Missed Workouts Banner */}
        {missedWorkouts.length > 0 && (
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

        {/* Quick Add removed */}

        {/* Custom Workout Builder Modal */}
        <CustomWorkoutBuilder
          open={showCustomBuilder}
          onClose={() => setShowCustomBuilder(false)}
          onAdd={addWorkouts}
          selectedDate={selectedDate}
          recentWorkouts={displayWorkouts}
        />

        {/* Today's Workouts Section */}
        <section className="mb-6">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span style={{ fontSize: 17, fontWeight: 500, color: "#1a1a1a", fontFamily: "'DM Sans', sans-serif" }} className="mr-auto">
              Today's workouts
            </span>
            {appleFitnessSyncEnabled && healthKitLoading && (
              <Loader2 size={12} className="animate-spin text-muted-foreground" aria-hidden />
            )}
            <button
              onClick={() => setShowCustomBuilder(true)}
              className="flex items-center gap-1 active:scale-95 transition-transform"
              style={{ fontSize: 10, fontWeight: 500, color: "#1a1a1a", background: "#F4F3F0", border: "0.5px solid rgba(0,0,0,0.09)", borderRadius: 999, padding: "3px 9px" }}
            >
              <Plus size={10} /> Custom
            </button>
            <WorkoutAiSuggest
              selectedDate={selectedDate}
              recentWorkouts={displayWorkouts}
              onAddWorkout={addWorkouts}
            />
          </div>

          {isMultiUserView ? (
            <div className="flex gap-2.5 overflow-x-auto scrollbar-hide pb-1" style={{ WebkitOverflowScrolling: "touch" }}>
              {perUserDateWorkouts.map((section, sectionIdx) => {
                const isOwnSection = section.userId === user?.id;

                const COLUMN_COLORS = [
                  { dot: "#3B82F6", text: "#3B82F6", border: "#3B82F6", avatarBg: "bg-blue-500" },
                  { dot: "#10B981", text: "#10B981", border: "#10B981", avatarBg: "bg-emerald-500" },
                  { dot: "#EC4899", text: "#EC4899", border: "#EC4899", avatarBg: "bg-pink-500" },
                  { dot: "#8B5CF6", text: "#8B5CF6", border: "#8B5CF6", avatarBg: "bg-purple-500" },
                ];
                const colColor = COLUMN_COLORS[sectionIdx % COLUMN_COLORS.length];

                const now = new Date();
                const dayOfWeek = now.getDay();
                const wkStart = new Date(now);
                wkStart.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
                wkStart.setHours(0, 0, 0, 0);
                const weekStartStr = fmtDate(wkStart);
                const weeklyCompleted = displayWorkouts.filter(w =>
                  (w.ownerUserId || user?.id) === section.userId &&
                  w.done && w.completedDate && w.completedDate >= weekStartStr
                ).length;
                const weeklyGoalMet = weeklyCompleted >= weeklyGoal;

                const showNudge = !isOwnSection && section.workouts.length === 0 && !weeklyGoalMet;

                return (
                  <div key={section.userId} className="flex-shrink-0 flex flex-col gap-1.5" style={{ width: 180 }}>
                    {/* Column header */}
                    <div className="flex items-center gap-1.5 mb-0.5">
                      {section.avatarUrl ? (
                        <img src={section.avatarUrl} alt="" className="w-5 h-5 rounded-full object-cover" />
                      ) : (
                        <span className={`w-5 h-5 rounded-full ${colColor.avatarBg} text-white flex items-center justify-center text-[9px] font-bold`}>{section.initial}</span>
                      )}
                      <span className="text-[11px] font-semibold truncate" style={{ color: colColor.text }}>
                        {isOwnSection ? "Mine" : section.label}
                      </span>
                    </div>

                    {/* Workout cards */}
                    {section.workouts.length === 0 ? (
                      <div
                        className="flex flex-col items-center justify-center px-2"
                        style={{
                          minHeight: 72,
                          border: "1.5px dashed rgba(0,0,0,0.12)",
                          borderRadius: 14,
                          background: "rgba(0,0,0,0.015)",
                        }}
                      >
                        <span style={{ fontSize: 11, color: "#999", textAlign: "center" }}>No workout today</span>
                        {showNudge && (
                          <button
                            onClick={() => sendWorkoutNudge(section.userId, section.label)}
                            disabled={nudgeCooldown.has(section.userId)}
                            className="mt-2 flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold transition-colors disabled:opacity-50"
                            style={{ background: "rgba(0,0,0,0.05)", color: colColor.text }}
                          >
                            <Bell size={9} /> Nudge
                          </button>
                        )}
                      </div>
                    ) : (
                      section.workouts.map((w) => {
                        const tagColor = getTagColor(w.tag);
                        return (
                          <WorkoutCard
                            key={w.id}
                            workout={w}
                            onToggle={handleToggleWorkout}
                            onRemove={removeWorkout}
                            onReschedule={handleReschedule}
                            onRescheduleCascade={rescheduleWorkoutCascade}
                            allWorkouts={displayWorkouts}
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
                            readOnly={(!!w.ownerUserId && w.ownerUserId !== user?.id) || w.id.startsWith("hk-")}
                            progress={workoutProgress[w.id]?.progress}
                            onCopyWorkout={handleCopyWorkout}
                            accentBorder={colColor.border}
                            compact
                          />
                        );
                      })
                    )}

                    {/* Goal done indicator */}
                    {weeklyGoalMet && section.workouts.length > 0 && (
                      <span className="text-[10px] font-semibold mt-0.5" style={{ color: colColor.text }}>Goal done 🎉</span>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <>
              {dateWorkouts.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-3xl mb-2">🏋️</p>
                  <p className="text-sm font-medium text-muted-foreground">No workouts today</p>
                  <p className="text-xs text-muted-foreground mt-1">Add one above or get AI suggestions</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {dateWorkouts.map((w) => (
                    <WorkoutCard
                      key={w.id}
                      workout={w}
                      onToggle={handleToggleWorkout}
                      onRemove={removeWorkout}
                      onReschedule={handleReschedule}
                      onRescheduleCascade={rescheduleWorkoutCascade}
                      allWorkouts={displayWorkouts}
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
                      readOnly={(!!w.ownerUserId && w.ownerUserId !== user?.id) || w.id.startsWith("hk-")}
                      progress={workoutProgress[w.id]?.progress}
                      onCopyWorkout={handleCopyWorkout}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      {/* Exercise Detail Dialog */}
      <ExerciseDetailDialog
        exerciseName={selectedExercise}
        onClose={() => setSelectedExercise(null)}
      />

      {/* Workout Photo Sharing Prompt */}
      {photoPromptWorkout && (
        <WorkoutPhotoPrompt
          open={!!photoPromptWorkout}
          workout={photoPromptWorkout}
          onClose={() => setPhotoPromptWorkout(null)}
          onPhotoSent={(url) => handlePhotoSent(photoPromptWorkout.id, url)}
        />
      )}

      {/* Share to Feed Prompt */}
      {feedShareWorkout && (() => {
        const targetGroup = groups.find((g) => g.id === feedShareWorkout.groupId);
        if (!targetGroup) return null;
        const stats: Record<string, string | number> = {};
        if (feedShareWorkout.duration) stats["Duration"] = feedShareWorkout.duration;
        if (feedShareWorkout.cal) stats["Calories"] = feedShareWorkout.cal;
        if (feedShareWorkout.distance) stats["Distance"] = `${feedShareWorkout.distance} ${feedShareWorkout.distanceUnit || "km"}`;
        return (
          <ShareToFeedSheet
            open
            onClose={() => setFeedShareWorkout(null)}
            groupId={targetGroup.id}
            groupName={targetGroup.name}
            userId={user?.id || ""}
            caption={`${feedShareWorkout.emoji} Completed ${feedShareWorkout.title}!`}
            interestTag="workout"
            stats={stats}
          />
        );
      })()}
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
  accentBorder,
  compact,
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
  accentBorder?: string;
  compact?: boolean;
}) => {
  const [showDetail, setShowDetail] = useState(false);
  const [cascadeConfirm, setCascadeConfirm] = useState<{ newDate: string; diffDays: number; followingCount: number } | null>(null);

  const isHealthKitEntry =
    workout.id.startsWith("hk-") || (!!workout.externalId && workout.sourceApp === "apple_health");
  const showDist = (workout.distance ?? 0) > 0;
  const distFmt = showDist ? formatDistanceFromKm(workout.distance) : null;

  const fmtD = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const handleMoveToDate = (date: Date) => {
    if (workout.id.startsWith("hk-")) return;
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
    if (workout.id.startsWith("hk-")) return;
    const base = workout.scheduledDate || fmtD(new Date());
    const d = new Date(base + "T00:00:00");
    d.setDate(d.getDate() + 1);
    handleMoveToDate(d);
  };

  const tagColor = getTagColor(workout.tag);

  return (
    <>
      <AlertDialog open={!!cascadeConfirm} onOpenChange={(open) => { if (!open) setCascadeConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Shift following workouts?</AlertDialogTitle>
            <AlertDialogDescription>
              You're moving this workout by {cascadeConfirm ? Math.abs(cascadeConfirm.diffDays) : 0} day{cascadeConfirm && Math.abs(cascadeConfirm.diffDays) !== 1 ? "s" : ""} {cascadeConfirm && cascadeConfirm.diffDays > 0 ? "forward" : "back"}.
              There {cascadeConfirm?.followingCount === 1 ? "is" : "are"} {cascadeConfirm?.followingCount} upcoming workout{cascadeConfirm?.followingCount !== 1 ? "s" : ""} after this one.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (cascadeConfirm) { onReschedule(workout.id, cascadeConfirm.newDate); setCascadeConfirm(null); } }}
              className="bg-secondary text-foreground hover:bg-secondary/80"
            >Move only this one</AlertDialogAction>
            <AlertDialogAction
              onClick={() => {
                if (cascadeConfirm) {
                  onRescheduleCascade(workout.id, cascadeConfirm.newDate, true);
                  setCascadeConfirm(null);
                  toast.success(`Shifted ${cascadeConfirm.followingCount + 1} workouts`);
                }
              }}
            >Shift all following</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <motion.div
        layout
        className={`overflow-hidden transition-all ${accentBorder ? "border-l-[3px]" : ""}`}
        style={{
          background: "#fff",
          borderRadius: accentBorder ? "0 14px 14px 0" : 14,
          border: "0.5px solid rgba(0,0,0,0.07)",
          ...(accentBorder?.startsWith("#") ? { borderLeftColor: accentBorder, borderLeftWidth: 2.5 } : {}),
        }}
      >
        {compact ? (
          <div style={{ padding: "10px 0 10px 11px" }} className="flex items-center gap-2.5">
            {/* Emoji */}
            <div className="flex-shrink-0 flex items-center justify-center" style={{ width: 32, height: 32, borderRadius: 9, background: "rgba(0,0,0,0.04)" }}>
              <span className="text-base">{workout.emoji}</span>
            </div>

            {/* Body */}
            <div className="flex-1 min-w-0 cursor-pointer py-0.5" onClick={() => setShowDetail(true)}>
              <div className="flex items-center gap-1 min-w-0">
                {isHealthKitEntry && (
                  <span className="text-[11px] shrink-0 leading-none" title="Apple Health">🍎</span>
                )}
                <p style={{ fontSize: 12.5, fontWeight: 600, color: "#1a1a1a", lineHeight: 1.2 }} className="truncate">{workout.title}</p>
              </div>
              <div className="flex items-center gap-1 mt-1 text-[10px]" style={{ color: "#999" }}>
                <Clock size={9} />
                <span>{workout.duration}</span>
                <span className="opacity-50">•</span>
                <Flame size={9} />
                <span>{workout.cal} kcal</span>
              </div>
              {workout.tag && (
                <div className="mt-1.5">
                  <span
                    className="inline-block px-1.5 py-[1px] rounded-full text-[9.5px] font-semibold"
                    style={{ background: "#E5EFFF", color: "#1E5CCC" }}
                  >
                    {workout.tag}
                  </span>
                </div>
              )}
            </div>

            {/* Action zone — vertical divider + circle */}
            <div
              role={readOnly ? undefined : "button"}
              onClick={readOnly ? undefined : (e) => { e.stopPropagation(); onToggle(workout.id); }}
              className={`flex items-center justify-center flex-shrink-0 self-stretch ${readOnly ? "pointer-events-none" : "cursor-pointer"} transition-all`}
              style={{
                width: 38,
                borderLeft: "0.5px solid rgba(0,0,0,0.06)",
                background: "transparent",
              }}
            >
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center transition-all"
                style={{
                  background: workout.done ? "#1a1a1a" : "transparent",
                  border: workout.done ? "none" : "2px solid rgba(0,0,0,0.18)",
                }}
              >
                {workout.done && <Check size={12} color="#fff" />}
              </div>
            </div>
          </div>
        ) : (
        <div style={{ padding: "11px 13px" }} className="flex items-center gap-3">
          {/* Emoji icon in colored square */}
          <div className="flex-shrink-0 flex items-center justify-center" style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(0,0,0,0.04)" }}>
            <span className="text-lg">{workout.emoji}</span>
          </div>

          {/* Card body */}
          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setShowDetail(true)}>
            <div className="flex items-center gap-1.5 min-w-0">
              {isHealthKitEntry && (
                <span className="text-[12px] shrink-0 leading-none" title="Apple Health">🍎</span>
              )}
              <p style={{ fontSize: 13, fontWeight: 500, color: "#1a1a1a" }} className="truncate">{workout.title}</p>
            </div>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ background: "#F4F3F0", color: "#888" }}>
                <Clock size={9} /> {workout.duration}
              </span>
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ background: "#F4F3F0", color: "#888" }}>
                <Flame size={9} /> {workout.cal} kcal
              </span>
              {workout.tag && (
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${tagColor}`}>{workout.tag}</span>
              )}
              {distFmt && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ background: "#F4F3F0", color: "#888" }}>
                  <Footprints size={9} /> {distFmt.value} {distFmt.unit}
                </span>
              )}
              {workout.heartRateAvg != null && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ background: "#F4F3F0", color: "#888" }}>
                  <Heart size={9} /> {workout.heartRateAvg} bpm
                </span>
              )}
            </div>
            {(workout.originType === "imported" || workout.originType === "merged") && (
              <div className="flex items-center gap-1 mt-1">
                <CloudDownload size={10} className="text-primary/70" />
                <span className="text-[10px] font-medium text-primary/70">
                  {workout.sourceApp === "apple_health" ? "Apple Health" : workout.sourceApp === "health_connect" ? "Health Connect" : "Imported"}
                </span>
              </div>
            )}
          </div>

          {/* Completion circle */}
          <div
            role={readOnly ? undefined : "button"}
            onClick={readOnly ? undefined : (e) => { e.stopPropagation(); onToggle(workout.id); }}
            className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${readOnly ? "pointer-events-none" : "cursor-pointer"} transition-all`}
            style={{
              background: workout.done ? "#1a1a1a" : "transparent",
              border: workout.done ? "none" : "2px solid rgba(0,0,0,0.15)",
            }}
          >
            {workout.done && <Check size={14} color="#fff" />}
          </div>
        </div>
        )}
      </motion.div>

      {/* Detail Page (full-screen) */}
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
        fullscreen
        onUpdateTitle={(id, title) => onUpdateWorkout(id, { title })}
        onUpdateEmoji={(id, emoji) => onUpdateWorkout(id, { emoji })}
        onReorderExercises={(id, exercises) => onUpdateWorkout(id, { exercises })}
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
