import { useMemo } from "react";
import { useAuth, GroupMember } from "@/context/AuthContext";

export const EVERYONE_SENTINEL = "__everyone__";

interface WorkoutUserFilterProps {
  selectedUserIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
}

interface FilterUser {
  id: string;
  label: string;
  avatarUrl: string | null;
  initial: string;
}

const WorkoutUserFilter = ({ selectedUserIds, onSelectionChange }: WorkoutUserFilterProps) => {
  const { user, profile, activeGroup, groups } = useAuth();
  const isPersonal = (activeGroup as any)?._personal === true;
  const isAll = activeGroup === null && !isPersonal;
  const isGroup = !!activeGroup && !isPersonal;

  const filterUsers: FilterUser[] = useMemo(() => {
    if (isPersonal) return [];
    const users: FilterUser[] = [];
    users.push({
      id: user?.id || "me",
      label: "Me",
      avatarUrl: profile?.avatar_url || null,
      initial: profile?.display_name?.charAt(0)?.toUpperCase() || "?",
    });

    if (isGroup && activeGroup) {
      const others = activeGroup.members.filter((m: GroupMember) => m.user_id !== user?.id && m.status === "active");
      others.forEach((m) => {
        const name = m.display_name || "Member";
        users.push({
          id: m.user_id,
          label: name.split(" ")[0],
          avatarUrl: m.avatar_url,
          initial: name.charAt(0).toUpperCase(),
        });
      });
    } else if (isAll) {
      const seen = new Set<string>();
      seen.add(user?.id || "");
      groups
        .filter((g) => g.shared_pages?.includes("workout"))
        .forEach((g) => {
          g.members
            .filter((m: GroupMember) => m.status === "active" && !seen.has(m.user_id))
            .forEach((m) => {
              seen.add(m.user_id);
              const name = m.display_name || "Member";
              users.push({
                id: m.user_id,
                label: name.split(" ")[0],
                avatarUrl: m.avatar_url,
                initial: name.charAt(0).toUpperCase(),
              });
            });
        });
    }
    return users;
  }, [user, profile, activeGroup, isGroup, isAll, isPersonal, groups]);

  const allUserIds = useMemo(() => new Set(filterUsers.map((u) => u.id)), [filterUsers]);

  const isEveryone = selectedUserIds.has(EVERYONE_SENTINEL);
  const isEveryoneSelected = isEveryone || (allUserIds.size > 0 && [...allUserIds].every((id) => selectedUserIds.has(id)));

  const isUserSelected = (userId: string) => isEveryone || selectedUserIds.has(userId);

  if (isPersonal || filterUsers.length <= 1) return null;

  const toggleUser = (userId: string) => {
    if (isEveryone) {
      const next = new Set(allUserIds);
      next.delete(userId);
      if (next.size === 0) return;
      onSelectionChange(next);
      return;
    }
    const next = new Set(selectedUserIds);
    if (next.has(userId)) {
      next.delete(userId);
      if (next.size === 0) return;
    } else {
      next.add(userId);
      if ([...allUserIds].every((id) => next.has(id))) {
        onSelectionChange(new Set([EVERYONE_SENTINEL]));
        return;
      }
    }
    onSelectionChange(next);
  };

  const toggleEveryone = () => {
    if (isEveryoneSelected) {
      onSelectionChange(new Set([user?.id || "me"]));
    } else {
      onSelectionChange(new Set([EVERYONE_SENTINEL]));
    }
  };

  return (
    <div className="flex gap-1.5 overflow-x-auto scrollbar-hide scroll-smooth-touch py-1 -mx-1 px-1 mb-3" style={{ WebkitOverflowScrolling: "touch" }}>
      {filterUsers.map((fu) => {
        const selected = isUserSelected(fu.id);
        return (
          <button
            key={fu.id}
            onClick={() => toggleUser(fu.id)}
            className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium transition-all flex-shrink-0 border ${
              selected
                ? "border-primary/40 bg-primary/12 text-foreground"
                : "border-transparent bg-secondary/50 text-muted-foreground"
            }`}
          >
            {fu.avatarUrl ? (
              <img src={fu.avatarUrl} alt="" className="w-3.5 h-3.5 rounded-full object-cover flex-shrink-0" />
            ) : (
              <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[7px] font-bold flex-shrink-0 ${
                selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}>
                {fu.initial}
              </span>
            )}
            <span>{fu.label}</span>
          </button>
        );
      })}
      <button
        onClick={toggleEveryone}
        className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium transition-all flex-shrink-0 border ${
          isEveryoneSelected
            ? "border-primary/40 bg-primary/12 text-foreground"
            : "border-transparent bg-secondary/50 text-muted-foreground"
        }`}
      >
        <span className="text-[10px] leading-none">👥</span>
        <span>Everyone</span>
      </button>
    </div>
  );
};

export default WorkoutUserFilter;
