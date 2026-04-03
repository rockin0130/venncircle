import { useMemo } from "react";
import { useAuth } from "@/context/AuthContext";

export interface MemberFilter {
  id: string;
  label: string;
  userId?: string; // the actual user_id for member-specific filters
}

/**
 * Returns group-aware filter options and member info based on the active group.
 * For 3+ member groups, generates individual per-member tabs.
 */
export function useGroupContext() {
  const { user, partner, activeGroup } = useAuth();

  const otherMembers = useMemo(() => {
    if (!activeGroup || !user) return [];
    return activeGroup.members.filter((m) => m.user_id !== user.id);
  }, [activeGroup, user]);

  // The "other person" label — either the group member or the partner
  const otherName = useMemo(() => {
    if (activeGroup && otherMembers.length === 1) {
      return otherMembers[0].display_name || "Member";
    }
    if (activeGroup && otherMembers.length > 1) {
      return "Others";
    }
    return partner?.display_name || "Partner";
  }, [activeGroup, otherMembers, partner]);

  // In "All" mode (no active group), don't show partner/household filters
  const hasOther = useMemo(() => {
    if (!activeGroup) return false;
    return otherMembers.length > 0;
  }, [activeGroup, otherMembers]);

  // The shared/household label
  const sharedLabel = useMemo(() => {
    if (activeGroup) {
      if (otherMembers.length === 1) return "Together";
      if (otherMembers.length > 1) return "Shared";
      return "Shared";
    }
    return "Household";
  }, [activeGroup, otherMembers]);

  // Build filter set: Mine / Person1 / Person2 / ... / Shared
  // For 2-member groups: Mine / PartnerName's / Together
  // For 3+ member groups: Mine / Person1 / Person2 / ... / Shared
  const filters: MemberFilter[] = useMemo(() => {
    const result: MemberFilter[] = [{ id: "mine", label: "Mine" }];
    if (!hasOther) return result;

    if (otherMembers.length === 1) {
      // Classic 2-person: Mine / Partner's / Together
      result.push({
        id: "partner",
        label: `${otherMembers[0].display_name || "Partner"}'s`,
        userId: otherMembers[0].user_id,
      });
      result.push({ id: "household", label: sharedLabel });
    } else {
      // 3+ members: Mine / Person1 / Person2 / ... / Shared
      for (const member of otherMembers) {
        const name = member.display_name || "Member";
        result.push({
          id: `member:${member.user_id}`,
          label: name,
          userId: member.user_id,
        });
      }
      result.push({ id: "household", label: sharedLabel });
    }
    return result;
  }, [hasOther, otherMembers, sharedLabel]);

  // Two-tab filter for habits: Mine / OtherName's (or per-member)
  const twoTabFilters: MemberFilter[] = useMemo(() => {
    const result: MemberFilter[] = [{ id: "mine", label: "Mine" }];
    if (!hasOther) return result;

    if (otherMembers.length === 1) {
      result.push({
        id: "partner",
        label: `${otherMembers[0].display_name || "Partner"}'s`,
        userId: otherMembers[0].user_id,
      });
    } else {
      for (const member of otherMembers) {
        const name = member.display_name || "Member";
        result.push({
          id: `member:${member.user_id}`,
          label: name,
          userId: member.user_id,
        });
      }
    }
    return result;
  }, [hasOther, otherMembers]);

  // Workout filters: Mine / OtherName's / Together
  const workoutFilters: MemberFilter[] = useMemo(() => {
    const result: MemberFilter[] = [{ id: "mine", label: "Mine" }];
    if (!hasOther) return result;

    if (otherMembers.length === 1) {
      result.push({
        id: "partner",
        label: `${otherMembers[0].display_name || "Partner"}'s`,
        userId: otherMembers[0].user_id,
      });
    } else {
      for (const member of otherMembers) {
        const name = member.display_name || "Member";
        result.push({
          id: `member:${member.user_id}`,
          label: name,
          userId: member.user_id,
        });
      }
    }
    result.push({ id: "together", label: "Everyone" });
    return result;
  }, [hasOther, otherMembers]);

  // Google Calendar should be shown in both "All" and specific group views
  const showGoogleCalendar = true;

  return {
    otherMembers,
    otherName,
    hasOther,
    sharedLabel,
    filters,
    twoTabFilters,
    workoutFilters,
    showGoogleCalendar,
  };
}
