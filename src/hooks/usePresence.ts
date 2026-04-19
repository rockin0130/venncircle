import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";

/**
 * Tracks online presence for a given channel key (e.g. group id, or "global").
 * Returns a Set of currently-online user ids.
 *
 * Uses Supabase Realtime Presence — each connected client tracks its own
 * user_id; we aggregate everyone's `presenceState` into a Set.
 */
export function usePresence(channelKey: string | null | undefined): Set<string> {
  const { user } = useAuth();
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user?.id || !channelKey) {
      setOnlineUserIds(new Set());
      return;
    }

    const channel = supabase.channel(`presence:${channelKey}`, {
      config: { presence: { key: user.id } },
    });

    const sync = () => {
      const state = channel.presenceState() as Record<string, Array<{ user_id?: string }>>;
      const ids = new Set<string>();
      for (const key of Object.keys(state)) {
        // The presence key IS the user id (we set it above).
        ids.add(key);
        // Also accept user_id from payload as a fallback.
        for (const meta of state[key] || []) {
          if (meta?.user_id) ids.add(meta.user_id);
        }
      }
      setOnlineUserIds(ids);
    };

    channel
      .on("presence", { event: "sync" }, sync)
      .on("presence", { event: "join" }, sync)
      .on("presence", { event: "leave" }, sync)
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ user_id: user.id, online_at: new Date().toISOString() });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, channelKey]);

  return onlineUserIds;
}
