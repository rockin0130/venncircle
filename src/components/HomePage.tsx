import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { Plus, Sparkles, Clock, Check, Loader2, MoreVertical, Trash2, ChevronLeft, ChevronRight, Mic, MicOff, Volume2, Users, ArrowLeft, EyeOff, Eye, Settings, LayoutGrid, ListTodo, CalendarDays, Bell, Search, ChevronRightIcon } from "lucide-react";
import NotificationCenter from "@/components/NotificationCenter";
import UniversalSearch from "@/components/UniversalSearch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import GroupBadge from "@/components/GroupBadge";
import ItemActionMenu from "@/components/ItemActionMenu";
import PageGroupSelector from "@/components/PageGroupSelector";
import UserBadge from "@/components/UserBadge";
import TaskActionMenu from "@/components/TaskActionMenu";
import TeamDashboard from "@/components/TeamDashboard";
import AddItemModal from "@/components/AddItemModal";
import CongratsPopup from "@/components/CongratsPopup";
import HomeSectionCustomizer, { loadSectionPrefs, saveSectionPrefs, buildAllSections } from "@/components/HomeSectionCustomizer";
import { HomeWaterWidget, HomeWorkoutWidget, HomeSobrietyWidget, HomeHabitSectionWidget, HomeSpecialDaysWidget, HomeNutritionWidget, HomeShoppingWidget } from "@/components/HomeWidgets";
import HomeScheduledSection from "@/components/HomeScheduledSection";
import type { HabitSectionMeta } from "@/lib/habitSections";
import { useAppContext, Task, ScheduledEvent, GoogleCalendarEvent } from "@/context/AppContext";
import { formatTime } from "@/lib/formatTime";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useSpeechToText } from "@/hooks/useSpeechToText";
import { speak, stopSpeaking } from "@/lib/speak";
import { useGroupContext } from "@/hooks/useGroupContext";
import { cn } from "@/lib/utils";

type Filter = string; // "mine" | "partner" | "household" | "member:{userId}"
type AllViewFilter = string; // user IDs that are selected in All view

interface ClarificationState {
  question: string;
  suggestions: string[];
  context: string;
  conversationHistory: { role: string; content: string }[];
}

const HomePage = ({ onBackToLauncher, onOpenSettings, onNavigate }: { onBackToLauncher?: () => void; onOpenSettings?: () => void; onNavigate?: (page: string) => void }) => {
  const { profile, partner, groups, user } = useAuth();
  // Home page is ALWAYS the logged-in user's aggregate view — never influenced by global group selection
  const filter: Filter = "mine";
  const [input, setInput] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [clarification, setClarification] = useState<ClarificationState | null>(null);
  const [voiceMode, setVoiceMode] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [congratsType, setCongratsType] = useState<"task" | "habit" | null>(null);
  const [showCustomizer, setShowCustomizer] = useState(false);
  const [sectionOrder, setSectionOrder] = useState<string[]>([]);
  const [sectionVisible, setSectionVisible] = useState<Set<string>>(new Set());
  const [selectedSobrietyIds, setSelectedSobrietyIds] = useState<string[]>([]);
  const [selectedSpecialDayIds, setSelectedSpecialDayIds] = useState<string[]>([]);
  const [selectedHabitSubIds, setSelectedHabitSubIds] = useState<string[]>([]);
  const {
    habits, toggleHabit, addHabit, removeHabit, events, tasks, toggleTask, toggleEventCompletion, addTask, addEvent, removeEvent, removeTask, updateTask, rescheduleEvent,
    partnerHabits, partnerEvents, partnerTasks, googleCalendarEvents, hideGcalEvent, toggleGcalCompletion, toggleEventVisibility, designateGcalEvent,
  } = useAppContext();

  const voiceModeRef = useRef(voiceMode);
  const aiRequestInFlightRef = useRef(false);
  useEffect(() => { voiceModeRef.current = voiceMode; }, [voiceMode]);

  // Load section preferences — always use null (aggregate/personal view)
  useEffect(() => {
    const prefs = loadSectionPrefs(null);
    setSectionOrder(prefs.order);
    setSectionVisible(prefs.visible);
    setSelectedSobrietyIds(prefs.selectedSobrietyIds);
    setSelectedSpecialDayIds(prefs.selectedSpecialDayIds);
    setSelectedHabitSubIds(prefs.selectedHabitSubIds);
  }, []);

  const handleSaveSections = (
    order: string[],
    visible: Set<string>,
    sobrietyIds: string[],
    specialDayIds: string[],
    habitSubIds: string[]
  ) => {
    setSectionOrder(order);
    setSectionVisible(visible);
    setSelectedSobrietyIds(sobrietyIds);
    setSelectedSpecialDayIds(specialDayIds);
    setSelectedHabitSubIds(habitSubIds);
    saveSectionPrefs(null, order, visible, sobrietyIds, specialDayIds, habitSubIds);
  };

  const { listening, start: startListening, stop: stopListening, isSupported: speechSupported } = useSpeechToText({
    onResult: (transcript) => {
      if (voiceModeRef.current) {
        setInput(transcript);
        handleAiSchedule(transcript);
      } else {
        setInput((prev) => (prev ? prev + " " + transcript : transcript));
      }
    },
  });

  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const speakResponse = (text: string, thenListen?: boolean) => {
    setIsSpeaking(true);
    speak(text, () => {
      setIsSpeaking(false);
      if (thenListen && voiceModeRef.current && speechSupported) {
        setTimeout(() => startListening(), 300);
      }
    });
  };

  const handleQuickAdd = () => {
    if (!input.trim()) return;
    addTask({
      title: input,
      time: "",
      tag: "Personal",
      assignee: "me",
    });
    setInput("");
  };

  const toDateParts = (dateStr?: string) => {
    if (dateStr) {
      const [y, m, d] = dateStr.split("-").map(Number);
      return { day: d, month: m - 1, year: y };
    }
    return { day: selectedDate.getDate(), month: selectedDate.getMonth(), year: selectedDate.getFullYear() };
  };

  const normalizeValue = (value?: string) => (value || "").trim().toLowerCase();

  const getEventSignature = (payload: {
    title?: string;
    time?: string;
    day: number;
    month: number;
    year: number;
    assignee: "me" | "partner" | "both";
  }) => {
    return [
      normalizeValue(payload.title),
      normalizeValue(payload.time || "All day"),
      payload.day,
      payload.month,
      payload.year,
      payload.assignee,
    ].join("|");
  };

  const processAction = async (action: any, seenSignatures?: Set<string>) => {
    const actionType = action.action_type || action.type || (action.label ? "add_habit" : "create_event");

    if (actionType === "add_habit") {
      const label = action.label || action.title;
      const category = action.category || "other";
      if (!label) return { created: false };
      await addHabit(label, category);
      toast.success(`Habit added: ${label}`, { description: `Added to ${category} habits` });
      return { created: true };
    }

    if (!action.title) return { created: false };

    const { day, month, year } = toDateParts(action.date);
    const assignee = (action.assignee || "me") as "me" | "partner" | "both";
    const signature = getEventSignature({
      title: action.title,
      time: action.time,
      day,
      month,
      year,
      assignee,
    });

    const isDuplicateInBatch = seenSignatures?.has(signature);
    const isDuplicateInState = events.some((event) =>
      getEventSignature({
        title: event.title,
        time: event.time,
        day: event.day,
        month: event.month,
        year: event.year,
        assignee: event.user,
      }) === signature
    );

    if (isDuplicateInBatch || isDuplicateInState) {
      return { created: false, duplicate: true };
    }

    seenSignatures?.add(signature);

    await addEvent({
      title: action.title,
      time: action.time || "All day",
      description: action.description || "",
      day,
      month,
      year,
      user: assignee,
    });

    toast.success(`Scheduled: ${action.title}`, {
      description: `${action.date || "today"} ${action.time || "All day"}${assignee !== "me" ? ` · ${assignee === "partner" ? partner?.display_name || "Partner" : "Both"}` : ""}`,
    });

    return { created: true };
  };

  const handleAiSchedule = async (overrideText?: string, history?: { role: string; content: string }[]) => {
    const textToSend = overrideText || input;
    if (!textToSend.trim() || aiRequestInFlightRef.current) return;

    aiRequestInFlightRef.current = true;
    setAiLoading(true);

    try {
      const body: any = { text: textToSend, timezone: userTimezone };
      if (history && history.length > 0) {
        body.conversationHistory = history;
      }

      // Pass current schedule and habits context for delete/query operations
      const sd = selectedDate;
      const todayEvents = events.filter((e) => e.day === sd.getDate() && e.month === sd.getMonth() && e.year === sd.getFullYear());
      const todayTasks = tasks.filter((t) => t.scheduledDay === sd.getDate() && t.scheduledMonth === sd.getMonth() && t.scheduledYear === sd.getFullYear());

      body.currentSchedule = [
        ...todayEvents.map((e) => ({ id: e.id, title: e.title, time: e.time, type: "event" })),
        ...todayTasks.map((t) => ({ id: t.id, title: t.title, time: t.time, type: "task" })),
      ];
      body.currentHabits = habits.map((h) => ({ id: h.id, label: h.label, category: h.category, done: h.done }));

      const { data: rawData, error } = await supabase.functions.invoke("ai-schedule", { body });
      if (error) throw error;

      const data = typeof rawData === "string" ? JSON.parse(rawData) : rawData;
      if (data.error) throw new Error(data.error);

      if (data.type === "clarification") {
        const newHistory = [...(history || [])];
        newHistory.push({ role: "user", content: textToSend });
        newHistory.push({ role: "assistant", content: data.question });

        setClarification({
          question: data.question,
          suggestions: data.suggestions || [],
          context: data.context || "",
          conversationHistory: newHistory,
        });

        if (voiceMode) {
          speakResponse(data.spokenResponse || data.question, true);
        }

        setInput("");
        return;
      }

      // Handle query responses
      if (data.type === "query_response") {
        toast.info(data.answer, { duration: 6000 });
        if (voiceMode && data.spokenResponse) {
          speakResponse(data.spokenResponse, true);
        }
        setInput("");
        setClarification(null);
        return;
      }

      // Handle delete actions
      if (data.type === "delete_item") {
        const { item_id, item_type, item_title } = data;
        if (item_type === "event") {
          removeEvent(item_id);
        } else if (item_type === "task") {
          removeTask(item_id);
        } else if (item_type === "habit") {
          removeHabit(item_id);
        }
        toast.success(`Deleted: ${item_title}`);
        if (voiceMode && data.spokenResponse) {
          speakResponse(data.spokenResponse, true);
        }
        setInput("");
        setClarification(null);
        return;
      }

      if (data.type === "multi" && Array.isArray(data.actions)) {
        const seenSignatures = new Set<string>();
        let createdCount = 0;

        for (const action of data.actions) {
          if (action.action_type === "delete_item") {
            if (action.item_type === "event") removeEvent(action.item_id);
            else if (action.item_type === "task") removeTask(action.item_id);
            else if (action.item_type === "habit") removeHabit(action.item_id);
            toast.success(`Deleted: ${action.item_title || "item"}`);
            createdCount++;
          } else {
            const result = await processAction(action, seenSignatures);
            if (result.created) createdCount += 1;
          }
        }

        if (createdCount > 1) {
          toast.success(`✨ ${createdCount} actions completed!`);
        } else if (createdCount === 0) {
          toast.info("No new item created", { description: "That request matches an existing scheduled item." });
        }
      } else {
        const result = await processAction(data, new Set<string>());
        if (!result.created && result.duplicate) {
          toast.info("Already scheduled", { description: "That event already exists." });
        }
      }

      if (voiceMode && data.spokenResponse) {
        speakResponse(data.spokenResponse, true);
      }

      setInput("");
      setClarification(null);
    } catch (e: any) {
      console.error("AI schedule error:", e);
      toast.error("AI couldn't parse that", { description: e.message });
      if (voiceMode) {
        speakResponse("Sorry, I couldn't understand that. Could you try again?", true);
      }
    } finally {
      setAiLoading(false);
      aiRequestInFlightRef.current = false;
    }
  };

  const handleClarificationReply = (reply: string) => {
    if (!clarification) return;
    const history = [...clarification.conversationHistory];
    setClarification(null);
    setInput("");
    handleAiSchedule(reply, history);
  };

  const toggleVoiceMode = () => {
    if (voiceMode) {
      setVoiceMode(false);
      stopListening();
      stopSpeaking();
      setIsSpeaking(false);
    } else {
      setVoiceMode(true);
      if (speechSupported) {
        startListening();
      }
    }
  };

  // Habit sections from context
  const { habitSections, waterGoal, waterIntake } = useAppContext();

  // Effective habit sub-items: just the habit category toggles from preferences
  const effectiveHabitSubIds = selectedHabitSubIds;

  const { showGoogleCalendar } = useGroupContext();

  // Home page is always the aggregate "mine" view — no group/member filtering
  const isViewingPartner = false;

  // Morning habits: show own when "mine", partner's when "partner" — use first habit section
  const myMorningHabits = habits.filter((h) => h.category === "morning");
  const displayMorningHabits = myMorningHabits;

  const handleToggleHabit = useCallback((id: string) => {
    const habit = myMorningHabits.find((h) => h.id === id);
    if (habit && !habit.done) {
      setCongratsType("habit");
    }
    toggleHabit(id);
  }, [myMorningHabits, toggleHabit]);

  const sd = selectedDate;
  const selDay = sd.getDate();
  const selMonth = sd.getMonth();
  const selYear = sd.getFullYear();
  const selDateStr = `${selYear}-${String(selMonth + 1).padStart(2, "0")}-${String(selDay).padStart(2, "0")}`;
  const isTodayDate = (() => { const d = new Date(); return selDay === d.getDate() && selMonth === d.getMonth() && selYear === d.getFullYear(); })();

  const isSelectedDate = (day?: number | null, month?: number | null, year?: number | null) => {
    if (day == null || month == null || year == null) return true;
    return day === selDay && month === selMonth && year === selYear;
  };

  // Home page is always "mine" aggregate — show all user's own items across all groups
  const myResponsible = tasks.filter((t) =>
    (t.assignee === "me" || t.assignee === "both") && isSelectedDate(t.scheduledDay, t.scheduledMonth, t.scheduledYear)
  );
  const partnerAssignedToMe = partnerTasks.filter((t) =>
    (t.assignee === "partner" || t.assignee === "both") && isSelectedDate(t.scheduledDay, t.scheduledMonth, t.scheduledYear)
  );
  const seenTaskKeys = new Set(myResponsible.map((t) => `${t.title}|${t.time}|${t.scheduledDay}`));
  const uniquePartnerTasks = partnerAssignedToMe.filter((t) => !seenTaskKeys.has(`${t.title}|${t.time}|${t.scheduledDay}`));
  const dayTasks = [...myResponsible, ...uniquePartnerTasks];

  const myEvents = events.filter((e) =>
    (e.user === "me" || e.user === "both") && e.day === selDay && e.month === selMonth && e.year === selYear
  );
  const partnerEventsForMe = partnerEvents.filter((e) =>
    (e.user === "partner" || e.user === "both") && e.day === selDay && e.month === selMonth && e.year === selYear
  );
  const seenEventKeys = new Set(myEvents.map((e) => `${e.title}|${e.time}|${e.day}`));
  const uniquePartnerEventsForMe = partnerEventsForMe.filter((e) => !seenEventKeys.has(`${e.title}|${e.time}|${e.day}`));
  const visibleEvents = [...myEvents, ...uniquePartnerEventsForMe];

  // Household views use unfiltered data for aggregate
  const householdMyTasks = useMemo(() =>
    tasks.filter((t) => isSelectedDate(t.scheduledDay, t.scheduledMonth, t.scheduledYear)),
    [tasks, selDay, selMonth, selYear]
  );
  const householdMyEvents = useMemo(() =>
    events.filter((e) => e.day === selDay && e.month === selMonth && e.year === selYear),
    [events, selDay, selMonth, selYear]
  );
  const householdPartnerTasks = useMemo(() =>
    partnerTasks.filter((t) => isSelectedDate(t.scheduledDay, t.scheduledMonth, t.scheduledYear)),
    [partnerTasks, selDay, selMonth, selYear]
  );
  const householdPartnerEvents = useMemo(() =>
    partnerEvents.filter((e) => e.day === selDay && e.month === selMonth && e.year === selYear),
    [partnerEvents, selDay, selMonth, selYear]
  );

  const hasSpecificTime = (time?: string) => Boolean(time) && time !== "" && time !== "All day";
  const isTaskScheduled = (t: Task) => t.scheduledDay != null && t.scheduledMonth != null && t.scheduledYear != null;
  const isTaskTimed = (t: Task) => hasSpecificTime(t.time);

  // Helper: parse any time representation to minutes for sorting
  const toSortMinutes = (time?: string, isoStart?: string): number => {
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
    // Try ISO
    const d = new Date(time);
    if (!isNaN(d.getTime())) return d.getHours() * 60 + d.getMinutes();
    return -1;
  };

  // Google Calendar events for the selected date — in individual views include shared items
  const gcalEventsForDay = showGoogleCalendar ? googleCalendarEvents.filter((ge) => {
    const startDate = ge.start?.split("T")[0] || ge.start;
    const selDateStr = `${selYear}-${String(selMonth + 1).padStart(2, "0")}-${String(selDay).padStart(2, "0")}`;
    if (startDate !== selDateStr) return false;
    const assignee = ge.assignee || "me";
    if (filter === "mine") return assignee === "me" || assignee === "both";
    return assignee === "me" || assignee === "both";
    return true; // household shows all
  }) : [];

  // ── Build unified item types for sorting ──
  type UnifiedHomeItem = 
    | { kind: "task"; data: Task; sortMinutes: number }
    | { kind: "event"; data: ScheduledEvent; sortMinutes: number }
    | { kind: "gcal"; data: GoogleCalendarEvent; sortMinutes: number };

  // Scheduled tasks = tasks that have a date (whether timed or all-day)
  const scheduledTimedTasks = dayTasks.filter((t) => isTaskScheduled(t) && isTaskTimed(t));
  const scheduledAllDayTasks = dayTasks.filter((t) => isTaskScheduled(t) && !isTaskTimed(t));
  // To Do tasks = tasks that are NOT scheduled to any date, filtered by due date visibility
  const todoTasksRaw = dayTasks.filter((t) => !isTaskScheduled(t));
  const todoTasks = todoTasksRaw.filter((t) => {
    if (t.done) return false; // completed tasks hidden
    if (!t.dueDate) return true; // no due date = always visible
    const viewDate = new Date(selectedDate);
    viewDate.setHours(0, 0, 0, 0);
    const due = new Date(t.dueDate + "T00:00:00");
    const notice = t.priorNoticeDays ?? 0;
    if (notice === -1) return true; // "Starting today" = always visible
    const showFrom = new Date(due);
    showFrom.setDate(showFrom.getDate() - notice);
    return viewDate >= showFrom;
  });

  const timedEvents = visibleEvents.filter((e) => hasSpecificTime(e.time));
  const allDayEvents = visibleEvents.filter((e) => !hasSpecificTime(e.time));
  const gcalTimed = gcalEventsForDay.filter((ge) => !ge.allDay);
  const gcalAllDay = gcalEventsForDay.filter((ge) => ge.allDay);

  // Merge all timed items into one sorted list
  const allTimedItems: UnifiedHomeItem[] = useMemo(() => {
    const items: UnifiedHomeItem[] = [
      ...scheduledTimedTasks.map((t): UnifiedHomeItem => ({ kind: "task", data: t, sortMinutes: toSortMinutes(t.time) })),
      ...timedEvents.map((e): UnifiedHomeItem => ({ kind: "event", data: e, sortMinutes: toSortMinutes(e.time) })),
      ...gcalTimed.map((ge): UnifiedHomeItem => ({ kind: "gcal", data: ge, sortMinutes: toSortMinutes(undefined, ge.start) })),
    ];
    items.sort((a, b) => a.sortMinutes - b.sortMinutes);
    return items;
  }, [scheduledTimedTasks, timedEvents, gcalTimed]);

  // Merge all-day items (shown at top of Scheduled)
  const allDayItems: UnifiedHomeItem[] = useMemo(() => [
    ...scheduledAllDayTasks.map((t): UnifiedHomeItem => ({ kind: "task", data: t, sortMinutes: -1 })),
    ...allDayEvents.map((e): UnifiedHomeItem => ({ kind: "event", data: e, sortMinutes: -1 })),
    ...gcalAllDay.map((ge): UnifiedHomeItem => ({ kind: "gcal", data: ge, sortMinutes: -1 })),
  ], [scheduledAllDayTasks, allDayEvents, gcalAllDay]);

  const isToday = selDay === new Date().getDate() && selMonth === new Date().getMonth() && selYear === new Date().getFullYear();

  const shiftDate = (days: number) => {
    const d = new Date(sd);
    d.setDate(d.getDate() + days);
    setSelectedDate(d);
  };

  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  // Determine if we can toggle items (only own items)
  

  // Notification badge count (simple: incomplete habits after 6pm + upcoming events)
  const notificationCount = useMemo(() => {
    const now = new Date();
    let count = 0;
    if (now.getHours() >= 18) {
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      count += habits.filter((h) => !h.completionDates.includes(todayStr)).length > 0 ? 1 : 0;
    }
    return count;
  }, [habits]);

  const dateHeaderLabel = (() => {
    const weekday = sd.toLocaleDateString("en-US", { weekday: "long" });
    const monthDay = sd.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    return `${weekday}, ${monthDay}`;
  })();

  return (
    <div className="px-5">
      {congratsType && (
        <CongratsPopup type={congratsType} show={true} onClose={() => setCongratsType(null)} />
      )}

      <header className="pt-10 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-0.5 flex-1 min-w-0">
            <button onClick={() => shiftDate(-1)} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-secondary/60 active:scale-95 transition-all" style={{ color: "hsl(25, 30%, 45%)" }}>
              <ChevronLeft size={20} />
            </button>
            <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
              <PopoverTrigger asChild>
                <button
                  className="px-2 py-1 rounded-xl text-base font-bold tracking-tight transition-colors hover:bg-secondary/50 truncate"
                  style={{ fontFamily: "'Georgia', serif", color: "hsl(25, 30%, 25%)" }}
                >
                  {dateHeaderLabel}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={sd}
                  onSelect={(date) => {
                    if (date) {
                      setSelectedDate(date);
                      setDatePickerOpen(false);
                    }
                  }}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
            <button onClick={() => shiftDate(1)} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-secondary/60 active:scale-95 transition-all" style={{ color: "hsl(25, 30%, 45%)" }}>
              <ChevronRight size={20} />
            </button>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowCustomizer(true)}
              className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-secondary/60 transition-colors"
              style={{ color: "hsl(25, 25%, 45%)" }}
              aria-label="Customize layout"
            >
              <LayoutGrid size={17} />
            </button>
            <button
              onClick={() => setNotificationsOpen(true)}
              className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-secondary/60 transition-colors relative"
              style={{ color: "hsl(25, 25%, 45%)" }}
              aria-label="Notifications"
            >
              <Bell size={17} />
              {notificationCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-destructive" />
              )}
            </button>
            <button
              onClick={() => setSearchOpen(true)}
              className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-secondary/60 transition-colors"
              style={{ color: "hsl(25, 25%, 45%)" }}
              aria-label="Search"
            >
              <Search size={17} />
            </button>
          </div>
        </div>
        {isToday && (
          <p className="text-xs font-semibold mt-1 ml-9" style={{ color: "hsl(25, 50%, 55%)" }}>
            Today
          </p>
        )}
      </header>

      {/* Home page is always the logged-in user's personal view — no group or member selectors */}

      {/* Voice Mode Overlay */}
      <AnimatePresence>
        {voiceMode && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/20 rounded-xl p-6 mb-5 text-center"
          >
            <div className="flex flex-col items-center gap-4">
              <div className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${
                listening
                  ? "bg-destructive/20 animate-pulse"
                  : isSpeaking
                  ? "bg-primary/20 animate-pulse"
                  : "bg-secondary"
              }`}>
                {listening ? (
                  <Mic size={32} className="text-destructive" />
                ) : isSpeaking ? (
                  <Volume2 size={32} className="text-primary" />
                ) : (
                  <Mic size={32} className="text-muted-foreground" />
                )}
              </div>
              <p className="text-sm font-medium text-foreground">
                {listening
                  ? "Listening..."
                  : isSpeaking
                  ? "Speaking..."
                  : aiLoading
                  ? "Thinking..."
                  : "Tap to speak"}
              </p>
              {!listening && !isSpeaking && !aiLoading && (
                <button
                  onClick={startListening}
                  className="px-5 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-semibold"
                >
                  Tap to Speak
                </button>
              )}
              <button
                onClick={toggleVoiceMode}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Exit Voice Mode
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Clarification Card */}
      <AnimatePresence>
        {clarification && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/20 rounded-xl p-4 mb-5"
          >
            <div className="flex items-start gap-2 mb-3">
              <Sparkles size={16} className="text-purple-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm font-medium text-foreground">{clarification.question}</p>
            </div>
            <div className="flex flex-wrap gap-2 mb-3">
              {clarification.suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => handleClarificationReply(s)}
                  className="px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && input.trim()) {
                    e.preventDefault();
                    handleClarificationReply(input);
                  }
                }}
                placeholder="Or type your answer..."
                className="flex-1 bg-card rounded-lg px-3 py-2 text-sm outline-none placeholder:text-muted-foreground border border-border min-w-0"
              />
              <button
                onClick={() => { setClarification(null); setInput(""); }}
                className="px-3 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground bg-secondary"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>


      {(
        <>
          {sectionOrder.filter((id) => {
            // Home page always shows all toggled-on sections — no group shared_pages filtering
            return sectionVisible.has(id);
          }).map((sectionId) => {
            switch (sectionId) {
              case "scheduled":
                return (
                  <HomeScheduledSection
                    key={sectionId}
                    allDayItems={allDayItems}
                    allTimedItems={allTimedItems}
                    isToday={isToday}
                    isViewingPartner={isViewingPartner}
                    onToggleTask={toggleTask}
                    onToggleEvent={toggleEventCompletion}
                    onToggleGcal={toggleGcalCompletion}
                    onCongrats={() => setCongratsType("task")}
                    onNavigate={onNavigate}
                    enabledHabitCategories={effectiveHabitSubIds.filter(id => id.startsWith("habit:")).map(id => id.replace("habit:", ""))}
                    selectedDate={selectedDate}
                    isViewingMemberName={undefined}
                  />
                );

              case "todo":
                return (
                  <TodoListSection
                    key={sectionId}
                    tasks={todoTasks}
                    onToggle={isViewingPartner ? undefined : toggleTask}
                    onCongrats={() => setCongratsType("task")}
                    readOnly={isViewingPartner}
                    addTask={addTask}
                    selectedDate={selectedDate}
                    memberFilters={[]}
                  />
                );

              case "water":
                return (
                  <section key={sectionId} className="mb-6">
                    <HomeWaterWidget selectedDate={selectedDate} />
                  </section>
                );

              case "nutrition":
                return (
                  <section key={sectionId} className="mb-6">
                    <HomeNutritionWidget selectedDate={selectedDate} />
                  </section>
                );

              case "workout":
                return (
                  <section key={sectionId} className="mb-6">
                    <HomeWorkoutWidget selectedDate={selectedDate} />
                  </section>
                );

              case "sobriety":
                return (
                  <section key={sectionId} className="mb-6">
                    <HomeSobrietyWidget selectedDate={selectedDate} selectedTrackerIds={selectedSobrietyIds} />
                  </section>
                );

              case "special-days":
                return (
                  <section key={sectionId} className="mb-6">
                    <HomeSpecialDaysWidget selectedDate={selectedDate} selectedDayIds={selectedSpecialDayIds} />
                  </section>
                );

              case "shopping":
                return (
                  <section key={sectionId} className="mb-6">
                    <HomeShoppingWidget />
                  </section>
                );

              default:
                return null;
            }
          })}
        </>
      )}

      <HomeSectionCustomizer
        open={showCustomizer}
        onClose={() => setShowCustomizer(false)}
        order={sectionOrder}
        visible={sectionVisible}
        selectedSobrietyIds={selectedSobrietyIds}
        selectedSpecialDayIds={selectedSpecialDayIds}
        selectedHabitSubIds={selectedHabitSubIds}
        onSave={handleSaveSections}
      />
      <AddItemModal open={showAddModal} onClose={() => setShowAddModal(false)} />
      <NotificationCenter open={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
      <UniversalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />

    </div>
  );
};

const TaskCard = ({ task, onToggle, onCongrats, readOnly }: { task: Task; onToggle?: (id: string) => void; onCongrats: () => void; readOnly?: boolean }) => {
  const handleToggle = () => {
    if (readOnly || !onToggle) return;
    if (!task.done) {
      onCongrats();
    }
    onToggle(task.id);
  };

  const hasDate = task.scheduledDay != null && task.scheduledMonth != null && task.scheduledYear != null;
  const dateLabel = hasDate
    ? new Date(task.scheduledYear!, task.scheduledMonth!, task.scheduledDay!).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;

  return (
    <motion.div
      layout
      className={`bg-card rounded-xl p-4 shadow-card border transition-transform active:scale-[0.99] ${task.done ? "border-habit-green/50" : "border-border"}`}
    >
      {(task.time || dateLabel) && (
        <div className="flex items-center gap-2 mb-2">
          <Clock size={13} className="text-muted-foreground" />
          {task.time ? <span className="text-xs font-medium text-muted-foreground">{formatTime(task.time)}</span> : null}
          {dateLabel ? <span className="text-xs text-muted-foreground">· {dateLabel}</span> : null}
        </div>
      )}
      <div className="flex items-center gap-3">
        <button
          onClick={handleToggle}
          disabled={readOnly}
          className={`w-6 h-6 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
            task.done ? "bg-habit-green border-habit-green" : "border-muted"
          } ${readOnly ? "opacity-60" : ""}`}
        >
          {task.done && <Check size={14} className="text-primary-foreground" />}
        </button>
        <span className={`flex-1 text-[15px] font-medium tracking-body ${task.done ? "line-through opacity-40" : ""}`}>
          {task.title}
        </span>
        <UserBadge user={task.assignee} />
        {!readOnly && <TaskActionMenu taskId={task.id} />}
      </div>
      <div className="mt-2 ml-9 flex items-center gap-2">
        <GroupBadge groupId={task.groupId} />
      </div>
    </motion.div>
  );
};

const EventCard = ({ event, onToggle, onRemove, onToggleVisibility, onReschedule, onCongrats, readOnly }: {
  event: ScheduledEvent;
  onToggle?: (id: string) => void;
  onRemove?: (id: string) => void;
  onToggleVisibility?: (id: string) => void;
  onReschedule?: (id: string, day: number, month: number, year: number) => void;
  onCongrats: () => void;
  readOnly?: boolean;
}) => {
  const dateLabel = new Date(event.year, event.month, event.day).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const tomorrow = new Date(event.year, event.month, event.day);
  tomorrow.setDate(tomorrow.getDate() + 1);

  return (
    <motion.div
      layout
      className={`bg-card rounded-xl p-4 shadow-card border transition-transform active:scale-[0.99] ${event.done ? "border-habit-green/50" : event.hiddenFromPartner ? "border-muted/50 opacity-70" : "border-border"}`}
    >
      {(event.time && event.time !== "All day") && (
        <div className="flex items-center gap-2 mb-2">
          <Clock size={13} className="text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">{formatTime(event.time)}</span>
          <span className="text-xs text-muted-foreground">· {dateLabel}</span>
          {event.hiddenFromPartner && <span className="text-[10px] font-semibold text-muted-foreground bg-secondary px-1.5 py-0.5 rounded flex items-center gap-1"><EyeOff size={10} /> Hidden</span>}
          <GroupBadge groupId={event.groupId} />
        </div>
      )}
      <div className="flex items-center gap-3">
        <button
          onClick={() => {
            if (readOnly || !onToggle) return;
            if (!event.done) onCongrats();
            onToggle(event.id);
          }}
          disabled={readOnly || !onToggle}
          className={`w-6 h-6 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
            event.done ? "bg-habit-green border-habit-green" : "border-muted"
          } ${(readOnly || !onToggle) ? "opacity-60" : ""}`}
        >
          {event.done && <Check size={14} className="text-primary-foreground" />}
        </button>
        <span className={`flex-1 text-[15px] font-medium tracking-body ${event.done ? "line-through opacity-40" : ""}`}>
          {event.title}
        </span>
        <UserBadge user={event.user} />
        {!readOnly && (onRemove || onToggleVisibility || onReschedule) && (
          <ItemActionMenu
            hidden={event.hiddenFromPartner}
            onToggleVisibility={onToggleVisibility ? () => { onToggleVisibility(event.id); toast.success(event.hiddenFromPartner ? "Now visible to others" : "Hidden from others"); } : undefined}
            onMoveToTomorrow={onReschedule ? () => { onReschedule(event.id, tomorrow.getDate(), tomorrow.getMonth(), tomorrow.getFullYear()); toast.success("Moved to tomorrow"); } : undefined}
            onMoveToDate={onReschedule ? (d) => { onReschedule(event.id, d.getDate(), d.getMonth(), d.getFullYear()); toast.success("Event rescheduled"); } : undefined}
            onRemove={() => { if (onRemove) { onRemove(event.id); toast.success("Event deleted"); } }}
          />
        )}
      </div>
      {(!event.time || event.time === "All day") && (
        <div className="mt-2 ml-9 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{dateLabel} · All day</span>
          {event.hiddenFromPartner && <span className="text-[10px] font-semibold text-muted-foreground bg-secondary px-1.5 py-0.5 rounded flex items-center gap-1"><EyeOff size={10} /> Hidden</span>}
          <GroupBadge groupId={event.groupId} />
        </div>
      )}
    </motion.div>
  );
};

const GCalEventCard = ({ event, onToggle, onHide, onDesignate, onCongrats }: {
  event: GoogleCalendarEvent;
  onToggle?: (eventId: string) => void;
  onHide?: (eventId: string) => void;
  onDesignate?: (eventId: string, assignee: "me" | "partner" | "both") => void;
  onCongrats?: () => void;
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const timeStr = event.allDay
    ? "All day"
    : event.start
    ? new Date(event.start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : "";

  const handleToggle = () => {
    if (!onToggle) return;
    if (!event.done && onCongrats) onCongrats();
    onToggle(event.id);
  };

  return (
    <motion.div
      layout
      className={`bg-card rounded-xl p-4 shadow-card border transition-transform active:scale-[0.99] ${event.done ? "border-habit-green/50" : "border-primary/20"}`}
    >
      {timeStr && timeStr !== "All day" && (
        <div className="flex items-center gap-2 mb-2">
          <Clock size={13} className="text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">{timeStr}</span>
          <span className="text-[10px] font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded">Google</span>
        </div>
      )}
      <div className="flex items-center gap-3">
        <button
          onClick={handleToggle}
          disabled={!onToggle}
          className={`w-6 h-6 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
            event.done ? "bg-habit-green border-habit-green" : "border-muted"
          } ${!onToggle ? "opacity-60" : ""}`}
        >
          {event.done && <Check size={14} className="text-primary-foreground" />}
        </button>
        <span className={`flex-1 text-[15px] font-medium tracking-body ${event.done ? "line-through opacity-40" : ""}`}>{event.title}</span>
        <UserBadge user={event.assignee || "me"} />
        {event.htmlLink && (
          <a href={event.htmlLink} target="_blank" rel="noopener noreferrer" className="text-xs text-primary font-medium">
            Open
          </a>
        )}
        {(onHide || onDesignate) && (
          <div className="relative">
            <button onClick={() => setMenuOpen((v) => !v)} className="p-1 text-muted-foreground">
              <MoreVertical size={16} />
            </button>
            {menuOpen && (
              <>
                <button className="fixed inset-0 z-40 cursor-default" onClick={() => setMenuOpen(false)} aria-label="Close menu" />
                <div className="absolute right-0 top-8 z-50 min-w-[180px] rounded-xl border border-border bg-card shadow-card overflow-hidden">
                  {onDesignate && (
                    <>
                      <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Assign to</div>
                      {(["me", "partner", "both"] as const).map((opt) => (
                        <button
                          key={opt}
                          onClick={() => { onDesignate(event.id, opt); setMenuOpen(false); toast.success(`Assigned as ${opt === "me" ? "Mine" : opt === "partner" ? "Partner's" : "Together"}`); }}
                          className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-secondary ${event.assignee === opt ? "text-primary font-semibold" : "text-foreground"}`}
                        >
                          <UserBadge user={opt} />
                          {opt === "me" ? "Mine" : opt === "partner" ? "Partner's" : "Together"}
                          {event.assignee === opt && <Check size={14} className="ml-auto text-primary" />}
                        </button>
                      ))}
                    </>
                  )}
                  {onHide && (
                    <button
                      onClick={() => { onHide(event.id); setMenuOpen(false); toast.success("Hidden from others"); }}
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-destructive hover:bg-destructive/10"
                    >
                      <EyeOff size={14} /> Hide from others
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
      {timeStr === "All day" && (
        <div className="mt-2 ml-9 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">All day</span>
          <span className="text-[10px] font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded">Google</span>
        </div>
      )}
    </motion.div>
  );
};

const TodoListSection = ({ tasks, onToggle, onCongrats, readOnly, addTask, selectedDate, memberFilters }: {
  tasks: Task[];
  onToggle?: (id: string) => void;
  onCongrats: () => void;
  readOnly?: boolean;
  addTask: (task: Omit<Task, "id" | "done">) => void;
  selectedDate: Date;
  memberFilters: { id: string; label: string; userId?: string }[];
}) => {
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newAssignee, setNewAssignee] = useState("me");
  const [newDueDate, setNewDueDate] = useState<Date | undefined>(undefined);
  const [dueDatePickerOpen, setDueDatePickerOpen] = useState(false);
  const [newPriorNotice, setNewPriorNotice] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  const resetForm = () => {
    setNewTitle("");
    setNewAssignee("me");
    setNewDueDate(undefined);
    setNewPriorNotice(0);
    setAdding(false);
  };

  const handleAdd = () => {
    if (!newTitle.trim()) return;
    const dueDateStr = newDueDate
      ? `${newDueDate.getFullYear()}-${String(newDueDate.getMonth() + 1).padStart(2, "0")}-${String(newDueDate.getDate()).padStart(2, "0")}`
      : null;
    addTask({
      title: newTitle.trim(),
      time: "",
      tag: "Personal",
      assignee: newAssignee as "me" | "partner" | "both",
      dueDate: dueDateStr,
      priorNoticeDays: newPriorNotice,
    });
    resetForm();
  };

  const pendingTasks = tasks.filter((t) => !t.done);
  const doneTasks = tasks.filter((t) => t.done);

  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <ListTodo size={18} className="text-muted-foreground" />
          <h2 className="text-lg font-semibold tracking-display">To Do List</h2>
          {tasks.length > 0 && (
            <span className="text-xs font-medium text-muted-foreground bg-secondary px-1.5 py-0.5 rounded-md">
              {pendingTasks.length}
            </span>
          )}
        </div>
        {!readOnly && (
          <button
            onClick={() => setAdding(true)}
            className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary hover:bg-primary/20 transition-colors"
          >
            <Plus size={15} />
          </button>
        )}
      </div>

      {/* Inline quick-add */}
      <AnimatePresence>
        {adding && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden mb-3"
          >
            <div className="bg-card rounded-xl border border-primary/30 shadow-card overflow-hidden">
              {/* Title row */}
              <div className="flex items-center gap-2 p-2 pl-4">
                <input
                  ref={inputRef}
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAdd();
                    if (e.key === "Escape") resetForm();
                  }}
                  placeholder="What do you need to do?"
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground min-w-0"
                />
                <button
                  onClick={handleAdd}
                  disabled={!newTitle.trim()}
                  className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-40"
                >
                  Add
                </button>
                <button
                  onClick={resetForm}
                  className="px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  ✕
                </button>
              </div>

              {/* Options row: due date + assignee */}
              <div className="px-3 pb-3 pt-1 space-y-2">
                {/* Due date chip */}
                <div className="flex items-center gap-2 flex-wrap">
                  <Popover open={dueDatePickerOpen} onOpenChange={setDueDatePickerOpen}>
                    <PopoverTrigger asChild>
                      <button className={cn(
                        "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-all",
                        newDueDate
                          ? "border-primary/40 bg-primary/5 text-primary"
                          : "border-border text-muted-foreground hover:border-primary/30"
                      )}>
                        <CalendarDays size={12} />
                        {newDueDate
                          ? newDueDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })
                          : "Due date"
                        }
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 z-[70]" align="start">
                      <Calendar
                        mode="single"
                        selected={newDueDate}
                        onSelect={(date) => { setNewDueDate(date); setDueDatePickerOpen(false); }}
                        initialFocus
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>

                  {newDueDate && (
                    <button
                      onClick={() => { setNewDueDate(undefined); setNewPriorNotice(0); }}
                      className="text-[11px] text-destructive hover:text-destructive/80"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Give notice — only when due date is set */}
                {newDueDate && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] uppercase font-semibold text-muted-foreground mr-0.5">Notice:</span>
                    {[-1, 0, 1, 3, 7].map((n) => (
                      <button
                        key={n}
                        onClick={() => setNewPriorNotice(n)}
                        className={cn(
                          "px-2 py-1 rounded-md text-[10px] font-medium border transition-all",
                          newPriorNotice === n
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground"
                        )}
                      >
                        {n === -1 ? "Today" : n === 0 ? "Due day" : n === 1 ? "1d" : `${n}d`}
                      </button>
                    ))}
                  </div>
                )}

                {/* Assignee row */}
                {memberFilters.length > 1 && (
                  <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
                    {memberFilters.map((f) => {
                      const assigneeValue = f.id === "mine" ? "me" : f.id === "partner" ? "partner" : f.id === "household" ? "both" : f.id;
                      const label = f.id === "mine" ? "Mine" : f.id === "household" ? "All" : f.label;
                      return (
                        <button
                          key={f.id}
                          onClick={() => setNewAssignee(assigneeValue)}
                          className={cn(
                            "flex-1 py-1.5 text-[11px] font-medium rounded-lg border transition-all whitespace-nowrap px-2",
                            newAssignee === assigneeValue ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
                          )}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {pendingTasks.length > 0 ? (
        <div className="space-y-2">
          {pendingTasks.map((task) => (
            <TodoItem key={task.id} task={task} onToggle={onToggle} onCongrats={onCongrats} readOnly={readOnly} />
          ))}
        </div>
      ) : !adding ? (
        <p className="text-sm text-muted-foreground text-center py-4">No to-dos yet</p>
      ) : null}

    </section>
  );
};

const TodoItem = ({ task, onToggle, onCongrats, readOnly }: {
  task: Task;
  onToggle?: (id: string) => void;
  onCongrats: () => void;
  readOnly?: boolean;
}) => {
  const handleToggle = () => {
    if (readOnly || !onToggle) return;
    if (!task.done) onCongrats();
    onToggle(task.id);
  };

  // Determine overdue status
  const isOverdue = (() => {
    if (!task.dueDate || task.done) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(task.dueDate + "T00:00:00");
    return today > due;
  })();

  const dueDateLabel = task.dueDate
    ? new Date(task.dueDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;

  return (
    <motion.div
      layout
      className={`flex items-center gap-3 bg-card rounded-xl px-4 py-3 shadow-card border transition-all active:scale-[0.99] ${
        task.done ? "border-habit-green/30" : isOverdue ? "border-destructive/40" : "border-border"
      }`}
    >
      <button
        onClick={handleToggle}
        disabled={readOnly}
        className={`w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
          task.done ? "bg-habit-green border-habit-green" : "border-muted hover:border-primary"
        } ${readOnly ? "opacity-60" : ""}`}
      >
        {task.done && <Check size={12} className="text-primary-foreground" />}
      </button>
      <div className="flex-1 min-w-0">
        <span className={`text-sm font-medium ${task.done ? "line-through text-muted-foreground" : "text-foreground"}`}>
          {task.title}
        </span>
        {(dueDateLabel || isOverdue) && (
          <div className="flex items-center gap-1.5 mt-0.5">
            {isOverdue && (
              <span className="text-[10px] font-semibold text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">
                Overdue
              </span>
            )}
            {dueDateLabel && (
              <span className="text-[10px] text-muted-foreground">
                Due {dueDateLabel}
              </span>
            )}
          </div>
        )}
      </div>
      {!readOnly && <TaskActionMenu taskId={task.id} />}
    </motion.div>
  );
};

export default HomePage;
