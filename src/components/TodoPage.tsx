import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Plus, ChevronDown, ChevronRight, MoreHorizontal, AlertTriangle, Sparkles, Calendar as CalendarIcon, Pencil, Trash2, ListTodo, Loader2, X } from "lucide-react";
import { useAppContext, Task } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import PageGroupSelector from "@/components/PageGroupSelector";
import { Calendar } from "@/components/ui/calendar";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Priority = "high" | "medium" | "low" | "none";

const PRIORITY_CONFIG: Record<string, { label: string; border: string; bg: string; badgeBg: string; badgeText: string; iconColor: string }> = {
  high: {
    label: "High",
    border: "border-[rgba(224,92,92,0.3)]",
    bg: "bg-[rgba(255,240,240,0.3)]",
    badgeBg: "bg-red-100",
    badgeText: "text-red-600",
    iconColor: "text-red-500",
  },
  medium: {
    label: "Medium",
    border: "border-[rgba(234,179,8,0.3)]",
    bg: "bg-[rgba(255,251,235,0.3)]",
    badgeBg: "bg-amber-100",
    badgeText: "text-amber-600",
    iconColor: "text-amber-500",
  },
  low: {
    label: "Low",
    border: "border-[rgba(108,71,255,0.2)]",
    bg: "bg-[rgba(250,245,255,0.3)]",
    badgeBg: "bg-purple-100",
    badgeText: "text-purple-600",
    iconColor: "text-purple-400",
  },
};

const TodoPage = ({ onOpenMore }: { onOpenMore?: () => void }) => {
  const { tasks, toggleTask, addTask, removeTask, updateTask } = useAppContext();
  const { user, groups } = useAuth();
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showSchedule, setShowSchedule] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [scheduleDate, setScheduleDate] = useState<Date | undefined>(undefined);
  const [breakdownSteps, setBreakdownSteps] = useState<{ title: string; description: string }[]>([]);
  const [breakdownLoading, setBreakdownLoading] = useState(false);
  const [prioritizeLoading, setPrioritizeLoading] = useState(false);
  const [todoExpanded, setTodoExpanded] = useState(true);
  const [addingPriority, setAddingPriority] = useState<Priority | null>(null);
  const [addingTodo, setAddingTodo] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editPriority, setEditPriority] = useState<Priority>("none");
  const [editDueDate, setEditDueDate] = useState<string | null>(null);
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());

  const toggleParentExpanded = (id: string) => {
    setExpandedParents(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Filter tasks - only non-scheduled tasks (to-do items, not calendar events)
  const myTasks = useMemo(() => {
    if (!user) return [];
    return tasks.filter(t => t.ownerUserId === user.id || !t.ownerUserId);
  }, [tasks, user]);

  const isTaskScheduled = (t: Task) => t.scheduledDay != null && t.scheduledMonth != null && t.scheduledYear != null;

  // All non-scheduled, top-level only
  const todoItems = useMemo(() => myTasks.filter(t => !isTaskScheduled(t) && !t.parentId), [myTasks]);
  // All subtasks indexed by parentId
  const subtasksByParent = useMemo(() => {
    const map: Record<string, Task[]> = {};
    myTasks.filter(t => !isTaskScheduled(t) && t.parentId).forEach(t => {
      if (!map[t.parentId!]) map[t.parentId!] = [];
      map[t.parentId!].push(t);
    });
    return map;
  }, [myTasks]);

  const highTasks = todoItems.filter(t => t.priority === "high");
  const mediumTasks = todoItems.filter(t => t.priority === "medium");
  const lowTasks = todoItems.filter(t => t.priority === "low");
  const unsortedTasks = todoItems.filter(t => !t.priority || t.priority === "none");
  const unsortedPending = unsortedTasks.filter(t => !t.done);

  const hasPriorityItems = highTasks.length > 0 || mediumTasks.length > 0 || lowTasks.length > 0;

  useEffect(() => {
    if (hasPriorityItems && unsortedTasks.length > 0) setTodoExpanded(false);
    else if (!hasPriorityItems) setTodoExpanded(true);
  }, [hasPriorityItems]);

  useEffect(() => {
    if ((addingPriority || addingTodo) && inputRef.current) inputRef.current.focus();
  }, [addingPriority, addingTodo]);

  const handleAddTask = (priority: Priority) => {
    if (!newTitle.trim()) return;
    addTask({
      title: newTitle.trim(),
      time: "",
      tag: "Personal",
      assignee: "me",
      priority,
    });
    setNewTitle("");
    setAddingPriority(null);
    setAddingTodo(false);
  };

  const handleTaskTap = (task: Task) => {
    setSelectedTask(task);
  };

  const handleSchedule = () => {
    setShowSchedule(true);
  };

  const handleConfirmSchedule = () => {
    if (!selectedTask || !scheduleDate) return;
    updateTask(selectedTask.id, {
      scheduledDay: scheduleDate.getDate(),
      scheduledMonth: scheduleDate.getMonth(),
      scheduledYear: scheduleDate.getFullYear(),
      dueDate: `${scheduleDate.getFullYear()}-${String(scheduleDate.getMonth() + 1).padStart(2, "0")}-${String(scheduleDate.getDate()).padStart(2, "0")}`,
    });
    toast.success("Scheduled!", { description: `Will appear on Home and Calendar on ${scheduleDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}` });
    setShowSchedule(false);
    setSelectedTask(null);
    setScheduleDate(undefined);
  };

  const handleBreakdown = async () => {
    if (!selectedTask) return;
    setShowBreakdown(true);
    setBreakdownLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-todo", {
        body: { action: "breakdown", taskTitle: selectedTask.title },
      });
      if (error) throw error;
      setBreakdownSteps(data.steps || []);
    } catch (e: any) {
      toast.error("AI couldn't break down this task");
      setShowBreakdown(false);
    } finally {
      setBreakdownLoading(false);
    }
  };

  const handleAddBreakdownSteps = async () => {
    if (!selectedTask) return;
    const parentId = selectedTask.id;
    for (const step of breakdownSteps) {
      await addTask({
        title: step.title,
        time: "",
        tag: "Personal",
        assignee: "me",
        priority: "none",
        parentId,
      });
    }
    // Auto-expand parent
    setExpandedParents(prev => new Set(prev).add(parentId));
    toast.success(`${breakdownSteps.length} subtasks added`);
    setShowBreakdown(false);
    setSelectedTask(null);
    setBreakdownSteps([]);
  };

  const handleEdit = () => {
    if (!selectedTask) return;
    setEditTitle(selectedTask.title);
    setEditPriority(selectedTask.priority || "none");
    setEditDueDate(selectedTask.dueDate || null);
    setShowEdit(true);
  };

  const handleSaveEdit = () => {
    if (!selectedTask || !editTitle.trim()) return;
    updateTask(selectedTask.id, {
      title: editTitle.trim(),
      priority: editPriority,
      dueDate: editDueDate,
    });
    toast.success("Task updated");
    setShowEdit(false);
    setSelectedTask(null);
  };

  const handleDelete = () => {
    setShowDeleteConfirm(true);
  };

  const confirmDelete = () => {
    if (!selectedTask) return;
    removeTask(selectedTask.id);
    toast.success("Task deleted");
    setShowDeleteConfirm(false);
    setSelectedTask(null);
  };

  const handlePrioritize = async () => {
    if (unsortedPending.length === 0) return;
    setPrioritizeLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-todo", {
        body: {
          action: "prioritize",
          tasks: unsortedPending.map(t => ({ id: t.id, title: t.title, dueDate: t.dueDate })),
        },
      });
      if (error) throw error;
      const results = data.results || [];
      for (const r of results) {
        if (["high", "medium", "low"].includes(r.priority)) {
          updateTask(r.id, { priority: r.priority as Priority });
        }
      }
      toast.success(`${results.length} tasks prioritized by AI`);
    } catch (e: any) {
      toast.error("AI couldn't prioritize tasks");
    } finally {
      setPrioritizeLoading(false);
    }
  };

  const getSubtaskBadge = (taskId: string) => {
    const subs = subtasksByParent[taskId];
    if (!subs || subs.length === 0) return null;
    const doneCount = subs.filter(s => s.done).length;
    return { total: subs.length, done: doneCount };
  };

  const renderSubtaskRow = (task: Task) => {
    const dueDateLabel = task.dueDate
      ? new Date(task.dueDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : null;

    return (
      <motion.div
        key={task.id}
        layout
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 py-2 pl-8 pr-1"
      >
        <button
          onClick={(e) => { e.stopPropagation(); if (!task.done) toast.success("Done! 🎉"); toggleTask(task.id); }}
          className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
            task.done ? "bg-foreground border-foreground" : "border-muted-foreground/30 hover:border-primary"
          }`}
        >
          {task.done && <Check size={10} className="text-background" />}
        </button>
        <button
          onClick={() => handleTaskTap(task)}
          className="flex-1 min-w-0 text-left"
        >
          <span className={`text-xs font-medium ${task.done ? "line-through text-muted-foreground/60" : "text-foreground/80"}`}>
            {task.title}
          </span>
          {dueDateLabel && (
            <p className="text-[9px] text-muted-foreground mt-0.5">Due {dueDateLabel}</p>
          )}
        </button>
      </motion.div>
    );
  };

  const renderTaskRow = (task: Task, showIcon?: boolean) => {
    const dueDateLabel = task.dueDate
      ? new Date(task.dueDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : null;
    const badge = getSubtaskBadge(task.id);
    const isExpanded = expandedParents.has(task.id);
    const subs = subtasksByParent[task.id] || [];

    return (
      <div key={task.id}>
        <motion.div
          layout
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 py-2.5 px-1"
        >
          {badge ? (
            <button
              onClick={(e) => { e.stopPropagation(); toggleParentExpanded(task.id); }}
              className="w-5 h-5 flex items-center justify-center flex-shrink-0 text-muted-foreground"
            >
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          ) : (
            <div className="w-5" />
          )}
          <button
            onClick={(e) => { e.stopPropagation(); if (!task.done) toast.success("Done! 🎉"); toggleTask(task.id); }}
            className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
              task.done ? "bg-foreground border-foreground" : "border-muted-foreground/40 hover:border-primary"
            }`}
          >
            {task.done && <Check size={12} className="text-background" />}
          </button>
          {showIcon && (
            <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
              <ListTodo size={12} className="text-primary" />
            </div>
          )}
          <button
            onClick={() => handleTaskTap(task)}
            className="flex-1 min-w-0 text-left"
          >
            <div className="flex items-center gap-2">
              <span className={`text-sm font-medium ${task.done ? "line-through text-muted-foreground" : "text-foreground"}`}>
                {task.title}
              </span>
              {badge && !isExpanded && (
                <span className="text-[10px] font-medium text-muted-foreground bg-secondary px-1.5 py-0.5 rounded-md">
                  {badge.done}/{badge.total} done
                </span>
              )}
            </div>
            {dueDateLabel && (
              <p className="text-[10px] text-muted-foreground mt-0.5">Due {dueDateLabel}</p>
            )}
          </button>
        </motion.div>
        <AnimatePresence>
          {isExpanded && subs.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="divide-y divide-border/20 border-l-2 border-border/20 ml-3">
                {subs.map(s => renderSubtaskRow(s))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  const renderPrioritySection = (priority: "high" | "medium" | "low", sectionTasks: Task[]) => {
    const config = PRIORITY_CONFIG[priority];
    return (
      <section key={priority} className={`rounded-xl border border-dashed ${config.border} ${config.bg} p-3 mb-4`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <AlertTriangle size={14} className={config.iconColor} />
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${config.badgeBg} ${config.badgeText}`}>
              {config.label}
            </span>
          </div>
          <button
            onClick={() => { setAddingPriority(priority); setNewTitle(""); }}
            className="w-6 h-6 rounded-lg bg-white/60 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <Plus size={13} />
          </button>
        </div>
        {addingPriority === priority && (
          <div className="flex items-center gap-2 mb-2">
            <input
              ref={inputRef}
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAddTask(priority); if (e.key === "Escape") { setAddingPriority(null); setNewTitle(""); } }}
              placeholder="Task name..."
              className="flex-1 bg-white/80 rounded-lg px-3 py-2 text-sm outline-none border border-border/50"
            />
            <button onClick={() => handleAddTask(priority)} disabled={!newTitle.trim()} className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-40">Add</button>
            <button onClick={() => { setAddingPriority(null); setNewTitle(""); }} className="text-muted-foreground"><X size={14} /></button>
          </div>
        )}
        {sectionTasks.length === 0 && addingPriority !== priority && (
          <p className="text-[11px] text-muted-foreground py-1">No tasks</p>
        )}
        <div className="divide-y divide-border/30">
          {sectionTasks.map(t => renderTaskRow(t, true))}
        </div>
      </section>
    );
  };

  return (
    <div className="px-5 pb-8">
      {/* Header */}
      <header className="pt-10 pb-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: "'DM Sans', sans-serif" }}>To-Do</h1>
          <div className="flex items-center gap-2">
            {unsortedPending.length > 0 && (
              <button
                onClick={handlePrioritize}
                disabled={prioritizeLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all"
                style={{ backgroundColor: "rgba(250,245,255,1)", color: "#6C47FF" }}
              >
                {prioritizeLoading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                Prioritize ({unsortedPending.length})
              </button>
            )}
            {onOpenMore && (
              <button onClick={onOpenMore} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-secondary/60 transition-colors text-muted-foreground">
                <MoreHorizontal size={18} />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Priority sections */}
      {renderPrioritySection("high", highTasks)}
      {renderPrioritySection("medium", mediumTasks)}
      {renderPrioritySection("low", lowTasks)}

      {/* Unsorted To-Do section */}
      <section className="bg-card rounded-xl border shadow-sm p-3 mb-4" style={{ borderColor: "rgba(0,0,0,0.07)", borderWidth: "0.5px" }}>
        <button
          onClick={() => setTodoExpanded(!todoExpanded)}
          className="flex items-center justify-between w-full mb-1"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">To-Do</span>
            {todoExpanded ? <ChevronDown size={14} className="text-muted-foreground" /> : <ChevronRight size={14} className="text-muted-foreground" />}
          </div>
          <span className="text-[11px] font-medium text-muted-foreground bg-secondary px-1.5 py-0.5 rounded-md">{unsortedTasks.length}</span>
        </button>

        <AnimatePresence>
          {todoExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="divide-y divide-border/30">
                {unsortedTasks.map(t => renderTaskRow(t))}
              </div>
              {addingTodo ? (
                <div className="flex items-center gap-2 mt-2">
                  <input
                    ref={inputRef}
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleAddTask("none"); if (e.key === "Escape") { setAddingTodo(false); setNewTitle(""); } }}
                    placeholder="Task name..."
                    className="flex-1 bg-secondary/50 rounded-lg px-3 py-2 text-sm outline-none"
                  />
                  <button onClick={() => handleAddTask("none")} disabled={!newTitle.trim()} className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-40">Add</button>
                  <button onClick={() => { setAddingTodo(false); setNewTitle(""); }} className="text-muted-foreground"><X size={14} /></button>
                </div>
              ) : (
                <button
                  onClick={() => { setAddingTodo(true); setNewTitle(""); }}
                  className="flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm py-2 mt-1 transition-colors w-full"
                >
                  <Plus size={14} /> Add a task...
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* Task Options Sheet */}
      <Drawer open={!!selectedTask && !showSchedule && !showBreakdown && !showEdit && !showDeleteConfirm} onOpenChange={(open) => { if (!open) setSelectedTask(null); }}>
        <DrawerContent className="max-h-[60vh]">
          <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-muted" />
          <div className="p-4">
            <p className="text-sm font-medium mb-4">{selectedTask?.title}</p>
            <div className="space-y-1">
              <button onClick={handleSchedule} className="flex items-center gap-3 w-full px-3 py-3 rounded-xl hover:bg-secondary/60 transition-colors">
                <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center"><CalendarIcon size={16} className="text-blue-600" /></div>
                <div className="text-left"><p className="text-sm font-medium">Schedule</p><p className="text-[11px] text-muted-foreground">Add to calendar and home page</p></div>
              </button>
              {/* Only show AI breakdown for top-level tasks */}
              {!selectedTask?.parentId && (
                <button onClick={handleBreakdown} className="flex items-center gap-3 w-full px-3 py-3 rounded-xl hover:bg-secondary/60 transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center"><Sparkles size={16} className="text-purple-600" /></div>
                  <div className="text-left"><p className="text-sm font-medium">AI breakdown</p><p className="text-[11px] text-muted-foreground">Break into smaller steps with AI</p></div>
                </button>
              )}
              <button onClick={handleEdit} className="flex items-center gap-3 w-full px-3 py-3 rounded-xl hover:bg-secondary/60 transition-colors">
                <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center"><Pencil size={16} className="text-gray-500" /></div>
                <div className="text-left"><p className="text-sm font-medium">Edit</p><p className="text-[11px] text-muted-foreground">Change name, priority, due date</p></div>
              </button>
              <button onClick={handleDelete} className="flex items-center gap-3 w-full px-3 py-3 rounded-xl hover:bg-secondary/60 transition-colors">
                <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center"><Trash2 size={16} className="text-red-500" /></div>
                <div className="text-left"><p className="text-sm font-medium text-destructive">Delete</p><p className="text-[11px] text-muted-foreground">Remove this task permanently</p></div>
              </button>
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      {/* Schedule Sheet */}
      <Drawer open={showSchedule} onOpenChange={(open) => { if (!open) { setShowSchedule(false); } }}>
        <DrawerContent className="max-h-[85vh]">
          <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-muted" />
          <div className="p-4">
            <Calendar
              mode="single"
              selected={scheduleDate}
              onSelect={setScheduleDate}
              className="p-2 pointer-events-auto rounded-lg border border-border mx-auto"
            />
            {scheduleDate && (
              <div className="mt-3 p-3 rounded-xl bg-blue-50 border border-blue-100">
                <p className="text-[11px] text-blue-700 font-medium">
                  Will appear on Home page and Calendar on {scheduleDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                </p>
              </div>
            )}
            <button
              onClick={handleConfirmSchedule}
              disabled={!scheduleDate}
              className="w-full mt-4 py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-40 transition-colors"
              style={{ backgroundColor: "#6C47FF" }}
            >
              {scheduleDate ? `Confirm — ${scheduleDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : "Select a date"}
            </button>
          </div>
        </DrawerContent>
      </Drawer>

      {/* AI Breakdown Sheet */}
      <Drawer open={showBreakdown} onOpenChange={(open) => { if (!open) { setShowBreakdown(false); setBreakdownSteps([]); } }}>
        <DrawerContent className="max-h-[85vh]">
          <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-muted" />
          <div className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles size={16} className="text-purple-500" />
              <span className="text-xs font-semibold text-purple-600">AI suggested breakdown</span>
            </div>
            <p className="text-sm text-muted-foreground mb-4">{selectedTask?.title}</p>
            {breakdownLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={24} className="animate-spin text-primary" />
              </div>
            ) : (
              <div className="space-y-3 mb-4">
                {breakdownSteps.map((step, i) => (
                  <div key={i} className="flex gap-3 p-3 rounded-xl bg-secondary/40">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold text-white" style={{ backgroundColor: "#6C47FF" }}>
                      {i + 1}
                    </div>
                    <div>
                      <p className="text-[11px] font-medium">{step.title}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{step.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!breakdownLoading && breakdownSteps.length > 0 && (
              <div className="flex gap-2">
                <button onClick={handleAddBreakdownSteps} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ backgroundColor: "#6C47FF" }}>
                  Add as subtasks
                </button>
                <button onClick={() => { setShowBreakdown(false); setBreakdownSteps([]); }} className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-secondary text-muted-foreground">
                  Dismiss
                </button>
              </div>
            )}
          </div>
        </DrawerContent>
      </Drawer>

      {/* Edit Sheet */}
      <Drawer open={showEdit} onOpenChange={(open) => { if (!open) setShowEdit(false); }}>
        <DrawerContent className="max-h-[70vh]">
          <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-muted" />
          <div className="p-4 space-y-4">
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground uppercase mb-1 block">Task name</label>
              <input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm outline-none"
              />
            </div>
            {/* Only show priority editing for top-level tasks */}
            {!selectedTask?.parentId && (
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground uppercase mb-2 block">Priority</label>
                <div className="flex gap-2">
                  {(["high", "medium", "low", "none"] as Priority[]).map(p => (
                    <button
                      key={p}
                      onClick={() => setEditPriority(p)}
                      className={cn(
                        "flex-1 py-2 rounded-lg text-[11px] font-semibold border transition-all",
                        editPriority === p ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
                      )}
                    >
                      {p === "none" ? "None" : p.charAt(0).toUpperCase() + p.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground uppercase mb-1 block">Due date</label>
              <input
                type="date"
                value={editDueDate || ""}
                onChange={(e) => setEditDueDate(e.target.value || null)}
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm outline-none"
              />
            </div>
            <button onClick={handleSaveEdit} disabled={!editTitle.trim()} className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-40" style={{ backgroundColor: "#6C47FF" }}>
              Save changes
            </button>
          </div>
        </DrawerContent>
      </Drawer>

      {/* Delete Confirm Sheet */}
      <Drawer open={showDeleteConfirm} onOpenChange={(open) => { if (!open) setShowDeleteConfirm(false); }}>
        <DrawerContent>
          <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-muted" />
          <div className="p-4 text-center">
            <p className="text-sm font-medium mb-4">Delete this task?</p>
            <p className="text-xs text-muted-foreground mb-6">"{selectedTask?.title}" will be removed permanently.</p>
            <div className="flex gap-2">
              <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-secondary text-foreground">Cancel</button>
              <button onClick={confirmDelete} className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-destructive text-destructive-foreground">Delete</button>
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
};

export default TodoPage;
