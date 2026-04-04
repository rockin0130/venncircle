/**
 * useSobrietyViewMode — Reusable 4-mode view system for context + pill-driven pages.
 *
 * Modes:
 *   1. "mine_aggregate"  — Mine context selected; all logged-in user's trackers across every context, deduplicated.
 *   2. "mine_in_group"   — Group context + only Mine pill selected; user's trackers shared with that group.
 *   3. "single_other"    — Group context + one other user's pill selected; read-only view of that user's trackers.
 *   4. "multi_user"      — Group context + 2+ pills selected; column layout per selected member.
 *
 * To reuse on other pages (Workouts, Nutrition, Habits, etc.):
 *   1. Import this hook.
 *   2. Pass activeGroup, user, and selectedUserIds from your pill state.
 *   3. Use the returned `mode` to branch your rendering logic.
 *   4. Use `resolvedUserIds` for data fetching queries.
 *   5. Use `isMyDataOnly` to decide whether to show interactive or read-only cards.
 */

import { useMemo } from "react";

export type ViewMode = "mine_aggregate" | "mine_in_group" | "single_other" | "multi_user";

interface ViewModeInput {
  /** null when "Mine" context is selected; group object otherwise */
  activeGroupId: string | null;
  /** Whether the "Personal/Mine" sentinel context is active */
  isPersonalContext: boolean;
  /** The logged-in user's ID */
  userId: string | undefined;
  /** The set of selected member pill IDs (empty = everyone) */
  selectedUserIds: Set<string>;
  /** All active member IDs in the current group */
  groupMemberIds: string[];
}

interface ViewModeResult {
  mode: ViewMode;
  /** The user IDs whose data should be fetched */
  resolvedUserIds: string[];
  /** True when the view shows only the logged-in user's own interactive data */
  isMyDataOnly: boolean;
  /** In single_other mode, the ID of the other user being viewed */
  otherUserId: string | null;
  /** Number of columns for multi_user grid */
  columnCount: number;
}

export function useSobrietyViewMode({
  activeGroupId,
  isPersonalContext,
  userId,
  selectedUserIds,
  groupMemberIds,
}: ViewModeInput): ViewModeResult {
  return useMemo(() => {
    if (!userId) {
      return { mode: "mine_aggregate" as ViewMode, resolvedUserIds: [], isMyDataOnly: true, otherUserId: null, columnCount: 1 };
    }

    // Mode 1: Mine aggregate — "Mine" or "Personal" context selected
    if (isPersonalContext || activeGroupId === null) {
      return {
        mode: "mine_aggregate",
        resolvedUserIds: [userId],
        isMyDataOnly: true,
        otherUserId: null,
        columnCount: 1,
      };
    }

    // Group context — determine based on pill selection
    const selectedArr = Array.from(selectedUserIds);

    // If everyone sentinel or all members selected, treat as multi_user
    const isEveryone = selectedUserIds.has("__everyone__");
    const effectiveIds = isEveryone ? groupMemberIds : selectedArr;

    if (effectiveIds.length === 0) {
      // Fallback: just show mine
      return {
        mode: "mine_in_group",
        resolvedUserIds: [userId],
        isMyDataOnly: true,
        otherUserId: null,
        columnCount: 1,
      };
    }

    if (effectiveIds.length === 1) {
      const soleId = effectiveIds[0];
      if (soleId === userId) {
        // Mode 2: Mine in specific group
        return {
          mode: "mine_in_group",
          resolvedUserIds: [userId],
          isMyDataOnly: true,
          otherUserId: null,
          columnCount: 1,
        };
      }
      // Mode 3: Single other user
      return {
        mode: "single_other",
        resolvedUserIds: [soleId],
        isMyDataOnly: false,
        otherUserId: soleId,
        columnCount: 1,
      };
    }

    // Mode 4: Multi-user (2+ selected)
    // Ensure logged-in user is first
    const ordered = [userId, ...effectiveIds.filter(id => id !== userId)].filter(id => effectiveIds.includes(id) || id === userId);
    const uniqueOrdered = [...new Set(ordered)];

    return {
      mode: "multi_user",
      resolvedUserIds: uniqueOrdered,
      isMyDataOnly: false,
      otherUserId: null,
      columnCount: uniqueOrdered.length,
    };
  }, [activeGroupId, isPersonalContext, userId, selectedUserIds, groupMemberIds]);
}
