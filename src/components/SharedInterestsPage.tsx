import { useState, useEffect, useMemo } from "react";
import { Plus, MoreHorizontal } from "lucide-react";
import { useAuth, Group, ShareablePage, PAGE_LABELS, SHAREABLE_PAGES } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";

interface FeedItem {
  id: string;
  type: string;
  description: string;
  timestamp: string;
  userId: string;
  userName: string;
  groupId: string;
  groupName: string;
  categoryLabel: string;
  categoryColor: string;
}

interface SharedInterestsPageProps {
  onNavigateToFeature?: (tab: string, groupId?: string) => void;
  onCreateGroup?: () => void;
  onOpenGroupHub?: (group: Group) => void;
  onOpenMore?: () => void;
}

const INTEREST_PILL_COLORS: Record<string, string> = {
  workout: "bg-[hsl(210,70%,92%)] text-[hsl(210,70%,35%)]",
  nutrition: "bg-[hsl(90,40%,89%)] text-[hsl(90,40%,30%)]",
  sobriety: "bg-[hsl(260,50%,92%)] text-[hsl(260,50%,35%)]",
  habits: "bg-[hsl(35,70%,90%)] text-[hsl(35,70%,30%)]",
  calendar: "bg-[hsl(220,15%,91%)] text-[hsl(220,15%,35%)]",
  shopping: "bg-[hsl(170,50%,90%)] text-[hsl(170,50%,30%)]",
};

const GROUP_AVATAR_COLORS = [
  "bg-[hsl(210,60%,82%)]",
  "bg-[hsl(160,45%,80%)]",
  "bg-[hsl(260,45%,85%)]",
  "bg-[hsl(35,60%,82%)]",
  "bg-[hsl(340,50%,85%)]",
  "bg-[hsl(190,50%,82%)]",
  "bg-[hsl(120,40%,82%)]",
  "bg-[hsl(20,60%,82%)]",
];

const getInitials = (name: string) =>
  name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);

const getTimeAgo = (ts: string) => {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
};

const SharedInterestsPage = ({ onNavigateToFeature, onCreateGroup, onOpenGroupHub, onOpenMore }: SharedInterestsPageProps) => {
  const { groups, user, refreshGroups } = useAuth();
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);

  const allGroups = useMemo(
    () => groups.filter((g: any) => !g._personal && g.id !== "__personal__"),
    [groups]
  );

  useEffect(() => {
    if (!user || allGroups.length === 0) {
      setFeedItems([]);
      setFeedLoading(false);
      return;
    }
    const loadFeed = async () => {
      setFeedLoading(true);
      const groupIds = allGroups.map((g) => g.id);
      const { data: workouts } = await supabase
        .from("workouts")
        .select("id, title, emoji, done, completed_date, user_id, group_id, created_at")
        .in("group_id", groupIds)
        .eq("done", true)
        .order("created_at", { ascending: false })
        .limit(15);

      const userIds = new Set<string>();
      (workouts || []).forEach((w: any) => userIds.add(w.user_id));
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
      const groupMap = new Map(allGroups.map((g) => [g.id, g]));
      const items: FeedItem[] = (workouts || []).map((w: any) => {
        const profile = profileMap.get(w.user_id);
        const group = groupMap.get(w.group_id);
        return {
          id: w.id,
          type: "workout",
          description: `completed ${w.title}`,
          timestamp: w.completed_date || w.created_at,
          userId: w.user_id,
          userName: profile?.display_name || "Someone",
          groupId: w.group_id,
          groupName: group?.name || "Group",
          categoryLabel: "Workout",
          categoryColor: INTEREST_PILL_COLORS.workout,
        };
      });
      setFeedItems(items);
      setFeedLoading(false);
    };
    loadFeed();
  }, [user, allGroups]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="px-5 pt-12 pb-3 flex-shrink-0 flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight text-foreground">Explore</h1>
        <div className="flex items-center gap-1.5">
          <button
            onClick={onCreateGroup}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-primary text-primary text-xs font-semibold hover:bg-primary/5 transition-colors"
          >
            <Plus size={13} />
            Create / Join
          </button>
          {onOpenMore && (
            <button onClick={onOpenMore} className="w-[30px] h-[30px] rounded-full flex items-center justify-center" style={{ background: "#F4F3F0" }} aria-label="More">
              <MoreHorizontal size={15} color="#888" />
            </button>
          )}
        </div>
      </header>

      {/* My Circles */}
      <div className="flex-shrink-0 px-5 pb-2">
        <h2 className="text-sm font-semibold text-foreground mb-2">My Circles</h2>
        {allGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-3">
              <span className="text-xl">👥</span>
            </div>
            <p className="text-sm font-medium text-foreground mb-0.5">No groups yet</p>
            <p className="text-xs text-muted-foreground max-w-[220px]">Create one or ask a friend to invite you.</p>
          </div>
        ) : (
          <div
            className="flex gap-4 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
            style={{ scrollSnapType: "x mandatory" }}
          >
            {allGroups.map((group, gi) => {
              const coverUrl = group.cover_image_url || null;
              return (
                <button
                  key={group.id}
                  onClick={() => onOpenGroupHub?.(group)}
                  className="flex flex-col items-center gap-1.5 shrink-0 active:scale-95 transition-transform"
                  style={{ scrollSnapAlign: "start" }}
                >
                  <div
                    className={`w-[72px] h-[72px] rounded-full overflow-hidden flex items-center justify-center ${!coverUrl ? GROUP_AVATAR_COLORS[gi % GROUP_AVATAR_COLORS.length] : ""}`}
                  >
                    {coverUrl ? (
                      <img src={coverUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-base font-bold text-foreground/80">{getInitials(group.name)}</span>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground font-medium max-w-[72px] truncate">{group.name}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="px-5 flex-shrink-0">
        <div className="h-px bg-border" />
      </div>

      {/* Recent Activity */}
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="px-5 py-2 flex-shrink-0">
          <h2 className="text-sm font-semibold text-foreground">Recent Activity</h2>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-4">
          {feedLoading ? (
            <p className="text-xs text-muted-foreground text-center py-4">Loading activity...</p>
          ) : feedItems.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">No recent activity yet</p>
          ) : (
            <div className="space-y-2">
              {feedItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => onNavigateToFeature?.(item.type, item.groupId)}
                  className="w-full flex items-start gap-3 p-3 rounded-xl bg-card border border-border text-left hover:border-primary/20 transition-colors"
                >
                  <div className="w-[26px] h-[26px] rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">
                    {getInitials(item.userName)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs leading-snug">
                      <span className="font-semibold">{item.userName}</span>{" "}
                      <span className="text-muted-foreground">{item.description} in </span>
                      <span className="font-medium">{item.groupName}</span>
                    </p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-[10px] text-muted-foreground">{getTimeAgo(item.timestamp)}</span>
                      <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${item.categoryColor}`}>
                        {item.categoryLabel}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SharedInterestsPage;
