import { ArrowLeft } from "lucide-react";

/** Top-left back control for sub-pages (not main tab roots). */
export function SubPageBackButton({ onBack, className }: { onBack: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-foreground hover:bg-secondary/80 active:scale-95 transition-transform ${className ?? ""}`}
      aria-label="Back"
    >
      <ArrowLeft size={20} strokeWidth={2.25} />
    </button>
  );
}
