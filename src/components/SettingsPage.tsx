import { useState, useEffect } from "react";
import { User, Bell, Shield, Palette, HelpCircle, LogOut, ChevronRight, Link2, Copy, Check, Unlink, Loader2, Calendar, ExternalLink, Users, DoorOpen, Trash2, ShieldCheck, AlertTriangle, Pencil, Activity } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useAppContext } from "@/context/AppContext";
import { requestCalendarPermission, getCalendarEvents, hasCalendarReadPermission } from "../integrations/appleCalendar";
import { requestHealthKitReadPermission } from "../integrations/appleHealth";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import GroupManager from "@/components/GroupManager";
import EditProfileModal from "@/components/EditProfileModal";


const settingsItems = [
  { icon: Bell, label: "Notifications", desc: "Reminders & alerts" },
  { icon: Shield, label: "Privacy", desc: "Data & sharing" },
  { icon: Palette, label: "Appearance", desc: "Theme & display" },
  { icon: HelpCircle, label: "Help & Support", desc: "FAQ & contact" },
];

const appleCalendarRange = () => {
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  const endDate = new Date(now.getFullYear(), now.getMonth() + 3, 0, 23, 59, 59, 999);
  return { startDate, endDate };
};

const SettingsPage = () => {
  const { user, session, profile, partner, groups, activeGroup, setActiveGroup, signOut, connectPartner, disconnectPartner, leaveGroup, refreshGroups } = useAuth();
  const { setAppleCalendarEvents, appleFitnessSyncEnabled, setAppleFitnessSyncEnabled } = useAppContext();
  const [showPartnerDialog, setShowPartnerDialog] = useState(false);
  const [inviteInput, setInviteInput] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [gcalConnected, setGcalConnected] = useState<boolean | null>(null);
  const [gcalLoading, setGcalLoading] = useState(false);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [selectedTransferMember, setSelectedTransferMember] = useState<string | null>(null);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [appleCalendarConnected, setAppleCalendarConnected] = useState(false);
  const [appleCalendarLoading, setAppleCalendarLoading] = useState(false);
  const [appleFitnessLoading, setAppleFitnessLoading] = useState(false);

  // Keep activeGroup in sync with groups list
  useEffect(() => {
    if (groups.length === 0) {
      if (activeGroup) setActiveGroup(null);
      return;
    }
    if (!activeGroup || !groups.find(g => g.id === activeGroup.id)) {
      setActiveGroup(groups[0]);
    }
  }, [activeGroup, groups, setActiveGroup]);

  // Check if Google Calendar is connected (account-level, no group dependency)
  useEffect(() => {
    if (!user) {
      setGcalConnected(false);
      return;
    }

    const checkGcal = async () => {
      const { data } = await supabase
        .from("google_calendar_tokens")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      setGcalConnected(!!data);
    };
    checkGcal();

    // Check URL for gcal=connected redirect
    const params = new URLSearchParams(window.location.search);
    if (params.get("gcal") === "connected") {
      setGcalConnected(true);
      toast.success("Google Calendar connected! 🎉");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ok = await hasCalendarReadPermission();
        if (cancelled || !ok) return;
        const { startDate, endDate } = appleCalendarRange();
        const events = await getCalendarEvents(startDate, endDate);
        if (cancelled) return;
        setAppleCalendarEvents(events);
        setAppleCalendarConnected(true);
      } catch {
        /* Web or unavailable plugin */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setAppleCalendarEvents]);

  const handleConnectAppleCalendar = async () => {
    setAppleCalendarLoading(true);
    try {
      const { result } = await requestCalendarPermission();
      if (result !== "granted") {
        toast.error("Calendar access was denied");
        return;
      }
      const { startDate, endDate } = appleCalendarRange();
      const events = await getCalendarEvents(startDate, endDate);
      setAppleCalendarEvents(events);
      setAppleCalendarConnected(true);
      toast.success("Apple Calendar connected");
    } catch {
      toast.error("Could not connect Apple Calendar");
    } finally {
      setAppleCalendarLoading(false);
    }
  };

  const handleDisconnectAppleCalendar = () => {
    setAppleCalendarEvents([]);
    setAppleCalendarConnected(false);
  };

  const handleConnectAppleFitness = async () => {
    setAppleFitnessLoading(true);
    try {
      const granted = await requestHealthKitReadPermission();
      if (!granted) {
        toast.error("Health data access was denied");
        return;
      }
      setAppleFitnessSyncEnabled(true);
      toast.success("Apple Fitness sync enabled");
    } catch {
      toast.error("Could not enable Apple Fitness sync");
    } finally {
      setAppleFitnessLoading(false);
    }
  };

  const handleDisconnectAppleFitness = () => {
    setAppleFitnessSyncEnabled(false);
    toast.success("Apple Fitness sync turned off");
  };

  const handleCopyCode = () => {
    if (profile?.invite_code) {
      navigator.clipboard.writeText(profile.invite_code);
      setCodeCopied(true);
      toast.success("Invite code copied!");
      setTimeout(() => setCodeCopied(false), 2000);
    }
  };

  const handleConnect = async () => {
    if (!inviteInput.trim()) return;
    setConnecting(true);
    const result = await connectPartner(inviteInput.trim());
    if (result.success) {
      toast.success(`Connected with ${result.partner_name}! 🎉`);
      setShowPartnerDialog(false);
      setInviteInput("");
    } else {
      toast.error(result.error || "Failed to connect");
    }
    setConnecting(false);
  };

  const handleDisconnect = async () => {
    const result = await disconnectPartner();
    if (result.success) {
      toast.success("Partner disconnected");
    } else {
      toast.error(result.error || "Failed to disconnect");
    }
  };

  const handleConnectGoogleCalendar = async () => {
    if (!user) return;
    setGcalLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("google-calendar-auth-url", {});
      if (error || !data?.url) throw error || new Error("No URL returned");
      window.location.href = data.url;
    } catch (err) {
      toast.error("Failed to start Google Calendar connection");
      setGcalLoading(false);
    }
  };

  const handleDisconnectGoogleCalendar = async () => {
    setGcalLoading(true);
    try {
      const { error } = await supabase.functions.invoke("google-calendar-disconnect", {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (error) throw error;
      setGcalConnected(false);
      toast.success("Google Calendar disconnected");
    } catch (err: any) {
      toast.error("Failed to disconnect Google Calendar");
    }
    setGcalLoading(false);
  };

  const initial = profile?.display_name?.charAt(0)?.toUpperCase() || "?";
  const partnerInitial = partner?.display_name?.charAt(0)?.toUpperCase() || "?";

  return (
    <div className="px-5">
      <header className="pt-12 pb-6">
        <h1 className="text-[1.75rem] font-bold tracking-display">Settings</h1>
      </header>


      {/* Profile Card */}
      <div className="bg-card rounded-xl p-5 border border-border shadow-card mb-4 flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xl font-bold">
          {initial}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-base truncate">{profile?.display_name || "You"}</p>
          {(profile as any)?.username && (
            <p className="text-xs text-muted-foreground truncate">@{(profile as any).username}</p>
          )}
          <p className="text-sm text-muted-foreground truncate">{profile?.email}</p>
        </div>
        <button
          onClick={() => setShowEditProfile(true)}
          className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors shrink-0"
          title="Edit Profile"
        >
          <Pencil size={16} />
        </button>
      </div>

      {/* Groups / Calendars - FIRST */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-3 px-1">
          <Users size={16} className="text-primary" />
          <span className="text-sm font-semibold">My Groups & Calendars</span>
        </div>
        <GroupManager />
      </div>

      {/* Selected Group Details */}
      <div className="bg-card rounded-xl border border-border shadow-card mb-6 overflow-hidden">
        {activeGroup ? (
          <div className="p-4 space-y-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{activeGroup.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{activeGroup.name}</p>
                <p className="text-xs text-muted-foreground">{activeGroup.members.length} member{activeGroup.members.length !== 1 ? "s" : ""}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex-1 bg-secondary rounded-lg px-3 py-2.5 text-center">
                <span className="text-xs text-muted-foreground block">Group Invite Code</span>
                <span className="text-lg font-bold tracking-widest">{activeGroup.invite_code || "..."}</span>
              </div>
              <button
                onClick={() => {
                  if (!activeGroup.invite_code) return;
                  navigator.clipboard.writeText(activeGroup.invite_code);
                  toast.success("Group invite code copied!");
                }}
                className="p-3 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
              >
                <Copy size={18} />
              </button>
            </div>

            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Members</p>
              <div className="space-y-2">
                {activeGroup.members.map((member) => (
                  <div key={member.id} className="flex items-center gap-3 p-2 rounded-lg bg-secondary/40">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                      {member.display_name?.charAt(0)?.toUpperCase() || "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{member.display_name || "Member"}</p>
                      <p className="text-xs text-muted-foreground truncate">{member.email || ""}</p>
                    </div>
                    <span className="text-[10px] font-medium text-muted-foreground uppercase bg-card px-2 py-0.5 rounded">
                      {member.role}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Group Actions */}
            {user && (() => {
              const currentMember = activeGroup.members.find(m => m.id === user.id);
              const isAdmin = currentMember?.role === 'admin';
              const isCreator = activeGroup.created_by === user.id;
              const adminMembers = activeGroup.members.filter(m => m.role === 'admin');
              const isOnlyAdmin = isAdmin && adminMembers.length <= 1;
              const otherMembers = activeGroup.members.filter(m => m.id !== user.id);
              const hasOtherMembers = otherMembers.length > 0;

              return (
                <div className="pt-2 border-t border-border">
                  <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Group Actions</p>
                  <div className="space-y-2">

                    {/* Warning for only-admin */}
                    {isOnlyAdmin && hasOtherMembers && (
                      <div className="flex items-start gap-2.5 p-3 rounded-xl bg-destructive/5 border border-destructive/20">
                        <AlertTriangle size={16} className="text-destructive mt-0.5 shrink-0" />
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          You're the only admin of this group. Transfer admin access to another member or delete the group before leaving.
                        </p>
                      </div>
                    )}

                    {/* Transfer Admin — only for admins with other members */}
                    {isAdmin && hasOtherMembers && (
                      <button
                        onClick={() => {
                          setSelectedTransferMember(null);
                          setShowTransferDialog(true);
                        }}
                        className="w-full py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-secondary transition-colors flex items-center justify-center gap-2"
                      >
                        <ShieldCheck size={16} className="text-primary" />
                        Transfer Admin
                      </button>
                    )}

                    {/* Delete Group — only for creator */}
                    {isCreator && (
                      <button
                        onClick={() => setShowDeleteDialog(true)}
                        className="w-full py-2.5 rounded-xl border border-destructive/30 text-destructive text-sm font-semibold hover:bg-destructive/10 transition-colors flex items-center justify-center gap-2"
                      >
                        <Trash2 size={16} />
                        Delete Group
                      </button>
                    )}

                    {/* Leave Group */}
                    <button
                      onClick={() => {
                        if (isOnlyAdmin && hasOtherMembers) return;
                        if (isOnlyAdmin && !hasOtherMembers) {
                          setShowDeleteDialog(true);
                          return;
                        }
                        setShowLeaveDialog(true);
                      }}
                      disabled={isOnlyAdmin && hasOtherMembers}
                      className={`w-full py-2.5 rounded-xl border text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${
                        isOnlyAdmin && hasOtherMembers
                          ? "border-border text-muted-foreground opacity-50 cursor-not-allowed"
                          : "border-destructive/30 text-destructive hover:bg-destructive/10"
                      }`}
                    >
                      <DoorOpen size={16} />
                      Leave Group
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        ) : groups.length > 0 ? (
          <div className="p-4">
            <p className="text-sm text-muted-foreground">Select a group above to view its settings.</p>
          </div>
        ) : (
          <div className="p-6 text-center space-y-3">
            <Users size={32} className="mx-auto text-muted-foreground/50" />
            <div>
              <p className="text-sm font-semibold">No groups yet</p>
              <p className="text-xs text-muted-foreground mt-1">Create a group or join an existing group to start sharing calendars and pages.</p>
            </div>
          </div>
        )}
      </div>

      {/* Google Calendar Integration (account-level) */}
      <div className="bg-card rounded-xl border border-border shadow-card mb-6 overflow-hidden">
        <div className="p-4">
          <div className="flex items-center gap-3 mb-3">
            <Calendar size={16} className="text-primary" />
            <span className="text-sm font-semibold">Google Calendar Sync</span>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Connect your Google Calendar once to sync events across Personal, All, and shared groups.
          </p>

          {gcalConnected === null ? (
            <div className="flex items-center justify-center py-3">
              <Loader2 size={16} className="animate-spin text-muted-foreground" />
            </div>
          ) : gcalConnected ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-primary/5 border border-primary/20">
                <span className="text-xl">📅</span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-primary">Connected</p>
                  <p className="text-xs text-muted-foreground">Your Google calendars are available everywhere</p>
                </div>
                <Check size={16} className="text-primary" />
              </div>
              <button
                onClick={handleDisconnectGoogleCalendar}
                disabled={gcalLoading}
                className="w-full py-2.5 rounded-xl border border-destructive/30 text-destructive text-sm font-semibold hover:bg-destructive/10 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {gcalLoading ? <Loader2 size={16} className="animate-spin" /> : <Unlink size={16} />}
                Disconnect Google Calendar
              </button>
            </div>
          ) : (
            <button
              onClick={handleConnectGoogleCalendar}
              disabled={gcalLoading}
              className="w-full flex items-center gap-3 p-3 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <span className="text-xl">📅</span>
              <div className="flex-1 text-left">
                <p className="text-sm font-semibold">Connect Google Calendar</p>
                <p className="text-xs opacity-80">Sync your calendars across the app</p>
              </div>
              {gcalLoading ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}
            </button>
          )}
        </div>
      </div>

      {/* Apple Calendar (device native) */}
      <div className="bg-card rounded-xl border border-border shadow-card mb-6 overflow-hidden">
        <div className="p-4">
          <div className="flex items-center gap-3 mb-3">
            <Calendar size={16} className="text-primary" />
            <span className="text-sm font-semibold">Apple Calendar</span>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Show events from calendars on this device (iOS / Android). Requires the native app.
          </p>

          {appleCalendarConnected ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-primary/5 border border-primary/20">
                <span className="text-xl">🍎</span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-primary">Connected</p>
                  <p className="text-xs text-muted-foreground">Device calendar events are merged into your schedule</p>
                </div>
                <Check size={16} className="text-primary" />
              </div>
              <button
                type="button"
                onClick={handleDisconnectAppleCalendar}
                disabled={appleCalendarLoading}
                className="w-full py-2.5 rounded-xl border border-destructive/30 text-destructive text-sm font-semibold hover:bg-destructive/10 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                Disconnect Apple Calendar
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleConnectAppleCalendar}
              disabled={appleCalendarLoading}
              className="w-full flex items-center gap-3 p-3 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <span className="text-xl">🍎</span>
              <div className="flex-1 text-left">
                <p className="text-sm font-semibold">Connect Apple Calendar</p>
                <p className="text-xs opacity-80">Import device calendar events</p>
              </div>
              {appleCalendarLoading ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}
            </button>
          )}
        </div>
      </div>

      {/* Apple Fitness / HealthKit sync */}
      <div className="bg-card rounded-xl border border-border shadow-card mb-6 overflow-hidden">
        <div className="p-4">
          <div className="flex items-center gap-3 mb-3">
            <Activity size={16} className="text-primary" />
            <span className="text-sm font-semibold">Apple Fitness Sync</span>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            After you complete a workout, we can pull calories, distance, and heart rate from Apple Health (HealthKit). Requires the native iOS app and Health permissions.
          </p>

          {appleFitnessSyncEnabled ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-primary/5 border border-primary/20">
                <span className="text-xl">❤️</span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-primary">Sync on</p>
                  <p className="text-xs text-muted-foreground">Completed workouts will merge metrics from Health when available</p>
                </div>
                <Check size={16} className="text-primary" />
              </div>
              <button
                type="button"
                onClick={handleDisconnectAppleFitness}
                disabled={appleFitnessLoading}
                className="w-full py-2.5 rounded-xl border border-destructive/30 text-destructive text-sm font-semibold hover:bg-destructive/10 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                Turn off sync
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleConnectAppleFitness}
              disabled={appleFitnessLoading}
              className="w-full flex items-center gap-3 p-3 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <span className="text-xl">❤️</span>
              <div className="flex-1 text-left">
                <p className="text-sm font-semibold">Enable Apple Fitness Sync</p>
                <p className="text-xs opacity-80">Allow reading workouts, energy, distance, and heart rate</p>
              </div>
              {appleFitnessLoading ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}
            </button>
          )}
        </div>
      </div>

      {/* Settings List */}
      <div className="space-y-1">
        {settingsItems.map((item) => (
          <button
            key={item.label}
            className="w-full flex items-center gap-4 p-4 rounded-xl hover:bg-secondary transition-colors"
          >
            <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center">
              <item.icon size={20} className="text-foreground" />
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-semibold">{item.label}</p>
              <p className="text-xs text-muted-foreground">{item.desc}</p>
            </div>
            <ChevronRight size={16} className="text-muted-foreground" />
          </button>
        ))}
      </div>

      <button
        onClick={signOut}
        className="w-full flex items-center gap-4 p-4 rounded-xl hover:bg-destructive/10 transition-colors mt-4 text-destructive"
      >
        <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center">
          <LogOut size={20} />
        </div>
        <span className="text-sm font-semibold">Log Out</span>
      </button>

      {/* Partner Code Dialog */}
      <Dialog open={showPartnerDialog} onOpenChange={setShowPartnerDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Connect with Partner</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">
              Enter the invite code your partner shared with you.
            </p>
            <input
              value={inviteInput}
              onChange={(e) => setInviteInput(e.target.value.toUpperCase())}
              placeholder="e.g. A1B2C3D4"
              maxLength={8}
              className="w-full px-4 py-3 rounded-xl bg-secondary border border-border text-center text-lg font-bold tracking-widest uppercase outline-none focus:ring-2 focus:ring-primary/30"
            />
            <button
              onClick={handleConnect}
              disabled={connecting || inviteInput.length < 4}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {connecting ? <Loader2 size={16} className="animate-spin" /> : <Link2 size={16} />}
              {connecting ? "Connecting..." : "Connect"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Leave Group Confirmation Dialog */}
      <Dialog open={showLeaveDialog} onOpenChange={setShowLeaveDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle size={18} className="text-destructive" />
              Leave Group?
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground pt-2">
              You will lose access to <span className="font-semibold text-foreground">{activeGroup?.name}</span>'s shared content unless you are invited again.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setShowLeaveDialog(false)}
              disabled={leaving}
              className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-secondary transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                if (!activeGroup) return;
                const groupName = activeGroup.name;
                setLeaving(true);
                const result = await leaveGroup(activeGroup.id);
                if (result.success) {
                  setActiveGroup(null);
                  toast.success(`Left ${groupName}`);
                  setShowLeaveDialog(false);
                } else {
                  toast.error(result.error || "Failed to leave group");
                }
                setLeaving(false);
              }}
              disabled={leaving}
              className="flex-1 py-2.5 rounded-xl bg-destructive text-destructive-foreground text-sm font-semibold hover:bg-destructive/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {leaving ? <Loader2 size={14} className="animate-spin" /> : <DoorOpen size={14} />}
              {leaving ? "Leaving..." : "Leave Group"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Transfer Admin Dialog */}
      <Dialog open={showTransferDialog} onOpenChange={(open) => { setShowTransferDialog(open); if (!open) setSelectedTransferMember(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck size={18} className="text-primary" />
              Transfer Admin
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground pt-2">
              Select a member to become the new admin of <span className="font-semibold text-foreground">{activeGroup?.name}</span>. You will be demoted to a regular member.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 pt-1 max-h-60 overflow-y-auto">
            {activeGroup?.members
              .filter(m => m.id !== user?.id)
              .map((member) => (
                <button
                  key={member.id}
                  onClick={() => setSelectedTransferMember(member.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                    selectedTransferMember === member.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-secondary/50"
                  }`}
                >
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                    {member.display_name?.charAt(0)?.toUpperCase() || "?"}
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <p className="text-sm font-medium truncate">{member.display_name || "Member"}</p>
                    <p className="text-xs text-muted-foreground truncate">{member.email || ""}</p>
                  </div>
                  {selectedTransferMember === member.id && (
                    <Check size={16} className="text-primary shrink-0" />
                  )}
                </button>
              ))}
            {activeGroup?.members.filter(m => m.id !== user?.id).length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No other members to transfer admin to. Invite someone to the group first.
              </p>
            )}
          </div>
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => { setShowTransferDialog(false); setSelectedTransferMember(null); }}
              disabled={transferring}
              className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-secondary transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                if (!activeGroup || !selectedTransferMember) return;
                setTransferring(true);
                const { data, error } = await supabase.rpc("transfer_group_admin", {
                  _group_id: activeGroup.id,
                  _new_admin_user_id: selectedTransferMember,
                });
                if (error) {
                  toast.error(error.message || "Failed to transfer admin");
                } else {
                  const result = data as any;
                  if (result?.error) {
                    toast.error(result.error);
                  } else {
                    toast.success("Admin transferred successfully");
                    setShowTransferDialog(false);
                    setSelectedTransferMember(null);
                    await refreshGroups();
                  }
                }
                setTransferring(false);
              }}
              disabled={transferring || !selectedTransferMember}
              className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {transferring ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
              {transferring ? "Transferring..." : "Transfer"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Group Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 size={18} className="text-destructive" />
              Delete Group?
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground pt-2">
              This will permanently delete <span className="font-semibold text-foreground">{activeGroup?.name}</span> and remove access for all members. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setShowDeleteDialog(false)}
              disabled={deleting}
              className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-secondary transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                if (!activeGroup) return;
                const groupName = activeGroup.name;
                setDeleting(true);
                const { data, error } = await supabase.rpc("delete_group", {
                  _group_id: activeGroup.id,
                });
                if (error) {
                  toast.error(error.message || "Failed to delete group");
                } else {
                  const result = data as any;
                  if (result?.error) {
                    toast.error(result.error);
                  } else {
                    setActiveGroup(null);
                    toast.success(`Deleted ${groupName}`);
                    setShowDeleteDialog(false);
                    await refreshGroups();
                  }
                }
                setDeleting(false);
              }}
              disabled={deleting}
              className="flex-1 py-2.5 rounded-xl bg-destructive text-destructive-foreground text-sm font-semibold hover:bg-destructive/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              {deleting ? "Deleting..." : "Delete Group"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Profile Modal */}
      <EditProfileModal open={showEditProfile} onOpenChange={setShowEditProfile} />
    </div>
  );
};

export default SettingsPage;
