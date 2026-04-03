import { useState, useRef, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Camera, Trash2, ChevronRight, Pin, Lock, Users, Check } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useModalScrollLock } from "@/hooks/useModalScrollLock";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  SpecialDay,
  EventType,
  DisplayMode,
  ICON_OPTIONS,
  EVENT_TYPE_OPTIONS,
  DISPLAY_MODE_OPTIONS,
  REMINDER_OPTIONS,
  fmtDate,
  getDayCount,
  getDisplayLabel,
  resolveDisplayMode,
} from "./SpecialDayTypes";

interface GroupOption {
  id: string;
  name: string;
  emoji: string;
  shared_pages?: string[];
}

interface Props {
  open: boolean;
  editingDay: SpecialDay | null;
  userId: string;
  groupId: string | null;
  groups?: GroupOption[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}

const SpecialDayFormModal = ({ open, editingDay, userId, groupId, groups = [], onClose, onSaved }: Props) => {
  useModalScrollLock(open);

  const getInitialEventType = (): EventType => {
    if (editingDay?.event_type) return editingDay.event_type as EventType;
    if (editingDay?.category === "birthday") return "birthday";
    if (editingDay?.category === "anniversary") return "anniversary";
    return "custom";
  };

  const getInitialDisplayMode = (): DisplayMode => {
    if (editingDay?.display_mode && editingDay.display_mode !== "auto") return editingDay.display_mode;
    const et = getInitialEventType();
    return EVENT_TYPE_OPTIONS.find((o) => o.value === et)?.defaultDisplayMode || "countdown";
  };

  const getInitialSharedGroupIds = (): string[] => {
    if (editingDay?.shared_group_ids && editingDay.shared_group_ids.length > 0) {
      return editingDay.shared_group_ids;
    }
    // For new events, if user is in a group context, pre-select that group
    if (!editingDay && groupId) return [groupId];
    return [];
  };

  const [step, setStep] = useState(editingDay ? 2 : 1);
  const [eventType, setEventType] = useState<EventType>(getInitialEventType());
  const [title, setTitle] = useState(editingDay?.title || "");
  const [icon, setIcon] = useState(editingDay?.icon || "❤️");
  const [date, setDate] = useState(editingDay?.event_date || fmtDate(new Date()));
  const [direction, setDirection] = useState<"since" | "until">(
    (editingDay?.count_direction as "since" | "until") || "since"
  );
  const [repeats, setRepeats] = useState(editingDay?.repeats_yearly || false);
  const [notes, setNotes] = useState(editingDay?.notes || "");
  const [reminder, setReminder] = useState<number | null>(editingDay?.reminder_minutes ?? null);
  const [photoUrl, setPhotoUrl] = useState(editingDay?.photo_url || "");
  const [uploading, setUploading] = useState(false);
  const [pinAsHero, setPinAsHero] = useState(editingDay?.is_featured || false);
  const [displayMode, setDisplayMode] = useState<DisplayMode>(getInitialDisplayMode());
  const [inclusiveCount, setInclusiveCount] = useState(editingDay?.inclusive_count || false);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>(getInitialSharedGroupIds());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Reset all form state when the modal opens or the edited card changes
  useEffect(() => {
    if (!open) return;
    const et = getInitialEventType();
    const dm = (() => {
      if (editingDay?.display_mode && editingDay.display_mode !== "auto") return editingDay.display_mode;
      return EVENT_TYPE_OPTIONS.find((o) => o.value === et)?.defaultDisplayMode || "countdown";
    })();
    setStep(editingDay ? 2 : 1);
    setEventType(et);
    setTitle(editingDay?.title || "");
    setIcon(editingDay?.icon || "❤️");
    setDate(editingDay?.event_date || fmtDate(new Date()));
    setDirection((editingDay?.count_direction as "since" | "until") || "since");
    setRepeats(editingDay?.repeats_yearly || false);
    setNotes(editingDay?.notes || "");
    setReminder(editingDay?.reminder_minutes ?? null);
    setPhotoUrl(editingDay?.photo_url || "");
    setUploading(false);
    setPinAsHero(editingDay?.is_featured || false);
    setDisplayMode(dm as DisplayMode);
    setInclusiveCount(editingDay?.inclusive_count || false);
    setSelectedGroupIds(getInitialSharedGroupIds());
  }, [open, editingDay?.id]);

  const selectEventType = (type: EventType) => {
    setEventType(type);
    const opt = EVENT_TYPE_OPTIONS.find((o) => o.value === type)!;
    setDirection(opt.defaultDirection);
    setRepeats(opt.defaultRepeats);
    setIcon(opt.icon);
    setDisplayMode(opt.defaultDisplayMode);
    setStep(2);
  };

  const toggleGroupSelection = (gId: string) => {
    setSelectedGroupIds((prev) =>
      prev.includes(gId) ? prev.filter((id) => id !== gId) : [...prev, gId]
    );
  };

  const selectJustMe = () => {
    setSelectedGroupIds([]);
  };

  const isJustMe = selectedGroupIds.length === 0;

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${userId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("special-days").upload(path, file);
    if (error) {
      toast.error("Upload failed");
      setUploading(false);
      return;
    }
    const { data: urlData } = supabase.storage.from("special-days").getPublicUrl(path);
    setPhotoUrl(urlData.publicUrl);
    setUploading(false);
  };

  const handleSave = async () => {
    if (!title.trim()) { toast.error("Please enter a title"); return; }
    if (!date) { toast.error("Please select a date"); return; }

    // Determine context_group_id: the active group when creating, or preserved from editing
    const contextGroupId = editingDay
      ? (editingDay.context_group_id ?? groupId)
      : groupId;

    const payload: Record<string, unknown> = {
      title: title.trim(),
      icon,
      event_date: date,
      count_direction: direction,
      repeats_yearly: repeats,
      group_id: selectedGroupIds.length > 0 ? selectedGroupIds[0] : null,
      shared_group_ids: selectedGroupIds,
      context_group_id: contextGroupId,
      photo_url: photoUrl || null,
      category: eventType === "first_met" || eventType === "wedding" ? "anniversary" : eventType,
      event_type: eventType,
      display_mode: displayMode,
      notes: notes.trim() || null,
      reminder_minutes: reminder,
      is_featured: pinAsHero,
      inclusive_count: inclusiveCount,
    };

    try {
      if (pinAsHero) {
        const { error: clearFeaturedError } = await supabase
          .from("special_days")
          .update({ is_featured: false } as any)
          .eq("user_id", userId)
          .neq("id", editingDay?.id || "");

        if (clearFeaturedError) throw clearFeaturedError;
      }

      if (editingDay) {
        const { data: updated, error: updateError } = await supabase
          .from("special_days")
          .update(payload as any)
          .eq("id", editingDay.id)
          .select("id")
          .maybeSingle();

        if (updateError || !updated) throw updateError || new Error("No matching event found to update.");
        toast.success("Updated");
      } else {
        const { data: inserted, error: insertError } = await supabase
          .from("special_days")
          .insert({ ...payload, user_id: userId } as any)
          .select("id")
          .maybeSingle();

        if (insertError || !inserted) throw insertError || new Error("Could not create event.");
        toast.success("Added");
      }

      await Promise.resolve(onSaved());
      onClose();
    } catch (error) {
      console.error("Failed to save special day", error);
      toast.error("Couldn’t save changes. Please try again.");
    }
  };

  const handleDelete = async () => {
    if (!editingDay) return;
    try {
      const { error } = await supabase.from("special_days").delete().eq("id", editingDay.id);
      if (error) throw error;
      toast.success("Removed");
      await Promise.resolve(onSaved());
      onClose();
    } catch (error) {
      console.error("Failed to delete special day", error);
      toast.error("Couldn’t delete this moment. Please try again.");
    }
  };

  // Live preview
  const previewDay = useMemo((): SpecialDay => ({
    id: "preview",
    title: title || "Your Moment",
    icon,
    event_date: date,
    count_direction: direction,
    repeats_yearly: repeats,
    is_featured: false,
    group_id: null,
    user_id: userId,
    photo_url: photoUrl || null,
    category: eventType,
    notes: null,
    reminder_minutes: null,
    event_type: eventType,
    display_mode: displayMode,
    inclusive_count: inclusiveCount,
  }), [title, icon, date, direction, repeats, eventType, photoUrl, displayMode, inclusiveCount, userId]);

  const now = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const previewLabel = getDisplayLabel(previewDay, now);
  const previewCount = getDayCount(previewDay, now);
  const typeLabel = EVENT_TYPE_OPTIONS.find(o => o.value === eventType)?.label || "Custom";

  // Which display modes make sense for the selected event type
  const availableModes = useMemo((): DisplayMode[] => {
    switch (eventType) {
      case "birthday": return ["annual_countdown"];
      case "anniversary": return ["days_together", "anniversary_style", "annual_countdown"];
      case "first_met": return ["days_together", "days_since"];
      case "wedding": return ["anniversary_style", "days_together", "annual_countdown"];
      case "holiday": return ["annual_countdown", "countdown"];
      case "custom":
      default: return ["countdown", "days_since", "days_together", "annual_countdown", "anniversary_style"];
    }
  }, [eventType]);

  const showInclusiveToggle = displayMode === "days_together" || displayMode === "anniversary_style";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-end justify-center pb-[env(safe-area-inset-bottom)] overscroll-none"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            onClick={(e) => e.stopPropagation()}
            className="relative z-[71] w-full max-w-md bg-card rounded-t-3xl border-t border-x border-border/50 shadow-2xl h-[min(92svh,calc(100svh-env(safe-area-inset-top)-0.5rem))] min-h-0 flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border/30 flex-shrink-0">
              <div>
                <h3 className="text-lg font-bold tracking-tight">
                  {editingDay ? "Edit Moment" : step === 1 ? "Choose Type" : `New ${typeLabel}`}
                </h3>
                {step === 2 && !editingDay && (
                  <button onClick={() => setStep(1)} className="text-[11px] text-primary font-medium mt-0.5">
                    ← Change type
                  </button>
                )}
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-secondary/60 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              >
                <X size={15} />
              </button>
            </div>

            {/* Scrollable content */}
            <div
              className="px-5 pt-4 space-y-5 flex-1 min-h-0 overflow-y-auto overscroll-y-contain"
              style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y", overscrollBehaviorY: "contain" }}
            >
              {step === 1 ? (
                <div className="space-y-2 pb-6">
                  {EVENT_TYPE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => selectEventType(opt.value)}
                      className="w-full flex items-center gap-3 p-4 rounded-2xl bg-secondary/30 border border-border/30 hover:bg-secondary/50 transition-all text-left active:scale-[0.98]"
                    >
                      <span className="text-2xl">{opt.icon}</span>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-foreground">{opt.label}</p>
                        <p className="text-[11px] text-muted-foreground/70">
                          {opt.value === "birthday" && "Countdown to next birthday with age"}
                          {opt.value === "anniversary" && "Track days together & annual milestone"}
                          {opt.value === "first_met" && "Count the days since you first met"}
                          {opt.value === "wedding" && "Wedding date & anniversary tracking"}
                          {opt.value === "holiday" && "Recurring holiday countdown"}
                          {opt.value === "custom" && "Any date with custom display"}
                        </p>
                      </div>
                      <ChevronRight size={16} className="text-muted-foreground/40" />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-5 pb-4">
                  {/* ── Live Preview Card ── */}
                  <div className="rounded-2xl bg-secondary/20 border border-border/30 p-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl overflow-hidden bg-secondary/40 border border-border/20 flex-shrink-0">
                        {photoUrl ? (
                          <img src={photoUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xl">{icon}</div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="text-[13px] font-bold text-foreground truncate">{title || "Your Moment"}</p>
                          {isJustMe && <Lock size={10} className="text-muted-foreground/50 flex-shrink-0" />}
                        </div>
                        <p className="text-[12px] font-bold text-primary">
                          {previewCount === 0 ? "Today! 🎉" : previewLabel.primary}
                        </p>
                        {previewLabel.secondary && (
                          <p className="text-[10px] text-muted-foreground">{previewLabel.secondary}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* ── 1. Event Type (read-only indicator + change) ── */}
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{EVENT_TYPE_OPTIONS.find(o => o.value === eventType)?.icon}</span>
                    <span className="text-sm font-semibold text-foreground">{typeLabel}</span>
                    {!editingDay && (
                      <button onClick={() => setStep(1)} className="text-[11px] text-primary font-medium ml-auto">
                        Change
                      </button>
                    )}
                  </div>

                  {/* ── 2. Title ── */}
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                      {eventType === "birthday" ? "Whose Birthday?" : "Title"}
                    </label>
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder={
                        eventType === "birthday" ? "e.g., Evelyn's Birthday"
                        : eventType === "anniversary" ? "e.g., Our Anniversary"
                        : "e.g., Special Moment"
                      }
                      className="w-full px-3.5 py-2.5 rounded-xl bg-secondary/40 border border-border/40 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground/40"
                    />
                  </div>

                  {/* ── 3. Date ── */}
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                      {eventType === "birthday" ? "Birth Date" : "Date"}
                    </label>
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-secondary/40 border border-border/40 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>

                  {/* ── Shared With / Visibility (multi-select) ── */}
                  {groups.length > 0 && (
                    <div>
                      <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                        Shared With
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          onClick={selectJustMe}
                          className={`px-3 py-2 rounded-xl text-[12px] font-semibold transition-all border flex items-center gap-1.5 ${
                            isJustMe
                              ? "bg-primary/10 text-primary border-primary/30"
                              : "bg-secondary/40 text-muted-foreground border-border/30 hover:bg-secondary/50"
                          }`}
                        >
                          <Lock size={11} /> Just me
                        </button>
                        {groups.filter((g) => (g as any).shared_pages?.includes("special_days")).map((g) => {
                          const isSelected = selectedGroupIds.includes(g.id);
                          return (
                            <button
                              key={g.id}
                              onClick={() => toggleGroupSelection(g.id)}
                              className={`px-3 py-2 rounded-xl text-[12px] font-semibold transition-all border flex items-center gap-1.5 ${
                                isSelected
                                  ? "bg-primary/10 text-primary border-primary/30"
                                  : "bg-secondary/40 text-muted-foreground border-border/30 hover:bg-secondary/50"
                              }`}
                            >
                              {isSelected && <Check size={11} />}
                              {g.emoji} {g.name}
                            </button>
                          );
                        })}
                      </div>
                      {/* Contextual hint */}
                      <p className="text-[10px] text-muted-foreground/50 mt-1.5 leading-snug">
                        {isJustMe
                          ? "Visible only to you. Will appear in your current group view privately."
                          : selectedGroupIds.length === 1
                            ? "Shared with all members of this group."
                            : `Shared across ${selectedGroupIds.length} groups. All members can view & edit.`}
                      </p>
                    </div>
                  )}

                  {/* ── 4. Day Count Style ── */}
                  {availableModes.length > 1 && (
                    <div>
                      <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                        Day Count Style
                      </label>
                      <div className="space-y-1.5">
                        {DISPLAY_MODE_OPTIONS.filter((m) => availableModes.includes(m.value)).map((m) => (
                          <button
                            key={m.value}
                            onClick={() => setDisplayMode(m.value)}
                            className={`w-full flex items-start gap-3 px-3.5 py-2.5 rounded-xl border text-left transition-all ${
                              displayMode === m.value
                                ? "bg-primary/5 border-primary/30"
                                : "bg-secondary/30 border-border/30 hover:bg-secondary/50"
                            }`}
                          >
                            <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                              displayMode === m.value ? "border-primary bg-primary" : "border-muted-foreground/40"
                            }`}>
                              {displayMode === m.value && (
                                <div className="w-1.5 h-1.5 rounded-full bg-primary-foreground" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="text-[13px] font-semibold text-foreground">{m.label}</p>
                              <p className="text-[10px] text-muted-foreground/70 leading-snug">{m.description}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── 5. Inclusive count toggle ── */}
                  {showInclusiveToggle && (
                    <button
                      onClick={() => setInclusiveCount(!inclusiveCount)}
                      className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border transition-colors ${
                        inclusiveCount ? "bg-primary/5 border-primary/20" : "bg-secondary/40 border-border/40"
                      }`}
                    >
                      <div className="text-left">
                        <span className="text-sm font-medium block">Count the first day as Day 1</span>
                        <span className="text-[10px] text-muted-foreground/60">Inclusive count — adds 1 to the total</span>
                      </div>
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                        inclusiveCount ? "border-primary bg-primary" : "border-muted-foreground/40"
                      }`}>
                        {inclusiveCount && (
                          <svg viewBox="0 0 12 12" className="w-3 h-3 text-primary-foreground">
                            <path d="M2 6l3 3 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                    </button>
                  )}

                  {/* ── 6. Cover Photo ── */}
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                      Cover Photo
                    </label>
                    <div
                      onClick={() => fileRef.current?.click()}
                      className="relative w-full h-28 rounded-2xl overflow-hidden bg-secondary/40 border border-dashed border-border/60 flex items-center justify-center cursor-pointer hover:border-primary/40 transition-colors"
                    >
                      {photoUrl ? (
                        <>
                          <img src={photoUrl} alt="" className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                            <Camera size={24} className="text-white/80" />
                          </div>
                        </>
                      ) : (
                        <div className="flex flex-col items-center gap-1.5 text-muted-foreground/50">
                          <Camera size={22} />
                          <span className="text-[10px] font-medium">
                            {uploading ? "Uploading…" : "Add a photo"}
                          </span>
                        </div>
                      )}
                    </div>
                    <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                  </div>

                  {/* ── 7. Icon ── */}
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                      Icon
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {ICON_OPTIONS.map((ic) => (
                        <button
                          key={ic}
                          onClick={() => setIcon(ic)}
                          className={`w-9 h-9 rounded-xl text-base flex items-center justify-center transition-all ${
                            icon === ic
                              ? "bg-primary/10 border-2 border-primary scale-110"
                              : "bg-secondary/50 border border-transparent hover:bg-secondary"
                          }`}
                        >
                          {ic}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* ── 8. Repeats yearly ── */}
                  <button
                    onClick={() => setRepeats(!repeats)}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border transition-colors ${
                      repeats ? "bg-primary/5 border-primary/20" : "bg-secondary/40 border-border/40"
                    }`}
                  >
                    <span className="text-sm font-medium">Repeats yearly</span>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                      repeats ? "border-primary bg-primary" : "border-muted-foreground/40"
                    }`}>
                      {repeats && (
                        <svg viewBox="0 0 12 12" className="w-3 h-3 text-primary-foreground">
                          <path d="M2 6l3 3 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                  </button>

                  {/* ── Pin as hero ── */}
                  <button
                    onClick={() => setPinAsHero(!pinAsHero)}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border transition-colors ${
                      pinAsHero ? "bg-primary/5 border-primary/20" : "bg-secondary/40 border-border/40"
                    }`}
                  >
                    <span className="text-sm font-medium flex items-center gap-1.5">
                      <Pin size={13} /> Pin as featured card
                    </span>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                      pinAsHero ? "border-primary bg-primary" : "border-muted-foreground/40"
                    }`}>
                      {pinAsHero && (
                        <svg viewBox="0 0 12 12" className="w-3 h-3 text-primary-foreground">
                          <path d="M2 6l3 3 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                  </button>

                  {/* ── 9. Reminder ── */}
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                      Reminder
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {REMINDER_OPTIONS.map((r) => (
                        <button
                          key={r.value}
                          onClick={() => setReminder(reminder === r.value ? null : r.value)}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                            reminder === r.value
                              ? "bg-primary/10 text-primary border border-primary/30"
                              : "bg-secondary/50 text-muted-foreground border border-transparent"
                          }`}
                        >
                          {r.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* ── 10. Notes ── */}
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                      Notes / Gift Ideas
                    </label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Add a memory note or gift idea…"
                      rows={3}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-secondary/40 border border-border/40 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none placeholder:text-muted-foreground/40"
                    />
                  </div>

                  {/* spacer so content doesn't hide behind sticky footer */}
                  <div className="h-44" />
                </div>
              )}
            </div>

            {/* ── Sticky bottom action bar ── */}
            {step === 2 && (
              <div className="flex-shrink-0 px-5 pb-[max(calc(env(safe-area-inset-bottom)+0.5rem),1.5rem)] pt-3 border-t border-border/30 bg-card/95 backdrop-blur-sm shadow-[0_-4px_20px_-4px_rgba(0,0,0,0.08)]">
                <button
                  onClick={handleSave}
                  disabled={!title.trim() || !date || uploading}
                  className="w-full py-3.5 bg-primary text-primary-foreground rounded-2xl text-sm font-bold hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
                >
                  {editingDay ? "Save Changes" : `Add ${typeLabel}`}
                </button>
                {editingDay && (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="w-full mt-2 py-3 rounded-2xl border border-destructive/30 text-destructive text-sm font-semibold hover:bg-destructive/5 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Trash2 size={14} /> Delete Moment
                  </button>
                )}
              </div>
            )}

            {/* Delete confirmation dialog */}
            <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this moment?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently remove this special day. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SpecialDayFormModal;
