import { useState } from "react";
import { Plus, Check, Loader2, UserPlus, X, Users } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth, ShareablePage, SHAREABLE_PAGES, PAGE_LABELS, PAGE_ICONS } from "@/context/AuthContext";
import { useFriendships, FriendProfile } from "@/hooks/useFriendships";
import AddFriendModal from "@/components/AddFriendModal";
import { toast } from "sonner";

interface CreateGroupModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultPage?: ShareablePage;
  onGroupCreated?: (groupId: string) => void;
  defaultCategory?: "home" | "interest";
}

type Step = "friends" | "pages" | "name";

const CreateGroupModal = ({ open, onOpenChange, defaultPage, onGroupCreated }: CreateGroupModalProps) => {
  const { createGroup, inviteToGroup, joinGroup } = useAuth();
  const { activeFriends } = useFriendships();

  const [step, setStep] = useState<Step>("friends");
  const [selectedFriends, setSelectedFriends] = useState<Set<string>>(new Set());
  const [selectedPages, setSelectedPages] = useState<Set<ShareablePage>>(
    new Set(defaultPage ? [defaultPage] : [])
  );
  const [groupName, setGroupName] = useState("");
  const [creating, setCreating] = useState(false);
  const [addFriendOpen, setAddFriendOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [joining, setJoining] = useState(false);

  const resetState = () => {
    setStep("friends");
    setSelectedFriends(new Set());
    setSelectedPages(new Set(defaultPage ? [defaultPage] : []));
    setGroupName("");
    setCreating(false);
    setInviteCode("");
    setInviteError("");
    setJoining(false);
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) resetState();
    onOpenChange(v);
  };

  const toggleFriend = (id: string) => {
    setSelectedFriends((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    // Clear invite code when selecting friends
    if (inviteCode) {
      setInviteCode("");
      setInviteError("");
    }
  };

  const togglePage = (page: ShareablePage) => {
    if (page === defaultPage) return;
    setSelectedPages((prev) => {
      const next = new Set(prev);
      next.has(page) ? next.delete(page) : next.add(page);
      return next;
    });
  };

  const handleInviteCodeChange = (val: string) => {
    setInviteCode(val);
    setInviteError("");
    // Clear friend selections when typing invite code
    if (val.trim() && selectedFriends.size > 0) {
      setSelectedFriends(new Set());
    }
  };

  const handleJoinWithCode = async () => {
    if (!inviteCode.trim()) return;
    setJoining(true);
    setInviteError("");
    try {
      const result = await joinGroup(inviteCode.trim().toUpperCase());
      if (result.error) {
        const msg = result.error.toLowerCase();
        if (msg.includes("already")) {
          setInviteError("You're already a member of this group");
        } else if (msg.includes("invalid") || msg.includes("not found")) {
          setInviteError("Code not found — check and try again");
        } else {
          setInviteError(result.error);
        }
      } else {
        toast.success("Joined group! 🎉");
        handleOpenChange(false);
      }
    } catch (e: any) {
      setInviteError(e?.message || "Something went wrong — please try again");
    }
    setJoining(false);
  };

  const handleCreate = async () => {
    if (!groupName.trim() || selectedPages.size === 0) return;
    setCreating(true);

    const result = await createGroup(
      groupName.trim(),
      "custom",
      "👥",
      Array.from(selectedPages),
      "interest"
    );

    if (result.error) {
      toast.error(result.error);
      setCreating(false);
      return;
    }

    const groupId = result.id;

    if (groupId) {
      const friendUserIds = Array.from(selectedFriends);
      for (const friendId of friendUserIds) {
        const inviteResult = await inviteToGroup(groupId, friendId);
        if (inviteResult.error) {
          console.error(`Failed to invite ${friendId}:`, inviteResult.error);
        }
      }
    }

    toast.success(`Group "${groupName}" created!`, {
      description: `${Array.from(selectedPages).map(p => PAGE_LABELS[p]).join(", ")}`,
    });

    handleOpenChange(false);
    if (groupId && onGroupCreated) {
      onGroupCreated(groupId);
    }
  };

  const hasInviteCode = inviteCode.trim().length > 0;
  const hasFriends = selectedFriends.size > 0;
  const canProceedFromFriends = hasFriends || hasInviteCode;
  const canProceedFromPages = selectedPages.size > 0;

  const allSteps: Step[] = ["friends", "pages", "name"];
  const stepIdx = allSteps.indexOf(step);
  const stepLabels = ["Members", "Interests", "Details"];

  // activeFriends are Friendship objects; the friend's user ID is in .friend.id
  const getFriendUserId = (f: { friend: FriendProfile | null; requester_id: string; addressee_id: string }) => f.friend?.id || "";
  const selectedFriendItems = activeFriends.filter((f) => selectedFriends.has(getFriendUserId(f)));

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users size={18} className="text-primary" />
              {step === "friends" ? "Who do you want to add?" :
               step === "pages" ? "Choose Pages" : "Name Your Group"}
            </DialogTitle>
          </DialogHeader>

          {/* Step indicator */}
          <div className="flex items-center gap-2 mb-2">
            {allSteps.map((s, i) => (
              <div key={s} className="flex items-center gap-1.5 flex-1">
                <div className="flex flex-col items-center gap-0.5">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    step === s ? "bg-primary text-primary-foreground" :
                    stepIdx > i ? "bg-primary/20 text-primary" :
                    "bg-muted text-muted-foreground"
                  }`}>
                    {i + 1}
                  </div>
                  <span className="text-[9px] text-muted-foreground font-medium">{stepLabels[i]}</span>
                </div>
                {i < allSteps.length - 1 && <div className="flex-1 h-px bg-border mb-4" />}
              </div>
            ))}
          </div>

          {/* Step: Choose friends/members */}
          {step === "friends" && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">Select friends to add to this group.</p>

              {/* Selected member pills */}
              {selectedFriendItems.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selectedFriendItems.map((fs) => {
                    const f = fs.friend;
                    if (!f) return null;
                    return (
                      <button
                        key={f.id}
                        onClick={() => toggleFriend(f.id)}
                        className="flex items-center gap-1.5 pl-1.5 pr-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-medium text-primary transition-all hover:bg-primary/15"
                      >
                        <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[9px] font-bold text-primary overflow-hidden">
                          {f.avatar_url ? (
                            <img src={f.avatar_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            f.display_name?.[0]?.toUpperCase() || "?"
                          )}
                        </div>
                        {f.display_name}
                        <X size={10} className="ml-0.5" />
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="space-y-1.5 max-h-[40vh] overflow-y-auto">
                {activeFriends.map((fs) => {
                  const f = fs.friend;
                  if (!f) return null;
                  const checked = selectedFriends.has(f.id);
                  return (
                    <button
                      key={f.id}
                      onClick={() => toggleFriend(f.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                        checked
                          ? "border-primary bg-primary/5"
                          : "border-border bg-card hover:bg-secondary/50"
                      }`}
                    >
                      <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-xs font-bold text-muted-foreground overflow-hidden flex-shrink-0">
                        {f.avatar_url ? (
                          <img src={f.avatar_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          f.display_name?.[0]?.toUpperCase() || "?"
                        )}
                      </div>
                      <span className="flex-1 text-sm font-medium truncate">{f.display_name}</span>
                      <div className={`w-5 h-5 rounded flex items-center justify-center border-2 transition-all ${
                        checked ? "border-primary bg-primary" : "border-muted-foreground/30"
                      }`}>
                        {checked && <Check size={12} className="text-primary-foreground" />}
                      </div>
                    </button>
                  );
                })}

                {activeFriends.length === 0 && (
                  <div className="text-center py-6">
                    <Users size={24} className="mx-auto text-muted-foreground/40 mb-2" />
                    <p className="text-xs text-muted-foreground">No friends yet. Add someone first!</p>
                  </div>
                )}
              </div>

              {/* Add friend option */}
              <button
                onClick={() => setAddFriendOpen(true)}
                className="w-full flex items-center gap-3 p-3 rounded-xl border border-dashed border-border bg-card hover:bg-secondary/50 transition-all text-left"
              >
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <UserPlus size={14} className="text-primary" />
                </div>
                <span className="text-sm font-medium text-primary">Add a friend</span>
              </button>

              {/* Divider with "or" */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground font-medium">or</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              {/* Invite code input */}
              <div className="space-y-1.5">
                <input
                  value={inviteCode}
                  onChange={(e) => handleInviteCodeChange(e.target.value)}
                  placeholder="Enter invite code..."
                  className="w-full px-4 py-3 rounded-xl bg-card border border-border text-sm outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                  maxLength={20}
                />
                {inviteError && (
                  <p className="text-xs text-destructive px-1">{inviteError}</p>
                )}
              </div>

              <button
                onClick={hasInviteCode ? handleJoinWithCode : () => setStep("pages")}
                disabled={!canProceedFromFriends || joining}
                className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2 transition-all"
              >
                {joining && <Loader2 size={14} className="animate-spin" />}
                {hasInviteCode ? (joining ? "Joining..." : "Join Group") : "Next"}
              </button>
            </div>
          )}

          {/* Step: Choose pages */}
          {step === "pages" && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Select which pages to share with this group.
                {defaultPage && (
                  <span className="font-medium text-foreground"> {PAGE_LABELS[defaultPage]} is pre-selected.</span>
                )}
              </p>

              <div className="space-y-1.5">
                {SHAREABLE_PAGES.map((page) => {
                  const checked = selectedPages.has(page);
                  const isDefault = page === defaultPage;
                  return (
                    <button
                      key={page}
                      onClick={() => togglePage(page)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                        checked
                          ? "border-primary bg-primary/5"
                          : "border-border bg-card hover:bg-secondary/50"
                      } ${isDefault ? "ring-1 ring-primary/30" : ""}`}
                    >
                      <span className="text-lg">{PAGE_ICONS[page]}</span>
                      <span className="flex-1 text-sm font-medium">{PAGE_LABELS[page]}</span>
                      {isDefault && (
                        <span className="text-[10px] font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                          Default
                        </span>
                      )}
                      <div className={`w-5 h-5 rounded flex items-center justify-center border-2 transition-all ${
                        checked ? "border-primary bg-primary" : "border-muted-foreground/30"
                      }`}>
                        {checked && <Check size={12} className="text-primary-foreground" />}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setStep("friends")}
                  className="flex-1 py-3 rounded-xl border border-border text-sm font-medium hover:bg-secondary transition-all"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep("name")}
                  disabled={!canProceedFromPages}
                  className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40 transition-all"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* Step: Name group */}
          {step === "name" && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">Give your group a name.</p>

              <input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Group name..."
                className="w-full px-4 py-3 rounded-xl bg-secondary border border-border text-sm outline-none focus:ring-2 focus:ring-primary/30"
                autoFocus
              />

              {/* Summary */}
              <div className="p-3 rounded-xl bg-secondary/50 border border-border space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Users size={12} />
                  <span>{selectedFriends.size} member{selectedFriends.size !== 1 ? "s" : ""} selected</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {Array.from(selectedPages).map((p) => (
                    <span key={p} className="text-[10px] font-medium bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                      {PAGE_ICONS[p]} {PAGE_LABELS[p]}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setStep("pages")}
                  className="flex-1 py-3 rounded-xl border border-border text-sm font-medium hover:bg-secondary transition-all"
                >
                  Back
                </button>
                <button
                  onClick={handleCreate}
                  disabled={creating || !groupName.trim()}
                  className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2 transition-all"
                >
                  {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  {creating ? "Creating..." : "Create Group"}
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AddFriendModal open={addFriendOpen} onOpenChange={setAddFriendOpen} />
    </>
  );
};

export default CreateGroupModal;
