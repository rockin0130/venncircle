import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export type StoryRow = {
  id: string;
  user_id: string;
  group_id: string;
  media_url: string;
  media_type: string;
  expires_at: string;
  created_at: string;
};

type StoryViewerProps = {
  groupId: string;
  userId: string;
  authorName: string;
  onClose: () => void;
};

export default function StoryViewer({ groupId, userId, authorName, onClose }: StoryViewerProps) {
  const [stories, setStories] = useState<StoryRow[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [photoProgress, setPhotoProgress] = useState(0);
  const [videoFraction, setVideoFraction] = useState(0);
  const photoTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const touchY0 = useRef<number | null>(null);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("stories")
        .select("*")
        .eq("group_id", groupId)
        .eq("user_id", userId)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: true });
      if (cancelled) return;
      if (error) {
        setStories([]);
        setLoading(false);
        return;
      }
      const rows = (data || []) as StoryRow[];
      if (rows.length === 0) {
        setStories([]);
        setLoading(false);
        onCloseRef.current();
        return;
      }
      setStories(rows);
      setIndex(0);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [groupId, userId]);

  const current = stories[index];

  const clearPhotoTimer = () => {
    if (photoTimer.current) {
      clearInterval(photoTimer.current);
      photoTimer.current = null;
    }
  };

  const goNext = useCallback(() => {
    setVideoFraction(0);
    if (index < stories.length - 1) setIndex((i) => i + 1);
    else onClose();
  }, [index, stories.length, onClose]);

  const goPrev = useCallback(() => {
    setVideoFraction(0);
    if (index > 0) setIndex((i) => i - 1);
  }, [index]);

  useEffect(() => {
    clearPhotoTimer();
    setPhotoProgress(0);
    setVideoFraction(0);
    if (!current) return;
    if (current.media_type === "photo") {
      const started = Date.now();
      photoTimer.current = setInterval(() => {
        const p = Math.min(1, (Date.now() - started) / 5000);
        setPhotoProgress(p);
        if (p >= 1) {
          clearPhotoTimer();
          goNext();
        }
      }, 50);
    }
    return clearPhotoTimer;
  }, [current, goNext]);

  useEffect(() => {
    if (current?.media_type === "video" && videoRef.current) {
      const v = videoRef.current;
      v.currentTime = 0;
      void v.play().catch(() => {});
    }
  }, [current]);

  const segmentFillPercent = (i: number) => {
    if (i < index) return 100;
    if (i > index) return 0;
    if (!current) return 0;
    if (current.media_type === "photo") return photoProgress * 100;
    return videoFraction * 100;
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-[300] bg-black flex items-center justify-center text-white text-sm">Loading…</div>
    );
  }

  if (!current) return null;

  return (
    <div
      className="fixed inset-0 z-[300] bg-black flex flex-col"
      onTouchStart={(e) => {
        touchY0.current = e.touches[0].clientY;
      }}
      onTouchEnd={(e) => {
        if (touchY0.current == null) return;
        const dy = e.changedTouches[0].clientY - touchY0.current;
        touchY0.current = null;
        if (dy > 72) onClose();
      }}
    >
      <div className="safe-area-top flex items-center gap-2 px-2 pt-2 pb-1">
        {stories.map((s, i) => (
          <div key={s.id} className="h-0.5 flex-1 bg-white/25 rounded overflow-hidden">
            <div
              className="h-full bg-white transition-[width] duration-75 ease-linear"
              style={{ width: `${segmentFillPercent(i)}%` }}
            />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between px-3 py-2">
        <p className="text-sm font-semibold text-white drop-shadow-md">{authorName}</p>
        <button type="button" onClick={onClose} className="p-2 rounded-full bg-white/10 text-white" aria-label="Close">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 relative min-h-0">
        <button
          type="button"
          className="absolute inset-y-0 left-0 w-1/2 z-10 cursor-w-resize opacity-0"
          aria-label="Previous story"
          onClick={() => goPrev()}
        />
        <button
          type="button"
          className="absolute inset-y-0 right-0 w-1/2 z-10 cursor-e-resize opacity-0"
          aria-label="Next story"
          onClick={() => goNext()}
        />

        {current.media_type === "photo" ? (
          <img src={current.media_url} alt="" className="w-full h-full object-contain bg-black" draggable={false} />
        ) : (
          <video
            ref={videoRef}
            src={current.media_url}
            className={cn("w-full h-full object-contain bg-black")}
            playsInline
            onTimeUpdate={() => {
              const v = videoRef.current;
              if (!v || !v.duration) return;
              setVideoFraction(Math.min(1, v.currentTime / v.duration));
            }}
            onEnded={() => goNext()}
          />
        )}
      </div>
    </div>
  );
}
