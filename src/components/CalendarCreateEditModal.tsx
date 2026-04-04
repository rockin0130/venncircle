import { useState, useEffect, useMemo, useCallback } from "react";
import {
  X, Clock, MapPin, Bell, Repeat, AlignLeft, ChevronDown, ChevronUp,
  CalendarDays, ListTodo, Globe, Trash2, Check, Search,
} from "lucide-react";
import CalendarPickerInline from "@/components/CalendarPickerInline";
import { motion, AnimatePresence } from "framer-motion";
import { useAppContext, ScheduledEvent, Task } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { formatTime } from "@/lib/formatTime";

// ── Types ──

type ItemMode = "event" | "todo";

interface RepeatRule {
  frequency: "none" | "daily" | "weekly" | "monthly" | "yearly" | "custom";
  interval?: number;
  unit?: "day" | "week" | "month" | "year";
  weekdays?: number[];
  endType?: "never" | "date" | "count";
  endDate?: string;
  endCount?: number;
}

const REPEAT_PRESETS: { label: string; value: RepeatRule["frequency"] }[] = [
  { label: "Does not repeat", value: "none" },
  { label: "Every day", value: "daily" },
  { label: "Every week", value: "weekly" },
  { label: "Every month", value: "monthly" },
  { label: "Every year", value: "yearly" },
  { label: "Custom...", value: "custom" },
];

const NOTIFICATION_OPTIONS = [
  { label: "None", value: -1 },
  { label: "At time of event", value: 0 },
  { label: "5 minutes before", value: 5 },
  { label: "10 minutes before", value: 10 },
  { label: "30 minutes before", value: 30 },
  { label: "1 hour before", value: 60 },
  { label: "1 day before", value: 1440 },
];

const NOTICE_OPTIONS = [-1, 0, 1, 2, 3, 7];

const CALENDAR_COLORS = [
  { name: "Blue", value: "hsl(210 100% 50%)" },
  { name: "Red", value: "hsl(0 75% 55%)" },
  { name: "Green", value: "hsl(150 60% 42%)" },
  { name: "Purple", value: "hsl(270 60% 55%)" },
  { name: "Orange", value: "hsl(35 100% 52%)" },
  { name: "Teal", value: "hsl(190 80% 42%)" },
  { name: "Pink", value: "hsl(340 80% 55%)" },
  { name: "Yellow", value: "hsl(50 90% 48%)" },
];

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

interface Props {
  open: boolean;
  onClose: () => void;
  editItem?: {
    id: string;
    type: "event" | "task";
    raw: ScheduledEvent | Task;
    isDueDateTask?: boolean;
    done?: boolean;
  } | null;
  defaultDate?: Date;
  /** The active calendar context when opening: "__personal__", a group id, or null for "All" */
  contextGroupId?: string | null;
}

function parseTimeForInput(time: string): string {
  if (!time || time === "All day") return "";
  const match12 = time.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (match12) {
    let h = parseInt(match12[1], 10);
    const m = match12[2];
    const p = match12[3].toUpperCase();
    if (p === "AM" && h === 12) h = 0;
    if (p === "PM" && h < 12) h += 12;
    return `${String(h).padStart(2, "0")}:${m}`;
  }
  const match24 = time.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (match24) return `${String(parseInt(match24[1])).padStart(2, "0")}:${match24[2]}`;
  return "";
}

function fmtDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** A calendar option in the picker: either "Personal" or a group calendar */
interface CalendarContextOption {
  id: string; // "__personal__" or group id
  label: string;
  calendarId: string | null; // DB calendar row id if found
  color: string;
  groupId: string | null;
  members: { user_id: string; display_name: string }[];
}

const CalendarCreateEditModal = ({ open, onClose, editItem, defaultDate, contextGroupId }: Props) => {
  const { addEvent, updateEvent, removeEvent, addTask, updateTask, removeTask,
    toggleTask, toggleEventCompletion } = useAppContext();
  const { user, activeGroup, groups } = useAuth();

  const isEditing = !!editItem;

  // ── Core state ──
  const [mode, setMode] = useState<ItemMode>("event");
  const [title, setTitle] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("");
  const [description, setDescription] = useState("");
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>(["me"]);

  // Event-specific
  const [location, setLocation] = useState("");
  const [repeatRule, setRepeatRule] = useState<RepeatRule>({ frequency: "none" });
  const [notificationMinutes, setNotificationMinutes] = useState(-1);
  const [calendarColor, setCalendarColor] = useState(CALENDAR_COLORS[0].value);
  const [selectedCalendarId, setSelectedCalendarId] = useState<string | null>(null);
  const [selectedCalendarName, setSelectedCalendarName] = useState<string>("Personal");
  const [showCalendarPicker, setShowCalendarPicker] = useState(false);

  // Track which context option is selected (for Assign To logic)
  const [selectedContextId, setSelectedContextId] = useState<string>("__personal__");

  // To-do specific
  const [todoDueDate, setTodoDueDate] = useState<Date | undefined>(undefined);
  const [todoPriorNotice, setTodoPriorNotice] = useState(0);
  const [todoTag, setTodoTag] = useState<"Work" | "Personal" | "Household">("Personal");

  // Timezone
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [showTzPicker, setShowTzPicker] = useState(false);
  const [tzSearch, setTzSearch] = useState("");

  // UI state
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [showCustomRepeat, setShowCustomRepeat] = useState(false);
  const [customInterval, setCustomInterval] = useState(1);
  const [customUnit, setCustomUnit] = useState<"day" | "week" | "month" | "year">("week");
  const [customWeekdays, setCustomWeekdays] = useState<number[]>([]);
  const [customEndType, setCustomEndType] = useState<"never" | "date" | "count">("never");
  const [customEndDate, setCustomEndDate] = useState("");
  const [customEndCount, setCustomEndCount] = useState(10);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dueDatePickerOpen, setDueDatePickerOpen] = useState(false);

  // ── Build context options (Personal + groups with Calendar page) ──
  const contextOptions: CalendarContextOption[] = useMemo(() => {
    const opts: CalendarContextOption[] = [{
      id: "__personal__",
      label: "Personal",
      calendarId: null,
      color: CALENDAR_COLORS[0].value,
      groupId: null,
      members: [],
    }];

    if (groups) {
      for (const g of groups) {
        // Only include groups that have Calendar page enabled
        if (g.shared_pages?.includes("calendar")) {
          opts.push({
            id: g.id,
            label: `${g.emoji || ""} ${g.name}`.trim(),
            calendarId: null,
            color: CALENDAR_COLORS[2].value,
            groupId: g.id,
            members: g.members || [],
          });
        }
      }
    }
    return opts;
  }, [groups]);

  // ── Determine the selected context's members for Assign To ──
  const selectedContextOption = useMemo(() => {
    return contextOptions.find(o => o.id === selectedContextId) || contextOptions[0];
  }, [contextOptions, selectedContextId]);

  const isPersonalContext = selectedContextId === "__personal__";

  // Members to show in Assign To (excluding current user, shown as "Mine")
  const assignToMembers = useMemo(() => {
    if (isPersonalContext || !selectedContextOption.members.length) return [];
    return selectedContextOption.members.filter(m => m.user_id !== user?.id);
  }, [isPersonalContext, selectedContextOption, user]);

  // ── Load default calendar for a given context ──
  const loadCalendarForContext = useCallback(async (ctxId: string) => {
    if (!user) return;

    if (ctxId === "__personal__") {
      // Load default personal calendar
      const { data } = await supabase
        .from("calendars")
        .select("id, name, color")
        .eq("user_id", user.id)
        .eq("provider", "local")
        .is("group_id", null)
        .eq("is_default", true)
        .limit(1)
        .maybeSingle();
      if (data) {
        setSelectedCalendarId(data.id);
        setSelectedCalendarName(data.name);
        setCalendarColor(data.color);
      } else {
        // Fallback: first local calendar with no group
        const { data: first } = await supabase
          .from("calendars")
          .select("id, name, color")
          .eq("user_id", user.id)
          .eq("provider", "local")
          .is("group_id", null)
          .order("sort_order", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (first) {
          setSelectedCalendarId(first.id);
          setSelectedCalendarName(first.name);
          setCalendarColor(first.color);
        }
      }
    } else {
      // Load calendar for this group
      const { data } = await supabase
        .from("calendars")
        .select("id, name, color")
        .eq("user_id", user.id)
        .eq("group_id", ctxId)
        .eq("provider", "local")
        .order("is_default", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) {
        setSelectedCalendarId(data.id);
        setSelectedCalendarName(data.name);
        setCalendarColor(data.color);
      } else {
        // Fallback: use default personal calendar
        const { data: fallback } = await supabase
          .from("calendars")
          .select("id, name, color")
          .eq("user_id", user.id)
          .eq("is_default", true)
          .limit(1)
          .maybeSingle();
        if (fallback) {
          setSelectedCalendarId(fallback.id);
          setSelectedCalendarName(fallback.name);
          setCalendarColor(fallback.color);
        }
      }
    }
  }, [user]);

  // ── Initialize state on open ──
  useEffect(() => {
    if (!open) return;
    setConfirmDelete(false);
    setShowMoreOptions(false);
    setShowCustomRepeat(false);

    if (editItem) {
      if (editItem.type === "event") {
        const ev = editItem.raw as ScheduledEvent;
        setMode("event");
        setTitle(ev.title);
        const isAllDay = ev.allDay ?? (!ev.time || ev.time === "All day");
        setAllDay(isAllDay);
        setStartDate(`${ev.year}-${String(ev.month + 1).padStart(2, "0")}-${String(ev.day).padStart(2, "0")}`);
        const ed = ev.endDay ?? ev.day;
        const em = ev.endMonth ?? ev.month;
        const ey = ev.endYear ?? ev.year;
        setEndDate(`${ey}-${String(em + 1).padStart(2, "0")}-${String(ed).padStart(2, "0")}`);
        setStartTime(parseTimeForInput(ev.time));
        setEndTime(parseTimeForInput(ev.endTime || ""));
        setDescription(ev.description || "");
        setLocation((ev as any).location || "");
        setNotificationMinutes((ev as any).notificationMinutes ?? -1);
        setRepeatRule((ev as any).repeatRule || { frequency: "none" });
        setSelectedAssignees([ev.user || "me"]);

        // Set context based on event's group
        const evGroupId = (ev as any).groupId;
        const editCtx = evGroupId || "__personal__";
        setSelectedContextId(editCtx);
        loadCalendarForContext(editCtx);
      } else {
        const tk = editItem.raw as Task;
        setMode("todo");
        setTitle(tk.title);
        setTodoTag(tk.tag || "Personal");
        setTodoPriorNotice(tk.priorNoticeDays ?? 0);
        setDescription((tk as any).description || "");
        setSelectedAssignees([tk.assignee || "me"]);

        // Set context based on task's group
        const tkGroupId = (tk as any).groupId;
        const editCtx = tkGroupId || "__personal__";
        setSelectedContextId(editCtx);
        loadCalendarForContext(editCtx);

        if (tk.dueDate) {
          const [y, m, d] = tk.dueDate.split("-").map(Number);
          setTodoDueDate(new Date(y, m - 1, d));
        } else {
          setTodoDueDate(undefined);
        }
      }
    } else {
      // New item defaults
      setMode("event");
      setTitle("");
      setAllDay(false);
      const dd = defaultDate || new Date();
      const dateStr = fmtDate(dd);
      setStartDate(dateStr);
      setEndDate(dateStr);
      setStartTime("");
      setEndTime("");
      setDescription("");
      setLocation("");
      setRepeatRule({ frequency: "none" });
      setNotificationMinutes(-1);
      setCalendarColor(CALENDAR_COLORS[0].value);
      setSelectedCalendarId(null);
      setSelectedCalendarName("Personal");
      setSelectedAssignees(["me"]);
      setTodoDueDate(dd);
      setTodoPriorNotice(0);
      setTodoTag("Personal");

      // Default context based on what was active
      const defaultCtx = contextGroupId === null ? "__personal__" : (contextGroupId || "__personal__");
      setSelectedContextId(defaultCtx);
      loadCalendarForContext(defaultCtx);
    }
  }, [open, editItem, defaultDate, contextGroupId, loadCalendarForContext]);

  const handleClose = () => {
    onClose();
  };

  // ── When context changes, update calendar and reset assignees ──
  const handleContextChange = (ctxId: string) => {
    setSelectedContextId(ctxId);
    setSelectedAssignees(["me"]);
    loadCalendarForContext(ctxId);
    setShowCalendarPicker(false);
  };

  // ── Auto-adjust end time ──
  const handleStartTimeChange = (v: string) => {
    setStartTime(v);
    if (v && !endTime) {
      const [h, m] = v.split(":").map(Number);
      setEndTime(`${String(Math.min(h + 1, 23)).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    } else if (v && endTime && startDate === endDate && v >= endTime) {
      const [h, m] = v.split(":").map(Number);
      setEndTime(`${String(Math.min(h + 1, 23)).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  };

  const handleStartDateChange = (v: string) => {
    setStartDate(v);
    if (!endDate || v > endDate) setEndDate(v);
  };

  // ── Assignee helpers ──
  const toggleAssignee = (val: string) => {
    setSelectedAssignees(prev => {
      if (prev.includes(val)) {
        // Don't allow deselecting all
        if (prev.length <= 1) return prev;
        return prev.filter(a => a !== val);
      }
      return [...prev, val];
    });
  };

  // Convert selectedAssignees to the legacy assignee format
  const computeAssignee = (): "me" | "partner" | "both" => {
    if (isPersonalContext) return "me";
    if (selectedAssignees.length > 1) return "both";
    if (selectedAssignees[0] === "me") return "me";
    return "partner";
  };

  // ── Save handlers ──
  const handleSaveEvent = () => {
    if (!title.trim()) return;
    const [sy, sm, sd] = startDate.split("-").map(Number);
    const [ey, em, ed] = endDate.split("-").map(Number);

    const eventData = {
      title: title.trim(),
      day: sd, month: sm - 1, year: sy,
      endDay: ed, endMonth: em - 1, endYear: ey,
      time: allDay ? "All day" : (startTime || "All day"),
      endTime: allDay ? "" : (endTime || startTime || ""),
      allDay,
      description,
      user: computeAssignee(),
      calendarId: selectedCalendarId || null,
    };

    if (isEditing && editItem?.type === "event") {
      const realId = editItem.id.replace(/^(ev-|tk-|gcal-)/, "");
      updateEvent(realId, eventData);
      toast.success("Event updated");
    } else {
      addEvent(eventData);
      toast.success(`Scheduled: ${title.trim()}`);
    }
    handleClose();
  };

  const handleSaveTodo = () => {
    if (!title.trim()) return;
    const dueDateStr = todoDueDate ? fmtDate(todoDueDate) : null;

    if (isEditing && editItem?.type === "task") {
      const realId = editItem.id.replace(/^(ev-|tk-|todo-|gcal-)/, "");
      updateTask(realId, {
        title: title.trim(),
        tag: todoTag,
        dueDate: dueDateStr,
        priorNoticeDays: todoPriorNotice,
      });
      toast.success("To-do updated");
    } else {
      addTask({
        title: title.trim(),
        time: "",
        tag: todoTag,
        assignee: computeAssignee(),
        dueDate: dueDateStr,
        priorNoticeDays: todoPriorNotice,
      });
      toast.success(`To-do added: ${title.trim()}`);
    }
    handleClose();
  };

  const handleDelete = () => {
    if (!editItem) return;
    const realId = editItem.id.replace(/^(ev-|tk-|todo-|gcal-)/, "");
    if (editItem.type === "event") {
      removeEvent(realId);
      toast.success("Event deleted");
    } else {
      removeTask(realId);
      toast.success("Task deleted");
    }
    handleClose();
  };

  const handleToggleDone = () => {
    if (!editItem) return;
    const realId = editItem.id.replace(/^(ev-|tk-|todo-|gcal-)/, "");
    if (editItem.type === "event") toggleEventCompletion(realId);
    else toggleTask(realId);
    handleClose();
  };

  // ── Repeat display ──
  const repeatLabel = () => {
    if (repeatRule.frequency === "none") return "Does not repeat";
    if (repeatRule.frequency === "daily") return "Every day";
    if (repeatRule.frequency === "weekly") return "Every week";
    if (repeatRule.frequency === "monthly") return "Every month";
    if (repeatRule.frequency === "yearly") return "Every year";
    if (repeatRule.frequency === "custom") {
      return `Every ${customInterval} ${customUnit}${customInterval > 1 ? "s" : ""}`;
    }
    return "Does not repeat";
  };

  const notificationLabel = () => {
    const opt = NOTIFICATION_OPTIONS.find((o) => o.value === notificationMinutes);
    return opt?.label || "None";
  };

  const formatDateDisplay = (dateStr: string) => {
    if (!dateStr) return "Not set";
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  };

  // ── Timezone list ──
  const allTimezones = useMemo(() => {
    try {
      return (Intl as any).supportedValuesOf("timeZone") as string[];
    } catch {
      return [
        "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
        "America/Anchorage", "Pacific/Honolulu", "America/Toronto", "America/Vancouver",
        "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Amsterdam",
        "Europe/Rome", "Europe/Madrid", "Europe/Stockholm", "Europe/Helsinki",
        "Asia/Tokyo", "Asia/Shanghai", "Asia/Kolkata", "Asia/Dubai",
        "Asia/Singapore", "Asia/Seoul", "Asia/Hong_Kong",
        "Australia/Sydney", "Australia/Melbourne", "Pacific/Auckland",
        "Africa/Cairo", "Africa/Johannesburg", "America/Sao_Paulo", "America/Mexico_City",
        "UTC",
      ];
    }
  }, []);

  const filteredTimezones = useMemo(() => {
    if (!tzSearch.trim()) return allTimezones;
    const q = tzSearch.toLowerCase();
    return allTimezones.filter((tz) => tz.toLowerCase().includes(q));
  }, [tzSearch, allTimezones]);

  const tzDisplayLabel = (tz: string) => {
    try {
      const now = new Date();
      const short = now.toLocaleString("en-US", { timeZone: tz, timeZoneName: "short" }).split(" ").pop();
      return `${tz.replace(/_/g, " ")} (${short})`;
    } catch {
      return tz.replace(/_/g, " ");
    }
  };

  if (!open) return null;

  // ── Render Assign To section ──
  const renderAssignTo = () => {
    // Hide entirely for Personal context
    if (isPersonalContext) return null;
    if (assignToMembers.length === 0) return null;

    return (
      <>
        <div className="px-4 py-3">
          <p className="text-[11px] font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Assign to</p>
          <div className="flex gap-2 overflow-x-auto scrollbar-hide">
            {/* "Mine" pill (always shown for group context) */}
            <button
              onClick={() => toggleAssignee("me")}
              className={cn(
                "px-3 py-1.5 text-[13px] font-medium rounded-full border transition-all whitespace-nowrap",
                selectedAssignees.includes("me")
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground"
              )}
            >
              Mine
            </button>
            {/* Individual member pills */}
            {assignToMembers.map((m) => (
              <button
                key={m.user_id}
                onClick={() => toggleAssignee(m.user_id)}
                className={cn(
                  "px-3 py-1.5 text-[13px] font-medium rounded-full border transition-all whitespace-nowrap",
                  selectedAssignees.includes(m.user_id)
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground"
                )}
              >
                {m.display_name || "Member"}
              </button>
            ))}
          </div>
        </div>
        <div className="h-px bg-border mx-4" />
      </>
    );
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 z-[60] bg-background flex flex-col"
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
          <button onClick={handleClose} className="text-sm font-medium text-primary">
            Cancel
          </button>
          <h2 className="text-[15px] font-semibold text-foreground">
            {isEditing ? (mode === "event" ? "Edit Event" : "Edit To-Do") : "New"}
          </h2>
          <button
            onClick={mode === "todo" ? handleSaveTodo : handleSaveEvent}
            className="text-sm font-semibold text-primary"
          >
            Save
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom,0px)]">
          {/* Title input */}
          <div className="px-4 pt-4 pb-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Add title"
              className="w-full text-xl font-light text-foreground bg-transparent outline-none placeholder:text-muted-foreground/50"
              autoFocus
            />
          </div>

          {/* Event / To-Do toggle */}
          <div className="px-4 pb-3">
            <div className="flex gap-2">
              <button
                onClick={() => setMode("event")}
                className={cn(
                  "px-4 py-1.5 rounded-full text-[13px] font-medium border transition-all",
                  mode === "event"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground"
                )}
              >
                Event
              </button>
              <button
                onClick={() => setMode("todo")}
                className={cn(
                  "px-4 py-1.5 rounded-full text-[13px] font-medium border transition-all",
                  mode === "todo"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground"
                )}
              >
                To Do
              </button>
            </div>
          </div>

          <div className="h-px bg-border" />

          {mode === "event" ? (
            /* ════════ EVENT MODE ════════ */
            <div>
              {/* All-day toggle */}
              <div className="flex items-center justify-between px-4 py-3.5">
                <div className="flex items-center gap-3">
                  <Clock size={20} className="text-muted-foreground" />
                  <span className="text-[15px] text-foreground">All-day</span>
                </div>
                <Switch checked={allDay} onCheckedChange={setAllDay} />
              </div>

              {/* Start date/time */}
              <div className="px-4 py-2 flex items-center gap-3">
                <div className="w-5" />
                <div className="flex-1">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => handleStartDateChange(e.target.value)}
                    className="w-full bg-transparent text-[15px] text-foreground outline-none"
                  />
                </div>
                {!allDay && (
                  <div className="w-24">
                    <input
                      type="time"
                      value={startTime}
                      onChange={(e) => handleStartTimeChange(e.target.value)}
                      className="w-full bg-transparent text-[15px] text-foreground outline-none text-right"
                    />
                  </div>
                )}
              </div>

              {/* End date/time */}
              <div className="px-4 py-2 flex items-center gap-3">
                <div className="w-5" />
                <div className="flex-1">
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    min={startDate}
                    className="w-full bg-transparent text-[15px] text-foreground outline-none"
                  />
                </div>
                {!allDay && (
                  <div className="w-24">
                    <input
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="w-full bg-transparent text-[15px] text-foreground outline-none text-right"
                    />
                  </div>
                )}
              </div>

              {/* Timezone */}
              <button
                onClick={() => { setTzSearch(""); setShowTzPicker(true); }}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary/50 transition-colors"
              >
                <Globe size={18} className="text-muted-foreground flex-shrink-0" />
                <span className="text-[14px] text-foreground truncate">{tzDisplayLabel(timezone)}</span>
                <ChevronDown size={16} className="text-muted-foreground ml-auto flex-shrink-0" />
              </button>

              <div className="h-px bg-border mx-4" />

              {/* Calendar context selector */}
              <div className="px-4 py-3">
                <button
                  onClick={() => setShowCalendarPicker(!showCalendarPicker)}
                  className="w-full flex items-center justify-between"
                >
                  <span className="text-[15px] text-foreground">Calendar</span>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: calendarColor }}
                    />
                    <span className="text-[15px] text-muted-foreground">{selectedContextOption.label}</span>
                    <ChevronDown
                      size={14}
                      className={cn(
                        "text-muted-foreground transition-transform",
                        showCalendarPicker && "rotate-180"
                      )}
                    />
                  </div>
                </button>

                {/* Inline context list */}
                <AnimatePresence>
                  {showCalendarPicker && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-3 rounded-xl border border-border bg-card overflow-hidden">
                        {contextOptions.map((opt) => {
                          const isSelected = selectedContextId === opt.id;
                          return (
                            <button
                              key={opt.id}
                              onClick={() => handleContextChange(opt.id)}
                              className="w-full flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-secondary/40 active:bg-secondary/60"
                            >
                              <div className="w-5 flex items-center justify-center flex-shrink-0">
                                {isSelected && <Check size={16} className="text-foreground" strokeWidth={2.5} />}
                              </div>
                              <div
                                className="w-3 h-3 rounded-full flex-shrink-0"
                                style={{ backgroundColor: opt.id === "__personal__" ? calendarColor : CALENDAR_COLORS[2].value }}
                              />
                              <span className={cn(
                                "text-[15px] text-left truncate",
                                isSelected ? "font-medium text-foreground" : "text-foreground"
                              )}>
                                {opt.label}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="h-px bg-border" />

              {/* Assignee — context-aware */}
              {renderAssignTo()}

              {/* More options toggle */}
              <button
                onClick={() => setShowMoreOptions(!showMoreOptions)}
                className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-secondary/50 transition-colors"
              >
                <span className="text-[15px] text-foreground">More options</span>
                {showMoreOptions ? <ChevronUp size={18} className="text-muted-foreground" /> : <ChevronDown size={18} className="text-muted-foreground" />}
              </button>

              {showMoreOptions && (
                <div>
                  {/* Repeat */}
                  <div className="px-4 py-3">
                    <div className="flex items-center gap-3 mb-2">
                      <Repeat size={18} className="text-muted-foreground" />
                      <span className="text-[14px] text-foreground font-medium">Repeat</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 ml-[30px]">
                      {REPEAT_PRESETS.map((p) => (
                        <button
                          key={p.value}
                          onClick={() => {
                            if (p.value === "custom") {
                              setShowCustomRepeat(true);
                              setRepeatRule({ frequency: "custom" });
                            } else {
                              setRepeatRule({ frequency: p.value });
                              setShowCustomRepeat(false);
                            }
                          }}
                          className={cn(
                            "px-2.5 py-1.5 rounded-lg text-[12px] font-medium border transition-all",
                            repeatRule.frequency === p.value
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border text-muted-foreground"
                          )}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>

                    {/* Custom recurrence */}
                    {showCustomRepeat && (
                      <div className="ml-[30px] mt-3 p-3 bg-secondary rounded-xl space-y-3">
                        <p className="text-[12px] font-semibold text-foreground">Custom recurrence</p>
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] text-muted-foreground">Every</span>
                          <input
                            type="number"
                            min={1}
                            max={99}
                            value={customInterval}
                            onChange={(e) => setCustomInterval(Math.max(1, parseInt(e.target.value) || 1))}
                            className="w-14 bg-card rounded-lg px-2 py-1.5 text-[13px] text-center outline-none text-foreground border border-border"
                          />
                          <div className="flex gap-1">
                            {(["day", "week", "month", "year"] as const).map((u) => (
                              <button
                                key={u}
                                onClick={() => setCustomUnit(u)}
                                className={cn(
                                  "px-2 py-1.5 rounded-lg text-[11px] font-medium transition-all",
                                  customUnit === u
                                    ? "bg-primary/10 text-primary"
                                    : "text-muted-foreground"
                                )}
                              >
                                {u}
                              </button>
                            ))}
                          </div>
                        </div>

                        {customUnit === "week" && (
                          <div>
                            <p className="text-[11px] text-muted-foreground mb-1.5">On days</p>
                            <div className="flex gap-1">
                              {WEEKDAY_LABELS.map((label, i) => (
                                <button
                                  key={i}
                                  onClick={() => {
                                    setCustomWeekdays((prev) =>
                                      prev.includes(i) ? prev.filter((d) => d !== i) : [...prev, i]
                                    );
                                  }}
                                  className={cn(
                                    "w-8 h-8 rounded-full text-[12px] font-medium flex items-center justify-center transition-all",
                                    customWeekdays.includes(i)
                                      ? "bg-primary text-primary-foreground"
                                      : "bg-card text-muted-foreground border border-border"
                                  )}
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        <div>
                          <p className="text-[11px] text-muted-foreground mb-1.5">Ends</p>
                          <div className="flex gap-1.5">
                            {(["never", "date", "count"] as const).map((et) => (
                              <button
                                key={et}
                                onClick={() => setCustomEndType(et)}
                                className={cn(
                                  "px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-all",
                                  customEndType === et
                                    ? "border-primary bg-primary/10 text-primary"
                                    : "border-border text-muted-foreground"
                                )}
                              >
                                {et === "never" ? "Never" : et === "date" ? "On date" : "After"}
                              </button>
                            ))}
                          </div>
                          {customEndType === "date" && (
                            <input
                              type="date"
                              value={customEndDate}
                              onChange={(e) => setCustomEndDate(e.target.value)}
                              className="mt-2 bg-card rounded-lg px-3 py-2 text-[13px] outline-none text-foreground border border-border"
                            />
                          )}
                          {customEndType === "count" && (
                            <div className="flex items-center gap-2 mt-2">
                              <input
                                type="number"
                                min={1}
                                value={customEndCount}
                                onChange={(e) => setCustomEndCount(Math.max(1, parseInt(e.target.value) || 1))}
                                className="w-16 bg-card rounded-lg px-2 py-1.5 text-[13px] text-center outline-none text-foreground border border-border"
                              />
                              <span className="text-[12px] text-muted-foreground">occurrences</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="h-px bg-border mx-4" />

                  {/* Location */}
                  <div className="flex items-center gap-3 px-4 py-3.5">
                    <MapPin size={18} className="text-muted-foreground flex-shrink-0" />
                    <input
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="Add location"
                      className="flex-1 text-[15px] bg-transparent outline-none text-foreground placeholder:text-muted-foreground/60"
                    />
                  </div>

                  <div className="h-px bg-border mx-4" />

                  {/* Notification */}
                  <div className="px-4 py-3">
                    <div className="flex items-center gap-3 mb-2">
                      <Bell size={18} className="text-muted-foreground" />
                      <span className="text-[14px] text-foreground font-medium">Notification</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 ml-[30px]">
                      {NOTIFICATION_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => setNotificationMinutes(opt.value)}
                          className={cn(
                            "px-2.5 py-1.5 rounded-lg text-[12px] font-medium border transition-all",
                            notificationMinutes === opt.value
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border text-muted-foreground"
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="h-px bg-border mx-4" />

                  {/* Description */}
                  <div className="flex items-start gap-3 px-4 py-3.5">
                    <AlignLeft size={18} className="text-muted-foreground mt-0.5 flex-shrink-0" />
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Add description"
                      rows={3}
                      className="flex-1 text-[15px] bg-transparent outline-none text-foreground placeholder:text-muted-foreground/60 resize-none"
                    />
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* ════════ TO-DO MODE ════════ */
            <div>
              {/* Due date */}
              <div className="px-4 py-3.5">
                <div className="flex items-center gap-3 mb-2">
                  <CalendarDays size={18} className="text-muted-foreground" />
                  <span className="text-[14px] text-foreground font-medium">Due date</span>
                </div>
                <div className="ml-[30px]">
                  <Popover open={dueDatePickerOpen} onOpenChange={setDueDatePickerOpen}>
                    <PopoverTrigger asChild>
                      <button className="w-full bg-secondary rounded-xl px-4 py-2.5 text-[14px] text-left flex items-center gap-2">
                        <CalendarDays size={15} className="text-muted-foreground" />
                        {todoDueDate
                          ? todoDueDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })
                          : <span className="text-muted-foreground">No due date</span>
                        }
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 z-[70]" align="start">
                      <Calendar
                        mode="single"
                        selected={todoDueDate}
                        onSelect={(date) => { setTodoDueDate(date); setDueDatePickerOpen(false); }}
                        initialFocus
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                  {todoDueDate && (
                    <button onClick={() => setTodoDueDate(undefined)} className="text-xs text-destructive mt-1">
                      Remove due date
                    </button>
                  )}
                </div>
              </div>

              <div className="h-px bg-border mx-4" />

              {/* Prior notice */}
              {todoDueDate && (
                <>
                  <div className="px-4 py-3">
                    <div className="flex items-center gap-3 mb-2">
                      <Bell size={18} className="text-muted-foreground" />
                      <span className="text-[14px] text-foreground font-medium">Give notice</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 ml-[30px]">
                      {NOTICE_OPTIONS.map((n) => (
                        <button
                          key={n}
                          onClick={() => setTodoPriorNotice(n)}
                          className={cn(
                            "px-2.5 py-1.5 rounded-lg text-[12px] font-medium border transition-all",
                            todoPriorNotice === n
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border text-muted-foreground"
                          )}
                        >
                          {n === -1 ? "Starting today" : n === 0 ? "Due day only" : n === 1 ? "1 day before" : `${n} days before`}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="h-px bg-border mx-4" />
                </>
              )}

              {/* Assignee — context-aware (same logic as events) */}
              {renderAssignTo()}

              {/* Description */}
              <div className="flex items-start gap-3 px-4 py-3.5">
                <AlignLeft size={18} className="text-muted-foreground mt-0.5 flex-shrink-0" />
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Add notes"
                  rows={3}
                  className="flex-1 text-[15px] bg-transparent outline-none text-foreground placeholder:text-muted-foreground/60 resize-none"
                />
              </div>
            </div>
          )}

          {/* ── Edit mode: Done + Delete buttons ── */}
          {isEditing && (
            <div className="px-4 py-4 space-y-2">
              <div className="h-px bg-border mb-2" />
              <button
                onClick={handleToggleDone}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl bg-secondary hover:bg-secondary/80 transition-colors text-left"
              >
                <Check size={16} className="text-muted-foreground" />
                {editItem?.done ? "Mark as not done" : "Mark as done"}
              </button>

              {!confirmDelete ? (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl hover:bg-destructive/10 text-destructive transition-colors text-left"
                >
                  <Trash2 size={16} />
                  Delete
                </button>
              ) : (
                <div className="flex gap-2">
                  <button onClick={() => setConfirmDelete(false)} className="flex-1 py-2.5 text-sm font-medium bg-secondary rounded-xl">
                    Cancel
                  </button>
                  <button onClick={handleDelete} className="flex-1 py-2.5 text-sm font-semibold bg-destructive text-destructive-foreground rounded-xl">
                    Delete
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>

      {/* ── Timezone Picker Sheet ── */}
      <AnimatePresence>
        {showTzPicker && (
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="absolute inset-0 z-[70] bg-background flex flex-col"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
              <button onClick={() => setShowTzPicker(false)} className="text-sm font-medium text-primary">
                Cancel
              </button>
              <h2 className="text-[15px] font-semibold text-foreground">Time Zone</h2>
              <div className="w-12" />
            </div>

            <div className="px-4 py-2 border-b border-border flex-shrink-0">
              <div className="flex items-center gap-2 bg-secondary rounded-xl px-3 py-2">
                <Search size={16} className="text-muted-foreground flex-shrink-0" />
                <input
                  value={tzSearch}
                  onChange={(e) => setTzSearch(e.target.value)}
                  placeholder="Search time zones..."
                  className="flex-1 text-[14px] bg-transparent outline-none text-foreground placeholder:text-muted-foreground/60"
                  autoFocus
                />
                {tzSearch && (
                  <button onClick={() => setTzSearch("")} className="text-muted-foreground">
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {filteredTimezones.map((tz) => (
                <button
                  key={tz}
                  onClick={() => { setTimezone(tz); setShowTzPicker(false); }}
                  className={cn(
                    "w-full flex items-center justify-between px-4 py-3 text-left hover:bg-secondary/50 transition-colors border-b border-border/50",
                    timezone === tz && "bg-primary/5"
                  )}
                >
                  <span className="text-[14px] text-foreground truncate">{tzDisplayLabel(tz)}</span>
                  {timezone === tz && <Check size={18} className="text-primary flex-shrink-0" />}
                </button>
              ))}
              {filteredTimezones.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-8">No time zones found</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </AnimatePresence>
  );
};

export default CalendarCreateEditModal;
