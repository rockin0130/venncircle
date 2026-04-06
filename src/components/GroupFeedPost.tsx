import { useState, useRef, useEffect } from "react";
import { Heart, MessageCircle, Share2, MoreHorizontal, Send, Loader2 } from "lucide-react";
import { PAGE_LABELS } from "@/context/AuthContext";
import type { GroupMember } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";

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

interface Comment {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  display_name?: string;
  avatar_url?: string | null;
}

interface GroupFeedPostProps {
  post: FeedPost;
  onLike: () => void;
  memberColors: string[];
  members: GroupMember[];
  currentUserId?: string;
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

const GroupFeedPost = ({ post, onLike, memberColors, members, currentUserId }: GroupFeedPostProps) => {
  const memberIdx = members.findIndex(m => m.user_id === post.user_id);
  const colorClass = memberColors[memberIdx >= 0 ? memberIdx % memberColors.length : 0];
  const initial = (post.user_display_name || "M")[0].toUpperCase();
  const badgeColors = post.interest_tag ? INTEREST_BADGE_COLORS[post.interest_tag] : null;

  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [sending, setSending] = useState(false);
  const [localCommentsCount, setLocalCommentsCount] = useState(post.comments_count);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLocalCommentsCount(post.comments_count);
  }, [post.comments_count]);

  const fetchComments = async () => {
    setLoadingComments(true);
    const { data, error } = await supabase
      .from("group_feed_comments")
      .select("*")
      .eq("post_id", post.id)
      .order("created_at", { ascending: true })
      .limit(100);

    if (error) { console.error(error); setLoadingComments(false); return; }
    if (!data || data.length === 0) { setComments([]); setLoadingComments(false); return; }

    const userIds = [...new Set(data.map((c: any) => c.user_id))];
    const { data: profiles } = await supabase.rpc("get_profiles_by_ids", { _user_ids: userIds });
    const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

    setComments(data.map((c: any) => {
      const prof = profileMap.get(c.user_id);
      return { ...c, display_name: prof?.display_name || "Member", avatar_url: prof?.avatar_url || null };
    }));
    setLoadingComments(false);
  };

  const handleToggleComments = () => {
    const next = !commentsOpen;
    setCommentsOpen(next);
    if (next && comments.length === 0) fetchComments();
    if (next) setTimeout(() => inputRef.current?.focus(), 150);
  };

  const handleSendComment = async () => {
    const text = commentText.trim();
    if (!text || !currentUserId) return;
    setSending(true);
    const { error } = await supabase.from("group_feed_comments").insert({
      post_id: post.id,
      user_id: currentUserId,
      content: text,
    });
    if (!error) {
      await supabase.from("group_feed_posts").update({ comments_count: localCommentsCount + 1 }).eq("id", post.id);
      setLocalCommentsCount(prev => prev + 1);
      setCommentText("");
      fetchComments();
    }
    setSending(false);
  };

  const getCommentMemberColor = (userId: string) => {
    const idx = members.findIndex(m => m.user_id === userId);
    return memberColors[idx >= 0 ? idx % memberColors.length : 0];
  };

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
        <button onClick={handleToggleComments} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
          <MessageCircle size={16} className={commentsOpen ? "text-primary" : ""} />
          <span className={`text-xs font-medium ${commentsOpen ? "text-primary" : ""}`}>
            {localCommentsCount > 0 ? localCommentsCount : ""}
          </span>
        </button>
        <button className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground ml-auto">
          <Share2 size={16} />
          <span className="text-xs font-medium">Share</span>
        </button>
      </div>

      {/* Comments Section */}
      {commentsOpen && (
        <div className="mt-3 pt-3 border-t border-border/30">
          {loadingComments ? (
            <div className="flex justify-center py-3">
              <Loader2 size={16} className="animate-spin text-muted-foreground" />
            </div>
          ) : comments.length > 0 ? (
            <div className="space-y-2.5 mb-3 max-h-60 overflow-y-auto">
              {comments.map((c) => {
                const cColor = getCommentMemberColor(c.user_id);
                const cInitial = (c.display_name || "M")[0].toUpperCase();
                return (
                  <div key={c.id} className="flex gap-2">
                    <div className={`w-7 h-7 rounded-full ${cColor} flex items-center justify-center text-[10px] font-bold text-white shrink-0 mt-0.5`}>
                      {cInitial}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="bg-secondary/50 rounded-xl px-3 py-2">
                        <p className="text-[12px] font-semibold text-foreground">{c.display_name}</p>
                        <p className="text-[13px] text-foreground whitespace-pre-wrap">{c.content}</p>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5 ml-1">{formatTimestamp(c.created_at)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-[12px] text-muted-foreground text-center py-2 mb-2">No comments yet</p>
          )}

          {/* Comment Input */}
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              placeholder="Write a comment..."
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendComment(); } }}
              className="flex-1 text-sm bg-secondary/40 rounded-full px-3.5 py-2 outline-none border border-border/50 focus:border-primary/40 placeholder:text-muted-foreground/60 transition-colors"
            />
            <button
              onClick={handleSendComment}
              disabled={!commentText.trim() || sending}
              className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0 disabled:opacity-40 transition-opacity"
            >
              {sending ? <Loader2 size={14} className="animate-spin text-primary-foreground" /> : <Send size={14} className="text-primary-foreground" />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default GroupFeedPost;
