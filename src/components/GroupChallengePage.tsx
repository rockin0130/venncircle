import { useState, useEffect, useMemo } from "react";
import { ArrowLeft, Trophy, Zap, Clock, Star, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import ChallengeDetailModal from "@/components/ChallengeDetailModal";

interface GroupChallengePageProps {
  groupId: string;
  groupName: string;
  enabledPages: string[];
  members: { user_id: string; display_name: string; avatar_url?: string | null; role: string; status: string }[];
  userId: string;
  onBack: () => void;
}

interface ChallengeTemplate {
  title: string;
  goalDescription: string;
  durationWeeks: number;
  difficulty: "Easy" | "Medium" | "Hard";
  targetPerWeek: number;
}

const TEMPLATES: Record<string, ChallengeTemplate[]> = {
  workout: [
    { title: "3-Week Consistency Challenge", goalDescription: "Each member completes 3 workouts per week", durationWeeks: 3, difficulty: "Easy", targetPerWeek: 3 },
    { title: "4-Week Fitness Push", goalDescription: "4 workouts/week each", durationWeeks: 4, difficulty: "Medium", targetPerWeek: 4 },
    { title: "30-Day Active Month", goalDescription: "Workout every other day", durationWeeks: 4, difficulty: "Hard", targetPerWeek: 4 },
  ],
  study: [
    { title: "2-Week Focus Sprint", goalDescription: "1 hour study/day each", durationWeeks: 2, difficulty: "Easy", targetPerWeek: 7 },
    { title: "30-Day Study Habit", goalDescription: "45 min study/day each", durationWeeks: 4, difficulty: "Medium", targetPerWeek: 7 },
    { title: "Weekly Goal Streak", goalDescription: "Hit weekly study goal 4 weeks in a row", durationWeeks: 4, difficulty: "Hard", targetPerWeek: 5 },
  ],
  habits: [
    { title: "21-Day Routine Lock", goalDescription: "Complete all routines daily for 3 weeks", durationWeeks: 3, difficulty: "Medium", targetPerWeek: 7 },
    { title: "Morning Routine Challenge", goalDescription: "Complete morning routines for 30 days", durationWeeks: 4, difficulty: "Hard", targetPerWeek: 7 },
  ],
  sobriety: [
    { title: "7-Day Clean Start", goalDescription: "7 days of check-ins each", durationWeeks: 1, difficulty: "Easy", targetPerWeek: 7 },
    { title: "30-Day Together", goalDescription: "All members check in for 30 days", durationWeeks: 4, difficulty: "Hard", targetPerWeek: 7 },
  ],
};

const REWARD_OPTIONS = [
  { id: "equinox", name: "Equinox", description: "1 month free membership" },
  { id: "classpass", name: "ClassPass", description: "10 free credits" },
  { id: "ag1", name: "AG1", description: "Free starter kit" },
  { id: "none", name: "None", description: "No partner reward" },
];

const DIFFICULTY_COLORS: Record<string, string> = {
  Easy: "bg-[hsl(142,50%,92%)] text-[hsl(142,50%,35%)]",
  Medium: "bg-[hsl(35,60%,92%)] text-[hsl(35,60%,40%)]",
  Hard: "bg-[hsl(0,50%,93%)] text-[hsl(0,50%,45%)]",
};

const GroupChallengePage = ({ groupId, groupName, enabledPages, members, userId, onBack }: GroupChallengePageProps) => {
  const [activeChallenge, setActiveChallenge] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedType, setSelectedType] = useState<string>("");
  const [selectedTemplate, setSelectedTemplate] = useState<ChallengeTemplate | null>(null);
  const [selectedDuration, setSelectedDuration] = useState<number>(3);
  const [selectedReward, setSelectedReward] = useState<string>("none");
  const [launching, setLaunching] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  // Only non-calendar enabled interests
  const challengeTypes = useMemo(() =>
    enabledPages.filter(p => p !== "calendar" && p !== "shopping" && p !== "special_days" && TEMPLATES[p]),
    [enabledPages]
  );

  useEffect(() => {
    if (challengeTypes.length > 0 && !selectedType) setSelectedType(challengeTypes[0]);
  }, [challengeTypes]);

  useEffect(() => { fetchActive(); }, [groupId]);

  const fetchActive = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("group_challenges")
      .select("*")
      .eq("group_id", groupId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1);
    setActiveChallenge(data?.[0] || null);
    setLoading(false);
  };

  const handleLaunch = async () => {
    if (!selectedTemplate) { toast.error("Select a challenge template"); return; }
    setLaunching(true);
    const endsAt = new Date();
    endsAt.setDate(endsAt.getDate() + selectedDuration * 7);
    const reward = selectedReward !== "none" ? REWARD_OPTIONS.find(r => r.id === selectedReward)?.name : null;

    const { data, error } = await supabase.from("group_challenges").insert({
      group_id: groupId,
      created_by: userId,
      challenge_type: selectedType,
      title: selectedTemplate.title,
      description: selectedTemplate.goalDescription,
      duration_weeks: selectedDuration,
      difficulty: selectedTemplate.difficulty.toLowerCase(),
      goal_description: selectedTemplate.goalDescription,
      partner_reward: reward,
      status: "active",
      ends_at: endsAt.toISOString(),
    } as any).select().single();

    if (error) { toast.error("Failed to launch challenge"); setLaunching(false); return; }

    // Create initial progress for all active members
    const progressRows = members
      .filter(m => m.status === "active")
      .flatMap(m =>
        Array.from({ length: selectedDuration }, (_, i) => ({
          challenge_id: (data as any).id,
          user_id: m.user_id,
          week_number: i + 1,
          completed_count: 0,
          target_count: selectedTemplate.targetPerWeek,
        }))
      );

    // Only insert own progress (RLS)
    const myProgress = progressRows.filter(r => r.user_id === userId);
    if (myProgress.length > 0) {
      await supabase.from("group_challenge_progress").insert(myProgress as any);
    }

    toast.success("Challenge launched! 🎉");
    setLaunching(false);
    setSelectedTemplate(null);
    fetchActive();
  };

  const templates = TEMPLATES[selectedType] || [];

  return (
    <div className="flex flex-col h-full" style={{ background: "#F4F3F0" }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 safe-area-top pt-3 pb-3">
        <button onClick={onBack} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-black/5">
          <ArrowLeft size={18} className="text-[#1a1a1a]" />
        </button>
        <div className="flex-1">
          <p className="text-[10px] text-muted-foreground font-medium">{groupName}</p>
          <h1 className="text-[17px] font-semibold text-[#1a1a1a]">Challenges</h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-8 space-y-5">
        {/* Active challenge */}
        {activeChallenge && (
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Active Challenge</p>
            <button
              onClick={() => setDetailOpen(true)}
              className="w-full text-left rounded-[14px] p-4"
              style={{ background: "#1a1a2e", border: "0.5px solid rgba(255,255,255,0.08)" }}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-[#6C47FF]/20 text-[#6C47FF]">Active challenge</span>
                <span className="text-[10px] text-white/50">{Math.max(0, Math.ceil((new Date(activeChallenge.ends_at).getTime() - Date.now()) / 86400000))} days left</span>
              </div>
              <p className="text-[15px] font-medium text-white mb-1">{activeChallenge.title}</p>
              {activeChallenge.partner_reward && (
                <p className="text-[11px] text-white/50 mb-3">🏆 Win: {activeChallenge.partner_reward}</p>
              )}
              <div className="w-full h-1.5 rounded-full bg-white/10 mb-2">
                <div className="h-full rounded-full bg-[#6C47FF]" style={{ width: "30%" }} />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex -space-x-1.5">
                  {members.filter(m => m.status === "active").slice(0, 4).map((m, i) => (
                    <div key={m.user_id} className="w-5 h-5 rounded-full bg-white/20 border border-[#1a1a2e] flex items-center justify-center text-[8px] font-bold text-white">
                      {(m.display_name || "?")[0]}
                    </div>
                  ))}
                </div>
                <span className="text-[10px] text-white/40 flex items-center gap-1">Tap to see details <ChevronRight size={10} /></span>
              </div>
            </button>
          </div>
        )}

        {/* Start a new challenge */}
        <div>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Start a challenge</p>

          {/* Type pills */}
          <div className="flex gap-2 flex-wrap mb-4">
            {challengeTypes.map(type => (
              <button
                key={type}
                onClick={() => { setSelectedType(type); setSelectedTemplate(null); }}
                className="px-3 py-1.5 rounded-full text-[11px] font-medium transition-all"
                style={{
                  background: selectedType === type ? "#6C47FF" : "#fff",
                  color: selectedType === type ? "#fff" : "#1a1a1a",
                  border: `0.5px solid ${selectedType === type ? "#6C47FF" : "rgba(0,0,0,0.09)"}`,
                }}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            ))}
          </div>

          {/* Templates */}
          <div className="space-y-2.5 mb-5">
            {templates.map((t, i) => {
              const isSelected = selectedTemplate?.title === t.title;
              return (
                <button
                  key={i}
                  onClick={() => { setSelectedTemplate(t); setSelectedDuration(t.durationWeeks); }}
                  className="w-full text-left p-3.5 rounded-[14px] transition-all"
                  style={{
                    background: "#fff",
                    border: isSelected ? "2px solid #6C47FF" : "0.5px solid rgba(0,0,0,0.07)",
                  }}
                >
                  <p className="text-[13px] font-medium text-[#1a1a1a] mb-0.5">{t.title}</p>
                  <p className="text-[11px] text-muted-foreground mb-2">{t.goalDescription}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-[hsl(220,15%,93%)] text-[hsl(220,15%,45%)]">
                      <Clock size={8} className="inline mr-0.5" />{t.durationWeeks} week{t.durationWeeks > 1 ? "s" : ""}
                    </span>
                    <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full ${DIFFICULTY_COLORS[t.difficulty]}`}>
                      {t.difficulty}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Duration selector */}
          {selectedTemplate && (
            <>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Duration</p>
              <div className="flex gap-2 mb-5">
                {[1, 2, 4].map(w => (
                  <button
                    key={w}
                    onClick={() => setSelectedDuration(w)}
                    className="flex-1 py-2 rounded-xl text-[11px] font-medium transition-all"
                    style={{
                      background: selectedDuration === w ? "#6C47FF" : "#fff",
                      color: selectedDuration === w ? "#fff" : "#1a1a1a",
                      border: `0.5px solid ${selectedDuration === w ? "#6C47FF" : "rgba(0,0,0,0.09)"}`,
                    }}
                  >
                    {w === 1 ? "1 week" : `${w} weeks`}
                  </button>
                ))}
              </div>

              {/* Partner reward */}
              {members.filter(m => m.status === "active").length >= 3 && (
                <>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Partner Reward</p>
                  <div className="space-y-2 mb-5">
                    {REWARD_OPTIONS.map(r => (
                      <button
                        key={r.id}
                        onClick={() => setSelectedReward(r.id)}
                        className="w-full text-left p-3 rounded-[14px] flex items-center gap-3 transition-all"
                        style={{
                          background: "#fff",
                          border: selectedReward === r.id ? "2px solid #6C47FF" : "0.5px solid rgba(0,0,0,0.07)",
                        }}
                      >
                        <Star size={14} className={selectedReward === r.id ? "text-[#6C47FF]" : "text-muted-foreground"} />
                        <div>
                          <p className="text-[12px] font-medium text-[#1a1a1a]">{r.name}</p>
                          <p className="text-[10px] text-muted-foreground">{r.description}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* Launch button */}
              <button
                onClick={handleLaunch}
                disabled={launching}
                className="w-full py-3.5 rounded-[14px] text-[14px] font-semibold text-white transition-all"
                style={{ background: "#1a1a1a" }}
              >
                {launching ? "Launching..." : "Launch Challenge"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Challenge Detail Modal */}
      {activeChallenge && (
        <ChallengeDetailModal
          open={detailOpen}
          onOpenChange={setDetailOpen}
          challenge={activeChallenge}
          members={members}
          userId={userId}
        />
      )}
    </div>
  );
};

export default GroupChallengePage;
