import { useState, useRef, useEffect } from "react";
import { useAuth, Group } from "@/context/AuthContext";
import { ChevronDown, Globe, Check } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const CompactGroupSwitcher = () => {
  const { groups, activeGroup, setActiveGroup, user } = useAuth();
  const [open, setOpen] = useState(false);

  if (groups.length === 0) return null;

  const getInitials = (name: string | null) =>
    name ? name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2) : "?";

  const getMemberAvatars = (group: Group) => {
    const others = group.members.filter((m) => m.user_id !== user?.id);
    const self = group.members.find((m) => m.user_id === user?.id);
    const ordered = [...others];
    if (self) ordered.push(self);
    return ordered.slice(0, 3);
  };

  const getShortLabel = (group: Group) => {
    if (group.members.length === 2) {
      const initials = group.members.map(m => (m.display_name || "?")[0].toUpperCase());
      return initials.join("&");
    }
    if (group.name.length <= 8) return group.name;
    return group.name.slice(0, 7) + "…";
  };

  return (
    <>
      {/* Compact pill trigger */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-border bg-card hover:bg-secondary/60 transition-all text-xs font-semibold text-foreground shadow-sm"
      >
        {activeGroup === null ? (
          <>
            <Globe size={13} className="text-muted-foreground" />
            <span className="text-muted-foreground">All</span>
          </>
        ) : (
          <>
            {/* Overlapping mini avatars */}
            <div className="flex -space-x-1.5">
              {getMemberAvatars(activeGroup).slice(0, 2).map((member, j) => (
                <div
                  key={member.id}
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold ring-1 ring-card bg-secondary text-foreground flex-shrink-0"
                  style={{ zIndex: 3 - j }}
                >
                  {member.avatar_url ? (
                    <img src={member.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                  ) : (
                    getInitials(member.display_name)
                  )}
                </div>
              ))}
            </div>
            <span className="max-w-[60px] truncate">{getShortLabel(activeGroup)}</span>
          </>
        )}
        <ChevronDown size={12} className="text-muted-foreground" />
      </button>

      {/* Bottom sheet with full options */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-8 px-4 pt-4 max-h-[60vh]">
          <SheetHeader className="pb-3">
            <SheetTitle className="text-base font-bold text-foreground">Switch Group</SheetTitle>
          </SheetHeader>

          <div className="space-y-1">
            {/* All option */}
            <button
              onClick={() => { setActiveGroup(null); setOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all ${
                activeGroup === null
                  ? "bg-primary/8 border border-primary/20"
                  : "hover:bg-secondary/60"
              }`}
            >
              <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                <Globe size={16} className="text-muted-foreground" />
              </div>
              <span className="text-sm font-medium text-foreground flex-1 text-left">All</span>
              {activeGroup === null && <Check size={16} className="text-primary" />}
            </button>

            {/* Group options */}
            {groups.map((group) => {
              const isActive = activeGroup?.id === group.id;
              const avatars = getMemberAvatars(group);

              return (
                <button
                  key={group.id}
                  onClick={() => { setActiveGroup(group); setOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all ${
                    isActive
                      ? "bg-primary/8 border border-primary/20"
                      : "hover:bg-secondary/60"
                  }`}
                >
                  {/* Avatars */}
                  <div className="flex -space-x-2 flex-shrink-0">
                    {avatars.map((member, j) => (
                      <div
                        key={member.id}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold ring-2 ring-card bg-secondary text-foreground"
                        style={{ zIndex: avatars.length - j }}
                      >
                        {member.avatar_url ? (
                          <img src={member.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                        ) : (
                          getInitials(member.display_name)
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-medium text-foreground">{group.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {group.members.length} member{group.members.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                  {isActive && <Check size={16} className="text-primary" />}
                </button>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};

export default CompactGroupSwitcher;
