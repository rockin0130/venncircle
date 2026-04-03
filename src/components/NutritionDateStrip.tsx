import { useRef, useEffect, useCallback, useMemo } from "react";

const DAY_LETTERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const PILL_W = 44; // px width of each pill
const GAP = 6;
const VISIBLE_DAYS_EACH_SIDE = 60;

const fmtDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

interface Props {
  selectedDate: Date;
  onSelectDate: (d: Date) => void;
  mealDates: Set<string>;
}

const NutritionDateStrip = ({ selectedDate, onSelectDate, mealDates }: Props) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const today = useMemo(() => new Date(), []);
  const todayStr = fmtDate(today);
  const selectedStr = fmtDate(selectedDate);
  const isToday = selectedStr === todayStr;

  // Generate date array centered on today
  const dates = useMemo(() => {
    const arr: Date[] = [];
    for (let i = -VISIBLE_DAYS_EACH_SIDE; i <= VISIBLE_DAYS_EACH_SIDE; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      arr.push(d);
    }
    return arr;
  }, [today]);

  const todayIndex = VISIBLE_DAYS_EACH_SIDE;

  // Scroll to center a given index
  const scrollToIndex = useCallback((idx: number, smooth = false) => {
    const el = scrollRef.current;
    if (!el) return;
    const pillCenter = idx * (PILL_W + GAP) + PILL_W / 2;
    const containerW = el.clientWidth - 48; // account for Today button space
    el.scrollTo({ left: pillCenter - containerW / 2, behavior: smooth ? "smooth" : "auto" });
  }, []);

  // On mount, scroll to selected date
  useEffect(() => {
    const diff = Math.round((selectedDate.getTime() - today.getTime()) / 86400000);
    scrollToIndex(todayIndex + diff);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTapToday = () => {
    onSelectDate(new Date());
    scrollToIndex(todayIndex, true);
  };

  const handleTapDate = (d: Date, idx: number) => {
    onSelectDate(d);
    scrollToIndex(idx, true);
  };

  return (
    <div className="relative flex items-center pb-2">
      <div
        ref={scrollRef}
        className="flex gap-1.5 overflow-x-auto scrollbar-hide flex-1"
        style={{ WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}
      >
        {dates.map((d, i) => {
          const ds = fmtDate(d);
          const isSelected = ds === selectedStr;
          const isTodayPill = ds === todayStr;
          const hasData = mealDates.has(ds);

          return (
            <button
              key={ds}
              onClick={() => handleTapDate(d, i)}
              className={`flex-shrink-0 flex flex-col items-center justify-center rounded-xl transition-colors
                ${isSelected
                  ? "bg-primary text-primary-foreground"
                  : isTodayPill
                    ? "bg-secondary border-2 border-primary text-foreground"
                    : "bg-secondary text-foreground hover:bg-muted"
                }`}
              style={{ width: PILL_W, height: 58 }}
            >
              <span className={`text-[10px] leading-none font-medium ${isSelected ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                {DAY_LETTERS[d.getDay()]}
              </span>
              <span className={`text-sm font-bold leading-tight mt-0.5 ${isSelected ? "text-primary-foreground" : ""}`}>
                {d.getDate()}
              </span>
              {hasData && (
                <span className={`w-1 h-1 rounded-full mt-0.5 ${isSelected ? "bg-primary-foreground" : "bg-primary"}`} />
              )}
              {!hasData && <span className="w-1 h-1 mt-0.5" />}
            </button>
          );
        })}
      </div>

    </div>
  );
};

export default NutritionDateStrip;
