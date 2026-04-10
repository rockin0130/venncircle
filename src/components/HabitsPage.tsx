import { useState, useEffect, useMemo } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import GroupBadge from "@/components/GroupBadge";
import { Plus, Flame, Check, Bell, Eye, EyeOff, MoreHorizontal } from "lucide-react";
import { useAppContext } from "@/context/AppContext";
import { useAuth, GroupMember } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import DraggableWaterBar from "@/components/DraggableWaterBar";
import HabitDateViewer from "@/components/HabitDateViewer";
import PartnerHabitDetailModal from "@/components/PartnerHabitDetailModal";

import PageGroupSelector from "@/components/PageGroupSelector";
import HabitUserFilter, { EVERYONE_SENTINEL } from "@/components/HabitUserFilter";
import HabitContextSelector from "@/components/HabitContextSelector";
import HabitEditModal from "@/components/HabitEditModal";
import type { Habit } from "@/context/AppContext";

// ── Fixed default sections ──
const DEFAULT_SECTIONS = [
  { key: "morning", label: "Morning", icon: "🌅" },
  { key: "afternoon", label: "Afternoon", icon: "☀️" },
  { key: "evening", label: "Evening", icon: "🌙" },
  { key: "other", label: "Other", icon: "📋" },
];

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const normalizeKey = (key: string) => key.toLowerCase().replace(/[\s_-]+/g, "").replace(/habits$/, "");

const getSectionHabits = (sectionKey: string, habitsList: Habit[]) => {
  return habitsList.filter((h) => {
    const norm = normalizeKey(h.category);
    if (sectionKey === "other") {
      return norm !== "morning" && norm !== "afternoon" && norm !== "evening";
    }
    return norm === sectionKey;
  });
};

interface DisplayUser {
  id: string;
  label: string;
  avatarUrl: string | null;
  initial: string;
}

// Dynamic user color palette
const USER_COLORS = [
  { bg: "hsl(210 90% 95%)", border: "hsl(210 70% 78%)", ring: "hsl(210 80% 55%)", pill: "hsl(210 90% 95%)", pillText: "hsl(210 60% 40%)" },
  { bg: "hsl(130 50% 93%)", border: "hsl(130 40% 72%)", ring: "hsl(130 50% 45%)", pill: "hsl(130 50% 93%)", pillText: "hsl(130 40% 30%)" },
  { bg: "hsl(340 60% 95%)", border: "hsl(340 50% 78%)", ring: "hsl(340 60% 55%)", pill: "hsl(340 60% 95%)", pillText: "hsl(340 45% 35%)" },
  { bg: "hsl(270 50% 95%)", border: "hsl(270 40% 78%)", ring: "hsl(270 50% 55%)", pill: "hsl(270 50% 95%)", pillText: "hsl(270 40% 35%)" },
  { bg: "hsl(40 70% 93%)", border: "hsl(40 55% 72%)", ring: "hsl(40 65% 50%)", pill: "hsl(40 70% 93%)", pillText: "hsl(40 50% 30%)" },
  { bg: "hsl(180 50% 93%)", border: "hsl(180 40% 72%)", ring: "hsl(180 50% 45%)", pill: "hsl(180 50% 93%)", pillText: "hsl(180 40% 30%)" },
];

const getUserColor = (index: number) => USER_COLORS[index % USER_COLORS.length];

const HabitsPage = ({ onOpenSettings, onOpenMore }: { onOpenSettings?: () => void; onOpenMore?: () => void } = {}) => {
  const {
    habits, filteredHabits, filteredPartnerHabits,
    toggleHabit, addHabit, removeHabit, addSharedHabit,
    getHabitStreak, getPartnerHabitStreak,
    waterIntake, waterGoal, partnerWaterIntake, partnerWaterGoal, partnerWaterMap,
    setWaterIntake, setWaterGoal, resetWater,
  } = useAppContext();
  const { user, partner, profile, activeGroup, groups } = useAuth();
  const [newHabitLabel, setNewHabitLabel] = useState("");
  const [addingToSection, setAddingToSection] = useState<string | null>(null);
  const [selectedContexts, setSelectedContexts] = useState<string[]>([]);
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const [viewingPartnerHabit, setViewingPartnerHabit] = useState<{ habit: Habit; ownerName: string } | null>(null);
  const [duplicateConfirm, setDuplicateConfirm] = useState<{ existingName: string } | null>(null);

  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set([EVERYONE_SENTINEL]));

  const [showWater, setShowWater] = useState(() => {
    const saved = localStorage.getItem("habits_show_water");
    return saved !== null ? saved === "true" : true;
  });

  const [editingWaterGoal, setEditingWaterGoal] = useState(false);
  const [customGoalInput, setCustomGoalInput] = useState("");

  const isPersonalActive = (activeGroup as any)?._personal === true;
  const isAllActive = activeGroup === null && !isPersonalActive;
  const isGroupActive = !!activeGroup && !isPersonalActive;

  const isEveryoneSelected = selectedUserIds.has(EVERYONE_SENTINEL);

  // Build the list of displayable users
  const displayUsers: DisplayUser[] = useMemo(() => {
    if (isPersonalActive) return [{
      id: user?.id || "me",
      label: "Mine",
      avatarUrl: profile?.avatar_url || null,
      initial: profile?.display_name?.charAt(0)?.toUpperCase() || "?",
    }];

    const users: DisplayUser[] = [];
    users.push({
      id: user?.id || "me",
      label: "Mine",
      avatarUrl: profile?.avatar_url || null,
      initial: profile?.display_name?.charAt(0)?.toUpperCase() || "?",
    });

    if (isGroupActive && activeGroup) {
      const others = activeGroup.members.filter((m: GroupMember) => m.user_id !== user?.id && m.status === "active");
      others.forEach((m) => {
        const name = m.display_name || "Member";
        users.push({
          id: m.user_id,
          label: name.split(" ")[0],
          avatarUrl: m.avatar_url,
          initial: name.charAt(0).toUpperCase(),
        });
      });
    } else if (isAllActive) {
      const seen = new Set<string>();
      seen.add(user?.id || "");
      groups
        .filter((g) => g.shared_pages?.includes("habits"))
        .forEach((g) => {
          g.members
            .filter((m: GroupMember) => m.status === "active" && !seen.has(m.user_id))
            .forEach((m) => {
              seen.add(m.user_id);
              const name = m.display_name || "Member";
              users.push({
                id: m.user_id,
                label: name.split(" ")[0],
                avatarUrl: m.avatar_url,
                initial: name.charAt(0).toUpperCase(),
              });
            });
        });
    }
    return users;
  }, [user, profile, activeGroup, isGroupActive, isAllActive, isPersonalActive, groups]);

  // Determine which users are currently selected
  const selectedUsers = useMemo(() => {
    if (isPersonalActive) return displayUsers;
    if (isEveryoneSelected) return displayUsers;
    return displayUsers.filter((u) => selectedUserIds.has(u.id));
  }, [displayUsers, isPersonalActive, isEveryoneSelected, selectedUserIds]);

  const isMultiUser = selectedUsers.length > 1;

  // User color index map — stable ordering
  const userColorMap = useMemo(() => {
    const map = new Map<string, number>();
    displayUsers.forEach((u, i) => map.set(u.id, i));
    return map;
  }, [displayUsers]);

  // All habits (own)
  const displayHabits = useMemo(() => {
    if (isPersonalActive || isAllActive) return filteredHabits;
    if (isEveryoneSelected) return filteredHabits;
    const myId = user?.id;
    return filteredHabits.filter((h) => {
      const ownerId = h.ownerUserId || myId;
      return ownerId && selectedUserIds.has(ownerId);
    });
  }, [filteredHabits, isPersonalActive, isAllActive, isEveryoneSelected, selectedUserIds, user]);

  // Partner habits
  const displayPartnerHabits = useMemo(() => {
    if (isPersonalActive) return [];
    if (isAllActive) {
      if (isEveryoneSelected) return filteredPartnerHabits;
      return filteredPartnerHabits.filter((h) => h.ownerUserId && selectedUserIds.has(h.ownerUserId));
    }
    if (isEveryoneSelected) return filteredPartnerHabits;
    return filteredPartnerHabits.filter((h) => h.ownerUserId && selectedUserIds.has(h.ownerUserId));
  }, [filteredPartnerHabits, isPersonalActive, isAllActive, isEveryoneSelected, selectedUserIds]);

  // All habits combined
  const allDisplayHabits = useMemo(() => {
    const myId = user?.id;
    const showMine = isEveryoneSelected || (myId && selectedUserIds.has(myId));
    if (isPersonalActive) return displayHabits;
    const result = showMine ? [...displayHabits] : [];
    const ownIds = new Set(displayHabits.map(h => h.id));
    for (const ph of displayPartnerHabits) {
      if (!ownIds.has(ph.id)) result.push(ph);
    }
    return result;
  }, [displayHabits, displayPartnerHabits, user, isEveryoneSelected, selectedUserIds, isPersonalActive]);

  // Per-user habits map
  const habitsPerUser = useMemo(() => {
    const map = new Map<string, Habit[]>();
    for (const u of selectedUsers) {
      map.set(u.id, []);
    }
    for (const h of allDisplayHabits) {
      const ownerId = h.ownerUserId || user?.id || "";
      if (map.has(ownerId)) {
        map.get(ownerId)!.push(h);
      }
    }
    return map;
  }, [allDisplayHabits, selectedUsers, user]);

  const isOwnHabit = (habit: { ownerUserId?: string }) => {
    return !habit.ownerUserId || habit.ownerUserId === user?.id;
  };

  const shouldShowNotShared = (habit: Habit) => {
    if (!isGroupActive || !activeGroup) return false;
    if (!isOwnHabit(habit)) return false;
    const sharedIds = habit.sharedGroupIds || [];
    return !sharedIds.includes(activeGroup.id);
  };

  const toggleWaterVisibility = () => {
    const next = !showWater;
    setShowWater(next);
    localStorage.setItem("habits_show_water", String(next));
  };

  const saveCustomGoal = () => {
    const val = parseFloat(customGoalInput);
    if (!isNaN(val) && val >= 0.5 && val <= 10) {
      setWaterGoal(val);
      toast.success(`Water goal set to ${val}L`);
    } else {
      toast.error("Enter a value between 0.5 and 10");
    }
    setEditingWaterGoal(false);
  };

  useEffect(() => {
    if (!user) return;
    const checkNudges = async () => {
      const { data } = await supabase
        .from("nudges")
        .select("*")
        .eq("to_user_id", user.id)
        .eq("seen", false);

      if (data && data.length > 0) {
        for (const nudge of data) {
          toast.info(`👋 ${partner?.display_name || "Your partner"} nudged you!`, {
            description: nudge.message,
            duration: 5000,
          });
        }
        const ids = data.map((n) => n.id);
        await supabase.from("nudges").update({ seen: true }).in("id", ids);
      }
    };
    checkNudges();
  }, [user, partner]);

  const normalizeName = (name: string) => name.toLowerCase().replace(/[\s\-_.,:;!?'"]/g, "").trim();

  const handleAdd = async () => {
    if (!newHabitLabel.trim() || !addingToSection) return;
    const normalizedNew = normalizeName(newHabitLabel.trim());

    const existingDupe = habits.find((h) => {
      const sectionKey = addingToSection;
      const hNorm = normalizeKey(h.category);
      const inSameSection = sectionKey === "other"
        ? hNorm !== "morning" && hNorm !== "afternoon" && hNorm !== "evening"
        : hNorm === sectionKey;
      return inSameSection && normalizeName(h.label) === normalizedNew;
    });

    if (existingDupe) {
      setDuplicateConfirm({ existingName: existingDupe.label });
      return;
    }

    doAddHabit();
  };

  const doAddHabit = () => {
    if (!newHabitLabel.trim() || !addingToSection) return;
    addHabit(newHabitLabel.trim(), addingToSection, selectedContexts.length > 0 ? selectedContexts : undefined);
    toast.success(`Routine "${newHabitLabel.trim()}" added!`);
    setNewHabitLabel("");
    setAddingToSection(null);
    setSelectedContexts([]);
    setDuplicateConfirm(null);
  };

  const handleToggle = (id: string) => {
    const habit = habits.find((h) => h.id === id);
    if (habit && habit.ownerUserId && habit.ownerUserId !== user?.id) return;
    toggleHabit(id);
  };

  const sendNudge = async (habitLabel: string, habitId: string, targetUserId: string, targetName: string) => {
    if (!user) return;
    const { error } = await supabase.from("nudges").insert({
      from_user_id: user.id,
      to_user_id: targetUserId,
      habit_id: habitId,
      message: `Time to do "${habitLabel}"! 💪`,
    });
    if (!error) {
      toast.success(`Nudge sent to ${targetName}!`);
    } else {
      toast.error("Couldn't send nudge");
    }
  };

  const getHabitOwnerName = (habit: Habit): string => {
    if (!habit.ownerUserId) return profile?.display_name || "You";
    const du = displayUsers.find((u) => u.id === habit.ownerUserId);
    return du?.label || "Member";
  };

  // ── Progress per user ──
  const progressPerUser = useMemo(() => {
    return selectedUsers.map((u) => {
      const userHabits = habitsPerUser.get(u.id) || [];
      const done = userHabits.filter((h) => h.done).length;
      const total = userHabits.length;
      const isMe = u.id === user?.id;
      const userWaterIntake = isMe ? waterIntake : (partnerWaterMap.get(u.id)?.intake ?? 0);
      const userWaterGoal = isMe ? waterGoal : (partnerWaterMap.get(u.id)?.goal ?? 3);
      const waterDone = showWater && userWaterIntake >= userWaterGoal;
      const totalWithWater = total + (showWater ? 1 : 0);
      const doneWithWater = done + (showWater && waterDone ? 1 : 0);
      return { ...u, done: doneWithWater, total: totalWithWater, percent: totalWithWater > 0 ? Math.round((doneWithWater / totalWithWater) * 100) : 0 };
    });
  }, [selectedUsers, habitsPerUser, user, showWater, waterIntake, waterGoal, partnerWaterMap]);

  // Section progress for single-user breakdown dots
  const sectionProgress = useMemo(() => {
    if (isMultiUser) return [];
    const myHabits = allDisplayHabits;
    return DEFAULT_SECTIONS.map((section) => {
      const sHabits = getSectionHabits(section.key, myHabits);
      const done = sHabits.filter((h) => h.done).length;
      const total = sHabits.length;
      return { ...section, done, total };
    }).filter((s) => s.total > 0);
  }, [isMultiUser, allDisplayHabits]);

  const isMineOnly = selectedUsers.length === 1 && selectedUsers[0].id === user?.id;

  // ── MAIN VIEW ──
  return (
    <div className="px-5">

      {/* ── Header ── */}
      <header className="pt-12 pb-4 flex items-start justify-between">
        <div>
          <h1 className="text-[1.75rem] font-bold tracking-display">Routines</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Build a better routine</p>
        </div>
        <div className="flex items-center gap-1.5 mt-1">
          <button
            onClick={() => setAddingToSection(addingToSection ? null : "morning")}
            className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground shadow-md active:scale-95 transition-transform"
            aria-label="Add routine"
          >
            <Plus size={18} strokeWidth={2.5} />
          </button>
          {onOpenMore && (
            <button onClick={onOpenMore} className="w-[30px] h-[30px] rounded-full flex items-center justify-center" style={{ background: "#F4F3F0" }} aria-label="More">
              <MoreHorizontal size={15} color="#888" />
            </button>
          )}
        </div>
      </header>

      <PageGroupSelector page="habits" personalLabel="Mine" hideAllPill showAvatars />

      <HabitUserFilter
        selectedUserIds={selectedUserIds}
        onSelectionChange={setSelectedUserIds}
      />

      {/* ── Progress Card ── */}
      <div className="bg-card rounded-xl p-4 border border-border shadow-card mb-5">
        {isMultiUser ? (
          <>
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-3">Today's Progress</p>
            <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1" style={{ WebkitOverflowScrolling: "touch" }}>
              {progressPerUser.map((pu) => {
                const colorIdx = userColorMap.get(pu.id) ?? 0;
                const color = getUserColor(colorIdx);
                return (
                  <div key={pu.id} className="flex flex-col items-center text-center flex-shrink-0" style={{ minWidth: 56 }}>
                    {pu.avatarUrl ? (
                      <img src={pu.avatarUrl} alt="" className="w-[22px] h-[22px] rounded-full object-cover mb-1" />
                    ) : (
                      <span className="w-[22px] h-[22px] rounded-full flex items-center justify-center text-[9px] font-bold mb-1"
                        style={{ backgroundColor: color.bg, color: color.pillText }}>{pu.initial}</span>
                    )}
                    <span className="text-[9px] text-muted-foreground truncate w-full">{pu.label}</span>
                    <span className="text-sm font-bold tracking-display mt-0.5">{pu.done}/{pu.total}</span>
                    <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden mt-1">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pu.percent}%`, backgroundColor: color.ring }} />
                    </div>
                    <span className="text-[10px] text-muted-foreground mt-0.5">
                      {pu.percent >= 100 ? `🎉 ${pu.percent}%` : `${pu.percent}%`}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground font-medium">Today's Progress</span>
              <span className="text-sm font-semibold">{progressPerUser[0]?.done || 0} / {progressPerUser[0]?.total || 0} done</span>
            </div>
            <div className="h-2 bg-secondary rounded-full overflow-hidden mb-3">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progressPerUser[0]?.percent || 0}%` }} />
            </div>
            {sectionProgress.length > 0 && (
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {sectionProgress.map((sp) => {
                  const dotColor = sp.done === sp.total ? "hsl(var(--habit-green, 142 71% 45%))" : sp.done > 0 ? "hsl(var(--primary))" : "hsl(var(--muted))";
                  return (
                    <span key={sp.key} className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: dotColor }} />
                      {sp.label} {sp.done}/{sp.total}
                    </span>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Water Intake ── */}
      {showWater && (
        <section className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold tracking-display flex items-center gap-1.5">
              💧 Water Intake
            </h2>
            <div className="flex items-center gap-1">
              {isMineOnly && (
                <>
                  {[2, 3, 4].map((g) => (
                    <button key={g} onClick={() => { setWaterGoal(g); setEditingWaterGoal(false); }}
                      className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold transition-all ${waterGoal === g && !editingWaterGoal ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}
                    >{g}L</button>
                  ))}
                  {!editingWaterGoal ? (
                    <button onClick={() => { setCustomGoalInput(String(waterGoal)); setEditingWaterGoal(true); }}
                      className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold transition-all ${![2, 3, 4].includes(waterGoal) ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}
                    >{![2, 3, 4].includes(waterGoal) ? `${waterGoal}L` : "Custom"}</button>
                  ) : (
                    <div className="flex items-center gap-1">
                      <input type="number" value={customGoalInput} onChange={(e) => setCustomGoalInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") saveCustomGoal(); if (e.key === "Escape") setEditingWaterGoal(false); }}
                        className="w-12 bg-secondary rounded-lg px-1.5 py-0.5 text-[10px] text-center outline-none text-foreground border border-border"
                        step="0.1" min="0.5" max="10" autoFocus />
                      <span className="text-[10px] text-muted-foreground">L</span>
                      <button onClick={saveCustomGoal} className="text-[10px] text-primary font-semibold">Set</button>
                    </div>
                  )}
                </>
              )}
              <button onClick={toggleWaterVisibility}
                className="w-6 h-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                title="Hide water intake"
              ><EyeOff size={12} /></button>
            </div>
          </div>

          {isMultiUser ? (
            /* Multi-user: compact per-user rows */
            <div className="bg-card rounded-xl p-4 border border-border shadow-card space-y-2.5">
              {selectedUsers.map((su) => {
                const isMe = su.id === user?.id;
                const intake = isMe ? waterIntake : (partnerWaterMap.get(su.id)?.intake ?? 0);
                const goal = isMe ? waterGoal : (partnerWaterMap.get(su.id)?.goal ?? 3);
                const pct = goal > 0 ? Math.min(intake / goal, 1) : 0;
                const done = intake >= goal;
                const colorIdx = userColorMap.get(su.id) ?? 0;
                const color = getUserColor(colorIdx);
                return (
                  <div key={su.id} className="flex items-center gap-2">
                    {su.avatarUrl ? (
                      <img src={su.avatarUrl} alt="" className="w-4 h-4 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <span className="w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-bold flex-shrink-0"
                        style={{ backgroundColor: color.bg, color: color.pillText }}>{su.initial}</span>
                    )}
                    <span className="text-xs font-medium w-10 flex-shrink-0">{intake.toFixed(1)}L</span>
                    <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct * 100}%`, backgroundColor: color.ring }} />
                    </div>
                    <span className={`text-[10px] flex-shrink-0 font-medium ${done ? "text-habit-green" : "text-muted-foreground"}`}>
                      {done ? "✓ Done" : `/ ${goal}L`}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Single user: bar with controls */
            <div className="bg-card rounded-xl p-4 border border-border shadow-card">
              <DraggableWaterBar intake={waterIntake} goal={waterGoal} onIntakeChange={setWaterIntake} />
              <div className="flex gap-2 mt-1">
                {[0.25, 0.5].map((amt) => (
                  <button key={amt} onClick={() => setWaterIntake(Math.min(waterIntake + amt, waterGoal + 1))}
                    className="flex-1 py-2 bg-primary/10 text-primary rounded-lg text-xs font-bold active:scale-[0.97] transition-transform"
                  >+{amt * 1000}ml</button>
                ))}
                <button onClick={resetWater}
                  className="py-2 px-3 bg-secondary text-muted-foreground rounded-lg text-xs font-medium active:scale-[0.97] transition-transform"
                >Reset</button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Show water toggle when hidden */}
      {!showWater && (
        <button onClick={toggleWaterVisibility}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4 px-1 transition-colors"
        ><Eye size={14} /><span>Show Water Intake</span></button>
      )}

      {/* Past Date Viewer */}
      <HabitDateViewer />

      {/* ── Habits List ── */}
      {isMultiUser ? (
        /* Multi-user: column layout per period */
        DEFAULT_SECTIONS.map((section) => {
          // Check if any selected user has habits in this section
          const anyHabits = selectedUsers.some((su) => {
            const uHabits = habitsPerUser.get(su.id) || [];
            return getSectionHabits(section.key, uHabits).length > 0;
          });
          if (!anyHabits) return null;

          return (
            <section key={section.key} className="mb-5">
              {/* Period separator */}
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm">{section.icon}</span>
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{section.label}</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              {/* Column headers */}
              <div className="overflow-x-auto scrollbar-hide" style={{ WebkitOverflowScrolling: "touch" }}>
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${selectedUsers.length}, minmax(0, 1fr))`, gap: 5, minWidth: selectedUsers.length > 3 ? selectedUsers.length * 110 : undefined }}>
                  {selectedUsers.map((su) => {
                    const colorIdx = userColorMap.get(su.id) ?? 0;
                    const color = getUserColor(colorIdx);
                    return (
                      <div key={`hdr-${su.id}`} className="flex items-center gap-1 px-2 py-1 rounded-lg mb-1"
                        style={{ backgroundColor: color.pill }}>
                        {su.avatarUrl ? (
                          <img src={su.avatarUrl} alt="" className="w-4 h-4 rounded-full object-cover flex-shrink-0" />
                        ) : (
                          <span className="w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-bold flex-shrink-0"
                            style={{ backgroundColor: color.ring, color: "#fff" }}>{su.initial}</span>
                        )}
                        <span className="text-[10px] font-semibold truncate" style={{ color: color.pillText }}>{su.label}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Habit cards in columns */}
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${selectedUsers.length}, minmax(0, 1fr))`, gap: 5, minWidth: selectedUsers.length > 3 ? selectedUsers.length * 110 : undefined }}>
                  {selectedUsers.map((su) => {
                    const uHabits = habitsPerUser.get(su.id) || [];
                    const sHabits = getSectionHabits(section.key, uHabits);
                    const colorIdx = userColorMap.get(su.id) ?? 0;
                    const color = getUserColor(colorIdx);
                    const isMe = su.id === user?.id;

                    return (
                      <div key={`col-${su.id}`} className="space-y-1.5 min-w-0">
                        {sHabits.length === 0 ? (
                          <div className="rounded-lg border border-dashed border-border/50 p-3 flex items-center justify-center min-h-[48px]">
                            <span className="text-[10px] text-muted-foreground/60">None</span>
                          </div>
                        ) : (
                          sHabits.map((habit) => {
                            const own = isOwnHabit(habit);
                            const streak = own ? getHabitStreak(habit.id) : getPartnerHabitStreak(habit.id);
                            const ownerName = getHabitOwnerName(habit);
                            return (
                              <div
                                key={habit.id}
                                onClick={() => {
                                  if (own) setEditingHabit(habit);
                                  else setViewingPartnerHabit({ habit, ownerName });
                                }}
                                className={`rounded-lg p-2.5 border cursor-pointer active:scale-[0.98] transition-all ${habit.done ? "opacity-45" : ""}`}
                                style={{
                                  backgroundColor: color.bg,
                                  borderColor: color.border,
                                  boxSizing: "border-box",
                                }}
                              >
                                <div className="flex items-start gap-1.5">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (own) handleToggle(habit.id);
                                    }}
                                    disabled={!own}
                                    className="flex-shrink-0 mt-0.5"
                                  >
                                    {habit.done ? (
                                      <span className="w-4 h-4 rounded-full bg-habit-green flex items-center justify-center">
                                        <Check size={10} className="text-primary-foreground" />
                                      </span>
                                    ) : (
                                      <span className="w-4 h-4 rounded-full border-2 border-muted" />
                                    )}
                                  </button>
                                  <div className="flex-1 min-w-0">
                                    <span className={`text-[11px] font-medium block truncate ${habit.done ? "line-through" : ""}`}>{habit.label}</span>
                                    {streak >= 1 && (
                                      <span className="text-[9px] text-accent flex items-center gap-0.5 mt-0.5">
                                        🔥 {streak}d
                                      </span>
                                    )}
                                    {/* Nudge button for other users' incomplete habits */}
                                    {!own && !habit.done && habit.ownerUserId && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          sendNudge(habit.label, habit.id, habit.ownerUserId!, ownerName);
                                        }}
                                        className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border border-primary/30 text-primary text-[9px] font-semibold mt-1 hover:bg-primary/10 transition-colors"
                                      >
                                        <Bell size={8} /> Nudge
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          );
        })
      ) : (
        /* Single user: standard layout */
        DEFAULT_SECTIONS.map((section) => {
          const sectionHabits = getSectionHabits(section.key, allDisplayHabits);
          const sectionCompleted = sectionHabits.filter((h) => h.done).length;
          const isAdding = addingToSection === section.key;
          const showEmptySection = isMineOnly || isPersonalActive;

          if (sectionHabits.length === 0 && !showEmptySection) return null;

          return (
            <section key={section.key} className="mb-5">
              {/* Period separator */}
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm">{section.icon}</span>
                <span className="text-xs font-semibold">{section.label}</span>
                {sectionHabits.length > 0 && (
                  <span className="text-[11px] text-muted-foreground">{sectionCompleted}/{sectionHabits.length}</span>
                )}
                <div className="flex-1 h-px bg-border" />
                {(isMineOnly || isPersonalActive) && (
                  <button onClick={() => setAddingToSection(isAdding ? null : section.key)}
                    className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary hover:bg-primary/20 transition-colors"
                  ><Plus size={12} /></button>
                )}
              </div>

              {isAdding && (
                <AddHabitForm
                  value={newHabitLabel}
                  onChange={setNewHabitLabel}
                  onSubmit={handleAdd}
                  selectedContexts={selectedContexts}
                  onChangeContexts={setSelectedContexts}
                  placeholder={`Add ${section.label.toLowerCase()} routine...`}
                />
              )}

              {sectionHabits.length > 0 ? (
                <div className="space-y-1.5">
                  {sectionHabits.map((habit) => {
                    const own = isOwnHabit(habit);
                    const streak = own ? getHabitStreak(habit.id) : getPartnerHabitStreak(habit.id);
                    const ownerName = getHabitOwnerName(habit);
                    return (
                      <HabitRow
                        key={habit.id}
                        habit={habit}
                        onToggle={handleToggle}
                        onEdit={own ? (h) => setEditingHabit(h as Habit) : undefined}
                        onViewDetail={!own ? (h) => setViewingPartnerHabit({ habit: h as Habit, ownerName }) : undefined}
                        streak={streak}
                        isViewingPartner={!own}
                        onNudge={!own && habit.ownerUserId ? () => sendNudge(habit.label, habit.id, habit.ownerUserId!, ownerName) : undefined}
                        nudgeLabel={!own && habit.ownerUserId ? `Nudge ${ownerName}` : undefined}
                        showNotShared={own ? shouldShowNotShared(habit) : false}
                      />
                    );
                  })}
                </div>
              ) : null}
            </section>
          );
        })
      )}

      <HabitEditModal
        habit={editingHabit}
        open={!!editingHabit}
        onClose={() => setEditingHabit(null)}
      />

      <PartnerHabitDetailModal
        habit={viewingPartnerHabit?.habit || null}
        ownerName={viewingPartnerHabit?.ownerName || ""}
        open={!!viewingPartnerHabit}
        onClose={() => setViewingPartnerHabit(null)}
      />

      {/* Duplicate habit confirmation */}
      <AlertDialog open={!!duplicateConfirm} onOpenChange={(open) => { if (!open) setDuplicateConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Already have this routine</AlertDialogTitle>
            <AlertDialogDescription>
              You already have "{duplicateConfirm?.existingName}" in this section. Are you sure you want to add it again?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDuplicateConfirm(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doAddHabit}>Add Anyway</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

// ── Add Habit Form with Context Selector ──
const AddHabitForm = ({
  value, onChange, onSubmit, selectedContexts, onChangeContexts, placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  selectedContexts: string[];
  onChangeContexts: (contexts: string[]) => void;
  placeholder: string;
}) => (
  <div className="space-y-2 mb-3">
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && onSubmit()}
      placeholder={placeholder}
      className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none placeholder:text-muted-foreground"
      autoFocus
    />
    <HabitContextSelector
      selectedContexts={selectedContexts}
      onChangeContexts={onChangeContexts}
    />
    <button onClick={onSubmit} className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium">
      Add
    </button>
  </div>
);

interface HabitRowProps {
  habit: { id: string; label: string; done: boolean; groupId?: string | null; category: string; sharedGroupIds?: string[] };
  onToggle: (id: string) => void;
  onEdit?: (habit: { id: string; label: string; groupId?: string | null; category: string }) => void;
  onViewDetail?: (habit: { id: string; label: string; groupId?: string | null; category: string }) => void;
  streak: number;
  isViewingPartner: boolean;
  onNudge?: () => void;
  nudgeLabel?: string;
  showNotShared?: boolean;
}

const HabitRow = ({ habit, onToggle, onEdit, onViewDetail, streak, isViewingPartner, onNudge, nudgeLabel, showNotShared }: HabitRowProps) => {
  const handleCircleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isViewingPartner) onToggle(habit.id);
  };

  const handleCardClick = () => {
    if (isViewingPartner) {
      onViewDetail?.(habit);
      return;
    }
    onEdit?.(habit);
  };

  return (
    <div className="w-full">
      <div
        onClick={handleCardClick}
        className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
          habit.done ? "border-habit-green bg-habit-green/5 opacity-50" : "border-border bg-card"
        } ${isViewingPartner ? "cursor-pointer active:scale-[0.98]" : "active:scale-[0.98] cursor-pointer"}`}
      >
        <button
          onClick={handleCircleClick}
          disabled={isViewingPartner}
          className="w-11 h-11 -m-2.5 flex items-center justify-center flex-shrink-0 rounded-full"
          aria-label={habit.done ? "Mark incomplete" : "Mark complete"}
        >
          {habit.done ? (
            <span className="w-[22px] h-[22px] rounded-full bg-habit-green flex items-center justify-center">
              <Check size={12} className="text-primary-foreground" />
            </span>
          ) : (
            <span className="w-[22px] h-[22px] rounded-full border-2 border-muted" />
          )}
        </button>
        <span className={`flex-1 text-left text-[13px] font-medium ${habit.done ? "line-through" : ""}`}>{habit.label}</span>
        {showNotShared && (
          <span className="flex items-center gap-1 text-muted-foreground/60 flex-shrink-0" title="Only visible to you in this group. Tap Edit to share.">
            <EyeOff size={13} />
            <span className="text-[10px] font-medium hidden sm:inline">Only you</span>
          </span>
        )}
        <GroupBadge groupId={habit.groupId} />
        {streak >= 1 && (
          <div className="flex items-center gap-0.5 text-accent flex-shrink-0">
            <span className="text-xs">🔥</span>
            <span className="text-xs font-bold">{streak}d</span>
          </div>
        )}
      </div>
      {onNudge && !habit.done && (
        <div className="flex items-center justify-end ml-10 mt-1 mb-1">
          <button
            onClick={onNudge}
            className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 text-primary text-[11px] font-semibold hover:bg-primary/20 transition-colors"
          >
            <Bell size={10} />
            {nudgeLabel || "Nudge"}
          </button>
        </div>
      )}
    </div>
  );
};

export default HabitsPage;
