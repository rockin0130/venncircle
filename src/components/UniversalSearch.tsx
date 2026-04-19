import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, X, Calendar, ListTodo, MessageCircle, Dumbbell, Heart, Apple, ShoppingCart, Trophy, ArrowRight } from "lucide-react";
import { useAppContext, Task, ScheduledEvent } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useModalScrollLock } from "@/hooks/useModalScrollLock";

type FilterType = "all" | "tasks" | "calendar" | "chat" | "habits" | "more";

interface SearchResult {
  id: string;
  type: "task" | "event" | "habit" | "workout" | "special_day" | "meal" | "shopping";
  title: string;
  subtitle?: string;
  date?: string;
  groupName?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onNavigate?: (tab: string) => void;
}

const FILTER_OPTIONS: { id: FilterType; label: string }[] = [
  { id: "all", label: "All" },
  { id: "tasks", label: "Tasks" },
  { id: "calendar", label: "Calendar" },
  { id: "chat", label: "Chat" },
  { id: "habits", label: "Routines" },
  { id: "more", label: "More" },
];

const TYPE_ICONS: Record<string, React.ReactNode> = {
  task: <ListTodo size={14} className="text-primary" />,
  event: <Calendar size={14} className="text-accent" />,
  habit: <Dumbbell size={14} className="text-[hsl(var(--habit-green))]" />,
  workout: <Dumbbell size={14} className="text-primary" />,
  special_day: <Heart size={14} className="text-destructive" />,
  meal: <Apple size={14} className="text-[hsl(var(--habit-green))]" />,
  shopping: <ShoppingCart size={14} className="text-accent" />,
};

const UniversalSearch = ({ open, onClose, onNavigate }: Props) => {
  useModalScrollLock(open);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterType>("all");
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const { tasks, events, habits, filteredWorkouts } = useAppContext();
  const { user, groups } = useAuth();

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveFilter("all");
      setTimeout(() => inputRef.current?.focus(), 100);
      try {
        const saved = localStorage.getItem("recentSearches");
        if (saved) setRecentSearches(JSON.parse(saved));
      } catch {}
    }
  }, [open]);

  const saveSearch = useCallback((q: string) => {
    const next = [q, ...recentSearches.filter((s) => s !== q)].slice(0, 5);
    setRecentSearches(next);
    try { localStorage.setItem("recentSearches", JSON.stringify(next)); } catch {}
  }, [recentSearches]);

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase().trim();
    const matches: SearchResult[] = [];

    // Tasks
    if (activeFilter === "all" || activeFilter === "tasks") {
      tasks.filter((t) => t.title.toLowerCase().includes(q)).forEach((t) => {
        matches.push({
          id: t.id,
          type: "task",
          title: t.title,
          subtitle: t.done ? "Completed" : "Pending",
          date: t.dueDate || undefined,
        });
      });
    }

    // Events
    if (activeFilter === "all" || activeFilter === "calendar") {
      events.filter((e) => e.title.toLowerCase().includes(q)).forEach((e) => {
        matches.push({
          id: e.id,
          type: "event",
          title: e.title,
          subtitle: e.time && e.time !== "All day" ? e.time : "All day",
          date: `${e.year}-${String(e.month + 1).padStart(2, "0")}-${String(e.day).padStart(2, "0")}`,
        });
      });
    }

    // Habits
    if (activeFilter === "all" || activeFilter === "habits") {
      habits.filter((h) => h.label.toLowerCase().includes(q)).forEach((h) => {
        matches.push({
          id: h.id,
          type: "habit",
          title: h.label,
          subtitle: h.category,
        });
      });
    }

    // Workouts
    if (activeFilter === "all" || activeFilter === "more") {
      filteredWorkouts.filter((w) => w.title.toLowerCase().includes(q)).forEach((w) => {
        matches.push({
          id: w.id,
          type: "workout",
          title: w.title,
          subtitle: `${w.emoji} ${w.duration} · ${w.cal} cal`,
          date: w.scheduledDate || undefined,
        });
      });
    }

    return matches.slice(0, 20);
  }, [query, activeFilter, tasks, events, habits, filteredWorkouts]);

  // AI suggestions based on context
  const aiSuggestions = useMemo(() => {
    if (query.trim()) return [];
    const suggestions: string[] = [];
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    
    const todayEvents = events.filter(
      (e) => e.day === today.getDate() && e.month === today.getMonth() && e.year === today.getFullYear()
    );
    if (todayEvents.length > 0) suggestions.push(`Today's events (${todayEvents.length})`);
    
    const pendingTasks = tasks.filter((t) => !t.done);
    if (pendingTasks.length > 0) suggestions.push(`Pending tasks (${pendingTasks.length})`);
    
    const incompleteHabits = habits.filter((h) => !h.completionDates.includes(todayStr));
    if (incompleteHabits.length > 0) suggestions.push(`Incomplete routines`);

    return suggestions;
  }, [query, events, tasks, habits]);

  if (!open) return null;

  const groupedResults = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    if (!acc[r.type]) acc[r.type] = [];
    acc[r.type].push(r);
    return acc;
  }, {});

  const typeLabels: Record<string, string> = {
    task: "Tasks",
    event: "Calendar Events",
    habit: "Routines",
    workout: "Workouts",
    special_day: "Special Days",
    meal: "Nutrition",
    shopping: "Shopping",
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-background"
      >
        <div className="max-w-md mx-auto h-full flex flex-col">
          {/* Search header */}
          <div className="px-4 safe-area-top pt-3 pb-3">
            <div className="flex items-center gap-3 bg-secondary/60 rounded-2xl px-4 py-3 border border-border/50">
              <Search size={18} className="text-muted-foreground flex-shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && query.trim()) saveSearch(query.trim());
                  if (e.key === "Escape") onClose();
                }}
                placeholder="Search anything..."
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
                style={{ fontFamily: "'Georgia', serif" }}
              />
              {query && (
                <button onClick={() => setQuery("")} className="text-muted-foreground hover:text-foreground">
                  <X size={16} />
                </button>
              )}
              <button
                onClick={onClose}
                className="text-xs font-semibold text-primary hover:text-primary/80 ml-1"
              >
                Cancel
              </button>
            </div>

            {/* Filter pills */}
            <div className="flex gap-1.5 mt-3 overflow-x-auto scrollbar-hide pb-1">
              {FILTER_OPTIONS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setActiveFilter(f.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                    activeFilter === f.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Results */}
          <div className="flex-1 overflow-y-auto scroll-smooth-touch px-4 pb-8">
            {!query.trim() ? (
              <>
                {/* AI suggestions */}
                {aiSuggestions.length > 0 && (
                  <div className="mb-5">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                      Suggestions
                    </p>
                    <div className="space-y-1.5">
                      {aiSuggestions.map((s, i) => (
                        <button
                          key={i}
                          onClick={() => { setQuery(s); saveSearch(s); }}
                          className="w-full flex items-center gap-3 p-3 rounded-xl bg-primary/5 border border-primary/10 text-left hover:bg-primary/10 transition-colors"
                        >
                          <Search size={14} className="text-primary flex-shrink-0" />
                          <span className="text-sm font-medium text-foreground">{s}</span>
                          <ArrowRight size={14} className="ml-auto text-muted-foreground" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recent searches */}
                {recentSearches.length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                      Recent Searches
                    </p>
                    <div className="space-y-1">
                      {recentSearches.map((s, i) => (
                        <button
                          key={i}
                          onClick={() => { setQuery(s); saveSearch(s); }}
                          className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-secondary transition-colors text-left"
                        >
                          <Search size={13} className="text-muted-foreground/50" />
                          <span className="text-sm text-foreground">{s}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : results.length === 0 ? (
              <div className="text-center py-16">
                <Search size={36} className="mx-auto text-muted-foreground/20 mb-3" />
                <p className="text-sm text-muted-foreground">No results for "{query}"</p>
              </div>
            ) : (
              <div className="space-y-5">
                {Object.entries(groupedResults).map(([type, items]) => (
                  <div key={type}>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                      {typeLabels[type] || type}
                    </p>
                    <div className="space-y-1">
                      {items.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => {
                            saveSearch(query.trim());
                            onClose();
                          }}
                          className="w-full flex items-center gap-3 p-3 rounded-xl bg-card border border-border/50 hover:border-primary/20 text-left transition-colors"
                        >
                          <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
                            {TYPE_ICONS[item.type]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{item.title}</p>
                            {item.subtitle && (
                              <p className="text-[11px] text-muted-foreground truncate">{item.subtitle}</p>
                            )}
                          </div>
                          {item.date && (
                            <span className="text-[10px] text-muted-foreground/60 flex-shrink-0">
                              {new Date(item.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default UniversalSearch;
