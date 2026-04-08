import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Clock, MoreHorizontal, ChevronDown, X, Trash2, Plus, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { ModeToggleBar, type WorkoutMode } from "@/components/WorkoutModeToggle";
import CreateGroupModal from "@/components/CreateGroupModal";
import StudyFullscreenTimer from "@/components/StudyFullscreenTimer";
import StudyLogPage from "@/components/StudyLogPage";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
const RESUME_WINDOW_MS = 2 * 60 * 1000; // 2 minutes

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

  for (const ex of allKnown) {
    if (normalizeSubject(ex) === norm) return { type: "exact", existing: ex };
  }

  const newKey = getCanonicalKey(newName);
  if (newKey) {
    for (const ex of allKnown) {
      const exKey = getCanonicalKey(ex);
      if (exKey && exKey === newKey) return { type: "exact", existing: ex };
    }
  }

  const withoutS = norm.endsWith("s") ? norm.slice(0, -1) : norm + "s";
  for (const ex of allKnown) {
    const exNorm = normalizeSubject(ex);
    if (exNorm === withoutS) return { type: "similar", existing: ex };
  }

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
  if (seconds <= 0) return "0s";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (seconds < 60) return `${s}s`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s}s`;
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
  const { user, activeGroup, groups, profile } = useAuth();
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
  
  const [editMode, setEditMode] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [similarityPrompt, setSimilarityPrompt] = useState<{ newName: string; existing: string } | null>(null);
  const [swipedSessionId, setSwipedSessionId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [fadingSessionId, setFadingSessionId] = useState<string | null>(null);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const swipeStartX = useRef<number | null>(null);
  const swipeCurrentX = useRef<number>(0);
  const swipeRowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const addInputRef = useRef<HTMLInputElement>(null);
  const pillsRef = useRef<HTMLDivElement>(null);

  // ── Mine/Group toggle state ──
  const [studyMode, setStudyMode] = useState<WorkoutMode>(() =>
    (localStorage.getItem("study_mode") as WorkoutMode) || "mine"
  );
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(() =>
    localStorage.getItem("study_selected_group")
  );
  const [memberFilter, setMemberFilter] = useState<Set<string>>(new Set(["__everyone__"]));
  const [memberDropdownOpen, setMemberDropdownOpen] = useState(false);
  const memberDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => { localStorage.setItem("study_mode", studyMode); }, [studyMode]);
  useEffect(() => {
    if (selectedGroupId) localStorage.setItem("study_selected_group", selectedGroupId);
    else localStorage.removeItem("study_selected_group");
  }, [selectedGroupId]);

  const studyGroups = useMemo(
    () => (groups || []).filter((g: any) => !(g as any)._personal && g.shared_pages?.includes("study")),
    [groups]
  );

  // Auto-select first group if none selected
  useEffect(() => {
    if (studyMode === "group" && !selectedGroupId && studyGroups.length > 0) {
      setSelectedGroupId(studyGroups[0].id);
    }
  }, [studyMode, selectedGroupId, studyGroups]);

  // Reset member filter when group changes
  useEffect(() => { setMemberFilter(new Set(["__everyone__"])); }, [selectedGroupId]);

  // Derive isPersonal / groupId from mode
  const isPersonal = studyMode === "mine";
  const selectedGroup = useMemo(() => studyGroups.find(g => g.id === selectedGroupId) || null, [studyGroups, selectedGroupId]);
  const groupId = isPersonal ? null : selectedGroupId;

  // Ref to hold the active session ID to prevent re-render issues
  const activeSessionIdRef = useRef<string | null>(null);
  const startedAtRef = useRef<string | null>(null);

  // ── Per-context timer state (keyed by context ID) ──
  interface ContextTimerState {
    lastStoppedSession: StudySession | null;
    lastStoppedAt: number | null;
    accumulatedSeconds: number;
    baseDuration: number;
  }
  const contextTimerMapRef = useRef<Map<string, ContextTimerState>>(new Map());
  const resumeWindowTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Derive context key from current view
  const contextKey = isPersonal ? "__personal__" : (groupId || "__personal__");
  const contextKeyRef = useRef(contextKey);
  contextKeyRef.current = contextKey;

  // Helper to get/init a context's timer state
  const getCtxState = useCallback((key: string): ContextTimerState => {
    if (!contextTimerMapRef.current.has(key)) {
      contextTimerMapRef.current.set(key, { lastStoppedSession: null, lastStoppedAt: null, accumulatedSeconds: 0, baseDuration: 0 });
    }
    return contextTimerMapRef.current.get(key)!;
  }, []);

  // Reactive state derived from the current context's ref (triggers re-renders on context switch / pause / expiry)
  const [ctxResumeVersion, setCtxResumeVersion] = useState(0);
  const bumpResume = useCallback(() => setCtxResumeVersion(v => v + 1), []);

  // Read current context state (reactive via ctxResumeVersion + contextKey)
  const currentCtxState = useMemo(() => getCtxState(contextKey), [contextKey, ctxResumeVersion, getCtxState]);

  // Convenience aliases matching old API
  const lastStoppedSession = currentCtxState.lastStoppedSession;
  const lastStoppedAt = currentCtxState.lastStoppedAt;

  // Convenience refs that point to current context for use in callbacks
  const accumulatedSecondsRef = useRef(0);
  const baseDurationRef = useRef(0);

  // Sync convenience refs from context map when context changes
  useEffect(() => {
    const s = getCtxState(contextKey);
    accumulatedSecondsRef.current = s.accumulatedSeconds;
    baseDurationRef.current = s.baseDuration;
  }, [contextKey, ctxResumeVersion, getCtxState]);

  // Groups that have Study feature enabled
  const studyEnabledGroupIds = useMemo(() => {
    const set = new Set<string>();
    (groups || []).forEach((g: any) => {
      if (!(g as any)._personal && (g.shared_pages || []).includes("study")) {
        set.add(g.id);
      }
    });
    return set;
  }, [groups]);

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
    if (!selectedGroup || isPersonal) return;
    const profiles: Record<string, { display_name: string; avatar_url: string | null }> = {};
    selectedGroup.members.forEach((m: any) => {
      profiles[m.user_id] = { display_name: m.display_name || "Member", avatar_url: m.avatar_url };
    });
    setMemberProfiles(profiles);
  }, [selectedGroup, isPersonal]);

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

  // Stable active session ID to avoid tearing down intervals on every fetch
  const activeSessionId = activeSession?.id ?? null;
  const activeStartedAt = activeSession?.started_at ?? null;

  // Keep refs in sync
  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
    startedAtRef.current = activeStartedAt;
  }, [activeSessionId, activeStartedAt]);

  // No background timer — timer only runs on the fullscreen timer page
  // activeTick stays at 0 when on the Study page

  // ── Stop session on page unload only (NOT on component unmount) ──
  useEffect(() => {
    const handleBeforeUnload = () => {
      const sessionId = activeSessionIdRef.current;
      if (!sessionId) return;
      const duration = baseDurationRef.current + accumulatedSecondsRef.current;
      const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/study_sessions?id=eq.${sessionId}`;
      const body = JSON.stringify({ is_active: false, ended_at: new Date().toISOString(), duration_seconds: duration });
      navigator.sendBeacon?.(url, new Blob([body], { type: "application/json" }));
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

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
    return todaySessions.reduce((sum, s) => sum + s.duration_seconds, 0);
  }, [todaySessions]);

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
      const total = daySessions.reduce((sum, s) => sum + s.duration_seconds, 0);
      return { ...day, seconds: total };
    });
  }, [weekDays, sessions]);

  const weekTotal = useMemo(() => weeklyData.reduce((s, d) => s + d.seconds, 0), [weeklyData]);
  const maxBar = useMemo(() => Math.max(...weeklyData.map(d => d.seconds), 3600), [weeklyData]);

  // Group members enriched
  const groupMembers = useMemo(() => {
    if (!groupId || !selectedGroup) return [];
    return selectedGroup.members.map((m: any, idx: number) => {
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
  }, [groupId, selectedGroup, groupSessions, today, memberProfiles, user]);

  // ── Resume logic ──
  // Ring resume: within 2-min window (timeout clears lastStoppedSession after 2 min)
  const ringResumeSession = useMemo(() => {
    if (activeSession) return null;
    if (!lastStoppedSession || !lastStoppedAt) return null;
    if (lastStoppedSession.subject !== selectedSubject) return null;
    return lastStoppedSession;
  }, [activeSession, lastStoppedSession, lastStoppedAt, selectedSubject]);

  // List resume: show on most recent session when ring resume is not active
  const listResumeSessionId = useMemo(() => {
    if (activeSession || ringResumeSession) return null;
    const completed = todaySessions.filter(s => !s.is_active && s.duration_seconds > 0);
    if (completed.length === 0) return null;
    return completed[0].id;
  }, [activeSession, ringResumeSession, todaySessions]);

  // ── Actions ──
  const pauseSession = useCallback(async (totalElapsed: number) => {
    const sessionId = activeSessionIdRef.current;
    if (!sessionId) return;
    const key = contextKeyRef.current;
    const ctx = getCtxState(key);
    ctx.accumulatedSeconds = totalElapsed;
    accumulatedSecondsRef.current = totalElapsed;
    const finalDuration = ctx.baseDuration + totalElapsed;
    const endedAt = new Date().toISOString();
    await supabase
      .from("study_sessions")
      .update({ is_active: false, ended_at: endedAt, duration_seconds: finalDuration } as any)
      .eq("id", sessionId);
    const session = sessions.find(s => s.id === sessionId);
    if (session) {
      ctx.lastStoppedSession = { ...session, ended_at: endedAt, duration_seconds: finalDuration, is_active: false };
    }
    ctx.lastStoppedAt = Date.now();
    setFullscreen(false);
    setActiveTick(0);
    // Clear any existing resume window timer for this context
    const existingTimer = resumeWindowTimersRef.current.get(key);
    if (existingTimer) clearTimeout(existingTimer);
    // Start 2-min window for THIS context only
    const timer = setTimeout(() => {
      const s = getCtxState(key);
      s.accumulatedSeconds = 0;
      s.baseDuration = 0;
      s.lastStoppedSession = null;
      s.lastStoppedAt = null;
      resumeWindowTimersRef.current.delete(key);
      // If user is currently viewing this context, update display
      if (contextKeyRef.current === key) {
        accumulatedSecondsRef.current = 0;
        baseDurationRef.current = 0;
        bumpResume();
      }
    }, RESUME_WINDOW_MS);
    resumeWindowTimersRef.current.set(key, timer);
    bumpResume();
    fetchSessions();
    fetchGroupSessions();
  }, [sessions, fetchSessions, fetchGroupSessions, getCtxState, bumpResume]);

  const startNewSession = useCallback(async () => {
    if (!user) return;
    const key = contextKeyRef.current;
    const effectiveGroupId = groupId && studyEnabledGroupIds.has(groupId) ? groupId : null;
    const ctx = getCtxState(key);
    ctx.accumulatedSeconds = 0;
    ctx.baseDuration = 0;
    accumulatedSecondsRef.current = 0;
    baseDurationRef.current = 0;
    // Clear resume window timer for this context
    const existingTimer = resumeWindowTimersRef.current.get(key);
    if (existingTimer) { clearTimeout(existingTimer); resumeWindowTimersRef.current.delete(key); }
    await supabase
      .from("study_sessions")
      .insert({ user_id: user.id, subject: selectedSubject, group_id: effectiveGroupId, is_active: true, started_at: new Date().toISOString() } as any);
    ctx.lastStoppedSession = null;
    ctx.lastStoppedAt = null;
    setActiveTick(0);
    setFullscreen(true);
    bumpResume();
    fetchSessions();
    fetchGroupSessions();
  }, [user, selectedSubject, groupId, studyEnabledGroupIds, fetchSessions, fetchGroupSessions, getCtxState, bumpResume]);

  const resumeSession = useCallback(async (sessionToResume: StudySession, fromList = false) => {
    const key = contextKeyRef.current;
    const ctx = getCtxState(key);
    if (fromList) {
      ctx.baseDuration = sessionToResume.duration_seconds;
      ctx.accumulatedSeconds = 0;
      baseDurationRef.current = sessionToResume.duration_seconds;
      accumulatedSecondsRef.current = 0;
    }
    // Clear resume window timer for this context
    const existingTimer = resumeWindowTimersRef.current.get(key);
    if (existingTimer) { clearTimeout(existingTimer); resumeWindowTimersRef.current.delete(key); }
    await supabase
      .from("study_sessions")
      .update({ is_active: true, ended_at: null } as any)
      .eq("id", sessionToResume.id);
    ctx.lastStoppedSession = null;
    ctx.lastStoppedAt = null;
    setFullscreen(true);
    bumpResume();
    fetchSessions();
    fetchGroupSessions();
  }, [fetchSessions, fetchGroupSessions, getCtxState, bumpResume]);

  // Cleanup all resume window timers on unmount
  useEffect(() => {
    return () => {
      resumeWindowTimersRef.current.forEach(t => clearTimeout(t));
      resumeWindowTimersRef.current.clear();
    };
  }, []);

  const toggleSession = async () => {
    if (!user) return;
    if (ringResumeSession) {
      await resumeSession(ringResumeSession, false);
    } else {
      await startNewSession();
    }
  };

  const handleResumeFromList = async (sessionId: string) => {
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return;
    await resumeSession(session, true);
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
      if (!subjects.includes(match.existing)) {
        const updated = [...subjects, match.existing];
        setSubjects(updated);
        saveSubjects(updated);
      }
      setSelectedSubject(match.existing);
      setNewSubjectText("");
      setAddingSubject(false);
    } else if (match.type === "similar") {
      setSimilarityPrompt({ newName: trimmed, existing: match.existing });
      setNewSubjectText("");
      setAddingSubject(false);
    } else {
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
      if (!subjects.includes(similarityPrompt.existing)) {
        const updated = [...subjects, similarityPrompt.existing];
        setSubjects(updated);
        saveSubjects(updated);
      }
      setSelectedSubject(similarityPrompt.existing);
    } else {
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

  const canSwipeDelete = useMemo(() => {
    if (isPersonal) return true;
    const onlyMe = !memberFilter.has("__everyone__") && memberFilter.size === 1 && memberFilter.has(user?.id || "");
    return onlyMe;
  }, [isPersonal, memberFilter, user]);
  // ── Swipe-to-delete handlers ──

  const handleSwipeStart = useCallback((e: React.TouchEvent, sessionId: string) => {
    if (!canSwipeDelete) return;
    swipeStartX.current = e.touches[0].clientX;
    swipeCurrentX.current = 0;
  }, [canSwipeDelete]);

  const handleSwipeMove = useCallback((e: React.TouchEvent, sessionId: string) => {
    if (!canSwipeDelete || swipeStartX.current === null) return;
    const diff = swipeStartX.current - e.touches[0].clientX;
    const clamped = Math.max(0, Math.min(diff, 80));
    swipeCurrentX.current = clamped;
    const el = swipeRowRefs.current.get(sessionId);
    if (el) el.style.transform = `translateX(-${clamped}px)`;
    if (clamped > 10 && swipedSessionId !== sessionId) {
      setSwipedSessionId(sessionId);
    }
  }, [canSwipeDelete, swipedSessionId]);

  const handleSwipeEnd = useCallback((e: React.TouchEvent, sessionId: string) => {
    if (!canSwipeDelete) return;
    const el = swipeRowRefs.current.get(sessionId);
    if (swipeCurrentX.current > 40) {
      if (el) el.style.transform = `translateX(-72px)`;
      setSwipedSessionId(sessionId);
    } else {
      if (el) el.style.transform = `translateX(0px)`;
      if (swipedSessionId === sessionId) setSwipedSessionId(null);
    }
    swipeStartX.current = null;
    swipeCurrentX.current = 0;
  }, [canSwipeDelete, swipedSessionId]);

  const resetSwipe = useCallback(() => {
    if (swipedSessionId) {
      const el = swipeRowRefs.current.get(swipedSessionId);
      if (el) el.style.transform = `translateX(0px)`;
      setSwipedSessionId(null);
    }
  }, [swipedSessionId]);

  const handleDeleteSession = useCallback(async () => {
    if (!deleteConfirmId) return;
    setFadingSessionId(deleteConfirmId);
    setDeleteConfirmId(null);
    // Reset swipe on the row
    const el = swipeRowRefs.current.get(deleteConfirmId);
    if (el) el.style.transform = `translateX(0px)`;
    setSwipedSessionId(null);

    await supabase.from("study_sessions").delete().eq("id", deleteConfirmId);
    // Small delay for fade animation
    setTimeout(() => {
      setFadingSessionId(null);
      fetchSessions();
      fetchGroupSessions();
    }, 300);
  }, [deleteConfirmId, fetchSessions, fetchGroupSessions]);

  // Reset swipe on any interaction outside
  useEffect(() => {
    if (!swipedSessionId) return;
    const handler = () => resetSwipe();
    window.addEventListener("scroll", handler, true);
    return () => window.removeEventListener("scroll", handler, true);
  }, [swipedSessionId, resetSwipe]);


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
        if (!(g as any)._personal && studyEnabledGroupIds.has(g.id)) opts.push({ key: g.id, label: g.name });
      });
      opts.push({ key: "together", label: "Together" });
      return opts;
    } else {
      const opts: { key: string; label: string }[] = [{ key: "mine", label: "Mine" }];
      (selectedGroup?.members || []).forEach((m: any) => {
        if (m.user_id !== user?.id) opts.push({ key: m.user_id, label: memberProfiles[m.user_id]?.display_name || "Member" });
      });
      opts.push({ key: "together", label: "Together" });
      return opts;
    }
  }, [isPersonal, groups, selectedGroup, user, memberProfiles, studyEnabledGroupIds]);

  // Group info lookup (name, cover photo, color)
  const groupInfoMap = useMemo(() => {
    const m: Record<string, { name: string; coverUrl: string | null; color: string }> = {};
    const GROUP_COLORS = ["#93C5FD", "#86EFAC", "#C4B5FD", "#FCD34D", "#FCA5A5", "#67E8F9", "#A7F3D0", "#FDBA74"];
    (groups || []).forEach((g: any, i: number) => {
      if (!(g as any)._personal) {
        m[g.id] = { name: g.name, coverUrl: g.cover_image_url || null, color: GROUP_COLORS[i % GROUP_COLORS.length] };
      }
    });
    return m;
  }, [groups]);

  const groupNameMap = useMemo(() => {
    const m: Record<string, string> = {};
    Object.entries(groupInfoMap).forEach(([id, info]) => { m[id] = info.name; });
    return m;
  }, [groupInfoMap]);




  // Derive effective user IDs from memberFilter
  const memberFilterUserIds = useMemo(() => {
    if (isPersonal) return [user?.id].filter(Boolean) as string[];
    if (memberFilter.has("__everyone__")) return groupMembers.map(m => m.user_id);
    return Array.from(memberFilter);
  }, [isPersonal, memberFilter, groupMembers, user]);

  const isMultiUserView = !isPersonal && memberFilterUserIds.length > 1;

  // Filtered today sessions for group view
  const filteredGroupTodaySessions = useMemo(() => {
    if (isPersonal) return todaySessions;
    return groupSessions.filter(s => memberFilterUserIds.includes(s.user_id) && s.started_at.startsWith(today));
  }, [isPersonal, memberFilterUserIds, groupSessions, todaySessions, today]);

  // Whether to show column view (multiple users selected)
  const showColumnView = useMemo(() => {
    if (isPersonal) return false;
    return isMultiUserView;
  }, [isPersonal, isMultiUserView]);

  // Members to show in column view
  const columnMembers = useMemo(() => {
    if (isPersonal) return [];
    return groupMembers.filter(m => memberFilterUserIds.includes(m.user_id));
  }, [isPersonal, groupMembers, memberFilterUserIds]);

  // Total time for header
  const sessionsTotalSeconds = useMemo(() => {
    if (isPersonal) return todaySessions.reduce((sum, s) => sum + s.duration_seconds, 0);
    if (showColumnView) {
      return columnMembers.reduce((sum, m) => sum + m.todayTotal, 0);
    }
    return filteredGroupTodaySessions.reduce((sum, s) => sum + s.duration_seconds, 0);
  }, [isPersonal, todaySessions, showColumnView, columnMembers, filteredGroupTodaySessions]);




  // Weekly sessions count
  const weekSessionsCount = useMemo(() => sessions.filter(s => weekDays.some(d => s.started_at.startsWith(d.date))).length, [sessions, weekDays]);

  // ── Ring display values ──
  const ringDisplayTime = useMemo(() => {
    if (activeSession) return fmtTimer(activeTick);
    if (ringResumeSession) return fmtTimer(ringResumeSession.duration_seconds);
    return fmtTimer(todayTotal);
  }, [activeSession, activeTick, ringResumeSession, todayTotal]);

  const ringLabel = useMemo(() => {
    if (activeSession) return "Session";
    if (ringResumeSession) return "Paused";
    return "Today";
  }, [activeSession, ringResumeSession]);

  const ringAction = useMemo(() => {
    if (activeSession) return "tap to expand";
    if (ringResumeSession) return "Resume session";
    return "tap to start";
  }, [activeSession, ringResumeSession]);

  // ── Show Log page ──
  if (showLog) {
    return <StudyLogPage onBack={() => setShowLog(false)} onOpenMore={onOpenMore} />;
  }

  // ── Fullscreen ──
  if (fullscreen && activeSession) {
    const groupName = activeSession.group_id ? groupNameMap[activeSession.group_id] || selectedGroup?.name : undefined;
    return (
      <StudyFullscreenTimer
        subject={activeSession.subject}
        groupName={groupName}
        initialElapsed={accumulatedSecondsRef.current}
        todayTotal={todayTotal}
        goalHours={DAILY_GOAL_HOURS}
        onStop={(elapsed) => pauseSession(elapsed)}
        onDismiss={(elapsed) => pauseSession(elapsed)}
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
        <ModeToggleBar mode={studyMode} onModeChange={setStudyMode} />
        {studyMode === "group" && (
          <>
            <div
              className="flex gap-1.5 overflow-x-auto scrollbar-hide scroll-smooth-touch py-1 -mx-1 px-1 mb-2"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              {studyGroups.map((g) => {
                const active = selectedGroupId === g.id;
                return (
                  <button
                    key={g.id}
                    onClick={() => setSelectedGroupId(g.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all flex-shrink-0"
                    style={{
                      background: active ? "#1a1a1a" : "#fff",
                      color: active ? "#fff" : "#666",
                      border: active ? "none" : "0.5px solid rgba(0,0,0,0.1)",
                    }}
                  >
                    <span className="text-sm leading-none">{g.emoji}</span>
                    <span className="truncate max-w-[120px]">{g.name}</span>
                  </button>
                );
              })}
              <button
                onClick={() => setShowCreateGroup(true)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold transition-all flex-shrink-0"
                style={{ border: "1.5px dashed rgba(0,0,0,0.15)", color: "#999", background: "transparent" }}
              >
                <Plus size={12} />
                <span>Add</span>
              </button>
            </div>
            {/* MemberSelectorPill moved into Today's Sessions card */}
          </>
        )}
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
              onClick={activeSession ? () => { baseDurationRef.current = activeSession.duration_seconds; accumulatedSecondsRef.current = 0; setFullscreen(true); } : toggleSession}
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
              ) : ringResumeSession ? (
                <>
                  <span className="text-[10px]" style={{ color: "rgba(108,71,255,0.5)" }}>Paused</span>
                    <span className="tabular-nums" style={{ fontSize: 24, fontWeight: 500, color: "#6C47FF", fontFamily: "DM Sans, sans-serif" }}>
                     {fmtTimer(Math.max(ringResumeSession.duration_seconds - baseDurationRef.current, 0))}
                  </span>
                  <span className="text-[11px]" style={{ color: "rgba(108,71,255,0.6)" }}>
                    {fmtHours(todayTotal)} / {DAILY_GOAL_HOURS}h
                  </span>
                  <span className="text-[10px] mt-0.5 font-medium" style={{ color: "#6C47FF" }}>Resume session</span>
                </>
              ) : (
                <>
                  <span className="text-[10px] text-muted-foreground">Today</span>
                  <span className="tabular-nums" style={{ fontSize: 24, fontWeight: 500, color: "#1a1a1a", fontFamily: "DM Sans, sans-serif" }}>
                    {fmtTimer(0)}
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
              {!showColumnView && (
                <span className="text-xs font-medium ml-2" style={{ color: "#6C47FF" }}>
                  {fmtDuration(sessionsTotalSeconds)}
                </span>
              )}
            </h3>
            {!isPersonal && selectedGroupId && (
              <MemberSelectorPill
                groupId={selectedGroupId}
                selectedUserIds={memberFilter}
                onSelectionChange={setMemberFilter}
              />
            )}
          </div>

          {/* Member filtering is now handled by MemberSelectorPill above */}

          {/* Column view: Together or multi-select */}
          {!isPersonal && showColumnView ? (
            <div className="flex gap-2.5 overflow-x-auto scrollbar-hide pb-1">
              {columnMembers.map(m => {
                const mSessions = m.todaySessions.filter((s: StudySession) => !s.is_active);
                return (
                  <div key={m.user_id} className="flex-shrink-0" style={{ width: 150 }}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white" style={{ background: m.color }}>
                          {m.profile?.avatar_url
                            ? <img src={m.profile.avatar_url} className="w-5 h-5 rounded-full object-cover" />
                            : (m.profile?.display_name || "?")[0]}
                        </div>
                        <span className="text-xs font-medium" style={{ color: m.color }}>
                          {m.isMe ? "Me" : m.profile?.display_name}
                        </span>
                      </div>
                      {m.todayTotal > 0 && (
                        <span className="text-[11px] font-medium" style={{ color: m.color }}>
                          {fmtDuration(m.todayTotal)}
                        </span>
                      )}
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
                    <div
                      key={s.id}
                      className="relative overflow-hidden rounded-xl"
                      style={{
                        opacity: fadingSessionId === s.id ? 0 : 1,
                        transition: "opacity 0.3s ease",
                      }}
                      onClick={() => { if (swipedSessionId && swipedSessionId !== s.id) resetSwipe(); }}
                    >
                      {/* Delete button behind */}
                      {canSwipeDelete && !s.is_active && (
                        <div className="absolute right-0 top-0 bottom-0 flex items-center justify-center" style={{ width: 72 }}>
                          <button
                            onClick={() => { setDeleteConfirmId(s.id); }}
                            className="flex items-center justify-center gap-1 h-full w-full"
                            style={{ background: "#EF4444", color: "#fff", fontSize: 12, fontWeight: 600 }}
                          >
                            <Trash2 size={14} />
                            Delete
                          </button>
                        </div>
                      )}
                      {/* Swipeable row */}
                      <div
                        ref={el => { if (el) swipeRowRefs.current.set(s.id, el); }}
                        className="flex items-center gap-3 p-2.5 rounded-xl relative"
                        style={{
                          background: s.is_active ? "#FAF5FF" : "#fff",
                          transition: swipedSessionId === s.id ? "none" : "transform 0.2s ease",
                          zIndex: 1,
                        }}
                        onTouchStart={e => handleSwipeStart(e, s.id)}
                        onTouchMove={e => handleSwipeMove(e, s.id)}
                        onTouchEnd={e => handleSwipeEnd(e, s.id)}
                      >
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
                          <div className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
                            <span>{fmtTime(s.started_at)}{s.ended_at ? ` – ${fmtTime(s.ended_at)}` : " – now"}</span>
                            {isPersonal && s.group_id && studyEnabledGroupIds.has(s.group_id) && groupInfoMap[s.group_id] && (() => {
                              const gi = groupInfoMap[s.group_id];
                              return (
                                <span
                                  className="inline-flex items-center gap-1"
                                  style={{ fontSize: 9, fontWeight: 500, padding: "1px 6px", borderRadius: 99, background: "#F4F3F0", border: "0.5px solid rgba(0,0,0,0.08)" }}
                                >
                                  {gi.coverUrl ? (
                                    <img src={gi.coverUrl} className="w-3 h-3 rounded-full object-cover flex-shrink-0" />
                                  ) : (
                                    <span className="w-3 h-3 rounded-full flex items-center justify-center text-[6px] font-bold text-white flex-shrink-0" style={{ background: gi.color }}>
                                      {gi.name[0]}
                                    </span>
                                  )}
                                  {gi.name}
                                </span>
                              );
                            })()}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {!s.is_active && !activeSession && listResumeSessionId === s.id && (
                            <button
                              onClick={() => handleResumeFromList(s.id)}
                              className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                              style={{ background: "#EDE9FE", color: "#6C47FF" }}
                            >
                              Resume
                            </button>
                          )}
                          <span className="text-sm font-medium" style={{ color: "#6C47FF" }}>
                            {s.is_active ? fmtDuration(activeTick) : fmtDuration(s.duration_seconds)}
                          </span>
                        </div>
                      </div>
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

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this session?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteConfirmId(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSession}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CreateGroupModal open={showCreateGroup} onOpenChange={setShowCreateGroup} defaultPage="study" />
    </div>
  );
};

export default StudyPage;
