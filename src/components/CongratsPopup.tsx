import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

const MESSAGES = {
  task: [
    { emoji: "🎉", title: "Task Complete!", sub: "Great job staying on top of things!" },
    { emoji: "✅", title: "Nailed it!", sub: "You're crushing your day!" },
    { emoji: "💪", title: "Nice work!", sub: "One less thing to worry about!" },
  ],
  habit: [
    { emoji: "🌟", title: "Habit Done!", sub: "You're building a better you!" },
    { emoji: "🔥", title: "Keep it up!", sub: "Consistency is key to success!" },
    { emoji: "💚", title: "Healthy choice!", sub: "You're getting healthier every day!" },
  ],
  workout: [
    { emoji: "🏆", title: "Workout Complete!", sub: "You're getting stronger!" },
    { emoji: "💪", title: "Beast mode!", sub: "Your body thanks you!" },
    { emoji: "🔥", title: "Crushed it!", sub: "You're getting healthier every session!" },
  ],
};

interface CongratsPopupProps {
  type: "task" | "habit" | "workout";
  show: boolean;
  onClose: () => void;
}

const CongratsPopup = ({ type, show, onClose }: CongratsPopupProps) => {
  const [msg] = useState(() => {
    const pool = MESSAGES[type];
    return pool[Math.floor(Math.random() * pool.length)];
  });

  const dismiss = useCallback(() => {
    if (show) onClose();
  }, [show, onClose]);

  // Auto-dismiss after 1.8s
  useEffect(() => {
    if (!show) return;
    const timer = setTimeout(dismiss, 1800);
    return () => clearTimeout(timer);
  }, [show, dismiss]);

  // Dismiss on any click/tap/key anywhere in the document
  useEffect(() => {
    if (!show) return;

    // Small delay so the triggering click doesn't immediately dismiss
    const id = setTimeout(() => {
      const handler = () => dismiss();
      document.addEventListener("pointerdown", handler, { capture: true });
      document.addEventListener("keydown", handler, { capture: true });
      return () => {
        document.removeEventListener("pointerdown", handler, { capture: true });
        document.removeEventListener("keydown", handler, { capture: true });
      };
    }, 100);

    // We need to store the cleanup from the inner timeout
    let cleanup: (() => void) | undefined;

    const realId = setTimeout(() => {
      const handler = () => dismiss();
      document.addEventListener("pointerdown", handler, { capture: true });
      document.addEventListener("keydown", handler, { capture: true });
      cleanup = () => {
        document.removeEventListener("pointerdown", handler, { capture: true });
        document.removeEventListener("keydown", handler, { capture: true });
      };
    }, 100);

    return () => {
      clearTimeout(id);
      clearTimeout(realId);
      cleanup?.();
    };
  }, [show, dismiss]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -15, transition: { duration: 0.15 } }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] pointer-events-none"
        >
          <div className="bg-card border border-border rounded-2xl px-5 py-3 shadow-lg flex items-center gap-3 pointer-events-auto">
            <span className="text-2xl">{msg.emoji}</span>
            <div>
              <h3 className="text-sm font-bold text-foreground leading-tight">{msg.title}</h3>
              <p className="text-xs text-muted-foreground">{msg.sub}</p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default CongratsPopup;
