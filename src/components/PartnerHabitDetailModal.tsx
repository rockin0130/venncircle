import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Flame, Trophy, CheckCircle2, Plus } from "lucide-react";
import { toast } from "sonner";
import { useAppContext, type Habit } from "@/context/AppContext";

const SECTIONS = [
  { key: "morning", label: "Morning", icon: "🌅" },
  { key: "afternoon", label: "Afternoon", icon: "☀️" },
  { key: "evening", label: "Evening", icon: "🌙" },
  { key: "other", label: "Flexible", icon: "📋" },
];

function computeStreakStats(completionDates: string[]) {
  const sorted = [...completionDates].sort();
  const total = sorted.length;
  if (total === 0) return { current: 0, longest: 0, total: 0 };

  // Current streak (from today backwards)
  let current = 0;
  const d = new Date();
  for (let i = 0; i < 365; i++) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (sorted.includes(key)) {
      current++;
    } else if (i > 0) {
      break;
    }
    d.setDate(d.getDate() - 1);
  }

  // Longest streak
  let longest = 0;
  let run = 0;
  const dateSet = new Set(sorted);
  const sortedAsc = [...sorted];
  if (sortedAsc.length > 0) {
    const start = new Date(sortedAsc[0]);
    const end = new Date(sortedAsc[sortedAsc.length - 1]);
    const cursor = new Date(start);
    while (cursor <= end) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
      if (dateSet.has(key)) {
        run++;
        if (run > longest) longest = run;
      } else {
        run = 0;
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  return { current, longest, total };
}

interface PartnerHabitDetailModalProps {
  habit: Habit | null;
  ownerName: string;
  open: boolean;
  onClose: () => void;
}

const normalizeName = (name: string) => name.toLowerCase().replace(/[\s\-_.,:;!?'"]/g, "").trim();
const normalizeKey = (key: string) => key.toLowerCase().replace(/[\s_-]+/g, "").replace(/habits$/, "");

export default function PartnerHabitDetailModal({ habit, ownerName, open, onClose }: PartnerHabitDetailModalProps) {
  const { habits, addHabit } = useAppContext();
  const [pickingSection, setPickingSection] = useState(false);
  const [duplicateConfirm, setDuplicateConfirm] = useState<{ section: string; sectionLabel: string } | null>(null);

  if (!habit) return null;

  const stats = computeStreakStats(habit.completionDates || []);

  const handleAddToSection = (sectionKey: string, sectionLabel: string) => {
    const normalizedNew = normalizeName(habit.label);
    const existingDupe = habits.find((h) => {
      const hNorm = normalizeKey(h.category);
      const inSameSection = sectionKey === "other"
        ? hNorm !== "morning" && hNorm !== "afternoon" && hNorm !== "evening"
        : hNorm === sectionKey;
      return inSameSection && normalizeName(h.label) === normalizedNew;
    });

    if (existingDupe) {
      setDuplicateConfirm({ section: sectionKey, sectionLabel });
      return;
    }

    doAdd(sectionKey, sectionLabel);
  };

  const doAdd = (sectionKey: string, sectionLabel: string) => {
    addHabit(habit.label, sectionKey);
    toast.success(`"${habit.label}" added to ${sectionLabel}`);
    setPickingSection(false);
    setDuplicateConfirm(null);
    onClose();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) { setPickingSection(false); onClose(); } }}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg">{habit.label}</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {ownerName}'s habit
            </DialogDescription>
          </DialogHeader>

          {/* Streak Stats */}
          <div className="grid grid-cols-3 gap-3 mt-2">
            <div className="flex flex-col items-center bg-accent/30 rounded-xl p-3">
              <Flame size={20} className="text-orange-500 mb-1" />
              <span className="text-xl font-bold">{stats.current}</span>
              <span className="text-[10px] text-muted-foreground font-medium">Current streak</span>
            </div>
            <div className="flex flex-col items-center bg-accent/30 rounded-xl p-3">
              <Trophy size={20} className="text-yellow-500 mb-1" />
              <span className="text-xl font-bold">{stats.longest}</span>
              <span className="text-[10px] text-muted-foreground font-medium">Longest streak</span>
            </div>
            <div className="flex flex-col items-center bg-accent/30 rounded-xl p-3">
              <CheckCircle2 size={20} className="text-primary mb-1" />
              <span className="text-xl font-bold">{stats.total}</span>
              <span className="text-[10px] text-muted-foreground font-medium">Total done</span>
            </div>
          </div>

          {/* Add to My Habits */}
          {!pickingSection ? (
            <Button
              onClick={() => setPickingSection(true)}
              className="w-full mt-3"
              variant="outline"
            >
              <Plus size={16} className="mr-1" /> Add to My Habits
            </Button>
          ) : (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-muted-foreground font-medium">Choose a section:</p>
              <div className="grid grid-cols-2 gap-2">
                {SECTIONS.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => handleAddToSection(s.key, s.label)}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-border bg-card hover:bg-accent/40 transition-colors text-sm font-medium"
                  >
                    <span>{s.icon}</span> {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Duplicate confirmation */}
      <AlertDialog open={!!duplicateConfirm} onOpenChange={(o) => { if (!o) setDuplicateConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Already have this habit</AlertDialogTitle>
            <AlertDialogDescription>
              You already have "{habit.label}" in {duplicateConfirm?.sectionLabel}. Add anyway?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => duplicateConfirm && doAdd(duplicateConfirm.section, duplicateConfirm.sectionLabel)}>
              Add Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
