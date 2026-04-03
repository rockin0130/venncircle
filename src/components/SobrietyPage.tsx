import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { format, differenceInDays, subDays, parseISO, startOfDay, addDays } from "date-fns";
import { Plus, Trophy, Flame, Calendar, DollarSign, ChevronDown, ChevronUp, Sparkles, Bell, EyeOff } from "lucide-react";
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

const PRESET_CATEGORIES = [
  { label: "Alcohol", icon: "🍺" },
  { label: "Smoking", icon: "🚬" },
  { label: "Weed", icon: "🌿" },
  { label: "Social Media", icon: "📱" },
];

const MOTIVATIONAL_QUOTES = [
  "Every day is a new beginning. Take a deep breath and start again.",
  "You are stronger than you think. Keep going.",
  "Progress, not perfection, is what matters.",
  "One day at a time. You've got this.",
  "The secret of getting ahead is getting started.",
  "Believe you can and you're halfway there.",
  "Your future self will thank you for today.",
  "Small steps every day lead to big changes.",
  "You don't have to be perfect to be amazing.",
  "Courage doesn't always roar. Sometimes it's the quiet voice saying 'I'll try again tomorrow.'",
  "You are not your past. You are your potential.",
  "Tough times never last, but tough people do.",
  "Every moment is a fresh start.",
  "Be proud of how far you've come.",
  "Recovery is not a race. Take it one step at a time.",
];

const MILESTONES = [1, 3, 7, 14, 21, 30, 60, 90, 100, 180, 365, 500, 730, 1000];

function getDailyQuote(): string {
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  return MOTIVATIONAL_QUOTES[dayOfYear % MOTIVATIONAL_QUOTES.length];
}

function getNextMilestone(streak: number): number | null {
  return MILESTONES.find(m => m > streak) ?? null;
}

function getReachedMilestones(streak: number): number[] {
  return MILESTONES.filter(m => m <= streak);
}

/** Normalize a string for duplicate detection: lowercase, remove spaces/hyphens/punctuation, trim */
function normalizeLabel(label: string): string {
  return label.toLowerCase().replace(/[\s\-_.,!?'":;()]/g, "").trim();
}

interface SobrietyPageProps {
  onOpenSettings?: () => void;
}

const SobrietyPage = ({ onOpenSettings }: SobrietyPageProps = {}) => {
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

  // Undo check-in dialog
  const [undoCheckinCat, setUndoCheckinCat] = useState<SobrietyCategory | null>(null);

  // Duplicate warning dialog
  const [duplicateWarning, setDuplicateWarning] = useState<{
    existingName: string;
    pendingLabel: string;
    pendingIcon: string;
    pendingMoney: number;
  } | null>(null);

  // Add partner tracker modal
  const [addingPartnerTracker, setAddingPartnerTracker] = useState<SobrietyCategory | null>(null);
  const [addTrackerName, setAddTrackerName] = useState("");
  const [addTrackerGroupIds, setAddTrackerGroupIds] = useState<Set<string>>(new Set());
  const [addTrackerMoney, setAddTrackerMoney] = useState("");
  const [addTrackerPriorDays, setAddTrackerPriorDays] = useState("");

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
  const groupId = isPersonalActive ? null : (activeGroup?.id ?? null);
  const today = format(new Date(), "yyyy-MM-dd");

  const sobrietyGroups = useMemo(() =>
    groups.filter(g => g.shared_pages?.includes("sobriety")),
    [groups]
  );

  const getSharedGroupIds = useCallback((otherUserId: string) => {
    return sobrietyGroups
      .filter(g => g.members.some(m => m.user_id === otherUserId && m.status === "active"))
      .map(g => g.id);
  }, [sobrietyGroups]);

  const [nudgeCooldowns, setNudgeCooldowns] = useState<Set<string>>(new Set());

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

    // Deduplicate by id
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

  const categoriesByUser = useMemo(() => {
    const map = new Map<string, SobrietyCategory[]>();
    filteredCategories.forEach(c => {
      const existing = map.get(c.user_id) || [];
      existing.push(c);
      map.set(c.user_id, existing);
    });
    return map;
  }, [filteredCategories]);

  const getUserName = useCallback((userId: string) => {
    if (userId === user?.id) return profile?.display_name || "Me";
    for (const g of groups) {
      const member = g.members.find(m => m.user_id === userId);
      if (member) return member.display_name || "Member";
    }
    return "Member";
  }, [user, profile, groups]);

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
    fetchData();
  };

  /** Try to add a category, checking for duplicates first */
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

  // Undo check-in handler
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
      const dateStr = format(d, "yyyy-MM-dd");
      rows.push({
        user_id: user.id,
        category_id: cat.id,
        check_date: dateStr,
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

  // Inline sharing toggle for a tracker card
  const handleToggleSharing = async (cat: SobrietyCategory, gid: string) => {
    const current = cat.shared_group_ids || [];
    const newIds = current.includes(gid)
      ? current.filter(id => id !== gid)
      : [...current, gid];
    const { error } = await supabase.from("sobriety_categories")
      .update({ shared_group_ids: newIds } as any)
      .eq("id", cat.id);
    if (error) { toast.error("Failed to update sharing"); return; }
    // Update local state immediately
    setCategories(prev => prev.map(c => c.id === cat.id ? { ...c, shared_group_ids: newIds } : c));
  };

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

  // Nudge handler
  const sendNudge = async (toUserId: string) => {
    if (!user) return;
    const name = getUserName(toUserId);
    const { error } = await supabase.from("nudges").insert({
      from_user_id: user.id,
      to_user_id: toUserId,
      message: `${profile?.display_name || "Someone"} nudged you to check in on your sobriety tracker! 💪`,
    } as any);
    if (error) { toast.error("Failed to nudge"); return; }
    toast.success(`${name} has been nudged! 💪`);
    setNudgeCooldowns(prev => new Set([...prev, toUserId]));
    setTimeout(() => {
      setNudgeCooldowns(prev => {
        const next = new Set(prev);
        next.delete(toUserId);
        return next;
      });
    }, 10000);
  };

  const userNeedsNudge = useCallback((userId: string) => {
    if (userId === user?.id) return false;
    const userCats = categories.filter(c => c.user_id === userId);
    if (userCats.length === 0) return false;
    return userCats.some(c => !isCheckedIn(c.id, today));
  }, [categories, user, isCheckedIn, today]);

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

  const userOrder = useMemo(() => {
    const order: string[] = [];
    if (!user) return order;
    const meSelected = effectiveSelectedUserIds === null || effectiveSelectedUserIds.has(user.id);
    if (meSelected && categoriesByUser.has(user.id)) order.push(user.id);
    for (const [uid] of categoriesByUser) {
      if (uid !== user.id && !order.includes(uid)) order.push(uid);
    }
    return order;
  }, [user, effectiveSelectedUserIds, categoriesByUser]);

  const showSections = !isPersonalActive && userOrder.length > 0 &&
    (effectiveSelectedUserIds === null ? categories.some(c => c.user_id !== user?.id) : effectiveSelectedUserIds.size > 1 || !effectiveSelectedUserIds.has(user?.id || ""));

  // Add partner tracker handlers
  const openAddPartnerTracker = (cat: SobrietyCategory) => {
    setAddingPartnerTracker(cat);
    setAddTrackerName(cat.label);
    setAddTrackerMoney(String(cat.money_per_day || ""));
    setAddTrackerPriorDays("");
    const initial = new Set<string>();
    if (groupId) initial.add(groupId);
    setAddTrackerGroupIds(initial);
  };

  const handleAddPartnerTracker = async () => {
    if (!user || !addingPartnerTracker) return;
    const name = addTrackerName.trim();
    if (!name) return;

    // Duplicate check for partner tracker too
    const existing = findDuplicateTracker(name);
    if (existing) {
      setDuplicateWarning({
        existingName: existing.label,
        pendingLabel: name,
        pendingIcon: addingPartnerTracker.icon,
        pendingMoney: parseFloat(addTrackerMoney) || 0,
      });
      return;
    }

    await doAddPartnerTracker();
  };

  const doAddPartnerTracker = async () => {
    if (!user || !addingPartnerTracker) return;
    const name = addTrackerName.trim();
    if (!name) return;

    const shared: string[] = Array.from(addTrackerGroupIds);
    const money = parseFloat(addTrackerMoney) || 0;
    const priorDays = parseInt(addTrackerPriorDays) || 0;
    const startDate = priorDays > 0
      ? format(subDays(new Date(), priorDays), "yyyy-MM-dd")
      : today;

    const { data: inserted, error } = await supabase.from("sobriety_categories").insert({
      user_id: user.id,
      label: name,
      icon: addingPartnerTracker.icon,
      group_id: null,
      start_date: startDate,
      money_per_day: money,
      shared_group_ids: shared,
    } as any).select().single();

    if (error || !inserted) { toast.error("Failed to add tracker"); return; }

    if (priorDays > 0) {
      const rows: any[] = [];
      for (let i = 0; i < priorDays; i++) {
        const d = subDays(new Date(), i);
        rows.push({
          user_id: user.id,
          category_id: (inserted as any).id,
          check_date: format(d, "yyyy-MM-dd"),
          stayed_on_track: true,
        });
      }
      await supabase.from("sobriety_checkins").upsert(rows, { onConflict: "category_id,check_date" });
    }

    toast.success("Tracker added!");
    setAddingPartnerTracker(null);
    fetchData();
  };

  // Card tap handler — only partner cards open modal now; own cards expand/collapse
  const handleCardTap = (cat: SobrietyCategory) => {
    const isMe = cat.user_id === user?.id;
    if (!isMe) {
      openAddPartnerTracker(cat);
    }
  };

  if (loading) {
    return (
      <div className="p-4">
        <h1 className="text-xl font-bold text-foreground mb-6">Sobriety</h1>
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  const toggleAddGroup = (gid: string) => {
    setAddGroupIds(prev => {
      const next = new Set(prev);
      if (next.has(gid)) next.delete(gid);
      else next.add(gid);
      return next;
    });
  };

  const renderUserSection = (userId: string) => {
    const isMe = userId === user?.id;
    const readOnly = !isMe;
    const userCats = categoriesByUser.get(userId) || [];
    const name = getUserName(userId);
    const showNudge = readOnly && userNeedsNudge(userId);

    return (
      <section key={userId} className="mb-5">
        {showSections && (
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
            <span className={`w-2.5 h-2.5 rounded-full ${isMe ? "bg-[hsl(var(--user-a))]" : "bg-[hsl(var(--user-b))]"}`} />
            {isMe ? (profile?.display_name || "Me") : name}
            <span className="text-muted-foreground text-xs">({userCats.length})</span>
          </h3>
        )}
        {userCats.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">No sobriety trackers</p>
        ) : (
          <div className="space-y-3">
            {userCats.map((cat, idx) => (
              <SobrietyCategoryCard
                key={cat.id}
                cat={cat}
                idx={idx}
                getStreakInfo={getStreakInfo}
                getHeatmapData={getHeatmapData}
                getMissedDays={getMissedDays}
                isCheckedIn={isCheckedIn}
                today={today}
                expandedCard={expandedCard}
                setExpandedCard={setExpandedCard}
                onBatchCheckin={handleBatchCheckin}
                handleResetStreak={handleResetStreak}
                handleDeleteCategory={handleDeleteCategory}
                readOnly={readOnly}
                onUpdateMoneyPerDay={handleUpdateMoneyPerDay}
                onAddPriorDays={handleAddPriorDays}
                showOnlyYou={isMe && !isPersonalActive && !isAllView && !!groupId && !isSharedWithCurrentGroup(cat)}
                onCardTap={handleCardTap}
                sobrietyGroups={sobrietyGroups}
                onToggleSharing={handleToggleSharing}
                isPersonalActive={isPersonalActive}
                isAllView={isAllView}
                onUndoCheckin={setUndoCheckinCat}
              />
            ))}
          </div>
        )}
        {showNudge && (
          <button
            onClick={() => sendNudge(userId)}
            disabled={nudgeCooldowns.has(userId)}
            className={`mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
              nudgeCooldowns.has(userId)
                ? "border-border bg-secondary/50 text-muted-foreground opacity-50 cursor-not-allowed"
                : "border-primary/30 bg-primary/5 text-primary hover:bg-primary/10"
            }`}
          >
            <Bell size={12} />
            🔔 Nudge {name.split(" ")[0]}
          </button>
        )}
      </section>
    );
  };

  return (
    <div className="p-4 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-foreground">Sobriety</h1>
        <button
          onClick={() => setShowAddDrawer(true)}
          className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        >
          <Plus size={18} />
        </button>
      </div>

      <PageGroupSelector page="sobriety" />

      {/* Pill User Filter */}
      <SobrietyUserFilter
        selectedUserIds={selectedUserIds}
        onSelectionChange={handlePillChange}
      />

      {/* Motivational Quote */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card border border-border rounded-2xl p-4 mb-4"
      >
        <div className="flex items-start gap-2">
          <Sparkles size={16} className="text-accent mt-0.5 shrink-0" />
          <p className="text-sm text-muted-foreground italic leading-relaxed">{getDailyQuote()}</p>
        </div>
      </motion.div>

      {/* Aggregate Money Saved */}
      {(() => {
        const catsWithMoney = filteredCategories.filter(c => (c.money_per_day || 0) > 0);
        if (catsWithMoney.length === 0) return null;
        const totalSaved = catsWithMoney.reduce((sum, cat) => sum + getStreakInfo(cat).moneySaved, 0);
        return (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="bg-card border border-border rounded-2xl p-3 mb-4 flex items-center gap-3"
          >
            <div className="w-9 h-9 rounded-xl bg-accent/15 flex items-center justify-center shrink-0">
              <DollarSign size={18} className="text-accent" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold text-foreground tabular-nums leading-tight">${totalSaved.toFixed(0)}</p>
              <p className="text-[10px] text-muted-foreground">Saved across {catsWithMoney.length} tracker{catsWithMoney.length > 1 ? "s" : ""}</p>
            </div>
          </motion.div>
        );
      })()}

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
            <Plus size={16} className="mr-1" /> Add Category
          </Button>
        </motion.div>
      )}

      {/* Render sections per user */}
      {filteredCategories.length > 0 && (
        showSections ? (
          <div className="space-y-2">
            {userOrder.map(uid => renderUserSection(uid))}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredCategories.map((cat, idx) => (
              <SobrietyCategoryCard
                key={cat.id}
                cat={cat}
                idx={idx}
                getStreakInfo={getStreakInfo}
                getHeatmapData={getHeatmapData}
                getMissedDays={getMissedDays}
                isCheckedIn={isCheckedIn}
                today={today}
                expandedCard={expandedCard}
                setExpandedCard={setExpandedCard}
                onBatchCheckin={handleBatchCheckin}
                handleResetStreak={handleResetStreak}
                handleDeleteCategory={handleDeleteCategory}
                readOnly={false}
                onUpdateMoneyPerDay={handleUpdateMoneyPerDay}
                onAddPriorDays={handleAddPriorDays}
                showOnlyYou={!isPersonalActive && !isAllView && !!groupId && !isSharedWithCurrentGroup(cat)}
                onCardTap={handleCardTap}
                sobrietyGroups={sobrietyGroups}
                onToggleSharing={handleToggleSharing}
                isPersonalActive={isPersonalActive}
                isAllView={isAllView}
                onUndoCheckin={setUndoCheckinCat}
              />
            ))}
          </div>
        )
      )}

      {/* Add Category Drawer */}
      <Drawer open={showAddDrawer} onOpenChange={setShowAddDrawer}>
        <DrawerContent className="max-h-[85dvh]">
          <DrawerHeader className="pb-2">
            <DrawerTitle className="text-base">What are you abstaining from?</DrawerTitle>
            <DrawerDescription className="text-xs">Choose a category or create your own.</DrawerDescription>
          </DrawerHeader>
          <ScrollArea className="max-h-[60dvh] px-4 pb-6">
            <div className="space-y-2">
              {/* Add to section */}
              {sobrietyGroups.length > 0 && (
                <div className="border border-border rounded-xl p-3 mb-3">
                  <p className="text-xs font-medium text-foreground mb-2">Add to</p>
                  <div className="flex flex-wrap gap-1.5">
                    <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border border-primary/40 bg-primary/12 text-foreground opacity-80 cursor-not-allowed">
                      🏠 Personal
                    </span>
                    {sobrietyGroups.map(g => {
                      const selected = addGroupIds.has(g.id);
                      return (
                        <button
                          key={g.id}
                          onClick={() => toggleAddGroup(g.id)}
                          className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all border ${
                            selected
                              ? "border-primary/40 bg-primary/12 text-foreground"
                              : "border-transparent bg-secondary/50 text-muted-foreground"
                          }`}
                        >
                          {g.emoji} {g.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {PRESET_CATEGORIES.map(preset => {
                const alreadyAdded = categories.some(c => c.label === preset.label && c.user_id === user?.id);
                return (
                  <div
                    key={preset.label}
                    className={`rounded-xl border transition-all ${
                      alreadyAdded
                        ? "bg-secondary/50 border-border opacity-50"
                        : "bg-card border-border"
                    }`}
                  >
                    <div className="flex items-center gap-3 p-3">
                      <span className="text-xl">{preset.icon}</span>
                      <span className="text-sm font-medium text-foreground flex-1">{preset.label}</span>
                      {alreadyAdded && <span className="text-[10px] text-muted-foreground">Added</span>}
                    </div>
                    {!alreadyAdded && (
                      <div className="px-3 pb-3 flex items-center gap-2">
                        <Input
                          placeholder="$/day saved (optional)"
                          value={presetMoneyPerDay[preset.label] || ""}
                          onChange={e => setPresetMoneyPerDay(p => ({ ...p, [preset.label]: e.target.value }))}
                          type="number"
                          min="0"
                          step="0.01"
                          className="text-xs h-8 flex-1"
                        />
                        <Button
                          onClick={() => tryAddCategory(preset.label, preset.icon, parseFloat(presetMoneyPerDay[preset.label] || "0") || 0)}
                          size="sm"
                          className="h-8 px-4 rounded-lg text-xs"
                        >
                          Add
                        </Button>
                      </div>
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

      {/* Undo Check-in Confirmation Dialog */}
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

      {/* Duplicate Tracker Warning Dialog */}
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

      {/* Add Partner Tracker Modal */}
      <Drawer open={!!addingPartnerTracker} onOpenChange={(open) => { if (!open) setAddingPartnerTracker(null); }}>
        <DrawerContent className="max-h-[85dvh]">
          <DrawerHeader className="pb-2">
            <DrawerTitle className="text-base">{addingPartnerTracker?.icon} Add to My Trackers</DrawerTitle>
            <DrawerDescription className="text-xs">Create your own version of this tracker</DrawerDescription>
          </DrawerHeader>
          <ScrollArea className="max-h-[60dvh] px-4 pb-6">
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-foreground mb-1.5">Tracker name</p>
                <Input
                  value={addTrackerName}
                  onChange={e => setAddTrackerName(e.target.value)}
                  className="text-sm h-9"
                />
              </div>

              <div>
                <p className="text-xs font-medium text-foreground mb-1.5">Add to</p>
                <div className="flex flex-wrap gap-1.5">
                  <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border border-primary/40 bg-primary/12 text-foreground opacity-80 cursor-not-allowed">
                    🏠 Personal
                  </span>
                  {sobrietyGroups.map(g => {
                    const selected = addTrackerGroupIds.has(g.id);
                    return (
                      <button
                        key={g.id}
                        onClick={() => {
                          setAddTrackerGroupIds(prev => {
                            const next = new Set(prev);
                            if (next.has(g.id)) next.delete(g.id);
                            else next.add(g.id);
                            return next;
                          });
                        }}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all border ${
                          selected
                            ? "border-primary/40 bg-primary/12 text-foreground"
                            : "border-transparent bg-secondary/50 text-muted-foreground"
                        }`}
                      >
                        {g.emoji} {g.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-foreground mb-1.5">Money saved per day (optional)</p>
                <Input
                  value={addTrackerMoney}
                  onChange={e => setAddTrackerMoney(e.target.value)}
                  placeholder="e.g. 10"
                  type="number"
                  min="0"
                  step="0.01"
                  className="text-sm h-9"
                />
              </div>

              <div>
                <p className="text-xs font-medium text-foreground mb-1.5">Prior sober days (optional)</p>
                <Input
                  value={addTrackerPriorDays}
                  onChange={e => setAddTrackerPriorDays(e.target.value)}
                  placeholder="e.g. 7"
                  type="number"
                  min="0"
                  className="text-sm h-9"
                />
                <p className="text-[10px] text-muted-foreground mt-1">Days you were already sober before adding this tracker</p>
              </div>

              <Button
                onClick={handleAddPartnerTracker}
                disabled={!addTrackerName.trim()}
                className="w-full rounded-xl"
              >
                Add Tracker
              </Button>
            </div>
          </ScrollArea>
        </DrawerContent>
      </Drawer>

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

// Category Card Component
function SobrietyCategoryCard({
  cat, idx, getStreakInfo, getHeatmapData, getMissedDays, isCheckedIn,
  today, expandedCard, setExpandedCard, onBatchCheckin,
  handleResetStreak, handleDeleteCategory, readOnly, ownerLabel,
  onUpdateMoneyPerDay, onAddPriorDays, showOnlyYou, onCardTap,
  sobrietyGroups, onToggleSharing, isPersonalActive, isAllView,
  onUndoCheckin,
}: {
  cat: SobrietyCategory;
  idx: number;
  getStreakInfo: (cat: SobrietyCategory) => any;
  getHeatmapData: (cat: SobrietyCategory) => any;
  getMissedDays: (cat: SobrietyCategory) => string[];
  isCheckedIn: (catId: string, date: string) => boolean;
  today: string;
  expandedCard: string | null;
  setExpandedCard: (id: string | null) => void;
  onBatchCheckin: (cat: SobrietyCategory, dates: string[], onTrack: boolean) => void;
  handleResetStreak: (cat: SobrietyCategory) => void;
  handleDeleteCategory: (id: string) => void;
  readOnly?: boolean;
  ownerLabel?: string;
  onUpdateMoneyPerDay?: (catId: string, value: number) => void;
  onAddPriorDays?: (cat: SobrietyCategory, days: number) => void;
  showOnlyYou?: boolean;
  onCardTap?: (cat: SobrietyCategory) => void;
  sobrietyGroups: any[];
  onToggleSharing: (cat: SobrietyCategory, gid: string) => void;
  isPersonalActive: boolean;
  isAllView: boolean;
  onUndoCheckin: (cat: SobrietyCategory) => void;
}) {
  const [editingMoney, setEditingMoney] = useState(false);
  const [moneyValue, setMoneyValue] = useState(String(cat.money_per_day || ""));
  const [showPriorDays, setShowPriorDays] = useState(false);
  const [priorDaysCount, setPriorDaysCount] = useState("3");
  const [selectedMissed, setSelectedMissed] = useState<Set<string>>(new Set());
  const [showTodayCheckin, setShowTodayCheckin] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const info = getStreakInfo(cat);
  const isExpanded = expandedCard === cat.id;
  const checkedToday = isCheckedIn(cat.id, today);
  const nextMilestone = getNextMilestone(info.currentStreak);
  const milestones = getReachedMilestones(info.currentStreak);
  const latestMilestone = milestones.length > 0 ? milestones[milestones.length - 1] : null;
  const missedDays = getMissedDays(cat);

  // Show inline sharing pills only on expanded, own cards, not in Personal or All view
  const showSharingPills = !readOnly && isExpanded && !isPersonalActive && !isAllView && sobrietyGroups.length > 0;

  const toggleMissedDay = (d: string) => {
    setSelectedMissed(prev => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d); else next.add(d);
      return next;
    });
  };

  return (
    <motion.div
      key={cat.id}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: idx * 0.05 }}
      className="bg-card border border-border rounded-2xl overflow-hidden"
    >
      {/* Hero */}
      <button
        onClick={() => setExpandedCard(isExpanded ? null : cat.id)}
        className="w-full p-4 text-left"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{cat.icon}</span>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-xs text-muted-foreground">{cat.label}-free</p>
                {ownerLabel && (
                  <span className="text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded">{ownerLabel}</span>
                )}
                {showOnlyYou && (
                  <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground bg-secondary/80 px-1.5 py-0.5 rounded">
                    <EyeOff size={10} />
                    Only you
                  </span>
                )}
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-bold text-foreground tabular-nums">{info.currentStreak}</span>
                <span className="text-sm text-muted-foreground">days</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {latestMilestone && (
              <span className="bg-accent/15 text-accent text-[10px] font-semibold px-2 py-0.5 rounded-full">
                🏆 {latestMilestone}d
              </span>
            )}
            {isExpanded ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
          </div>
        </div>

        {nextMilestone && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
              <span>Next: {nextMilestone} days</span>
              <span>{nextMilestone - info.currentStreak} to go</span>
            </div>
            <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-primary rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${Math.min((info.currentStreak / nextMilestone) * 100, 100)}%` }}
                transition={{ duration: 0.8, delay: 0.2 }}
              />
            </div>
          </div>
        )}
      </button>

      {/* Check-in buttons */}
      {!readOnly && !checkedToday && (
        <div className="px-4 pb-3">
          <Button
            onClick={(e) => {
              e.stopPropagation();
              setShowTodayCheckin(true);
            }}
            variant="outline"
            className="w-full rounded-xl text-sm h-9 border-primary/30 text-primary hover:bg-primary/5"
          >
            Check in today
          </Button>
        </div>
      )}

      {/* Today check-in inline dialog */}
      <AnimatePresence>
        {showTodayCheckin && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="px-4 pb-3 overflow-hidden"
          >
            <div className="bg-secondary/50 rounded-xl p-3 text-center space-y-2">
              <p className="text-xs font-medium text-foreground">
                Did you stay on track with {cat.label} today?
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  size="sm"
                  className="rounded-lg h-9 text-sm bg-[hsl(var(--habit-green))] hover:bg-[hsl(var(--habit-green))]/90 text-white"
                  onClick={(e) => { e.stopPropagation(); onBatchCheckin(cat, [today], true); setShowTodayCheckin(false); }}
                >
                  ✅ Yes!
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-lg h-9 text-sm border-destructive/30 text-destructive"
                  onClick={(e) => { e.stopPropagation(); onBatchCheckin(cat, [today], false); setShowTodayCheckin(false); }}
                >
                  Not today
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Checked in today — tappable to undo */}
      {checkedToday && !readOnly && (
        <div className="px-4 pb-3">
          <button
            onClick={(e) => { e.stopPropagation(); onUndoCheckin(cat); }}
            className="w-full text-center text-xs text-muted-foreground py-1.5 bg-secondary/50 rounded-xl hover:bg-secondary/70 transition-colors cursor-pointer"
          >
            ✅ Checked in today
          </button>
        </div>
      )}
      {checkedToday && readOnly && (
        <div className="px-4 pb-3">
          <div className="text-center text-xs text-muted-foreground py-1.5 bg-secondary/50 rounded-xl">
            ✅ Checked in today
          </div>
        </div>
      )}

      {/* Read-only: Add to My Trackers button */}
      {readOnly && (
        <div className="px-4 pb-3">
          <Button
            onClick={(e) => { e.stopPropagation(); onCardTap?.(cat); }}
            variant="outline"
            size="sm"
            className="w-full rounded-xl text-xs h-8 border-primary/30 text-primary hover:bg-primary/5"
          >
            <Plus size={14} className="mr-1" /> Add to My Trackers
          </Button>
        </div>
      )}

      {/* Missed days retroactive check-in */}
      {!readOnly && missedDays.length > 0 && (
        <div className="px-4 pb-3">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpandedCard(isExpanded ? null : cat.id);
            }}
            className="text-[11px] text-primary font-medium hover:underline"
          >
            {missedDays.length} missed day{missedDays.length > 1 ? "s" : ""} — tap to check in
          </button>
        </div>
      )}

      {/* Expanded Details */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-4 border-t border-border pt-3">
              {/* Inline Sharing Pills — replaces the old "Edit sharing" link */}
              {showSharingPills && (
                <div>
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Shared with</p>
                  <div className="flex flex-wrap gap-1.5">
                    <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border border-primary/40 bg-primary/12 text-foreground opacity-80 cursor-not-allowed">
                      🏠 Personal
                    </span>
                    {sobrietyGroups.map(g => {
                      const isShared = (cat.shared_group_ids || []).includes(g.id);
                      return (
                        <button
                          key={g.id}
                          onClick={(e) => { e.stopPropagation(); onToggleSharing(cat, g.id); }}
                          className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all border ${
                            isShared
                              ? "border-primary/40 bg-primary/12 text-foreground"
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
                    <p className="text-lg font-bold text-foreground tabular-nums">
                      ${info.moneySaved.toFixed(0)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Money Saved</p>
                  </div>
                )}

                {!readOnly && (
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
                            onUpdateMoneyPerDay?.(cat.id, parseFloat(moneyValue) || 0);
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
                )}
              </div>

              {/* Add Prior Sober Days */}
              {!readOnly && (
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
                              onAddPriorDays?.(cat, count);
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
              )}

              {/* Retroactive check-in for missed days */}
              {!readOnly && missedDays.length > 0 && (
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
                {!readOnly && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleResetStreak(cat)}
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
                          onClick={() => handleDeleteCategory(cat.id)}
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
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// GitHub-style heatmap grid component
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
