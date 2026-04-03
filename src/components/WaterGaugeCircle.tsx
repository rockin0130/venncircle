import { Droplets } from "lucide-react";

interface WaterGaugeCircleProps {
  intake: number;
  goal: number;
  label: string;
}

const WaterGaugeCircle = ({ intake, goal, label }: WaterGaugeCircleProps) => {
  const percent = goal > 0 ? Math.min((intake / goal) * 100, 100) : 0;
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percent / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-[130px] h-[130px]">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
          <circle
            cx="60" cy="60" r={radius}
            fill="none"
            stroke="hsl(var(--secondary))"
            strokeWidth="8"
          />
          <circle
            cx="60" cy="60" r={radius}
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-500"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <Droplets size={16} className="text-primary mb-0.5" />
          <span className="text-lg font-bold tracking-display">{intake.toFixed(1)}L</span>
          <span className="text-[10px] text-muted-foreground">/ {goal}L</span>
        </div>
      </div>
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      {percent >= 100 && (
        <span className="text-[10px] font-semibold text-primary">🎉 Goal reached!</span>
      )}
    </div>
  );
};

export default WaterGaugeCircle;
