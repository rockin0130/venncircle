import { useState } from "react";
import { MoreVertical, Trash2, CalendarDays, X } from "lucide-react";
import { useAppContext, Task } from "@/context/AppContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

interface TaskActionMenuProps {
  taskId: string;
}

const NOTICE_OPTIONS = [-1, 0, 1, 2, 3, 7];

const TaskActionMenu = ({ taskId }: TaskActionMenuProps) => {
  const { removeTask, updateTask, tasks } = useAppContext();
  const [open, setOpen] = useState(false);
  const [showDueDatePicker, setShowDueDatePicker] = useState(false);

  const task = tasks.find((t) => t.id === taskId);
  const currentDueDate = task?.dueDate ? new Date(task.dueDate + "T00:00:00") : undefined;
  const currentNotice = task?.priorNoticeDays ?? 0;
  const [selectedNotice, setSelectedNotice] = useState(currentNotice);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(currentDueDate);
  const [customNotice, setCustomNotice] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(!NOTICE_OPTIONS.includes(currentNotice) && currentNotice > 0);

  const handleDelete = () => {
    removeTask(taskId);
    setOpen(false);
  };

  const handleSaveDueDate = () => {
    if (!selectedDate) return;
    const yyyy = selectedDate.getFullYear();
    const mm = String(selectedDate.getMonth() + 1).padStart(2, "0");
    const dd = String(selectedDate.getDate()).padStart(2, "0");
    const notice = showCustomInput ? (parseInt(customNotice) || 0) : selectedNotice;
    updateTask(taskId, {
      dueDate: `${yyyy}-${mm}-${dd}`,
      priorNoticeDays: notice,
    });
    setOpen(false);
    setShowDueDatePicker(false);
  };

  const handleClearDueDate = () => {
    updateTask(taskId, {
      dueDate: null,
      priorNoticeDays: 0,
    });
    setOpen(false);
    setShowDueDatePicker(false);
  };

  return (
    <div className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); setShowDueDatePicker(false); setSelectedNotice(currentNotice); }}
        className="text-muted-foreground p-1"
      >
        <MoreVertical size={16} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => { setOpen(false); setShowDueDatePicker(false); }} />
          <div className="absolute right-0 top-8 z-50 bg-card border border-border rounded-xl shadow-lg min-w-[180px] overflow-visible" onClick={(e) => e.stopPropagation()}>
            {!showDueDatePicker ? (
              <>
                <button
                  onClick={() => setShowDueDatePicker(true)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium hover:bg-secondary transition-colors text-left"
                >
                  <CalendarDays size={16} className="text-muted-foreground" />
                  {task?.dueDate ? "Change due date" : "Set due date"}
                </button>
                <button
                  onClick={handleDelete}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium hover:bg-destructive/10 text-destructive transition-colors text-left"
                >
                  <Trash2 size={16} />
                  Delete
                </button>
              </>
            ) : (
              <div className="p-3 space-y-3 min-w-[280px]">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Due date</span>
                  <button onClick={() => setShowDueDatePicker(false)} className="text-muted-foreground hover:text-foreground">
                    <X size={14} />
                  </button>
                </div>

                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => setSelectedDate(date)}
                  className={cn("p-2 pointer-events-auto rounded-lg border border-border")}
                />

                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1.5">Give notice</p>
                  <div className="flex flex-wrap gap-1.5">
                    {NOTICE_OPTIONS.map((n) => (
                      <button
                        key={n}
                        onClick={() => { setSelectedNotice(n); setShowCustomInput(false); }}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          !showCustomInput && selectedNotice === n
                            ? "bg-primary text-primary-foreground"
                            : "bg-secondary text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {n === -1 ? "Starting today" : n === 0 ? "Due day" : n === 1 ? "1 day before" : `${n} days before`}
                      </button>
                    ))}
                    <button
                      onClick={() => { setShowCustomInput(true); setCustomNotice(String(showCustomInput ? customNotice : "")); }}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        showCustomInput
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Custom
                    </button>
                  </div>
                  {showCustomInput && (
                    <div className="flex items-center gap-2 mt-2">
                      <input
                        type="number"
                        min={0}
                        value={customNotice}
                        onChange={(e) => setCustomNotice(e.target.value)}
                        className="w-16 px-2 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground text-center"
                        placeholder="0"
                      />
                      <span className="text-xs text-muted-foreground">days before</span>
                    </div>
                  )}
                </div>

                <button
                  onClick={handleSaveDueDate}
                  disabled={!selectedDate}
                  className="w-full py-2 text-xs font-semibold bg-primary text-primary-foreground rounded-lg transition-colors disabled:opacity-40"
                >
                  Save
                </button>

                {task?.dueDate && (
                  <button
                    onClick={handleClearDueDate}
                    className="w-full py-2 text-xs font-medium text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                  >
                    Remove due date
                  </button>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default TaskActionMenu;
