import { Home, Compass, MessageCircle, User } from "lucide-react";
import VennIcon from "@/components/VennIcon";

export type Tab =
  | "home" | "shared-interests" | "ai" | "chat" | "profile"
  | "workout" | "habits" | "sobriety" | "nutrition"
  | "calendar" | "shopping" | "study" | "more" | "settings";

// Keep these exports for backward compat with MorePage etc.
export const ALL_PAGE_META: Record<string, { label: string; icon: typeof Home; desc: string }> = {
  calendar: { label: "Calendar", icon: Home, desc: "View and manage your schedule" },
  workout: { label: "Workout", icon: Home, desc: "Track workouts and exercise plans" },
  habits: { label: "Habits", icon: Home, desc: "Daily habit tracking and streaks" },
  nutrition: { label: "Nutrition", icon: Home, desc: "Track protein, meals & AI suggestions" },
  sobriety: { label: "Sobriety", icon: Home, desc: "Track sobriety milestones" },
  
  shopping: { label: "Shopping", icon: Home, desc: "Shopping lists from meal plans" },
  study: { label: "Study", icon: Home, desc: "Track study sessions and focus time" },
};

export const CUSTOMIZABLE_PAGE_IDS = Object.keys(ALL_PAGE_META) as Tab[];
export const FIXED_NAV_PAGES: Tab[] = ["calendar"];
export const MAX_NAV_SLOTS = 10;

export function loadNavPages(): Tab[] {
  return ["calendar"];
}
export function saveNavPages(_pages: Tab[]) {}

const NAV_ITEMS: { id: Tab; label: string; icon: typeof Home }[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "shared-interests", label: "Explore", icon: Compass },
  { id: "ai", label: "AI", icon: Sparkles },
  { id: "chat", label: "Chat", icon: MessageCircle },
  { id: "profile", label: "Profile", icon: User },
];

interface BottomNavProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  navPages?: Tab[];
  onReorder?: (newPages: Tab[]) => void;
}

const BottomNav = ({ activeTab, onTabChange }: BottomNavProps) => {
  const isActive = (id: Tab) => activeTab === id;

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-card border-t border-border z-50">
      <div className="flex items-center justify-around py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.id);

          if (item.id === "ai") {
            return (
              <button
                key={item.id}
                onClick={() => onTabChange("ai")}
                className="relative z-10 flex flex-col items-center gap-0.5 -mt-4 transition-all px-2 shrink-0"
              >
                <div className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all ${
                  active
                    ? "bg-gradient-to-br from-violet-500 to-indigo-600 scale-105"
                    : "bg-gradient-to-br from-violet-500/90 to-indigo-600/90 hover:scale-105"
                }`}>
                  <Sparkles size={24} className="text-white" />
                </div>
                <span className={`text-[9px] font-semibold mt-0.5 ${active ? "text-violet-500" : "text-muted-foreground"}`}>AI</span>
              </button>
            );
          }

          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`flex flex-col items-center gap-0.5 min-w-0 flex-1 py-1.5 rounded-lg transition-colors ${
                active ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <Icon size={20} strokeWidth={active ? 2.5 : 1.8} className="shrink-0" />
              <span className="text-[9px] font-medium truncate max-w-full">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
