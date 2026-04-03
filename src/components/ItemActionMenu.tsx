import { useState } from "react";
import { MoreVertical, Trash2, EyeOff, Eye, CalendarDays, ArrowRight } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

interface ItemActionMenuProps {
  /** Hide from others toggle */
  hidden?: boolean;
  onToggleVisibility?: () => void;
  /** Reschedule actions */
  onMoveToTomorrow?: () => void;
  onMoveToDate?: (date: Date) => void;
  /** Delete */
  onRemove?: () => void;
}

const ItemActionMenu = ({ hidden, onToggleVisibility, onMoveToTomorrow, onMoveToDate, onRemove }: ItemActionMenuProps) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  return (
    <Popover open={menuOpen} onOpenChange={(open) => { setMenuOpen(open); if (!open) setShowDatePicker(false); }}>
      <PopoverTrigger asChild>
        <button
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreVertical size={16} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto min-w-[180px] p-0 z-[60]" align="end" sideOffset={4}>
        {showDatePicker ? (
          <Calendar
            mode="single"
            onSelect={(date) => {
              if (date && onMoveToDate) {
                onMoveToDate(date);
                setShowDatePicker(false);
                setMenuOpen(false);
              }
            }}
            initialFocus
            className={cn("p-3 pointer-events-auto")}
          />
        ) : (
          <div className="py-1">
            {onToggleVisibility && (
              <button
                onClick={() => { onToggleVisibility(); setMenuOpen(false); }}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-foreground hover:bg-secondary transition-colors"
              >
                {hidden ? <Eye size={14} /> : <EyeOff size={14} />}
                {hidden ? "Show to others" : "Hide from others"}
              </button>
            )}
            {onMoveToTomorrow && (
              <button
                onClick={() => { onMoveToTomorrow(); setMenuOpen(false); }}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-foreground hover:bg-secondary transition-colors"
              >
                <ArrowRight size={14} /> Move to tomorrow
              </button>
            )}
            {onMoveToDate && (
              <button
                onClick={() => setShowDatePicker(true)}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-foreground hover:bg-secondary transition-colors"
              >
                <CalendarDays size={14} /> Move to another date
              </button>
            )}
            {onRemove && (
              <button
                onClick={() => { onRemove(); setMenuOpen(false); }}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-destructive hover:bg-destructive/10 transition-colors"
              >
                <Trash2 size={14} /> Delete
              </button>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};

export default ItemActionMenu;
