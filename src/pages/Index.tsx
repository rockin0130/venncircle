import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence, useMotionValue, PanInfo } from "framer-motion";
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
import AppDrawer from "@/components/AppDrawer";
import DrawerMenuButton from "@/components/DrawerMenuButton";
import FloatingAiBar from "@/components/FloatingAiBar";
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
  const [navPages, setNavPages] = useState<Tab[]>(() => loadNavPages());
  const [chatGroup, setChatGroup] = useState<Group | null>(null);
  const [chatMode, setChatMode] = useState<"list" | "chat">("list");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { navStyle, setNavStyle } = useNavStyle();
  const { weekStart, setWeekStart } = useWeekStart();

  // Swipe tracking for Home → Launcher transition
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

  // Profile setup gate: require name + username
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
    setActiveTab(tab);
  };

  const handleAddToNav = (pageId: Tab) => {
    if (navPages.includes(pageId) || navPages.length >= MAX_NAV_SLOTS) return;
    const updated = [...navPages, pageId];
    setNavPages(updated);
    saveNavPages(updated);
  };

  const handleRemoveFromNav = (pageId: Tab) => {
    if (FIXED_NAV_PAGES.includes(pageId)) return;
    const updated = navPages.filter(p => p !== pageId);
    setNavPages(updated);
    saveNavPages(updated);
  };

  const handleReplaceInNav = (oldPageId: Tab, newPageId: Tab) => {
    if (FIXED_NAV_PAGES.includes(oldPageId)) return;
    const updated = navPages.map(p => p === oldPageId ? newPageId : p);
    setNavPages(updated);
    saveNavPages(updated);
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

  // Swipe handlers for Home → Launcher (right swipe)
  const handleDragEnd = (_: any, info: PanInfo) => {
    if (activeTab === "home" && (info.offset.x > SWIPE_THRESHOLD || info.velocity.x > 200)) {
      handleBackToLauncher();
      return;
    }

    resetHomeSwipeState();
  };

  const pages: Record<string, React.ReactNode> = {
    launcher: <LauncherPage onEnterGroup={handleEnterGroup} onOpenSettings={handleOpenSettings} />,
    home: <HomePage onOpenSettings={handleOpenSettings} />,
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
    more: (
      <MorePage
        navPages={navPages}
        onNavigate={handleTabChange}
        onAddToNav={handleAddToNav}
        onRemoveFromNav={handleRemoveFromNav}
        onReplaceInNav={handleReplaceInNav}
        onOpenSettings={handleOpenSettings}
        navStyle={navStyle}
        onNavStyleChange={setNavStyle}
        weekStart={weekStart}
        onWeekStartChange={setWeekStart}
        onBack={() => setActiveTab("home")}
      />
    ),
  };

  const isInnerPage = activeTab !== "launcher";
  const showBottomNav = isInnerPage && navStyle === "bottom";
  const showDrawerButton = isInnerPage && navStyle === "drawer";
  const showFloatingMoreButton = isInnerPage && navStyle === "bottom" && activeTab !== "more";

  return (
    <AppProvider>
      <div className="flex flex-col w-full max-w-md mx-auto bg-background h-svh relative overflow-hidden">

        {/* Main page area */}
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

        {/* Bottom Navigation */}
        {showBottomNav && (
          <BottomNav
            activeTab={activeTab as Tab}
            onTabChange={handleTabChange}
            navPages={navPages}
            onReorder={(newPages) => {
              setNavPages(newPages);
              saveNavPages(newPages);
            }}
          />
        )}

        {/* Floating More Button — top left in Bottom Bar mode */}
        {showFloatingMoreButton && (
          <button
            onClick={() => setActiveTab("more")}
            className="fixed top-3 left-3 z-50 w-10 h-10 rounded-full bg-card/80 backdrop-blur-sm border border-border shadow-sm flex items-center justify-center text-foreground hover:bg-secondary transition-colors"
            aria-label="More"
          >
            <MoreHorizontal size={20} />
          </button>
        )}

        {/* Drawer Menu Button */}
        {showDrawerButton && (
          <DrawerMenuButton onClick={() => setDrawerOpen(true)} />
        )}

        {/* Floating AI Bar — always visible in drawer mode */}
        {showDrawerButton && (
          <FloatingAiBar onSubmit={handleAiSubmit} />
        )}

        {/* Side Drawer */}
        <AppDrawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          activeTab={activeTab}
          onNavigate={handleDrawerNavigate}
          navStyle={navStyle}
          onNavStyleChange={setNavStyle}
          onAiSubmit={handleAiSubmit}
        />
      </div>
    </AppProvider>
  );
};

export default Index;
