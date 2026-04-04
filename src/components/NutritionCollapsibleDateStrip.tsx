import { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp } from "lucide-react";
import { loadWeekStart } from "@/hooks/useWeekStart";

const fmtDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const DAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const fmtShort = (d: Date) => {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[d.getMonth()]} ${d.getDate()}`;
};

function getWeekStart(d: Date): Date {
  const ws = loadWeekStart();
  const copy = new Date(d);
  const day = copy.getDay();
  const diff = ws === "monday" ? (day === 0 ? -6 : 1 - day) : -day;
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addWeeks(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n * 7);
  return copy;
}

function getWeekDays(start: Date): Date[] {
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    days.push(d);
  }
  return days;
}

function getWeekLabel(weekStart: Date, todayWeekStart: Date): { label: string; prefix: string } {
  const diff = Math.round((weekStart.getTime() - todayWeekStart.getTime()) / (7 * 86400000));
  const endDate = new Date(weekStart);
  endDate.setDate(endDate.getDate() + 6);
  const range = `${fmtShort(weekStart)} – ${fmtShort(endDate)}`;
  if (diff === 0) return { prefix: "This week", label: range };
  if (diff === -1) return { prefix: "Last week", label: range };
  if (diff === 1) return { prefix: "Next week", label: range };
  return { prefix: "", label: range };
}

interface Props {
  selectedDate: Date;
  onSelectDate: (d: Date) => void;
  loggedDates: Set<string>;
  plannedDates: Set<string>;
}

const NutritionCollapsibleDateStrip = ({ selectedDate, onSelectDate, loggedDates, plannedDates }: Props) => {
  const [expanded, setExpanded] = useState(false);
  const today = useMemo(() => new Date(), []);
  const todayStr = fmtDate(today);
  const selectedStr = fmtDate(selectedDate);
  const todayWeekStart = useMemo(() => getWeekStart(today), [today]);
  const selectedWeekStart = useMemo(() => getWeekStart(selectedDate), [selectedDate]);

  const weeks = useMemo(() => {
    if (!expanded) {
      return [{ start: selectedWeekStart, offset: Math.round((selectedWeekStart.getTime() - todayWeekStart.getTime()) / (7 * 86400000)) }];
    }
    return [-1, 0, 1].map(offset => ({
      start: addWeeks(todayWeekStart, offset),
      offset,
    }));
  }, [expanded, selectedWeekStart, todayWeekStart]);

  const headerLabel = useMemo(() => {
    if (expanded) {
      const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      return `${months[today.getMonth()]} ${today.getFullYear()}`;
    }
    const { prefix, label } = getWeekLabel(selectedWeekStart, todayWeekStart);
    return prefix ? `${prefix} · ${label}` : label;
  }, [expanded, selectedWeekStart, todayWeekStart, today]);

  const getDotColor = useCallback((ds: string) => {
    if (loggedDates.has(ds)) return "bg-green-500";
    if (plannedDates.has(ds)) return "bg-amber-500";
    return null;
  }, [loggedDates, plannedDates]);

  const getPillBg = useCallback((ds: string, isSelected: boolean, isTodayPill: boolean) => {
    if (isSelected) return "bg-primary text-primary-foreground";
    if (isTodayPill) return "bg-secondary border-2 border-primary text-foreground";
    if (loggedDates.has(ds)) return "bg-green-500/10 text-foreground";
    if (plannedDates.has(ds) && ds > todayStr) return "bg-amber-500/10 text-foreground";
    return "bg-secondary text-foreground hover:bg-muted";
  }, [loggedDates, plannedDates, todayStr]);

  const renderWeekRow = (weekStart: Date) => {
    const days = getWeekDays(weekStart);
    return (
      <div className="grid grid-cols-7 gap-1">
        {days.map(d => {
          const ds = fmtDate(d);
          const isSelected = ds === selectedStr;
          const isTodayPill = ds === todayStr;
          const dot = getDotColor(ds);

          return (
            <button
              key={ds}
              onClick={() => onSelectDate(d)}
              className={`flex flex-col items-center justify-center rounded-xl transition-colors ${getPillBg(ds, isSelected, isTodayPill)}`}
              style={{ height: 52 }}
            >
              <span className={`text-[9px] leading-none font-medium ${isSelected ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                {DAY_ABBR[d.getDay()]}
              </span>
              <span className={`text-sm font-bold leading-tight mt-0.5 ${isSelected ? "text-primary-foreground" : ""}`}>
                {d.getDate()}
              </span>
              {dot ? (
                <span className={`w-1 h-1 rounded-full mt-0.5 ${isSelected ? "bg-primary-foreground" : dot}`} />
              ) : (
                <span className="w-1 h-1 mt-0.5" />
              )}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div className="bg-card rounded-2xl border border-border shadow-card mb-2 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-[11px] font-semibold text-foreground">{headerLabel}</span>
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold text-muted-foreground hover:bg-secondary transition-colors"
        >
          {expanded ? (
            <><ChevronUp size={12} /> Collapse</>
          ) : (
            <><ChevronDown size={12} /> Expand</>
          )}
        </button>
      </div>

      {/* Week rows */}
      <div className="px-2 pb-2">
        <AnimatePresence mode="wait">
          {expanded ? (
            <motion.div
              key="expanded"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="space-y-1"
            >
              {weeks.map(({ start, offset }) => {
                const { prefix } = getWeekLabel(start, todayWeekStart);
                const isThis = offset === 0;
                const isNext = offset === 1;
                return (
                  <div key={fmtDate(start)}>
                    {offset > -1 && <div className="border-t border-border/30 my-1" />}
                    <p className={`text-[9px] font-semibold mb-1 px-1 ${isThis ? "text-primary" : isNext ? "text-amber-600" : "text-muted-foreground"}`}>
                      {prefix || getWeekLabel(start, todayWeekStart).label}
                      {prefix ? ` · ${getWeekLabel(start, todayWeekStart).label}` : ""}
                    </p>
                    {renderWeekRow(start)}
                  </div>
                );
              })}
            </motion.div>
          ) : (
            <motion.div
              key="collapsed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {renderWeekRow(weeks[0].start)}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default NutritionCollapsibleDateStrip;
