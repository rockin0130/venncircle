import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Plus, Maximize2, Minimize2, MoreHorizontal, Camera } from "lucide-react";
import { useAuth, Group, ShareablePage, PAGE_LABELS, SHAREABLE_PAGES } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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

type SplitMode = "equal" | "groups-expanded" | "feed-expanded";

const SwipeableGroupCard = ({
  group,
  gi,
  user,
  onTap,
  onLeave,
  onDelete,
}: {
  group: Group;
  gi: number;
  user: { id: string } | null;
  onTap: () => void;
  onLeave: (group: Group) => void;
  onDelete: (group: Group) => void;
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const currentX = useRef(0);
  const swiped = useRef(false);
  const [offset, setOffset] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [removed, setRemoved] = useState(false);

  const isOwner = group.created_by === user?.id;
  const REVEAL_WIDTH = 100;

  const handleStart = (clientX: number) => {
    startX.current = clientX;
    currentX.current = offset;
  };

  const handleMove = (clientX: number) => {
    const diff = clientX - startX.current + currentX.current;
    const clamped = Math.max(-REVEAL_WIDTH, Math.min(0, diff));
    setOffset(clamped);
  };

  const handleEnd = () => {
    if (offset < -REVEAL_WIDTH / 2) {
      setOffset(-REVEAL_WIDTH);
      swiped.current = true;
    } else {
      setOffset(0);
      swiped.current = false;
    }
  };

  const snapBack = () => {
    setOffset(0);
    swiped.current = false;
  };

  const handleAction = async () => {
    setLeaving(true);
    if (isOwner) {
      const { error } = await supabase.rpc("delete_group", { _group_id: group.id });
      if (error) {
        toast.error("Failed to delete group");
        setLeaving(false);
        return;
      }
      toast.success(`"${group.name}" deleted`);
      setRemoved(true);
      setTimeout(() => onDelete(group), 300);
    } else {
      onLeave(group);
      setRemoved(true);
    }
    setConfirmOpen(false);
  };

  // Click outside to snap back
  useEffect(() => {
    if (!swiped.current) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        snapBack();
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [offset]);

  if (removed) {
    return <div className="h-0 overflow-hidden transition-all duration-300" />;
  }

  const activeMembers = group.members.filter((m) => m.status === "active");
  const validPages = (group.shared_pages || [])
    .filter((p) => (SHAREABLE_PAGES as readonly string[]).includes(p))
    .slice(0, 4) as ShareablePage[];
  const extraPages = Math.max(
    (group.shared_pages || []).filter((p) => (SHAREABLE_PAGES as readonly string[]).includes(p)).length - 4,
    0
  );
  const coverUrl = group.cover_image_url || null;

  return (
    <>
      <div ref={cardRef} className="relative overflow-hidden" style={{ borderRadius: 14, height: 76 }}>
        {/* Background action button */}
        <div
          className="absolute right-0 top-0 bottom-0 flex items-center justify-center text-white text-xs font-semibold cursor-pointer select-none"
          style={{
            width: REVEAL_WIDTH,
            background: "#E05C5C",
            borderRadius: "0 14px 14px 0",
          }}
          onClick={() => setConfirmOpen(true)}
        >
          {isOwner ? "Delete Group" : "Leave Group"}
        </div>

        {/* Foreground card */}
        <div
          className="absolute top-0 left-0 right-0 bottom-0 w-full flex bg-card touch-pan-y"
          style={{
            transform: `translateX(${offset}px)`,
            transition: offset === 0 || offset === -REVEAL_WIDTH ? "transform 0.25s cubic-bezier(.4,0,.2,1)" : "none",
            borderRadius: 14,
            border: "0.5px solid rgba(0,0,0,0.07)",
            willChange: "transform",
          }}
          onMouseDown={(e) => handleStart(e.clientX)}
          onMouseMove={(e) => { if (e.buttons === 1) handleMove(e.clientX); }}
          onMouseUp={handleEnd}
          onTouchStart={(e) => handleStart(e.touches[0].clientX)}
          onTouchMove={(e) => handleMove(e.touches[0].clientX)}
          onTouchEnd={handleEnd}
          onClick={() => { if (Math.abs(offset) < 5) onTap(); }}
        >
          <div className="flex-1 min-w-0 px-3 py-2.5 flex flex-col justify-center bg-card" style={{ borderRadius: "14px 0 0 14px" }}>
            <div className="flex items-center gap-1.5 min-w-0">
              <p className="text-[13px] font-medium text-foreground truncate">{group.name}</p>
              <div className="shrink-0">
                <MemberDots members={activeMembers} />
              </div>
            </div>
            <div className="flex flex-wrap gap-1 mt-1.5">
              {validPages.map((page) => (
                <span
                  key={page}
                  className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${INTEREST_PILL_COLORS[page] || INTEREST_PILL_COLORS.calendar}`}
                >
                  {PAGE_LABELS[page] || page}
                </span>
              ))}
              {extraPages > 0 && (
                <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                  +{extraPages}
                </span>
              )}
            </div>
          </div>
          <div className="w-[100px] shrink-0 overflow-hidden" style={{ borderRadius: "0 14px 14px 0" }}>
            {coverUrl ? (
              <img src={coverUrl} alt="" className="w-full h-full object-cover block" />
            ) : (
              <div className={`w-full h-full ${GROUP_AVATAR_COLORS[gi % GROUP_AVATAR_COLORS.length]} flex flex-col items-center justify-center gap-0.5`}>
                <Camera size={12} className="text-muted-foreground/50" />
                <span className="text-[8px] font-medium text-muted-foreground/70">Add photo</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{isOwner ? "Delete" : "Leave"} {group.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {isOwner
                ? "This will permanently delete the group and all its shared content for all members."
                : "You'll lose access to shared content."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={leaving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleAction}
              disabled={leaving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {leaving ? "..." : isOwner ? "Delete" : "Leave"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

const SharedInterestsPage = ({ onNavigateToFeature, onCreateGroup, onOpenGroupHub, onOpenMore }: SharedInterestsPageProps) => {
  const { groups, user, leaveGroup, refreshGroups } = useAuth();
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [splitMode, setSplitMode] = useState<SplitMode>("equal");
  const [splitRatio, setSplitRatio] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const allGroups = useMemo(
    () => groups.filter((g: any) => !g._personal && g.id !== "__personal__"),
    [groups]
  );

  const handleLeaveGroup = async (group: Group) => {
    const result = await leaveGroup(group.id);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(`Left "${group.name}"`);
      refreshGroups();
    }
  };

  const handleDeleteGroup = () => {
    refreshGroups();
  };

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
    onOpenGroupHub?.(group);
  };

  const toggleExpand = (section: "groups" | "feed") => {
    if (section === "groups") {
      setSplitMode((m) => (m === "groups-expanded" ? "equal" : "groups-expanded"));
      setSplitRatio((r) => (splitMode === "groups-expanded" ? 50 : 75));
    } else {
      setSplitMode((m) => (m === "feed-expanded" ? "equal" : "feed-expanded"));
      setSplitRatio((r) => (splitMode === "feed-expanded" ? 50 : 25));
    }
  };

  const onDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    isDragging.current = true;
    e.preventDefault();
  }, []);

  useEffect(() => {
    const onMove = (clientY: number) => {
      if (!isDragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((clientY - rect.top) / rect.height) * 100;
      const clamped = Math.max(20, Math.min(80, pct));
      setSplitRatio(clamped);
      setSplitMode("equal");
    };
    const handleMouseMove = (e: MouseEvent) => onMove(e.clientY);
    const handleTouchMove = (e: TouchEvent) => onMove(e.touches[0].clientY);
    const handleEnd = () => { isDragging.current = false; };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("touchmove", handleTouchMove);
    window.addEventListener("mouseup", handleEnd);
    window.addEventListener("touchend", handleEnd);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("mouseup", handleEnd);
      window.removeEventListener("touchend", handleEnd);
    };
  }, []);

  const topPct = splitMode === "groups-expanded" ? 75 : splitMode === "feed-expanded" ? 25 : splitRatio;
  const isGroupsCompact = splitMode === "feed-expanded";
  const isFeedCompact = splitMode === "groups-expanded";

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

      {/* Split container */}
      <div ref={containerRef} className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Top: My Groups */}
        <div style={{ height: `${topPct}%` }} className="flex flex-col min-h-0">
          <div className="px-5 py-1.5 flex items-center justify-between flex-shrink-0">
            <h2 className="text-sm font-semibold text-foreground">My Groups</h2>
            <button
              onClick={() => toggleExpand("groups")}
              className="p-1 rounded-md hover:bg-muted transition-colors"
              title={splitMode === "groups-expanded" ? "Collapse" : "Expand groups"}
            >
              {splitMode === "groups-expanded" ? <Minimize2 size={14} className="text-muted-foreground" /> : <Maximize2 size={14} className="text-muted-foreground" />}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 pb-1">
            {allGroups.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-3">
                  <span className="text-xl">👥</span>
                </div>
                <p className="text-sm font-medium text-foreground mb-0.5">No groups yet</p>
                <p className="text-xs text-muted-foreground max-w-[220px]">Create one or ask a friend to invite you.</p>
              </div>
            ) : isGroupsCompact ? (
              /* Compact horizontal strip */
              <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
                {allGroups.map((group, gi) => (
                  <button
                    key={group.id}
                    onClick={() => handleGroupTap(group)}
                    className="flex flex-col items-center gap-1 shrink-0 active:scale-95 transition-transform"
                  >
                    <div className={`w-10 h-10 rounded-lg ${GROUP_AVATAR_COLORS[gi % GROUP_AVATAR_COLORS.length]} flex items-center justify-center`}>
                      <span className="text-[10px] font-bold text-foreground/80">{getInitials(group.name)}</span>
                    </div>
                    <span className="text-[9px] text-muted-foreground font-medium max-w-[52px] truncate">{group.name}</span>
                  </button>
                ))}
              </div>
            ) : (
              /* Full group cards */
              <div className="space-y-2">
                {allGroups.map((group, gi) => (
                  <SwipeableGroupCard
                    key={group.id}
                    group={group}
                    gi={gi}
                    user={user}
                    onTap={() => handleGroupTap(group)}
                    onLeave={handleLeaveGroup}
                    onDelete={handleDeleteGroup}
                  />
                ))}
                
              </div>
            )}
          </div>
        </div>

        {/* Draggable divider */}
        <div
          onMouseDown={onDragStart}
          onTouchStart={onDragStart}
          className="flex-shrink-0 h-3 flex items-center justify-center cursor-row-resize group hover:bg-muted/40 transition-colors select-none touch-none"
        >
          <div className="w-10 h-1 rounded-full bg-border group-hover:bg-primary/30 transition-colors" />
        </div>

        {/* Bottom: Recent Activity */}
        <div style={{ height: `calc(${100 - topPct}% - 12px)` }} className="flex flex-col min-h-0">
          <div className="px-5 py-1.5 flex items-center justify-between flex-shrink-0">
            <h2 className="text-sm font-semibold text-foreground">Recent Activity</h2>
            <button
              onClick={() => toggleExpand("feed")}
              className="p-1 rounded-md hover:bg-muted transition-colors"
              title={splitMode === "feed-expanded" ? "Collapse" : "Expand feed"}
            >
              {splitMode === "feed-expanded" ? <Minimize2 size={14} className="text-muted-foreground" /> : <Maximize2 size={14} className="text-muted-foreground" />}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 pb-4">
            {feedLoading ? (
              <p className="text-xs text-muted-foreground text-center py-4">Loading activity...</p>
            ) : feedItems.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">No recent activity yet</p>
            ) : isFeedCompact ? (
              /* Compact feed */
              <div className="space-y-1">
                {feedItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => onNavigateToFeature?.(item.type, item.groupId)}
                    className="w-full flex items-center gap-2 py-1.5 text-left hover:bg-muted/30 rounded-lg px-1 transition-colors"
                  >
                    <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-[8px] font-bold text-primary shrink-0">
                      {getInitials(item.userName)}
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate flex-1">
                      <span className="font-medium text-foreground">{item.userName}</span> {item.description}
                    </p>
                  </button>
                ))}
              </div>
            ) : (
              /* Full feed items */
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
    </div>
  );
};

export default SharedInterestsPage;
