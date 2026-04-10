import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useAuth } from "@/context/AuthContext";
import { useAppContext } from "@/context/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

interface HabitEditModalProps {
  habit: {
    id: string;
    label: string;
    groupId?: string | null;
    sharedGroupIds?: string[];
    category: string;
  } | null;
  open: boolean;
  onClose: () => void;
}

const HabitEditModal = ({ habit, open, onClose }: HabitEditModalProps) => {
  const { user, groups } = useAuth();
  const { removeHabit, updateHabitLabel, refreshData } = useAppContext();
  const [editedLabel, setEditedLabel] = useState("");
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Groups that have habits page enabled
  const habitGroups = useMemo(
    () => groups.filter((g) => g.shared_pages?.includes("habits")),
    [groups]
  );

  // Initialize state when habit/open changes
  // biome-ignore lint: initialize on open
  useMemo(() => {
    if (open && habit) {
      setEditedLabel(habit.label);
      setSelectedGroupIds((habit.sharedGroupIds || []).filter((id) => habitGroups.some((g) => g.id === id)));
    }
  }, [open, habit?.id]);

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) onClose();
  };

  const toggleGroup = (groupId: string) => {
    setSelectedGroupIds((prev) =>
      prev.includes(groupId)
        ? prev.filter((id) => id !== groupId)
        : [...prev, groupId]
    );
  };

  const handleSave = async () => {
    if (!habit || !user) return;

    const newLabel = editedLabel.trim() || habit.label;

    // Update label if changed
    if (newLabel !== habit.label) {
      await updateHabitLabel(habit.id, newLabel);
    }

    // Update shared_group_ids
    await supabase
      .from("habits")
      .update({ shared_group_ids: selectedGroupIds } as any)
      .eq("id", habit.id);

    toast.success("Routine updated");
    onClose();
    refreshData();
  };

  const handleDelete = async () => {
    if (!habit || !user) return;
    await removeHabit(habit.id);
    toast.success("Routine deleted");
    setShowDeleteConfirm(false);
    onClose();
  };

  if (!habit) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Habit</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 pt-2">
            {/* Habit name */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Habit Name
              </label>
              <input
                value={editedLabel}
                onChange={(e) => setEditedLabel(e.target.value)}
                className="w-full mt-1.5 bg-card border border-border rounded-lg px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-primary transition-colors"
                placeholder="Routine name"
              />
            </div>

            {/* Shared with */}
            {habitGroups.length > 0 && (
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Shared With
                </label>
                <div className="flex gap-1.5 flex-wrap mt-1.5">
                  {/* Personal — always selected */}
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border border-primary bg-primary text-primary-foreground shadow-sm cursor-default opacity-90">
                    <span className="text-sm leading-none">👤</span>
                    <span>Personal</span>
                  </div>

                  {habitGroups.map((group) => (
                    <button
                      key={group.id}
                      type="button"
                      onClick={() => toggleGroup(group.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
                        selectedGroupIds.includes(group.id)
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
            )}

            {/* Save button */}
            <button
              onClick={handleSave}
              className="w-full px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-semibold"
            >
              Save
            </button>

            {/* Delete button */}
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-destructive border border-destructive/20 hover:bg-destructive/5 transition-colors"
            >
              <Trash2 size={14} />
              Delete Habit
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this habit?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this habit and all its tracking data. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default HabitEditModal;
