import { useState } from "react";
import { ArrowRight, Check, Copy, Loader2, Package } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth, Group } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";

interface MigrateItemsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetGroup: Group | null;
  /** If provided, skip group selection and use this as source */
  preselectedSourceGroup?: Group | null;
  direction?: "into" | "from";
}

const ITEM_CATEGORIES = [
  { key: "habits", label: "Habits", emoji: "🎯", description: "All your tracked habits" },
  { key: "tasks", label: "Tasks", emoji: "✅", description: "Incomplete tasks only" },
  { key: "events", label: "Events", emoji: "📅", description: "Future events only" },
  { key: "workouts", label: "Workouts", emoji: "💪", description: "Incomplete workouts only" },
] as const;

type CategoryKey = (typeof ITEM_CATEGORIES)[number]["key"];

const MigrateItemsModal = ({
  open,
  onOpenChange,
  targetGroup,
  preselectedSourceGroup,
  direction = "into",
}: MigrateItemsModalProps) => {
  const { groups, refreshGroups } = useAuth();
  const [step, setStep] = useState<"source" | "categories" | "confirm" | "done">(
    preselectedSourceGroup ? "categories" : "source"
  );
  const [sourceGroup, setSourceGroup] = useState<Group | null>(preselectedSourceGroup || null);
  const [selected, setSelected] = useState<Set<CategoryKey>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [result, setResult] = useState<Record<string, number> | null>(null);

  const availableGroups = groups.filter((g) => g.id !== targetGroup?.id);

  const reset = () => {
    setStep(preselectedSourceGroup ? "categories" : "source");
    setSourceGroup(preselectedSourceGroup || null);
    setSelected(new Set());
    setSelectAll(false);
    setMigrating(false);
    setResult(null);
  };

  const handleClose = (open: boolean) => {
    if (!open) reset();
    onOpenChange(open);
  };

  const toggleCategory = (key: CategoryKey) => {
    const next = new Set(selected);
    if (next.has(key)) {
      next.delete(key);
      setSelectAll(false);
    } else {
      next.add(key);
      if (next.size === ITEM_CATEGORIES.length) setSelectAll(true);
    }
    setSelected(next);
  };

  const toggleAll = () => {
    if (selectAll) {
      setSelected(new Set());
      setSelectAll(false);
    } else {
      setSelected(new Set(ITEM_CATEGORIES.map((c) => c.key)));
      setSelectAll(true);
    }
  };

  const handleMigrate = async () => {
    if (!sourceGroup || !targetGroup || selected.size === 0) return;
    setMigrating(true);

    const actualSource = direction === "into" ? sourceGroup : targetGroup;
    const actualTarget = direction === "into" ? targetGroup : sourceGroup;

    const { data, error } = await supabase.rpc("migrate_group_items", {
      _source_group_id: actualSource.id,
      _target_group_id: actualTarget.id,
      _copy_habits: selected.has("habits"),
      _copy_tasks: selected.has("tasks"),
      _copy_events: selected.has("events"),
      _copy_workouts: selected.has("workouts"),
    });

    if (error) {
      toast.error(error.message);
      setMigrating(false);
      return;
    }

    const res = data as any;
    if (res?.error) {
      toast.error(res.error);
      setMigrating(false);
      return;
    }

    setResult({
      habits: res.habits_copied || 0,
      tasks: res.tasks_copied || 0,
      events: res.events_copied || 0,
      workouts: res.workouts_copied || 0,
    });
    setStep("done");
    setMigrating(false);
    await refreshGroups();
  };

  const totalCopied = result ? Object.values(result).reduce((a, b) => a + b, 0) : 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package size={18} />
            {direction === "into" ? "Import Items" : "Send Items"}
          </DialogTitle>
        </DialogHeader>

        {/* Step 1: Select source group */}
        {step === "source" && (
          <div className="space-y-3 pt-2">
            <p className="text-sm text-muted-foreground">
              {direction === "into"
                ? `Select a calendar to copy items from into "${targetGroup?.name}".`
                : `Select a calendar to send items from "${targetGroup?.name}" to.`}
            </p>
            {availableGroups.length === 0 ? (
              <div className="text-center py-6 text-sm text-muted-foreground">
                No other calendars available. Create another group first.
              </div>
            ) : (
              <div className="space-y-2">
                {availableGroups.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => {
                      setSourceGroup(g);
                      setStep("categories");
                    }}
                    className="w-full flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-secondary/50 transition-colors text-left"
                  >
                    <span className="text-xl">{g.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{g.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {g.members.length} member{g.members.length !== 1 ? "s" : ""} · {g.type}
                      </p>
                    </div>
                    <ArrowRight size={16} className="text-muted-foreground" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 2: Select categories */}
        {step === "categories" && sourceGroup && (
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-2 p-3 rounded-xl bg-secondary/50 text-sm">
              <span className="text-lg">{sourceGroup.emoji}</span>
              <span className="font-medium">{sourceGroup.name}</span>
              <ArrowRight size={14} className="text-muted-foreground mx-1" />
              <span className="text-lg">{targetGroup?.emoji}</span>
              <span className="font-medium">{targetGroup?.name}</span>
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  What to copy
                </p>
                <button
                  onClick={toggleAll}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  {selectAll ? "Deselect all" : "Select all"}
                </button>
              </div>

              <div className="space-y-2">
                {ITEM_CATEGORIES.map((cat) => (
                  <button
                    key={cat.key}
                    onClick={() => toggleCategory(cat.key)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                      selected.has(cat.key)
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-secondary/30"
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded flex items-center justify-center border transition-colors ${
                        selected.has(cat.key)
                          ? "bg-primary border-primary text-primary-foreground"
                          : "border-muted-foreground/30"
                      }`}
                    >
                      {selected.has(cat.key) && <Check size={12} />}
                    </div>
                    <span className="text-lg">{cat.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{cat.label}</p>
                      <p className="text-xs text-muted-foreground">{cat.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <p className="text-xs text-muted-foreground italic">
              ⚠️ Integrations (Google Calendar, etc.) are never copied. Each calendar manages its own connections.
            </p>

            <div className="flex gap-2">
              {!preselectedSourceGroup && (
                <button
                  onClick={() => {
                    setStep("source");
                    setSourceGroup(null);
                    setSelected(new Set());
                  }}
                  className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-secondary transition-colors"
                >
                  Back
                </button>
              )}
              <button
                onClick={() => setStep("confirm")}
                disabled={selected.size === 0}
                className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Copy size={14} />
                Review ({selected.size})
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Confirm */}
        {step === "confirm" && sourceGroup && (
          <div className="space-y-4 pt-2">
            <div className="p-4 rounded-xl bg-secondary/50 space-y-2">
              <p className="text-sm font-semibold">Confirm Migration</p>
              <div className="flex items-center gap-2 text-sm">
                <span>{direction === "into" ? sourceGroup.emoji : targetGroup?.emoji}</span>
                <span className="font-medium">
                  {direction === "into" ? sourceGroup.name : targetGroup?.name}
                </span>
                <ArrowRight size={14} className="text-muted-foreground" />
                <span>{direction === "into" ? targetGroup?.emoji : sourceGroup.emoji}</span>
                <span className="font-medium">
                  {direction === "into" ? targetGroup?.name : sourceGroup.name}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {ITEM_CATEGORIES.filter((c) => selected.has(c.key)).map((c) => (
                  <span
                    key={c.key}
                    className="text-xs font-medium bg-primary/10 text-primary px-2 py-1 rounded-lg"
                  >
                    {c.emoji} {c.label}
                  </span>
                ))}
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Items will be copied (not moved). Original items remain untouched. No integrations will be transferred.
            </p>

            <div className="flex gap-2">
              <button
                onClick={() => setStep("categories")}
                className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-secondary transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleMigrate}
                disabled={migrating}
                className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {migrating ? <Loader2 size={14} className="animate-spin" /> : <Copy size={14} />}
                {migrating ? "Copying..." : "Copy Items"}
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Done */}
        {step === "done" && result && (
          <div className="space-y-4 pt-2 text-center">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <Check size={28} className="text-primary" />
            </div>
            <div>
              <p className="text-lg font-bold">{totalCopied} items copied!</p>
              <p className="text-sm text-muted-foreground mt-1">
                Migration complete. Your new calendar is ready.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {ITEM_CATEGORIES.filter((c) => selected.has(c.key)).map((c) => (
                <span
                  key={c.key}
                  className="text-xs font-medium bg-secondary px-3 py-1.5 rounded-lg"
                >
                  {c.emoji} {result[c.key]} {c.label.toLowerCase()}
                </span>
              ))}
            </div>
            <button
              onClick={() => handleClose(false)}
              className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold"
            >
              Done
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default MigrateItemsModal;
