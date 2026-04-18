import { useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

/**
 * Watches pendingGroupInvites and triggers an in-app toast + best-effort
 * Web Notification when a new invite arrives.
 *
 * NOTE: True native push (lock-screen alerts when the app is closed) requires
 * Capacitor Push Notifications + APNs/Firebase setup. That's a separate
 * follow-up task — this hook covers in-app + open-tab browser notifications.
 */
export function useInviteNotifications() {
  const { pendingGroupInvites } = useAuth();
  const seenRef = useRef<Set<string> | null>(null);

  // Request browser notification permission once (best-effort, silent fail).
  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      if (!("Notification" in window)) return;
      if (Notification.permission === "default") {
        Notification.requestPermission().catch(() => {});
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    // First run: just record current invite IDs without firing notifications
    // (otherwise we'd notify for every invite already pending on app load).
    if (seenRef.current === null) {
      seenRef.current = new Set(pendingGroupInvites.map((i) => i.group_id));
      return;
    }

    const previouslySeen = seenRef.current;
    const newOnes = pendingGroupInvites.filter((i) => !previouslySeen.has(i.group_id));

    for (const invite of newOnes) {
      const inviter = invite.invited_by_name || "Someone";
      const message = `${inviter} invited you to ${invite.group_emoji} ${invite.group_name}`;

      toast(message, {
        description: "Tap the bell or Chats tab to respond.",
        duration: 6000,
      });

      try {
        if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
          const n = new Notification("New group invite", {
            body: message,
            icon: "/placeholder.svg",
            tag: `group-invite-${invite.group_id}`,
          });
          // Auto-close after 8s
          setTimeout(() => n.close(), 8000);
        }
      } catch {
        /* ignore */
      }
    }

    // Update seen set to current
    seenRef.current = new Set(pendingGroupInvites.map((i) => i.group_id));
  }, [pendingGroupInvites]);
}
