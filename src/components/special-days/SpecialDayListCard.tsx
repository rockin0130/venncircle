import { motion } from "framer-motion";
import { Lock } from "lucide-react";
import { SpecialDay, getDisplayLabel, parseLocalDate } from "./SpecialDayTypes";

interface Props {
  day: SpecialDay;
  now: Date;
  onEdit: (day: SpecialDay) => void;
  index?: number;
  groupName?: string;
  isPrivate?: boolean;
}

const SpecialDayListCard = ({ day, now, onEdit, index = 0, groupName, isPrivate = false }: Props) => {
  const label = getDisplayLabel(day, now);
  const eventDate = parseLocalDate(day.event_date);
  const hasPhoto = !!day.photo_url;

  const dateStr = day.event_type === "birthday" || day.count_direction === "until"
    ? eventDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : eventDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <motion.button
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.35 }}
      onClick={() => onEdit(day)}
      className="w-full flex items-center gap-3 bg-card/60 backdrop-blur-sm rounded-2xl p-3 border border-border/30 shadow-sm hover:shadow-md hover:bg-card/80 transition-all text-left active:scale-[0.98]"
    >
      <div className="flex-shrink-0 flex items-center gap-2.5">
        <span className="text-lg opacity-60">{day.icon}</span>
        <div className="w-[52px] h-[52px] rounded-xl overflow-hidden flex-shrink-0 bg-secondary/40 border border-border/20">
          {hasPhoto ? (
            <img src={day.photo_url!} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-xl bg-gradient-to-br from-secondary/60 to-secondary/30">
              {day.icon}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-[13px] font-bold text-foreground truncate leading-tight">{day.title}</p>
          {isPrivate && (
            <Lock size={10} className="text-muted-foreground/40 flex-shrink-0" />
          )}
        </div>
        <p className="text-[11px] text-muted-foreground/70 mt-0.5">{dateStr}</p>
        <p className="text-[12px] font-bold text-foreground/80 mt-0.5">{label.primary}</p>
        {label.secondary && (
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">{label.secondary}</p>
        )}
        {groupName && (
          <p className="text-[9px] text-muted-foreground/50 mt-0.5 font-medium">📌 {groupName}</p>
        )}
      </div>
    </motion.button>
  );
};

export default SpecialDayListCard;
