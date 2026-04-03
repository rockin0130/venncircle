import { useRef, useCallback, useEffect } from "react";
import { Droplets } from "lucide-react";

interface DraggableWaterGaugeProps {
  intake: number;
  goal: number;
  onIntakeChange: (value: number) => void;
  size?: number;
  strokeWidth?: number;
}

const DraggableWaterGauge = ({
  intake,
  goal,
  onIntakeChange,
  size = 140,
  strokeWidth = 10,
}: DraggableWaterGaugeProps) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const arcRef = useRef<SVGCircleElement>(null);
  const handleRef = useRef<SVGCircleElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const dragging = useRef(false);
  const currentValue = useRef(intake);

  const handleR = strokeWidth + 2;
  const pad = handleR + 4;
  const vb = size + pad * 2;
  const center = vb / 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  // Sync ref when intake prop changes (from buttons)
  useEffect(() => {
    if (!dragging.current) {
      currentValue.current = intake;
    }
  }, [intake]);

  const percent = goal > 0 ? Math.min(intake / goal, 1) : 0;
  const offset = circumference * (1 - percent);
  const angleDeg = percent * 360 - 90;
  const angleRad = (angleDeg * Math.PI) / 180;
  const hx = center + radius * Math.cos(angleRad);
  const hy = center + radius * Math.sin(angleRad);

  // Direct DOM updates for smooth dragging — no React re-render
  const updateDOM = useCallback(
    (pct: number) => {
      const off = circumference * (1 - pct);
      const deg = pct * 360 - 90;
      const rad = (deg * Math.PI) / 180;
      const x = center + radius * Math.cos(rad);
      const y = center + radius * Math.sin(rad);

      if (arcRef.current) {
        arcRef.current.style.strokeDashoffset = String(off);
        arcRef.current.style.transition = "none";
      }
      if (handleRef.current) {
        handleRef.current.setAttribute("cx", String(x));
        handleRef.current.setAttribute("cy", String(y));
      }
      if (labelRef.current) {
        labelRef.current.textContent = `${currentValue.current.toFixed(1)}L`;
      }
    },
    [circumference, center, radius],
  );

  const resolveValue = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let deg = (Math.atan2(clientY - cy, clientX - cx) * 180) / Math.PI + 90;
      if (deg < 0) deg += 360;
      const pct = Math.max(0, Math.min(deg / 360, 1));
      const snapped = Math.round(pct * goal * 10) / 10;
      const clamped = Math.max(0, Math.min(snapped, goal));
      currentValue.current = clamped;
      updateDOM(clamped / goal);
    },
    [goal, updateDOM],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      dragging.current = true;
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      resolveValue(e.clientX, e.clientY);
    },
    [resolveValue],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      e.preventDefault();
      resolveValue(e.clientX, e.clientY);
    },
    [resolveValue],
  );

  const onPointerUp = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    // Commit final value to React state
    onIntakeChange(currentValue.current);
  }, [onIntakeChange]);

  return (
    <div
      className="relative select-none"
      style={{ width: size, height: size, touchAction: "none" }}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${vb} ${vb}`}
        width={size}
        height={size}
        className="cursor-pointer"
        style={{ overflow: "visible" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* Background track */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="hsl(var(--secondary))"
          strokeWidth={strokeWidth}
        />
        {/* Progress arc */}
        <circle
          ref={arcRef}
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${center} ${center})`}
          style={{
            transition: "stroke-dashoffset 0.35s cubic-bezier(.4,0,.2,1)",
            willChange: "stroke-dashoffset",
          }}
        />
        {/* Draggable handle — larger hit area */}
        <circle
          cx={hx}
          cy={hy}
          r={handleR + 8}
          fill="transparent"
          style={{ cursor: "grab" }}
        />
        <circle
          ref={handleRef}
          cx={hx}
          cy={hy}
          r={handleR}
          fill="hsl(var(--primary))"
          stroke="hsl(var(--card))"
          strokeWidth={3}
          style={{
            cursor: "grab",
            filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.15))",
          }}
        />
      </svg>
      {/* Center label */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <Droplets size={14} className="text-primary mb-0.5" />
        <span
          ref={labelRef}
          className="text-xl font-bold tracking-display leading-tight"
        >
          {intake.toFixed(1)}L
        </span>
        <span className="text-[10px] text-muted-foreground">/ {goal}L</span>
        {intake >= goal && <span className="text-xs mt-0.5">🎉</span>}
      </div>
    </div>
  );
};

export default DraggableWaterGauge;
