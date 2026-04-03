import { describe, it, expect } from "vitest";
import {
  DashboardMember,
  buildColumnIndexMap,
  resolveAssignedUserIds,
  resolveColumnIndexes,
} from "@/lib/teamDashboardMapping";

describe("teamDashboardMapping", () => {
  const twoMembersReversed: DashboardMember[] = [
    { userId: "u-evelyn", name: "Evelyn", isSelf: false },
    { userId: "u-harrison", name: "Harrison", isSelf: true },
  ];

  it("maps self-assigned item to self column even when headers are reversed", () => {
    const ids = resolveAssignedUserIds({
      assignee: "me",
      sourceUserId: "u-harrison",
      selfUserId: "u-harrison",
      members: twoMembersReversed,
    });

    const indexes = resolveColumnIndexes(ids, buildColumnIndexMap(twoMembersReversed));
    expect(indexes).toEqual([1]);
  });

  it("maps right-user assignment to the right-user column", () => {
    const ids = resolveAssignedUserIds({
      assignee: "partner",
      sourceUserId: "u-evelyn",
      selfUserId: "u-harrison",
      members: twoMembersReversed,
    });

    const indexes = resolveColumnIndexes(ids, buildColumnIndexMap(twoMembersReversed));
    expect(indexes).toEqual([0]);
  });

  it("maps shared item to both columns in 2-user layout", () => {
    const ids = resolveAssignedUserIds({
      assignee: "both",
      sourceUserId: "u-evelyn",
      selfUserId: "u-harrison",
      members: twoMembersReversed,
    });

    const indexes = resolveColumnIndexes(ids, buildColumnIndexMap(twoMembersReversed));
    expect(indexes).toEqual([0, 1]);
  });

  it("handles self->partner assignment in 2-user layout", () => {
    const ids = resolveAssignedUserIds({
      assignee: "partner",
      sourceUserId: "u-harrison",
      selfUserId: "u-harrison",
      members: twoMembersReversed,
    });

    const indexes = resolveColumnIndexes(ids, buildColumnIndexMap(twoMembersReversed));
    expect(indexes).toEqual([0]);
  });

  it("supports 3+ members and spans shared items deterministically", () => {
    const threeMembers: DashboardMember[] = [
      { userId: "u-evelyn", name: "Evelyn", isSelf: false },
      { userId: "u-harrison", name: "Harrison", isSelf: true },
      { userId: "u-mike", name: "Mike", isSelf: false },
    ];

    const ids = resolveAssignedUserIds({
      assignee: "both",
      sourceUserId: "u-harrison",
      selfUserId: "u-harrison",
      members: threeMembers,
    });

    const indexes = resolveColumnIndexes(ids, buildColumnIndexMap(threeMembers));
    expect(indexes).toEqual([0, 1, 2]);
  });
});
