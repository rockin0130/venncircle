import { useState } from "react";
import { Plus, Copy, Check, LogOut, Link2, Loader2, ArrowDownToLine, ArrowUpFromLine, Pencil } from "lucide-react";
import { useAuth, Group, SHAREABLE_PAGES, PAGE_LABELS, PAGE_ICONS, ShareablePage } from "@/context/AuthContext";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import MigrateItemsModal from "@/components/MigrateItemsModal";

const GROUP_TYPES = [
  { value: "couple", label: "Couple", emoji: "💑" },
  { value: "family", label: "Family", emoji: "👨‍👩‍👧‍👦" },
  { value: "friends", label: "Friends", emoji: "👫" },
  { value: "work", label: "Work Team", emoji: "💼" },
  { value: "custom", label: "Custom", emoji: "📅" },
];

const GroupManager = () => {
  const { groups, activeGroup, setActiveGroup, createGroup, joinGroup, leaveGroup, updateGroupSharedPages } = useAuth();
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [showGroupDetail, setShowGroupDetail] = useState<Group | null>(null);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("couple");
  const [joinCode, setJoinCode] = useState("");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Post-creation setup flow
  const [newlyCreatedGroup, setNewlyCreatedGroup] = useState<Group | null>(null);
  const [showSetupChoice, setShowSetupChoice] = useState(false);
  const [showMigrate, setShowMigrate] = useState(false);
  const [migrateTarget, setMigrateTarget] = useState<Group | null>(null);
  const [migrateDirection, setMigrateDirection] = useState<"into" | "from">("into");
  const [editingPages, setEditingPages] = useState(false);
  const [editPages, setEditPages] = useState<Set<ShareablePage>>(new Set());

  const selectedType = GROUP_TYPES.find((t) => t.value === newType) || GROUP_TYPES[0];

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    const result = await createGroup(newName.trim(), newType, selectedType.emoji);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(`Group "${newName}" created!`, {
        description: `Invite code: ${result.invite_code}`,
      });
      setShowCreate(false);
      setNewName("");
      setNewType("couple");

      // Show setup choice if user has other groups to migrate from
      if (groups.length > 0 && result.id) {
        // Find the newly created group after refresh
        setTimeout(() => {
          const created: Group = {
            id: result.id!,
            name: newName.trim(),
            type: newType,
            emoji: selectedType.emoji,
            invite_code: result.invite_code || "",
            created_by: "",
            shared_pages: ["calendar","workout","nutrition","habits","sobriety","special_days","shopping"],
            category: "home",
            members: [],
          };
          setNewlyCreatedGroup(created);
          setShowSetupChoice(true);
        }, 500);
      }
    }
    setCreating(false);
  };

  const handleJoin = async () => {
    if (!joinCode.trim()) return;
    setJoining(true);
    const result = await joinGroup(joinCode.trim());
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(`Joined "${result.group_name}"! 🎉`);
      setShowJoin(false);
      setJoinCode("");
    }
    setJoining(false);
  };

  const handleLeave = async (groupId: string) => {
    const result = await leaveGroup(groupId);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Left group");
      setShowGroupDetail(null);
    }
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    toast.success("Invite code copied!");
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const openMigrateInto = (group: Group) => {
    setMigrateTarget(group);
    setMigrateDirection("into");
    setShowMigrate(true);
  };

  const openMigrateFrom = (group: Group) => {
    setMigrateTarget(group);
    setMigrateDirection("from");
    setShowMigrate(true);
  };

  return (
    <div className="space-y-4">
      {/* Group list */}
      <div className="space-y-2">
        {groups.map((group) => (
          <button
            key={group.id}
            onClick={() => setActiveGroup(group)}
            className={`w-full flex items-center gap-3 p-4 rounded-xl border shadow-card transition-colors text-left ${activeGroup?.id === group.id ? "bg-primary/5 border-primary" : "bg-card border-border hover:bg-secondary/50"}`}
          >
            <span className="text-2xl">{group.emoji}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{group.name}</p>
              <p className="text-xs text-muted-foreground">
                {group.members.length} member{group.members.length !== 1 ? "s" : ""} · {group.type}
              </p>
              {activeGroup?.id === group.id && (
                <p className="text-[11px] font-semibold text-primary mt-1">Selected for Settings</p>
              )}
            </div>
            <div className="flex -space-x-2">
              {group.members.slice(0, 3).map((m) => (
                <div
                  key={m.id}
                  className="w-7 h-7 rounded-full bg-primary/10 border-2 border-card flex items-center justify-center text-[10px] font-bold text-primary"
                  title={m.display_name || ""}
                >
                  {m.display_name?.charAt(0)?.toUpperCase() || "?"}
                </div>
              ))}
              {group.members.length > 3 && (
                <div className="w-7 h-7 rounded-full bg-muted border-2 border-card flex items-center justify-center text-[10px] font-medium text-muted-foreground">
                  +{group.members.length - 3}
                </div>
              )}
            </div>
          </button>
        ))}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => setShowCreate(true)}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold"
        >
          <Plus size={16} />
          Create Group
        </button>
        <button
          onClick={() => setShowJoin(true)}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-border text-sm font-semibold hover:bg-secondary transition-colors"
        >
          <Link2 size={16} />
          Join Group
        </button>
      </div>

      {/* Create Group Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Create New Group</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Group name..."
              className="w-full px-4 py-3 rounded-xl bg-secondary border border-border text-sm outline-none focus:ring-2 focus:ring-primary/30"
              autoFocus
            />
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Type</p>
              <div className="grid grid-cols-3 gap-2">
                {GROUP_TYPES.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setNewType(t.value)}
                    className={`py-2.5 px-2 text-xs font-semibold rounded-xl border transition-all text-center ${
                      newType === t.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    <span className="block text-lg mb-0.5">{t.emoji}</span>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={handleCreate}
              disabled={creating || !newName.trim()}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              {creating ? "Creating..." : "Create Group"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Post-creation Setup Choice */}
      <Dialog open={showSetupChoice} onOpenChange={setShowSetupChoice}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-xl">{newlyCreatedGroup?.emoji}</span>
              {newlyCreatedGroup?.name} Created!
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">
              How would you like to set up your new calendar?
            </p>

            <button
              onClick={() => {
                setShowSetupChoice(false);
                toast.success("Calendar is ready — starting fresh! 🎉");
              }}
              className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-primary/20 hover:border-primary hover:bg-primary/5 transition-all text-left"
            >
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-lg">
                ✨
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold">Start Fresh</p>
                <p className="text-xs text-muted-foreground">
                  Begin with a clean calendar — no inherited items or settings
                </p>
              </div>
            </button>

            <button
              onClick={() => {
                setShowSetupChoice(false);
                if (newlyCreatedGroup) {
                  openMigrateInto(newlyCreatedGroup);
                }
              }}
              className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-border hover:border-primary/50 hover:bg-secondary/50 transition-all text-left"
            >
              <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-lg">
                📦
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold">Copy from Existing Calendar</p>
                <p className="text-xs text-muted-foreground">
                  Choose items to bring over from another calendar
                </p>
              </div>
            </button>

            <p className="text-xs text-muted-foreground text-center italic">
              You can always import items later from the group settings.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Join Group Dialog */}
      <Dialog open={showJoin} onOpenChange={setShowJoin}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Join a Group</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">
              Enter the invite code shared by a group member.
            </p>
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="e.g. A1B2C3D4"
              maxLength={8}
              className="w-full px-4 py-3 rounded-xl bg-secondary border border-border text-center text-lg font-bold tracking-widest uppercase outline-none focus:ring-2 focus:ring-primary/30"
            />
            <button
              onClick={handleJoin}
              disabled={joining || joinCode.length < 4}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {joining ? <Loader2 size={16} className="animate-spin" /> : <Link2 size={16} />}
              {joining ? "Joining..." : "Join Group"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Group Detail Dialog */}
      <Dialog open={!!showGroupDetail} onOpenChange={(open) => !open && setShowGroupDetail(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-xl">{showGroupDetail?.emoji}</span>
              {showGroupDetail?.name}
            </DialogTitle>
          </DialogHeader>
          {showGroupDetail && (
            <div className="space-y-4 pt-2">
              {/* Invite code */}
              <div className="flex items-center gap-2 p-3 rounded-xl bg-secondary">
                <div className="flex-1">
                  <span className="text-xs text-muted-foreground block">Invite Code</span>
                  <span className="text-base font-bold tracking-widest">{showGroupDetail.invite_code}</span>
                </div>
                <button
                  onClick={() => handleCopyCode(showGroupDetail.invite_code)}
                  className="p-2.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                >
                  {copiedCode === showGroupDetail.invite_code ? <Check size={16} /> : <Copy size={16} />}
                </button>
              </div>

              {/* Members */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
                  Members ({showGroupDetail.members.length})
                </p>
                <div className="space-y-2">
                  {showGroupDetail.members.map((m) => (
                    <div key={m.id} className="flex items-center gap-3 p-2">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                        {m.display_name?.charAt(0)?.toUpperCase() || "?"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{m.display_name}</p>
                        <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                      </div>
                      <span className="text-[10px] font-medium text-muted-foreground uppercase bg-secondary px-2 py-0.5 rounded">
                        {m.role}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Shared Pages */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Shared Pages
                  </p>
                  <button
                    onClick={() => {
                      if (editingPages) {
                        // Save
                        updateGroupSharedPages(showGroupDetail.id, Array.from(editPages));
                        toast.success("Shared pages updated");
                        setEditingPages(false);
                      } else {
                        setEditPages(new Set(showGroupDetail.shared_pages || SHAREABLE_PAGES));
                        setEditingPages(true);
                      }
                    }}
                    className="text-xs font-medium text-primary flex items-center gap-1"
                  >
                    {editingPages ? <><Check size={12} /> Save</> : <><Pencil size={12} /> Edit</>}
                  </button>
                </div>
                {editingPages ? (
                  <div className="grid grid-cols-2 gap-1.5">
                    {SHAREABLE_PAGES.map((page) => {
                      const checked = editPages.has(page);
                      return (
                        <button
                          key={page}
                          onClick={() => {
                            setEditPages((prev) => {
                              const next = new Set(prev);
                              next.has(page) ? next.delete(page) : next.add(page);
                              return next;
                            });
                          }}
                          className={`flex items-center gap-2 p-2 rounded-lg border text-xs font-medium transition-all ${
                            checked ? "border-primary bg-primary/5 text-foreground" : "border-border text-muted-foreground"
                          }`}
                        >
                          <span>{PAGE_ICONS[page]}</span>
                          <span>{PAGE_LABELS[page]}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {(showGroupDetail.shared_pages || SHAREABLE_PAGES).map((page: ShareablePage) => (
                      <span key={page} className="text-[10px] font-medium bg-primary/10 text-primary px-2 py-1 rounded-full">
                        {PAGE_ICONS[page]} {PAGE_LABELS[page]}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Migration buttons */}
              {groups.length > 1 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
                    Migrate Items
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setShowGroupDetail(null);
                        openMigrateInto(showGroupDetail);
                      }}
                      className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-secondary/50 transition-colors flex items-center justify-center gap-2"
                    >
                      <ArrowDownToLine size={14} />
                      Import
                    </button>
                    <button
                      onClick={() => {
                        setShowGroupDetail(null);
                        openMigrateFrom(showGroupDetail);
                      }}
                      className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-secondary/50 transition-colors flex items-center justify-center gap-2"
                    >
                      <ArrowUpFromLine size={14} />
                      Send
                    </button>
                  </div>
                </div>
              )}

              {/* Leave group */}
              <button
                onClick={() => handleLeave(showGroupDetail.id)}
                className="w-full py-2.5 rounded-xl border border-destructive/30 text-destructive text-sm font-semibold hover:bg-destructive/10 transition-colors flex items-center justify-center gap-2"
              >
                <LogOut size={16} />
                Leave Group
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Migrate Items Modal */}
      <MigrateItemsModal
        open={showMigrate}
        onOpenChange={setShowMigrate}
        targetGroup={migrateTarget}
        direction={migrateDirection}
      />
    </div>
  );
};

export default GroupManager;
