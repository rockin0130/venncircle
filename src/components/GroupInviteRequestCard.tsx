import { useState } from "react";
import { Check, X, Loader2 } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useAuth, type PendingGroupInvite } from "@/context/AuthContext";
import { toast } from "sonner";

interface Props {
  invite: PendingGroupInvite;
  variant?: "card" | "compact";
  onResolved?: () => void;
}

/**
 * Instagram-style group invite request card.
 * Shows inviter avatar, group name, and Confirm / X buttons.
 */
const GroupInviteRequestCard = ({ invite, variant = "card", onResolved }: Props) => {
  const { acceptGroupInvite, declineGroupInvite } = useAuth();
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);

  const inviterName = invite.invited_by_name || "Someone";
  const initials = inviterName
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";

  const handleAccept = async () => {
    setBusy("accept");
    const result = await acceptGroupInvite(invite.group_id);
    if (result.error) {
      toast.error(result.error);
      setBusy(null);
      return;
    }
    onResolved?.();
  };

  const handleDecline = async () => {
    setBusy("decline");
    const result = await declineGroupInvite(invite.group_id);
    if (result.error) {
      toast.error(result.error);
      setBusy(null);
      return;
    }
    toast("Invite declined");
    onResolved?.();
  };

  if (variant === "compact") {
    return (
      <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-primary/5 border border-primary/15">
        <Avatar className="h-9 w-9 flex-shrink-0">
          {invite.invited_by_avatar ? <AvatarImage src={invite.invited_by_avatar} alt={inviterName} /> : null}
          <AvatarFallback className="text-xs font-semibold bg-primary/15 text-primary">{initials}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground truncate">
            <span className="font-bold">{inviterName}</span> invited you
          </p>
          <p className="text-[11px] text-muted-foreground truncate">
            {invite.group_emoji} {invite.group_name}
          </p>
        </div>
        <button
          onClick={handleAccept}
          disabled={busy !== null}
          className="h-7 px-3 rounded-lg bg-primary text-primary-foreground text-[11px] font-semibold disabled:opacity-50 flex items-center gap-1"
          aria-label="Confirm invite"
        >
          {busy === "accept" ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
          Confirm
        </button>
        <button
          onClick={handleDecline}
          disabled={busy !== null}
          className="h-7 w-7 rounded-lg border border-border text-muted-foreground hover:bg-secondary disabled:opacity-50 flex items-center justify-center"
          aria-label="Decline invite"
        >
          {busy === "decline" ? <Loader2 size={11} className="animate-spin" /> : <X size={12} />}
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 p-3 rounded-2xl bg-card border border-border">
      <Avatar className="h-11 w-11 flex-shrink-0">
        {invite.invited_by_avatar ? <AvatarImage src={invite.invited_by_avatar} alt={inviterName} /> : null}
        <AvatarFallback className="text-sm font-semibold bg-primary/15 text-primary">{initials}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground leading-tight">
          <span className="font-semibold">{inviterName}</span>{" "}
          <span className="text-muted-foreground">invited you to join</span>
        </p>
        <p className="text-sm font-semibold text-foreground truncate mt-0.5">
          {invite.group_emoji} {invite.group_name}
        </p>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button
          onClick={handleAccept}
          disabled={busy !== null}
          className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50 flex items-center gap-1"
        >
          {busy === "accept" ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
          Confirm
        </button>
        <button
          onClick={handleDecline}
          disabled={busy !== null}
          className="h-8 w-8 rounded-lg border border-border text-muted-foreground hover:bg-secondary disabled:opacity-50 flex items-center justify-center"
          aria-label="Decline"
        >
          {busy === "decline" ? <Loader2 size={12} className="animate-spin" /> : <X size={14} />}
        </button>
      </div>
    </div>
  );
};

export default GroupInviteRequestCard;
