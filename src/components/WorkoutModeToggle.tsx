import { useState, useMemo, useRef, useEffect } from "react";
import { ChevronDown, Check, Plus } from "lucide-react";
import { useAuth, Group, GroupMember } from "@/context/AuthContext";
import CreateGroupModal from "@/components/CreateGroupModal";

export type WorkoutMode = "mine" | "group";

interface MemberOption {
  userId: string;
  label: string;
  initial: string;
  avatarUrl: string | null;
}

/* ── Mode Toggle Bar ── */
export const ModeToggleBar = ({
  mode,
  onModeChange,
}: {
  mode: WorkoutMode;
  onModeChange: (m: WorkoutMode) => void;
}) => (
  <div
    className="flex rounded-full p-[3px] mb-3"
    style={{ background: "#fff", border: "0.5px solid rgba(0,0,0,0.08)" }}
  >
    {(["mine", "group"] as const).map((m) => (
      <button
        key={m}
        onClick={() => onModeChange(m)}
        className="flex-1 py-2 rounded-full text-[13px] font-semibold transition-all"
        style={{
          background: mode === m ? "#1a1a1a" : "transparent",
          color: mode === m ? "#fff" : "#999",
        }}
      >
        {m === "mine" ? "Mine" : "Group"}
      </button>
    ))}
  </div>
);

/* ── Group Pills Row ── */
export const GroupPillsRow = ({
  selectedGroupId,
  onSelectGroup,
  page = "workout",
}: {
  selectedGroupId: string | null;
  onSelectGroup: (groupId: string) => void;
  page?: "calendar" | "habits" | "nutrition" | "shopping" | "sobriety" | "study" | "workout";
}) => {
  const { groups } = useAuth();
  const [showCreate, setShowCreate] = useState(false);

  const workoutGroups = useMemo(
    () => groups.filter((g) => g.shared_pages?.includes(page)),
    [groups, page]
  );

  return (
    <>
      <div
        className="flex gap-1.5 overflow-x-auto scrollbar-hide scroll-smooth-touch py-1 -mx-1 px-1 mb-2"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {workoutGroups.map((g) => {
          const active = selectedGroupId === g.id;
          return (
            <button
              key={g.id}
              onClick={() => onSelectGroup(g.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all flex-shrink-0"
              style={{
                background: active ? "#1a1a1a" : "#fff",
                color: active ? "#fff" : "#666",
                border: active ? "none" : "0.5px solid rgba(0,0,0,0.1)",
              }}
            >
              <span className="text-sm leading-none">{g.emoji}</span>
              <span className="truncate max-w-[120px]">{g.name}</span>
            </button>
          );
        })}
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold transition-all flex-shrink-0"
          style={{ border: "1.5px dashed rgba(0,0,0,0.15)", color: "#999", background: "transparent" }}
        >
          <Plus size={12} />
          <span>Add</span>
        </button>
      </div>
      <CreateGroupModal open={showCreate} onOpenChange={setShowCreate} defaultPage={page} />
    </>
  );
};

/* ── Member Selector Dropdown ── */
export const MemberSelectorPill = ({
  groupId,
  selectedUserIds,
  onSelectionChange,
}: {
  groupId: string;
  selectedUserIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
}) => {
  const { user, profile, groups } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const group = groups.find((g) => g.id === groupId);
  const members: MemberOption[] = useMemo(() => {
    if (!group || !user) return [];
    const result: MemberOption[] = [];
    // Current user first — always labeled "Me"
    result.push({
      userId: user.id,
      label: "Me",
      initial: (profile?.display_name || "U")[0].toUpperCase(),
      avatarUrl: profile?.avatar_url || null,
    });
    // Other members
    group.members
      .filter((m: GroupMember) => m.user_id !== user.id && m.status === "active")
      .forEach((m) => {
        const name = m.display_name || "Member";
        result.push({
          userId: m.user_id,
          label: name.split(" ")[0],
          initial: name[0].toUpperCase(),
          avatarUrl: m.avatar_url,
        });
      });
    return result;
  }, [group, user, profile]);

  const allIds = useMemo(() => new Set(members.map((m) => m.userId)), [members]);
  const isEveryone = selectedUserIds.has("__everyone__") || (allIds.size > 0 && [...allIds].every((id) => selectedUserIds.has(id)));

  const toggleEveryone = () => {
    if (isEveryone) {
      onSelectionChange(new Set([user?.id || ""]));
    } else {
      onSelectionChange(new Set(["__everyone__"]));
    }
  };

  const toggleMember = (userId: string) => {
    if (selectedUserIds.has("__everyone__")) {
      // Switch from everyone to all except this user
      const next = new Set(allIds);
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
      if ([...allIds].every((id) => next.has(id))) {
        onSelectionChange(new Set(["__everyone__"]));
        return;
      }
    }
    onSelectionChange(next);
  };

  // Label
  const label = useMemo(() => {
    if (isEveryone) return "Everyone";
    const names = members.filter((m) => selectedUserIds.has(m.userId)).map((m) => m.label);
    if (names.length === 0) return "Everyone";
    if (names.length === 1) return names[0];
    return names.join(", ");
  }, [isEveryone, members, selectedUserIds]);

  if (members.length <= 1) return null;

  const MEMBER_COLORS = ["#3B82F6", "#10B981", "#EC4899", "#8B5CF6", "#F59E0B"];

  return (
    <div className="relative mb-3" ref={ref}>
      <button
        onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold transition-all"
        style={{ background: "#fff", border: "0.5px solid rgba(0,0,0,0.1)", color: "#1a1a1a" }}
      >
        {isEveryone && <span className="text-[11px] leading-none">👥</span>}
        <span className="truncate max-w-[180px]">{label}</span>
        <ChevronDown size={12} className="text-muted-foreground" />
      </button>

      {open && (
        <div
          className="absolute left-0 top-full mt-1 z-50 py-1 min-w-[200px]"
          style={{
            background: "#fff",
            borderRadius: 12,
            border: "0.5px solid rgba(0,0,0,0.08)",
            boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
          }}
        >
          {/* Everyone row */}
          <button
            onClick={toggleEveryone}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-gray-50 transition-colors"
          >
            <span className="text-[13px] leading-none">👥</span>
            <span className="flex-1 text-left text-[13px] font-medium" style={{ color: "#1a1a1a" }}>
              Everyone
            </span>
            <div
              className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-all"
              style={{
                background: isEveryone ? "#1a1a1a" : "transparent",
                border: isEveryone ? "none" : "2px solid #ccc",
              }}
            >
              {isEveryone && <Check size={11} color="#fff" />}
            </div>
          </button>

          {/* Divider */}
          <div style={{ height: "0.5px", background: "rgba(0,0,0,0.06)", margin: "0 12px" }} />

          {/* Individual members */}
          {members.map((m, idx) => {
            const checked = isEveryone || selectedUserIds.has(m.userId);
            const color = MEMBER_COLORS[idx % MEMBER_COLORS.length];
            return (
              <button
                key={m.userId}
                onClick={() => toggleMember(m.userId)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-gray-50 transition-colors"
              >
                {m.avatarUrl ? (
                  <img src={m.avatarUrl} alt="" className="w-5 h-5 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <span
                    className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[9px] font-bold text-white"
                    style={{ background: color }}
                  >
                    {m.initial}
                  </span>
                )}
                <span className="flex-1 text-left text-[13px] font-medium" style={{ color: "#1a1a1a" }}>
                  {m.label}
                </span>
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-all"
                  style={{
                    background: checked ? color : "transparent",
                    border: checked ? "none" : "2px solid #ccc",
                  }}
                >
                  {checked && <Check size={11} color="#fff" />}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

/* ── Per-Member Summary Cards ── */
export const MemberSummaryCards = ({
  members,
  weeklyGoal,
  memberWorkouts,
}: {
  members: MemberOption[];
  weeklyGoal: number;
  memberWorkouts: { userId: string; done: number; kcal: number; distance: number }[];
}) => {
  const COLORS = ["#3B82F6", "#10B981", "#EC4899", "#8B5CF6", "#F59E0B"];

  return (
    <div
      className="flex gap-2.5 overflow-x-auto scrollbar-hide pb-1 mb-4"
      style={{ WebkitOverflowScrolling: "touch" }}
    >
      {members.map((m, idx) => {
        const color = COLORS[idx % COLORS.length];
        const data = memberWorkouts.find((mw) => mw.userId === m.userId);
        const done = data?.done || 0;
        const kcal = data?.kcal || 0;
        const dist = data?.distance || 0;
        const pct = weeklyGoal > 0 ? Math.min(1, done / weeklyGoal) : 0;

        return (
          <div
            key={m.userId}
            className="flex-shrink-0 flex flex-col"
            style={{
              width: 130,
              background: "#fff",
              borderRadius: 12,
              border: "0.5px solid rgba(0,0,0,0.07)",
              padding: "10px 12px",
            }}
          >
            <div className="flex items-center gap-1.5 mb-2">
              {m.avatarUrl ? (
                <img src={m.avatarUrl} alt="" className="w-5 h-5 rounded-full object-cover" />
              ) : (
                <span
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                  style={{ background: color }}
                >
                  {m.initial}
                </span>
              )}
              <span className="text-[11px] font-semibold truncate" style={{ color }}>
                {m.label}
              </span>
            </div>
            <div className="flex items-baseline gap-0.5 mb-1">
              <span style={{ fontSize: 20, fontWeight: 600, color }}>{done}</span>
              <span style={{ fontSize: 12, color: "#999" }}>/{weeklyGoal}</span>
            </div>
            <div className="h-[3px] rounded-full mb-2" style={{ background: "#EEEDE8" }}>
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${pct * 100}%`, background: color }}
              />
            </div>
            <div className="flex items-center gap-2 text-[10px]" style={{ color: "#999" }}>
              <span>{kcal.toLocaleString()} kcal</span>
              <span>·</span>
              <span>{dist.toFixed(1)} km</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export type { MemberOption };
