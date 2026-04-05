import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Loader2 } from "lucide-react";
import { Group } from "@/context/AuthContext";

interface Props {
  open: boolean;
  groupName: string;
  ingredientCount: number;
  shoppingGroups: Group[];
  onSelect: (groupId: string | null) => void;
  onDismiss: () => void;
  saving?: boolean;
}

const ShoppingDestinationSheet = ({ open, groupName, ingredientCount, shoppingGroups, onSelect, onDismiss, saving }: Props) => {
  const [selected, setSelected] = useState<string | null | undefined>(undefined);

  const handleConfirm = () => {
    if (selected === undefined) return;
    onSelect(selected);
  };

  const selectedLabel = selected === null
    ? "Only Me"
    : shoppingGroups.find(g => g.id === selected)?.name || "";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[95] bg-black/40 flex items-end justify-center"
          onClick={onDismiss}
        >
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="w-full max-w-md bg-card rounded-t-2xl max-h-[60dvh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex-shrink-0 px-5 pt-5 pb-3">
              <div className="w-10 h-1 bg-muted rounded-full mx-auto mb-4" />
              <h3 className="text-base font-bold text-foreground">🛒 Send to shopping list</h3>
              <p className="text-xs text-muted-foreground mt-1">
                "{groupName}" doesn't have Shopping enabled. Choose where to send these:
              </p>
            </div>

            <div className="flex-1 overflow-y-auto px-5 pb-3" style={{ WebkitOverflowScrolling: "touch" }}>
              {shoppingGroups.map(group => (
                <button
                  key={group.id}
                  onClick={() => setSelected(group.id)}
                  className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl mb-1 transition-all ${
                    selected === group.id
                      ? "bg-primary/10 border border-primary/30"
                      : "hover:bg-secondary/50 border border-transparent"
                  }`}
                >
                  <span className="text-base">{group.emoji}</span>
                  <span className="flex-1 text-left text-sm font-medium text-foreground">{group.name}</span>
                  {selected === group.id && <Check size={16} className="text-primary" />}
                </button>
              ))}

              <button
                onClick={() => setSelected(null)}
                className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl mb-1 transition-all ${
                  selected === null
                    ? "bg-primary/10 border border-primary/30"
                    : "hover:bg-secondary/50 border border-transparent"
                }`}
              >
                <span className="text-base">👤</span>
                <span className="flex-1 text-left text-sm font-medium text-foreground">Only Me</span>
                {selected === null && <Check size={16} className="text-primary" />}
              </button>
            </div>

            <div className="flex-shrink-0 px-5 pb-6 pt-3 flex gap-2">
              <button onClick={onDismiss} className="flex-1 py-2.5 rounded-xl bg-secondary text-foreground text-sm font-semibold">
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={selected === undefined || saving}
                className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                Add {ingredientCount} to {selected !== undefined ? (selected === null ? "Only Me" : selectedLabel) : "…"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ShoppingDestinationSheet;
