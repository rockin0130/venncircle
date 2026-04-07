import { useState } from "react";
import { motion } from "framer-motion";
import { Loader2, CalendarDays, Dumbbell, Flame, Check } from "lucide-react";

interface Step7Props {
  selectedInterests: string[];
  profile: any;
  onFinish: () => void;
}

const Step7Welcome = ({ selectedInterests, profile, onFinish }: Step7Props) => {
  const [finishing, setFinishing] = useState(false);

  const handleFinish = async () => {
    setFinishing(true);
    await onFinish();
  };

  const summaryItems: { label: string; icon: string }[] = [];
  if (selectedInterests.includes("calendar")) summaryItems.push({ label: "Calendar synced", icon: "📅" });
  if (selectedInterests.includes("workout")) summaryItems.push({ label: "Workout goal set", icon: "💪" });
  if (selectedInterests.includes("nutrition")) summaryItems.push({ label: "Nutrition preferences saved", icon: "🍎" });
  if (selectedInterests.includes("habits")) summaryItems.push({ label: "Habit categories chosen", icon: "🔥" });
  if (selectedInterests.includes("study")) summaryItems.push({ label: "Study space configured", icon: "📖" });
  if (selectedInterests.includes("sobriety")) summaryItems.push({ label: "Sobriety tracking ready", icon: "🏆" });

  return (
    <div className="px-6 py-6 flex flex-col h-full items-center justify-center text-center">
      <div className="flex-1 flex flex-col items-center justify-center">
        {/* Animated logo — two overlapping rings */}
        <div className="relative w-24 h-24 mb-8">
          <motion.svg
            viewBox="0 0 100 100"
            className="w-24 h-24"
          >
            <motion.circle
              cx="38"
              cy="50"
              r="28"
              fill="none"
              stroke="#6C47FF"
              strokeWidth="3"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 1.2, ease: "easeInOut" }}
            />
            <motion.circle
              cx="62"
              cy="50"
              r="28"
              fill="none"
              stroke="#6C47FF"
              strokeWidth="3"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 1.2, ease: "easeInOut", delay: 0.3 }}
            />
          </motion.svg>
        </div>

        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          style={{ fontSize: 22, fontWeight: 500, color: "#1a1a1a" }}
          className="mb-1"
        >
          Your circle is ready.
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          style={{ fontSize: 13, color: "#888" }}
          className="mb-8"
        >
          Welcome to Venn Circle.
        </motion.p>

        {/* Summary card */}
        {summaryItems.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.2 }}
            className="w-full rounded-2xl p-4"
            style={{ background: "#fff", border: "0.5px solid rgba(0,0,0,0.07)" }}
          >
            <div className="space-y-2.5">
              {summaryItems.map((item) => (
                <div key={item.label} className="flex items-center gap-3">
                  <span style={{ fontSize: 18 }}>{item.icon}</span>
                  <span style={{ fontSize: 13, color: "#1a1a1a", fontWeight: 400 }}>{item.label}</span>
                  <Check size={14} color="#22c55e" className="ml-auto" />
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </div>

      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
        onClick={handleFinish}
        disabled={finishing}
        className="w-full py-3.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40"
        style={{ background: "#6C47FF", color: "#fff" }}
      >
        {finishing ? <Loader2 size={16} className="animate-spin" /> : "Enter Venn Circle"}
      </motion.button>
    </div>
  );
};

export default Step7Welcome;
