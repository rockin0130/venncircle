import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { GroupMember } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupMembers: GroupMember[];
}

const ShoppingNudgeSheet = ({ open, onOpenChange, groupMembers }: Props) => {
  const { user } = useAuth();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);

  const otherMembers = groupMembers.filter(m => m.status === "active" && m.user_id !== user?.id);

  const toggle = (userId: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const handleSend = async () => {
    if (!user || selected.size === 0) return;
    setSending(true);
    try {
      const inserts = [...selected].map(toId => ({
        from_user_id: user.id,
        to_user_id: toId,
        message: "🛒 Reminder to check the shopping list!",
      }));
      await supabase.from("nudges").insert(inserts);
      toast({ title: "Nudge sent! 🔔" });
      setSelected(new Set());
      onOpenChange(false);
    } catch {
      toast({ title: "Failed to send nudge", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl pb-8">
        <SheetHeader className="pb-3">
          <SheetTitle className="text-base">Send a nudge</SheetTitle>
        </SheetHeader>
        <div className="space-y-1">
          {otherMembers.map(m => {
            const name = (m.display_name || "Member").split(" ")[0];
            const isSelected = selected.has(m.user_id);
            return (
              <button
                key={m.user_id}
                onClick={() => toggle(m.user_id)}
                className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl transition-colors ${
                  isSelected ? "bg-primary/10" : "hover:bg-secondary/50"
                }`}
              >
                {m.avatar_url ? (
                  <img src={m.avatar_url} className="w-7 h-7 rounded-full object-cover" alt="" />
                ) : (
                  <span className="w-7 h-7 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-xs font-bold">
                    {name.charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="flex-1 text-left text-sm font-medium text-foreground">{name}</span>
                {isSelected && (
                  <span className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                    <span className="text-primary-foreground text-[10px]">✓</span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <Button
          onClick={handleSend}
          disabled={selected.size === 0 || sending}
          className="w-full mt-4"
        >
          {sending ? "Sending…" : "Send nudge"}
        </Button>
      </SheetContent>
    </Sheet>
  );
};

export const NudgePill = ({ onClick }: { onClick: () => void }) => (
  <button
    onClick={(e) => { e.stopPropagation(); onClick(); }}
    className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-colors"
  >
    <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="#92400E" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
    <span>Nudge</span>
  </button>
);

export default ShoppingNudgeSheet;
