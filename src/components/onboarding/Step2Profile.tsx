import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Camera, Plus, AtSign, User, Check, X } from "lucide-react";

const USERNAME_REGEX = /^[a-z0-9._-]+$/;

interface Step2Props {
  userId: string;
  profile: any;
  onContinue: () => void;
}

const Step2Profile = ({ userId, profile, onContinue }: Step2Props) => {
  const [displayName, setDisplayName] = useState(profile?.display_name || "");
  const [username, setUsername] = useState(profile?.username || "");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile?.avatar_url || null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid">(
    profile?.username ? "available" : "idle"
  );
  const fileRef = useRef<HTMLInputElement>(null);
  const checkTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

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
    if (checkTimeoutRef.current) clearTimeout(checkTimeoutRef.current);
    if (normalized.length < 3) {
      setUsernameStatus(normalized.length > 0 ? "invalid" : "idle");
      return;
    }
    if (!USERNAME_REGEX.test(normalized)) { setUsernameStatus("invalid"); return; }
    checkTimeoutRef.current = setTimeout(() => checkUsername(normalized), 400);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarUrl(URL.createObjectURL(file));
  };

  const handleSubmit = async () => {
    if (!displayName.trim()) { toast.error("Please enter your name"); return; }
    if (!username || username.length < 3 || !USERNAME_REGEX.test(username)) {
      toast.error("Please choose a valid username"); return;
    }
    if (usernameStatus === "taken") { toast.error("That username is already taken"); return; }

    setSaving(true);
    try {
      let uploadedAvatarUrl = profile?.avatar_url || null;
      if (avatarFile) {
        const ext = avatarFile.name.split(".").pop();
        const path = `${userId}/avatar.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(path, avatarFile, { upsert: true });
        if (!uploadError) {
          const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
          uploadedAvatarUrl = urlData.publicUrl + "?t=" + Date.now();
        }
      }

      const { error } = await supabase
        .from("profiles")
        .update({
          display_name: displayName.trim(),
          username,
          avatar_url: uploadedAvatarUrl,
        } as any)
        .eq("id", userId);

      if (error) {
        if (error.message?.includes("profiles_username_unique")) {
          toast.error("Username is taken"); setUsernameStatus("taken");
        } else {
          toast.error(error.message || "Failed to save");
        }
        setSaving(false);
        return;
      }
      onContinue();
    } catch {
      toast.error("Could not save profile");
      setSaving(false);
    }
  };

  return (
    <div className="px-6 py-6 flex flex-col h-full">
      <div className="flex-1">
        <h1 style={{ fontSize: 22, fontWeight: 500, color: "#1a1a1a" }} className="mb-1">
          Make it yours.
        </h1>
        <p style={{ fontSize: 13, color: "#888" }} className="mb-8">
          How should your circle know you?
        </p>

        {/* Avatar */}
        <div className="flex justify-center mb-8">
          <button
            onClick={() => fileRef.current?.click()}
            className="relative w-24 h-24 rounded-full flex items-center justify-center overflow-hidden"
            style={{
              border: "2px dashed #6C47FF",
              background: avatarUrl ? "transparent" : "rgba(108,71,255,0.06)",
            }}
          >
            {avatarUrl ? (
              <img src={avatarUrl} className="w-full h-full object-cover" alt="avatar" />
            ) : (
              <Camera size={28} color="#6C47FF" />
            )}
            <div
              className="absolute -bottom-0.5 -right-0.5 w-7 h-7 rounded-full flex items-center justify-center"
              style={{ background: "#6C47FF" }}
            >
              <Plus size={14} color="#fff" />
            </div>
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
        </div>

        {/* Name */}
        <div className="mb-4">
          <label style={{ fontSize: 11, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: 1 }} className="block mb-1.5">
            Name
          </label>
          <div className="relative">
            <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#aaa" }} />
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
              maxLength={50}
              className="w-full pl-10 pr-4 py-3 rounded-xl text-sm outline-none"
              style={{
                background: "#fff",
                border: "0.5px solid rgba(0,0,0,0.07)",
                fontSize: 14,
              }}
            />
          </div>
        </div>

        {/* Username */}
        <div className="mb-4">
          <label style={{ fontSize: 11, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: 1 }} className="block mb-1.5">
            Username
          </label>
          <div className="relative">
            <AtSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#aaa" }} />
            <input
              type="text"
              value={username}
              onChange={(e) => handleUsernameChange(e.target.value)}
              placeholder="your.username"
              maxLength={30}
              className="w-full pl-10 pr-10 py-3 rounded-xl text-sm outline-none"
              style={{
                background: "#fff",
                border: "0.5px solid rgba(0,0,0,0.07)",
                fontSize: 14,
              }}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              {usernameStatus === "checking" && <Loader2 size={14} className="animate-spin" style={{ color: "#aaa" }} />}
              {usernameStatus === "available" && <Check size={14} color="#22c55e" />}
              {usernameStatus === "taken" && <X size={14} color="#ef4444" />}
              {usernameStatus === "invalid" && <X size={14} color="#f59e0b" />}
            </div>
          </div>
          <p style={{ fontSize: 11, color: "#999", marginTop: 4, paddingLeft: 4 }}>
            {usernameStatus === "taken" ? "This username is already taken" :
             usernameStatus === "available" ? "Username is available!" :
             usernameStatus === "invalid" ? "Min 3 characters: lowercase letters, numbers, dots, dashes" :
             "Friends can find you by this ID"}
          </p>
        </div>
      </div>

      {/* Continue button pinned to bottom */}
      <button
        onClick={handleSubmit}
        disabled={saving || !displayName.trim() || usernameStatus === "taken" || usernameStatus === "checking" || (!username || username.length < 3)}
        className="w-full py-3.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40 transition-all"
        style={{ background: "#6C47FF", color: "#fff" }}
      >
        {saving ? <Loader2 size={16} className="animate-spin" /> : "Continue"}
      </button>
    </div>
  );
};

export default Step2Profile;
