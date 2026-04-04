import { useState, useMemo, useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, Search, Trophy, Flame, Target, Dumbbell, ArrowLeft, ChevronDown, ChevronUp, Plus } from "lucide-react";
import { useAppContext, Workout } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import { motion, AnimatePresence } from "framer-motion";
import WorkoutDetailModal from "@/components/WorkoutDetailModal";
import { getWeekStartDate, loadWeekStart } from "@/hooks/useWeekStart";

const fmtDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const MILESTONES = [
  { id: "first", label: "First Workout", icon: "🏅", threshold: 1, type: "total" },
  { id: "ten", label: "10 Workouts", icon: "⭐", threshold: 10, type: "total" },
  { id: "fifty", label: "50 Workouts", icon: "🏆", threshold: 50, type: "total" },
  { id: "hundred", label: "100 Workouts", icon: "💎", threshold: 100, type: "total" },
  { id: "streak7", label: "7-Day Streak", icon: "🔥", threshold: 7, type: "streak" },
  { id: "streak30", label: "30-Day Streak", icon: "🌟", threshold: 30, type: "streak" },
  { id: "kcal1k", label: "1,000 kcal", icon: "💪", threshold: 1000, type: "calories" },
  { id: "kcal10k", label: "10,000 kcal", icon: "⚡", threshold: 10000, type: "calories" },
];

function computeStreak(workouts: Workout[]): number {
  const doneDates = new Set(
    workouts
      .filter((w) => w.done && (w.completedDate || w.scheduledDate))
      .map((w) => w.completedDate || w.scheduledDate!)
  );
  if (doneDates.size === 0) return 0;
  let streak = 0;
  const d = new Date();
  // Check if today has a workout, otherwise start from yesterday
  if (!doneDates.has(fmtDate(d))) {
    d.setDate(d.getDate() - 1);
  }
  while (doneDates.has(fmtDate(d))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

interface Props {
  onBack: () => void;
  onRecordWorkout: () => void;
}

const WorkoutLogPage = ({ onBack, onRecordWorkout }: Props) => {
  const { workouts, updateWorkout, removeWorkout } = useAppContext();
  const { user } = useAuth();
  const weekStart = loadWeekStart();

  const [selectedDate, setSelectedDate] = useState(fmtDate(new Date()));
  const [calendarExpanded, setCalendarExpanded] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [detailWorkout, setDetailWorkout] = useState<Workout | null>(null);

  const today = fmtDate(new Date());

  // Only user's own workouts
  const myWorkouts = useMemo(
    () => workouts.filter((w) => !w.ownerUserId || w.ownerUserId === user?.id),
    [workouts, user?.id]
  );

  const doneWorkouts = useMemo(() => myWorkouts.filter((w) => w.done), [myWorkouts]);

  // Stats
  const totalWorkouts = doneWorkouts.length;
  const totalKcal = useMemo(() => doneWorkouts.reduce((s, w) => s + (w.cal || 0), 0), [doneWorkouts]);
  const streak = useMemo(() => computeStreak(myWorkouts), [myWorkouts]);
  const weeklyGoal = parseInt(localStorage.getItem("workout_weekly_goal") || "4", 10);
  const weeklyCompleted = useMemo(() => {
    const startStr = getWeekStartDate(new Date(), weekStart);
    return new Set(
      doneWorkouts
        .filter((w) => (w.completedDate || w.scheduledDate || "") >= startStr && (w.completedDate || w.scheduledDate || "") <= today)
        .map((w) => w.completedDate || w.scheduledDate!)
    ).size;
  }, [doneWorkouts, today, weekStart]);

  // Milestones
  const earnedMilestones = useMemo(() => {
    return MILESTONES.map((m) => {
      let earned = false;
      if (m.type === "total") earned = totalWorkouts >= m.threshold;
      else if (m.type === "streak") earned = streak >= m.threshold;
      else if (m.type === "calories") earned = totalKcal >= m.threshold;
      return { ...m, earned };
    });
  }, [totalWorkouts, streak, totalKcal]);

  // Workout dates set for calendar highlighting
  const workoutDatesMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const w of doneWorkouts) {
      const d = w.completedDate || w.scheduledDate;
      if (!d) continue;
      const durMin = parseInt(w.duration) || 0;
      map.set(d, (map.get(d) || 0) + durMin);
    }
    return map;
  }, [doneWorkouts]);

  // Week strip dates
  const weekDates = useMemo(() => {
    const sel = new Date(selectedDate + "T00:00:00");
    const day = sel.getDay();
    const start = new Date(sel);
    start.setDate(sel.getDate() - ((day + 6) % 7)); // Monday
    const dates: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      dates.push(d);
    }
    return dates;
  }, [selectedDate]);

  // Month grid
  const monthGrid = useMemo(() => {
    const { year, month } = viewMonth;
    const firstDay = new Date(year, month, 1);
    const startDay = (firstDay.getDay() + 6) % 7; // Monday-based
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const weeks: (Date | null)[][] = [];
    let currentWeek: (Date | null)[] = Array(startDay).fill(null);
    for (let d = 1; d <= daysInMonth; d++) {
      currentWeek.push(new Date(year, month, d));
      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    }
    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) currentWeek.push(null);
      weeks.push(currentWeek);
    }
    return weeks;
  }, [viewMonth]);

  // Past workouts filtered by selected date + search
  const pastWorkoutsByDate = useMemo(() => {
    let filtered = doneWorkouts
      .filter((w) => {
        const d = w.completedDate || w.scheduledDate || "";
        return d <= today;
      })
      .sort((a, b) => {
        const da = a.completedDate || a.scheduledDate || "";
        const db = b.completedDate || b.scheduledDate || "";
        return db.localeCompare(da);
      });

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((w) => w.title.toLowerCase().includes(q));
    }

    // Group by date
    const groups: { date: string; workouts: Workout[]; totalMin: number }[] = [];
    let current: typeof groups[0] | null = null;
    for (const w of filtered) {
      const d = w.completedDate || w.scheduledDate || "";
      if (!current || current.date !== d) {
        current = { date: d, workouts: [], totalMin: 0 };
        groups.push(current);
      }
      current.workouts.push(w);
      current.totalMin += parseInt(w.duration) || 0;
    }
    return groups;
  }, [doneWorkouts, today, searchQuery]);

  const DAY_ABBRS = ["M", "T", "W", "T", "F", "S", "S"];

  return (
    <div className="px-5 pb-28 pt-12">
      {/* Header */}
      <header className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-bold tracking-tight">Workout Log</h1>
      </header>

      {/* Stats Grid 2x2 */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="bg-card rounded-xl border border-border p-3.5">
          <div className="flex items-center gap-1.5 mb-1">
            <Dumbbell size={13} className="text-primary" />
            <span className="text-[11px] font-medium text-muted-foreground">Total Workouts</span>
          </div>
          <p className="text-2xl font-bold">{totalWorkouts}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-3.5">
          <div className="flex items-center gap-1.5 mb-1">
            <Target size={13} className="text-primary" />
            <span className="text-[11px] font-medium text-muted-foreground">Weekly Goal</span>
          </div>
          <p className="text-2xl font-bold">{weeklyCompleted}<span className="text-sm font-medium text-muted-foreground">/{weeklyGoal}</span></p>
        </div>
        <div className="bg-card rounded-xl border border-border p-3.5">
          <div className="flex items-center gap-1.5 mb-1">
            <Flame size={13} className="text-amber-500" />
            <span className="text-[11px] font-medium text-muted-foreground">Current Streak</span>
          </div>
          <p className="text-2xl font-bold flex items-center gap-1">🔥 {streak}<span className="text-sm font-medium text-muted-foreground">days</span></p>
        </div>
        <div className="bg-card rounded-xl border border-border p-3.5">
          <div className="flex items-center gap-1.5 mb-1">
            <Flame size={13} className="text-orange-500" />
            <span className="text-[11px] font-medium text-muted-foreground">Total kcal</span>
          </div>
          <p className="text-2xl font-bold">{totalKcal.toLocaleString()}</p>
        </div>
      </div>

      {/* Milestones */}
      <div className="mb-5">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Milestones</h3>
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1" style={{ WebkitOverflowScrolling: "touch" }}>
          {earnedMilestones.map((m) => (
            <div
              key={m.id}
              className={`flex flex-col items-center min-w-[64px] p-2.5 rounded-xl border transition-all ${
                m.earned
                  ? "border-primary/40 bg-primary/5"
                  : "border-border bg-card opacity-50"
              }`}
            >
              <span className="text-xl mb-0.5">{m.icon}</span>
              <span className="text-[9px] font-medium text-center leading-tight">{m.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Calendar */}
      <div className="bg-card rounded-xl border border-border p-3 mb-5">
        <div className="flex items-center justify-between mb-2">
          {calendarExpanded ? (
            <>
              <button onClick={() => setViewMonth((p) => {
                const m = p.month - 1;
                return m < 0 ? { year: p.year - 1, month: 11 } : { ...p, month: m };
              })} className="p-1 rounded hover:bg-secondary"><ChevronLeft size={16} /></button>
              <span className="text-sm font-semibold">
                {new Date(viewMonth.year, viewMonth.month).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
              </span>
              <button onClick={() => setViewMonth((p) => {
                const m = p.month + 1;
                return m > 11 ? { year: p.year + 1, month: 0 } : { ...p, month: m };
              })} className="p-1 rounded hover:bg-secondary"><ChevronRight size={16} /></button>
            </>
          ) : (
            <span className="text-sm font-semibold">This Week</span>
          )}
          <button onClick={() => setCalendarExpanded((p) => !p)} className="p-1 rounded hover:bg-secondary text-muted-foreground">
            {calendarExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>

        <AnimatePresence mode="wait">
          {calendarExpanded ? (
            <motion.div
              key="month"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              {/* Day headers */}
              <div className="grid grid-cols-7 gap-0 mb-1">
                {DAY_ABBRS.map((d, i) => (
                  <div key={i} className="text-center text-[10px] font-medium text-muted-foreground py-1">{d}</div>
                ))}
              </div>
              {monthGrid.map((week, wi) => (
                <div key={wi} className="grid grid-cols-7 gap-0">
                  {week.map((day, di) => {
                    if (!day) return <div key={di} />;
                    const ds = fmtDate(day);
                    const isToday = ds === today;
                    const isSelected = ds === selectedDate;
                    const hasDone = workoutDatesMap.has(ds);
                    const durMin = workoutDatesMap.get(ds) || 0;
                    return (
                      <button
                        key={di}
                        onClick={() => setSelectedDate(ds)}
                        className={`flex flex-col items-center py-1.5 rounded-lg transition-all ${
                          isSelected ? "bg-primary text-primary-foreground" : isToday ? "bg-primary/10" : hasDone ? "bg-primary/5" : ""
                        }`}
                      >
                        <span className={`text-xs font-medium ${isSelected ? "" : isToday ? "text-primary font-bold" : ""}`}>{day.getDate()}</span>
                        {hasDone && <span className={`text-[8px] ${isSelected ? "text-primary-foreground/70" : "text-primary"}`}>{durMin}m</span>}
                      </button>
                    );
                  })}
                </div>
              ))}
            </motion.div>
          ) : (
            <motion.div
              key="week"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
            >
              <div className="grid grid-cols-7 gap-0">
                {weekDates.map((day) => {
                  const ds = fmtDate(day);
                  const isToday = ds === today;
                  const isSelected = ds === selectedDate;
                  const hasDone = workoutDatesMap.has(ds);
                  const durMin = workoutDatesMap.get(ds) || 0;
                  const dayAbbr = day.toLocaleDateString("en-US", { weekday: "short" }).slice(0, 3);
                  return (
                    <button
                      key={ds}
                      onClick={() => setSelectedDate(ds)}
                      className={`flex flex-col items-center py-2 rounded-lg transition-all ${
                        isSelected ? "bg-primary text-primary-foreground" : isToday ? "bg-primary/10" : hasDone ? "bg-primary/5" : ""
                      }`}
                    >
                      <span className={`text-[10px] font-medium ${isSelected ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{dayAbbr}</span>
                      <span className={`text-sm font-bold ${isSelected ? "" : isToday ? "text-primary" : ""}`}>{day.getDate()}</span>
                      {hasDone && <span className={`text-[8px] mt-0.5 ${isSelected ? "text-primary-foreground/70" : "text-primary"}`}>{durMin}m</span>}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search past workouts..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-8 pr-3 py-2.5 rounded-xl bg-secondary border border-border text-sm outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      {/* Past workouts list */}
      <div className="space-y-4 mb-6">
        {pastWorkoutsByDate.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No completed workouts yet.</p>
        ) : (
          pastWorkoutsByDate.map((group) => (
            <div key={group.date}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-semibold text-muted-foreground">
                  {new Date(group.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                </span>
                <span className="text-[10px] text-muted-foreground">· {group.totalMin} min total</span>
              </div>
              <div className="space-y-2">
                {group.workouts.map((w) => (
                  <button
                    key={w.id}
                    onClick={() => setDetailWorkout(w)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl bg-card border border-border hover:border-primary/30 transition-all text-left"
                  >
                    <div className="w-[34px] h-[34px] rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-lg">{w.emoji}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{w.title}</p>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-[11px] text-muted-foreground">{w.exercises?.length || 0} ex</span>
                        <span className="text-[11px] text-muted-foreground">{w.cal} kcal</span>
                        <span className="text-[11px] text-muted-foreground">{w.duration}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Record Workout FAB */}
      <div className="fixed bottom-20 left-0 right-0 px-5 z-30">
        <button
          onClick={onRecordWorkout}
          className="w-full py-3.5 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 shadow-lg active:scale-[0.98] transition-transform"
        >
          <Plus size={18} /> Record Workout
        </button>
      </div>

      {/* Detail Modal */}
      {detailWorkout && (
        <WorkoutDetailModal
          workout={detailWorkout}
          open={!!detailWorkout}
          onClose={() => setDetailWorkout(null)}
          onRemove={removeWorkout}
          onMoveToTomorrow={() => {}}
          onMoveToDate={() => {}}
          onUpdateCalories={(id, cal) => updateWorkout(id, { cal })}
          onUpdateDuration={(id, duration) => updateWorkout(id, { duration })}
          onUpdateDistance={(id, distance, unit) => updateWorkout(id, { distance, distanceUnit: unit })}
          onEditExercise={() => {}}
          onDeleteExercise={() => {}}
          onAddExercises={() => {}}
          onLogWorkout={() => {}}
          onSelectExercise={() => {}}
          readOnly
        />
      )}
    </div>
  );
};

export default WorkoutLogPage;
