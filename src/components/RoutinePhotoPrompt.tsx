import { useState } from "react";
import { Camera, X, RotateCcw, Send, Loader2 } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { takePhoto } from "@/integrations/camera";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

const SUPPRESS_KEY = "suppress_routine_photo_prompt_date";

export function isRoutinePhotoPromptSuppressed(): boolean {
  try {
    const stored = localStorage.getItem(SUPPRESS_KEY);
    if (!stored) return false;
    const today = new Date().toISOString().split("T")[0];
    return stored === today;
  } catch {
    return false;
  }
}

function suppressForToday() {
  const today = new Date().toISOString().split("T")[0];
  localStorage.setItem(SUPPRESS_KEY, today);
}

export interface RoutineForPhoto {
  id: string;
  label: string;
  groupId: string;
  streak?: number;
}

interface Props {
  open: boolean;
  routine: RoutineForPhoto;
  onClose: () => void;
}

type Step = "ask" | "preview";

const RoutinePhotoPrompt = ({ open, routine, onClose }: Props) => {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>("ask");
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [dontAskToday, setDontAskToday] = useState(false);

  const reset = () => {
    setStep("ask");
    setPhotoBlob(null);
    setPhotoPreview(null);
    setSending(false);
  };

  const closeAll = () => {
    if (dontAskToday) suppressForToday();
    reset();
    onClose();
  };

  const buildStats = (): Record<string, string | number> | null => {
    const stats: Record<string, string | number> = {};
    if (routine.streak && routine.streak > 0) stats.Streak = `${routine.streak}d 🔥`;
    return Object.keys(stats).length > 0 ? stats : null;
  };

  const postTextOnly = async () => {
    if (!user || !routine.groupId) {
      onClose();
      return;
    }
    try {
      const { error } = await supabase.from("group_feed_posts").insert({
        group_id: routine.groupId,
        user_id: user.id,
        content: `✅ Completed routine: ${routine.label}`,
        post_type: "text",
        photos: [],
        interest_tag: "habits",
        stats: buildStats(),
      });
      if (error) throw error;
      toast.success("Shared to group feed!");
    } catch (err) {
      console.error("Routine post error:", err);
      toast.error("Couldn't post to feed");
    } finally {
      closeAll();
    }
  };

  const handleNotNow = () => {
    void postTextOnly();
  };

  const openCamera = async () => {
    const file = await takePhoto();
    if (!file) return;
    setPhotoBlob(file);
    setPhotoPreview(URL.createObjectURL(file));
    setStep("preview");
  };

  const handleRetake = () => {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoBlob(null);
    setPhotoPreview(null);
    void openCamera();
  };

  const handleSend = async () => {
    if (!photoBlob || !user || !routine.groupId) return;
    setSending(true);
    try {
      const ext = photoBlob.type.includes("png") ? "png" : "jpg";
      const fileName = `${user.id}/${Date.now()}_routine.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("feed-photos")
        .upload(fileName, photoBlob, { contentType: photoBlob.type, upsert: false });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("feed-photos").getPublicUrl(fileName);
      const mediaUrl = urlData.publicUrl;

      const { error: postError } = await supabase.from("group_feed_posts").insert({
        group_id: routine.groupId,
        user_id: user.id,
        content: `✅ Completed routine: ${routine.label}`,
        post_type: "photo",
        photos: [mediaUrl],
        interest_tag: "habits",
        stats: buildStats(),
      });
      if (postError) throw postError;

      toast.success("Shared to group feed! 📸");
      closeAll();
    } catch (err) {
      console.error("Routine photo error:", err);
      toast.error("Failed to send photo");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) closeAll(); }}>
      <DialogContent className="max-w-sm p-0 overflow-hidden rounded-2xl">
        {step === "ask" && (
          <div className="p-6 text-center space-y-5">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <Camera size={28} className="text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-foreground">Nice work! 🎉</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Send a completion photo to the group?
              </p>
            </div>
            <label className="flex items-center gap-2 justify-center cursor-pointer select-none">
              <Checkbox
                checked={dontAskToday}
                onCheckedChange={(v) => setDontAskToday(!!v)}
              />
              <span className="text-xs text-muted-foreground">Don't ask me again today</span>
            </label>
            <div className="flex gap-3">
              <button
                onClick={handleNotNow}
                className="flex-1 py-3 rounded-xl bg-secondary text-foreground text-sm font-semibold hover:bg-secondary/80 transition-colors"
              >
                Not now
              </button>
              <button
                type="button"
                onClick={() => {
                  if (dontAskToday) suppressForToday();
                  void openCamera();
                }}
                className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
              >
                <Camera size={16} /> Take Photo
              </button>
            </div>
          </div>
        )}

        {step === "preview" && photoPreview && (
          <div className="space-y-0">
            <div className="relative aspect-[4/3] bg-black">
              <img src={photoPreview} alt="Routine completion" className="w-full h-full object-cover" />
              <button
                onClick={closeAll}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            <div className="px-4 py-3 bg-card border-t border-border flex items-center gap-2">
              <span className="text-lg">✅</span>
              <span className="text-sm font-semibold text-foreground truncate">{routine.label}</span>
              <span className="text-xs text-muted-foreground ml-auto">Completed</span>
            </div>
            <div className="flex gap-3 p-4 pt-2">
              <button
                onClick={handleRetake}
                disabled={sending}
                className="flex-1 py-3 rounded-xl bg-secondary text-foreground text-sm font-semibold hover:bg-secondary/80 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <RotateCcw size={14} /> Retake
              </button>
              <button
                onClick={handleSend}
                disabled={sending}
                className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {sending ? (
                  <><Loader2 size={14} className="animate-spin" /> Sending...</>
                ) : (
                  <><Send size={14} /> Send</>
                )}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default RoutinePhotoPrompt;
