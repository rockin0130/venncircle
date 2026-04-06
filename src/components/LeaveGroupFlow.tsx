import { useState } from "react";
import { LogOut, Loader2 } from "lucide-react";
import { Group } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface LeaveGroupFlowProps {
  group: Group;
  userId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLeft: () => void;
}

const LeaveGroupFlow = ({ group, userId, open, onOpenChange, onLeft }: LeaveGroupFlowProps) => {
  const [leaving, setLeaving] = useState(false);
  const [step, setStep] = useState<"confirm" | "pick-admin" | "last-member">("confirm");
  const [selectedNewAdmin, setSelectedNewAdmin] = useState<string | null>(null);

  const activeMembers = group.members.filter((m) => m.status === "active");
  const admins = activeMembers.filter((m) => m.role === "admin");
  const isAdmin = admins.some((a) => a.user_id === userId);
  const isOnlyAdmin = isAdmin && admins.length === 1;
  const isLastMember = activeMembers.length === 1;
  const otherNonAdmins = activeMembers.filter((m) => m.user_id !== userId && m.role !== "admin");
  const otherMembers = activeMembers.filter((m) => m.user_id !== userId);

  // Determine initial step when dialog opens
  const getInitialStep = (): "confirm" | "pick-admin" | "last-member" => {
    if (isLastMember) return "last-member";
    if (isOnlyAdmin && otherMembers.length > 0) return "pick-admin";
    return "confirm";
  };

  // Reset step when dialog opens
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      setStep(getInitialStep());
      setSelectedNewAdmin(null);
      setLeaving(false);
    }
    onOpenChange(newOpen);
  };

  const doLeave = async () => {
    setLeaving(true);
    const { data, error } = await supabase.rpc("leave_group", { _group_id: group.id });
    if (error) {
      toast.error("Failed to leave group");
      setLeaving(false);
      return;
    }
    toast.success(`Left "${group.name}"`);
    onLeft();
  };

  const doDeleteAndLeave = async () => {
    setLeaving(true);
    const { data, error } = await supabase.rpc("delete_group", { _group_id: group.id });
    if (error) {
      toast.error("Failed to delete group");
      setLeaving(false);
      return;
    }
    toast.success(`"${group.name}" deleted`);
    onLeft();
  };

  const doTransferAndLeave = async () => {
    if (!selectedNewAdmin) return;
    setLeaving(true);
    const { error: transferErr } = await supabase.rpc("transfer_group_admin", {
      _group_id: group.id,
      _new_admin_user_id: selectedNewAdmin,
    });
    if (transferErr) {
      toast.error("Failed to transfer admin role");
      setLeaving(false);
      return;
    }
    await doLeave();
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        {step === "confirm" && (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Leave {group.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                You'll still have personal copies of your data.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={leaving}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={doLeave}
                disabled={leaving}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {leaving ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
                {leaving ? "Leaving..." : "Leave"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}

        {step === "pick-admin" && (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Choose a new admin before leaving</AlertDialogTitle>
              <AlertDialogDescription>
                You're the only admin. Select at least one member to promote before you can leave.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-2 py-3 max-h-[40vh] overflow-y-auto">
              {otherMembers.map((m) => (
                <button
                  key={m.user_id}
                  onClick={() => setSelectedNewAdmin(m.user_id)}
                  className={`w-full flex items-center gap-2.5 p-2.5 rounded-xl border transition-all text-left ${
                    selectedNewAdmin === m.user_id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/30"
                  }`}
                >
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                    {(m.display_name || "?")[0].toUpperCase()}
                  </div>
                  <span className="text-sm font-medium text-foreground flex-1">{m.display_name || "Member"}</span>
                  {selectedNewAdmin === m.user_id && (
                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">Selected</span>
                  )}
                </button>
              ))}
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={leaving}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={doTransferAndLeave}
                disabled={leaving || !selectedNewAdmin}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {leaving ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
                {leaving ? "Leaving..." : "Promote & Leave"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}

        {step === "last-member" && (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Leave {group.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                You're the last member. Leaving will permanently delete this group and all its shared data.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={leaving}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={doDeleteAndLeave}
                disabled={leaving}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {leaving ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
                {leaving ? "Deleting..." : "Delete & Leave"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default LeaveGroupFlow;
