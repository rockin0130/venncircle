import { useState } from "react";
import { Plus, Check, Loader2, UserPlus, X, Users, Home, Compass } from "lucide-react";
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

type Step = "category" | "friends" | "pages" | "name";

const CreateGroupModal = ({ open, onOpenChange, defaultPage, onGroupCreated, defaultCategory }: CreateGroupModalProps) => {
  const { createGroup, inviteToGroup } = useAuth();
  const { activeFriends } = useFriendships();

  const [step, setStep] = useState<Step>(defaultCategory ? "pages" : "category");
  const [category, setCategory] = useState<"home" | "interest">(defaultCategory || "home");
  const [selectedFriends, setSelectedFriends] = useState<Set<string>>(new Set());
  const [selectedPages, setSelectedPages] = useState<Set<ShareablePage>>(
    new Set(defaultPage ? [defaultPage] : [])
  );
  const [groupName, setGroupName] = useState("");
  const [creating, setCreating] = useState(false);
  const [addFriendOpen, setAddFriendOpen] = useState(false);

  const resetState = () => {
    setStep(defaultCategory ? "friends" : "category");
    setCategory(defaultCategory || "home");
    setSelectedFriends(new Set());
    setSelectedPages(new Set(defaultPage ? [defaultPage] : []));
    setGroupName("");
    setCreating(false);
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
  };

  const togglePage = (page: ShareablePage) => {
    if (page === defaultPage) return;
    setSelectedPages((prev) => {
      const next = new Set(prev);
      next.has(page) ? next.delete(page) : next.add(page);
      return next;
    });
  };

  const handleCreate = async () => {
    if (!groupName.trim() || selectedPages.size === 0) return;
    setCreating(true);

    const result = await createGroup(
      groupName.trim(),
      "custom",
      category === "home" ? "🏠" : "👥",
      Array.from(selectedPages),
      category
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
      description: `${category === "home" ? "Home" : "Shared Interest"} · ${Array.from(selectedPages).map(p => PAGE_LABELS[p]).join(", ")}`,
    });

    handleOpenChange(false);
    if (groupId && onGroupCreated) {
      onGroupCreated(groupId);
    }
  };

  const canProceedFromFriends = selectedFriends.size > 0;
  const canProceedFromPages = selectedPages.size > 0;

  const allSteps: Step[] = defaultCategory ? ["pages", "name"] : ["category", "pages", "name"];
  const stepIdx = allSteps.indexOf(step);

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users size={18} className="text-primary" />
              {step === "category" ? "Group Type" :
               step === "friends" ? "Choose People" :
               step === "pages" ? "Choose Pages" : "Name Your Group"}
            </DialogTitle>
          </DialogHeader>

          {/* Step indicator */}
          <div className="flex items-center gap-2 mb-2">
            {allSteps.map((s, i) => (
              <div key={s} className="flex items-center gap-1.5 flex-1">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  step === s ? "bg-primary text-primary-foreground" :
                  stepIdx > i ? "bg-primary/20 text-primary" :
                  "bg-muted text-muted-foreground"
                }`}>
                  {i + 1}
                </div>
                {i < allSteps.length - 1 && <div className="flex-1 h-px bg-border" />}
              </div>
            ))}
          </div>

          {/* Step: Category */}
          {step === "category" && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">What kind of group is this?</p>
              <div className="space-y-2">
                <button
                  onClick={() => { setCategory("home"); setSelectedFriends(new Set()); setStep("pages"); }}
                  className={`w-full flex items-center gap-3 p-4 rounded-xl border transition-all text-left ${
                    category === "home" ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-secondary/50"
                  }`}
                >
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Home size={20} className="text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold">Create Alone</p>
                    <p className="text-xs text-muted-foreground">Start a personal group — invite friends later</p>
                  </div>
                </button>
                <button
                  onClick={() => { setCategory("interest"); setSelectedFriends(new Set()); setStep("pages"); }}
                  className={`w-full flex items-center gap-3 p-4 rounded-xl border transition-all text-left ${
                    category === "interest" ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-secondary/50"
                  }`}
                >
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Compass size={20} className="text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold">Shared Interest</p>
                    <p className="text-xs text-muted-foreground">Topic-based group — workout, nutrition, etc.</p>
                  </div>
                </button>
              </div>
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
                  onClick={() => setStep(defaultCategory ? "pages" : "category")}
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
                  {category === "home" ? <Home size={12} /> : <Compass size={12} />}
                  <span>{category === "home" ? "Home Group" : "Shared Interest"}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Users size={12} />
                  <span>{selectedFriends.size} friend{selectedFriends.size !== 1 ? "s" : ""} selected</span>
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
