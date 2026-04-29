import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { ArrowLeft, Settings, ChevronRight, Plus, Trash2, LogOut, Pencil, X, Check, Loader2, MoreHorizontal, Heart, MessageCircle, Share2, Image, Activity, Smile, Camera, UserPlus, ShieldCheck, ShieldOff, Trophy } from "lucide-react";
import { supabase as supabaseClient } from "@/integrations/supabase/client";
import GroupChallengePage from "@/components/GroupChallengePage";
import ChallengeDetailModal from "@/components/ChallengeDetailModal";
import { useAuth, Group, ShareablePage, SHAREABLE_PAGES, PAGE_LABELS, PAGE_ICONS } from "@/context/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { pickFromGallery } from "@/integrations/camera";
import { Capacitor } from "@capacitor/core";
import GroupFeedCompose from "@/components/GroupFeedCompose";
import GroupFeedPost from "@/components/GroupFeedPost";
import LeaveGroupFlow from "@/components/LeaveGroupFlow";
import { useFriendships } from "@/hooks/useFriendships";
import { usePresence } from "@/hooks/usePresence";
import StoryViewer from "@/components/StoryViewer";
import { cn } from "@/lib/utils";

interface GroupHubPageProps {
  group: Group;
  onBack: () => void;
  onNavigateToFeature: (tab: string, groupId: string) => void;
}

const INTEREST_ICON_COLORS: Record<string, string> = {
  workout: "bg-[hsl(10,70%,95%)]",
  nutrition: "bg-[hsl(90,40%,92%)]",
  sobriety: "bg-[hsl(260,50%,95%)]",
  habits: "bg-[hsl(35,70%,93%)]",
  calendar: "bg-[hsl(220,15%,93%)]",
  shopping: "bg-[hsl(170,50%,93%)]",
  study: "bg-[hsl(200,50%,93%)]",
};

const MEMBER_COLORS = [
  "bg-[hsl(260,45%,60%)]",
  "bg-[hsl(340,50%,65%)]",
  "bg-[hsl(160,40%,55%)]",
  "bg-[hsl(35,55%,60%)]",
  "bg-[hsl(210,55%,60%)]",
  "bg-[hsl(190,45%,55%)]",
];

const COVER_GRADIENTS = [
  "from-[hsl(210,30%,88%)] to-[hsl(220,25%,82%)]",
  "from-[hsl(260,25%,88%)] to-[hsl(270,20%,82%)]",
  "from-[hsl(35,30%,88%)] to-[hsl(25,25%,82%)]",
  "from-[hsl(170,25%,87%)] to-[hsl(180,20%,82%)]",
  "from-[hsl(340,25%,88%)] to-[hsl(350,20%,82%)]",
];

interface FeedPost {
  id: string;
  user_id: string;
  content: string;
  post_type: string;
  interest_tag: string | null;
  photos: string[];
  stats: any;
  likes_count: number;
  comments_count: number;
  created_at: string;
  user_display_name?: string;
  user_avatar_url?: string | null;
  liked_by_me?: boolean;
}

const GroupHubPage = ({ group, onBack, onNavigateToFeature }: GroupHubPageProps) => {
  const { user, leaveGroup, updateGroupSharedPages, inviteToGroup, refreshGroups, groups } = useAuth();
  const { friendships, activeFriends } = useFriendships();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addInterestOpen, setAddInterestOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(group.name);
  const [savingName, setSavingName] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [memberSheetOpen, setMemberSheetOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<any>(null);
  const [leaveFlowOpen, setLeaveFlowOpen] = useState(false);
  const [memberMenuOpen, setMemberMenuOpen] = useState<string | null>(null);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [localCoverUrl, setLocalCoverUrl] = useState<string | null>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [showChallengePage, setShowChallengePage] = useState(false);
  const [activeChallenge, setActiveChallenge] = useState<any>(null);
  const [challengeDetailOpen, setChallengeDetailOpen] = useState(false);
  const [storyViewer, setStoryViewer] = useState<{ userId: string; name: string } | null>(null);
  const [memberIdsWithStories, setMemberIdsWithStories] = useState<Set<string>>(() => new Set());

  const currentGroup = groups.find((g) => g.id === group.id) || group;
  const currentActiveMembers = currentGroup.members.filter((m) => m.status === "active");
  const onlineUserIds = usePresence(`group:${currentGroup.id}`);
  const myMember = currentActiveMembers.find((m) => m.user_id === user?.id);
  const isAdmin = myMember?.role === "admin";
  const isOwner = user?.id === group.created_by;
  const currentEnabledPages = (currentGroup.shared_pages || []).filter((p) => (SHAREABLE_PAGES as readonly string[]).includes(p)) as ShareablePage[];
  const coverUrl = localCoverUrl || currentGroup.cover_image_url || null;
  const coverGradientIdx = currentGroup.name.charCodeAt(0) % COVER_GRADIENTS.length;

  const availableInterests = useMemo(
    () => SHAREABLE_PAGES.filter((p) => !currentEnabledPages.includes(p)),
    [currentEnabledPages]
  );

  // Fetch posts
  const fetchPosts = async () => {
    const { data: postsData, error } = await supabase
      .from("group_feed_posts")
      .select("*")
      .eq("group_id", currentGroup.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) { console.error("Error fetching posts:", error); return; }
    if (!postsData || postsData.length === 0) { setPosts([]); setLoadingPosts(false); return; }

    const userIds = [...new Set(postsData.map((p: any) => p.user_id))];
    const { data: profiles } = await supabase.rpc("get_profiles_by_ids", { _user_ids: userIds });

    const postIds = postsData.map((p: any) => p.id);
    const { data: myLikes } = await supabase
      .from("group_feed_likes")
      .select("post_id")
      .eq("user_id", user?.id || "")
      .in("post_id", postIds);

    const likedPostIds = new Set((myLikes || []).map((l: any) => l.post_id));
    const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

    const enrichedPosts: FeedPost[] = postsData.map((p: any) => {
      const profile = profileMap.get(p.user_id);
      return { ...p, user_display_name: profile?.display_name || "Member", user_avatar_url: profile?.avatar_url, liked_by_me: likedPostIds.has(p.id) };
    });

    setPosts(enrichedPosts);
    setLoadingPosts(false);
  };

  const fetchActiveChallenge = async () => {
    const { data } = await supabase
      .from("group_challenges")
      .select("*")
      .eq("group_id", currentGroup.id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1);
    setActiveChallenge(data?.[0] || null);
  };

  useEffect(() => {
    fetchPosts();
    fetchActiveChallenge();
    void loadActiveStoryUserIds();
    const channel = supabase
      .channel(`feed-${currentGroup.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "group_feed_posts", filter: `group_id=eq.${currentGroup.id}` }, () => { fetchPosts(); })
      .subscribe();
    const storiesChannel = supabase
      .channel(`stories-feed-${currentGroup.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "stories", filter: `group_id=eq.${currentGroup.id}` },
        () => { void loadActiveStoryUserIds(); }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(storiesChannel);
    };
  }, [currentGroup.id, loadActiveStoryUserIds]);

  const handleNavigate = (page: ShareablePage) => { onNavigateToFeature(page, currentGroup.id); };

  const handleAddInterest = async (page: ShareablePage) => {
    const newPages = [...currentEnabledPages, page];
    const result = await updateGroupSharedPages(currentGroup.id, newPages);
    if (result.error) toast.error(result.error);
    else { toast.success(`${PAGE_LABELS[page]} added`); await refreshGroups(); }
    setAddInterestOpen(false);
  };

  const handleRemoveInterest = async (page: ShareablePage) => {
    if (currentEnabledPages.length <= 1) { toast.error("Group must have at least one interest"); return; }
    const newPages = currentEnabledPages.filter((p) => p !== page);
    const result = await updateGroupSharedPages(currentGroup.id, newPages);
    if (result.error) toast.error(result.error);
    else { toast.success(`${PAGE_LABELS[page]} removed`); await refreshGroups(); }
  };

  const handleSaveName = async () => {
    if (!nameInput.trim() || nameInput.trim() === currentGroup.name) { setEditingName(false); return; }
    setSavingName(true);
    const { error } = await supabase.from("groups").update({ name: nameInput.trim() }).eq("id", currentGroup.id);
    if (error) toast.error("Failed to rename group");
    else { toast.success("Group renamed"); await refreshGroups(); }
    setSavingName(false);
    setEditingName(false);
  };

  const handleSetRole = async (targetUserId: string, newRole: string) => {
    const { data, error } = await supabase.rpc("set_member_role" as any, {
      _group_id: currentGroup.id,
      _target_user_id: targetUserId,
      _new_role: newRole,
    });
    if (error) { toast.error(error.message); return; }
    const result = data as any;
    if (result?.error) { toast.error(result.error); return; }
    toast.success(newRole === "admin" ? "Promoted to admin" : "Removed admin role");
    setMemberMenuOpen(null);
    await refreshGroups();
  };

  const handleAddMember = async (friendUserId: string) => {
    const result = await inviteToGroup(currentGroup.id, friendUserId);
    if (result.error) toast.error(result.error);
    else { toast.success("Invite sent!"); setAddMemberOpen(false); await refreshGroups(); }
  };

  const handleLeaveFlowDone = async () => {
    setLeaveFlowOpen(false);
    setSettingsOpen(false);
    await refreshGroups();
    onBack();
  };

  const handleLike = async (postId: string, currentlyLiked: boolean) => {
    if (currentlyLiked) {
      await supabase.from("group_feed_likes").delete().eq("post_id", postId).eq("user_id", user?.id || "");
      await supabase.from("group_feed_posts").update({ likes_count: Math.max(0, (posts.find(p => p.id === postId)?.likes_count || 1) - 1) }).eq("id", postId);
    } else {
      await supabase.from("group_feed_likes").insert({ post_id: postId, user_id: user?.id || "" });
      await supabase.from("group_feed_posts").update({ likes_count: (posts.find(p => p.id === postId)?.likes_count || 0) + 1 }).eq("id", postId);
    }
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, liked_by_me: !currentlyLiked, likes_count: currentlyLiked ? Math.max(0, p.likes_count - 1) : p.likes_count + 1 } : p));
  };

  const handleMemberTap = (member: any) => { setSelectedMember(member); setMemberSheetOpen(true); };

  const loadActiveStoryUserIds = useCallback(async () => {
    const { data } = await supabase
      .from("stories")
      .select("user_id")
      .eq("group_id", currentGroup.id)
      .gt("expires_at", new Date().toISOString());
    setMemberIdsWithStories(new Set((data || []).map((r: { user_id: string }) => r.user_id)));
  }, [currentGroup.id]);

  const handleCoverUpload = async (file: File) => {
    setUploadingCover(true);
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const filePath = `${currentGroup.id}/cover.${ext}`;
      const { error: uploadError } = await supabase.storage.from("group-covers").upload(filePath, file, { upsert: true, cacheControl: "60" });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("group-covers").getPublicUrl(filePath);
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;
      const { error: updateError } = await supabase.from("groups").update({ cover_image_url: publicUrl }).eq("id", currentGroup.id);
      if (updateError) throw updateError;
      setLocalCoverUrl(publicUrl);
      await refreshGroups();
      toast.success("Cover photo updated");
    } catch (err: any) {
      toast.error(err?.message || "Failed to upload cover photo");
    } finally {
      setUploadingCover(false);
    }
  };

  const handleCoverFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleCoverUpload(file);
    e.target.value = "";
  };

  const openCoverPicker = async () => {
    if (Capacitor.isNativePlatform()) {
      const file = await pickFromGallery();
      if (file) void handleCoverUpload(file);
      return;
    }
    coverInputRef.current?.click();
  };

  if (showChallengePage) {
    return (
      <GroupChallengePage
        groupId={currentGroup.id}
        groupName={currentGroup.name}
        enabledPages={currentEnabledPages}
        members={currentActiveMembers}
        userId={user?.id || ""}
        onBack={() => { setShowChallengePage(false); fetchActiveChallenge(); }}
      />
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Hidden file input for cover */}
      <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={handleCoverFileChange} />

      {/* Cover Photo */}
      <div className="relative w-full flex-shrink-0" style={{ height: 150 }}>
        {coverUrl ? (
          <>
            <img src={coverUrl} alt="" className="w-full h-full object-cover" />
            <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.1), rgba(0,0,0,0.45))" }} />
          </>
        ) : (
          <div
            className={`w-full h-full bg-gradient-to-br ${COVER_GRADIENTS[coverGradientIdx]} flex flex-col items-center justify-center gap-1 cursor-pointer`}
            onClick={() => {
              if (isOwner) void openCoverPicker();
            }}
          >
            <Camera size={18} className="text-muted-foreground/50" />
            <span className="text-[10px] text-muted-foreground/50 font-medium">Add cover photo</span>
          </div>
        )}

        {/* Floating back arrow — top left */}
        <button
          onClick={onBack}
          className="absolute top-10 left-3 w-7 h-7 rounded-full flex items-center justify-center z-10"
          style={{ background: "rgba(255,255,255,0.2)", backdropFilter: "blur(8px)" }}
        >
          <ArrowLeft size={15} className="text-white" />
        </button>

        {/* Edit cover pill — top right, admin only */}
        {isOwner && coverUrl && (
          <button
            onClick={() => void openCoverPicker()}
            className="absolute top-10 right-3 px-2.5 py-1 rounded-full text-[10px] font-medium text-white z-10 flex items-center gap-1"
            style={{ background: "rgba(255,255,255,0.2)", backdropFilter: "blur(8px)" }}
          >
            {uploadingCover ? <Loader2 size={10} className="animate-spin" /> : <Camera size={10} />}
            Edit cover
          </button>
        )}

        {/* Group name + member count — bottom left */}
        <div className="absolute bottom-2.5 left-3 z-10">
          <h1 className="text-[15px] font-bold text-white leading-tight drop-shadow-sm">{currentGroup.name}</h1>
          <p className="text-[11px] text-white/70 font-medium">
            {currentActiveMembers.length} member{currentActiveMembers.length !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Gear + More — bottom right */}
        <div className="absolute bottom-2.5 right-3 flex items-center gap-1.5 z-10">
          <button
            onClick={() => setSettingsOpen(true)}
            className="w-7 h-7 rounded-full flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.2)", backdropFilter: "blur(8px)" }}
          >
            <Settings size={13} className="text-white" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Member Story Rings */}
        <div className="px-4 py-3">
          <div className="flex gap-3 overflow-x-auto scrollbar-none pb-1">
            {currentActiveMembers.map((m, i) => {
              const isMe = m.user_id === user?.id;
              const name = isMe ? "Mine" : (m.display_name || "Member").split(" ")[0];
              const isOnline = isMe || onlineUserIds.has(m.user_id);
              const hasActiveStory = memberIdsWithStories.has(m.user_id);
              return (
                <button
                  key={m.user_id}
                  onClick={() => {
                    if (hasActiveStory) {
                      setStoryViewer({ userId: m.user_id, name: m.display_name || "Member" });
                    } else {
                      handleMemberTap(m);
                    }
                  }}
                  className="flex flex-col items-center gap-1 shrink-0"
                >
                  <div className="relative">
                    <div
                      className={cn(
                        "w-14 h-14 rounded-full p-[2px]",
                        hasActiveStory
                          ? "bg-gradient-to-tr from-orange-500 via-pink-500 to-violet-600"
                          : "border-2 border-muted-foreground/30"
                      )}
                    >
                      <div className={`w-full h-full rounded-full ${MEMBER_COLORS[i % MEMBER_COLORS.length]} flex items-center justify-center text-sm font-bold text-white`}>
                        {(m.display_name || "?")[0].toUpperCase()}
                      </div>
                    </div>
                    {isOnline && (
                      <div className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-[hsl(142,70%,45%)] border-2 border-background" />
                    )}
                  </div>
                  <span className="text-[11px] text-muted-foreground font-medium truncate max-w-[56px]">{name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Interest Strip */}
        <div className="px-4 pb-3">
          <div className="flex gap-3 overflow-x-auto scrollbar-none">
            {currentEnabledPages.map((page) => (
              <button key={page} onClick={() => handleNavigate(page)} className="flex flex-col items-center gap-1.5 shrink-0">
                <div className={`w-12 h-12 rounded-xl ${INTEREST_ICON_COLORS[page] || "bg-muted"} flex items-center justify-center text-lg`}>
                  {PAGE_ICONS[page] || "📋"}
                </div>
                <span className="text-[11px] text-muted-foreground font-medium">{PAGE_LABELS[page]}</span>
              </button>
            ))}
            {/* Challenge tile — always shown */}
            <button onClick={() => setShowChallengePage(true)} className="flex flex-col items-center gap-1.5 shrink-0">
              <div className="w-12 h-12 rounded-xl bg-[hsl(260,60%,95%)] flex items-center justify-center">
                <Trophy size={20} className="text-[#6C47FF]" />
              </div>
              <span className="text-[11px] text-muted-foreground font-medium">Challenge</span>
            </button>
          </div>
        </div>

        {/* Active Challenge Card */}
        {activeChallenge && (
          <div className="px-4 pb-3">
            <button
              onClick={() => setChallengeDetailOpen(true)}
              className="w-full text-left rounded-[14px] p-4"
              style={{ background: "#1a1a2e", border: "0.5px solid rgba(255,255,255,0.08)" }}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-[#6C47FF]/20 text-[#6C47FF]">Active challenge</span>
                <span className="text-[10px] text-white/50">{Math.max(0, Math.ceil((new Date(activeChallenge.ends_at).getTime() - Date.now()) / 86400000))} days left</span>
              </div>
              <p className="text-[15px] font-medium text-white mb-1">{activeChallenge.title}</p>
              {activeChallenge.partner_reward && (
                <p className="text-[11px] text-white/50 mb-3">🏆 Win: {activeChallenge.partner_reward}</p>
              )}
              {(() => {
                const totalDays = activeChallenge.duration_weeks * 7;
                const daysLeft = Math.max(0, Math.ceil((new Date(activeChallenge.ends_at).getTime() - Date.now()) / 86400000));
                const currentWeek = Math.min(activeChallenge.duration_weeks, Math.ceil((totalDays - daysLeft) / 7) || 1);
                return (
                  <>
                    <div className="flex items-center justify-between text-[10px] text-white/50 mb-1">
                      <span>Group progress</span>
                      <span>Week {currentWeek} of {activeChallenge.duration_weeks}</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-white/10 mb-2">
                      <div className="h-full rounded-full bg-[#6C47FF]" style={{ width: `${Math.round(((totalDays - daysLeft) / totalDays) * 100)}%` }} />
                    </div>
                  </>
                );
              })()}
              <div className="flex items-center justify-between">
                <div className="flex -space-x-1.5">
                  {currentActiveMembers.slice(0, 4).map((m) => (
                    <div key={m.user_id} className="w-5 h-5 rounded-full bg-white/20 border border-[#1a1a2e] flex items-center justify-center text-[8px] font-bold text-white">
                      {(m.display_name || "?")[0]}
                    </div>
                  ))}
                </div>
                <span className="text-[10px] text-white/40">Tap to see details</span>
              </div>
            </button>
          </div>
        )}

        {/* Divider line */}
        <div className="mx-4" style={{ height: "0.5px", background: "rgba(0,0,0,0.08)" }} />

        {/* Compose Box */}
        <div className="px-4 py-3">
          <GroupFeedCompose
            groupId={currentGroup.id}
            userId={user?.id || ""}
            userDisplayName={user?.id ? currentActiveMembers.find(m => m.user_id === user.id)?.display_name || "" : ""}
            onPostCreated={fetchPosts}
          />
        </div>

        {/* Feed */}
        <div className="px-4 pb-6 space-y-3">
          {loadingPosts ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-muted-foreground" />
            </div>
          ) : posts.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-muted-foreground">No posts yet. Share something with the group!</p>
            </div>
          ) : (
            posts.map((post) => (
              <GroupFeedPost
                key={post.id}
                post={post}
                onLike={() => handleLike(post.id, !!post.liked_by_me)}
                memberColors={MEMBER_COLORS}
                members={currentActiveMembers}
                currentUserId={user?.id}
              />
            ))
          )}
        </div>
      </div>

      {/* Member Activity Sheet */}
      <Sheet open={memberSheetOpen} onOpenChange={setMemberSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[60vh]">
          <SheetHeader>
            <SheetTitle>{selectedMember?.user_id === user?.id ? "My" : `${selectedMember?.display_name || "Member"}'s`} Recent Activity</SheetTitle>
          </SheetHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground text-center py-8">No recent activity to show</p>
          </div>
        </SheetContent>
      </Sheet>

      {/* Add Interest Dialog */}
      <Dialog open={addInterestOpen} onOpenChange={setAddInterestOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add Interest</DialogTitle></DialogHeader>
          <div className="space-y-2 py-2">
            {availableInterests.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">All interests are already enabled</p>
            ) : (
              availableInterests.map((page) => (
                <button key={page} onClick={() => handleAddInterest(page)} className="w-full flex items-center gap-3 p-3 rounded-xl bg-card border border-border hover:border-primary/20 transition-all">
                  <div className={`w-7 h-7 rounded-lg ${INTEREST_ICON_COLORS[page] || "bg-muted"} flex items-center justify-center text-sm`}>
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
          <DialogHeader><DialogTitle>Group Settings</DialogTitle></DialogHeader>
          <div className="space-y-5 py-2">
            {/* Group Name */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Name</label>
              {editingName ? (
                <div className="flex items-center gap-2 mt-1">
                  <input type="text" value={nameInput} onChange={(e) => setNameInput(e.target.value)} className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground" autoFocus />
                  <button onClick={handleSaveName} disabled={savingName} className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                    {savingName ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  </button>
                  <button onClick={() => { setEditingName(false); setNameInput(currentGroup.name); }} className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                    <X size={14} className="text-muted-foreground" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between mt-1">
                  <p className="text-sm font-medium text-foreground">{currentGroup.name}</p>
                  {isOwner && (
                    <button onClick={() => setEditingName(true)} className="text-muted-foreground hover:text-foreground"><Pencil size={14} /></button>
                  )}
                </div>
              )}
            </div>

            {/* Members */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Members ({currentActiveMembers.length})</label>
              <div className="space-y-2 mt-2">
                {currentActiveMembers.map((m) => {
                  const isMemberAdmin = m.role === "admin";
                  const isMe = m.user_id === user?.id;
                  const hasActiveStory = memberIdsWithStories.has(m.user_id);
                  return (
                    <div key={m.user_id} className="flex items-center gap-2 p-2 rounded-lg bg-secondary/30 relative">
                      <div
                        className={cn(
                          "rounded-full p-[2px] shrink-0",
                          hasActiveStory ? "bg-gradient-to-tr from-orange-500 via-pink-500 to-violet-600" : ""
                        )}
                      >
                        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                          {(m.display_name || "?")[0].toUpperCase()}
                        </div>
                      </div>
                      <span className="text-sm text-foreground flex-1">{m.display_name || "Member"}</span>
                      {isMemberAdmin && (
                        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">Admin</span>
                      )}
                      {isAdmin && !isMe && (
                        <div className="relative">
                          <button
                            onClick={() => setMemberMenuOpen(memberMenuOpen === m.user_id ? null : m.user_id)}
                            className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-muted transition-colors"
                          >
                            <MoreHorizontal size={14} className="text-muted-foreground" />
                          </button>
                          {memberMenuOpen === m.user_id && (
                            <div className="absolute right-0 top-7 z-50 bg-card border border-border rounded-xl shadow-lg py-1 min-w-[160px]">
                              {isMemberAdmin ? (
                                <button
                                  onClick={() => handleSetRole(m.user_id, "member")}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                                >
                                  <ShieldOff size={14} className="text-muted-foreground" />
                                  Remove admin role
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleSetRole(m.user_id, "admin")}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                                >
                                  <ShieldCheck size={14} className="text-muted-foreground" />
                                  Make admin
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {isAdmin && (
                  <button
                    onClick={() => setAddMemberOpen(true)}
                    className="w-full flex items-center gap-2 p-2 rounded-lg border border-dashed border-border text-sm text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
                  >
                    <UserPlus size={14} />
                    Add member
                  </button>
                )}
              </div>
            </div>

            {/* Invite Code */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Invite Code</label>
              <div className="flex items-center gap-2 mt-1">
                <code className="px-3 py-2 rounded-lg bg-secondary text-sm font-mono text-foreground flex-1">{currentGroup.invite_code}</code>
                <button onClick={() => { navigator.clipboard.writeText(currentGroup.invite_code); toast.success("Copied!"); }} className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold">Copy</button>
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
                      <button onClick={() => handleRemoveInterest(page)} className="text-muted-foreground hover:text-destructive transition-colors"><X size={14} /></button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Leave Group */}
            <div className="border-t border-border pt-4">
              <button
                onClick={() => setLeaveFlowOpen(true)}
                className="w-full flex items-center gap-2 p-3 rounded-xl hover:bg-destructive/5 transition-colors text-sm font-medium"
                style={{ color: "#E05C5C" }}
              >
                <LogOut size={16} />
                Leave Group
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Leave Group Flow */}
      {user && (
        <LeaveGroupFlow
          group={currentGroup}
          userId={user.id}
          open={leaveFlowOpen}
          onOpenChange={setLeaveFlowOpen}
          onLeft={handleLeaveFlowDone}
        />
      )}

      {/* Add Member Dialog */}
      <Dialog open={addMemberOpen} onOpenChange={setAddMemberOpen}>
        <DialogContent className="max-w-sm max-h-[70vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add Member</DialogTitle></DialogHeader>
          <div className="space-y-2 py-2">
            {activeFriends.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No friends to invite. Add friends first!</p>
            ) : (
              activeFriends
                .filter((f) => f.friend && !currentActiveMembers.some((m) => m.user_id === f.friend!.id))
                .map((f) => (
                  <button
                    key={f.friend!.id}
                    onClick={() => handleAddMember(f.friend!.id)}
                    className="w-full flex items-center gap-2.5 p-2.5 rounded-xl border border-border hover:border-primary/30 transition-all text-left"
                  >
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                      {(f.friend!.display_name || "?")[0].toUpperCase()}
                    </div>
                    <span className="text-sm font-medium text-foreground flex-1">{f.friend!.display_name}</span>
                    <Plus size={14} className="text-muted-foreground" />
                  </button>
                ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Challenge Detail Modal */}
      {activeChallenge && (
        <ChallengeDetailModal
          open={challengeDetailOpen}
          onOpenChange={setChallengeDetailOpen}
          challenge={activeChallenge}
          members={currentActiveMembers}
          userId={user?.id || ""}
        />
      )}

      {storyViewer && (
        <StoryViewer
          groupId={currentGroup.id}
          userId={storyViewer.userId}
          authorName={storyViewer.name}
          onClose={() => setStoryViewer(null)}
        />
      )}
    </div>
  );
};

export default GroupHubPage;
