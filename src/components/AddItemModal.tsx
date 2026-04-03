import { useState } from "react";
import { X, CalendarDays, ListTodo } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppContext } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import { useGroupContext } from "@/hooks/useGroupContext";
import { toast } from "sonner";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type ModalStep = "choose" | "calendar" | "habit";

const NOTICE_OPTIONS = [-1, 0, 1, 2, 3, 7];

interface AddItemModalProps {
  open: boolean;
  onClose: () => void;
}

const AddItemModal = ({ open, onClose }: AddItemModalProps) => {
  const { addEvent, addHabit, addTask, habitSections } = useAppContext();
  const { activeGroup } = useAuth();
  const { filters: modalGroupFilters } = useGroupContext();
  const [step, setStep] = useState<ModalStep>("choose");
  const [selectedCategory, setSelectedCategory] = useState("");

  // Calendar form state
  const [calTitle, setCalTitle] = useState("");
  const [calStartDate, setCalStartDate] = useState("");
  const [calStartTime, setCalStartTime] = useState("");
  const [calEndDate, setCalEndDate] = useState("");
  const [calEndTime, setCalEndTime] = useState("");
  const [calAllDay, setCalAllDay] = useState(false);
  const [calDesc, setCalDesc] = useState("");
  const [calUser, setCalUser] = useState<string>("me");
  const [calTag, setCalTag] = useState<"Work" | "Personal" | "Household">("Personal");

  // To Do mode state
  const [isTodoMode, setIsTodoMode] = useState(false);
  const [todoDueDate, setTodoDueDate] = useState<Date | undefined>(undefined);
  const [todoPriorNotice, setTodoPriorNotice] = useState(0);
  const [todoDueDatePickerOpen, setTodoDueDatePickerOpen] = useState(false);

  // Habit form state
  const [habitLabel, setHabitLabel] = useState("");

  const reset = () => {
    setStep("choose");
    setSelectedCategory("");
    setCalTitle("");
    setCalStartDate("");
    setCalStartTime("");
    setCalEndDate("");
    setCalEndTime("");
    setCalAllDay(false);
    setCalDesc("");
    setCalUser("me");
    setCalTag("Personal");
    setHabitLabel("");
    setIsTodoMode(false);
    setTodoDueDate(undefined);
    setTodoPriorNotice(0);
    setTodoDueDatePickerOpen(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleAddCalendar = () => {
    if (!calTitle.trim()) return;
    const now = new Date();
    let day = now.getDate();
    let month = now.getMonth();
    let year = now.getFullYear();

    if (calStartDate) {
      const [y, m, d] = calStartDate.split("-").map(Number);
      day = d;
      month = m - 1;
      year = y;
    }

    let endDay = day, endMonth = month, endYear = year;
    if (calEndDate) {
      const [y, m, d] = calEndDate.split("-").map(Number);
      endDay = d;
      endMonth = m - 1;
      endYear = y;
    }

    addEvent({
      title: calTitle.trim(),
      time: calAllDay ? "All day" : (calStartTime || "All day"),
      description: calDesc,
      day,
      month,
      year,
      endDay,
      endMonth,
      endYear,
      endTime: calAllDay ? "" : (calEndTime || calStartTime || ""),
      allDay: calAllDay,
      user: calUser as "me" | "partner" | "both",
    });

    toast.success(`Scheduled: ${calTitle.trim()}`);
    handleClose();
  };

  const handleAddTodo = () => {
    if (!calTitle.trim()) return;
    const dueDateStr = todoDueDate
      ? `${todoDueDate.getFullYear()}-${String(todoDueDate.getMonth() + 1).padStart(2, "0")}-${String(todoDueDate.getDate()).padStart(2, "0")}`
      : null;

    addTask({
      title: calTitle.trim(),
      time: "",
      tag: calTag,
      assignee: calUser as "me" | "partner" | "both",
      dueDate: dueDateStr,
      priorNoticeDays: todoPriorNotice,
    });

    toast.success(`To-do added: ${calTitle.trim()}`);
    handleClose();
  };

  const handleAddHabit = () => {
    if (!habitLabel.trim() || !selectedCategory) return;
    addHabit(habitLabel.trim(), selectedCategory);
    handleClose();
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] bg-black/50 flex items-end justify-center"
        onClick={handleClose}
      >
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="w-full max-w-md bg-card rounded-t-2xl border-t border-border flex flex-col"
          style={{ maxHeight: "calc(100vh - 2rem)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Fixed header */}
          <div className="flex items-center justify-between p-5 pb-3 flex-shrink-0">
            <h2 className="text-lg font-bold tracking-display">
              {step === "choose" ? "Add New" : step === "calendar" ? (isTodoMode ? "New To Do" : "Schedule Event") : "New Habit"}
            </h2>
            <button onClick={handleClose} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
              <X size={16} />
            </button>
          </div>

          {/* Scrollable content */}
          <div className="overflow-y-auto flex-1 px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px)+60px)]">
            {step === "choose" && (
              <div className="space-y-3">
                <button
                  onClick={() => setStep("calendar")}
                  className="w-full flex items-center gap-4 p-4 bg-secondary rounded-xl transition-all active:scale-[0.98]"
                >
                  <span className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                    <CalendarDays size={22} />
                  </span>
                  <div className="text-left">
                    <p className="text-[15px] font-semibold">Calendar / To Do</p>
                    <p className="text-xs text-muted-foreground">Add an event or a to-do item</p>
                  </div>
                </button>
                {habitSections.map((section) => (
                  <button
                    key={section.key}
                    onClick={() => { setSelectedCategory(section.key); setStep("habit"); }}
                    className="w-full flex items-center gap-4 p-4 bg-secondary rounded-xl transition-all active:scale-[0.98]"
                  >
                    <span className="w-11 h-11 rounded-xl bg-accent/20 flex items-center justify-center text-lg">
                      {section.icon}
                    </span>
                    <div className="text-left">
                      <p className="text-[15px] font-semibold">{section.label}</p>
                      <p className="text-xs text-muted-foreground">Add a habit to {section.label.toLowerCase()}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {step === "calendar" && (
              <div className="space-y-3">
                {/* Mode toggle: Event vs To Do */}
                <div className="flex gap-2 bg-secondary rounded-xl p-1">
                  <button
                    onClick={() => setIsTodoMode(false)}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-semibold rounded-lg transition-all ${
                      !isTodoMode ? "bg-card text-foreground shadow-card" : "text-muted-foreground"
                    }`}
                  >
                    <CalendarDays size={14} /> Event
                  </button>
                  <button
                    onClick={() => setIsTodoMode(true)}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-semibold rounded-lg transition-all ${
                      isTodoMode ? "bg-card text-foreground shadow-card" : "text-muted-foreground"
                    }`}
                  >
                    <ListTodo size={14} /> To Do
                  </button>
                </div>

                <input
                  value={calTitle}
                  onChange={(e) => setCalTitle(e.target.value)}
                  placeholder={isTodoMode ? "What do you need to do?" : "Event title..."}
                  className="w-full bg-secondary rounded-xl px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
                  autoFocus
                />

                {isTodoMode ? (
                  /* ── To Do mode fields ── */
                  <>
                    {/* Due date picker */}
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Due date (optional)</p>
                      <Popover open={todoDueDatePickerOpen} onOpenChange={setTodoDueDatePickerOpen}>
                        <PopoverTrigger asChild>
                          <button className="w-full bg-secondary rounded-xl px-4 py-3 text-sm text-left flex items-center gap-2">
                            <CalendarDays size={14} className="text-muted-foreground" />
                            {todoDueDate
                              ? todoDueDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })
                              : <span className="text-muted-foreground">No due date</span>
                            }
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 z-[70]" align="start">
                          <Calendar
                            mode="single"
                            selected={todoDueDate}
                            onSelect={(date) => {
                              setTodoDueDate(date);
                              setTodoDueDatePickerOpen(false);
                            }}
                            initialFocus
                            className={cn("p-3 pointer-events-auto")}
                          />
                        </PopoverContent>
                      </Popover>
                      {todoDueDate && (
                        <button
                          onClick={() => setTodoDueDate(undefined)}
                          className="text-xs text-destructive mt-1 ml-1"
                        >
                          Remove due date
                        </button>
                      )}
                    </div>

                    {/* Prior notice selector - only show when due date is set */}
                    {todoDueDate && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Give notice</p>
                        <div className="flex flex-wrap gap-1.5">
                          {NOTICE_OPTIONS.map((n) => (
                            <button
                              key={n}
                              onClick={() => setTodoPriorNotice(n)}
                              className={`px-2.5 py-2 rounded-xl text-xs font-medium border transition-all ${
                                todoPriorNotice === n
                                  ? "border-primary bg-primary/10 text-primary"
                                  : "border-border text-muted-foreground"
                              }`}
                            >
                              {n === -1 ? "Starting today" : n === 0 ? "Due day only" : n === 1 ? "1 day before" : `${n} days before`}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Description */}
                    <textarea
                      value={calDesc}
                      onChange={(e) => setCalDesc(e.target.value)}
                      placeholder="Notes (optional)..."
                      rows={2}
                      className="w-full bg-secondary rounded-xl px-4 py-3 text-sm outline-none placeholder:text-muted-foreground resize-none"
                    />
                  </>
                ) : (
                  /* ── Event mode fields (existing) ── */
                  <>
                    <label className="flex items-center gap-2 text-sm px-1">
                      <input type="checkbox" checked={calAllDay} onChange={(e) => setCalAllDay(e.target.checked)} className="rounded" />
                      <span className="text-muted-foreground">All-day</span>
                    </label>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="text-[10px] uppercase font-semibold text-muted-foreground px-1">Start</label>
                        <input type="date" value={calStartDate} onChange={(e) => {
                          setCalStartDate(e.target.value);
                          if (!calEndDate || e.target.value > calEndDate) setCalEndDate(e.target.value);
                        }} className="w-full bg-secondary rounded-xl px-4 py-3 text-sm outline-none text-foreground" />
                      </div>
                      {!calAllDay && (
                        <div className="w-28">
                          <label className="text-[10px] uppercase font-semibold text-muted-foreground px-1">Time</label>
                          <input type="time" value={calStartTime} onChange={(e) => {
                            setCalStartTime(e.target.value);
                            if (e.target.value && !calEndTime) {
                              const [h, m] = e.target.value.split(":").map(Number);
                              setCalEndTime(`${String(Math.min(h + 1, 23)).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
                            }
                          }} className="w-full bg-secondary rounded-xl px-4 py-3 text-sm outline-none text-foreground" />
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="text-[10px] uppercase font-semibold text-muted-foreground px-1">End</label>
                        <input type="date" value={calEndDate} onChange={(e) => setCalEndDate(e.target.value)} min={calStartDate}
                          className="w-full bg-secondary rounded-xl px-4 py-3 text-sm outline-none text-foreground" />
                      </div>
                      {!calAllDay && (
                        <div className="w-28">
                          <label className="text-[10px] uppercase font-semibold text-muted-foreground px-1">Time</label>
                          <input type="time" value={calEndTime} onChange={(e) => setCalEndTime(e.target.value)}
                            className="w-full bg-secondary rounded-xl px-4 py-3 text-sm outline-none text-foreground" />
                        </div>
                      )}
                    </div>
                    <textarea
                      value={calDesc}
                      onChange={(e) => setCalDesc(e.target.value)}
                      placeholder="Description (optional)..."
                      rows={2}
                      className="w-full bg-secondary rounded-xl px-4 py-3 text-sm outline-none placeholder:text-muted-foreground resize-none"
                    />
                  </>
                )}

                {/* Assignee selector */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Assign to</p>
                  <div className="flex gap-2 overflow-x-auto scrollbar-hide">
                    {modalGroupFilters.length <= 1 ? (
                      <button className="flex-1 py-2.5 text-xs font-semibold rounded-xl border border-primary bg-primary/10 text-primary">
                        Mine
                      </button>
                    ) : (
                      modalGroupFilters.map((f) => {
                        const assigneeValue = f.id === "mine" ? "me" : f.id === "partner" ? "partner" : f.id === "household" ? "both" : f.id;
                        const label = f.id === "mine" ? "Mine" : f.id === "household" ? "All" : f.label;
                        return (
                          <button
                            key={f.id}
                            onClick={() => setCalUser(assigneeValue)}
                            className={`flex-1 py-2.5 text-xs font-semibold rounded-xl border transition-all whitespace-nowrap px-2 ${
                              calUser === assigneeValue
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border text-muted-foreground"
                            }`}
                          >
                            {label}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>

                <button
                  onClick={isTodoMode ? handleAddTodo : handleAddCalendar}
                  className="w-full py-3 bg-primary text-primary-foreground rounded-xl text-sm font-bold"
                >
                  {isTodoMode ? "Add To Do" : "Add to Calendar"}
                </button>
              </div>
            )}

            {step === "habit" && (
              <div className="space-y-3">
                <input
                  value={habitLabel}
                  onChange={(e) => setHabitLabel(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddHabit()}
                  placeholder="e.g. Cold shower, Read 10 pages..."
                  className="w-full bg-secondary rounded-xl px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
                  autoFocus
                />
                <button
                  onClick={handleAddHabit}
                  className="w-full py-3 bg-primary text-primary-foreground rounded-xl text-sm font-bold"
                >
                  Add Habit
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default AddItemModal;
