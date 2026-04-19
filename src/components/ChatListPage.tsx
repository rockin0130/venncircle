import { useState, useEffect, useMemo, useRef } from "react";
import { Search, Plus, MoreHorizontal, MessageCircle, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, Group } from "@/context/AuthContext";
import { useFriendships } from "@/hooks/useFriendships";
import GroupInviteRequestCard from "@/components/GroupInviteRequestCard";

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
  const { user, groups, pendingGroupInvites } = useAuth();
  const { activeFriends } = useFriendships();
  const [previews, setPreviews] = useState<ChatPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [newDmOpen, setNewDmOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!newDmOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setNewDmOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [newDmOpen]);

  // Auto-focus search input when opened
  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

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
    () => previews.filter((p) => (p.group as any)._personal !== true && p.group.id !== "__personal__" && p.group.members.length > 2),
    [previews]
  );
  const dmChats = useMemo(
    () => previews.filter((p) => (p.group as any)._personal !== true && p.group.id !== "__personal__" && p.group.members.length <= 2 && p.lastMessage !== null),
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

  // Friends not already in a DM
  const friendsWithoutDm = useMemo(() => {
    const dmUserIds = new Set<string>();
    dmChats.forEach((p) => {
      const other = p.group.members.find((m) => m.user_id !== user?.id);
      if (other) dmUserIds.add(other.user_id);
    });
    return activeFriends.filter((f) => f.friend && !dmUserIds.has(f.friend.id));
  }, [activeFriends, dmChats, user]);

  const handleStartDm = (friendId: string) => {
    // Find if there's already a group with just these two users
    const existing = dmChats.find((p) => p.group.members.some((m) => m.user_id === friendId));
    if (existing) {
      onOpenChat(existing.group);
    }
    // TODO: Create a new DM group if none exists
    setNewDmOpen(false);
  };

  const renderGroupChatRow = (preview: ChatPreview, index: number) => {
    const coverUrl = preview.group.cover_image_url;

    return (
      <button
        key={preview.group.id}
        onClick={() => onOpenChat(preview.group)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-[rgba(0,0,0,0.03)] transition-colors"
      >
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
              {getMessagePreview(preview)}
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
      <header className="px-5 safe-area-top pt-3 pb-2 flex items-center justify-between shrink-0">
        <h1 className="text-xl font-bold tracking-tight text-foreground">Chats</h1>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => {
              setSearchOpen((v) => !v);
              if (searchOpen) setSearchQuery("");
            }}
            className="w-[26px] h-[26px] rounded-full flex items-center justify-center"
            style={{ background: searchOpen ? "rgba(108,71,255,0.12)" : "rgba(0,0,0,0.04)" }}
            aria-label="Search"
          >
            {searchOpen ? <X size={13} color="#6C47FF" /> : <Search size={13} color="#888" />}
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

      {/* Search bar — only visible when toggled */}
      {searchOpen && (
        <div className="px-5 pb-3 shrink-0 animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="flex items-center gap-2 bg-white rounded-xl px-3 py-2" style={{ border: "0.5px solid rgba(0,0,0,0.07)" }}>
            <Search size={14} className="text-muted-foreground shrink-0" />
            <input
              ref={searchInputRef}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search messages..."
              className="flex-1 bg-transparent text-[12px] outline-none placeholder:text-muted-foreground"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="shrink-0">
                <X size={12} className="text-muted-foreground" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto" style={{ WebkitOverflowScrolling: "touch" }}>
        {/* Pinned: pending group invite requests */}
        {pendingGroupInvites.length > 0 && (
          <div className="px-4 pt-3 pb-1 space-y-2">
            <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-[0.08em] px-1">
              Group invites
            </p>
            {pendingGroupInvites.map((invite) => (
              <GroupInviteRequestCard key={invite.group_id} invite={invite} variant="compact" />
            ))}
          </div>
        )}

        {loading && (
          <div className="flex justify-center py-12">
            <span className="text-xs text-muted-foreground">Loading chats...</span>
          </div>
        )}

        {!loading && filteredGroupChats.length === 0 && filteredDmChats.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <MessageCircle size={40} strokeWidth={1} className="mb-3 opacity-30" />
            <p className="text-xs font-medium">No conversations yet</p>
            <p className="text-[10px] mt-1">Start a chat with a friend to begin</p>
            <button
              onClick={() => setNewDmOpen(true)}
              className="mt-4 px-4 py-1.5 rounded-full text-[11px] font-medium text-white"
              style={{ backgroundColor: "#6C47FF" }}
            >
              Start Chat
            </button>
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

        {/* Direct Messages section — always show header with + button */}
        {!loading && (
          <div className="relative" ref={dropdownRef}>
            <div className="flex items-center justify-between px-5 pt-4 pb-1.5">
              <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-[0.08em]">
                Direct Messages
              </p>
              <button
                onClick={() => setNewDmOpen((v) => !v)}
                className="w-[20px] h-[20px] rounded-full flex items-center justify-center"
                style={{ background: newDmOpen ? "rgba(108,71,255,0.12)" : "rgba(0,0,0,0.06)" }}
                aria-label="New direct message"
              >
                <Plus size={11} color={newDmOpen ? "#6C47FF" : "#888"} />
              </button>
            </div>

            {/* Friends dropdown */}
            {newDmOpen && (
              <div
                className="absolute right-4 z-20 mt-1 w-auto min-w-[180px] max-w-[280px] bg-white overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200"
                style={{
                  border: "0.5px solid rgba(0,0,0,0.08)",
                  boxShadow: "0 6px 20px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.06)",
                  maxHeight: 220,
                  overflowY: "auto",
                  borderRadius: 14,
                }}
              >
                {friendsWithoutDm.length === 0 && activeFriends.length === 0 && (
                  <p className="text-[11px] text-muted-foreground text-center py-3 px-4">No friends yet</p>
                )}
                {friendsWithoutDm.length === 0 && activeFriends.length > 0 && (
                  <p className="text-[11px] text-muted-foreground text-center py-3 px-4">All friends have a DM already</p>
                )}
                {friendsWithoutDm.map((f, i) => {
                  if (!f.friend) return null;
                  const color = DM_AVATAR_COLORS[i % DM_AVATAR_COLORS.length];
                  return (
                    <button
                      key={f.friend.id}
                      onClick={() => handleStartDm(f.friend!.id)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left active:bg-[rgba(0,0,0,0.03)] transition-colors"
                    >
                      <div
                        className="w-[30px] h-[30px] rounded-full overflow-hidden flex items-center justify-center shrink-0"
                        style={{ backgroundColor: f.friend.avatar_url ? undefined : color }}
                      >
                        {f.friend.avatar_url ? (
                          <img src={f.friend.avatar_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-white text-[11px] font-bold">{getInitials(f.friend.display_name)}</span>
                        )}
                      </div>
                      <span className="text-[12px] font-medium text-foreground truncate">{f.friend.display_name}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* DM rows */}
            {filteredDmChats.map((p, i) => renderDmRow(p, i))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatListPage;
