import { useState, useEffect, useMemo, useCallback } from "react";
import { X, Plus, Trash2, Search, Dumbbell, ChevronDown, ChevronUp, Timer, Flame, MapPin, Activity } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { WorkoutType as HealthWorkoutType } from "@capgo/capacitor-health";
import { Workout } from "@/context/AppContext";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { canonicalExerciseName } from "@/lib/exerciseLibrary";
import { getAllHealthKitWorkoutOptions } from "@/lib/healthKitWorkoutTypes";
import ExerciseLibrarySheet from "@/components/ExerciseLibrarySheet";
import WorkoutContextSelector, { PERSONAL_ID } from "@/components/WorkoutContextSelector";

interface ExerciseEntry {
  name: string;
  sets: number;
  reps: string;
  weight: string;
  unit: "lb" | "kg";
}

type WorkoutType = "strength" | "activity" | null;
type Step = "type" | "exercises" | "activity-details";

interface CustomWorkoutBuilderProps {
  open: boolean;
  onClose: () => void;
  onAdd: (workouts: Workout[]) => void;
  selectedDate: string;
  recentWorkouts?: Workout[];
}

const CustomWorkoutBuilder = ({ open, onClose, onAdd, selectedDate, recentWorkouts = [] }: CustomWorkoutBuilderProps) => {
  const { user, activeGroup, groups } = useAuth();
  const [step, setStep] = useState<Step>("type");
  const [title, setTitle] = useState("");
  const [workoutType, setWorkoutType] = useState<WorkoutType>(null);

  // Strength state
  const [exercises, setExercises] = useState<ExerciseEntry[]>([]);
  const [showLibrary, setShowLibrary] = useState(false);
  const [expandedEx, setExpandedEx] = useState<number | null>(null);
  const [priorWeights, setPriorWeights] = useState<Record<string, { weight: number; unit: string }>>({});

  // Activity state
  const [activityDuration, setActivityDuration] = useState("");
  const [activityCal, setActivityCal] = useState("");
  const [activityDistance, setActivityDistance] = useState("");
  const [activityDistanceUnit, setActivityDistanceUnit] = useState<"mi" | "km">("mi");
  const [activityEmoji, setActivityEmoji] = useState("🏃");
  const [activitySearch, setActivitySearch] = useState("");
  const [activityHealthKitType, setActivityHealthKitType] = useState<HealthWorkoutType | null>(null);

  const healthKitActivityOptions = useMemo(() => getAllHealthKitWorkoutOptions(), []);

  // Context selector state — Personal always included
  const isPersonalActive = (activeGroup as any)?._personal === true;
  const defaultContexts = useMemo(() => {
    if (!activeGroup || isPersonalActive) return [PERSONAL_ID];
    return [PERSONAL_ID, activeGroup.id];
  }, [activeGroup, isPersonalActive]);
  const [selectedContexts, setSelectedContexts] = useState<string[]>(defaultContexts);

  // Reset contexts when modal opens
  useEffect(() => {
    if (open) setSelectedContexts(defaultContexts);
  }, [open, defaultContexts]);

  // Fetch prior weights for pre-fill
  useEffect(() => {
    if (!open || !user) return;
    (async () => {
      const { data } = await supabase
        .from("exercise_logs")
        .select("exercise_name, weight, unit, logged_date")
        .eq("user_id", user.id)
        .eq("completed", true)
        .order("logged_date", { ascending: false })
        .limit(1000);
      if (!data) return;
      const weights: Record<string, { weight: number; unit: string }> = {};
      for (const row of data) {
        const name = row.exercise_name.replace(/\s*\(.*?\)\s*/g, "").trim();
        if (!weights[name]) {
          weights[name] = { weight: Number(row.weight), unit: row.unit };
        }
      }
      setPriorWeights(weights);
    })();
  }, [open, user]);

  // Recent workouts — last 5 unique done workouts
  const recentUniqueWorkouts = useMemo(() => {
    const seen = new Set<string>();
    return recentWorkouts
      .filter((w) => w.done && w.title)
      .sort((a, b) => (b.completedDate || b.scheduledDate || "").localeCompare(a.completedDate || a.scheduledDate || ""))
      .filter((w) => {
        const key = w.title.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 5);
  }, [recentWorkouts]);

  const prefillFromRecent = useCallback((w: Workout) => {
    setTitle(w.title);
    if (w.exercises && w.exercises.length > 0) {
      setWorkoutType("strength");
      setExercises(w.exercises.map((ex: any) => ({
        name: ex.name,
        sets: ex.sets || 3,
        reps: ex.reps || "10",
        weight: ex.weight ? String(ex.weight) : "",
        unit: (ex.unit as "lb" | "kg") || "lb",
      })));
      setStep("exercises");
    } else {
      setWorkoutType("activity");
      setActivityEmoji(w.emoji || "🏃");
      setActivityDuration(w.duration?.replace(/[^\d]/g, "") || "");
      setActivityCal(w.cal ? String(w.cal) : "");
      setStep("activity-details");
    }
  }, []);

  const filteredActivities = healthKitActivityOptions.filter((a) =>
    a.label.toLowerCase().includes(activitySearch.toLowerCase())
  );

  const addExercise = (name: string) => {
    const normalized = canonicalExerciseName(name.replace(/\s*\(.*?\)\s*/g, "").trim());
    // Avoid duplicates
    if (exercises.some(e => e.name.toLowerCase() === normalized.toLowerCase())) return;
    const prior = priorWeights[normalized];
    setExercises((prev) => [...prev, {
      name: normalized,
      sets: 3,
      reps: "10",
      weight: prior ? String(prior.weight) : "",
      unit: prior ? (prior.unit as "lb" | "kg") : "lb",
    }]);
  };

  const updateExercise = (index: number, updates: Partial<ExerciseEntry>) => {
    setExercises((prev) => prev.map((ex, i) => (i === index ? { ...ex, ...updates } : ex)));
  };

  const removeExercise = (index: number) => {
    setExercises((prev) => prev.filter((_, i) => i !== index));
    if (expandedEx === index) setExpandedEx(null);
  };

  const handleSubmitStrength = () => {
    if (!title.trim()) { toast.error("Please enter a workout name"); return; }
    if (exercises.length === 0) { toast.error("Add at least one exercise"); return; }

    const linkedId = selectedContexts.length > 1 ? crypto.randomUUID() : null;
    const newWorkouts: Workout[] = selectedContexts.map((ctx) => ({
      id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
      title: title.trim(),
      duration: `${exercises.reduce((sum, ex) => sum + ex.sets * 2, 0)} min`,
      cal: 0,
      tag: "Strength",
      emoji: "🏋️",
      done: false,
      scheduledDate: selectedDate,
      exercises: exercises.map((ex) => ({
        name: ex.name,
        sets: ex.sets,
        reps: ex.reps,
        weight: ex.weight ? parseFloat(ex.weight) : undefined,
        unit: ex.unit,
      })),
      groupId: ctx === PERSONAL_ID ? null : ctx,
      linkedWorkoutId: linkedId,
    }));

    onAdd(newWorkouts);
    toast.success(`Created: ${title.trim()}`);
    reset();
    onClose();
  };

  const handleSubmitActivity = () => {
    if (!title.trim()) { toast.error("Please enter an activity name"); return; }

    const linkedId = selectedContexts.length > 1 ? crypto.randomUUID() : null;
    const newWorkouts: Workout[] = selectedContexts.map((ctx) => ({
      id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
      title: title.trim(),
      duration: activityDuration ? `${activityDuration} min` : "0 min",
      cal: activityCal ? parseInt(activityCal) : 0,
      tag: "Activity",
      emoji: activityEmoji,
      done: false,
      scheduledDate: selectedDate,
      distance: activityDistance ? parseFloat(activityDistance) : 0,
      distanceUnit: activityDistanceUnit,
      groupId: ctx === PERSONAL_ID ? null : ctx,
      linkedWorkoutId: linkedId,
      normalizedType: activityHealthKitType ?? undefined,
    }));

    onAdd(newWorkouts);
    toast.success(`Created: ${title.trim()}`);
    reset();
    onClose();
  };

  const reset = () => {
    setStep("type");
    setTitle("");
    setWorkoutType(null);
    setExercises([]);
    setShowLibrary(false);
    setExpandedEx(null);
    setActivityDuration("");
    setActivityCal("");
    setActivityDistance("");
    setActivityDistanceUnit("mi");
    setActivityEmoji("🏃");
    setActivitySearch("");
    setActivityHealthKitType(null);
  };

  const handleClose = () => { reset(); onClose(); };

  const selectActivity = (label: string, emoji: string, hkType: HealthWorkoutType) => {
    setTitle(label);
    setActivityEmoji(emoji);
    setActivityHealthKitType(hkType);
    setActivitySearch("");
    setStep("activity-details");
  };

  if (!open) return null;

  const headerTitle = step === "type" ? "Create Workout" : step === "exercises" ? "Add Exercises" : "Activity Details";

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] bg-black/50 flex items-end justify-center"
        onClick={handleClose}
      >
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="w-full max-w-md bg-card rounded-t-2xl border-t border-border flex flex-col"
          style={{ maxHeight: "calc(100dvh - env(safe-area-inset-top, 0px) - 1rem)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] pb-2 flex-shrink-0">
            <h2 className="text-lg font-bold tracking-display">{headerTitle}</h2>
            <button onClick={handleClose} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
              <X size={16} />
            </button>
          </div>

          {/* Content */}
          <div className="overflow-y-auto flex-1 px-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px)+70px)]">

            {/* ========== STEP: TYPE SELECTION ========== */}
            {step === "type" && (
              <div className="space-y-4 mt-2">
                {/* Context selector */}
                <WorkoutContextSelector
                  selectedContexts={selectedContexts}
                  onChangeContexts={setSelectedContexts}
                />

                {/* Recent workouts */}
                {recentUniqueWorkouts.length > 0 && (
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recent</label>
                    <div className="mt-1.5 space-y-1">
                      {recentUniqueWorkouts.map((w) => (
                        <button
                          key={w.id}
                          onClick={() => prefillFromRecent(w)}
                          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-secondary/80 transition-colors text-left"
                          style={{ background: "#F9F8F6" }}
                        >
                          <span className="text-base">{w.emoji}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{w.title}</p>
                            <p className="text-[10px] text-muted-foreground">{w.duration} · {w.cal} kcal</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Name input */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Name</label>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Leg Day, Pickleball, Morning Run..."
                    className="w-full bg-secondary rounded-xl px-4 py-3 text-sm outline-none placeholder:text-muted-foreground mt-1"
                    autoFocus
                  />
                </div>

                {/* Type selection */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Type</label>
                  <div className="grid grid-cols-2 gap-3 mt-2">
                    <button
                      onClick={() => setWorkoutType("strength")}
                      className={`relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all text-center ${
                        workoutType === "strength"
                          ? "border-primary bg-primary/10"
                          : "border-border hover:border-primary/40"
                      }`}
                    >
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <Dumbbell size={20} className="text-primary" />
                      </div>
                      <span className="text-sm font-semibold">Strength</span>
                      <span className="text-[10px] text-muted-foreground leading-tight">
                        Exercises, sets, reps &amp; weights
                      </span>
                    </button>

                    <button
                      onClick={() => setWorkoutType("activity")}
                      className={`relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all text-center ${
                        workoutType === "activity"
                          ? "border-primary bg-primary/10"
                          : "border-border hover:border-primary/40"
                      }`}
                    >
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <Activity size={20} className="text-primary" />
                      </div>
                      <span className="text-sm font-semibold">Activity / Sport</span>
                      <span className="text-[10px] text-muted-foreground leading-tight">
                        Running, golf, yoga, pickleball...
                      </span>
                    </button>
                  </div>
                </div>

                {/* Next button */}
                {workoutType === "strength" && (
                  <button
                    onClick={() => {
                      if (!title.trim()) { toast.error("Enter a workout name"); return; }
                      setStep("exercises");
                    }}
                    className="w-full py-3 bg-primary text-primary-foreground rounded-xl text-sm font-bold"
                  >
                    Next — Add Exercises
                  </button>
                )}

                {workoutType === "activity" && (
                  <div className="space-y-2">
                    {/* Quick activity picker */}
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Choose Activity</label>
                    <div className="flex items-center gap-2 bg-secondary rounded-lg px-3 py-2">
                      <Search size={14} className="text-muted-foreground shrink-0" />
                      <input
                        value={activitySearch}
                        onChange={(e) => setActivitySearch(e.target.value)}
                        placeholder="Search activities..."
                        className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 max-h-56 overflow-y-auto">
                      {filteredActivities.map((a) => (
                        <button
                          key={a.value}
                          type="button"
                          onClick={() => selectActivity(a.label, a.emoji, a.value)}
                          className="flex flex-col items-center gap-1 py-2 px-1 rounded-lg hover:bg-secondary transition-colors text-center"
                        >
                          <span className="text-lg">{a.emoji}</span>
                          <span className="text-[10px] font-medium leading-tight line-clamp-2 w-full">{a.label}</span>
                        </button>
                      ))}
                    </div>
                    {/* Or go custom */}
                    <button
                      type="button"
                      onClick={() => {
                        if (!title.trim()) { toast.error("Enter an activity name"); return; }
                        setActivityEmoji("🏃");
                        setActivityHealthKitType(null);
                        setStep("activity-details");
                      }}
                      className="w-full py-3 bg-primary text-primary-foreground rounded-xl text-sm font-bold"
                    >
                      Next — Activity Details
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ========== STEP: EXERCISES (Strength) ========== */}
            {step === "exercises" && (
              <div className="space-y-3 mt-2">
                {/* Workout title summary */}
                <div className="flex items-center gap-2 bg-secondary/50 rounded-xl px-3 py-2">
                  <span className="text-xl">🏋️</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{title}</p>
                    <p className="text-[11px] text-muted-foreground">Strength · {exercises.length} exercise{exercises.length !== 1 ? "s" : ""}</p>
                  </div>
                  <button onClick={() => setStep("type")} className="text-xs text-primary font-medium">Edit</button>
                </div>

                {/* Exercise list */}
                {exercises.map((ex, i) => (
                  <div key={i} className="bg-card rounded-xl border border-border overflow-hidden">
                    <button
                      onClick={() => setExpandedEx(expandedEx === i ? null : i)}
                      className="w-full flex items-center gap-3 p-3"
                    >
                      <Dumbbell size={14} className="text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0 text-left">
                        <p className="text-sm font-medium truncate">{ex.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {ex.sets} sets × {ex.reps} reps{ex.weight ? ` · ${ex.weight} ${ex.unit}` : ""}
                        </p>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeExercise(i); }}
                        className="text-muted-foreground hover:text-destructive p-1"
                      >
                        <Trash2 size={13} />
                      </button>
                      {expandedEx === i ? <ChevronUp size={13} className="text-muted-foreground" /> : <ChevronDown size={13} className="text-muted-foreground" />}
                    </button>

                    <AnimatePresence>
                      {expandedEx === i && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="px-3 pb-3 grid grid-cols-4 gap-2">
                            <div>
                              <label className="text-[10px] text-muted-foreground font-medium">Sets</label>
                              <input
                                type="number"
                                value={ex.sets}
                                onChange={(e) => updateExercise(i, { sets: parseInt(e.target.value) || 1 })}
                                className="w-full bg-secondary rounded-lg px-2 py-1.5 text-sm outline-none mt-0.5 text-center"
                                min={1}
                              />
                            </div>
                            <div>
                              <label className="text-[10px] text-muted-foreground font-medium">Reps</label>
                              <input
                                value={ex.reps}
                                onChange={(e) => updateExercise(i, { reps: e.target.value })}
                                placeholder="8-12"
                                className="w-full bg-secondary rounded-lg px-2 py-1.5 text-sm outline-none mt-0.5 text-center"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] text-muted-foreground font-medium">Weight</label>
                              <input
                                value={ex.weight}
                                onChange={(e) => updateExercise(i, { weight: e.target.value })}
                                placeholder="0"
                                className="w-full bg-secondary rounded-lg px-2 py-1.5 text-sm outline-none mt-0.5 text-center"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] text-muted-foreground font-medium">Unit</label>
                              <button
                                onClick={() => updateExercise(i, { unit: ex.unit === "lb" ? "kg" : "lb" })}
                                className="w-full bg-secondary rounded-lg px-2 py-1.5 text-sm mt-0.5 text-center font-medium text-primary"
                              >
                                {ex.unit}
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}

                {/* Add exercise button */}
                <button
                  onClick={() => setShowLibrary(true)}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                >
                  <Plus size={14} /> Add Exercise
                </button>

                {/* Exercise Library Sheet */}
                <ExerciseLibrarySheet
                  open={showLibrary}
                  onClose={() => setShowLibrary(false)}
                  onSelectMultiple={(names) => {
                    names.forEach(name => addExercise(name));
                    setShowLibrary(false);
                  }}
                  excludeNames={exercises.map(e => e.name)}
                />

                <button
                  onClick={handleSubmitStrength}
                  disabled={exercises.length === 0}
                  className="w-full py-3 bg-primary text-primary-foreground rounded-xl text-sm font-bold disabled:opacity-50 mt-1"
                >
                  Create Workout ({exercises.length} exercise{exercises.length !== 1 ? "s" : ""})
                </button>

                <button onClick={() => setStep("type")} className="w-full text-center text-xs text-muted-foreground py-1">
                  ← Back
                </button>
              </div>
            )}

            {/* ========== STEP: ACTIVITY DETAILS ========== */}
            {step === "activity-details" && (
              <div className="space-y-4 mt-2">
                {/* Activity summary */}
                <div className="flex items-center gap-2 bg-secondary/50 rounded-xl px-3 py-2">
                  <span className="text-xl">{activityEmoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{title}</p>
                    <p className="text-[11px] text-muted-foreground">Activity / Sport</p>
                  </div>
                  <button onClick={() => { setStep("type"); setWorkoutType("activity"); }} className="text-xs text-primary font-medium">Edit</button>
                </div>

                {/* Duration */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Timer size={12} /> Duration (minutes)
                  </label>
                  <input
                    type="number"
                    value={activityDuration}
                    onChange={(e) => setActivityDuration(e.target.value)}
                    placeholder="e.g. 45"
                    className="w-full bg-secondary rounded-xl px-4 py-3 text-sm outline-none placeholder:text-muted-foreground mt-1"
                    min={0}
                  />
                </div>

                {/* Calories */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Flame size={12} /> Estimated Calories
                  </label>
                  <input
                    type="number"
                    value={activityCal}
                    onChange={(e) => setActivityCal(e.target.value)}
                    placeholder="e.g. 300"
                    className="w-full bg-secondary rounded-xl px-4 py-3 text-sm outline-none placeholder:text-muted-foreground mt-1"
                    min={0}
                  />
                </div>

                {/* Distance (optional) */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <MapPin size={12} /> Distance (optional)
                  </label>
                  <div className="flex gap-2 mt-1">
                    <input
                      type="number"
                      value={activityDistance}
                      onChange={(e) => setActivityDistance(e.target.value)}
                      placeholder="0"
                      className="flex-1 bg-secondary rounded-xl px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
                      min={0}
                      step="0.1"
                    />
                    <button
                      onClick={() => setActivityDistanceUnit(activityDistanceUnit === "mi" ? "km" : "mi")}
                      className="px-4 py-3 bg-secondary rounded-xl text-sm font-medium text-primary min-w-[52px]"
                    >
                      {activityDistanceUnit}
                    </button>
                  </div>
                </div>

                {/* Submit */}
                <button
                  onClick={handleSubmitActivity}
                  className="w-full py-3 bg-primary text-primary-foreground rounded-xl text-sm font-bold mt-1"
                >
                  Create Activity
                </button>

                <button onClick={() => { setStep("type"); setWorkoutType("activity"); }} className="w-full text-center text-xs text-muted-foreground py-1">
                  ← Back
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default CustomWorkoutBuilder;
