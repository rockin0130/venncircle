import { useState, useEffect, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import { Sun, CloudSun, Moon, Clock, Check, CalendarDays, ChevronRight } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Task, ScheduledEvent, GoogleCalendarEvent } from "@/context/AppContext";
import { formatTime } from "@/lib/formatTime";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

type UnifiedScheduledItem = {
  id: string;
  kind: "event" | "task" | "gcal";
  title: string;
  sortMinutes: number;
  done: boolean;
  allDay: boolean;
  time?: string;
  endTime?: string;
  assignee?: string;
  groupId?: string | null;
  ownerUserId?: string;
  hiddenFromPartner?: boolean;
  raw: Task | ScheduledEvent | GoogleCalendarEvent;
};

type Period = "morning" | "afternoon" | "evening" | "flexible";

const PERIOD_CONFIG: Record<Period, { label: string; icon: React.ReactNode }> = {
  morning: { label: "Morning", icon: <Sun size={14} className="text-amber-500" /> },
  afternoon: { label: "Afternoon", icon: <CloudSun size={14} className="text-orange-400" /> },
  evening: { label: "Evening", icon: <Moon size={14} className="text-indigo-400" /> },
  flexible: { label: "Flexible", icon: <Clock size={14} className="text-muted-foreground" /> },
};

function getPeriod(minutes: number): Period {
  if (minutes < 0) return "flexible";
  if (minutes < 720) return "morning";       // 0–11:59 AM
  if (minutes < 1080) return "afternoon";    // 12:00–5:59 PM
  return "evening";                           // 6:00–11:59 PM
}

function toSortMinutes(time?: string, isoStart?: string): number {
  if (!time && isoStart) {
    const d = new Date(isoStart);
    if (!isNaN(d.getTime())) return d.getHours() * 60 + d.getMinutes();
  }
  if (!time || time === "" || time === "All day") return -1;
  const match24 = time.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) return parseInt(match24[1]) * 60 + parseInt(match24[2]);
  const match12 = time.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (match12) {
    let h = parseInt(match12[1]);
    const m = parseInt(match12[2]);
    if (match12[3].toUpperCase() === "PM" && h !== 12) h += 12;
    if (match12[3].toUpperCase() === "AM" && h === 12) h = 0;
    return h * 60 + m;
  }
  const d = new Date(time);
  if (!isNaN(d.getTime())) return d.getHours() * 60 + d.getMinutes();
  return -1;
}

function getEndMinutes(item: UnifiedScheduledItem): number {
  if (item.kind === "gcal") {
    const ge = item.raw as GoogleCalendarEvent;
    if (ge.end) {
      const d = new Date(ge.end);
      if (!isNaN(d.getTime())) return d.getHours() * 60 + d.getMinutes();
    }
  }
  if (item.endTime) return toSortMinutes(item.endTime);
  // Default: assume 30 min duration
  return item.sortMinutes >= 0 ? item.sortMinutes + 30 : -1;
}

function formatTimeRange(item: UnifiedScheduledItem): string {
  if (item.allDay) return "All day";
  if (item.kind === "gcal") {
    const ge = item.raw as GoogleCalendarEvent;
    if (ge.start) {
      const start = new Date(ge.start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
      const end = ge.end ? new Date(ge.end).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "";
      return end ? `${start} – ${end}` : start;
    }
  }
  const start = formatTime(item.time || "");
  if (item.endTime) {
    const end = formatTime(item.endTime);
    if (end && end !== start) return `${start} – ${end}`;
  }
  return start || "";
}

interface Props {
  allDayItems: { kind: "task" | "event" | "gcal"; data: Task | ScheduledEvent | GoogleCalendarEvent; sortMinutes: number }[];
  allTimedItems: { kind: "task" | "event" | "gcal"; data: Task | ScheduledEvent | GoogleCalendarEvent; sortMinutes: number }[];
  isToday: boolean;
  isViewingPartner: boolean;
  onToggleTask: (id: string) => void;
  onToggleEvent: (id: string) => void;
  onToggleGcal: (id: string) => void;
  onCongrats: () => void;
  onNavigate?: (page: string) => void;
}

const HomeScheduledSection = ({
  allDayItems,
  allTimedItems,
  isToday,
  isViewingPartner,
  onToggleTask,
  onToggleEvent,
  onToggleGcal,
  onCongrats,
  onNavigate,
}: Props) => {
  const { groups, activeGroup, user } = useAuth();
  const [nowMinutes, setNowMinutes] = useState(() => {
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes();
  });

  // Update NOW every 30 seconds
  useEffect(() => {
    if (!isToday) return;
    const interval = setInterval(() => {
      const n = new Date();
      setNowMinutes(n.getHours() * 60 + n.getMinutes());
    }, 30000);
    return () => clearInterval(interval);
  }, [isToday]);

  // Unify all items
  const unifiedItems: UnifiedScheduledItem[] = useMemo(() => {
    const toUnified = (item: { kind: "task" | "event" | "gcal"; data: any; sortMinutes: number }): UnifiedScheduledItem => {
      const d = item.data;
      if (item.kind === "task") {
        const t = d as Task;
        return {
          id: t.id, kind: "task", title: t.title, sortMinutes: item.sortMinutes,
          done: t.done, allDay: !t.time || t.time === "" || t.time === "All day",
          time: t.time, assignee: t.assignee, groupId: t.groupId,
          ownerUserId: t.ownerUserId, hiddenFromPartner: t.hiddenFromPartner, raw: t,
        };
      }
      if (item.kind === "event") {
        const e = d as ScheduledEvent;
        return {
          id: e.id, kind: "event", title: e.title, sortMinutes: item.sortMinutes,
          done: !!e.done, allDay: !e.time || e.time === "" || e.time === "All day" || !!e.allDay,
          time: e.time, endTime: e.endTime, assignee: e.user, groupId: e.groupId,
          ownerUserId: e.ownerUserId, hiddenFromPartner: e.hiddenFromPartner, raw: e,
        };
      }
      // gcal
      const ge = d as GoogleCalendarEvent;
      return {
        id: ge.id, kind: "gcal", title: ge.title, sortMinutes: item.sortMinutes,
        done: !!ge.done, allDay: ge.allDay,
        time: ge.start, endTime: ge.end, assignee: ge.assignee || "me", groupId: null,
        ownerUserId: ge.ownerUserId, raw: ge,
      };
    };
    return [...allDayItems.map(toUnified), ...allTimedItems.map(toUnified)];
  }, [allDayItems, allTimedItems]);

  // Group by period
  const periodMap = useMemo(() => {
    const map: Record<Period, UnifiedScheduledItem[]> = { morning: [], afternoon: [], evening: [], flexible: [] };
    for (const item of unifiedItems) {
      const period = getPeriod(item.sortMinutes);
      map[period].push(item);
    }
    // Sort within periods
    for (const key of Object.keys(map) as Period[]) {
      map[key].sort((a, b) => a.sortMinutes - b.sortMinutes);
    }
    return map;
  }, [unifiedItems]);

  const activePeriods = (["morning", "afternoon", "evening", "flexible"] as Period[]).filter(p => periodMap[p].length > 0);

  // Progress
  const totalItems = unifiedItems.length;
  const doneItems = unifiedItems.filter(i => i.done).length;
  const progressPercent = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0;

  // NOW item: the item whose time window contains current time
  const nowItemId = useMemo(() => {
    if (!isToday) return null;
    for (const item of unifiedItems) {
      if (item.done || item.sortMinutes < 0) continue;
      const endMin = getEndMinutes(item);
      if (nowMinutes >= item.sortMinutes && nowMinutes < endMin) return item.id;
    }
    return null;
  }, [isToday, nowMinutes, unifiedItems]);

  // Context tag
  const getContextTag = useCallback((item: UnifiedScheduledItem) => {
    if (item.groupId) {
      const group = groups.find(g => g.id === item.groupId);
      if (group) {
        // Family groups use green
        const isFamily = group.name.toLowerCase() === "family" || group.category === "home";
        if (isFamily) return { label: group.name, bg: "bg-emerald-100 dark:bg-emerald-900/30", text: "text-emerald-700 dark:text-emerald-300" };
        return { label: group.name, bg: "bg-violet-100 dark:bg-violet-900/30", text: "text-violet-700 dark:text-violet-300" };
      }
    }
    return { label: "Mine", bg: "bg-sky-100 dark:bg-sky-900/30", text: "text-sky-700 dark:text-sky-300" };
  }, [groups]);

  // Toggle handler
  const handleToggle = (item: UnifiedScheduledItem) => {
    if (isViewingPartner) return;
    if (!item.done) onCongrats();
    if (item.kind === "task") onToggleTask(item.id);
    else if (item.kind === "event") onToggleEvent(item.id);
    else onToggleGcal(item.id);
  };

  // Avatar initials for shared items
  const getAvatarInitials = (item: UnifiedScheduledItem): string[] => {
    if (item.assignee === "both") {
      const myInit = user?.email?.charAt(0)?.toUpperCase() || "M";
      return [myInit, "P"];
    }
    return [];
  };

  // Empty state
  if (totalItems === 0) {
    return (
      <section className="mb-6">
        <button
          onClick={() => onNavigate?.("calendar")}
          className="flex items-center gap-2 mb-3 group cursor-pointer hover:opacity-80 transition-opacity"
        >
          <CalendarDays size={18} className="text-primary" />
          <h2 className="text-lg font-semibold tracking-display">Scheduled</h2>
          <ChevronRight size={16} className="text-muted-foreground group-hover:text-foreground transition-colors" />
        </button>
        <div className="bg-card rounded-xl border border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">Nothing scheduled — enjoy your day ✨</p>
          <p className="text-xs text-muted-foreground mt-1">Tap + to add an event or task</p>
        </div>
      </section>
    );
  }

  return (
    <section className="mb-6">
      {/* Header */}
      <button
        onClick={() => onNavigate?.("calendar")}
        className="flex items-center gap-2 mb-3 group cursor-pointer hover:opacity-80 transition-opacity"
      >
        <CalendarDays size={18} className="text-primary" />
        <h2 className="text-lg font-semibold tracking-display">Scheduled</h2>
        <ChevronRight size={16} className="text-muted-foreground group-hover:text-foreground transition-colors" />
      </button>

      {/* Progress bar */}
      <div className="bg-card rounded-xl border border-border p-3 mb-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-muted-foreground">Today's progress</span>
          <span className="text-xs font-semibold text-foreground">
            {progressPercent}% · {doneItems} of {totalItems} done
          </span>
        </div>
        <Progress value={progressPercent} className="h-1.5" />
      </div>

      {/* Period sections */}
      <div className="space-y-4">
        {activePeriods.map(period => {
          const items = periodMap[period];
          const config = PERIOD_CONFIG[period];
          return (
            <div key={period}>
              {/* Period separator */}
              <div className="flex items-center gap-2 mb-2">
                {config.icon}
                <span className="text-xs font-semibold text-muted-foreground">{config.label}</span>
                <span className="text-[10px] text-muted-foreground/60">({items.length})</span>
                <div className="flex-1 h-px bg-border ml-1" />
              </div>

              {/* Cards */}
              <div className="space-y-2">
                {items.map(item => {
                  const isNow = nowItemId === item.id;
                  const tag = getContextTag(item);
                  const avatars = getAvatarInitials(item);
                  const timeDisplay = formatTimeRange(item);

                  return (
                    <motion.div
                      key={`${item.kind}-${item.id}`}
                      layout
                      className={cn(
                        "rounded-xl p-3 border transition-all active:scale-[0.99]",
                        // Done state
                        item.done && "opacity-45",
                        // NOW state
                        isNow && !item.done && "bg-[#E6F1FB] dark:bg-sky-950/40 border-sky-500 border-2",
                        // Event type styling
                        !isNow && !item.done && item.kind === "event" && "bg-card border-l-[3px] border-l-indigo-500 border-border",
                        !isNow && !item.done && item.kind === "gcal" && "bg-card border-l-[3px] border-l-indigo-500 border-border",
                        !isNow && !item.done && item.kind === "task" && "bg-card border-border",
                        // Done border
                        item.done && "bg-card border-border",
                      )}
                      style={!item.done && !isNow && item.kind === "task" ? undefined : undefined}
                    >
                      <div className="flex items-center gap-3">
                        {/* Completion circle */}
                        <button
                          onClick={(e) => { e.stopPropagation(); handleToggle(item); }}
                          disabled={isViewingPartner}
                          className={cn(
                            "w-6 h-6 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors",
                            item.done ? "bg-habit-green border-habit-green" : "border-muted hover:border-primary",
                            isViewingPartner && "opacity-60"
                          )}
                        >
                          {item.done && <Check size={14} className="text-primary-foreground" />}
                        </button>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <p className={cn(
                            "text-[15px] tracking-body leading-tight",
                            item.done && "line-through",
                            isNow && !item.done && "text-sky-900 dark:text-sky-100",
                            item.kind === "event" || item.kind === "gcal" ? "font-medium" : "font-normal",
                          )}>
                            {item.title}
                          </p>
                          {/* Meta row */}
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            {timeDisplay && (
                              <span className="text-[11px] text-muted-foreground font-medium">{timeDisplay}</span>
                            )}
                            {isNow && (
                              <span className="text-[10px] font-bold text-sky-600 dark:text-sky-400 bg-sky-100 dark:bg-sky-900/50 px-1.5 py-0.5 rounded-full">
                                Now
                              </span>
                            )}
                            {/* Context tag */}
                            <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-full", tag.bg, tag.text)}>
                              {tag.label}
                            </span>
                            {item.kind === "gcal" && (
                              <span className="text-[10px] font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">Google</span>
                            )}
                          </div>
                        </div>

                        {/* Avatars for shared items */}
                        {avatars.length > 0 && (
                          <div className="flex -space-x-1.5 flex-shrink-0">
                            {avatars.map((init, i) => (
                              <div
                                key={i}
                                className={cn(
                                  "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-primary-foreground ring-2 ring-card",
                                  i === 0 ? "bg-user-a" : "bg-user-b"
                                )}
                              >
                                {init}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default HomeScheduledSection;
