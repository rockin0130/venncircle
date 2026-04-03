import { useState } from "react";
import { X, Trash2, Pencil, Check } from "lucide-react";
import { useAppContext, ScheduledEvent, Task, GoogleCalendarEvent } from "@/context/AppContext";
import { formatTime } from "@/lib/formatTime";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface CalItemInfo {
  id: string;
  title: string;
  time: string;
  endTime?: string;
  allDay: boolean;
  type: "event" | "task" | "gcal";
  raw: ScheduledEvent | Task | GoogleCalendarEvent;
  isDueDateTask?: boolean;
  groupId?: string | null;
  done?: boolean;
}

interface Props {
  item: CalItemInfo | null;
  onClose: () => void;
  onEdit?: (item: CalItemInfo) => void;
}

const CalendarItemDetailModal = ({ item, onClose, onEdit }: Props) => {
  const { removeEvent, removeTask, toggleTask, toggleEventCompletion, toggleGcalCompletion, hideGcalEvent } = useAppContext();
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!item) return null;

  const realId = item.id.replace(/^(ev-|tk-|todo-|gcal-)/, "");

  const handleDelete = () => {
    if (item.type === "event") {
      removeEvent(realId);
      toast.success("Event deleted");
    } else if (item.type === "task") {
      removeTask(realId);
      toast.success("Task deleted");
    } else if (item.type === "gcal") {
      hideGcalEvent(realId);
      toast.success("Google Calendar event hidden");
    }
    onClose();
  };

  const handleToggleDone = () => {
    if (item.type === "event") toggleEventCompletion(realId);
    else if (item.type === "task") toggleTask(realId);
    else if (item.type === "gcal") toggleGcalCompletion(realId);
    onClose();
  };

  const handleEdit = () => {
    if (onEdit) onEdit(item);
  };

  const displayTime = () => {
    if (item.allDay) return "All day";
    if (item.type === "gcal" && item.time) {
      const start = new Date(item.time).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
      const end = item.endTime ? new Date(item.endTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "";
      return end ? `${start} – ${end}` : start;
    }
    const start = formatTime(item.time);
    const end = item.endTime ? formatTime(item.endTime) : "";
    return end && end !== start ? `${start} – ${end}` : start;
  };

  const displayDate = () => {
    if (item.type === "event") {
      const ev = item.raw as ScheduledEvent;
      return new Date(ev.year, ev.month, ev.day).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
    }
    if (item.type === "task") {
      const tk = item.raw as Task;
      if (tk.dueDate) {
        const [y, m, d] = tk.dueDate.split("-").map(Number);
        return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
      }
      if (tk.scheduledDay != null) {
        return new Date(tk.scheduledYear!, tk.scheduledMonth!, tk.scheduledDay!).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
      }
    }
    if (item.type === "gcal") {
      const ge = item.raw as GoogleCalendarEvent;
      if (ge.start) return new Date(ge.start).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
    }
    return "";
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 bg-card border-t border-border rounded-t-2xl shadow-xl max-h-[70dvh] overflow-y-auto pb-[env(safe-area-inset-bottom,0px)] sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-full sm:max-w-md sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border sm:pb-0">
        <div className="p-4 space-y-3">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <p className={cn("text-lg font-bold text-foreground", item.done && "line-through opacity-50")}>{item.title}</p>
              <p className="text-sm text-muted-foreground">{displayDate()}</p>
              <p className="text-sm text-muted-foreground">{displayTime()}</p>
              {item.type === "event" && (item.raw as ScheduledEvent).description && (
                <p className="text-sm text-muted-foreground mt-1">{(item.raw as ScheduledEvent).description}</p>
              )}
              {item.type === "task" && item.isDueDateTask && (
                <span className="inline-block mt-1 text-[11px] font-medium text-violet-500 bg-violet-500/10 px-2 py-0.5 rounded-full">To-do</span>
              )}
            </div>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-secondary flex-shrink-0">
              <X size={16} />
            </button>
          </div>

          {/* Action buttons */}
          <div className="space-y-2 pt-1">
            <button onClick={handleToggleDone}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl hover:bg-secondary transition-colors text-left">
              <Check size={16} className="text-muted-foreground" />
              {item.done ? "Mark as not done" : "Mark as done"}
            </button>

            {item.type !== "gcal" && (
              <button onClick={handleEdit}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl hover:bg-secondary transition-colors text-left">
                <Pencil size={16} className="text-muted-foreground" />
                Edit
              </button>
            )}

            {!confirmDelete ? (
              <button onClick={() => setConfirmDelete(true)}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl hover:bg-destructive/10 text-destructive transition-colors text-left">
                <Trash2 size={16} />
                {item.type === "gcal" ? "Hide" : "Delete"}
              </button>
            ) : (
              <div className="flex gap-2">
                <button onClick={() => setConfirmDelete(false)} className="flex-1 py-2.5 text-sm font-medium bg-secondary rounded-xl">Cancel</button>
                <button onClick={handleDelete} className="flex-1 py-2.5 text-sm font-semibold bg-destructive text-destructive-foreground rounded-xl">
                  {item.type === "gcal" ? "Hide" : "Delete"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default CalendarItemDetailModal;
