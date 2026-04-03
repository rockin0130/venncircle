import { useState, useEffect } from "react";
import { CalendarDays, Check, ChevronLeft, ChevronRight, Droplets } from "lucide-react";
import { useAppContext } from "@/context/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";

const HabitDateViewer = () => {
  const [viewingDate, setViewingDate] = useState<string | null>(null);
  const { getHabitsForDate } = useAppContext();
  const { user } = useAuth();
  const [historicalWater, setHistoricalWater] = useState<{ intake: number; goal: number } | null>(null);

  const formatLabel = (dateStr: string) => {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  };

  const shiftDate = (days: number) => {
    if (!viewingDate) return;
    const d = new Date(viewingDate + "T00:00:00");
    d.setDate(d.getDate() + days);
    setViewingDate(d.toISOString().split("T")[0]);
  };

  const todayStr = new Date().toISOString().split("T")[0];
  const dateToView = viewingDate || todayStr;
  const habitsForDate = getHabitsForDate(dateToView);
  const completed = habitsForDate.filter((h) => h.done);

  // Fetch water intake for the viewed date
  useEffect(() => {
    if (!viewingDate || !user) {
      setHistoricalWater(null);
      return;
    }
    const fetchWater = async () => {
      const { data } = await supabase
        .from("water_tracking")
        .select("intake, goal")
        .eq("user_id", user.id)
        .eq("date", viewingDate)
        .maybeSingle();
      setHistoricalWater(data ? { intake: Number(data.intake), goal: Number(data.goal) } : { intake: 0, goal: 3 });
    };
    fetchWater();
  }, [viewingDate, user]);

  if (!viewingDate) {
    return (
      <section className="mb-6">
        <button
          onClick={() => {
            const d = new Date();
            d.setDate(d.getDate() - 1);
            setViewingDate(d.toISOString().split("T")[0]);
          }}
          className="flex items-center gap-2 text-sm text-primary font-medium"
        >
          <CalendarDays size={16} />
          View past habits
        </button>
      </section>
    );
  }

  return (
    <section className="mb-6">
      <div className="bg-card rounded-xl p-4 border border-border shadow-card">
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => shiftDate(-1)} className="p-1 rounded-lg bg-secondary">
            <ChevronLeft size={16} />
          </button>
          <div className="text-center">
            <p className="text-sm font-semibold">{formatLabel(dateToView)}</p>
            <p className="text-[10px] text-muted-foreground">{completed.length} habits completed</p>
          </div>
          <button onClick={() => shiftDate(1)} className="p-1 rounded-lg bg-secondary">
            <ChevronRight size={16} />
          </button>
        </div>

        {completed.length > 0 ? (
          <div className="space-y-2">
            {habitsForDate.map((h) => (
              <div key={h.id} className={`flex items-center gap-2 text-sm ${h.done ? "text-foreground" : "text-muted-foreground/40"}`}>
                {h.done ? (
                  <span className="w-5 h-5 rounded-full bg-habit-green flex items-center justify-center flex-shrink-0">
                    <Check size={12} className="text-primary-foreground" />
                  </span>
                ) : (
                  <span className="w-5 h-5 rounded-full border border-muted flex-shrink-0" />
                )}
                {h.label}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-2">No habits tracked on this date</p>
        )}

        {/* Water intake for this date */}
        {historicalWater && (
          <div className="mt-3 pt-3 border-t border-border">
            <div className="flex items-center gap-2 mb-1">
              <Droplets size={14} className="text-primary" />
              <span className="text-sm font-medium">Water Intake</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="font-bold">{historicalWater.intake.toFixed(1)}L</span>
              <span className="text-muted-foreground">/ {historicalWater.goal}L</span>
            </div>
            <div className="mt-1 h-1.5 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${historicalWater.goal > 0 ? Math.min((historicalWater.intake / historicalWater.goal) * 100, 100) : 0}%` }}
              />
            </div>
          </div>
        )}

        <button
          onClick={() => setViewingDate(null)}
          className="mt-3 text-xs text-muted-foreground font-medium w-full text-center"
        >
          Close
        </button>
      </div>
    </section>
  );
};

export default HabitDateViewer;
