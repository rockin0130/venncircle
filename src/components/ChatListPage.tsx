import { useState, useEffect } from "react";
import { MessageCircle, Settings } from "lucide-react";
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

const ChatListPage = ({
  onOpenChat,
  onOpenSettings,
}: {
  onOpenChat: (group: Group) => void;
  onOpenSettings?: () => void;
}) => {
  const { user, groups } = useAuth();
  const [previews, setPreviews] = useState<ChatPreview[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || groups.length === 0) {
      setPreviews([]);
      setLoading(false);
      return;
    }

    const loadPreviews = async () => {
      setLoading(true);
      const groupIds = groups.map((g) => g.id);

      // Fetch the last message per group
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

      // Sort: groups with recent messages first, then by group name
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

    // Subscribe to new messages to update previews live
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
                  lastMessage: { content: msg.content, created_at: msg.created_at, user_id: msg.user_id },
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

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    }
    if (d.toDateString() === yesterday.toDateString()) {
      return "Yesterday";
    }
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const getSenderName = (preview: ChatPreview) => {
    if (!preview.lastMessage) return "";
    if (preview.lastMessage.user_id === user?.id) return "You";
    const member = preview.group.members.find((m) => m.user_id === preview.lastMessage!.user_id);
    return member?.display_name?.split(" ")[0] || "Someone";
  };

  const getInitials = (name: string) =>
    name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

  const getMemberAvatars = (group: Group) => {
    const others = group.members.filter((m) => m.user_id !== user?.id);
    return others.slice(0, 3);
  };

  return (
    <div className="px-5 flex flex-col h-[calc(100svh-5rem)]">
      {/* Header */}
      <header className="pt-12 pb-4 flex items-center justify-between flex-shrink-0">
        <h1 className="text-[1.75rem] font-bold tracking-tight">Chats</h1>
        {onOpenSettings && (
          <button
            onClick={onOpenSettings}
            className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            aria-label="Settings"
          >
            <Settings size={18} />
          </button>
        )}
      </header>

      {/* Chat list */}
      <div className="flex-1 overflow-y-auto -webkit-overflow-scrolling-touch">
        {loading && (
          <div className="flex justify-center py-12">
            <span className="text-sm text-muted-foreground">Loading chats...</span>
          </div>
        )}

        {!loading && previews.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <MessageCircle size={48} strokeWidth={1} className="mb-4 opacity-40" />
            <p className="text-sm font-medium">No group chats yet</p>
            <p className="text-xs mt-1">Join or create a group to start chatting</p>
          </div>
        )}


        {/* Group chats */}
        {!loading && previews.length > 0 && (
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1 pt-3 pb-2">
            Group Chats
          </p>
        )}

        {!loading &&
          previews.map((preview) => {
            const avatars = getMemberAvatars(preview.group);
            const senderName = getSenderName(preview);

            return (
              <button
                key={preview.group.id}
                onClick={() => onOpenChat(preview.group)}
                className="w-full flex items-center gap-3 px-1 py-3.5 border-b border-border/50 text-left hover:bg-secondary/40 active:scale-[0.98] transition-all"
              >
                {/* Avatar cluster */}
                <div className="w-12 h-12 relative flex-shrink-0">
                  {avatars.length === 0 ? (
                    <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center text-lg">
                      {preview.group.emoji}
                    </div>
                  ) : avatars.length === 1 ? (
                    <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center overflow-hidden">
                      {avatars[0].avatar_url ? (
                        <img src={avatars[0].avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-sm font-bold text-foreground">
                          {getInitials(avatars[0].display_name || "?")}
                        </span>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="absolute top-0 left-0 w-8 h-8 rounded-full bg-secondary flex items-center justify-center overflow-hidden ring-2 ring-background z-10">
                        {avatars[0].avatar_url ? (
                          <img src={avatars[0].avatar_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-[10px] font-bold text-foreground">
                            {getInitials(avatars[0].display_name || "?")}
                          </span>
                        )}
                      </div>
                      <div className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-secondary flex items-center justify-center overflow-hidden ring-2 ring-background">
                        {avatars[1].avatar_url ? (
                          <img src={avatars[1].avatar_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-[10px] font-bold text-foreground">
                            {getInitials(avatars[1].display_name || "?")}
                          </span>
                        )}
                      </div>
                      {avatars.length > 2 && (
                        <div className="absolute bottom-0 left-4 w-6 h-6 rounded-full bg-muted flex items-center justify-center ring-2 ring-background z-20">
                          <span className="text-[8px] font-bold text-muted-foreground">+{avatars.length - 2}</span>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Text content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="text-sm font-semibold truncate text-foreground">{preview.group.name}</h3>
                    {preview.lastMessage && (
                      <span className="text-[10px] text-muted-foreground flex-shrink-0">
                        {formatTime(preview.lastMessage.created_at)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p className="text-xs text-muted-foreground truncate">
                      {preview.lastMessage
                        ? `${senderName}: ${
                            preview.lastMessage.metadata?.type === "voice" ? "🎤 Voice memo" :
                            preview.lastMessage.metadata?.type === "image" ? "📷 Photo" :
                            preview.lastMessage.metadata?.type === "video" ? "🎥 Video" :
                            preview.lastMessage.content
                          }`
                        : `${preview.group.members.length} member${preview.group.members.length !== 1 ? "s" : ""} · No messages yet`}
                    </p>
                    {preview.unreadCount > 0 && (
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                        {preview.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
      </div>
    </div>
  );
};

export default ChatListPage;
