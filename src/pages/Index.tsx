import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence, useMotionValue, PanInfo } from "framer-motion";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import MorePage from "@/components/MorePage";
import BottomNav, { type Tab, loadNavPages, saveNavPages, FIXED_NAV_PAGES, MAX_NAV_SLOTS } from "@/components/BottomNav";
import HomePage from "@/components/HomePage";
import WorkoutsPage from "@/components/WorkoutsPage";
import NutritionPage from "@/components/NutritionPage";
import HabitsPage from "@/components/HabitsPage";
import CalendarPage from "@/components/CalendarPage";
import ChatListPage from "@/components/ChatListPage";
import ChatPage from "@/components/ChatPage";
import AiAssistantPage from "@/components/AiAssistantPage";
import SobrietyPage from "@/components/SobrietyPage";
import SpecialDaysPage from "@/components/SpecialDaysPage";
import SettingsPage from "@/components/SettingsPage";
import ShoppingListPage from "@/components/ShoppingListPage";
import LauncherPage from "@/components/LauncherPage";
import AuthPage from "@/components/AuthPage";
import ProfileSetupPage from "@/components/ProfileSetupPage";
import SharedInterestsPage from "@/components/SharedInterestsPage";
import GroupHubPage from "@/components/GroupHubPage";
import ProfilePage from "@/components/ProfilePage";
import AppDrawer from "@/components/AppDrawer";
import DrawerMenuButton from "@/components/DrawerMenuButton";
import FloatingAiBar from "@/components/FloatingAiBar";
import CreateGroupModal from "@/components/CreateGroupModal";
import { AppProvider } from "@/context/AppContext";
import { useAuth, Group } from "@/context/AuthContext";
import { useNavStyle } from "@/hooks/useNavStyle";
import { useWeekStart } from "@/hooks/useWeekStart";
import { Loader2, MoreHorizontal } from "lucide-react";

type FullTab = "launcher" | Tab;

const SWIPE_THRESHOLD = 80;

const Index = () => {
  const { user, loading, profile, groups, activeGroup, setActiveGroup, refreshProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<FullTab>("launcher");
  const [navPages] = useState<Tab[]>(() => loadNavPages());
  const [chatGroup, setChatGroup] = useState<Group | null>(null);
  const [chatMode, setChatMode] = useState<"list" | "chat">("list");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [createGroupCategory, setCreateGroupCategory] = useState<"home" | "interest" | undefined>(undefined);
  const [hubGroup, setHubGroup] = useState<Group | null>(null);
  const { navStyle, setNavStyle } = useNavStyle();
  const { weekStart, setWeekStart } = useWeekStart();

  const swipeX = useMotionValue(0);

  const resetHomeSwipeState = useCallback(() => {
    swipeX.stop();
    swipeX.set(0);
  }, [swipeX]);

  useEffect(() => {
    if (activeTab !== "home") {
      resetHomeSwipeState();
    }
  }, [activeTab, resetHomeSwipeState]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-svh bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  const needsProfileSetup = profile && !(profile as any).username;
  if (needsProfileSetup) {
    return (
      <ProfileSetupPage
        userId={user.id}
        initialName={profile.display_name || ""}
        onComplete={() => refreshProfile()}
      />
    );
  }

  const handleEnterGroup = (groupId: string | null) => {
    resetHomeSwipeState();
    if (groupId) {
      const group = groups.find((g) => g.id === groupId);
      if (group) setActiveGroup(group);
    } else {
      setActiveGroup(null);
    }
    setActiveTab("home");
    requestAnimationFrame(resetHomeSwipeState);
  };

  const handleBackToLauncher = () => {
    resetHomeSwipeState();
    setActiveTab("launcher");
  };

  const handleOpenSettings = () => {
    setActiveTab("settings");
  };

  const handleTabChange = (tab: Tab) => {
    if (tab === "chat") {
      setChatGroup(null);
      setChatMode("list");
    }
    // Feature gating: if current activeGroup doesn't support this feature, reset to null
    const TAB_TO_PAGE_KEY: Record<string, string> = {
      workout: "workout",
      nutrition: "nutrition",
      habits: "habits",
      sobriety: "sobriety",
      specialdays: "special_days",
      calendar: "calendar",
      shopping: "shopping",
    };
    const pageKey = TAB_TO_PAGE_KEY[tab];
    if (pageKey && activeGroup && !(activeGroup as any)?._personal) {
      if (!activeGroup.shared_pages?.includes(pageKey as any)) {
        setActiveGroup(null);
      }
    }
    setActiveTab(tab);
  };

  const handleOpenChat = (group: Group) => {
    setChatGroup(group);
    setChatMode("chat");
  };

  const handleBackToList = () => {
    setChatGroup(null);
    setChatMode("list");
  };

  const renderChatView = () => {
    if (chatGroup && chatMode === "chat") {
      return <ChatPage group={chatGroup} onBack={handleBackToList} />;
    }
    return <ChatListPage onOpenChat={handleOpenChat} />;
  };

  const handleDrawerNavigate = (tab: Tab | "settings") => {
    if (tab === "settings") {
      setActiveTab("settings");
    } else {
      handleTabChange(tab as Tab);
    }
  };

  const handleAiSubmit = (text: string) => {
    setActiveTab("ai");
  };

  // Map tab names to ShareablePage keys for feature gating
  const TAB_TO_PAGE: Record<string, string> = {
    workout: "workout",
    nutrition: "nutrition",
    habits: "habits",
    sobriety: "sobriety",
    specialdays: "special_days",
    calendar: "calendar",
    shopping: "shopping",
  };

  const handleNavigateToFeature = (feature: string, groupId?: string) => {
    const tabMap: Record<string, Tab> = {
      workout: "workout",
      nutrition: "nutrition",
      habits: "habits",
      sobriety: "sobriety",
      special_days: "specialdays",
      specialdays: "specialdays",
      calendar: "calendar",
      shopping: "shopping",
    };
    const tab = tabMap[feature];
    if (!tab) return;

    if (groupId) {
      const group = groups.find((g) => g.id === groupId);
      const pageKey = TAB_TO_PAGE[tab] || feature;
      // Only set active group if the group has this feature enabled
      if (group && group.shared_pages?.includes(pageKey as any)) {
        setActiveGroup(group);
      } else {
        // Group doesn't have this feature — fall back to personal
        setActiveGroup(null);
      }
    }
    setActiveTab(tab);
  };

  const handleCreateInterestGroup = () => {
    setCreateGroupCategory(undefined);
    setCreateGroupOpen(true);
  };

  const handleOpenGroupHub = (group: Group) => {
    setHubGroup(group);
    setActiveTab("group-hub" as FullTab);
  };

  const handleBackFromHub = () => {
    setHubGroup(null);
    setActiveTab("shared-interests" as FullTab);
  };

  const handleDragEnd = (_: any, info: PanInfo) => {
    if (activeTab === "home" && (info.offset.x > SWIPE_THRESHOLD || info.velocity.x > 200)) {
      handleBackToLauncher();
      return;
    }
    resetHomeSwipeState();
  };

  const pages: Record<string, React.ReactNode> = {
    launcher: <LauncherPage onEnterGroup={handleEnterGroup} onOpenSettings={handleOpenSettings} />,
    home: <HomePage onOpenSettings={handleOpenSettings} onNavigate={(page) => handleNavigateToFeature(page)} />,
    "shared-interests": (
      <SharedInterestsPage
        onNavigateToFeature={handleNavigateToFeature}
        onCreateGroup={handleCreateInterestGroup}
        onOpenGroupHub={handleOpenGroupHub}
      />
    ),
    "group-hub": hubGroup ? (
      <GroupHubPage
        group={hubGroup}
        onBack={handleBackFromHub}
        onNavigateToFeature={handleNavigateToFeature}
      />
    ) : null,
    profile: <ProfilePage onNavigate={(tab) => setActiveTab(tab as FullTab)} onOpenSettings={handleOpenSettings} onOpenMore={() => setMoreOpen(true)} />,
    workout: <WorkoutsPage />,
    nutrition: <NutritionPage />,
    habits: <HabitsPage />,
    sobriety: <SobrietyPage />,
    specialdays: <SpecialDaysPage />,
    shopping: <ShoppingListPage />,
    calendar: <CalendarPage />,
    chat: renderChatView(),
    ai: <AiAssistantPage />,
    settings: <SettingsPage />,
  };

  const isInnerPage = activeTab !== "launcher";
  const showBottomNav = isInnerPage && navStyle === "bottom";
  const showDrawerButton = isInnerPage && navStyle === "drawer";
  const showFloatingMoreButton = isInnerPage && navStyle === "bottom" && !["home", "profile", "ai", "settings", "launcher"].includes(activeTab);

  return (
    <AppProvider>
      <div className="flex flex-col w-full max-w-md mx-auto bg-background h-svh relative overflow-hidden">
        <AnimatePresence mode="wait">
          {activeTab === "launcher" ? (
            <motion.div
              key="launcher"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="flex-1 overflow-y-auto scroll-smooth-touch relative"
            >
              {pages.launcher}
            </motion.div>
          ) : (
            <motion.div
              key={activeTab === "chat" ? `chat-${chatGroup?.id || "list"}` : activeTab}
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              drag={activeTab === "home" ? "x" : false}
              dragConstraints={{ left: 0, right: 300 }}
              dragElastic={0.15}
              onDragEnd={handleDragEnd}
              style={activeTab === "home" ? { x: swipeX } : undefined}
              className={`flex-1 overflow-y-auto scroll-smooth-touch relative bg-background ${isInnerPage ? (showBottomNav ? "pb-24" : showDrawerButton ? "pb-20" : "pb-4") : ""}`}
            >
              {pages[activeTab]}
            </motion.div>
          )}
        </AnimatePresence>

        {activeTab === "home" && showBottomNav && (
          <button
            onClick={() => handleNavigateToFeature("specialdays")}
            className="fixed left-4 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-[60] w-11 h-11 rounded-full border border-border bg-card/95 backdrop-blur-sm shadow-md flex items-center justify-center text-primary hover:bg-secondary/80 active:scale-95 transition-all"
            aria-label="Special Days"
            title="Special Days"
          >
            <svg width="22" height="18" viewBox="0 0 22 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <circle cx="8" cy="9" r="7" stroke="currentColor" strokeWidth="1.8" fill="none" opacity="0.78" />
              <circle cx="14" cy="9" r="7" stroke="currentColor" strokeWidth="1.8" fill="none" opacity="0.78" />
            </svg>
          </button>
        )}

        {showBottomNav && (
          <BottomNav
            activeTab={activeTab as Tab}
            onTabChange={handleTabChange}
          />
        )}

        {showFloatingMoreButton && (
          <button
            onClick={() => setMoreOpen(true)}
            className="fixed top-3 right-3 z-50 w-10 h-10 rounded-full bg-card/80 backdrop-blur-sm border border-border shadow-sm flex items-center justify-center text-foreground hover:bg-secondary transition-colors"
            aria-label="More"
          >
            <MoreHorizontal size={20} />
          </button>
        )}

        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetContent side="right" className="w-72 p-0 flex flex-col bg-card">
            <div className="flex-1 overflow-y-auto">
              <MorePage
                navPages={navPages}
                onNavigate={(tab) => { handleTabChange(tab); setMoreOpen(false); }}
                onAddToNav={() => {}}
                onRemoveFromNav={() => {}}
                onReplaceInNav={() => {}}
                onOpenSettings={() => { handleOpenSettings(); setMoreOpen(false); }}
                navStyle={navStyle}
                onNavStyleChange={setNavStyle}
                weekStart={weekStart}
                onWeekStartChange={setWeekStart}
              />
            </div>
          </SheetContent>
        </Sheet>

        {showDrawerButton && (
          <DrawerMenuButton onClick={() => setDrawerOpen(true)} />
        )}

        {showDrawerButton && (
          <FloatingAiBar onSubmit={handleAiSubmit} />
        )}

        <AppDrawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          activeTab={activeTab}
          onNavigate={handleDrawerNavigate}
          navStyle={navStyle}
          onNavStyleChange={setNavStyle}
          onAiSubmit={handleAiSubmit}
        />

        <CreateGroupModal
          open={createGroupOpen}
          onOpenChange={setCreateGroupOpen}
          defaultCategory={createGroupCategory}
        />
      </div>
    </AppProvider>
  );
};

export default Index;
