import { useState, useRef, useEffect } from "react";
import { Check } from "lucide-react";
import { GroupMember } from "@/context/AuthContext";

interface Props {
  assigneeUserIds: string[];
  groupMembers: GroupMember[];
  onAssign: (userIds: string[]) => void;
}

const ShoppingItemAssignee = ({ assigneeUserIds, groupMembers, onAssign }: Props) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const activeMembers = groupMembers.filter(m => m.status === "active");
  const assigned = activeMembers.filter(m => assigneeUserIds.includes(m.user_id));

  const toggle = (userId: string) => {
    const next = assigneeUserIds.includes(userId)
      ? assigneeUserIds.filter(id => id !== userId)
      : [...assigneeUserIds, userId];
    onAssign(next);
  };

  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(prev => !prev); }}
        className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border transition-all ${
          assigned.length > 0
            ? "border-primary/30 bg-primary/10 text-foreground"
            : "border-border bg-secondary/50 text-muted-foreground hover:border-primary/30"
        }`}
      >
        {assigned.length > 0 ? (
          <>
            <div className="flex -space-x-1">
              {assigned.slice(0, 2).map(m => (
                m.avatar_url ? (
                  <img key={m.user_id} src={m.avatar_url} className="w-3.5 h-3.5 rounded-full object-cover border border-background" alt="" />
                ) : (
                  <span key={m.user_id} className="w-3.5 h-3.5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[7px] font-bold border border-background">
                    {(m.display_name || "?").charAt(0).toUpperCase()}
                  </span>
                )
              ))}
            </div>
            <span className="truncate max-w-[48px]">
              {assigned.length === 1 ? (assigned[0].display_name || "").split(" ")[0] : `${assigned.length}`}
            </span>
          </>
        ) : (
          <span>Assign</span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-card border border-border rounded-xl shadow-lg py-1 min-w-[140px]">
          {activeMembers.map(m => {
            const selected = assigneeUserIds.includes(m.user_id);
            const name = (m.display_name || "Member").split(" ")[0];
            return (
              <button
                key={m.user_id}
                onClick={(e) => { e.stopPropagation(); toggle(m.user_id); }}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-secondary/50 transition-colors"
              >
                {m.avatar_url ? (
                  <img src={m.avatar_url} className="w-4 h-4 rounded-full object-cover" alt="" />
                ) : (
                  <span className="w-4 h-4 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-[8px] font-bold">
                    {name.charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="flex-1 text-left text-foreground">{name}</span>
                {selected && <Check size={12} className="text-primary" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ShoppingItemAssignee;
