import { useState, useEffect, useMemo, useRef } from "react";
import {
  MoreHorizontal,
  Dumbbell,
  Heart,
  Shield,
  Apple,
  ShoppingCart,
  Star,
  Camera,
  X,
  Settings,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useAppContext } from "@/context/AppContext";
import { supabase } from "@/integrations/supabase/client";
import EditProfileModal from "@/components/EditProfileModal";
import AddFriendModal from "@/components/AddFriendModal";
import { useFriendships } from "@/hooks/useFriendships";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths } from "date-fns";

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
  workout: { bg: "#EEF4FF", text: "#3B82F6" },
  habits: { bg: "#ECFDF5", text: "#10B981" },
  nutrition: { bg: "#FFF7ED", text: "#F97316" },
  sobriety: { bg: "#ECFDF5", text: "#10B981" },
  specialday: { bg: "#FDF2F8", text: "#EC4899" },
  shopping: { bg: "#F5F3FF", text: "#6C47FF" },
};

const FEATURE_ICONS: Record<ActivityItem["type"], typeof Dumbbell> = {
  workout: Dumbbell,
  habits: Heart,
  nutrition: Apple,
  sobriety: Shield,
  specialday: Star,
  shopping: ShoppingCart,
};

const FEATURE_EMOJI: Record<ActivityItem["type"], string> = {
  workout: "🏋️",
  habits: "✅",
  nutrition: "🍎",
  sobriety: "⏰",
  specialday: "⭐",
  shopping: "🛒",
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

const cardStyle = { background: "#fff", borderRadius: 16, border: "0.5px solid rgba(0,0,0,0.07)" } as const;

const ProfilePage = ({ onNavigate, onOpenSettings, onOpenMore }: ProfilePageProps) => {
  const { profile, user, groups, signOut, refreshProfile } = useAuth();
  const { habits, workouts, getHabitStreak } = useAppContext();
  const { activeFriends } = useFriendships();

  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [showFriendsSheet, setShowFriendsSheet] = useState(false);
  const [showPhotoSheet, setShowPhotoSheet] = useState(false);
  const [showCropEditor, setShowCropEditor] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [cropScale, setCropScale] = useState(1);
  const [cropOffset, setCropOffset] = useState({ x: 0, y: 0 });
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const cropContainerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const pinchRef = useRef<{ dist0: number; scale0: number } | null>(null);

  // Date picker state
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date());

  const handlePhotoSelected = (file: File) => {
    const url = URL.createObjectURL(file);
    setSelectedFile(file);
    setSelectedImage(url);
    setCropScale(1);
    setCropOffset({ x: 0, y: 0 });
    setShowPhotoSheet(false);
    setShowCropEditor(true);
  };

  const handleCropConfirm = async () => {
    if (!selectedFile || !user) return;
    setUploading(true);
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = rej; img.src = selectedImage!; });
      const canvas = document.createElement("canvas");
      const size = 400;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d")!;
      const imgAspect = img.width / img.height;
      let drawW: number, drawH: number;
      if (imgAspect > 1) { drawH = size / cropScale; drawW = drawH * imgAspect; }
      else { drawW = size / cropScale; drawH = drawW / imgAspect; }
      const dx = (size - drawW) / 2 + cropOffset.x * (size / 300);
      const dy = (size - drawH) / 2 + cropOffset.y * (size / 300);
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(img, dx, dy, drawW, drawH);
      const blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), "image/jpeg", 0.9));
      const path = `avatars/${user.id}/${Date.now()}.jpg`;
      const { error: uploadErr } = await supabase.storage.from("avatars").upload(path, blob, { upsert: true });
      if (uploadErr) throw uploadErr;
      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
      const { error: updateErr } = await supabase.from("profiles").update({ avatar_url: urlData.publicUrl }).eq("id", user.id);
      if (updateErr) throw updateErr;
      await refreshProfile();
      setShowCropEditor(false);
      setSelectedImage(null);
      setSelectedFile(null);
    } catch (e: any) {
      const { toast } = await import("sonner");
      toast.error("Failed to upload photo");
    } finally {
      setUploading(false);
    }
  };

  const handleCropTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchRef.current = { dist0: Math.hypot(dx, dy), scale0: cropScale };
    } else if (e.touches.length === 1) {
      dragRef.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY, origX: cropOffset.x, origY: cropOffset.y };
    }
  };
  const handleCropTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchRef.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const newScale = Math.max(0.5, Math.min(5, pinchRef.current.scale0 * (dist / pinchRef.current.dist0)));
      setCropScale(newScale);
    } else if (e.touches.length === 1 && dragRef.current) {
      const dx = e.touches[0].clientX - dragRef.current.startX;
      const dy = e.touches[0].clientY - dragRef.current.startY;
      setCropOffset({ x: dragRef.current.origX + dx, y: dragRef.current.origY + dy });
    }
  };
  const handleCropTouchEnd = () => { dragRef.current = null; pinchRef.current = null; };

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

  // ─── Activity feed (date-filtered) ───
  const activityForDate = useMemo(() => {
    if (!user) return [];
    const dateStr = format(selectedDate, "yyyy-MM-dd");
    const items: ActivityItem[] = [];

    workouts
      .filter((w) => w.done && w.completedDate && w.completedDate === dateStr)
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

    const todayStr = format(new Date(), "yyyy-MM-dd");
    if (dateStr === todayStr) {
      const doneHabits = habits.filter((h) => h.done);
      if (doneHabits.length > 0) {
        const sections = [...new Set(doneHabits.map(h => h.category || "Other"))];
        items.push({
          id: `h-summary-${dateStr}`,
          type: "habits",
          title: `Completed ${doneHabits.length} habits`,
          detail: sections.join(" · "),
          group: "Personal",
          timestamp: new Date(),
        });
      }
    }

    items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return items;
  }, [user, workouts, habits, groups, selectedDate]);

  // ─── Stats ───
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

  // Friend group map for friends sheet
  const friendGroupMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const f of activeFriends) {
      if (!f.friend) continue;
      const shared = groups
        .filter((g) => g.members?.some((m: { user_id: string }) => m.user_id === f.friend!.id))
        .map((g) => g.name);
      map[f.friend.id] = shared;
    }
    return map;
  }, [activeFriends, groups]);

  // Calendar grid
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(calendarMonth);
    const monthEnd = endOfMonth(calendarMonth);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [calendarMonth]);

  const isToday = isSameDay(selectedDate, new Date());
  const dateLabel = isToday ? "today" : format(selectedDate, "MMM d, yyyy");

  return (
    <div className="px-3 pb-28" style={{ background: "#F4F3F0" }}>
      {/* ─── Header ─── */}
      <header className="pt-12 pb-4 flex items-center justify-between">
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1A1A1A", fontFamily: "'DM Sans', sans-serif" }}>
          Profile
        </h1>
        <div className="flex items-center gap-1.5">
          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              className="w-[30px] h-[30px] rounded-full flex items-center justify-center"
              style={{ background: "#F4F3F0" }}
              aria-label="Settings"
            >
              <Settings size={15} color="#888" />
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

      {/* ─── Profile Card (Instagram-style) ─── */}
      <div className="mb-4 px-1 py-5" style={cardStyle}>
        {/* Top row: photo + name */}
        <div className="flex items-center gap-4 px-4 mb-4">
          <div className="relative shrink-0">
            <div
              className="w-[80px] h-[80px] rounded-full flex items-center justify-center text-white text-2xl font-semibold overflow-hidden"
              style={{ background: avatarColor }}
            >
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                initial
              )}
            </div>
            <button
              onClick={() => setShowPhotoSheet(true)}
              className="absolute -bottom-0.5 -right-0.5 w-[24px] h-[24px] rounded-full flex items-center justify-center"
              style={{ background: "#222", border: "2px solid #fff" }}
              aria-label="Change photo"
            >
              <Camera size={11} color="#fff" />
            </button>
          </div>
          <div className="min-w-0">
            <p style={{ fontSize: 18, fontWeight: 600, color: "#1A1A1A", fontFamily: "'DM Sans', sans-serif" }}>
              {profile?.display_name || "You"}
            </p>
            {(profile as { username?: string })?.username && (
              <p style={{ fontSize: 13, color: "#999", marginTop: 1 }}>@{(profile as { username?: string }).username}</p>
            )}
          </div>
        </div>

        {/* Stats row: Groups | Friends | Rewards */}
        <div className="flex items-center justify-around px-4 mb-4">
          <div className="flex-1 text-center">
            <p style={{ fontSize: 18, fontWeight: 700, color: "#1A1A1A" }}>{groups.length}</p>
            <p style={{ fontSize: 12, color: "#666" }}>Groups</p>
          </div>
          <div style={{ width: 1, height: 28, background: "rgba(0,0,0,0.1)" }} />
          <button className="flex-1 text-center" onClick={() => setShowFriendsSheet(true)}>
            <p style={{ fontSize: 18, fontWeight: 700, color: "#1A1A1A" }}>{activeFriends.length}</p>
            <p style={{ fontSize: 12, color: "#666" }}>Friends</p>
          </button>
          <div style={{ width: 1, height: 28, background: "rgba(0,0,0,0.1)" }} />
          <div className="flex-1 text-center">
            <p style={{ fontSize: 18, fontWeight: 700, color: "#1A1A1A" }}>0</p>
            <p style={{ fontSize: 12, color: "#666" }}>Rewards</p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 px-4">
          <button
            onClick={() => setShowEditProfile(true)}
            className="flex-1 py-2.5 text-center"
            style={{ fontSize: 13, fontWeight: 500, color: "#1A1A1A", borderRadius: 8, border: "1px solid rgba(0,0,0,0.12)", background: "#fff" }}
          >
            Edit profile
          </button>
          <button
            className="flex-1 py-2.5 text-center"
            style={{ fontSize: 13, fontWeight: 500, color: "#1A1A1A", borderRadius: 8, border: "1px solid rgba(0,0,0,0.12)", background: "#fff" }}
          >
            Share profile
          </button>
        </div>
      </div>

      {/* ─── Stats Section ─── */}
      {(hasHabits || hasWorkouts || hasSobriety) && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2 px-1">
            <p style={{ fontSize: 15, fontWeight: 700, color: "#1A1A1A" }}>Stats</p>
            <button style={{ fontSize: 13, fontWeight: 500, color: "#3B82F6" }}>See all</button>
          </div>
          <div
            className="flex gap-2 overflow-x-auto px-1"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none", WebkitOverflowScrolling: "touch" }}
          >
            <style>{`.stats-scroll::-webkit-scrollbar { display: none; }`}</style>
            {hasHabits && (
              <div className="shrink-0" style={{ ...cardStyle, padding: "14px 16px", minWidth: 110 }}>
                <div className="flex justify-center mb-2">
                  <span style={{ fontSize: 20 }}>❤️</span>
                </div>
                <p className="text-center" style={{ fontSize: 24, fontWeight: 700, color: "#1A1A1A", lineHeight: 1.1 }}>{bestStreak}</p>
                <p className="text-center" style={{ fontSize: 11, color: "#888", marginTop: 3 }}>Habit streak</p>
                {bestStreak >= 1 && (
                  <div className="flex justify-center mt-2">
                    <span
                      className="inline-flex px-2 py-0.5 rounded-full"
                      style={{ background: "#FFF7ED", fontSize: 10, fontWeight: 600, color: "#F97316" }}
                    >
                      Best {bestStreak}d
                    </span>
                  </div>
                )}
              </div>
            )}
            {hasWorkouts && (
              <div className="shrink-0" style={{ ...cardStyle, padding: "14px 16px", minWidth: 110 }}>
                <div className="flex justify-center mb-2">
                  <span style={{ fontSize: 20 }}>🏋️</span>
                </div>
                <p className="text-center" style={{ fontSize: 24, fontWeight: 700, color: "#1A1A1A", lineHeight: 1.1 }}>{workoutsThisWeek}</p>
                <p className="text-center" style={{ fontSize: 11, color: "#888", marginTop: 3 }}>Workouts</p>
                <div className="flex justify-center mt-2">
                  <span
                    className="inline-flex px-2 py-0.5 rounded-full"
                    style={{ background: "#EEF4FF", fontSize: 10, fontWeight: 600, color: "#3B82F6" }}
                  >
                    This week
                  </span>
                </div>
              </div>
            )}
            {hasSobriety && sobrietyDays !== null && (
              <div className="shrink-0" style={{ ...cardStyle, padding: "14px 16px", minWidth: 110 }}>
                <div className="flex justify-center mb-2">
                  <span style={{ fontSize: 20 }}>⏰</span>
                </div>
                <p className="text-center" style={{ fontSize: 24, fontWeight: 700, color: "#1A1A1A", lineHeight: 1.1 }}>{sobrietyDays}</p>
                <p className="text-center" style={{ fontSize: 11, color: "#888", marginTop: 3 }}>Sober days</p>
                <div className="flex justify-center mt-2">
                  <span
                    className="inline-flex px-2 py-0.5 rounded-full"
                    style={{ background: "#ECFDF5", fontSize: 10, fontWeight: 600, color: "#10B981" }}
                  >
                    On track
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── My Activity Section ─── */}
      <div className="mb-4">
        <p className="px-1 mb-2" style={{ fontSize: 15, fontWeight: 700, color: "#1A1A1A" }}>My activity</p>

        {/* Date picker row */}
        <div className="flex items-center gap-2 mb-3 px-1 relative">
          <button
            onClick={() => { setShowCalendar(!showCalendar); setCalendarMonth(selectedDate); }}
            className="flex items-center gap-2 px-3 py-2"
            style={{ borderRadius: 20, border: "1px solid rgba(0,0,0,0.12)", background: "#fff", fontSize: 13, fontWeight: 500, color: "#1A1A1A" }}
          >
            <CalendarDays size={14} color="#666" />
            {format(selectedDate, "MMM d, yyyy")}
            <ChevronDown size={14} color="#888" />
          </button>
          {!isToday && (
            <button
              onClick={() => { setSelectedDate(new Date()); setShowCalendar(false); }}
              className="px-3.5 py-2"
              style={{ borderRadius: 20, background: "#7C3AED", color: "#fff", fontSize: 13, fontWeight: 600 }}
            >
              Today
            </button>
          )}
          {isToday && (
            <span
              className="px-3.5 py-2"
              style={{ borderRadius: 20, background: "#7C3AED", color: "#fff", fontSize: 13, fontWeight: 600 }}
            >
              Today
            </span>
          )}
        </div>

        {/* Calendar dropdown */}
        {showCalendar && (
          <div className="mx-1 mb-3 p-3" style={{ ...cardStyle, boxShadow: "0 4px 20px rgba(0,0,0,0.08)" }}>
            <div className="flex items-center justify-between mb-3">
              <button onClick={() => setCalendarMonth(subMonths(calendarMonth, 1))} className="p-1">
                <ChevronLeft size={18} color="#666" />
              </button>
              <p style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A" }}>
                {format(calendarMonth, "MMMM yyyy")}
              </p>
              <button onClick={() => setCalendarMonth(addMonths(calendarMonth, 1))} className="p-1">
                <ChevronRight size={18} color="#666" />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-0">
              {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
                <div key={d} className="text-center py-1" style={{ fontSize: 11, fontWeight: 500, color: "#999" }}>{d}</div>
              ))}
              {calendarDays.map((day) => {
                const inMonth = isSameMonth(day, calendarMonth);
                const isSelected = isSameDay(day, selectedDate);
                const isDayToday = isSameDay(day, new Date());
                return (
                  <button
                    key={day.toISOString()}
                    onClick={() => { setSelectedDate(day); setShowCalendar(false); }}
                    className="flex items-center justify-center py-1.5"
                  >
                    <span
                      className="w-8 h-8 rounded-full flex items-center justify-center"
                      style={{
                        fontSize: 13,
                        fontWeight: isSelected || isDayToday ? 600 : 400,
                        color: isSelected ? "#fff" : !inMonth ? "#ccc" : "#1A1A1A",
                        background: isSelected ? "#7C3AED" : isDayToday ? "rgba(124,58,237,0.1)" : "transparent",
                      }}
                    >
                      {format(day, "d")}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Activity cards */}
        {activityForDate.length > 0 ? (
          <div className="space-y-2 px-1">
            {activityForDate.map((item) => {
              const colors = FEATURE_COLORS[item.type];
              const emoji = FEATURE_EMOJI[item.type];
              return (
                <div key={item.id} className="flex items-center gap-3 px-4 py-3.5" style={cardStyle}>
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: colors.bg }}
                  >
                    <span style={{ fontSize: 18 }}>{emoji}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p style={{ fontSize: 14, fontWeight: 500, color: "#1A1A1A" }} className="truncate">
                      {item.title}
                    </p>
                    <p style={{ fontSize: 12, color: "#999" }} className="truncate">
                      {item.detail}
                    </p>
                  </div>
                  {item.group && item.group !== "Personal" && (
                    <span
                      className="shrink-0 px-2 py-0.5 rounded-full"
                      style={{ fontSize: 10, fontWeight: 600, color: "#3B82F6", background: "#EEF4FF" }}
                    >
                      {item.group}
                    </span>
                  )}
                  {item.group === "Personal" && (
                    <span
                      className="shrink-0 px-2 py-0.5 rounded-full"
                      style={{ fontSize: 10, fontWeight: 600, color: "#10B981", background: "#ECFDF5" }}
                    >
                      Personal
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-10 text-center">
            <p style={{ fontSize: 14, color: "#999" }}>No activity for this date.</p>
          </div>
        )}

        <p className="text-center mt-4" style={{ fontSize: 12, color: "#bbb" }}>
          End of activity for {dateLabel}
        </p>
      </div>

      {/* ─── Modals ─── */}
      <EditProfileModal open={showEditProfile} onOpenChange={setShowEditProfile} />
      <AddFriendModal open={showAddFriend} onOpenChange={setShowAddFriend} />

      {/* Hidden file inputs */}
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handlePhotoSelected(e.target.files[0]); e.target.value = ""; }} />
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handlePhotoSelected(e.target.files[0]); e.target.value = ""; }} />

      {/* Friends Bottom Sheet */}
      {showFriendsSheet && (
        <div className="fixed inset-0 z-[9998] flex items-end justify-center" onClick={() => setShowFriendsSheet(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative w-full max-w-md mx-0 animate-in slide-in-from-bottom-4 duration-200"
            style={{ background: "#fff", borderRadius: "16px 16px 0 0", maxHeight: "70vh" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <p style={{ fontSize: 17, fontWeight: 600, color: "#1A1A1A" }}>Friends</p>
              <button onClick={() => setShowFriendsSheet(false)}>
                <X size={20} color="#888" />
              </button>
            </div>
            <div className="overflow-y-auto px-5 pb-8" style={{ maxHeight: "calc(70vh - 60px)" }}>
              {activeFriends.length === 0 && (
                <p className="text-center py-8" style={{ fontSize: 14, color: "#999" }}>No friends yet</p>
              )}
              {activeFriends.map((f) => {
                if (!f.friend) return null;
                const fInitial = f.friend.display_name?.charAt(0)?.toUpperCase() || "?";
                const fColor = hashColor(f.friend.id);
                const sharedGroups = friendGroupMap[f.friend.id] || [];
                return (
                  <div key={f.id} className="flex items-center gap-3 py-3" style={{ borderBottom: "0.5px solid rgba(0,0,0,0.06)" }}>
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold overflow-hidden shrink-0"
                      style={{ background: fColor }}
                    >
                      {f.friend.avatar_url ? (
                        <img src={f.friend.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : fInitial}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p style={{ fontSize: 14, fontWeight: 500, color: "#1A1A1A" }} className="truncate">{f.friend.display_name}</p>
                      {sharedGroups.length > 0 && (
                        <p style={{ fontSize: 12, color: "#999" }} className="truncate">{sharedGroups.join(", ")}</p>
                      )}
                    </div>
                  </div>
                );
              })}
              <button
                onClick={() => { setShowFriendsSheet(false); setShowAddFriend(true); }}
                className="w-full mt-3 py-3 text-center"
                style={{ fontSize: 14, fontWeight: 500, color: "#7C3AED" }}
              >
                + Add a friend
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Photo picker action sheet */}
      {showPhotoSheet && (
        <div className="fixed inset-0 z-[9999] flex items-end justify-center" onClick={() => setShowPhotoSheet(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative w-full max-w-md mx-4 mb-6 animate-in slide-in-from-bottom-4 duration-200" onClick={(e) => e.stopPropagation()}>
            <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden" }}>
              <button
                className="w-full py-4 text-center"
                style={{ fontSize: 17, fontWeight: 400, color: "#007AFF", borderBottom: "0.5px solid rgba(0,0,0,0.1)" }}
                onClick={() => { setShowPhotoSheet(false); cameraInputRef.current?.click(); }}
              >
                Take Photo
              </button>
              <button
                className="w-full py-4 text-center"
                style={{ fontSize: 17, fontWeight: 400, color: "#007AFF" }}
                onClick={() => { setShowPhotoSheet(false); fileInputRef.current?.click(); }}
              >
                Choose from Library
              </button>
            </div>
            <button
              className="w-full py-4 text-center mt-2"
              style={{ fontSize: 17, fontWeight: 600, color: "#007AFF", background: "#fff", borderRadius: 14 }}
              onClick={() => setShowPhotoSheet(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Crop / position editor */}
      {showCropEditor && selectedImage && (
        <div className="fixed inset-0 z-[10000] flex flex-col" style={{ background: "#000" }}>
          <div className="flex items-center justify-between px-4 pt-12 pb-3">
            <p style={{ fontSize: 17, fontWeight: 600, color: "#fff" }}>Move and Scale</p>
            <button onClick={() => { setShowCropEditor(false); setSelectedImage(null); setSelectedFile(null); }}>
              <X size={22} color="#fff" />
            </button>
          </div>
          <div
            ref={cropContainerRef}
            className="flex-1 relative flex items-center justify-center overflow-hidden"
            onTouchStart={handleCropTouchStart}
            onTouchMove={handleCropTouchMove}
            onTouchEnd={handleCropTouchEnd}
          >
            <img
              src={selectedImage}
              alt=""
              className="absolute select-none pointer-events-none"
              draggable={false}
              style={{
                transform: `translate(${cropOffset.x}px, ${cropOffset.y}px) scale(${cropScale})`,
                maxWidth: "100%",
                maxHeight: "100%",
                objectFit: "contain",
                transition: dragRef.current || pinchRef.current ? "none" : "transform 0.1s ease",
              }}
            />
            <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none">
              <defs>
                <mask id="crop-mask">
                  <rect width="100%" height="100%" fill="white" />
                  <circle cx="50%" cy="50%" r="140" fill="black" />
                </mask>
              </defs>
              <rect width="100%" height="100%" fill="rgba(0,0,0,0.6)" mask="url(#crop-mask)" />
            </svg>
            <div
              className="absolute rounded-full pointer-events-none"
              style={{ width: 280, height: 280, border: "2px solid rgba(255,255,255,0.5)" }}
            />
          </div>
          <div className="flex items-center justify-between px-6 pb-10 pt-4">
            <button
              onClick={() => { setShowCropEditor(false); setSelectedImage(null); setSelectedFile(null); }}
              style={{ fontSize: 16, fontWeight: 500, color: "#fff", padding: "10px 28px", borderRadius: 12, background: "rgba(255,255,255,0.15)" }}
            >
              Cancel
            </button>
            <button
              onClick={handleCropConfirm}
              disabled={uploading}
              style={{ fontSize: 16, fontWeight: 600, color: "#fff", padding: "10px 28px", borderRadius: 12, background: "#6C47FF", opacity: uploading ? 0.6 : 1 }}
            >
              {uploading ? "Saving…" : "Confirm"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfilePage;
