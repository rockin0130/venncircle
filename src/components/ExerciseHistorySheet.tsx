import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";

interface PriorSet {
  set_number: number;
  weight: number;
  unit: string;
  reps: number;
  completed: boolean;
}

interface PriorSession {
  date: string;
  workoutTitle: string;
  sets: PriorSet[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  exerciseName: string;
}

const ExerciseHistorySheet = ({ open, onClose, exerciseName }: Props) => {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<PriorSession[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !user || !exerciseName) return;
    setLoading(true);

    (async () => {
      // Use ilike for flexible matching, and also try the exact name
      const normalizedName = exerciseName.replace(/\s*\(.*?\)\s*/g, "").trim();
      const { data } = await supabase
        .from("exercise_logs")
        .select("logged_date, workout_id, set_number, weight, unit, reps, completed")
        .eq("user_id", user.id)
        .or(`exercise_name.ilike.${normalizedName},exercise_name.ilike.${exerciseName}`)
        .eq("completed", true)
        .order("logged_date", { ascending: false })
        .order("set_number", { ascending: true })
        .limit(200);

      if (!data || data.length === 0) {
        setSessions([]);
        setLoading(false);
        return;
      }

      // Group by date
      const byDate = new Map<string, PriorSet[]>();
      for (const row of data) {
        const key = row.logged_date;
        if (!byDate.has(key)) byDate.set(key, []);
        byDate.get(key)!.push({
          set_number: row.set_number,
          weight: Number(row.weight),
          unit: row.unit,
          reps: row.reps,
          completed: row.completed,
        });
      }

      const result: PriorSession[] = [];
      for (const [date, sets] of byDate) {
        result.push({ date, workoutTitle: "", sets });
      }

      setSessions(result);
      setLoading(false);
    })();
  }, [open, user, exerciseName]);

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="bottom" className="max-h-[70vh] rounded-t-2xl px-4 pb-6">
        <SheetHeader className="pb-3">
          <SheetTitle className="text-sm font-semibold">{exerciseName} History</SheetTitle>
        </SheetHeader>
        <ScrollArea className="max-h-[55vh]">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin w-5 h-5 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No prior logs found</p>
          ) : (
            <div className="space-y-4">
              {sessions.map((session, i) => (
                <div key={i} className="space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground">
                    {new Date(session.date + "T00:00:00").toLocaleDateString("en-US", {
                      weekday: "short", month: "short", day: "numeric",
                    })}
                  </p>
                  <div className="space-y-0.5 pl-2">
                    {session.sets.map((s) => (
                      <p key={s.set_number} className="text-sm text-foreground">
                        <span className="text-muted-foreground">Set {s.set_number}:</span>{" "}
                        {s.weight} {s.unit} × {s.reps}
                      </p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};

export default ExerciseHistorySheet;
