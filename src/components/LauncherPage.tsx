import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, Plus, Settings, Users, Loader2, X, Check, Camera, Compass, UserPlus, ChevronDown, ChevronUp } from "lucide-react";
import AddFriendModal from "@/components/AddFriendModal";
import FriendRow from "@/components/FriendRow";
import { Group, useAuth, PAGE_LABELS, PAGE_ICONS, ShareablePage, SHAREABLE_PAGES } from "@/context/AuthContext";
import { useFriendships } from "@/hooks/useFriendships";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import GroupFeedPost from "@/components/GroupFeedPost";

interface LauncherPageProps {
  onEnterGroup: (groupId: string | null) => void;
  onCreateGroup?: () => void;
  onOpenSettings?: () => void;
}

const INVITE_CODE_REGEX = /^[A-Za-z0-9]{6,10}$/;
const CALENDAR_ORDER_KEY = "myCalendarsOrder";
const LONG_PRESS_MS = 500;

function loadCalendarOrder(): string[] {
  try {
    const raw = localStorage.getItem(CALENDAR_ORDER_KEY);
    if (raw) return JSON.parse(raw) as string[];
  } catch {}
  return [];
}

function saveCalendarOrder(order: string[]) {
  localStorage.setItem(CALENDAR_ORDER_KEY, JSON.stringify(order));
}

function reconcileCalendarOrder(saved: string[], current: Group[]): string[] {
  const currentIds = new Set(current.map((g) => g.id));
  const ordered = saved.filter((id) => currentIds.has(id));
  const orderedSet = new Set(ordered);
  for (const g of current) {
    if (!orderedSet.has(g.id)) ordered.push(g.id);
  }
  return ordered;
}

type InviteState =
  | { type: "idle" }
  | { type: "checking" }
  | { type: "found"; groupName: string; code: string }
  | { type: "already_member"; groupName: string }
  | { type: "invalid" }
  | { type: "joining" }
  | { type: "joined"; groupName: string; groupId: string };

// Soft gradient palettes for cards without cover images
const CARD_GRADIENTS = [
  "from-[hsl(210,30%,95%)] to-[hsl(220,25%,92%)]",
  "from-[hsl(260,25%,95%)] to-[hsl(270,20%,91%)]",
  "from-[hsl(35,30%,95%)] to-[hsl(25,25%,92%)]",
  "from-[hsl(170,25%,94%)] to-[hsl(180,20%,91%)]",
  "from-[hsl(340,25%,95%)] to-[hsl(350,20%,92%)]",
];

const LauncherPage = ({ onEnterGroup, onCreateGroup, onOpenSettings }: LauncherPageProps) => {
  const { user, profile, groups, pendingGroupInvites, joinGroup, refreshGroups, acceptGroupInvite, declineGroupInvite } = useAuth();
  const {
    activeFriends, pendingSent, pendingReceived, loading: friendsLoading,
    sendFriendRequest, acceptFriendRequest, declineFriendRequest, cancelFriendRequest, removeFriend, searchUsers,
  } = useFriendships();
  const [inviteState, setInviteState] = useState<InviteState>({ type: "idle" });
  const [fallbackGroups, setFallbackGroups] = useState<Group[]>([]);
  const [localCoverMap, setLocalCoverMap] = useState<Record<string, string>>({});
  const [uploadingGroupId, setUploadingGroupId] = useState<string | null>(null);
  const [addFriendOpen, setAddFriendOpen] = useState(false);
  const [groupsExpanded, setGroupsExpanded] = useState(false);
  const [activityExpanded, setActivityExpanded] = useState(false);
  const [activityPosts, setActivityPosts] = useState<any[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(true);
  const pendingGroupIdRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const visibleGroups = useMemo(() => (groups.length > 0 ? groups : fallbackGroups), [groups, fallbackGroups]);

  // Calendar card reorder state
  const [editMode, setEditMode] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  const [orderedIds, setOrderedIds] = useState<string[]>(() =>
    reconcileCalendarOrder(loadCalendarOrder(), visibleGroups)
  );

  useEffect(() => {
    setOrderedIds((prev) => reconcileCalendarOrder(prev, visibleGroups));
  }, [visibleGroups]);

  useEffect(() => {
    saveCalendarOrder(orderedIds);
  }, [orderedIds]);

  const orderedVisibleGroups = useMemo(() => {
    const map = new Map(visibleGroups.map((g) => [g.id, g]));
    return orderedIds.map((id) => map.get(id)).filter(Boolean) as Group[];
  }, [orderedIds, visibleGroups]);

  // Close edit mode on outside tap
  useEffect(() => {
    if (!editMode) return;
    const handler = (e: PointerEvent) => {
      if (listRef.current && !listRef.current.contains(e.target as Node)) {
        setEditMode(false);
      }
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [editMode]);

  const clearLP = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleCardPointerDown = useCallback((idx: number) => {
    didLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      didLongPress.current = true;
      setEditMode(true);
      setDragIdx(idx);
      if (navigator.vibrate) navigator.vibrate(30);
    }, LONG_PRESS_MS);
  }, []);

  const handleCardPointerUp = useCallback(
    (group: Group) => {
      const wasLongPress = didLongPress.current;
      clearLP();

      if (editMode && dragIdx !== null && dragOverIdx !== null && dragIdx !== dragOverIdx) {
        setOrderedIds((prev) => {
          const next = [...prev];
          const [moved] = next.splice(dragIdx, 1);
          next.splice(dragOverIdx, 0, moved);
          return next;
        });
      }

      setDragIdx(null);
      setDragOverIdx(null);

      if (!wasLongPress && !editMode) {
        onEnterGroup(group.id);
      }
    },
    [editMode, dragIdx, dragOverIdx, clearLP, onEnterGroup]
  );

  const handleCardPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!editMode || dragIdx === null) return;
      const y = e.clientY;
      for (let i = 0; i < cardRefs.current.length; i++) {
        const el = cardRefs.current[i];
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (y >= rect.top && y <= rect.bottom) {
          setDragOverIdx(i);
          return;
        }
      }
    },
    [editMode, dragIdx]
  );

  const visualCalendarGroups = useMemo(() => {
    if (editMode && dragIdx !== null && dragOverIdx !== null && dragIdx !== dragOverIdx) {
      const next = [...orderedVisibleGroups];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(dragOverIdx, 0, moved);
      return next;
    }
    return orderedVisibleGroups;
  }, [orderedVisibleGroups, editMode, dragIdx, dragOverIdx]);

  const now = new Date();
  const greeting = now.getHours() < 12 ? "Good morning" : now.getHours() < 17 ? "Good afternoon" : "Good evening";

  useEffect(() => {
    if (!user || groups.length > 0) {
      setFallbackGroups([]);
      return;
    }

    let cancelled = false;
    let inFlight = false;
    let intervalId: number | undefined;

    const loadFallbackGroups = async () => {
      if (inFlight) return;
      inFlight = true;

      for (let attempt = 0; attempt < 3; attempt++) {
        const { data, error } = await supabase
          .from("groups")
          .select("id, name, type, emoji, invite_code, created_by, cover_image_url, shared_pages");

        if (!error && data) {
          if (!cancelled) {
            setFallbackGroups(
              data.map((g: any) => ({
                id: g.id,
                name: g.name,
                type: g.type,
                emoji: g.emoji,
                invite_code: g.invite_code,
                created_by: g.created_by,
                cover_image_url: g.cover_image_url || null,
                category: (g.category === "interest" ? "interest" : "home") as "home" | "interest",
                shared_pages: g.shared_pages || ["calendar","workout","nutrition","habits","sobriety","shopping"],
                members: [],
              }))
            );
          }
          inFlight = false;
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
      }

      inFlight = false;
    };

    void loadFallbackGroups();
    intervalId = window.setInterval(() => {
      void loadFallbackGroups();
    }, 10000);

    return () => {
      cancelled = true;
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [user, groups.length]);

  // Fetch recent activity from all groups
  useEffect(() => {
    if (!user || visibleGroups.length === 0) { setActivityPosts([]); setLoadingActivity(false); return; }
    const groupIds = visibleGroups.map(g => g.id);
    const fetchActivity = async () => {
      const { data: postsData } = await supabase
        .from("group_feed_posts")
        .select("*")
        .in("group_id", groupIds)
        .order("created_at", { ascending: false })
        .limit(30);
      if (!postsData || postsData.length === 0) { setActivityPosts([]); setLoadingActivity(false); return; }
      const userIds = [...new Set(postsData.map((p: any) => p.user_id))];
      const { data: profiles } = await supabase.rpc("get_profiles_by_ids", { _user_ids: userIds });
      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));
      const groupMap = new Map(visibleGroups.map(g => [g.id, g]));
      const enriched = postsData.map((p: any) => {
        const prof = profileMap.get(p.user_id);
        const grp = groupMap.get(p.group_id);
        return { ...p, user_display_name: prof?.display_name || "Member", user_avatar_url: prof?.avatar_url, group_name: grp?.name || "Group" };
      });
      setActivityPosts(enriched);
      setLoadingActivity(false);
    };
    fetchActivity();
  }, [user, visibleGroups]);

  const handleCoverUpload = async (groupId: string, file: File) => {
    setUploadingGroupId(groupId);
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const filePath = `${groupId}/cover.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("group-covers")
        .upload(filePath, file, { upsert: true, cacheControl: "60" });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("group-covers")
        .getPublicUrl(filePath);

      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      const { data: updatedGroup, error: updateError } = await supabase
        .from("groups")
        .update({ cover_image_url: publicUrl })
        .eq("id", groupId)
        .select("id")
        .maybeSingle();

      if (updateError) throw updateError;
      if (!updatedGroup) throw new Error("You do not have permission to update this group image.");

      setLocalCoverMap((prev) => ({ ...prev, [groupId]: publicUrl }));
      await refreshGroups();

      toast({
        title: "Photo updated",
        description: "Your launcher card image was uploaded successfully.",
      });
    } catch (err: any) {
      console.error("Error uploading cover image:", err);
      toast({
        title: "Upload failed",
        description: err?.message || "Could not upload the image. Please try again.",
        variant: "destructive",
      });
    } finally {
      setUploadingGroupId(null);
      pendingGroupIdRef.current = null;
    }
  };

  const triggerFileInput = (groupId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    pendingGroupIdRef.current = groupId;
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const groupId = pendingGroupIdRef.current;

    if (file && groupId) {
      void handleCoverUpload(groupId, file);
    } else {
      setUploadingGroupId(null);
      pendingGroupIdRef.current = null;
    }

    e.target.value = "";
  };

  const checkInviteCode = async (code: string) => {
    setInviteState({ type: "checking" });
    try {
      const { data: group } = await supabase
        .from("groups")
        .select("id, name, invite_code")
        .eq("invite_code", code.toUpperCase())
        .maybeSingle();

      if (!group) {
        setInviteState({ type: "invalid" });
        return;
      }

      const alreadyMember = visibleGroups.some((g) => g.id === group.id);
      if (alreadyMember) {
        setInviteState({ type: "already_member", groupName: group.name });
        return;
      }

      setInviteState({ type: "found", groupName: group.name, code: code.toUpperCase() });
    } catch {
      setInviteState({ type: "invalid" });
    }
  };

  const handleJoinGroup = async () => {
    if (inviteState.type !== "found") return;
    const { code } = inviteState;
    setInviteState({ type: "joining" });

    const result = await joinGroup(code);
    if (result.error) {
      setInviteState({ type: "invalid" });
      return;
    }

    await refreshGroups();

    const { data: group } = await supabase
      .from("groups")
      .select("id, name")
      .eq("invite_code", code)
      .maybeSingle();

    setInviteState({ type: "joined", groupName: result.group_name || group?.name || "Group", groupId: group?.id || "" });
  };

  const dismissInvite = () => {
    setInviteState({ type: "idle" });
  };

  return (
    <div className="px-5 flex flex-col min-h-[calc(100svh-1rem)]">
      {/* Hidden file input for cover uploads */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Header */}
      <header className="pt-14 pb-2 flex items-start justify-between gap-3">
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-[2rem] font-bold tracking-tight leading-tight"
        >
          {greeting},{" "}
          <span className="bg-gradient-to-r from-primary to-[hsl(var(--accent))] bg-clip-text text-transparent">
            {profile?.display_name || "there"}
          </span>
        </motion.h1>
        {onOpenSettings && (
          <button
            onClick={onOpenSettings}
            aria-label="Open settings"
            className="w-10 h-10 rounded-full border border-border bg-card text-muted-foreground hover:text-foreground hover:border-primary/30 flex items-center justify-center transition-all shadow-sm"
          >
            <Settings size={17} />
          </button>
        )}
      </header>

      {/* Featured Banner / Discover Card */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mt-6"
      >
        <div className="relative overflow-hidden rounded-2xl bg-card border border-border p-5 pb-4">
          {/* Abstract decorative lines */}
          <svg
            className="absolute top-0 right-0 w-48 h-32 opacity-[0.12]"
            viewBox="0 0 200 130"
            fill="none"
          >
            <circle cx="160" cy="30" r="4" fill="hsl(var(--primary))" />
            <circle cx="140" cy="60" r="6" fill="hsl(var(--primary))" />
            <circle cx="180" cy="70" r="3" fill="hsl(var(--muted-foreground))" />
            <circle cx="120" cy="40" r="5" fill="hsl(var(--muted-foreground))" />
            <circle cx="100" cy="80" r="3.5" fill="hsl(var(--primary))" />
            <circle cx="170" cy="100" r="4" fill="hsl(var(--muted-foreground))" />
            <circle cx="130" cy="90" r="2.5" fill="hsl(var(--primary))" />
            <line x1="160" y1="30" x2="140" y2="60" stroke="hsl(var(--border))" strokeWidth="1" />
            <line x1="140" y1="60" x2="120" y2="40" stroke="hsl(var(--border))" strokeWidth="1" />
            <line x1="140" y1="60" x2="180" y2="70" stroke="hsl(var(--border))" strokeWidth="1" />
            <line x1="120" y1="40" x2="100" y2="80" stroke="hsl(var(--border))" strokeWidth="1" />
            <line x1="180" y1="70" x2="170" y2="100" stroke="hsl(var(--border))" strokeWidth="1" />
            <line x1="100" y1="80" x2="130" y2="90" stroke="hsl(var(--border))" strokeWidth="1" />
            <line x1="130" y1="90" x2="170" y2="100" stroke="hsl(var(--border))" strokeWidth="1" />
          </svg>

          <p className="text-sm font-semibold uppercase tracking-wider text-foreground mb-2 relative z-10">
            Explore Curated Connections
          </p>
          <p className="text-xs text-muted-foreground mb-4 max-w-[70%] relative z-10">
            Connect with your networks in new ways.
          </p>
          <button className="relative z-10 px-4 py-2 rounded-xl bg-secondary text-foreground text-xs font-semibold hover:bg-secondary/80 transition-all border border-border">
            Discover
          </button>
        </div>
      </motion.div>

      {/* Invite Code Banners */}
      <AnimatePresence mode="wait">
        {inviteState.type !== "idle" && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mt-3"
          >
            {inviteState.type === "checking" && (
              <div className="flex items-center gap-3 p-4 rounded-2xl bg-secondary border border-border">
                <Loader2 size={18} className="text-primary animate-spin flex-shrink-0" />
                <p className="text-sm text-muted-foreground">Checking invite code…</p>
              </div>
            )}

            {inviteState.type === "found" && (
              <div className="p-4 rounded-2xl bg-primary/5 border border-primary/20">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Users size={18} className="text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">Join "{inviteState.groupName}"?</p>
                    <p className="text-xs text-muted-foreground mt-0.5">This invite code matches a group.</p>
                  </div>
                  <button onClick={dismissInvite} className="text-muted-foreground hover:text-foreground p-1"><X size={14} /></button>
                </div>
                <div className="flex gap-2 mt-3 ml-[52px]">
                  <button onClick={handleJoinGroup} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-all active:scale-[0.97]">Join Group</button>
                  <button onClick={dismissInvite} className="px-4 py-2 rounded-xl bg-secondary text-foreground text-sm font-medium hover:bg-secondary/80 transition-all">Cancel</button>
                </div>
              </div>
            )}

            {inviteState.type === "joining" && (
              <div className="flex items-center gap-3 p-4 rounded-2xl bg-secondary border border-border">
                <Loader2 size={18} className="text-primary animate-spin flex-shrink-0" />
                <p className="text-sm text-muted-foreground">Joining group…</p>
              </div>
            )}

            {inviteState.type === "joined" && (
              <div className="p-4 rounded-2xl bg-primary/5 border border-primary/20">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0"><Check size={18} className="text-primary" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">You've joined "{inviteState.groupName}"!</p>
                    <p className="text-xs text-muted-foreground mt-0.5">It's now in your groups below.</p>
                  </div>
                </div>
                <div className="mt-3 ml-[52px]">
                  <button onClick={() => { if (inviteState.type === "joined" && inviteState.groupId) onEnterGroup(inviteState.groupId); dismissInvite(); }} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-all active:scale-[0.97]">Open Group</button>
                </div>
              </div>
            )}

            {inviteState.type === "already_member" && (
              <div className="p-4 rounded-2xl bg-secondary border border-border">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center flex-shrink-0"><Users size={18} className="text-muted-foreground" /></div>
                  <div className="flex-1"><p className="text-sm font-semibold">Already a member</p><p className="text-xs text-muted-foreground mt-0.5">You're already in "{inviteState.groupName}".</p></div>
                  <button onClick={dismissInvite} className="text-muted-foreground hover:text-foreground p-1"><X size={14} /></button>
                </div>
              </div>
            )}

            {inviteState.type === "invalid" && (
              <div className="p-4 rounded-2xl bg-destructive/5 border border-destructive/20">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center flex-shrink-0"><X size={18} className="text-destructive" /></div>
                  <div className="flex-1"><p className="text-sm font-semibold">Invalid invite code</p><p className="text-xs text-muted-foreground mt-0.5">That code doesn't match any group.</p></div>
                  <button onClick={dismissInvite} className="text-muted-foreground hover:text-foreground p-1"><X size={14} /></button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 50/50 Split: My Groups + Recent Activity */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="mt-6 flex-1 flex flex-col pb-4"
      >
        {/* My Groups Section */}
        <div
          className="flex flex-col overflow-hidden transition-all duration-300"
          style={{
            flex: groupsExpanded ? "3 1 0%" : activityExpanded ? "1 1 0%" : "1 1 0%",
            minHeight: 0,
          }}
        >
          <div className="flex items-center justify-between mb-3 flex-shrink-0">
            <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">My Groups</p>
            <div className="flex items-center gap-2">
              {onCreateGroup && (
                <button onClick={onCreateGroup} className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors">
                  <Plus size={12} />Add Group
                </button>
              )}
              <button
                onClick={() => { setGroupsExpanded(!groupsExpanded); setActivityExpanded(false); }}
                className="w-6 h-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-all"
              >
                {groupsExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            </div>
          </div>

          <div
            ref={listRef}
            className="overflow-y-auto flex-1 scrollbar-none"
            onPointerMove={handleCardPointerMove}
            onPointerLeave={() => clearLP()}
            onPointerCancel={() => { clearLP(); setDragIdx(null); setDragOverIdx(null); }}
          >
            {editMode && (
              <div className="flex justify-center mb-1">
                <button onClick={() => setEditMode(false)} className="text-[10px] font-semibold text-primary px-3 py-0.5 rounded-full bg-primary/10">Done</button>
              </div>
            )}
            {/* Sticky stack container */}
            <div className="relative" style={{ paddingBottom: visualCalendarGroups.length > 1 ? 0 : undefined }}>
              {visualCalendarGroups.map((group, index) => {
                const activeMembers = group.members.filter((m) => m.status === 'active' && m.user_id !== profile?.id);
                const pendingMembers = group.members.filter((m) => m.status === 'pending_invited');
                const gradient = CARD_GRADIENTS[index % CARD_GRADIENTS.length];
                const currentCoverUrl = localCoverMap[group.id] || group.cover_image_url || null;
                const hasCover = !!currentCoverUrl;
                const isUploading = uploadingGroupId === group.id;
                const isDragging = editMode && dragIdx !== null && orderedVisibleGroups[dragIdx]?.id === group.id;
                const isAdmin = group.created_by === user?.id;
                const validPages = (group.shared_pages || []).filter((p: string) => (SHAREABLE_PAGES as readonly string[]).includes(p as ShareablePage)) as ShareablePage[];
                const CARD_HEIGHT = 76;
                const PEEK_OFFSET = 52;
                const shadowOpacity = Math.max(0.10 - index * 0.02, 0.02);

                return (
                  <div
                    key={group.id}
                    ref={(el) => { cardRefs.current[index] = el; }}
                    className="sticky select-none touch-none"
                    style={{
                      top: index * PEEK_OFFSET,
                      zIndex: visualCalendarGroups.length - index,
                      marginBottom: index < visualCalendarGroups.length - 1 ? PEEK_OFFSET - CARD_HEIGHT : 0,
                    }}
                  >
                    <div
                      onPointerDown={(e) => { e.preventDefault(); handleCardPointerDown(index); }}
                      onPointerUp={() => handleCardPointerUp(group)}
                      className={`relative overflow-hidden bg-card flex ${editMode ? "animate-nav-wiggle" : ""} ${isDragging ? "opacity-60 scale-[1.02]" : ""}`}
                      style={{
                        height: CARD_HEIGHT,
                        borderRadius: 14,
                        border: "0.5px solid rgba(0,0,0,0.07)",
                        boxShadow: `0 4px 12px rgba(0,0,0,${shadowOpacity})`,
                        ...(editMode ? { animationDelay: `${index * 0.05}s` } : {}),
                      }}
                    >
                      {/* Left side — info */}
                      <div className="flex-1 min-w-0 p-3 flex flex-col justify-center">
                        <div className="flex items-center gap-1.5">
                          <p className="text-[13px] font-medium truncate text-foreground leading-tight">{group.name}</p>
                          {/* Member avatar dots inline */}
                          {activeMembers.length > 0 && (
                            <div className="flex items-center -space-x-1 flex-shrink-0">
                              {activeMembers.slice(0, 3).map((m, mIdx) => {
                                const colors = ["bg-[hsl(260,45%,60%)]", "bg-[hsl(340,50%,65%)]", "bg-[hsl(160,40%,55%)]", "bg-[hsl(30,55%,60%)]"];
                                return (
                                  <div
                                    key={m.user_id}
                                    className={`w-[18px] h-[18px] rounded-full ${colors[mIdx % colors.length]} flex items-center justify-center text-[8px] font-bold text-white border border-card`}
                                    title={m.display_name || "Member"}
                                  >
                                    {(m.display_name || "M")[0].toUpperCase()}
                                  </div>
                                );
                              })}
                              {activeMembers.length > 3 && (
                                <div className="w-[18px] h-[18px] rounded-full bg-secondary flex items-center justify-center text-[7px] font-semibold text-muted-foreground border border-card">
                                  +{activeMembers.length - 3}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        {/* Interest pills */}
                        {validPages.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {validPages.slice(0, 4).map((page) => (
                              <span key={page} className="text-[9px] font-medium text-primary bg-primary/8 px-1.5 py-0.5 rounded">
                                {PAGE_LABELS[page]}
                              </span>
                            ))}
                            {validPages.length > 4 && (
                              <span className="text-[9px] font-medium bg-secondary text-muted-foreground px-1.5 py-0.5 rounded">+{validPages.length - 4}</span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Right side — photo, 100px wide */}
                      <div className="relative flex-shrink-0" style={{ width: 100 }}>
                        {hasCover ? (
                          <>
                            <img src={currentCoverUrl!} alt="" className="w-full h-full object-cover" />
                            <div className="absolute inset-0" style={{ background: "linear-gradient(to right, rgba(255,255,255,0.15), transparent 30%)" }} />
                            {/* Chevron on photo */}
                            <div className="absolute inset-y-0 right-0 flex items-center pr-2">
                              <ChevronRight size={16} className="text-white/70" />
                            </div>
                          </>
                        ) : (
                          <div
                            className={`w-full h-full bg-gradient-to-br ${gradient} flex flex-col items-center justify-center gap-0.5`}
                            onClick={(e) => { if (isAdmin && !editMode) { e.stopPropagation(); triggerFileInput(group.id, e); } }}
                          >
                            {isUploading ? (
                              <Loader2 size={12} className="animate-spin text-muted-foreground/40" />
                            ) : (
                              <>
                                <Camera size={12} className="text-muted-foreground/35" />
                                <span className="text-[8px] text-muted-foreground/35 font-medium">Add photo</span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

            {/* Pending group invites */}
            {pendingGroupInvites.map((invite) => (
              <div key={invite.group_id} className="rounded-2xl border border-primary/20 bg-primary/5 p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-lg flex-shrink-0">{invite.group_emoji}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{invite.group_name}</p>
                    {invite.invited_by_name && <p className="text-xs text-muted-foreground mt-0.5">Invited by {invite.invited_by_name}</p>}
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {invite.shared_pages.filter((p) => SHAREABLE_PAGES.includes(p)).map((page) => (
                        <span key={page} className="text-[10px] font-medium bg-secondary text-muted-foreground px-1.5 py-0.5 rounded">{PAGE_ICONS[page]} {PAGE_LABELS[page]}</span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 ml-[52px]">
                  <button onClick={async () => { const r = await acceptGroupInvite(invite.group_id); if (r.error) toast({ title: "Error", description: r.error, variant: "destructive" }); else toast({ title: `Joined "${invite.group_name}"!` }); }} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-all active:scale-[0.97]">Accept</button>
                  <button onClick={async () => { const r = await declineGroupInvite(invite.group_id); if (r.error) toast({ title: "Error", description: r.error, variant: "destructive" }); }} className="px-4 py-2 rounded-xl bg-secondary text-foreground text-sm font-medium hover:bg-secondary/80 transition-all border border-border">Decline</button>
                </div>
              </div>
            ))}

            {visualCalendarGroups.length === 0 && pendingGroupInvites.length === 0 && (
              <div className="text-center py-8">
                <Users size={28} className="mx-auto text-muted-foreground/40 mb-2" />
                <p className="text-sm font-medium text-muted-foreground mb-1">No groups yet</p>
                <p className="text-xs text-muted-foreground/70 mb-4 max-w-[220px] mx-auto">Create a group to start sharing calendars and pages.</p>
                {onCreateGroup && <button onClick={onCreateGroup} className="px-4 py-2.5 rounded-xl bg-secondary text-foreground text-sm font-semibold border border-border">Add Group</button>}
              </div>
            )}
          </div>
        </div>

        {/* Divider */}
        <div className="my-3 flex-shrink-0" style={{ height: "0.5px", background: "rgba(0,0,0,0.08)" }} />

        {/* Recent Activity Section */}
        <div
          className="flex flex-col overflow-hidden transition-all duration-300"
          style={{
            flex: activityExpanded ? "3 1 0%" : groupsExpanded ? "1 1 0%" : "1 1 0%",
            minHeight: 0,
          }}
        >
          <div className="flex items-center justify-between mb-3 flex-shrink-0">
            <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Recent Activity</p>
            <button
              onClick={() => { setActivityExpanded(!activityExpanded); setGroupsExpanded(false); }}
              className="w-6 h-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-all"
            >
              {activityExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 scrollbar-none">
            {loadingActivity ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={20} className="animate-spin text-muted-foreground" />
              </div>
            ) : activityPosts.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-xs text-muted-foreground">No recent activity from your groups</p>
              </div>
            ) : (
              activityPosts.map((post) => (
                <div key={post.id} className="space-y-1">
                  <p className="text-[10px] font-medium text-muted-foreground/60 px-1">{post.group_name}</p>
                  <GroupFeedPost
                    post={post}
                    onLike={() => {}}
                    memberColors={["bg-[hsl(260,45%,60%)]", "bg-[hsl(340,50%,65%)]", "bg-[hsl(160,40%,55%)]"]}
                    members={[]}
                  />
                </div>
              ))
            )}
          </div>
        </div>

        {/* My Friends section */}
        <div className="mt-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">My Friends</p>
            <button onClick={() => setAddFriendOpen(true)} className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors">
              <UserPlus size={12} />Add Friend
            </button>
          </div>

          {activeFriends.length > 0 && (
            <div className="space-y-1.5 mb-3">
              {activeFriends.map((f) => (
                <FriendRow key={f.id} friendship={f} currentUserId={user?.id || ""} onRemove={async (id) => { const r = await removeFriend(id); if (r.error) toast({ title: "Error", description: r.error, variant: "destructive" }); else toast({ title: "Friend removed" }); }} />
              ))}
            </div>
          )}

          {pendingReceived.length > 0 && (
            <div className="space-y-1.5 mb-3">
              {pendingReceived.map((f) => (
                <FriendRow key={f.id} friendship={f} currentUserId={user?.id || ""} onAccept={async (id) => { const r = await acceptFriendRequest(id); if (r.error) toast({ title: "Error", description: r.error, variant: "destructive" }); else toast({ title: "Friend added!" }); }} onDecline={async (id) => { const r = await declineFriendRequest(id); if (r.error) toast({ title: "Error", description: r.error, variant: "destructive" }); }} />
              ))}
            </div>
          )}

          {pendingSent.length > 0 && (
            <div className="space-y-1.5 mb-3">
              {pendingSent.map((f) => (
                <FriendRow key={f.id} friendship={f} currentUserId={user?.id || ""} onCancel={async (id) => { const r = await cancelFriendRequest(id); if (r.error) toast({ title: "Error", description: r.error, variant: "destructive" }); }} />
              ))}
            </div>
          )}

          {activeFriends.length === 0 && pendingSent.length === 0 && pendingReceived.length === 0 && (
            <div className="text-center py-8">
              <UserPlus size={28} className="mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm font-medium text-muted-foreground mb-1">No friends yet</p>
              <p className="text-xs text-muted-foreground/70 mb-4 max-w-[220px] mx-auto">Add friends to start connecting.</p>
              <button onClick={() => setAddFriendOpen(true)} className="px-4 py-2.5 rounded-xl bg-secondary text-foreground text-sm font-semibold border border-border">Add Friend</button>
            </div>
          )}
        </div>
      </motion.div>

      <AddFriendModal open={addFriendOpen} onOpenChange={setAddFriendOpen} onSendRequest={sendFriendRequest} searchUsers={searchUsers} />
    </div>
  );
};

export default LauncherPage;
