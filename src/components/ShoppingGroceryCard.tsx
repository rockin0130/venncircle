import { useState } from "react";
import { ChevronDown, ChevronRight, ShoppingCart, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { GroupMember } from "@/context/AuthContext";
import { NudgePill } from "./ShoppingNudgeSheet";
import {
  OrganizePill,
  SmartToggle,
  AiBadge,
  OrganizedView,
  useOrganize,
  ShoppingItemBasic,
} from "./ShoppingOrganize";
import ShoppingMealPlanSection from "./ShoppingMealPlanSection";

interface ShoppingList {
  id: string;
  label: string;
  date_range_start: string | null;
  date_range_end: string | null;
  is_meal_plan: boolean;
  created_at: string;
  group_id?: string | null;
}

interface ShoppingListItem {
  id: string;
  list_id: string;
  name: string;
  checked: boolean;
  created_at: string;
  meal_name?: string | null;
  assignee_user_ids?: string[];
}

interface Props {
  lists: ShoppingList[];
  allItems: ShoppingListItem[];
  onToggle: (id: string, checked: boolean) => void;
  onDelete: (id: string) => void;
  onDeleteList: (id: string) => void;
  isGroupView: boolean;
  groupMembers: GroupMember[];
  onNudge?: () => void;
  isMineView?: boolean;
  listGroupLabelMap?: Record<string, string>;
}

const ShoppingGroceryCard = ({
  lists,
  allItems,
  onToggle,
  onDelete,
  onDeleteList,
  isGroupView,
  groupMembers,
  onNudge,
  isMineView,
  listGroupLabelMap,
}: Props) => {
  const [open, setOpen] = useState(true);
  const { loading: orgLoading, result: orgResult, viewMode, setViewMode, organize } = useOrganize();

  const totalItems = allItems.length;
  const checkedItems = allItems.filter((i) => i.checked).length;

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      {/* Grocery card header */}
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center justify-between w-full px-4 py-3 bg-secondary/30"
      >
        <div className="flex items-center gap-2">
          {open ? (
            <ChevronDown size={14} className="text-muted-foreground" />
          ) : (
            <ChevronRight size={14} className="text-muted-foreground" />
          )}
          <ShoppingCart size={14} className="text-foreground" />
          <p className="text-sm font-semibold text-foreground">Grocery</p>
          <OrganizePill loading={orgLoading} onClick={() => organize(allItems)} />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
            {checkedItems}/{totalItems}
          </span>
          {isGroupView && !isMineView && onNudge && <NudgePill onClick={onNudge} />}
        </div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            {/* Smart toggle — only after organizing */}
            {orgResult && (
              <>
                <SmartToggle labels={orgResult.toggle_labels} viewMode={viewMode} onSwitch={setViewMode} />
                {viewMode === "organized" && <AiBadge />}
              </>
            )}

            {/* Organized view — flat categories across all weeks */}
            {orgResult && viewMode === "organized" ? (
              <OrganizedView result={orgResult} allItems={allItems} onToggle={onToggle} onDelete={onDelete} />
            ) : (
              /* Original view — nested week cards */
              <div className="p-2 space-y-2">
                {lists.map((list) => (
                  <ShoppingMealPlanSection
                    key={list.id}
                    list={list}
                    items={allItems.filter((i) => i.list_id === list.id)}
                    onToggle={onToggle}
                    onDelete={onDelete}
                    onDeleteList={onDeleteList}
                    isGroupView={isGroupView}
                    groupMembers={groupMembers}
                    onNudge={onNudge}
                    groupLabel={isMineView ? listGroupLabelMap?.[list.id] : undefined}
                  />
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ShoppingGroceryCard;
