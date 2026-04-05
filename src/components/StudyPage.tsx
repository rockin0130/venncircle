import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Clock, History, MoreHorizontal } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import PageGroupSelector from "@/components/PageGroupSelector";

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

interface StudyPageProps {
  onOpenMore?: () => void;
}

const SUBJECTS = ["Math", "Reading", "Work", "Other"];
const SUBJECT_COLORS: Record<string, string> = {
  Math: "#6C47FF",
  Reading: "#F59E0B",
  Work: "#10B981",
  Other: "#8B5CF6",
};

const DAILY_GOAL_HOURS = 4;

function fmtDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function fmtHours(seconds: number) {
  return (seconds / 3600).toFixed(1);
}

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function getWeekDays() {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7));
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push({
      label: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i],
      date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
      isFuture: d > today && d.toDateString() !== today.toDateString(),
      isToday: d.toDateString() === today.toDateString(),
    });
  }
  return days;
}

const StudyPage = ({ onOpenMore }: StudyPageProps) => {
  const { user, activeGroup, groups } = useAuth();
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [selectedSubject, setSelectedSubject] = useState("Other");
  const [activeTick, setActiveTick] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [groupSessions, setGroupSessions] = useState<StudySession[]>([]);
  const [memberProfiles, setMemberProfiles] = useState<Record<string, { display_name: string; avatar_url: string | null }>>({});

  const isPersonal = !activeGroup || (activeGroup as any)?._personal;
  const groupId = isPersonal ? null : activeGroup?.id || null;

  // Fetch sessions
  const fetchSessions = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("study_sessions")
      .select("*")
      .eq("user_id", user.id)
      .order("started_at", { ascending: false })
      .limit(100);
    if (data) setSessions(data as unknown as StudySession[]);
  }, [user]);

  // Fetch group sessions
  const fetchGroupSessions = useCallback(async () => {
    if (!groupId) { setGroupSessions([]); return; }
    const { data } = await supabase
      .from("study_sessions")
      .select("*")
      .eq("group_id", groupId)
      .order("started_at", { ascending: false })
      .limit(200);
    if (data) setGroupSessions(data as unknown as StudySession[]);
  }, [groupId]);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);
  useEffect(() => { fetchGroupSessions(); }, [fetchGroupSessions]);

  // Fetch member profiles for group view
  useEffect(() => {
    if (!activeGroup || isPersonal) return;
    const userIds = activeGroup.members.map(m => m.user_id);
    const profiles: Record<string, { display_name: string; avatar_url: string | null }> = {};
    activeGroup.members.forEach(m => {
      profiles[m.user_id] = { display_name: m.display_name || "Member", avatar_url: m.avatar_url };
    });
    setMemberProfiles(profiles);
  }, [activeGroup, isPersonal]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("study-sessions-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "study_sessions" }, () => {
        fetchSessions();
        fetchGroupSessions();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchSessions, fetchGroupSessions]);

  // Active session
  const activeSession = useMemo(() => sessions.find(s => s.is_active), [sessions]);

  // Tick timer for active session
  useEffect(() => {
    if (activeSession) {
      const update = () => {
        const elapsed = Math.floor((Date.now() - new Date(activeSession.started_at).getTime()) / 1000);
        setActiveTick(elapsed);
      };
      update();
      tickRef.current = setInterval(update, 1000);
      return () => { if (tickRef.current) clearInterval(tickRef.current); };
    } else {
      setActiveTick(0);
    }
  }, [activeSession]);

  // Today's sessions
  const today = todayStr();
  const todaySessions = useMemo(() =>
    sessions.filter(s => s.started_at.startsWith(today)),
    [sessions, today]
  );

  const todayTotal = useMemo(() => {
    return todaySessions.reduce((sum, s) => {
      if (s.is_active) return sum + activeTick;
      return sum + s.duration_seconds;
    }, 0);
  }, [todaySessions, activeTick]);

  // Streak
  const streak = useMemo(() => {
    const dates = new Set(sessions.filter(s => s.duration_seconds > 0 || s.is_active).map(s => s.started_at.slice(0, 10)));
    let count = 0;
    const d = new Date();
    while (true) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (dates.has(key)) { count++; d.setDate(d.getDate() - 1); }
      else if (count === 0 && key === today) { d.setDate(d.getDate() - 1); }
      else break;
    }
    return count;
  }, [sessions, today]);

  // Weekly data
  const weekDays = useMemo(() => getWeekDays(), []);
  const weeklyData = useMemo(() => {
    return weekDays.map(day => {
      const daySessions = sessions.filter(s => s.started_at.startsWith(day.date));
      const total = daySessions.reduce((sum, s) => {
        if (s.is_active && day.isToday) return sum + activeTick;
        return sum + s.duration_seconds;
      }, 0);
      return { ...day, seconds: total };
    });
  }, [weekDays, sessions, activeTick]);

  const weekTotal = useMemo(() => weeklyData.reduce((s, d) => s + d.seconds, 0), [weeklyData]);
  const maxBar = useMemo(() => Math.max(...weeklyData.map(d => d.seconds), 1), [weeklyData]);

  // Start/stop session
  const toggleSession = async () => {
    if (!user) return;
    if (activeSession) {
      const duration = Math.floor((Date.now() - new Date(activeSession.started_at).getTime()) / 1000);
      await supabase
        .from("study_sessions")
        .update({ is_active: false, ended_at: new Date().toISOString(), duration_seconds: duration } as any)
        .eq("id", activeSession.id);
      fetchSessions();
      fetchGroupSessions();
    } else {
      await supabase
        .from("study_sessions")
        .insert({ user_id: user.id, subject: selectedSubject, group_id: groupId, is_active: true, started_at: new Date().toISOString() } as any);
      fetchSessions();
      fetchGroupSessions();
    }
  };

  // Ring progress
  const progress = Math.min(todayTotal / (DAILY_GOAL_HOURS * 3600), 1);
  const ringR = 70;
  const circumference = 2 * Math.PI * ringR;
  const strokeDash = circumference * progress;

  // Group live data
  const groupLiveMembers = useMemo(() => {
    if (!groupId || !activeGroup) return [];
    return activeGroup.members.map(m => {
      const memberSessions = groupSessions.filter(s => s.user_id === m.user_id);
      const active = memberSessions.find(s => s.is_active);
      const todayMember = memberSessions.filter(s => s.started_at.startsWith(today));
      const todayTotalMember = todayMember.reduce((sum, s) => sum + (s.is_active ? Math.floor((Date.now() - new Date(s.started_at).getTime()) / 1000) : s.duration_seconds), 0);
      const lastSession = memberSessions.find(s => !s.is_active);
      return {
        ...m,
        profile: memberProfiles[m.user_id],
        active,
        todayTotal: todayTotalMember,
        lastSession,
      };
    });
  }, [groupId, activeGroup, groupSessions, today, memberProfiles]);

  return (
    <div className="flex flex-col min-h-full pb-4" style={{ background: "#F4F3F0" }}>
      {/* Header */}
      <div className="px-4 pt-6 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "#FAF5FF" }}>
            <Clock size={18} color="#6C47FF" />
          </div>
          <h1 className="text-xl font-bold text-foreground" style={{ fontFamily: "DM Sans, sans-serif" }}>Study</h1>
        </div>
        <div className="flex items-center gap-2">
          <button className="w-[30px] h-[30px] rounded-full flex items-center justify-center" style={{ background: "#F4F3F0", border: "0.5px solid rgba(0,0,0,0.07)" }}>
            <History size={15} color="#888" />
          </button>
          {onOpenMore && (
            <button onClick={onOpenMore} className="w-[30px] h-[30px] rounded-full flex items-center justify-center" style={{ background: "#F4F3F0", border: "0.5px solid rgba(0,0,0,0.07)" }}>
              <MoreHorizontal size={15} color="#888" />
            </button>
          )}
        </div>
      </div>

      {/* Group selector */}
      <div className="px-4 pb-2">
        <PageGroupSelector page="study" hideAllPill />
      </div>

      <div className="px-4 space-y-3">
        {/* Group Live Card */}
        {groupId && groupLiveMembers.some(m => m.active) && (
          <div className="rounded-2xl p-4" style={{ background: "#fff", border: "0.5px solid rgba(0,0,0,0.07)" }}>
            <h3 className="text-sm font-semibold text-foreground mb-3">🟢 Live now</h3>
            <div className="space-y-2">
              {groupLiveMembers.filter(m => m.active).map(m => (
                <div key={m.user_id} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-xs font-bold" style={{ color: "#6C47FF" }}>
                    {m.profile?.avatar_url ? <img src={m.profile.avatar_url} className="w-8 h-8 rounded-full object-cover" /> : (m.profile?.display_name || "?")[0]}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium">{m.profile?.display_name}</div>
                    <div className="text-xs text-muted-foreground">{m.active?.subject}</div>
                  </div>
                  <LiveTimer startedAt={m.active!.started_at} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Timer Card */}
        <div className="rounded-2xl p-6 flex flex-col items-center" style={{ background: activeSession ? "#FAF5FF" : "#fff", border: "0.5px solid rgba(0,0,0,0.07)" }}>
          {/* Ring */}
          <div className="relative w-[180px] h-[180px] flex items-center justify-center mb-4">
            <svg width="180" height="180" viewBox="0 0 180 180" className="absolute inset-0">
              {/* Background track */}
              <circle cx="90" cy="90" r={ringR} fill="none" stroke={activeSession ? "#EDE9FE" : "#F0EFF8"} strokeWidth="10" />
              {/* Dashed inner ring */}
              <circle cx="90" cy="90" r={ringR - 14} fill="none" stroke="#EEEDE8" strokeWidth="1" strokeDasharray="4 4" />
              {/* Progress arc */}
              <circle
                cx="90" cy="90" r={ringR} fill="none"
                stroke="#6C47FF" strokeWidth="10" strokeLinecap="round"
                strokeDasharray={`${strokeDash} ${circumference}`}
                transform="rotate(-90 90 90)"
                style={{ transition: "stroke-dasharray 0.5s ease" }}
              />
              {/* Dot marker when active */}
              {activeSession && progress > 0.01 && (
                <circle
                  cx={90 + ringR * Math.cos(2 * Math.PI * progress - Math.PI / 2)}
                  cy={90 + ringR * Math.sin(2 * Math.PI * progress - Math.PI / 2)}
                  r="6" fill="#6C47FF" stroke="#fff" strokeWidth="2"
                />
              )}
            </svg>
            {/* Center tap target */}
            <button
              onClick={toggleSession}
              className="relative z-10 w-[100px] h-[100px] rounded-full flex flex-col items-center justify-center cursor-pointer hover:scale-105 active:scale-95 transition-transform"
              style={{ minWidth: 80, minHeight: 80 }}
            >
              {activeSession ? (
                <>
                  <span className="text-[11px] font-medium" style={{ color: "#6C47FF" }}>Session</span>
                  <span className="text-2xl font-semibold tabular-nums" style={{ color: "#6C47FF" }}>
                    {fmtDuration(activeTick)}
                  </span>
                  <span className="text-[11px] font-medium" style={{ color: "#6C47FF" }}>
                    {fmtHours(todayTotal)} / {DAILY_GOAL_HOURS}h
                  </span>
                </>
              ) : (
                <>
                  <span className="text-[11px] font-medium text-muted-foreground">Today</span>
                  <span className="text-[28px] font-medium text-foreground tabular-nums">
                    {fmtDuration(todayTotal)}
                  </span>
                  <span className="text-[11px] font-medium" style={{ color: "#6C47FF" }}>
                    {fmtHours(todayTotal)} / {DAILY_GOAL_HOURS}h
                  </span>
                </>
              )}
            </button>
          </div>

          {/* Studying now badge */}
          {activeSession && (
            <div className="flex items-center gap-1.5 mb-3 px-3 py-1 rounded-full text-xs font-medium" style={{ background: "#ECFDF5", color: "#059669" }}>
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              Studying now · {activeSession.subject}
            </div>
          )}

          {/* Subject tags */}
          <div className="flex gap-2 flex-wrap justify-center">
            {SUBJECTS.map(sub => (
              <button
                key={sub}
                onClick={() => !activeSession && setSelectedSubject(sub)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  selectedSubject === sub
                    ? "text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                style={{
                  background: selectedSubject === sub ? "#6C47FF" : "#F4F3F0",
                  border: "0.5px solid rgba(0,0,0,0.07)",
                  opacity: activeSession ? 0.6 : 1,
                }}
              >
                {sub}
              </button>
            ))}
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl p-4" style={{ background: "#fff", border: "0.5px solid rgba(0,0,0,0.07)" }}>
            <div className="text-xs text-muted-foreground mb-1">🔥 Day streak</div>
            <div className="text-2xl font-bold text-foreground">{streak}</div>
            {streak > 0 && <div className="text-[10px] font-medium px-1.5 py-0.5 rounded-full inline-block mt-1" style={{ background: "#FEF3C7", color: "#92400E" }}>Personal best</div>}
          </div>
          <div className="rounded-2xl p-4" style={{ background: "#fff", border: "0.5px solid rgba(0,0,0,0.07)" }}>
            <div className="text-xs text-muted-foreground mb-1">📚 Sessions today</div>
            <div className="text-2xl font-bold text-foreground">{todaySessions.length}</div>
            <div className="text-[10px] font-medium px-1.5 py-0.5 rounded-full inline-block mt-1" style={{ background: "#EDE9FE", color: "#6C47FF" }}>
              {sessions.filter(s => weekDays.some(d => s.started_at.startsWith(d.date))).length} this week
            </div>
          </div>
        </div>

        {/* Group Today Summary */}
        {groupId && groupLiveMembers.length > 0 && (
          <div className="rounded-2xl p-4" style={{ background: "#fff", border: "0.5px solid rgba(0,0,0,0.07)" }}>
            <h3 className="text-sm font-semibold text-foreground mb-3">Group today</h3>
            <div className="space-y-2">
              {groupLiveMembers.map(m => (
                <div key={m.user_id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center text-[10px] font-bold" style={{ color: "#6C47FF" }}>
                      {m.profile?.avatar_url ? <img src={m.profile.avatar_url} className="w-6 h-6 rounded-full object-cover" /> : (m.profile?.display_name || "?")[0]}
                    </div>
                    <span className="text-sm" style={{ color: m.active ? "#1a1a1a" : "#999" }}>{m.profile?.display_name}</span>
                  </div>
                  <span className="text-sm font-medium" style={{ color: "#6C47FF" }}>{fmtHours(m.todayTotal)}h</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Today's Sessions */}
        <div className="rounded-2xl p-4" style={{ background: "#fff", border: "0.5px solid rgba(0,0,0,0.07)" }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground">Today's sessions</h3>
            <span className="text-xs text-muted-foreground">{todaySessions.length} sessions</span>
          </div>
          {todaySessions.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No sessions yet today. Tap the timer to start!</p>
          )}
          <div className="space-y-2">
            {todaySessions.map(s => (
              <div
                key={s.id}
                className="flex items-center gap-3 p-2.5 rounded-xl"
                style={{ background: s.is_active ? "#FAF5FF" : "transparent" }}
              >
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold" style={{ background: SUBJECT_COLORS[s.subject] || "#6C47FF" }}>
                  {s.subject[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium flex items-center gap-1.5">
                    {s.subject}
                    {s.is_active && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "#EDE9FE", color: "#6C47FF" }}>· live</span>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {fmtTime(s.started_at)}{s.ended_at ? ` – ${fmtTime(s.ended_at)}` : " – now"}
                  </div>
                </div>
                <span className="text-sm font-semibold" style={{ color: "#6C47FF" }}>
                  {s.is_active ? fmtDuration(activeTick) : fmtDuration(s.duration_seconds)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Weekly Chart */}
        <div className="rounded-2xl p-4" style={{ background: "#fff", border: "0.5px solid rgba(0,0,0,0.07)" }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground">This week</h3>
            <span className="text-xs text-muted-foreground">{fmtHours(weekTotal)} hours</span>
          </div>
          <div className="flex items-end justify-between gap-1.5 h-[100px]">
            {weeklyData.map((day, i) => {
              const h = day.seconds > 0 ? Math.max((day.seconds / maxBar) * 80, 6) : 4;
              const color = day.isFuture ? "#EEEDE8" : day.isToday ? "#1a1a1a" : "#6C47FF";
              return (
                <div key={i} className="flex flex-col items-center flex-1 gap-1">
                  <div className="w-full flex items-end justify-center" style={{ height: 80 }}>
                    <div className="w-full max-w-[28px] rounded-t-md transition-all" style={{ height: h, background: color }} />
                  </div>
                  <span className="text-[10px] text-muted-foreground font-medium">{day.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

// Small live timer component for group view
const LiveTimer = ({ startedAt }: { startedAt: string }) => {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const update = () => setElapsed(Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  return (
    <span className="text-sm font-semibold tabular-nums" style={{ color: "#6C47FF" }}>
      {fmtDuration(elapsed)}
    </span>
  );
};

export default StudyPage;
