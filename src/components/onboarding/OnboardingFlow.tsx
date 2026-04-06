import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft } from "lucide-react";
import Step2Profile from "./Step2Profile";
import Step3JoinType from "./Step3JoinType";
import Step4Interests from "./Step4Interests";
import Step5Features from "./Step5Features";
import Step6Invite from "./Step6Invite";
import Step7Welcome from "./Step7Welcome";

interface OnboardingFlowProps {
  userId: string;
  profile: any;
  onComplete: () => void;
}

const TOTAL_STEPS = 6;

const OnboardingFlow = ({ userId, profile, onComplete }: OnboardingFlowProps) => {
  const [step, setStep] = useState(2);
  const [direction, setDirection] = useState(1);
  const [joinType, setJoinType] = useState<string>(profile?.join_type || "solo");
  const [selectedInterests, setSelectedInterests] = useState<string[]>(
    (profile as any)?.selected_interests || []
  );
  const [featureSubStep, setFeatureSubStep] = useState(0);

  // Determine starting step based on saved progress
  useEffect(() => {
    if (!profile) return;
    const p = profile as any;
    if (p.username && p.display_name) {
      if (p.join_type) {
        if (p.selected_interests?.length > 0) {
          setStep(5);
          setSelectedInterests(p.selected_interests);
          setJoinType(p.join_type);
        } else {
          setStep(4);
          setJoinType(p.join_type);
        }
      } else {
        setStep(3);
      }
    } else {
      setStep(2);
    }
  }, []);

  const goNext = useCallback(() => {
    setDirection(1);
    setStep((s) => Math.min(s + 1, 7));
  }, []);

  const goBack = useCallback(() => {
    setDirection(-1);
    setStep((s) => Math.max(s - 1, 2));
  }, []);

  const progressPercent = (() => {
    if (step === 7) return 100;
    const stepMap: Record<number, number> = { 2: 16, 3: 33, 4: 50, 5: 66, 6: 83 };
    return stepMap[step] || 0;
  })();

  const stepNumber = step - 1; // Step 2 = "1 of 6", Step 7 = "6 of 6"

  const showProgressBar = step >= 2 && step <= 6;
  const showBackArrow = step > 2 && step < 7;

  const handleFinish = async () => {
    await supabase
      .from("profiles")
      .update({ onboarding_completed: true } as any)
      .eq("id", userId);
    onComplete();
  };

  const slideVariants = {
    enter: (dir: number) => ({ x: dir > 0 ? 300 : -300, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir > 0 ? -300 : 300, opacity: 0 }),
  };

  return (
    <div
      className="flex flex-col w-full max-w-md mx-auto h-svh relative overflow-hidden"
      style={{ background: "#F4F3F0", fontFamily: "'DM Sans', sans-serif" }}
    >
      {/* Top bar: back arrow + progress */}
      {showProgressBar && (
        <div className="px-5 pt-4 pb-2">
          <div className="flex items-center gap-3 mb-2">
            {showBackArrow ? (
              <button
                onClick={step === 5 && featureSubStep > 0 ? undefined : goBack}
                className="w-8 h-8 flex items-center justify-center rounded-full"
                style={{ background: "rgba(0,0,0,0.05)" }}
              >
                <ArrowLeft size={16} color="#1a1a1a" />
              </button>
            ) : (
              <div className="w-8" />
            )}
            <div className="flex-1">
              <div
                className="w-full h-1.5 rounded-full overflow-hidden"
                style={{ background: "#E5E4DF" }}
              >
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: "#6C47FF" }}
                  initial={false}
                  animate={{ width: `${progressPercent}%` }}
                  transition={{ duration: 0.4, ease: "easeInOut" }}
                />
              </div>
            </div>
          </div>
          <p
            className="text-center"
            style={{ fontSize: 10, color: "#6C47FF", fontWeight: 500, letterSpacing: 0.5 }}
          >
            {stepNumber} of {TOTAL_STEPS}
          </p>
        </div>
      )}

      {/* Step content */}
      <div className="flex-1 overflow-hidden relative">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={step === 5 ? `step5-${featureSubStep}` : `step-${step}`}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="absolute inset-0 overflow-y-auto"
          >
            {step === 2 && (
              <Step2Profile userId={userId} profile={profile} onContinue={goNext} />
            )}
            {step === 3 && (
              <Step3JoinType
                userId={userId}
                joinType={joinType}
                onSelect={setJoinType}
                onContinue={goNext}
              />
            )}
            {step === 4 && (
              <Step4Interests
                userId={userId}
                selected={selectedInterests}
                onSelect={setSelectedInterests}
                onContinue={goNext}
              />
            )}
            {step === 5 && (
              <Step5Features
                userId={userId}
                interests={selectedInterests}
                subStep={featureSubStep}
                onSubStepChange={setFeatureSubStep}
                onContinue={goNext}
                onBack={goBack}
                setDirection={setDirection}
              />
            )}
            {step === 6 && (
              <Step6Invite
                userId={userId}
                profile={profile}
                onContinue={goNext}
              />
            )}
            {step === 7 && (
              <Step7Welcome
                selectedInterests={selectedInterests}
                profile={profile}
                onFinish={handleFinish}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

export default OnboardingFlow;
