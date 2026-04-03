import { Droplets } from "lucide-react";
import { useAppContext } from "@/context/AppContext";
import { Slider } from "@/components/ui/slider";

const WaterSlider = () => {
  const { waterIntake, waterGoal, setWaterIntake, setWaterGoal, resetWater } = useAppContext();
  const waterPercent = waterGoal > 0 ? Math.min((waterIntake / waterGoal) * 100, 100) : 0;

  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold tracking-display flex items-center gap-2">
          <Droplets size={20} className="text-primary" /> Water Intake
        </h2>
        <div className="flex gap-1">
          {[2, 2.5, 3, 3.5, 4].map((g) => (
            <button
              key={g}
              onClick={() => setWaterGoal(g)}
              className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition-all ${
                waterGoal === g ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
              }`}
            >
              {g}L
            </button>
          ))}
        </div>
      </div>

      <div className="bg-card rounded-xl p-5 border border-border shadow-card">
        <div className="flex items-center justify-between mb-2">
          <span className="text-2xl font-bold tracking-display">{waterIntake.toFixed(1)}L</span>
          <span className="text-sm text-muted-foreground">/ {waterGoal}L</span>
        </div>

        <Slider
          value={[waterIntake]}
          min={0}
          max={waterGoal}
          step={0.1}
          onValueChange={([val]) => setWaterIntake(val)}
          className="my-4"
        />

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>0L</span>
          <span className="font-semibold text-primary">
            {waterPercent >= 100 ? "🎉 Goal reached!" : `${Math.round(waterPercent)}%`}
          </span>
          <span>{waterGoal}L</span>
        </div>

        <div className="flex gap-2 mt-3">
          {[0.25, 0.5].map((amt) => (
            <button
              key={amt}
              onClick={() => setWaterIntake(Math.min(waterIntake + amt, waterGoal))}
              className="flex-1 py-2 bg-primary/10 text-primary rounded-lg text-xs font-bold active:scale-[0.97] transition-transform"
            >
              +{amt * 1000}ml
            </button>
          ))}
          <button
            onClick={resetWater}
            className="py-2 px-3 bg-secondary text-muted-foreground rounded-lg text-xs font-medium active:scale-[0.97] transition-transform"
          >
            Reset
          </button>
        </div>
      </div>
    </section>
  );
};

export default WaterSlider;
