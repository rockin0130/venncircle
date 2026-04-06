import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Users, UserRound, Loader2 } from "lucide-react";

interface Step3Props {
  userId: string;
  joinType: string;
  onSelect: (type: string) => void;
  onContinue: () => void;
}

const Step3JoinType = ({ userId, joinType, onSelect, onContinue }: Step3Props) => {
  const [saving, setSaving] = useState(false);

  const handleContinue = async () => {
    setSaving(true);
    await supabase.from("profiles").update({ join_type: joinType } as any).eq("id", userId);
    setSaving(false);
    onContinue();
  };

  const options = [
    {
      key: "group",
      icon: <Users size={24} color="#3B82F6" />,
      title: "Joining with friends / group",
      subtitle: null,
      badge: "30 days free premium together",
      bg: "rgba(59,130,246,0.06)",
      border: joinType === "group" ? "#6C47FF" : "rgba(0,0,0,0.07)",
    },
    {
      key: "solo",
      icon: <UserRound size={24} color="#D97706" />,
      title: "Joining solo for now",
      subtitle: "You can invite people anytime after",
      badge: null,
      bg: "rgba(217,119,6,0.06)",
      border: joinType === "solo" ? "#6C47FF" : "rgba(0,0,0,0.07)",
    },
  ];

  return (
    <div className="px-6 py-6 flex flex-col h-full">
      <div className="flex-1">
        <h1 style={{ fontSize: 22, fontWeight: 500, color: "#1a1a1a" }} className="mb-1">
          How are you joining?
        </h1>
        <p style={{ fontSize: 13, color: "#888" }} className="mb-8">
          Joining with someone? You'll both get extra perks.
        </p>

        <div className="space-y-3">
          {options.map((opt) => (
            <button
              key={opt.key}
              onClick={() => onSelect(opt.key)}
              className="w-full text-left rounded-2xl p-4 flex items-start gap-4 transition-all"
              style={{
                background: "#fff",
                border: `1.5px solid ${opt.border}`,
                boxShadow: joinType === opt.key ? "0 0 0 1px #6C47FF" : "none",
              }}
            >
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: opt.bg }}
              >
                {opt.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p style={{ fontSize: 14, fontWeight: 500, color: "#1a1a1a" }}>{opt.title}</p>
                {opt.subtitle && (
                  <p style={{ fontSize: 12, color: "#888", marginTop: 2 }}>{opt.subtitle}</p>
                )}
                {opt.badge && (
                  <span
                    className="inline-block mt-2 px-2.5 py-0.5 rounded-full"
                    style={{ fontSize: 10, fontWeight: 600, background: "rgba(34,197,94,0.1)", color: "#16a34a" }}
                  >
                    {opt.badge}
                  </span>
                )}
              </div>
              <div
                className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-1"
                style={{
                  borderColor: joinType === opt.key ? "#6C47FF" : "#ddd",
                  background: joinType === opt.key ? "#6C47FF" : "transparent",
                }}
              >
                {joinType === opt.key && (
                  <div className="w-2 h-2 rounded-full" style={{ background: "#fff" }} />
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={handleContinue}
        disabled={saving}
        className="w-full py-3.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40"
        style={{ background: "#6C47FF", color: "#fff" }}
      >
        {saving ? <Loader2 size={16} className="animate-spin" /> : "Continue"}
      </button>
    </div>
  );
};

export default Step3JoinType;
