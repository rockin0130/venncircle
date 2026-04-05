import { useState, useCallback } from "react";
import { Check, Trash2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

/* ── Types ── */
interface OrganizedCategory {
  label: string;
  item_ids: string[];
}

export interface OrganizeResult {
  toggle_labels: [string, string];
  categories: OrganizedCategory[];
}

export interface ShoppingItemBasic {
  id: string;
  name: string;
  checked: boolean;
}

/* ── Venn SVG icon ── */
const VennIcon = () => (
  <svg width={12} height={12} viewBox="0 0 12 12" fill="none">
    <circle cx={4} cy={6} r={3.5} stroke="#6C47FF" strokeWidth={1.2} fill="none" />
    <circle cx={8} cy={6} r={3.5} stroke="#6C47FF" strokeWidth={1.2} fill="none" />
  </svg>
);

/* ── Hook ── */
export function useOrganize() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<OrganizeResult | null>(null);
  const [viewMode, setViewMode] = useState<"original" | "organized">("original");

  const organize = useCallback(async (items: ShoppingItemBasic[]) => {
    if (items.length === 0) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-nutrition", {
        body: {
          action: "organize_shopping",
          items: items.map((i) => ({ id: i.id, name: i.name })),
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setResult(data as OrganizeResult);
      setViewMode("organized");
    } catch (e: any) {
      toast({ title: "Couldn't organize right now — try again", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, result, viewMode, setViewMode, organize };
}

/* ── Organize Pill ── */
export const OrganizePill = ({
  loading,
  onClick,
}: {
  loading: boolean;
  onClick: () => void;
}) => (
  <button
    onClick={(e) => {
      e.stopPropagation();
      if (!loading) onClick();
    }}
    disabled={loading}
    className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors"
    style={{
      background: "#FAF5FF",
      color: "#6C47FF",
      border: "0.5px solid rgba(108,71,255,0.25)",
    }}
  >
    {loading ? <Loader2 size={10} className="animate-spin" style={{ color: "#6C47FF" }} /> : <VennIcon />}
    <span>Organize</span>
  </button>
);

/* ── Smart Toggle ── */
export const SmartToggle = ({
  labels,
  viewMode,
  onSwitch,
}: {
  labels: [string, string];
  viewMode: "original" | "organized";
  onSwitch: (mode: "original" | "organized") => void;
}) => (
  <div className="flex rounded-lg overflow-hidden border border-border mx-4 mt-1 mb-2">
    {(["original", "organized"] as const).map((mode, idx) => (
      <button
        key={mode}
        onClick={() => onSwitch(mode)}
        className={`flex-1 text-[11px] font-medium py-1.5 transition-colors ${
          viewMode === mode
            ? "bg-primary text-primary-foreground"
            : "bg-card text-muted-foreground hover:bg-secondary/50"
        }`}
      >
        {labels[idx]}
      </button>
    ))}
  </div>
);

/* ── AI badge ── */
export const AiBadge = () => (
  <div className="mx-4 mb-2">
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium"
      style={{ background: "#FAF5FF", color: "#6C47FF", border: "0.5px solid rgba(108,71,255,0.25)" }}
    >
      <VennIcon />
      AI organized
    </span>
  </div>
);

/* ── Organized View ── */
export const OrganizedView = ({
  result,
  allItems,
  onToggle,
  onDelete,
}: {
  result: OrganizeResult;
  allItems: ShoppingItemBasic[];
  onToggle: (id: string, checked: boolean) => void;
  onDelete: (id: string) => void;
}) => {
  const itemMap = new Map(allItems.map((i) => [i.id, i]));

  // Filter out empty categories (all items checked or missing)
  const visibleCategories = result.categories.filter((cat) =>
    cat.item_ids.some((id) => {
      const item = itemMap.get(id);
      return item && !item.checked;
    })
  );

  // Categories where all items are checked
  const doneCategories = result.categories.filter(
    (cat) =>
      cat.item_ids.every((id) => {
        const item = itemMap.get(id);
        return !item || item.checked;
      }) &&
      cat.item_ids.some((id) => itemMap.has(id))
  );

  return (
    <div className="divide-y divide-border/50">
      {visibleCategories.map((cat) => (
        <div key={cat.label}>
          <div className="px-4 py-1.5 bg-secondary/20">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              {cat.label}
            </p>
          </div>
          {cat.item_ids.map((id) => {
            const item = itemMap.get(id);
            if (!item || item.checked) return null;
            return (
              <div key={id} className="flex items-center gap-3 px-4 py-2.5 group">
                <button
                  onClick={() => onToggle(id, false)}
                  className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all border-muted-foreground/30 hover:border-primary/50"
                >
                </button>
                <span className="flex-1 text-sm text-foreground">{item.name}</span>
                <button
                  onClick={() => onDelete(id)}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-destructive transition-all"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            );
          })}
        </div>
      ))}

      {/* Checked items */}
      {doneCategories.map((cat) => (
        <div key={`done-${cat.label}`}>
          <div className="px-4 py-1.5 bg-secondary/20">
            <p className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider line-through">
              {cat.label}
            </p>
          </div>
          {cat.item_ids.map((id) => {
            const item = itemMap.get(id);
            if (!item) return null;
            return (
              <div key={id} className="flex items-center gap-3 px-4 py-2.5 group">
                <button
                  onClick={() => onToggle(id, true)}
                  className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 bg-primary border-primary"
                >
                  <Check size={12} className="text-primary-foreground" />
                </button>
                <span className="flex-1 text-sm line-through text-muted-foreground/50">{item.name}</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
};
