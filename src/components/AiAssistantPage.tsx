import { useState, useEffect, useRef, useCallback } from "react";
import { Send, Mic, MicOff, Sparkles, Loader2, ArrowLeft, CheckCircle2, XCircle, Check, Image as ImageIcon, Camera, X, Menu, Plus, MoreHorizontal } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { useAppContext } from "@/context/AppContext";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { useSpeechToText } from "@/hooks/useSpeechToText";
import ReactMarkdown from "react-markdown";
import AiConversationList, { AiConversation } from "./AiConversationList";

interface AiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  image_url?: string | null;
  metadata?: {
    phase?: string;
    suggestions?: string[];
    actions?: AppAction[];
    actionResults?: ActionResult[];
    pendingWorkoutPlan?: PendingWorkoutPlan;
    workoutPlanExecution?: {
      operationType: "create" | "replace";
      createdWorkoutIds: string[];
    };
  };
}

interface AppAction {
  action_type: string;
  [key: string]: any;
}

interface ActionResult {
  action_type: string;
  success: boolean;
  id?: string;
  error?: string;
  count?: number;
  duplicate?: boolean;
}

interface PendingWorkoutPlan {
  operationType: "create" | "replace";
  createActions: AppAction[];
  deleteWorkoutIds: string[];
  previewText: string;
  createdAt: string;
}

const ACTION_LABELS: Record<string, string> = {
  create_workout: "Created workout",
  delete_workout: "Deleted workout",
  create_event: "Created event",
  delete_event: "Deleted event",
  create_habit: "Created habit",
  delete_habit: "Deleted habit",
  create_section: "Created section",
  delete_section: "Deleted section",
  rename_section: "Renamed section",
  create_sobriety: "Created sobriety tracker",
  delete_sobriety: "Deleted sobriety tracker",
  create_special_day: "Created special day",
  delete_special_day: "Deleted special day",
  send_message: "Sent message",
  create_task: "Created task",
  delete_task: "Deleted task",
  log_meal: "Added meal",
  delete_meal: "Deleted meal",
  create_shopping_list: "Created shopping list",
};

// Thread auto-split: 30 minutes of inactivity = new thread
const THREAD_SPLIT_MS = 30 * 60 * 1000;

const AiAssistantPage = ({ onBack, onOpenMore }: { onBack?: () => void; onOpenMore?: () => void }) => {
  const { user, profile, groups, activeGroup } = useAuth();
  const appContext = useAppContext();
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [voiceActive, setVoiceActive] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Conversation threading state
  const [currentConversation, setCurrentConversation] = useState<AiConversation | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);

  // Image upload state
  const [pendingImage, setPendingImage] = useState<{ file: File; preview: string } | null>(null);
  const [showMediaMenu, setShowMediaMenu] = useState(false);

  // Shopping list ingredient review state
  interface ShopItem { ingredients: string[]; mealTitle: string; mealDate: string }
  const [shopPrompt, setShopPrompt] = useState<ShopItem | null>(null);
  const [shopQueue, setShopQueue] = useState<ShopItem[]>([]);
  const [shopChecked, setShopChecked] = useState<Record<number, boolean>>({});
  const [shopSaving, setShopSaving] = useState(false);

  const groupId = activeGroup?.id || groups[0]?.id || null;

  const fmtDate = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const getWeekMonday = (dateStr: string) => {
    const d = new Date(dateStr + "T00:00:00");
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const mon = new Date(d);
    mon.setDate(mon.getDate() + diff);
    return fmtDate(mon);
  };

  const getWeekSunday = (mondayStr: string) => {
    const d = new Date(mondayStr + "T00:00:00");
    d.setDate(d.getDate() + 6);
    return fmtDate(d);
  };

  const dismissShopPrompt = () => {
    setShopPrompt(null);
    setShopQueue(prev => {
      if (prev.length > 0) {
        const [next, ...rest] = prev;
        setTimeout(() => {
          setShopChecked(Object.fromEntries(next.ingredients.map((_, i) => [i, true])));
          setShopPrompt(next);
        }, 200);
        return rest;
      }
      return [];
    });
  };

  const enqueueShopPrompt = (item: ShopItem) => {
    if (shopPrompt) {
      setShopQueue(prev => [...prev, item]);
    } else {
      setShopChecked(Object.fromEntries(item.ingredients.map((_, i) => [i, true])));
      setShopPrompt(item);
    }
  };

  const saveToShoppingList = async () => {
    if (!user || !shopPrompt) return;
    setShopSaving(true);
    const selectedItems = shopPrompt.ingredients.filter((_, i) => shopChecked[i]);
    if (selectedItems.length === 0) {
      toast.info("No items selected");
      dismissShopPrompt();
      setShopSaving(false);
      return;
    }

    const weekStart = getWeekMonday(shopPrompt.mealDate);
    const weekEnd = getWeekSunday(weekStart);
    const monDate = new Date(weekStart + "T00:00:00");
    const sunDate = new Date(weekEnd + "T00:00:00");
    const weekLabel = `Week of ${monDate.getMonth() + 1}/${monDate.getDate()} (Mon) – ${sunDate.getMonth() + 1}/${sunDate.getDate()} (Sun)`;

    let listQuery = supabase.from("shopping_lists").select("*")
      .eq("user_id", user.id)
      .eq("is_meal_plan", true)
      .eq("date_range_start", weekStart)
      .eq("date_range_end", weekEnd);
    if (groupId) listQuery = listQuery.eq("group_id", groupId);

    const { data: existingLists } = await listQuery;
    let listId: string;

    if (existingLists && existingLists.length > 0) {
      listId = existingLists[0].id;
    } else {
      const insertData: any = {
        user_id: user.id,
        group_id: groupId,
        label: weekLabel,
        date_range_start: weekStart,
        date_range_end: weekEnd,
        is_meal_plan: true,
      };
      const { data: listData, error: listErr } = await supabase.from("shopping_lists").insert(insertData).select().single();
      if (listErr || !listData) {
        toast.error("Failed to create shopping list");
        setShopSaving(false);
        return;
      }
      listId = (listData as any).id;
    }

    const { data: existingItems } = await supabase.from("shopping_list_items").select("*").eq("list_id", listId);
    const existingNames = new Set((existingItems || []).map((it: any) => (it.name as string).toLowerCase().trim()));
    const newItems = selectedItems.filter(name => !existingNames.has(name.toLowerCase().trim()));
    if (newItems.length > 0) {
      const rows = newItems.map(name => ({ list_id: listId, user_id: user.id, name, meal_name: shopPrompt.mealTitle }));
      await supabase.from("shopping_list_items").insert(rows);
    }

    toast.success(existingLists && existingLists.length > 0 ? "Items added to weekly shopping list!" : "Weekly shopping list created!");
    dismissShopPrompt();
    setShopSaving(false);
  };

  const scrollToBottom = useCallback(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }, []);

  const { listening, start: startListening, stop: stopListening, isSupported: speechSupported } = useSpeechToText({
    onResult: (transcript) => {
      setInput(transcript);
      setVoiceActive(false);
      sendMessageDirect(transcript);
    },
    onEnd: () => {},
  });

  // Auto-load or create conversation on mount
  useEffect(() => {
    if (!user) return;
    const initConversation = async () => {
      setLoading(true);
      // Try to find the most recent conversation for this user
      const { data: recent } = await supabase
        .from("ai_conversations")
        .select("*")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(1);

      if (recent && recent.length > 0) {
        const conv = recent[0] as AiConversation;
        const timeSinceUpdate = Date.now() - new Date(conv.updated_at).getTime();

        if (timeSinceUpdate < THREAD_SPLIT_MS) {
          // Continue existing conversation
          setCurrentConversation(conv);
          await loadMessages(conv.id);
        } else {
          // Too old — start fresh (but don't create until first message)
          setCurrentConversation(null);
          setMessages([]);
        }
      } else {
        setCurrentConversation(null);
        setMessages([]);
      }
      setLoading(false);
    };
    initConversation();
  }, [user]);

  const loadMessages = async (conversationId: string) => {
    const { data } = await supabase
      .from("ai_messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(200);

    if (data) {
      setMessages(
        data.map((m: any) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          created_at: m.created_at,
          image_url: m.image_url,
          metadata: m.metadata as any,
        }))
      );
    }
    scrollToBottom();
  };

  const createNewConversation = async (firstMessage: string): Promise<AiConversation> => {
    const title = firstMessage.length > 50 ? firstMessage.slice(0, 50) + "…" : firstMessage;
    const { data, error } = await supabase
      .from("ai_conversations")
      .insert({
        user_id: user!.id,
        title,
        group_id: groupId,
      })
      .select()
      .single();

    if (error || !data) throw new Error("Failed to create conversation");
    const conv = data as AiConversation;
    setCurrentConversation(conv);
    return conv;
  };

  const startNewChat = () => {
    setCurrentConversation(null);
    setMessages([]);
    setShowHistory(false);
    setPendingImage(null);
  };

  const selectConversation = async (conv: AiConversation) => {
    setCurrentConversation(conv);
    setMessages([]);
    setLoading(true);
    setShowHistory(false);
    await loadMessages(conv.id);
    setLoading(false);
  };

  const uploadImage = async (file: File): Promise<string | null> => {
    if (!user) return null;
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${user.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("ai-chat-images").upload(path, file);
    if (error) {
      console.error("Upload error:", error);
      return null;
    }
    const { data: urlData } = supabase.storage.from("ai-chat-images").getPublicUrl(path);
    return urlData.publicUrl;
  };

  const sendMessageDirect = async (text: string, imageFile?: File | null) => {
    if ((!text.trim() && !imageFile && !pendingImage) || !user || sending) return;
    setSending(true);
    setInput("");
    setShowMediaMenu(false);

    const actualImage = imageFile || pendingImage?.file || null;
    const actualText = text.trim();
    setPendingImage(null);

    // Upload image if present
    let imageUrl: string | null = null;
    if (actualImage) {
      imageUrl = await uploadImage(actualImage);
      if (!imageUrl) {
        toast.error("Failed to upload image");
        setSending(false);
        return;
      }
    }

    // Create/get conversation
    let conv = currentConversation;
    if (!conv) {
      try {
        conv = await createNewConversation(actualText || "Image analysis");
      } catch {
        toast.error("Failed to start conversation");
        setSending(false);
        return;
      }
    }

    const userMsg: AiMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: actualText,
      created_at: new Date().toISOString(),
      image_url: imageUrl,
    };
    setMessages((prev) => [...prev, userMsg]);
    scrollToBottom();

    if (!groupId) {
      toast.error("No group context available");
      setSending(false);
      return;
    }

    // Save user message to ai_messages
    await supabase.from("ai_messages").insert({
      conversation_id: conv.id,
      user_id: user.id,
      role: "user",
      content: actualText,
      image_url: imageUrl,
      metadata: {},
    } as any);

    // Update conversation timestamp
    await supabase.from("ai_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conv.id);

    const history = messages.slice(-20).map((m) => ({
      role: m.role,
      content: m.content,
      ...(m.image_url ? { image_url: m.image_url } : {}),
    }));

    try {
      const { data, error } = await supabase.functions.invoke("ai-coach", {
        body: {
          message: actualText,
          groupId,
          conversationId: conv.id,
          conversationHistory: history,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          imageUrl: imageUrl,
          appContext: {
            userName: profile?.display_name,
            groups: groups.map((g) => ({ id: g.id, name: g.name, emoji: g.emoji, memberCount: g.members.length })),
            activeGroupId: activeGroup?.id,
            activeGroupName: activeGroup?.name,
          },
        },
      });

      if (error) throw error;

      const aiReply = data.reply || "I'm here to help! What would you like to do?";
      const suggestions = data.suggestions || [];
      const actions = data.actions || [];
      const actionResults = data.actionResults || [];
      const pendingWorkoutPlan = data.pendingWorkoutPlan || null;
      const workoutPlanExecution = data.workoutPlanExecution || null;

      // Refresh app data if actions were executed
      if (actionResults.length > 0) {
        const hasSuccess = actionResults.some((r: ActionResult) => r.success);
        const hasFailure = actionResults.some((r: ActionResult) => !r.success);
        if (hasSuccess) {
          appContext.refreshData?.();
        }
        if (hasFailure) {
          toast.error("The AI couldn’t complete the full workout update");
        }

        // Shopping list flow for meal actions
        const mealActions = actions.filter((a: AppAction) => a.action_type === "log_meal");
        const successfulMealResults = actionResults.filter((r: ActionResult) => r.action_type === "log_meal" && r.success);
        if (successfulMealResults.length > 0 && mealActions.length > 0) {
          const weekMap = new Map<string, { ingredients: string[]; mealTitles: string[]; mealDate: string }>();
          mealActions.forEach((a: AppAction) => {
            const ingredients = Array.isArray(a.ingredients) ? a.ingredients : [];
            if (ingredients.length === 0) return;
            const mealDate = a.meal_date || new Date().toISOString().slice(0, 10);
            const weekKey = getWeekMonday(mealDate);
            const existing = weekMap.get(weekKey);
            if (existing) {
              existing.ingredients.push(...ingredients);
              existing.mealTitles.push(a.title || "Meal");
            } else {
              weekMap.set(weekKey, { ingredients: [...ingredients], mealTitles: [a.title || "Meal"], mealDate });
            }
          });
          weekMap.forEach((val) => {
            const seen = new Map<string, string>();
            val.ingredients.forEach(ing => {
              const key = ing.toLowerCase().trim();
              if (!seen.has(key)) seen.set(key, ing);
            });
            const dedupedIngredients = Array.from(seen.values());
            if (dedupedIngredients.length > 0) {
              const title = val.mealTitles.length === 1 ? val.mealTitles[0] : `${val.mealTitles.length} meals`;
              enqueueShopPrompt({ ingredients: dedupedIngredients, mealTitle: title, mealDate: val.mealDate });
            }
          });
        }
      }

      const aiMsg: AiMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: aiReply,
        created_at: new Date().toISOString(),
        metadata: { phase: data.phase, suggestions, actions, actionResults, pendingWorkoutPlan, workoutPlanExecution },
      };

      setMessages((prev) => [...prev, aiMsg]);

      // Save AI message to ai_messages
      await supabase.from("ai_messages").insert({
        conversation_id: conv.id,
        user_id: user.id,
        role: "assistant",
        content: aiReply,
        metadata: {
          phase: data.phase,
          suggestions,
          actions: actions.length > 0 ? actions : undefined,
          actionResults: actionResults.length > 0 ? actionResults : undefined,
          pendingWorkoutPlan: pendingWorkoutPlan || undefined,
          workoutPlanExecution: workoutPlanExecution || undefined,
          sourceMessage: actualText || undefined,
        },
      } as any);

      // Auto-title the conversation from first AI reply if it was "New Chat"
      if (conv.title === "New Chat" || messages.length <= 1) {
        const autoTitle = actualText.length > 50 ? actualText.slice(0, 50) + "…" : actualText;
        await supabase.from("ai_conversations").update({ title: autoTitle }).eq("id", conv.id);
        setCurrentConversation((prev) => prev ? { ...prev, title: autoTitle } : prev);
      }

      scrollToBottom();
    } catch (e: any) {
      console.error("AI error:", e);
      toast.error("Failed to get AI response");
    } finally {
      setSending(false);
    }
  };

  const sendMessage = () => sendMessageDirect(input);

  const handleVoiceToggle = () => {
    if (voiceActive || listening) {
      stopListening();
      setVoiceActive(false);
    } else {
      setVoiceActive(true);
      startListening();
    }
  };

  const handleInputFocus = () => {
    if (voiceActive || listening) {
      stopListening();
      setVoiceActive(false);
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image must be under 10MB");
      return;
    }
    const preview = URL.createObjectURL(file);
    setPendingImage({ file, preview });
    setShowMediaMenu(false);
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  };

  const lastAiMsg = [...messages].reverse().find((m) => m.role === "assistant");
  const suggestions = lastAiMsg?.metadata?.suggestions || [];

  return (
    <div className="flex flex-col h-[calc(100svh-5rem)]">
      <header className="px-4 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] pb-3 border-b border-border bg-card/80 backdrop-blur-sm flex-shrink-0">
        <div className="flex items-center gap-3">
          {onBack && (
            <button onClick={onBack} className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors -ml-1">
              <ArrowLeft size={20} />
            </button>
          )}
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg">
            <Sparkles size={20} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold tracking-tight truncate">
              {currentConversation?.title || "AI Assistant"}
            </h1>
            <p className="text-[10px] text-muted-foreground">
              {activeGroup ? `${activeGroup.name} · ` : ""}Can do everything you can
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={startNewChat}
              className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              title="New Chat"
            >
              <Plus size={18} />
            </button>
            <button
              onClick={() => { setShowHistory(!showHistory); setHistoryKey(k => k + 1); }}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                showHistory ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
              title="Chat History"
            >
              <Menu size={18} />
            </button>
            {onOpenMore && (
              <button onClick={onOpenMore} className="w-[30px] h-[30px] rounded-full flex items-center justify-center" style={{ background: "#F4F3F0" }} aria-label="More">
                <MoreHorizontal size={15} color="#888" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* History sidebar overlay */}
      <AnimatePresence>
        {showHistory && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/30"
              onClick={() => setShowHistory(false)}
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed right-0 top-0 bottom-0 z-50 w-72 bg-card border-l border-border shadow-xl flex flex-col"
            >
              <div className="px-4 pt-14 pb-3 border-b border-border flex items-center justify-between">
                <h2 className="text-sm font-bold">Past Conversations</h2>
                <button onClick={() => setShowHistory(false)} className="text-muted-foreground hover:text-foreground">
                  <X size={18} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-3" key={historyKey}>
                <AiConversationList
                  onSelectConversation={selectConversation}
                  onNewChat={startNewChat}
                  activeConversationId={currentConversation?.id}
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3" style={{ WebkitOverflowScrolling: "touch" }}>
        {loading && (
          <div className="flex justify-center py-8">
            <Loader2 size={20} className="animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-violet-500/20 to-indigo-600/20 flex items-center justify-center mb-5">
              <Sparkles size={36} className="text-violet-500" />
            </div>
            <h2 className="text-xl font-bold mb-2">Hey{profile?.display_name ? `, ${profile.display_name}` : ""}! 👋</h2>
            <p className="text-sm text-muted-foreground max-w-[300px] mb-8 leading-relaxed">
              I can do anything in the app — create workouts, schedule events, manage routines, send messages, and more. Just ask!
            </p>
            <div className="flex flex-wrap gap-2 justify-center max-w-[320px]">
              {[
                "Create a 4-day workout plan",
                "Schedule dinner tomorrow at 7pm",
                "Add a morning routines section",
                "Set up a sobriety tracker",
                "Send a message to the group",
                "Delete all my workouts",
              ].map((s) => (
                <button
                  key={s}
                  onClick={() => sendMessageDirect(s)}
                  className="px-3 py-2 rounded-xl bg-secondary text-xs font-medium hover:bg-secondary/80 active:scale-95 transition-all border border-border/50"
                >
                  {s}
                </button>
              ))}
            </div>

            {/* Image upload hint */}
            <div className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
              <ImageIcon size={14} />
              <span>You can also upload photos of workout plans to import them</span>
            </div>
          </div>
        )}

        {messages.map((msg) => {
          const isUser = msg.role === "user";
          const actionResults = msg.metadata?.actionResults || [];
          const hasActions = actionResults.length > 0;

          return (
            <div key={msg.id}>
              <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-1`}>
                <div className={`max-w-[85%] ${isUser ? "items-end" : "items-start"}`}>
                  {!isUser && (
                    <div className="flex items-center gap-1.5 mb-0.5 ml-1">
                      <Sparkles size={10} className="text-violet-500" />
                      <span className="text-[10px] font-semibold text-violet-500">AI</span>
                    </div>
                  )}

                  {/* Image attachment */}
                  {msg.image_url && (
                    <div className={`mb-1 ${isUser ? "flex justify-end" : ""}`}>
                      <img
                        src={msg.image_url}
                        alt="Uploaded"
                        className="rounded-xl max-w-[240px] max-h-[200px] object-cover border border-border"
                      />
                    </div>
                  )}

                  {(msg.content || !msg.image_url) && (
                    <div
                      className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                        isUser
                          ? "bg-primary text-primary-foreground rounded-br-md"
                          : "bg-secondary text-foreground rounded-bl-md"
                      }`}
                    >
                      {isUser ? (
                        msg.content
                      ) : (
                        <div className="prose prose-sm dark:prose-invert max-w-none [&>p]:my-1 [&>ul]:my-1 [&>ol]:my-1">
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Action Results */}
                  {hasActions && (
                    <div className="mt-1.5 ml-1 space-y-1">
                      {actionResults.map((result: ActionResult, idx: number) => (
                        <div
                          key={idx}
                          className={`flex items-center gap-1.5 text-[11px] font-medium ${
                            result.success ? "text-emerald-600" : "text-destructive"
                          }`}
                        >
                          {result.success ? (
                            <CheckCircle2 size={12} />
                          ) : (
                            <XCircle size={12} />
                          )}
                          <span>
                            {ACTION_LABELS[result.action_type] || result.action_type}
                            {!result.success && result.error ? ` — ${result.error}` : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <span className={`text-[9px] text-muted-foreground mt-0.5 block ${isUser ? "text-right mr-1" : "ml-1"}`}>
                    {formatTime(msg.created_at)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}

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

        <AnimatePresence>
          {(voiceActive || listening) && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex justify-center py-6"
            >
              <div className="flex flex-col items-center gap-3">
                <div className={`w-20 h-20 rounded-full flex items-center justify-center ${
                  listening ? "bg-destructive/20 animate-pulse" : "bg-primary/20"
                }`}>
                  <Mic size={32} className={listening ? "text-destructive" : "text-primary"} />
                </div>
                <p className="text-sm font-medium text-muted-foreground">
                  {listening ? "Listening..." : "Starting..."}
                </p>
                <button
                  onClick={() => { stopListening(); setVoiceActive(false); }}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={bottomRef} />
      </div>

      {suggestions.length > 0 && !sending && !voiceActive && !listening && (
        <div className="px-4 pb-2 flex gap-1.5 overflow-x-auto flex-shrink-0" style={{ WebkitOverflowScrolling: "touch" }}>
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => sendMessageDirect(s)}
              className="px-3 py-1.5 rounded-full bg-secondary text-[11px] font-medium whitespace-nowrap hover:bg-secondary/80 active:scale-95 transition-all border border-border/50"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Pending image preview */}
      {pendingImage && (
        <div className="px-4 pb-2 flex-shrink-0">
          <div className="relative inline-block">
            <img src={pendingImage.preview} alt="Preview" className="h-20 rounded-xl border border-border object-cover" />
            <button
              onClick={() => { URL.revokeObjectURL(pendingImage.preview); setPendingImage(null); }}
              className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow"
            >
              <X size={12} />
            </button>
          </div>
        </div>
      )}

      <div className="px-4 py-3 border-t border-border bg-card/80 backdrop-blur-sm flex-shrink-0">
        <div className="flex items-center gap-2">
          {/* Media button */}
          <div className="relative">
            <button
              onClick={() => setShowMediaMenu(!showMediaMenu)}
              className="w-10 h-10 rounded-full flex items-center justify-center bg-secondary text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
            >
              <ImageIcon size={18} />
            </button>

            <AnimatePresence>
              {showMediaMenu && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setShowMediaMenu(false)} />
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.95 }}
                    className="absolute bottom-12 left-0 z-40 bg-card border border-border rounded-xl shadow-lg overflow-hidden w-48"
                  >
                    <button
                      onClick={() => cameraInputRef.current?.click()}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-secondary transition-colors"
                    >
                      <Camera size={16} className="text-primary" />
                      Take Photo
                    </button>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-secondary transition-colors border-t border-border/50"
                    >
                      <ImageIcon size={16} className="text-primary" />
                      Choose Photo
                    </button>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          {/* Hidden file inputs */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageSelect}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleImageSelect}
          />

          {speechSupported && (
            <button
              onClick={handleVoiceToggle}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all flex-shrink-0 ${
                listening || voiceActive
                  ? "bg-destructive/20 text-destructive animate-pulse"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {listening || voiceActive ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
          )}
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={handleInputFocus}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder={pendingImage ? "Describe this image…" : "Ask me anything..."}
            className="flex-1 bg-secondary rounded-full px-4 py-2.5 text-sm outline-none placeholder:text-muted-foreground"
            disabled={sending}
          />
          <button
            onClick={sendMessage}
            disabled={(!input.trim() && !pendingImage) || sending}
            className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white disabled:opacity-40 transition-opacity active:scale-95 flex-shrink-0"
          >
            <Send size={18} />
          </button>
        </div>
      </div>

      {/* Shopping list ingredient review popup */}
      <AnimatePresence>
        {shopPrompt && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/40 flex items-end justify-center"
            onClick={() => dismissShopPrompt()}
          >
            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="w-full max-w-md bg-card rounded-t-2xl max-h-[75dvh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex-shrink-0 px-5 pt-5 pb-3">
                <div className="w-10 h-1 bg-muted rounded-full mx-auto mb-4" />
                <h3 className="text-base font-bold text-foreground">🛒 Add to Shopping List?</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Ingredients from <span className="font-semibold text-foreground">{shopPrompt.mealTitle}</span> — uncheck items you already have at home.
                </p>
              </div>
              <div className="flex-1 overflow-y-auto px-5 pb-3" style={{ WebkitOverflowScrolling: "touch" }}>
                {shopPrompt.ingredients.map((ing, i) => (
                  <label key={i} className="flex items-center gap-3 py-2 border-b border-border/30 last:border-0 cursor-pointer">
                    <button
                      onClick={() => setShopChecked(prev => ({ ...prev, [i]: !prev[i] }))}
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all ${
                        shopChecked[i]
                          ? "bg-primary border-primary"
                          : "border-muted-foreground/30"
                      }`}
                    >
                      {shopChecked[i] && <Check size={12} className="text-primary-foreground" />}
                    </button>
                    <span className={`text-sm ${shopChecked[i] ? "text-foreground" : "text-muted-foreground line-through"}`}>
                      {ing}
                    </span>
                  </label>
                ))}
              </div>
              <div className="flex-shrink-0 px-5 pb-6 pt-3 flex gap-2">
                <button
                  onClick={() => dismissShopPrompt()}
                  className="flex-1 py-2.5 rounded-xl bg-secondary text-foreground text-sm font-semibold"
                >
                  Skip
                </button>
                <button
                  onClick={saveToShoppingList}
                  disabled={shopSaving}
                  className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {shopSaving ? <Loader2 size={14} className="animate-spin" /> : null}
                  Add to Shopping List
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AiAssistantPage;
