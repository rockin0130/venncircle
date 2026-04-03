import { useAuth } from "@/context/AuthContext";

const HorizontalGroupSelector = () => {
  const { groups, activeGroup, setActiveGroup } = useAuth();

  if (groups.length === 0) return null;

  return (
    <div className="flex gap-1.5 overflow-x-auto scrollbar-hide scroll-smooth-touch py-1 -mx-1 px-1" style={{ WebkitOverflowScrolling: "touch" }}>
      {/* All chip */}
      <button
        onClick={() => setActiveGroup(null)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all flex-shrink-0 border ${
          activeGroup === null
            ? "border-primary bg-primary text-primary-foreground shadow-sm"
            : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground"
        }`}
      >
        <span className="text-sm leading-none">🌐</span>
        <span>All</span>
      </button>

      {/* Group chips */}
      {groups.map((group) => {
        const isActive = activeGroup?.id === group.id;
        return (
          <button
            key={group.id}
            onClick={() => setActiveGroup(group)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all flex-shrink-0 border ${
              isActive
                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground"
            }`}
          >
            <span className="text-sm leading-none">{group.emoji}</span>
            <span className="truncate max-w-[120px]">{group.name}</span>
          </button>
        );
      })}
    </div>
  );
};

export default HorizontalGroupSelector;
