import { useState, useMemo } from "react";
import { ArrowLeft, Settings, ChevronRight, Plus, Trash2, LogOut, Pencil, X, Check, Loader2 } from "lucide-react";
import { useAuth, Group, ShareablePage, SHAREABLE_PAGES, PAGE_LABELS, PAGE_ICONS } from "@/context/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface GroupHubPageProps {
  group: Group;
  onBack: () => void;
  onNavigateToFeature: (tab: string, groupId: string) => void;
}

const INTEREST_ROW_COLORS: Record<string, string> = {
  workout: "bg-[hsl(210,70%,95%)]",
  nutrition: "bg-[hsl(90,40%,92%)]",
  sobriety: "bg-[hsl(260,50%,95%)]",
  habits: "bg-[hsl(35,70%,93%)]",
  calendar: "bg-[hsl(220,15%,93%)]",
  
  shopping: "bg-[hsl(170,50%,93%)]",
};

const MEMBER_COLORS = [
  "bg-[hsl(210,55%,75%)]",
  "bg-[hsl(340,50%,78%)]",
  "bg-[hsl(160,40%,72%)]",
  "bg-[hsl(35,55%,75%)]",
  "bg-[hsl(260,40%,78%)]",
  "bg-[hsl(190,45%,72%)]",
];

const getInitials = (name: string) =>
  name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);

const GroupHubPage = ({ group, onBack, onNavigateToFeature }: GroupHubPageProps) => {
  const { user, leaveGroup, updateGroupSharedPages, inviteToGroup, refreshGroups, groups } = useAuth();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addInterestOpen, setAddInterestOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(group.name);
  const [savingName, setSavingName] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isOwner = user?.id === group.created_by;
  const activeMembers = group.members.filter((m) => m.status === "active");
  const enabledPages = group.shared_pages || [];

  // Available interests to add (not already enabled)
  const availableInterests = useMemo(
    () => SHAREABLE_PAGES.filter((p) => !enabledPages.includes(p)),
    [enabledPages]
  );

  const handleNavigate = (page: ShareablePage) => {
    const tab = page;
    onNavigateToFeature(tab, group.id);
  };

  const handleAddInterest = async (page: ShareablePage) => {
    const newPages = [...enabledPages, page];
    const result = await updateGroupSharedPages(group.id, newPages);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(`${PAGE_LABELS[page]} added`);
      await refreshGroups();
    }
    setAddInterestOpen(false);
  };

  const handleRemoveInterest = async (page: ShareablePage) => {
    if (enabledPages.length <= 1) {
      toast.error("Group must have at least one interest");
      return;
    }
    const newPages = enabledPages.filter((p) => p !== page);
    const result = await updateGroupSharedPages(group.id, newPages);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(`${PAGE_LABELS[page]} removed`);
      await refreshGroups();
    }
  };

  const handleSaveName = async () => {
    if (!nameInput.trim() || nameInput.trim() === group.name) {
      setEditingName(false);
      return;
    }
    setSavingName(true);
    const { error } = await supabase
      .from("groups")
      .update({ name: nameInput.trim() })
      .eq("id", group.id);
    if (error) {
      toast.error("Failed to rename group");
    } else {
      toast.success("Group renamed");
      await refreshGroups();
    }
    setSavingName(false);
    setEditingName(false);
  };

  const handleLeave = async () => {
    setLeaving(true);
    const result = await leaveGroup(group.id);
    if (result.error) {
      toast.error(result.error);
      setLeaving(false);
    } else {
      toast.success("Left group");
      await refreshGroups();
      onBack();
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const { data, error } = await supabase.rpc("delete_group", { _group_id: group.id });
      if (error) {
        console.error("Delete group DB error:", error);
        toast.error(`Failed to delete group: ${error.message}`);
        setDeleting(false);
        return;
      }
      const result = data as any;
      if (result?.error) {
        toast.error(result.error);
        setDeleting(false);
        return;
      }
      toast.success("Group deleted");
      setSettingsOpen(false);
      await refreshGroups();
      onBack();
    } catch (err: any) {
      console.error("Delete group error:", err);
      toast.error("Failed to delete group");
      setDeleting(false);
    }
  };

  // Re-resolve the group from context to get latest data
  const currentGroup = groups.find((g) => g.id === group.id) || group;
  const currentEnabledPages = (currentGroup.shared_pages || []).filter((p) => SHAREABLE_PAGES.includes(p));
  const currentActiveMembers = currentGroup.members.filter((m) => m.status === "active");

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="px-5 pt-12 pb-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={onBack}
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-secondary/60 transition-colors shrink-0"
            >
              <ArrowLeft size={20} className="text-foreground" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-lg">{currentGroup.emoji}</span>
                <h1 className="text-lg font-bold text-foreground truncate">{currentGroup.name}</h1>
              </div>
              <p className="text-xs text-muted-foreground ml-7">
                {currentActiveMembers.length} member{currentActiveMembers.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <button
            onClick={() => setSettingsOpen(true)}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-secondary/60 transition-colors shrink-0"
          >
            <Settings size={18} className="text-muted-foreground" />
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-5 pb-6">
        {/* Members row */}
        <div className="flex items-center gap-1 mb-5">
          {currentActiveMembers.map((m, i) => (
            <div
              key={m.user_id}
              className={`w-8 h-8 rounded-full ${MEMBER_COLORS[i % MEMBER_COLORS.length]} flex items-center justify-center text-[11px] font-bold text-white -ml-1 first:ml-0 ring-2 ring-background`}
              title={m.display_name || "Member"}
            >
              {(m.display_name || "?")[0].toUpperCase()}
            </div>
          ))}
        </div>

        {/* Interest rows */}
        <section className="space-y-2">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Interests</h2>
          {currentEnabledPages.map((page) => (
            <button
              key={page}
              onClick={() => handleNavigate(page)}
              className="w-full flex items-center gap-3 p-3 rounded-xl bg-card border border-border hover:border-primary/20 transition-all active:scale-[0.99]"
            >
              <div className={`w-7 h-7 rounded-lg ${INTEREST_ROW_COLORS[page] || "bg-muted"} flex items-center justify-center text-sm`}>
                {PAGE_ICONS[page] || "📋"}
              </div>
              <span className="flex-1 text-sm font-medium text-foreground text-left">
                {PAGE_LABELS[page] || page}
              </span>
              <ChevronRight size={16} className="text-muted-foreground" />
            </button>
          ))}

          {/* Add interest row */}
          <button
            onClick={() => setAddInterestOpen(true)}
            className="w-full flex items-center gap-3 p-3 rounded-xl border border-dashed border-border hover:border-primary/30 transition-all"
          >
            <div className="w-7 h-7 rounded-lg border border-dashed border-muted-foreground/30 flex items-center justify-center">
              <Plus size={14} className="text-muted-foreground" />
            </div>
            <span className="text-sm font-medium text-muted-foreground">Add interest</span>
          </button>
        </section>
      </div>

      {/* Add Interest Dialog */}
      <Dialog open={addInterestOpen} onOpenChange={setAddInterestOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Interest</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {availableInterests.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">All interests are already enabled</p>
            ) : (
              availableInterests.map((page) => (
                <button
                  key={page}
                  onClick={() => handleAddInterest(page)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-card border border-border hover:border-primary/20 transition-all"
                >
                  <div className={`w-7 h-7 rounded-lg ${INTEREST_ROW_COLORS[page] || "bg-muted"} flex items-center justify-center text-sm`}>
                    {PAGE_ICONS[page] || "📋"}
                  </div>
                  <span className="text-sm font-medium text-foreground">{PAGE_LABELS[page]}</span>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Settings Dialog */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-sm max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Group Settings</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            {/* Group Name */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Name</label>
              {editingName ? (
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="text"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground"
                    autoFocus
                  />
                  <button
                    onClick={handleSaveName}
                    disabled={savingName}
                    className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center"
                  >
                    {savingName ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  </button>
                  <button
                    onClick={() => { setEditingName(false); setNameInput(currentGroup.name); }}
                    className="w-8 h-8 rounded-full bg-muted flex items-center justify-center"
                  >
                    <X size={14} className="text-muted-foreground" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between mt-1">
                  <p className="text-sm font-medium text-foreground">{currentGroup.name}</p>
                  {isOwner && (
                    <button onClick={() => setEditingName(true)} className="text-muted-foreground hover:text-foreground">
                      <Pencil size={14} />
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Members */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Members ({currentActiveMembers.length})
              </label>
              <div className="space-y-2 mt-2">
                {currentActiveMembers.map((m) => (
                  <div key={m.user_id} className="flex items-center gap-2 p-2 rounded-lg bg-secondary/30">
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                      {(m.display_name || "?")[0].toUpperCase()}
                    </div>
                    <span className="text-sm text-foreground flex-1">{m.display_name || "Member"}</span>
                    {m.user_id === currentGroup.created_by && (
                      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">Admin</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Invite Code */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Invite Code</label>
              <div className="flex items-center gap-2 mt-1">
                <code className="px-3 py-2 rounded-lg bg-secondary text-sm font-mono text-foreground flex-1">
                  {currentGroup.invite_code}
                </code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(currentGroup.invite_code);
                    toast.success("Copied!");
                  }}
                  className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold"
                >
                  Copy
                </button>
              </div>
            </div>

            {/* Enabled Interests */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Interests</label>
              <div className="space-y-1.5 mt-2">
                {currentEnabledPages.map((page) => (
                  <div key={page} className="flex items-center justify-between p-2 rounded-lg bg-secondary/30">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{PAGE_ICONS[page]}</span>
                      <span className="text-sm text-foreground">{PAGE_LABELS[page]}</span>
                    </div>
                    {currentEnabledPages.length > 1 && (
                      <button
                        onClick={() => handleRemoveInterest(page)}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Leave / Delete */}
            <div className="border-t border-border pt-4 space-y-2">
              {!isOwner && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button className="w-full flex items-center gap-2 p-3 rounded-xl text-destructive hover:bg-destructive/5 transition-colors text-sm font-medium">
                      <LogOut size={16} />
                      Leave Group
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Leave group?</AlertDialogTitle>
                      <AlertDialogDescription>
                        You'll lose access to shared data in this group. You can rejoin later with an invite.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleLeave} disabled={leaving}>
                        {leaving ? "Leaving..." : "Leave"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}

              {isOwner && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button className="w-full flex items-center gap-2 p-3 rounded-xl text-destructive hover:bg-destructive/5 transition-colors text-sm font-medium">
                      <Trash2 size={16} />
                      Delete Group
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete group?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete the group and remove all members. This cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive hover:bg-destructive/90">
                        {deleting ? "Deleting..." : "Delete"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default GroupHubPage;
