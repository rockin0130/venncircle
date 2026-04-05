import { useState } from "react";
import { Users, ChevronRight, Pencil, Dumbbell, Heart, Settings } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useAppContext } from "@/context/AppContext";
import EditProfileModal from "@/components/EditProfileModal";
import { useFriendships } from "@/hooks/useFriendships";

interface ProfilePageProps {
  onNavigate?: (tab: string) => void;
  onOpenSettings?: () => void;
}

const ProfilePage = ({ onNavigate, onOpenSettings }: ProfilePageProps) => {
  const { profile } = useAuth();
  const { filteredHabits, filteredWorkouts } = useAppContext();
  const { activeFriends } = useFriendships();
  const [showEditProfile, setShowEditProfile] = useState(false);

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

      <EditProfileModal open={showEditProfile} onOpenChange={setShowEditProfile} />
    </div>
  );
};

export default ProfilePage;
