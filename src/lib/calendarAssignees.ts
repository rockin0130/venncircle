import type { Group } from "@/context/AuthContext";
import type { FilterUser } from "@/components/CalendarUserFilter";

export interface CalendarAssigneeItem {
  assignee: "me" | "partner" | "both";
  groupId?: string | null;
  type: "event" | "task" | "gcal";
  raw: any;
}

export interface AvatarMember {
  id: string;
  initial: string;
  colorIndex: number;
}

export interface CalendarCardTheme {
  background: string;
  border: string;
  title: string;
  time: string;
  accent: string;
}

export interface CalendarColumnPlacement {
  normalizedAssigneeIds: string[];
  columnIndices: number[];
  startColumn: number | null;
  endColumn: number | null;
  mode: "single" | "span" | "split";
  segments: Array<{ startColumn: number; endColumn: number }>;
}

const MEMBER_PALETTES = [
  {
    avatarBackground: "hsl(var(--calendar-member-a-bg))",
    avatarText: "hsl(var(--calendar-member-a-text))",
    cardBackground: "hsl(var(--calendar-member-a-card-bg))",
    cardBorder: "hsl(var(--calendar-member-a-card-border))",
    cardTitle: "hsl(var(--calendar-member-a-text))",
    cardAccent: "hsl(var(--calendar-member-a-text))",
  },
  {
    avatarBackground: "hsl(var(--calendar-member-b-bg))",
    avatarText: "hsl(var(--calendar-member-b-text))",
    cardBackground: "hsl(var(--calendar-member-b-card-bg))",
    cardBorder: "hsl(var(--calendar-member-b-card-border))",
    cardTitle: "hsl(var(--calendar-member-b-text))",
    cardAccent: "hsl(var(--calendar-member-b-text))",
  },
  {
    avatarBackground: "hsl(var(--calendar-member-c-bg))",
    avatarText: "hsl(var(--calendar-member-c-text))",
    cardBackground: "hsl(var(--calendar-member-c-card-bg))",
    cardBorder: "hsl(var(--calendar-member-c-card-border))",
    cardTitle: "hsl(var(--calendar-member-c-text))",
    cardAccent: "hsl(var(--calendar-member-c-text))",
  },
];

const SHARED_PALETTE = {
  avatarBackground: "hsl(var(--calendar-shared-bg))",
  avatarText: "hsl(var(--calendar-shared-text))",
  cardBackground: "hsl(var(--calendar-shared-card-bg))",
  cardBorder: "hsl(var(--calendar-shared-card-border))",
  cardTitle: "hsl(var(--calendar-shared-text))",
  cardAccent: "hsl(var(--calendar-shared-text))",
};

function dedupe(ids: Array<string | null | undefined>): string[] {
  return Array.from(new Set(ids.filter((id): id is string => Boolean(id))));
}

function getActiveGroupMemberIds(groups: Group[], groupId?: string | null): string[] {
  if (!groupId) return [];
  const group = groups.find((entry) => entry.id === groupId);
  return (group?.members || [])
    .filter((member) => member.status === "active")
    .map((member) => member.user_id);
}

export function normalizeCalendarAssignees({
  item,
  currentUserId,
  groups,
  visibleUserIds,
}: {
  item: CalendarAssigneeItem;
  currentUserId: string;
  groups: Group[];
  visibleUserIds?: string[];
}): string[] {
  const raw = item.raw as any;
  const ownerUserId = raw.ownerUserId || raw.user_id || currentUserId;
  const explicitAssigneeIds = dedupe(raw.assigneeUserIds || raw.assignee_user_ids || []);
  const fallbackGroupMemberIds = dedupe(
    getActiveGroupMemberIds(groups, item.groupId).length > 0
      ? getActiveGroupMemberIds(groups, item.groupId)
      : [ownerUserId, currentUserId],
  );

  const applyVisibleFilter = (ids: string[]) => {
    if (!visibleUserIds || visibleUserIds.length === 0) return dedupe(ids);
    const visibleSet = new Set(visibleUserIds);
    return dedupe(ids).filter((id) => visibleSet.has(id));
  };

  if (item.type === "gcal") {
    const explicitVisibleIds = applyVisibleFilter(explicitAssigneeIds);
    return explicitVisibleIds.length > 0 ? explicitVisibleIds : applyVisibleFilter([currentUserId]);
  }

  if (explicitAssigneeIds.length > 0) {
    if (item.assignee === "both" && explicitAssigneeIds.length <= 1 && fallbackGroupMemberIds.length > explicitAssigneeIds.length) {
      return applyVisibleFilter(fallbackGroupMemberIds);
    }
    return applyVisibleFilter(explicitAssigneeIds);
  }

  if (item.assignee === "partner") {
    const partnerIds = fallbackGroupMemberIds.filter((id) => id !== ownerUserId);
    return applyVisibleFilter(partnerIds.length > 0 ? partnerIds : [ownerUserId]);
  }

  if (item.assignee === "both") {
    return applyVisibleFilter(fallbackGroupMemberIds);
  }

  return applyVisibleFilter([ownerUserId]);
}

export function getAssignedAvatarMembers({
  assignedUserIds,
  filterUsers,
  currentUserId,
  currentUserInitial,
}: {
  assignedUserIds: string[];
  filterUsers: FilterUser[];
  currentUserId: string;
  currentUserInitial: string;
}): AvatarMember[] {
  const lookup = new Map(filterUsers.map((user) => [user.id, user]));

  return dedupe(assignedUserIds).map((userId) => {
    const filterUser = lookup.get(userId);
    if (filterUser) {
      return {
        id: filterUser.id,
        initial: filterUser.initial,
        colorIndex: filterUser.colorIndex,
      };
    }

    return {
      id: userId,
      initial: userId === currentUserId ? currentUserInitial : userId.charAt(0).toUpperCase() || "?",
      colorIndex: 0,
    };
  });
}

export function getAvatarPalette(colorIndex: number) {
  return MEMBER_PALETTES[Math.abs(colorIndex) % MEMBER_PALETTES.length];
}

export function getCalendarCardTheme(assignedUserIds: string[], filterUsers: FilterUser[]): CalendarCardTheme {
  const normalizedIds = dedupe(assignedUserIds);
  const visibleSet = new Set(filterUsers.map((user) => user.id));
  const visibleAssignedIds = normalizedIds.filter((userId) => visibleSet.has(userId));

  if (visibleAssignedIds.length > 0 && filterUsers.length > 0 && visibleAssignedIds.length === filterUsers.length) {
    return {
      background: SHARED_PALETTE.cardBackground,
      border: SHARED_PALETTE.cardBorder,
      title: SHARED_PALETTE.cardTitle,
      time: "hsl(var(--muted-foreground))",
      accent: SHARED_PALETTE.cardAccent,
    };
  }

  const primaryUser = filterUsers.find((user) => visibleAssignedIds.includes(user.id)) ?? filterUsers[0];
  const palette = primaryUser ? getAvatarPalette(primaryUser.colorIndex) : MEMBER_PALETTES[0];

  return {
    background: palette.cardBackground,
    border: palette.cardBorder,
    title: palette.cardTitle,
    time: "hsl(var(--muted-foreground))",
    accent: palette.cardAccent,
  };
}

export function getEventColumnPlacement({
  item,
  currentUserId,
  groups,
  columnUserIds,
}: {
  item: CalendarAssigneeItem;
  currentUserId: string;
  groups: Group[];
  columnUserIds: string[];
}): CalendarColumnPlacement {
  const normalizedAssigneeIds = normalizeCalendarAssignees({
    item,
    currentUserId,
    groups,
    visibleUserIds: columnUserIds,
  });

  const columnIndexByUserId = new Map(columnUserIds.map((userId, index) => [userId, index]));
  const fallbackIndex = columnIndexByUserId.get(currentUserId) ?? 0;
  const columnIndices = Array.from(
    new Set(
      normalizedAssigneeIds
        .map((userId) => columnIndexByUserId.get(userId))
        .filter((index): index is number => index !== undefined),
    ),
  ).sort((a, b) => a - b);

  const safeIndices = columnIndices.length > 0 ? columnIndices : [fallbackIndex];
  const startColumn = safeIndices[0] ?? null;
  const endColumn = safeIndices[safeIndices.length - 1] ?? null;
  const isConsecutive = safeIndices.every((index, position) => position === 0 || index === safeIndices[position - 1] + 1);

  if (safeIndices.length <= 1) {
    return {
      normalizedAssigneeIds,
      columnIndices: safeIndices,
      startColumn,
      endColumn,
      mode: "single",
      segments: [{ startColumn: safeIndices[0], endColumn: safeIndices[0] }],
    };
  }

  if (isConsecutive) {
    return {
      normalizedAssigneeIds,
      columnIndices: safeIndices,
      startColumn,
      endColumn,
      mode: "span",
      segments: [{ startColumn: startColumn!, endColumn: endColumn! }],
    };
  }

  return {
    normalizedAssigneeIds,
    columnIndices: safeIndices,
    startColumn,
    endColumn,
    mode: "split",
    segments: safeIndices.map((index) => ({ startColumn: index, endColumn: index })),
  };
}