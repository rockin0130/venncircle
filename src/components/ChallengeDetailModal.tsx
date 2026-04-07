import { useState, useEffect } from "react";
import { X, Star, Trophy } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";

interface ChallengeDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  challenge: any;
  members: { user_id: string; display_name: string; avatar_url?: string | null; role: string; status: string }[];
  userId: string;
}

const MEMBER_DOT_COLORS = [
  "hsl(260,45%,60%)", "hsl(340,50%,65%)", "hsl(160,40%,55%)",
  "hsl(35,55%,60%)", "hsl(210,55%,60%)", "hsl(190,45%,55%)",
];

const ChallengeDetailModal = ({ open, onOpenChange, challenge, members, userId }: ChallengeDetailModalProps) => {
  const [progress, setProgress] = useState<any[]>([]);

  useEffect(() => {
    if (!open || !challenge) return;
    const fetchProgress = async () => {
      const { data } = await supabase
        .from("group_challenge_progress")
        .select("*")
        .eq("challenge_id", challenge.id);
      setProgress(data || []);
    };
    fetchProgress();
  }, [open, challenge?.id]);

  if (!challenge) return null;

  const daysLeft = Math.max(0, Math.ceil((new Date(challenge.ends_at).getTime() - Date.now()) / 86400000));
  const totalDays = challenge.duration_weeks * 7;
  const elapsedDays = totalDays - daysLeft;
  const currentWeek = Math.min(challenge.duration_weeks, Math.ceil(elapsedDays / 7) || 1);
  const overallProgress = Math.round((elapsedDays / totalDays) * 100);
  const activeMembers = members.filter(m => m.status === "active");

  // Per-member progress for current week
  const getMemberWeekProgress = (memberId: string) => {
    const entry = progress.find(p => p.user_id === memberId && p.week_number === currentWeek);
    return { completed: entry?.completed_count || 0, target: entry?.target_count || 3 };
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl p-0" style={{ maxHeight: "85vh" }}>
        <div className="overflow-y-auto" style={{ maxHeight: "85vh" }}>
          {/* Hero */}
          <div className="p-5 rounded-t-2xl" style={{ background: "#1a1a2e" }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Trophy size={14} className="text-[#6C47FF]" />
                <span className="text-[10px] font-semibold text-[#6C47FF]">Active Challenge</span>
              </div>
              <button onClick={() => onOpenChange(false)} className="w-6 h-6 rounded-full flex items-center justify-center bg-white/10">
                <X size={12} className="text-white" />
              </button>
            </div>
            <h2 className="text-[17px] font-semibold text-white mb-1">{challenge.title}</h2>
            {challenge.partner_reward && (
              <p className="text-[11px] text-white/50 mb-4">🏆 Win: {challenge.partner_reward}</p>
            )}
            <div className="w-full h-1.5 rounded-full bg-white/10 mb-4">
              <div className="h-full rounded-full bg-[#6C47FF] transition-all" style={{ width: `${overallProgress}%` }} />
            </div>
            <div className="flex gap-2">
              {[
                { label: "Weeks done", value: `${Math.max(0, currentWeek - 1)}` },
                { label: "Progress", value: `${overallProgress}%` },
                { label: "Days left", value: `${daysLeft}` },
              ].map(s => (
                <div key={s.label} className="flex-1 rounded-xl p-2.5 text-center" style={{ background: "rgba(255,255,255,0.06)" }}>
                  <p className="text-[15px] font-semibold text-white">{s.value}</p>
                  <p className="text-[9px] text-white/40">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* This week */}
          <div className="p-5">
            <p className="text-[12px] font-semibold text-[#1a1a1a] mb-3">This week (Week {currentWeek} of {challenge.duration_weeks})</p>
            <div className="space-y-2.5">
              {activeMembers.map((m, i) => {
                const { completed, target } = getMemberWeekProgress(m.user_id);
                const isDone = completed >= target;
                return (
                  <div key={m.user_id} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "#fff", border: "0.5px solid rgba(0,0,0,0.07)" }}>
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ background: MEMBER_DOT_COLORS[i % MEMBER_DOT_COLORS.length] }}>
                      {(m.display_name || "?")[0].toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <p className="text-[12px] font-medium text-[#1a1a1a]">{m.display_name || "Member"}</p>
                      <div className="flex items-center gap-1 mt-1">
                        {Array.from({ length: target }, (_, j) => (
                          <div
                            key={j}
                            className="w-3 h-3 rounded-full"
                            style={{
                              background: j < completed ? "hsl(142,60%,45%)" : "rgba(0,0,0,0.08)",
                            }}
                          />
                        ))}
                      </div>
                    </div>
                    {isDone ? (
                      <span className="text-[10px] font-semibold text-[hsl(142,60%,45%)]">Done ✓</span>
                    ) : m.user_id !== userId ? (
                      <button className="text-[10px] font-semibold text-[#6C47FF] px-2.5 py-1 rounded-full" style={{ background: "hsl(260,80%,97%)" }}>
                        Nudge
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Partner reward teaser */}
          {challenge.partner_reward && (
            <div className="px-5 pb-6">
              <div className="flex items-center gap-3 p-3.5 rounded-[14px]" style={{ background: "hsl(260,80%,97%)", border: "0.5px solid rgba(108,71,255,0.15)" }}>
                <Star size={16} className="text-[#6C47FF] shrink-0" />
                <div className="flex-1">
                  <p className="text-[12px] font-medium text-[#1a1a1a]">{challenge.partner_reward}</p>
                  <p className="text-[10px] text-muted-foreground">Complete all {challenge.duration_weeks} weeks to unlock</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default ChallengeDetailModal;
