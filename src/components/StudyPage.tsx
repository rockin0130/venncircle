import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Clock, MoreHorizontal, ChevronDown, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import PageGroupSelector from "@/components/PageGroupSelector";
import StudyFullscreenTimer from "@/components/StudyFullscreenTimer";
import StudyLogPage from "@/components/StudyLogPage";

// ═══ Types ═══
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

// ═══ Constants ═══
const DEFAULT_SUBJECTS = ["Math", "Reading", "Work"];
const DAILY_GOAL_HOURS = 4;
const MEMBER_COLORS = ["#6C47FF", "#F59E0B", "#10B981", "#EF4444", "#3B82F6", "#EC4899", "#14B8A6", "#8B5CF6"];

// ═══ Subject similarity ═══
const ABBREVIATION_MAP: Record<string, string> = {
  math: "math", mathematics: "math", maths: "math",
  sci: "science", science: "science",
  eng: "english", english: "english",
  hist: "history", history: "history",
  bio: "biology", biology: "biology",
  chem: "chemistry", chemistry: "chemistry",
  phys: "physics", physics: "physics",
  geo: "geography", geography: "geography",
  lit: "literature", literature: "literature",
  econ: "economics", economics: "economics",
  cs: "computer science", "computer science": "computer science", "comp sci": "computer science",
  pe: "physical education", "physical education": "physical education",
  psych: "psychology", psychology: "psychology",
};

function normalizeSubject(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function getCanonicalKey(name: string): string | null {
  const norm = normalizeSubject(name);
  return ABBREVIATION_MAP[norm] || null;
}

type MatchResult = { type: "exact"; existing: string } | { type: "similar"; existing: string } | { type: "none" };

function findSubjectMatch(newName: string, existingSubjects: string[], allSessionSubjects: string[]): MatchResult {
  const norm = normalizeSubject(newName);
  const allKnown = [...new Set([...existingSubjects, ...allSessionSubjects])];

  // Exact case-insensitive match
  for (const ex of allKnown) {
    if (normalizeSubject(ex) === norm) return { type: "exact", existing: ex };
  }

  // Abbreviation match
  const newKey = getCanonicalKey(newName);
  if (newKey) {
    for (const ex of allKnown) {
      const exKey = getCanonicalKey(ex);
      if (exKey && exKey === newKey) return { type: "exact", existing: ex };
    }
  }

  // Plural/singular
  const withoutS = norm.endsWith("s") ? norm.slice(0, -1) : norm + "s";
  for (const ex of allKnown) {
    const exNorm = normalizeSubject(ex);
    if (exNorm === withoutS) return { type: "similar", existing: ex };
  }

  // Levenshtein-like prefix check
  for (const ex of allKnown) {
    const exNorm = normalizeSubject(ex);
    if (norm.length >= 3 && exNorm.startsWith(norm)) return { type: "similar", existing: ex };
    if (exNorm.length >= 3 && norm.startsWith(exNorm)) return { type: "similar", existing: ex };
  }

  return { type: "none" };
}

function getSubjects(): string[] {
  try {
    const raw = localStorage.getItem("study_subjects");
    if (raw) return JSON.parse(raw);
  } catch {}
  return DEFAULT_SUBJECTS;
}

function saveSubjects(subs: string[]) {
  localStorage.setItem("study_subjects", JSON.stringify(subs));
}

// ═══ Helpers ═══
function fmtDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function fmtTimer(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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
      label: ["M", "T", "W", "T", "F", "S", "S"][i],
      date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
      isFuture: d > today && d.toDateString() !== today.toDateString(),
      isToday: d.toDateString() === today.toDateString(),
    });
  }
  return days;
}

function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return "Yesterday";
}

// ═══ LiveTimer ═══
const LiveTimer = ({ startedAt }: { startedAt: string }) => {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const update = () => setElapsed(Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  return (
    <span className="tabular-nums" style={{ fontSize: 13, fontWeight: 500, color: "#6C47FF" }}>
      {fmtTimer(elapsed)}
    </span>
  );
};

// ═══ Main Component ═══
const StudyPage = ({ onOpenMore }: StudyPageProps) => {
  const { user, activeGroup, groups } = useAuth();
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [groupSessions, setGroupSessions] = useState<StudySession[]>([]);
  const [memberProfiles, setMemberProfiles] = useState<Record<string, { display_name: string; avatar_url: string | null }>>({});
  const [subjects, setSubjects] = useState<string[]>(getSubjects);
  const [selectedSubject, setSelectedSubject] = useState(() => getSubjects()[0] || "Other");
  const [addingSubject, setAddingSubject] = useState(false);
  const [newSubjectText, setNewSubjectText] = useState("");
  const [activeTick, setActiveTick] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [chartFilter, setChartFilter] = useState("mine");
  const [chartDropdownOpen, setChartDropdownOpen] = useState(false);
  const [sessionsFilter, setSessionsFilter] = useState("mine");
  const [editMode, setEditMode] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [similarityPrompt, setSimilarityPrompt] = useState<{ newName: string; existing: string } | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const addInputRef = useRef<HTMLInputElement>(null);
  const pillsRef = useRef<HTMLDivElement>(null);

  const isPersonal = !activeGroup || (activeGroup as any)?._personal;
  const groupId = isPersonal ? null : activeGroup?.id || null;

  // All subjects ever used in sessions (for similarity matching)
  const allSessionSubjects = useMemo(() => {
    const set = new Set(sessions.map(s => s.subject));
    return Array.from(set);
  }, [sessions]);

  // ── Fetch ──
  const fetchSessions = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("study_sessions")
      .select("*")
      .eq("user_id", user.id)
      .order("started_at", { ascending: false })
      .limit(200);
    if (data) setSessions(data as unknown as StudySession[]);
  }, [user]);

  const fetchGroupSessions = useCallback(async () => {
    if (!groupId) { setGroupSessions([]); return; }
    const { data } = await supabase
      .from("study_sessions")
      .select("*")
      .eq("group_id", groupId)
      .order("started_at", { ascending: false })
      .limit(300);
    if (data) setGroupSessions(data as unknown as StudySession[]);
  }, [groupId]);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);
  useEffect(() => { fetchGroupSessions(); }, [fetchGroupSessions]);

  // ── Profiles ──
  useEffect(() => {
    if (!activeGroup || isPersonal) return;
    const profiles: Record<string, { display_name: string; avatar_url: string | null }> = {};
    activeGroup.members.forEach((m: any) => {
      profiles[m.user_id] = { display_name: m.display_name || "Member", avatar_url: m.avatar_url };
    });
    setMemberProfiles(profiles);
  }, [activeGroup, isPersonal]);

  // ── Realtime ──
  useEffect(() => {
    const channel = supabase
      .channel("study-sessions-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "study_sessions" }, () => {
        fetchSessions();
        fetchGroupSessions();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchSessions, fetchGroupSessions]);

  // ── Active session ──
  const activeSession = useMemo(() => sessions.find(s => s.is_active), [sessions]);

  useEffect(() => {
    if (activeSession) {
      const update = () => setActiveTick(Math.floor((Date.now() - new Date(activeSession.started_at).getTime()) / 1000));
      update();
      tickRef.current = setInterval(update, 1000);
      return () => { if (tickRef.current) clearInterval(tickRef.current); };
    } else {
      setActiveTick(0);
    }
  }, [activeSession]);

  // ── Click outside to exit edit mode ──
  useEffect(() => {
    if (!editMode) return;
    const handler = (e: MouseEvent) => {
      if (pillsRef.current && !pillsRef.current.contains(e.target as Node)) {
        setEditMode(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [editMode]);

  // ── Derived ──
  const today = todayStr();
  const weekDays = useMemo(() => getWeekDays(), []);

  const todaySessions = useMemo(() => sessions.filter(s => s.started_at.startsWith(today)), [sessions, today]);

  const todayTotal = useMemo(() => {
    return todaySessions.reduce((sum, s) => {
      if (s.is_active) return sum + activeTick;
      return sum + s.duration_seconds;
    }, 0);
  }, [todaySessions, activeTick]);

  // Streak
  const { streak, bestStreak } = useMemo(() => {
    const dates = new Set(sessions.filter(s => s.duration_seconds > 0 || s.is_active).map(s => s.started_at.slice(0, 10)));
    let current = 0;
    let best = 0;
    const d2 = new Date();
    while (true) {
      const key = `${d2.getFullYear()}-${String(d2.getMonth() + 1).padStart(2, "0")}-${String(d2.getDate()).padStart(2, "0")}`;
      if (dates.has(key)) { current++; d2.setDate(d2.getDate() - 1); }
      else if (current === 0 && key === today) { d2.setDate(d2.getDate() - 1); }
      else break;
    }
    const sortedDates = Array.from(dates).sort();
    let run = 0;
    for (let i = 0; i < sortedDates.length; i++) {
      if (i === 0) { run = 1; }
      else {
        const prev = new Date(sortedDates[i - 1]);
        const curr = new Date(sortedDates[i]);
        prev.setDate(prev.getDate() + 1);
        run = prev.toISOString().slice(0, 10) === curr.toISOString().slice(0, 10) ? run + 1 : 1;
      }
      best = Math.max(best, run);
    }
    return { streak: current, bestStreak: best };
  }, [sessions, today]);

  // Weekly data
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
  const maxBar = useMemo(() => Math.max(...weeklyData.map(d => d.seconds), 3600), [weeklyData]);

  // Group members enriched
  const groupMembers = useMemo(() => {
    if (!groupId || !activeGroup) return [];
    return activeGroup.members.map((m: any, idx: number) => {
      const memberSessions = groupSessions.filter(s => s.user_id === m.user_id);
      const active = memberSessions.find(s => s.is_active);
      const todayMember = memberSessions.filter(s => s.started_at.startsWith(today));
      const todayTotalMember = todayMember.reduce((sum, s) =>
        sum + (s.is_active ? Math.floor((Date.now() - new Date(s.started_at).getTime()) / 1000) : s.duration_seconds), 0);
      const lastSession = memberSessions.find(s => !s.is_active);
      return {
        ...m,
        profile: memberProfiles[m.user_id],
        color: MEMBER_COLORS[idx % MEMBER_COLORS.length],
        active,
        todayTotal: todayTotalMember,
        todaySessions: todayMember,
        lastSession,
        isMe: m.user_id === user?.id,
      };
    });
  }, [groupId, activeGroup, groupSessions, today, memberProfiles, user]);

  // ── Actions ──
  const toggleSession = async () => {
    if (!user) return;
    if (activeSession) {
      const duration = Math.floor((Date.now() - new Date(activeSession.started_at).getTime()) / 1000);
      await supabase
        .from("study_sessions")
        .update({ is_active: false, ended_at: new Date().toISOString(), duration_seconds: duration } as any)
        .eq("id", activeSession.id);
      setFullscreen(false);
      fetchSessions();
      fetchGroupSessions();
    } else {
      // Save to group AND personal (dual-write for group context)
      if (groupId) {
        // Insert group session
        await supabase
          .from("study_sessions")
          .insert({ user_id: user.id, subject: selectedSubject, group_id: groupId, is_active: true, started_at: new Date().toISOString() } as any);
      } else {
        // Personal only
        await supabase
          .from("study_sessions")
          .insert({ user_id: user.id, subject: selectedSubject, group_id: null, is_active: true, started_at: new Date().toISOString() } as any);
      }
      setFullscreen(true);
      fetchSessions();
      fetchGroupSessions();
    }
  };

  const removeSubject = (sub: string) => {
    const updated = subjects.filter(s => s !== sub);
    setSubjects(updated);
    saveSubjects(updated);
    if (selectedSubject === sub) {
      setSelectedSubject(updated[0] || "Other");
    }
    if (updated.length === 0) setEditMode(false);
  };

  const addSubject = () => {
    const trimmed = newSubjectText.trim();
    if (!trimmed) {
      setNewSubjectText("");
      setAddingSubject(false);
      return;
    }

    const match = findSubjectMatch(trimmed, subjects, allSessionSubjects);

    if (match.type === "exact") {
      // Silently map to existing
      if (!subjects.includes(match.existing)) {
        const updated = [...subjects, match.existing];
        setSubjects(updated);
        saveSubjects(updated);
      }
      setSelectedSubject(match.existing);
      setNewSubjectText("");
      setAddingSubject(false);
    } else if (match.type === "similar") {
      // Show prompt
      setSimilarityPrompt({ newName: trimmed, existing: match.existing });
      setNewSubjectText("");
      setAddingSubject(false);
    } else {
      // Create new
      if (!subjects.includes(trimmed)) {
        const updated = [...subjects, trimmed];
        setSubjects(updated);
        saveSubjects(updated);
      }
      setSelectedSubject(trimmed);
      setNewSubjectText("");
      setAddingSubject(false);
    }
  };

  const handleSimilarityResponse = (isSame: boolean) => {
    if (!similarityPrompt) return;
    if (isSame) {
      // Merge — use existing
      if (!subjects.includes(similarityPrompt.existing)) {
        const updated = [...subjects, similarityPrompt.existing];
        setSubjects(updated);
        saveSubjects(updated);
      }
      setSelectedSubject(similarityPrompt.existing);
    } else {
      // Keep separate
      if (!subjects.includes(similarityPrompt.newName)) {
        const updated = [...subjects, similarityPrompt.newName];
        setSubjects(updated);
        saveSubjects(updated);
      }
      setSelectedSubject(similarityPrompt.newName);
    }
    setSimilarityPrompt(null);
  };

  // Long press handler
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handlePillPointerDown = () => {
    if (activeSession) return;
    longPressTimer.current = setTimeout(() => setEditMode(true), 500);
  };
  const handlePillPointerUp = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };

  // ── Ring ──
  const progress = Math.min(todayTotal / (DAILY_GOAL_HOURS * 3600), 1);
  const SIZE = 130;
  const STROKE = 9;
  const R = (SIZE - STROKE) / 2;
  const C = 2 * Math.PI * R;
  const offset = C - C * progress;
  const angle = 2 * Math.PI * progress - Math.PI / 2;
  const dotCx = SIZE / 2 + R * Math.cos(angle);
  const dotCy = SIZE / 2 + R * Math.sin(angle);

  // ── Chart filter options ──
  const chartOptions = useMemo(() => {
    if (isPersonal) {
      const opts: { key: string; label: string }[] = [{ key: "mine", label: "Mine" }];
      (groups || []).forEach((g: any) => {
        if (!(g as any)._personal) opts.push({ key: g.id, label: g.name });
      });
      opts.push({ key: "together", label: "Together" });
      return opts;
    } else {
      const opts: { key: string; label: string }[] = [{ key: "mine", label: "Mine" }];
      (activeGroup?.members || []).forEach((m: any) => {
        if (m.user_id !== user?.id) opts.push({ key: m.user_id, label: memberProfiles[m.user_id]?.display_name || "Member" });
      });
      opts.push({ key: "together", label: "Together" });
      return opts;
    }
  }, [isPersonal, groups, activeGroup, user, memberProfiles]);

  // Group name lookup
  const groupNameMap = useMemo(() => {
    const m: Record<string, string> = {};
    (groups || []).forEach((g: any) => { if (!(g as any)._personal) m[g.id] = g.name; });
    return m;
  }, [groups]);

  // Sessions filter options (group view)
  const sessionsFilterOptions = useMemo(() => {
    if (isPersonal) return [];
    const opts: { key: string; label: string }[] = [{ key: "mine", label: "Mine" }];
    (activeGroup?.members || []).forEach((m: any) => {
      if (m.user_id !== user?.id)
        opts.push({ key: m.user_id, label: memberProfiles[m.user_id]?.display_name || "Member" });
    });
    opts.push({ key: "together", label: "Together" });
    return opts;
  }, [isPersonal, activeGroup, user, memberProfiles]);

  // Filtered today sessions for group view
  const filteredGroupTodaySessions = useMemo(() => {
    if (isPersonal) return todaySessions;
    if (sessionsFilter === "mine") return groupSessions.filter(s => s.user_id === user?.id && s.started_at.startsWith(today));
    if (sessionsFilter === "together") return [];
    return groupSessions.filter(s => s.user_id === sessionsFilter && s.started_at.startsWith(today));
  }, [isPersonal, sessionsFilter, groupSessions, todaySessions, user, today]);

  // Weekly sessions count
  const weekSessionsCount = useMemo(() => sessions.filter(s => weekDays.some(d => s.started_at.startsWith(d.date))).length, [sessions, weekDays]);

  // ── Show Log page ──
  if (showLog) {
    return <StudyLogPage onBack={() => setShowLog(false)} onOpenMore={onOpenMore} />;
  }

  // ── Fullscreen ──
  if (fullscreen && activeSession) {
    const groupName = activeSession.group_id ? groupNameMap[activeSession.group_id] || activeGroup?.name : undefined;
    return (
      <StudyFullscreenTimer
        subject={activeSession.subject}
        groupName={groupName}
        startedAt={activeSession.started_at}
        todayTotal={todayTotal - activeTick}
        goalHours={DAILY_GOAL_HOURS}
        onStop={toggleSession}
        onDismiss={() => setFullscreen(false)}
      />
    );
  }

  // ═══ RENDER ═══
  return (
    <div className="flex flex-col min-h-full pb-4" style={{ background: "#F4F3F0" }}>
      {/* ── Header ── */}
      <div className="px-4 pt-6 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "#FAF5FF" }}>
            <Clock size={18} color="#6C47FF" />
          </div>
          <h1 className="text-xl font-bold text-foreground" style={{ fontFamily: "DM Sans, sans-serif" }}>
            Study
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowLog(true)}
            className="w-[30px] h-[30px] rounded-full flex items-center justify-center"
            style={{ background: "#F4F3F0", border: "0.5px solid rgba(0,0,0,0.07)" }}
          >
            <Clock size={14} color="#888" />
          </button>
          {onOpenMore && (
            <button
              onClick={onOpenMore}
              className="w-[30px] h-[30px] rounded-full flex items-center justify-center"
              style={{ background: "#F4F3F0", border: "0.5px solid rgba(0,0,0,0.07)" }}
            >
              <MoreHorizontal size={15} color="#888" />
            </button>
          )}
        </div>
      </div>

      {/* ── Context toggle ── */}
      <div className="px-4 pb-2">
        <PageGroupSelector page="study" hideAllPill />
      </div>

      <div className="px-4 space-y-3">
        {/* ═══ Timer Card ═══ */}
        <div
          className="rounded-2xl p-6 flex flex-col items-center"
          style={{
            background: activeSession ? "#FAF5FF" : "#fff",
            border: "0.5px solid rgba(0,0,0,0.07)",
          }}
        >
          {/* Ring */}
          <div className="relative flex items-center justify-center mb-4" style={{ width: SIZE, height: SIZE }}>
            <svg width={SIZE} height={SIZE} className="absolute inset-0">
              <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="#F0EFF8" strokeWidth={STROKE} />
              <circle
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={R}
                fill="none"
                stroke="#6C47FF"
                strokeWidth={STROKE}
                strokeLinecap="round"
                strokeDasharray={`${C - offset} ${offset}`}
                transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
                style={{ transition: "stroke-dasharray 0.5s ease" }}
              />
              {progress > 0.01 && (
                <circle cx={dotCx} cy={dotCy} r={5} fill="#6C47FF" stroke="#fff" strokeWidth={2} />
              )}
            </svg>
            <button
              onClick={activeSession ? () => setFullscreen(true) : toggleSession}
              className="relative z-10 flex flex-col items-center justify-center cursor-pointer hover:scale-105 active:scale-95 transition-transform"
              style={{ width: SIZE - 30, height: SIZE - 30 }}
            >
              {activeSession ? (
                <>
                  <span className="text-[10px]" style={{ color: "rgba(108,71,255,0.5)" }}>Session</span>
                  <span className="tabular-nums" style={{ fontSize: 24, fontWeight: 500, color: "#6C47FF", fontFamily: "DM Sans, sans-serif" }}>
                    {fmtTimer(activeTick)}
                  </span>
                  <span className="text-[11px]" style={{ color: "rgba(108,71,255,0.6)" }}>
                    {fmtHours(todayTotal)} / {DAILY_GOAL_HOURS}h
                  </span>
                  <span className="text-[10px] mt-0.5" style={{ color: "#6C47FF" }}>tap to expand</span>
                </>
              ) : (
                <>
                  <span className="text-[10px] text-muted-foreground">Today</span>
                  <span className="tabular-nums" style={{ fontSize: 24, fontWeight: 500, color: "#1a1a1a", fontFamily: "DM Sans, sans-serif" }}>
                    {fmtTimer(todayTotal)}
                  </span>
                  <span className="text-[11px]" style={{ color: "rgba(108,71,255,0.6)" }}>
                    {fmtHours(todayTotal)} / {DAILY_GOAL_HOURS}h
                  </span>
                  <span className="text-[10px] mt-0.5" style={{ color: "#6C47FF" }}>tap to start</span>
                </>
              )}
            </button>
          </div>

          {/* Studying badge */}
          {activeSession && (
            <div className="flex items-center gap-1.5 mb-3 px-3 py-1 rounded-full text-xs font-medium" style={{ background: "#ECFDF5", color: "#059669" }}>
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              Studying · {activeSession.subject}
            </div>
          )}

          {/* Subject pills */}
          <div ref={pillsRef} className="flex gap-2 flex-wrap justify-center">
            {subjects.map(sub => (
              <div key={sub} className="relative">
                <button
                  onClick={() => !activeSession && !editMode && setSelectedSubject(sub)}
                  onPointerDown={handlePillPointerDown}
                  onPointerUp={handlePillPointerUp}
                  onPointerLeave={handlePillPointerUp}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
                  style={{
                    background: selectedSubject === sub ? "#6C47FF" : "#F4F3F0",
                    color: selectedSubject === sub ? "#fff" : "#888",
                    border: "0.5px solid rgba(0,0,0,0.07)",
                    opacity: activeSession ? 0.6 : 1,
                  }}
                >
                  {sub}
                </button>
                {editMode && (
                  <button
                    onClick={(e) => { e.stopPropagation(); removeSubject(sub); }}
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center"
                    style={{ background: "#EF4444", border: "1.5px solid #fff" }}
                  >
                    <X size={8} color="#fff" />
                  </button>
                )}
              </div>
            ))}
            {addingSubject ? (
              <input
                ref={addInputRef}
                value={newSubjectText}
                onChange={e => setNewSubjectText(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") addSubject(); if (e.key === "Escape") { setAddingSubject(false); setNewSubjectText(""); } }}
                onBlur={addSubject}
                className="px-3 py-1 rounded-full text-xs border outline-none w-20"
                style={{ borderColor: "#6C47FF", background: "#fff" }}
                autoFocus
                placeholder="Name"
              />
            ) : (
              <button
                onClick={() => !activeSession && setAddingSubject(true)}
                className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                style={{ background: "transparent", border: "1px dashed rgba(0,0,0,0.15)", color: "#999", opacity: activeSession ? 0.5 : 1 }}
              >
                + Add
              </button>
            )}
          </div>

          {/* Similarity prompt */}
          {similarityPrompt && (
            <div className="mt-3 p-3 rounded-xl w-full" style={{ background: "#FAF5FF", border: "1px solid #EDE9FE" }}>
              <p className="text-xs text-foreground mb-2">
                This looks similar to <strong>{similarityPrompt.existing}</strong>. Are these the same?
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => handleSimilarityResponse(true)}
                  className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                  style={{ background: "#6C47FF" }}
                >
                  Yes, same subject
                </button>
                <button
                  onClick={() => handleSimilarityResponse(false)}
                  className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium"
                  style={{ background: "#F4F3F0", color: "#555" }}
                >
                  No, keep separate
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ═══ Group Today Card ═══ */}
        {groupId && groupMembers.length > 0 && (
          <div className="rounded-2xl p-4" style={{ background: "#fff", border: "0.5px solid rgba(0,0,0,0.07)" }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "DM Sans, sans-serif" }}>Group today</h3>
              {groupMembers.filter(m => m.active).length > 0 && (
                <span className="text-xs font-medium" style={{ color: "#059669" }}>
                  {groupMembers.filter(m => m.active).length} live
                </span>
              )}
            </div>
            <div className="space-y-2.5">
              {[...groupMembers].sort((a, b) => (a.active ? -1 : 1) - (b.active ? -1 : 1)).map(m => (
                <div key={m.user_id} className="flex items-center gap-3">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                    style={{ background: m.color }}
                  >
                    {m.profile?.avatar_url
                      ? <img src={m.profile.avatar_url} className="w-7 h-7 rounded-full object-cover" />
                      : (m.profile?.display_name || "?")[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium">{m.isMe ? "Me" : m.profile?.display_name}</span>
                  </div>
                  {m.active ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium px-1.5 py-0.5 rounded-full" style={{ background: "#ECFDF5", color: "#059669" }}>
                        Live
                      </span>
                      <LiveTimer startedAt={m.active.started_at} />
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {m.lastSession ? `${timeAgo(m.lastSession.ended_at || m.lastSession.started_at)} · ${fmtDuration(m.todayTotal)}` : "No sessions"}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ Stats Row (Personal view) ═══ */}
        {isPersonal && (
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl p-4" style={{ background: "#fff", border: "0.5px solid rgba(0,0,0,0.07)" }}>
              <div className="text-xs text-muted-foreground mb-1">🔥 Streak</div>
              <div className="text-2xl font-bold text-foreground">{streak}</div>
              <div
                className="text-[10px] font-medium px-1.5 py-0.5 rounded-full inline-block mt-1"
                style={{ background: "#FEF3C7", color: "#92400E" }}
              >
                Best {bestStreak}d
              </div>
            </div>
            <div className="rounded-2xl p-4" style={{ background: "#fff", border: "0.5px solid rgba(0,0,0,0.07)" }}>
              <div className="text-xs text-muted-foreground mb-1">📚 Sessions</div>
              <div className="text-2xl font-bold text-foreground">{todaySessions.length}</div>
              <div
                className="text-[10px] font-medium px-1.5 py-0.5 rounded-full inline-block mt-1"
                style={{ background: "#EDE9FE", color: "#6C47FF" }}
              >
                {weekSessionsCount} this week
              </div>
            </div>
          </div>
        )}

        {/* ═══ Today's Sessions ═══ */}
        <div className="rounded-2xl p-4" style={{ background: "#fff", border: "0.5px solid rgba(0,0,0,0.07)" }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "DM Sans, sans-serif" }}>
              Today's sessions
            </h3>
            <span className="text-xs text-muted-foreground">
              {isPersonal ? todaySessions.length : filteredGroupTodaySessions.length} sessions
            </span>
          </div>

          {/* Filter pills (group view) */}
          {!isPersonal && sessionsFilterOptions.length > 0 && (
            <div className="flex gap-1.5 mb-3 overflow-x-auto scrollbar-hide">
              {sessionsFilterOptions.map(opt => (
                <button
                  key={opt.key}
                  onClick={() => setSessionsFilter(opt.key)}
                  className="px-3 py-1 rounded-full text-xs font-medium flex-shrink-0 transition-all"
                  style={{
                    background: sessionsFilter === opt.key ? "#1a1a1a" : "#F4F3F0",
                    color: sessionsFilter === opt.key ? "#fff" : "#888",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          {/* Together view: horizontal columns */}
          {!isPersonal && sessionsFilter === "together" ? (
            <div className="flex gap-2.5 overflow-x-auto scrollbar-hide pb-1">
              {groupMembers.map(m => {
                const mSessions = m.todaySessions.filter((s: StudySession) => !s.is_active);
                return (
                  <div key={m.user_id} className="flex-shrink-0" style={{ width: 150 }}>
                    <div className="flex items-center gap-1.5 mb-2">
                      <div className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white" style={{ background: m.color }}>
                        {m.profile?.avatar_url
                          ? <img src={m.profile.avatar_url} className="w-5 h-5 rounded-full object-cover" />
                          : (m.profile?.display_name || "?")[0]}
                      </div>
                      <span className="text-xs font-medium" style={{ color: m.color }}>
                        {m.isMe ? "Me" : m.profile?.display_name}
                      </span>
                    </div>
                    {mSessions.length === 0 ? (
                      <div
                        className="flex items-center justify-center text-xs text-muted-foreground py-6"
                        style={{ border: "1px dashed rgba(0,0,0,0.12)", borderRadius: "0 9px 9px 0" }}
                      >
                        No sessions
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {mSessions.map((s: StudySession) => (
                          <div
                            key={s.id}
                            className="p-2 rounded-r-[9px]"
                            style={{ borderLeft: `2.5px solid ${m.color}`, background: "#FAFAF8" }}
                          >
                            <div className="text-[11px] font-medium text-foreground">{s.subject}</div>
                            <div className="text-[10px] text-muted-foreground">
                              {fmtTime(s.started_at)}{s.ended_at ? `–${fmtTime(s.ended_at)}` : ""}
                            </div>
                            <div className="text-[11px] font-medium mt-0.5" style={{ color: m.color }}>
                              {fmtDuration(s.duration_seconds)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <>
              {(isPersonal ? todaySessions : filteredGroupTodaySessions).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No sessions yet today. Tap the timer to start!
                </p>
              ) : (
                <div className="space-y-1.5">
                  {(isPersonal ? todaySessions : filteredGroupTodaySessions).map(s => (
                    <div key={s.id} className="flex items-center gap-3 p-2.5 rounded-xl" style={{ background: s.is_active ? "#FAF5FF" : "transparent" }}>
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "#6C47FF" }}>
                        <Clock size={13} color="#fff" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium flex items-center gap-1.5">
                          {s.subject}
                          {s.is_active && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "#EDE9FE", color: "#6C47FF" }}>
                              live
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {fmtTime(s.started_at)}{s.ended_at ? ` – ${fmtTime(s.ended_at)}` : " – now"}
                          {isPersonal && s.group_id && groupNameMap[s.group_id] && (
                            <span className="ml-1 text-muted-foreground"> · {groupNameMap[s.group_id]}</span>
                          )}
                        </div>
                      </div>
                      <span className="text-sm font-medium" style={{ color: "#6C47FF" }}>
                        {s.is_active ? fmtDuration(activeTick) : fmtDuration(s.duration_seconds)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* ═══ Weekly Chart ═══ */}
        <div className="rounded-2xl p-4" style={{ background: "#fff", border: "0.5px solid rgba(0,0,0,0.07)" }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "DM Sans, sans-serif" }}>
              This week
            </h3>
            {/* Dropdown */}
            <div className="relative">
              <button
                onClick={() => setChartDropdownOpen(!chartDropdownOpen)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
                style={{ background: "#F4F3F0", border: "0.5px solid rgba(0,0,0,0.07)" }}
              >
                {chartOptions.find(o => o.key === chartFilter)?.label || "Mine"}
                <ChevronDown size={12} />
              </button>
              {chartDropdownOpen && (
                <div
                  className="absolute right-0 top-full mt-1 z-50 rounded-xl py-1 shadow-lg min-w-[120px]"
                  style={{ background: "#fff", border: "0.5px solid rgba(0,0,0,0.1)" }}
                >
                  {chartOptions.map(opt => (
                    <button
                      key={opt.key}
                      onClick={() => { setChartFilter(opt.key); setChartDropdownOpen(false); }}
                      className="block w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50"
                      style={{ fontWeight: chartFilter === opt.key ? 600 : 400, color: chartFilter === opt.key ? "#6C47FF" : "#555" }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-end justify-between gap-1.5 h-[100px]">
            {weeklyData.map((day, i) => {
              const h = day.seconds > 0 ? Math.max((day.seconds / maxBar) * 80, 6) : 4;
              const color = day.isFuture ? "#EEEDE8" : "#6C47FF";
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
          <div className="text-center mt-2">
            <span className="text-xs text-muted-foreground">{fmtHours(weekTotal)} hours total</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudyPage;
