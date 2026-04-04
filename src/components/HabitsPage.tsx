import { useState, useEffect, useMemo } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import GroupBadge from "@/components/GroupBadge";
import { Plus, Flame, Check, Bell, Settings, Droplets, Eye, EyeOff, Circle, Minus } from "lucide-react";
import { useAppContext } from "@/context/AppContext";
import { useAuth, GroupMember } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import WaterGaugeCircle from "@/components/WaterGaugeCircle";
import DraggableWaterGauge from "@/components/DraggableWaterGauge";
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

const HabitsPage = ({ onOpenSettings }: { onOpenSettings?: () => void } = {}) => {
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

  const [waterDisplayMode, setWaterDisplayMode] = useState<"circular" | "bar">(() => {
    return (localStorage.getItem("water_display_mode") as "circular" | "bar") || "circular";
  });

  const [editingWaterGoal, setEditingWaterGoal] = useState(false);
  const [customGoalInput, setCustomGoalInput] = useState("");

  const isPersonalActive = (activeGroup as any)?._personal === true;
  const isAllActive = activeGroup === null && !isPersonalActive;
  const isGroupActive = !!activeGroup && !isPersonalActive;

  const isEveryoneSelected = selectedUserIds.has(EVERYONE_SENTINEL);

  // Build the list of displayable users (same logic as HabitUserFilter)
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

  // All habits (own)
  const displayHabits = useMemo(() => {
    if (isPersonalActive || isAllActive) return filteredHabits;
    if (isEveryoneSelected) return filteredHabits;
    // For own habits, ownerUserId may be undefined — treat as current user
    const myId = user?.id;
    return filteredHabits.filter((h) => {
      const ownerId = h.ownerUserId || myId;
      return ownerId && selectedUserIds.has(ownerId);
    });
  }, [filteredHabits, isPersonalActive, isAllActive, isEveryoneSelected, selectedUserIds, user]);

  // Partner habits in group and All views
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

  // Determine if a habit should show the "not shared" indicator
  const shouldShowNotShared = (habit: Habit) => {
    if (!isGroupActive || !activeGroup) return false; // Only in group views
    if (!isOwnHabit(habit)) return false; // Only for own habits
    const sharedIds = habit.sharedGroupIds || [];
    return !sharedIds.includes(activeGroup.id);
  };

  // Toggle water visibility
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

  // Normalize name for duplicate matching: lowercase, strip spaces/punctuation
  const normalizeName = (name: string) => name.toLowerCase().replace(/[\s\-_.,:;!?'"]/g, "").trim();

  const handleAdd = async () => {
    if (!newHabitLabel.trim() || !addingToSection) return;
    const normalizedNew = normalizeName(newHabitLabel.trim());

    // Check for duplicate in the same section across all contexts
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
    toast.success(`Habit "${newHabitLabel.trim()}" added!`);
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

  // Helper to get the owner display name for a habit
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
      // Get this user's water data
      const userWaterIntake = isMe ? waterIntake : (partnerWaterMap.get(u.id)?.intake ?? 0);
      const userWaterGoal = isMe ? waterGoal : (partnerWaterMap.get(u.id)?.goal ?? 3);
      const waterDone = showWater && userWaterIntake >= userWaterGoal;
      const totalWithWater = total + (showWater ? 1 : 0);
      const doneWithWater = done + (showWater && waterDone ? 1 : 0);
      return { ...u, done: doneWithWater, total: totalWithWater, percent: totalWithWater > 0 ? Math.round((doneWithWater / totalWithWater) * 100) : 0 };
    });
  }, [selectedUsers, habitsPerUser, user, showWater, waterIntake, waterGoal, partnerWaterMap]);

  // Is the user viewing only their own data (single user = me, or personal)?
  const isMineOnly = selectedUsers.length === 1 && selectedUsers[0].id === user?.id;

  // ── MAIN VIEW ──
  return (
    <div className="px-5">

      <header className="pt-12 pb-4 flex items-start justify-between">
        <div>
          <h1 className="text-[1.75rem] font-bold tracking-display">Habits</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Build a better routine, one day at a time</p>
        </div>
        {onOpenSettings && (
          <button onClick={onOpenSettings} className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors mt-1" aria-label="Settings">
            <Settings size={18} />
          </button>
        )}
      </header>

      <PageGroupSelector page="habits" personalLabel="Mine" hideAllPill />

      <HabitUserFilter
        selectedUserIds={selectedUserIds}
        onSelectionChange={setSelectedUserIds}
      />

      {/* ── Progress Card ── */}
      <div className="bg-card rounded-xl p-5 border border-border shadow-card mb-6">
        {isMultiUser ? (
          <>
            <p className="text-xs text-muted-foreground font-medium mb-3">Today's Progress</p>
            <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(progressPerUser.length, 4)}, 1fr)` }}>
              {progressPerUser.map((pu) => (
                <div key={pu.id} className="flex flex-col items-center text-center">
                  {pu.avatarUrl ? (
                    <img src={pu.avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover mb-1" />
                  ) : (
                    <span className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center text-[11px] font-bold text-primary mb-1">{pu.initial}</span>
                  )}
                  <span className="text-[11px] font-medium text-muted-foreground truncate w-full">{pu.label}</span>
                  <span className="text-lg font-bold tracking-display mt-0.5">{pu.done}/{pu.total}</span>
                  <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden mt-1">
                    <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pu.percent}%` }} />
                  </div>
                  <span className="text-[10px] text-muted-foreground mt-0.5">{pu.percent}%</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Today's Progress</p>
                <p className="text-3xl font-bold tracking-display mt-1">{progressPerUser[0]?.done || 0}/{progressPerUser[0]?.total || 0}</p>
              </div>
              <span className="text-4xl">🌱</span>
            </div>
            <div className="mt-3 h-2 bg-secondary rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progressPerUser[0]?.percent || 0}%` }} />
            </div>
            <p className="text-xs text-muted-foreground mt-2 text-center">{progressPerUser[0]?.percent || 0}% Complete</p>
          </>
        )}
      </div>

      {/* ── Water Intake ── */}
      {showWater && (
        <section className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold tracking-display flex items-center gap-2">
              <Droplets size={20} className="text-primary" /> Water Intake
            </h2>
            <div className="flex items-center gap-1">
              {isMineOnly && (
                <>
                  {[2, 2.5, 3, 3.5, 4].map((g) => (
                    <button key={g} onClick={() => { setWaterGoal(g); setEditingWaterGoal(false); }}
                      className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition-all ${waterGoal === g && !editingWaterGoal ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}
                    >{g}L</button>
                  ))}
                  {!editingWaterGoal ? (
                    <button onClick={() => { setCustomGoalInput(String(waterGoal)); setEditingWaterGoal(true); }}
                      className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition-all ${![2, 2.5, 3, 3.5, 4].includes(waterGoal) ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}
                    >{![2, 2.5, 3, 3.5, 4].includes(waterGoal) ? `${waterGoal}L` : "Custom"}</button>
                  ) : (
                    <div className="flex items-center gap-1">
                      <input type="number" value={customGoalInput} onChange={(e) => setCustomGoalInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") saveCustomGoal(); if (e.key === "Escape") setEditingWaterGoal(false); }}
                        className="w-14 bg-secondary rounded-lg px-2 py-1 text-[10px] text-center outline-none text-foreground border border-border"
                        step="0.1" min="0.5" max="10" autoFocus />
                      <span className="text-[10px] text-muted-foreground">L</span>
                      <button onClick={saveCustomGoal} className="text-[10px] text-primary font-semibold">Set</button>
                    </div>
                  )}
                </>
              )}
              <button onClick={toggleWaterVisibility}
                className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                title="Hide water intake"
              ><EyeOff size={14} /></button>
            </div>
          </div>

          {isMultiUser ? (
            /* Multi-user: side by side circular gauges */
            <div className="bg-card rounded-xl p-5 border border-border shadow-card">
              <div className="flex justify-center gap-6 flex-wrap">
                {selectedUsers.map((su) => {
                  const isMe = su.id === user?.id;
                  const intake = isMe ? waterIntake : (partnerWaterMap.get(su.id)?.intake ?? 0);
                  const goal = isMe ? waterGoal : (partnerWaterMap.get(su.id)?.goal ?? 3);
                  return (
                    <WaterGaugeCircle key={su.id} intake={intake} goal={goal} label={su.label} />
                  );
                })}
              </div>
              {/* Quick add buttons only for own user when mine is selected */}
              {selectedUsers.some((su) => su.id === user?.id) && (
                <div className="flex gap-2 w-full mt-4">
                  {[0.25, 0.5].map((amt) => (
                    <button key={amt} onClick={() => setWaterIntake(Math.min(waterIntake + amt, waterGoal + 1))}
                      className="flex-1 py-2 bg-primary/10 text-primary rounded-lg text-xs font-bold active:scale-[0.97] transition-transform"
                    >+{amt * 1000}ml</button>
                  ))}
                  <button onClick={resetWater}
                    className="py-2 px-3 bg-secondary text-muted-foreground rounded-lg text-xs font-medium active:scale-[0.97] transition-transform"
                  >Reset</button>
                </div>
              )}
            </div>
          ) : (
            /* Single user: full interactive water section for own user, read-only for others */
            isMineOnly ? (
              <div className="bg-card rounded-xl p-5 border border-border shadow-card flex flex-col items-center overflow-visible">
                <div className="flex gap-1 bg-secondary rounded-lg p-0.5 mb-4 self-center">
                  <button onClick={() => { setWaterDisplayMode("circular"); localStorage.setItem("water_display_mode", "circular"); }}
                    className={`px-3 py-1 rounded-md text-[10px] font-semibold transition-all ${waterDisplayMode === "circular" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
                  ><Circle size={10} className="inline mr-1" />Circular</button>
                  <button onClick={() => { setWaterDisplayMode("bar"); localStorage.setItem("water_display_mode", "bar"); }}
                    className={`px-3 py-1 rounded-md text-[10px] font-semibold transition-all ${waterDisplayMode === "bar" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
                  ><Minus size={10} className="inline mr-1" />Bar</button>
                </div>
                {waterDisplayMode === "circular" ? (
                  <>
                    <DraggableWaterGauge intake={waterIntake} goal={waterGoal} onIntakeChange={setWaterIntake} size={140} strokeWidth={10} />
                    <span className="text-xs font-semibold text-primary mb-3">
                      {waterIntake >= waterGoal ? "Goal reached!" : `${Math.round((waterIntake / waterGoal) * 100)}%`}
                    </span>
                  </>
                ) : (
                  <DraggableWaterBar intake={waterIntake} goal={waterGoal} onIntakeChange={setWaterIntake} />
                )}
                <div className="flex gap-2 w-full">
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
            ) : (
              /* Read-only water gauge for viewing another user */
              <div className="bg-card rounded-xl p-5 border border-border shadow-card flex flex-col items-center">
                {(() => {
                  const su = selectedUsers[0];
                  const intake = partnerWaterMap.get(su.id)?.intake ?? 0;
                  const goal = partnerWaterMap.get(su.id)?.goal ?? 3;
                  return <WaterGaugeCircle intake={intake} goal={goal} label={su.label} />;
                })()}
              </div>
            )
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
        /* Multi-user: stacked per user */
        selectedUsers.map((su, idx) => {
          const userHabits = habitsPerUser.get(su.id) || [];
          const isMe = su.id === user?.id;

          return (
            <div key={su.id} className={idx > 0 ? "mt-6 pt-5 border-t border-border" : ""}>
              {/* User header */}
              <div className="flex items-center gap-2 mb-3">
                {su.avatarUrl ? (
                  <img src={su.avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover" />
                ) : (
                  <span className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center text-[10px] font-bold text-primary">{su.initial}</span>
                )}
                <span className="text-sm font-semibold">{su.label}'s Habits</span>
              </div>

              {userHabits.length === 0 ? (
                <p className="text-sm text-muted-foreground italic ml-8 mb-4">No habits yet</p>
              ) : (
                DEFAULT_SECTIONS.map((section) => {
                  const sectionHabits = getSectionHabits(section.key, userHabits);
                  if (sectionHabits.length === 0) return null;
                  const sectionCompleted = sectionHabits.filter((h) => h.done).length;

                  return (
                    <section key={section.key} className="mb-4 ml-2">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className="text-sm">{section.icon}</span>
                        <span className="text-sm font-semibold">{section.label}</span>
                        <span className="text-[11px] text-muted-foreground font-normal ml-1">{sectionCompleted}/{sectionHabits.length}</span>
                      </div>
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
                    </section>
                  );
                })
              )}
            </div>
          );
        })
      ) : (
        /* Single user: standard layout with add buttons and all sections shown for mine/personal */
        DEFAULT_SECTIONS.map((section) => {
          const sectionHabits = getSectionHabits(section.key, allDisplayHabits);
          const sectionCompleted = sectionHabits.filter((h) => h.done).length;
          const isAdding = addingToSection === section.key;
          const showEmptySection = isMineOnly || isPersonalActive;

          // In single-user non-mine view, hide empty sections
          if (sectionHabits.length === 0 && !showEmptySection) return null;

          return (
            <section key={section.key} className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-base font-semibold tracking-display flex items-center gap-1.5">
                  <span>{section.icon}</span>
                  <span>{section.label}</span>
                  {sectionHabits.length > 0 && (
                    <span className="text-[11px] text-muted-foreground font-normal ml-1">{sectionCompleted}/{sectionHabits.length}</span>
                  )}
                </h2>
                {(isMineOnly || isPersonalActive) && (
                  <button onClick={() => setAddingToSection(isAdding ? null : section.key)}
                    className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary hover:bg-primary/20 transition-colors"
                  ><Plus size={14} /></button>
                )}
              </div>

              {isAdding && (
                <AddHabitForm
                  value={newHabitLabel}
                  onChange={setNewHabitLabel}
                  onSubmit={handleAdd}
                  selectedContexts={selectedContexts}
                  onChangeContexts={setSelectedContexts}
                  placeholder={`Add ${section.label.toLowerCase()} habit...`}
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
            <AlertDialogTitle>Already have this habit</AlertDialogTitle>
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
          habit.done ? "border-habit-green bg-habit-green/5" : "border-border bg-card"
        } ${isViewingPartner ? "opacity-80 cursor-pointer active:scale-[0.98]" : "active:scale-[0.98] cursor-pointer"}`}
      >
        <button
          onClick={handleCircleClick}
          disabled={isViewingPartner}
          className="w-11 h-11 -m-2.5 flex items-center justify-center flex-shrink-0 rounded-full"
          aria-label={habit.done ? "Mark incomplete" : "Mark complete"}
        >
          {habit.done ? (
            <span className="w-6 h-6 rounded-full bg-habit-green flex items-center justify-center">
              <Check size={14} className="text-primary-foreground" />
            </span>
          ) : (
            <span className="w-6 h-6 rounded-full border-2 border-muted" />
          )}
        </button>
        <span className={`flex-1 text-left text-sm font-medium ${habit.done ? "line-through opacity-50" : ""}`}>{habit.label}</span>
        {showNotShared && (
          <span className="flex items-center gap-1 text-muted-foreground/60 flex-shrink-0" title="Only visible to you in this group. Tap Edit to share.">
            <EyeOff size={13} />
            <span className="text-[10px] font-medium hidden sm:inline">Only you</span>
          </span>
        )}
        <GroupBadge groupId={habit.groupId} />
        <div className="flex items-center gap-1 text-accent">
          <Flame size={12} />
          <span className="text-xs font-bold">{streak}d</span>
        </div>
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
