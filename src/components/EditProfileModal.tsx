import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Check, X, User, AtSign } from "lucide-react";

interface EditProfileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const USERNAME_REGEX = /^[a-z0-9._-]+$/;

const EditProfileModal = ({ open, onOpenChange }: EditProfileModalProps) => {
  const { user, profile, refreshProfile } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [saving, setSaving] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid">("idle");
  const [checkTimeout, setCheckTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) {
      setDisplayName(profile?.display_name || "");
      setUsername((profile as any)?.username || "");
      setUsernameStatus("idle");
    }
  }, [open, profile]);

  const checkUsername = useCallback(async (value: string) => {
    if (!value || value.length < 3 || !USERNAME_REGEX.test(value)) {
      setUsernameStatus("invalid");
      return;
    }
    setUsernameStatus("checking");
    try {
      const { data, error } = await supabase.rpc("check_username_available" as any, { _username: value });
      if (error) {
        setUsernameStatus("idle");
        return;
      }
      setUsernameStatus(data ? "available" : "taken");
    } catch {
      setUsernameStatus("idle");
    }
  }, []);

  const handleUsernameChange = (value: string) => {
    const normalized = value.toLowerCase().replace(/\s/g, "").slice(0, 30);
    setUsername(normalized);
    if (checkTimeout) clearTimeout(checkTimeout);
    if (normalized === ((profile as any)?.username || "")) {
      setUsernameStatus("idle");
      return;
    }
    if (normalized.length < 3) {
      setUsernameStatus(normalized.length > 0 ? "invalid" : "idle");
      return;
    }
    if (!USERNAME_REGEX.test(normalized)) {
      setUsernameStatus("invalid");
      return;
    }
    const t = setTimeout(() => checkUsername(normalized), 400);
    setCheckTimeout(t);
  };

  const handleSave = async () => {
    if (!user) {
      toast.error("You must be signed in to save your profile");
      return;
    }
    if (!displayName.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!username || username.length < 3 || !USERNAME_REGEX.test(username)) {
      toast.error("Username must be at least 3 characters (lowercase letters, numbers, dots, dashes)");
      return;
    }
    if (usernameStatus === "taken") {
      toast.error("That username is already taken");
      return;
    }

    setSaving(true);
    try {
      // Use upsert to handle both insert and update cases
      const { error } = await supabase
        .from("profiles")
        .upsert({
          id: user.id,
          display_name: displayName.trim(),
          username,
        } as any, { onConflict: "id" });

      if (error) {
        if (error.message?.includes("profiles_username_unique")) {
          toast.error("That username is already taken");
          setUsernameStatus("taken");
        } else {
          console.error("Profile save error:", error);
          toast.error(error.message || "Failed to save profile");
        }
      } else {
        toast.success("Profile updated!");
        await refreshProfile();
        onOpenChange(false);
      }
    } catch (err: any) {
      console.error("Profile save exception:", err);
      toast.error("Could not save profile. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const usernameStatusIcon = () => {
    switch (usernameStatus) {
      case "checking": return <Loader2 size={14} className="animate-spin text-muted-foreground" />;
      case "available": return <Check size={14} className="text-green-500" />;
      case "taken": return <X size={14} className="text-destructive" />;
      case "invalid": return <X size={14} className="text-orange-400" />;
      default: return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit Profile</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Name</label>
            <div className="relative">
              <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                maxLength={50}
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-secondary border border-border text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Username / ID</label>
            <div className="relative">
              <AtSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={username}
                onChange={(e) => handleUsernameChange(e.target.value)}
                placeholder="your.username"
                maxLength={30}
                className="w-full pl-10 pr-10 py-3 rounded-xl bg-secondary border border-border text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {usernameStatusIcon()}
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1 px-1">
              {usernameStatus === "taken" && "This username is already taken"}
              {usernameStatus === "available" && "Username is available!"}
              {usernameStatus === "invalid" && "Min 3 characters: lowercase letters, numbers, dots, dashes"}
              {usernameStatus === "idle" && "Used by friends to find you"}
            </p>
          </div>

          <button
            onClick={handleSave}
            disabled={saving || usernameStatus === "taken" || usernameStatus === "checking"}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : "Save Profile"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EditProfileModal;
