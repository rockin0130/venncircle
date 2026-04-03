import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Loader2, User, AtSign, Check, X, ArrowRight } from "lucide-react";

const USERNAME_REGEX = /^[a-z0-9._-]+$/;

interface ProfileSetupPageProps {
  userId: string;
  initialName?: string;
  onComplete: () => void;
}

const ProfileSetupPage = ({ userId, initialName, onComplete }: ProfileSetupPageProps) => {
  const [displayName, setDisplayName] = useState(initialName || "");
  const [username, setUsername] = useState("");
  const [saving, setSaving] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid">("idle");
  const [checkTimeout, setCheckTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);

  const checkUsername = useCallback(async (value: string) => {
    if (!value || value.length < 3 || !USERNAME_REGEX.test(value)) {
      setUsernameStatus("invalid");
      return;
    }
    setUsernameStatus("checking");
    const { data } = await supabase.rpc("check_username_available" as any, { _username: value });
    setUsernameStatus(data ? "available" : "taken");
  }, []);

  const handleUsernameChange = (value: string) => {
    const normalized = value.toLowerCase().replace(/\s/g, "").slice(0, 30);
    setUsername(normalized);
    if (checkTimeout) clearTimeout(checkTimeout);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      toast.error("Please enter your name");
      return;
    }
    if (!username || username.length < 3 || !USERNAME_REGEX.test(username)) {
      toast.error("Please choose a valid username");
      return;
    }
    if (usernameStatus === "taken") {
      toast.error("That username is already taken");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .upsert({
          id: userId,
          display_name: displayName.trim(),
          username,
        } as any, { onConflict: "id" });

      if (error) {
        if (error.message?.includes("profiles_username_unique")) {
          toast.error("That username is already taken");
          setUsernameStatus("taken");
        } else {
          console.error("Profile setup save error:", error);
          toast.error(error.message || "Failed to save profile");
        }
        setSaving(false);
        return;
      }

      toast.success("Profile set up! 🎉");
      onComplete();
    } catch (err: any) {
      console.error("Profile setup exception:", err);
      toast.error("Could not save profile. Please try again.");
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-svh bg-background px-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <User size={32} className="text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Complete Your Profile</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Set your name and choose a unique username
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
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
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-card border border-border text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Username</label>
            <div className="relative">
              <AtSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={username}
                onChange={(e) => handleUsernameChange(e.target.value)}
                placeholder="your.username"
                maxLength={30}
                className="w-full pl-10 pr-10 py-3 rounded-xl bg-card border border-border text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {usernameStatus === "checking" && <Loader2 size={14} className="animate-spin text-muted-foreground" />}
                {usernameStatus === "available" && <Check size={14} className="text-green-500" />}
                {usernameStatus === "taken" && <X size={14} className="text-destructive" />}
                {usernameStatus === "invalid" && <X size={14} className="text-orange-400" />}
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1 px-1">
              {usernameStatus === "taken" ? "This username is already taken" :
               usernameStatus === "available" ? "Username is available!" :
               usernameStatus === "invalid" ? "Min 3 characters: lowercase letters, numbers, dots, dashes" :
               "Friends can find you by this ID"}
            </p>
          </div>

          <button
            type="submit"
            disabled={saving || usernameStatus === "taken" || usernameStatus === "checking"}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
          >
            {saving ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <>
                Continue
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>
      </motion.div>
    </div>
  );
};

export default ProfileSetupPage;
