import { useState, useEffect, useCallback, useMemo } from "react";
import { Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";

interface CalendarEntry {
  id: string;
  name: string;
  color: string;
  provider: string;
  providerAccountId: string | null;
}

interface ProviderGroup {
  key: string;
  label: string;
  calendars: CalendarEntry[];
}

const PROVIDER_LABELS: Record<string, string> = {
  local: "My Calendars",
  google: "Gmail",
  apple: "iCloud",
  outlook: "Outlook",
};

interface Props {
  selectedCalendarId: string | null;
  onSelect: (calendarId: string, calendarColor: string, calendarName: string) => void;
}

const CalendarPickerInline = ({ selectedCalendarId, onSelect }: Props) => {
  const { user } = useAuth();
  const [calendars, setCalendars] = useState<CalendarEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCalendars = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("calendars")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_visible", true)
      .order("sort_order", { ascending: true });

    if (!error && data) {
      setCalendars(
        data.map((c: any) => ({
          id: c.id,
          name: c.name,
          color: c.color,
          provider: c.provider,
          providerAccountId: c.provider_account_id,
        }))
      );
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchCalendars();
  }, [fetchCalendars]);

  const providerGroups = useMemo<ProviderGroup[]>(() => {
    const grouped = new Map<string, CalendarEntry[]>();
    calendars.forEach((c) => {
      const key = c.providerAccountId
        ? `${c.provider}::${c.providerAccountId}`
        : c.provider;
      const arr = grouped.get(key) || [];
      arr.push(c);
      grouped.set(key, arr);
    });

    const order = ["local", "google", "apple", "outlook"];
    const sortedKeys = [...grouped.keys()].sort((a, b) => {
      const pA = a.split("::")[0];
      const pB = b.split("::")[0];
      return (
        (order.indexOf(pA) === -1 ? 99 : order.indexOf(pA)) -
        (order.indexOf(pB) === -1 ? 99 : order.indexOf(pB))
      );
    });

    return sortedKeys.map((key) => {
      const cals = grouped.get(key)!;
      const provider = key.split("::")[0];
      const accountId = key.includes("::") ? key.split("::")[1] : null;
      const baseLabel = PROVIDER_LABELS[provider] || provider;
      return {
        key,
        label: accountId || baseLabel,
        calendars: cals,
      };
    });
  }, [calendars]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (calendars.length === 0) {
    return (
      <p className="text-[13px] text-muted-foreground text-center py-3">
        No calendars available
      </p>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-border bg-card overflow-hidden">
      {providerGroups.map((group, gi) => (
        <div key={group.key}>
          {/* Provider/account header */}
          {(providerGroups.length > 1 || group.label !== "My Calendars") && (
            <div
              className={cn(
                "px-4 py-2",
                gi > 0 && "border-t border-border"
              )}
            >
              <span className="text-[12px] font-medium text-muted-foreground">
                {group.label}
              </span>
            </div>
          )}

          {/* Calendar rows */}
          {group.calendars.map((cal) => {
            const isSelected = selectedCalendarId === cal.id;
            return (
              <button
                key={cal.id}
                onClick={() => onSelect(cal.id, cal.color, cal.name)}
                className="w-full flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-secondary/40 active:bg-secondary/60"
              >
                {/* Checkmark column */}
                <div className="w-5 flex items-center justify-center flex-shrink-0">
                  {isSelected && (
                    <Check size={16} className="text-foreground" strokeWidth={2.5} />
                  )}
                </div>

                {/* Color dot */}
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: cal.color }}
                />

                {/* Name */}
                <span
                  className={cn(
                    "text-[15px] text-left truncate",
                    isSelected ? "font-medium text-foreground" : "text-foreground"
                  )}
                >
                  {cal.name}
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
};

export default CalendarPickerInline;
