import { useMemo, useState, useCallback, useEffect } from "react";
import { useAuth, Group, GroupMember } from "@/context/AuthContext";
import { formatTime } from "@/lib/formatTime";
import { FilterUser, MEMBER_COLORS, SHARED_COLOR } from "@/components/CalendarUserFilter";
import { GripVertical } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface CalItem {
  id: string;
  title: string;
  time: string;
  endTime?: string;
  allDay: boolean;
  hour: number | null;
  endHour: number | null;
  assignee: "me" | "partner" | "both";
  done?: boolean;
  tag?: string;
  hidden?: boolean;
  groupId?: string | null;
  type: "event" | "task" | "gcal";
  raw: any;
  isMultiDay?: boolean;
  isDueDateTask?: boolean;
  startDateTime?: Date | null;
  endDateTime?: Date | null;
  calendarColor?: string | null;
}

interface Props {
  items: CalItem[];
  filterUsers: FilterUser[];
  selectedUserIds: Set<string>;
  onItemTap?: (item: CalItem) => void;
}

// ── Assignment resolution ──

function resolveItemAssignedUserIds(item: CalItem, currentUserId: string, groups: Group[]): string[] {
  const raw = item.raw as any;
  const ownerId: string = raw.ownerUserId || raw.user_id || currentUserId;

  // Google Calendar: use explicit assignee_user_ids from designation, else default to current user only
  if (item.type === "gcal") {
    const designationIds: string[] | null = raw.assigneeUserIds || raw.assignee_user_ids;
    if (designationIds && designationIds.length > 0) {
      return designationIds;
    }
    // No explicit assignment → Mine only
    return [currentUserId];
  }

  // Regular events/tasks: prefer assignee_user_ids array
  const assigneeUserIds: string[] | null = raw.assigneeUserIds || raw.assignee_user_ids;
  if (assigneeUserIds && assigneeUserIds.length > 0) {
    return assigneeUserIds;
  }

  // Fallback to legacy assignee field
  const assignee = item.assignee;
  const groupId = item.groupId;

  if (assignee === "me") {
    return [ownerId];
  }
  if (assignee === "partner") {
    if (groupId) {
      const grp = groups.find(g => g.id === groupId);
      const others = grp?.members?.filter((m: any) => m.user_id !== ownerId && m.status === "active").map((m: any) => m.user_id) || [];
      return others.length > 0 ? others : [ownerId];
    }
    return [ownerId];
  }
  if (assignee === "both") {
    const ids = [ownerId];
    if (groupId) {
      const grp = groups.find(g => g.id === groupId);
      grp?.members?.filter((m: any) => m.user_id !== ownerId && m.status === "active")
        .forEach((m: any) => { if (!ids.includes(m.user_id)) ids.push(m.user_id); });
    }
    return ids;
  }

  return [ownerId];
}

// ── Time helpers ──

function parseMinutesFromTime(time: string): number | null {
  if (!time || time === "All day") return null;
  const m12 = time.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (m12) {
    let h = parseInt(m12[1]);
    const min = parseInt(m12[2]);
    if (m12[3].toUpperCase() === "PM" && h < 12) h += 12;
    if (m12[3].toUpperCase() === "AM" && h === 12) h = 0;
    return h * 60 + min;
  }
  const m24 = time.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (m24) return parseInt(m24[1]) * 60 + parseInt(m24[2]);
  const d = new Date(time);
  if (!isNaN(d.getTime())) return d.getHours() * 60 + d.getMinutes();
  return null;
}

function formatMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

// ── Render map types ──

interface RenderInstruction {
  type: "single" | "span";
  startColIdx: number;
  spanCount: number;
  item: CalItem & { startMin?: number; endMin?: number };
  assignedColIndices: number[];
}

const CalendarTeamDashboard = ({ items, filterUsers, selectedUserIds, onItemTap }: Props) => {
  const { user, groups } = useAuth();
  const currentUserId = user?.id || "";

  // ── Column order (saved per user per group) ──
  const contextKey = useMemo(() => {
    const isEveryone = selectedUserIds.has("__everyone__");
    if (isEveryone) return "__everyone__";
    return [...selectedUserIds].sort().join(",");
  }, [selectedUserIds]);

  const defaultColumns = useMemo(() => {
    const isEveryone = selectedUserIds.has("__everyone__");
    return filterUsers.filter(u => isEveryone || selectedUserIds.has(u.id));
  }, [filterUsers, selectedUserIds]);

  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [showReorder, setShowReorder] = useState(false);

  // Load saved column order
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase
        .from("calendar_team_dashboard_preferences")
        .select("column_user_ids")
        .eq("user_id", user.id)
        .eq("context_key", contextKey)
        .maybeSingle();
      if (data?.column_user_ids?.length) {
        setColumnOrder(data.column_user_ids);
      } else {
        setColumnOrder(defaultColumns.map(c => c.id));
      }
    };
    load();
  }, [user?.id, contextKey, defaultColumns]);

  const columns = useMemo(() => {
    if (columnOrder.length === 0) return defaultColumns;
    // Map saved order to FilterUser objects, filtering out any that aren't in defaultColumns
    const defaultMap = new Map(defaultColumns.map(c => [c.id, c]));
    const ordered: FilterUser[] = [];
    columnOrder.forEach(id => {
      const col = defaultMap.get(id);
      if (col) { ordered.push(col); defaultMap.delete(id); }
    });
    // Add any new members not in saved order
    defaultMap.forEach(col => ordered.push(col));
    return ordered;
  }, [columnOrder, defaultColumns]);

  const saveColumnOrder = useCallback(async (newOrder: string[]) => {
    setColumnOrder(newOrder);
    if (!user) return;
    await supabase.from("calendar_team_dashboard_preferences").upsert({
      user_id: user.id,
      context_key: contextKey,
      column_user_ids: newOrder,
    }, { onConflict: "user_id,context_key" });
  }, [user?.id, contextKey]);

  const handleDragStart = (idx: number) => setDragIdx(idx);
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;
    const newOrder = [...columns.map(c => c.id)];
    const [moved] = newOrder.splice(dragIdx, 1);
    newOrder.splice(idx, 0, moved);
    setDragIdx(idx);
    saveColumnOrder(newOrder);
  };
  const handleDragEnd = () => setDragIdx(null);

  // ── Build column index map ──
  const columnIndexByUserId = useMemo(() => {
    return new Map(columns.map((col, idx) => [col.id, idx]));
  }, [columns]);

  // ── Resolve render instructions for each item ──
  const buildRenderInstructions = useCallback((item: CalItem & { startMin?: number; endMin?: number }): RenderInstruction[] => {
    const assignedIds = resolveItemAssignedUserIds(item, currentUserId, groups);
    
    // Map to column indices
    const assignedColIndices = assignedIds
      .map(id => columnIndexByUserId.get(id))
      .filter((idx): idx is number => idx !== undefined)
      .sort((a, b) => a - b);

    // Debug logging
    console.log(`[TeamDash] "${item.title}" | type=${item.type} | assignees=[${assignedIds.join(",")}] | columns=[${assignedColIndices.join(",")}]`);

    if (assignedColIndices.length === 0) {
      // Default to current user's column
      const myIdx = columnIndexByUserId.get(currentUserId);
      if (myIdx !== undefined) {
        return [{ type: "single", startColIdx: myIdx, spanCount: 1, item, assignedColIndices: [myIdx] }];
      }
      return [];
    }

    if (assignedColIndices.length === 1) {
      return [{ type: "single", startColIdx: assignedColIndices[0], spanCount: 1, item, assignedColIndices }];
    }

    // Check if consecutive
    const minCol = assignedColIndices[0];
    const maxCol = assignedColIndices[assignedColIndices.length - 1];
    const isConsecutive = (maxCol - minCol + 1) === assignedColIndices.length;

    if (isConsecutive) {
      // Span from min to max
      return [{ type: "span", startColIdx: minCol, spanCount: maxCol - minCol + 1, item, assignedColIndices }];
    }

    // Non-consecutive: render individual cards in each assigned column
    return assignedColIndices.map(colIdx => ({
      type: "single" as const,
      startColIdx: colIdx,
      spanCount: 1,
      item,
      assignedColIndices,
    }));
  }, [currentUserId, groups, columnIndexByUserId]);

  // ── Split items ──
  const allDayItems = useMemo(() => items.filter(i => i.allDay || i.isDueDateTask), [items]);
  const timedItems = useMemo(() => {
    return items
      .filter(i => !i.allDay && !i.isDueDateTask)
      .map(i => {
        const startMin = i.type === "gcal" && i.time
          ? parseMinutesFromTime(new Date(i.time).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }))
          : parseMinutesFromTime(i.time);
        const endMin = i.endTime
          ? (i.type === "gcal" ? parseMinutesFromTime(new Date(i.endTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })) : parseMinutesFromTime(i.endTime))
          : (startMin != null ? startMin + 60 : null);
        return { ...i, startMin: startMin ?? 0, endMin: endMin ?? (startMin ?? 0) + 60 };
      })
      .sort((a, b) => a.startMin - b.startMin);
  }, [items]);

  // Time rows
  const timeRows = useMemo(() => {
    const rows: { time: number; items: typeof timedItems }[] = [];
    const seen = new Set<number>();
    timedItems.forEach(item => {
      if (!seen.has(item.startMin)) {
        seen.add(item.startMin);
        rows.push({ time: item.startMin, items: timedItems.filter(i => i.startMin === item.startMin) });
      }
    });
    return rows;
  }, [timedItems]);

  // ── Rendering helpers ──

  const getItemColors = (assignedColIndices: number[]) => {
    if (assignedColIndices.length > 1) return SHARED_COLOR;
    const colIdx = assignedColIndices[0] ?? 0;
    const colUser = columns[colIdx];
    if (!colUser) return MEMBER_COLORS[0];
    return MEMBER_COLORS[colUser.colorIndex % MEMBER_COLORS.length];
  };

  const renderCard = (instruction: RenderInstruction, isAllDay?: boolean) => {
    const { item, assignedColIndices } = instruction;
    const colors = getItemColors(assignedColIndices);
    const isShared = assignedColIndices.length > 1;
    const durationMins = item.endMin && item.startMin != null ? item.endMin - item.startMin : 60;
    const minHeight = isAllDay ? 32 : Math.max(28, Math.min(durationMins * 0.6, 80));

    const displayTime = item.type === "gcal" && item.time && !item.allDay
      ? new Date(item.time).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
      : formatTime(item.time);
    const displayEndTime = item.endTime
      ? (item.type === "gcal" ? new Date(item.endTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : formatTime(item.endTime))
      : null;

    return (
      <button
        onClick={() => onItemTap?.(item as CalItem)}
        className="w-full text-left rounded-lg border transition-all hover:brightness-95 active:brightness-90 max-w-full box-border"
        style={{
          backgroundColor: colors.cardBg,
          borderColor: colors.cardBorder,
          minHeight: `${minHeight}px`,
          overflow: "hidden",
        }}
      >
        <div className="px-2 py-1.5 overflow-hidden">
          <p className={`text-[12px] font-semibold leading-tight ${item.done ? "line-through opacity-40" : ""}`}
            style={{ color: colors.cardBorder, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {item.title}
          </p>
          {!isAllDay && (
            <p className="text-[10px] mt-0.5 opacity-70 truncate" style={{ color: colors.cardBorder }}>
              {displayTime}{displayEndTime && displayEndTime !== displayTime ? ` – ${displayEndTime}` : ""}
            </p>
          )}
          {isShared && (
            <div className="flex -space-x-1 mt-1 flex-nowrap overflow-hidden">
              {assignedColIndices.map(colIdx => {
                const col = columns[colIdx];
                if (!col) return null;
                return col.avatarUrl ? (
                  <img
                    key={col.id}
                    src={col.avatarUrl}
                    alt={col.initial}
                    className="w-3 h-3 rounded-full object-cover ring-1 ring-white/50 flex-shrink-0"
                  />
                ) : (
                  <div
                    key={col.id}
                    className={`w-3 h-3 rounded-full flex items-center justify-center text-[6px] font-bold text-white ring-1 ring-white/50 flex-shrink-0 ${MEMBER_COLORS[col.colorIndex % MEMBER_COLORS.length].avatarBg}`}
                  >
                    {col.initial}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </button>
    );
  };

  // ── Render a row of items using flat grid cells ──
  const renderItemRow = (rowItems: (CalItem & { startMin?: number; endMin?: number })[], isAllDay: boolean, timeLabel?: string) => {
    // Build all render instructions for this row
    const allInstructions: RenderInstruction[] = [];
    const processedIds = new Set<string>();

    rowItems.forEach(item => {
      if (processedIds.has(item.id)) return;
      processedIds.add(item.id);
      const instructions = buildRenderInstructions(item);
      allInstructions.push(...instructions);
    });

    // Build a flat array of grid cells: [timeLabel, col0, col1, col2, ...]
    // For spanning items, we use gridColumn CSS
    // We need to render each cell individually but spanning items use gridColumn

    // Separate single-column items per column and spanning items
    const singleByCol = new Map<number, RenderInstruction[]>();
    const spanItems: RenderInstruction[] = [];

    allInstructions.forEach(instr => {
      if (instr.type === "span") {
        spanItems.push(instr);
      } else {
        const arr = singleByCol.get(instr.startColIdx) || [];
        arr.push(instr);
        singleByCol.set(instr.startColIdx, arr);
      }
    });

    // If there are spanning items, they need their own row to avoid overlapping single-column items
    const hasSingleItems = singleByCol.size > 0;

    return (
      <div key={timeLabel ?? "allday"} className="space-y-0.5">
        {/* Single-column items row */}
        {hasSingleItems && (
          <div className="grid gap-1 items-start" style={{ gridTemplateColumns: `48px repeat(${columns.length}, minmax(0, 1fr))` }}>
            <div className="flex items-start justify-end pr-1 pt-1 flex-shrink-0 w-[48px]">
              <span className="text-[9px] text-muted-foreground font-medium tabular-nums whitespace-nowrap">
                {timeLabel ?? "All day"}
              </span>
            </div>
            {columns.map((_, colIdx) => {
              const singles = singleByCol.get(colIdx) || [];
              if (singles.length === 0) {
                return <div key={colIdx} className="min-h-[28px] min-w-0" />;
              }
              return (
                <div key={colIdx} className="space-y-0.5 min-h-[28px] min-w-0 overflow-hidden">
                  {singles.map((instr, i) => (
                    <div key={`${instr.item.id}-${i}`} className="min-w-0 overflow-hidden">{renderCard(instr, isAllDay)}</div>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {/* Spanning items — each in its own grid row */}
        {spanItems.map((instr, i) => (
          <div
            key={`span-${instr.item.id}-${i}`}
            className="grid gap-1 items-start"
            style={{ gridTemplateColumns: `48px repeat(${columns.length}, minmax(0, 1fr))` }}
          >
            {/* Time label for first span item only if no singles rendered above */}
            <div className="flex items-start justify-end pr-1 pt-1 flex-shrink-0 w-[48px]">
              {!hasSingleItems && i === 0 && (
                <span className="text-[9px] text-muted-foreground font-medium tabular-nums whitespace-nowrap">
                  {timeLabel ?? "All day"}
                </span>
              )}
            </div>
            <div
              className="min-h-[28px] min-w-0 overflow-hidden"
              style={{
                gridColumn: `${instr.startColIdx + 2} / span ${instr.spanCount}`,
              }}
            >
              {renderCard(instr, isAllDay)}
            </div>
          </div>
        ))}

        {/* If no items at all, still show the time label */}
        {!hasSingleItems && spanItems.length === 0 && (
          <div className="grid gap-1 items-start" style={{ gridTemplateColumns: `48px repeat(${columns.length}, minmax(0, 1fr))` }}>
            <div className="flex items-start justify-end pr-1 pt-1 flex-shrink-0 w-[48px]">
              <span className="text-[9px] text-muted-foreground font-medium tabular-nums whitespace-nowrap">
                {timeLabel ?? "All day"}
              </span>
            </div>
          </div>
        )}
      </div>
    );
  };

  if (columns.length === 0) return null;

  const reorderBtnWidth = columns.length > 1 ? 32 : 0;

  return (
    <div className="mt-3 border-t border-border pt-2 w-full overflow-hidden" style={{ boxSizing: "border-box" }}>
      {/* Column headers with optional reorder */}
      <div className="flex items-center mb-2 gap-1">
        <div className="grid gap-1 min-w-0 overflow-hidden" style={{ gridTemplateColumns: `48px repeat(${columns.length}, minmax(0, 1fr))`, flex: "1 1 0%", minWidth: 0 }}>
          <div />
          {columns.map((col, idx) => {
            const colors = MEMBER_COLORS[col.colorIndex % MEMBER_COLORS.length];
            return (
              <div
                key={col.id}
                draggable={showReorder}
                onDragStart={() => handleDragStart(idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDragEnd={handleDragEnd}
                className={`rounded-lg px-2 py-1.5 flex items-center gap-1.5 min-w-0 overflow-hidden ${colors.bg} ${showReorder ? "cursor-grab active:cursor-grabbing ring-1 ring-primary/20" : ""} ${dragIdx === idx ? "opacity-50" : ""}`}
              >
                {showReorder && <GripVertical size={10} className="text-muted-foreground flex-shrink-0" />}
                {col.avatarUrl ? (
                  <img src={col.avatarUrl} alt={col.initial} className="w-5 h-5 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0 ${colors.avatarBg}`}>
                    {col.initial}
                  </span>
                )}
                <span className={`text-[11px] font-semibold truncate ${colors.text}`}>{col.label}</span>
              </div>
            );
          })}
        </div>
        {columns.length > 1 && (
          <button
            onClick={() => setShowReorder(!showReorder)}
            className={`text-[10px] font-medium px-2 py-1 rounded-md flex-shrink-0 transition-colors ${showReorder ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"}`}
          >
            {showReorder ? "Done" : "⇄"}
          </button>
        )}
      </div>

      {/* Event rows — right margin matches the reorder button width so cards don't overflow into it */}
      <div style={{ marginRight: reorderBtnWidth > 0 ? `${reorderBtnWidth + 4}px` : 0 }}>
        {/* All-day events */}
        {allDayItems.length > 0 && renderItemRow(allDayItems, true)}

        {/* Timed rows */}
        <div className="space-y-0.5">
          {timeRows.map(row => renderItemRow(row.items, false, formatMinutes(row.time)))}
        </div>

        {items.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-6">No events</p>
        )}
      </div>
    </div>
  );
};

export default CalendarTeamDashboard;
