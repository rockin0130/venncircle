import { useState, useMemo, useEffect } from "react";
import { X, Search, Plus, ChevronRight, Clock, Dumbbell, Check, Info } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  EXERCISE_LIBRARY,
  MUSCLE_GROUP_SECTIONS,
  getExercisesByMuscle,
  searchExercises,
  type MuscleGroup,
  type PresetExercise,
} from "@/lib/exerciseLibrary";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import ExerciseDetailModal from "@/components/ExerciseDetailModal";

interface ExerciseLibrarySheetProps {
  open: boolean;
  onClose: () => void;
  onSelectMultiple: (names: string[]) => void;
  excludeNames?: string[];
}

type Tab = "recent" | "all" | "muscle";

const MUSCLE_EMOJI: Record<string, string> = {
  Chest: "🫁", Abs: "🎯", Back: "🔙", "Lower Back": "⬇️", Trapezius: "🔺", Neck: "🦒",
  Shoulders: "🏔️", Biceps: "💪", Triceps: "🦾", Forearms: "🤲",
  Glutes: "🍑", Quads: "🦵", Hamstrings: "🦿", Calves: "🐄", Abductors: "↔️", Adductors: "↕️",
};

// Muscle group color mapping for thumbnails
const MUSCLE_COLORS: Record<string, { bg: string; text: string }> = {
  Chest: { bg: "bg-rose-500/15", text: "text-rose-600 dark:text-rose-400" },
  Back: { bg: "bg-blue-500/15", text: "text-blue-600 dark:text-blue-400" },
  Shoulders: { bg: "bg-amber-500/15", text: "text-amber-600 dark:text-amber-400" },
  Biceps: { bg: "bg-purple-500/15", text: "text-purple-600 dark:text-purple-400" },
  Triceps: { bg: "bg-violet-500/15", text: "text-violet-600 dark:text-violet-400" },
  Forearms: { bg: "bg-teal-500/15", text: "text-teal-600 dark:text-teal-400" },
  Abs: { bg: "bg-orange-500/15", text: "text-orange-600 dark:text-orange-400" },
  "Lower Back": { bg: "bg-sky-500/15", text: "text-sky-600 dark:text-sky-400" },
  Trapezius: { bg: "bg-indigo-500/15", text: "text-indigo-600 dark:text-indigo-400" },
  Neck: { bg: "bg-slate-500/15", text: "text-slate-600 dark:text-slate-400" },
  Quads: { bg: "bg-green-500/15", text: "text-green-600 dark:text-green-400" },
  Hamstrings: { bg: "bg-lime-500/15", text: "text-lime-600 dark:text-lime-400" },
  Glutes: { bg: "bg-pink-500/15", text: "text-pink-600 dark:text-pink-400" },
  Calves: { bg: "bg-cyan-500/15", text: "text-cyan-600 dark:text-cyan-400" },
  Abductors: { bg: "bg-fuchsia-500/15", text: "text-fuchsia-600 dark:text-fuchsia-400" },
  Adductors: { bg: "bg-red-500/15", text: "text-red-600 dark:text-red-400" },
};

export default function ExerciseLibrarySheet({ open, onClose, onSelectMultiple, excludeNames = [] }: ExerciseLibrarySheetProps) {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("recent");
  const [query, setQuery] = useState("");
  const [recentNames, setRecentNames] = useState<string[]>([]);
  const [selectedMuscle, setSelectedMuscle] = useState<MuscleGroup | null>(null);
  const [customName, setCustomName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detailExercise, setDetailExercise] = useState<PresetExercise | { name: string; muscle?: string } | null>(null);

  const excludeSet = useMemo(() => new Set(excludeNames.map(n => n.toLowerCase())), [excludeNames]);
  const recentSet = useMemo(() => new Set(recentNames), [recentNames]);

  // Reset selection when opening
  useEffect(() => {
    if (open) setSelected(new Set());
  }, [open]);

  // Fetch recent exercises
  useEffect(() => {
    if (!open || !user) return;
    (async () => {
      const { data } = await supabase
        .from("exercise_logs")
        .select("exercise_name, logged_date")
        .eq("user_id", user.id)
        .eq("completed", true)
        .order("logged_date", { ascending: false })
        .limit(500);
      if (!data) return;
      const seen = new Set<string>();
      const names: string[] = [];
      for (const row of data) {
        const name = row.exercise_name.replace(/\s*\(.*?\)\s*/g, "").trim();
        if (!seen.has(name)) { seen.add(name); names.push(name); }
      }
      setRecentNames(names);
    })();
  }, [open, user]);

  const searchResults = useMemo(() => {
    if (!query.trim()) return [];
    return searchExercises(query, { recentNames: recentSet, excludeNames: excludeSet });
  }, [query, recentSet, excludeSet]);

  const recentExercises = useMemo(() => {
    return recentNames.filter(n => !excludeSet.has(n.toLowerCase())).slice(0, 30);
  }, [recentNames, excludeSet]);

  const muscleExercises = useMemo(() => {
    if (!selectedMuscle) return [];
    return getExercisesByMuscle(selectedMuscle).filter(ex => !excludeSet.has(ex.name.toLowerCase()));
  }, [selectedMuscle, excludeSet]);

  const toggleSelect = (name: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleConfirm = () => {
    if (selected.size === 0) return;
    onSelectMultiple(Array.from(selected));
    setQuery("");
    setCustomName("");
  };

  const handleCustomAdd = () => {
    const name = customName.trim();
    if (!name) return;
    toggleSelect(name);
    setCustomName("");
  };

  if (!open) return null;

  const isSearching = query.trim().length > 0;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[70] bg-black/50 flex items-end justify-center"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="w-full max-w-md bg-card rounded-t-2xl border-t border-border flex flex-col"
          style={{ height: "calc(100vh - 3rem)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 pt-4 pb-2 flex-shrink-0">
            <h2 className="text-lg font-bold tracking-tight">Exercise Library</h2>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
              <X size={16} />
            </button>
          </div>

          {/* Search bar */}
          <div className="px-4 pb-2 flex-shrink-0">
            <div className="flex items-center gap-2 bg-secondary rounded-xl px-3 py-2.5">
              <Search size={15} className="text-muted-foreground shrink-0" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search exercises..."
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                autoFocus
              />
              {query && (
                <button onClick={() => setQuery("")} className="text-muted-foreground">
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Tabs */}
          {!isSearching && !selectedMuscle && (
            <div className="flex gap-1 px-4 pb-2 flex-shrink-0">
              {(["recent", "all", "muscle"] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    tab === t
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t === "recent" ? "Recent" : t === "all" ? "All" : "By Muscle"}
                </button>
              ))}
            </div>
          )}

          {/* Back from muscle drill-down */}
          {selectedMuscle && !isSearching && (
            <div className="px-4 pb-2 flex-shrink-0">
              <button
                onClick={() => setSelectedMuscle(null)}
                className="text-xs text-primary font-medium flex items-center gap-1"
              >
                ← Back to muscle groups
              </button>
              <p className="text-sm font-semibold mt-1">{MUSCLE_EMOJI[selectedMuscle] || "💪"} {selectedMuscle}</p>
            </div>
          )}

          {/* Content */}
          <div className="overflow-y-auto flex-1 px-4 pb-2">

            {/* SEARCH RESULTS */}
            {isSearching && (
              <div className="space-y-1">
                {searchResults.slice(0, 30).map((ex) => (
                  <ExerciseCard
                    key={ex.id}
                    exercise={ex}
                    isRecent={recentSet.has(ex.name)}
                    isSelected={selected.has(ex.name)}
                    onToggle={() => toggleSelect(ex.name)}
                    onDetail={() => setDetailExercise(ex)}
                  />
                ))}
                {searchResults.length === 0 && (
                  <div className="text-center py-8 space-y-3">
                    <p className="text-sm text-muted-foreground">No exercises found for "{query}"</p>
                    <div className="flex gap-2 items-center justify-center">
                      <input
                        value={customName || query}
                        onChange={(e) => setCustomName(e.target.value)}
                        placeholder="Custom exercise name"
                        className="bg-secondary rounded-lg px-3 py-2 text-sm outline-none flex-1 max-w-[200px]"
                        onKeyDown={(e) => e.key === "Enter" && handleCustomAdd()}
                      />
                      <button
                        onClick={() => { setCustomName(customName || query); handleCustomAdd(); }}
                        className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold"
                      >
                        Add Custom
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* RECENT */}
            {!isSearching && !selectedMuscle && tab === "recent" && (
              <div className="space-y-1">
                {recentExercises.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">No recent exercises yet. Complete a workout to see your history here.</p>
                )}
                {recentExercises.map((name) => {
                  const preset = EXERCISE_LIBRARY.find(e => e.name.toLowerCase() === name.toLowerCase());
                  return (
                    <ExerciseCard
                      key={name}
                      exercise={preset || { name, muscle: undefined, id: name }}
                      isRecent
                      isSelected={selected.has(name)}
                      onToggle={() => toggleSelect(name)}
                      onDetail={() => setDetailExercise(preset || { name })}
                    />
                  );
                })}
              </div>
            )}

            {/* ALL */}
            {!isSearching && !selectedMuscle && tab === "all" && (
              <div className="space-y-1">
                {EXERCISE_LIBRARY.filter(ex => !excludeSet.has(ex.name.toLowerCase())).map((ex) => (
                  <ExerciseCard
                    key={ex.id}
                    exercise={ex}
                    isRecent={recentSet.has(ex.name)}
                    isSelected={selected.has(ex.name)}
                    onToggle={() => toggleSelect(ex.name)}
                    onDetail={() => setDetailExercise(ex)}
                  />
                ))}
              </div>
            )}

            {/* BY MUSCLE (group list) */}
            {!isSearching && !selectedMuscle && tab === "muscle" && (
              <div className="space-y-4">
                {MUSCLE_GROUP_SECTIONS.map((section) => (
                  <div key={section.label}>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">{section.label}</p>
                    <div className="space-y-0.5">
                      {section.groups.map((muscle) => {
                        const count = getExercisesByMuscle(muscle).length;
                        const colors = MUSCLE_COLORS[muscle] || { bg: "bg-secondary", text: "text-muted-foreground" };
                        return (
                          <button
                            key={muscle}
                            onClick={() => setSelectedMuscle(muscle)}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-secondary transition-colors"
                          >
                            <div className={`w-9 h-9 rounded-xl ${colors.bg} flex items-center justify-center`}>
                              <span className="text-sm">{MUSCLE_EMOJI[muscle] || "💪"}</span>
                            </div>
                            <span className="text-sm font-medium flex-1 text-left">{muscle}</span>
                            <span className="text-[11px] text-muted-foreground">{count}</span>
                            <ChevronRight size={14} className="text-muted-foreground" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* BY MUSCLE (drill-down) */}
            {!isSearching && selectedMuscle && (
              <div className="space-y-1">
                {muscleExercises.map((ex) => (
                  <ExerciseCard
                    key={ex.id}
                    exercise={ex}
                    isRecent={recentSet.has(ex.name)}
                    isSelected={selected.has(ex.name)}
                    onToggle={() => toggleSelect(ex.name)}
                    onDetail={() => setDetailExercise(ex)}
                  />
                ))}
              </div>
            )}

            {/* Custom add fallback */}
            {!isSearching && (
              <div className="mt-4 pt-3 border-t border-border">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Can't find it?</p>
                <div className="flex gap-2">
                  <input
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCustomAdd()}
                    placeholder="Custom exercise name..."
                    className="flex-1 bg-secondary rounded-xl px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground"
                  />
                  <button
                    onClick={handleCustomAdd}
                    disabled={!customName.trim()}
                    className="px-3 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Bottom CTA - sticky */}
          <div className="px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-2 border-t border-border flex-shrink-0">
            <button
              onClick={handleConfirm}
              disabled={selected.size === 0}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-bold disabled:opacity-40 transition-opacity"
            >
              {selected.size === 0 ? "Select Exercises" : `Add ${selected.size} Exercise${selected.size > 1 ? "s" : ""}`}
            </button>
          </div>
        </motion.div>
      </motion.div>

      {/* Detail modal */}
      {detailExercise && (
        <ExerciseDetailModal
          exercise={detailExercise}
          open={!!detailExercise}
          onClose={() => setDetailExercise(null)}
          onAdd={() => {
            toggleSelect(detailExercise.name);
            setDetailExercise(null);
          }}
          isSelected={selected.has(detailExercise.name)}
        />
      )}
    </AnimatePresence>
  );
}

// --- Rich Exercise Card ---
function ExerciseCard({
  exercise,
  isRecent,
  isSelected,
  onToggle,
  onDetail,
}: {
  exercise: PresetExercise | { name: string; muscle?: string; id?: string };
  isRecent?: boolean;
  isSelected: boolean;
  onToggle: () => void;
  onDetail: () => void;
}) {
  const muscle = ("muscle" in exercise ? exercise.muscle : undefined) || "";
  const colors = MUSCLE_COLORS[muscle] || { bg: "bg-secondary", text: "text-muted-foreground" };

  return (
    <div
      className={`flex items-center gap-2.5 px-2 py-2 rounded-xl transition-colors ${
        isSelected ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-secondary"
      }`}
    >
      {/* Checkbox area */}
      <button
        onClick={onToggle}
        className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
          isSelected
            ? "bg-primary border-primary"
            : "border-border hover:border-primary/50"
        }`}
      >
        {isSelected && <Check size={12} className="text-primary-foreground" />}
      </button>

      {/* Thumbnail / icon - tapping opens detail */}
      <button
        onClick={onDetail}
        className={`w-10 h-10 rounded-xl ${colors.bg} flex items-center justify-center shrink-0 relative group`}
      >
        <Dumbbell size={16} className={colors.text} />
        <div className="absolute inset-0 rounded-xl bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
          <Info size={10} className="text-foreground" />
        </div>
      </button>

      {/* Name + muscle - tapping toggles select */}
      <button onClick={onToggle} className="flex-1 min-w-0 text-left">
        <p className="text-sm font-medium truncate">{exercise.name}</p>
        {muscle && <p className="text-[11px] text-muted-foreground">{muscle}</p>}
      </button>

      {/* Recent indicator */}
      {isRecent && <Clock size={12} className="text-muted-foreground shrink-0" />}
    </div>
  );
}
