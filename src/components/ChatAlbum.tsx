import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, X, ChevronLeft, ChevronRight, Play } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";

interface AlbumItem {
  id: string;
  url: string;
  date: string;
  messageId: string;
  type: "image" | "video";
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
  const [items, setItems] = useState<AlbumItem[]>([]);
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

      const mediaItems: AlbumItem[] = [];
      (data || []).forEach((msg: any) => {
        const meta = msg.metadata;
        if ((meta?.type === "image" || meta?.type === "video") && meta?.mediaUrl) {
          mediaItems.push({
            id: msg.id,
            url: meta.mediaUrl,
            date: msg.created_at,
            messageId: msg.id,
            type: meta.type,
          });
        }
      });
      setItems(mediaItems);
      setLoading(false);
    };
    load();
  }, [groupId]);

  const groupByDate = useCallback((list: AlbumItem[]) => {
    const groups: { label: string; dateKey: string; items: AlbumItem[] }[] = [];
    const map = new Map<string, AlbumItem[]>();
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    list.forEach((p) => {
      const d = new Date(p.date);
      const key = d.toDateString();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    });

    map.forEach((items, key) => {
      let label = key;
      if (key === today.toDateString()) label = "Today";
      else if (key === yesterday.toDateString()) label = "Yesterday";
      else {
        const d = new Date(key);
        label = d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
      }
      groups.push({ label, dateKey: key, items });
    });

    return groups;
  }, []);

  const dateGroups = groupByDate(items);

  const showPrev = () => { if (viewerIndex !== null && viewerIndex > 0) setViewerIndex(viewerIndex - 1); };
  const showNext = () => { if (viewerIndex !== null && viewerIndex < items.length - 1) setViewerIndex(viewerIndex + 1); };

  const [touchStart, setTouchStart] = useState<number | null>(null);
  const handleTouchStart = (e: React.TouchEvent) => setTouchStart(e.touches[0].clientX);
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStart === null) return;
    const diff = e.changedTouches[0].clientX - touchStart;
    if (Math.abs(diff) > 50) { if (diff > 0) showPrev(); else showNext(); }
    setTouchStart(null);
  };

  const viewerItem = viewerIndex !== null ? items[viewerIndex] : null;

  return (
    <div className="flex flex-col h-[calc(100svh-5rem)]" style={{ backgroundColor: "#F4F3F0" }}>
      <header className="px-4 pt-12 pb-3 bg-white shrink-0" style={{ borderBottom: "0.5px solid rgba(0,0,0,0.07)" }}>
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground -ml-1">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-[14px] font-semibold">Album</h1>
            <p className="text-[10px] text-muted-foreground">{items.length} item{items.length !== 1 ? "s" : ""}</p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4" style={{ WebkitOverflowScrolling: "touch" }}>
        {loading && <div className="flex justify-center py-12"><span className="text-xs text-muted-foreground">Loading...</span></div>}

        {!loading && items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <span className="text-3xl mb-3 opacity-30">📷</span>
            <p className="text-xs font-medium">No media yet</p>
            <p className="text-[10px] mt-1">Photos and videos shared in this chat will appear here</p>
          </div>
        )}

        {!loading && dateGroups.map((group) => (
          <div key={group.dateKey} className="mb-6">
            <h2 className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-0.5">{group.label}</h2>
            <div className="grid grid-cols-3 gap-1 rounded-2xl overflow-hidden">
              {group.items.map((item) => {
                const globalIdx = items.indexOf(item);
                return (
                  <button key={item.id} onClick={() => setViewerIndex(globalIdx)} className="aspect-square overflow-hidden bg-white relative">
                    {item.type === "video" ? (
                      <>
                        <video src={item.url} preload="metadata" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                          <div className="w-8 h-8 rounded-full bg-white/80 flex items-center justify-center">
                            <Play size={14} className="text-foreground ml-0.5" />
                          </div>
                        </div>
                      </>
                    ) : (
                      <img src={item.url} alt="" className="w-full h-full object-cover hover:scale-105 transition-transform duration-200" loading="lazy" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Fullscreen viewer */}
      <AnimatePresence>
        {viewerItem && viewerIndex !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/95 flex flex-col"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <div className="flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] pb-3 shrink-0">
              <button onClick={() => setViewerIndex(null)} className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white">
                <X size={22} />
              </button>
              <span className="text-xs text-white/70">
                {new Date(viewerItem.date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              </span>
              <div className="w-10" />
            </div>

            <div className="flex-1 flex items-center justify-center px-4 relative">
              {viewerIndex > 0 && (
                <button onClick={showPrev} className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white z-10 hidden sm:flex">
                  <ChevronLeft size={24} />
                </button>
              )}
              {viewerItem.type === "video" ? (
                <video key={viewerItem.id} src={viewerItem.url} controls playsInline className="max-w-full max-h-[75vh] rounded-lg" />
              ) : (
                <motion.img
                  key={viewerItem.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  src={viewerItem.url}
                  alt=""
                  className="max-w-full max-h-[75vh] object-contain rounded-lg"
                />
              )}
              {viewerIndex < items.length - 1 && (
                <button onClick={showNext} className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white z-10 hidden sm:flex">
                  <ChevronRight size={24} />
                </button>
              )}
            </div>

            <div className="py-4 text-center shrink-0">
              <span className="text-xs text-white/50">{viewerIndex + 1} / {items.length}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ChatAlbum;
