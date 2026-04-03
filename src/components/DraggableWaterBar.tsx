import { useRef, useCallback, useEffect } from "react";
import { Droplets } from "lucide-react";

interface DraggableWaterBarProps {
  intake: number;
  goal: number;
  onIntakeChange: (value: number) => void;
}

const DraggableWaterBar = ({ intake, goal, onIntakeChange }: DraggableWaterBarProps) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const dragging = useRef(false);
  const currentValue = useRef(intake);

  useEffect(() => {
    if (!dragging.current) currentValue.current = intake;
  }, [intake]);

  const percent = goal > 0 ? Math.min(intake / goal, 1) : 0;

  const resolveValue = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const pct = Math.max(0, Math.min((clientX - rect.left) / rect.width, 1));
      const snapped = Math.round(pct * goal * 10) / 10;
      const clamped = Math.max(0, Math.min(snapped, goal));
      currentValue.current = clamped;

      // Direct DOM updates
      const widthPct = `${(clamped / goal) * 100}%`;
      if (fillRef.current) {
        fillRef.current.style.width = widthPct;
        fillRef.current.style.transition = "none";
      }
      if (handleRef.current) {
        handleRef.current.style.left = widthPct;
        handleRef.current.style.transition = "none";
      }
      if (labelRef.current) {
        labelRef.current.textContent = `${clamped.toFixed(1)}L`;
      }
    },
    [goal],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      dragging.current = true;
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      resolveValue(e.clientX);
    },
    [resolveValue],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      e.preventDefault();
      resolveValue(e.clientX);
    },
    [resolveValue],
  );

  const onPointerUp = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    // Restore transitions
    if (fillRef.current) fillRef.current.style.transition = "";
    if (handleRef.current) handleRef.current.style.transition = "";
    onIntakeChange(currentValue.current);
  }, [onIntakeChange]);

  return (
    <div className="w-full mb-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Droplets size={14} className="text-primary" />
          <span ref={labelRef} className="text-2xl font-bold tracking-display">
            {intake.toFixed(1)}L
          </span>
        </div>
        <span className="text-sm text-muted-foreground">/ {goal}L</span>
      </div>

      {/* Track */}
      <div
        ref={trackRef}
        className="relative h-4 bg-secondary rounded-full cursor-pointer select-none"
        style={{ touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* Fill */}
        <div
          ref={fillRef}
          className="absolute inset-y-0 left-0 bg-primary rounded-full"
          style={{
            width: `${percent * 100}%`,
            transition: "width 0.35s cubic-bezier(.4,0,.2,1)",
          }}
        />
        {/* Handle */}
        <div
          ref={handleRef}
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-primary border-[3px] border-card shadow-md"
          style={{
            left: `${percent * 100}%`,
            transition: "left 0.35s cubic-bezier(.4,0,.2,1)",
            cursor: "grab",
            filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.15))",
          }}
        />
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground mt-2">
        <span>0L</span>
        <span className="font-semibold text-primary">
          {intake >= goal ? "🎉 Goal reached!" : `${Math.round((intake / goal) * 100)}%`}
        </span>
        <span>{goal}L</span>
      </div>
    </div>
  );
};

export default DraggableWaterBar;
