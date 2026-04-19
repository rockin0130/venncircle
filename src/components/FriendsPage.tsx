import { useMemo, useState } from "react";
import { ChevronLeft, UserPlus, Search, X } from "lucide-react";
import { useFriendships } from "@/hooks/useFriendships";
import { useAuth } from "@/context/AuthContext";
import { usePresence } from "@/hooks/usePresence";
import AddFriendModal from "@/components/AddFriendModal";

interface FriendsPageProps {
  onBack: () => void;
}

const USER_COLORS = [
  "#6C47FF", "#3B82F6", "#10B981", "#F97316", "#EC4899",
  "#8B5CF6", "#14B8A6", "#EF4444", "#F59E0B", "#6366F1",
];

function hashColor(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (hash << 5) - hash + str.charCodeAt(i);
  return USER_COLORS[Math.abs(hash) % USER_COLORS.length];
}

const FriendsPage = ({ onBack }: FriendsPageProps) => {
  const { activeFriends, pendingReceived, pendingSent, acceptFriendRequest, declineFriendRequest, cancelFriendRequest, removeFriend } = useFriendships();
  const { groups } = useAuth();
  const onlineIds = usePresence("global");
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [query, setQuery] = useState("");

  const friendGroupMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const f of activeFriends) {
      if (!f.friend) continue;
      const shared = groups
        .filter((g) => g.members?.some((m: { user_id: string }) => m.user_id === f.friend!.id))
        .map((g) => g.name);
      map[f.friend.id] = shared;
    }
    return map;
  }, [activeFriends, groups]);

  const filteredFriends = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return activeFriends;
    return activeFriends.filter((f) => (f.friend?.display_name || "").toLowerCase().includes(q));
  }, [activeFriends, query]);

  return (
    <div className="min-h-svh" style={{ background: "#F4F3F0" }}>
      {/* Header */}
      <header className="safe-area-top pt-3 pb-3 px-3 flex items-center gap-2 sticky top-0 z-10" style={{ background: "#F4F3F0" }}>
        <button
          onClick={onBack}
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.05)" }}
          aria-label="Back"
        >
          <ChevronLeft size={20} color="#1A1A1A" />
        </button>
        <h1 className="flex-1" style={{ fontSize: 22, fontWeight: 700, color: "#1A1A1A", fontFamily: "'DM Sans', sans-serif" }}>
          Friends
        </h1>
        <button
          onClick={() => setShowAddFriend(true)}
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: "#7C3AED" }}
          aria-label="Add friend"
        >
          <UserPlus size={18} color="#fff" />
        </button>
      </header>

      <div className="px-3 pb-28">
        {/* Search */}
        <div className="relative mb-4">
          <Search size={16} color="#999" className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search friends"
            className="w-full pl-9 pr-9 py-2.5 rounded-xl outline-none"
            style={{ background: "#fff", border: "0.5px solid rgba(0,0,0,0.07)", fontSize: 14, color: "#1A1A1A" }}
          />
          {query && (
            <button onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2" aria-label="Clear">
              <X size={16} color="#999" />
            </button>
          )}
        </div>

        {/* Pending received */}
        {pendingReceived.length > 0 && (
          <section className="mb-5">
            <p className="px-1 mb-2" style={{ fontSize: 12, fontWeight: 600, color: "#666", textTransform: "uppercase", letterSpacing: 0.5 }}>
              Friend requests
            </p>
            <div className="rounded-2xl overflow-hidden" style={{ background: "#fff", border: "0.5px solid rgba(0,0,0,0.07)" }}>
              {pendingReceived.map((f, idx) => {
                if (!f.friend) return null;
                const initial = f.friend.display_name?.charAt(0)?.toUpperCase() || "?";
                return (
                  <div key={f.id} className="flex items-center gap-3 px-4 py-3" style={{ borderTop: idx === 0 ? "none" : "0.5px solid rgba(0,0,0,0.06)" }}>
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold overflow-hidden shrink-0" style={{ background: hashColor(f.friend.id) }}>
                      {f.friend.avatar_url ? <img src={f.friend.avatar_url} alt="" className="w-full h-full object-cover" /> : initial}
                    </div>
                    <p className="flex-1 truncate" style={{ fontSize: 14, fontWeight: 500, color: "#1A1A1A" }}>{f.friend.display_name}</p>
                    <button
                      onClick={() => declineFriendRequest(f.id)}
                      className="px-3 py-1.5 rounded-full"
                      style={{ background: "rgba(0,0,0,0.05)", fontSize: 12, fontWeight: 600, color: "#666" }}
                    >
                      Decline
                    </button>
                    <button
                      onClick={() => acceptFriendRequest(f.id)}
                      className="px-3 py-1.5 rounded-full"
                      style={{ background: "#7C3AED", fontSize: 12, fontWeight: 600, color: "#fff" }}
                    >
                      Accept
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Active friends */}
        <section className="mb-5">
          <p className="px-1 mb-2" style={{ fontSize: 12, fontWeight: 600, color: "#666", textTransform: "uppercase", letterSpacing: 0.5 }}>
            {activeFriends.length} {activeFriends.length === 1 ? "Friend" : "Friends"}
          </p>
          {filteredFriends.length === 0 ? (
            <div className="rounded-2xl px-4 py-10 text-center" style={{ background: "#fff", border: "0.5px solid rgba(0,0,0,0.07)" }}>
              <p style={{ fontSize: 14, color: "#999" }}>
                {query ? "No friends match your search" : "No friends yet"}
              </p>
              {!query && (
                <button
                  onClick={() => setShowAddFriend(true)}
                  className="mt-3 px-4 py-2 rounded-full"
                  style={{ background: "#7C3AED", fontSize: 13, fontWeight: 600, color: "#fff" }}
                >
                  + Add a friend
                </button>
              )}
            </div>
          ) : (
            <div className="rounded-2xl overflow-hidden" style={{ background: "#fff", border: "0.5px solid rgba(0,0,0,0.07)" }}>
              {filteredFriends.map((f, idx) => {
                if (!f.friend) return null;
                const initial = f.friend.display_name?.charAt(0)?.toUpperCase() || "?";
                const isOnline = onlineIds.has(f.friend.id);
                const sharedGroups = friendGroupMap[f.friend.id] || [];
                return (
                  <div key={f.id} className="flex items-center gap-3 px-4 py-3" style={{ borderTop: idx === 0 ? "none" : "0.5px solid rgba(0,0,0,0.06)" }}>
                    <div className="relative shrink-0">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold overflow-hidden" style={{ background: hashColor(f.friend.id) }}>
                        {f.friend.avatar_url ? <img src={f.friend.avatar_url} alt="" className="w-full h-full object-cover" /> : initial}
                      </div>
                      {isOnline && (
                        <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-[hsl(142,70%,45%)]" style={{ border: "2px solid #fff" }} />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate" style={{ fontSize: 14, fontWeight: 500, color: "#1A1A1A" }}>{f.friend.display_name}</p>
                      {sharedGroups.length > 0 && (
                        <p className="truncate" style={{ fontSize: 12, color: "#999" }}>{sharedGroups.join(", ")}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Pending sent */}
        {pendingSent.length > 0 && (
          <section>
            <p className="px-1 mb-2" style={{ fontSize: 12, fontWeight: 600, color: "#666", textTransform: "uppercase", letterSpacing: 0.5 }}>
              Pending invites
            </p>
            <div className="rounded-2xl overflow-hidden" style={{ background: "#fff", border: "0.5px solid rgba(0,0,0,0.07)" }}>
              {pendingSent.map((f, idx) => {
                if (!f.friend) return null;
                const initial = f.friend.display_name?.charAt(0)?.toUpperCase() || "?";
                return (
                  <div key={f.id} className="flex items-center gap-3 px-4 py-3" style={{ borderTop: idx === 0 ? "none" : "0.5px solid rgba(0,0,0,0.06)" }}>
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold overflow-hidden shrink-0" style={{ background: hashColor(f.friend.id) }}>
                      {f.friend.avatar_url ? <img src={f.friend.avatar_url} alt="" className="w-full h-full object-cover" /> : initial}
                    </div>
                    <p className="flex-1 truncate" style={{ fontSize: 14, fontWeight: 500, color: "#1A1A1A" }}>{f.friend.display_name}</p>
                    <button
                      onClick={() => cancelFriendRequest(f.id)}
                      className="px-3 py-1.5 rounded-full"
                      style={{ background: "rgba(0,0,0,0.05)", fontSize: 12, fontWeight: 600, color: "#666" }}
                    >
                      Cancel
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>

      <AddFriendModal open={showAddFriend} onOpenChange={setShowAddFriend} />
    </div>
  );
};

export default FriendsPage;
