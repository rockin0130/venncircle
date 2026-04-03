import { Sparkles } from "lucide-react";

interface FloatingAiBarProps {
  onSubmit: (text: string) => void;
}

const FloatingAiBar = ({ onSubmit }: FloatingAiBarProps) => {
  const handleTap = () => {
    // Navigate to the AI page (same as bottom nav AI button)
    onSubmit("");
  };

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-[calc(var(--max-w,28rem)-2rem)] z-50">
      <button
        onClick={handleTap}
        className="flex items-center gap-2 rounded-2xl bg-card/95 backdrop-blur-lg border border-border shadow-lg px-4 py-3 w-full text-left"
      >
        <Sparkles size={18} className="text-primary shrink-0" />
        <span className="flex-1 text-sm text-muted-foreground">Ask AI anything…</span>
      </button>
    </div>
  );
};

export default FloatingAiBar;
