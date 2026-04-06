import { useState, useEffect, useCallback, useRef } from "react";
import { Waves, Music, CloudRain } from "lucide-react";

interface StudyFullscreenTimerProps {
  subject: string;
  groupName?: string;
  startedAt: string;
  todayTotal: number;
  goalHours: number;
  onStop: () => void;
  onDismiss: () => void;
}

const AMBIENT = [
  { key: "whitenoise", label: "White noise", icon: Waves },
  { key: "lofi", label: "Lo-fi", icon: Music },
  { key: "rain", label: "Rain", icon: CloudRain },
] as const;

function fmtTimer(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

const StudyFullscreenTimer = ({
  subject,
  groupName,
  startedAt,
  todayTotal,
  goalHours,
  onStop,
  onDismiss,
}: StudyFullscreenTimerProps) => {
  const [elapsed, setElapsed] = useState(0);
  const [activeSound, setActiveSound] = useState<string | null>(null);
  const touchStartY = useRef<number | null>(null);

  useEffect(() => {
    const update = () =>
      setElapsed(Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  const currentTotal = todayTotal + elapsed;
  const progress = Math.min(currentTotal / (goalHours * 3600), 1);

  const SIZE = 155;
  const STROKE = 9;
  const R = (SIZE - STROKE) / 2;
  const C = 2 * Math.PI * R;
  const offset = C - C * progress;
  const angle = 2 * Math.PI * progress - Math.PI / 2;
  const dotCx = SIZE / 2 + R * Math.cos(angle);
  const dotCy = SIZE / 2 + R * Math.sin(angle);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (touchStartY.current !== null) {
        const diff = e.changedTouches[0].clientY - touchStartY.current;
        if (diff > 100) onDismiss();
        touchStartY.current = null;
      }
    },
    [onDismiss]
  );

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center"
      style={{ background: "#111" }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Label */}
      <div className="mb-8 text-center">
        <span
          className="text-xs tracking-[0.15em] uppercase"
          style={{ color: "rgba(255,255,255,0.4)", fontFamily: "DM Sans, sans-serif" }}
        >
          {subject}
          {groupName ? ` · ${groupName}` : ""}
        </span>
      </div>

      {/* Ring */}
      <div className="relative flex items-center justify-center" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} className="absolute inset-0">
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={STROKE}
          />
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            stroke="#6C47FF"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={`${C - offset} ${offset}`}
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            style={{ transition: "stroke-dasharray 0.5s ease" }}
          />
          {progress > 0.01 && (
            <circle cx={dotCx} cy={dotCy} r={5} fill="#6C47FF" stroke="#111" strokeWidth={2} />
          )}
        </svg>
        <button
          onClick={onStop}
          className="relative z-10 flex flex-col items-center justify-center cursor-pointer"
          style={{ width: SIZE - 30, height: SIZE - 30 }}
        >
          <span
            className="text-[10px] uppercase tracking-[0.12em]"
            style={{ color: "rgba(255,255,255,0.35)" }}
          >
            Session
          </span>
          <span
            className="tabular-nums"
            style={{
              fontSize: 38,
              fontWeight: 500,
              color: "#fff",
              fontFamily: "DM Sans, sans-serif",
              lineHeight: 1.1,
            }}
          >
            {fmtTimer(elapsed)}
          </span>
          <span className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.35)" }}>
            {(currentTotal / 3600).toFixed(1)} / {goalHours}h today
          </span>
          <span className="text-[10px] mt-1" style={{ color: "#6C47FF" }}>
            tap to stop
          </span>
        </button>
      </div>

      {/* Ambient sounds */}
      <div className="flex gap-4 mt-10">
        {AMBIENT.map(({ key, label, icon: Icon }) => {
          const isActive = activeSound === key;
          return (
            <button
              key={key}
              onClick={() => setActiveSound(isActive ? null : key)}
              className="flex flex-col items-center gap-1.5"
            >
              <div
                className="w-10 h-10 rounded-[10px] flex items-center justify-center transition-colors"
                style={{
                  background: isActive ? "rgba(108,71,255,0.2)" : "rgba(255,255,255,0.06)",
                  border: isActive
                    ? "1px solid rgba(108,71,255,0.4)"
                    : "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <Icon size={18} color={isActive ? "#6C47FF" : "rgba(255,255,255,0.4)"} />
              </div>
              <span
                className="text-[9px]"
                style={{ color: isActive ? "#6C47FF" : "rgba(255,255,255,0.3)" }}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Hint */}
      <p
        className="absolute bottom-8 text-[10px] text-center"
        style={{ color: "rgba(255,255,255,0.2)" }}
      >
        Tap the ring to stop · swipe down to exit
      </p>
    </div>
  );
};

export default StudyFullscreenTimer;
