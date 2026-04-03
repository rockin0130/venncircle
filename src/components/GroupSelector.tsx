import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useAuth, Group } from "@/context/AuthContext";
import { Plus } from "lucide-react";

const GROUP_ORDER_KEY = "groupChipOrder";
const LONG_PRESS_MS = 500;

/** Load persisted group order from localStorage */
function loadGroupOrder(): string[] {
  try {
    const raw = localStorage.getItem(GROUP_ORDER_KEY);
    if (raw) return JSON.parse(raw) as string[];
  } catch {}
  return [];
}

function saveGroupOrder(order: string[]) {
  localStorage.setItem(GROUP_ORDER_KEY, JSON.stringify(order));
}

/**
 * Reconcile persisted order with current groups:
 * - keep only IDs that exist in current groups
 * - append any new groups not yet in the saved order
 */
function reconcileOrder(saved: string[], current: Group[]): string[] {
  const currentIds = new Set(current.map((g) => g.id));
  const ordered = saved.filter((id) => currentIds.has(id));
  const orderedSet = new Set(ordered);
  for (const g of current) {
    if (!orderedSet.has(g.id)) ordered.push(g.id);
  }
  return ordered;
}

const GroupSelector = ({ onCreateGroup }: { onCreateGroup?: () => void }) => {
  const { groups, activeGroup, setActiveGroup, user } = useAuth();
  const [editMode, setEditMode] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const chipRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Global ordered list of group IDs (excluding "All")
  const [orderedIds, setOrderedIds] = useState<string[]>(() =>
    reconcileOrder(loadGroupOrder(), groups)
  );

  // Re-reconcile when groups change (new group added / removed)
  useEffect(() => {
    setOrderedIds((prev) => reconcileOrder(prev, groups));
  }, [groups]);

  // Persist whenever order changes
  useEffect(() => {
    saveGroupOrder(orderedIds);
  }, [orderedIds]);

  // Build ordered group list
  const orderedGroups = useMemo(() => {
    const map = new Map(groups.map((g) => [g.id, g]));
    return orderedIds.map((id) => map.get(id)).filter(Boolean) as Group[];
  }, [orderedIds, groups]);

  // Close edit mode on outside tap
  useEffect(() => {
    if (!editMode) return;
    const handler = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setEditMode(false);
      }
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [editMode]);

  const clearLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handlePointerDown = useCallback(
    (idx: number) => {
      didLongPress.current = false;
      longPressTimer.current = setTimeout(() => {
        didLongPress.current = true;
        setEditMode(true);
        setDragIdx(idx);
        if (navigator.vibrate) navigator.vibrate(30);
      }, LONG_PRESS_MS);
    },
    []
  );

  const handlePointerUp = useCallback(
    (group: Group) => {
      const wasLongPress = didLongPress.current;
      clearLongPress();

      if (editMode && dragIdx !== null && dragOverIdx !== null && dragIdx !== dragOverIdx) {
        setOrderedIds((prev) => {
          const next = [...prev];
          const [moved] = next.splice(dragIdx, 1);
          next.splice(dragOverIdx, 0, moved);
          return next;
        });
      }

      setDragIdx(null);
      setDragOverIdx(null);

      if (!wasLongPress && !editMode) {
        setActiveGroup(group);
      }
    },
    [editMode, dragIdx, dragOverIdx, clearLongPress, setActiveGroup]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!editMode || dragIdx === null) return;
      const x = e.clientX;
      for (let i = 0; i < chipRefs.current.length; i++) {
        const el = chipRefs.current[i];
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (x >= rect.left && x <= rect.right) {
          setDragOverIdx(i);
          return;
        }
      }
    },
    [editMode, dragIdx]
  );

  const handlePointerLeave = useCallback(() => clearLongPress(), [clearLongPress]);
  const handlePointerCancel = useCallback(() => {
    clearLongPress();
    setDragIdx(null);
    setDragOverIdx(null);
  }, [clearLongPress]);

  // Compute visual order during drag
  const visualGroups = useMemo(() => {
    if (editMode && dragIdx !== null && dragOverIdx !== null && dragIdx !== dragOverIdx) {
      const next = [...orderedGroups];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(dragOverIdx, 0, moved);
      return next;
    }
    return orderedGroups;
  }, [orderedGroups, editMode, dragIdx, dragOverIdx]);

  if (groups.length === 0) return null;

  const getInitials = (name: string | null) =>
    name ? name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2) : "?";

  const getMemberAvatars = (group: Group) => {
    const others = group.members.filter((m) => m.user_id !== user?.id);
    const self = group.members.find((m) => m.user_id === user?.id);
    const ordered = [...others];
    if (self) ordered.push(self);
    return ordered.slice(0, 3);
  };

  return (
    <div
      ref={containerRef}
      className="relative pb-2 mb-4 -mx-1 px-1"
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onPointerCancel={handlePointerCancel}
    >
      {editMode && (
        <div className="flex justify-center mb-1.5">
          <button
            onClick={() => setEditMode(false)}
            className="text-[10px] font-semibold text-primary px-3 py-0.5 rounded-full bg-primary/10"
          >
            Done
          </button>
        </div>
      )}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide scroll-smooth-touch" style={{ WebkitOverflowScrolling: "touch" }}>
        {/* All chip — fixed, never movable */}
        <button
          onClick={() => { if (!editMode) setActiveGroup(null); }}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl border whitespace-nowrap text-sm font-semibold transition-all flex-shrink-0 ${
            activeGroup === null
              ? "border-primary bg-primary text-primary-foreground shadow-md"
              : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground"
          }`}
        >
          <span className="text-base">🌐</span>
          <span>All</span>
        </button>

        {/* Movable group chips */}
        {visualGroups.map((group, i) => {
          const isActive = activeGroup?.id === group.id;
          const avatars = getMemberAvatars(group);
          const isDragging = editMode && dragIdx !== null && orderedGroups[dragIdx]?.id === group.id;

          return (
            <button
              key={group.id}
              ref={(el) => { chipRefs.current[i] = el; }}
              onPointerDown={(e) => { e.preventDefault(); handlePointerDown(i); }}
              onPointerUp={() => handlePointerUp(group)}
              className={`flex items-center gap-2.5 pl-3 pr-4 py-2 rounded-2xl border whitespace-nowrap text-sm font-semibold transition-all flex-shrink-0 select-none ${editMode ? "touch-none" : ""} ${
                isActive
                  ? "border-primary bg-primary text-primary-foreground shadow-md"
                  : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground"
              } ${editMode ? "animate-nav-wiggle" : ""} ${isDragging ? "opacity-60 scale-110" : ""}`}
              style={editMode ? { animationDelay: `${i * 0.05}s` } : undefined}
            >
              {/* Member avatar stack */}
              <div className="flex -space-x-2">
                {avatars.map((member, j) => (
                  <div
                    key={member.id}
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold ring-2 flex-shrink-0 ${
                      isActive
                        ? "ring-primary bg-primary-foreground/20 text-primary-foreground"
                        : "ring-card bg-secondary text-foreground"
                    }`}
                    style={{ zIndex: avatars.length - j }}
                    title={member.display_name || ""}
                  >
                    {member.avatar_url ? (
                      <img
                        src={member.avatar_url}
                        alt={member.display_name || ""}
                        className="w-full h-full rounded-full object-cover"
                      />
                    ) : (
                      getInitials(member.display_name)
                    )}
                  </div>
                ))}
              </div>

              <span className="truncate max-w-[120px]">{group.name}</span>

              {group.members.length > 3 && (
                <span className={`text-[10px] font-medium ${isActive ? "text-primary-foreground/70" : "opacity-50"}`}>
                  +{group.members.length - 3}
                </span>
              )}
            </button>
          );
        })}

        {/* + New Group chip */}
        {onCreateGroup && !editMode && (
          <button
            onClick={onCreateGroup}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl border border-dashed border-border whitespace-nowrap text-sm font-medium text-muted-foreground hover:border-primary/40 hover:text-primary transition-all flex-shrink-0"
          >
            <Plus size={14} />
            <span>New</span>
          </button>
        )}
      </div>
    </div>
  );
};

export default GroupSelector;
