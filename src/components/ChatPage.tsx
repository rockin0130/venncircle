import { useState, useEffect, useRef, useCallback } from "react";
import { Send, ArrowLeft, Mic, Square, Play, Pause, X, Plus, Camera, Image, Film, Images } from "lucide-react";
import ChatAlbum from "@/components/ChatAlbum";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, Group } from "@/context/AuthContext";
import { usePresence } from "@/hooks/usePresence";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

interface MessageMetadata {
  type?: "voice" | "image" | "video";
  mediaUrl?: string;
  duration?: number;
  mimeType?: string;
  fileName?: string;
  thumbnailUrl?: string;
}

interface Message {
  id: string;
  group_id: string;
  user_id: string;
  content: string;
  created_at: string;
  metadata?: MessageMetadata | null;
}

const BUBBLE_COLORS = [
  "hsl(0, 72%, 63%)",
  "hsl(160, 55%, 45%)",
  "hsl(260, 55%, 60%)",
  "hsl(35, 70%, 55%)",
  "hsl(190, 55%, 45%)",
  "hsl(340, 55%, 58%)",
];

const getInitials = (name: string) =>
  name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);

const ChatPage = ({
  group,
  onBack,
}: {
  group: Group;
  onBack: () => void;
}) => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [uploading, setUploading] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);

  const [playingId, setPlayingId] = useState<string | null>(null);
  const [playbackProgress, setPlaybackProgress] = useState<Record<string, number>>({});
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [showAlbum, setShowAlbum] = useState(false);

  const isDm = group.members.length <= 2;
  const otherMember = isDm ? group.members.find((m) => m.user_id !== user?.id) : null;

  const memberMap = new Map<string, { name: string; avatar: string | null; color: string }>();
  group.members.forEach((m, i) => {
    memberMap.set(m.user_id, {
      name: m.display_name || "Member",
      avatar: m.avatar_url,
      color: BUBBLE_COLORS[i % BUBBLE_COLORS.length],
    });
  });

  const scrollToBottom = useCallback(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }, []);

  useEffect(() => {
    if (!user) return;

    const loadMessages = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("group_id", group.id)
        .eq("is_ai_coach", false)
        .order("created_at", { ascending: true })
        .limit(200);

      if (data && !error) setMessages(data as Message[]);
      setLoading(false);
      scrollToBottom();
    };

    loadMessages();

    const channel = supabase
      .channel(`chat-${group.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `group_id=eq.${group.id}` },
        (payload) => {
          const newMsg = payload.new as any;
          if (newMsg.is_ai_coach) return;
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg as Message];
          });
          scrollToBottom();
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "messages", filter: `group_id=eq.${group.id}` },
        (payload) => {
          const deletedId = (payload.old as any).id;
          setMessages((prev) => prev.filter((m) => m.id !== deletedId));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [group.id, user, scrollToBottom]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); }
    };
  }, []);

  const handleSend = async () => {
    if (!newMessage.trim() || !user) return;
    const content = newMessage.trim();
    setNewMessage("");

    const { error } = await supabase.from("messages").insert({
      group_id: group.id,
      user_id: user.id,
      content,
    });

    if (error) {
      toast.error("Failed to send message");
      setNewMessage(content);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  // Voice recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : "audio/webm";

      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        const blob = new Blob(chunksRef.current, { type: mimeType });
        if (blob.size > 0 && recordingDuration > 0) {
          await uploadAndSendMedia(blob, "voice", mimeType);
        }
      };

      recorder.start(100);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingDuration(0);
      timerRef.current = setInterval(() => setRecordingDuration((d) => d + 1), 1000);
    } catch {
      toast.error("Microphone access denied");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") mediaRecorderRef.current.stop();
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setIsRecording(false);
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    chunksRef.current = [];
    setIsRecording(false);
    setRecordingDuration(0);
  };

  // Media upload
  const uploadAndSendMedia = async (blob: Blob, type: "voice" | "image" | "video", mimeType: string) => {
    if (!user) return;
    setUploading(true);
    try {
      const ext = mimeType.includes("webm") ? "webm" : mimeType.includes("mp4") ? "mp4"
        : mimeType.includes("jpeg") || mimeType.includes("jpg") ? "jpg"
        : mimeType.includes("png") ? "png" : mimeType.includes("gif") ? "gif"
        : mimeType.includes("webp") ? "webp" : mimeType.includes("quicktime") ? "mov"
        : mimeType.includes("wav") ? "wav" : mimeType.includes("ogg") ? "ogg" : "bin";

      const fileName = `${user.id}/${Date.now()}_${type}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("chat-media").upload(fileName, blob, { contentType: mimeType, upsert: false });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("chat-media").getPublicUrl(fileName);
      const metadata: MessageMetadata = { type, mediaUrl: urlData.publicUrl, mimeType, ...(type === "voice" ? { duration: recordingDuration } : {}) };
      const contentLabel = type === "voice" ? "🎤 Voice memo" : type === "image" ? "📷 Photo" : "🎥 Video";

      const { error } = await supabase.from("messages").insert({ group_id: group.id, user_id: user.id, content: contentLabel, metadata: metadata as any });
      if (error) throw error;
      setRecordingDuration(0);
    } catch (err: any) {
      console.error("Upload error:", err);
      toast.error("Failed to send media");
    } finally {
      setUploading(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>, type: "image" | "video") => {
    const file = e.target.files?.[0];
    if (!file) return;
    setShowAttachMenu(false);
    const maxSize = type === "video" ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > maxSize) { toast.error(`File too large. Max ${type === "video" ? "50" : "10"}MB`); return; }
    await uploadAndSendMedia(file, type, file.type);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Audio playback
  const togglePlayback = (msgId: string, url: string) => {
    if (playingId === msgId) {
      audioRef.current?.pause();
      setPlayingId(null);
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
      return;
    }
    if (audioRef.current) { audioRef.current.pause(); if (progressTimerRef.current) clearInterval(progressTimerRef.current); }
    const audio = new Audio(url);
    audioRef.current = audio;
    setPlayingId(msgId);
    audio.play().catch(() => toast.error("Playback failed"));
    progressTimerRef.current = setInterval(() => {
      if (audio.duration) setPlaybackProgress((p) => ({ ...p, [msgId]: (audio.currentTime / audio.duration) * 100 }));
    }, 100);
    audio.onended = () => {
      setPlayingId(null);
      setPlaybackProgress((p) => ({ ...p, [msgId]: 0 }));
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    };
  };

  const formatDuration = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
  const formatTime = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  const formatDateSeparator = (iso: string) => {
    const d = new Date(iso);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return "Today";
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  // Group messages into sequences by sender
  const messagesWithDates: (Message | { type: "date"; label: string })[] = [];
  let lastDate = "";
  messages.forEach((msg) => {
    const msgDate = new Date(msg.created_at).toDateString();
    if (msgDate !== lastDate) {
      messagesWithDates.push({ type: "date", label: formatDateSeparator(msg.created_at) });
      lastDate = msgDate;
    }
    messagesWithDates.push(msg);
  });

  // Check if message is first in a sender sequence
  const isFirstInSequence = (idx: number) => {
    if (idx === 0) return true;
    const prev = messagesWithDates[idx - 1];
    if ("type" in prev) return true;
    const curr = messagesWithDates[idx] as Message;
    return (prev as Message).user_id !== curr.user_id;
  };

  const isLastInSequence = (idx: number) => {
    if (idx === messagesWithDates.length - 1) return true;
    const next = messagesWithDates[idx + 1];
    if ("type" in next) return true;
    const curr = messagesWithDates[idx] as Message;
    return (next as Message).user_id !== curr.user_id;
  };

  // Render helpers
  const renderVoiceMemo = (msg: Message, isMe: boolean) => {
    const meta = msg.metadata as MessageMetadata;
    if (!meta?.mediaUrl) return null;
    const isPlaying = playingId === msg.id;
    const progress = playbackProgress[msg.id] || 0;

    return (
      <div className="flex items-center gap-2.5 min-w-[180px]">
        <button
          onClick={(e) => { e.stopPropagation(); togglePlayback(msg.id, meta.mediaUrl!); }}
          className="w-[30px] h-[30px] rounded-full flex items-center justify-center shrink-0"
          style={{ backgroundColor: isMe ? "rgba(255,255,255,0.2)" : "#6C47FF" }}
        >
          {isPlaying ? <Pause size={12} className="text-white" /> : <Play size={12} className="text-white ml-0.5" />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-[2px] h-[16px]">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="w-[2.5px] rounded-full"
                style={{
                  height: `${Math.random() * 10 + 4}px`,
                  backgroundColor: isMe ? "rgba(255,255,255,0.5)" : "rgba(108,71,255,0.4)",
                  opacity: progress > (i / 12) * 100 ? 1 : 0.4,
                }}
              />
            ))}
          </div>
          <span className={`text-[9px] mt-0.5 block ${isMe ? "text-white/60" : "text-muted-foreground"}`}>
            {meta.duration ? formatDuration(meta.duration) : "0:00"}
          </span>
        </div>
      </div>
    );
  };

  const renderImage = (msg: Message) => {
    const meta = msg.metadata as MessageMetadata;
    if (!meta?.mediaUrl) return null;
    return (
      <button onClick={() => setPreviewImage(meta.mediaUrl!)} className="block overflow-hidden max-w-[220px]">
        <img src={meta.mediaUrl} alt="Shared photo" className="w-full h-auto max-h-[260px] object-cover" loading="lazy" />
      </button>
    );
  };

  const renderVideo = (msg: Message) => {
    const meta = msg.metadata as MessageMetadata;
    if (!meta?.mediaUrl) return null;
    return (
      <div className="overflow-hidden max-w-[250px]">
        <video src={meta.mediaUrl} controls playsInline preload="metadata" className="w-full h-auto max-h-[260px]" />
      </div>
    );
  };

  const renderMessageContent = (msg: Message, isMe: boolean) => {
    const meta = msg.metadata as MessageMetadata | null;
    if (meta?.type === "voice") return renderVoiceMemo(msg, isMe);
    if (meta?.type === "image") return renderImage(msg);
    if (meta?.type === "video") return renderVideo(msg);
    return <span className="text-[13px] leading-relaxed">{msg.content}</span>;
  };

  const onlineUserIds = usePresence(`group:${group.id}`);
  const onlineMemberCount = group.members.filter((m) => m.status === "active" && (m.user_id === user?.id || onlineUserIds.has(m.user_id))).length;

  if (showAlbum) {
    return <ChatAlbum groupId={group.id} onBack={() => setShowAlbum(false)} />;
  }

  const coverUrl = group.cover_image_url;

  return (
    <div className="flex flex-col h-[calc(100svh-5rem)]" style={{ backgroundColor: "#F4F3F0" }}>
      {/* Header */}
      <header className="px-3 safe-area-top pt-3 pb-2.5 bg-white shrink-0" style={{ borderBottom: "0.5px solid rgba(0,0,0,0.07)" }}>
        <div className="flex items-center gap-2.5">
          <button onClick={onBack} className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground -ml-1" aria-label="Back">
            <ArrowLeft size={20} />
          </button>

          {isDm ? (
            <>
              {/* DM avatar — circular */}
              <div className="w-[30px] h-[30px] rounded-full overflow-hidden flex items-center justify-center shrink-0" style={{ backgroundColor: otherMember?.avatar_url ? undefined : BUBBLE_COLORS[0] }}>
                {otherMember?.avatar_url ? (
                  <img src={otherMember.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-white text-[11px] font-bold">{getInitials(otherMember?.display_name || "?")}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-[14px] font-semibold truncate">{otherMember?.display_name || group.name}</h1>
                <p className="text-[10px]" style={{ color: "#059669" }}>Online now</p>
              </div>
            </>
          ) : (
            <>
              {/* Group avatar — rounded rect */}
              <div className="w-[30px] h-[30px] overflow-hidden flex items-center justify-center shrink-0" style={{ borderRadius: 9, background: coverUrl ? undefined : "linear-gradient(135deg, hsl(210,60%,75%), hsl(210,50%,60%))" }}>
                {coverUrl ? (
                  <img src={coverUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-white text-[10px] font-bold">{getInitials(group.name)}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-[14px] font-semibold truncate">{group.name}</h1>
                <p className="text-[10px] text-muted-foreground">{group.members.length} members · {onlineMemberCount} online</p>
              </div>
            </>
          )}

          <button onClick={() => setShowAlbum(true)} className="w-[24px] h-[24px] rounded-full flex items-center justify-center" style={{ background: "rgba(0,0,0,0.04)" }} aria-label="Album">
            <Images size={13} color="#888" />
          </button>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3" style={{ WebkitOverflowScrolling: "touch" }}>
        {loading && <div className="flex justify-center py-8"><span className="text-xs text-muted-foreground">Loading messages...</span></div>}

        {!loading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <span className="text-3xl mb-2 opacity-30">💬</span>
            <p className="text-xs font-medium">No messages yet</p>
            <p className="text-[10px] mt-0.5">Start the conversation!</p>
          </div>
        )}

        {messagesWithDates.map((item, idx) => {
          if ("type" in item && item.type === "date") {
            return (
              <div key={`date-${idx}`} className="flex items-center justify-center py-3">
                <span className="text-[9px] font-semibold text-muted-foreground bg-white px-3 py-1 rounded-full uppercase tracking-wider" style={{ border: "0.5px solid rgba(0,0,0,0.07)" }}>
                  {item.label}
                </span>
              </div>
            );
          }

          const msg = item as Message;
          const isMe = msg.user_id === user?.id;
          const member = memberMap.get(msg.user_id);
          const senderName = member?.name || "Unknown";
          const meta = msg.metadata as MessageMetadata | null;
          const isMedia = meta?.type === "image" || meta?.type === "video";
          const firstInSeq = isFirstInSequence(idx);
          const lastInSeq = isLastInSequence(idx);

          return (
            <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"} ${firstInSeq ? "mt-3" : "mt-0.5"}`}>
              {/* Sender avatar — left side, only for others, aligned to bottom of last bubble */}
              {!isMe && (
                <div className="w-[20px] shrink-0 mr-1.5 self-end">
                  {lastInSeq ? (
                    <div
                      className="w-[20px] h-[20px] rounded-full overflow-hidden flex items-center justify-center"
                      style={{ backgroundColor: member?.avatar ? undefined : member?.color || BUBBLE_COLORS[0] }}
                    >
                      {member?.avatar ? (
                        <img src={member.avatar} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-white text-[7px] font-bold">{getInitials(senderName)}</span>
                      )}
                    </div>
                  ) : <div className="w-[20px]" />}
                </div>
              )}

              <div className={`max-w-[75%] ${isMe ? "items-end" : "items-start"} flex flex-col`}>
                {/* Sender name — only for group chats, first in sequence */}
                {!isMe && !isDm && firstInSeq && (
                  <span className="text-[9px] font-medium text-muted-foreground ml-1 mb-0.5">{senderName}</span>
                )}

                <div
                  className={`${isMedia ? "p-0.5 overflow-hidden" : "px-3 py-2"}`}
                  style={{
                    backgroundColor: isMe ? "#6C47FF" : "#FFFFFF",
                    color: isMe ? "#FFFFFF" : undefined,
                    borderRadius: isMe ? "14px 4px 14px 14px" : "4px 14px 14px 14px",
                    border: isMe ? undefined : "0.5px solid rgba(0,0,0,0.07)",
                    ...(isMedia ? { borderRadius: isMe ? "14px 4px 14px 14px" : "4px 14px 14px 14px" } : {}),
                  }}
                >
                  {renderMessageContent(msg, isMe)}
                </div>

                {/* Timestamp — show after last in sequence */}
                {lastInSeq && (
                  <span className={`text-[9px] text-muted-foreground mt-0.5 ${isMe ? "text-right mr-1" : "ml-1"}`}>
                    {formatTime(msg.created_at)}
                  </span>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Recording indicator */}
      <AnimatePresence>
        {isRecording && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="px-4 py-3 bg-white shrink-0"
            style={{ borderTop: "0.5px solid rgba(0,0,0,0.07)" }}
          >
            <div className="flex items-center gap-3">
              <button onClick={cancelRecording} className="w-9 h-9 rounded-full bg-red-50 flex items-center justify-center text-red-500">
                <X size={18} />
              </button>
              <div className="flex-1 flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                <span className="text-sm font-mono font-semibold">{formatDuration(recordingDuration)}</span>
                <div className="flex-1 flex items-center gap-0.5">
                  {Array.from({ length: 20 }).map((_, i) => (
                    <div key={i} className="w-1 bg-red-300 rounded-full" style={{ height: `${Math.random() * 16 + 4}px` }} />
                  ))}
                </div>
              </div>
              <button onClick={stopRecording} className="w-10 h-10 rounded-full flex items-center justify-center text-white active:scale-95 transition-transform" style={{ backgroundColor: "#6C47FF" }}>
                <Send size={18} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Upload indicator */}
      <AnimatePresence>
        {uploading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="px-4 py-2 bg-white flex items-center gap-2 shrink-0" style={{ borderTop: "0.5px solid rgba(0,0,0,0.07)" }}>
            <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "#6C47FF", borderTopColor: "transparent" }} />
            <span className="text-xs text-muted-foreground">Sending...</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Attach menu */}
      <AnimatePresence>
        {showAttachMenu && !isRecording && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="px-4 py-3 bg-white shrink-0"
            style={{ borderTop: "0.5px solid rgba(0,0,0,0.07)" }}
          >
            <div className="flex gap-6 justify-center py-1">
              <label className="flex flex-col items-center gap-1 cursor-pointer">
                <div className="w-11 h-11 rounded-full flex items-center justify-center" style={{ backgroundColor: "rgba(108,71,255,0.08)" }}>
                  <Camera size={20} style={{ color: "#6C47FF" }} />
                </div>
                <span className="text-[9px] font-medium text-muted-foreground">Camera</span>
                <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleFileSelect(e, "image")} />
              </label>
              <label className="flex flex-col items-center gap-1 cursor-pointer">
                <div className="w-11 h-11 rounded-full flex items-center justify-center" style={{ backgroundColor: "rgba(108,71,255,0.08)" }}>
                  <Image size={20} style={{ color: "#6C47FF" }} />
                </div>
                <span className="text-[9px] font-medium text-muted-foreground">Photo Library</span>
                <input type="file" accept="image/*,video/*" className="hidden" onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const isVideo = file.type.startsWith("video/");
                  handleFileSelect(e, isVideo ? "video" : "image");
                }} />
              </label>
              <label className="flex flex-col items-center gap-1 cursor-pointer">
                <div className="w-11 h-11 rounded-full flex items-center justify-center" style={{ backgroundColor: "rgba(108,71,255,0.08)" }}>
                  <Film size={20} style={{ color: "#6C47FF" }} />
                </div>
                <span className="text-[9px] font-medium text-muted-foreground">GIF</span>
                <input type="file" accept="image/gif" className="hidden" onChange={(e) => handleFileSelect(e, "image")} />
              </label>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input bar */}
      {!isRecording && (
        <div className="px-3 py-2.5 bg-white shrink-0" style={{ borderTop: "0.5px solid rgba(0,0,0,0.07)" }}>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAttachMenu((v) => !v)}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-all shrink-0 ${showAttachMenu ? "rotate-45" : ""}`}
              style={{ backgroundColor: showAttachMenu ? "#6C47FF" : "rgba(0,0,0,0.04)", color: showAttachMenu ? "#fff" : "#888" }}
            >
              <Plus size={18} />
            </button>
            <input
              ref={inputRef}
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setShowAttachMenu(false)}
              placeholder={`Message ${isDm && otherMember ? otherMember.display_name : group.name}...`}
              className="flex-1 rounded-full px-4 py-2 text-[13px] outline-none placeholder:text-muted-foreground"
              style={{ backgroundColor: "#F4F3F0" }}
            />
            {newMessage.trim() ? (
              <button onClick={handleSend} className="w-9 h-9 rounded-full flex items-center justify-center text-white active:scale-95 transition-transform shrink-0" style={{ backgroundColor: "#6C47FF" }}>
                <Send size={16} />
              </button>
            ) : (
              <button
                onTouchStart={startRecording}
                onMouseDown={startRecording}
                className="w-9 h-9 rounded-full flex items-center justify-center text-white active:scale-95 transition-transform shrink-0"
                style={{ backgroundColor: "#6C47FF" }}
                title="Hold to record voice memo"
              >
                <Mic size={16} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Image preview overlay */}
      <AnimatePresence>
        {previewImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
            onClick={() => setPreviewImage(null)}
          >
            <button onClick={() => setPreviewImage(null)} className="absolute right-4 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white" style={{ top: "calc(env(safe-area-inset-top, 0px) + 0.75rem)" }}>
              <X size={22} />
            </button>
            <img src={previewImage} alt="Preview" className="max-w-full max-h-[85vh] object-contain rounded-xl" onClick={(e) => e.stopPropagation()} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ChatPage;
