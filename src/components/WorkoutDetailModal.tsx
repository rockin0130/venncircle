import { useState, useEffect, useCallback, useMemo } from "react";
import { X, Clock, Flame, Footprints, ArrowRight, CalendarDays, Trash2, Dumbbell, Target, Pencil, Plus, Check, ChevronUp, ChevronDown, ArrowLeft, Save } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar } from "@/components/ui/calendar";
import { isCardioWorkout, Workout } from "@/context/AppContext";
import { cn } from "@/lib/utils";
import ExerciseLibrarySheet from "@/components/ExerciseLibrarySheet";
import GroupBadge from "@/components/GroupBadge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import ExerciseHistorySheet from "@/components/ExerciseHistorySheet";

interface WorkoutDetailModalProps {
  workout: Workout;
  open: boolean;
  onClose: () => void;
  onRemove: (id: string) => void;
  onMoveToTomorrow: () => void;
  onMoveToDate: (date: Date) => void;
  onUpdateCalories: (id: string, cal: number) => void;
  onUpdateDuration: (id: string, duration: string) => void;
  onUpdateDistance: (id: string, distance: number, unit: string) => void;
  onEditExercise: (workoutId: string, index: number, ex: { name: string; sets: number; reps: string }) => void;
  onDeleteExercise: (workoutId: string, index: number) => void;
  onAddExercises: (workoutId: string, exercises: { name: string; sets: number; reps: string }[]) => void;
  onLogWorkout: (workout: Workout) => void;
  onSelectExercise: (name: string) => void;
  onProgressUpdate?: (workoutId: string, progress: number, cal: number) => void;
  onCaloriesSaved?: (workoutId: string, cal: number) => void;
  readOnly?: boolean;
  progress?: number;
  onCopyWorkout?: (workout: Workout, scheduledDate: string, groupIds: (string | null)[]) => void;
}

const DISTANCE_ACTIVITIES = ["running", "cycling", "walking", "swimming"];

const hasDistance = (title: string) =>
  DISTANCE_ACTIVITIES.some((t) => title.toLowerCase().includes(t));

// --- Duration helpers ---
/** Parse a duration string like "30 min", "1 hr 30 min", "45 min" into total minutes */
const parseDurationToMinutes = (dur: string): number => {
  const hrMatch = dur.match(/(\d+)\s*hr/i);
  const minMatch = dur.match(/(\d+)\s*min/i);
  let total = 0;
  if (hrMatch) total += parseInt(hrMatch[1]) * 60;
  if (minMatch) total += parseInt(minMatch[1]);
  if (total === 0) {
    const num = parseInt(dur);
    if (!isNaN(num)) total = num;
  }
  return total || 0;
};

/** Format minutes into smart display: "45 min", "1 hr", "1 hr 30 min" */
const formatMinutes = (mins: number): string => {
  if (mins <= 0) return "0 min";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hr`;
  return `${h} hr ${m} min`;
};

// --- Exercise log types ---
interface ExerciseLog {
  id?: string;
  exercise_name: string;
  exercise_index: number;
  set_number: number;
  weight: number;
  unit: "lb" | "kg";
  reps: number;
  completed: boolean;
}

const parseReps = (reps: string): number => {
  const match = reps.match(/\d+/);
  return match ? parseInt(match[0]) : 10;
};

const normalizeExerciseName = (name: string): string =>
  name.replace(/\s*\(.*?\)\s*/g, "").replace(/\s*[-–—]\s*(Strength|Cardio|HIIT|Endurance)$/i, "").trim();

const estimateCalories = (logs: ExerciseLog[], durationStr?: string, tag?: string): number => {
  let total = 0;
  let completedSets = 0;
  for (const l of logs) {
    if (!l.completed) continue;
    completedSets++;
    const weightLb = l.unit === "kg" ? l.weight * 2.20462 : l.weight;
    if (weightLb === 0) {
      total += 4;
    } else {
      const volume = weightLb * l.reps;
      total += volume * 0.0015 + 1.5;
    }
  }
  if (durationStr) {
    const durMatch = durationStr.match(/(\d+)/);
    if (durMatch) {
      const minutes = parseInt(durMatch[1]);
      const isCardio = tag && /cardio|hiit|running|cycling|swimming|boxing/i.test(tag);
      const calPerMin = isCardio ? 8 : 4.5;
      const durationFloor = minutes * calPerMin * (completedSets > 0 ? (completedSets / Math.max(logs.length, 1)) : 0.5);
      total = Math.max(total, durationFloor);
    }
  }
  return Math.round(total);
};

type ModalMode = "overview" | "log";

export default function WorkoutDetailModal({
  workout,
  open,
  onClose,
  onRemove,
  onMoveToTomorrow,
  onMoveToDate,
  onUpdateCalories,
  onUpdateDuration,
  onUpdateDistance,
  onEditExercise,
  onDeleteExercise,
  onAddExercises,
  onLogWorkout,
  onSelectExercise,
  onProgressUpdate,
  onCaloriesSaved,
  readOnly,
  progress,
  onCopyWorkout,
}: WorkoutDetailModalProps) {
  const { user } = useAuth();
  const [mode, setMode] = useState<ModalMode>("overview");
  
  // Overview state
  const [editingCal, setEditingCal] = useState(false);
  const [calInput, setCalInput] = useState(String(workout.cal));
  const [durationMinutes, setDurationMinutes] = useState(parseDurationToMinutes(workout.duration));
  const [editingDist, setEditingDist] = useState(false);
  const [distInput, setDistInput] = useState(String(workout.distance || 0));
  const [distUnit, setDistUnit] = useState(workout.distanceUnit || "km");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showAddLibrary, setShowAddLibrary] = useState(false);

  // Log Weights state
  const [logs, setLogs] = useState<ExerciseLog[]>([]);
  const [weightUnit, setWeightUnit] = useState<"lb" | "kg">("lb");
  const [logSaving, setLogSaving] = useState(false);
  const [expandedExercise, setExpandedExercise] = useState<number | null>(0);
  const [logsLoaded, setLogsLoaded] = useState(false);
  const [calOverride, setCalOverride] = useState<number | null>(null);
  const [historyExercise, setHistoryExercise] = useState<string | null>(null);
  const [lastWeights, setLastWeights] = useState<Record<string, { weight: number; unit: string; sets: { set_number: number; weight: number; reps: number }[] }>>({});

  const isCardio = isCardioWorkout(workout.title);
  const showDist = hasDistance(workout.title);
  const hasExercises = workout.exercises && workout.exercises.length > 0;

  // Reset states when workout changes
  useEffect(() => {
    if (open) {
      setCalInput(String(workout.cal));
      setDurationMinutes(parseDurationToMinutes(workout.duration));
      setDistInput(String(workout.distance || 0));
      setDistUnit(workout.distanceUnit || "km");
      setEditingCal(false);
      setEditingDist(false);
      setShowDatePicker(false);
      setMode("overview");
      setLogsLoaded(false);
      setCalOverride(null);
    }
  }, [open, workout.id]);

  // --- Log Weights data loading ---
  const exercises = workout.exercises || [];

  const fetchLastWeights = useCallback(async () => {
    if (!user || exercises.length === 0) return {};
    const rawNames = exercises.map(e => e.name);
    const normNames = exercises.map(e => normalizeExerciseName(e.name));
    const allNames = [...new Set([...rawNames, ...normNames])];
    const { data } = await supabase
      .from("exercise_logs")
      .select("exercise_name, set_number, weight, unit, reps, logged_date")
      .eq("user_id", user.id)
      .eq("completed", true)
      .in("exercise_name", allNames)
      .order("logged_date", { ascending: false })
      .order("set_number", { ascending: true })
      .limit(500);
    if (!data || data.length === 0) return {};
    const result: Record<string, { weight: number; unit: string; sets: { set_number: number; weight: number; reps: number }[] }> = {};
    for (const row of data) {
      const storedName = row.exercise_name;
      const matchKeys: string[] = [];
      for (const ex of exercises) {
        if (ex.name === storedName || normalizeExerciseName(ex.name) === storedName || normalizeExerciseName(ex.name) === normalizeExerciseName(storedName)) {
          matchKeys.push(ex.name);
        }
      }
      if (matchKeys.length === 0) matchKeys.push(storedName);
      for (const key of matchKeys) {
        if (result[key]) continue;
        const sameDate = data.filter(d => d.exercise_name === storedName && d.logged_date === row.logged_date);
        result[key] = {
          weight: Number(sameDate[0].weight),
          unit: sameDate[0].unit,
          sets: sameDate.map(s => ({ set_number: s.set_number, weight: Number(s.weight), reps: s.reps })),
        };
      }
    }
    return result;
  }, [user, exercises]);

  const loadLogs = useCallback(async () => {
    if (!user || !workout.id || !open) return;
    // For read-only (other user's workout), load the owner's logs
    const logOwnerId = readOnly && workout.ownerUserId ? workout.ownerUserId : user.id;
    const priorWeights = readOnly ? {} : (await fetchLastWeights() || {});
    setLastWeights(priorWeights);
    const { data } = await supabase
      .from("exercise_logs")
      .select("*")
      .eq("workout_id", workout.id)
      .eq("user_id", logOwnerId)
      .order("exercise_index")
      .order("set_number");
    if (data && data.length > 0) {
      setLogs(data.map((d: any) => ({
        id: d.id,
        exercise_name: d.exercise_name,
        exercise_index: d.exercise_index,
        set_number: d.set_number,
        weight: Number(d.weight),
        unit: d.unit as "lb" | "kg",
        reps: d.reps,
        completed: d.completed,
      })));
      setWeightUnit(data[0].unit as "lb" | "kg");
    } else {
      const initial: ExerciseLog[] = [];
      exercises.forEach((ex, idx) => {
        const targetReps = parseReps(ex.reps);
        const prior = priorWeights[ex.name];
        for (let s = 1; s <= ex.sets; s++) {
          const priorSet = prior?.sets?.find(ps => ps.set_number === s);
          initial.push({
            exercise_name: ex.name,
            exercise_index: idx,
            set_number: s,
            weight: priorSet?.weight ?? prior?.weight ?? 0,
            unit: (prior?.unit as "lb" | "kg") ?? weightUnit,
            reps: targetReps,
            completed: false,
          });
        }
      });
      setLogs(initial);
    }
    setLogsLoaded(true);
  }, [user, workout.id, workout.ownerUserId, open, exercises, weightUnit, fetchLastWeights, readOnly]);

  const enterLogMode = useCallback(() => {
    setMode("log");
    if (!logsLoaded) loadLogs();
  }, [logsLoaded, loadLogs]);

  const updateLog = (exerciseIndex: number, setNumber: number, field: keyof ExerciseLog, value: any) => {
    setLogs(prev => prev.map(l =>
      l.exercise_index === exerciseIndex && l.set_number === setNumber
        ? { ...l, [field]: value }
        : l
    ));
  };

  const toggleWeightUnit = () => {
    const newUnit = weightUnit === "lb" ? "kg" : "lb";
    setWeightUnit(newUnit);
    setLogs(prev => prev.map(l => {
      const converted = newUnit === "kg"
        ? Math.round(l.weight * 0.453592 * 10) / 10
        : Math.round(l.weight * 2.20462 * 10) / 10;
      return { ...l, unit: newUnit, weight: l.weight === 0 ? 0 : converted };
    }));
  };

  const { logProgress, estimatedCal } = useMemo(() => {
    if (logs.length === 0) return { logProgress: 0, estimatedCal: 0 };
    const completedSets = logs.filter(l => l.completed).length;
    return {
      logProgress: Math.round((completedSets / logs.length) * 100),
      estimatedCal: estimateCalories(logs, workout.duration, workout.tag),
    };
  }, [logs, workout.duration, workout.tag]);

  const saveLogs = async () => {
    if (!user) return;
    setLogSaving(true);
    try {
      await supabase.from("exercise_logs").delete().eq("workout_id", workout.id).eq("user_id", user.id);
      const rows = logs.map(l => ({
        user_id: user.id,
        workout_id: workout.id,
        exercise_name: l.exercise_name,
        exercise_index: l.exercise_index,
        set_number: l.set_number,
        weight: l.weight,
        unit: l.unit,
        reps: l.reps,
        completed: l.completed,
        logged_date: workout.scheduledDate || new Date().toISOString().slice(0, 10),
      }));
      const { error } = await supabase.from("exercise_logs").insert(rows);
      if (error) throw error;
      const finalCal = calOverride ?? estimatedCal;
      if (onCaloriesSaved) onCaloriesSaved(workout.id, finalCal);
      if (onProgressUpdate) onProgressUpdate(workout.id, logProgress, finalCal);
      toast.success("Workout log saved!");
      setMode("overview");
    } catch (e) {
      console.error("Save error:", e);
      toast.error("Failed to save log");
    } finally {
      setLogSaving(false);
    }
  };

  const getExerciseLogs = (exerciseIndex: number) =>
    logs.filter(l => l.exercise_index === exerciseIndex);

  const getExerciseCompletion = (exerciseIndex: number) => {
    const eLogs = getExerciseLogs(exerciseIndex);
    if (eLogs.length === 0) return 0;
    return Math.round((eLogs.filter(l => l.completed).length / eLogs.length) * 100);
  };

  // --- Overview handlers ---
  const saveCal = () => {
    const val = parseInt(calInput) || 0;
    onUpdateCalories(workout.id, val);
    setEditingCal(false);
  };

  const stepDuration = (delta: number) => {
    const newVal = Math.max(0, durationMinutes + delta);
    setDurationMinutes(newVal);
    onUpdateDuration(workout.id, formatMinutes(newVal));
  };

  const saveDist = () => {
    const val = parseFloat(distInput) || 0;
    onUpdateDistance(workout.id, val, distUnit);
    setEditingDist(false);
  };

  const toggleDistUnit = () => {
    const newUnit = distUnit === "km" ? "mi" : "km";
    const val = parseFloat(distInput) || 0;
    let converted: number;
    if (newUnit === "mi") {
      converted = parseFloat((val * 0.621371).toFixed(2));
    } else {
      converted = parseFloat((val * 1.60934).toFixed(2));
    }
    setDistUnit(newUnit);
    setDistInput(String(converted));
    // Also save the converted value
    onUpdateDistance(workout.id, converted, newUnit);
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] bg-black/60 flex items-end justify-center"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="w-full max-w-md bg-card rounded-t-2xl border-t border-border flex flex-col"
            style={{ maxHeight: "85vh" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Handle bar */}
            <div className="flex justify-center pt-2 pb-1">
              <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 pb-3">
              <div className="flex items-center gap-3">
                {mode === "log" && (
                  <button onClick={() => setMode("overview")} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center mr-1">
                    <ArrowLeft size={16} />
                  </button>
                )}
                <span className="text-3xl">{workout.emoji}</span>
                <div>
                  <h2 className="text-lg font-bold">{workout.title}</h2>
                  <div className="flex items-center gap-2">
                    {workout.tag && (
                      <span className="text-[11px] font-semibold text-tag-work-text bg-tag-work px-2 py-0.5 rounded-md">{workout.tag}</span>
                    )}
                    <GroupBadge groupId={workout.groupId} />
                    {mode === "log" && (
                      <span className="text-[11px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-md">Log Mode</span>
                    )}
                  </div>
                </div>
              </div>
              <button onClick={onClose} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                <X size={16} />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-5 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
              {mode === "overview" ? (
                <OverviewContent
                  workout={workout}
                  showDist={showDist}
                  hasExercises={!!hasExercises}
                  readOnly={readOnly}
                  durationMinutes={durationMinutes}
                  stepDuration={stepDuration}
                  onSaveDurationMinutes={(mins: number) => { setDurationMinutes(mins); onUpdateDuration(workout.id, formatMinutes(mins)); }}
                  editingCal={editingCal}
                  setEditingCal={setEditingCal}
                  calInput={calInput}
                  setCalInput={setCalInput}
                  saveCal={saveCal}
                  editingDist={editingDist}
                  setEditingDist={setEditingDist}
                  distInput={distInput}
                  setDistInput={setDistInput}
                  distUnit={distUnit}
                  toggleDistUnit={toggleDistUnit}
                  saveDist={saveDist}
                  showDatePicker={showDatePicker}
                  setShowDatePicker={setShowDatePicker}
                  showAddLibrary={showAddLibrary}
                  setShowAddLibrary={setShowAddLibrary}
                  onClose={onClose}
                  onRemove={onRemove}
                  onMoveToTomorrow={onMoveToTomorrow}
                  onMoveToDate={onMoveToDate}
                  onEditExercise={onEditExercise}
                  onDeleteExercise={onDeleteExercise}
                  onAddExercises={onAddExercises}
                  onSelectExercise={onSelectExercise}
                  enterLogMode={enterLogMode}
                  onCopyWorkout={onCopyWorkout}
                />
              ) : (
                <LogWeightsContent
                  workout={workout}
                  exercises={exercises}
                  logs={logs}
                  logsLoaded={logsLoaded}
                  weightUnit={weightUnit}
                  toggleWeightUnit={toggleWeightUnit}
                  expandedExercise={expandedExercise}
                  setExpandedExercise={setExpandedExercise}
                  logProgress={logProgress}
                  estimatedCal={estimatedCal}
                  calOverride={calOverride}
                  setCalOverride={setCalOverride}
                  lastWeights={lastWeights}
                  readOnly={readOnly}
                  updateLog={updateLog}
                  getExerciseLogs={getExerciseLogs}
                  getExerciseCompletion={getExerciseCompletion}
                  saveLogs={saveLogs}
                  logSaving={logSaving}
                  setHistoryExercise={setHistoryExercise}
                />
              )}
            </div>

            {/* Exercise Library */}
            {showAddLibrary && (
              <ExerciseLibrarySheet
                open={showAddLibrary}
                onClose={() => setShowAddLibrary(false)}
                onSelectMultiple={(names) => {
                  const newExercises = names.map(name => ({ name, sets: 3, reps: "10" }));
                  onAddExercises(workout.id, newExercises);
                  setShowAddLibrary(false);
                }}
                excludeNames={workout.exercises?.map(e => e.name) || []}
              />
            )}

            {/* Exercise History Sheet */}
            <ExerciseHistorySheet
              open={!!historyExercise}
              onClose={() => setHistoryExercise(null)}
              exerciseName={historyExercise ? normalizeExerciseName(historyExercise) : ""}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ===================== OVERVIEW CONTENT =====================
function OverviewContent({
  workout, showDist, hasExercises, readOnly,
  durationMinutes, stepDuration, onSaveDurationMinutes,
  editingCal, setEditingCal, calInput, setCalInput, saveCal,
  editingDist, setEditingDist, distInput, setDistInput, distUnit, toggleDistUnit, saveDist,
  showDatePicker, setShowDatePicker, showAddLibrary, setShowAddLibrary,
  onClose, onRemove, onMoveToTomorrow, onMoveToDate,
  onEditExercise, onDeleteExercise, onAddExercises, onSelectExercise,
  enterLogMode, onCopyWorkout,
}: any) {
  const [editingDuration, setEditingDuration] = useState(false);
  const [durationText, setDurationText] = useState("");

  const startEditDuration = () => {
    if (readOnly) return;
    setDurationText(formatMinutes(durationMinutes));
    setEditingDuration(true);
  };

  const saveDurationText = () => {
    const parsed = parseDurationToMinutes(durationText);
    if (parsed > 0) {
      onSaveDurationMinutes(parsed);
    }
    setEditingDuration(false);
  };

  return (
    <>
      {/* Metrics Grid */}
      <div className={cn("grid gap-3 mb-5", showDist ? "grid-cols-3" : "grid-cols-2")}>
        {/* Duration - Tap to type + step buttons */}
        <div className="bg-secondary rounded-xl p-3">
          <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
            <Clock size={12} />
            <span className="text-[10px] font-medium uppercase tracking-wider">Duration</span>
          </div>
          {editingDuration && !readOnly ? (
            <input
              value={durationText}
              onChange={(e) => setDurationText(e.target.value)}
              onBlur={saveDurationText}
              onKeyDown={(e: React.KeyboardEvent) => e.key === "Enter" && saveDurationText()}
              autoFocus
              placeholder="e.g. 45 min, 1 hr 30 min"
              className="w-full text-base font-bold bg-transparent outline-none border-b border-primary leading-tight"
            />
          ) : (
            <p
              className={cn("text-base font-bold leading-tight", !readOnly && "cursor-pointer hover:text-primary transition-colors")}
              onClick={startEditDuration}
            >
              {formatMinutes(durationMinutes)}
            </p>
          )}
          {!readOnly && !editingDuration && (
            <div className="flex items-center gap-1 mt-1.5">
              <button
                onClick={() => stepDuration(-5)}
                className="w-7 h-7 rounded-lg bg-background border border-border flex items-center justify-center hover:bg-accent transition-colors active:scale-95"
              >
                <ChevronDown size={14} />
              </button>
              <button
                onClick={() => stepDuration(5)}
                className="w-7 h-7 rounded-lg bg-background border border-border flex items-center justify-center hover:bg-accent transition-colors active:scale-95"
              >
                <ChevronUp size={14} />
              </button>
              <span className="text-[9px] text-muted-foreground ml-1">±5m</span>
            </div>
          )}
        </div>

        {/* Calories */}
        <div
          className="bg-secondary rounded-xl p-3 cursor-pointer hover:bg-secondary/80 transition-colors"
          onClick={() => !readOnly && setEditingCal(true)}
        >
          <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
            <Flame size={12} />
            <span className="text-[10px] font-medium uppercase tracking-wider">Calories</span>
          </div>
          {editingCal && !readOnly ? (
            <div className="flex items-baseline gap-1">
              <input
                type="number"
                inputMode="numeric"
                value={calInput}
                onChange={(e) => setCalInput(e.target.value)}
                onBlur={saveCal}
                onKeyDown={(e: React.KeyboardEvent) => e.key === "Enter" && saveCal()}
                autoFocus
                className="w-16 text-lg font-bold bg-transparent outline-none border-b border-primary"
              />
              <span className="text-xs text-muted-foreground">cal</span>
            </div>
          ) : (
            <p className="text-lg font-bold">{workout.cal} <span className="text-xs font-normal text-muted-foreground">cal</span></p>
          )}
        </div>

        {/* Distance (cardio only) */}
        {showDist && (
          <div
            className="bg-secondary rounded-xl p-3 cursor-pointer hover:bg-secondary/80 transition-colors"
            onClick={() => !readOnly && setEditingDist(true)}
          >
            <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
              <Footprints size={12} />
              <span className="text-[10px] font-medium uppercase tracking-wider">Distance</span>
            </div>
            {editingDist && !readOnly ? (
              <div className="flex items-baseline gap-1">
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={distInput}
                  onChange={(e) => setDistInput(e.target.value)}
                  onBlur={saveDist}
                  onKeyDown={(e: React.KeyboardEvent) => e.key === "Enter" && saveDist()}
                  autoFocus
                  className="w-14 text-lg font-bold bg-transparent outline-none border-b border-primary"
                />
                <button onClick={(e) => { e.stopPropagation(); toggleDistUnit(); }} className="text-xs text-primary font-semibold">
                  {distUnit}
                </button>
              </div>
            ) : (
              <div className="flex items-baseline gap-1">
                <p className="text-lg font-bold">{workout.distance || 0}</p>
                <button
                  onClick={(e) => { e.stopPropagation(); toggleDistUnit(); }}
                  className="text-xs text-primary font-semibold"
                >
                  {distUnit}
                </button>
              </div>
            )}
            {/* km/mi toggle pill */}
            {!readOnly && (
              <div className="flex mt-1.5">
                <button
                  onClick={(e) => { e.stopPropagation(); if (distUnit !== "km") toggleDistUnit(); }}
                  className={cn(
                    "text-[10px] font-semibold px-2 py-0.5 rounded-l-md border transition-colors",
                    distUnit === "km"
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:bg-accent"
                  )}
                >
                  km
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); if (distUnit !== "mi") toggleDistUnit(); }}
                  className={cn(
                    "text-[10px] font-semibold px-2 py-0.5 rounded-r-md border-t border-b border-r transition-colors",
                    distUnit === "mi"
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:bg-accent"
                  )}
                >
                  mi
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Exercises Section (strength workouts) */}
      {hasExercises && (
        <div className="mb-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold flex items-center gap-2">
              <Dumbbell size={14} className="text-primary" />
              Exercises ({workout.exercises!.length})
            </h3>
            <div className="flex gap-2">
              {!readOnly && (
                <button
                  onClick={() => setShowAddLibrary(true)}
                  className="text-xs text-primary font-semibold flex items-center gap-1"
                >
                  <Plus size={12} /> Add
                </button>
              )}
              <button
                onClick={enterLogMode}
                className="text-xs text-primary font-semibold flex items-center gap-1 bg-primary/10 px-2.5 py-1 rounded-lg"
              >
                <Dumbbell size={12} /> {readOnly ? "View Weights" : "Log Weights"}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            {workout.exercises!.map((ex: any, i: number) => (
              <div key={i} className="flex items-center gap-3 p-2.5 rounded-xl bg-secondary group">
                <button
                  onClick={() => onSelectExercise(ex.name)}
                  className="flex items-center gap-3 flex-1 min-w-0 text-left hover:opacity-80 transition-opacity"
                >
                  <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{ex.name}</p>
                    <p className="text-xs text-muted-foreground">{ex.sets} sets × {ex.reps}</p>
                  </div>
                </button>
                {!readOnly && (
                  <div className="flex gap-1">
                    <button
                      onClick={() => onEditExercise(workout.id, i, ex)}
                      className="p-1.5 rounded-md hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      onClick={() => onDeleteExercise(workout.id, i)}
                      className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add to My Workouts (read-only / other user's workout) */}
      {readOnly && onCopyWorkout && (
        <CopyWorkoutSection workout={workout} onCopyWorkout={onCopyWorkout} onClose={onClose} />
      )}

      {/* Actions */}
      {!readOnly && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Actions</h3>

          <button
            onClick={() => { onMoveToTomorrow(); onClose(); }}
            className="flex w-full items-center gap-3 px-4 py-3 rounded-xl bg-secondary hover:bg-secondary/80 transition-colors"
          >
            <ArrowRight size={16} className="text-muted-foreground" />
            <span className="text-sm font-medium">Move to tomorrow</span>
          </button>

          <button
            onClick={() => setShowDatePicker(!showDatePicker)}
            className="flex w-full items-center gap-3 px-4 py-3 rounded-xl bg-secondary hover:bg-secondary/80 transition-colors"
          >
            <CalendarDays size={16} className="text-muted-foreground" />
            <span className="text-sm font-medium">Move to another date</span>
          </button>

          {showDatePicker && (
            <div className="rounded-xl border border-border overflow-hidden">
              <Calendar
                mode="single"
                onSelect={(date) => {
                  if (date) {
                    onMoveToDate(date);
                    setShowDatePicker(false);
                    onClose();
                  }
                }}
                className="p-3"
              />
            </div>
          )}

          <button
            onClick={() => { onRemove(workout.id); onClose(); }}
            className="flex w-full items-center gap-3 px-4 py-3 rounded-xl bg-destructive/5 hover:bg-destructive/10 text-destructive transition-colors"
          >
            <Trash2 size={16} />
            <span className="text-sm font-medium">Delete workout</span>
          </button>
        </div>
      )}
    </>
  );
}

// ===================== COPY WORKOUT SECTION =====================
function CopyWorkoutSection({ workout, onCopyWorkout, onClose }: { workout: Workout; onCopyWorkout: (workout: Workout, scheduledDate: string, groupIds: (string | null)[]) => void; onClose: () => void }) {
  const { user, groups } = useAuth();
  const [showSheet, setShowSheet] = useState(false);
  const [whenOption, setWhenOption] = useState<"today" | "tomorrow" | "other">("today");
  const [customDate, setCustomDate] = useState<Date | undefined>(undefined);
  
  const workoutGroups = useMemo(
    () => groups.filter((g) => g.shared_pages?.includes("workout")),
    [groups]
  );

  // Determine the current group from the workout being viewed
  const currentGroupId = workout.groupId || null;

  // Selected group IDs (Personal=null is always included implicitly)
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    if (currentGroupId) initial.add(currentGroupId);
    return initial;
  });

  // Reset when sheet opens
  useEffect(() => {
    if (showSheet) {
      setWhenOption("today");
      setCustomDate(undefined);
      const initial = new Set<string>();
      if (currentGroupId) initial.add(currentGroupId);
      setSelectedGroupIds(initial);
    }
  }, [showSheet, currentGroupId]);

  const todayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const tomorrowStr = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const getScheduledDate = (): string | null => {
    if (whenOption === "today") return todayStr();
    if (whenOption === "tomorrow") return tomorrowStr();
    if (whenOption === "other" && customDate) {
      const y = customDate.getFullYear();
      const m = String(customDate.getMonth() + 1).padStart(2, "0");
      const d = String(customDate.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
    return null;
  };

  const toggleGroup = (groupId: string) => {
    setSelectedGroupIds(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const handleConfirm = () => {
    const dateStr = getScheduledDate();
    if (!dateStr) {
      toast.error("Please select a date");
      return;
    }
    // Build group IDs: null (Personal) + any selected groups
    const groupIds: (string | null)[] = [null, ...Array.from(selectedGroupIds)];
    onCopyWorkout(workout, dateStr, groupIds);
    setShowSheet(false);
    onClose();
  };

  const formatDateLabel = (dateStr: string) => {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  };

  return (
    <>
      {/* Single Add button */}
      <div className="mb-5">
        <button
          onClick={() => setShowSheet(true)}
          className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
        >
          <Plus size={16} />
          Add to My Workouts
        </button>
      </div>

      {/* Bottom sheet */}
      <AnimatePresence>
        {showSheet && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[130] bg-black/60 flex items-end justify-center"
            onClick={() => setShowSheet(false)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="w-full max-w-md bg-card rounded-t-2xl border-t border-border"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-center pt-2 pb-1">
                <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
              </div>

              <div className="px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
                <h3 className="text-lg font-bold mb-4">Add to My Workouts</h3>

                {/* When section */}
                <div className="mb-4">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">When</label>
                  <div className="flex gap-2 mt-1.5">
                    {(["today", "tomorrow", "other"] as const).map((opt) => (
                      <button
                        key={opt}
                        onClick={() => setWhenOption(opt)}
                        className={cn(
                          "flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all border",
                          whenOption === opt
                            ? "border-primary bg-primary text-primary-foreground shadow-sm"
                            : "border-border bg-secondary text-muted-foreground hover:border-primary/30"
                        )}
                      >
                        {opt === "today" ? "Today" : opt === "tomorrow" ? "Tomorrow" : "Other"}
                      </button>
                    ))}
                  </div>
                  {whenOption === "other" && (
                    <div className="mt-2 rounded-xl border border-border overflow-hidden">
                      <Calendar
                        mode="single"
                        selected={customDate}
                        onSelect={setCustomDate}
                        className="p-3 pointer-events-auto"
                      />
                    </div>
                  )}
                </div>

                {/* Add to section */}
                {workoutGroups.length > 0 && (
                  <div className="mb-4">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Add to</label>
                    <div className="flex gap-1.5 flex-wrap mt-1.5">
                      {/* Personal pill — always selected and locked */}
                      <div
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border border-primary bg-primary text-primary-foreground shadow-sm cursor-default opacity-90"
                        title="Personal is always included"
                      >
                        <span className="text-sm leading-none">👤</span>
                        <span>Personal</span>
                      </div>

                      {/* Group pills */}
                      {workoutGroups.map((group) => (
                        <button
                          key={group.id}
                          type="button"
                          onClick={() => toggleGroup(group.id)}
                          className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border",
                            selectedGroupIds.has(group.id)
                              ? "border-primary bg-primary text-primary-foreground shadow-sm"
                              : "border-border bg-card text-muted-foreground hover:border-primary/30"
                          )}
                        >
                          <span className="text-sm leading-none">{group.emoji}</span>
                          <span className="truncate max-w-[120px]">{group.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Confirm button */}
                <button
                  onClick={handleConfirm}
                  disabled={whenOption === "other" && !customDate}
                  className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-all"
                >
                  Add Workout
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ===================== LOG WEIGHTS CONTENT =====================
function LogWeightsContent({
  workout, exercises, logs, logsLoaded, weightUnit, toggleWeightUnit,
  expandedExercise, setExpandedExercise, logProgress, estimatedCal,
  calOverride, setCalOverride, lastWeights, readOnly,
  updateLog, getExerciseLogs, getExerciseCompletion,
  saveLogs, logSaving, setHistoryExercise,
}: any) {
  const [editingCal, setEditingCal] = useState(false);
  const displayCal = calOverride ?? estimatedCal;

  return (
    <>
      {/* Progress + Unit toggle */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground">
            {workout.scheduledDate
              ? new Date(workout.scheduledDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
              : "Today"}
          </span>
          {!readOnly && (
            <button
              onClick={toggleWeightUnit}
              className="px-3 py-1 rounded-full text-xs font-semibold bg-secondary text-foreground border border-border hover:bg-accent transition-colors"
            >
              {weightUnit === "lb" ? "lb → kg" : "kg → lb"}
            </button>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-semibold">{logProgress}%</span>
          </div>
          <div className="w-full h-2.5 rounded-full bg-secondary overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-habit-green"
              initial={{ width: 0 }}
              animate={{ width: `${logProgress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Flame size={12} className="text-orange-500" />
              {editingCal ? (
                <input
                  type="number"
                  value={calOverride ?? estimatedCal}
                  onChange={(e) => setCalOverride(parseInt(e.target.value) || 0)}
                  onBlur={() => setEditingCal(false)}
                  onKeyDown={(e: React.KeyboardEvent) => e.key === "Enter" && setEditingCal(false)}
                  autoFocus
                  className="w-16 text-center bg-secondary rounded px-1 py-0.5 outline-none border border-primary text-foreground text-xs"
                />
              ) : (
                <button
                  onClick={() => !readOnly && setEditingCal(true)}
                  className="hover:text-foreground transition-colors"
                >
                  ~{displayCal} cal estimated
                  {!readOnly && <Pencil size={9} className="inline ml-1 opacity-50" />}
                </button>
              )}
            </div>
            <span className="text-xs text-muted-foreground">
              {logs.filter((l: ExerciseLog) => l.completed).length}/{logs.length} sets
            </span>
          </div>
        </div>
      </div>

      {/* Exercise logging */}
      <div className="space-y-3">
        {!logsLoaded ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : exercises.map((ex: any, idx: number) => {
          const eLogs = getExerciseLogs(idx);
          const completion = getExerciseCompletion(idx);
          const isExpanded = expandedExercise === idx;
          const prior = lastWeights[ex.name];

          return (
            <div key={idx} className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="flex items-center gap-3 p-3">
                <button
                  onClick={() => setExpandedExercise(isExpanded ? null : idx)}
                  className="flex items-center gap-3 flex-1 min-w-0 text-left hover:bg-secondary/50 transition-colors rounded-lg"
                >
                  <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{ex.name}</p>
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-muted-foreground">{ex.sets}×{ex.reps} target</p>
                      {prior && (
                        <span className="text-[10px] text-muted-foreground/70">
                          · Last: {prior.weight} {prior.unit}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setHistoryExercise(ex.name); }}
                  className="w-7 h-7 rounded-lg bg-secondary flex items-center justify-center hover:bg-accent transition-colors flex-shrink-0"
                  title="View history"
                >
                  <Clock size={14} className="text-muted-foreground" />
                </button>
                {completion > 0 && (
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${
                    completion === 100
                      ? "bg-habit-green/20 text-habit-green"
                      : "bg-primary/10 text-primary"
                  }`}>
                    {completion}%
                  </span>
                )}
                <button
                  onClick={() => setExpandedExercise(isExpanded ? null : idx)}
                  className="flex-shrink-0"
                >
                  <ChevronDown size={16} className={`text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                </button>
              </div>

              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="px-3 pb-3">
                      <div className="grid grid-cols-[32px_1fr_1fr_40px] gap-2 mb-1.5 px-1">
                        <span className="text-[10px] font-medium text-muted-foreground text-center">Set</span>
                        <span className="text-[10px] font-medium text-muted-foreground text-center">Weight ({weightUnit})</span>
                        <span className="text-[10px] font-medium text-muted-foreground text-center">Reps</span>
                        <span className="text-[10px] font-medium text-muted-foreground text-center">✓</span>
                      </div>

                      {eLogs.map((log: ExerciseLog) => (
                        <div
                          key={`${idx}-${log.set_number}`}
                          className={`grid grid-cols-[32px_1fr_1fr_40px] gap-2 items-center py-1.5 rounded-lg transition-colors ${
                            log.completed ? "bg-habit-green/5" : ""
                          }`}
                        >
                          <span className="text-xs font-bold text-center text-muted-foreground">
                            {log.set_number}
                          </span>
                          <input
                            type="number"
                            inputMode="decimal"
                            value={log.weight || ""}
                            placeholder="0"
                            onChange={e => updateLog(idx, log.set_number, "weight", parseFloat(e.target.value) || 0)}
                            disabled={readOnly}
                            className="w-full text-center text-sm font-medium bg-secondary rounded-lg py-2 outline-none border border-border focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all disabled:opacity-50"
                          />
                          <input
                            type="number"
                            inputMode="numeric"
                            value={log.reps || ""}
                            placeholder="0"
                            onChange={e => updateLog(idx, log.set_number, "reps", parseInt(e.target.value) || 0)}
                            disabled={readOnly}
                            className="w-full text-center text-sm font-medium bg-secondary rounded-lg py-2 outline-none border border-border focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all disabled:opacity-50"
                          />
                          <div className="flex justify-center">
                            <button
                              onClick={() => !readOnly && updateLog(idx, log.set_number, "completed", !log.completed)}
                              disabled={readOnly}
                              className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all ${
                                log.completed
                                  ? "bg-habit-green border-habit-green"
                                  : "border-muted-foreground/30 hover:border-primary"
                              }`}
                            >
                              {log.completed && <Check size={12} className="text-primary-foreground" />}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {/* Save button */}
      {!readOnly && (
        <div className="pt-4 pb-2">
          <button
            onClick={saveLogs}
            disabled={logSaving}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-all"
          >
            {logSaving ? (
              <div className="animate-spin w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full" />
            ) : (
              <>
                <Save size={16} />
                Save Workout Log
              </>
            )}
          </button>
        </div>
      )}
    </>
  );
}
