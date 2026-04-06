import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Clock, ChevronLeft, MoreHorizontal, ChevronDown } from "lucide-react";
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
  created_at: string;
}

interface StudyLogPageProps {
  onBack: () => void;
  onOpenMore?: () => void;
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

function getLastWeekRange() {
  const { start } = getWeekRange();
  const lEnd = new Date(start);
  lEnd.setDate(lEnd.getDate() - 1);
  lEnd.setHours(23, 59, 59, 999);
  const lStart = new Date(lEnd);
  lStart.setDate(lEnd.getDate() - 6);
  lStart.setHours(0, 0, 0, 0);
  return { start: lStart, end: lEnd };
}

function getMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

function dateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDateLabel(d: Date) {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const PURPLE_SHADES = ["#6C47FF", "#8B6AFF", "#A78BFA", "#C4B5FD", "#DDD6FE", "#EDE9FE"];

const StudyLogPage = ({ onBack, onOpenMore }: StudyLogPageProps) => {
  const { user, activeGroup, groups } = useAuth();
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [contextFilter, setContextFilter] = useState<string>("personal");
  const [memberFilter, setMemberFilter] = useState<string>("me");
  const [timeRange, setTimeRange] = useState<"week" | "month" | "all" | "custom">("week");
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [prevTimeRange, setPrevTimeRange] = useState<"week" | "month" | "all">("week");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [subjectDropdownOpen, setSubjectDropdownOpen] = useState(false);
  const customPickerRef = useRef<HTMLDivElement>(null);
  const customPillRef = useRef<HTMLButtonElement>(null);

  const isPersonal = contextFilter === "personal";
  const selectedGroupId = isPersonal ? null : contextFilter;

  const groupOptions = useMemo(() => {
    return (groups || []).filter((g: any) => {
      if ((g as any)._personal) return false;
      const sharedPages: string[] = (g as any).shared_pages || [];
      return sharedPages.includes("study");
    }).map((g: any) => ({ id: g.id, name: g.name }));
  }, [groups]);

  const activeGroupObj = useMemo(() => {
    if (!selectedGroupId) return null;
    return (groups || []).find((g: any) => g.id === selectedGroupId) || null;
  }, [groups, selectedGroupId]);

  const memberProfiles = useMemo(() => {
    if (!activeGroupObj) return [];
    return (activeGroupObj as any).members || [];
  }, [activeGroupObj]);

  // Fetch sessions
  const fetchSessions = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    if (isPersonal) {
      const { data } = await supabase
        .from("study_sessions")
        .select("*")
        .eq("user_id", user.id)
        .order("started_at", { ascending: false })
        .limit(500);
      if (data) setSessions(data as unknown as StudySession[]);
    } else if (selectedGroupId) {
      if (memberFilter === "me") {
        const { data } = await supabase
          .from("study_sessions")
          .select("*")
          .eq("group_id", selectedGroupId)
          .eq("user_id", user.id)
          .order("started_at", { ascending: false })
          .limit(500);
        if (data) setSessions(data as unknown as StudySession[]);
      } else {
        const { data } = await supabase
          .from("study_sessions")
          .select("*")
          .eq("group_id", selectedGroupId)
          .eq("user_id", memberFilter)
          .order("started_at", { ascending: false })
          .limit(500);
        if (data) setSessions(data as unknown as StudySession[]);
      }
    }
    setLoading(false);
  }, [user, isPersonal, selectedGroupId, memberFilter]);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  // Time-filtered sessions
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

  // Stats
  const thisWeekSessions = useMemo(() => {
    const range = getWeekRange();
    return sessions.filter(s => !s.is_active && s.duration_seconds > 0 && new Date(s.started_at) >= range.start && new Date(s.started_at) <= range.end);
  }, [sessions]);

  const lastWeekSessions = useMemo(() => {
    const range = getLastWeekRange();
    return sessions.filter(s => !s.is_active && s.duration_seconds > 0 && new Date(s.started_at) >= range.start && new Date(s.started_at) <= range.end);
  }, [sessions]);

  const weekTotal = useMemo(() => thisWeekSessions.reduce((s, x) => s + x.duration_seconds, 0), [thisWeekSessions]);
  const lastWeekTotal = useMemo(() => lastWeekSessions.reduce((s, x) => s + x.duration_seconds, 0), [lastWeekSessions]);
  const weekChange = lastWeekTotal > 0 ? Math.round(((weekTotal - lastWeekTotal) / lastWeekTotal) * 100) : weekTotal > 0 ? 100 : 0;

  const avgSessionLength = useMemo(() => {
    if (thisWeekSessions.length === 0) return 0;
    return Math.round(thisWeekSessions.reduce((s, x) => s + x.duration_seconds, 0) / thisWeekSessions.length);
  }, [thisWeekSessions]);

  const topSubject = useMemo(() => {
    const map: Record<string, number> = {};
    thisWeekSessions.forEach(s => { map[s.subject] = (map[s.subject] || 0) + s.duration_seconds; });
    let best = { name: "—", hours: 0 };
    for (const [k, v] of Object.entries(map)) {
      if (v > best.hours) best = { name: k, hours: v };
    }
    return best;
  }, [thisWeekSessions]);

  // By subject data
  const subjectData = useMemo(() => {
    const map: Record<string, number> = {};
    filteredSessions.forEach(s => { map[s.subject] = (map[s.subject] || 0) + s.duration_seconds; });
    return Object.entries(map)
      .map(([name, seconds]) => ({ name, seconds }))
      .sort((a, b) => b.seconds - a.seconds);
  }, [filteredSessions]);

  const maxSubjectSeconds = useMemo(() => Math.max(...subjectData.map(s => s.seconds), 1), [subjectData]);

  // All unique subjects
  const allSubjects = useMemo(() => {
    const set = new Set(filteredSessions.map(s => s.subject));
    return Array.from(set).sort();
  }, [filteredSessions]);

  // Session history grouped by date
  const sessionHistory = useMemo(() => {
    let list = filteredSessions;
    if (subjectFilter !== "all") list = list.filter(s => s.subject === subjectFilter);
    const grouped: Record<string, StudySession[]> = {};
    list.forEach(s => {
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
  }, [filteredSessions, subjectFilter]);

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

  // Close custom picker on outside click
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
      <div className="px-4 pt-6 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "#F4F3F0", border: "0.5px solid rgba(0,0,0,0.07)" }}>
            <ChevronLeft size={18} color="#888" />
          </button>
          <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "#FAF5FF" }}>
            <Clock size={18} color="#6C47FF" />
          </div>
          <h1 className="text-xl font-bold text-foreground" style={{ fontFamily: "DM Sans, sans-serif" }}>Study Log</h1>
        </div>
        {onOpenMore && (
          <button onClick={onOpenMore} className="w-[30px] h-[30px] rounded-full flex items-center justify-center" style={{ background: "#F4F3F0", border: "0.5px solid rgba(0,0,0,0.07)" }}>
            <MoreHorizontal size={15} color="#888" />
          </button>
        )}
      </div>

      {/* Context toggle */}
      <div className="px-4 pb-2 flex gap-1.5 overflow-x-auto scrollbar-hide">
        <button
          onClick={() => { setContextFilter("personal"); setMemberFilter("me"); }}
          className="px-3 py-1.5 rounded-full text-xs font-semibold flex-shrink-0 transition-all"
          style={{ background: isPersonal ? "#1a1a1a" : "#fff", color: isPersonal ? "#fff" : "#888", border: "0.5px solid rgba(0,0,0,0.07)" }}
        >
          Personal
        </button>
        {groupOptions.map(g => (
          <button
            key={g.id}
            onClick={() => { setContextFilter(g.id); setMemberFilter("me"); }}
            className="px-3 py-1.5 rounded-full text-xs font-semibold flex-shrink-0 transition-all"
            style={{ background: contextFilter === g.id ? "#1a1a1a" : "#fff", color: contextFilter === g.id ? "#fff" : "#888", border: "0.5px solid rgba(0,0,0,0.07)" }}
          >
            {g.name}
          </button>
        ))}
      </div>

      {/* Member pills (group view) */}
      {!isPersonal && memberProfiles.length > 0 && (
        <div className="px-4 pb-2 flex gap-1.5 overflow-x-auto scrollbar-hide">
          <button
            onClick={() => setMemberFilter("me")}
            className="px-3 py-1 rounded-full text-xs font-medium flex-shrink-0 transition-all"
            style={{ background: memberFilter === "me" ? "#6C47FF" : "#fff", color: memberFilter === "me" ? "#fff" : "#888", border: "0.5px solid rgba(0,0,0,0.07)" }}
          >
            Me
          </button>
          {memberProfiles.filter((m: any) => m.user_id !== user?.id).map((m: any) => (
            <button
              key={m.user_id}
              onClick={() => setMemberFilter(m.user_id)}
              className="px-3 py-1 rounded-full text-xs font-medium flex-shrink-0 transition-all"
              style={{ background: memberFilter === m.user_id ? "#6C47FF" : "#fff", color: memberFilter === m.user_id ? "#fff" : "#888", border: "0.5px solid rgba(0,0,0,0.07)" }}
            >
              {m.display_name || "Member"}
            </button>
          ))}
        </div>
      )}

      <div className="px-4 space-y-3">
        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-2xl p-3" style={{ background: "#fff", border: "0.5px solid rgba(0,0,0,0.07)" }}>
            <div className="text-[10px] text-muted-foreground mb-1">This week</div>
            <div className="text-lg font-bold text-foreground">{fmtHours(weekTotal)}h</div>
            <div className="text-[10px] font-medium mt-0.5" style={{ color: weekChange >= 0 ? "#6C47FF" : "#EF4444" }}>
              {weekChange >= 0 ? "↑" : "↓"} {Math.abs(weekChange)}%
            </div>
          </div>
          <div className="rounded-2xl p-3" style={{ background: "#fff", border: "0.5px solid rgba(0,0,0,0.07)" }}>
            <div className="text-[10px] text-muted-foreground mb-1">Sessions</div>
            <div className="text-lg font-bold text-foreground">{thisWeekSessions.length}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              avg {fmtDuration(avgSessionLength)}
            </div>
          </div>
          <div className="rounded-2xl p-3" style={{ background: "#fff", border: "0.5px solid rgba(0,0,0,0.07)" }}>
            <div className="text-[10px] text-muted-foreground mb-1">Top subject</div>
            <div className="text-sm font-bold text-foreground truncate">{topSubject.name}</div>
            <div className="text-[10px] font-medium mt-0.5" style={{ color: "#6C47FF" }}>
              {fmtHours(topSubject.hours)}h
            </div>
          </div>
        </div>

        {/* By subject */}
        <div className="rounded-2xl p-4 relative" style={{ background: "#fff", border: "0.5px solid rgba(0,0,0,0.07)" }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "DM Sans, sans-serif" }}>By subject</h3>
            <div className="flex gap-0.5 p-0.5 rounded-lg" style={{ background: "#F4F3F0" }}>
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
                  className="px-2 py-1 rounded-md text-[10px] font-medium transition-all capitalize"
                  style={{
                    background: (timeRange === r || (r === "custom" && showCustomPicker)) ? "#fff" : "transparent",
                    color: (timeRange === r || (r === "custom" && showCustomPicker)) ? "#1a1a1a" : "#888",
                  }}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Floating custom calendar picker */}
          {showCustomPicker && (
            <div
              ref={customPickerRef}
              className="absolute right-4 z-50 p-3"
              style={{
                top: 48,
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
                <button
                  onClick={handleCustomCancel}
                  className="px-2.5 py-1 text-[11px] rounded-lg font-medium" style={{ color: "#888" }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleCustomApply}
                  className="px-2.5 py-1 text-[11px] rounded-lg font-medium text-white" style={{ background: "#6C47FF" }}
                >
                  Apply
                </button>
              </div>
            </div>
          )}

          {/* Custom range label */}
          {timeRange === "custom" && customRange?.from && !showCustomPicker && (
            <div className="text-[10px] text-muted-foreground mb-2">
              {fmtDateLabel(customRange.from)} – {customRange.to ? fmtDateLabel(customRange.to) : fmtDateLabel(customRange.from)}
            </div>
          )}

          {/* Bars */}
          {subjectData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No sessions in this period</p>
          ) : (
            <div className="space-y-2.5">
              {subjectData.map((s, i) => (
                <div key={s.name}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-foreground">{s.name}</span>
                    <span className="text-xs font-medium" style={{ color: "#6C47FF" }}>{fmtHours(s.seconds)}h</span>
                  </div>
                  <div className="w-full h-3 rounded-full" style={{ background: "#F4F3F0" }}>
                    <div
                      className="h-3 rounded-full transition-all"
                      style={{
                        width: `${Math.max((s.seconds / maxSubjectSeconds) * 100, 3)}%`,
                        background: PURPLE_SHADES[i % PURPLE_SHADES.length],
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Session history */}
        <div className="rounded-2xl p-4" style={{ background: "#fff", border: "0.5px solid rgba(0,0,0,0.07)" }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "DM Sans, sans-serif" }}>Session history</h3>
            <div className="relative">
              <button
                onClick={() => setSubjectDropdownOpen(!subjectDropdownOpen)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
                style={{ background: "#F4F3F0", border: "0.5px solid rgba(0,0,0,0.07)" }}
              >
                {subjectFilter === "all" ? "All subjects" : subjectFilter}
                <ChevronDown size={12} />
              </button>
              {subjectDropdownOpen && (
                <div className="absolute right-0 top-full mt-1 z-50 rounded-xl py-1 shadow-lg min-w-[140px]" style={{ background: "#fff", border: "0.5px solid rgba(0,0,0,0.1)" }}>
                  <button
                    onClick={() => { setSubjectFilter("all"); setSubjectDropdownOpen(false); }}
                    className="block w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50"
                    style={{ fontWeight: subjectFilter === "all" ? 600 : 400, color: subjectFilter === "all" ? "#6C47FF" : "#555" }}
                  >
                    All subjects
                  </button>
                  {allSubjects.map(s => (
                    <button
                      key={s}
                      onClick={() => { setSubjectFilter(s); setSubjectDropdownOpen(false); }}
                      className="block w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50"
                      style={{ fontWeight: subjectFilter === s ? 600 : 400, color: subjectFilter === s ? "#6C47FF" : "#555" }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {sessionHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No sessions found</p>
          ) : (
            <div className="space-y-4">
              {sessionHistory.map(group => (
                <div key={group.date}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-foreground">{group.dateLabel}</span>
                    <span className="text-xs font-medium" style={{ color: "#6C47FF" }}>{fmtHours(group.totalSeconds)}h</span>
                  </div>
                  <div className="space-y-1">
                    {group.sessions.map(s => (
                      <div key={s.id} className="flex items-center gap-3 p-2.5 rounded-xl" style={{ background: "#FAFAF8" }}>
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
    </div>
  );
};

export default StudyLogPage;
