import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Check, CalendarDays } from "lucide-react";

interface Step5Props {
  userId: string;
  interests: string[];
  subStep: number;
  onSubStepChange: (n: number) => void;
  onContinue: () => void;
  onBack: () => void;
  setDirection: (d: number) => void;
}

/* ---------- Reusable sub-components ---------- */

const ChipSelect = ({
  options,
  selected,
  onToggle,
  multi = false,
}: {
  options: string[];
  selected: string[];
  onToggle: (v: string) => void;
  multi?: boolean;
}) => (
  <div className="flex flex-wrap gap-2">
    {options.map((opt) => {
      const active = selected.includes(opt);
      return (
        <button
          key={opt}
          onClick={() => onToggle(opt)}
          className="px-3.5 py-2 rounded-full text-xs font-medium transition-all"
          style={{
            background: active ? "#6C47FF" : "#fff",
            color: active ? "#fff" : "#1a1a1a",
            border: `1px solid ${active ? "#6C47FF" : "rgba(0,0,0,0.1)"}`,
          }}
        >
          {opt}
        </button>
      );
    })}
  </div>
);

const SectionLabel = ({ children }: { children: string }) => (
  <p style={{ fontSize: 12, fontWeight: 600, color: "#666", marginBottom: 8 }}>{children}</p>
);

/* ---------- Per-feature setup screens ---------- */

const CalendarSetup = ({ userId, onDone }: { userId: string; onDone: () => void }) => {
  const [connected, setConnected] = useState(false);

  return (
    <div className="px-6 py-6 flex flex-col h-full">
      <div className="flex-1">
        <h1 style={{ fontSize: 22, fontWeight: 500, color: "#1a1a1a" }} className="mb-1">
          Sync your calendar.
        </h1>
        <p style={{ fontSize: 13, color: "#888" }} className="mb-6">
          Keep everything in one place.
        </p>

        <div className="space-y-3">
          <button
            className="w-full flex items-center gap-3 rounded-2xl p-4"
            style={{ background: "#fff", border: "0.5px solid rgba(0,0,0,0.07)" }}
            onClick={() => { setConnected(true); toast.success("Google Calendar connected!"); }}
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(66,133,244,0.1)" }}>
              <CalendarDays size={20} color="#4285F4" />
            </div>
            <span style={{ fontSize: 14, fontWeight: 500 }}>Connect Google Calendar</span>
            {connected && <Check size={16} color="#22c55e" className="ml-auto" />}
          </button>

          <button
            className="w-full flex items-center gap-3 rounded-2xl p-4"
            style={{ background: "#fff", border: "0.5px solid rgba(0,0,0,0.07)" }}
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(0,0,0,0.05)" }}>
              <CalendarDays size={20} color="#1a1a1a" />
            </div>
            <span style={{ fontSize: 14, fontWeight: 500 }}>Connect Apple Calendar</span>
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <button
          onClick={onDone}
          className="w-full py-3.5 rounded-xl text-sm font-semibold"
          style={{ background: "#6C47FF", color: "#fff" }}
        >
          Continue
        </button>
        <button onClick={onDone} className="w-full py-2 text-xs" style={{ color: "#888" }}>
          Skip for now
        </button>
      </div>
    </div>
  );
};

const WorkoutSetup = ({ userId, onDone }: { userId: string; onDone: () => void }) => {
  const [goal, setGoal] = useState<string[]>([]);
  const [activities, setActivities] = useState<string[]>([]);
  const [commitment, setCommitment] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await supabase.from("onboarding_preferences" as any).upsert(
      { user_id: userId, category: "workout", preferences: { goal: goal[0], activities, commitment: commitment[0] } } as any,
      { onConflict: "user_id,category" }
    );
    setSaving(false);
    onDone();
  };

  return (
    <div className="px-6 py-6 flex flex-col h-full">
      <div className="flex-1 space-y-6">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 500, color: "#1a1a1a" }} className="mb-1">Let's set up your workout.</h1>
          <p style={{ fontSize: 13, color: "#888" }}>We'll personalize your goals and AI suggestions.</p>
        </div>

        <div>
          <SectionLabel>Your main goal</SectionLabel>
          <div className="space-y-2">
            {["Get stronger", "Lose weight", "Build endurance", "Stay active", "Train for an event"].map((g) => (
              <button
                key={g}
                onClick={() => setGoal([g])}
                className="w-full text-left px-4 py-3 rounded-xl text-sm transition-all"
                style={{
                  background: goal[0] === g ? "rgba(108,71,255,0.08)" : "#fff",
                  border: `1px solid ${goal[0] === g ? "#6C47FF" : "rgba(0,0,0,0.07)"}`,
                  fontWeight: goal[0] === g ? 500 : 400,
                  color: "#1a1a1a",
                }}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        <div>
          <SectionLabel>Activities you enjoy</SectionLabel>
          <ChipSelect
            options={["Running", "Cycling", "Gym", "Yoga", "Swimming", "Sports", "Walking", "Other"]}
            selected={activities}
            onToggle={(v) => setActivities((p) => p.includes(v) ? p.filter((x) => x !== v) : [...p, v])}
            multi
          />
        </div>

        <div>
          <SectionLabel>Weekly commitment</SectionLabel>
          <ChipSelect
            options={["2x", "3x", "4x", "5x+"]}
            selected={commitment}
            onToggle={(v) => setCommitment([v])}
          />
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-3.5 rounded-xl text-sm font-semibold mt-4"
        style={{ background: "#6C47FF", color: "#fff" }}
      >
        {saving ? <Loader2 size={16} className="animate-spin" /> : "Continue"}
      </button>
    </div>
  );
};

const NutritionSetup = ({ userId, onDone }: { userId: string; onDone: () => void }) => {
  const [goal, setGoal] = useState<string[]>([]);
  const [dietary, setDietary] = useState<string[]>([]);
  const [style, setStyle] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await supabase.from("onboarding_preferences" as any).upsert(
      { user_id: userId, category: "nutrition", preferences: { goal: goal[0], dietary, style: style[0] } } as any,
      { onConflict: "user_id,category" }
    );
    setSaving(false);
    onDone();
  };

  return (
    <div className="px-6 py-6 flex flex-col h-full">
      <div className="flex-1 space-y-6">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 500, color: "#1a1a1a" }} className="mb-1">What are your nutrition goals?</h1>
        </div>

        <div>
          <SectionLabel>Main goal</SectionLabel>
          <div className="space-y-2">
            {["Lose weight", "Maintain", "Build muscle", "Eat healthier", "Manage a condition"].map((g) => (
              <button
                key={g}
                onClick={() => setGoal([g])}
                className="w-full text-left px-4 py-3 rounded-xl text-sm transition-all"
                style={{
                  background: goal[0] === g ? "rgba(108,71,255,0.08)" : "#fff",
                  border: `1px solid ${goal[0] === g ? "#6C47FF" : "rgba(0,0,0,0.07)"}`,
                  fontWeight: goal[0] === g ? 500 : 400,
                }}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        <div>
          <SectionLabel>Dietary restrictions</SectionLabel>
          <ChipSelect
            options={["None", "Vegetarian", "Vegan", "Gluten-free", "Dairy-free", "Halal", "Kosher"]}
            selected={dietary}
            onToggle={(v) => setDietary((p) => p.includes(v) ? p.filter((x) => x !== v) : [...p, v])}
            multi
          />
        </div>

        <div>
          <SectionLabel>Tracking style</SectionLabel>
          <div className="space-y-2">
            {[
              { key: "macros", label: "Track macros and calories" },
              { key: "relaxed", label: "Keep it relaxed — just log meals" },
            ].map((s) => (
              <button
                key={s.key}
                onClick={() => setStyle([s.key])}
                className="w-full text-left px-4 py-3 rounded-xl text-sm transition-all"
                style={{
                  background: style[0] === s.key ? "rgba(108,71,255,0.08)" : "#fff",
                  border: `1px solid ${style[0] === s.key ? "#6C47FF" : "rgba(0,0,0,0.07)"}`,
                  fontWeight: style[0] === s.key ? 500 : 400,
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-3.5 rounded-xl text-sm font-semibold mt-4"
        style={{ background: "#6C47FF", color: "#fff" }}
      >
        {saving ? <Loader2 size={16} className="animate-spin" /> : "Continue"}
      </button>
    </div>
  );
};

const HabitsSetup = ({ userId, onDone }: { userId: string; onDone: () => void }) => {
  const [categories, setCategories] = useState<string[]>([]);
  const [time, setTime] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const cats = [
    { key: "Health", icon: "💪" },
    { key: "Mindfulness", icon: "🧘" },
    { key: "Productivity", icon: "⚡" },
    { key: "Growth", icon: "🌱" },
    { key: "Social", icon: "👥" },
    { key: "Morning Routine", icon: "☀️" },
  ];

  const handleSave = async () => {
    setSaving(true);
    await supabase.from("onboarding_preferences" as any).upsert(
      { user_id: userId, category: "habits", preferences: { categories, best_time: time[0] } } as any,
      { onConflict: "user_id,category" }
    );
    setSaving(false);
    onDone();
  };

  return (
    <div className="px-6 py-6 flex flex-col h-full">
      <div className="flex-1 space-y-6">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 500, color: "#1a1a1a" }} className="mb-1">What habits matter to you?</h1>
          <p style={{ fontSize: 13, color: "#888" }}>Pick categories — we'll suggest specific habits inside.</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {cats.map((c) => {
            const active = categories.includes(c.key);
            return (
              <button
                key={c.key}
                onClick={() => setCategories((p) => p.includes(c.key) ? p.filter((x) => x !== c.key) : [...p, c.key])}
                className="text-left rounded-2xl p-4 transition-all relative"
                style={{
                  background: "#fff",
                  border: `1.5px solid ${active ? "#6C47FF" : "rgba(0,0,0,0.07)"}`,
                }}
              >
                {active && (
                  <div className="absolute top-3 right-3 w-5 h-5 rounded-md flex items-center justify-center" style={{ background: "#6C47FF" }}>
                    <Check size={12} color="#fff" strokeWidth={3} />
                  </div>
                )}
                <span style={{ fontSize: 24 }}>{c.icon}</span>
                <p style={{ fontSize: 13, fontWeight: 500, color: "#1a1a1a", marginTop: 6 }}>{c.key}</p>
              </button>
            );
          })}
        </div>

        <div>
          <SectionLabel>Best time for habits</SectionLabel>
          <ChipSelect
            options={["Morning", "Afternoon", "Evening", "Flexible"]}
            selected={time}
            onToggle={(v) => setTime([v])}
          />
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-3.5 rounded-xl text-sm font-semibold mt-4"
        style={{ background: "#6C47FF", color: "#fff" }}
      >
        {saving ? <Loader2 size={16} className="animate-spin" /> : "Continue"}
      </button>
    </div>
  );
};

const StudySetup = ({ userId, onDone }: { userId: string; onDone: () => void }) => {
  const [role, setRole] = useState<string[]>([]);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [dailyGoal, setDailyGoal] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await supabase.from("onboarding_preferences" as any).upsert(
      { user_id: userId, category: "study", preferences: { role: role[0], subjects, daily_goal: dailyGoal[0] } } as any,
      { onConflict: "user_id,category" }
    );
    setSaving(false);
    onDone();
  };

  return (
    <div className="px-6 py-6 flex flex-col h-full">
      <div className="flex-1 space-y-6">
        <h1 style={{ fontSize: 22, fontWeight: 500, color: "#1a1a1a" }}>Set up your study space.</h1>

        <div>
          <SectionLabel>I am a...</SectionLabel>
          <div className="space-y-2">
            {["Middle/High school student", "University student", "Graduate student", "Working professional", "Other"].map((r) => (
              <button
                key={r}
                onClick={() => setRole([r])}
                className="w-full text-left px-4 py-3 rounded-xl text-sm transition-all"
                style={{
                  background: role[0] === r ? "rgba(108,71,255,0.08)" : "#fff",
                  border: `1px solid ${role[0] === r ? "#6C47FF" : "rgba(0,0,0,0.07)"}`,
                  fontWeight: role[0] === r ? 500 : 400,
                }}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        <div>
          <SectionLabel>Subjects I study</SectionLabel>
          <ChipSelect
            options={["Math", "Science", "English", "History", "Law", "Medicine", "Business", "Languages"]}
            selected={subjects}
            onToggle={(v) => setSubjects((p) => p.includes(v) ? p.filter((x) => x !== v) : [...p, v])}
            multi
          />
        </div>

        <div>
          <SectionLabel>Daily study goal</SectionLabel>
          <ChipSelect
            options={["30 min", "1 hour", "2 hours", "3+ hours"]}
            selected={dailyGoal}
            onToggle={(v) => setDailyGoal([v])}
          />
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-3.5 rounded-xl text-sm font-semibold mt-4"
        style={{ background: "#6C47FF", color: "#fff" }}
      >
        {saving ? <Loader2 size={16} className="animate-spin" /> : "Continue"}
      </button>
    </div>
  );
};

const SobrietySetup = ({ userId, onDone }: { userId: string; onDone: () => void }) => {
  const [tracking, setTracking] = useState<string[]>([]);
  const [startOption, setStartOption] = useState<string>("today");
  const [showProgress, setShowProgress] = useState(true);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await supabase.from("onboarding_preferences" as any).upsert(
      { user_id: userId, category: "sobriety", preferences: { tracking, start: startOption, show_progress: showProgress } } as any,
      { onConflict: "user_id,category" }
    );
    setSaving(false);
    onDone();
  };

  return (
    <div className="px-6 py-6 flex flex-col h-full">
      <div className="flex-1 space-y-6">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 500, color: "#1a1a1a" }} className="mb-1">You're not doing this alone.</h1>
        </div>

        <div>
          <SectionLabel>What are you tracking?</SectionLabel>
          <ChipSelect
            options={["Alcohol", "Substances", "Custom"]}
            selected={tracking}
            onToggle={(v) => setTracking((p) => p.includes(v) ? p.filter((x) => x !== v) : [...p, v])}
            multi
          />
        </div>

        <div>
          <SectionLabel>Starting date</SectionLabel>
          <div className="space-y-2">
            {[
              { key: "today", label: "Starting today" },
              { key: "custom", label: "I have a date" },
            ].map((s) => (
              <button
                key={s.key}
                onClick={() => setStartOption(s.key)}
                className="w-full text-left px-4 py-3 rounded-xl text-sm transition-all"
                style={{
                  background: startOption === s.key ? "rgba(108,71,255,0.08)" : "#fff",
                  border: `1px solid ${startOption === s.key ? "#6C47FF" : "rgba(0,0,0,0.07)"}`,
                  fontWeight: startOption === s.key ? 500 : 400,
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <SectionLabel>Support visibility</SectionLabel>
          <div className="space-y-2">
            <button
              onClick={() => setShowProgress(true)}
              className="w-full text-left px-4 py-3 rounded-xl text-sm transition-all flex items-center justify-between"
              style={{
                background: showProgress ? "rgba(108,71,255,0.08)" : "#fff",
                border: `1px solid ${showProgress ? "#6C47FF" : "rgba(0,0,0,0.07)"}`,
              }}
            >
              <span>Show progress to my circle</span>
              {showProgress && <Check size={16} color="#6C47FF" />}
            </button>
            <button
              onClick={() => setShowProgress(false)}
              className="w-full text-left px-4 py-3 rounded-xl text-sm transition-all flex items-center justify-between"
              style={{
                background: !showProgress ? "rgba(108,71,255,0.08)" : "#fff",
                border: `1px solid ${!showProgress ? "#6C47FF" : "rgba(0,0,0,0.07)"}`,
              }}
            >
              <span>Keep it private</span>
              {!showProgress && <Check size={16} color="#6C47FF" />}
            </button>
          </div>
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-3.5 rounded-xl text-sm font-semibold mt-4"
        style={{ background: "#6C47FF", color: "#fff" }}
      >
        {saving ? <Loader2 size={16} className="animate-spin" /> : "Continue"}
      </button>
    </div>
  );
};

/* ---------- Main Step5 Orchestrator ---------- */

const FEATURE_ORDER = ["calendar", "workout", "nutrition", "habits", "study", "sobriety"];

const Step5Features = ({ userId, interests, subStep, onSubStepChange, onContinue, onBack, setDirection }: Step5Props) => {
  const activeFeatures = useMemo(
    () => FEATURE_ORDER.filter((f) => interests.includes(f)),
    [interests]
  );

  const handleSubDone = () => {
    if (subStep < activeFeatures.length - 1) {
      setDirection(1);
      onSubStepChange(subStep + 1);
    } else {
      onSubStepChange(0);
      onContinue();
    }
  };

  useEffect(() => {
    if (activeFeatures.length === 0) onContinue();
  }, [activeFeatures.length]);

  if (activeFeatures.length === 0) return null;

  const current = activeFeatures[subStep] || activeFeatures[0];

  const componentMap: Record<string, React.ReactNode> = {
    calendar: <CalendarSetup userId={userId} onDone={handleSubDone} />,
    workout: <WorkoutSetup userId={userId} onDone={handleSubDone} />,
    nutrition: <NutritionSetup userId={userId} onDone={handleSubDone} />,
    habits: <HabitsSetup userId={userId} onDone={handleSubDone} />,
    study: <StudySetup userId={userId} onDone={handleSubDone} />,
    sobriety: <SobrietySetup userId={userId} onDone={handleSubDone} />,
  };

  return <>{componentMap[current]}</>;
};

export default Step5Features;
