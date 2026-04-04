import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, GroupMember } from "@/context/AuthContext";
import { format, differenceInDays, subDays, parseISO, startOfDay, addDays } from "date-fns";
import { Plus, Trophy, Flame, Calendar, DollarSign, ChevronDown, ChevronUp, Bell, EyeOff, Lock, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import PageGroupSelector from "@/components/PageGroupSelector";
import SobrietyUserFilter, { EVERYONE_SENTINEL } from "@/components/SobrietyUserFilter";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription,
} from "@/components/ui/drawer";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";

// ── Types ──
interface SobrietyCategory {
  id: string;
  label: string;
  icon: string;
  start_date: string;
  money_per_day: number;
  group_id: string | null;
  shared_group_ids: string[];
  user_id: string;
}

interface SobrietyCheckin {
  id: string;
  category_id: string;
  check_date: string;
  stayed_on_track: boolean;
  note: string | null;
  user_id: string;
}

// ── Constants ──
const PRESET_CATEGORIES = [
  { label: "Alcohol", icon: "🍺" },
  { label: "Smoking", icon: "🚬" },
  { label: "Weed", icon: "🌿" },
  { label: "Social Media", icon: "📱" },
];

const MILESTONES = [1, 3, 7, 14, 21, 30, 60, 90, 100, 180, 365, 500, 730, 1000];

function getNextMilestone(streak: number): number | null {
  return MILESTONES.find(m => m > streak) ?? null;
}

function normalizeLabel(label: string): string {
  return label.toLowerCase().replace(/[\s\-_.,!?'":;()]/g, "").trim();
}

// ── Dynamic user color palette ──
const USER_COLORS = [
  { bg: "hsl(210 90% 95%)", border: "hsl(210 70% 78%)", accent: "hsl(210 80% 55%)", pill: "hsl(210 90% 95%)", pillText: "hsl(210 60% 40%)" },
  { bg: "hsl(130 50% 93%)", border: "hsl(130 40% 72%)", accent: "hsl(130 50% 45%)", pill: "hsl(130 50% 93%)", pillText: "hsl(130 40% 30%)" },
  { bg: "hsl(340 60% 95%)", border: "hsl(340 50% 78%)", accent: "hsl(340 60% 55%)", pill: "hsl(340 60% 95%)", pillText: "hsl(340 45% 35%)" },
  { bg: "hsl(270 50% 95%)", border: "hsl(270 40% 78%)", accent: "hsl(270 50% 55%)", pill: "hsl(270 50% 95%)", pillText: "hsl(270 40% 35%)" },
  { bg: "hsl(40 70% 93%)", border: "hsl(40 55% 72%)", accent: "hsl(40 65% 50%)", pill: "hsl(40 70% 93%)", pillText: "hsl(40 50% 30%)" },
  { bg: "hsl(180 50% 93%)", border: "hsl(180 40% 72%)", accent: "hsl(180 50% 45%)", pill: "hsl(180 50% 93%)", pillText: "hsl(180 40% 30%)" },
];
const getUserColor = (index: number) => USER_COLORS[index % USER_COLORS.length];

// ── Types for display ──
interface DisplayUser {
  id: string;
  name: string;
  avatarUrl: string | null;
  initial: string;
  colorIndex: number;
}

interface SobrietyPageProps {
  onOpenSettings?: () => void;
}

const SobrietyPage = ({ onOpenSettings }: SobrietyPageProps) => {
  const { user, activeGroup, profile, groups } = useAuth();
  const [categories, setCategories] = useState<SobrietyCategory[]>([]);
  const [checkins, setCheckins] = useState<SobrietyCheckin[]>([]);
  const [showAddDrawer, setShowAddDrawer] = useState(false);
  const [showCheckinDialog, setShowCheckinDialog] = useState(false);
  const [checkinCategory, setCheckinCategory] = useState<SobrietyCategory | null>(null);
  const [checkinDates, setCheckinDates] = useState<string[]>([]);
  const [checkinIsMissed, setCheckinIsMissed] = useState(false);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [customLabel, setCustomLabel] = useState("");
  const [customIcon, setCustomIcon] = useState("🚫");
  const [moneyPerDay, setMoneyPerDay] = useState("");
  const [presetMoneyPerDay, setPresetMoneyPerDay] = useState<Record<string, string>>({});
  const [celebratingMilestone, setCelebratingMilestone] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  // Pre-fill for Add to Mine
  const [prefillLabel, setPrefillLabel] = useState("");

  // Undo check-in dialog
  const [undoCheckinCat, setUndoCheckinCat] = useState<SobrietyCategory | null>(null);

  // Duplicate warning dialog
  const [duplicateWarning, setDuplicateWarning] = useState<{
    existingName: string;
    pendingLabel: string;
    pendingIcon: string;
    pendingMoney: number;
  } | null>(null);

  // Context-specific pill selection state
  const pillStateRef = useRef<Map<string, Set<string>>>(new Map());
  const getContextKey = useCallback(() => {
    if ((activeGroup as any)?._personal === true) return "__personal__";
    if (activeGroup === null) return "__all__";
    return activeGroup.id;
  }, [activeGroup]);

  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set([EVERYONE_SENTINEL]));

  useEffect(() => {
    const key = getContextKey();
    const saved = pillStateRef.current.get(key);
    if (saved) {
      setSelectedUserIds(saved);
    } else {
      setSelectedUserIds(new Set([EVERYONE_SENTINEL]));
    }
  }, [getContextKey]);

  const handlePillChange = useCallback((ids: Set<string>) => {
    setSelectedUserIds(ids);
    pillStateRef.current.set(getContextKey(), ids);
  }, [getContextKey]);

  // Add category group selector state
  const [addGroupIds, setAddGroupIds] = useState<Set<string>>(new Set());

  const isPersonalActive = (activeGroup as any)?._personal === true;
  const isAllView = activeGroup === null && !isPersonalActive;
  const isGroupView = !!activeGroup && !isPersonalActive;
  const groupId = isPersonalActive ? null : (activeGroup?.id ?? null);
  const today = format(new Date(), "yyyy-MM-dd");

  const sobrietyGroups = useMemo(() =>
    groups.filter(g => g.shared_pages?.includes("sobriety")),
    [groups]
  );

  const [nudgeCooldowns, setNudgeCooldowns] = useState<Set<string>>(new Set());

  // ── Data fetching (unchanged logic) ──
  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    let allCats: SobrietyCategory[] = [];

    if (isPersonalActive) {
      const { data: cats } = await supabase
        .from("sobriety_categories")
        .select("*")
        .eq("user_id", user.id);
      allCats = (cats || []).map(c => ({
        ...c,
        shared_group_ids: (c as any).shared_group_ids || [],
      })) as SobrietyCategory[];
    } else if (isAllView) {
      const { data: myCats } = await supabase
        .from("sobriety_categories")
        .select("*")
        .eq("user_id", user.id);
      allCats = (myCats || []).map(c => ({
        ...c,
        shared_group_ids: (c as any).shared_group_ids || [],
      })) as SobrietyCategory[];

      for (const g of sobrietyGroups) {
        const { data: groupCats } = await supabase
          .from("sobriety_categories")
          .select("*")
          .neq("user_id", user.id)
          .contains("shared_group_ids", [g.id]);
        if (groupCats) {
          allCats = [...allCats, ...(groupCats as any[]).map(c => ({
            ...c,
            shared_group_ids: c.shared_group_ids || [],
          }))];
        }
      }
    } else if (groupId) {
      const { data: myCats } = await supabase
        .from("sobriety_categories")
        .select("*")
        .eq("user_id", user.id);
      allCats = (myCats || []).map(c => ({
        ...c,
        shared_group_ids: (c as any).shared_group_ids || [],
      })) as SobrietyCategory[];

      const { data: otherCats } = await supabase
        .from("sobriety_categories")
        .select("*")
        .neq("user_id", user.id)
        .contains("shared_group_ids", [groupId]);
      if (otherCats) {
        allCats = [...allCats, ...(otherCats as any[]).map(c => ({
          ...c,
          shared_group_ids: c.shared_group_ids || [],
        }))];
      }
    }

    const seen = new Set<string>();
    allCats = allCats.filter(c => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });

    setCategories(allCats);

    if (allCats.length > 0) {
      const { data: checks } = await supabase
        .from("sobriety_checkins")
        .select("*")
        .in("category_id", allCats.map(c => c.id));
      setCheckins((checks || []) as SobrietyCheckin[]);
    } else {
      setCheckins([]);
    }

    setLoading(false);
  }, [user, groupId, isPersonalActive, isAllView, sobrietyGroups]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Resolved users ──
  const effectiveSelectedUserIds = useMemo(() => {
    if (selectedUserIds.has(EVERYONE_SENTINEL)) return null;
    return selectedUserIds;
  }, [selectedUserIds]);

  const filteredCategories = useMemo(() => {
    if (!user) return [];
    let filtered = categories;
    if (effectiveSelectedUserIds !== null) {
      filtered = filtered.filter(c => effectiveSelectedUserIds.has(c.user_id));
    }
    return filtered;
  }, [categories, user, effectiveSelectedUserIds]);

  const isSharedWithCurrentGroup = useCallback((cat: SobrietyCategory) => {
    if (!groupId) return true;
    return (cat.shared_group_ids || []).includes(groupId);
  }, [groupId]);

  const getUserName = useCallback((userId: string) => {
    if (userId === user?.id) return profile?.display_name || "Me";
    for (const g of groups) {
      const member = g.members.find((m: GroupMember) => m.user_id === userId);
      if (member) return member.display_name || "Member";
    }
    return "Member";
  }, [user, profile, groups]);

  const getUserAvatarUrl = useCallback((userId: string) => {
    if (userId === user?.id) return profile?.avatar_url || null;
    for (const g of groups) {
      const member = g.members.find((m: GroupMember) => m.user_id === userId);
      if (member) return member.avatar_url || null;
    }
    return null;
  }, [user, profile, groups]);

  // Build ordered list of selected users
  const selectedUsersOrdered = useMemo((): DisplayUser[] => {
    const result: DisplayUser[] = [];
    let idx = 0;
    if (!user) return result;

    const resolvedIds = new Set<string>();
    if (effectiveSelectedUserIds === null) {
      resolvedIds.add(user.id);
      if (isGroupView && activeGroup) {
        activeGroup.members.filter((m: GroupMember) => m.status === "active").forEach((m: GroupMember) => resolvedIds.add(m.user_id));
      } else if (isAllView) {
        sobrietyGroups.forEach(g => g.members.filter((m: GroupMember) => m.status === "active").forEach((m: GroupMember) => resolvedIds.add(m.user_id)));
      }
    } else {
      effectiveSelectedUserIds.forEach(id => resolvedIds.add(id));
    }

    if (resolvedIds.has(user.id)) {
      result.push({
        id: user.id,
        name: profile?.display_name?.split(" ")[0] || "Me",
        avatarUrl: profile?.avatar_url || null,
        initial: (profile?.display_name || "M")[0].toUpperCase(),
        colorIndex: idx++,
      });
    }
    for (const uid of resolvedIds) {
      if (uid === user.id) continue;
      const name = getUserName(uid);
      result.push({
        id: uid,
        name: name.split(" ")[0],
        avatarUrl: getUserAvatarUrl(uid),
        initial: name[0]?.toUpperCase() || "?",
        colorIndex: idx++,
      });
    }
    return result;
  }, [effectiveSelectedUserIds, user, profile, activeGroup, isGroupView, isAllView, sobrietyGroups, getUserName, getUserAvatarUrl]);

  const multipleSelected = selectedUsersOrdered.length > 1;

  // ── Streak & check-in helpers (unchanged logic) ──
  const getStreakInfo = useCallback((cat: SobrietyCategory) => {
    const catCheckins = checkins
      .filter(c => c.category_id === cat.id && c.stayed_on_track)
      .map(c => c.check_date)
      .sort((a, b) => b.localeCompare(a));

    const checkinSet = new Set(catCheckins);
    const allCatCheckins = checkins.filter(c => c.category_id === cat.id);
    const failedSet = new Set(allCatCheckins.filter(c => !c.stayed_on_track).map(c => c.check_date));

    let currentStreak = 0;
    let d = startOfDay(new Date());
    while (true) {
      const dateStr = format(d, "yyyy-MM-dd");
      if (failedSet.has(dateStr)) break;
      if (checkinSet.has(dateStr)) {
        currentStreak++;
      } else {
        break;
      }
      d = subDays(d, 1);
    }

    const startDate = parseISO(cat.start_date);
    const totalDays = Math.max(differenceInDays(new Date(), startDate) + 1, 0);
    let longestStreak = 0;
    let tempStreak = 0;
    for (let i = 0; i < totalDays; i++) {
      const dd = addDays(startDate, i);
      const dateStr = format(dd, "yyyy-MM-dd");
      if (checkinSet.has(dateStr)) {
        tempStreak++;
      } else {
        longestStreak = Math.max(longestStreak, tempStreak);
        tempStreak = 0;
      }
    }
    longestStreak = Math.max(longestStreak, tempStreak);

    const totalSober = catCheckins.length;
    const moneySaved = totalSober * (cat.money_per_day || 0);

    const checkinMap = new Map<string, boolean>();
    allCatCheckins.forEach(c => checkinMap.set(c.check_date, c.stayed_on_track));

    return { currentStreak, longestStreak, totalSober, moneySaved, checkinMap, totalDays };
  }, [checkins]);

  const getMissedDays = useCallback((cat: SobrietyCategory): string[] => {
    const startDate = parseISO(cat.start_date);
    const catCheckinDates = new Set(
      checkins.filter(c => c.category_id === cat.id).map(c => c.check_date)
    );
    const missed: string[] = [];
    let d = startOfDay(new Date());
    for (let i = 0; i < 30; i++) {
      const dateStr = format(d, "yyyy-MM-dd");
      if (d >= startDate && !catCheckinDates.has(dateStr) && dateStr !== today) {
        missed.push(dateStr);
      }
      d = subDays(d, 1);
    }
    return missed;
  }, [checkins, today]);

  const isCheckedIn = useCallback((catId: string, date: string) => {
    return checkins.some(c => c.category_id === catId && c.check_date === date);
  }, [checkins]);

  const getHeatmapData = useCallback((cat: SobrietyCategory) => {
    const info = getStreakInfo(cat);
    const days: { date: string; status: "green" | "red" | "gray" }[] = [];
    for (let i = 90; i >= 0; i--) {
      const d = subDays(new Date(), i);
      const dateStr = format(d, "yyyy-MM-dd");
      const val = info.checkinMap.get(dateStr);
      if (val === true) days.push({ date: dateStr, status: "green" });
      else if (val === false) days.push({ date: dateStr, status: "red" });
      else days.push({ date: dateStr, status: "gray" });
    }
    return days;
  }, [getStreakInfo]);

  // Initialize add group selector when drawer opens
  useEffect(() => {
    if (showAddDrawer) {
      const initial = new Set<string>();
      if (groupId) initial.add(groupId);
      setAddGroupIds(initial);
    }
  }, [showAddDrawer, groupId]);

  // Duplicate check helper
  const findDuplicateTracker = useCallback((label: string): SobrietyCategory | undefined => {
    if (!user) return undefined;
    const normalized = normalizeLabel(label);
    if (!normalized) return undefined;
    return categories.find(c => c.user_id === user.id && normalizeLabel(c.label) === normalized);
  }, [categories, user]);

  // ── Handlers (all unchanged logic) ──
  const handleAddCategory = async (label: string, icon: string, money?: number) => {
    if (!user) return;
    const shared: string[] = Array.from(addGroupIds);
    const { error } = await supabase.from("sobriety_categories").insert({
      user_id: user.id,
      label,
      icon,
      group_id: null,
      start_date: today,
      money_per_day: money ?? (parseFloat(moneyPerDay) || 0),
      shared_group_ids: shared,
    } as any);
    if (error) { toast.error("Failed to add category"); return; }
    toast.success(`Now tracking: ${label}`);
    setShowAddDrawer(false);
    setCustomLabel("");
    setCustomIcon("🚫");
    setMoneyPerDay("");
    setPresetMoneyPerDay({});
    setPrefillLabel("");
    fetchData();
  };

  const tryAddCategory = (label: string, icon: string, money?: number) => {
    const existing = findDuplicateTracker(label);
    if (existing) {
      setDuplicateWarning({
        existingName: existing.label,
        pendingLabel: label,
        pendingIcon: icon,
        pendingMoney: money ?? (parseFloat(moneyPerDay) || 0),
      });
    } else {
      handleAddCategory(label, icon, money);
    }
  };

  const handleCheckin = async (onTrack: boolean) => {
    if (!user || !checkinCategory || checkinDates.length === 0) return;
    const rows = checkinDates.map(d => ({
      user_id: user.id,
      category_id: checkinCategory.id,
      check_date: d,
      stayed_on_track: onTrack,
    }));
    const { error } = await supabase.from("sobriety_checkins").upsert(
      rows as any[], { onConflict: "category_id,check_date" }
    );
    if (error) { toast.error("Failed to check in"); return; }
    if (onTrack) {
      if (checkinDates.length === 1 && checkinDates[0] === today) {
        const info = getStreakInfo(checkinCategory);
        const newStreak = info.currentStreak + 1;
        const milestone = MILESTONES.find(m => m === newStreak);
        if (milestone) {
          setCelebratingMilestone(milestone);
          setTimeout(() => setCelebratingMilestone(null), 3000);
        }
        toast.success("Great job! Keep it up! 💪");
      } else {
        toast.success(`Checked in ${checkinDates.length} day${checkinDates.length > 1 ? "s" : ""} ✅`);
      }
    } else {
      toast("It's okay. Every day is a fresh start. 💙");
    }
    setShowCheckinDialog(false);
    setCheckinCategory(null);
    setCheckinDates([]);
    setCheckinIsMissed(false);
    fetchData();
  };

  const handleBatchCheckin = (cat: SobrietyCategory, dates: string[], onTrack: boolean) => {
    setCheckinCategory(cat);
    setCheckinDates(dates);
    setCheckinIsMissed(true);
    if (onTrack) {
      handleCheckinDirect(cat, dates, true);
    } else {
      setShowCheckinDialog(true);
    }
  };

  const handleCheckinDirect = async (cat: SobrietyCategory, dates: string[], onTrack: boolean) => {
    if (!user) return;
    const rows = dates.map(d => ({
      user_id: user.id,
      category_id: cat.id,
      check_date: d,
      stayed_on_track: onTrack,
    }));
    const { error } = await supabase.from("sobriety_checkins").upsert(
      rows as any[], { onConflict: "category_id,check_date" }
    );
    if (error) { toast.error("Failed to check in"); return; }
    toast.success(`Checked in ${dates.length} day${dates.length > 1 ? "s" : ""} ✅`);
    fetchData();
  };

  const handleUndoCheckin = async () => {
    if (!user || !undoCheckinCat) return;
    const { error } = await supabase
      .from("sobriety_checkins")
      .delete()
      .eq("user_id", user.id)
      .eq("category_id", undoCheckinCat.id)
      .eq("check_date", today);
    if (error) { toast.error("Failed to remove check-in"); return; }
    toast.success("Check-in removed");
    setUndoCheckinCat(null);
    fetchData();
  };

  const handleDeleteCategory = async (catId: string) => {
    const { error } = await supabase.from("sobriety_categories").delete().eq("id", catId);
    if (error) { toast.error("Failed to remove"); return; }
    toast.success("Category removed");
    fetchData();
  };

  const handleResetStreak = async (cat: SobrietyCategory) => {
    await supabase.from("sobriety_categories").update({ start_date: today } as any).eq("id", cat.id);
    toast("Streak reset. Today is day one. You've got this! 🌱");
    fetchData();
  };

  const handleUpdateMoneyPerDay = async (catId: string, value: number) => {
    const { error } = await supabase.from("sobriety_categories").update({ money_per_day: value } as any).eq("id", catId);
    if (error) { toast.error("Failed to update"); return; }
    toast.success("Money saved updated");
    fetchData();
  };

  const handleAddPriorDays = async (cat: SobrietyCategory, days: number) => {
    if (!user) return;
    const startDate = parseISO(cat.start_date);
    const rows: any[] = [];
    for (let i = 1; i <= days; i++) {
      const d = subDays(startDate, i);
      rows.push({
        user_id: user.id,
        category_id: cat.id,
        check_date: format(d, "yyyy-MM-dd"),
        stayed_on_track: true,
      });
    }
    const newStart = format(subDays(startDate, days), "yyyy-MM-dd");
    const [{ error: checkErr }, { error: catErr }] = await Promise.all([
      supabase.from("sobriety_checkins").upsert(rows, { onConflict: "category_id,check_date" }),
      supabase.from("sobriety_categories").update({ start_date: newStart } as any).eq("id", cat.id),
    ]);
    if (checkErr || catErr) { toast.error("Failed to add prior days"); return; }
    toast.success(`Added ${days} prior sober days`);
    fetchData();
  };

  const handleToggleSharing = async (cat: SobrietyCategory, gid: string) => {
    const current = cat.shared_group_ids || [];
    const newIds = current.includes(gid)
      ? current.filter(id => id !== gid)
      : [...current, gid];
    const { error } = await supabase.from("sobriety_categories")
      .update({ shared_group_ids: newIds } as any)
      .eq("id", cat.id);
    if (error) { toast.error("Failed to update sharing"); return; }
    setCategories(prev => prev.map(c => c.id === cat.id ? { ...c, shared_group_ids: newIds } : c));
  };

  // Nudge handler
  const sendNudge = async (toUserId: string, catId?: string) => {
    if (!user) return;
    const name = getUserName(toUserId);
    const { error } = await supabase.from("nudges").insert({
      from_user_id: user.id,
      to_user_id: toUserId,
      message: `${profile?.display_name || "Someone"} nudged you to check in on your sobriety tracker! 💪`,
    } as any);
    if (error) { toast.error("Failed to nudge"); return; }
    toast.success(`${name.split(" ")[0]} has been nudged! 💪`);
    const cooldownKey = catId ? `${toUserId}_${catId}` : toUserId;
    setNudgeCooldowns(prev => new Set([...prev, cooldownKey]));
    setTimeout(() => {
      setNudgeCooldowns(prev => {
        const next = new Set(prev);
        next.delete(cooldownKey);
        return next;
      });
    }, 10000);
  };

  // Incoming nudge detection
  useEffect(() => {
    if (!user) return;
    const checkNudges = async () => {
      const { data } = await supabase
        .from("nudges")
        .select("*")
        .eq("to_user_id", user.id)
        .eq("seen", false)
        .ilike("message", "%sobriety%");
      if (data && data.length > 0) {
        data.forEach((n: any) => {
          toast.info(n.message, { duration: 5000 });
        });
        await supabase
          .from("nudges")
          .update({ seen: true } as any)
          .in("id", data.map((n: any) => n.id));
      }
    };
    checkNudges();
  }, [user]);

  // ── Add to Mine: opens add drawer with pre-fill ──
  const openAddToMine = (cat: SobrietyCategory) => {
    setPrefillLabel(cat.label);
    setCustomLabel(cat.label);
    setCustomIcon(cat.icon);
    setMoneyPerDay(String(cat.money_per_day || ""));
    setShowAddDrawer(true);
  };

  const toggleAddGroup = (gid: string) => {
    setAddGroupIds(prev => {
      const next = new Set(prev);
      if (next.has(gid)) next.delete(gid);
      else next.add(gid);
      return next;
    });
  };

  // ── Derived data for multi-user column layout ──
  // Get all unique tracker types (normalized labels) across all visible categories
  const trackerTypes = useMemo(() => {
    const types: { label: string; icon: string; normalizedKey: string }[] = [];
    const seen = new Set<string>();
    for (const cat of filteredCategories) {
      const key = normalizeLabel(cat.label);
      if (!seen.has(key)) {
        seen.add(key);
        types.push({ label: cat.label, icon: cat.icon, normalizedKey: key });
      }
    }
    return types;
  }, [filteredCategories]);

  // Check if logged-in user has a tracker of a given normalized type
  const myTrackerLabels = useMemo(() => {
    if (!user) return new Set<string>();
    return new Set(categories.filter(c => c.user_id === user.id).map(c => normalizeLabel(c.label)));
  }, [categories, user]);

  // ── Money saved summary ──
  const totalMoneySaved = useMemo(() => {
    const catsWithMoney = filteredCategories.filter(c => (c.money_per_day || 0) > 0);
    if (catsWithMoney.length === 0) return { total: 0, count: 0 };
    const total = catsWithMoney.reduce((sum, cat) => sum + getStreakInfo(cat).moneySaved, 0);
    return { total, count: catsWithMoney.length };
  }, [filteredCategories, getStreakInfo]);

  // ── Already-added presets for the add drawer (must be before early return) ──
  const myExistingLabels = useMemo(() => {
    if (!user) return new Set<string>();
    return new Set(categories.filter(c => c.user_id === user.id).map(c => normalizeLabel(c.label)));
  }, [categories, user]);

  // ── Rendering ──
  if (loading) {
    return (
      <div className="p-4">
        <h1 className="text-2xl font-bold text-foreground mb-6">Sobriety</h1>
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  // ── Single-user tracker card ──
  const renderSingleUserCard = (cat: SobrietyCategory) => {
    const info = getStreakInfo(cat);
    const checkedToday = isCheckedIn(cat.id, today);
    const nextMile = getNextMilestone(info.currentStreak);
    const isExpanded = expandedCard === cat.id;
    const showOnlyYou = !isPersonalActive && !isAllView && !!groupId && !isSharedWithCurrentGroup(cat);
    const missedDays = getMissedDays(cat);

    return (
      <motion.div
        key={cat.id}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card border border-border rounded-2xl overflow-hidden"
      >
        {/* Main card content */}
        <button
          onClick={() => setExpandedCard(isExpanded ? null : cat.id)}
          className="w-full p-3 text-left"
        >
          {/* Top row */}
          <div className="flex items-center gap-3">
            <span className="text-xl">{cat.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-[11px] text-muted-foreground">{cat.label}-free</p>
                {showOnlyYou && (
                  <span className="flex items-center gap-0.5 text-[9px] text-muted-foreground bg-secondary/80 px-1 py-0.5 rounded">
                    <EyeOff size={8} /> Only you
                  </span>
                )}
              </div>
              <span className="text-2xl font-bold text-foreground tabular-nums">{info.currentStreak} <span className="text-sm font-medium text-muted-foreground">days</span></span>
            </div>
            <div className="flex flex-col items-end gap-1">
              {info.moneySaved > 0 && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[hsl(var(--habit-green))]/15 text-[hsl(var(--habit-green))]">${info.moneySaved.toFixed(0)} saved</span>
              )}
              {nextMile && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-accent/15 text-accent">🏆 Next: {nextMile}d</span>
              )}
            </div>
          </div>

          {/* Progress bar toward next milestone */}
          {nextMile && (
            <div className="mt-2">
              <div className="flex items-center justify-between text-[9px] text-muted-foreground mb-0.5">
                <span>0</span>
                <span>Next milestone: {nextMile} days</span>
                <span>{nextMile}</span>
              </div>
              <div className="h-1 bg-secondary rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-primary"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min((info.currentStreak / nextMile) * 100, 100)}%` }}
                  transition={{ duration: 0.8, delay: 0.1 }}
                />
              </div>
            </div>
          )}
        </button>

        {/* Check-in status bar */}
        {checkedToday ? (
          <button
            onClick={() => setUndoCheckinCat(cat)}
            className="w-full px-3 py-2 bg-[hsl(var(--habit-green))]/10 text-[hsl(var(--habit-green))] text-xs font-semibold text-center"
          >
            ✅ Checked in today
          </button>
        ) : (
          <button
            onClick={() => {
              setCheckinCategory(cat);
              setCheckinDates([today]);
              setCheckinIsMissed(false);
              setShowCheckinDialog(true);
            }}
            className="w-full px-3 py-2 bg-primary/5 text-primary text-xs font-semibold text-center hover:bg-primary/10 transition-colors"
          >
            Check in today
          </button>
        )}

        {/* Expanded detail */}
        <AnimatePresence>
          {isExpanded && (
            <ExpandedCardContent
              cat={cat}
              info={info}
              missedDays={missedDays}
              getHeatmapData={getHeatmapData}
              onBatchCheckin={handleBatchCheckin}
              onResetStreak={handleResetStreak}
              onDeleteCategory={handleDeleteCategory}
              onUpdateMoneyPerDay={handleUpdateMoneyPerDay}
              onAddPriorDays={handleAddPriorDays}
              sobrietyGroups={sobrietyGroups}
              onToggleSharing={handleToggleSharing}
              isPersonalActive={isPersonalActive}
              isAllView={isAllView}
            />
          )}
        </AnimatePresence>
      </motion.div>
    );
  };

  // ── Multi-user column card ──
  const renderColumnCard = (trackerKey: string, displayUser: DisplayUser) => {
    const color = getUserColor(displayUser.colorIndex);
    const isMe = displayUser.id === user?.id;
    const userCat = filteredCategories.find(c => c.user_id === displayUser.id && normalizeLabel(c.label) === trackerKey);

    if (!userCat) {
      // User doesn't have this tracker
      if (!isMe) {
        // Other user doesn't have it
        return (
          <div
            className="rounded-xl border-2 border-dashed border-border/40 p-3 flex items-center justify-center min-h-[80px]"
          >
            <span className="text-[10px] text-muted-foreground">Not tracking</span>
          </div>
        );
      }
      // I don't have it but it shows in the grid because another user does
      return (
        <div
          className="rounded-xl border-2 border-dashed border-border/40 p-3 flex items-center justify-center min-h-[80px]"
        >
          <span className="text-[10px] text-muted-foreground">Not tracking</span>
        </div>
      );
    }

    const info = getStreakInfo(userCat);
    const checkedToday = isCheckedIn(userCat.id, today);
    const nextMile = getNextMilestone(info.currentStreak);
    const cooldownKey = `${displayUser.id}_${userCat.id}`;

    if (isMe) {
      // Own tracker — interactive
      return (
        <div
          className="rounded-xl p-2.5 min-h-[80px]"
          style={{ backgroundColor: color.bg, borderWidth: 1, borderColor: color.border, borderStyle: "solid" }}
        >
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-sm">{userCat.icon}</span>
            <span className="text-lg font-bold text-foreground tabular-nums">{info.currentStreak}<span className="text-[10px] font-normal text-muted-foreground ml-0.5">d</span></span>
          </div>
          {nextMile && (
            <div className="h-1 bg-secondary/60 rounded-full overflow-hidden mb-1.5">
              <div className="h-full rounded-full" style={{ backgroundColor: color.accent, width: `${Math.min((info.currentStreak / nextMile) * 100, 100)}%` }} />
            </div>
          )}
          {checkedToday ? (
            <button
              onClick={() => setUndoCheckinCat(userCat)}
              className="w-full text-[10px] font-semibold text-[hsl(var(--habit-green))] text-center py-1 rounded-lg bg-[hsl(var(--habit-green))]/10"
            >
              ✅ Done
            </button>
          ) : (
            <button
              onClick={() => {
                setCheckinCategory(userCat);
                setCheckinDates([today]);
                setCheckinIsMissed(false);
                setShowCheckinDialog(true);
              }}
              className="w-full text-[10px] font-semibold text-primary text-center py-1 rounded-lg bg-primary/10 hover:bg-primary/15 transition-colors"
            >
              Check in
            </button>
          )}
        </div>
      );
    }

    // Other user's tracker — read-only
    const iHaveThis = myTrackerLabels.has(trackerKey);

    return (
      <div
        className="rounded-xl p-2.5 min-h-[80px]"
        style={{ backgroundColor: color.bg, borderWidth: 1, borderColor: color.border, borderStyle: "solid" }}
      >
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-sm">{userCat.icon}</span>
          <span className="text-lg font-bold text-foreground tabular-nums">{info.currentStreak}<span className="text-[10px] font-normal text-muted-foreground ml-0.5">d</span></span>
        </div>
        {nextMile && (
          <div className="h-1 bg-secondary/60 rounded-full overflow-hidden mb-1.5">
            <div className="h-full rounded-full" style={{ backgroundColor: color.accent, width: `${Math.min((info.currentStreak / nextMile) * 100, 100)}%` }} />
          </div>
        )}
        {checkedToday ? (
          <div className="text-[10px] font-semibold text-[hsl(var(--habit-green))]/70 text-center py-1">
            ✅ Done
          </div>
        ) : (
          <button
            onClick={() => sendNudge(displayUser.id, userCat.id)}
            disabled={nudgeCooldowns.has(cooldownKey)}
            className={`w-full text-[10px] font-semibold text-center py-1 rounded-lg transition-all border ${
              nudgeCooldowns.has(cooldownKey)
                ? "border-border bg-secondary/50 text-muted-foreground opacity-50 cursor-not-allowed"
                : "border-primary/30 bg-primary/5 text-primary hover:bg-primary/10"
            }`}
          >
            🔔 Nudge {displayUser.name}
          </button>
        )}
        {/* Add to Mine button */}
        {!iHaveThis && (
          <button
            onClick={() => openAddToMine(userCat)}
            className="w-full text-[10px] font-medium text-primary text-center py-1 mt-1 rounded-lg border border-primary/20 hover:bg-primary/5 transition-colors"
          >
            + Add to Mine
          </button>
        )}
      </div>
    );
  };

  // ── Column header ──
  const renderColumnHeaders = () => (
    <div
      className="grid gap-[5px] mb-1"
      style={{ gridTemplateColumns: `repeat(${selectedUsersOrdered.length}, minmax(0, 1fr))` }}
    >
      {selectedUsersOrdered.map((u) => {
        const color = getUserColor(u.colorIndex);
        return (
          <div
            key={u.id}
            className="flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold justify-center"
            style={{ backgroundColor: color.pill, color: color.pillText }}
          >
            <div
              className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white shrink-0"
              style={{ backgroundColor: color.accent }}
            >
              {u.initial}
            </div>
            <span className="truncate">{u.name}</span>
          </div>
        );
      })}
    </div>
  );


  return (
    <div className="p-4 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-foreground">Sobriety</h1>
        <button
          onClick={() => { setPrefillLabel(""); setShowAddDrawer(true); }}
          className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-sm hover:bg-primary/90 transition-colors"
        >
          <Plus size={18} />
        </button>
      </div>

      <PageGroupSelector page="sobriety" personalLabel="Mine" hideAllPill />

      <SobrietyUserFilter
        selectedUserIds={selectedUserIds}
        onSelectionChange={handlePillChange}
      />

      {/* Money Saved Summary */}
      {totalMoneySaved.count > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-border rounded-2xl p-3 mb-3 flex items-center gap-3"
        >
          <div className="w-[30px] h-[30px] rounded-lg bg-accent/15 flex items-center justify-center shrink-0">
            <DollarSign size={16} className="text-accent" />
          </div>
          <div className="min-w-0">
            <p className="text-base font-bold text-foreground tabular-nums leading-tight">${totalMoneySaved.total.toFixed(0)} saved</p>
            <p className="text-[10px] text-muted-foreground">
              {multipleSelected ? "Combined across all trackers" : `Across ${totalMoneySaved.count} tracker${totalMoneySaved.count > 1 ? "s" : ""} this week`}
            </p>
          </div>
        </motion.div>
      )}

      {/* Empty state */}
      {filteredCategories.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-16"
        >
          <div className="text-5xl mb-4">🌱</div>
          <h2 className="text-lg font-semibold text-foreground mb-2">Start Your Journey</h2>
          <p className="text-sm text-muted-foreground mb-6 max-w-[260px] mx-auto">
            Track what you're abstaining from and celebrate every day of progress.
          </p>
          <Button onClick={() => setShowAddDrawer(true)} className="rounded-full px-6">
            <Plus size={16} className="mr-1" /> Add Tracker
          </Button>
        </motion.div>
      )}

      {/* Content */}
      {filteredCategories.length > 0 && (
        multipleSelected ? (
          // ── Multi-user column layout ──
          <div className="space-y-4">
            {trackerTypes.map(({ label, icon, normalizedKey }) => (
              <div key={normalizedKey}>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 px-0.5">
                  {icon} {label}
                </p>
                {renderColumnHeaders()}
                <div
                  className={`grid gap-[5px] ${selectedUsersOrdered.length > 3 ? "overflow-x-auto" : ""}`}
                  style={{ gridTemplateColumns: `repeat(${selectedUsersOrdered.length}, minmax(${selectedUsersOrdered.length > 3 ? "120px" : "0"}, 1fr))` }}
                >
                  {selectedUsersOrdered.map(u => (
                    <div key={u.id}>
                      {renderColumnCard(normalizedKey, u)}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          // ── Single-user card list ──
          <div className="space-y-3">
            {filteredCategories.map(cat => renderSingleUserCard(cat))}
          </div>
        )
      )}

      {/* ── Add Tracker Bottom Sheet ── */}
      <Drawer open={showAddDrawer} onOpenChange={setShowAddDrawer}>
        <DrawerContent className="max-h-[80dvh]">
          <DrawerHeader className="pb-2">
            <DrawerTitle className="text-base">Add a tracker</DrawerTitle>
            <DrawerDescription className="text-xs">What are you abstaining from?</DrawerDescription>
          </DrawerHeader>
          <ScrollArea className="max-h-[60dvh] px-4 pb-6">
            <div className="space-y-2">
              {/* Add to section */}
              {sobrietyGroups.length > 0 && (
                <div className="mb-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Add to</p>
                  <div className="flex flex-wrap gap-1.5">
                    <span className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-semibold border border-primary/40 bg-primary/10 text-foreground cursor-default">
                      <Lock size={10} /> 🏠 Personal
                    </span>
                    {sobrietyGroups.map(g => {
                      const selected = addGroupIds.has(g.id);
                      return (
                        <button
                          key={g.id}
                          onClick={() => toggleAddGroup(g.id)}
                          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-semibold transition-all border ${
                            selected
                              ? "border-primary/40 bg-primary/10 text-foreground"
                              : "border-border bg-secondary/50 text-muted-foreground hover:border-primary/20"
                          }`}
                        >
                          {g.emoji} {g.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Preset categories */}
              {PRESET_CATEGORIES.map(preset => {
                const alreadyAdded = myExistingLabels.has(normalizeLabel(preset.label));
                return (
                  <div key={preset.label} className="flex items-center gap-3 py-2 px-1 border-b border-border/30 last:border-none">
                    <span className="text-lg">{preset.icon}</span>
                    <span className="text-sm font-medium text-foreground flex-1">{preset.label}</span>
                    <Input
                      placeholder="$/day"
                      value={presetMoneyPerDay[preset.label] || ""}
                      onChange={e => setPresetMoneyPerDay(prev => ({ ...prev, [preset.label]: e.target.value }))}
                      type="number"
                      min="0"
                      step="0.01"
                      className="text-[11px] h-7 w-16 text-right"
                    />
                    {alreadyAdded ? (
                      <span className="text-[11px] font-semibold text-[hsl(var(--habit-green))] flex items-center gap-0.5 px-2">
                        <Check size={12} /> Added
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        className="h-7 px-3 rounded-lg text-[11px]"
                        onClick={() => tryAddCategory(preset.label, preset.icon, parseFloat(presetMoneyPerDay[preset.label] || "0"))}
                      >
                        Add
                      </Button>
                    )}
                  </div>
                );
              })}

              {/* Custom */}
              <div className="border border-border rounded-xl p-3 mt-3">
                <p className="text-xs font-medium text-foreground mb-2">Custom</p>
                <div className="flex items-center gap-2">
                  <Input
                    value={customIcon}
                    onChange={e => setCustomIcon(e.target.value)}
                    className="w-12 text-center text-lg h-9"
                    maxLength={2}
                  />
                  <Input
                    placeholder="Category name"
                    value={customLabel}
                    onChange={e => setCustomLabel(e.target.value)}
                    className="text-sm h-9 flex-1"
                  />
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <Input
                    placeholder="$/day saved (optional)"
                    value={moneyPerDay}
                    onChange={e => setMoneyPerDay(e.target.value)}
                    type="number"
                    min="0"
                    step="0.01"
                    className="text-xs h-8 flex-1"
                  />
                  <Button
                    onClick={() => {
                      if (customLabel.trim()) {
                        tryAddCategory(customLabel.trim(), customIcon || "🚫");
                      }
                    }}
                    disabled={!customLabel.trim()}
                    size="sm"
                    className="h-8 px-4 rounded-lg text-xs"
                  >
                    Add
                  </Button>
                </div>
              </div>
            </div>
          </ScrollArea>
        </DrawerContent>
      </Drawer>

      {/* Check-in Dialog */}
      <Dialog open={showCheckinDialog} onOpenChange={setShowCheckinDialog}>
        <DialogContent className="max-w-[320px] rounded-2xl">
          <DialogHeader className="text-center">
            <DialogTitle className="text-lg">
              {checkinCategory?.icon} {checkinCategory?.label}
            </DialogTitle>
            <DialogDescription className="text-sm">
              {checkinIsMissed
                ? `Did you stay on track on ${checkinDates.length === 1 ? format(parseISO(checkinDates[0]), "MMM d") : `${checkinDates.length} days`}?`
                : "Did you stay on track today?"
              }
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 pt-2">
            <Button
              onClick={() => handleCheckin(true)}
              className="rounded-xl h-14 text-base bg-[hsl(var(--habit-green))] hover:bg-[hsl(var(--habit-green))]/90 text-white"
            >
              ✅ Yes!
            </Button>
            <Button
              onClick={() => handleCheckin(false)}
              variant="outline"
              className="rounded-xl h-14 text-base border-destructive/30 text-destructive hover:bg-destructive/5"
            >
              {checkinIsMissed ? "No" : "Not today"}
            </Button>
          </div>
          <p className="text-[10px] text-center text-muted-foreground mt-1">
            No judgment — honesty is strength.
          </p>
        </DialogContent>
      </Dialog>

      {/* Undo Check-in Confirmation */}
      <AlertDialog open={!!undoCheckinCat} onOpenChange={(open) => { if (!open) setUndoCheckinCat(null); }}>
        <AlertDialogContent className="max-w-[340px] rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Undo today's check-in?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove your check-in for today and update your streak. Are you sure?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleUndoCheckin}
              className="rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Undo Check-in
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Duplicate Tracker Warning */}
      <AlertDialog open={!!duplicateWarning} onOpenChange={(open) => { if (!open) setDuplicateWarning(null); }}>
        <AlertDialogContent className="max-w-[340px] rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>You already have this tracker</AlertDialogTitle>
            <AlertDialogDescription>
              You already have a "{duplicateWarning?.existingName}" tracker. Are you sure you want to add another one?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (duplicateWarning) {
                  handleAddCategory(duplicateWarning.pendingLabel, duplicateWarning.pendingIcon, duplicateWarning.pendingMoney);
                  setDuplicateWarning(null);
                }
              }}
              className="rounded-lg"
            >
              Add Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Milestone Celebration */}
      <AnimatePresence>
        {celebratingMilestone && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
            onClick={() => setCelebratingMilestone(null)}
          >
            <motion.div
              initial={{ y: 20 }}
              animate={{ y: 0 }}
              className="bg-card border border-border rounded-3xl p-8 text-center shadow-lg max-w-[280px]"
            >
              <motion.div
                animate={{ rotate: [0, -10, 10, -10, 0] }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="text-6xl mb-4"
              >
                🏆
              </motion.div>
              <h2 className="text-2xl font-bold text-foreground mb-1">
                {celebratingMilestone} Days!
              </h2>
              <p className="text-sm text-muted-foreground">
                Incredible milestone! You're doing amazing.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ── Expanded Card Content (for single-user view) ──
function ExpandedCardContent({
  cat, info, missedDays, getHeatmapData,
  onBatchCheckin, onResetStreak, onDeleteCategory,
  onUpdateMoneyPerDay, onAddPriorDays,
  sobrietyGroups, onToggleSharing, isPersonalActive, isAllView,
}: {
  cat: SobrietyCategory;
  info: any;
  missedDays: string[];
  getHeatmapData: (cat: SobrietyCategory) => any;
  onBatchCheckin: (cat: SobrietyCategory, dates: string[], onTrack: boolean) => void;
  onResetStreak: (cat: SobrietyCategory) => void;
  onDeleteCategory: (id: string) => void;
  onUpdateMoneyPerDay: (catId: string, value: number) => void;
  onAddPriorDays: (cat: SobrietyCategory, days: number) => void;
  sobrietyGroups: any[];
  onToggleSharing: (cat: SobrietyCategory, gid: string) => void;
  isPersonalActive: boolean;
  isAllView: boolean;
}) {
  const [editingMoney, setEditingMoney] = useState(false);
  const [moneyValue, setMoneyValue] = useState(String(cat.money_per_day || ""));
  const [showPriorDays, setShowPriorDays] = useState(false);
  const [priorDaysCount, setPriorDaysCount] = useState("3");
  const [selectedMissed, setSelectedMissed] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const milestones = MILESTONES.filter(m => m <= info.currentStreak);
  const showSharingPills = !isPersonalActive && !isAllView && sobrietyGroups.length > 0;

  const toggleMissedDay = (d: string) => {
    setSelectedMissed(prev => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d); else next.add(d);
      return next;
    });
  };

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="overflow-hidden"
    >
      <div className="px-4 pb-4 space-y-3 border-t border-border/30 pt-3">
        {/* Inline sharing pills */}
        {showSharingPills && (
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground mb-1.5">Shared with</p>
            <div className="flex flex-wrap gap-1.5">
              {sobrietyGroups.map(g => {
                const isShared = (cat.shared_group_ids || []).includes(g.id);
                return (
                  <button
                    key={g.id}
                    onClick={(e) => { e.stopPropagation(); onToggleSharing(cat, g.id); }}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all border ${
                      isShared
                        ? "border-primary/40 bg-primary/10 text-foreground"
                        : "border-transparent bg-secondary/50 text-muted-foreground hover:border-primary/20"
                    }`}
                  >
                    {g.emoji} {g.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-secondary/50 rounded-xl p-3 text-center">
            <Flame size={16} className="mx-auto text-destructive mb-1" />
            <p className="text-lg font-bold text-foreground tabular-nums">{info.longestStreak}</p>
            <p className="text-[10px] text-muted-foreground">Longest Streak</p>
          </div>
          <div className="bg-secondary/50 rounded-xl p-3 text-center">
            <Calendar size={16} className="mx-auto text-primary mb-1" />
            <p className="text-lg font-bold text-foreground tabular-nums">{info.totalSober}</p>
            <p className="text-[10px] text-muted-foreground">Checked-In Days</p>
          </div>
          {cat.money_per_day > 0 && (
            <div className="bg-secondary/50 rounded-xl p-3 text-center col-span-2">
              <DollarSign size={16} className="mx-auto text-accent mb-1" />
              <p className="text-lg font-bold text-foreground tabular-nums">${info.moneySaved.toFixed(0)}</p>
              <p className="text-[10px] text-muted-foreground">Money Saved</p>
            </div>
          )}

          <div className="col-span-2">
            {editingMoney ? (
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="$/day"
                  value={moneyValue}
                  onChange={e => setMoneyValue(e.target.value)}
                  className="text-sm h-8 flex-1"
                  autoFocus
                />
                <Button
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => {
                    onUpdateMoneyPerDay(cat.id, parseFloat(moneyValue) || 0);
                    setEditingMoney(false);
                  }}
                >
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs"
                  onClick={() => { setEditingMoney(false); setMoneyValue(String(cat.money_per_day || "")); }}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <button
                onClick={() => setEditingMoney(true)}
                className="text-[11px] text-primary font-medium hover:underline flex items-center gap-1"
              >
                <DollarSign size={12} />
                {cat.money_per_day > 0 ? `Edit money saved ($${cat.money_per_day}/day)` : "Add money saved per day"}
              </button>
            )}
          </div>
        </div>

        {/* Add Prior Sober Days */}
        <div>
          {showPriorDays ? (
            <div className="bg-secondary/50 rounded-xl p-3 space-y-2">
              <p className="text-xs font-medium text-foreground">Add prior sober days</p>
              <p className="text-[10px] text-muted-foreground">Were you sober before creating this card? Add those days here.</p>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="1"
                  max="365"
                  value={priorDaysCount}
                  onChange={e => setPriorDaysCount(e.target.value)}
                  placeholder="Days"
                  className="text-sm h-8 w-20"
                />
                <span className="text-xs text-muted-foreground">days before start</span>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="h-8 text-xs rounded-lg"
                  onClick={() => {
                    const count = parseInt(priorDaysCount) || 0;
                    if (count > 0) {
                      onAddPriorDays(cat, count);
                      setShowPriorDays(false);
                    }
                  }}
                >
                  Add {priorDaysCount || 0} days
                </Button>
                <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setShowPriorDays(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowPriorDays(true)}
              className="text-[11px] text-primary font-medium hover:underline flex items-center gap-1"
            >
              <Calendar size={12} />
              Add prior sober days
            </button>
          )}
        </div>

        {/* Missed Days */}
        {missedDays.length > 0 && (
          <div>
            <p className="text-xs font-medium text-foreground mb-2">Missed Days</p>
            <div className="flex flex-wrap gap-1.5">
              {missedDays.slice(0, 14).map(d => {
                const isSelected = selectedMissed.has(d);
                return (
                  <button
                    key={d}
                    onClick={(e) => { e.stopPropagation(); toggleMissedDay(d); }}
                    className={`text-[10px] font-medium px-2 py-1 rounded-lg transition-colors border ${
                      isSelected
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-secondary hover:bg-primary/10 hover:text-primary border-border"
                    }`}
                  >
                    {format(parseISO(d), "MMM d")}
                  </button>
                );
              })}
              {missedDays.length > 14 && (
                <span className="text-[10px] text-muted-foreground self-center">+{missedDays.length - 14} more</span>
              )}
            </div>
            {selectedMissed.size > 0 && (
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  className="h-8 text-xs rounded-lg flex-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    onBatchCheckin(cat, Array.from(selectedMissed), true);
                    setSelectedMissed(new Set());
                  }}
                >
                  ✅ Check in {selectedMissed.size} day{selectedMissed.size > 1 ? "s" : ""}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs"
                  onClick={(e) => { e.stopPropagation(); setSelectedMissed(new Set()); }}
                >
                  Clear
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Heatmap */}
        <div>
          <p className="text-xs font-medium text-foreground mb-2">Last 13 Weeks</p>
          <HeatmapGrid data={getHeatmapData(cat)} />
        </div>

        {/* Milestones */}
        {milestones.length > 0 && (
          <div>
            <p className="text-xs font-medium text-foreground mb-2">Milestones</p>
            <div className="flex flex-wrap gap-1.5">
              {milestones.map(m => (
                <span key={m} className="bg-accent/15 text-accent text-[10px] font-semibold px-2 py-1 rounded-full">
                  🏆 {m} days
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Start date + actions */}
        <div className="flex items-center justify-between pt-1">
          <p className="text-[10px] text-muted-foreground">
            Started {format(parseISO(cat.start_date), "MMM d, yyyy")}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => onResetStreak(cat)}
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Reset
            </button>
            {!showDeleteConfirm ? (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="text-[10px] text-destructive hover:text-destructive/80 transition-colors"
              >
                Remove
              </button>
            ) : (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onDeleteCategory(cat.id)}
                  className="text-[10px] text-destructive font-semibold hover:text-destructive/80"
                >
                  Confirm
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="text-[10px] text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ── Heatmap Grid ──
function HeatmapGrid({ data }: { data: { date: string; status: "green" | "red" | "gray" }[] }) {
  const weeks: typeof data[] = [];
  let week: typeof data = [];

  const firstDate = data[0]?.date ? parseISO(data[0].date) : new Date();
  const startDay = firstDate.getDay();
  for (let i = 0; i < startDay; i++) {
    week.push({ date: "", status: "gray" });
  }

  for (const d of data) {
    week.push(d);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length > 0) weeks.push(week);

  const colorMap = {
    green: "bg-[hsl(var(--habit-green))]",
    red: "bg-destructive/60",
    gray: "bg-secondary",
  };

  return (
    <div className="flex gap-[3px] overflow-x-auto pb-1">
      {weeks.map((w, wi) => (
        <div key={wi} className="flex flex-col gap-[3px]">
          {w.map((d, di) => (
            <div
              key={di}
              className={`w-3 h-3 rounded-[2px] ${d.date ? colorMap[d.status] : "bg-transparent"}`}
              title={d.date ? `${d.date}: ${d.status === "green" ? "✅" : d.status === "red" ? "❌" : "—"}` : ""}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export default SobrietyPage;
