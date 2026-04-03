import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";

export interface FriendProfile {
  id: string;
  display_name: string;
  avatar_url: string | null;
  invite_code: string | null;
  email: string | null;
}

export interface Friendship {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: "pending" | "accepted" | "declined";
  created_at: string;
  updated_at: string;
  friend: FriendProfile | null;
}

export function useFriendships() {
  const { user } = useAuth();
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFriendships = useCallback(async () => {
    if (!user) { setFriendships([]); setLoading(false); return; }

    const { data, error } = await supabase
      .from("friendships")
      .select("*")
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
      .in("status", ["pending", "accepted"]);

    if (error || !data) {
      console.error("Error fetching friendships:", error);
      setLoading(false);
      return;
    }

    // Resolve the OTHER user's ID for each friendship
    const friendIds = data.map((f: any) =>
      f.requester_id === user.id ? f.addressee_id : f.requester_id
    );
    const uniqueIds = [...new Set(friendIds)];

    // Use SECURITY DEFINER RPC to reliably fetch profiles (bypasses RLS)
    let profileMap: Record<string, FriendProfile> = {};
    if (uniqueIds.length > 0) {
      const { data: profiles, error: profileError } = await supabase
        .rpc("get_profiles_by_ids", { _user_ids: uniqueIds });

      if (profileError) {
        console.error("Error fetching friend profiles via RPC:", profileError);
      }

      if (profiles) {
        for (const p of profiles as any[]) {
          profileMap[p.id] = {
            id: p.id,
            display_name: p.display_name,
            avatar_url: p.avatar_url,
            invite_code: p.invite_code,
            email: p.email,
          };
        }
      }

      // Debug: log any still-missing profiles
      for (const fid of uniqueIds) {
        if (!profileMap[fid]) {
          console.warn(`Profile not found for user_id: ${fid} (friendship resolution failed)`);
        }
      }
    }

    const mapped: Friendship[] = data.map((f: any) => {
      const friendId = f.requester_id === user.id ? f.addressee_id : f.requester_id;
      return {
        ...f,
        friend: profileMap[friendId] || null,
      };
    });

    setFriendships(mapped);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchFriendships();
  }, [fetchFriendships]);

  useEffect(() => {
    if (!user) return;
    const channelName = `friendships-realtime-${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(channelName)
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, () => {
        fetchFriendships();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, fetchFriendships]);

  const sendFriendRequest = useCallback(async (addresseeId: string) => {
    if (!user) return { error: "Not authenticated" };
    const { data: existing } = await supabase
      .from("friendships")
      .select("id, status")
      .or(`and(requester_id.eq.${user.id},addressee_id.eq.${addresseeId}),and(requester_id.eq.${addresseeId},addressee_id.eq.${user.id})`);

    if (existing && existing.length > 0) {
      const f = existing[0] as any;
      if (f.status === "accepted") return { error: "Already friends" };
      if (f.status === "pending") return { error: "Request already pending" };
      if (f.status === "declined") {
        await supabase.from("friendships")
          .update({ status: "pending", requester_id: user.id, addressee_id: addresseeId, updated_at: new Date().toISOString() })
          .eq("id", f.id);
        await fetchFriendships();
        return { success: true };
      }
    }
    const { error } = await supabase.from("friendships")
      .insert({ requester_id: user.id, addressee_id: addresseeId, status: "pending" });
    if (error) return { error: error.message };
    await fetchFriendships();
    return { success: true };
  }, [user, fetchFriendships]);

  const acceptFriendRequest = useCallback(async (friendshipId: string) => {
    const { error } = await supabase.from("friendships")
      .update({ status: "accepted", updated_at: new Date().toISOString() })
      .eq("id", friendshipId);
    if (error) return { error: error.message };
    await fetchFriendships();
    return { success: true };
  }, [fetchFriendships]);

  const declineFriendRequest = useCallback(async (friendshipId: string) => {
    const { error } = await supabase.from("friendships").delete().eq("id", friendshipId);
    if (error) return { error: error.message };
    await fetchFriendships();
    return { success: true };
  }, [fetchFriendships]);

  const cancelFriendRequest = useCallback(async (friendshipId: string) => {
    const { error } = await supabase.from("friendships").delete().eq("id", friendshipId);
    if (error) return { error: error.message };
    await fetchFriendships();
    return { success: true };
  }, [fetchFriendships]);

  const removeFriend = useCallback(async (friendshipId: string) => {
    const { error } = await supabase.from("friendships").delete().eq("id", friendshipId);
    if (error) return { error: error.message };
    await fetchFriendships();
    return { success: true };
  }, [fetchFriendships]);

  const searchUsers = useCallback(async (identifier: string) => {
    const { data, error } = await supabase.rpc("search_users_by_identifier", { _identifier: identifier.trim() });
    if (error) return { error: error.message, results: [] };
    return { results: (data || []) as FriendProfile[] };
  }, []);

  const activeFriends = friendships
    .filter((f) => f.status === "accepted")
    .sort((a, b) => (a.friend?.display_name || "").localeCompare(b.friend?.display_name || ""));

  const pendingSent = friendships
    .filter((f) => f.status === "pending" && f.requester_id === user?.id)
    .sort((a, b) => (a.friend?.display_name || "").localeCompare(b.friend?.display_name || ""));

  const pendingReceived = friendships
    .filter((f) => f.status === "pending" && f.addressee_id === user?.id)
    .sort((a, b) => (a.friend?.display_name || "").localeCompare(b.friend?.display_name || ""));

  return {
    friendships, activeFriends, pendingSent, pendingReceived, loading,
    sendFriendRequest, acceptFriendRequest, declineFriendRequest,
    cancelFriendRequest, removeFriend, searchUsers, refresh: fetchFriendships,
  };
}
