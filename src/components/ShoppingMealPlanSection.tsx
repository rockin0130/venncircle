import { useState } from "react";
import { ChevronDown, ChevronRight, Check, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { GroupMember } from "@/context/AuthContext";
import { NudgePill } from "./ShoppingNudgeSheet";

interface ShoppingListItem {
  id: string;
  list_id: string;
  name: string;
  checked: boolean;
  created_at: string;
  meal_name?: string | null;
  assignee_user_ids?: string[];
}

interface ShoppingList {
  id: string;
  label: string;
  date_range_start: string | null;
  date_range_end: string | null;
  is_meal_plan: boolean;
  created_at: string;
  group_id?: string | null;
}

interface Props {
  list: ShoppingList;
  items: ShoppingListItem[];
  onToggle: (id: string, checked: boolean) => void;
  onDelete: (id: string) => void;
  onDeleteList: (id: string) => void;
  isGroupView: boolean;
  groupMembers: GroupMember[];
  onNudge?: () => void;
}

const ShoppingMealPlanSection = ({ list, items, onToggle, onDelete, onDeleteList, isGroupView, onNudge }: Props) => {
  const [weekOpen, setWeekOpen] = useState(true);
  const [openMeals, setOpenMeals] = useState<Record<string, boolean>>({});

  const totalItems = items.length;
  const checkedItems = items.filter(i => i.checked).length;

  const mealGroups: Record<string, ShoppingListItem[]> = {};
  const ungrouped: ShoppingListItem[] = [];

  items.forEach(item => {
    if (item.meal_name) {
      if (!mealGroups[item.meal_name]) mealGroups[item.meal_name] = [];
      mealGroups[item.meal_name].push(item);
    } else {
      ungrouped.push(item);
    }
  });

  const mealNames = Object.keys(mealGroups);

  const toggleMeal = (name: string) => {
    setOpenMeals(prev => ({ ...prev, [name]: prev[name] === undefined ? false : !prev[name] }));
  };

  const isMealOpen = (name: string) => openMeals[name] === undefined ? true : openMeals[name];

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <button
        onClick={() => setWeekOpen(prev => !prev)}
        className="flex items-center justify-between w-full px-4 py-3 bg-secondary/30"
      >
        <div className="flex items-center gap-2">
          {weekOpen ? <ChevronDown size={14} className="text-muted-foreground" /> : <ChevronRight size={14} className="text-muted-foreground" />}
          <p className="text-sm font-semibold text-foreground">🍽️ {list.label}</p>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
            {checkedItems}/{totalItems}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); onDeleteList(list.id); }}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </button>

      <AnimatePresence initial={false}>
        {weekOpen && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="divide-y divide-border/50">
              {mealNames.map(mealName => {
                const mealItems = mealGroups[mealName];
                const mealChecked = mealItems.filter(i => i.checked).length;
                const open = isMealOpen(mealName);

                return (
                  <div key={mealName}>
                    <button
                      onClick={() => toggleMeal(mealName)}
                      className="flex items-center justify-between w-full px-4 py-2 bg-secondary/10 hover:bg-secondary/20 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        {open ? <ChevronDown size={12} className="text-muted-foreground" /> : <ChevronRight size={12} className="text-muted-foreground" />}
                        <span className="text-xs font-semibold text-foreground">{mealName}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded-full">
                          {mealChecked}/{mealItems.length}
                        </span>
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
                          {mealItems.map(item => (
                            <ItemRow key={item.id} item={item} onToggle={onToggle} onDelete={onDelete} />
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}

              {ungrouped.map(item => (
                <ItemRow key={item.id} item={item} onToggle={onToggle} onDelete={onDelete} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const ItemRow = ({
  item,
  onToggle,
  onDelete,
}: {
  item: ShoppingListItem;
  onToggle: (id: string, checked: boolean) => void;
  onDelete: (id: string) => void;
}) => (
  <div className="flex items-center gap-3 px-4 py-2.5 group">
    <button
      onClick={() => onToggle(item.id, item.checked)}
      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
        item.checked ? "bg-primary border-primary" : "border-muted-foreground/30 hover:border-primary/50"
      }`}
    >
      {item.checked && <Check size={12} className="text-primary-foreground" />}
    </button>
    <span className={`flex-1 text-sm transition-all ${item.checked ? "line-through text-muted-foreground/50" : "text-foreground"}`}>
      {item.name}
    </span>
    <button
      onClick={() => onDelete(item.id)}
      className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-destructive transition-all"
    >
      <Trash2 size={12} />
    </button>
  </div>
);

export default ShoppingMealPlanSection;
