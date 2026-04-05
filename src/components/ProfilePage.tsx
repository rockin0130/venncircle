import { useState, useEffect, useMemo } from "react";
import { Search, Info, MoreHorizontal, Plus, Dumbbell, Heart, Shield, Apple, ShoppingCart, Star, Pencil } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useAppContext } from "@/context/AppContext";
import { supabase } from "@/integrations/supabase/client";
import EditProfileModal from "@/components/EditProfileModal";
import AddFriendModal from "@/components/AddFriendModal";
import { useFriendships } from "@/hooks/useFriendships";

interface ProfilePageProps {
  onNavigate?: (tab: string) => void;
  onOpenSettings?: () => void;
  onOpenMore?: () => void;
}

/* ─── activity helpers ─── */
interface ActivityItem {
  id: string;
  type: "workout" | "habits" | "nutrition" | "sobriety" | "specialday" | "shopping";
  title: string;
  detail: string;
  group?: string;
  timestamp: Date;
}

const FEATURE_COLORS: Record<ActivityItem["type"], { bg: string; text: string }> = {
  workout:    { bg: "#EEF4FF", text: "#3B82F6" },
  habits:     { bg: "#ECFDF5", text: "#10B981" },
  nutrition:  { bg: "#FFF7ED", text: "#F97316" },
  sobriety:   { bg: "#ECFDF5", text: "#10B981" },
  specialday: { bg: "#FDF2F8", text: "#EC4899" },
  shopping:   { bg: "#F5F3FF", text: "#6C47FF" },
};

const FEATURE_ICONS: Record<ActivityItem["type"], typeof Dumbbell> = {
  workout: Dumbbell,
  habits: Heart,
  nutrition: Apple,
  sobriety: Shield,
  specialday: Star,
  shopping: ShoppingCart,
};

const USER_COLORS = [
  "#6C47FF", "#3B82F6", "#10B981", "#F97316", "#EC4899",
  "#8B5CF6", "#14B8A6", "#EF4444", "#F59E0B", "#6366F1",
];

function hashColor(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (hash << 5) - hash + str.charCodeAt(i);
  return USER_COLORS[Math.abs(hash) % USER_COLORS.length];
}

function timeAgo(date: Date) {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const ProfilePage = ({ onNavigate, onOpenSettings, onOpenMore }: ProfilePageProps) => {
  const { profile, user, groups } = useAuth();
  const { habits, workouts, getHabitStreak } = useAppContext();
  const { activeFriends } = useFriendships();
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showAddFriend, setShowAddFriend] = useState(false);

  // ─── Sobriety data ───
  const [sobrietyDays, setSobrietyDays] = useState<number | null>(null);
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("sobriety_categories")
        .select("start_date")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1);
      if (data && data.length > 0) {
        const start = new Date(data[0].start_date);
        const diff = Math.floor((Date.now() - start.getTime()) / 86400000);
        setSobrietyDays(Math.max(0, diff));
      }
    })();
  }, [user]);

  // ─── Activity feed ───
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);
  useEffect(() => {
    if (!user) return;
    const items: ActivityItem[] = [];

    // completed workouts
    workouts
      .filter((w) => w.done && w.completedDate)
      .forEach((w) => {
        const g = w.groupId ? groups.find((gr) => gr.id === w.groupId) : null;
        items.push({
          id: `w-${w.id}`,
          type: "workout",
          title: `Completed ${w.title}`,
          detail: [w.duration, w.cal ? `${w.cal} cal` : ""].filter(Boolean).join(" · ") || "Workout done",
          group: g ? g.name : "Personal",
          timestamp: new Date(w.completedDate!),
        });
      });

    // habits with streaks
    habits
      .filter((h) => h.done)
      .forEach((h) => {
        const streak = getHabitStreak(h.id);
        items.push({
          id: `h-${h.id}`,
          type: "habits",
          title: `${h.label} ✓`,
          detail: streak > 1 ? `${streak}-day streak` : "Completed today",
          group: "Personal",
          timestamp: new Date(),
        });
      });

    // Sort by timestamp desc, take 4
    items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    setRecentActivity(items.slice(0, 4));
  }, [user, workouts, habits, groups, getHabitStreak]);

  // ─── Stats computation ───
  const bestStreak = useMemo(() => {
    if (habits.length === 0) return 0;
    return Math.max(0, ...habits.map((h) => getHabitStreak(h.id)));
  }, [habits, getHabitStreak]);

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoStr = weekAgo.toISOString().slice(0, 10);
  const workoutsThisWeek = workouts.filter(
    (w) => w.done && w.completedDate && w.completedDate >= weekAgoStr
  ).length;

  const hasHabits = habits.length > 0;
  const hasWorkouts = workouts.some((w) => w.done);
  const hasSobriety = sobrietyDays !== null;

  const initial = profile?.display_name?.charAt(0)?.toUpperCase() || "?";
  const avatarColor = user?.id ? hashColor(user.id) : "#6C47FF";

  // Shared groups per friend
  const friendGroupMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const f of activeFriends) {
      if (!f.friend) continue;
      const shared = groups
        .filter((g) => g.members?.some((m: any) => m.user_id === f.friend!.id))
        .map((g) => g.name);
      map[f.friend.id] = shared;
    }
    return map;
  }, [activeFriends, groups]);

  return (
    <div className="px-4 pb-28" style={{ background: "#F4F3F0" }}>
      {/* ─── Header ─── */}
      <header className="pt-12 pb-4 flex items-center justify-between">
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1A1A1A", fontFamily: "'DM Sans', sans-serif" }}>
          Profile
        </h1>
        <div className="flex items-center gap-1.5">
          <button
            className="w-[30px] h-[30px] rounded-full flex items-center justify-center"
            style={{ background: "#F4F3F0" }}
            aria-label="Search"
          >
            <Search size={15} color="#888" />
          </button>
          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              className="w-[30px] h-[30px] rounded-full flex items-center justify-center"
              style={{ background: "#F4F3F0" }}
              aria-label="Settings"
            >
              <Info size={15} color="#888" />
            </button>
          )}
          {onOpenMore && (
            <button
              onClick={onOpenMore}
              className="w-[30px] h-[30px] rounded-full flex items-center justify-center"
              style={{ background: "#F4F3F0" }}
              aria-label="More"
            >
              <MoreHorizontal size={15} color="#888" />
            </button>
          )}
        </div>
      </header>

      {/* ─── 1. Identity Card ─── */}
      <div
        className="mb-4 flex flex-col items-center py-6 px-4"
        style={{ background: "#fff", borderRadius: 16, border: "0.5px solid rgba(0,0,0,0.07)" }}
      >
        <div className="relative mb-3">
          <div
            className="w-[76px] h-[76px] rounded-full flex items-center justify-center text-white text-2xl font-semibold overflow-hidden"
            style={{ background: avatarColor }}
          >
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              initial
            )}
          </div>
          <button
            onClick={() => setShowEditProfile(true)}
            className="absolute -bottom-0.5 -right-0.5 w-[22px] h-[22px] rounded-full flex items-center justify-center"
            style={{ background: "#222", border: "2px solid #fff" }}
            aria-label="Edit photo"
          >
            <Pencil size={10} color="#fff" />
          </button>
        </div>
        <p style={{ fontSize: 18, fontWeight: 500, color: "#1A1A1A", fontFamily: "'DM Sans', sans-serif" }}>
          {profile?.display_name || "You"}
        </p>
        {(profile as any)?.username && (
          <p style={{ fontSize: 13, color: "#999", marginTop: 2 }}>
            @{(profile as any).username}
          </p>
        )}
        <button
          onClick={() => setShowEditProfile(true)}
          className="mt-3 px-5 py-1.5"
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: "#666",
            background: "#F4F3F0",
            borderRadius: 100,
            border: "0.5px solid rgba(0,0,0,0.07)",
          }}
        >
          Edit profile
        </button>
      </div>

      {/* ─── 2. Stats Row ─── */}
      {(hasHabits || hasWorkouts || hasSobriety) && (
        <div className="grid gap-2.5 mb-4" style={{ gridTemplateColumns: `repeat(${[hasHabits, hasWorkouts, hasSobriety].filter(Boolean).length}, 1fr)` }}>
          {hasHabits && (
            <div style={{ background: "#fff", borderRadius: 16, border: "0.5px solid rgba(0,0,0,0.07)", padding: "14px 12px" }}>
              <div
                className="w-[26px] h-[26px] rounded-lg flex items-center justify-center mb-2"
                style={{ background: "#FFF7ED" }}
              >
                <Heart size={13} color="#F97316" />
              </div>
              <p style={{ fontSize: 22, fontWeight: 500, color: "#1A1A1A", lineHeight: 1.1 }}>{bestStreak}</p>
              <p style={{ fontSize: 10, color: "#999", marginTop: 2 }}>Habit streak</p>
              <div
                className="mt-2 inline-flex px-2 py-0.5 rounded-full"
                style={{ background: "#FFF7ED", fontSize: 9, fontWeight: 600, color: "#F97316" }}
              >
                Best {bestStreak}d
              </div>
            </div>
          )}
          {hasWorkouts && (
            <div style={{ background: "#fff", borderRadius: 16, border: "0.5px solid rgba(0,0,0,0.07)", padding: "14px 12px" }}>
              <div
                className="w-[26px] h-[26px] rounded-lg flex items-center justify-center mb-2"
                style={{ background: "#EEF4FF" }}
              >
                <Dumbbell size={13} color="#3B82F6" />
              </div>
              <p style={{ fontSize: 22, fontWeight: 500, color: "#1A1A1A", lineHeight: 1.1 }}>{workoutsThisWeek}</p>
              <p style={{ fontSize: 10, color: "#999", marginTop: 2 }}>Workouts</p>
              <div
                className="mt-2 inline-flex px-2 py-0.5 rounded-full"
                style={{ background: "#EEF4FF", fontSize: 9, fontWeight: 600, color: "#3B82F6" }}
              >
                This week
              </div>
            </div>
          )}
          {hasSobriety && sobrietyDays !== null && (
            <div style={{ background: "#fff", borderRadius: 16, border: "0.5px solid rgba(0,0,0,0.07)", padding: "14px 12px" }}>
              <div
                className="w-[26px] h-[26px] rounded-lg flex items-center justify-center mb-2"
                style={{ background: "#ECFDF5" }}
              >
                <Shield size={13} color="#10B981" />
              </div>
              <p style={{ fontSize: 22, fontWeight: 500, color: "#1A1A1A", lineHeight: 1.1 }}>{sobrietyDays}</p>
              <p style={{ fontSize: 10, color: "#999", marginTop: 2 }}>Sober days</p>
              <div
                className="mt-2 inline-flex px-2 py-0.5 rounded-full"
                style={{ background: "#ECFDF5", fontSize: 9, fontWeight: 600, color: "#10B981" }}
              >
                On track
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── 3. Friends Section ─── */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2 px-0.5">
          <p style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A" }}>Friends</p>
          <button
            onClick={() => onNavigate?.("launcher")}
            style={{ fontSize: 12, fontWeight: 500, color: "#6C47FF" }}
          >
            See all
          </button>
        </div>
        <div style={{ background: "#fff", borderRadius: 16, border: "0.5px solid rgba(0,0,0,0.07)", overflow: "hidden" }}>
          {activeFriends.slice(0, 5).map((f, i) => {
            if (!f.friend) return null;
            const fInitial = f.friend.display_name?.charAt(0)?.toUpperCase() || "?";
            const fColor = hashColor(f.friend.id);
            const sharedGroups = friendGroupMap[f.friend.id] || [];
            return (
              <div
                key={f.id}
                className="flex items-center gap-3 px-4 py-3"
                style={{ borderTop: i > 0 ? "0.5px solid rgba(0,0,0,0.05)" : "none" }}
              >
                <div className="relative">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-semibold overflow-hidden"
                    style={{ background: fColor }}
                  >
                    {f.friend.avatar_url ? (
                      <img src={f.friend.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      fInitial
                    )}
                  </div>
                  <div
                    className="absolute -bottom-0.5 -right-0.5 w-[9px] h-[9px] rounded-full"
                    style={{ background: "#10B981", border: "1.5px solid #fff" }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p style={{ fontSize: 13, fontWeight: 500, color: "#1A1A1A" }} className="truncate">
                    {f.friend.display_name}
                  </p>
                  {sharedGroups.length > 0 && (
                    <p style={{ fontSize: 11, color: "#999" }} className="truncate">
                      {sharedGroups.join(", ")}
                    </p>
                  )}
                </div>
              </div>
            );
          })}

          {/* Add a friend row */}
          <button
            onClick={() => setShowAddFriend(true)}
            className="flex items-center gap-3 px-4 py-3 w-full"
            style={{ borderTop: activeFriends.length > 0 ? "0.5px solid rgba(0,0,0,0.05)" : "none" }}
          >
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{ background: "#F4F3F0" }}
            >
              <Plus size={16} color="#999" />
            </div>
            <p style={{ fontSize: 13, fontWeight: 500, color: "#999" }}>Add a friend</p>
          </button>
        </div>
      </div>

      {/* ─── 4. My Activity Section ─── */}
      {recentActivity.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2 px-0.5">
            <p style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A" }}>My activity</p>
            <button style={{ fontSize: 12, fontWeight: 500, color: "#6C47FF" }}>
              See all
            </button>
          </div>
          <div style={{ background: "#fff", borderRadius: 16, border: "0.5px solid rgba(0,0,0,0.07)", overflow: "hidden" }}>
            {recentActivity.map((item, i) => {
              const colors = FEATURE_COLORS[item.type];
              const Icon = FEATURE_ICONS[item.type];
              return (
                <div
                  key={item.id}
                  className="flex items-start gap-3 px-4 py-3"
                  style={{ borderTop: i > 0 ? "0.5px solid rgba(0,0,0,0.05)" : "none" }}
                >
                  <div
                    className="w-8 h-8 rounded-[10px] flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: colors.bg }}
                  >
                    <Icon size={14} color={colors.text} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p style={{ fontSize: 13, fontWeight: 500, color: "#1A1A1A" }} className="truncate">
                      {item.title}
                    </p>
                    <p style={{ fontSize: 11, color: "#999" }} className="truncate">{item.detail}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span
                        className="inline-flex px-2 py-0.5 rounded-full"
                        style={{ fontSize: 9, fontWeight: 600, color: colors.text, background: colors.bg }}
                      >
                        {item.group || "Personal"}
                      </span>
                      <span style={{ fontSize: 10, color: "#bbb" }}>{timeAgo(item.timestamp)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <EditProfileModal open={showEditProfile} onOpenChange={setShowEditProfile} />
      <AddFriendModal open={showAddFriend} onOpenChange={setShowAddFriend} />
    </div>
  );
};

export default ProfilePage;
