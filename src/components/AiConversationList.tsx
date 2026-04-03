import { useState, useEffect } from "react";
import { Plus, Sparkles, Trash2, MessageSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";

export interface AiConversation {
  id: string;
  title: string;
  group_id: string | null;
  created_at: string;
  updated_at: string;
}

const AiConversationList = ({
  onSelectConversation,
  onNewChat,
  activeConversationId,
}: {
  onSelectConversation: (conv: AiConversation) => void;
  onNewChat: () => void;
  activeConversationId?: string | null;
}) => {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<AiConversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("ai_conversations")
        .select("*")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(50);
      setConversations((data as AiConversation[]) || []);
      setLoading(false);
    };
    load();
  }, [user]);

  const deleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this conversation?")) return;
    await supabase.from("ai_conversations").delete().eq("id", id);
    setConversations((prev) => prev.filter((c) => c.id !== id));
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    }
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <div className="space-y-1">
      <button
        onClick={onNewChat}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-primary/10 hover:bg-primary/15 text-primary text-sm font-semibold transition-colors"
      >
        <Plus size={16} />
        New Chat
      </button>

      {loading && (
        <div className="py-6 text-center text-xs text-muted-foreground">Loading...</div>
      )}

      {!loading && conversations.length === 0 && (
        <div className="py-8 text-center text-muted-foreground">
          <MessageSquare size={32} strokeWidth={1} className="mx-auto mb-2 opacity-40" />
          <p className="text-xs">No past conversations</p>
        </div>
      )}

      {conversations.map((conv) => (
        <button
          key={conv.id}
          onClick={() => onSelectConversation(conv)}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-sm transition-colors group ${
            activeConversationId === conv.id
              ? "bg-secondary font-semibold"
              : "hover:bg-secondary/50"
          }`}
        >
          <Sparkles size={14} className="text-violet-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="truncate text-foreground">{conv.title}</p>
            <p className="text-[10px] text-muted-foreground">{formatDate(conv.updated_at)}</p>
          </div>
          <button
            onClick={(e) => deleteConversation(conv.id, e)}
            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all shrink-0"
          >
            <Trash2 size={12} />
          </button>
        </button>
      ))}
    </div>
  );
};

export default AiConversationList;
