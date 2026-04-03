import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, X, ChevronLeft, ChevronRight, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";

interface AlbumPhoto {
  id: string;
  url: string;
  date: string;
  messageId: string;
}

const ChatAlbum = ({
  groupId,
  onBack,
  onJumpToMessage,
}: {
  groupId: string;
  onBack: () => void;
  onJumpToMessage?: (messageId: string) => void;
}) => {
  const [photos, setPhotos] = useState<AlbumPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("messages")
        .select("id, created_at, metadata")
        .eq("group_id", groupId)
        .eq("is_ai_coach", false)
        .not("metadata", "is", null)
        .order("created_at", { ascending: false })
        .limit(1000);

      const imgs: AlbumPhoto[] = [];
      (data || []).forEach((msg: any) => {
        const meta = msg.metadata;
        if (meta?.type === "image" && meta?.mediaUrl) {
          imgs.push({
            id: msg.id,
            url: meta.mediaUrl,
            date: msg.created_at,
            messageId: msg.id,
          });
        }
      });
      setPhotos(imgs);
      setLoading(false);
    };
    load();
  }, [groupId]);

  const groupByDate = useCallback((items: AlbumPhoto[]) => {
    const groups: { label: string; dateKey: string; photos: AlbumPhoto[] }[] = [];
    const map = new Map<string, AlbumPhoto[]>();
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    items.forEach((p) => {
      const d = new Date(p.date);
      const key = d.toDateString();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    });

    map.forEach((photos, key) => {
      let label = key;
      if (key === today.toDateString()) label = "Today";
      else if (key === yesterday.toDateString()) label = "Yesterday";
      else {
        const d = new Date(key);
        label = d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
      }
      groups.push({ label, dateKey: key, photos });
    });

    return groups;
  }, []);

  const dateGroups = groupByDate(photos);

  // Swipe in viewer
  const showPrev = () => {
    if (viewerIndex !== null && viewerIndex > 0) setViewerIndex(viewerIndex - 1);
  };
  const showNext = () => {
    if (viewerIndex !== null && viewerIndex < photos.length - 1) setViewerIndex(viewerIndex + 1);
  };

  // Touch swipe support
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const handleTouchStart = (e: React.TouchEvent) => setTouchStart(e.touches[0].clientX);
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStart === null) return;
    const diff = e.changedTouches[0].clientX - touchStart;
    if (Math.abs(diff) > 50) {
      if (diff > 0) showPrev();
      else showNext();
    }
    setTouchStart(null);
  };

  const viewerPhoto = viewerIndex !== null ? photos[viewerIndex] : null;

  return (
    <div className="flex flex-col h-[calc(100svh-5rem)]">
      {/* Header */}
      <header className="px-4 pt-12 pb-3 border-b border-border bg-card/80 backdrop-blur-sm flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors -ml-1"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold tracking-tight">Album</h1>
            <p className="text-[10px] text-muted-foreground">
              {photos.length} photo{photos.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
      </header>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto px-4 py-4" style={{ WebkitOverflowScrolling: "touch" }}>
        {loading && (
          <div className="flex justify-center py-12">
            <span className="text-sm text-muted-foreground">Loading photos...</span>
          </div>
        )}

        {!loading && photos.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <span className="text-4xl mb-3 opacity-40">📷</span>
            <p className="text-sm font-medium">No photos yet</p>
            <p className="text-xs mt-1">Photos shared in this chat will appear here</p>
          </div>
        )}

        {!loading &&
          dateGroups.map((group) => (
            <div key={group.dateKey} className="mb-6">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-0.5">
                {group.label}
              </h2>
              <div className="grid grid-cols-3 gap-1 rounded-xl overflow-hidden">
                {group.photos.map((photo) => {
                  const globalIdx = photos.indexOf(photo);
                  return (
                    <button
                      key={photo.id}
                      onClick={() => setViewerIndex(globalIdx)}
                      className="aspect-square overflow-hidden bg-secondary"
                    >
                      <img
                        src={photo.url}
                        alt=""
                        className="w-full h-full object-cover hover:scale-105 transition-transform duration-200"
                        loading="lazy"
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
      </div>

      {/* Fullscreen viewer */}
      <AnimatePresence>
        {viewerPhoto && viewerIndex !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/95 flex flex-col"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            {/* Viewer header */}
            <div className="flex items-center justify-between px-4 pt-12 pb-3 flex-shrink-0">
              <button
                onClick={() => setViewerIndex(null)}
                className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white"
              >
                <X size={22} />
              </button>
              <span className="text-xs text-white/70">
                {new Date(viewerPhoto.date).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
              {onJumpToMessage && (
                <button
                  onClick={() => {
                    setViewerIndex(null);
                    onJumpToMessage(viewerPhoto.messageId);
                  }}
                  className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white"
                  title="Jump to message"
                >
                  <MessageCircle size={18} />
                </button>
              )}
            </div>

            {/* Image */}
            <div className="flex-1 flex items-center justify-center px-4 relative">
              {viewerIndex > 0 && (
                <button
                  onClick={showPrev}
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white z-10 hidden sm:flex"
                >
                  <ChevronLeft size={24} />
                </button>
              )}
              <motion.img
                key={viewerPhoto.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                src={viewerPhoto.url}
                alt=""
                className="max-w-full max-h-[75vh] object-contain rounded-lg"
              />
              {viewerIndex < photos.length - 1 && (
                <button
                  onClick={showNext}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white z-10 hidden sm:flex"
                >
                  <ChevronRight size={24} />
                </button>
              )}
            </div>

            {/* Counter */}
            <div className="py-4 text-center flex-shrink-0">
              <span className="text-xs text-white/50">
                {viewerIndex + 1} / {photos.length}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ChatAlbum;
