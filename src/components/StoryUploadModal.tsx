import { useMemo, useState } from "react";
import { Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Group } from "@/context/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export type CapturedStoryMedia =
  | { type: "photo"; file: File; previewUrl: string }
  | { type: "video"; file: File; previewUrl: string };

const DURATION_OPTIONS = [
  { label: "1시간", hours: 1 },
  { label: "12시간", hours: 12 },
  { label: "하루", hours: 24 },
] as const;

type StoryUploadModalProps = {
  userId: string;
  groups: Group[];
  media: CapturedStoryMedia;
  onClose: () => void;
  onRetake: () => void;
  onPosted: () => void;
};

export default function StoryUploadModal({
  userId,
  groups,
  media,
  onClose,
  onRetake,
  onPosted,
}: StoryUploadModalProps) {
  const activeGroups = useMemo(
    () => groups.filter((g) => g.members?.some((m) => m.user_id === userId && m.status === "active")),
    [groups, userId]
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(activeGroups.map((g) => g.id)));
  const [durationHours, setDurationHours] = useState<number>(24);
  const [posting, setPosting] = useState(false);

  const toggleGroup = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirm = async () => {
    if (selectedIds.size === 0) {
      toast.error("Select at least one group");
      return;
    }
    setPosting(true);
    try {
      const ext = media.type === "photo" ? (media.file.name.endsWith(".png") ? "png" : "jpg") : "mp4";
      const path = `${userId}/${crypto.randomUUID()}.${ext}`;
      const contentType = media.file.type || (media.type === "photo" ? "image/jpeg" : "video/mp4");

      const { error: upErr } = await supabase.storage.from("stories").upload(path, media.file, {
        contentType,
        upsert: false,
      });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from("stories").getPublicUrl(path);
      const mediaUrl = pub.publicUrl;
      const expiresAt = new Date(Date.now() + durationHours * 3600 * 1000).toISOString();

      const rows = [...selectedIds].map((groupId) => ({
        user_id: userId,
        group_id: groupId,
        media_url: mediaUrl,
        media_type: media.type,
        expires_at: expiresAt,
      }));

      const { error: insErr } = await supabase.from("stories").insert(rows);
      if (insErr) throw insErr;

      toast.success("Story posted");
      onPosted();
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to post story";
      toast.error(msg);
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-background/95 backdrop-blur-md">
      <div className="flex items-center justify-between px-3 py-2 safe-area-top border-b border-border">
        <button type="button" onClick={onRetake} className="text-sm font-medium text-primary">
          Retake
        </button>
        <span className="text-sm font-semibold">New story</span>
        <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-muted" aria-label="Close">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 flex flex-col min-h-0 p-4 gap-4 overflow-y-auto">
        <div className="rounded-2xl overflow-hidden bg-black aspect-[9/16] max-h-[48vh] mx-auto w-full max-w-sm border border-border">
          {media.type === "photo" ? (
            <img src={media.previewUrl} alt="" className="w-full h-full object-contain" />
          ) : (
            <video src={media.previewUrl} className="w-full h-full object-contain" controls playsInline muted />
          )}
        </div>

        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Groups</p>
          <div className="flex flex-wrap gap-2">
            {activeGroups.map((g) => {
              const on = selectedIds.has(g.id);
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => toggleGroup(g.id)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                    on ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-foreground"
                  )}
                >
                  {g.emoji} {g.name}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Duration</p>
          <div className="flex gap-2">
            {DURATION_OPTIONS.map((opt) => (
              <button
                key={opt.hours}
                type="button"
                onClick={() => setDurationHours(opt.hours)}
                className={cn(
                  "flex-1 py-2 rounded-xl text-sm font-medium border transition-colors",
                  durationHours === opt.hours
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card border-border"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-border">
        <button
          type="button"
          disabled={posting || selectedIds.size === 0}
          onClick={() => void handleConfirm()}
          className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {posting ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
          Post story
        </button>
      </div>
    </div>
  );
}
