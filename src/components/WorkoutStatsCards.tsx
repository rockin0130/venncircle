import { useState, useMemo } from "react";
import { ChevronDown, Settings2, Flame, Route, ArrowLeft, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import type { Workout } from "@/types/workoutModels";
import { type WeekStart, getWeekStartDate, loadWeekStart } from "@/hooks/useWeekStart";

type TimeRange = "all" | "today" | "week" | "month" | "30days" | "custom";

const RANGE_LABELS: Record<TimeRange, string> = {
  all: "All Time",
  today: "Today",
  week: "This Week",
  month: "This Month",
  "30days": "Last 30 Days",
  custom: "Custom",
};

const fmtDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const fmtShort = (d: Date) =>
  d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

const GOAL_OPTIONS = [2, 3, 4, 5, 6, 7];

const STORAGE_KEY = "workout_weekly_goal";
const UNIT_KEY = "workout_distance_unit";
const VIS_KEY = "workout_stats_visible";

type VisibleCards = { done: boolean; calories: boolean; distance: boolean };

export interface UserWorkoutData {
  userId: string;
  label: string;
  initial: string;
  avatarUrl: string | null;
  workouts: Workout[];
}

/* ── Growing flower widget ── */
const FlowerWidget = ({
  completed,
  goal,
  size = 80,
}: {
  completed: number;
  goal: number;
  size?: number;
}) => {
  const clamped = Math.min(completed, goal);
  const allDone = clamped >= goal;
  const cx = size / 2;
  const cy = size / 2;
  const petalR = size * 0.15;
  const orbitR = size * 0.275;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="drop-shadow-sm">
      <line x1={cx} y1={cy + size * 0.175} x2={cx} y2={size - 2} className="stroke-primary/30" strokeWidth={2} strokeLinecap="round" />
      <ellipse cx={cx - size * 0.09} cy={cy + size * 0.275} rx={size * 0.06} ry={size * 0.04} transform={`rotate(-30 ${cx - size * 0.09} ${cy + size * 0.275})`} className={clamped >= 1 ? "fill-primary/25" : "fill-muted"} style={{ transition: "fill 0.4s ease" }} />
      <ellipse cx={cx + size * 0.09} cy={cy + size * 0.225} rx={size * 0.06} ry={size * 0.04} transform={`rotate(30 ${cx + size * 0.09} ${cy + size * 0.225})`} className={clamped >= 2 ? "fill-primary/25" : "fill-muted"} style={{ transition: "fill 0.4s ease" }} />
      {Array.from({ length: goal }, (_, i) => {
        const filled = i < clamped;
        const angle = (2 * Math.PI * i) / goal - Math.PI / 2;
        const px = cx + orbitR * Math.cos(angle);
        const py = cy + orbitR * Math.sin(angle);
        return (
          <ellipse
            key={i}
            cx={px} cy={py} rx={petalR} ry={petalR * 0.72}
            transform={`rotate(${(angle * 180) / Math.PI + 90} ${px} ${py})`}
            className={filled ? "fill-primary/80" : "fill-muted stroke-border"}
            strokeWidth={filled ? 0 : 0.8}
            style={{ transition: "fill 0.4s ease, opacity 0.4s ease", filter: filled ? "saturate(1.2)" : "none" }}
          />
        );
      })}
      <circle cx={cx} cy={cy} r={size * 0.125} className={allDone ? "fill-primary" : "fill-accent"} style={{ transition: "fill 0.3s ease" }} />
      {allDone && (
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" className="fill-primary-foreground font-bold" style={{ fontSize: `${size * 0.14}px` }}>✓</text>
      )}
    </svg>
  );
};

/* ── Filter pill button ── */
const FilterPill = ({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) => (
  <button
    onClick={onClick}
    className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors whitespace-nowrap ${
      active ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
    }`}
  >
    {label}
  </button>
);

/* Helper: compute stats for a set of workouts */
function computeStats(workouts: Workout[], today: string, weekStart: WeekStart, range: TimeRange, customFrom?: Date, customTo?: Date, barDate?: string, distUnit: "mi" | "km" = "mi", distActivityFilter: string = "All") {
  const isSingleDayFromBar = barDate != null && barDate !== today;

  // Weekly completed
  const now = new Date();
  const startStr = getWeekStartDate(now, weekStart);
  const weeklyUniqueDays = new Set(
    workouts
      .filter((w) => w.done && (w.scheduledDate || w.completedDate || "") >= startStr && (w.scheduledDate || w.completedDate || "") <= today)
      .map((w) => w.scheduledDate || w.completedDate!)
  );
  const weeklyCompleted = weeklyUniqueDays.size;

  // Filtered done
  const done = workouts.filter((w) => w.done);
  let filteredDone = done;
  if (isSingleDayFromBar && barDate) {
    filteredDone = done.filter((w) => (w.scheduledDate || w.completedDate || "") === barDate);
  } else if (range !== "all") {
    let startDate: string;
    let endDate: string = today;
    if (range === "today") startDate = today;
    else if (range === "week") startDate = getWeekStartDate(now, weekStart);
    else if (range === "month") startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    else if (range === "30days") { const d = new Date(now); d.setDate(d.getDate() - 30); startDate = fmtDate(d); }
    else if (range === "custom" && customFrom && customTo) { startDate = fmtDate(customFrom); endDate = fmtDate(customTo); }
    else startDate = "";
    if (startDate) filteredDone = done.filter((w) => { const d = w.scheduledDate || w.completedDate || ""; return d >= startDate && d <= endDate; });
  }

  const completedCount = new Set(filteredDone.map((w) => w.scheduledDate || w.completedDate || "").filter(Boolean)).size;
  const totalCals = filteredDone.reduce((sum, w) => sum + (w.cal || 0), 0);

  const DIST_ACTIVITIES = ["Running", "Cycling", "Walking", "Swimming"];
  let totalDistance = 0;
  for (const w of filteredDone) {
    if (!w.distance) continue;
    if (distActivityFilter !== "All" && !w.title.toLowerCase().includes(distActivityFilter.toLowerCase())) continue;
    const wUnit = w.distanceUnit || "mi";
    let d = w.distance;
    if (distUnit === "km" && wUnit === "mi") d *= 1.60934;
    else if (distUnit === "mi" && wUnit === "km") d /= 1.60934;
    totalDistance += d;
  }

  return { weeklyCompleted, completedCount, totalCals, totalDistance };
}

/* ── Main component ── */
interface Props {
  workouts: Workout[];
  isViewingPartner?: boolean;
  partnerName?: string;
  label?: string;
  weekStart?: WeekStart;
  selectedDate?: string;
  todayStr?: string;
  onResetToToday?: () => void;
  /** Multi-user data: when provided, renders side-by-side columns */
  userWorkouts?: UserWorkoutData[];
}

const WorkoutStatsCards = ({ workouts, weekStart: weekStartProp, selectedDate: barDate, todayStr: todayProp, onResetToToday, userWorkouts }: Props) => {
  const weekStart = weekStartProp ?? loadWeekStart();
  const [range, setRange] = useState<TimeRange>("all");
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();
  const [filterOpen, setFilterOpen] = useState(false);
  const [pickingStep, setPickingStep] = useState<"from" | "to" | "confirm" | null>(null);
  const [goalOpen, setGoalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [weeklyGoal, setWeeklyGoal] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? parseInt(saved, 10) : 4;
  });
  const [distUnit, setDistUnit] = useState<"mi" | "km">(() => {
    const saved = localStorage.getItem(UNIT_KEY);
    return saved === "km" ? "km" : "mi";
  });
  const [visible, setVisible] = useState<VisibleCards>(() => {
    try {
      const saved = localStorage.getItem(VIS_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return { done: true, calories: true, distance: true };
  });

  const [stagingFrom, setStagingFrom] = useState<Date | undefined>();
  const [stagingTo, setStagingTo] = useState<Date | undefined>();

  const today = todayProp ?? fmtDate(new Date());
  const isSingleDayFromBar = barDate != null && barDate !== today;
  const isCustomActive = isSingleDayFromBar || range === "custom" || range === "30days";

  const isMultiUser = userWorkouts && userWorkouts.length > 1;

  // Per-user stats
  const perUserStats = useMemo(() => {
    if (!userWorkouts) return [];
    return userWorkouts.map((u) => ({
      ...u,
      stats: computeStats(u.workouts, today, weekStart, range, customFrom, customTo, barDate, distUnit),
    }));
  }, [userWorkouts, today, weekStart, range, customFrom, customTo, barDate, distUnit]);

  // Single-user stats (fallback)
  const singleStats = useMemo(() => {
    if (isMultiUser) return null;
    return computeStats(workouts, today, weekStart, range, customFrom, customTo, barDate, distUnit);
  }, [workouts, today, weekStart, range, customFrom, customTo, barDate, distUnit, isMultiUser]);

  const toggleDistUnit = () => {
    const next = distUnit === "mi" ? "km" : "mi";
    setDistUnit(next);
    localStorage.setItem(UNIT_KEY, next);
  };

  const saveGoal = (g: number) => {
    setWeeklyGoal(g);
    localStorage.setItem(STORAGE_KEY, String(g));
    setGoalOpen(false);
  };

  const toggleCard = (key: keyof VisibleCards) => {
    setVisible((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem(VIS_KEY, JSON.stringify(next));
      return next;
    });
  };

  const openCustomPicker = () => {
    setStagingFrom(undefined);
    setStagingTo(undefined);
    setPickingStep("from");
  };

  const selectRange = (r: TimeRange) => {
    if (r === "custom") openCustomPicker();
    else { setRange(r); setFilterOpen(false); setPickingStep(null); }
  };

  const handleReturnToToday = () => {
    setRange("today");
    setCustomFrom(undefined);
    setCustomTo(undefined);
    setPickingStep(null);
    onResetToToday?.();
  };

  const handleApplyRange = () => {
    if (stagingFrom && stagingTo) {
      setCustomFrom(stagingFrom);
      setCustomTo(stagingTo);
      setRange("custom");
      setPickingStep(null);
      setFilterOpen(false);
    }
  };

  const activeCardCount = (visible.done ? 1 : 0) + (visible.calories ? 1 : 0) + (visible.distance ? 1 : 0);

  const quickFilters: { key: TimeRange; label: string }[] = [
    { key: "today", label: "Today" },
    { key: "week", label: "Week" },
    { key: "month", label: "Month" },
    { key: "all", label: "All" },
  ];

  const customRangeLabel = isSingleDayFromBar && barDate
    ? new Date(barDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
    : range === "custom" && customFrom && customTo
    ? `${fmtShort(customFrom)} – ${fmtShort(customTo)}`
    : range === "30days"
    ? "Last 30 Days"
    : null;

  const rangeModifiers = stagingFrom && stagingTo
    ? { range_start: stagingFrom, range_end: stagingTo, range_middle: { from: new Date(stagingFrom.getTime() + 86400000), to: new Date(stagingTo.getTime() - 86400000) } }
    : stagingFrom ? { range_start: stagingFrom } : {};

  const rangeModifiersStyles: Record<string, React.CSSProperties> = {
    range_start: { background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))", borderRadius: "9999px 0 0 9999px" },
    range_end: { background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))", borderRadius: "0 9999px 9999px 0" },
    range_middle: { background: "hsl(var(--primary) / 0.15)", color: "hsl(var(--foreground))", borderRadius: "0" },
  };

  /* ── Render: Weekly Goal ── */
  const renderWeeklyGoal = () => {
    if (isMultiUser && perUserStats.length > 1) {
      // Side-by-side weekly goal
      return (
        <Popover open={goalOpen} onOpenChange={setGoalOpen}>
          <PopoverTrigger asChild>
            <button className="w-full bg-card rounded-xl border border-border shadow-sm p-3 flex items-center gap-2 transition-colors hover:bg-accent/30 active:scale-[0.99]">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground mb-2">Weekly Goal</p>
                <div className="flex items-stretch gap-3">
                  {perUserStats.map((u) => {
                    const clamped = Math.min(u.stats.weeklyCompleted, weeklyGoal);
                    return (
                      <div key={u.userId} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                        {u.avatarUrl ? (
                          <img src={u.avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover" />
                        ) : (
                          <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-bold">{u.initial}</span>
                        )}
                        <span className="text-[10px] font-medium text-muted-foreground truncate max-w-full">{u.label}</span>
                        <FlowerWidget completed={clamped} goal={weeklyGoal} size={52} />
                        <p className="text-sm font-bold text-foreground leading-none">
                          {clamped}<span className="text-[10px] font-medium text-muted-foreground">/{weeklyGoal}</span>
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
              <ChevronDown size={14} className="text-muted-foreground shrink-0" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-4 z-[60]" align="start">
            <p className="text-sm font-semibold text-foreground mb-3">Weekly workout goal</p>
            <div className="grid grid-cols-3 gap-2">
              {GOAL_OPTIONS.map((g) => (
                <button key={g} onClick={() => saveGoal(g)} className={`rounded-lg py-2.5 text-sm font-semibold transition-colors ${weeklyGoal === g ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground hover:bg-secondary/80"}`}>{g}x</button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground mt-2 text-center">workouts per week</p>
          </PopoverContent>
        </Popover>
      );
    }

    // Single user weekly goal
    const stats = singleStats || (perUserStats.length === 1 ? perUserStats[0].stats : { weeklyCompleted: 0 });
    const clamped = Math.min(stats.weeklyCompleted, weeklyGoal);
    return (
      <Popover open={goalOpen} onOpenChange={setGoalOpen}>
        <PopoverTrigger asChild>
          <button className="w-full bg-card rounded-xl border border-border shadow-sm p-3 flex items-center gap-3 transition-colors hover:bg-accent/30 active:scale-[0.99]">
            <FlowerWidget completed={clamped} goal={weeklyGoal} />
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-semibold text-foreground leading-tight">Weekly Goal</p>
              <p className="text-2xl font-bold text-foreground leading-none mt-0.5">
                {clamped}<span className="text-base font-medium text-muted-foreground">/{weeklyGoal}</span>
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {clamped >= weeklyGoal ? "Goal reached! 🎉" : `${weeklyGoal - clamped} more to go this week`}
              </p>
            </div>
            <ChevronDown size={14} className="text-muted-foreground shrink-0" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-4 z-[60]" align="start">
          <p className="text-sm font-semibold text-foreground mb-3">Weekly workout goal</p>
          <div className="grid grid-cols-3 gap-2">
            {GOAL_OPTIONS.map((g) => (
              <button key={g} onClick={() => saveGoal(g)} className={`rounded-lg py-2.5 text-sm font-semibold transition-colors ${weeklyGoal === g ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground hover:bg-secondary/80"}`}>{g}x</button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground mt-2 text-center">workouts per week</p>
        </PopoverContent>
      </Popover>
    );
  };

  /* ── Render: Stats Grid ── */
  const renderStatsGrid = () => {
    if (isMultiUser && perUserStats.length > 1) {
      // Multi-user grid: rows = stat types, columns = users
      const rows: { key: keyof VisibleCards; label: string; icon: React.ReactNode; getValue: (s: ReturnType<typeof computeStats>) => string }[] = [];
      if (visible.done) rows.push({ key: "done", label: "Done", icon: <Check size={10} className="text-muted-foreground" />, getValue: (s) => `${s.completedCount}` });
      if (visible.calories) rows.push({ key: "calories", label: "Calories", icon: <Flame size={10} className="text-muted-foreground" />, getValue: (s) => s.totalCals.toLocaleString() });
      if (visible.distance) rows.push({ key: "distance", label: "Distance", icon: <Route size={10} className="text-muted-foreground" />, getValue: (s) => `${s.totalDistance < 10 ? s.totalDistance.toFixed(1) : Math.round(s.totalDistance)}${distUnit}` });

      if (rows.length === 0) return null;

      return (
        <div className="overflow-x-auto">
          <table className="w-full text-center">
            <thead>
              <tr>
                <th className="text-left pr-2"></th>
                {perUserStats.map((u) => (
                  <th key={u.userId} className="px-1 pb-1.5">
                    <div className="flex flex-col items-center gap-0.5">
                      {u.avatarUrl ? (
                        <img src={u.avatarUrl} alt="" className="w-5 h-5 rounded-full object-cover" />
                      ) : (
                        <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[8px] font-bold">{u.initial}</span>
                      )}
                      <span className="text-[9px] font-medium text-muted-foreground truncate max-w-[60px]">{u.label}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-t border-border/50">
                  <td className="text-left pr-2 py-1.5">
                    <div className="flex items-center gap-1">
                      {row.icon}
                      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{row.label}</span>
                    </div>
                  </td>
                  {perUserStats.map((u) => (
                    <td key={u.userId} className="px-1 py-1.5">
                      <span className="text-sm font-bold text-foreground">{row.getValue(u.stats)}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    // Single user stat cards
    const stats = singleStats || (perUserStats.length === 1 ? perUserStats[0].stats : { completedCount: 0, totalCals: 0, totalDistance: 0 });
    if (activeCardCount === 0) return null;

    return (
      <div className={`flex gap-2 ${activeCardCount < 3 ? "justify-center" : ""}`}>
        {visible.done && (
          <div className={`bg-card rounded-xl p-3 border border-border shadow-sm flex-1 min-w-0 ${activeCardCount === 1 ? "max-w-[200px] w-full" : ""}`}>
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Done</span>
            <p className="text-xl font-bold text-foreground leading-none mt-1">{stats.completedCount}</p>
            <span className="text-[10px] text-muted-foreground">days</span>
          </div>
        )}
        {visible.calories && (
          <div className={`bg-card rounded-xl p-3 border border-border shadow-sm flex-1 min-w-0 ${activeCardCount === 1 ? "max-w-[200px] w-full" : ""}`}>
            <div className="flex items-center gap-1">
              <Flame size={10} className="text-muted-foreground" />
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Calories</span>
            </div>
            <p className="text-xl font-bold text-foreground leading-none mt-1">{stats.totalCals.toLocaleString()}</p>
            <span className="text-[10px] text-muted-foreground">kcal</span>
          </div>
        )}
        {visible.distance && (
          <div className={`bg-card rounded-xl p-3 border border-border shadow-sm flex-1 min-w-0 ${activeCardCount === 1 ? "max-w-[200px] w-full" : ""}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <Route size={10} className="text-muted-foreground" />
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Distance</span>
              </div>
              <button onClick={toggleDistUnit} className="text-[9px] text-primary font-semibold px-1.5 py-0.5 rounded-md bg-primary/5 hover:bg-primary/10 transition-colors">
                {distUnit}
              </button>
            </div>
            <p className="text-xl font-bold text-foreground leading-none mt-1">
              {stats.totalDistance < 10 ? stats.totalDistance.toFixed(1) : Math.round(stats.totalDistance).toLocaleString()}
            </p>
            <span className="text-[10px] text-muted-foreground">{distUnit === "mi" ? "miles" : "kilometers"}</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="mb-4 space-y-3">
      {/* 1. Weekly Goal Widget */}
      {renderWeeklyGoal()}

      {/* 2. Unified Stats Module */}
      <div className="bg-card rounded-xl border border-border shadow-sm p-3 space-y-3">
        {/* Filter / range row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 flex-wrap">
            {isCustomActive ? (
              <>
                <button
                  onClick={handleReturnToToday}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-primary text-primary-foreground transition-colors"
                >
                  <ArrowLeft size={10} />
                  Back to Today
                </button>
                {customRangeLabel && (
                  <span className="px-2 py-1 rounded-full text-[10px] font-medium bg-accent text-accent-foreground">
                    {customRangeLabel}
                  </span>
                )}
              </>
            ) : (
              quickFilters.map((f) => (
                <FilterPill key={f.key} label={f.label} active={range === f.key} onClick={() => setRange(f.key)} />
              ))
            )}

            {/* More options */}
            <Popover open={filterOpen} onOpenChange={(open) => { setFilterOpen(open); if (!open) setPickingStep(null); }}>
              <PopoverTrigger asChild>
                <button className={`px-1.5 py-1 rounded-full text-[11px] font-medium transition-colors ${isCustomActive && !filterOpen ? "bg-secondary text-muted-foreground hover:text-foreground" : filterOpen ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>
                  <ChevronDown size={12} />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 z-[60]" align="end">
                {pickingStep ? (
                  <div className="p-3">
                    <p className="text-xs font-semibold text-foreground mb-2">
                      {pickingStep === "from" ? "Select Start Date" : pickingStep === "to" ? "Select End Date" : "Confirm Date Range"}
                    </p>
                    {pickingStep === "confirm" && stagingFrom && stagingTo && (
                      <div className="mb-2 px-1">
                        <p className="text-xs text-muted-foreground">{fmtShort(stagingFrom)} → {fmtShort(stagingTo)}</p>
                      </div>
                    )}
                    <Calendar
                      mode="single"
                      selected={pickingStep === "from" ? stagingFrom : stagingTo}
                      onSelect={(date) => {
                        if (!date) return;
                        if (pickingStep === "from") { setStagingFrom(date); setStagingTo(undefined); setPickingStep("to"); }
                        else if (pickingStep === "to") {
                          if (stagingFrom && date < stagingFrom) { setStagingTo(stagingFrom); setStagingFrom(date); }
                          else setStagingTo(date);
                          setPickingStep("confirm");
                        } else if (pickingStep === "confirm") { setStagingFrom(date); setStagingTo(undefined); setPickingStep("to"); }
                      }}
                      modifiers={rangeModifiers}
                      modifiersStyles={rangeModifiersStyles}
                      className="pointer-events-auto"
                    />
                    {pickingStep === "confirm" && stagingFrom && stagingTo && (
                      <div className="flex gap-2 mt-2">
                        <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={() => { setStagingFrom(undefined); setStagingTo(undefined); setPickingStep("from"); }}>Reset</Button>
                        <Button size="sm" className="flex-1 text-xs gap-1" onClick={handleApplyRange}><Check size={12} />Apply</Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="py-1">
                    {(["30days", "custom"] as TimeRange[]).map((r) => (
                      <button key={r} onClick={() => selectRange(r)} className={`flex w-full items-center px-4 py-2.5 text-sm hover:bg-secondary transition-colors ${range === r ? "text-primary font-semibold" : "text-foreground"}`}>
                        {RANGE_LABELS[r]}
                      </button>
                    ))}
                  </div>
                )}
              </PopoverContent>
            </Popover>
          </div>

          {/* Settings gear */}
          <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
            <PopoverTrigger asChild>
              <button className="ml-1 text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-secondary/60" aria-label="Customize stats">
                <Settings2 size={13} />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-52 p-3 z-[60]" align="end">
              <p className="text-xs font-semibold text-foreground mb-3">Show stat cards</p>
              <div className="space-y-2.5">
                <label className="flex items-center justify-between">
                  <span className="text-sm text-foreground">Done</span>
                  <Switch checked={visible.done} onCheckedChange={() => toggleCard("done")} />
                </label>
                <label className="flex items-center justify-between">
                  <span className="text-sm text-foreground">Calories</span>
                  <Switch checked={visible.calories} onCheckedChange={() => toggleCard("calories")} />
                </label>
                <label className="flex items-center justify-between">
                  <span className="text-sm text-foreground">Distance</span>
                  <Switch checked={visible.distance} onCheckedChange={() => toggleCard("distance")} />
                </label>
              </div>
              <p className="text-[10px] text-muted-foreground mt-2">Weekly Goal is always shown</p>
            </PopoverContent>
          </Popover>
        </div>

        {/* Stat Cards */}
        {renderStatsGrid()}
      </div>
    </div>
  );
};

export default WorkoutStatsCards;
