import { useState, useEffect, useCallback, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Check, Save, ChevronDown, Pencil, Flame, Clock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ExerciseHistorySheet from "./ExerciseHistorySheet";

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

interface Exercise {
  name: string;
  sets: number;
  reps: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  workoutId: string;
  workoutTitle: string;
  workoutEmoji: string;
  workoutDuration?: string;
  workoutTag?: string;
  currentCal?: number;
  exercises: Exercise[];
  scheduledDate?: string;
  readOnly?: boolean;
  onProgressUpdate?: (progress: number, estimatedCal: number) => void;
  onCaloriesSaved?: (cal: number) => void;
}

const parseReps = (reps: string): number => {
  const match = reps.match(/\d+/);
  return match ? parseInt(match[0]) : 10;
};

/** Strip parenthetical suffixes and extra whitespace from exercise names for matching */
const normalizeExerciseName = (name: string): string =>
  name.replace(/\s*\(.*?\)\s*/g, "").replace(/\s*[-–—]\s*(Strength|Cardio|HIIT|Endurance)$/i, "").trim();

/**
 * Smarter calorie estimation using workout volume, exercise intensity,
 * and duration-based MET estimates.
 *
 * Model:
 * - Weighted exercises: calories ≈ totalVolume(lb) × 0.0015 + completedSets × 1.5
 *   (volume = weight × reps; the per-set base accounts for rest-period metabolism)
 * - Bodyweight exercises: ~4 cal per set (moderate calisthenics MET ~3.5)
 * - Duration fallback: if duration string is available, add MET-based base calories
 *   (~5 cal/min for strength, ~8 cal/min for cardio/HIIT)
 */
const estimateCalories = (logs: ExerciseLog[], durationStr?: string, tag?: string): number => {
  let total = 0;
  let completedSets = 0;

  for (const l of logs) {
    if (!l.completed) continue;
    completedSets++;
    const weightLb = l.unit === "kg" ? l.weight * 2.20462 : l.weight;

    if (weightLb === 0) {
      // Bodyweight: ~4 cal per set (push-ups, pull-ups, etc.)
      total += 4;
    } else {
      // Volume-based: weight × reps gives total volume
      const volume = weightLb * l.reps;
      // ~0.0015 cal per lb of volume + 1.5 cal base metabolic cost per set
      total += volume * 0.0015 + 1.5;
    }
  }

  // Duration-based floor: ensure estimate isn't unreasonably low
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

const ExerciseLogModal = ({ open, onClose, workoutId, workoutTitle, workoutEmoji, workoutDuration, workoutTag, currentCal, exercises, scheduledDate, readOnly, onProgressUpdate, onCaloriesSaved }: Props) => {
  const { user } = useAuth();
  const [logs, setLogs] = useState<ExerciseLog[]>([]);
  const [unit, setUnit] = useState<"lb" | "kg">("lb");
  const [saving, setSaving] = useState(false);
  const [expandedExercise, setExpandedExercise] = useState<number | null>(0);
  const [loaded, setLoaded] = useState(false);
  const [calOverride, setCalOverride] = useState<number | null>(null);
  const [editingCal, setEditingCal] = useState(false);
  const [historyExercise, setHistoryExercise] = useState<string | null>(null);
  const [lastWeights, setLastWeights] = useState<Record<string, { weight: number; unit: string; sets: { set_number: number; weight: number; reps: number }[] }>>({}); 

  // Build a map from normalized name → original exercise name(s)
  const normalizedNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const ex of exercises) {
      map[normalizeExerciseName(ex.name)] = ex.name;
    }
    return map;
  }, [exercises]);

  // Fetch most recent weights for each exercise name (for prefilling)
  const fetchLastWeights = useCallback(async () => {
    if (!user || exercises.length === 0) return;
    // Use both raw and normalized names to maximize matching
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

    // Key result by BOTH the raw stored name and map it back to the original exercise name
    const result: Record<string, { weight: number; unit: string; sets: { set_number: number; weight: number; reps: number }[] }> = {};
    for (const row of data) {
      const storedName = row.exercise_name;
      // Find which exercise(s) this matches
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
    if (!user || !workoutId || !open) return;

    // Fetch prior weights first
    const priorWeights = await fetchLastWeights() || {};
    setLastWeights(priorWeights);

    const { data } = await supabase
      .from("exercise_logs")
      .select("*")
      .eq("workout_id", workoutId)
      .eq("user_id", user.id)
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
      setUnit(data[0].unit as "lb" | "kg");
    } else {
      // Build initial logs with prefilled weights
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
            unit: (prior?.unit as "lb" | "kg") ?? unit,
            reps: targetReps,
            completed: false,
          });
        }
      });
      setLogs(initial);
    }
    setLoaded(true);
  }, [user, workoutId, open, exercises, unit, fetchLastWeights]);

  useEffect(() => {
    if (open) {
      setLoaded(false);
      setCalOverride(currentCal ?? null);
      setEditingCal(false);
      loadLogs();
    }
  }, [open, loadLogs]);

  useEffect(() => {
    if (!open || editingCal || currentCal === undefined || currentCal === null) return;
    setCalOverride(currentCal);
  }, [open, editingCal, currentCal]);

  // Calculate progress and calories
  const { progress, estimatedCal } = useMemo(() => {
    if (logs.length === 0) return { progress: 0, estimatedCal: 0 };
    const completedSets = logs.filter(l => l.completed).length;
    const totalSets = logs.length;
    return {
      progress: Math.round((completedSets / totalSets) * 100),
      estimatedCal: estimateCalories(logs, workoutDuration, workoutTag),
    };
  }, [logs]);

  // Notify parent of progress + estimated calories (single shared source)
  useEffect(() => {
    if (loaded && onProgressUpdate) {
      onProgressUpdate(progress, calOverride ?? estimatedCal);
    }
  }, [progress, estimatedCal, calOverride, loaded, onProgressUpdate]);

  const updateLog = (exerciseIndex: number, setNumber: number, field: keyof ExerciseLog, value: any) => {
    setLogs(prev => prev.map(l =>
      l.exercise_index === exerciseIndex && l.set_number === setNumber
        ? { ...l, [field]: value }
        : l
    ));
  };

  const toggleUnit = () => {
    const newUnit = unit === "lb" ? "kg" : "lb";
    setUnit(newUnit);
    setLogs(prev => prev.map(l => {
      const converted = newUnit === "kg"
        ? Math.round(l.weight * 0.453592 * 10) / 10
        : Math.round(l.weight * 2.20462 * 10) / 10;
      return { ...l, unit: newUnit, weight: l.weight === 0 ? 0 : converted };
    }));
  };

  const saveLogs = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await supabase.from("exercise_logs").delete().eq("workout_id", workoutId).eq("user_id", user.id);
      const rows = logs.map(l => ({
        user_id: user.id,
        workout_id: workoutId,
        exercise_name: l.exercise_name,
        exercise_index: l.exercise_index,
        set_number: l.set_number,
        weight: l.weight,
        unit: l.unit,
        reps: l.reps,
        completed: l.completed,
        logged_date: scheduledDate || new Date().toISOString().slice(0, 10),
      }));
      const { error } = await supabase.from("exercise_logs").insert(rows);
      if (error) throw error;
      // Sync final calorie value back to the workout card
      const finalCal = calOverride ?? estimateCalories(logs, workoutDuration, workoutTag);
      if (onCaloriesSaved) onCaloriesSaved(finalCal);
      toast.success("Workout log saved!");
      onClose();
    } catch (e) {
      console.error("Save error:", e);
      toast.error("Failed to save log");
    } finally {
      setSaving(false);
    }
  };

  const getExerciseLogs = (exerciseIndex: number) =>
    logs.filter(l => l.exercise_index === exerciseIndex);

  const getExerciseCompletion = (exerciseIndex: number) => {
    const eLogs = getExerciseLogs(exerciseIndex);
    if (eLogs.length === 0) return 0;
    return Math.round((eLogs.filter(l => l.completed).length / eLogs.length) * 100);
  };

  const displayCal = calOverride ?? estimatedCal;

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md max-h-[90vh] p-0 gap-0">
        <DialogHeader className="p-4 pb-3 border-b border-border">
          <DialogTitle className="flex items-center gap-2 text-base">
            <span className="text-xl">{workoutEmoji}</span>
            {workoutTitle}
          </DialogTitle>
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-muted-foreground">
              {scheduledDate
                ? new Date(scheduledDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
                : "Today"}
            </span>
            {!readOnly && (
              <button
                onClick={toggleUnit}
                className="px-3 py-1 rounded-full text-xs font-semibold bg-secondary text-foreground border border-border hover:bg-accent transition-colors"
              >
                {unit === "lb" ? "lb → kg" : "kg → lb"}
              </button>
            )}
          </div>

          {/* Progress bar + calories */}
          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-semibold">{progress}%</span>
            </div>
            <div className="w-full h-2.5 rounded-full bg-secondary overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-habit-green"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
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
                    onKeyDown={(e) => e.key === "Enter" && setEditingCal(false)}
                    autoFocus
                    className="w-16 text-center bg-secondary rounded px-1 py-0.5 outline-none border border-primary text-foreground text-xs"
                  />
                ) : (
                  <button
                    onClick={() => !readOnly && setEditingCal(true)}
                    className="hover:text-foreground transition-colors"
                    title="Click to edit calories"
                  >
                    ~{displayCal} cal estimated
                    {!readOnly && <Pencil size={9} className="inline ml-1 opacity-50" />}
                  </button>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                {logs.filter(l => l.completed).length}/{logs.length} sets
              </span>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[55vh]">
          <div className="p-4 space-y-3">
            {!loaded ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
              </div>
            ) : exercises.map((ex, idx) => {
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
                            <span className="text-[10px] font-medium text-muted-foreground text-center">Weight ({unit})</span>
                            <span className="text-[10px] font-medium text-muted-foreground text-center">Reps</span>
                            <span className="text-[10px] font-medium text-muted-foreground text-center">✓</span>
                          </div>

                          {eLogs.map((log) => (
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
        </ScrollArea>

        {!readOnly && (
          <div className="p-4 border-t border-border">
            <button
              onClick={saveLogs}
              disabled={saving}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-all"
            >
              {saving ? (
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
      </DialogContent>

      <ExerciseHistorySheet
        open={!!historyExercise}
        onClose={() => setHistoryExercise(null)}
        exerciseName={historyExercise ? normalizeExerciseName(historyExercise) : ""}
      />
    </Dialog>
  );
};

export default ExerciseLogModal;
