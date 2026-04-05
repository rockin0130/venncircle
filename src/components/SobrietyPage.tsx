import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, GroupMember } from "@/context/AuthContext";
import { format, differenceInDays, subDays, parseISO, startOfDay, addDays } from "date-fns";
import { Plus, DollarSign, Lock, Check, Calendar, Flame, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EVERYONE_SENTINEL } from "@/components/SobrietyUserFilter";
import { useSobrietyViewMode, buildViewQueryPlan } from "@/hooks/useSobrietyViewMode";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import CreateGroupModal from "@/components/CreateGroupModal";
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

interface DisplayUser {
  id: string;
  name: string;
  avatarUrl: string | null;
  initial: string;
  colorIndex: number;
}

interface UserTone {
  surface: string;
  pill: string;
  border: string;
  text: string;
  accent: string;
}

const PRESET_CATEGORIES = [
  { label: "Alcohol", icon: "🍻" },
  { label: "Smoking", icon: "🚬" },
  { label: "Weed", icon: "🌿" },
  { label: "Social Media", icon: "📱" },
];

const MILESTONES = [1, 3, 7, 14, 21, 30, 60, 90, 100, 180, 365, 500, 730, 1000];
const PERSONAL_CONTEXT_KEY = "__mine__";
const PILL_STORAGE_KEY = "venncircle_sobriety_pills";
const USER_TONE_SUFFIXES = [1, 2, 3, 4, 5, 6] as const;

function normalizeLabel(label: string): string {
  return label.toLowerCase().replace(/[\s\-_.,!?':;()]/g, "").trim();
}

function formatTrackerLabel(label: string): string {
  return /free$/i.test(label) ? label : `${label}-free`;
}

function getNextMilestone(streak: number): number | null {
  return MILESTONES.find((milestone) => milestone > streak) ?? null;
}

function getProgressPercent(streak: number, nextMilestone: number | null): number {
  if (!nextMilestone) return 100;
  if (nextMilestone <= 0) return 0;
  return Math.max(0, Math.min((streak / nextMilestone) * 100, 100));
}

function readStoredPillSelections(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(PILL_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStoredPillSelections(value: Record<string, string[]>) {
  try {
    localStorage.setItem(PILL_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // no-op
  }
}

function getUserTone(index: number): UserTone {
  const suffix = USER_TONE_SUFFIXES[index % USER_TONE_SUFFIXES.length];
  return {
    surface: `hsl(var(--sobriety-user-${suffix}-surface))`,
    pill: `hsl(var(--sobriety-user-${suffix}-pill))`,
    border: `hsl(var(--sobriety-user-${suffix}-border))`,
    text: `hsl(var(--sobriety-user-${suffix}-text))`,
    accent: `hsl(var(--sobriety-user-${suffix}-accent))`,
  };
}

const SobrietyPage = ({ onOpenMore }: { onOpenMore?: () => void } = {}) => {
  const { user, activeGroup, setActiveGroup, profile, groups } = useAuth();

  const [categories, setCategories] = useState<SobrietyCategory[]>([]);
  const [myCategories, setMyCategories] = useState<SobrietyCategory[]>([]);
  const [checkins, setCheckins] = useState<SobrietyCheckin[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [showAddDrawer, setShowAddDrawer] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showCheckinDialog, setShowCheckinDialog] = useState(false);
  const [checkinCategory, setCheckinCategory] = useState<SobrietyCategory | null>(null);
  const [checkinDates, setCheckinDates] = useState<string[]>([]);
  const [checkinIsMissed, setCheckinIsMissed] = useState(false);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [customLabel, setCustomLabel] = useState("");
  const [customIcon, setCustomIcon] = useState("🚫");
  const [moneyPerDay, setMoneyPerDay] = useState("");
  const [presetMoneyPerDay, setPresetMoneyPerDay] = useState<Record<string, string>>({});
  const [prefillLabel, setPrefillLabel] = useState("");
  const [addGroupIds, setAddGroupIds] = useState<Set<string>>(new Set());
  const [undoCheckinCat, setUndoCheckinCat] = useState<SobrietyCategory | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<{
    existingName: string;
    pendingLabel: string;
    pendingIcon: string;
    pendingMoney: number;
  } | null>(null);
  const [celebratingMilestone, setCelebratingMilestone] = useState<number | null>(null);
  const [nudgeCooldowns, setNudgeCooldowns] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const requestIdRef = useRef(0);

  const isPersonalActive = (activeGroup as any)?._personal === true || activeGroup === null;
  const isGroupView = !!activeGroup && !(activeGroup as any)?._personal;
  const groupId = isGroupView ? activeGroup.id : null;
  const today = format(new Date(), "yyyy-MM-dd");
  const activeContextKey = groupId ? `group:${groupId}` : PERSONAL_CONTEXT_KEY;

  const sobrietyGroups = useMemo(
    () => groups.filter((group) => group.shared_pages?.includes("sobriety")),
    [groups],
  );

  const contextGroups = useMemo(
    () => sobrietyGroups.map((group) => ({ id: group.id, name: group.name })),
    [sobrietyGroups],
  );

  const filterUsers = useMemo(() => {
    if (!user || !isGroupView || !activeGroup) return [] as DisplayUser[];

    const mineName = profile?.display_name?.split(" ")[0] || "Mine";
    const others = activeGroup.members
      .filter((member: GroupMember) => member.status === "active" && member.user_id !== user.id)
      .map((member) => {
        const firstName = member.display_name?.split(" ")[0] || "Member";
        return {
          id: member.user_id,
          name: firstName,
          avatarUrl: member.avatar_url,
          initial: firstName.charAt(0).toUpperCase() || "?",
        };
      });

    return [
      {
        id: user.id,
        name: mineName,
        avatarUrl: profile?.avatar_url || null,
        initial: mineName.charAt(0).toUpperCase() || "M",
      },
      ...others,
    ].map((person, index) => ({ ...person, colorIndex: index }));
  }, [user, isGroupView, activeGroup, profile]);

  const groupMemberIds = useMemo(() => filterUsers.map((member) => member.id), [filterUsers]);
  const groupMemberIdsKey = groupMemberIds.join("|");

  useEffect(() => {
    if (!user) return;

    if (!isGroupView) {
      setSelectedUserIds(new Set([user.id]));
      return;
    }

    const storedSelections = readStoredPillSelections();
    const storedIds = storedSelections[activeContextKey] ?? [user.id];
    const nextSet = new Set(storedIds);

    if (nextSet.has(EVERYONE_SENTINEL)) {
      setSelectedUserIds(new Set([EVERYONE_SENTINEL]));
      return;
    }

    const validIds = new Set(groupMemberIds);
    const sanitized = storedIds.filter((id) => validIds.has(id));
    setSelectedUserIds(new Set(sanitized.length > 0 ? sanitized : [user.id]));
  }, [user, isGroupView, activeContextKey, groupMemberIdsKey]);

  const persistSelectedUserIds = useCallback(
    (nextIds: Set<string>) => {
      setSelectedUserIds(nextIds);
      if (!isGroupView) return;
      const storedSelections = readStoredPillSelections();
      storedSelections[activeContextKey] = Array.from(nextIds);
      writeStoredPillSelections(storedSelections);
    },
    [activeContextKey, isGroupView],
  );

  const viewMode = useSobrietyViewMode({
    activeGroupId: groupId,
    isPersonalContext: !isGroupView,
    userId: user?.id,
    selectedUserIds,
    groupMemberIds,
  });

  const queryPlan = useMemo(
    () => buildViewQueryPlan(viewMode, user?.id, groupId),
    [viewMode, user?.id, groupId],
  );

  const ownerIdsKey = queryPlan.ownerUserIds.join("|");

  const fetchData = useCallback(async () => {
    if (!user) return;

    const requestId = ++requestIdRef.current;
    setLoading(true);

    const visiblePromise = (() => {
      if (queryPlan.ownerUserIds.length === 0) {
        return Promise.resolve({ data: [] as SobrietyCategory[], error: null });
      }

      let query = supabase.from("sobriety_categories").select("*");
      query = queryPlan.ownerUserIds.length === 1
        ? query.eq("user_id", queryPlan.ownerUserIds[0])
        : query.in("user_id", queryPlan.ownerUserIds);

      if (queryPlan.filterGroupId) {
        query = query.contains("shared_group_ids", [queryPlan.filterGroupId]);
      }

      return query;
    })();

    const myCategoriesPromise = supabase
      .from("sobriety_categories")
      .select("*")
      .eq("user_id", user.id);

    const [visibleResult, myCategoriesResult] = await Promise.all([visiblePromise, myCategoriesPromise]);

    if (requestIdRef.current !== requestId) return;

    if (visibleResult.error || myCategoriesResult.error) {
      console.error("Failed to load sobriety data", visibleResult.error || myCategoriesResult.error);
      setCategories([]);
      setMyCategories([]);
      setCheckins([]);
      setLoading(false);
      return;
    }

    const mappedVisible = ((visibleResult.data as any[]) || []).map((category) => ({
      ...category,
      shared_group_ids: category.shared_group_ids || [],
    })) as SobrietyCategory[];

    const mappedMine = ((myCategoriesResult.data as any[]) || []).map((category) => ({
      ...category,
      shared_group_ids: category.shared_group_ids || [],
    })) as SobrietyCategory[];

    const nextVisible = queryPlan.shouldDeduplicateByLabel
      ? mappedVisible.filter((category, index, array) => index === array.findIndex((item) => normalizeLabel(item.label) === normalizeLabel(category.label)))
      : mappedVisible;

    setCategories(nextVisible);
    setMyCategories(mappedMine);

    if (nextVisible.length === 0) {
      setCheckins([]);
      setLoading(false);
      return;
    }

    const { data: nextCheckins, error: checkinsError } = await supabase
      .from("sobriety_checkins")
      .select("*")
      .in("category_id", nextVisible.map((category) => category.id));

    if (requestIdRef.current !== requestId) return;

    if (checkinsError) {
      console.error("Failed to load sobriety check-ins", checkinsError);
      setCheckins([]);
      setLoading(false);
      return;
    }

    setCheckins((nextCheckins || []) as SobrietyCheckin[]);
    setLoading(false);
  }, [queryPlan.filterGroupId, queryPlan.ownerUserIds, queryPlan.shouldDeduplicateByLabel, user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    setExpandedCard(null);
  }, [activeContextKey, ownerIdsKey, viewMode.mode]);

  const getUserName = useCallback(
    (userId: string) => {
      if (userId === user?.id) return profile?.display_name || "Mine";
      for (const group of groups) {
        const member = group.members.find((groupMember: GroupMember) => groupMember.user_id === userId);
        if (member?.display_name) return member.display_name;
      }
      return "Member";
    },
    [groups, profile, user],
  );

  const getUserAvatarUrl = useCallback(
    (userId: string) => {
      if (userId === user?.id) return profile?.avatar_url || null;
      for (const group of groups) {
        const member = group.members.find((groupMember: GroupMember) => groupMember.user_id === userId);
        if (member?.avatar_url) return member.avatar_url;
      }
      return null;
    },
    [groups, profile, user],
  );

  const selectedUsersOrdered = useMemo(() => {
    return viewMode.resolvedUserIds.map((resolvedId, index) => {
      const groupMatch = filterUsers.find((member) => member.id === resolvedId);
      const fullName = getUserName(resolvedId);
      const name = groupMatch?.name || fullName.split(" ")[0] || "Member";
      return {
        id: resolvedId,
        name,
        avatarUrl: groupMatch?.avatarUrl || getUserAvatarUrl(resolvedId),
        initial: groupMatch?.initial || name.charAt(0).toUpperCase() || "?",
        colorIndex: groupMatch?.colorIndex ?? index,
      };
    });
  }, [filterUsers, getUserAvatarUrl, getUserName, viewMode.resolvedUserIds]);

  const getStreakInfo = useCallback(
    (category: SobrietyCategory) => {
      const categoryCheckins = checkins
        .filter((checkin) => checkin.category_id === category.id && checkin.stayed_on_track)
        .map((checkin) => checkin.check_date)
        .sort((a, b) => b.localeCompare(a));

      const successfulCheckins = new Set(categoryCheckins);
      const categoryHistory = checkins.filter((checkin) => checkin.category_id === category.id);
      const failedCheckins = new Set(
        categoryHistory
          .filter((checkin) => !checkin.stayed_on_track)
          .map((checkin) => checkin.check_date),
      );

      let currentStreak = 0;
      let dayPointer = startOfDay(new Date());
      while (true) {
        const dateKey = format(dayPointer, "yyyy-MM-dd");
        if (failedCheckins.has(dateKey)) break;
        if (!successfulCheckins.has(dateKey)) break;
        currentStreak += 1;
        dayPointer = subDays(dayPointer, 1);
      }

      const startDate = parseISO(category.start_date);
      const totalDays = Math.max(differenceInDays(new Date(), startDate) + 1, 0);
      let longestStreak = 0;
      let workingStreak = 0;

      for (let dayIndex = 0; dayIndex < totalDays; dayIndex += 1) {
        const day = addDays(startDate, dayIndex);
        const dateKey = format(day, "yyyy-MM-dd");
        if (successfulCheckins.has(dateKey)) {
          workingStreak += 1;
        } else {
          longestStreak = Math.max(longestStreak, workingStreak);
          workingStreak = 0;
        }
      }

      longestStreak = Math.max(longestStreak, workingStreak);
      const totalSober = categoryCheckins.length;
      const moneySaved = totalSober * (category.money_per_day || 0);
      const checkinMap = new Map<string, boolean>();
      categoryHistory.forEach((checkin) => checkinMap.set(checkin.check_date, checkin.stayed_on_track));

      return {
        currentStreak,
        longestStreak,
        totalSober,
        totalDays,
        moneySaved,
        checkinMap,
      };
    },
    [checkins],
  );

  const getMissedDays = useCallback(
    (category: SobrietyCategory) => {
      const startDate = parseISO(category.start_date);
      const checkedDates = new Set(
        checkins.filter((checkin) => checkin.category_id === category.id).map((checkin) => checkin.check_date),
      );
      const missed: string[] = [];
      let cursor = startOfDay(new Date());
      for (let index = 0; index < 30; index += 1) {
        const dateKey = format(cursor, "yyyy-MM-dd");
        if (cursor >= startDate && !checkedDates.has(dateKey) && dateKey !== today) {
          missed.push(dateKey);
        }
        cursor = subDays(cursor, 1);
      }
      return missed;
    },
    [checkins, today],
  );

  const isCheckedIn = useCallback(
    (categoryId: string, date: string) => checkins.some((checkin) => checkin.category_id === categoryId && checkin.check_date === date),
    [checkins],
  );

  const getHeatmapData = useCallback(
    (category: SobrietyCategory) => {
      const info = getStreakInfo(category);
      const days: { date: string; status: "green" | "red" | "gray" }[] = [];
      for (let index = 90; index >= 0; index -= 1) {
        const day = subDays(new Date(), index);
        const dateKey = format(day, "yyyy-MM-dd");
        const status = info.checkinMap.get(dateKey);
        if (status === true) days.push({ date: dateKey, status: "green" });
        else if (status === false) days.push({ date: dateKey, status: "red" });
        else days.push({ date: dateKey, status: "gray" });
      }
      return days;
    },
    [getStreakInfo],
  );

  const myExistingLabels = useMemo(
    () => new Set(myCategories.map((category) => normalizeLabel(category.label))),
    [myCategories],
  );

  const trackerTypes = useMemo(() => {
    const seen = new Set<string>();
    return categories.reduce<{ label: string; icon: string; normalizedKey: string }[]>((result, category) => {
      const normalizedKey = normalizeLabel(category.label);
      if (!seen.has(normalizedKey)) {
        seen.add(normalizedKey);
        result.push({ label: category.label, icon: category.icon, normalizedKey });
      }
      return result;
    }, []);
  }, [categories]);

  const moneySummary = useMemo(() => {
    return {
      total: categories.reduce((sum, category) => sum + getStreakInfo(category).moneySaved, 0),
      count: categories.length,
    };
  }, [categories, getStreakInfo]);

  const orderedPresetCategories = useMemo(() => {
    if (!prefillLabel) return PRESET_CATEGORIES;
    const prefillKey = normalizeLabel(prefillLabel);
    return [...PRESET_CATEGORIES].sort((left, right) => {
      const leftMatch = normalizeLabel(left.label) === prefillKey ? -1 : 0;
      const rightMatch = normalizeLabel(right.label) === prefillKey ? -1 : 0;
      return leftMatch - rightMatch;
    });
  }, [prefillLabel]);

  const resetAddForm = useCallback(() => {
    setCustomLabel("");
    setCustomIcon("🚫");
    setMoneyPerDay("");
    setPresetMoneyPerDay({});
    setPrefillLabel("");
  }, []);

  const openBlankDrawer = useCallback(() => {
    resetAddForm();
    setAddGroupIds(groupId ? new Set([groupId]) : new Set());
    setShowAddDrawer(true);
  }, [groupId, resetAddForm]);

  const findDuplicateTracker = useCallback(
    (label: string) => {
      const normalized = normalizeLabel(label);
      if (!normalized) return undefined;
      return myCategories.find((category) => normalizeLabel(category.label) === normalized);
    },
    [myCategories],
  );

  const handleAddCategory = async (label: string, icon: string, money?: number) => {
    if (!user) return;

    const { error } = await supabase.from("sobriety_categories").insert({
      user_id: user.id,
      label,
      icon,
      group_id: null,
      start_date: today,
      money_per_day: money ?? (parseFloat(moneyPerDay) || 0),
      shared_group_ids: Array.from(addGroupIds),
    } as any);

    if (error) {
      toast.error("Failed to add tracker");
      return;
    }

    toast.success(`Now tracking: ${label}`);
    setShowAddDrawer(false);
    resetAddForm();
    await fetchData();
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
      return;
    }
    handleAddCategory(label, icon, money);
  };

  const openAddToMine = useCallback(
    (category: SobrietyCategory) => {
      resetAddForm();
      setAddGroupIds(groupId ? new Set([groupId]) : new Set());
      setPrefillLabel(category.label);
      const matchingPreset = PRESET_CATEGORIES.find((preset) => normalizeLabel(preset.label) === normalizeLabel(category.label));
      if (matchingPreset) {
        setPresetMoneyPerDay({ [matchingPreset.label]: String(category.money_per_day || "") });
      } else {
        setCustomLabel(category.label);
        setCustomIcon(category.icon || "🚫");
        setMoneyPerDay(category.money_per_day ? String(category.money_per_day) : "");
      }
      setShowAddDrawer(true);
    },
    [groupId, resetAddForm],
  );

  const handleCheckin = async (onTrack: boolean) => {
    if (!user || !checkinCategory || checkinDates.length === 0) return;

    const rows = checkinDates.map((date) => ({
      user_id: user.id,
      category_id: checkinCategory.id,
      check_date: date,
      stayed_on_track: onTrack,
    }));

    const { error } = await supabase.from("sobriety_checkins").upsert(rows as any[], { onConflict: "category_id,check_date" });
    if (error) {
      toast.error("Failed to check in");
      return;
    }

    if (onTrack) {
      if (checkinDates.length === 1 && checkinDates[0] === today) {
        const info = getStreakInfo(checkinCategory);
        const newStreak = info.currentStreak + 1;
        const milestone = MILESTONES.find((value) => value === newStreak);
        if (milestone) {
          setCelebratingMilestone(milestone);
          setTimeout(() => setCelebratingMilestone(null), 3000);
        }
        toast.success("Great job! Keep it up! 💪");
      } else {
        toast.success(`Checked in ${checkinDates.length} day${checkinDates.length > 1 ? "s" : ""} ✅`);
      }
    } else {
      toast("It’s okay. Every day is a fresh start. 💙");
    }

    setShowCheckinDialog(false);
    setCheckinCategory(null);
    setCheckinDates([]);
    setCheckinIsMissed(false);
    await fetchData();
  };

  const handleCheckinDirect = async (category: SobrietyCategory, dates: string[], onTrack: boolean) => {
    if (!user) return;

    const rows = dates.map((date) => ({
      user_id: user.id,
      category_id: category.id,
      check_date: date,
      stayed_on_track: onTrack,
    }));

    const { error } = await supabase.from("sobriety_checkins").upsert(rows as any[], { onConflict: "category_id,check_date" });
    if (error) {
      toast.error("Failed to check in");
      return;
    }

    toast.success(`Checked in ${dates.length} day${dates.length > 1 ? "s" : ""} ✅`);
    await fetchData();
  };

  const handleBatchCheckin = (category: SobrietyCategory, dates: string[], onTrack: boolean) => {
    setCheckinCategory(category);
    setCheckinDates(dates);
    setCheckinIsMissed(true);
    if (onTrack) {
      handleCheckinDirect(category, dates, true);
      return;
    }
    setShowCheckinDialog(true);
  };

  const handleUndoCheckin = async () => {
    if (!user || !undoCheckinCat) return;

    const { error } = await supabase
      .from("sobriety_checkins")
      .delete()
      .eq("user_id", user.id)
      .eq("category_id", undoCheckinCat.id)
      .eq("check_date", today);

    if (error) {
      toast.error("Failed to remove check-in");
      return;
    }

    toast.success("Check-in removed");
    setUndoCheckinCat(null);
    await fetchData();
  };

  const handleDeleteCategory = async (categoryId: string) => {
    const { error } = await supabase.from("sobriety_categories").delete().eq("id", categoryId);
    if (error) {
      toast.error("Failed to remove tracker");
      return;
    }
    toast.success("Tracker removed");
    await fetchData();
  };

  const handleResetStreak = async (category: SobrietyCategory) => {
    await supabase.from("sobriety_categories").update({ start_date: today } as any).eq("id", category.id);
    toast("Streak reset. Today is day one. You’ve got this! 🌱");
    await fetchData();
  };

  const handleUpdateMoneyPerDay = async (categoryId: string, value: number) => {
    const { error } = await supabase.from("sobriety_categories").update({ money_per_day: value } as any).eq("id", categoryId);
    if (error) {
      toast.error("Failed to update value");
      return;
    }
    toast.success("Money saved updated");
    await fetchData();
  };

  const handleAddPriorDays = async (category: SobrietyCategory, days: number) => {
    if (!user) return;

    const startDate = parseISO(category.start_date);
    const rows = Array.from({ length: days }, (_, index) => {
      const date = subDays(startDate, index + 1);
      return {
        user_id: user.id,
        category_id: category.id,
        check_date: format(date, "yyyy-MM-dd"),
        stayed_on_track: true,
      };
    });

    const newStartDate = format(subDays(startDate, days), "yyyy-MM-dd");
    const [{ error: checkinError }, { error: categoryError }] = await Promise.all([
      supabase.from("sobriety_checkins").upsert(rows as any[], { onConflict: "category_id,check_date" }),
      supabase.from("sobriety_categories").update({ start_date: newStartDate } as any).eq("id", category.id),
    ]);

    if (checkinError || categoryError) {
      toast.error("Failed to add prior days");
      return;
    }

    toast.success(`Added ${days} prior sober days`);
    await fetchData();
  };

  const handleToggleSharing = async (category: SobrietyCategory, nextGroupId: string) => {
    const nextSharedGroupIds = (category.shared_group_ids || []).includes(nextGroupId)
      ? category.shared_group_ids.filter((id) => id !== nextGroupId)
      : [...(category.shared_group_ids || []), nextGroupId];

    const { error } = await supabase
      .from("sobriety_categories")
      .update({ shared_group_ids: nextSharedGroupIds } as any)
      .eq("id", category.id);

    if (error) {
      toast.error("Failed to update sharing");
      return;
    }

    await fetchData();
  };

  const sendNudge = async (targetUserId: string, categoryId?: string) => {
    if (!user) return;

    const { error } = await supabase.from("nudges").insert({
      from_user_id: user.id,
      to_user_id: targetUserId,
      message: `${profile?.display_name || "Someone"} nudged you to check in on your sobriety tracker! 💪`,
    } as any);

    if (error) {
      toast.error("Failed to nudge");
      return;
    }

    const shortName = getUserName(targetUserId).split(" ")[0];
    toast.success(`${shortName} has been nudged! 💪`);
    const cooldownKey = categoryId ? `${targetUserId}_${categoryId}` : targetUserId;
    setNudgeCooldowns((current) => new Set([...current, cooldownKey]));
    setTimeout(() => {
      setNudgeCooldowns((current) => {
        const next = new Set(current);
        next.delete(cooldownKey);
        return next;
      });
    }, 10000);
  };

  useEffect(() => {
    if (!user) return;

    const checkNudges = async () => {
      const { data } = await supabase
        .from("nudges")
        .select("*")
        .eq("to_user_id", user.id)
        .eq("seen", false)
        .ilike("message", "%sobriety%");

      if (!data || data.length === 0) return;

      data.forEach((nudge: any) => {
        toast.info(nudge.message, { duration: 5000 });
      });

      await supabase
        .from("nudges")
        .update({ seen: true } as any)
        .in("id", data.map((nudge: any) => nudge.id));
    };

    checkNudges();
  }, [user]);

  const allVisibleUserIds = useMemo(() => new Set(filterUsers.map((member) => member.id)), [filterUsers]);
  const everyoneSelected = useMemo(() => {
    if (!isGroupView || filterUsers.length === 0) return false;
    if (selectedUserIds.has(EVERYONE_SENTINEL)) return true;
    return [...allVisibleUserIds].every((id) => selectedUserIds.has(id));
  }, [allVisibleUserIds, filterUsers.length, isGroupView, selectedUserIds]);

  const isUserSelected = useCallback(
    (userId: string) => selectedUserIds.has(EVERYONE_SENTINEL) || selectedUserIds.has(userId),
    [selectedUserIds],
  );

  const toggleUserPill = (userId: string) => {
    if (!isGroupView) return;

    if (selectedUserIds.has(EVERYONE_SENTINEL)) {
      const next = new Set(allVisibleUserIds);
      next.delete(userId);
      if (next.size === 0) return;
      persistSelectedUserIds(next);
      return;
    }

    const next = new Set(selectedUserIds);
    if (next.has(userId)) {
      next.delete(userId);
      if (next.size === 0) return;
      persistSelectedUserIds(next);
      return;
    }

    next.add(userId);
    if ([...allVisibleUserIds].every((id) => next.has(id))) {
      persistSelectedUserIds(new Set([EVERYONE_SENTINEL]));
      return;
    }

    persistSelectedUserIds(next);
  };

  const toggleEveryonePill = () => {
    if (!isGroupView) return;
    if (everyoneSelected) {
      persistSelectedUserIds(new Set(user?.id ? [user.id] : []));
      return;
    }
    persistSelectedUserIds(new Set([EVERYONE_SENTINEL]));
  };

  const otherUser = useMemo(() => {
    if (viewMode.mode !== "single_other" || !viewMode.otherUserId) return null;
    return selectedUsersOrdered.find((displayUser) => displayUser.id === viewMode.otherUserId) || null;
  }, [selectedUsersOrdered, viewMode.mode, viewMode.otherUserId]);

  const summarySubtitle = viewMode.mode === "multi_user"
    ? "Combined across all trackers"
    : `Across ${moneySummary.count} tracker${moneySummary.count === 1 ? "" : "s"} this week`;

  const renderEmptyState = () => {
    const message =
      viewMode.mode === "mine_in_group"
        ? "No trackers shared with this group. Tap + to add one."
        : viewMode.mode === "single_other"
          ? `${otherUser?.name || "This person"} has no trackers in this group.`
          : "Add a tracker to start building your streak.";

    return (
      <div className="rounded-[24px] border border-[hsl(var(--sobriety-outline))] bg-[hsl(var(--sobriety-surface))] px-5 py-12 text-center">
        <div className="mb-3 text-4xl">🌱</div>
        <h2 className="text-lg font-semibold text-foreground">No trackers yet</h2>
        <p className="mx-auto mt-2 max-w-[260px] text-sm text-muted-foreground">{message}</p>
        {viewMode.mode !== "single_other" && (
          <Button onClick={openBlankDrawer} className="mt-5 rounded-full px-5">
            <Plus className="mr-1.5 h-4 w-4" /> Add Tracker
          </Button>
        )}
      </div>
    );
  };

  const PERSONAL_GROUP = { _personal: true, id: "__personal__", name: "Mine", type: "personal", emoji: "👤", invite_code: "", created_by: "", shared_pages: [], members: [] } as any;

  return (
    <div className="px-3 pb-8 pt-3">
      <div className="rounded-[30px] border border-[hsl(var(--sobriety-outline))] bg-[hsl(var(--sobriety-shell))] p-4 shadow-card">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-[2rem] font-semibold tracking-[-0.04em] text-foreground">Sobriety</h1>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={openBlankDrawer}
              aria-label="Add tracker"
              className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-transform active:scale-95"
            >
              <Plus className="h-5 w-5" />
            </button>
            {onOpenMore && (
              <button onClick={onOpenMore} className="w-[30px] h-[30px] rounded-full flex items-center justify-center" style={{ background: "#F4F3F0" }} aria-label="More">
                <MoreHorizontal size={15} color="#888" />
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 flex gap-2 overflow-x-auto scroll-smooth-touch pb-1">
          <button
            type="button"
            onClick={() => setActiveGroup(PERSONAL_GROUP)}
            className={`flex shrink-0 items-center rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
              isPersonalActive
                ? "border-primary/30 bg-primary/10 text-primary"
                : "border-[hsl(var(--sobriety-outline-strong))] bg-[hsl(var(--sobriety-surface))] text-foreground"
            }`}
          >
            Mine
          </button>
          {contextGroups.map((group) => {
            const selected = activeGroup?.id === group.id && !(activeGroup as any)?._personal;
            return (
              <button
                key={group.id}
                type="button"
                onClick={() => {
                  const nextGroup = groups.find((candidate) => candidate.id === group.id);
                  if (nextGroup) setActiveGroup(nextGroup);
                }}
                className={`flex shrink-0 items-center rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                  selected
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-[hsl(var(--sobriety-outline-strong))] bg-[hsl(var(--sobriety-surface))] text-foreground"
                }`}
              >
                {group.name}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setShowCreateGroup(true)}
            className="flex shrink-0 items-center rounded-full border border-[hsl(var(--sobriety-outline-strong))] bg-[hsl(var(--sobriety-surface))] px-4 py-2 text-sm font-medium text-foreground"
          >
            + Add Group
          </button>
        </div>

        {isGroupView && filterUsers.length > 1 && (
          <div className="mt-3 flex gap-2 overflow-x-auto scroll-smooth-touch pb-1">
            {filterUsers.map((member) => {
              const tone = getUserTone(member.colorIndex);
              const selected = isUserSelected(member.id);
              return (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => toggleUserPill(member.id)}
                  className="flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-all"
                  style={{
                    backgroundColor: selected ? tone.pill : "hsl(var(--sobriety-surface))",
                    borderColor: selected ? tone.border : "hsl(var(--sobriety-outline-strong))",
                    color: selected ? tone.text : "hsl(var(--foreground))",
                  }}
                >
                  <span
                    className="flex h-[18px] w-[18px] items-center justify-center rounded-full text-[10px] font-semibold"
                    style={{
                      backgroundColor: selected ? tone.accent : "hsl(var(--secondary))",
                      color: selected ? "hsl(var(--primary-foreground))" : "hsl(var(--muted-foreground))",
                    }}
                  >
                    {member.initial}
                  </span>
                  <span>{member.name}</span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={toggleEveryonePill}
              className="flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-all"
              style={{
                backgroundColor: everyoneSelected ? "hsl(var(--primary) / 0.1)" : "hsl(var(--sobriety-surface))",
                borderColor: everyoneSelected ? "hsl(var(--primary) / 0.35)" : "hsl(var(--sobriety-outline-strong))",
                color: everyoneSelected ? "hsl(var(--primary))" : "hsl(var(--foreground))",
              }}
            >
              <span>Everyone</span>
            </button>
          </div>
        )}

        <div className="mt-3 rounded-[22px] border border-[hsl(var(--sobriety-outline))] bg-[hsl(var(--sobriety-surface))] px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-2xl bg-[hsl(var(--sobriety-money-surface))] text-[hsl(var(--sobriety-money-text))]">
              <DollarSign className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[2rem] font-semibold leading-none tracking-[-0.04em] text-foreground">${moneySummary.total.toFixed(0)} saved</p>
              <p className="mt-1 text-sm text-muted-foreground">{summarySubtitle}</p>
            </div>
          </div>
        </div>

        <div className="mt-4">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : categories.length === 0 ? (
            renderEmptyState()
          ) : viewMode.mode === "multi_user" ? (
            <div className="space-y-5">
              {trackerTypes.map((trackerType) => {
                const meHasTrackerType = myExistingLabels.has(trackerType.normalizedKey);
                return (
                  <section key={trackerType.normalizedKey} className="space-y-2">
                    <div className="px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      {formatTrackerLabel(trackerType.label)}
                    </div>
                    <div className="overflow-x-auto scroll-smooth-touch pb-1">
                      <div style={{ minWidth: selectedUsersOrdered.length > 3 ? `${selectedUsersOrdered.length * 122}px` : undefined }}>
                        <div
                          className="grid gap-1.5"
                          style={{ gridTemplateColumns: `repeat(${selectedUsersOrdered.length}, minmax(0, 1fr))` }}
                        >
                          {selectedUsersOrdered.map((displayUser) => {
                            const tone = getUserTone(displayUser.colorIndex);
                            return (
                              <div
                                key={`${trackerType.normalizedKey}-${displayUser.id}-header`}
                                className="flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium"
                                style={{ backgroundColor: tone.pill, color: tone.text }}
                              >
                                <span
                                  className="flex h-[18px] w-[18px] items-center justify-center rounded-full text-[10px] font-semibold"
                                  style={{ backgroundColor: tone.accent, color: "hsl(var(--primary-foreground))" }}
                                >
                                  {displayUser.initial}
                                </span>
                                <span className="truncate">{displayUser.name}</span>
                              </div>
                            );
                          })}
                        </div>
                        <div
                          className="mt-1.5 grid gap-1.5"
                          style={{ gridTemplateColumns: `repeat(${selectedUsersOrdered.length}, minmax(0, 1fr))` }}
                        >
                          {selectedUsersOrdered.map((displayUser) => {
                            const tone = getUserTone(displayUser.colorIndex);
                            const category = categories.find(
                              (item) => item.user_id === displayUser.id && normalizeLabel(item.label) === trackerType.normalizedKey,
                            );

                            if (!category) {
                              return (
                                <div
                                  key={`${trackerType.normalizedKey}-${displayUser.id}`}
                                  className="flex min-h-[162px] items-center justify-center rounded-[24px] border-2 border-dashed border-[hsl(var(--sobriety-outline))] bg-[hsl(var(--sobriety-surface))] px-3 py-6 text-center text-sm text-muted-foreground"
                                >
                                  Not tracking
                                </div>
                              );
                            }

                            const info = getStreakInfo(category);
                            const checkedToday = isCheckedIn(category.id, today);
                            const nextMilestone = getNextMilestone(info.currentStreak);
                            const progress = getProgressPercent(info.currentStreak, nextMilestone);
                            const isMine = category.user_id === user?.id;
                            const cooldownKey = `${displayUser.id}_${category.id}`;
                            const showAddToMine = !isMine && !meHasTrackerType;

                            return (
                              <div
                                key={`${trackerType.normalizedKey}-${displayUser.id}`}
                                className="flex min-h-[162px] flex-col rounded-[24px] border px-3 py-3"
                                style={{
                                  backgroundColor: tone.surface,
                                  borderColor: tone.border,
                                  opacity: !isMine && checkedToday && !showAddToMine ? 0.8 : 1,
                                }}
                              >
                                {isMine ? (
                                  <button
                                    type="button"
                                    onClick={() => setExpandedCard((current) => current === category.id ? null : category.id)}
                                    className="text-left"
                                  >
                                    <div className="text-xl">{category.icon}</div>
                                    <div className="mt-3 text-[2rem] font-semibold leading-none tracking-[-0.04em] text-foreground">{info.currentStreak}</div>
                                    <div className="mt-1 text-sm text-muted-foreground">days</div>
                                    <div className="mt-3 h-1 overflow-hidden rounded-full bg-[hsl(var(--sobriety-progress-track))]">
                                      <div className="h-full rounded-full bg-[hsl(var(--sobriety-progress))]" style={{ width: `${progress}%` }} />
                                    </div>
                                  </button>
                                ) : (
                                  <div>
                                    <div className="text-xl">{category.icon}</div>
                                    <div className="mt-3 text-[2rem] font-semibold leading-none tracking-[-0.04em] text-foreground">{info.currentStreak}</div>
                                    <div className="mt-1 text-sm text-muted-foreground">days</div>
                                    <div className="mt-3 h-1 overflow-hidden rounded-full bg-[hsl(var(--sobriety-progress-track))]">
                                      <div className="h-full rounded-full bg-[hsl(var(--sobriety-progress))]" style={{ width: `${progress}%` }} />
                                    </div>
                                  </div>
                                )}

                                <div className="mt-auto pt-4">
                                  {isMine ? (
                                    checkedToday ? (
                                      <button
                                        type="button"
                                        onClick={() => setUndoCheckinCat(category)}
                                        className="w-full rounded-full bg-[hsl(var(--sobriety-success-surface))] px-3 py-1.5 text-sm font-medium text-[hsl(var(--sobriety-success-text))]"
                                      >
                                        ✅ Done
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setCheckinCategory(category);
                                          setCheckinDates([today]);
                                          setCheckinIsMissed(false);
                                          setShowCheckinDialog(true);
                                        }}
                                        className="w-full rounded-full bg-[hsl(var(--sobriety-info-surface))] px-3 py-1.5 text-sm font-medium text-[hsl(var(--sobriety-info-text))]"
                                      >
                                        Check in
                                      </button>
                                    )
                                  ) : showAddToMine ? (
                                    <button
                                      type="button"
                                      onClick={() => openAddToMine(category)}
                                      className="w-full rounded-full border border-primary/35 bg-background px-3 py-1.5 text-sm font-medium text-primary"
                                    >
                                      + Add to Mine
                                    </button>
                                  ) : checkedToday ? (
                                    <div className="w-full rounded-full bg-background/70 px-3 py-1.5 text-center text-sm font-medium text-muted-foreground">
                                      ✅ Done
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => sendNudge(displayUser.id, category.id)}
                                      disabled={nudgeCooldowns.has(cooldownKey)}
                                      className="w-full rounded-full border border-primary/35 bg-background px-3 py-1.5 text-sm font-medium text-primary disabled:opacity-50"
                                    >
                                      🔔 Nudge {displayUser.name}
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </section>
                );
              })}
            </div>
          ) : viewMode.mode === "single_other" ? (
            <div className="space-y-3">
              {categories.map((category) => {
                const info = getStreakInfo(category);
                const checkedToday = isCheckedIn(category.id, today);
                const nextMilestone = getNextMilestone(info.currentStreak);
                const progress = getProgressPercent(info.currentStreak, nextMilestone);
                const showAddToMine = !myExistingLabels.has(normalizeLabel(category.label));
                const tone = getUserTone(otherUser?.colorIndex ?? 1);
                const cooldownKey = `${category.user_id}_${category.id}`;

                return (
                  <div
                    key={category.id}
                    className="rounded-[24px] border px-4 py-4"
                    style={{ backgroundColor: tone.surface, borderColor: tone.border }}
                  >
                    <div className="flex items-start gap-3">
                      <div className="pt-1 text-2xl">{category.icon}</div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{formatTrackerLabel(category.label)}</p>
                        <div className="mt-1 text-[2rem] font-semibold leading-none tracking-[-0.04em] text-foreground">{info.currentStreak} days</div>
                        <div className="mt-4 h-1 overflow-hidden rounded-full bg-[hsl(var(--sobriety-progress-track))]">
                          <div className="h-full rounded-full bg-[hsl(var(--sobriety-progress))]" style={{ width: `${progress}%` }} />
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 space-y-2">
                      {checkedToday ? (
                        <div className="rounded-full bg-background/70 px-3 py-2 text-center text-sm font-medium text-muted-foreground">✅ Done</div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => sendNudge(category.user_id, category.id)}
                          disabled={nudgeCooldowns.has(cooldownKey)}
                          className="w-full rounded-full border border-primary/35 bg-background px-3 py-2 text-sm font-medium text-primary disabled:opacity-50"
                        >
                          🔔 Nudge {otherUser?.name || "them"}
                        </button>
                      )}
                      {showAddToMine && (
                        <button
                          type="button"
                          onClick={() => openAddToMine(category)}
                          className="w-full rounded-full border border-primary/35 bg-background px-3 py-2 text-sm font-medium text-primary"
                        >
                          + Add to Mine
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-3">
              {categories.map((category) => {
                const info = getStreakInfo(category);
                const checkedToday = isCheckedIn(category.id, today);
                const nextMilestone = getNextMilestone(info.currentStreak);
                const progress = getProgressPercent(info.currentStreak, nextMilestone);
                const isExpanded = expandedCard === category.id;
                const missedDays = getMissedDays(category);

                return (
                  <motion.div
                    key={category.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="overflow-hidden rounded-[26px] border border-[hsl(var(--sobriety-outline))] bg-[hsl(var(--sobriety-surface))]"
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedCard((current) => current === category.id ? null : category.id)}
                      className="w-full px-4 pb-4 pt-4 text-left"
                    >
                      <div className="flex items-start gap-3">
                        <div className="pt-1 text-2xl">{category.icon}</div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{formatTrackerLabel(category.label)}</p>
                          <div className="mt-1 text-[2.2rem] font-semibold leading-none tracking-[-0.05em] text-foreground">{info.currentStreak} days</div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          {info.moneySaved > 0 && (
                            <span className="rounded-full bg-[hsl(var(--sobriety-success-surface))] px-3 py-1 text-xs font-semibold text-[hsl(var(--sobriety-success-text))]">
                              ${info.moneySaved.toFixed(0)} saved
                            </span>
                          )}
                          <span className="rounded-full bg-[hsl(var(--sobriety-milestone-surface))] px-3 py-1 text-xs font-semibold text-[hsl(var(--sobriety-milestone-text))]">
                            🏆 Next: {nextMilestone ?? info.currentStreak} days
                          </span>
                        </div>
                      </div>

                      <div className="mt-4 flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>0</span>
                        <span>{nextMilestone ? `Next milestone: ${nextMilestone} days` : "Milestone reached"}</span>
                        <span>{nextMilestone ?? info.currentStreak}</span>
                      </div>
                      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[hsl(var(--sobriety-progress-track))]">
                        <div className="h-full rounded-full bg-[hsl(var(--sobriety-progress))]" style={{ width: `${progress}%` }} />
                      </div>
                    </button>

                    {checkedToday ? (
                      <button
                        type="button"
                        onClick={() => setUndoCheckinCat(category)}
                        className="mx-4 mb-4 flex w-[calc(100%-2rem)] items-center justify-center rounded-[18px] bg-[hsl(var(--sobriety-success-surface))] px-4 py-3 text-base font-medium text-[hsl(var(--sobriety-success-text))]"
                      >
                        ✅ Checked in today
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setCheckinCategory(category);
                          setCheckinDates([today]);
                          setCheckinIsMissed(false);
                          setShowCheckinDialog(true);
                        }}
                        className="mx-4 mb-4 flex w-[calc(100%-2rem)] items-center justify-center rounded-[18px] bg-[hsl(var(--sobriety-info-surface))] px-4 py-3 text-base font-medium text-[hsl(var(--sobriety-info-text))]"
                      >
                        Check in today
                      </button>
                    )}

                    <AnimatePresence>
                      {isExpanded && (
                        <ExpandedCardContent
                          category={category}
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
                          showSharingPills={isGroupView && sobrietyGroups.length > 0}
                        />
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <Drawer open={showAddDrawer} onOpenChange={setShowAddDrawer}>
        <DrawerContent className="max-h-[80dvh] rounded-t-[28px] border-[hsl(var(--sobriety-outline))] bg-[hsl(var(--sobriety-surface))]">
          <DrawerHeader className="pb-2">
            <DrawerTitle className="text-left text-[1.9rem] font-semibold tracking-[-0.05em]">Add a tracker</DrawerTitle>
            <DrawerDescription className="text-left text-base">What are you abstaining from?</DrawerDescription>
          </DrawerHeader>
          <ScrollArea className="max-h-[62dvh] px-4 pb-6">
            <div className="space-y-4 pb-2">
              <section className="rounded-[22px] bg-[hsl(var(--sobriety-shell))] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Add to</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <div className="flex items-center gap-2 rounded-full border border-primary/35 bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
                    <Lock className="h-4 w-4" />
                    Personal
                  </div>
                  {sobrietyGroups.map((group, index) => {
                    const tone = getUserTone(index);
                    const selected = addGroupIds.has(group.id);
                    return (
                      <button
                        key={group.id}
                        type="button"
                        onClick={() => {
                          setAddGroupIds((current) => {
                            const next = new Set(current);
                            if (next.has(group.id)) next.delete(group.id);
                            else next.add(group.id);
                            return next;
                          });
                        }}
                        className="rounded-full border px-4 py-2 text-sm font-medium transition-colors"
                        style={{
                          backgroundColor: selected ? tone.pill : "hsl(var(--sobriety-surface))",
                          borderColor: selected ? tone.border : "hsl(var(--sobriety-outline-strong))",
                          color: selected ? tone.text : "hsl(var(--foreground))",
                        }}
                      >
                        {group.name}
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="rounded-[22px] border border-[hsl(var(--sobriety-outline))] bg-[hsl(var(--sobriety-surface))] px-4 py-2">
                {orderedPresetCategories.map((preset, index) => {
                  const added = myExistingLabels.has(normalizeLabel(preset.label));
                  const divider = index < orderedPresetCategories.length - 1;
                  return (
                    <div key={preset.label} className={`flex items-center gap-3 py-3 ${divider ? "border-b border-[hsl(var(--sobriety-outline))]" : ""}`}>
                      <span className="text-2xl">{preset.icon}</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-base font-medium text-foreground">{preset.label}</div>
                      </div>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="$/day saved"
                        value={presetMoneyPerDay[preset.label] || ""}
                        onChange={(event) => setPresetMoneyPerDay((current) => ({ ...current, [preset.label]: event.target.value }))}
                        className="h-11 w-[112px] rounded-2xl border-[hsl(var(--sobriety-outline-strong))] text-right text-sm"
                      />
                      {added ? (
                        <span className="flex items-center gap-1 text-sm font-medium text-[hsl(var(--sobriety-success-text))]">
                          <Check className="h-4 w-4" /> Added
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => tryAddCategory(preset.label, preset.icon, parseFloat(presetMoneyPerDay[preset.label] || "0"))}
                          className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                        >
                          Add
                        </button>
                      )}
                    </div>
                  );
                })}
              </section>

              <section className="rounded-[22px] border border-[hsl(var(--sobriety-outline))] bg-[hsl(var(--sobriety-surface))] p-4">
                <p className="text-sm font-medium text-foreground">Custom</p>
                <div className="mt-3 space-y-3">
                  <Input
                    placeholder="Category name"
                    value={customLabel}
                    onChange={(event) => setCustomLabel(event.target.value)}
                    className="h-12 rounded-2xl border-[hsl(var(--sobriety-outline-strong))] text-base"
                  />
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="$/day saved (optional)"
                    value={moneyPerDay}
                    onChange={(event) => setMoneyPerDay(event.target.value)}
                    className="h-12 rounded-2xl border-[hsl(var(--sobriety-outline-strong))] text-base"
                  />
                  <button
                    type="button"
                    disabled={!customLabel.trim()}
                    onClick={() => tryAddCategory(customLabel.trim(), customIcon || "🚫", parseFloat(moneyPerDay || "0"))}
                    className="w-full rounded-full bg-primary px-4 py-3 text-base font-medium text-primary-foreground disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>
              </section>
            </div>
          </ScrollArea>
        </DrawerContent>
      </Drawer>

      <Dialog open={showCheckinDialog} onOpenChange={setShowCheckinDialog}>
        <DialogContent className="max-w-[320px] rounded-[24px] border-[hsl(var(--sobriety-outline))] bg-[hsl(var(--sobriety-surface))]">
          <DialogHeader className="text-center">
            <DialogTitle className="text-xl">
              {checkinCategory?.icon} {checkinCategory?.label}
            </DialogTitle>
            <DialogDescription className="text-sm">
              {checkinIsMissed
                ? `Did you stay on track on ${checkinDates.length === 1 ? format(parseISO(checkinDates[0]), "MMM d") : `${checkinDates.length} days`}?`
                : "Did you stay on track today?"}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 pt-2">
            <Button
              onClick={() => handleCheckin(true)}
              className="h-14 rounded-2xl bg-[hsl(var(--habit-green))] text-base text-primary-foreground hover:bg-[hsl(var(--habit-green))]/90"
            >
              ✅ Yes!
            </Button>
            <Button
              onClick={() => handleCheckin(false)}
              variant="outline"
              className="h-14 rounded-2xl border-destructive/30 text-base text-destructive hover:bg-destructive/5"
            >
              {checkinIsMissed ? "No" : "Not today"}
            </Button>
          </div>
          <p className="mt-1 text-center text-[11px] text-muted-foreground">No judgment — honesty is strength.</p>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!undoCheckinCat} onOpenChange={(open) => { if (!open) setUndoCheckinCat(null); }}>
        <AlertDialogContent className="max-w-[340px] rounded-[24px] border-[hsl(var(--sobriety-outline))] bg-[hsl(var(--sobriety-surface))]">
          <AlertDialogHeader>
            <AlertDialogTitle>Undo today’s check-in?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove your check-in for today and update your streak. Are you sure?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleUndoCheckin} className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Undo Check-in
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!duplicateWarning} onOpenChange={(open) => { if (!open) setDuplicateWarning(null); }}>
        <AlertDialogContent className="max-w-[340px] rounded-[24px] border-[hsl(var(--sobriety-outline))] bg-[hsl(var(--sobriety-surface))]">
          <AlertDialogHeader>
            <AlertDialogTitle>You already have this tracker</AlertDialogTitle>
            <AlertDialogDescription>
              You already have a “{duplicateWarning?.existingName}” tracker. Are you sure you want to add another one?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-full"
              onClick={() => {
                if (!duplicateWarning) return;
                handleAddCategory(
                  duplicateWarning.pendingLabel,
                  duplicateWarning.pendingIcon,
                  duplicateWarning.pendingMoney,
                );
                setDuplicateWarning(null);
              }}
            >
              Add Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AnimatePresence>
        {celebratingMilestone && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-6 backdrop-blur-sm"
            onClick={() => setCelebratingMilestone(null)}
          >
            <motion.div
              initial={{ y: 20 }}
              animate={{ y: 0 }}
              className="w-full max-w-[300px] rounded-[28px] border border-[hsl(var(--sobriety-outline))] bg-[hsl(var(--sobriety-surface))] p-8 text-center shadow-lg"
            >
              <motion.div
                animate={{ rotate: [0, -10, 10, -10, 0] }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="mb-4 text-6xl"
              >
                🏆
              </motion.div>
              <h2 className="text-2xl font-semibold tracking-[-0.04em] text-foreground">{celebratingMilestone} Days!</h2>
              <p className="mt-2 text-sm text-muted-foreground">Incredible milestone — you’re doing amazing.</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <CreateGroupModal
        open={showCreateGroup}
        onOpenChange={setShowCreateGroup}
        defaultPage="sobriety"
      />
    </div>
  );
};

function ExpandedCardContent({
  category,
  info,
  missedDays,
  getHeatmapData,
  onBatchCheckin,
  onResetStreak,
  onDeleteCategory,
  onUpdateMoneyPerDay,
  onAddPriorDays,
  sobrietyGroups,
  onToggleSharing,
  showSharingPills,
}: {
  category: SobrietyCategory;
  info: ReturnType<
    (category: SobrietyCategory) => {
      currentStreak: number;
      longestStreak: number;
      totalSober: number;
      totalDays: number;
      moneySaved: number;
      checkinMap: Map<string, boolean>;
    }
  >;
  missedDays: string[];
  getHeatmapData: (category: SobrietyCategory) => { date: string; status: "green" | "red" | "gray" }[];
  onBatchCheckin: (category: SobrietyCategory, dates: string[], onTrack: boolean) => void;
  onResetStreak: (category: SobrietyCategory) => void;
  onDeleteCategory: (categoryId: string) => void;
  onUpdateMoneyPerDay: (categoryId: string, value: number) => void;
  onAddPriorDays: (category: SobrietyCategory, days: number) => void;
  sobrietyGroups: { id: string; name: string; emoji: string }[];
  onToggleSharing: (category: SobrietyCategory, groupId: string) => void;
  showSharingPills: boolean;
}) {
  const [editingMoney, setEditingMoney] = useState(false);
  const [moneyValue, setMoneyValue] = useState(String(category.money_per_day || ""));
  const [showPriorDays, setShowPriorDays] = useState(false);
  const [priorDaysCount, setPriorDaysCount] = useState("3");
  const [selectedMissed, setSelectedMissed] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const milestones = MILESTONES.filter((milestone) => milestone <= info.currentStreak);

  const toggleMissedDay = (day: string) => {
    setSelectedMissed((current) => {
      const next = new Set(current);
      if (next.has(day)) next.delete(day);
      else next.add(day);
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
      <div className="space-y-4 border-t border-[hsl(var(--sobriety-outline))] px-4 pb-4 pt-4">
        {showSharingPills && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Shared with</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {sobrietyGroups.map((group) => {
                const shared = (category.shared_group_ids || []).includes(group.id);
                return (
                  <button
                    key={group.id}
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleSharing(category, group.id);
                    }}
                    className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                      shared
                        ? "border-primary/30 bg-primary/10 text-primary"
                        : "border-[hsl(var(--sobriety-outline-strong))] bg-background text-muted-foreground"
                    }`}
                  >
                    {group.emoji} {group.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-[18px] bg-[hsl(var(--sobriety-shell))] p-3 text-center">
            <Flame className="mx-auto mb-1 h-4 w-4 text-destructive" />
            <p className="text-lg font-semibold text-foreground">{info.longestStreak}</p>
            <p className="text-[11px] text-muted-foreground">Longest streak</p>
          </div>
          <div className="rounded-[18px] bg-[hsl(var(--sobriety-shell))] p-3 text-center">
            <Calendar className="mx-auto mb-1 h-4 w-4 text-primary" />
            <p className="text-lg font-semibold text-foreground">{info.totalSober}</p>
            <p className="text-[11px] text-muted-foreground">Checked-in days</p>
          </div>
          {category.money_per_day > 0 && (
            <div className="col-span-2 rounded-[18px] bg-[hsl(var(--sobriety-shell))] p-3 text-center">
              <DollarSign className="mx-auto mb-1 h-4 w-4 text-[hsl(var(--sobriety-money-text))]" />
              <p className="text-lg font-semibold text-foreground">${info.moneySaved.toFixed(0)}</p>
              <p className="text-[11px] text-muted-foreground">Money saved</p>
            </div>
          )}
        </div>

        <div>
          {editingMoney ? (
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="$/day"
                value={moneyValue}
                onChange={(event) => setMoneyValue(event.target.value)}
                className="h-10 flex-1 rounded-2xl border-[hsl(var(--sobriety-outline-strong))]"
                autoFocus
              />
              <Button
                size="sm"
                className="rounded-full"
                onClick={() => {
                  onUpdateMoneyPerDay(category.id, parseFloat(moneyValue) || 0);
                  setEditingMoney(false);
                }}
              >
                Save
              </Button>
              <Button size="sm" variant="ghost" className="rounded-full" onClick={() => { setEditingMoney(false); setMoneyValue(String(category.money_per_day || "")); }}>
                Cancel
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEditingMoney(true)}
              className="text-sm font-medium text-primary"
            >
              {category.money_per_day > 0 ? `Edit money saved ($${category.money_per_day}/day)` : "Add money saved per day"}
            </button>
          )}
        </div>

        <div>
          {showPriorDays ? (
            <div className="rounded-[20px] bg-[hsl(var(--sobriety-shell))] p-4">
              <p className="text-sm font-medium text-foreground">Add prior sober days</p>
              <p className="mt-1 text-[11px] text-muted-foreground">Were you sober before creating this card? Add those days here.</p>
              <div className="mt-3 flex items-center gap-2">
                <Input
                  type="number"
                  min="1"
                  max="365"
                  value={priorDaysCount}
                  onChange={(event) => setPriorDaysCount(event.target.value)}
                  className="h-10 w-24 rounded-2xl border-[hsl(var(--sobriety-outline-strong))]"
                />
                <span className="text-sm text-muted-foreground">days before start</span>
              </div>
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  className="rounded-full"
                  onClick={() => {
                    const count = parseInt(priorDaysCount, 10) || 0;
                    if (count > 0) {
                      onAddPriorDays(category, count);
                      setShowPriorDays(false);
                    }
                  }}
                >
                  Add {priorDaysCount || 0} days
                </Button>
                <Button size="sm" variant="ghost" className="rounded-full" onClick={() => setShowPriorDays(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setShowPriorDays(true)} className="text-sm font-medium text-primary">
              Add prior sober days
            </button>
          )}
        </div>

        {missedDays.length > 0 && (
          <div>
            <p className="text-sm font-medium text-foreground">Missed days</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {missedDays.slice(0, 14).map((day) => {
                const selected = selectedMissed.has(day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleMissedDay(day);
                    }}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                      selected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-[hsl(var(--sobriety-outline-strong))] bg-background text-muted-foreground"
                    }`}
                  >
                    {format(parseISO(day), "MMM d")}
                  </button>
                );
              })}
            </div>
            {selectedMissed.size > 0 && (
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  className="flex-1 rounded-full"
                  onClick={(event) => {
                    event.stopPropagation();
                    onBatchCheckin(category, Array.from(selectedMissed), true);
                    setSelectedMissed(new Set());
                  }}
                >
                  ✅ Check in {selectedMissed.size} day{selectedMissed.size > 1 ? "s" : ""}
                </Button>
                <Button size="sm" variant="ghost" className="rounded-full" onClick={() => setSelectedMissed(new Set())}>
                  Clear
                </Button>
              </div>
            )}
          </div>
        )}

        <div>
          <p className="text-sm font-medium text-foreground">Last 13 weeks</p>
          <div className="mt-2">
            <HeatmapGrid data={getHeatmapData(category)} />
          </div>
        </div>

        {milestones.length > 0 && (
          <div>
            <p className="text-sm font-medium text-foreground">Milestones</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {milestones.map((milestone) => (
                <span
                  key={milestone}
                  className="rounded-full bg-[hsl(var(--sobriety-milestone-surface))] px-3 py-1 text-xs font-semibold text-[hsl(var(--sobriety-milestone-text))]"
                >
                  🏆 {milestone} days
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <p>Started {format(parseISO(category.start_date), "MMM d, yyyy")}</p>
          <div className="flex gap-3">
            <button type="button" onClick={() => onResetStreak(category)} className="font-medium text-foreground">
              Reset
            </button>
            {!showDeleteConfirm ? (
              <button type="button" onClick={() => setShowDeleteConfirm(true)} className="font-medium text-destructive">
                Remove
              </button>
            ) : (
              <div className="flex gap-2">
                <button type="button" onClick={() => onDeleteCategory(category.id)} className="font-medium text-destructive">
                  Confirm
                </button>
                <button type="button" onClick={() => setShowDeleteConfirm(false)} className="font-medium text-foreground">
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

function HeatmapGrid({ data }: { data: { date: string; status: "green" | "red" | "gray" }[] }) {
  const weeks: typeof data[] = [];
  let week: typeof data = [];

  const firstDate = data[0]?.date ? parseISO(data[0].date) : new Date();
  const startDay = firstDate.getDay();
  for (let index = 0; index < startDay; index += 1) {
    week.push({ date: "", status: "gray" });
  }

  for (const day of data) {
    week.push(day);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }

  if (week.length > 0) weeks.push(week);

  const colorMap = {
    green: "hsl(var(--habit-green))",
    red: "hsl(var(--destructive) / 0.7)",
    gray: "hsl(var(--secondary))",
  };

  return (
    <div className="flex gap-[3px] overflow-x-auto pb-1">
      {weeks.map((weekGroup, weekIndex) => (
        <div key={weekIndex} className="flex flex-col gap-[3px]">
          {weekGroup.map((day, dayIndex) => (
            <div
              key={dayIndex}
              className="h-3 w-3 rounded-[3px]"
              style={{ backgroundColor: day.date ? colorMap[day.status] : "transparent" }}
              title={day.date ? `${day.date}: ${day.status === "green" ? "✅" : day.status === "red" ? "❌" : "—"}` : ""}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export default SobrietyPage;
