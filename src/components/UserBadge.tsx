import { useAuth } from "@/context/AuthContext";

const UserBadge = ({ user }: { user: "me" | "partner" | "both" }) => {
  const { profile, partner } = useAuth();

  const myInitial = profile?.display_name?.charAt(0)?.toUpperCase() || "?";
  const partnerInitial = partner?.display_name?.charAt(0)?.toUpperCase() || "P";

  if (user === "both") {
    return (
      <div className="flex -space-x-2">
        <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-primary-foreground bg-user-a ring-2 ring-card">{myInitial}</div>
        <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-primary-foreground bg-user-b ring-2 ring-card">{partnerInitial}</div>
      </div>
    );
  }

  return (
    <div
      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-primary-foreground ${
        user === "me" ? "bg-user-a" : "bg-user-b"
      }`}
    >
      {user === "me" ? myInitial : partnerInitial}
    </div>
  );
};

export default UserBadge;
