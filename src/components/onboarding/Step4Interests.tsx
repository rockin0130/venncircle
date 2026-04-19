import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CalendarDays, Dumbbell, Flame, BookOpen, Trophy, Check } from "lucide-react";

const INTERESTS = [
  { key: "calendar", label: "Calendar", subtitle: "Plan together", icon: CalendarDays, color: "#3B82F6", bg: "rgba(59,130,246,0.08)" },
  { key: "workout", label: "Workout", subtitle: "Train smarter", icon: Dumbbell, color: "#EF4444", bg: "rgba(239,68,68,0.08)" },
  { key: "habits", label: "Routines", subtitle: "Build routines", icon: Flame, color: "#F59E0B", bg: "rgba(245,158,11,0.08)" },
  { key: "study", label: "Study", subtitle: "Focus deeper", icon: BookOpen, color: "#8B5CF6", bg: "rgba(139,92,246,0.08)" },
  { key: "sobriety", label: "Sobriety", subtitle: "Stay strong", icon: Trophy, color: "#14B8A6", bg: "rgba(20,184,166,0.08)" },
];

interface Step4Props {
  userId: string;
  selected: string[];
  onSelect: (interests: string[]) => void;
  onContinue: () => void;
}

const Step4Interests = ({ userId, selected, onSelect, onContinue }: Step4Props) => {
  const [saving, setSaving] = useState(false);

  const toggle = (key: string) => {
    onSelect(
      selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]
    );
  };

  const handleContinue = async () => {
    if (selected.length === 0) return;
    setSaving(true);
    await supabase
      .from("profiles")
      .update({ selected_interests: selected } as any)
      .eq("id", userId);
    setSaving(false);
    onContinue();
  };

  return (
    <div className="px-6 py-6 flex flex-col h-full">
      <div className="flex-1">
        <h1 style={{ fontSize: 22, fontWeight: 500, color: "#1a1a1a" }} className="mb-1">
          What do you want to share?
        </h1>
        <p style={{ fontSize: 13, color: "#888" }} className="mb-6">
          Pick what matters. You can always add more later.
        </p>

        <div className="grid grid-cols-2 gap-3">
          {INTERESTS.map((interest) => {
            const isSelected = selected.includes(interest.key);
            const Icon = interest.icon;
            return (
              <button
                key={interest.key}
                onClick={() => toggle(interest.key)}
                className="relative text-left rounded-2xl p-4 transition-all"
                style={{
                  background: "#fff",
                  border: `1.5px solid ${isSelected ? "#6C47FF" : "rgba(0,0,0,0.07)"}`,
                  boxShadow: isSelected ? "0 0 0 1px #6C47FF" : "none",
                }}
              >
                {/* Checkbox */}
                <div
                  className="absolute top-3 right-3 w-5 h-5 rounded-md flex items-center justify-center"
                  style={{
                    background: isSelected ? "#6C47FF" : "transparent",
                    border: isSelected ? "none" : "1.5px solid #ddd",
                  }}
                >
                  {isSelected && <Check size={12} color="#fff" strokeWidth={3} />}
                </div>

                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
                  style={{ background: interest.bg }}
                >
                  <Icon size={20} color={interest.color} />
                </div>
                <p style={{ fontSize: 14, fontWeight: 500, color: "#1a1a1a" }}>{interest.label}</p>
                <p style={{ fontSize: 11, color: "#999", marginTop: 2 }}>{interest.subtitle}</p>
              </button>
            );
          })}
        </div>
      </div>

      <button
        onClick={handleContinue}
        disabled={saving || selected.length === 0}
        className="w-full py-3.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40 mt-4"
        style={{ background: "#6C47FF", color: "#fff" }}
      >
        {saving ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          `Continue with ${selected.length} selected`
        )}
      </button>
    </div>
  );
};

export default Step4Interests;
