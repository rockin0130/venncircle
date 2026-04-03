import { useState, useRef, useMemo } from "react";
import { Sparkles, Loader2, Plus, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Workout } from "@/context/AppContext";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import WorkoutContextSelector, { PERSONAL_ID } from "@/components/WorkoutContextSelector";

interface AISuggestion {
  title: string;
  emoji: string;
  duration: string;
  cal: number;
  tag: string;
  exercises: { name: string; sets: number; reps: string }[];
}

interface Props {
  selectedDate: string;
  recentWorkouts: Workout[];
  onAddWorkout: (workouts: Workout[]) => void;
}

const WorkoutAiSuggest = ({ selectedDate, recentWorkouts, onAddWorkout }: Props) => {
  const { activeGroup } = useAuth();
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<AISuggestion[] | null>(null);
  const [error, setError] = useState(false);
  const retryCount = useRef(0);

  // Context selector state — Personal always included
  const isPersonalActive = (activeGroup as any)?._personal === true;
  const defaultContexts = useMemo(() => {
    if (!activeGroup || isPersonalActive) return [PERSONAL_ID];
    return [PERSONAL_ID, activeGroup.id];
  }, [activeGroup, isPersonalActive]);
  const [selectedContexts, setSelectedContexts] = useState<string[]>(defaultContexts);

  // Reset when suggestions open
  const resetContexts = () => setSelectedContexts(defaultContexts);

  const generate = async (isRetry = false) => {
    if (loading) return;
    setLoading(true);
    setError(false);
    if (!isRetry) setSuggestions(null);

    const recentDone = recentWorkouts
      .filter((w) => w.done)
      .slice(-10);
    const recentTitles = recentDone.map((w) => `${w.title} (${w.tag || "General"})`);

    const prompt = recentTitles.length > 0
      ? `Suggest 4 different workout options for today. The user recently completed: ${recentTitles.join(", ")}. Vary the muscle groups to avoid overtraining recently worked muscles. Each workout should have 3-5 exercises.`
      : `Suggest 4 different workout options for today. Include a mix of upper body, lower body, cardio, and full body. Each workout should have 3-5 exercises.`;

    try {
      const { data, error: fnError } = await supabase.functions.invoke("ai-workout", {
        body: { prompt, planType: "suggest", startDate: selectedDate },
      });

      if (fnError) throw fnError;

      // Handle all possible response shapes from the edge function
      let parsed: AISuggestion[] = [];
      if (data?.plans && Array.isArray(data.plans)) {
        parsed = data.plans;
      } else if (data?.workouts && Array.isArray(data.workouts)) {
        parsed = data.workouts;
      } else if (Array.isArray(data)) {
        parsed = data;
      } else if (data?.plan && Array.isArray(data.plan)) {
        parsed = data.plan.filter((d: any) => d.workout).map((d: any) => d.workout);
      }

      if (parsed.length === 0) {
        // Auto-retry once silently
        if (retryCount.current < 1) {
          retryCount.current++;
          setLoading(false);
          return generate(true);
        }
        setError(true);
      } else {
        retryCount.current = 0;
        setSuggestions(parsed.slice(0, 4));
      }
    } catch (e) {
      console.error("AI suggest error:", e);
      // Auto-retry once silently
      if (retryCount.current < 1) {
        retryCount.current++;
        setLoading(false);
        return generate(true);
      }
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const selectSuggestion = (s: AISuggestion) => {
    const linkedId = selectedContexts.length > 1 ? crypto.randomUUID() : null;
    const newWorkouts: Workout[] = selectedContexts.map((ctx) => ({
      id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
      title: s.title,
      duration: s.duration,
      cal: s.cal,
      tag: s.tag,
      emoji: s.emoji,
      done: false,
      scheduledDate: selectedDate,
      exercises: s.exercises,
      groupId: ctx === PERSONAL_ID ? null : ctx,
      linkedWorkoutId: linkedId,
    }));
    onAddWorkout(newWorkouts);
    toast.success(`Added ${s.title}`);
    setSuggestions(null);
  };

  const dismiss = () => {
    setSuggestions(null);
    setError(false);
    retryCount.current = 0;
    resetContexts();
  };

  return (
    <div className="relative inline-flex">
      <button
        onClick={() => generate()}
        disabled={loading}
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-primary hover:bg-primary/5 transition-colors disabled:opacity-50"
        title="Get AI workout suggestions"
      >
        {loading ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
        {loading ? "Generating…" : "AI Suggest"}
      </button>

      {(suggestions || error) && (
        <>
          <button
            className="fixed inset-0 z-40 cursor-default"
            onClick={dismiss}
            aria-label="Close suggestions"
          />
          <div className="absolute right-0 top-8 z-50 w-72 rounded-xl border border-border bg-card shadow-lg overflow-hidden">
            {error ? (
              <div className="p-4 text-center space-y-3">
                <p className="text-sm text-muted-foreground">Couldn't generate suggestions right now.</p>
                <button
                  onClick={() => { retryCount.current = 0; generate(); }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold"
                >
                  <RotateCcw size={12} /> Retry
                </button>
              </div>
            ) : (
              <>
                <div className="p-3 border-b border-border space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">AI Suggestions</p>
                  <WorkoutContextSelector
                    selectedContexts={selectedContexts}
                    onChangeContexts={setSelectedContexts}
                  />
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {suggestions!.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => selectSuggestion(s)}
                      className="w-full flex items-center gap-3 p-3 text-left hover:bg-secondary transition-colors border-b border-border last:border-0"
                    >
                      <span className="text-2xl">{s.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{s.title}</p>
                        <p className="text-xs text-muted-foreground">{s.duration} · {s.cal} cal · {s.exercises?.length || 0} exercises</p>
                      </div>
                      <Plus size={14} className="text-primary flex-shrink-0" />
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default WorkoutAiSuggest;
