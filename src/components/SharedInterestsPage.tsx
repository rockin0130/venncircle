import { useState, useEffect, useMemo } from "react";
import { Plus, ChevronRight } from "lucide-react";
import { useAuth, Group, ShareablePage, PAGE_LABELS, PAGE_ICONS } from "@/context/AuthContext";
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
}

const INTEREST_PILL_COLORS: Record<string, string> = {
  workout: "bg-[hsl(210,70%,92%)] text-[hsl(210,70%,35%)]",
  nutrition: "bg-[hsl(90,40%,89%)] text-[hsl(90,40%,30%)]",
  sobriety: "bg-[hsl(260,50%,92%)] text-[hsl(260,50%,35%)]",
  habits: "bg-[hsl(35,70%,90%)] text-[hsl(35,70%,30%)]",
  calendar: "bg-[hsl(220,15%,91%)] text-[hsl(220,15%,35%)]",
  special_days: "bg-[hsl(340,60%,92%)] text-[hsl(340,60%,35%)]",
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

const MEMBER_COLORS = [
  "bg-[hsl(210,55%,75%)]",
  "bg-[hsl(340,50%,78%)]",
  "bg-[hsl(160,40%,72%)]",
  "bg-[hsl(35,55%,75%)]",
  "bg-[hsl(260,40%,78%)]",
  "bg-[hsl(190,45%,72%)]",
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

const MemberDots = ({ members }: { members: { display_name: string | null; user_id: string }[] }) => {
  const visible = members.slice(0, 4);
  const extra = members.length - 4;
  return (
    <div className="flex -space-x-1.5">
      {visible.map((m, i) => (
        <div
          key={m.user_id}
          className={`w-[15px] h-[15px] rounded-full ${MEMBER_COLORS[i % MEMBER_COLORS.length]} flex items-center justify-center text-[7px] font-bold text-white ring-1 ring-card`}
        >
          {(m.display_name || "?")[0].toUpperCase()}
        </div>
      ))}
      {extra > 0 && (
        <div className="w-[15px] h-[15px] rounded-full bg-muted flex items-center justify-center text-[6px] font-bold text-muted-foreground ring-1 ring-card">
          +{extra}
        </div>
      )}
    </div>
  );
};

const SharedInterestsPage = ({ onNavigateToFeature, onCreateGroup, onOpenGroupHub }: SharedInterestsPageProps) => {
  const { groups, user } = useAuth();
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);

  // Show all groups except the personal sentinel
  const allGroups = useMemo(
    () => groups.filter((g: any) => !g._personal && g.id !== "__personal__"),
    [groups]
  );

  // Load activity feed from all groups
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

  const handleGroupTap = (group: Group) => {
    // If group has only one interest, go directly to that page
    if (group.shared_pages.length === 1) {
      const page = group.shared_pages[0];
      const tab = page === "special_days" ? "specialdays" : page;
      onNavigateToFeature?.(tab, group.id);
    } else {
      onOpenGroupHub?.(group);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="px-5 pt-12 pb-4 flex-shrink-0 flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight text-foreground">Explore</h1>
        <button
          onClick={onCreateGroup}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-primary text-primary text-xs font-semibold hover:bg-primary/5 transition-colors"
        >
          <Plus size={13} />
          Create / Join
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-5 pb-6 space-y-5">
        {/* Group Cards */}
        {allGroups.length > 0 ? (
          <section className="space-y-2.5">
            <h2 className="text-sm font-semibold text-foreground">My Groups</h2>
            {allGroups.map((group, gi) => {
              const activeMembers = group.members.filter((m) => m.status === "active");
              return (
                <button
                  key={group.id}
                  onClick={() => handleGroupTap(group)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-card border border-border hover:border-primary/20 transition-all active:scale-[0.99] text-left"
                >
                  {/* Group avatar */}
                  <div className={`w-9 h-9 rounded-lg ${GROUP_AVATAR_COLORS[gi % GROUP_AVATAR_COLORS.length]} flex items-center justify-center shrink-0`}>
                    <span className="text-xs font-bold text-foreground/80">{getInitials(group.name)}</span>
                  </div>

                  {/* Name + member dots */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{group.name}</p>
                    <MemberDots members={activeMembers} />
                  </div>

                  {/* Interest pills */}
                  <div className="flex flex-wrap gap-1 max-w-[160px] justify-end shrink-0">
                    {(group.shared_pages || []).slice(0, 4).map((page) => (
                      <span
                        key={page}
                        className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${INTEREST_PILL_COLORS[page] || INTEREST_PILL_COLORS.calendar}`}
                      >
                        {PAGE_LABELS[page as ShareablePage] || page}
                      </span>
                    ))}
                    {(group.shared_pages || []).length > 4 && (
                      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                        +{group.shared_pages.length - 4}
                      </span>
                    )}
                  </div>

                  <ChevronRight size={16} className="text-muted-foreground shrink-0" />
                </button>
              );
            })}
          </section>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
              <span className="text-2xl">👥</span>
            </div>
            <p className="text-sm font-medium text-foreground mb-1">No groups yet</p>
            <p className="text-xs text-muted-foreground max-w-[240px]">
              Create one or ask a friend to invite you.
            </p>
          </div>
        )}

        {/* Recent Activity */}
        {feedItems.length > 0 && (
          <section className="space-y-2.5">
            <h2 className="text-sm font-semibold text-foreground">Recent Activity</h2>
            {feedLoading ? (
              <p className="text-xs text-muted-foreground text-center py-4">Loading activity...</p>
            ) : (
              feedItems.map((item) => (
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
              ))
            )}
          </section>
        )}
      </div>
    </div>
  );
};

export default SharedInterestsPage;
