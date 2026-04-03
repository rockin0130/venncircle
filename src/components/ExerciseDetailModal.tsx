import { useState, useEffect } from "react";
import { X, Play, Dumbbell, Target, AlertTriangle, CheckCircle2, ExternalLink } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import type { PresetExercise } from "@/lib/exerciseLibrary";

interface ExerciseDetailModalProps {
  exercise: PresetExercise | { name: string; muscle?: string };
  open: boolean;
  onClose: () => void;
  onAdd?: () => void;
  isSelected?: boolean;
}

interface ExerciseDetail {
  steps: string[];
  formCues: string[];
  commonMistakes: string[];
  musclesWorked: string[];
  videoSearchQuery?: string;
}

// Muscle group to gradient mapping
const MUSCLE_GRADIENT: Record<string, string> = {
  Chest: "from-rose-500/20 to-orange-500/20",
  Back: "from-blue-500/20 to-cyan-500/20",
  Shoulders: "from-amber-500/20 to-yellow-500/20",
  Biceps: "from-purple-500/20 to-pink-500/20",
  Triceps: "from-violet-500/20 to-indigo-500/20",
  Forearms: "from-teal-500/20 to-emerald-500/20",
  Abs: "from-orange-500/20 to-red-500/20",
  "Lower Back": "from-sky-500/20 to-blue-500/20",
  Trapezius: "from-indigo-500/20 to-purple-500/20",
  Neck: "from-slate-500/20 to-gray-500/20",
  Quads: "from-green-500/20 to-emerald-500/20",
  Hamstrings: "from-lime-500/20 to-green-500/20",
  Glutes: "from-pink-500/20 to-rose-500/20",
  Calves: "from-cyan-500/20 to-teal-500/20",
  Abductors: "from-fuchsia-500/20 to-pink-500/20",
  Adductors: "from-red-500/20 to-rose-500/20",
};

const MUSCLE_ICON_BG: Record<string, string> = {
  Chest: "bg-rose-500/10 text-rose-600",
  Back: "bg-blue-500/10 text-blue-600",
  Shoulders: "bg-amber-500/10 text-amber-600",
  Biceps: "bg-purple-500/10 text-purple-600",
  Triceps: "bg-violet-500/10 text-violet-600",
  Forearms: "bg-teal-500/10 text-teal-600",
  Abs: "bg-orange-500/10 text-orange-600",
  "Lower Back": "bg-sky-500/10 text-sky-600",
  Quads: "bg-green-500/10 text-green-600",
  Hamstrings: "bg-lime-500/10 text-lime-600",
  Glutes: "bg-pink-500/10 text-pink-600",
  Calves: "bg-cyan-500/10 text-cyan-600",
};

export default function ExerciseDetailModal({ exercise, open, onClose, onAdd, isSelected }: ExerciseDetailModalProps) {
  const [detail, setDetail] = useState<ExerciseDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const muscle = ("muscle" in exercise ? exercise.muscle : undefined) || "General";

  useEffect(() => {
    if (!open) { setDetail(null); setError(null); return; }
    setLoading(true);
    setError(null);

    supabase.functions.invoke("exercise-detail", {
      body: { exerciseName: exercise.name },
    }).then(({ data, error: err }) => {
      if (err || data?.error) {
        setError(data?.error || "Could not load exercise details");
      } else {
        setDetail(data);
      }
      setLoading(false);
    });
  }, [open, exercise.name]);

  if (!open) return null;

  const gradient = MUSCLE_GRADIENT[muscle] || "from-primary/20 to-primary/10";
  const iconBg = MUSCLE_ICON_BG[muscle] || "bg-primary/10 text-primary";

  return (
    <AnimatePresence>
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
          style={{ height: "calc(100vh - 2rem)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 pt-4 pb-2 flex-shrink-0">
            <h2 className="text-lg font-bold tracking-tight">Exercise Detail</h2>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
              <X size={16} />
            </button>
          </div>

          <div className="overflow-y-auto flex-1 px-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
            {/* Hero area */}
            <div className={`rounded-2xl bg-gradient-to-br ${gradient} p-6 mb-4 flex flex-col items-center gap-3`}>
              <div className={`w-16 h-16 rounded-2xl ${iconBg} flex items-center justify-center`}>
                <Dumbbell size={28} />
              </div>
              <h3 className="text-xl font-bold text-center">{exercise.name}</h3>
              <div className="flex items-center gap-2 flex-wrap justify-center">
                <span className="px-2.5 py-0.5 rounded-full bg-card/80 text-xs font-medium">{muscle}</span>
                {"aliases" in exercise && exercise.aliases?.length ? (
                  exercise.aliases.map((a) => (
                    <span key={a} className="px-2 py-0.5 rounded-full bg-card/50 text-[10px] text-muted-foreground">{a}</span>
                  ))
                ) : null}
              </div>
              {detail?.videoSearchQuery && (
                <a
                  href={`https://www.youtube.com/results?search_query=${encodeURIComponent(detail.videoSearchQuery)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 mt-1 px-3 py-1.5 rounded-full bg-red-500/90 text-white text-xs font-semibold"
                >
                  <Play size={12} fill="currentColor" />
                  Watch Demo
                  <ExternalLink size={10} />
                </a>
              )}
            </div>

            {loading && (
              <div className="space-y-4">
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-6 w-32 mt-4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
              </div>
            )}

            {error && (
              <div className="text-center py-8">
                <p className="text-sm text-muted-foreground">{error}</p>
              </div>
            )}

            {detail && (
              <div className="space-y-5">
                {/* Muscles Worked */}
                {detail.musclesWorked?.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Target size={14} className="text-primary" />
                      <h4 className="text-sm font-bold">Muscles Worked</h4>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {detail.musclesWorked.map((m, i) => (
                        <span key={i} className="px-2 py-1 rounded-lg bg-secondary text-xs font-medium">{m}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Instructions */}
                {detail.steps?.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle2 size={14} className="text-primary" />
                      <h4 className="text-sm font-bold">How To Perform</h4>
                    </div>
                    <ol className="space-y-2">
                      {detail.steps.map((step, i) => (
                        <li key={i} className="flex gap-2.5 text-sm">
                          <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                          <span className="text-muted-foreground leading-relaxed">{step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {/* Form Cues */}
                {detail.formCues?.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Target size={14} className="text-accent" />
                      <h4 className="text-sm font-bold">Form Cues</h4>
                    </div>
                    <ul className="space-y-1.5">
                      {detail.formCues.map((cue, i) => (
                        <li key={i} className="flex gap-2 text-sm">
                          <span className="text-accent shrink-0">✦</span>
                          <span className="text-muted-foreground">{cue}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Common Mistakes */}
                {detail.commonMistakes?.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle size={14} className="text-destructive" />
                      <h4 className="text-sm font-bold">Common Mistakes</h4>
                    </div>
                    <ul className="space-y-1.5">
                      {detail.commonMistakes.map((m, i) => (
                        <li key={i} className="flex gap-2 text-sm">
                          <span className="text-destructive shrink-0">✗</span>
                          <span className="text-muted-foreground">{m}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Bottom CTA */}
          {onAdd && (
            <div className="px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-2 border-t border-border flex-shrink-0">
              <button
                onClick={onAdd}
                className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-bold"
              >
                {isSelected ? "Already Selected ✓" : "Add Exercise"}
              </button>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
