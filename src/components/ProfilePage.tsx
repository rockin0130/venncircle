import { useState, useEffect, useMemo } from "react";
import { User, Bell, Shield, Palette, HelpCircle, LogOut, ChevronRight, Calendar, ExternalLink, Unlink, Loader2, Check, Users, Pencil, Dumbbell, Heart, Clock, Sparkles, Copy, Settings } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useAppContext } from "@/context/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import EditProfileModal from "@/components/EditProfileModal";
import { useFriendships } from "@/hooks/useFriendships";

const settingsItems = [
  { icon: Bell, label: "Notifications", desc: "Reminders & alerts" },
  { icon: Shield, label: "Privacy", desc: "Data & sharing" },
  { icon: Palette, label: "Appearance", desc: "Theme & display" },
  { icon: HelpCircle, label: "Help & Support", desc: "FAQ & contact" },
];

interface ProfilePageProps {
  onNavigate?: (tab: string) => void;
  onOpenSettings?: () => void;
}

const ProfilePage = ({ onNavigate, onOpenSettings }: ProfilePageProps) => {
  const { user, session, profile, signOut } = useAuth();
  const { filteredHabits, filteredWorkouts } = useAppContext();
  const { activeFriends } = useFriendships();
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [gcalConnected, setGcalConnected] = useState<boolean | null>(null);
  const [gcalLoading, setGcalLoading] = useState(false);

  // Check Google Calendar connection
  useEffect(() => {
    if (!user) { setGcalConnected(false); return; }
    const check = async () => {
      const { data } = await supabase
        .from("google_calendar_tokens")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      setGcalConnected(!!data);
    };
    check();
  }, [user]);

  const handleConnectGoogleCalendar = async () => {
    if (!user) return;
    setGcalLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("google-calendar-auth-url", {});
      if (error || !data?.url) throw error || new Error("No URL returned");
      window.location.href = data.url;
    } catch {
      toast.error("Failed to start Google Calendar connection");
      setGcalLoading(false);
    }
  };

  const handleDisconnectGoogleCalendar = async () => {
    setGcalLoading(true);
    try {
      const { error } = await supabase.functions.invoke("google-calendar-disconnect", {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (error) throw error;
      setGcalConnected(false);
      toast.success("Google Calendar disconnected");
    } catch {
      toast.error("Failed to disconnect Google Calendar");
    }
    setGcalLoading(false);
  };

  // Activity stats
  const todayStr = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoStr = weekAgo.toISOString().slice(0, 10);

  const habitsCompletedToday = filteredHabits.filter((h) => h.done).length;
  const workoutsThisWeek = filteredWorkouts.filter(
    (w) => w.done && w.completedDate && w.completedDate >= weekAgoStr
  ).length;

  const initial = profile?.display_name?.charAt(0)?.toUpperCase() || "?";

  return (
    <div className="px-5 pb-24">
      <header className="pt-12 pb-6 flex items-center justify-between">
        <h1 className="text-[1.75rem] font-bold tracking-tight">Profile</h1>
        {onOpenSettings && (
          <button
            onClick={onOpenSettings}
            aria-label="Open settings"
            className="w-10 h-10 rounded-full border border-border bg-card text-muted-foreground hover:text-foreground hover:border-primary/30 flex items-center justify-center transition-all shadow-sm"
          >
            <Settings size={18} />
          </button>
        )}
      </header>

      {/* Profile Header Card */}
      <div className="bg-card rounded-2xl p-6 border border-border shadow-card mb-6 flex flex-col items-center text-center">
        <button
          onClick={() => setShowEditProfile(true)}
          className="relative w-20 h-20 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-2xl font-bold mb-3 group"
        >
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="" className="w-full h-full object-cover rounded-full" />
          ) : (
            initial
          )}
          <div className="absolute inset-0 rounded-full bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <Pencil size={16} className="text-white" />
          </div>
        </button>
        <h2 className="text-lg font-bold">{profile?.display_name || "You"}</h2>
        {(profile as any)?.username && (
          <p className="text-sm text-muted-foreground">@{(profile as any).username}</p>
        )}
        <p className="text-xs text-muted-foreground mt-0.5">{profile?.email}</p>
      </div>

      {/* Activity Summary */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-card rounded-xl p-4 border border-border shadow-card text-center">
          <Heart size={20} className="text-primary mx-auto mb-1" />
          <p className="text-xl font-bold">{habitsCompletedToday}</p>
          <p className="text-[10px] text-muted-foreground">Habits Today</p>
        </div>
        <div className="bg-card rounded-xl p-4 border border-border shadow-card text-center">
          <Dumbbell size={20} className="text-primary mx-auto mb-1" />
          <p className="text-xl font-bold">{workoutsThisWeek}</p>
          <p className="text-[10px] text-muted-foreground">Workouts This Week</p>
        </div>
      </div>

      {/* Friends Quick Access */}
      <button
        onClick={() => onNavigate?.("launcher")}
        className="w-full flex items-center gap-4 p-4 rounded-xl bg-card border border-border shadow-card mb-6 hover:bg-secondary/40 transition-colors"
      >
        <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center">
          <Users size={20} className="text-foreground" />
        </div>
        <div className="flex-1 text-left">
          <p className="text-sm font-semibold">Friends</p>
          <p className="text-xs text-muted-foreground">{activeFriends.length} friend{activeFriends.length !== 1 ? "s" : ""}</p>
        </div>
        <ChevronRight size={16} className="text-muted-foreground" />
      </button>

      {/* Google Calendar Integration */}
      <div className="bg-card rounded-xl border border-border shadow-card mb-6 overflow-hidden">
        <div className="p-4">
          <div className="flex items-center gap-3 mb-3">
            <Calendar size={16} className="text-primary" />
            <span className="text-sm font-semibold">Google Calendar</span>
          </div>
          {gcalConnected === null ? (
            <div className="flex items-center justify-center py-3">
              <Loader2 size={16} className="animate-spin text-muted-foreground" />
            </div>
          ) : gcalConnected ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-primary/5 border border-primary/20">
                <span className="text-sm">📅</span>
                <span className="flex-1 text-xs font-medium text-primary">Connected</span>
                <Check size={14} className="text-primary" />
              </div>
              <button
                onClick={handleDisconnectGoogleCalendar}
                disabled={gcalLoading}
                className="w-full py-2 rounded-lg border border-destructive/30 text-destructive text-xs font-semibold hover:bg-destructive/10 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {gcalLoading ? <Loader2 size={12} className="animate-spin" /> : <Unlink size={12} />}
                Disconnect
              </button>
            </div>
          ) : (
            <button
              onClick={handleConnectGoogleCalendar}
              disabled={gcalLoading}
              className="w-full flex items-center gap-3 p-3 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <span className="text-lg">📅</span>
              <div className="flex-1 text-left">
                <p className="text-sm font-semibold">Connect Google Calendar</p>
              </div>
              {gcalLoading ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}
            </button>
          )}
        </div>
      </div>

      {/* Settings */}
      <div className="space-y-1 mb-4">
        {settingsItems.map((item) => (
          <button
            key={item.label}
            className="w-full flex items-center gap-4 p-4 rounded-xl hover:bg-secondary transition-colors"
          >
            <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center">
              <item.icon size={20} className="text-foreground" />
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-semibold">{item.label}</p>
              <p className="text-xs text-muted-foreground">{item.desc}</p>
            </div>
            <ChevronRight size={16} className="text-muted-foreground" />
          </button>
        ))}
      </div>

      <button
        onClick={signOut}
        className="w-full flex items-center gap-4 p-4 rounded-xl hover:bg-destructive/10 transition-colors text-destructive"
      >
        <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center">
          <LogOut size={20} />
        </div>
        <span className="text-sm font-semibold">Log Out</span>
      </button>

      <EditProfileModal open={showEditProfile} onOpenChange={setShowEditProfile} />
    </div>
  );
};

export default ProfilePage;
