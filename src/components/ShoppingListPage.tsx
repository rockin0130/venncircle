import { useState, useEffect, useCallback, useMemo } from "react";
import { Plus, Trash2, ShoppingCart, Check, X, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, Group, GroupMember } from "@/context/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import CreateGroupModal from "@/components/CreateGroupModal";
import ShoppingNudgeSheet, { NudgePill } from "@/components/ShoppingNudgeSheet";
import ShoppingGroceryCard from "@/components/ShoppingGroceryCard";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface ShoppingList {
  id: string;
  label: string;
  date_range_start: string | null;
  date_range_end: string | null;
  is_meal_plan: boolean;
  created_at: string;
  group_id?: string | null;
}

interface ShoppingListItem {
  id: string;
  list_id: string;
  name: string;
  checked: boolean;
  created_at: string;
  meal_name?: string | null;
  assignee_user_ids?: string[];
}

const PERSONAL_SENTINEL = "__personal__";

const ShoppingListPage = () => {
  const { user, groups } = useAuth();
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [items, setItems] = useState<ShoppingListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newItemText, setNewItemText] = useState<Record<string, string>>({});
  
  const [manualItemText, setManualItemText] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [nudgeOpen, setNudgeOpen] = useState(false);
  const [groceryPickerOpen, setGroceryPickerOpen] = useState(false);
  const [pendingGroceryItem, setPendingGroceryItem] = useState<string | null>(null);
  const [selectedSubCard, setSelectedSubCard] = useState<{ listId: string; mealName: string | null; label: string }>({ listId: "", mealName: null, label: "" });
  const [grocerySubCardOptions, setGrocerySubCardOptions] = useState<{ listId: string; mealName: string | null; label: string }[]>([]);

  // Card-level add sheet state
  type CardAddTarget = {
    type: "manual";
    listId: string;
    label: string;
  } | {
    type: "grocery";
    lists: ShoppingList[];
  };
  const [cardAddOpen, setCardAddOpen] = useState(false);
  const [cardAddTarget, setCardAddTarget] = useState<CardAddTarget | null>(null);
  const [cardAddText, setCardAddText] = useState("");
  const [cardAddSubCard, setCardAddSubCard] = useState<{ listId: string; mealName: string | null; label: string }>({ listId: "", mealName: null, label: "" });
  const [cardAddSubOptions, setCardAddSubOptions] = useState<{ listId: string; mealName: string | null; label: string }[]>([]);
  const [showNewGroupInput, setShowNewGroupInput] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");

  const [localContextId, setLocalContextId] = useState<string>(PERSONAL_SENTINEL);

  const isMineView = localContextId === PERSONAL_SENTINEL;

  const shoppingGroups = useMemo(
    () => groups.filter((g) => g.shared_pages?.includes("shopping")),
    [groups]
  );

  const localGroup = useMemo(
    () => (localContextId === PERSONAL_SENTINEL ? null : shoppingGroups.find((g) => g.id === localContextId) || null),
    [localContextId, shoppingGroups]
  );

  const groupId = localGroup?.id;
  const isGroupView = !!localGroup;

  const groupMembers: GroupMember[] = useMemo(
    () => localGroup?.members?.filter((m: GroupMember) => m.status === "active") || [],
    [localGroup]
  );

  const groupNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    groups.forEach((g) => { map[g.id] = g.name; });
    return map;
  }, [groups]);

  const listGroupLabelMap = useMemo(() => {
    const map: Record<string, string> = {};
    lists.forEach((l) => {
      map[l.id] = l.group_id ? (groupNameMap[l.group_id] || "Group") : "Personal";
    });
    return map;
  }, [lists, groupNameMap]);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    let listQuery = supabase
      .from("shopping_lists")
      .select("*")
      .order("created_at", { ascending: false });

    if (isMineView) {
      // Aggregate view: fetch all accessible lists (RLS handles access)
      // No additional filters
    } else if (groupId) {
      listQuery = listQuery.eq("group_id", groupId);
    }

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
  }, [user, groupId, isMineView]);

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

  const getOrCreateCategoryList = async (category: string, icon: string, isMealPlan: boolean): Promise<string | null> => {
    if (!user) return null;

    if (isMealPlan) {
      const existing = lists.find((l) => l.is_meal_plan);
      if (existing) return existing.id;
    } else {
      const existing = lists.find((l) => !l.is_meal_plan && l.label === category);
      if (existing) return existing.id;
    }

    const insertData: any = {
      user_id: user.id,
      label: isMealPlan ? "Grocery" : category,
      is_meal_plan: isMealPlan,
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

  const handleManualAdd = async () => {
    if (!manualItemText.trim()) return;
    const itemName = manualItemText.trim();
    setManualItemText("");
    

    const existingCategories = lists
      .filter((l) => !l.is_meal_plan)
      .map((l) => l.label);
    if (lists.some((l) => l.is_meal_plan)) existingCategories.push("Grocery");

    let targetListId: string | null = null;

    try {
      const { data: catData } = await supabase.functions.invoke("ai-nutrition", {
        body: {
          action: "categorize_item",
          item_name: itemName,
          existing_categories: existingCategories,
        },
      });

      if (catData && !catData.error) {
        const { category, icon, is_grocery } = catData as { category: string; icon: string; is_grocery: boolean };

        if (is_grocery) {
          const existingGroceryLists = lists.filter((l) => l.is_meal_plan);
          if (existingGroceryLists.length > 0) {
            // Build sub-card options from existing grocery lists
            const groceryItems = items.filter((i) => existingGroceryLists.some((l) => l.id === i.list_id));
            const subCardOptions: { listId: string; mealName: string | null; label: string }[] = [];

            existingGroceryLists.forEach((gl) => {
              subCardOptions.push({ listId: gl.id, mealName: null, label: gl.label });
              const mealNames = new Set(
                groceryItems.filter((i) => i.list_id === gl.id && i.meal_name).map((i) => i.meal_name!)
              );
              mealNames.forEach((mn) => {
                subCardOptions.push({ listId: gl.id, mealName: mn, label: mn });
              });
            });

            // Add "Other" option — uses first grocery list with no meal_name
            const otherOption = { listId: existingGroceryLists[0].id, mealName: null as string | null, label: "Other" };

            setPendingGroceryItem(itemName);
            setGrocerySubCardOptions([...subCardOptions, otherOption]);
            setSelectedSubCard(otherOption);
            setGroceryPickerOpen(true);
            return;
          }
          targetListId = await getOrCreateCategoryList("Grocery", "🛒", true);
        } else if (category && category !== "My Items") {
          targetListId = await getOrCreateCategoryList(category, icon || "📦", false);
        }
      }
    } catch {
      // AI failed silently — fall back to My Items
    }

    if (!targetListId) {
      targetListId = await getOrCreateManualList();
    }

    if (targetListId) {
      await addItem(targetListId, itemName);
    }
  };

  const handleInlineAdd = async (listId: string) => {
    const text = newItemText[listId];
    if (!text?.trim()) return;
    await addItem(listId, text);
    setNewItemText((prev) => ({ ...prev, [listId]: "" }));
  };

  const openCardAddSheet = (target: CardAddTarget) => {
    setCardAddTarget(target);
    setCardAddText("");
    setShowNewGroupInput(false);
    setNewGroupName("");

    if (target.type === "grocery") {
      // Build sub-card options from grocery lists
      const groceryItems = items.filter((i) => target.lists.some((l) => l.id === i.list_id));
      const opts: { listId: string; mealName: string | null; label: string }[] = [];
      target.lists.forEach((gl) => {
        // Add the list itself as an option (e.g. "Week of 4/6 – 4/12")
        opts.push({ listId: gl.id, mealName: null, label: gl.label });
        // Add meal sub-groups inside this list
        const mealNames = new Set(
          groceryItems.filter((i) => i.list_id === gl.id && i.meal_name).map((i) => i.meal_name!)
        );
        mealNames.forEach((mn) => {
          opts.push({ listId: gl.id, mealName: mn, label: `${gl.label} → ${mn}` });
        });
      });
      const otherOpt = { listId: "", mealName: null, label: "Other" };
      setCardAddSubOptions([...opts, otherOpt]);
      setCardAddSubCard(otherOpt);
    } else {
      setCardAddSubOptions([]);
      setCardAddSubCard({ listId: "", mealName: null, label: "" });
    }
    setCardAddOpen(true);
  };

  const handleCardAddConfirm = async () => {
    if (!user || !cardAddText.trim() || !cardAddTarget) return;
    const itemName = cardAddText.trim();

    if (cardAddTarget.type === "manual") {
      await addItem(cardAddTarget.listId, itemName);
    } else {
      // Grocery — determine target
      if (showNewGroupInput && newGroupName.trim()) {
        // Create a new sub-card (shopping_list) with custom name
        const insertData: any = {
          user_id: user.id,
          label: newGroupName.trim(),
          is_meal_plan: true,
        };
        if (groupId) insertData.group_id = groupId;
        const { data: newList, error: listErr } = await supabase
          .from("shopping_lists")
          .insert(insertData)
          .select()
          .single();
        if (listErr || !newList) {
          toast({ title: "Error creating list", variant: "destructive" });
          return;
        }
        setLists((prev) => [...prev, newList as ShoppingList]);
        await addItem(newList.id, itemName);
      } else if (cardAddSubCard.label === "Other") {
        // Create an "Other" sub-card
        const insertData: any = {
          user_id: user.id,
          label: "Other",
          is_meal_plan: true,
        };
        if (groupId) insertData.group_id = groupId;
        const { data: newList, error: listErr } = await supabase
          .from("shopping_lists")
          .insert(insertData)
          .select()
          .single();
        if (listErr || !newList) {
          toast({ title: "Error creating list", variant: "destructive" });
          return;
        }
        setLists((prev) => [...prev, newList as ShoppingList]);
        await addItem(newList.id, itemName);
      } else {
        // Add to existing list with optional meal_name
        const { data, error } = await supabase
          .from("shopping_list_items")
          .insert({
            list_id: cardAddSubCard.listId,
            user_id: user.id,
            name: itemName,
            meal_name: cardAddSubCard.mealName,
          })
          .select()
          .single();
        if (!error && data) {
          setItems((prev) => [...prev, data as ShoppingListItem]);
        }
      }
    }

    setCardAddOpen(false);
    setCardAddTarget(null);
    setCardAddText("");
  };

  const mealPlanLists = lists.filter((l) => l.is_meal_plan);
  const manualLists = lists.filter((l) => !l.is_meal_plan);

  // In Mine aggregate view, group manual lists by label
  const manualListsByLabel = useMemo(() => {
    if (!isMineView) return null;
    const map: Record<string, ShoppingList[]> = {};
    manualLists.forEach((l) => {
      if (!map[l.label]) map[l.label] = [];
      map[l.label].push(l);
    });
    return map;
  }, [isMineView, manualLists]);

  const sortedManualLabels = useMemo(() => {
    if (!manualListsByLabel) return [];
    return Object.keys(manualListsByLabel).sort((a, b) =>
      a === "My Items" ? -1 : b === "My Items" ? 1 : a.localeCompare(b)
    );
  }, [manualListsByLabel]);

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
        </div>
      </div>

      {/* Context toggle row */}
      <div className="px-5 pb-2">
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide scroll-smooth-touch py-1 -mx-1 px-1" style={{ WebkitOverflowScrolling: "touch" }}>
          <button
            onClick={() => setLocalContextId(PERSONAL_SENTINEL)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all flex-shrink-0 border ${
              localContextId === PERSONAL_SENTINEL
                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground"
            }`}
          >
            <span className="text-sm leading-none">👤</span>
            <span>Mine</span>
          </button>

          {shoppingGroups.map((group) => {
            const isActive = localContextId === group.id;
            const isFamily = group.name.toLowerCase() === "family" || group.category === "home";
            return (
              <button
                key={group.id}
                onClick={() => setLocalContextId(group.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all flex-shrink-0 border ${
                  isActive
                    ? isFamily
                      ? "border-emerald-600 bg-emerald-600 text-white shadow-sm"
                      : "border-primary bg-primary text-primary-foreground shadow-sm"
                    : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground"
                }`}
              >
                <span className="text-sm leading-none">{group.emoji}</span>
                <span className="truncate max-w-[120px]">{group.name}</span>
              </button>
            );
          })}

          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold transition-all flex-shrink-0 border border-dashed border-primary/30 text-primary hover:bg-primary/5"
          >
            <Plus size={12} />
            <span>Add Group</span>
          </button>
        </div>
      </div>

      <CreateGroupModal
        open={showCreate}
        onOpenChange={setShowCreate}
        defaultPage="shopping"
      />

      {/* Inline add bar */}
      <div className="px-5 pb-3">
        <div
          className="flex items-center gap-2.5 w-full bg-card border border-border rounded-xl px-3.5 py-2.5 cursor-text"
          onClick={() => {
            const inp = document.getElementById("shopping-inline-add") as HTMLInputElement;
            inp?.focus();
          }}
        >
          {/* Venn diagram icon */}
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="shrink-0">
            <circle cx="7.5" cy="10" r="5.5" stroke="#6C47FF" strokeWidth="1.5" fill="none" opacity="0.7" />
            <circle cx="12.5" cy="10" r="5.5" stroke="#6C47FF" strokeWidth="1.5" fill="none" opacity="0.7" />
          </svg>
          <input
            id="shopping-inline-add"
            type="text"
            value={manualItemText}
            onChange={(e) => setManualItemText(e.target.value)}
            placeholder="Add an item..."
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleManualAdd();
            }}
          />
          {manualItemText.trim() && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleManualAdd();
              }}
              className="p-1 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Check size={14} />
            </button>
          )}
        </div>
      </div>

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

        {/* Manual lists */}
        {isMineView && manualListsByLabel ? (
          // Mine aggregate: one card per label combining all groups
          sortedManualLabels.map((label) => {
            const listsForLabel = manualListsByLabel[label];
            const combinedItems = items.filter((i) => listsForLabel.some((l) => l.id === i.list_id));
            const primaryList = listsForLabel[0];
            return (
              <ListSection
                key={label}
                list={primaryList}
                items={combinedItems}
                onToggle={toggleItem}
                onDelete={deleteItem}
                onDeleteList={deleteList}
                onAddToCard={() => openCardAddSheet({ type: "manual", listId: primaryList.id, label })}
                isGroupView={false}
                onNudge={() => {}}
                isMineView={true}
                listGroupLabelMap={listGroupLabelMap}
              />
            );
          })
        ) : (
          manualLists.map((list) => (
            <ListSection
              key={list.id}
              list={list}
              items={items.filter((i) => i.list_id === list.id)}
              onToggle={toggleItem}
              onDelete={deleteItem}
              onDeleteList={deleteList}
              onAddToCard={() => openCardAddSheet({ type: "manual", listId: list.id, label: list.label })}
              isGroupView={isGroupView}
              onNudge={() => setNudgeOpen(true)}
            />
          ))
        )}

        {/* Grocery card wrapping all meal plan lists */}
        {mealPlanLists.length > 0 && (
          <ShoppingGroceryCard
            lists={mealPlanLists}
            allItems={items.filter((i) => mealPlanLists.some((l) => l.id === i.list_id))}
            onToggle={toggleItem}
            onDelete={deleteItem}
            onDeleteList={deleteList}
            isGroupView={isGroupView}
            groupMembers={groupMembers}
            onNudge={() => setNudgeOpen(true)}
            isMineView={isMineView}
            listGroupLabelMap={listGroupLabelMap}
            onAddToCard={() => openCardAddSheet({ type: "grocery", lists: mealPlanLists })}
          />
        )}
      </div>

      <ShoppingNudgeSheet
        open={nudgeOpen}
        onOpenChange={setNudgeOpen}
        groupMembers={groupMembers}
      />

      {/* Grocery sub-card picker */}
      <Dialog open={groceryPickerOpen} onOpenChange={(open) => {
        if (!open) {
          setGroceryPickerOpen(false);
          setPendingGroceryItem(null);
        }
      }}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-base">Add to…</DialogTitle>
          </DialogHeader>
          <div className="space-y-1 max-h-60 overflow-y-auto -mx-1 px-1">
            {grocerySubCardOptions.map((opt, idx) => {
              const isSelected = selectedSubCard.listId === opt.listId && selectedSubCard.mealName === opt.mealName;
              return (
                <button
                  key={`${opt.listId}-${opt.mealName ?? "other"}-${idx}`}
                  onClick={() => setSelectedSubCard(opt)}
                  className={`flex items-center gap-2 w-full px-3 py-2.5 rounded-lg text-sm transition-all ${
                    isSelected
                      ? "bg-primary/10 text-primary font-semibold border border-primary/30"
                      : "text-foreground hover:bg-secondary/50 border border-transparent"
                  }`}
                >
                  <ChevronRight size={12} className={isSelected ? "text-primary" : "text-muted-foreground"} />
                  <span className="truncate">{opt.label}</span>
                  {isSelected && <Check size={14} className="ml-auto text-primary shrink-0" />}
                </button>
              );
            })}
          </div>
          <Button
            className="w-full mt-2"
            onClick={async () => {
              if (!pendingGroceryItem) return;
              const isOther = selectedSubCard.label === "Other";

              let targetListId = selectedSubCard.listId;
              let mealName = selectedSubCard.mealName;

              if (isOther) {
                // Create a brand-new "Other" shopping_list (sub-card) for grocery
                const insertData: any = {
                  user_id: user!.id,
                  label: "Other",
                  is_meal_plan: true,
                };
                if (groupId) insertData.group_id = groupId;
                const { data: newList, error: listErr } = await supabase
                  .from("shopping_lists")
                  .insert(insertData)
                  .select()
                  .single();
                if (listErr || !newList) {
                  toast({ title: "Error creating list", variant: "destructive" });
                  setGroceryPickerOpen(false);
                  setPendingGroceryItem(null);
                  return;
                }
                setLists((prev) => [...prev, newList as ShoppingList]);
                targetListId = newList.id;
                mealName = null;
              }

              const { data, error } = await supabase
                .from("shopping_list_items")
                .insert({
                  list_id: targetListId,
                  user_id: user!.id,
                  name: pendingGroceryItem,
                  meal_name: mealName,
                })
                .select()
                .single();
              if (!error && data) {
                setItems((prev) => [...prev, data as ShoppingListItem]);
              }
              setGroceryPickerOpen(false);
              setPendingGroceryItem(null);
            }}
          >
            Confirm
          </Button>
        </DialogContent>
      </Dialog>

      {/* Card-level add sheet */}
      <Sheet open={cardAddOpen} onOpenChange={(open) => {
        if (!open) {
          setCardAddOpen(false);
          setCardAddTarget(null);
          setShowNewGroupInput(false);
          setNewGroupName("");
        }
      }}>
        <SheetContent side="bottom" className="rounded-t-2xl px-5 pb-8">
          <SheetHeader className="pb-3">
            <SheetTitle className="text-base">
              Add to {cardAddTarget?.type === "grocery" ? "Grocery" : cardAddTarget?.type === "manual" ? cardAddTarget.label : ""}
            </SheetTitle>
          </SheetHeader>

          <div className="space-y-4">
            <Input
              value={cardAddText}
              onChange={(e) => setCardAddText(e.target.value)}
              placeholder="Item name..."
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && cardAddText.trim()) handleCardAddConfirm();
              }}
            />

            {/* Sub-card selector — only for Grocery */}
            {cardAddTarget?.type === "grocery" && cardAddSubOptions.length > 0 && !showNewGroupInput && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Add to…</p>
                <div className="max-h-48 overflow-y-auto space-y-1 -mx-1 px-1">
                  {cardAddSubOptions.map((opt, idx) => {
                    const isSelected = cardAddSubCard.listId === opt.listId && cardAddSubCard.mealName === opt.mealName && cardAddSubCard.label === opt.label;
                    return (
                      <button
                        key={`${opt.listId}-${opt.mealName ?? "x"}-${idx}`}
                        onClick={() => setCardAddSubCard(opt)}
                        className={`flex items-center gap-2 w-full px-3 py-2.5 rounded-lg text-sm transition-all ${
                          isSelected
                            ? "bg-primary/10 text-primary font-semibold border border-primary/30"
                            : "text-foreground hover:bg-secondary/50 border border-transparent"
                        }`}
                      >
                        <ChevronRight size={12} className={isSelected ? "text-primary" : "text-muted-foreground"} />
                        <span className="truncate">{opt.label}</span>
                        {isSelected && <Check size={14} className="ml-auto text-primary shrink-0" />}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setShowNewGroupInput(true)}
                    className="flex items-center gap-2 w-full px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:bg-secondary/50 border border-transparent transition-all"
                  >
                    <Plus size={12} />
                    <span>Create new group…</span>
                  </button>
                </div>
              </div>
            )}

            {/* Create new group input */}
            {cardAddTarget?.type === "grocery" && showNewGroupInput && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">New group name</p>
                <div className="flex gap-2">
                  <Input
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    placeholder="e.g. Snacks, Party, etc."
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newGroupName.trim() && cardAddText.trim()) handleCardAddConfirm();
                    }}
                  />
                  <Button size="icon" variant="ghost" onClick={() => { setShowNewGroupInput(false); setNewGroupName(""); }}>
                    <X size={16} />
                  </Button>
                </div>
              </div>
            )}

            <Button
              className="w-full"
              disabled={!cardAddText.trim() || (showNewGroupInput && !newGroupName.trim())}
              onClick={handleCardAddConfirm}
            >
              {cardAddTarget?.type === "grocery" && !showNewGroupInput
                ? `Add to ${cardAddSubCard.label || "Grocery"}`
                : showNewGroupInput && newGroupName.trim()
                  ? `Add to ${newGroupName.trim()}`
                  : "Add"
              }
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};

/* ── GroupLabelPill ── */
const GroupLabelPill = ({ label }: { label: string }) => (
  <span
    className="inline-flex items-center px-1.5 py-0.5 rounded-full font-normal shrink-0"
    style={{ fontSize: "11px", color: "#888", background: "hsl(var(--secondary) / 0.5)" }}
  >
    {label}
  </span>
);

/* ── ListSection ── */

interface ListSectionProps {
  list: {
    id: string;
    label: string;
    is_meal_plan: boolean;
  };
  items: ShoppingListItem[];
  onToggle: (id: string, checked: boolean) => void;
  onDelete: (id: string) => void;
  onDeleteList: (id: string) => void;
  onAddToCard: () => void;
  isGroupView: boolean;
  onNudge: () => void;
  isMineView?: boolean;
  listGroupLabelMap?: Record<string, string>;
}

interface ShoppingListItem {
  id: string;
  list_id: string;
  name: string;
  checked: boolean;
  created_at: string;
  meal_name?: string | null;
  assignee_user_ids?: string[];
}

const ListSection = ({
  list,
  items,
  onToggle,
  onDelete,
  onDeleteList,
  onAddToCard,
  isGroupView,
  onNudge,
  isMineView,
  listGroupLabelMap,
}: ListSectionProps) => {
  const unchecked = items.filter((i) => !i.checked);
  const checked = items.filter((i) => i.checked);

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-secondary/30">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-foreground">
            {list.is_meal_plan ? "🍽️" : "📝"} {list.label}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
            {checked.length}/{items.length}
          </span>
          {isGroupView && <NudgePill onClick={onNudge} />}
          <button
            onClick={onAddToCard}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
          >
            <Plus size={14} />
          </button>
          <button
            onClick={() => onDeleteList(list.id)}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className="divide-y divide-border/50">
        {unchecked.map((item) => (
          <ShoppingItem
            key={item.id}
            item={item}
            onToggle={onToggle}
            onDelete={onDelete}
            groupLabel={isMineView ? listGroupLabelMap?.[item.list_id] : undefined}
          />
        ))}

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
                groupLabel={isMineView ? listGroupLabelMap?.[item.list_id] : undefined}
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
  groupLabel,
}: {
  item: ShoppingListItem;
  onToggle: (id: string, checked: boolean) => void;
  onDelete: (id: string) => void;
  groupLabel?: string;
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
    {groupLabel && <GroupLabelPill label={groupLabel} />}
    <button
      onClick={() => onDelete(item.id)}
      className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-destructive transition-all"
    >
      <Trash2 size={12} />
    </button>
  </div>
);

export default ShoppingListPage;
