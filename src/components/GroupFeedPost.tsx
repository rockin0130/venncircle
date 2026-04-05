import { Heart, MessageCircle, Share2, MoreHorizontal } from "lucide-react";
import { PAGE_LABELS } from "@/context/AuthContext";
import type { GroupMember } from "@/context/AuthContext";

const INTEREST_BADGE_COLORS: Record<string, { bg: string; text: string }> = {
  workout: { bg: "bg-[hsl(10,70%,95%)]", text: "text-[hsl(10,60%,45%)]" },
  nutrition: { bg: "bg-[hsl(190,50%,93%)]", text: "text-[hsl(190,50%,35%)]" },
  sobriety: { bg: "bg-[hsl(260,50%,95%)]", text: "text-[hsl(260,40%,45%)]" },
  habits: { bg: "bg-[hsl(35,70%,93%)]", text: "text-[hsl(35,60%,35%)]" },
  calendar: { bg: "bg-[hsl(220,15%,93%)]", text: "text-[hsl(220,15%,40%)]" },
  shopping: { bg: "bg-[hsl(170,50%,93%)]", text: "text-[hsl(170,40%,35%)]" },
  study: { bg: "bg-[hsl(200,50%,93%)]", text: "text-[hsl(200,40%,35%)]" },
};

interface FeedPost {
  id: string;
  user_id: string;
  content: string;
  post_type: string;
  interest_tag: string | null;
  photos: string[];
  stats: any;
  likes_count: number;
  comments_count: number;
  created_at: string;
  user_display_name?: string;
  user_avatar_url?: string | null;
  liked_by_me?: boolean;
}

interface GroupFeedPostProps {
  post: FeedPost;
  onLike: () => void;
  memberColors: string[];
  members: GroupMember[];
}

const formatTimestamp = (dateStr: string) => {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return `Today · ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" }) + " · " + d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
};

const GroupFeedPost = ({ post, onLike, memberColors, members }: GroupFeedPostProps) => {
  const memberIdx = members.findIndex(m => m.user_id === post.user_id);
  const colorClass = memberColors[memberIdx >= 0 ? memberIdx % memberColors.length : 0];
  const initial = (post.user_display_name || "M")[0].toUpperCase();
  const badgeColors = post.interest_tag ? INTEREST_BADGE_COLORS[post.interest_tag] : null;

  return (
    <div className="bg-card rounded-xl border border-border p-4">
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2.5">
          <div className={`w-10 h-10 rounded-full ${colorClass} flex items-center justify-center text-sm font-bold text-white shrink-0`}>
            {initial}
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">{post.user_display_name || "Member"}</p>
            <p className="text-[11px] text-muted-foreground">{formatTimestamp(post.created_at)}</p>
          </div>
        </div>
        <button className="text-muted-foreground hover:text-foreground p-1">
          <MoreHorizontal size={16} />
        </button>
      </div>

      {/* Interest Badge */}
      {post.interest_tag && badgeColors && (
        <div className="mb-2">
          <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${badgeColors.bg} ${badgeColors.text}`}>
            ✦ {PAGE_LABELS[post.interest_tag as keyof typeof PAGE_LABELS] || post.interest_tag}
          </span>
        </div>
      )}

      {/* Content */}
      {post.content && (
        <p className="text-sm text-foreground mb-3 whitespace-pre-wrap">{post.content}</p>
      )}

      {/* Photos */}
      {post.photos && post.photos.length > 0 && (
        <div className={`mb-3 rounded-xl overflow-hidden ${post.photos.length === 1 ? "" : "grid grid-cols-2 gap-0.5"}`}>
          {post.photos.length === 1 ? (
            <img src={post.photos[0]} alt="" className="w-full max-h-80 object-cover rounded-xl" />
          ) : post.photos.length === 2 ? (
            <>
              <img src={post.photos[0]} alt="" className="w-full h-48 object-cover" />
              <img src={post.photos[1]} alt="" className="w-full h-48 object-cover" />
            </>
          ) : (
            <>
              <img src={post.photos[0]} alt="" className="w-full h-48 object-cover row-span-2" style={{ gridRow: "1 / 3" }} />
              <img src={post.photos[1]} alt="" className="w-full h-[95px] object-cover" />
              <img src={post.photos[2]} alt="" className="w-full h-[95px] object-cover" />
            </>
          )}
        </div>
      )}

      {/* Stats Strip */}
      {post.stats && typeof post.stats === "object" && Object.keys(post.stats).length > 0 && (
        <div className="flex gap-4 p-3 rounded-lg bg-secondary/40 mb-3">
          {Object.entries(post.stats).map(([key, value]) => (
            <div key={key} className="text-center">
              <p className="text-sm font-bold text-foreground">{String(value)}</p>
              <p className="text-[10px] text-muted-foreground capitalize">{key}</p>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-6 pt-2 border-t border-border/40">
        <button onClick={onLike} className="flex items-center gap-1.5 group">
          <Heart
            size={16}
            className={post.liked_by_me ? "fill-[hsl(0,70%,55%)] text-[hsl(0,70%,55%)]" : "text-muted-foreground group-hover:text-foreground"}
          />
          <span className={`text-xs font-medium ${post.liked_by_me ? "text-[hsl(0,70%,55%)]" : "text-muted-foreground"}`}>
            {post.likes_count > 0 ? post.likes_count : ""}
          </span>
        </button>
        <button className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
          <MessageCircle size={16} />
          <span className="text-xs font-medium">{post.comments_count > 0 ? post.comments_count : ""}</span>
        </button>
        <button className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground ml-auto">
          <Share2 size={16} />
          <span className="text-xs font-medium">Share</span>
        </button>
      </div>
    </div>
  );
};

export default GroupFeedPost;
