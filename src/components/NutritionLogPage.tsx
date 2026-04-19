import { useState, useEffect, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, Search, Flame, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";

const fmtDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const MEAL_ICONS: Record<string, string> = { breakfast: "🌅", lunch: "☀️", dinner: "🌙", snack: "🍎" };

interface MealEntry {
  id: string;
  title: string;
  meal_type: string;
  protein: number;
  calories: number;
  carbs: number;
  fat: number;
  fiber: number;
  meal_date: string;
  consumed: boolean;
}

interface DayGroup {
  date: string;
  meals: MealEntry[];
  totalCal: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  totalFiber: number;
}

interface Props {
  onBack: () => void;
  onSelectDate: (d: Date) => void;
}

const NutritionLogPage = ({ onBack, onSelectDate }: Props) => {
  const { user } = useAuth();
  const [allMeals, setAllMeals] = useState<MealEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [showFullCalendar, setShowFullCalendar] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("meal_logs")
        .select("id, title, meal_type, protein, calories, carbs, fat, fiber, meal_date, consumed")
        .eq("user_id", user.id)
        .eq("consumed", true)
        .is("group_id", null)
        .order("meal_date", { ascending: false })
        .limit(500);
      if (data) setAllMeals(data as MealEntry[]);
      setLoading(false);
    };
    load();
  }, [user]);

  const loggedDatesSet = useMemo(() => {
    const s = new Set<string>();
    allMeals.forEach(m => s.add(m.meal_date));
    return s;
  }, [allMeals]);

  const filteredMeals = useMemo(() => {
    if (!searchQuery.trim()) return allMeals;
    const q = searchQuery.toLowerCase();
    return allMeals.filter(m => m.title.toLowerCase().includes(q));
  }, [allMeals, searchQuery]);

  const dayGroups = useMemo(() => {
    const map = new Map<string, MealEntry[]>();
    for (const m of filteredMeals) {
      if (!map.has(m.meal_date)) map.set(m.meal_date, []);
      map.get(m.meal_date)!.push(m);
    }
    const groups: DayGroup[] = [];
    for (const [date, meals] of map) {
      groups.push({
        date,
        meals,
        totalCal: meals.reduce((s, m) => s + (m.calories || 0), 0),
        totalProtein: meals.reduce((s, m) => s + m.protein, 0),
        totalCarbs: meals.reduce((s, m) => s + (m.carbs || 0), 0),
        totalFat: meals.reduce((s, m) => s + (m.fat || 0), 0),
        totalFiber: meals.reduce((s, m) => s + (m.fiber || 0), 0),
      });
    }
    groups.sort((a, b) => b.date.localeCompare(a.date));
    return groups;
  }, [filteredMeals]);

  // Stats
  const stats = useMemo(() => {
    const uniqueDays = new Set(allMeals.map(m => m.meal_date));
    const daysLogged = uniqueDays.size;
    const totalCal = allMeals.reduce((s, m) => s + (m.calories || 0), 0);
    const totalProtein = allMeals.reduce((s, m) => s + m.protein, 0);
    const avgCal = daysLogged > 0 ? Math.round(totalCal / daysLogged) : 0;
    const avgProtein = daysLogged > 0 ? Math.round(totalProtein / daysLogged) : 0;

    // Calculate streak
    let streak = 0;
    const today = new Date();
    const d = new Date(today);
    while (true) {
      if (loggedDatesSet.has(fmtDate(d))) {
        streak++;
        d.setDate(d.getDate() - 1);
      } else {
        break;
      }
    }

    return { avgCal, daysLogged, avgProtein, streak };
  }, [allMeals, loggedDatesSet]);

  // Calendar grid
  const calendarGrid = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDayOfWeek = firstDay.getDay();
    const daysInMonth = lastDay.getDate();

    const cells: (Date | null)[] = [];
    for (let i = 0; i < startDayOfWeek; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
    return cells;
  }, [calendarMonth]);

  const formatDayHeader = (dateStr: string) => {
    const d = new Date(dateStr + "T12:00:00");
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  };

  return (
    <div className="flex flex-col min-h-full px-5">
      {/* Header */}
      <div className="flex items-center gap-3 safe-area-top pt-3 pb-4">
        <button onClick={onBack} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
          <ChevronLeft size={18} />
        </button>
        <h1 className="text-xl font-bold text-foreground">Nutrition Log</h1>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="bg-card rounded-xl border border-border p-3 text-center">
          <p className="text-lg font-bold text-foreground">{stats.avgCal.toLocaleString()}</p>
          <p className="text-[10px] text-muted-foreground">Avg daily kcal</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-3 text-center">
          <p className="text-lg font-bold text-foreground">{stats.daysLogged}</p>
          <p className="text-[10px] text-muted-foreground">Days logged</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-3 text-center">
          <p className="text-lg font-bold text-foreground">{stats.avgProtein}g</p>
          <p className="text-[10px] text-muted-foreground">Avg daily protein</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-3 text-center">
          <p className="text-lg font-bold text-foreground flex items-center justify-center gap-1">
            <Flame size={16} className="text-orange-500" /> {stats.streak} days
          </p>
          <p className="text-[10px] text-muted-foreground">Logging streak</p>
        </div>
      </div>

      {/* Calendar toggle */}
      <div className="bg-card rounded-xl border border-border mb-4 overflow-hidden">
        <button
          onClick={() => setShowFullCalendar(!showFullCalendar)}
          className="flex items-center justify-between w-full px-3 py-2"
        >
          <span className="text-xs font-semibold text-foreground">
            {calendarMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </span>
          {showFullCalendar ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
        </button>

        {showFullCalendar && (
          <div className="px-3 pb-3">
            <div className="flex items-center justify-between mb-2">
              <button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1))} className="text-xs text-primary font-semibold">‹ Prev</button>
              <button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1))} className="text-xs text-primary font-semibold">Next ›</button>
            </div>
            <div className="grid grid-cols-7 gap-1 mb-1">
              {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                <div key={i} className="text-center text-[9px] font-semibold text-muted-foreground">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {calendarGrid.map((d, i) => {
                if (!d) return <div key={i} />;
                const ds = fmtDate(d);
                const hasLog = loggedDatesSet.has(ds);
                return (
                  <button
                    key={i}
                    onClick={() => { onSelectDate(d); onBack(); }}
                    className={`h-8 rounded-lg text-[11px] font-medium flex items-center justify-center transition-colors ${hasLog ? "bg-green-500/15 text-green-700 font-bold" : "text-foreground hover:bg-secondary"}`}
                  >
                    {d.getDate()}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search past meals..."
          className="w-full text-sm pl-9 pr-3 py-2.5 rounded-xl border border-border bg-background placeholder:text-muted-foreground"
        />
      </div>

      {/* Past entries */}
      <div className="flex-1 overflow-y-auto pb-24 space-y-4">
        {loading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">Loading...</div>
        ) : dayGroups.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            {searchQuery ? "No meals found" : "No meals logged yet"}
          </div>
        ) : (
          dayGroups.map(group => (
            <div key={group.date} className="bg-card rounded-xl border border-border overflow-hidden">
              <div className="px-3 py-2 border-b border-border/30">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">{formatDayHeader(group.date)}</span>
                  <span className="text-[10px] text-muted-foreground">{group.totalCal.toLocaleString()} kcal total</span>
                </div>
                <div className="flex gap-3 mt-1">
                  <span className="text-[9px] text-primary font-semibold">{group.totalProtein}g P</span>
                  <span className="text-[9px] text-muted-foreground">{group.totalCarbs}g C</span>
                  <span className="text-[9px] text-muted-foreground">{group.totalFat}g F</span>
                  <span className="text-[9px] text-muted-foreground">{group.totalFiber}g Fiber</span>
                </div>
              </div>
              <div className="divide-y divide-border/20">
                {group.meals.map(meal => (
                  <div key={meal.id} className="flex items-center gap-2 px-3 py-2">
                    <span className="text-sm">{MEAL_ICONS[meal.meal_type] || "🍽️"}</span>
                    <span className="text-xs font-medium text-foreground truncate flex-1">{meal.title}</span>
                    <span className="text-[10px] text-muted-foreground flex-shrink-0">{meal.calories} kcal</span>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default NutritionLogPage;
