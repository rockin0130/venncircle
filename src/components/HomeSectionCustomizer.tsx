import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence, Reorder, useDragControls } from "framer-motion";
import { GripVertical, Eye, EyeOff, X, Lock, ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { useAppContext } from "@/context/AppContext";
import { useModalScrollLock } from "@/hooks/useModalScrollLock";

export interface HomeSection {
  id: string;
  label: string;
  icon: string;
  locked?: boolean;
}

export const FIXED_SECTIONS: HomeSection[] = [
  { id: "scheduled", label: "Scheduled", icon: "🕐", locked: true },
  { id: "todo", label: "To Do List", icon: "✅", locked: true },
  { id: "habits", label: "Habits", icon: "🔥" },
  { id: "nutrition", label: "Nutrition", icon: "🍎" },
  { id: "workout", label: "Today's Workout", icon: "💪" },
  { id: "sobriety", label: "Sobriety Tracker", icon: "🏆" },
  { id: "special-days", label: "Special Days", icon: "❤️" },
  { id: "shopping", label: "Shopping List", icon: "🛒" },
];

// Keep for backward compat — no longer adds dynamic habit sections at top level
export function buildAllSections(): HomeSection[] {
  return [...FIXED_SECTIONS];
}

export const DEFAULT_ORDER = ["habits", "scheduled", "todo"];
export const DEFAULT_VISIBLE = new Set(["habits", "scheduled", "todo"]);

function getStorageKey(groupId: string | null) {
  return `homeSections_${groupId || "personal"}`;
}

export interface SectionPrefs {
  order: string[];
  visible: Set<string>;
  selectedSobrietyIds: string[];
  selectedSpecialDayIds: string[];
  selectedHabitSubIds: string[];
}

export function loadSectionPrefs(groupId: string | null): SectionPrefs {
  try {
    const raw = localStorage.getItem(getStorageKey(groupId));
    if (raw) {
      const parsed = JSON.parse(raw);
      const migrateId = (id: string) => {
        if (id === "morning-habits") return "habits";
        if (id === "other-habits") return "habits";
        if (id === "justdoit") return "todo";
        if (id === "water") return "habits";
        if (id.startsWith("habit:")) return "habits";
        return id;
      };
      let order = (parsed.order || DEFAULT_ORDER).map(migrateId);
      // Deduplicate after migration
      const seen = new Set<string>();
      order = order.filter((id: string) => {
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });
      const vis = new Set<string>((parsed.visible || DEFAULT_ORDER).map(migrateId));
      vis.add("scheduled");
      vis.add("todo");
      return {
        order,
        visible: vis,
        selectedSobrietyIds: parsed.selectedSobrietyIds || [],
        selectedSpecialDayIds: parsed.selectedSpecialDayIds || [],
        selectedHabitSubIds: parsed.selectedHabitSubIds || [],
      };
    }
  } catch {}
  return {
    order: [...DEFAULT_ORDER],
    visible: new Set(DEFAULT_VISIBLE),
    selectedSobrietyIds: [],
    selectedSpecialDayIds: [],
    selectedHabitSubIds: [],
  };
}

export function saveSectionPrefs(
  groupId: string | null,
  order: string[],
  visible: Set<string>,
  selectedSobrietyIds?: string[],
  selectedSpecialDayIds?: string[],
  selectedHabitSubIds?: string[]
) {
  const vis = new Set(visible);
  vis.add("scheduled");
  vis.add("todo");
  const existing = loadSectionPrefs(groupId);
  localStorage.setItem(
    getStorageKey(groupId),
    JSON.stringify({
      order,
      visible: Array.from(vis),
      selectedSobrietyIds: selectedSobrietyIds ?? existing.selectedSobrietyIds,
      selectedSpecialDayIds: selectedSpecialDayIds ?? existing.selectedSpecialDayIds,
      selectedHabitSubIds: selectedHabitSubIds ?? existing.selectedHabitSubIds,
    })
  );
}

interface SobrietyOption { id: string; label: string; icon: string; }
interface SpecialDayOption { id: string; title: string; icon: string; }

/* ── Draggable sub-items component ── */
interface DraggableSubItemsProps {
  items: { id: string; label?: string; title?: string; icon: string }[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onReorder: (newOrder: string[]) => void;
  labelKey: "label" | "title";
}

const DraggableSubItems = ({ items, selectedIds, onToggle, onReorder, labelKey }: DraggableSubItemsProps) => {
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const dragIdx = useRef<number | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearLp = () => { if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; } };

  const handlePointerDown = (idx: number) => {
    clearLp();
    longPressTimer.current = setTimeout(() => {
      dragIdx.current = idx;
      setDragging(idx);
      if (navigator.vibrate) navigator.vibrate(20);
    }, 400);
  };

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (dragIdx.current === null) return;
    const y = e.clientY;
    for (let i = 0; i < rowRefs.current.length; i++) {
      const el = rowRefs.current[i];
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (y >= rect.top && y <= rect.bottom) {
        setOverIdx(i);
        return;
      }
    }
  }, []);

  const handlePointerUp = useCallback(() => {
    clearLp();
    if (dragIdx.current !== null && overIdx !== null && dragIdx.current !== overIdx) {
      const arr = items.map((i) => i.id);
      const [moved] = arr.splice(dragIdx.current, 1);
      arr.splice(overIdx, 0, moved);
      // Only reorder selected items in order, keep unselected at end
      const selectedSet = new Set(selectedIds);
      const reorderedSelected = arr.filter((id) => selectedSet.has(id));
      onReorder(reorderedSelected);
    }
    dragIdx.current = null;
    setDragging(null);
    setOverIdx(null);
  }, [items, overIdx, selectedIds, onReorder]);

  return (
    <div
      className="px-3 pb-3 space-y-1.5 ml-11"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      {items.map((opt, idx) => {
        const selected = selectedIds.includes(opt.id);
        const displayLabel = labelKey === "title" ? (opt as any).title : opt.label;
        const isDragging = dragging === idx;
        const isOver = overIdx === idx && dragging !== null && dragging !== idx;
        return (
          <div
            key={opt.id}
            ref={(el) => { rowRefs.current[idx] = el; }}
            className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-all ${
              selected
                ? "bg-primary/10 border border-primary/20"
                : "bg-secondary/50 border border-transparent"
            } ${isDragging ? "opacity-50 scale-95" : ""} ${isOver ? "ring-2 ring-primary/30" : ""}`}
          >
            {selected && (
              <button
                onPointerDown={(e) => { e.preventDefault(); handlePointerDown(idx); }}
                onPointerUp={handlePointerUp}
                className="w-5 h-5 flex items-center justify-center text-muted-foreground touch-none cursor-grab active:cursor-grabbing"
                aria-label={`Reorder ${displayLabel}`}
              >
                <GripVertical size={12} />
              </button>
            )}
            <button
              onClick={() => { if (dragging === null) onToggle(opt.id); }}
              className="flex-1 flex items-center gap-2 min-w-0"
            >
              <span className="text-sm">{opt.icon}</span>
              <span className="flex-1 text-xs font-medium truncate">{displayLabel}</span>
              {selected ? <Eye size={13} className="text-primary" /> : <EyeOff size={13} className="text-muted-foreground" />}
            </button>
          </div>
        );
      })}
    </div>
  );
};

interface SortableSectionRowProps {
  id: string;
  isVisible: boolean;
  children: (startDrag: (e: React.PointerEvent<HTMLButtonElement>) => void) => React.ReactNode;
}

const SortableSectionRow = ({ id, isVisible, children }: SortableSectionRowProps) => {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={id}
      dragControls={controls}
      dragListener={false}
      className={`rounded-xl border transition-colors ${
        isVisible ? "bg-card border-border shadow-sm" : "bg-secondary/50 border-transparent opacity-60"
      }`}
      whileDrag={{ scale: 1.02, boxShadow: "0 8px 24px hsl(var(--foreground) / 0.14)" }}
    >
      {children((e) => controls.start(e.nativeEvent))}
    </Reorder.Item>
  );
};

interface Props {
  open: boolean;
  onClose: () => void;
  order: string[];
  visible: Set<string>;
  selectedSobrietyIds: string[];
  selectedSpecialDayIds: string[];
  selectedHabitSubIds: string[];
  onSave: (
    order: string[],
    visible: Set<string>,
    selectedSobrietyIds: string[],
    selectedSpecialDayIds: string[],
    selectedHabitSubIds: string[]
  ) => void;
}

const HomeSectionCustomizer = ({
  open, onClose, order, visible,
  selectedSobrietyIds, selectedSpecialDayIds, selectedHabitSubIds,
  onSave,
}: Props) => {
  const { user, activeGroup } = useAuth();
  const { filteredHabits, waterGoal } = useAppContext();
  useModalScrollLock(open);

  const [localOrder, setLocalOrder] = useState<string[]>([...order]);
  const [localVisible, setLocalVisible] = useState<Set<string>>(new Set(visible));
  const [localSobrietyIds, setLocalSobrietyIds] = useState<string[]>([...selectedSobrietyIds]);
  const [localSpecialDayIds, setLocalSpecialDayIds] = useState<string[]>([...selectedSpecialDayIds]);
  const [localHabitSubIds, setLocalHabitSubIds] = useState<string[]>([...selectedHabitSubIds]);
  const [sobrietyOptions, setSobrietyOptions] = useState<SobrietyOption[]>([]);
  const [specialDayOptions, setSpecialDayOptions] = useState<SpecialDayOption[]>([]);
  const [sobrietyExpanded, setSobrietyExpanded] = useState(false);
  const [specialDaysExpanded, setSpecialDaysExpanded] = useState(false);
  const [habitsExpanded, setHabitsExpanded] = useState(false);

  const ALL_SECTIONS = FIXED_SECTIONS;

  // Build available habit sub-items based on actual user data
  const waterEnabled = (() => {
    const saved = localStorage.getItem("habits_show_water");
    return saved !== null ? saved === "true" : true;
  })();

  const habitSubItems = (() => {
    const items: { id: string; label: string; icon: string }[] = [];
    if (waterEnabled) {
      items.push({ id: "water", label: "Water Intake", icon: "💧" });
    }
    const categories = [
      { key: "morning", label: "Morning", icon: "🌅" },
      { key: "afternoon", label: "Afternoon", icon: "☀️" },
      { key: "evening", label: "Evening", icon: "🌙" },
      { key: "other", label: "Other", icon: "📋" },
    ];
    for (const cat of categories) {
      const hasHabits = filteredHabits.some((h) => {
        const hCat = (h.category || "other").toLowerCase();
        // Match both "morning" and legacy "morning-habits" etc.
        return hCat === cat.key || hCat === `${cat.key}-habits`;
      });
      if (hasHabits) {
        items.push({ id: `habit:${cat.key}`, label: cat.label, icon: cat.icon });
      }
    }
    return items;
  })();

  useEffect(() => {
    if (open) {
      setLocalOrder([...order]);
      setLocalVisible(new Set(visible));
      setLocalSobrietyIds([...selectedSobrietyIds]);
      setLocalSpecialDayIds([...selectedSpecialDayIds]);
      setLocalHabitSubIds([...selectedHabitSubIds]);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !user) return;
    const load = async () => {
      let sobrietyQuery = supabase.from("sobriety_categories").select("id, label, icon").eq("user_id", user.id);
      let specialDaysQuery = supabase.from("special_days").select("id, title, icon").order("event_date", { ascending: true });

      if (activeGroup) {
        sobrietyQuery = sobrietyQuery.eq("group_id", activeGroup.id);
        // Show events shared with this group + private events in this context for this user
        specialDaysQuery = specialDaysQuery.or(
          `shared_group_ids.cs.{${activeGroup.id}},and(context_group_id.eq.${activeGroup.id},user_id.eq.${user.id},shared_group_ids.eq.{})`
        );
      } else {
        sobrietyQuery = sobrietyQuery.is("group_id", null);
        // "All" view: RLS handles access control
      }
      const [{ data: sobrietyData }, { data: specialDaysData }] = await Promise.all([sobrietyQuery, specialDaysQuery]);
      if (sobrietyData) setSobrietyOptions(sobrietyData as SobrietyOption[]);
      if (specialDaysData) setSpecialDayOptions(specialDaysData as SpecialDayOption[]);
    };
    load();
  }, [open, user, activeGroup?.id]);

  const fullOrder = (() => {
    const inOrder = new Set(localOrder);
    const result = [...localOrder];
    ALL_SECTIONS.forEach((s) => {
      if (!inOrder.has(s.id)) result.push(s.id);
    });
    return result;
  })();

  const save = (
    ord: string[], vis: Set<string>,
    sobIds: string[], spIds: string[], habIds: string[]
  ) => {
    onSave(ord, vis, sobIds, spIds, habIds);
  };

  const toggleVisible = (id: string) => {
    const section = ALL_SECTIONS.find((s) => s.id === id);
    if (section?.locked) return;
    const next = new Set(localVisible);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setLocalVisible(next);

    let sobrietyIds = localSobrietyIds;
    let specialDayIds = localSpecialDayIds;
    let habitIds = localHabitSubIds;

    if (id === "sobriety" && next.has("sobriety") && localSobrietyIds.length === 0 && sobrietyOptions.length > 0) {
      sobrietyIds = sobrietyOptions.map((o) => o.id);
      setLocalSobrietyIds(sobrietyIds);
    }
    if (id === "special-days" && next.has("special-days") && localSpecialDayIds.length === 0 && specialDayOptions.length > 0) {
      specialDayIds = specialDayOptions.map((o) => o.id);
      setLocalSpecialDayIds(specialDayIds);
    }
    // If enabling habits and no sub-items selected, select all available
    if (id === "habits" && next.has("habits") && localHabitSubIds.length === 0 && habitSubItems.length > 0) {
      habitIds = habitSubItems.map((o) => o.id);
      setLocalHabitSubIds(habitIds);
    }

    save(fullOrder, next, sobrietyIds, specialDayIds, habitIds);
  };

  const toggleHabitSub = (subId: string) => {
    let next: string[];
    if (localHabitSubIds.includes(subId)) {
      next = localHabitSubIds.filter((id) => id !== subId);
    } else {
      next = [...localHabitSubIds, subId];
    }
    setLocalHabitSubIds(next);
    const vis = new Set(localVisible);
    if (next.length > 0) vis.add("habits");
    setLocalVisible(vis);
    save(fullOrder, vis, localSobrietyIds, localSpecialDayIds, next);
  };

  const toggleSobrietyTracker = (trackerId: string) => {
    let next: string[];
    if (localSobrietyIds.includes(trackerId)) {
      next = localSobrietyIds.filter((id) => id !== trackerId);
    } else {
      next = [...localSobrietyIds, trackerId];
    }
    setLocalSobrietyIds(next);
    const vis = new Set(localVisible);
    if (next.length > 0) vis.add("sobriety");
    setLocalVisible(vis);
    save(fullOrder, vis, next, localSpecialDayIds, localHabitSubIds);
  };

  const toggleSpecialDay = (dayId: string) => {
    let next: string[];
    if (localSpecialDayIds.includes(dayId)) {
      next = localSpecialDayIds.filter((id) => id !== dayId);
    } else {
      next = [...localSpecialDayIds, dayId];
    }
    setLocalSpecialDayIds(next);
    const vis = new Set(localVisible);
    if (next.length > 0) vis.add("special-days");
    setLocalVisible(vis);
    save(fullOrder, vis, localSobrietyIds, next, localHabitSubIds);
  };

  const handleReorder = (newOrder: string[]) => {
    setLocalOrder(newOrder);
    const computedFull = (() => {
      const inOrder = new Set(newOrder);
      const result = [...newOrder];
      ALL_SECTIONS.forEach((s) => {
        if (!inOrder.has(s.id)) result.push(s.id);
      });
      return result;
    })();
    save(computedFull, localVisible, localSobrietyIds, localSpecialDayIds, localHabitSubIds);
  };

  const reorderHabitSubs = (newOrder: string[]) => {
    setLocalHabitSubIds(newOrder);
    save(fullOrder, localVisible, localSobrietyIds, localSpecialDayIds, newOrder);
  };

  const reorderSobrietySubs = (newOrder: string[]) => {
    setLocalSobrietyIds(newOrder);
    save(fullOrder, localVisible, newOrder, localSpecialDayIds, localHabitSubIds);
  };

  const reorderSpecialDaySubs = (newOrder: string[]) => {
    setLocalSpecialDayIds(newOrder);
    save(fullOrder, localVisible, localSobrietyIds, newOrder, localHabitSubIds);
  };

  if (!open) return null;

  const renderSubItems = (
    items: { id: string; label?: string; title?: string; icon: string }[],
    selectedIds: string[],
    onToggle: (id: string) => void,
    onReorder: (newOrder: string[]) => void,
    labelKey: "label" | "title" = "label"
  ) => {
    // Sort items: selected ones first in selectedIds order, then unselected in original order
    const sortedItems = (() => {
      const selectedSet = new Set(selectedIds);
      const inOrder = selectedIds
        .map((id) => items.find((i) => i.id === id))
        .filter(Boolean) as typeof items;
      const rest = items.filter((i) => !selectedSet.has(i.id));
      return [...inOrder, ...rest];
    })();

    return (
      <DraggableSubItems
        items={sortedItems}
        selectedIds={selectedIds}
        onToggle={onToggle}
        onReorder={onReorder}
        labelKey={labelKey}
      />
    );
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center pb-[env(safe-area-inset-bottom)] overscroll-none"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md bg-card rounded-t-2xl border-t border-x border-border shadow-lg h-[min(82svh,calc(100svh-env(safe-area-inset-top)-0.5rem))] min-h-0 flex flex-col"
        >
          <div className="sticky top-0 z-10 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85 border-b border-border px-5 pt-5 pb-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold tracking-display">Customize Home</h3>
              <button onClick={onClose} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-muted-foreground">
                <X size={16} />
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Toggle sections on/off and drag to reorder.
            </p>
          </div>

          <div
            className="flex-1 min-h-0 overflow-y-scroll px-5 pb-[max(env(safe-area-inset-bottom),1rem)] overscroll-y-contain pt-2"
            style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y", overscrollBehaviorY: "contain" }}
          >
            <Reorder.Group
              axis="y"
              values={fullOrder}
              onReorder={handleReorder}
              layoutScroll
              className="space-y-2 touch-pan-y"
            >
              {fullOrder.map((id) => {
                const section = ALL_SECTIONS.find((s) => s.id === id);
                if (!section) return null;
                const isVisible = localVisible.has(id);
                const isLocked = section.locked;
                const isHabits = id === "habits";
                const isSobriety = id === "sobriety";
                const isSpecialDays = id === "special-days";

                const hasExpandable =
                  (isHabits && habitSubItems.length > 0) ||
                  (isSobriety && sobrietyOptions.length > 0) ||
                  (isSpecialDays && specialDayOptions.length > 0);

                const isExpanded =
                  (isHabits && habitsExpanded) ||
                  (isSobriety && sobrietyExpanded) ||
                  (isSpecialDays && specialDaysExpanded);

                const toggleExpand = () => {
                  if (isHabits) setHabitsExpanded(!habitsExpanded);
                  if (isSobriety) setSobrietyExpanded(!sobrietyExpanded);
                  if (isSpecialDays) setSpecialDaysExpanded(!specialDaysExpanded);
                };

                return (
                  <SortableSectionRow key={id} id={id} isVisible={isVisible}>
                    {(startDrag) => (
                      <>
                        <div className="flex items-center gap-2.5 px-3 py-3">
                          <button
                            onPointerDown={startDrag}
                            className="w-8 h-8 rounded-lg bg-secondary/70 text-muted-foreground flex items-center justify-center touch-none"
                            aria-label={`Reorder ${section.label}`}
                          >
                            <GripVertical size={16} className="flex-shrink-0" />
                          </button>
                          <span className="text-base">{section.icon}</span>
                          <span className="flex-1 text-sm font-semibold">{section.label}</span>
                          {hasExpandable && isVisible && (
                            <button
                              onClick={toggleExpand}
                              className="w-7 h-7 flex items-center justify-center text-muted-foreground"
                            >
                              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </button>
                          )}
                          {isLocked ? (
                            <Lock size={14} className="text-muted-foreground" />
                          ) : (
                            <button
                              onClick={() => toggleVisible(id)}
                              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                                isVisible ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"
                              }`}
                            >
                              {isVisible ? <Eye size={16} /> : <EyeOff size={16} />}
                            </button>
                          )}
                        </div>

                        {isHabits && isVisible && habitsExpanded && habitSubItems.length > 0 &&
                          renderSubItems(habitSubItems, localHabitSubIds, toggleHabitSub, reorderHabitSubs)}

                        {isSobriety && isVisible && sobrietyExpanded && sobrietyOptions.length > 0 &&
                          renderSubItems(sobrietyOptions, localSobrietyIds, toggleSobrietyTracker, reorderSobrietySubs)}

                        {isSpecialDays && isVisible && specialDaysExpanded && specialDayOptions.length > 0 &&
                          renderSubItems(specialDayOptions, localSpecialDayIds, toggleSpecialDay, reorderSpecialDaySubs, "title")}
                      </>
                    )}
                  </SortableSectionRow>
                );
              })}
            </Reorder.Group>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default HomeSectionCustomizer;
