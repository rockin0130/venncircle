import { useAuth } from "@/context/AuthContext";

/**
 * Shows a small group-origin badge on items when viewing in "All" mode.
 * Only renders when no activeGroup is set (i.e., consolidated view).
 */
const GroupBadge = ({ groupId }: { groupId?: string | null }) => {
  const { activeGroup, groups } = useAuth();

  // Only show in "All" mode
  if (activeGroup) return null;
  if (!groupId) return null;

  const group = groups.find((g) => g.id === groupId);
  if (!group) return null;

  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-secondary text-[10px] font-semibold text-muted-foreground leading-none whitespace-nowrap">
      <span>{group.emoji}</span>
      <span className="truncate max-w-[80px]">{group.name}</span>
    </span>
  );
};

export default GroupBadge;
