import { supabase } from "@/integrations/supabase/client";

export interface HabitSectionMeta {
  key: string;
  label: string;
  icon: string;
  sortOrder?: number;
  dbId?: string;
}

const DEFAULT_SECTIONS: HabitSectionMeta[] = [
  { key: "morning", label: "Morning Habits", icon: "☀️", sortOrder: 0 },
];

// ── localStorage helpers (legacy fallback) ──

function storageKey(groupId: string | null): string {
  return `habitSections_${groupId || "personal"}`;
}

export function getHabitSectionsLocal(groupId: string | null): HabitSectionMeta[] {
  try {
    const raw = localStorage.getItem(storageKey(groupId));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return [...DEFAULT_SECTIONS];
}

/** @deprecated Use DB-backed methods via AppContext instead */
export function getHabitSections(groupId: string | null): HabitSectionMeta[] {
  return getHabitSectionsLocal(groupId);
}

export function setHabitSections(groupId: string | null, sections: HabitSectionMeta[]) {
  try {
    localStorage.setItem(storageKey(groupId), JSON.stringify(sections));
  } catch {}
}

function markMigrated(groupId: string | null) {
  try {
    localStorage.setItem(`habitSections_migrated_${groupId || "personal"}`, "1");
  } catch {}
}

function isMigrated(groupId: string | null): boolean {
  try {
    return localStorage.getItem(`habitSections_migrated_${groupId || "personal"}`) === "1";
  } catch {
    return false;
  }
}

// ── DB helpers ──

export async function loadSectionsFromDB(
  userId: string,
  groupId: string | null
): Promise<HabitSectionMeta[]> {
  let query = supabase
    .from("habit_sections" as any)
    .select("*")
    .eq("user_id", userId);

  if (groupId) {
    query = query.eq("group_id", groupId);
  } else {
    query = query.is("group_id", null);
  }

  const { data, error } = await query.order("sort_order", { ascending: true });

  if (error || !data || data.length === 0) {
    // If not migrated yet, migrate localStorage → DB
    if (!isMigrated(groupId)) {
      const local = getHabitSectionsLocal(groupId);
      if (local.length > 0) {
        const rows = local.map((s, i) => ({
          user_id: userId,
          group_id: groupId,
          key: s.key,
          label: s.label,
          icon: s.icon,
          sort_order: i,
        }));
        await supabase.from("habit_sections" as any).insert(rows);
        markMigrated(groupId);
        // Re-fetch
        return loadSectionsFromDB(userId, groupId);
      }
      // No local data either — insert defaults
      const defaultRows = DEFAULT_SECTIONS.map((s, i) => ({
        user_id: userId,
        group_id: groupId,
        key: s.key,
        label: s.label,
        icon: s.icon,
        sort_order: i,
      }));
      await supabase.from("habit_sections" as any).insert(defaultRows);
      markMigrated(groupId);
      return loadSectionsFromDB(userId, groupId);
    }
    return [];
  }

  markMigrated(groupId);
  return (data as any[]).map((row) => ({
    key: row.key,
    label: row.label,
    icon: row.icon,
    sortOrder: row.sort_order,
    dbId: row.id,
  }));
}

export async function addSectionToDB(
  userId: string,
  groupId: string | null,
  section: HabitSectionMeta,
  sortOrder: number
): Promise<HabitSectionMeta | null> {
  const { data, error } = await supabase
    .from("habit_sections" as any)
    .insert({
      user_id: userId,
      group_id: groupId,
      key: section.key,
      label: section.label,
      icon: section.icon,
      sort_order: sortOrder,
    })
    .select()
    .single();

  if (error || !data) return null;
  return {
    key: (data as any).key,
    label: (data as any).label,
    icon: (data as any).icon,
    sortOrder: (data as any).sort_order,
    dbId: (data as any).id,
  };
}

export async function createSharedSectionRPC(
  key: string,
  label: string,
  icon: string,
  groupId: string
): Promise<{ success?: boolean; error?: string }> {
  const { data, error } = await supabase.rpc("create_shared_section" as any, {
    _key: key,
    _label: label,
    _icon: icon,
    _group_id: groupId,
  });
  if (error) return { error: error.message };
  const result = data as any;
  if (result?.error) return { error: result.error };
  return { success: true };
}

export async function renameSectionInDB(
  userId: string,
  groupId: string | null,
  oldKey: string,
  newKey: string,
  newLabel: string
) {
  let query = supabase
    .from("habit_sections" as any)
    .update({ key: newKey, label: newLabel })
    .eq("user_id", userId)
    .eq("key", oldKey);

  if (groupId) {
    query = query.eq("group_id", groupId);
  } else {
    query = query.is("group_id", null);
  }

  await query;
}

export async function deleteSectionFromDB(
  userId: string,
  groupId: string | null,
  key: string
) {
  let query = supabase
    .from("habit_sections" as any)
    .delete()
    .eq("user_id", userId)
    .eq("key", key);

  if (groupId) {
    query = query.eq("group_id", groupId);
  } else {
    query = query.is("group_id", null);
  }

  await query;
}
