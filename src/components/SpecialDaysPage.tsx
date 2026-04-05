import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Heart, Search, X, SlidersHorizontal, Check } from "lucide-react";
import PageGroupSelector from "@/components/PageGroupSelector";
import { motion, AnimatePresence } from "framer-motion";
import SettingsButton from "@/components/SettingsButton";
import { SpecialDay, getDayCount, CATEGORY_OPTIONS, fmtDate } from "./special-days/SpecialDayTypes";
import SpecialDayHeroCard from "./special-days/SpecialDayHeroCard";
import SpecialDayListCard from "./special-days/SpecialDayListCard";
import SpecialDayFormModal from "./special-days/SpecialDayFormModal";

const CATEGORY_FILTERS = [
  { value: "all", label: "All Categories", icon: "✨" },
  ...CATEGORY_OPTIONS,
];

const SpecialDaysPage = ({ onOpenSettings, onOpenMore }: { onOpenSettings?: () => void; onOpenMore?: () => void }) => {
  const { user, activeGroup, groups } = useAuth();
  const [days, setDays] = useState<SpecialDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingDay, setEditingDay] = useState<SpecialDay | null>(null);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [showCategoryPopup, setShowCategoryPopup] = useState(false);

  const isPersonalActive = (activeGroup as any)?._personal === true;

  const loadDays = async () => {
    if (!user) return;
    setLoading(true);
    let q = supabase.from("special_days").select("*");
    if (isPersonalActive) {
      // Personal view: only user's own events not shared with any group
      q = q.eq("user_id", user.id).filter("shared_group_ids", "eq", "{}");
    } else if (activeGroup) {
      // Group view: only events explicitly shared with this group
      q = q.filter("shared_group_ids", "cs", `{${activeGroup.id}}`);
    }
    // "All" view: RLS returns own events + events shared with user's groups — no extra filter needed
    const { data } = await q.order("event_date", { ascending: true });
    setDays(data ? (data as unknown as SpecialDay[]) : []);
    setLoading(false);
  };

  useEffect(() => { loadDays(); }, [user, activeGroup?.id, isPersonalActive, groups.length]);

  const now = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const filteredDays = useMemo(() => {
    let result = days;
    if (categoryFilter !== "all") {
      result = result.filter((d) => d.category === categoryFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((d) => d.title.toLowerCase().includes(q));
    }
    return result;
  }, [days, categoryFilter, searchQuery]);

  const heroDay = useMemo(() => {
    if (filteredDays.length === 0) return null;
    const featured = filteredDays.find((d) => d.is_featured);
    if (featured) return featured;
    const recurring = filteredDays
      .filter((d) => d.repeats_yearly || d.count_direction === "until" || d.event_type === "birthday")
      .map((d) => ({ day: d, count: getDayCount(d, now) }))
      .sort((a, b) => a.count - b.count);
    if (recurring.length > 0) return recurring[0].day;
    return filteredDays[0];
  }, [filteredDays, now]);

  const otherDays = useMemo(
    () => filteredDays.filter((d) => d.id !== heroDay?.id),
    [filteredDays, heroDay]
  );

  const openAdd = () => { setEditingDay(null); setShowForm(true); };
  const openEdit = (day: SpecialDay) => { setEditingDay(day); setShowForm(true); };

  const activeFilterLabel = CATEGORY_FILTERS.find((f) => f.value === categoryFilter);
  const hasActiveFilter = categoryFilter !== "all";

  // Resolve group name for badges
  const getGroupNames = (day: SpecialDay): string | undefined => {
    if (activeGroup) return undefined; // Don't show badge when in specific group
    const sharedIds = day.shared_group_ids || [];
    if (sharedIds.length === 0) return undefined;
    const names = sharedIds
      .map((id) => groups.find((g) => g.id === id)?.name)
      .filter(Boolean);
    return names.length > 0 ? names.join(", ") : undefined;
  };

  const isPrivate = (day: SpecialDay): boolean => {
    const sharedIds = day.shared_group_ids || [];
    return sharedIds.length === 0;
  };

  return (
    <div className="px-4 pt-5 pb-8 max-w-md mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-tight text-foreground leading-tight">
            Special Days
          </h1>
          <p className="text-[11px] text-muted-foreground/70 mt-0.5 font-medium italic">
            Moments that matter
          </p>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          {/* Filter trigger */}
          <div className="relative">
            <button
              onClick={() => setShowCategoryPopup(!showCategoryPopup)}
              className={`w-8 h-8 rounded-full backdrop-blur-sm flex items-center justify-center transition-colors border ${
                hasActiveFilter
                  ? "bg-primary/10 text-primary border-primary/30"
                  : "bg-secondary/60 text-muted-foreground border-border/30 hover:text-foreground"
              }`}
            >
              <SlidersHorizontal size={14} />
            </button>

            {/* Category filter popup */}
            <AnimatePresence>
              {showCategoryPopup && (
                <>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-40"
                    onClick={() => setShowCategoryPopup(false)}
                  />
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: -4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: -4 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                    className="absolute right-0 top-10 z-50 w-52 bg-card/95 backdrop-blur-xl rounded-2xl border border-border/40 shadow-xl overflow-hidden"
                  >
                    <div className="px-3 pt-3 pb-1.5">
                      <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-wider">
                        Filter by category
                      </p>
                    </div>
                    <div className="py-1 px-1.5">
                      {CATEGORY_FILTERS.map((cat) => (
                        <button
                          key={cat.value}
                          onClick={() => {
                            setCategoryFilter(cat.value);
                            setShowCategoryPopup(false);
                          }}
                          className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all ${
                            categoryFilter === cat.value
                              ? "bg-primary/8 text-foreground"
                              : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                          }`}
                        >
                          <span className="text-[14px]">{cat.icon}</span>
                          <span className="text-[13px] font-medium flex-1">{cat.label}</span>
                          {categoryFilter === cat.value && (
                            <Check size={14} className="text-primary" />
                          )}
                        </button>
                      ))}
                    </div>
                    {hasActiveFilter && (
                      <div className="px-3 pb-3 pt-1">
                        <button
                          onClick={() => {
                            setCategoryFilter("all");
                            setShowCategoryPopup(false);
                          }}
                          className="w-full py-2 rounded-xl bg-secondary/40 text-[12px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
                        >
                          Reset filter
                        </button>
                      </div>
                    )}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          <button
            onClick={openAdd}
            className="w-8 h-8 rounded-full bg-secondary/60 backdrop-blur-sm flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors border border-border/30"
          >
            <Plus size={15} strokeWidth={2.5} />
          </button>
          <button
            onClick={() => setShowSearch(!showSearch)}
            className="w-8 h-8 rounded-full bg-secondary/60 backdrop-blur-sm flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors border border-border/30"
          >
            {showSearch ? <X size={14} /> : <Search size={14} />}
          </button>
          {onOpenSettings && <SettingsButton onClick={onOpenSettings} />}
          {onOpenMore && (
            <button onClick={onOpenMore} className="w-[30px] h-[30px] rounded-full flex items-center justify-center" style={{ background: "#F4F3F0" }} aria-label="More">
              <MoreHorizontal size={15} color="#888" />
            </button>
          )}
        </div>
      </div>

      <PageGroupSelector page="special_days" personalLabel="Mine" hideAllPill />

      {/* Active filter badge */}
      {hasActiveFilter && (
        <div className="flex items-center gap-1.5 mb-3">
          <span className="text-[11px] text-muted-foreground/60">Filtered:</span>
          <button
            onClick={() => setCategoryFilter("all")}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/8 border border-primary/20 text-[11px] font-medium text-primary"
          >
            {activeFilterLabel?.icon} {activeFilterLabel?.label}
            <X size={10} className="ml-0.5" />
          </button>
        </div>
      )}

      {/* Search */}
      <AnimatePresence>
        {showSearch && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden mb-3"
          >
            <input
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search special days…"
              className="w-full px-4 py-2.5 rounded-2xl bg-card/80 backdrop-blur-sm border border-border/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground/40"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Compact group switcher is in the header */}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : filteredDays.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-16"
        >
          <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-primary/10 to-accent/10 flex items-center justify-center mb-5 shadow-sm">
            <Heart size={32} className="text-primary/40" />
          </div>
          <p className="text-base font-semibold text-foreground mb-1">No moments yet</p>
          <p className="text-xs text-muted-foreground mb-6 max-w-[220px] mx-auto leading-relaxed">
            Start tracking the dates and milestones that mean the most to you
          </p>
          <button
            onClick={openAdd}
            className="px-6 py-2.5 bg-primary text-primary-foreground rounded-2xl text-sm font-semibold hover:bg-primary/90 transition-colors shadow-sm"
          >
            Add your first moment
          </button>
        </motion.div>
      ) : (
        <>
          {heroDay && (
            <SpecialDayHeroCard day={heroDay} now={now} onEdit={openEdit} isPrivate={isPrivate(heroDay)} onCardClick={openEdit} />
          )}

          {otherDays.length > 0 && (
            <div className="mt-5">
              <h3 className="text-[12px] font-bold text-foreground/70 uppercase tracking-[0.1em] mb-3 px-0.5">
                All Special Days
              </h3>
              <div className="space-y-2.5">
                {otherDays.map((day, i) => (
                  <SpecialDayListCard
                    key={day.id}
                    day={day}
                    now={now}
                    onEdit={openEdit}
                    index={i}
                    groupName={getGroupNames(day)}
                    isPrivate={isPrivate(day)}
                  />
                ))}
              </div>
            </div>
          )}

          <button
            onClick={openAdd}
            className="mt-5 w-full py-3.5 rounded-2xl border border-border/40 bg-card/50 backdrop-blur-sm text-[13px] font-semibold text-muted-foreground hover:text-foreground hover:border-border/60 hover:bg-card/80 transition-all flex items-center justify-center gap-2 shadow-sm active:scale-[0.98]"
          >
            <Plus size={15} strokeWidth={2.5} /> New Special Moment
          </button>
        </>
      )}

      <SpecialDayFormModal
        open={showForm}
        editingDay={editingDay}
        userId={user?.id || ""}
        groupId={isPersonalActive ? null : (activeGroup?.id || null)}
        groups={groups}
        onClose={() => setShowForm(false)}
        onSaved={loadDays}
      />
    </div>
  );
};

export default SpecialDaysPage;
