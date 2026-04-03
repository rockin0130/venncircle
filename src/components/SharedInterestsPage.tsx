import { useState, useEffect, useMemo } from "react";
import { Compass, Plus, Dumbbell, Apple, Heart, Clock, Sparkles, ShoppingCart, CalendarDays, ChevronUp, ChevronDown, Users } from "lucide-react";
import { useAuth, Group } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";

interface FeedItem {
  id: string;
  type: "workout" | "habit" | "sobriety" | "nutrition" | "special_day";
  title: string;
  description: string;
  timestamp: string;
  userId: string;
  userName: string;
  userAvatar: string | null;
  groupName: string;
  groupEmoji: string;
}

const FEATURE_ICONS: Record<string, typeof Dumbbell> = {
  workout: Dumbbell,
  nutrition: Apple,
  habits: Heart,
  sobriety: Clock,
  special_days: Sparkles,
  shopping: ShoppingCart,
  calendar: CalendarDays,
};

interface SharedInterestsPageProps {
  onNavigateToFeature?: (tab: string, groupId?: string) => void;
  onCreateGroup?: () => void;
}

const SharedInterestsPage = ({ onNavigateToFeature, onCreateGroup }: SharedInterestsPageProps) => {
  const { groups, user } = useAuth();
  const [splitRatio, setSplitRatio] = useState<"equal" | "groups" | "feed">("equal");
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);

  const interestGroups = useMemo(
    () => groups.filter((g: any) => g.category === "interest"),
    [groups]
  );

  // Load feed from interest groups
  useEffect(() => {
    if (!user || interestGroups.length === 0) {
      setFeedItems([]);
      setFeedLoading(false);
      return;
    }

    const loadFeed = async () => {
      setFeedLoading(true);
      const groupIds = interestGroups.map((g) => g.id);

      // Fetch recent workouts from interest groups
      const { data: workouts } = await supabase
        .from("workouts")
        .select("id, title, emoji, done, completed_date, user_id, group_id, created_at")
        .in("group_id", groupIds)
        .eq("done", true)
        .order("created_at", { ascending: false })
        .limit(20);

      const userIds = new Set<string>();
      (workouts || []).forEach((w: any) => userIds.add(w.user_id));

      // Fetch profiles for feed items
      const profileIds = Array.from(userIds);
      let profileMap = new Map<string, { display_name: string; avatar_url: string | null }>();
      if (profileIds.length > 0) {
        const { data: profiles } = await supabase.rpc("get_profiles_by_ids", { _user_ids: profileIds });
        if (profiles) {
          (profiles as any[]).forEach((p) => {
            profileMap.set(p.id, { display_name: p.display_name, avatar_url: p.avatar_url });
          });
        }
      }

      const groupMap = new Map(interestGroups.map((g) => [g.id, g]));

      const items: FeedItem[] = (workouts || []).map((w: any) => {
        const profile = profileMap.get(w.user_id);
        const group = groupMap.get(w.group_id);
        return {
          id: w.id,
          type: "workout" as const,
          title: `Completed ${w.title}`,
          description: `${w.emoji} Workout completed`,
          timestamp: w.completed_date || w.created_at,
          userId: w.user_id,
          userName: profile?.display_name || "Someone",
          userAvatar: profile?.avatar_url || null,
          groupName: group?.name || "Group",
          groupEmoji: group?.emoji || "👥",
        };
      });

      setFeedItems(items);
      setFeedLoading(false);
    };

    loadFeed();
  }, [user, interestGroups]);

  const getTopFlex = () => {
    if (splitRatio === "groups") return "flex-[3]";
    if (splitRatio === "feed") return "flex-[1]";
    return "flex-[1]";
  };

  const getBottomFlex = () => {
    if (splitRatio === "feed") return "flex-[3]";
    if (splitRatio === "groups") return "flex-[1]";
    return "flex-[1]";
  };

  const getInitials = (name: string) =>
    name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);

  // Quick access bar for feature shortcuts
  const quickAccessFeatures = useMemo(() => {
    const featureSet = new Set<string>();
    interestGroups.forEach((g) => {
      (g.shared_pages || []).forEach((p) => featureSet.add(p));
    });
    return Array.from(featureSet);
  }, [interestGroups]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="px-5 pt-12 pb-3 flex-shrink-0">
        <h1 className="text-[1.75rem] font-bold tracking-tight flex items-center gap-2">
          <Compass size={24} className="text-primary" />
          Shared Interests
        </h1>
        <p className="text-xs text-muted-foreground mt-1">Topic-based groups with friends</p>
      </header>

      {/* Quick Access Bar */}
      {quickAccessFeatures.length > 0 && (
        <div className="px-5 pb-3 flex-shrink-0">
          <div className="flex gap-2 overflow-x-auto scrollbar-hide">
            {quickAccessFeatures.map((feature) => {
              const Icon = FEATURE_ICONS[feature] || Sparkles;
              const label = feature.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase());
              return (
                <button
                  key={feature}
                  onClick={() => onNavigateToFeature?.(feature)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-secondary text-sm font-medium text-foreground hover:bg-secondary/80 transition-colors whitespace-nowrap shrink-0"
                >
                  <Icon size={14} />
                  <span className="text-xs">{label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Resizable Split View */}
      <div className="flex-1 flex flex-col min-h-0 px-5 pb-4 gap-3">
        {/* Top: My Groups */}
        <div className={`${getTopFlex()} min-h-0 flex flex-col`}>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-foreground">My Groups</h2>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setSplitRatio(splitRatio === "groups" ? "equal" : "groups")}
                className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronDown size={14} />
              </button>
              <button
                onClick={onCreateGroup}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold"
              >
                <Plus size={12} />
                New
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2">
            {interestGroups.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Users size={32} strokeWidth={1} className="mb-3 opacity-40" />
                <p className="text-sm font-medium">No shared interest groups yet</p>
                <p className="text-xs mt-1">Create one to start sharing with friends</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {interestGroups.map((group) => (
                  <button
                    key={group.id}
                    onClick={() => {
                      const mainPage = group.shared_pages?.[0] || "workout";
                      onNavigateToFeature?.(mainPage === "special_days" ? "specialdays" : mainPage, group.id);
                    }}
                    className="bg-card rounded-xl p-3 border border-border shadow-card text-left hover:bg-secondary/40 active:scale-[0.98] transition-all"
                  >
                    <div className="text-2xl mb-2">{group.emoji}</div>
                    <p className="text-sm font-semibold truncate">{group.name}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {group.members.length} member{group.members.length !== 1 ? "s" : ""}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Resize Divider */}
        <div className="flex items-center justify-center py-1 flex-shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSplitRatio(splitRatio === "groups" ? "equal" : "groups")}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronUp size={14} />
            </button>
            <div className="w-12 h-1 rounded-full bg-border" />
            <button
              onClick={() => setSplitRatio(splitRatio === "feed" ? "equal" : "feed")}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronDown size={14} />
            </button>
          </div>
        </div>

        {/* Bottom: Feed */}
        <div className={`${getBottomFlex()} min-h-0 flex flex-col`}>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-foreground">Activity Feed</h2>
            <button
              onClick={() => setSplitRatio(splitRatio === "feed" ? "equal" : "feed")}
              className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronUp size={14} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2">
            {feedLoading ? (
              <p className="text-xs text-muted-foreground text-center py-4">Loading activity...</p>
            ) : feedItems.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <p className="text-xs">No recent activity from your groups</p>
              </div>
            ) : (
              feedItems.map((item) => (
                <div key={item.id} className="flex items-start gap-3 p-3 rounded-xl bg-card border border-border">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0 overflow-hidden">
                    {item.userAvatar ? (
                      <img src={item.userAvatar} alt="" className="w-full h-full object-cover rounded-full" />
                    ) : (
                      getInitials(item.userName)
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs">
                      <span className="font-semibold">{item.userName}</span>{" "}
                      <span className="text-muted-foreground">{item.title}</span>
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(item.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-secondary text-[9px] font-semibold text-muted-foreground">
                        <span>{item.groupEmoji}</span>
                        <span className="truncate max-w-[60px]">{item.groupName}</span>
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SharedInterestsPage;
