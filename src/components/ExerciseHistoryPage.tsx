import { useState, useEffect, useMemo } from "react";
import { ArrowLeft, Search, ChevronRight, Trophy, TrendingUp, Calendar, Dumbbell } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { motion, AnimatePresence } from "framer-motion";

interface LogRow {
  id: string;
  workout_id: string;
  exercise_name: string;
  exercise_index: number;
  set_number: number;
  weight: number;
  unit: string;
  reps: number;
  completed: boolean;
  logged_date: string;
}

/* ── Category mapping ── */
const UPPER_BODY_KEYWORDS = [
  "bench", "press", "shoulder", "overhead", "ohp", "chest", "fly", "flye",
  "row", "pull-up", "pullup", "chin-up", "chinup", "lat", "pulldown",
  "bicep", "curl", "tricep", "pushdown", "extension", "dip", "push-up",
  "pushup", "face pull", "shrug", "rear delt", "lateral raise", "front raise",
  "incline", "decline", "cable", "pec",
];

const LOWER_BODY_KEYWORDS = [
  "squat", "leg", "lunge", "deadlift", "rdl", "romanian", "hip thrust",
  "glute", "hamstring", "calf", "raise", "step-up", "stepup", "hack",
  "goblet", "split squat", "bulgarian", "quad", "adductor", "abductor",
  "leg curl", "leg extension", "leg press",
];

function categorize(name: string): "upper" | "lower" | "other" {
  const lower = name.toLowerCase();
  if (LOWER_BODY_KEYWORDS.some((k) => lower.includes(k))) return "lower";
  if (UPPER_BODY_KEYWORDS.some((k) => lower.includes(k))) return "upper";
  return "other";
}

/* ── Exercise Detail View ── */
const ExerciseDetail = ({
  exerciseName,
  logs,
  onBack,
}: {
  exerciseName: string;
  logs: LogRow[];
  onBack: () => void;
}) => {
  // Group by date, newest first
  const byDate = useMemo(() => {
    const map = new Map<string, LogRow[]>();
    for (const l of logs) {
      if (!l.completed) continue;
      const arr = map.get(l.logged_date) || [];
      arr.push(l);
      map.set(l.logged_date, arr);
    }
    // Sort dates descending
    const entries = Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
    // Sort sets within each date
    for (const [, sets] of entries) {
      sets.sort((a, b) => a.set_number - b.set_number);
    }
    return entries;
  }, [logs]);

  // Summary stats
  const summary = useMemo(() => {
    const completed = logs.filter((l) => l.completed);
    if (completed.length === 0) return null;
    const sessions = new Set(completed.map((l) => l.logged_date)).size;
    let bestWeight = 0;
    let bestUnit = "lb";
    let lastWeight = 0;
    let lastUnit = "lb";
    let lastReps = 0;

    // Find personal best (max weight)
    for (const l of completed) {
      const wLb = l.unit === "kg" ? l.weight * 2.20462 : l.weight;
      if (wLb > (bestUnit === "kg" ? bestWeight * 2.20462 : bestWeight)) {
        bestWeight = l.weight;
        bestUnit = l.unit;
      }
    }

    // Find last session
    const sorted = [...completed].sort((a, b) => {
      const dc = b.logged_date.localeCompare(a.logged_date);
      return dc !== 0 ? dc : a.set_number - b.set_number;
    });
    if (sorted.length > 0) {
      lastWeight = sorted[0].weight;
      lastUnit = sorted[0].unit;
      lastReps = sorted[0].reps;
    }

    return { sessions, bestWeight, bestUnit, lastWeight, lastUnit, lastReps };
  }, [logs]);

  const fmtDateLabel = (d: string) => {
    const date = new Date(d + "T00:00:00");
    return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 pb-4 border-b border-border">
        <button
          onClick={onBack}
          className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-foreground truncate">{exerciseName}</h2>
          <p className="text-xs text-muted-foreground">Exercise History</p>
        </div>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-3 gap-2 py-3">
          <div className="bg-card rounded-xl border border-border p-2.5 text-center">
            <Calendar size={12} className="mx-auto text-primary mb-1" />
            <p className="text-lg font-bold text-foreground leading-none">{summary.sessions}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">sessions</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-2.5 text-center">
            <TrendingUp size={12} className="mx-auto text-primary mb-1" />
            <p className="text-lg font-bold text-foreground leading-none">
              {summary.lastWeight}<span className="text-xs text-muted-foreground ml-0.5">{summary.lastUnit}</span>
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">last weight</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-2.5 text-center">
            <Trophy size={12} className="mx-auto text-amber-500 mb-1" />
            <p className="text-lg font-bold text-foreground leading-none">
              {summary.bestWeight}<span className="text-xs text-muted-foreground ml-0.5">{summary.bestUnit}</span>
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">best</p>
          </div>
        </div>
      )}

      {/* Log entries by date */}
      <ScrollArea className="flex-1 -mx-1 px-1">
        <div className="space-y-3 pb-4">
          {byDate.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Dumbbell size={32} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">No logged data yet</p>
            </div>
          )}
          {byDate.map(([date, sets]) => (
            <div key={date} className="bg-card rounded-xl border border-border overflow-hidden">
              <div className="px-3 py-2 border-b border-border bg-secondary/30">
                <p className="text-xs font-semibold text-foreground">{fmtDateLabel(date)}</p>
              </div>
              <div className="px-3 py-2 space-y-1">
                {sets.map((s) => (
                  <div key={s.id} className="flex items-center justify-between py-1">
                    <span className="text-xs text-muted-foreground font-medium w-12">Set {s.set_number}</span>
                    <span className="text-sm font-semibold text-foreground">
                      {s.weight} {s.unit} × {s.reps}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};

/* ── Main History Page ── */
const ExerciseHistoryPage = ({ onBack }: { onBack: () => void }) => {
  const { user } = useAuth();
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("exercise_logs")
        .select("*")
        .eq("user_id", user.id)
        .eq("completed", true)
        .order("logged_date", { ascending: false })
        .order("exercise_name")
        .order("set_number");
      setLogs((data as LogRow[]) || []);
      setLoading(false);
    })();
  }, [user]);

  // Unique exercises with latest date and session count
  const exercises = useMemo(() => {
    const map = new Map<string, { name: string; lastDate: string; sessions: number; totalSets: number }>();
    for (const l of logs) {
      const existing = map.get(l.exercise_name);
      if (existing) {
        existing.totalSets++;
        if (l.logged_date > existing.lastDate) existing.lastDate = l.logged_date;
        // Count unique dates per exercise
      } else {
        map.set(l.exercise_name, { name: l.exercise_name, lastDate: l.logged_date, sessions: 0, totalSets: 1 });
      }
    }
    // Count unique sessions
    for (const [name, info] of map) {
      const dates = new Set(logs.filter((l) => l.exercise_name === name).map((l) => l.logged_date));
      info.sessions = dates.size;
    }
    return Array.from(map.values());
  }, [logs]);

  // Filter + group
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const list = q ? exercises.filter((e) => e.name.toLowerCase().includes(q)) : exercises;
    const upper: typeof list = [];
    const lower: typeof list = [];
    const other: typeof list = [];
    for (const e of list) {
      const cat = categorize(e.name);
      if (cat === "upper") upper.push(e);
      else if (cat === "lower") lower.push(e);
      else other.push(e);
    }
    return { upper, lower, other };
  }, [exercises, search]);

  const fmtDate = (d: string) => {
    const date = new Date(d + "T00:00:00");
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  // If viewing a specific exercise
  if (selectedExercise) {
    const exLogs = logs.filter((l) => l.exercise_name === selectedExercise);
    return (
      <motion.div
        initial={{ x: 40, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 40, opacity: 0 }}
        className="h-full flex flex-col"
      >
        <ExerciseDetail
          exerciseName={selectedExercise}
          logs={exLogs}
          onBack={() => setSelectedExercise(null)}
        />
      </motion.div>
    );
  }

  const renderSection = (title: string, emoji: string, items: typeof exercises) => {
    if (items.length === 0) return null;
    return (
      <div className="mb-4">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
          <span>{emoji}</span> {title}
        </h3>
        <div className="space-y-1.5">
          {items.map((ex) => (
            <button
              key={ex.name}
              onClick={() => setSelectedExercise(ex.name)}
              className="w-full flex items-center gap-3 bg-card rounded-xl border border-border p-3 hover:bg-accent/30 transition-colors active:scale-[0.99] text-left"
            >
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Dumbbell size={14} className="text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{ex.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {ex.sessions} session{ex.sessions !== 1 ? "s" : ""} · Last {fmtDate(ex.lastDate)}
                </p>
              </div>
              <ChevronRight size={14} className="text-muted-foreground flex-shrink-0" />
            </button>
          ))}
        </div>
      </div>
    );
  };

  const totalExercises = filtered.upper.length + filtered.lower.length + filtered.other.length;

  return (
    <motion.div
      initial={{ x: 40, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: -40, opacity: 0 }}
      className="h-full flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center gap-3 pb-3">
        <button
          onClick={onBack}
          className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-foreground">Exercise History</h2>
          <p className="text-xs text-muted-foreground">{exercises.length} exercises logged</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search exercises..."
          className="w-full pl-9 pr-3 py-2.5 bg-secondary rounded-xl text-sm outline-none border border-border focus:border-primary placeholder:text-muted-foreground transition-colors"
        />
      </div>

      {/* Content */}
      <ScrollArea className="flex-1 -mx-1 px-1">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : totalExercises === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Dumbbell size={36} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">
              {search ? "No exercises match your search" : "No exercise data logged yet"}
            </p>
            <p className="text-xs mt-1">
              {search ? "Try a different search term" : "Complete workouts to see your history here"}
            </p>
          </div>
        ) : (
          <div className="pb-4">
            {renderSection("Upper Body", "💪", filtered.upper)}
            {renderSection("Lower Body", "🦵", filtered.lower)}
            {renderSection("Other", "🏋️", filtered.other)}
          </div>
        )}
      </ScrollArea>
    </motion.div>
  );
};

export default ExerciseHistoryPage;
