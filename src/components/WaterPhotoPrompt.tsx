import { useState } from "react";
import { Camera, X, RotateCcw, Send, Loader2 } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { takePhoto } from "@/integrations/camera";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

const SUPPRESS_KEY = "suppress_water_photo_prompt_date";

export function isWaterPhotoPromptSuppressed(): boolean {
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

interface Props {
  open: boolean;
  groupId: string;
  /** Total water logged today in milliliters (after the +250 / +500 action). */
  totalMlToday: number;
  onClose: () => void;
}

type Step = "ask" | "preview";

const WaterPhotoPrompt = ({ open, groupId, totalMlToday, onClose }: Props) => {
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

  const handleClose = () => {
    if (dontAskToday) suppressForToday();
    reset();
    onClose();
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
    if (!photoBlob || !user) return;
    setSending(true);
    try {
      const ext = photoBlob.type.includes("png") ? "png" : "jpg";
      const fileName = `${user.id}/${Date.now()}_water.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("feed-photos")
        .upload(fileName, photoBlob, {
          contentType: photoBlob.type,
          upsert: false,
        });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("feed-photos").getPublicUrl(fileName);
      const mediaUrl = urlData.publicUrl;

      const { error: postError } = await supabase.from("group_feed_posts").insert({
        group_id: groupId,
        user_id: user.id,
        content: `Drank ${totalMlToday}ml of water today!`,
        post_type: "photo",
        photos: [mediaUrl],
        interest_tag: "habits",
        stats: null,
      });
      if (postError) throw postError;

      toast.success("Shared to group feed! 📸");
      handleClose();
    } catch (err) {
      console.error("Water photo send error:", err);
      toast.error("Failed to send photo");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-sm p-0 overflow-hidden rounded-2xl">
        {step === "ask" && (
          <div className="p-6 text-center space-y-5">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <Camera size={28} className="text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-foreground">Nice! Log a water photo?</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Share it with the group?
              </p>
            </div>
            <label className="flex items-center gap-2 justify-center cursor-pointer select-none">
              <Checkbox
                checked={dontAskToday}
                onCheckedChange={(v) => setDontAskToday(!!v)}
              />
              <span className="text-xs text-muted-foreground">Don&apos;t ask me again today</span>
            </label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleClose}
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
              <img src={photoPreview} alt="Water log" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={handleClose}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            <div className="px-4 py-3 bg-card border-t border-border flex items-center gap-2">
              <span className="text-lg">💧</span>
              <span className="text-sm font-semibold text-foreground truncate">
                Drank {totalMlToday}ml of water today!
              </span>
            </div>
            <div className="flex gap-3 p-4 pt-2">
              <button
                type="button"
                onClick={handleRetake}
                disabled={sending}
                className="flex-1 py-3 rounded-xl bg-secondary text-foreground text-sm font-semibold hover:bg-secondary/80 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <RotateCcw size={14} /> Retake
              </button>
              <button
                type="button"
                onClick={() => void handleSend()}
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

export default WaterPhotoPrompt;
