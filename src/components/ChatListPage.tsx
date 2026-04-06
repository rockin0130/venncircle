import { useState, useEffect, useMemo } from "react";
import { Search, Plus, MoreHorizontal, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, Group } from "@/context/AuthContext";

interface LastMessage {
  content: string;
  created_at: string;
  user_id: string;
  metadata?: { type?: string } | null;
}

interface ChatPreview {
  group: Group;
  lastMessage: LastMessage | null;
  unreadCount: number;
}

const GROUP_AVATAR_COLORS = [
  "linear-gradient(135deg, hsl(210,60%,75%), hsl(210,50%,60%))",
  "linear-gradient(135deg, hsl(160,45%,72%), hsl(160,40%,55%))",
  "linear-gradient(135deg, hsl(260,45%,78%), hsl(260,40%,62%))",
  "linear-gradient(135deg, hsl(35,60%,75%), hsl(35,50%,60%))",
  "linear-gradient(135deg, hsl(340,50%,78%), hsl(340,45%,62%))",
  "linear-gradient(135deg, hsl(190,50%,75%), hsl(190,45%,58%))",
];

const DM_AVATAR_COLORS = [
  "hsl(0, 72%, 63%)",
  "hsl(160, 55%, 45%)",
  "hsl(260, 55%, 60%)",
  "hsl(210, 60%, 55%)",
  "hsl(35, 70%, 55%)",
  "hsl(190, 55%, 45%)",
];

const getInitials = (name: string) =>
  name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);

const ChatListPage = ({
  onOpenChat,
  onOpenMore,
}: {
  onOpenChat: (group: Group) => void;
  onOpenMore?: () => void;
}) => {
  const { user, groups } = useAuth();
  const [previews, setPreviews] = useState<ChatPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);

  useEffect(() => {
    if (!user || groups.length === 0) {
      setPreviews([]);
      setLoading(false);
      return;
    }

    const loadPreviews = async () => {
      setLoading(true);
      const groupIds = groups.map((g) => g.id);

      const { data: allMessages } = await supabase
        .from("messages")
        .select("*")
        .in("group_id", groupIds)
        .eq("is_ai_coach", false)
        .order("created_at", { ascending: false })
        .limit(500);

      const lastByGroup = new Map<string, LastMessage>();
      (allMessages || []).forEach((msg: any) => {
        if (!lastByGroup.has(msg.group_id)) {
          lastByGroup.set(msg.group_id, {
            content: msg.content,
            created_at: msg.created_at,
            user_id: msg.user_id,
            metadata: msg.metadata,
          });
        }
      });

      const results: ChatPreview[] = groups.map((g) => ({
        group: g,
        lastMessage: lastByGroup.get(g.id) || null,
        unreadCount: 0,
      }));

      results.sort((a, b) => {
        if (a.lastMessage && b.lastMessage) {
          return new Date(b.lastMessage.created_at).getTime() - new Date(a.lastMessage.created_at).getTime();
        }
        if (a.lastMessage) return -1;
        if (b.lastMessage) return 1;
        return a.group.name.localeCompare(b.group.name);
      });

      setPreviews(results);
      setLoading(false);
    };

    loadPreviews();

    const channel = supabase
      .channel("chat-list-updates")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const msg = payload.new as any;
          setPreviews((prev) => {
            const updated = prev.map((p) => {
              if (p.group.id === msg.group_id) {
                return {
                  ...p,
                  lastMessage: { content: msg.content, created_at: msg.created_at, user_id: msg.user_id, metadata: msg.metadata },
                };
              }
              return p;
            });
            updated.sort((a, b) => {
              if (a.lastMessage && b.lastMessage)
                return new Date(b.lastMessage.created_at).getTime() - new Date(a.lastMessage.created_at).getTime();
              if (a.lastMessage) return -1;
              if (b.lastMessage) return 1;
              return a.group.name.localeCompare(b.group.name);
            });
            return updated;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, groups]);

  const groupChats = useMemo(
    () => previews.filter((p) => !p.group._personal && p.group.id !== "__personal__" && p.group.members.length > 2),
    [previews]
  );
  const dmChats = useMemo(
    () => previews.filter((p) => !p.group._personal && p.group.id !== "__personal__" && p.group.members.length <= 2),
    [previews]
  );

  const filteredGroupChats = useMemo(() => {
    if (!searchQuery.trim()) return groupChats;
    const q = searchQuery.toLowerCase();
    return groupChats.filter((p) =>
      p.group.name.toLowerCase().includes(q) ||
      p.lastMessage?.content?.toLowerCase().includes(q)
    );
  }, [groupChats, searchQuery]);

  const filteredDmChats = useMemo(() => {
    if (!searchQuery.trim()) return dmChats;
    const q = searchQuery.toLowerCase();
    return dmChats.filter((p) =>
      p.group.name.toLowerCase().includes(q) ||
      p.lastMessage?.content?.toLowerCase().includes(q)
    );
  }, [dmChats, searchQuery]);

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    const diffDays = Math.floor(diffHrs / 24);
    if (diffDays === 1) return "Yesterday";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const getSenderName = (preview: ChatPreview) => {
    if (!preview.lastMessage) return "";
    if (preview.lastMessage.user_id === user?.id) return "You";
    const member = preview.group.members.find((m) => m.user_id === preview.lastMessage!.user_id);
    return member?.display_name?.split(" ")[0] || "Someone";
  };

  const getMessagePreview = (preview: ChatPreview) => {
    if (!preview.lastMessage) return "No messages yet";
    const sender = getSenderName(preview);
    const meta = preview.lastMessage.metadata;
    const content = meta?.type === "voice" ? "🎤 Voice memo"
      : meta?.type === "image" ? "📷 Photo"
      : meta?.type === "video" ? "🎥 Video"
      : preview.lastMessage.content;
    return `${sender}: ${content}`;
  };

  const getDmOther = (preview: ChatPreview) => {
    const other = preview.group.members.find((m) => m.user_id !== user?.id);
    return other || null;
  };

  const renderGroupChatRow = (preview: ChatPreview, index: number) => {
    const coverUrl = preview.group.cover_image_url;

    return (
      <button
        key={preview.group.id}
        onClick={() => onOpenChat(preview.group)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-[rgba(0,0,0,0.03)] transition-colors"
      >
        {/* Group avatar — rounded rect with cover photo or gradient */}
        <div
          className="w-[38px] h-[38px] shrink-0 overflow-hidden flex items-center justify-center"
          style={{
            borderRadius: 11,
            background: coverUrl ? undefined : GROUP_AVATAR_COLORS[index % GROUP_AVATAR_COLORS.length],
          }}
        >
          {coverUrl ? (
            <img src={coverUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-white text-[13px] font-bold">{getInitials(preview.group.name)}</span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-[12px] font-medium text-foreground truncate">{preview.group.name}</h3>
            {preview.lastMessage && (
              <span className="text-[10px] text-muted-foreground shrink-0">{formatTime(preview.lastMessage.created_at)}</span>
            )}
          </div>
          <div className="flex items-center justify-between gap-2 mt-0.5">
            <p className="text-[11px] text-muted-foreground truncate">{getMessagePreview(preview)}</p>
            {preview.unreadCount > 0 && (
              <span className="shrink-0 min-w-[18px] h-[18px] rounded-full flex items-center justify-center text-[9px] font-bold text-white px-1" style={{ backgroundColor: "#6C47FF" }}>
                {preview.unreadCount}
              </span>
            )}
          </div>
        </div>
      </button>
    );
  };

  const renderDmRow = (preview: ChatPreview, index: number) => {
    const other = getDmOther(preview);
    const name = other?.display_name || preview.group.name;
    const avatarUrl = other?.avatar_url;
    const color = DM_AVATAR_COLORS[index % DM_AVATAR_COLORS.length];

    return (
      <button
        key={preview.group.id}
        onClick={() => onOpenChat(preview.group)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-[rgba(0,0,0,0.03)] transition-colors"
      >
        {/* Circular avatar with online dot */}
        <div className="relative w-[38px] h-[38px] shrink-0">
          <div
            className="w-full h-full rounded-full overflow-hidden flex items-center justify-center"
            style={{ backgroundColor: avatarUrl ? undefined : color }}
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-white text-[13px] font-bold">{getInitials(name)}</span>
            )}
          </div>
          {/* Online dot — placeholder, always show for now */}
          <div
            className="absolute -bottom-0.5 -right-0.5 w-[9px] h-[9px] rounded-full border-[1.5px] border-white"
            style={{ backgroundColor: "#059669" }}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-[12px] font-medium text-foreground truncate">{name}</h3>
            {preview.lastMessage && (
              <span className="text-[10px] text-muted-foreground shrink-0">{formatTime(preview.lastMessage.created_at)}</span>
            )}
          </div>
          <div className="flex items-center justify-between gap-2 mt-0.5">
            <p className="text-[11px] text-muted-foreground truncate">
              {preview.lastMessage ? getMessagePreview(preview) : "No messages yet"}
            </p>
            {preview.unreadCount > 0 && (
              <span className="shrink-0 min-w-[18px] h-[18px] rounded-full flex items-center justify-center text-[9px] font-bold text-white px-1" style={{ backgroundColor: "#6C47FF" }}>
                {preview.unreadCount}
              </span>
            )}
          </div>
        </div>
      </button>
    );
  };

  return (
    <div className="flex flex-col h-[calc(100svh-5rem)]" style={{ backgroundColor: "#F4F3F0" }}>
      {/* Header */}
      <header className="px-5 pt-12 pb-2 flex items-center justify-between shrink-0">
        <h1 className="text-xl font-bold tracking-tight text-foreground">Chats</h1>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setSearchFocused(true)}
            className="w-[26px] h-[26px] rounded-full flex items-center justify-center"
            style={{ background: "rgba(0,0,0,0.04)" }}
            aria-label="Search"
          >
            <Search size={13} color="#888" />
          </button>
          <button
            className="w-[26px] h-[26px] rounded-full flex items-center justify-center"
            style={{ background: "rgba(0,0,0,0.04)" }}
            aria-label="New chat"
          >
            <Plus size={13} color="#888" />
          </button>
          {onOpenMore && (
            <button
              onClick={onOpenMore}
              className="w-[26px] h-[26px] rounded-full flex items-center justify-center"
              style={{ background: "rgba(0,0,0,0.04)" }}
              aria-label="More"
            >
              <MoreHorizontal size={13} color="#888" />
            </button>
          )}
        </div>
      </header>

      {/* Search bar */}
      <div className="px-5 pb-3 shrink-0">
        <div className="flex items-center gap-2 bg-white rounded-xl px-3 py-2" style={{ border: "0.5px solid rgba(0,0,0,0.07)" }}>
          <Search size={14} className="text-muted-foreground shrink-0" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder="Search messages..."
            className="flex-1 bg-transparent text-[12px] outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto" style={{ WebkitOverflowScrolling: "touch" }}>
        {loading && (
          <div className="flex justify-center py-12">
            <span className="text-xs text-muted-foreground">Loading chats...</span>
          </div>
        )}

        {!loading && previews.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <MessageCircle size={40} strokeWidth={1} className="mb-3 opacity-30" />
            <p className="text-xs font-medium">No chats yet</p>
            <p className="text-[10px] mt-1">Join or create a group to start chatting</p>
          </div>
        )}

        {!loading && filteredGroupChats.length > 0 && (
          <div>
            <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-[0.08em] px-5 pt-3 pb-1.5">
              My Group Chats
            </p>
            {filteredGroupChats.map((p, i) => renderGroupChatRow(p, i))}
          </div>
        )}

        {!loading && filteredDmChats.length > 0 && (
          <div>
            <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-[0.08em] px-5 pt-4 pb-1.5">
              Direct Messages
            </p>
            {filteredDmChats.map((p, i) => renderDmRow(p, i))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatListPage;
