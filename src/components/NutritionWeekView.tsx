import { useRef, useEffect, useCallback, useMemo, useState } from "react";
import { loadWeekStart, type WeekStart } from "@/hooks/useWeekStart";

const PILL_H = 44;
const INITIAL_WEEKS_BEFORE = 1;
const INITIAL_WEEKS_AFTER = 1;
const LOAD_MORE_COUNT = 4;

const DAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const fmtDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const fmtShort = (d: Date) => {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[d.getMonth()]} ${d.getDate()}`;
};

function getMonday(d: Date): Date {
  const copy = new Date(d);
  const day = copy.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addWeeks(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n * 7);
  return copy;
}

function getWeekLabel(weekMonday: Date, todayMonday: Date): string {
  const diff = Math.round((weekMonday.getTime() - todayMonday.getTime()) / (7 * 86400000));
  const endDate = new Date(weekMonday);
  endDate.setDate(endDate.getDate() + 6);
  const range = `${fmtShort(weekMonday)} – ${fmtShort(endDate)}`;

  if (diff === 0) return `This week · ${range}`;
  if (diff === -1) return `Last week · ${range}`;
  if (diff === 1) return `Next week · ${range}`;
  return range;
}

interface Props {
  selectedDate: Date;
  onSelectDate: (d: Date) => void;
  mealDates: Set<string>;
}

const NutritionWeekView = ({ selectedDate, onSelectDate, mealDates }: Props) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const today = useMemo(() => new Date(), []);
  const todayStr = fmtDate(today);
  const selectedStr = fmtDate(selectedDate);
  const todayMonday = useMemo(() => getMonday(today), [today]);

  // Track the range of weeks loaded as offsets from todayMonday
  const [weekOffsetStart, setWeekOffsetStart] = useState(-INITIAL_WEEKS_BEFORE);
  const [weekOffsetEnd, setWeekOffsetEnd] = useState(INITIAL_WEEKS_AFTER);
  const loadingRef = useRef(false);

  const weeks = useMemo(() => {
    const result: Date[] = [];
    for (let i = weekOffsetStart; i <= weekOffsetEnd; i++) {
      result.push(addWeeks(todayMonday, i));
    }
    return result;
  }, [todayMonday, weekOffsetStart, weekOffsetEnd]);

  // Get 7 days for a week starting from Monday
  const getWeekDays = useCallback((monday: Date): Date[] => {
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(d.getDate() + i);
      days.push(d);
    }
    return days;
  }, []);

  // Infinite scroll handler
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || loadingRef.current) return;

    // Near top — load older weeks
    if (el.scrollTop < 80) {
      loadingRef.current = true;
      const prevHeight = el.scrollHeight;
      setWeekOffsetStart(prev => prev - LOAD_MORE_COUNT);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (scrollRef.current) {
            const newHeight = scrollRef.current.scrollHeight;
            scrollRef.current.scrollTop += newHeight - prevHeight;
          }
          loadingRef.current = false;
        });
      });
    }

    // Near bottom — load future weeks
    if (el.scrollTop + el.clientHeight > el.scrollHeight - 80) {
      loadingRef.current = true;
      setWeekOffsetEnd(prev => prev + LOAD_MORE_COUNT);
      requestAnimationFrame(() => {
        loadingRef.current = false;
      });
    }
  }, []);

  // On mount, scroll so "This week" is visible (it's at index INITIAL_WEEKS_BEFORE)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Each week row is roughly 80px; scroll to show "this week" with some padding
    const thisWeekIndex = INITIAL_WEEKS_BEFORE;
    el.scrollTop = Math.max(0, thisWeekIndex * 88 - 20);
  }, []);

  return (
    <div className="pb-2">
      {/* Day headers */}
      <div className="grid grid-cols-7 gap-1 mb-1 px-1">
        {DAY_HEADERS.map(d => (
          <div key={d} className="text-center text-[10px] font-medium text-muted-foreground">
            {d}
          </div>
        ))}
      </div>

      {/* Scrollable week rows */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="overflow-y-auto"
        style={{ maxHeight: 260, WebkitOverflowScrolling: "touch", scrollbarWidth: "none", overscrollBehavior: "contain" }}
      >
        {weeks.map((monday) => {
          const days = getWeekDays(monday);
          const label = getWeekLabel(monday, todayMonday);
          const isCurrentWeek = fmtDate(monday) === fmtDate(todayMonday);

          return (
            <div key={fmtDate(monday)} className="mb-2">
              <div className={`text-[10px] font-semibold mb-1 px-1 ${isCurrentWeek ? "text-primary" : "text-muted-foreground"}`}>
                {label}
              </div>
              <div className="grid grid-cols-7 gap-1 px-1">
                {days.map((d) => {
                  const ds = fmtDate(d);
                  const isSelected = ds === selectedStr;
                  const isToday = ds === todayStr;
                  const hasData = mealDates.has(ds);

                  return (
                    <button
                      key={ds}
                      onClick={() => onSelectDate(d)}
                      className={`flex flex-col items-center justify-center rounded-lg transition-colors
                        ${isSelected
                          ? "bg-primary text-primary-foreground"
                          : isToday
                            ? "bg-secondary border-2 border-primary text-foreground"
                            : "bg-secondary text-foreground hover:bg-muted"
                        }`}
                      style={{ height: PILL_H }}
                    >
                      <span className={`text-sm font-bold leading-tight ${isSelected ? "text-primary-foreground" : ""}`}>
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
        })}
      </div>
    </div>
  );
};

export default NutritionWeekView;
