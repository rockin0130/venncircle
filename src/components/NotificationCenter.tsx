import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Bell, Check, Calendar, ListTodo, Heart, Dumbbell, UserPlus, ArrowLeft } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useAppContext } from "@/context/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useModalScrollLock } from "@/hooks/useModalScrollLock";
import GroupInviteRequestCard from "@/components/GroupInviteRequestCard";

interface Notification {
  id: string;
  type: "task_complete" | "event_added" | "habit_streak" | "special_day" | "nudge" | "schedule_alert";
  title: string;
  description: string;
  timestamp: Date;
  avatarUrl?: string;
  avatarFallback?: string;
  read: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

const NotificationCenter = ({ open, onClose }: Props) => {
  useModalScrollLock(open);
  const { profile, groups, pendingGroupInvites } = useAuth();
  const { tasks, events, habits } = useAppContext();
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Generate notifications from recent activity
  useEffect(() => {
    if (!open) return;
    const now = new Date();
    const notifs: Notification[] = [];

    // Upcoming events in next 15 minutes
    const today = new Date();
    const currentMinutes = today.getHours() * 60 + today.getMinutes();
    events.forEach((e) => {
      if (e.day === today.getDate() && e.month === today.getMonth() && e.year === today.getFullYear() && e.time && e.time !== "All day") {
        const match = e.time.match(/^(\d{1,2}):(\d{2})$/);
        if (match) {
          const eventMinutes = parseInt(match[1]) * 60 + parseInt(match[2]);
          const diff = eventMinutes - currentMinutes;
          if (diff > 0 && diff <= 15) {
            notifs.push({
              id: `alert-${e.id}`,
              type: "schedule_alert",
              title: "Upcoming Event",
              description: `${e.title} starts in ${diff} minutes`,
              timestamp: now,
              read: false,
            });
          }
        }
      }
    });

    // Incomplete habits reminder
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const incompleteHabits = habits.filter((h) => !h.completionDates.includes(todayStr));
    if (incompleteHabits.length > 0 && today.getHours() >= 18) {
      notifs.push({
        id: "habit-reminder",
        type: "habit_streak",
        title: "Routine Reminder",
        description: `You have ${incompleteHabits.length} routine${incompleteHabits.length > 1 ? "s" : ""} left to complete today`,
        timestamp: now,
        read: false,
      });
    }

    // Recently completed tasks (simulated)
    const recentDone = tasks.filter((t) => t.done && t.completedAt);
    recentDone.slice(0, 3).forEach((t) => {
      notifs.push({
        id: `done-${t.id}`,
        type: "task_complete",
        title: "Task Completed",
        description: `${t.completedBy === profile?.id ? "You" : "Someone"} checked off "${t.title}"`,
        timestamp: t.completedAt ? new Date(t.completedAt) : now,
        read: true,
      });
    });

    setNotifications(notifs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()));
  }, [open, events, habits, tasks, profile]);

  const unreadCount = notifications.filter((n) => !n.read).length + pendingGroupInvites.length;

  const todayNotifs = notifications.filter((n) => {
    const today = new Date();
    return n.timestamp.toDateString() === today.toDateString();
  });
  const earlierNotifs = notifications.filter((n) => {
    const today = new Date();
    return n.timestamp.toDateString() !== today.toDateString();
  });

  const getIcon = (type: Notification["type"]) => {
    switch (type) {
      case "task_complete": return <Check size={14} className="text-[hsl(var(--habit-green))]" />;
      case "event_added":
      case "schedule_alert": return <Calendar size={14} className="text-primary" />;
      case "habit_streak": return <Dumbbell size={14} className="text-accent" />;
      case "special_day": return <Heart size={14} className="text-destructive" />;
      default: return <Bell size={14} className="text-muted-foreground" />;
    }
  };

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    if (diff < 60000) return "Just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          onClick={(e) => e.stopPropagation()}
          className="absolute top-0 left-0 right-0 max-w-md mx-auto bg-card border-b border-border shadow-lg max-h-[80vh] overflow-y-auto scroll-smooth-touch rounded-b-2xl safe-area-top"
        >
          <div className="sticky top-[env(safe-area-inset-top,0px)] bg-card/95 backdrop-blur-sm border-b border-border/50 px-5 py-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-secondary transition-colors shrink-0"
                aria-label="Back"
              >
                <ArrowLeft size={18} className="text-muted-foreground" />
              </button>
              <Bell size={18} className="text-foreground shrink-0" />
              <h2 className="text-lg font-bold truncate" style={{ fontFamily: "'Georgia', serif", color: "hsl(25, 30%, 30%)" }}>
                Notifications
              </h2>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold shrink-0">
                  {unreadCount}
                </span>
              )}
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-secondary transition-colors shrink-0">
              <X size={18} className="text-muted-foreground" />
            </button>
          </div>

          <div className="px-5 py-3">
            {/* Group invite requests — Instagram-style */}
            {pendingGroupInvites.length > 0 && (
              <div className="mb-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                  <UserPlus size={11} />
                  Group invites
                </p>
                <div className="space-y-2">
                  {pendingGroupInvites.map((invite) => (
                    <GroupInviteRequestCard key={invite.group_id} invite={invite} />
                  ))}
                </div>
              </div>
            )}

            {notifications.length === 0 && pendingGroupInvites.length === 0 ? (
              <div className="text-center py-12">
                <Bell size={32} className="mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">No notifications yet</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Activity from your groups will appear here</p>
              </div>
            ) : (
              <>
                {todayNotifs.length > 0 && (
                  <div className="mb-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Today</p>
                    <div className="space-y-1.5">
                      {todayNotifs.map((n) => (
                        <div
                          key={n.id}
                          className={`flex items-start gap-3 p-3 rounded-xl transition-colors ${
                            n.read ? "bg-secondary/30" : "bg-primary/5 border border-primary/10"
                          }`}
                        >
                          <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0 mt-0.5">
                            {n.avatarUrl ? (
                              <Avatar className="w-8 h-8">
                                <AvatarImage src={n.avatarUrl} />
                                <AvatarFallback className="text-[10px]">{n.avatarFallback}</AvatarFallback>
                              </Avatar>
                            ) : (
                              getIcon(n.type)
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-foreground">{n.title}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">{n.description}</p>
                          </div>
                          <span className="text-[10px] text-muted-foreground/60 flex-shrink-0 mt-0.5">
                            {formatTime(n.timestamp)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {earlierNotifs.length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Earlier</p>
                    <div className="space-y-1.5">
                      {earlierNotifs.map((n) => (
                        <div key={n.id} className="flex items-start gap-3 p-3 rounded-xl bg-secondary/30">
                          <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0 mt-0.5">
                            {getIcon(n.type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-foreground">{n.title}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">{n.description}</p>
                          </div>
                          <span className="text-[10px] text-muted-foreground/60 flex-shrink-0 mt-0.5">
                            {formatTime(n.timestamp)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default NotificationCenter;
