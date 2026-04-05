import { useState, useRef } from "react";
import { Image, Activity, Smile, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface GroupFeedComposeProps {
  groupId: string;
  userId: string;
  userDisplayName: string;
  onPostCreated: () => void;
}

const GroupFeedCompose = ({ groupId, userId, userDisplayName, onPostCreated }: GroupFeedComposeProps) => {
  const [content, setContent] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [posting, setPosting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composeRef = useRef<HTMLDivElement>(null);

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const newFiles = files.slice(0, 3 - photos.length);
    setPhotos(prev => [...prev, ...newFiles]);
    newFiles.forEach(f => {
      const reader = new FileReader();
      reader.onload = (ev) => setPhotoPreviews(prev => [...prev, ev.target?.result as string]);
      reader.readAsDataURL(f);
    });
  };

  const removePhoto = (idx: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== idx));
    setPhotoPreviews(prev => prev.filter((_, i) => i !== idx));
  };

  const handlePost = async () => {
    if (!content.trim() && photos.length === 0) return;
    setPosting(true);

    try {
      const uploadedUrls: string[] = [];
      for (const photo of photos) {
        const ext = photo.name.split(".").pop() || "jpg";
        const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: uploadError } = await supabase.storage.from("feed-photos").upload(path, photo);
        if (uploadError) { toast.error("Failed to upload photo"); setPosting(false); return; }
        const { data: urlData } = supabase.storage.from("feed-photos").getPublicUrl(path);
        uploadedUrls.push(urlData.publicUrl);
      }

      const postType = uploadedUrls.length > 0 ? "photo" : "text";
      const { error } = await supabase.from("group_feed_posts").insert({
        group_id: groupId,
        user_id: userId,
        content: content.trim(),
        post_type: postType,
        photos: uploadedUrls,
      });

      if (error) { toast.error("Failed to post"); console.error(error); }
      else { setContent(""); setPhotos([]); setPhotoPreviews([]); setExpanded(false); onPostCreated(); }
    } catch { toast.error("Failed to post"); }
    setPosting(false);
  };

  const initial = (userDisplayName || "U")[0].toUpperCase();

  const handleBlur = (e: React.FocusEvent) => {
    // Only collapse if focus moves outside the compose container and no content/photos
    if (composeRef.current && !composeRef.current.contains(e.relatedTarget as Node) && !content.trim() && photos.length === 0) {
      setExpanded(false);
    }
  };

  return (
    <div ref={composeRef} className="bg-card rounded-xl border border-border p-3" onBlur={handleBlur}>
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
          {initial}
        </div>
        {expanded ? (
          <textarea
            placeholder="Share something with the group..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="flex-1 bg-secondary/40 rounded-xl px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none resize-none min-h-[60px]"
            autoFocus
            rows={3}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handlePost())}
          />
        ) : (
          <button
            onClick={() => setExpanded(true)}
            className="flex-1 bg-secondary/40 rounded-full px-4 py-2 text-sm text-muted-foreground text-left"
          >
            Share something with the group...
          </button>
        )}
      </div>

      {/* Photo Previews */}
      {photoPreviews.length > 0 && (
        <div className="flex gap-2 mt-3 px-12">
          {photoPreviews.map((src, i) => (
            <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden">
              <img src={src} alt="" className="w-full h-full object-cover" />
              <button onClick={() => removePhoto(i)} className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center">
                <X size={10} className="text-white" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Action Buttons — only when expanded */}
      {expanded && (
        <div className="flex items-center justify-between mt-2.5 pl-12">
          <div className="flex items-center gap-4">
            <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors">
              <Image size={16} /><span className="text-xs font-medium">Photo</span>
            </button>
            <button className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors">
              <Activity size={16} /><span className="text-xs font-medium">Activity</span>
            </button>
            <button className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors">
              <Smile size={16} /><span className="text-xs font-medium">Feeling</span>
            </button>
          </div>
          {(content.trim() || photos.length > 0) && (
            <button onClick={handlePost} disabled={posting} className="px-4 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold">
              {posting ? <Loader2 size={12} className="animate-spin" /> : "Post"}
            </button>
          )}
        </div>
      )}
      <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoSelect} />
    </div>
  );
};

export default GroupFeedCompose;
