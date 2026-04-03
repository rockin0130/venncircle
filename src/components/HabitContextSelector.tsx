import { useMemo } from "react";
import { useAuth } from "@/context/AuthContext";

interface HabitContextSelectorProps {
  selectedContexts: string[];
  onChangeContexts: (contexts: string[]) => void;
}

const HabitContextSelector = ({ selectedContexts, onChangeContexts }: HabitContextSelectorProps) => {
  const { groups } = useAuth();

  const habitGroups = useMemo(
    () => groups.filter((g) => g.shared_pages?.includes("habits")),
    [groups]
  );

  const toggle = (id: string) => {
    if (selectedContexts.includes(id)) {
      onChangeContexts(selectedContexts.filter((c) => c !== id));
    } else {
      onChangeContexts([...selectedContexts, id]);
    }
  };

  if (habitGroups.length === 0) return null;

  return (
    <div className="mb-3">
      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Add to</label>
      <div className="flex gap-1.5 flex-wrap mt-1.5">
        {/* Personal pill — always selected and locked */}
        <div
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border border-primary bg-primary text-primary-foreground shadow-sm cursor-default opacity-90"
          title="Personal is always included"
        >
          <span className="text-sm leading-none">👤</span>
          <span>Personal</span>
        </div>

        {/* Group pills */}
        {habitGroups.map((group) => (
          <button
            key={group.id}
            type="button"
            onClick={() => toggle(group.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
              selectedContexts.includes(group.id)
                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                : "border-border bg-card text-muted-foreground hover:border-primary/30"
            }`}
          >
            <span className="text-sm leading-none">{group.emoji}</span>
            <span className="truncate max-w-[120px]">{group.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default HabitContextSelector;
