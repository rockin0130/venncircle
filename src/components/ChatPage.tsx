import { useState, useEffect, useRef, useCallback } from "react";
import { Send, ArrowLeft, MessageCircle, Mic, Square, Image, Play, Pause, X, Plus, Camera, Film, Images } from "lucide-react";
import ChatAlbum from "@/components/ChatAlbum";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, Group } from "@/context/AuthContext";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

interface MessageMetadata {
  type?: "voice" | "image" | "video";
  mediaUrl?: string;
  duration?: number; // voice memo duration in seconds
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

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Media upload state
  const [uploading, setUploading] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);

  // Audio playback state
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [playbackProgress, setPlaybackProgress] = useState<Record<string, number>>({});
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Image preview state
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Album state
  const [showAlbum, setShowAlbum] = useState(false);

  const memberMap = new Map<string, { name: string; avatar: string | null }>();
  group.members.forEach((m) => {
    memberMap.set(m.user_id, { name: m.display_name || "Member", avatar: m.avatar_url });
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
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
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Voice Recording ──
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : "audio/webm";

      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

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

      timerRef.current = setInterval(() => {
        setRecordingDuration((d) => d + 1);
      }, 1000);
    } catch {
      toast.error("Microphone access denied");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRecording(false);
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    chunksRef.current = [];
    setIsRecording(false);
    setRecordingDuration(0);
  };

  // ── Media Upload ──
  const uploadAndSendMedia = async (blob: Blob, type: "voice" | "image" | "video", mimeType: string) => {
    if (!user) return;
    setUploading(true);

    try {
      const ext = mimeType.includes("webm") ? "webm" : mimeType.includes("mp4") ? "mp4" :
        mimeType.includes("jpeg") || mimeType.includes("jpg") ? "jpg" :
        mimeType.includes("png") ? "png" : mimeType.includes("gif") ? "gif" :
        mimeType.includes("webp") ? "webp" : mimeType.includes("quicktime") ? "mov" :
        mimeType.includes("wav") ? "wav" : mimeType.includes("ogg") ? "ogg" : "bin";

      const fileName = `${user.id}/${Date.now()}_${type}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("chat-media")
        .upload(fileName, blob, { contentType: mimeType, upsert: false });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("chat-media").getPublicUrl(fileName);
      const mediaUrl = urlData.publicUrl;

      const metadata: MessageMetadata = {
        type,
        mediaUrl,
        mimeType,
        ...(type === "voice" ? { duration: recordingDuration } : {}),
      };

      const contentLabel = type === "voice" ? "🎤 Voice memo" : type === "image" ? "📷 Photo" : "🎥 Video";

      const { error } = await supabase.from("messages").insert({
        group_id: group.id,
        user_id: user.id,
        content: contentLabel,
        metadata: metadata as any,
      });

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
    if (file.size > maxSize) {
      toast.error(`File too large. Max ${type === "video" ? "50" : "10"}MB`);
      return;
    }

    await uploadAndSendMedia(file, type, file.type);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Audio Playback ──
  const togglePlayback = (msgId: string, url: string) => {
    if (playingId === msgId) {
      audioRef.current?.pause();
      setPlayingId(null);
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    }

    const audio = new Audio(url);
    audioRef.current = audio;
    setPlayingId(msgId);

    audio.play().catch(() => toast.error("Playback failed"));

    progressTimerRef.current = setInterval(() => {
      if (audio.duration) {
        setPlaybackProgress((p) => ({ ...p, [msgId]: (audio.currentTime / audio.duration) * 100 }));
      }
    }, 100);

    audio.onended = () => {
      setPlayingId(null);
      setPlaybackProgress((p) => ({ ...p, [msgId]: 0 }));
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    };
  };

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  };

  const formatDateSeparator = (iso: string) => {
    const d = new Date(iso);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return "Today";
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

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

  // ── Render Helpers ──
  const renderVoiceMemo = (msg: Message, isMe: boolean) => {
    const meta = msg.metadata as MessageMetadata;
    if (!meta?.mediaUrl) return null;
    const isPlaying = playingId === msg.id;
    const progress = playbackProgress[msg.id] || 0;

    return (
      <div className="flex items-center gap-2 min-w-[180px]">
        <button
          onClick={() => togglePlayback(msg.id, meta.mediaUrl!)}
          className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
            isMe ? "bg-primary-foreground/20 text-primary-foreground" : "bg-primary/10 text-primary"
          }`}
        >
          {isPlaying ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="h-1.5 rounded-full bg-current/20 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${isMe ? "bg-primary-foreground/60" : "bg-primary/60"}`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className={`text-[10px] mt-0.5 block ${isMe ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
            {meta.duration ? formatDuration(meta.duration) : "0:00"}
          </span>
        </div>
      </div>
    );
  };

  const renderImage = (msg: Message, isMe: boolean) => {
    const meta = msg.metadata as MessageMetadata;
    if (!meta?.mediaUrl) return null;

    return (
      <button
        onClick={() => setPreviewImage(meta.mediaUrl!)}
        className="block rounded-lg overflow-hidden max-w-[240px]"
      >
        <img
          src={meta.mediaUrl}
          alt="Shared photo"
          className="w-full h-auto max-h-[300px] object-cover rounded-lg"
          loading="lazy"
        />
      </button>
    );
  };

  const renderVideo = (msg: Message) => {
    const meta = msg.metadata as MessageMetadata;
    if (!meta?.mediaUrl) return null;

    return (
      <div className="rounded-lg overflow-hidden max-w-[280px]">
        <video
          src={meta.mediaUrl}
          controls
          playsInline
          preload="metadata"
          className="w-full h-auto max-h-[300px] rounded-lg"
        />
      </div>
    );
  };

  const renderMessageContent = (msg: Message, isMe: boolean) => {
    const meta = msg.metadata as MessageMetadata | null;

    if (meta?.type === "voice") {
      return renderVoiceMemo(msg, isMe);
    }

    if (meta?.type === "image") {
      return renderImage(msg, isMe);
    }

    if (meta?.type === "video") {
      return renderVideo(msg);
    }

    return <span>{msg.content}</span>;
  };

  if (showAlbum) {
    return (
      <ChatAlbum
        groupId={group.id}
        onBack={() => setShowAlbum(false)}
      />
    );
  }

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
          <span className="text-xl">{group.emoji}</span>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold tracking-tight truncate">{group.name}</h1>
            <p className="text-[10px] text-muted-foreground">
              {group.members.length} member{group.members.length !== 1 ? "s" : ""}
            </p>
          </div>
          <button
            onClick={() => setShowAlbum(true)}
            className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            aria-label="Album"
          >
            <Images size={18} />
          </button>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1" style={{ WebkitOverflowScrolling: "touch" }}>
        {loading && (
          <div className="flex justify-center py-8">
            <span className="text-sm text-muted-foreground">Loading messages...</span>
          </div>
        )}

        {!loading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <MessageCircle size={40} strokeWidth={1} className="mb-3 opacity-40" />
            <p className="text-sm font-medium">No messages yet</p>
            <p className="text-xs mt-1">Start the conversation!</p>
          </div>
        )}

        {messagesWithDates.map((item, idx) => {
          if ("type" in item && item.type === "date") {
            return (
              <div key={`date-${idx}`} className="flex items-center justify-center py-3">
                <span className="text-[10px] font-semibold text-muted-foreground bg-secondary px-3 py-1 rounded-full uppercase tracking-wider">
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

          return (
            <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"} mb-1`}>
              <div className={`max-w-[80%] ${isMe ? "items-end" : "items-start"}`}>
                {!isMe && (
                  <span className="text-[10px] font-semibold text-muted-foreground ml-1 mb-0.5 block">
                    {senderName}
                  </span>
                )}
                <div
                  className={`${isMedia ? "p-1" : "px-3.5 py-2"} rounded-2xl text-sm leading-relaxed ${
                    isMe
                      ? "bg-primary text-primary-foreground rounded-br-md"
                      : "bg-secondary text-foreground rounded-bl-md"
                  }`}
                >
                  {renderMessageContent(msg, isMe)}
                </div>
                <span className={`text-[9px] text-muted-foreground mt-0.5 block ${isMe ? "text-right mr-1" : "ml-1"}`}>
                  {formatTime(msg.created_at)}
                </span>
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
            className="px-4 py-3 border-t border-border bg-card/95 backdrop-blur-sm flex-shrink-0"
          >
            <div className="flex items-center gap-3">
              <button
                onClick={cancelRecording}
                className="w-9 h-9 rounded-full bg-destructive/10 flex items-center justify-center text-destructive"
              >
                <X size={18} />
              </button>
              <div className="flex-1 flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-destructive animate-pulse" />
                <span className="text-sm font-mono font-semibold text-foreground">
                  {formatDuration(recordingDuration)}
                </span>
                <div className="flex-1 flex items-center gap-0.5">
                  {Array.from({ length: 20 }).map((_, i) => (
                    <div
                      key={i}
                      className="w-1 bg-destructive/40 rounded-full"
                      style={{
                        height: `${Math.random() * 16 + 4}px`,
                        animationDelay: `${i * 0.05}s`,
                      }}
                    />
                  ))}
                </div>
              </div>
              <button
                onClick={stopRecording}
                className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground active:scale-95 transition-transform"
              >
                <Send size={18} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Upload indicator */}
      <AnimatePresence>
        {uploading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="px-4 py-2 border-t border-border bg-card/95 flex items-center gap-2 flex-shrink-0"
          >
            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
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
            className="px-4 py-2 border-t border-border bg-card/95 backdrop-blur-sm flex-shrink-0"
          >
            <div className="flex gap-4 justify-center py-2">
              <label className="flex flex-col items-center gap-1.5 cursor-pointer">
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-600">
                  <Camera size={22} />
                </div>
                <span className="text-[10px] font-medium text-muted-foreground">Photo</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => handleFileSelect(e, "image")}
                />
              </label>
              <label className="flex flex-col items-center gap-1.5 cursor-pointer">
                <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-600">
                  <Image size={22} />
                </div>
                <span className="text-[10px] font-medium text-muted-foreground">Gallery</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleFileSelect(e, "image")}
                />
              </label>
              <label className="flex flex-col items-center gap-1.5 cursor-pointer">
                <div className="w-12 h-12 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-600">
                  <Film size={22} />
                </div>
                <span className="text-[10px] font-medium text-muted-foreground">Video</span>
                <input
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={(e) => handleFileSelect(e, "video")}
                />
              </label>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input bar */}
      {!isRecording && (
        <div className="px-4 py-3 border-t border-border bg-card/80 backdrop-blur-sm flex-shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAttachMenu((v) => !v)}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-all flex-shrink-0 ${
                showAttachMenu
                  ? "bg-primary text-primary-foreground rotate-45"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              <Plus size={20} />
            </button>
            <input
              ref={inputRef}
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setShowAttachMenu(false)}
              placeholder="Type a message..."
              className="flex-1 bg-secondary rounded-full px-4 py-2.5 text-sm outline-none placeholder:text-muted-foreground"
            />
            {newMessage.trim() ? (
              <button
                onClick={handleSend}
                className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground active:scale-95 transition-transform flex-shrink-0"
              >
                <Send size={18} />
              </button>
            ) : (
              <button
                onTouchStart={startRecording}
                onMouseDown={startRecording}
                className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground active:scale-95 transition-transform flex-shrink-0"
                title="Hold to record voice memo"
              >
                <Mic size={18} />
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
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute top-12 right-4 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white"
            >
              <X size={22} />
            </button>
            <img
              src={previewImage}
              alt="Preview"
              className="max-w-full max-h-[85vh] object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ChatPage;
