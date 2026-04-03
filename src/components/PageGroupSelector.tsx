import { useState, useMemo } from "react";
import { Plus } from "lucide-react";
import { useAuth, ShareablePage } from "@/context/AuthContext";
import CreateGroupModal from "@/components/CreateGroupModal";

interface PageGroupSelectorProps {
  page: ShareablePage;
  isHomePage?: boolean;
  personalLabel?: string;
  personalEmoji?: string;
}

const PERSONAL_SENTINEL = "__personal__";

const PageGroupSelector = ({ page, isHomePage, personalLabel = "Personal", personalEmoji = "👤" }: PageGroupSelectorProps) => {
  const { groups, activeGroup, setActiveGroup } = useAuth();
  const [showCreate, setShowCreate] = useState(false);

  // Filter groups: on Home page, only show "home" category groups
  const pageGroups = useMemo(
    () => groups.filter((g) => {
      if (!g.shared_pages?.includes(page)) return false;
      if (isHomePage && g.category !== "home") return false;
      return true;
    }),
    [groups, page, isHomePage]
  );

  // "Personal" is represented by activeGroup === null AND a special flag
  // We use a sentinel value to distinguish "All" (null) from "Personal"
  const isPersonalActive = (activeGroup as any)?._personal === true;
  const isAllActive = activeGroup === null && !isPersonalActive;

  const handleSelectAll = () => setActiveGroup(null);
  const handleSelectPersonal = () => {
    // Use a sentinel group object to represent "Personal"
    setActiveGroup({ _personal: true, id: PERSONAL_SENTINEL, name: "Personal", type: "personal", emoji: "👤", invite_code: "", created_by: "", shared_pages: [], members: [] } as any);
  };

  return (
    <>
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide scroll-smooth-touch py-1 -mx-1 px-1" style={{ WebkitOverflowScrolling: "touch" }}>
        {/* All chip */}
        <button
          onClick={handleSelectAll}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all flex-shrink-0 border ${
            isAllActive
              ? "border-primary bg-primary text-primary-foreground shadow-sm"
              : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground"
          }`}
        >
          <span className="text-sm leading-none">🌐</span>
          <span>All</span>
        </button>

        {/* Personal chip */}
        <button
          onClick={handleSelectPersonal}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all flex-shrink-0 border ${
            isPersonalActive
              ? "border-primary bg-primary text-primary-foreground shadow-sm"
              : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground"
          }`}
        >
          <span className="text-sm leading-none">👤</span>
          <span>Personal</span>
        </button>

        {/* Group chips filtered for this page */}
        {pageGroups.map((group) => {
          const isActive = activeGroup?.id === group.id && !(activeGroup as any)?._personal;
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

        {/* Add Group/Family chip */}
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold transition-all flex-shrink-0 border border-dashed border-primary/30 text-primary hover:bg-primary/5"
        >
          <Plus size={12} />
          <span>{isHomePage ? "Add Family" : "Add Group"}</span>
        </button>
      </div>

      <CreateGroupModal
        open={showCreate}
        onOpenChange={setShowCreate}
        defaultPage={page}
        defaultCategory={isHomePage ? "home" : undefined}
      />
    </>
  );
};

export default PageGroupSelector;
