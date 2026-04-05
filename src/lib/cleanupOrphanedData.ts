import { supabase } from "@/integrations/supabase/client";

/**
 * Lightweight cleanup that runs on app init.
 * Removes data tied to non-existent groups or features that aren't enabled for a group.
 * Only affects the current user's own data. Runs silently.
 */
export async function cleanupOrphanedData(userId: string) {
  try {
    // 1. Get all groups the user belongs to
    const { data: memberships } = await supabase
      .from("group_members")
      .select("group_id")
      .eq("user_id", userId)
      .eq("status", "active");

    const validGroupIds = new Set((memberships || []).map((m) => m.group_id));

    // 2. Get group details for feature gating
    const { data: groupRows } = await supabase
      .from("groups")
      .select("id, shared_pages");

    const groupPageMap = new Map<string, string[]>();
    (groupRows || []).forEach((g) => {
      groupPageMap.set(g.id, g.shared_pages || []);
    });

    // Helper: check if a group_id is valid (exists and user is a member)
    const isValidGroup = (gid: string | null) => gid !== null && validGroupIds.has(gid);

    // Helper: check if a group has a specific feature enabled
    const hasFeature = (gid: string, feature: string) => {
      const pages = groupPageMap.get(gid);
      return pages ? pages.includes(feature) : false;
    };

    // 3. Clean orphaned records per table
    // Each query: find user's records with a non-null group_id that is either
    // not in their groups OR doesn't have the relevant feature enabled

    const cleanups: Promise<void>[] = [];

    // Events (calendar feature)
    cleanups.push(cleanTable("events", userId, "calendar", isValidGroup, hasFeature));
    // Workouts
    cleanups.push(cleanTable("workouts", userId, "workout", isValidGroup, hasFeature));
    // Habits
    cleanups.push(cleanTable("habits", userId, "habits", isValidGroup, hasFeature));
    // Meal logs (nutrition)
    cleanups.push(cleanTable("meal_logs", userId, "nutrition", isValidGroup, hasFeature));
    // Tasks
    cleanups.push(cleanTable("tasks", userId, "calendar", isValidGroup, hasFeature));
    // Sobriety categories
    cleanups.push(cleanTable("sobriety_categories", userId, "sobriety", isValidGroup, hasFeature));
    // Special days
    cleanups.push(cleanTable("special_days", userId, "special_days", isValidGroup, hasFeature));
    // Shopping lists
    cleanups.push(cleanShoppingLists(userId, isValidGroup, hasFeature));
    // Calendars
    cleanups.push(cleanTable("calendars", userId, "calendar", isValidGroup, hasFeature));
    // Study sessions
    cleanups.push(cleanTable("study_sessions", userId, "study", isValidGroup, hasFeature));

    // 4. Clean shared_group_ids arrays (remove references to non-existent groups)
    cleanups.push(cleanSharedGroupIds("habits", userId, validGroupIds, groupPageMap, "habits"));
    cleanups.push(cleanSharedGroupIds("sobriety_categories", userId, validGroupIds, groupPageMap, "sobriety"));
    cleanups.push(cleanSharedGroupIds("special_days", userId, validGroupIds, groupPageMap, "special_days"));

    await Promise.all(cleanups);
  } catch (err) {
    // Silent — cleanup is best-effort
    console.warn("[cleanupOrphanedData] error:", err);
  }
}

async function cleanTable(
  table: string,
  userId: string,
  feature: string,
  isValidGroup: (gid: string | null) => boolean,
  hasFeature: (gid: string, feature: string) => boolean
) {
  const { data: rows } = await supabase
    .from(table as any)
    .select("id, group_id")
    .eq("user_id", userId)
    .not("group_id", "is", null);

  if (!rows || rows.length === 0) return;

  const toDelete = rows.filter((r: any) => {
    const gid = r.group_id as string;
    return !isValidGroup(gid) || !hasFeature(gid, feature);
  });

  if (toDelete.length === 0) return;

  const ids = toDelete.map((r: any) => r.id);

  // For habits, also delete completions
  if (table === "habits") {
    await supabase.from("habit_completions").delete().in("habit_id", ids);
  }
  // For sobriety_categories, also delete checkins
  if (table === "sobriety_categories") {
    await supabase.from("sobriety_checkins").delete().in("category_id", ids);
  }
  // For workouts, also delete exercise_logs
  if (table === "workouts") {
    await supabase.from("exercise_logs").delete().in("workout_id", ids);
  }

  await supabase.from(table as any).delete().in("id", ids);
}

async function cleanShoppingLists(
  userId: string,
  isValidGroup: (gid: string | null) => boolean,
  hasFeature: (gid: string, feature: string) => boolean
) {
  const { data: lists } = await supabase
    .from("shopping_lists")
    .select("id, group_id")
    .eq("user_id", userId)
    .not("group_id", "is", null);

  if (!lists || lists.length === 0) return;

  const toDelete = lists.filter((r) => {
    const gid = r.group_id as string;
    return !isValidGroup(gid) || !hasFeature(gid, "shopping");
  });

  if (toDelete.length === 0) return;

  const ids = toDelete.map((r) => r.id);
  await supabase.from("shopping_list_items").delete().in("list_id", ids);
  await supabase.from("shopping_lists").delete().in("id", ids);
}

async function cleanSharedGroupIds(
  table: string,
  userId: string,
  validGroupIds: Set<string>,
  groupPageMap: Map<string, string[]>,
  feature: string
) {
  const { data: rows } = await supabase
    .from(table as any)
    .select("id, shared_group_ids")
    .eq("user_id", userId);

  if (!rows || rows.length === 0) return;

  for (const row of rows as any[]) {
    const ids: string[] = row.shared_group_ids || [];
    if (ids.length === 0) continue;

    const cleaned = ids.filter((gid: string) => {
      if (!validGroupIds.has(gid)) return false;
      const pages = groupPageMap.get(gid);
      return pages ? pages.includes(feature) : false;
    });

    if (cleaned.length !== ids.length) {
      await supabase
        .from(table as any)
        .update({ shared_group_ids: cleaned } as any)
        .eq("id", row.id);
    }
  }
}
