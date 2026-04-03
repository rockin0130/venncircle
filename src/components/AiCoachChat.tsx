import { useState, useEffect, useRef, useCallback } from "react";
import { Send, ArrowLeft, Sparkles, Check, X, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, Group } from "@/context/AuthContext";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

interface CoachMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  metadata?: {
    phase?: string;
    suggestions?: string[];
    draftPlan?: DraftPlan | null;
    context?: any;
  };
}

interface DraftPlan {
  type: "workout" | "event" | "habit" | "meal" | "multi";
  items: DraftItem[];
}

interface DraftItem {
  title: string;
  date?: string;
  time?: string;
  description?: string;
  tag?: string;
  assignee?: string;
  category?: string;
  emoji?: string;
  duration?: string;
  cal?: number;
  exercises?: { name: string; sets: number; reps: string }[];
}



const AiCoachChat = ({
  group,
  onBack,
  initialMessage,
}: {
  group: Group;
  onBack: () => void;
  initialMessage?: string;
}) => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [phase, setPhase] = useState<string>("idle");
  const [context, setContext] = useState<any>({});
  const [expandedPlan, setExpandedPlan] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }, []);

  // Load existing coach messages for this group
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("messages")
        .select("*")
        .eq("group_id", group.id)
        .eq("is_ai_coach", true)
        .order("created_at", { ascending: true })
        .limit(100);

      if (data) {
        setMessages(
          data.map((m: any) => ({
            id: m.id,
            role: (m.metadata as any)?.role === "assistant" ? "assistant" : "user",
            content: m.content,
            created_at: m.created_at,
            metadata: m.metadata,
          }))
        );
      }

      // Load conversation state
      const { data: stateData } = await supabase
        .from("coach_conversations")
        .select("*")
        .eq("group_id", group.id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (stateData) {
        setPhase(stateData.phase);
        setContext(stateData.context as any || {});
      }

      setLoading(false);
      scrollToBottom();
    };
    load();
  }, [group.id, user, scrollToBottom]);

  // Auto-send initial message from launcher
  const initialSentRef = useRef(false);
  useEffect(() => {
    if (initialMessage && !initialSentRef.current && user && !loading) {
      initialSentRef.current = true;
      sendMessage(initialMessage);
    }
  }, [initialMessage, user, loading]);

  const saveConversationState = async (newPhase: string, newContext: any) => {
    if (!user) return;
    await supabase
      .from("coach_conversations")
      .upsert(
        {
          group_id: group.id,
          user_id: user.id,
          phase: newPhase,
          context: newContext,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "group_id,user_id" }
      );
  };

  const sendMessage = async (text?: string) => {
    const messageText = text || input.trim();
    if (!messageText || !user || sending) return;
    setInput("");
    setSending(true);

    // Add user message to UI
    const userMsg: CoachMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: messageText,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    scrollToBottom();

    // Save user message to DB
    await supabase.from("messages").insert({
      group_id: group.id,
      user_id: user.id,
      content: messageText,
      is_ai_coach: true,
      metadata: { role: "user" },
    } as any);

    // Build conversation history for the AI
    const history = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    try {
      const { data, error } = await supabase.functions.invoke("ai-coach", {
        body: {
          message: messageText,
          groupId: group.id,
          conversationHistory: history,
          phase,
          context,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      });

      if (error) throw error;

      const aiReply = data.reply || "I'm not sure how to help with that. Could you try rephrasing?";
      const newPhase = data.phase || "idle";
      const newContext = data.context || context;
      const suggestions = data.suggestions || [];
      const draftPlan = data.draftPlan || null;

      setPhase(newPhase);
      setContext(newContext);

      const aiMsg: CoachMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: aiReply,
        created_at: new Date().toISOString(),
        metadata: { phase: newPhase, suggestions, draftPlan, context: newContext },
      };

      setMessages((prev) => [...prev, aiMsg]);

      // Save AI message to DB
      await supabase.from("messages").insert({
        group_id: group.id,
        user_id: user.id,
        content: aiReply,
        is_ai_coach: true,
        metadata: { role: "assistant", phase: newPhase, suggestions, draftPlan },
      } as any);

      // Save conversation state
      await saveConversationState(newPhase, newContext);

      if (draftPlan) {
        setExpandedPlan(aiMsg.id);
      }

      scrollToBottom();
    } catch (e: any) {
      console.error("Coach error:", e);
      toast.error("Failed to get response from coach");
    } finally {
      setSending(false);
    }
  };

  const handleConfirmPlan = async (draftPlan: DraftPlan) => {
    if (!user) return;
    setSending(true);

    try {
      // Save items based on type
      for (const item of draftPlan.items) {
        if (draftPlan.type === "workout" || item.exercises) {
          await supabase.from("workouts").insert({
            user_id: user.id,
            group_id: group.id,
            title: item.title,
            emoji: item.emoji || "💪",
            duration: item.duration || "30 min",
            cal: item.cal || 0,
            tag: item.tag || "Full Body",
            exercises: item.exercises || [],
            scheduled_date: item.date || new Date().toISOString().slice(0, 10),
          });
        } else if (draftPlan.type === "habit") {
          await supabase.from("habits").insert({
            user_id: user.id,
            group_id: group.id,
            label: item.title,
            category: item.category || "other",
          });
        } else {
          // Event
          const d = item.date ? new Date(item.date + "T00:00:00") : new Date();
          await supabase.from("events").insert({
            user_id: user.id,
            group_id: group.id,
            title: item.title,
            time: item.time || "",
            day: d.getDate(),
            month: d.getMonth() + 1,
            year: d.getFullYear(),
            assignee: item.assignee || "me",
            description: item.description || null,
          });
        }
      }

      // Send confirmation message
      const confirmMsg = `✅ Done! I've saved ${draftPlan.items.length} item${draftPlan.items.length !== 1 ? "s" : ""} to your calendar.`;
      const aiMsg: CoachMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: confirmMsg,
        created_at: new Date().toISOString(),
        metadata: { phase: "idle", suggestions: ["Plan another workout", "Schedule something", "Add a habit"] },
      };
      setMessages((prev) => [...prev, aiMsg]);

      await supabase.from("messages").insert({
        group_id: group.id,
        user_id: user.id,
        content: confirmMsg,
        is_ai_coach: true,
        metadata: { role: "assistant", phase: "idle" },
      } as any);

      setPhase("idle");
      setContext({});
      setExpandedPlan(null);
      await saveConversationState("idle", {});

      toast.success("Plan saved!");
      scrollToBottom();
    } catch (e) {
      console.error("Save error:", e);
      toast.error("Failed to save plan");
    } finally {
      setSending(false);
    }
  };

  const handleRejectPlan = async () => {
    setPhase("gathering");
    const msg = "No problem! What would you like to change?";
    const aiMsg: CoachMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: msg,
      created_at: new Date().toISOString(),
      metadata: { phase: "gathering", suggestions: ["Start over", "Change exercises", "Different schedule"] },
    };
    setMessages((prev) => [...prev, aiMsg]);
    await supabase.from("messages").insert({
      group_id: group.id,
      user_id: user!.id,
      content: msg,
      is_ai_coach: true,
      metadata: { role: "assistant", phase: "gathering" },
    } as any);
    setExpandedPlan(null);
    await saveConversationState("gathering", context);
    scrollToBottom();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  };

  // Get the last message with suggestions
  const lastAiMsg = [...messages].reverse().find((m) => m.role === "assistant");
  const suggestions = lastAiMsg?.metadata?.suggestions || [];

  return (
    <div className="flex flex-col h-[calc(100svh-5rem)]">
      {/* Header */}
      <header className="px-4 pt-12 pb-3 border-b border-border bg-card/80 backdrop-blur-sm flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors -ml-1"
            aria-label="Back to chats"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
            <Sparkles size={18} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold tracking-tight">AI Coach</h1>
            <p className="text-[10px] text-muted-foreground">
              {group.name} · {phase === "gathering" ? "Collecting details..." : phase === "draft_ready" ? "Plan ready for review" : "Ready to help"}
            </p>
          </div>
          {/* Phase indicator */}
          <div className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
            phase === "gathering" ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" :
            phase === "draft_ready" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300" :
            "bg-secondary text-muted-foreground"
          }`}>
            {phase === "gathering" ? "Planning" : phase === "draft_ready" ? "Review" : "Ready"}
          </div>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3" style={{ WebkitOverflowScrolling: "touch" }}>
        {loading && (
          <div className="flex justify-center py-8">
            <span className="text-sm text-muted-foreground">Loading...</span>
          </div>
        )}

        {!loading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-violet-500/20 to-indigo-600/20 flex items-center justify-center mb-4">
              <Sparkles size={28} className="text-violet-500" />
            </div>
            <h2 className="text-lg font-bold mb-1">AI Coach</h2>
            <p className="text-sm text-muted-foreground max-w-[280px] mb-6">
              I'll help you plan workouts, schedule events, and build habits. Just tell me what you need!
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {["Plan a workout", "Schedule an event", "Add a daily habit", "Create a meal plan"].map((s) => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  className="px-3 py-1.5 rounded-full bg-secondary text-xs font-medium hover:bg-secondary/80 active:scale-95 transition-all"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => {
          const isUser = msg.role === "user";
          const hasPlan = msg.metadata?.draftPlan;
          const isExpanded = expandedPlan === msg.id;

          return (
            <div key={msg.id}>
              <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-1`}>
                <div className={`max-w-[85%] ${isUser ? "items-end" : "items-start"}`}>
                  {!isUser && (
                    <div className="flex items-center gap-1.5 mb-0.5 ml-1">
                      <Sparkles size={10} className="text-violet-500" />
                      <span className="text-[10px] font-semibold text-violet-500">AI Coach</span>
                    </div>
                  )}
                  <div
                    className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                      isUser
                        ? "bg-primary text-primary-foreground rounded-br-md"
                        : "bg-secondary text-foreground rounded-bl-md"
                    }`}
                  >
                    {msg.content}
                  </div>
                  <span className={`text-[9px] text-muted-foreground mt-0.5 block ${isUser ? "text-right mr-1" : "ml-1"}`}>
                    {formatTime(msg.created_at)}
                  </span>
                </div>
              </div>

              {/* Draft plan preview */}
              {hasPlan && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="ml-1 mr-4 mt-2 mb-3"
                >
                  <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
                    {/* Plan header */}
                    <button
                      onClick={() => setExpandedPlan(isExpanded ? null : msg.id)}
                      className="w-full flex items-center justify-between px-3.5 py-2.5 hover:bg-secondary/30 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold">
                          📋 Draft Plan · {(msg.metadata!.draftPlan!.items || []).length} item{(msg.metadata!.draftPlan!.items || []).length !== 1 ? "s" : ""}
                        </span>
                      </div>
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>

                    {/* Expanded plan details */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: "auto" }}
                          exit={{ height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="px-3.5 pb-3 space-y-2 border-t border-border/50 pt-2">
                            {(msg.metadata!.draftPlan!.items || []).map((item: DraftItem, idx: number) => (
                              <div key={idx} className="bg-secondary/50 rounded-lg px-3 py-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm">{item.emoji || "📌"}</span>
                                  <span className="text-xs font-bold flex-1">{item.title}</span>
                                </div>
                                {item.date && (
                                  <p className="text-[10px] text-muted-foreground mt-0.5 ml-6">
                                    {item.date}{item.time ? ` · ${item.time}` : ""}
                                    {item.duration ? ` · ${item.duration}` : ""}
                                  </p>
                                )}
                                {item.exercises && item.exercises.length > 0 && (
                                  <div className="mt-1.5 ml-6 space-y-0.5">
                                    {item.exercises.map((ex, i) => (
                                      <p key={i} className="text-[10px] text-muted-foreground">
                                        • {ex.name} — {ex.sets}×{ex.reps}
                                      </p>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}

                            {/* Confirm / Reject buttons */}
                            <div className="flex gap-2 pt-2">
                              <button
                                onClick={() => handleConfirmPlan(msg.metadata!.draftPlan!)}
                                disabled={sending}
                                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 active:scale-[0.98] transition-all disabled:opacity-50"
                              >
                                <Check size={14} /> Confirm & Save
                              </button>
                              <button
                                onClick={handleRejectPlan}
                                disabled={sending}
                                className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-secondary text-foreground text-xs font-medium hover:bg-secondary/80 active:scale-[0.98] transition-all disabled:opacity-50"
                              >
                                <X size={14} /> Change
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              )}
            </div>
          );
        })}

        {/* Sending indicator */}
        {sending && (
          <div className="flex justify-start mb-1">
            <div className="bg-secondary rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Quick suggestions */}
      {suggestions.length > 0 && !sending && (
        <div className="px-4 pb-2 flex gap-1.5 overflow-x-auto flex-shrink-0" style={{ WebkitOverflowScrolling: "touch" }}>
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => sendMessage(s)}
              className="px-3 py-1.5 rounded-full bg-secondary text-[11px] font-medium whitespace-nowrap hover:bg-secondary/80 active:scale-95 transition-all border border-border/50"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="px-4 py-3 border-t border-border bg-card/80 backdrop-blur-sm flex-shrink-0">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={phase === "gathering" ? "Answer the question..." : "Ask your AI coach..."}
            className="flex-1 bg-secondary rounded-full px-4 py-2.5 text-sm outline-none placeholder:text-muted-foreground"
            disabled={sending}
          />
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || sending}
            className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white disabled:opacity-40 transition-opacity active:scale-95"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default AiCoachChat;
