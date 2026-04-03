import { motion } from "framer-motion";
import { Lock } from "lucide-react";
import { SpecialDay, getDayCount, getDisplayLabel, parseLocalDate } from "./SpecialDayTypes";

interface Props {
  day: SpecialDay;
  now: Date;
  onEdit: (day: SpecialDay) => void;
  isPrivate?: boolean;
  onCardClick?: (day: SpecialDay) => void;
}

const PLACEHOLDER_GRADIENTS = [
  "linear-gradient(135deg, hsl(30 30% 88%), hsl(35 25% 82%), hsl(25 20% 78%))",
  "linear-gradient(135deg, hsl(340 20% 88%), hsl(330 18% 82%), hsl(320 15% 78%))",
  "linear-gradient(135deg, hsl(210 20% 88%), hsl(220 18% 82%), hsl(230 15% 78%))",
];

const SpecialDayHeroCard = ({ day, now, onEdit, isPrivate = false, onCardClick }: Props) => {
  const count = getDayCount(day, now);
  const label = getDisplayLabel(day, now);
  const eventDate = parseLocalDate(day.event_date);
  const hasPhoto = !!day.photo_url;
  const gradientIdx = day.title.length % PLACEHOLDER_GRADIENTS.length;

  const shortDate = eventDate.toLocaleDateString("en-US", { month: "long", day: "numeric" });
  const fullDate = eventDate.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Determine hero text
  const heroSubtext = day.event_type === "birthday"
    ? "days to go"
    : day.count_direction === "since"
      ? "days together"
      : "days to go";

  return (
    <div className="mb-1">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="rounded-[1.5rem] bg-card/50 backdrop-blur-md border border-border/30 shadow-lg p-2.5 relative"
      >
        <div
          onClick={() => (onCardClick || onEdit)(day)}
          className="cursor-pointer"
          role="button"
          tabIndex={0}
        >
        <div
          className="relative rounded-[1.1rem] overflow-hidden"
          style={{ aspectRatio: "5 / 4" }}
        >
          {hasPhoto ? (
            <img
              src={day.photo_url!}
              alt={day.title}
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <div
              className="absolute inset-0"
              style={{ background: PLACEHOLDER_GRADIENTS[gradientIdx] }}
            >
              <div className="absolute inset-0 flex items-center justify-center opacity-15 text-[96px] select-none pointer-events-none">
                {day.icon}
              </div>
            </div>
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/15 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/30 to-transparent" />

          <div className="absolute inset-0 flex flex-col justify-end p-5 pb-4">
            <div className="flex items-end justify-between">
              <div>
                <h2 className="text-white/95 text-[17px] font-semibold tracking-tight drop-shadow-sm">
                  {day.title}
                </h2>
                <p
                  className="text-white text-[52px] font-extrabold tracking-tighter leading-[1] mt-0.5 drop-shadow-md"
                  style={{ fontFeatureSettings: "'tnum'" }}
                >
                  {count === 0 ? "Today!" : count.toLocaleString()}
                </p>
                <p className="text-white/75 text-[13px] font-medium mt-0.5">
                  {count === 0 ? label.secondary : heroSubtext}
                </p>
                {label.secondary && count !== 0 && (
                  <p className="text-white/60 text-[11px] font-medium mt-0.5">
                    {label.secondary}
                  </p>
                )}
              </div>
              <div className="text-right pb-1">
                <p className="text-white/85 text-[13px] font-medium drop-shadow-sm">
                  {shortDate}
                </p>
              </div>
            </div>
          </div>

          {isPrivate && (
            <div className="absolute top-3 right-3 z-10">
              <div className="w-7 h-7 rounded-full bg-white/15 backdrop-blur-lg flex items-center justify-center">
                <Lock size={11} className="text-white/70" />
              </div>
            </div>
          )}
        </div>
        </div>
      </motion.div>

      <p className="text-center text-[11px] text-muted-foreground/70 mt-2 tracking-wide font-medium">
        {fullDate}
      </p>
    </div>
  );
};

export default SpecialDayHeroCard;
