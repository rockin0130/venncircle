import { useState } from "react";
import { X, Camera, Image as ImageIcon, Loader2 } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { pickFromGallery } from "@/integrations/camera";

interface ShareToFeedSheetProps {
  open: boolean;
  onClose: () => void;
  groupId: string;
  groupName: string;
  userId: string;
  /** Pre-filled caption text */
  caption: string;
  /** Interest tag for the post badge */
  interestTag?: string;
  /** Stats to show on the post (e.g. { Calories: 350, Duration: "45 min" }) */
  stats?: Record<string, string | number>;
}

const ShareToFeedSheet = ({
  open,
  onClose,
  groupId,
  groupName,
  userId,
  caption: initialCaption,
  interestTag,
  stats,
}: ShareToFeedSheetProps) => {
  const [caption, setCaption] = useState(initialCaption);
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [posting, setPosting] = useState(false);

  const appendPhotoFiles = (newFiles: File[]) => {
    if (newFiles.length === 0) return;
    const slice = newFiles.slice(0, 3 - photos.length);
    setPhotos((prev) => [...prev, ...slice]);
    slice.forEach((f) => {
      const reader = new FileReader();
      reader.onload = (ev) =>
        setPhotoPreviews((prev) => [...prev, ev.target?.result as string]);
      reader.readAsDataURL(f);
    });
  };

  const handleAddPhoto = async () => {
    if (photos.length >= 3) return;
    const file = await pickFromGallery();
    if (file) appendPhotoFiles([file]);
  };

  const removePhoto = (idx: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
    setPhotoPreviews((prev) => prev.filter((_, i) => i !== idx));
  };

  const handlePost = async () => {
    if (!caption.trim() && photos.length === 0) return;
    setPosting(true);
    try {
      const uploadedUrls: string[] = [];
      for (const photo of photos) {
        const ext = photo.name.split(".").pop() || "jpg";
        const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("feed-photos")
          .upload(path, photo);
        if (uploadError) {
          toast.error("Failed to upload photo");
          setPosting(false);
          return;
        }
        const { data: urlData } = supabase.storage
          .from("feed-photos")
          .getPublicUrl(path);
        uploadedUrls.push(urlData.publicUrl);
      }

      const postType =
        uploadedUrls.length > 0
          ? "photo"
          : stats && Object.keys(stats).length > 0
          ? "activity"
          : "text";

      const { error } = await supabase.from("group_feed_posts").insert({
        group_id: groupId,
        user_id: userId,
        content: caption.trim(),
        post_type: postType,
        photos: uploadedUrls,
        interest_tag: interestTag || null,
        stats: stats && Object.keys(stats).length > 0 ? stats : null,
      });

      if (error) {
        toast.error("Failed to share");
        console.error(error);
      } else {
        toast.success(`Shared to ${groupName}`);
        handleClose();
      }
    } catch {
      toast.error("Failed to share");
    }
    setPosting(false);
  };

  const handleClose = () => {
    setCaption(initialCaption);
    setPhotos([]);
    setPhotoPreviews([]);
    setPosting(false);
    onClose();
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && handleClose()}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl max-h-[80vh] px-5 pb-8 pt-3"
      >
        {/* Handle bar */}
        <div className="flex justify-center mb-3">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>

        {/* Title */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-foreground">
            Share to {groupName}?
          </h3>
          <button
            onClick={handleClose}
            className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center"
          >
            <X size={14} className="text-muted-foreground" />
          </button>
        </div>

        {/* Stats Preview */}
        {stats && Object.keys(stats).length > 0 && (
          <div className="flex gap-4 p-3 rounded-xl bg-secondary/50 mb-3">
            {Object.entries(stats).map(([key, value]) => (
              <div key={key} className="text-center">
                <p className="text-sm font-bold text-foreground">
                  {String(value)}
                </p>
                <p className="text-[10px] text-muted-foreground capitalize">
                  {key}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Editable Caption */}
        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Add a caption..."
          className="w-full bg-secondary/40 rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none resize-none min-h-[70px] border border-border/50 focus:border-primary/40 transition-colors mb-3"
          rows={3}
        />

        {/* Photo Previews */}
        {photoPreviews.length > 0 && (
          <div className="flex gap-2 mb-3">
            {photoPreviews.map((src, i) => (
              <div
                key={i}
                className="relative w-16 h-16 rounded-lg overflow-hidden"
              >
                <img
                  src={src}
                  alt=""
                  className="w-full h-full object-cover"
                />
                <button
                  onClick={() => removePhoto(i)}
                  className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center"
                >
                  <X size={10} className="text-white" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add photo button */}
        {photos.length < 3 && (
          <button
            type="button"
            onClick={() => void handleAddPhoto()}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <Camera size={16} />
            <span className="font-medium">Add a photo</span>
          </button>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={handleClose}
            className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:bg-secondary/50 transition-colors"
          >
            Skip
          </button>
          <button
            onClick={handlePost}
            disabled={posting || (!caption.trim() && photos.length === 0)}
            className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40 transition-opacity flex items-center justify-center gap-2"
          >
            {posting ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              "Post"
            )}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default ShareToFeedSheet;
