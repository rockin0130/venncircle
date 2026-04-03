import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, ShoppingCart, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";

interface ShoppingList {
  id: string;
  label: string;
  date_range_start: string | null;
  date_range_end: string | null;
  is_meal_plan: boolean;
  created_at: string;
}

interface ShoppingListItem {
  id: string;
  list_id: string;
  name: string;
  checked: boolean;
  created_at: string;
}

const ShoppingListPage = () => {
  const { user, activeGroup } = useAuth();
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [items, setItems] = useState<ShoppingListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newItemText, setNewItemText] = useState<Record<string, string>>({});
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [manualItemText, setManualItemText] = useState("");

  const groupId = activeGroup?.id;

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    let listQuery = supabase
      .from("shopping_lists")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (groupId) listQuery = listQuery.eq("group_id", groupId);

    const { data: listsData } = await listQuery;
    const fetchedLists = (listsData || []) as ShoppingList[];
    setLists(fetchedLists);

    if (fetchedLists.length > 0) {
      const listIds = fetchedLists.map((l) => l.id);
      const { data: itemsData } = await supabase
        .from("shopping_list_items")
        .select("*")
        .in("list_id", listIds)
        .order("created_at", { ascending: true });
      setItems((itemsData || []) as ShoppingListItem[]);
    } else {
      setItems([]);
    }

    setLoading(false);
  }, [user, groupId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const getOrCreateManualList = async (): Promise<string | null> => {
    if (!user) return null;
    const existing = lists.find((l) => !l.is_meal_plan);
    if (existing) return existing.id;

    const insertData: any = {
      user_id: user.id,
      label: "My Items",
      is_meal_plan: false,
    };
    if (groupId) insertData.group_id = groupId;

    const { data, error } = await supabase
      .from("shopping_lists")
      .insert(insertData)
      .select()
      .single();
    if (error || !data) {
      toast({ title: "Error creating list", variant: "destructive" });
      return null;
    }
    setLists((prev) => [data as ShoppingList, ...prev]);
    return data.id;
  };

  const addItem = async (listId: string, name: string) => {
    if (!user || !name.trim()) return;
    const { data, error } = await supabase
      .from("shopping_list_items")
      .insert({ list_id: listId, user_id: user.id, name: name.trim() })
      .select()
      .single();
    if (error) {
      toast({ title: "Error adding item", variant: "destructive" });
      return;
    }
    setItems((prev) => [...prev, data as ShoppingListItem]);
  };

  const toggleItem = async (itemId: string, checked: boolean) => {
    const { error } = await supabase
      .from("shopping_list_items")
      .update({ checked: !checked })
      .eq("id", itemId);
    if (!error) {
      setItems((prev) =>
        prev.map((i) => (i.id === itemId ? { ...i, checked: !checked } : i))
      );
    }
  };

  const deleteItem = async (itemId: string) => {
    await supabase.from("shopping_list_items").delete().eq("id", itemId);
    setItems((prev) => prev.filter((i) => i.id !== itemId));
  };

  const deleteList = async (listId: string) => {
    await supabase.from("shopping_lists").delete().eq("id", listId);
    setLists((prev) => prev.filter((l) => l.id !== listId));
    setItems((prev) => prev.filter((i) => i.list_id !== listId));
    toast({ title: "List deleted" });
  };

  const handleManualAdd = async () => {
    if (!manualItemText.trim()) return;
    const listId = await getOrCreateManualList();
    if (!listId) return;
    await addItem(listId, manualItemText);
    setManualItemText("");
    setShowManualAdd(false);
  };

  const handleInlineAdd = async (listId: string) => {
    const text = newItemText[listId];
    if (!text?.trim()) return;
    await addItem(listId, text);
    setNewItemText((prev) => ({ ...prev, [listId]: "" }));
  };

  // Separate meal plan lists from manual lists
  const mealPlanLists = lists.filter((l) => l.is_meal_plan);
  const manualLists = lists.filter((l) => !l.is_meal_plan);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <ShoppingCart className="w-8 h-8 animate-pulse text-muted-foreground" />
      </div>
    );
  }

  const totalItems = items.length;
  const checkedItems = items.filter((i) => i.checked).length;

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <div className="px-5 pt-6 pb-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <ShoppingCart size={24} className="text-primary" />
              Shopping List
            </h1>
            {totalItems > 0 && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {checkedItems}/{totalItems} items checked
              </p>
            )}
          </div>
          <Button
            size="sm"
            onClick={() => setShowManualAdd(true)}
            className="gap-1.5"
          >
            <Plus size={16} />
            Add Item
          </Button>
        </div>
      </div>

      {/* Manual add input */}
      <AnimatePresence>
        {showManualAdd && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden px-5"
          >
            <div className="flex gap-2 pb-3">
              <Input
                value={manualItemText}
                onChange={(e) => setManualItemText(e.target.value)}
                placeholder="e.g. Eggs, Milk, Bread..."
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleManualAdd();
                }}
                autoFocus
              />
              <Button size="icon" onClick={handleManualAdd} variant="default">
                <Check size={16} />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => {
                  setShowManualAdd(false);
                  setManualItemText("");
                }}
              >
                <X size={16} />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="px-4 pb-8 space-y-4 flex-1">
        {lists.length === 0 && (
          <div className="text-center py-16">
            <ShoppingCart size={48} className="mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground text-sm font-medium">No shopping lists yet</p>
            <p className="text-muted-foreground/70 text-xs mt-1">
              Ask the AI to create a meal plan, or add items manually
            </p>
          </div>
        )}

        {/* Manual lists first */}
        {manualLists.map((list) => (
          <ListSection
            key={list.id}
            list={list}
            items={items.filter((i) => i.list_id === list.id)}
            onToggle={toggleItem}
            onDelete={deleteItem}
            onDeleteList={deleteList}
            newItemText={newItemText[list.id] || ""}
            onNewItemTextChange={(t) =>
              setNewItemText((prev) => ({ ...prev, [list.id]: t }))
            }
            onAddItem={() => handleInlineAdd(list.id)}
          />
        ))}

        {/* Weekly meal plan lists */}
        {mealPlanLists.map((list) => (
          <ListSection
            key={list.id}
            list={list}
            items={items.filter((i) => i.list_id === list.id)}
            onToggle={toggleItem}
            onDelete={deleteItem}
            onDeleteList={deleteList}
            newItemText={newItemText[list.id] || ""}
            onNewItemTextChange={(t) =>
              setNewItemText((prev) => ({ ...prev, [list.id]: t }))
            }
            onAddItem={() => handleInlineAdd(list.id)}
          />
        ))}
      </div>
    </div>
  );
};

interface ListSectionProps {
  list: ShoppingList;
  items: ShoppingListItem[];
  onToggle: (id: string, checked: boolean) => void;
  onDelete: (id: string) => void;
  onDeleteList: (id: string) => void;
  newItemText: string;
  onNewItemTextChange: (text: string) => void;
  onAddItem: () => void;
}

const ListSection = ({
  list,
  items,
  onToggle,
  onDelete,
  onDeleteList,
  newItemText,
  onNewItemTextChange,
  onAddItem,
}: ListSectionProps) => {
  const unchecked = items.filter((i) => !i.checked);
  const checked = items.filter((i) => i.checked);

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      {/* Section header */}
      <div className="flex items-center justify-between px-4 py-3 bg-secondary/30">
        <div>
          <p className="text-sm font-semibold text-foreground">
            {list.is_meal_plan ? "🍽️" : "📝"} {list.label}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
            {checked.length}/{items.length}
          </span>
          <button
            onClick={() => onDeleteList(list.id)}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Items */}
      <div className="divide-y divide-border/50">
        {unchecked.map((item) => (
          <ShoppingItem
            key={item.id}
            item={item}
            onToggle={onToggle}
            onDelete={onDelete}
          />
        ))}

        {/* Inline add */}
        <div className="flex items-center gap-2 px-4 py-2">
          <Plus size={14} className="text-muted-foreground shrink-0" />
          <input
            value={newItemText}
            onChange={(e) => onNewItemTextChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onAddItem();
            }}
            placeholder="Add item..."
            className="flex-1 text-sm bg-transparent border-none outline-none placeholder:text-muted-foreground/50"
          />
        </div>

        {/* Checked items */}
        {checked.length > 0 && (
          <>
            <div className="px-4 py-1.5 bg-secondary/20">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Purchased ({checked.length})
              </p>
            </div>
            {checked.map((item) => (
              <ShoppingItem
                key={item.id}
                item={item}
                onToggle={onToggle}
                onDelete={onDelete}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
};

const ShoppingItem = ({
  item,
  onToggle,
  onDelete,
}: {
  item: ShoppingListItem;
  onToggle: (id: string, checked: boolean) => void;
  onDelete: (id: string) => void;
}) => (
  <div className="flex items-center gap-3 px-4 py-2.5 group">
    <button
      onClick={() => onToggle(item.id, item.checked)}
      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
        item.checked
          ? "bg-primary border-primary"
          : "border-muted-foreground/30 hover:border-primary/50"
      }`}
    >
      {item.checked && <Check size={12} className="text-primary-foreground" />}
    </button>
    <span
      className={`flex-1 text-sm transition-all ${
        item.checked
          ? "line-through text-muted-foreground/50"
          : "text-foreground"
      }`}
    >
      {item.name}
    </span>
    <button
      onClick={() => onDelete(item.id)}
      className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-destructive transition-all"
    >
      <Trash2 size={12} />
    </button>
  </div>
);

export default ShoppingListPage;
