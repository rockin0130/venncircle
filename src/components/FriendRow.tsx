import { useState } from "react";
import { Clock, Trash2 } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Friendship } from "@/hooks/useFriendships";

interface FriendRowProps {
  friendship: Friendship;
  currentUserId: string;
  onAccept?: (id: string) => void;
  onDecline?: (id: string) => void;
  onCancel?: (id: string) => void;
  onRemove?: (id: string) => void;
}

const FriendRow = ({ friendship, currentUserId, onAccept, onDecline, onCancel, onRemove }: FriendRowProps) => {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const { friend, status, requester_id } = friendship;
  const isPending = status === "pending";
  const isSentByMe = requester_id === currentUserId;
  const isIncoming = isPending && !isSentByMe;
  const isOutgoing = isPending && isSentByMe;
  const isActive = status === "accepted";

  // Resolve display name with fallbacks
  const displayName =
    friend?.display_name ||
    (friend?.email ? friend.email.split("@")[0] : null) ||
    "Unknown User";

  const initials = displayName
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";

  return (
    <>
      <div
        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
          isOutgoing
            ? "opacity-50 bg-muted/30"
            : isIncoming
              ? "bg-secondary/40 border border-primary/10"
              : "bg-secondary/40 hover:bg-secondary/60"
        }`}
      >
        <Avatar className="h-9 w-9 flex-shrink-0">
          {friend?.avatar_url ? (
            <AvatarImage src={friend.avatar_url} alt={displayName} />
          ) : null}
          <AvatarFallback className="text-xs font-semibold bg-primary/10 text-primary">
            {initials}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium truncate ${isOutgoing ? "text-muted-foreground" : "text-foreground"}`}>
            {displayName}
          </p>
          {isIncoming && (
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Sent you a friend request
            </p>
          )}
          {isOutgoing && (
            <p className="text-[10px] text-muted-foreground/70 flex items-center gap-1 mt-0.5">
              <Clock size={9} />
              Request sent
            </p>
          )}
        </div>

        {isIncoming && (
          <div className="flex items-center gap-1.5">
            <Button size="sm" className="h-7 px-3 text-xs rounded-lg" onClick={() => onAccept?.(friendship.id)}>
              Add
            </Button>
            <Button size="sm" variant="outline" className="h-7 px-3 text-xs rounded-lg" onClick={() => onDecline?.(friendship.id)}>
              Decline
            </Button>
          </div>
        )}

        {isOutgoing && (
          <button
            onClick={() => onCancel?.(friendship.id)}
            className="text-[10px] text-muted-foreground hover:text-destructive transition-colors px-2 py-1"
          >
            Cancel
          </button>
        )}

        {isActive && onRemove && (
          <button
            onClick={() => setConfirmRemove(true)}
            className="p-1.5 rounded-lg text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
            aria-label="Remove friend"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Friend?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove {displayName} from your friends list. You can add them again later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => onRemove?.(friendship.id)}
            >
              Remove Friend
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default FriendRow;
