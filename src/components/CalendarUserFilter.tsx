import { useMemo } from "react";
import { useAuth, GroupMember } from "@/context/AuthContext";

export const EVERYONE_SENTINEL = "__everyone__";

// Per-person color scheme
export const MEMBER_COLORS = [
  { bg: "bg-blue-100 dark:bg-blue-900/40", border: "border-blue-300 dark:border-blue-700", text: "text-blue-700 dark:text-blue-300", dot: "#3B82F6", avatarBg: "bg-blue-500", cardBg: "#E6F1FB", cardBorder: "#B5D4F4" },
  { bg: "bg-emerald-100 dark:bg-emerald-900/40", border: "border-emerald-300 dark:border-emerald-700", text: "text-emerald-700 dark:text-emerald-300", dot: "#10B981", avatarBg: "bg-emerald-500", cardBg: "#EAF3DE", cardBorder: "#C0DD97" },
  { bg: "bg-pink-100 dark:bg-pink-900/40", border: "border-pink-300 dark:border-pink-700", text: "text-pink-700 dark:text-pink-300", dot: "#EC4899", avatarBg: "bg-pink-500", cardBg: "#FBEAF0", cardBorder: "#F4C0D1" },
  { bg: "bg-amber-100 dark:bg-amber-900/40", border: "border-amber-300 dark:border-amber-700", text: "text-amber-700 dark:text-amber-300", dot: "#F59E0B", avatarBg: "bg-amber-500", cardBg: "#FEF3C7", cardBorder: "#FCD34D" },
  { bg: "bg-teal-100 dark:bg-teal-900/40", border: "border-teal-300 dark:border-teal-700", text: "text-teal-700 dark:text-teal-300", dot: "#14B8A6", avatarBg: "bg-teal-500", cardBg: "#CCFBF1", cardBorder: "#5EEAD4" },
  { bg: "bg-orange-100 dark:bg-orange-900/40", border: "border-orange-300 dark:border-orange-700", text: "text-orange-700 dark:text-orange-300", dot: "#F97316", avatarBg: "bg-orange-500", cardBg: "#FFEDD5", cardBorder: "#FDBA74" },
];

export const SHARED_COLOR = { bg: "bg-violet-100 dark:bg-violet-900/40", border: "border-violet-300 dark:border-violet-700", text: "text-violet-700 dark:text-violet-300", dot: "#8B5CF6", avatarBg: "bg-violet-500", cardBg: "#EEEDFE", cardBorder: "#CECBF6" };
export const EVERYONE_COLOR = { bg: "bg-violet-100 dark:bg-violet-900/40", border: "border-violet-300 dark:border-violet-700", text: "text-violet-700 dark:text-violet-300", dot: "#8B5CF6", avatarBg: "bg-violet-500" };

export interface FilterUser {
  id: string;
  label: string;
  avatarUrl: string | null;
  initial: string;
  colorIndex: number;
}

export function useCalendarFilterUsers() {
  const { user, profile, activeGroup, groups } = useAuth();
  const isPersonal = (activeGroup as any)?._personal === true;
  const isAll = activeGroup === null && !isPersonal;
  const isGroup = !!activeGroup && !isPersonal;

  return useMemo<FilterUser[]>(() => {
    if (isPersonal) return [];
    const users: FilterUser[] = [];
    users.push({
      id: user?.id || "me",
      label: "Me",
      avatarUrl: profile?.avatar_url || null,
      initial: profile?.display_name?.charAt(0)?.toUpperCase() || "?",
      colorIndex: 0,
    });

    let colorIdx = 1;
    if (isGroup && activeGroup) {
      const others = activeGroup.members.filter((m: GroupMember) => m.user_id !== user?.id && m.status === "active");
      others.forEach((m) => {
        const name = m.display_name || "Member";
        users.push({
          id: m.user_id,
          label: name.split(" ")[0],
          avatarUrl: m.avatar_url,
          initial: name.charAt(0).toUpperCase(),
          colorIndex: colorIdx++ % MEMBER_COLORS.length,
        });
      });
    } else if (isAll) {
      const seen = new Set<string>();
      seen.add(user?.id || "");
      groups
        .filter((g) => g.shared_pages?.includes("calendar"))
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
                colorIndex: colorIdx++ % MEMBER_COLORS.length,
              });
            });
        });
    }
    return users;
  }, [user, profile, activeGroup, isGroup, isAll, isPersonal, groups]);
}

interface CalendarUserFilterProps {
  selectedUserIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
}

const CalendarUserFilter = ({ selectedUserIds, onSelectionChange }: CalendarUserFilterProps) => {
  const { user } = useAuth();
  const filterUsers = useCalendarFilterUsers();
  const isPersonal = filterUsers.length === 0;

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
    <div className="flex gap-1.5 overflow-x-auto scrollbar-hide scroll-smooth-touch py-1 -mx-1 px-1" style={{ WebkitOverflowScrolling: "touch" }}>
      {filterUsers.map((fu) => {
        const selected = isUserSelected(fu.id);
        const colors = MEMBER_COLORS[fu.colorIndex % MEMBER_COLORS.length];
        return (
          <button
            key={fu.id}
            onClick={() => toggleUser(fu.id)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all flex-shrink-0 border ${
              selected
                ? `${colors.bg} ${colors.border} ${colors.text}`
                : "border-border bg-secondary/50 text-muted-foreground"
            }`}
          >
            <span
              className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white flex-shrink-0 ${
                selected ? colors.avatarBg : "bg-muted-foreground/40"
              }`}
            >
              {fu.initial}
            </span>
            <span>{fu.label}</span>
          </button>
        );
      })}
      <button
        onClick={toggleEveryone}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all flex-shrink-0 border ${
          isEveryoneSelected
            ? `${EVERYONE_COLOR.bg} ${EVERYONE_COLOR.border} ${EVERYONE_COLOR.text}`
            : "border-border bg-secondary/50 text-muted-foreground"
        }`}
      >
        <span
          className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white flex-shrink-0 ${
            isEveryoneSelected ? EVERYONE_COLOR.avatarBg : "bg-muted-foreground/40"
          }`}
        >
          👥
        </span>
        <span>Everyone</span>
      </button>
    </div>
  );
};

export default CalendarUserFilter;
