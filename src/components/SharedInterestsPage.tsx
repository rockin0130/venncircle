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
  groupName: string;
  categoryLabel: string;
  categoryColor: string;
}

interface SharedInterestsPageProps {
  onNavigateToFeature?: (tab: string, groupId?: string) => void;
  onCreateGroup?: () => void;
}

const CATEGORY_COLORS: Record<string, { bg: string; text: string; pill: string }> = {
  workout: { bg: "bg-[hsl(210,70%,95%)]", text: "text-[hsl(210,70%,40%)]", pill: "bg-[hsl(210,70%,92%)] text-[hsl(210,70%,35%)]" },
  nutrition: { bg: "bg-[hsl(90,40%,92%)]", text: "text-[hsl(90,40%,35%)]", pill: "bg-[hsl(90,40%,89%)] text-[hsl(90,40%,30%)]" },
  sobriety: { bg: "bg-[hsl(260,50%,95%)]", text: "text-[hsl(260,50%,40%)]", pill: "bg-[hsl(260,50%,92%)] text-[hsl(260,50%,35%)]" },
  habits: { bg: "bg-[hsl(35,70%,93%)]", text: "text-[hsl(35,70%,35%)]", pill: "bg-[hsl(35,70%,90%)] text-[hsl(35,70%,30%)]" },
  calendar: { bg: "bg-[hsl(0,60%,95%)]", text: "text-[hsl(0,60%,40%)]", pill: "bg-[hsl(0,60%,92%)] text-[hsl(0,60%,35%)]" },
  special_days: { bg: "bg-[hsl(340,60%,95%)]", text: "text-[hsl(340,60%,40%)]", pill: "bg-[hsl(340,60%,92%)] text-[hsl(340,60%,35%)]" },
  shopping: { bg: "bg-[hsl(170,50%,93%)]", text: "text-[hsl(170,50%,35%)]", pill: "bg-[hsl(170,50%,90%)] text-[hsl(170,50%,30%)]" },
};

const GROUP_SQUARE_COLORS = [
  "bg-[hsl(210,60%,88%)]",
  "bg-[hsl(160,45%,88%)]",
  "bg-[hsl(260,45%,90%)]",
  "bg-[hsl(35,60%,88%)]",
  "bg-[hsl(340,50%,90%)]",
  "bg-[hsl(190,50%,88%)]",
];

const getInitials = (name: string) =>
  name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);

const MemberDots = ({ members }: { members: { display_name: string | null }[] }) => {
  const visible = members.slice(0, 3);
  const extra = members.length - 3;
  return (
    <div className="flex -space-x-1.5 mt-1 justify-center">
      {visible.map((m, i) => (
        <div
          key={i}
          className="w-[13px] h-[13px] rounded-full bg-muted-foreground/20 flex items-center justify-center text-[6px] font-bold text-foreground ring-1 ring-card"
        >
          {(m.display_name || "?")[0].toUpperCase()}
        </div>
      ))}
      {extra > 0 && (
        <div className="w-[13px] h-[13px] rounded-full bg-muted flex items-center justify-center text-[5px] font-bold text-muted-foreground ring-1 ring-card">
          +{extra}
        </div>
      )}
    </div>
  );
};

const SharedInterestsPage = ({ onNavigateToFeature, onCreateGroup }: SharedInterestsPageProps) => {
  const { groups, user } = useAuth();
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);

  const interestGroups = useMemo(
    () => groups.filter((g: any) => g.category === "interest"),
    [groups]
  );

  // Build categories dynamically from groups' shared_pages
  const categories = useMemo(() => {
    const catMap = new Map<string, Group[]>();
    interestGroups.forEach((g) => {
      (g.shared_pages || []).forEach((page) => {
        if (!catMap.has(page)) catMap.set(page, []);
        catMap.get(page)!.push(g);
      });
    });
    return Array.from(catMap.entries()).map(([page, grps]) => ({
      key: page,
      label: PAGE_LABELS[page as ShareablePage] || page.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase()),
      icon: PAGE_ICONS[page as ShareablePage] || "📋",
      groups: grps,
      colors: CATEGORY_COLORS[page] || CATEGORY_COLORS.workout,
    }));
  }, [interestGroups]);

  // Load feed
  useEffect(() => {
    if (!user || interestGroups.length === 0) {
      setFeedItems([]);
      setFeedLoading(false);
      return;
    }
    const loadFeed = async () => {
      setFeedLoading(true);
      const groupIds = interestGroups.map((g) => g.id);
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
      const groupMap = new Map(interestGroups.map((g) => [g.id, g]));
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
          groupName: group?.name || "Group",
          categoryLabel: "Workout",
          categoryColor: CATEGORY_COLORS.workout.pill,
        };
      });
      setFeedItems(items);
      setFeedLoading(false);
    };
    loadFeed();
  }, [user, interestGroups]);

  const getTimeAgo = (ts: string) => {
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="px-5 pt-12 pb-4 flex-shrink-0 flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight text-foreground">Shared Interests</h1>
        <button
          onClick={onCreateGroup}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-primary text-primary text-xs font-semibold hover:bg-primary/5 transition-colors"
        >
          <Plus size={13} />
          Create / Join
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-5 pb-6 space-y-5">
        {/* My Groups - Category Cards */}
        {categories.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">My Groups</h2>
            {categories.map((cat) => (
              <div
                key={cat.key}
                className="bg-card rounded-xl border border-border p-3"
              >
                {/* Title row */}
                <button
                  onClick={() => onNavigateToFeature?.(cat.key === "special_days" ? "specialdays" : cat.key)}
                  className="flex items-center justify-between w-full mb-3"
                >
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{cat.label}</span>
                  <ChevronRight size={14} className="text-muted-foreground" />
                </button>

                {/* Icon + groups row */}
                <div className="flex items-start gap-0 overflow-x-auto scrollbar-hide">
                  {/* Category icon block */}
                  <button
                    onClick={() => onNavigateToFeature?.(cat.key === "special_days" ? "specialdays" : cat.key)}
                    className="flex flex-col items-center shrink-0"
                  >
                    <div className={`w-11 h-11 rounded-lg ${cat.colors.bg} flex items-center justify-center text-lg`}>
                      {cat.icon}
                    </div>
                    <span className="text-[10px] text-muted-foreground mt-1 leading-tight">All groups</span>
                  </button>

                  {/* Divider */}
                  <div className="w-px h-11 bg-border mx-2.5 shrink-0 self-start" />

                  {/* Group squares */}
                  {cat.groups.map((group, gi) => (
                    <button
                      key={group.id}
                      onClick={() => onNavigateToFeature?.(cat.key === "special_days" ? "specialdays" : cat.key, group.id)}
                      className="flex flex-col items-center shrink-0 mr-2.5 min-w-0"
                    >
                      <div className={`w-11 h-11 rounded-lg ${GROUP_SQUARE_COLORS[gi % GROUP_SQUARE_COLORS.length]} flex flex-col items-center justify-center relative`}>
                        <span className="text-xs font-semibold text-foreground/80 leading-none">
                          {getInitials(group.name)}
                        </span>
                        <MemberDots members={group.members.filter(m => m.status === "active")} />
                      </div>
                      <span className="text-[10px] text-muted-foreground mt-1 leading-tight max-w-[44px] truncate">
                        {group.name}
                      </span>
                    </button>
                  ))}

                  {/* Add square */}
                  <button
                    onClick={onCreateGroup}
                    className="flex flex-col items-center shrink-0"
                  >
                    <div className="w-11 h-11 rounded-lg border border-dashed border-border flex items-center justify-center">
                      <Plus size={16} className="text-muted-foreground" />
                    </div>
                    <span className="text-[10px] text-muted-foreground mt-1 leading-tight">Add</span>
                  </button>
                </div>
              </div>
            ))}
          </section>
        )}

        {categories.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <p className="text-sm font-medium">No shared interest groups yet</p>
            <p className="text-xs mt-1">Create or join a group to get started</p>
          </div>
        )}

        {/* Recent Activity */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Recent Activity</h2>
          {feedLoading ? (
            <p className="text-xs text-muted-foreground text-center py-4">Loading activity...</p>
          ) : feedItems.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">No recent activity</p>
          ) : (
            feedItems.map((item) => (
              <div key={item.id} className="flex items-start gap-3 p-3 rounded-xl bg-card border border-border">
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
              </div>
            ))
          )}
        </section>
      </div>
    </div>
  );
};

export default SharedInterestsPage;
