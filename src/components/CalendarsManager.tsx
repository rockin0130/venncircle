import { useState, useEffect, useCallback, useMemo } from "react";
import { X, Plus, Check, RefreshCw, ChevronDown, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Capacitor } from "@capacitor/core";
import { listDeviceCalendars, normalizeAppleCalendarColor } from "@/integrations/appleCalendar";
import type { Calendar } from "@ebarooni/capacitor-calendar";
import { APPLE_CALENDAR_VISIBILITY_CHANGED } from "@/lib/appleCalendarVisibility";
import {
  getAppleCalendarDisplayColor,
  setAppleCalendarDisplayColor,
  isAppleVisibleInContext,
  setAppleContextVisibility,
} from "@/lib/appleCalendarPrefs";

// ── Types ──

interface CalendarEntry {
  id: string;
  name: string;
  color: string;
  provider: string;
  providerAccountId: string | null;
  providerCalendarId: string | null;
  isVisible: boolean;
  isDefault: boolean;
  groupId: string | null;
  sortOrder: number;
}

interface ContextVisRow {
  calendar_id: string;
  context_id: string;
  is_visible: boolean;
  visibility_mode: string; // 'full' | 'busy'
}

const CALENDAR_COLORS = [
  { name: "Blue", value: "hsl(210 100% 50%)" },
  { name: "Red", value: "hsl(0 75% 55%)" },
  { name: "Green", value: "hsl(150 60% 42%)" },
  { name: "Purple", value: "hsl(270 60% 55%)" },
  { name: "Orange", value: "hsl(35 100% 52%)" },
  { name: "Teal", value: "hsl(190 80% 42%)" },
  { name: "Pink", value: "hsl(340 80% 55%)" },
  { name: "Yellow", value: "hsl(50 90% 48%)" },
  { name: "Indigo", value: "hsl(240 60% 55%)" },
  { name: "Emerald", value: "hsl(160 70% 40%)" },
  { name: "Rose", value: "hsl(350 80% 60%)" },
  { name: "Amber", value: "hsl(45 95% 50%)" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  contextId?: string | null;
}

const CalendarsManager = ({ open, onClose }: Props) => {
  const { user, groups } = useAuth();
  const [calendars, setCalendars] = useState<CalendarEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [contextVisRows, setContextVisRows] = useState<ContextVisRow[]>([]);
  const [appleDeviceCalendars, setAppleDeviceCalendars] = useState<Calendar[]>([]);
  const [appleCalendarsLoading, setAppleCalendarsLoading] = useState(false);
  const [appleUiRev, setAppleUiRev] = useState(0);
  const [settingsAppleDeviceCal, setSettingsAppleDeviceCal] = useState<Calendar | null>(null);
  const [appleSheetColor, setAppleSheetColor] = useState("");

  // New calendar form
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(CALENDAR_COLORS[0].value);

  // Unified settings popup — works for all calendar types
  const [settingsCalId, setSettingsCalId] = useState<string | null>(null);
  const [settingsColor, setSettingsColor] = useState("");
  const [settingsName, setSettingsName] = useState("");

  // Groups that share 'calendar' page
  const calendarGroups = useMemo(
    () => groups.filter((g) => g.shared_pages?.includes("calendar")),
    [groups]
  );

  // All context options: Private + each calendar-sharing group
  const contextOptions = useMemo(() => {
    const opts: { id: string; label: string; emoji: string }[] = [
      { id: "__personal__", label: "Mine", emoji: "👤" },
    ];
    calendarGroups.forEach((g) =>
      opts.push({ id: g.id, label: g.name, emoji: g.emoji })
    );
    return opts;
  }, [calendarGroups]);

  const fetchCalendars = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("calendars")
      .select("*")
      .eq("user_id", user.id)
      .order("sort_order", { ascending: true });

    if (!error && data) {
      setCalendars(
        data.map((c: any) => ({
          id: c.id,
          name: c.name,
          color: c.color,
          provider: c.provider,
          providerAccountId: c.provider_account_id,
          providerCalendarId: c.provider_calendar_id,
          isVisible: c.is_visible,
          isDefault: c.is_default,
          groupId: c.group_id,
          sortOrder: c.sort_order,
        }))
      );
    }
    setLoading(false);
  }, [user]);

  const fetchContextVisibility = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("calendar_context_visibility")
      .select("calendar_id, context_id, is_visible, visibility_mode")
      .eq("user_id", user.id);
    if (data) setContextVisRows(data as ContextVisRow[]);
  }, [user]);

  const syncGoogleCalendars = useCallback(async () => {
    if (!user) return;
    setSyncing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { setSyncing(false); return; }

      const { data: tokens } = await supabase
        .from("google_calendar_tokens")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!tokens) { setSyncing(false); return; }

      try {
        await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-calendar-list`,
          {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
          }
        );
      } catch (err) {
        console.error("Error syncing Google calendars:", err);
      }
      await fetchCalendars();
    } catch (err) {
      console.error("Error in syncGoogleCalendars:", err);
    }
    setSyncing(false);
  }, [user, fetchCalendars]);

  useEffect(() => {
    if (open) {
      fetchCalendars().then(() => syncGoogleCalendars());
      fetchContextVisibility();
    }
  }, [open, fetchCalendars, syncGoogleCalendars, fetchContextVisibility]);

  useEffect(() => {
    const sync = () => setAppleUiRev((n) => n + 1);
    window.addEventListener(APPLE_CALENDAR_VISIBILITY_CHANGED, sync);
    return () => window.removeEventListener(APPLE_CALENDAR_VISIBILITY_CHANGED, sync);
  }, []);

  useEffect(() => {
    if (!open) return;
    if (!Capacitor.isNativePlatform()) {
      setAppleDeviceCalendars([]);
      return;
    }
    let cancelled = false;
    setAppleCalendarsLoading(true);
    listDeviceCalendars()
      .then((list) => {
        if (cancelled) return;
        const sorted = [...list].sort((a, b) => a.title.localeCompare(b.title));
        setAppleDeviceCalendars(sorted);
      })
      .catch(() => {
        if (!cancelled) setAppleDeviceCalendars([]);
      })
      .finally(() => {
        if (!cancelled) setAppleCalendarsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Ensure default calendar exists
  useEffect(() => {
    if (!loading && calendars.length === 0 && user) {
      createDefaultCalendar();
    }
  }, [loading, calendars.length, user]);

  const createDefaultCalendar = async () => {
    if (!user) return;
    await supabase.from("calendars").insert({
      user_id: user.id,
      name: "Mine",
      color: CALENDAR_COLORS[0].value,
      provider: "local",
      is_visible: true,
      is_default: true,
      sort_order: 0,
    } as any);
    fetchCalendars();
  };

  // ── Derived data ──

  // MY CALENDARS: Personal (local default) + one per group
  const myCalendars = useMemo(() => {
    const personalCal = calendars.find(
      (c) => c.provider === "local" && c.isDefault && !c.groupId
    );
    const items: { type: "personal" | "group"; cal: CalendarEntry | null; groupId?: string; groupName?: string; groupEmoji?: string }[] = [];

    items.push({
      type: "personal",
      cal: personalCal || null,
    });

    calendarGroups.forEach((g) => {
      const groupCal = calendars.find(
        (c) => c.provider === "local" && c.groupId === g.id
      );
      items.push({
        type: "group",
        cal: groupCal || null,
        groupId: g.id,
        groupName: g.name,
        groupEmoji: g.emoji,
      });
    });

    return items;
  }, [calendars, calendarGroups]);

  // GOOGLE calendars
  const googleCalendars = useMemo(
    () => calendars.filter((c) => c.provider === "google"),
    [calendars]
  );

  // ── Context visibility helpers ──

  const isVisibleInContext = (calId: string, ctxId: string): boolean => {
    const row = contextVisRows.find(
      (r) => r.calendar_id === calId && r.context_id === ctxId
    );
    if (row) return row.is_visible;
    return ctxId === "__personal__";
  };

  const getVisibilityMode = (calId: string, ctxId: string): string => {
    const row = contextVisRows.find(
      (r) => r.calendar_id === calId && r.context_id === ctxId
    );
    return row?.visibility_mode || "full";
  };

  const upsertContextVisibility = async (
    calId: string,
    ctxId: string,
    visible: boolean,
    mode?: string
  ) => {
    if (!user) return;
    const currentMode = mode || getVisibilityMode(calId, ctxId);
    
    // Mine (__personal__) is always on and cannot be toggled off
    if (ctxId === "__personal__") return;
    
    // Simple toggle — no mutual exclusivity anymore
    setContextVisRows((prev) => {
      const filtered = prev.filter(
        (r) => !(r.calendar_id === calId && r.context_id === ctxId)
      );
      filtered.push({
        calendar_id: calId,
        context_id: ctxId,
        is_visible: visible,
        visibility_mode: currentMode,
      });
      return filtered;
    });

    await supabase
      .from("calendar_context_visibility")
      .upsert(
        {
          user_id: user.id,
          calendar_id: calId,
          context_id: ctxId,
          is_visible: visible,
          visibility_mode: currentMode,
        } as any,
        { onConflict: "user_id,calendar_id,context_id" }
      );
    
    // Simple toggle off
    setContextVisRows((prev) => {
      const filtered = prev.filter(
        (r) => !(r.calendar_id === calId && r.context_id === ctxId)
      );
      filtered.push({
        calendar_id: calId,
        context_id: ctxId,
        is_visible: visible,
        visibility_mode: currentMode,
      });
      return filtered;
    });

    await supabase
      .from("calendar_context_visibility")
      .upsert(
        {
          user_id: user.id,
          calendar_id: calId,
          context_id: ctxId,
          is_visible: visible,
          visibility_mode: currentMode,
        } as any,
        { onConflict: "user_id,calendar_id,context_id" }
      );
  };

  const setVisibilityMode = async (calId: string, ctxId: string, mode: string) => {
    await upsertContextVisibility(calId, ctxId, true, mode);
  };

  // ── Settings popup helpers ──

  const openSettings = (cal: CalendarEntry) => {
    setSettingsAppleDeviceCal(null);
    setSettingsCalId(cal.id);
    setSettingsName(cal.name);
    setSettingsColor(cal.color);
  };

  const openAppleDeviceCalendarSettings = (cal: Calendar) => {
    setSettingsCalId(null);
    setSettingsAppleDeviceCal(cal);
    setAppleSheetColor(getAppleCalendarDisplayColor(cal.id, normalizeAppleCalendarColor(cal.color)));
  };

  const saveAppleDeviceCalendarSettings = () => {
    if (!settingsAppleDeviceCal) return;
    setAppleCalendarDisplayColor(settingsAppleDeviceCal.id, appleSheetColor);
    setSettingsAppleDeviceCal(null);
  };

  const saveSettings = async () => {
    if (!settingsCalId) return;
    const cal = calendars.find((c) => c.id === settingsCalId);
    if (!cal) return;

    // Optimistic update
    setCalendars((prev) =>
      prev.map((c) =>
        c.id === settingsCalId
          ? { ...c, name: settingsName.trim() || c.name, color: settingsColor }
          : c
      )
    );

    const updates: any = { color: settingsColor, updated_at: new Date().toISOString() };
    // Only update name for non-Google calendars or if it was changed
    if (cal.provider !== "google" && settingsName.trim()) {
      updates.name = settingsName.trim();
    }

    const { error } = await supabase
      .from("calendars")
      .update(updates)
      .eq("id", settingsCalId);

    if (error) {
      toast.error("Failed to save changes");
      fetchCalendars();
    }

    setSettingsCalId(null);
  };

  const deleteCalendar = async (id: string) => {
    const cal = calendars.find((c) => c.id === id);
    if (cal?.isDefault) {
      toast.error("Cannot delete default calendar");
      return;
    }
    await supabase.from("calendars").delete().eq("id", id);
    fetchCalendars();
    toast.success("Calendar removed");
  };

  const handleCreateCalendar = async () => {
    if (!newName.trim() || !user) return;
    const { error } = await supabase.from("calendars").insert({
      user_id: user.id,
      name: newName.trim(),
      color: newColor,
      provider: "local",
      is_visible: true,
      is_default: false,
      sort_order: calendars.length,
    } as any);

    if (error) {
      toast.error("Failed to create calendar");
    } else {
      toast.success(`Calendar "${newName.trim()}" created`);
      setNewName("");
      setNewColor(CALENDAR_COLORS[0].value);
      setShowNewForm(false);
      fetchCalendars();
    }
  };

  // The currently editing calendar
  const settingsCal = settingsCalId ? calendars.find((c) => c.id === settingsCalId) : null;

  // Determine if the settings cal is a group calendar (for group-to-group restriction)
  const settingsCalGroupId = settingsCal?.groupId || null;

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 300 }}
        className="absolute inset-0 z-[60] bg-background flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] pb-3 border-b border-border flex-shrink-0">
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-secondary transition-colors">
            <X size={20} className="text-muted-foreground" />
          </button>
          <h2 className="text-[16px] font-semibold text-foreground">Calendars</h2>
          <div className="flex items-center gap-1">
            <button
              onClick={syncGoogleCalendars}
              disabled={syncing}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-secondary transition-colors"
            >
              <RefreshCw size={18} className={cn("text-muted-foreground", syncing && "animate-spin")} />
            </button>
            <button
              onClick={() => { setShowNewForm(true); setNewName(""); setNewColor(CALENDAR_COLORS[0].value); }}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-secondary transition-colors"
            >
              <Plus size={20} className="text-primary" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto scroll-smooth-touch px-4 pb-8">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-5 mt-3">
              {syncing && (
                <div className="flex items-center gap-2 px-3 py-2 bg-secondary/50 rounded-lg">
                  <RefreshCw size={14} className="text-muted-foreground animate-spin" />
                  <span className="text-[12px] text-muted-foreground">Syncing connected calendars…</span>
                </div>
              )}

              {/* ── MY CALENDARS ── */}
              <div>
                <div className="flex items-center gap-2 py-2">
                  <span className="text-base">📅</span>
                  <span className="text-[14px] font-semibold text-muted-foreground uppercase tracking-wider">
                    My Calendars
                  </span>
                </div>

                <div className="bg-card rounded-xl border border-border divide-y divide-border">
                  {myCalendars.map((item) => {
                    const cal = item.cal;
                    const label = item.type === "personal"
                      ? "Mine"
                      : item.groupName || "Group";
                    const emoji = item.type === "personal" ? "👤" : item.groupEmoji || "📅";
                    const isFamily = item.type === "group" && (item.groupName?.toLowerCase() === "family");
                    const defaultColor = isFamily ? "hsl(150 60% 42%)" : CALENDAR_COLORS[0].value;
                    const color = cal?.color || defaultColor;
                    const subtitle = item.type === "personal" ? "Your calendar" : "Shared group calendar";

                    return (
                      <button
                        key={item.type === "personal" ? "personal" : item.groupId}
                        onClick={() => cal && openSettings(cal)}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-secondary/30 transition-colors"
                      >
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: color }}
                        >
                          <span className="text-[12px]">{emoji}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[14px] font-medium text-foreground truncate">{label}</p>
                          <p className="text-[11px] text-muted-foreground">{subtitle}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ── GOOGLE ── */}
              {googleCalendars.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 py-2">
                    <span className="text-base">🔵</span>
                    <span className="text-[14px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Google
                    </span>
                  </div>

                  <div className="bg-card rounded-xl border border-border divide-y divide-border">
                    {googleCalendars.map((cal) => {
                      const visibleCount = contextOptions.filter((ctx) =>
                        isVisibleInContext(cal.id, ctx.id)
                      ).length;

                      return (
                        <button
                          key={cal.id}
                          onClick={() => openSettings(cal)}
                          className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-secondary/30 transition-colors"
                        >
                          <div
                            className="relative w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{
                              backgroundColor: visibleCount > 0 ? cal.color : "transparent",
                              border: visibleCount > 0 ? "none" : `2px solid ${cal.color}`,
                            }}
                          >
                            {visibleCount > 0 && (
                              <Check size={14} className="text-white drop-shadow-sm" strokeWidth={3} />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[14px] font-medium text-foreground truncate">{cal.name}</p>
                            {visibleCount > 0 && (
                              <p className="text-[11px] text-muted-foreground">
                                Showing in {visibleCount} {visibleCount === 1 ? "view" : "views"}
                              </p>
                            )}
                          </div>
                          <ChevronRight size={18} className="text-muted-foreground flex-shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── APPLE (device) ── */}
              {Capacitor.isNativePlatform() && (appleCalendarsLoading || appleDeviceCalendars.length > 0) && (
                <div key={appleUiRev}>
                  <div className="flex items-center gap-2 py-2">
                    <span className="text-base">🍎</span>
                    <span className="text-[14px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Apple Calendar
                    </span>
                  </div>

                  {appleCalendarsLoading ? (
                    <div className="flex items-center justify-center py-6 bg-card rounded-xl border border-border">
                      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : (
                    <div className="bg-card rounded-xl border border-border divide-y divide-border">
                      {appleDeviceCalendars.map((cal) => {
                        const visibleCount = contextOptions.filter((ctx) =>
                          isAppleVisibleInContext(cal.id, ctx.id)
                        ).length;
                        const dotColor = getAppleCalendarDisplayColor(cal.id, normalizeAppleCalendarColor(cal.color));
                        return (
                          <button
                            key={cal.id}
                            type="button"
                            onClick={() => openAppleDeviceCalendarSettings(cal)}
                            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-secondary/30 transition-colors"
                          >
                            <div
                              className="relative w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                              style={{
                                backgroundColor: visibleCount > 0 ? dotColor : "transparent",
                                border: visibleCount > 0 ? "none" : `2px solid ${dotColor}`,
                              }}
                            >
                              {visibleCount > 0 && (
                                <Check size={14} className="text-white drop-shadow-sm" strokeWidth={3} />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[14px] font-medium text-foreground truncate">{cal.title}</p>
                              {visibleCount > 0 && (
                                <p className="text-[11px] text-muted-foreground">
                                  Showing in {visibleCount} {visibleCount === 1 ? "view" : "views"}
                                </p>
                              )}
                            </div>
                            <ChevronRight size={18} className="text-muted-foreground flex-shrink-0" />
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Empty state */}
              {myCalendars.length === 0 && googleCalendars.length === 0 && !loading && (
                <div className="text-center py-12">
                  <p className="text-muted-foreground text-sm">No calendars yet</p>
                  <button
                    onClick={() => setShowNewForm(true)}
                    className="mt-3 text-primary text-sm font-medium"
                  >
                    Create your first calendar
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Unified Settings Popup ── */}
        <AnimatePresence>
          {settingsCal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-[65] bg-black/40 flex items-end justify-center"
              onClick={() => saveSettings()}
            >
              <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 28, stiffness: 300 }}
                className="w-full max-w-md bg-card rounded-t-2xl border-t border-border shadow-xl overflow-hidden max-h-[85vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                <div className="px-5 pt-5 pb-3 border-b border-border flex-shrink-0">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-5 h-5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: settingsColor }}
                    />
                    <h3 className="text-[15px] font-semibold text-foreground truncate">
                      {settingsCal.provider === "google" ? settingsCal.name : (settingsName || settingsCal.name)}
                    </h3>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                  {/* Calendar name — editable for local calendars */}
                  {settingsCal.provider !== "google" && (
                    <div>
                      <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                        Name
                      </label>
                      <input
                        value={settingsName}
                        onChange={(e) => setSettingsName(e.target.value)}
                        className="w-full bg-secondary rounded-lg px-3 py-2.5 text-[14px] text-foreground outline-none"
                      />
                    </div>
                  )}

                  {/* Color picker */}
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3 block">
                      Color
                    </label>
                    <div className="grid grid-cols-6 gap-3">
                      {CALENDAR_COLORS.map((c) => (
                        <button
                          key={c.value}
                          onClick={() => setSettingsColor(c.value)}
                          className="w-9 h-9 rounded-full flex items-center justify-center mx-auto transition-all"
                          style={{
                            backgroundColor: c.value,
                            ...(settingsColor === c.value
                              ? { boxShadow: `0 0 0 2px var(--background), 0 0 0 4px ${c.value}` }
                              : {}),
                          }}
                        >
                          {settingsColor === c.value && (
                            <Check size={14} className="text-white drop-shadow-sm" strokeWidth={3} />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Show in... toggles */}
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                      Show in…
                    </label>
                    <div className="bg-secondary/50 rounded-xl divide-y divide-border">
                      {contextOptions.map((ctx) => {
                        // For group calendars shared to other groups: force busy only
                        const isGroupCalSharingToOtherGroup =
                          settingsCalGroupId &&
                          ctx.id !== "__personal__" &&
                          ctx.id !== settingsCalGroupId;

                        // Skip showing the calendar's own group context (it's always visible there)
                        const isOwnGroupContext = settingsCalGroupId && ctx.id === settingsCalGroupId;

                        const visible = isVisibleInContext(settingsCal.id, ctx.id);
                        const mode = getVisibilityMode(settingsCal.id, ctx.id);
                        const effectiveMode = isGroupCalSharingToOtherGroup ? "busy" : mode;

                        const isMineCtx = ctx.id === "__personal__";

                        return (
                          <div key={ctx.id} className="px-4">
                            <div className="flex items-center justify-between py-3">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span className="text-sm">{ctx.emoji}</span>
                                <div className="min-w-0">
                                  <span className="text-[14px] text-foreground truncate block">
                                    {ctx.label}
                                  </span>
                                  {(isOwnGroupContext || isMineCtx) && (
                                    <span className="text-[11px] text-muted-foreground">Always visible</span>
                                  )}
                                </div>
                              </div>
                              {isMineCtx ? (
                                <Switch
                                  checked={true}
                                  disabled
                                  className="opacity-50"
                                />
                              ) : !isOwnGroupContext ? (
                                <Switch
                                  checked={visible}
                                  onCheckedChange={(checked) => {
                                    const newMode = isGroupCalSharingToOtherGroup ? "busy" : "full";
                                    upsertContextVisibility(settingsCal.id, ctx.id, checked, checked ? newMode : undefined);
                                  }}
                                />
                              ) : null}
                            </div>

                            {/* Privacy option when toggle is on */}
                            {visible && !isOwnGroupContext && !isMineCtx && (
                              <div className="pb-3 pl-8">
                                {isGroupCalSharingToOtherGroup ? (
                                  <p className="text-[12px] text-muted-foreground italic">
                                    Busy only — group calendars shared with other groups only show availability
                                  </p>
                                ) : (
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      onClick={() => setVisibilityMode(settingsCal.id, ctx.id, "full")}
                                      className={cn(
                                        "px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors",
                                        effectiveMode === "full"
                                          ? "bg-primary text-primary-foreground"
                                          : "bg-secondary text-muted-foreground hover:text-foreground"
                                      )}
                                    >
                                      Full details
                                    </button>
                                    <button
                                      onClick={() => setVisibilityMode(settingsCal.id, ctx.id, "busy")}
                                      className={cn(
                                        "px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors",
                                        effectiveMode === "busy"
                                          ? "bg-primary text-primary-foreground"
                                          : "bg-secondary text-muted-foreground hover:text-foreground"
                                      )}
                                    >
                                      Busy only
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Delete option for non-default local calendars */}
                  {settingsCal.provider === "local" && !settingsCal.isDefault && !settingsCal.groupId && (
                    <button
                      onClick={() => {
                        deleteCalendar(settingsCal.id);
                        setSettingsCalId(null);
                      }}
                      className="w-full py-2.5 text-[14px] font-medium text-destructive hover:bg-destructive/10 rounded-xl transition-colors"
                    >
                      Delete Calendar
                    </button>
                  )}
                </div>

                {/* Done button */}
                <div className="px-5 pb-5 pt-2 border-t border-border flex-shrink-0">
                  <button
                    onClick={saveSettings}
                    className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-[14px] font-semibold"
                  >
                    Done
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Apple device calendar settings (matches Google sheet) ── */}
        <AnimatePresence>
          {settingsAppleDeviceCal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-[65] bg-black/40 flex items-end justify-center"
              onClick={() => saveAppleDeviceCalendarSettings()}
            >
              <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 28, stiffness: 300 }}
                className="w-full max-w-md bg-card rounded-t-2xl border-t border-border shadow-xl overflow-hidden max-h-[85vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-5 pt-5 pb-3 border-b border-border flex-shrink-0">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-5 h-5 rounded-full flex-shrink-0 border border-border/40"
                      style={{ backgroundColor: appleSheetColor }}
                    />
                    <h3 className="text-[15px] font-semibold text-foreground truncate">
                      {settingsAppleDeviceCal.title}
                    </h3>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3 block">
                      Color
                    </label>
                    <div className="grid grid-cols-6 gap-3">
                      {CALENDAR_COLORS.map((c) => (
                        <button
                          key={c.value}
                          type="button"
                          onClick={() => setAppleSheetColor(c.value)}
                          className="w-9 h-9 rounded-full flex items-center justify-center mx-auto transition-all"
                          style={{
                            backgroundColor: c.value,
                            ...(appleSheetColor === c.value
                              ? { boxShadow: `0 0 0 2px var(--background), 0 0 0 4px ${c.value}` }
                              : {}),
                          }}
                        >
                          {appleSheetColor === c.value && (
                            <Check size={14} className="text-white drop-shadow-sm" strokeWidth={3} />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                      Show in…
                    </label>
                    <div className="bg-secondary/50 rounded-xl divide-y divide-border">
                      {contextOptions.map((ctx) => {
                        const isMineCtx = ctx.id === "__personal__";
                        const visible = isAppleVisibleInContext(settingsAppleDeviceCal.id, ctx.id);
                        return (
                          <div key={ctx.id} className="px-4">
                            <div className="flex items-center justify-between py-3">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span className="text-sm">{ctx.emoji}</span>
                                <div className="min-w-0">
                                  <span className="text-[14px] text-foreground truncate block">
                                    {ctx.label}
                                  </span>
                                  {isMineCtx && (
                                    <span className="text-[11px] text-muted-foreground">Always visible</span>
                                  )}
                                </div>
                              </div>
                              {isMineCtx ? (
                                <Switch checked={visible} disabled className="opacity-50" />
                              ) : (
                                <Switch
                                  checked={visible}
                                  onCheckedChange={(checked) =>
                                    setAppleContextVisibility(settingsAppleDeviceCal.id, ctx.id, checked)
                                  }
                                />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="px-5 pb-5 pt-2 border-t border-border flex-shrink-0">
                  <button
                    type="button"
                    onClick={saveAppleDeviceCalendarSettings}
                    className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-[14px] font-semibold"
                  >
                    Done
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── New Calendar Sheet ── */}
        <AnimatePresence>
          {showNewForm && (
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
              className="absolute inset-0 z-[70] bg-background flex flex-col"
            >
              <div className="flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] pb-3 border-b border-border flex-shrink-0">
                <button onClick={() => setShowNewForm(false)} className="text-sm font-medium text-primary">
                  Cancel
                </button>
                <h2 className="text-[16px] font-semibold text-foreground">New Calendar</h2>
                <button
                  onClick={handleCreateCalendar}
                  disabled={!newName.trim()}
                  className={cn(
                    "text-sm font-semibold transition-colors",
                    newName.trim() ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  Save
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
                <div>
                  <label className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                    Calendar Name
                  </label>
                  <input
                    autoFocus
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Work, Family, Fitness"
                    className="w-full bg-secondary rounded-xl px-4 py-3 text-[14px] text-foreground outline-none placeholder:text-muted-foreground"
                  />
                </div>

                <div>
                  <label className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider mb-3 block">
                    Color
                  </label>
                  <div className="grid grid-cols-6 gap-3">
                    {CALENDAR_COLORS.map((c) => (
                      <button
                        key={c.value}
                        onClick={() => setNewColor(c.value)}
                        className={cn(
                          "w-10 h-10 rounded-full flex items-center justify-center transition-all mx-auto",
                          newColor === c.value && "ring-2 ring-offset-2 ring-offset-background"
                        )}
                        style={{
                          backgroundColor: c.value,
                          ...(newColor === c.value ? { boxShadow: `0 0 0 2px var(--background), 0 0 0 4px ${c.value}` } : {}),
                        }}
                      >
                        {newColor === c.value && (
                          <Check size={18} className="text-white drop-shadow-sm" strokeWidth={3} />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bg-card rounded-xl border border-border p-4">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-2">Preview</p>
                  <div className="flex items-center gap-3">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: newColor }}
                    >
                      <Check size={14} className="text-white" strokeWidth={3} />
                    </div>
                    <span className="text-[14px] font-medium text-foreground">
                      {newName.trim() || "Calendar Name"}
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
};

export default CalendarsManager;
