import { useState } from "react";
import { toast } from "sonner";
import { Copy, MessageCircle, Send, Loader2 } from "lucide-react";

interface Step6Props {
  userId: string;
  profile: any;
  onContinue: () => void;
}

const Step6Invite = ({ userId, profile, onContinue }: Step6Props) => {
  const [email, setEmail] = useState("");
  const [invited, setInvited] = useState<string[]>([]);

  const referralCode = (profile as any)?.referral_code || (profile as any)?.invite_code || "XXXX";
  const referralLink = `venncircle.app/join?ref=${referralCode}`;

  const handleInvite = () => {
    if (!email.trim()) return;
    setInvited((p) => [...p, email.trim()]);
    setEmail("");
    toast.success("Invitation sent!");
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(referralLink);
    toast.success("Link copied!");
  };

  return (
    <div className="px-6 py-6 flex flex-col h-full">
      <div className="flex-1">
        <h1 style={{ fontSize: 22, fontWeight: 500, color: "#1a1a1a" }} className="mb-1">
          Build your circle.
        </h1>
        <p style={{ fontSize: 13, color: "#888" }} className="mb-6">
          Invite the people who push you forward. They'll get 30 days free when they join.
        </p>

        {/* Invite input */}
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Phone or email"
            className="flex-1 px-4 py-3 rounded-xl text-sm outline-none"
            style={{ background: "#fff", border: "0.5px solid rgba(0,0,0,0.07)" }}
            onKeyDown={(e) => e.key === "Enter" && handleInvite()}
          />
          <button
            onClick={handleInvite}
            className="px-5 py-3 rounded-xl text-sm font-semibold"
            style={{ background: "#6C47FF", color: "#fff" }}
          >
            Invite
          </button>
        </div>

        {/* Invited chips */}
        {invited.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6">
            {invited.map((inv, i) => (
              <span
                key={i}
                className="px-3 py-1.5 rounded-full text-xs font-medium"
                style={{ background: "rgba(108,71,255,0.08)", color: "#6C47FF" }}
              >
                {inv}
              </span>
            ))}
          </div>
        )}

        {/* Share link */}
        <div className="rounded-2xl p-4 mb-4" style={{ background: "#fff", border: "0.5px solid rgba(0,0,0,0.07)" }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: "#888", marginBottom: 8 }}>
            Or share your link
          </p>
          <div className="flex items-center gap-2">
            <div
              className="flex-1 px-3 py-2.5 rounded-xl text-xs truncate"
              style={{ background: "#F4F3F0", color: "#666" }}
            >
              {referralLink}
            </div>
            <button
              onClick={handleCopy}
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "rgba(108,71,255,0.08)" }}
            >
              <Copy size={14} color="#6C47FF" />
            </button>
          </div>
        </div>

        {/* Share buttons */}
        <div className="flex gap-3">
          <button
            onClick={handleCopy}
            className="flex-1 py-2.5 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5"
            style={{ background: "#fff", border: "0.5px solid rgba(0,0,0,0.07)" }}
          >
            <Copy size={12} /> Copy link
          </button>
          <button
            className="flex-1 py-2.5 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5"
            style={{ background: "#fff", border: "0.5px solid rgba(0,0,0,0.07)" }}
          >
            <MessageCircle size={12} /> iMessage
          </button>
          <button
            className="flex-1 py-2.5 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5"
            style={{ background: "#fff", border: "0.5px solid rgba(0,0,0,0.07)" }}
          >
            <Send size={12} /> WhatsApp
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <button
          onClick={onContinue}
          className="w-full py-3.5 rounded-xl text-sm font-semibold"
          style={{ background: "#6C47FF", color: "#fff" }}
        >
          Continue
        </button>
        <button onClick={onContinue} className="w-full py-2 text-xs" style={{ color: "#888" }}>
          Skip for now
        </button>
      </div>
    </div>
  );
};

export default Step6Invite;
