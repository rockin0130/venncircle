import { Settings, PanelLeft, MoreHorizontal, Calendar, ChevronLeft } from "lucide-react";
import { ALL_PAGE_META, CUSTOMIZABLE_PAGE_IDS, FIXED_NAV_PAGES, type Tab } from "@/components/BottomNav";
import type { NavStyle } from "@/hooks/useNavStyle";
import type { WeekStart } from "@/hooks/useWeekStart";

interface MorePageProps {
  navPages: Tab[];
  onNavigate: (tab: Tab) => void;
  onAddToNav: (pageId: Tab) => void;
  onRemoveFromNav: (pageId: Tab) => void;
  onReplaceInNav: (oldPageId: Tab, newPageId: Tab) => void;
  onOpenSettings: () => void;
  navStyle?: NavStyle;
  onNavStyleChange?: (style: NavStyle) => void;
  weekStart?: WeekStart;
  onWeekStartChange?: (start: WeekStart) => void;
  onBack?: () => void;
}

const MorePage = ({ onNavigate, onOpenSettings, navStyle, onNavStyleChange, weekStart, onWeekStartChange, onBack }: MorePageProps) => {
  const showBackButton = navStyle === "drawer" && onBack;

  return (
    <div className="flex flex-col min-h-full">
      <div className="px-5 pt-6 pb-4 flex items-center gap-2">
        {showBackButton && (
          <button
            onClick={onBack}
            className="flex items-center gap-0.5 text-sm text-muted-foreground hover:text-foreground transition-colors -ml-1 mr-1"
          >
            <ChevronLeft size={20} />
          </button>
        )}
        <h1 className="text-2xl font-bold text-foreground">More</h1>
      </div>

      <div className="px-4 space-y-1 flex-1">
        {CUSTOMIZABLE_PAGE_IDS.filter(id => !FIXED_NAV_PAGES.includes(id)).map((pageId) => {
          const meta = ALL_PAGE_META[pageId];
          if (!meta) return null;
          const Icon = meta.icon;

          return (
            <button
              key={pageId}
              onClick={() => onNavigate(pageId)}
              className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-secondary/50 transition-colors"
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-secondary text-muted-foreground">
                <Icon size={20} />
              </div>
              <div className="flex-1 text-left">
                <span className="text-sm font-semibold text-foreground">{meta.label}</span>
                <p className="text-xs text-muted-foreground">{meta.desc}</p>
              </div>
            </button>
          );
        })}

        {/* Divider */}
        <div className="pt-2 pb-1">
          <div className="h-px bg-border" />
        </div>

        {/* Settings row */}
        <button
          onClick={onOpenSettings}
          className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-secondary/50 transition-colors"
        >
          <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground">
            <Settings size={20} />
          </div>
          <div className="flex-1 text-left">
            <span className="text-sm font-semibold text-foreground">Settings</span>
            <p className="text-xs text-muted-foreground">Account, appearance & preferences</p>
          </div>
        </button>

        {/* Navigation Style Toggle */}
        {onNavStyleChange && (
          <>
            <div className="pt-2 pb-1">
              <div className="h-px bg-border" />
            </div>
            <div className="p-3">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Navigation Style</p>
              <div className="flex gap-2">
                <button
                  onClick={() => onNavStyleChange("bottom")}
                  className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-xs font-medium transition-colors ${
                    navStyle === "bottom"
                      ? "bg-primary/10 text-primary border border-primary/20"
                      : "bg-secondary text-muted-foreground border border-transparent"
                  }`}
                >
                  <MoreHorizontal size={14} />
                  Bottom Bar
                </button>
                <button
                  onClick={() => onNavStyleChange("drawer")}
                  className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-xs font-medium transition-colors ${
                    navStyle === "drawer"
                      ? "bg-primary/10 text-primary border border-primary/20"
                      : "bg-secondary text-muted-foreground border border-transparent"
                  }`}
                >
                  <PanelLeft size={14} />
                  Side Drawer
                </button>
              </div>
            </div>
          </>
        )}

        {/* Week Start Toggle */}
        {onWeekStartChange && (
          <>
            <div className="pt-2 pb-1">
              <div className="h-px bg-border" />
            </div>
            <div className="p-3">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Week Starts On</p>
              <div className="flex gap-2">
                <button
                  onClick={() => onWeekStartChange("sunday")}
                  className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-xs font-medium transition-colors ${
                    weekStart === "sunday"
                      ? "bg-primary/10 text-primary border border-primary/20"
                      : "bg-secondary text-muted-foreground border border-transparent"
                  }`}
                >
                  <Calendar size={14} />
                  Sunday
                </button>
                <button
                  onClick={() => onWeekStartChange("monday")}
                  className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-xs font-medium transition-colors ${
                    weekStart === "monday"
                      ? "bg-primary/10 text-primary border border-primary/20"
                      : "bg-secondary text-muted-foreground border border-transparent"
                  }`}
                >
                  <Calendar size={14} />
                  Monday
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default MorePage;
