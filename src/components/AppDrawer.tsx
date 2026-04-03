import { useState } from "react";
import { Home, CalendarDays, Sparkles, Heart, Dumbbell, Apple, Clock, ShoppingCart, MessageCircle, Settings, MoreHorizontal, Send, PanelLeft } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { Tab } from "@/components/BottomNav";
import type { NavStyle } from "@/hooks/useNavStyle";

interface AppDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeTab: string;
  onNavigate: (tab: Tab | "settings") => void;
  navStyle: NavStyle;
  onNavStyleChange: (style: NavStyle) => void;
  onAiSubmit?: (text: string) => void;
}

const DRAWER_ITEMS: { id: Tab | "settings"; label: string; icon: typeof Home }[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "specialdays", label: "Special Days", icon: Sparkles },
  { id: "nutrition", label: "Nutrition", icon: Apple },
  { id: "workout", label: "Workout", icon: Dumbbell },
  { id: "habits", label: "Habits", icon: Heart },
  { id: "sobriety", label: "Sobriety", icon: Clock },
  { id: "chat", label: "Chat", icon: MessageCircle },
  { id: "shopping", label: "Shopping List", icon: ShoppingCart },
  { id: "more", label: "More", icon: MoreHorizontal },
  { id: "settings", label: "Settings", icon: Settings },
];

const AppDrawer = ({ open, onOpenChange, activeTab, onNavigate, navStyle, onNavStyleChange, onAiSubmit }: AppDrawerProps) => {
  const [aiInput, setAiInput] = useState("");

  const handleNav = (id: Tab | "settings") => {
    onNavigate(id as any);
    onOpenChange(false);
  };

  const handleAiSend = () => {
    const text = aiInput.trim();
    if (!text) return;
    onAiSubmit?.(text);
    setAiInput("");
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-72 p-0 flex flex-col bg-card">
        <SheetHeader className="px-4 pt-6 pb-2">
          <SheetTitle className="text-lg font-bold text-foreground">Menu</SheetTitle>
        </SheetHeader>


        {/* Nav Items */}
        <nav className="flex-1 overflow-y-auto px-2 space-y-0.5">
          {DRAWER_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNav(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-foreground hover:bg-secondary/50"
                }`}
              >
                <Icon size={18} strokeWidth={active ? 2.2 : 1.6} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Nav Style Toggle */}
        <div className="border-t border-border px-4 py-4">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Navigation Style</p>
          <div className="flex gap-2">
            <button
              onClick={() => onNavStyleChange("bottom")}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition-colors ${
                navStyle === "bottom"
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "bg-secondary text-muted-foreground border border-transparent"
              }`}
            >
              <MoreHorizontal size={14} />
              Bottom
            </button>
            <button
              onClick={() => onNavStyleChange("drawer")}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition-colors ${
                navStyle === "drawer"
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "bg-secondary text-muted-foreground border border-transparent"
              }`}
            >
              <PanelLeft size={14} />
              Drawer
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default AppDrawer;
