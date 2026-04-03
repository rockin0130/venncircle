import { useMemo, useState, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { Clock, Check, Users, GripVertical, ListTodo } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Task, ScheduledEvent, GoogleCalendarEvent } from "@/context/AppContext";
import { formatTime } from "@/lib/formatTime";
import {
  DashboardMember,
  buildColumnIndexMap,
  resolveAssignedUserIds,
  resolveColumnIndexes,
} from "@/lib/teamDashboardMapping";

interface UnifiedItem {
  id: string;
  type: "task" | "event" | "gcal";
  title: string;
  time: string;
  sortMinutes: number;
  assignee: "me" | "partner" | "both";
  assignedUserIds: string[];
  sourceUserId: string | null;
  done: boolean;
  isOwn: boolean;
  tag?: string;
  original: Task | ScheduledEvent | GoogleCalendarEvent;
}

interface TeamDashboardProps {
  myTasks: Task[];
  myEvents: ScheduledEvent[];
  partnerTasks: Task[];
  partnerEvents: ScheduledEvent[];
  gcalEvents: GoogleCalendarEvent[];
  toggleTask: (id: string) => void;
  toggleEventCompletion?: (id: string) => void;
  toggleGcalCompletion?: (eventId: string) => void;
  removeEvent: (id: string) => void;
  removeTask?: (id: string) => void;
  toggleEventVisibility?: (id: string) => void;
  rescheduleEvent?: (id: string, day: number, month: number, year: number) => void;
  hideGcalEvent?: (eventId: string) => void;
  designateGcalEvent?: (eventId: string, assignee: "me" | "partner" | "both") => void;
  onCongrats: () => void;
}

function parseTimeToMinutes(time?: string): number {
  if (!time || time === "" || time === "All day") return -1;
  const match24 = time.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) return parseInt(match24[1], 10) * 60 + parseInt(match24[2], 10);
  const match12 = time.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (match12) {
    let h = parseInt(match12[1], 10);
    const m = parseInt(match12[2], 10);
    const isPM = match12[3].toUpperCase() === "PM";
    if (isPM && h !== 12) h += 12;
    if (!isPM && h === 12) h = 0;
    return h * 60 + m;
  }
  return -1;
}

const TeamDashboard = ({
  myTasks, myEvents, partnerTasks, partnerEvents, gcalEvents,
  toggleTask, toggleEventCompletion, toggleGcalCompletion, onCongrats,
}: TeamDashboardProps) => {
  const { user, profile, partner, activeGroup } = useAuth();

  // ── Resizable column state ──
  const [splitPercent, setSplitPercent] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    const onMouseMove = (ev: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      setSplitPercent(Math.min(80, Math.max(20, (x / rect.width) * 100)));
    };
    const onMouseUp = () => {
      isDragging.current = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
    isDragging.current = true;
    const onTouchMove = (ev: TouchEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      ev.preventDefault();
      const rect = containerRef.current.getBoundingClientRect();
      const x = ev.touches[0].clientX - rect.left;
      setSplitPercent(Math.min(80, Math.max(20, (x / rect.width) * 100)));
    };
    const onTouchEnd = () => {
      isDragging.current = false;
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
    };
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd);
  }, []);

  // ── Column members ──
  const columnMembers = useMemo<DashboardMember[]>(() => {
    if (!user) return [];
    if (activeGroup) {
      return activeGroup.members.map((m) => ({
        userId: m.user_id,
        name: m.display_name || "Member",
        isSelf: m.user_id === user.id,
      }));
    }
    const base: DashboardMember[] = [{
      userId: user.id, name: profile?.display_name || "Me", isSelf: true,
    }];
    if (partner?.id) {
      base.push({ userId: partner.id, name: partner.display_name || "Partner", isSelf: false });
    }
    return base;
  }, [activeGroup, partner, profile, user]);

  const selfUserId = user?.id ?? "";
  const primaryOtherUserId = useMemo(
    () => columnMembers.find((m) => !m.isSelf)?.userId ?? null,
    [columnMembers],
  );
  const columnIndexByUserId = useMemo(() => buildColumnIndexMap(columnMembers), [columnMembers]);
  const colCount = columnMembers.length;

  // ── Build unified items ──
  const allItems = useMemo(() => {
    if (!selfUserId || columnMembers.length === 0) return [] as UnifiedItem[];
    const items: UnifiedItem[] = [];
    const seenIds = new Set<string>();
    const addItem = (item: UnifiedItem) => {
      if (!seenIds.has(item.id)) { seenIds.add(item.id); items.push(item); }
    };

    myTasks.forEach((t) => addItem({
      id: t.id, type: "task", title: t.title, time: t.time,
      sortMinutes: parseTimeToMinutes(t.time), assignee: t.assignee,
      assignedUserIds: resolveAssignedUserIds({ assignee: t.assignee, sourceUserId: selfUserId, selfUserId, members: columnMembers }),
      sourceUserId: selfUserId, done: t.done, isOwn: true, tag: t.tag, original: t,
    }));
    myEvents.forEach((e) => addItem({
      id: e.id, type: "event", title: e.title, time: e.time,
      sortMinutes: parseTimeToMinutes(e.time), assignee: e.user,
      assignedUserIds: resolveAssignedUserIds({ assignee: e.user, sourceUserId: selfUserId, selfUserId, members: columnMembers }),
      sourceUserId: selfUserId, done: e.done ?? false, isOwn: true, original: e,
    }));
    partnerEvents.forEach((e) => addItem({
      id: `p-${e.id}`, type: "event", title: e.title, time: e.time,
      sortMinutes: parseTimeToMinutes(e.time), assignee: e.user,
      assignedUserIds: resolveAssignedUserIds({ assignee: e.user, sourceUserId: primaryOtherUserId, selfUserId, members: columnMembers }),
      sourceUserId: primaryOtherUserId, done: e.done ?? false, isOwn: false, original: e,
    }));
    gcalEvents.forEach((ge) => {
      const timeStr = ge.allDay ? "" : ge.start ? new Date(ge.start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "";
      const src = ge.ownerUserId || selfUserId;
      const assignee = ge.assignee || "me";
      addItem({
        id: `gcal-${ge.id}`, type: "gcal", title: ge.title, time: timeStr,
        sortMinutes: ge.allDay || !ge.start ? -1 : new Date(ge.start).getHours() * 60 + new Date(ge.start).getMinutes(),
        assignee, assignedUserIds: resolveAssignedUserIds({ assignee, sourceUserId: src, selfUserId, members: columnMembers }),
        sourceUserId: src, done: ge.done ?? false, isOwn: src === selfUserId, original: ge,
      });
    });
    return items;
  }, [columnMembers, gcalEvents, myEvents, myTasks, partnerEvents, partnerTasks, primaryOtherUserId, selfUserId]);

  // ── Sort globally by time ──
  const timedItems = useMemo(
    () => allItems.filter((i) => i.sortMinutes >= 0).sort((a, b) => a.sortMinutes - b.sortMinutes || a.title.localeCompare(b.title)),
    [allItems],
  );
  const untimedItems = useMemo(() => allItems.filter((i) => i.sortMinutes < 0), [allItems]);

  // ── Grid columns CSS ──
  const gridCols = colCount === 2
    ? `${splitPercent}% 5px ${100 - splitPercent}%`
    : columnMembers.map(() => "1fr").join(" ");

  // ── Per-column totals ──
  const totalPerCol = useMemo(() => {
    return columnMembers.map((_, index) => {
      return allItems.filter((item) => {
        const cols = resolveColumnIndexes(item.assignedUserIds, columnIndexByUserId);
        return cols.includes(index);
      }).length;
    });
  }, [allItems, columnIndexByUserId, columnMembers]);

  // ── Render a single card ──
  const renderCard = (item: UnifiedItem) => {
    const isShared = item.assignedUserIds.length > 1 || item.assignee === "both";
    const canToggle = item.assignedUserIds.includes(selfUserId);

    const handleToggle = () => {
      if (!canToggle) return;
      if (!item.done) onCongrats();
      if (item.type === "task") {
        toggleTask((item.original as Task).id);
      } else if (item.type === "event") {
        toggleEventCompletion?.((item.original as ScheduledEvent).id);
      } else if (item.type === "gcal") {
        toggleGcalCompletion?.((item.original as GoogleCalendarEvent).id);
      }
    };

    return (
      <motion.div
        key={item.id}
        layout
        className={`rounded-lg p-1.5 shadow-sm border transition-all ${
          item.done ? "border-habit-green/50 bg-card" : "border-border bg-card"
        } ${isShared ? "border-primary/30 bg-primary/5" : ""}`}
      >
        {item.sortMinutes >= 0 && (
          <div className="flex items-center gap-1 mb-0.5">
            <Clock size={9} className="text-muted-foreground" />
            <span className="text-[10px] font-medium text-muted-foreground">{formatTime(item.time)}</span>
            {item.type === "gcal" && (
              <span className="text-[8px] font-semibold text-primary bg-primary/10 px-1 py-0.5 rounded">Google</span>
            )}
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleToggle}
            disabled={!canToggle}
            className={`w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
              item.done ? "bg-habit-green border-habit-green" : "border-muted"
            } ${!canToggle ? "opacity-60" : ""}`}
          >
            {item.done && <Check size={7} className="text-primary-foreground" />}
          </button>
          <span className={`flex-1 text-[11px] font-medium leading-tight truncate ${item.done ? "line-through opacity-40" : ""}`}>
            {item.title}
          </span>
          {isShared && (
            <div className="flex -space-x-1">
              {columnMembers.filter((m) => item.assignedUserIds.includes(m.userId)).map((m) => (
                <div key={m.userId} className={`w-3 h-3 rounded-full ${m.isSelf ? "bg-user-a" : "bg-user-b"} flex items-center justify-center text-[6px] font-bold text-primary-foreground ring-1 ring-card`}>
                  {m.name.charAt(0).toUpperCase()}
                </div>
              ))}
            </div>
          )}
          {item.type === "gcal" && item.sortMinutes < 0 && (
            <span className="text-[8px] font-semibold text-primary bg-primary/10 px-1 py-0.5 rounded flex-shrink-0">Google</span>
          )}
        </div>
      </motion.div>
    );
  };

  // ── Render a single item as a row in the grid ──
  const renderItemRow = (item: UnifiedItem) => {
    const cols = resolveColumnIndexes(item.assignedUserIds, columnIndexByUserId);
    const isShared = cols.length > 1;

    if (isShared) {
      return (
        <div
          key={item.id}
          className="relative z-20 px-1 py-0.5"
          style={{ gridColumn: colCount === 2 ? "1 / -1" : `1 / span ${colCount}` }}
        >
          {renderCard(item)}
        </div>
      );
    }

    const targetCol = cols[0] ?? 0;
    if (colCount === 2) {
      const gridColumn = targetCol === 0 ? "1 / 2" : "3 / 4";
      return (
        <div key={item.id} className="px-1 py-0.5" style={{ gridColumn }}>
          {renderCard(item)}
        </div>
      );
    }
    return (
      <div key={item.id} className="px-1 py-0.5" style={{ gridColumn: targetCol + 1 }}>
        {renderCard(item)}
      </div>
    );
  };

  // ── Render a scrollable section grid ──
  const renderSectionGrid = (items: UnifiedItem[], maxHeight: string) => {
    if (items.length === 0) {
      return (
        <p className="text-[10px] text-muted-foreground text-center py-2 opacity-50">No items</p>
      );
    }
    return (
      <div
        className="overflow-y-auto scroll-smooth-touch relative"
        style={{ maxHeight }}
      >
        {/* Divider line inside scroll area */}
        {colCount === 2 && (
          <div
            className="absolute top-0 bottom-0 w-[1px] bg-border z-[5] pointer-events-none"
            style={{ left: `${splitPercent}%` }}
          />
        )}
        <div
          className="grid auto-rows-auto"
          style={{ gridTemplateColumns: gridCols }}
        >
          {items.map(renderItemRow)}
        </div>
      </div>
    );
  };

  const hasAnyItems = timedItems.length > 0 || untimedItems.length > 0;

  return (
    <section className="mb-6">
      <div className="flex items-center gap-2 mb-2">
        <Users size={16} className="text-muted-foreground" />
        <h2 className="text-base font-semibold tracking-display">Team Dashboard</h2>
      </div>

      <div ref={containerRef} className="rounded-xl border border-border bg-secondary/30 overflow-hidden relative">
        {/* ── Header row with resize handle ── */}
        <div className="grid relative" style={{ gridTemplateColumns: gridCols }}>
          {colCount === 2 && (
            <div
              className="absolute top-0 bottom-0 w-[1px] bg-border z-[5] pointer-events-none"
              style={{ left: `${splitPercent}%` }}
            />
          )}
          {columnMembers.map((member, index) => (
            <div key={member.userId} className="contents">
              {index > 0 && colCount === 2 && (
                <div className="relative flex items-center justify-center">
                  <div
                    className="absolute inset-y-0 w-5 -ml-2.5 cursor-col-resize z-30 flex items-center justify-center"
                    onMouseDown={handleMouseDown}
                    onTouchStart={handleTouchStart}
                  >
                    <div className="w-2.5 h-3.5 rounded-sm bg-border/60 flex items-center justify-center">
                      <GripVertical size={7} className="text-muted-foreground/70" />
                    </div>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-border min-w-0">
                <div className={`w-4 h-4 rounded-full ${member.isSelf ? "bg-user-a" : "bg-user-b"} flex items-center justify-center text-[8px] font-bold text-primary-foreground flex-shrink-0`}>
                  {member.name.charAt(0).toUpperCase()}
                </div>
                <span className="text-[11px] font-semibold text-foreground truncate">{member.name}</span>
                <span className="text-[9px] text-muted-foreground bg-secondary px-1 py-0.5 rounded-full ml-auto flex-shrink-0">
                  {totalPerCol[index] || 0}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* ── Scheduled Section ── */}
        <div className="flex items-center gap-1 px-2 py-1 bg-secondary/50 border-b border-border">
          <Clock size={10} className="text-muted-foreground" />
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Scheduled</span>
          <span className="text-[9px] text-muted-foreground/60 ml-auto">{timedItems.length}</span>
        </div>
        {renderSectionGrid(timedItems, "min(40vh, 300px)")}

        {/* ── To Do Section ── */}
        <div className="flex items-center gap-1 px-2 py-1 bg-secondary/50 border-t border-b border-border">
          <ListTodo size={10} className="text-muted-foreground" />
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">To Do</span>
          <span className="text-[9px] text-muted-foreground/60 ml-auto">{untimedItems.length}</span>
        </div>
        {renderSectionGrid(untimedItems, "min(40vh, 300px)")}

        {!hasAnyItems && (
          <p className="text-[10px] text-muted-foreground text-center py-3 opacity-50">No items</p>
        )}
      </div>
    </section>
  );
};

export default TeamDashboard;
