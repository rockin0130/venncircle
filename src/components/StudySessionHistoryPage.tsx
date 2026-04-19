import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { ChevronLeft, Clock, MoreHorizontal } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Calendar } from "@/components/ui/calendar";
import type { DateRange } from "react-day-picker";

interface StudySession {
  id: string;
  user_id: string;
  group_id: string | null;
  subject: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
  is_active: boolean;
}

interface Props {
  onBack: () => void;
  onOpenMore?: () => void;
  contextFilter: string;
  memberFilter: string;
}

function fmtDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function fmtHours(seconds: number) {
  return (seconds / 3600).toFixed(1);
}

function getWeekRange() {
  const now = new Date();
  const day = now.getDay();
  const mon = new Date(now);
  mon.setDate(now.getDate() - ((day + 6) % 7));
  mon.setHours(0, 0, 0, 0);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  sun.setHours(23, 59, 59, 999);
  return { start: mon, end: sun };
}

function getMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

function fmtDateLabel(d: Date) {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const StudySessionHistoryPage = ({ onBack, onOpenMore, contextFilter, memberFilter }: Props) => {
  const { user, groups } = useAuth();
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<"week" | "month" | "all" | "custom">("week");
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [prevTimeRange, setPrevTimeRange] = useState<"week" | "month" | "all">("week");
  const customPickerRef = useRef<HTMLDivElement>(null);
  const customPillRef = useRef<HTMLButtonElement>(null);

  const isPersonal = contextFilter === "personal";
  const selectedGroupId = isPersonal ? null : contextFilter;

  const fetchSessions = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    if (isPersonal) {
      const { data } = await supabase
        .from("study_sessions")
        .select("*")
        .eq("user_id", user.id)
        .order("started_at", { ascending: false })
        .limit(1000);
      if (data) setSessions(data as unknown as StudySession[]);
    } else if (selectedGroupId) {
      const uid = memberFilter === "me" ? user.id : memberFilter;
      const { data } = await supabase
        .from("study_sessions")
        .select("*")
        .eq("group_id", selectedGroupId)
        .eq("user_id", uid)
        .order("started_at", { ascending: false })
        .limit(1000);
      if (data) setSessions(data as unknown as StudySession[]);
    }
    setLoading(false);
  }, [user, isPersonal, selectedGroupId, memberFilter]);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  const filteredSessions = useMemo(() => {
    const completed = sessions.filter(s => !s.is_active && s.duration_seconds > 0);
    if (timeRange === "all") return completed;
    let range: { start: Date; end: Date };
    if (timeRange === "week") range = getWeekRange();
    else if (timeRange === "month") range = getMonthRange();
    else if (timeRange === "custom" && customRange?.from) {
      range = { start: customRange.from, end: customRange.to || customRange.from };
      range.end = new Date(range.end);
      range.end.setHours(23, 59, 59, 999);
    } else return completed;
    return completed.filter(s => {
      const d = new Date(s.started_at);
      return d >= range.start && d <= range.end;
    });
  }, [sessions, timeRange, customRange]);

  const totalHours = useMemo(() => filteredSessions.reduce((s, x) => s + x.duration_seconds, 0), [filteredSessions]);

  const sessionHistory = useMemo(() => {
    const grouped: Record<string, StudySession[]> = {};
    filteredSessions.forEach(s => {
      const date = s.started_at.slice(0, 10);
      if (!grouped[date]) grouped[date] = [];
      grouped[date].push(s);
    });
    return Object.entries(grouped)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, sessions]) => ({
        date,
        dateLabel: new Date(date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }),
        sessions: sessions.sort((a, b) => b.started_at.localeCompare(a.started_at)),
        totalSeconds: sessions.reduce((s, x) => s + x.duration_seconds, 0),
      }));
  }, [filteredSessions]);

  const groupNameMap = useMemo(() => {
    const m: Record<string, string> = {};
    (groups || []).forEach((g: any) => { if (!(g as any)._personal) m[g.id] = g.name; });
    return m;
  }, [groups]);

  const handleCustomApply = () => {
    if (customRange?.from) {
      setTimeRange("custom");
      setShowCustomPicker(false);
    }
  };

  const handleCustomCancel = () => {
    setShowCustomPicker(false);
    setCustomRange(undefined);
    if (timeRange === "custom") setTimeRange(prevTimeRange);
  };

  useEffect(() => {
    if (!showCustomPicker) return;
    const handler = (e: MouseEvent) => {
      if (
        customPickerRef.current && !customPickerRef.current.contains(e.target as Node) &&
        customPillRef.current && !customPillRef.current.contains(e.target as Node)
      ) {
        handleCustomCancel();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showCustomPicker, prevTimeRange, timeRange]);

  return (
    <div className="flex flex-col min-h-full pb-4" style={{ background: "#F4F3F0" }}>
      {/* Header */}
      <div className="px-4 safe-area-top pt-3 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "#F4F3F0", border: "0.5px solid rgba(0,0,0,0.07)" }}>
            <ChevronLeft size={18} color="#888" />
          </button>
          <h1 className="text-xl font-bold text-foreground" style={{ fontFamily: "DM Sans, sans-serif" }}>Session History</h1>
        </div>
        {onOpenMore && (
          <button onClick={onOpenMore} className="w-[30px] h-[30px] rounded-full flex items-center justify-center" style={{ background: "#F4F3F0", border: "0.5px solid rgba(0,0,0,0.07)" }}>
            <MoreHorizontal size={15} color="#888" />
          </button>
        )}
      </div>

      <div className="px-4 space-y-3">
        {/* Time range selector */}
        <div className="relative">
          <div className="flex gap-0.5 p-0.5 rounded-lg w-fit" style={{ background: "#F4F3F0" }}>
            {(["week", "month", "all", "custom"] as const).map(r => (
              <button
                key={r}
                ref={r === "custom" ? customPillRef : undefined}
                onClick={() => {
                  if (r === "custom") {
                    if (!showCustomPicker && timeRange !== "custom") setPrevTimeRange(timeRange as "week" | "month" | "all");
                    setShowCustomPicker(!showCustomPicker);
                  } else {
                    setTimeRange(r);
                    setShowCustomPicker(false);
                    setCustomRange(undefined);
                  }
                }}
                className="px-3 py-1.5 rounded-md text-[11px] font-medium transition-all capitalize"
                style={{
                  background: (timeRange === r || (r === "custom" && showCustomPicker)) ? "#fff" : "transparent",
                  color: (timeRange === r || (r === "custom" && showCustomPicker)) ? "#1a1a1a" : "#888",
                }}
              >
                {r}
              </button>
            ))}
          </div>

          {/* Floating custom picker */}
          {showCustomPicker && (
            <div
              ref={customPickerRef}
              className="absolute right-0 z-50 p-3 mt-2"
              style={{
                maxWidth: 260,
                background: "#fff",
                borderRadius: 14,
                boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
                border: "0.5px solid rgba(0,0,0,0.08)",
              }}
            >
              <Calendar
                mode="range"
                selected={customRange}
                onSelect={setCustomRange}
                className="p-0 pointer-events-auto"
                classNames={{
                  months: "flex flex-col",
                  month: "space-y-1",
                  caption: "flex justify-center pt-0.5 relative items-center",
                  caption_label: "text-[11px] font-medium",
                  nav_button: "h-5 w-5 bg-transparent p-0 opacity-50 hover:opacity-100 inline-flex items-center justify-center",
                  nav_button_previous: "absolute left-0",
                  nav_button_next: "absolute right-0",
                  table: "w-full border-collapse",
                  head_row: "flex",
                  head_cell: "text-muted-foreground rounded-md w-8 font-normal text-[9px]",
                  row: "flex w-full mt-0.5",
                  cell: "h-7 w-8 text-center text-[11px] p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
                  day: "h-7 w-8 p-0 font-normal text-[11px] aria-selected:opacity-100 inline-flex items-center justify-center rounded-md hover:bg-accent",
                  day_selected: "bg-[#6C47FF] text-white hover:bg-[#6C47FF] focus:bg-[#6C47FF]",
                  day_range_middle: "bg-[#EDE9FE] text-[#6C47FF]",
                  day_today: "bg-accent text-accent-foreground",
                  day_outside: "text-muted-foreground opacity-50",
                  day_disabled: "text-muted-foreground opacity-50",
                  day_hidden: "invisible",
                }}
              />
              <div className="flex gap-2 justify-end mt-2">
                <button onClick={handleCustomCancel} className="px-2.5 py-1 text-[11px] rounded-lg font-medium" style={{ color: "#888" }}>Cancel</button>
                <button onClick={handleCustomApply} className="px-2.5 py-1 text-[11px] rounded-lg font-medium text-white" style={{ background: "#6C47FF" }}>Apply</button>
              </div>
            </div>
          )}

          {/* Custom range label */}
          {timeRange === "custom" && customRange?.from && !showCustomPicker && (
            <div className="text-[10px] text-muted-foreground mt-1.5">
              {fmtDateLabel(customRange.from)} – {customRange.to ? fmtDateLabel(customRange.to) : fmtDateLabel(customRange.from)}
            </div>
          )}
        </div>

        {/* Summary strip */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-2xl p-3" style={{ background: "#fff", border: "0.5px solid rgba(0,0,0,0.07)" }}>
            <div className="text-[10px] text-muted-foreground mb-0.5">Total hours</div>
            <div className="text-lg font-bold text-foreground">{fmtHours(totalHours)}h</div>
          </div>
          <div className="rounded-2xl p-3" style={{ background: "#fff", border: "0.5px solid rgba(0,0,0,0.07)" }}>
            <div className="text-[10px] text-muted-foreground mb-0.5">Sessions</div>
            <div className="text-lg font-bold text-foreground">{filteredSessions.length}</div>
          </div>
        </div>

        {/* Session list */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-5 h-5 border-2 border-[#6C47FF] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : sessionHistory.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-12">No sessions in this period</p>
        ) : (
          <div className="space-y-4">
            {sessionHistory.map(group => (
              <div key={group.date}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-foreground">{group.dateLabel}</span>
                  <span className="text-xs" style={{ color: "#6C47FF", fontWeight: 500 }}>{fmtHours(group.totalSeconds)}h</span>
                </div>
                <div className="space-y-1">
                  {group.sessions.map(s => (
                    <div key={s.id} className="flex items-center gap-3 p-2.5 rounded-xl" style={{ background: "#fff", border: "0.5px solid rgba(0,0,0,0.04)" }}>
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "#6C47FF" }}>
                        <Clock size={13} color="#fff" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-foreground">{s.subject}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {fmtTime(s.started_at)}{s.ended_at ? ` – ${fmtTime(s.ended_at)}` : ""}
                          {s.group_id && groupNameMap[s.group_id] && (
                            <span> · {groupNameMap[s.group_id]}</span>
                          )}
                        </div>
                      </div>
                      <span className="text-sm font-medium" style={{ color: "#6C47FF" }}>
                        {fmtDuration(s.duration_seconds)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default StudySessionHistoryPage;
