import { useMemo } from "react";
import { useAuth, Group, GroupMember } from "@/context/AuthContext";
import { formatTime } from "@/lib/formatTime";
import { FilterUser, MEMBER_COLORS, SHARED_COLOR } from "@/components/CalendarUserFilter";

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

function resolveItemOwnerIds(item: CalItem, currentUserId: string, groups: Group[]): Set<string> {
  const raw = item.raw as any;
  const ownerId: string = raw.ownerUserId || raw.user_id || currentUserId;

  // Google Calendar events always default to current user only
  if (item.type === "gcal") {
    // Check if explicitly assigned via gcal designation
    const gcalAssignee = raw.assignee;
    if (gcalAssignee === "both") {
      const ids = new Set<string>();
      ids.add(currentUserId);
      const groupId = item.groupId;
      if (groupId) {
        const grp = groups.find(g => g.id === groupId);
        grp?.members?.filter((m: any) => m.user_id !== currentUserId && m.status === "active")
          .forEach((m: any) => ids.add(m.user_id));
      }
      return ids;
    }
    if (gcalAssignee === "partner") {
      const ids = new Set<string>();
      const groupId = item.groupId;
      if (groupId) {
        const grp = groups.find(g => g.id === groupId);
        grp?.members?.filter((m: any) => m.user_id !== currentUserId && m.status === "active")
          .forEach((m: any) => ids.add(m.user_id));
      }
      if (ids.size === 0) ids.add(currentUserId);
      return ids;
    }
    // Default: Mine only
    return new Set([currentUserId]);
  }

  // For regular events/tasks: prefer assignee_user_ids array if available
  const assigneeUserIds: string[] | null = raw.assignee_user_ids;
  if (assigneeUserIds && assigneeUserIds.length > 0) {
    return new Set(assigneeUserIds);
  }

  // Fallback to legacy assignee field
  const assignee = item.assignee;
  const groupId = item.groupId;
  const ids = new Set<string>();

  if (assignee === "me") {
    ids.add(ownerId);
  } else if (assignee === "partner") {
    if (groupId) {
      const grp = groups.find(g => g.id === groupId);
      grp?.members?.filter((m: any) => m.user_id !== ownerId && m.status === "active")
        .forEach((m: any) => ids.add(m.user_id));
    }
    if (ids.size === 0) ids.add("partner");
  } else if (assignee === "both") {
    ids.add(ownerId);
    if (groupId) {
      const grp = groups.find(g => g.id === groupId);
      grp?.members?.filter((m: any) => m.user_id !== ownerId && m.status === "active")
        .forEach((m: any) => ids.add(m.user_id));
    }
  } else {
    ids.add(ownerId);
  }
  return ids;
}

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

const CalendarTeamDashboard = ({ items, filterUsers, selectedUserIds, onItemTap }: Props) => {
  const { user, groups } = useAuth();
  const currentUserId = user?.id || "";

  // Only show columns for selected users
  const columns = useMemo(() => {
    const isEveryone = selectedUserIds.has("__everyone__");
    return filterUsers.filter(u => isEveryone || selectedUserIds.has(u.id));
  }, [filterUsers, selectedUserIds]);

  // Resolve which columns each item belongs to
  const itemColumnMap = useMemo(() => {
    const map = new Map<string, Set<number>>();
    items.forEach(item => {
      const ownerIds = resolveItemOwnerIds(item, currentUserId, groups);
      const colIndices = new Set<number>();
      columns.forEach((col, idx) => {
        if (ownerIds.has(col.id)) colIndices.add(idx);
      });
      // For gcal events, assign to first column (current user)
      if (item.type === "gcal" && colIndices.size === 0) {
        const myIdx = columns.findIndex(c => c.id === currentUserId);
        if (myIdx >= 0) colIndices.add(myIdx);
      }
      if (colIndices.size > 0) map.set(item.id, colIndices);
    });
    return map;
  }, [items, columns, currentUserId, groups]);

  // Split into all-day and timed
  const allDayItems = useMemo(() => items.filter(i => i.allDay || i.isDueDateTask), [items]);
  const timedItems = useMemo(() => {
    return items
      .filter(i => !i.allDay && !i.isDueDateTask)
      .map(i => {
        const startMin = i.type === "gcal" && i.time ? parseMinutesFromTime(new Date(i.time).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })) : parseMinutesFromTime(i.time);
        const endMin = i.endTime ? parseMinutesFromTime(i.endTime) : (startMin != null ? startMin + 60 : null);
        return { ...i, startMin: startMin ?? 0, endMin: endMin ?? (startMin ?? 0) + 60 };
      })
      .sort((a, b) => a.startMin - b.startMin);
  }, [items]);

  // Group timed items by their start time for row layout
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

  const getItemColors = (item: CalItem, colIndices: Set<number>) => {
    if (colIndices.size > 1) return SHARED_COLOR;
    const colIdx = [...colIndices][0] ?? 0;
    const user = columns[colIdx];
    if (!user) return MEMBER_COLORS[0];
    return MEMBER_COLORS[user.colorIndex % MEMBER_COLORS.length];
  };

  const renderCard = (item: CalItem & { startMin?: number; endMin?: number }, colIndices: Set<number>, isAllDay?: boolean) => {
    const colors = getItemColors(item, colIndices);
    const isShared = colIndices.size > 1;
    const durationMins = (item as any).endMin && (item as any).startMin != null ? (item as any).endMin - (item as any).startMin : 60;
    const minHeight = isAllDay ? 32 : Math.max(28, Math.min(durationMins * 0.6, 80));
    
    const displayTime = item.type === "gcal" && item.time && !item.allDay
      ? new Date(item.time).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
      : formatTime(item.time);
    const displayEndTime = item.endTime ? formatTime(item.endTime) : null;

    return (
      <button
        key={item.id}
        onClick={() => onItemTap?.(item as CalItem)}
        className="w-full text-left rounded-lg border transition-all hover:brightness-95 active:brightness-90 overflow-hidden"
        style={{
          backgroundColor: colors.cardBg,
          borderColor: colors.cardBorder,
          minHeight: `${minHeight}px`,
        }}
      >
        <div className="px-2 py-1.5">
          <p className={`text-[12px] font-semibold leading-tight truncate ${item.done ? "line-through opacity-40" : ""}`}
            style={{ color: colors.cardBorder }}>
            {item.title}
          </p>
          {!isAllDay && (
            <p className="text-[10px] mt-0.5 opacity-70" style={{ color: colors.cardBorder }}>
              {displayTime}{displayEndTime && displayEndTime !== displayTime ? ` – ${displayEndTime}` : ""}
            </p>
          )}
          {isShared && (
            <div className="flex -space-x-1 mt-1">
              {columns.filter((_, idx) => colIndices.has(idx)).map(col => (
                <div
                  key={col.id}
                  className={`w-3 h-3 rounded-full flex items-center justify-center text-[6px] font-bold text-white ring-1 ring-white/50 ${MEMBER_COLORS[col.colorIndex % MEMBER_COLORS.length].avatarBg}`}
                >
                  {col.initial}
                </div>
              ))}
            </div>
          )}
        </div>
      </button>
    );
  };

  if (columns.length === 0) return null;

  return (
    <div className="mt-3 border-t border-border pt-2">
      {/* Column headers */}
      <div className="grid gap-1 mb-2" style={{ gridTemplateColumns: `40px repeat(${columns.length}, 1fr)` }}>
        <div />
        {columns.map((col) => {
          const colors = MEMBER_COLORS[col.colorIndex % MEMBER_COLORS.length];
          return (
            <div key={col.id} className={`rounded-lg px-2 py-1.5 flex items-center gap-1.5 ${colors.bg}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0 ${colors.avatarBg}`}>
                {col.initial}
              </span>
              <span className={`text-[11px] font-semibold truncate ${colors.text}`}>{col.label}</span>
            </div>
          );
        })}
      </div>

      {/* All-day events */}
      {allDayItems.length > 0 && (
        <div className="grid gap-1 mb-1" style={{ gridTemplateColumns: `40px repeat(${columns.length}, 1fr)` }}>
          <div className="flex items-center justify-end pr-1">
            <span className="text-[9px] text-muted-foreground font-medium">All day</span>
          </div>
          {columns.map((_, colIdx) => {
            const colItems = allDayItems.filter(item => {
              const cols = itemColumnMap.get(item.id);
              return cols?.has(colIdx);
            });
            // Also check for shared items that span this column
            const sharedItems = allDayItems.filter(item => {
              const cols = itemColumnMap.get(item.id);
              if (!cols || cols.size <= 1) return false;
              // Only render shared item in first column it spans
              const firstCol = Math.min(...cols);
              return firstCol === colIdx;
            });

            const renderItems = [...colItems.filter(item => {
              const cols = itemColumnMap.get(item.id);
              return cols && cols.size === 1;
            })];

            return (
              <div key={colIdx} className="space-y-0.5 min-h-[32px]">
                {renderItems.map(item => renderCard(item, itemColumnMap.get(item.id) || new Set(), true))}
                {colIdx === 0 && sharedItems.map(item => {
                  const cols = itemColumnMap.get(item.id)!;
                  return (
                    <div key={item.id} style={{ gridColumn: `${colIdx + 2} / span ${cols.size}` }}>
                      {renderCard(item, cols, true)}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* Timed rows */}
      <div className="space-y-0.5">
        {timeRows.map(row => (
          <div key={row.time} className="grid gap-1" style={{ gridTemplateColumns: `40px repeat(${columns.length}, 1fr)` }}>
            <div className="flex items-start justify-end pr-1 pt-1">
              <span className="text-[9px] text-muted-foreground font-medium tabular-nums">
                {formatMinutes(row.time)}
              </span>
            </div>
            {columns.map((_, colIdx) => {
              const colItems = row.items.filter(item => {
                const cols = itemColumnMap.get(item.id);
                if (!cols) return false;
                if (cols.size > 1) {
                  // Shared: only render in first column
                  return Math.min(...cols) === colIdx;
                }
                return cols.has(colIdx);
              });

              return (
                <div key={colIdx} className="space-y-0.5 min-h-[28px]">
                  {colItems.map(item => {
                    const cols = itemColumnMap.get(item.id) || new Set([colIdx]);
                    return renderCard(item, cols);
                  })}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {items.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-6">No events</p>
      )}
    </div>
  );
};

export default CalendarTeamDashboard;
