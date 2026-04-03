export type DashboardAssignee = "me" | "partner" | "both";

export interface DashboardMember {
  userId: string;
  name: string;
  isSelf: boolean;
}

interface ResolveAssignedUserIdsInput {
  assignee: DashboardAssignee;
  sourceUserId?: string | null;
  selfUserId: string;
  members: DashboardMember[];
}

export function buildColumnIndexMap(members: DashboardMember[]): Map<string, number> {
  return new Map(members.map((member, index) => [member.userId, index]));
}

export function resolveAssignedUserIds({
  assignee,
  sourceUserId,
  selfUserId,
  members,
}: ResolveAssignedUserIdsInput): string[] {
  if (members.length === 0) return [];

  const memberIds = new Set(members.map((m) => m.userId));
  const safeSelfUserId = memberIds.has(selfUserId) ? selfUserId : members[0].userId;
  const normalizedSourceUserId = sourceUserId && memberIds.has(sourceUserId) ? sourceUserId : null;
  const primaryOtherUserId = members.find((m) => m.userId !== safeSelfUserId)?.userId ?? null;

  if (assignee === "me") {
    return [safeSelfUserId];
  }

  if (assignee === "partner") {
    if (normalizedSourceUserId && normalizedSourceUserId !== safeSelfUserId) {
      return [normalizedSourceUserId];
    }
    return primaryOtherUserId ? [primaryOtherUserId] : [];
  }

  // "both"
  if (members.length === 1) {
    return [safeSelfUserId];
  }

  // If this item originated from a known non-self member, span that member + self.
  if (normalizedSourceUserId && normalizedSourceUserId !== safeSelfUserId) {
    return Array.from(new Set([safeSelfUserId, normalizedSourceUserId]));
  }

  // Fallback for broader groups: treat as shared with the whole visible group.
  return members.map((m) => m.userId);
}

export function resolveColumnIndexes(
  assignedUserIds: string[],
  columnIndexByUserId: Map<string, number>,
): number[] {
  const seen = new Set<number>();
  assignedUserIds.forEach((userId) => {
    const index = columnIndexByUserId.get(userId);
    if (index !== undefined) seen.add(index);
  });
  return Array.from(seen).sort((a, b) => a - b);
}
