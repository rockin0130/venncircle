import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Apple, Plus, Sparkles, RefreshCw, ChevronLeft, ChevronRight, Check, X, Loader2, Settings, Calendar, Target, Camera, ArrowLeftRight, Pencil, Clock, Zap, Users, EyeOff, Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Group, useAuth, GroupMember } from "@/context/AuthContext";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useGroupContext } from "@/hooks/useGroupContext";
import { useModalScrollLock } from "@/hooks/useModalScrollLock";
import PageGroupSelector from "@/components/PageGroupSelector";
import NutritionUserFilter, { EVERYONE_SENTINEL } from "@/components/NutritionUserFilter";
import NutritionDateStrip from "@/components/NutritionDateStrip";
import NutritionWeekView from "@/components/NutritionWeekView";
import { CalendarDays, LayoutList } from "lucide-react";


const fmtDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

interface MealLog {
  id: string;
  meal_type: string;
  title: string;
  protein: number;
  calories: number;
  carbs: number;
  fat: number;
  fiber: number;
  ingredients: string[];
  prep_steps: string[];
  is_ai_generated: boolean;
  meal_date: string;
  group_id?: string | null;
  user_id?: string;
  consumed?: boolean;
}

interface MealSuggestion {
  id: string;
  meal_type: string;
  title: string;
  protein: number;
  calories: number;
  carbs: number;
  fat: number;
  fiber: number;
  ingredients: string[];
  prep_steps: string[];
  suggestion_date?: string;
  group_id?: string | null;
  user_id?: string;
}

type TrackerKey = "protein" | "calories" | "carbs" | "fat" | "fiber";

const ALL_TRACKERS: { key: TrackerKey; label: string; unit: string; defaultGoal: number; color: string }[] = [
  { key: "protein", label: "Protein", unit: "g", defaultGoal: 150, color: "hsl(var(--primary))" },
  { key: "calories", label: "Calories", unit: "kcal", defaultGoal: 2000, color: "hsl(25 95% 53%)" },
  { key: "carbs", label: "Carbs", unit: "g", defaultGoal: 220, color: "hsl(45 93% 47%)" },
  { key: "fat", label: "Fat", unit: "g", defaultGoal: 70, color: "hsl(280 67% 55%)" },
  { key: "fiber", label: "Fiber", unit: "g", defaultGoal: 30, color: "hsl(142 71% 45%)" },
];

interface NutritionGoals {
  protein_goal: number;
  calorie_goal: number | null;
  carbs_goal: number | null;
  fat_goal: number | null;
  fiber_goal: number | null;
  show_calories: boolean;
  enabled_trackers: TrackerKey[];
  tracker_order: TrackerKey[];
}

type NutritionNavMode = "day" | "week";

const MEAL_TYPES = [
  { key: "breakfast", label: "Breakfast", icon: "🌅" },
  { key: "lunch", label: "Lunch", icon: "☀️" },
  { key: "dinner", label: "Dinner", icon: "🌙" },
  { key: "snack", label: "Snacks", icon: "🍎" },
];

const NutritionPage = ({ onOpenSettings }: { onOpenSettings?: () => void }) => {
  const { user, activeGroup, partner, profile, groups } = useAuth();
  const { hasOther, otherName } = useGroupContext();

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [navMode, setNavMode] = useState<NutritionNavMode>("day");

  // Per-context pill selection state
  const pillStateRef = useRef<Record<string, Set<string>>>({});
  const getContextKey = useCallback(() => {
    if ((activeGroup as any)?._personal) return "__personal__";
    if (activeGroup) return activeGroup.id;
    return "__all__";
  }, [activeGroup]);

  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set([EVERYONE_SENTINEL]));

  // Sync pill state per context
  useEffect(() => {
    const key = getContextKey();
    if (pillStateRef.current[key]) {
      setSelectedUserIds(pillStateRef.current[key]);
    } else {
      setSelectedUserIds(new Set([EVERYONE_SENTINEL]));
    }
  }, [getContextKey]);

  const handlePillChange = useCallback((ids: Set<string>) => {
    const key = getContextKey();
    pillStateRef.current[key] = ids;
    setSelectedUserIds(ids);
  }, [getContextKey]);

  // Data
  const [allMeals, setAllMeals] = useState<MealLog[]>([]);
  const [otherUserMeals, setOtherUserMeals] = useState<MealLog[]>([]);
  const [suggestions, setSuggestions] = useState<MealSuggestion[]>([]);
  const [goals, setGoals] = useState<NutritionGoals>({ protein_goal: 150, calorie_goal: null, carbs_goal: null, fat_goal: null, fiber_goal: null, show_calories: false, enabled_trackers: ["protein", "calories"], tracker_order: ["protein", "calories", "carbs", "fat", "fiber"] });
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  // AI suggestion results
  const [aiResults, setAiResults] = useState<any[]>([]);
  const [showAiResults, setShowAiResults] = useState(false);

  // Modals
  const [detailMeal, setDetailMeal] = useState<(MealLog | MealSuggestion) & { _type?: "log" | "suggestion" } | null>(null);
  const [detailEditMode, setDetailEditMode] = useState(false);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [showAddMeal, setShowAddMeal] = useState<{ mealType: string; date: string } | null>(null);
  const [showGoalSettings, setShowGoalSettings] = useState(false);
  const [manualTitle, setManualTitle] = useState("");
  const [manualProtein, setManualProtein] = useState("");
  const [manualCalories, setManualCalories] = useState("");
  const [manualCarbs, setManualCarbs] = useState("");
  const [manualFat, setManualFat] = useState("");
  const [manualFiber, setManualFiber] = useState("");
  const [manualFoodText, setManualFoodText] = useState("");
  const [aiEstimating, setAiEstimating] = useState(false);
  const [goalProtein, setGoalProtein] = useState("150");
  
  // Inline edit state (used inside detail modal)
  const [editTitle, setEditTitle] = useState("");
  const [editProtein, setEditProtein] = useState("");
  const [editCalories, setEditCalories] = useState("");
  const [editCarbs, setEditCarbs] = useState("");
  const [editFat, setEditFat] = useState("");
  const [editFiber, setEditFiber] = useState("");
  const [editMealType, setEditMealType] = useState("lunch");
  const [editIngredients, setEditIngredients] = useState<string[]>([]);
  const [editPrepSteps, setEditPrepSteps] = useState<string[]>([]);
  const [goalCalories, setGoalCalories] = useState("");
  const [goalCarbs, setGoalCarbs] = useState("");
  const [goalFat, setGoalFat] = useState("");
  const [goalFiber, setGoalFiber] = useState("");
  const [goalShowCal, setGoalShowCal] = useState(false);
  const [goalEnabledTrackers, setGoalEnabledTrackers] = useState<TrackerKey[]>(["protein", "calories"]);
  const [cameraAnalyzing, setCameraAnalyzing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Add meal: group sharing selection — Personal always included
  const [addMealGroupIds, setAddMealGroupIds] = useState<string[]>([]);
  const [aiConfirmSelection, setAiConfirmSelection] = useState<{ suggestion: any; index: number } | null>(null);

  // Quick Suggestions / Frequent Items
  const [mealIdeasTab, setMealIdeasTab] = useState<"suggestions" | "frequent">("suggestions");
  const [frequentMeals, setFrequentMeals] = useState<{ title: string; protein: number; calories: number; carbs: number; fat: number; fiber: number; meal_type: string; count: number; ingredients: string[]; prep_steps: string[] }[]>([]);
  const [ideaPreview, setIdeaPreview] = useState<{ title: string; protein: number; calories: number; carbs: number; fat: number; fiber: number; meal_type: string; ingredients: string[]; prep_steps: string[] } | null>(null);

  // Shopping list prompt
  const [shopPrompt, setShopPrompt] = useState<{ ingredients: string[]; mealTitle: string; mealDate: string } | null>(null);
  const [shopQueue, setShopQueue] = useState<{ ingredients: string[]; mealTitle: string; mealDate: string }[]>([]);
  const [shopChecked, setShopChecked] = useState<Record<number, boolean>>({});
  const [shopSaving, setShopSaving] = useState(false);

  const dismissShopPrompt = () => {
    setShopPrompt(null);
    setShopQueue(prev => {
      if (prev.length > 0) {
        const [next, ...rest] = prev;
        setTimeout(() => {
          setShopChecked(Object.fromEntries(next.ingredients.map((_, i) => [i, true])));
          setShopPrompt(next);
        }, 200);
        return rest;
      }
      return prev;
    });
  };

  const enqueueShopPrompt = (item: { ingredients: string[]; mealTitle: string; mealDate: string }) => {
    if (shopPrompt) {
      setShopQueue(prev => [...prev, item]);
    } else {
      setShopChecked(Object.fromEntries(item.ingredients.map((_, i) => [i, true])));
      setShopPrompt(item);
    }
  };

  useModalScrollLock(!!detailMeal || !!showAddMeal || showGoalSettings || showAiResults || !!aiConfirmSelection || !!shopPrompt || !!ideaPreview);

  const isPersonalActive = (activeGroup as any)?._personal === true;
  const isAllView = activeGroup === null && !isPersonalActive;
  const isGroupView = !!activeGroup && !isPersonalActive;
  const groupId = isPersonalActive ? null : (activeGroup?.id || null);
  const dateStr = fmtDate(selectedDate);
  const isToday = dateStr === fmtDate(new Date());

  // Nutrition groups = groups with nutrition page enabled
  const nutritionGroups = useMemo(() => groups.filter(g => g.shared_pages?.includes("nutrition")), [groups]);

  const applyDefaultSharingSelection = useCallback(() => {
    if (groupId) {
      setAddMealGroupIds([groupId]);
    } else {
      setAddMealGroupIds([]);
    }
  }, [groupId]);

  const resetSharingSelection = useCallback(() => {
    setAddMealGroupIds([]);
  }, []);

  // Create meal: always save to Personal (group_id=null) + optionally to selected groups
  const createMealsForSharing = useCallback(async (mealPayload: {
    meal_date: string;
    meal_type: string;
    title: string;
    ingredients?: string[];
    prep_steps?: string[];
    protein: number;
    calories: number;
    carbs?: number;
    fat?: number;
    fiber?: number;
    is_ai_generated: boolean;
    ai_tags?: string[];
    consumed: boolean;
  }): Promise<MealLog[]> => {
    if (!user) return [];

    // Always Personal (null) + selected groups
    const targets: (string | null)[] = [null];
    for (const gid of addMealGroupIds) {
      if (gid && !targets.includes(gid)) targets.push(gid);
    }

    const results = await Promise.all(
      targets.map((targetGroupId) =>
        supabase
          .from("meal_logs")
          .insert({
            user_id: user.id,
            group_id: targetGroupId,
            meal_date: mealPayload.meal_date,
            meal_type: mealPayload.meal_type,
            title: mealPayload.title,
            ingredients: mealPayload.ingredients || [],
            prep_steps: mealPayload.prep_steps || [],
            protein: mealPayload.protein,
            calories: mealPayload.calories,
            carbs: mealPayload.carbs || 0,
            fat: mealPayload.fat || 0,
            fiber: mealPayload.fiber || 0,
            is_ai_generated: mealPayload.is_ai_generated,
            ai_tags: mealPayload.ai_tags || [],
            consumed: mealPayload.consumed,
          })
          .select()
          .single()
      )
    );

    const insertedMeals = results.flatMap((result) => {
      if (result.error || !result.data) return [];
      return [result.data as MealLog];
    });

    if (insertedMeals.length === 0) {
      toast.error("Couldn't save meal.");
    }

    return insertedMeals;
  }, [addMealGroupIds, user]);

  const rangeDates = useMemo(() => {
    return [fmtDate(selectedDate)];
  }, [selectedDate]);

  // Resolve which user IDs are currently selected
  const resolvedSelectedUserIds = useMemo(() => {
    if (!user) return new Set<string>();
    if (selectedUserIds.has(EVERYONE_SENTINEL)) {
      const ids = new Set<string>([user.id]);
      if (isGroupView && activeGroup) {
        activeGroup.members.filter((m: GroupMember) => m.status === "active").forEach(m => ids.add(m.user_id));
      } else if (isAllView) {
        nutritionGroups.forEach(g => g.members.filter((m: GroupMember) => m.status === "active").forEach(m => ids.add(m.user_id)));
      }
      return ids;
    }
    return selectedUserIds;
  }, [selectedUserIds, user, activeGroup, isGroupView, isAllView, nutritionGroups]);

  const isMySelected = useMemo(() => user ? resolvedSelectedUserIds.has(user.id) : false, [resolvedSelectedUserIds, user]);
  const selectedOtherIds = useMemo(() => {
    if (!user) return [];
    return [...resolvedSelectedUserIds].filter(id => id !== user.id);
  }, [resolvedSelectedUserIds, user]);
  const multipleSelected = resolvedSelectedUserIds.size > 1;

  // Load data
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);
      const startDate = rangeDates[0];
      const endDate = rangeDates[rangeDates.length - 1];

      // Load own meals across all relevant contexts
      let ownMealsQuery = supabase.from("meal_logs").select("*")
        .eq("user_id", user.id)
        .gte("meal_date", startDate)
        .lte("meal_date", endDate);

      let ownSuggestionsQuery = supabase.from("ai_meal_suggestions").select("*")
        .eq("user_id", user.id)
        .gte("suggestion_date", startDate)
        .lte("suggestion_date", endDate);

      if (isGroupView && groupId) {
        // In group view, load own meals for this group + personal (for "Only you" indicator)
        // We load all own meals (no group filter) so we can show the indicator
      } else if (isPersonalActive) {
        ownMealsQuery = ownMealsQuery.is("group_id", null);
        ownSuggestionsQuery = ownSuggestionsQuery.is("group_id", null);
      }
      // All view: load all own meals (no group filter)

      const [mealsRes, goalsRes, suggestionsRes] = await Promise.all([
        ownMealsQuery,
        (groupId
          ? supabase.from("nutrition_goals").select("*").eq("user_id", user.id).eq("group_id", groupId).maybeSingle()
          : supabase.from("nutrition_goals").select("*").eq("user_id", user.id).is("group_id", null).maybeSingle()
        ),
        ownSuggestionsQuery,
      ]);

      if (mealsRes.data) setAllMeals(mealsRes.data as MealLog[]);
      if (goalsRes.data) {
        const g = goalsRes.data as any;
        const enabledTrackers = Array.isArray(g.enabled_trackers) ? g.enabled_trackers : ["protein", "calories"];
        const trackerOrder = Array.isArray(g.tracker_order) ? g.tracker_order : ["protein", "calories", "carbs", "fat", "fiber"];
        setGoals({
          protein_goal: g.protein_goal || 150,
          calorie_goal: g.calorie_goal,
          carbs_goal: g.carbs_goal,
          fat_goal: g.fat_goal,
          fiber_goal: g.fiber_goal,
          show_calories: g.show_calories || false,
          enabled_trackers: enabledTrackers,
          tracker_order: trackerOrder,
        });
        setGoalProtein(String(g.protein_goal || 150));
        setGoalCalories(g.calorie_goal ? String(g.calorie_goal) : "");
        setGoalCarbs(g.carbs_goal ? String(g.carbs_goal) : "");
        setGoalFat(g.fat_goal ? String(g.fat_goal) : "");
        setGoalFiber(g.fiber_goal ? String(g.fiber_goal) : "");
        setGoalShowCal(g.show_calories || false);
        setGoalEnabledTrackers(enabledTrackers);
      }
      if (suggestionsRes.data) setSuggestions(suggestionsRes.data as MealSuggestion[]);

      // Load other users' meals
      if ((isGroupView || isAllView) && hasOther) {
        const otherIds: string[] = [];
        if (isGroupView && activeGroup) {
          activeGroup.members
            .filter((m: GroupMember) => m.user_id !== user.id && m.status === "active")
            .forEach(m => otherIds.push(m.user_id));
        } else if (isAllView) {
          const seen = new Set<string>();
          nutritionGroups.forEach(g => {
            g.members.filter((m: GroupMember) => m.user_id !== user.id && m.status === "active" && !seen.has(m.user_id)).forEach(m => {
              seen.add(m.user_id);
              otherIds.push(m.user_id);
            });
          });
        }

        if (otherIds.length > 0) {
          let otherMealsQuery = supabase.from("meal_logs").select("*")
            .in("user_id", otherIds)
            .gte("meal_date", startDate)
            .lte("meal_date", endDate);

          if (isGroupView && groupId) {
            otherMealsQuery = otherMealsQuery.eq("group_id", groupId);
          }
          // All view: fetch from all groups (RLS handles it — only shared group data visible)
          // Personal data of others is never accessible via RLS

          const { data: otherData } = await otherMealsQuery;
          if (otherData) setOtherUserMeals(otherData as MealLog[]);
        } else {
          setOtherUserMeals([]);
        }
      } else {
        setOtherUserMeals([]);
      }

      setLoading(false);
    };
    load();
  }, [user, rangeDates, groupId, hasOther, activeGroup, isGroupView, isAllView, isPersonalActive, nutritionGroups]);

  // Scoped own meals for the current view
  const myMealsForView = useMemo(() => {
    if (isPersonalActive) return allMeals.filter(m => !m.group_id);
    if (isGroupView && groupId) {
      // In group view: show meals with this group_id OR personal meals (with "Only you" indicator)
      return allMeals.filter(m => m.group_id === groupId || !m.group_id);
    }
    // All view: all own meals, deduplicated by title+date+meal_type
    const seen = new Set<string>();
    const deduped: MealLog[] = [];
    for (const m of allMeals) {
      const key = `${m.title.toLowerCase().trim()}|${m.meal_date}|${m.meal_type}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(m);
      }
    }
    return deduped;
  }, [allMeals, isPersonalActive, isGroupView, isAllView, groupId]);

  // Check if a meal is "Only you" (not shared with current group)
  const isOnlyYou = useCallback((meal: MealLog) => {
    if (!isGroupView || !groupId) return false;
    return !meal.group_id || meal.group_id !== groupId;
  }, [isGroupView, groupId]);

  // Get member info for display
  const getMemberInfo = useCallback((userId: string) => {
    if (userId === user?.id) return { name: "Mine", displayName: profile?.display_name || "Me", avatarUrl: profile?.avatar_url };
    for (const g of groups) {
      const member = g.members.find((m: GroupMember) => m.user_id === userId);
      if (member) return { name: member.display_name?.split(" ")[0] || "Member", displayName: member.display_name || "Member", avatarUrl: member.avatar_url };
    }
    return { name: "Member", displayName: "Member", avatarUrl: null };
  }, [user, profile, groups]);

  // Tracker data per user
  const getTrackerTotals = useCallback((mealsForUser: MealLog[]): Record<TrackerKey, number> => {
    const consumed = mealsForUser.filter(m => m.consumed && m.meal_date === dateStr);
    return {
      protein: consumed.reduce((s, m) => s + m.protein, 0),
      calories: consumed.reduce((s, m) => s + (m.calories || 0), 0),
      carbs: consumed.reduce((s, m) => s + (m.carbs || 0), 0),
      fat: consumed.reduce((s, m) => s + (m.fat || 0), 0),
      fiber: consumed.reduce((s, m) => s + (m.fiber || 0), 0),
    };
  }, [dateStr]);

  const myTotals = useMemo(() => getTrackerTotals(myMealsForView), [getTrackerTotals, myMealsForView]);
  const enabledTrackers = goals.enabled_trackers || ["protein", "calories"];
  const orderedTrackers = (goals.tracker_order || ALL_TRACKERS.map(t => t.key)).filter((k: TrackerKey) => enabledTrackers.includes(k));

  const trackerGoals: Record<TrackerKey, number | null> = {
    protein: goals.protein_goal,
    calories: goals.calorie_goal,
    carbs: goals.carbs_goal,
    fat: goals.fat_goal,
    fiber: goals.fiber_goal,
  };

  const todayMyMeals = useMemo(() => myMealsForView.filter(m => m.meal_date === dateStr && m.user_id === user?.id), [myMealsForView, dateStr, user]);

  const openAddMealModal = useCallback((mealType: string, date: string) => {
    applyDefaultSharingSelection();
    setShowAddMeal({ mealType, date });
  }, [applyDefaultSharingSelection]);

  const openAiSuggestionConfirm = useCallback((suggestion: any, index: number) => {
    applyDefaultSharingSelection();
    setAiConfirmSelection({ suggestion, index });
  }, [applyDefaultSharingSelection]);

  const changeDate = (delta: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + delta);
    setSelectedDate(d);
  };

  // Generate AI suggestions
  const generateSuggestions = async () => {
    if (!user) return;
    setAiLoading(true);
    try {
      const recentMeals = await supabase.from("meal_logs").select("title,protein,calories,meal_type,ai_tags")
        .eq("user_id", user.id).order("created_at", { ascending: false }).limit(30);

      const consumedToday = todayMyMeals.filter(m => m.consumed);
      const totalProtein = consumedToday.reduce((s, m) => s + m.protein, 0);

      const { data, error } = await supabase.functions.invoke("ai-nutrition", {
        body: {
          action: "suggest_meals",
          protein_goal: goals.protein_goal,
          protein_consumed: totalProtein,
          meals_logged: todayMyMeals.map(m => ({ type: m.meal_type, title: m.title, protein: m.protein })),
          recent_history: recentMeals.data || [],
          date: dateStr,
          days: 1,
          date_range: rangeDates,
        },
      });
      if (error) throw error;

      const parsed = typeof data === "string" ? JSON.parse(data) : data;
      if (parsed.suggestions && parsed.suggestions.length > 0) {
        setAiResults(parsed.suggestions);
        setShowAiResults(true);
      } else {
        toast("No suggestions generated. Try again!");
      }
    } catch (e: any) {
      console.error("AI nutrition error:", e);
      toast.error("Couldn't generate suggestions");
    } finally {
      setAiLoading(false);
    }
  };

  const addAiMealAsPlanned = async () => {
    if (!aiConfirmSelection) return;
    const { suggestion, index } = aiConfirmSelection;
    const insertedMeals = await createMealsForSharing({
      meal_date: dateStr,
      meal_type: suggestion.meal_type || "lunch",
      title: suggestion.title,
      ingredients: suggestion.ingredients || [],
      prep_steps: suggestion.prep_steps || [],
      protein: suggestion.protein || 0,
      calories: suggestion.calories || 0,
      carbs: suggestion.carbs || 0,
      fat: suggestion.fat || 0,
      fiber: suggestion.fiber || 0,
      is_ai_generated: true,
      ai_tags: suggestion.tags || [],
      consumed: false,
    });
    if (insertedMeals.length === 0) return;
    setAllMeals((prev) => [...prev, ...insertedMeals]);
    setAiResults((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length === 0) setShowAiResults(false);
      return next;
    });
    setAiConfirmSelection(null);
    resetSharingSelection();
    toast.success(`${suggestion.title} added to planned meals!`);
    const ingredients = Array.isArray(suggestion.ingredients) ? suggestion.ingredients : [];
    if (ingredients.length > 0) {
      enqueueShopPrompt({ ingredients, mealTitle: suggestion.title, mealDate: dateStr });
    }
  };

  const toggleConsumed = async (mealId: string, consumed: boolean) => {
    const { error } = await supabase.from("meal_logs").update({ consumed }).eq("id", mealId);
    if (!error) {
      setAllMeals(prev => prev.map(m => m.id === mealId ? { ...m, consumed } : m));
      toast.success(consumed ? "Marked as consumed ✓" : "Unmarked");
    }
  };

  const logManualMeal = async (mealType: string, targetDate?: string) => {
    if (!user || !manualTitle.trim()) return;
    const mealDate = targetDate || dateStr;
    const insertedMeals = await createMealsForSharing({
      meal_date: mealDate,
      meal_type: mealType,
      title: manualTitle.trim(),
      protein: parseInt(manualProtein) || 0,
      calories: parseInt(manualCalories) || 0,
      carbs: parseInt(manualCarbs) || 0,
      fat: parseInt(manualFat) || 0,
      fiber: parseInt(manualFiber) || 0,
      is_ai_generated: false,
      consumed: false,
    });
    if (insertedMeals.length > 0) {
      setAllMeals((prev) => [...prev, ...insertedMeals]);
      setShowAddMeal(null);
      setManualTitle(""); setManualProtein(""); setManualCalories(""); setManualCarbs(""); setManualFat(""); setManualFiber(""); setManualFoodText("");
      resetSharingSelection();
      toast.success("Meal added to plan!");
    }
  };

  // Load frequent meals
  useEffect(() => {
    if (!user) return;
    const loadFrequent = async () => {
      const { data } = await supabase.from("meal_logs").select("title, protein, calories, carbs, fat, fiber, meal_type, ingredients, prep_steps")
        .eq("user_id", user.id).order("created_at", { ascending: false }).limit(200);
      if (!data) return;
      const counts: Record<string, any> = {};
      for (const m of data) {
        const key = m.title.toLowerCase().trim();
        if (counts[key]) {
          counts[key].count++;
          const existingIngs = counts[key].ingredients || [];
          const newIngs = Array.isArray(m.ingredients) ? m.ingredients as string[] : [];
          if (newIngs.length > existingIngs.length) {
            counts[key].ingredients = newIngs;
            counts[key].prep_steps = Array.isArray(m.prep_steps) ? m.prep_steps as string[] : [];
          }
        } else {
          counts[key] = {
            title: m.title, protein: m.protein, calories: m.calories || 0,
            carbs: (m as any).carbs || 0, fat: (m as any).fat || 0, fiber: (m as any).fiber || 0,
            meal_type: m.meal_type, count: 1,
            ingredients: Array.isArray(m.ingredients) ? m.ingredients as string[] : [],
            prep_steps: Array.isArray(m.prep_steps) ? m.prep_steps as string[] : [],
          };
        }
      }
      const sorted = Object.values(counts).filter((c: any) => c.count >= 2).sort((a: any, b: any) => b.count - a.count).slice(0, 12);
      setFrequentMeals(sorted);
    };
    loadFrequent();
  }, [user, allMeals.length]);

  const addIdeaAsPlanned = async () => {
    if (!ideaPreview) return;
    const item = ideaPreview;
    const insertedMeals = await createMealsForSharing({
      meal_date: dateStr,
      meal_type: item.meal_type || "snack",
      title: item.title,
      ingredients: item.ingredients || [],
      prep_steps: item.prep_steps || [],
      protein: item.protein || 0,
      calories: item.calories || 0,
      carbs: item.carbs || 0,
      fat: item.fat || 0,
      fiber: item.fiber || 0,
      is_ai_generated: false,
      consumed: false,
    });
    if (insertedMeals.length === 0) return;
    setAllMeals((prev) => [...prev, ...insertedMeals]);
    setIdeaPreview(null);
    resetSharingSelection();
    toast.success(`${item.title} added to planned meals!`);
    const ingredients = Array.isArray(item.ingredients) ? item.ingredients : [];
    if (ingredients.length > 0) {
      enqueueShopPrompt({ ingredients, mealTitle: item.title, mealDate: dateStr });
    }
  };

  const deleteMeal = async (mealId: string) => {
    await supabase.from("meal_logs").delete().eq("id", mealId);
    setAllMeals(prev => prev.filter(m => m.id !== mealId));
    setDetailMeal(null);
    setDetailEditMode(false);
    toast.success("Meal removed");
  };

  const enterEditMode = (meal: MealLog) => {
    setEditTitle(meal.title);
    setEditProtein(String(meal.protein));
    setEditCalories(String(meal.calories || 0));
    setEditCarbs(String(meal.carbs || 0));
    setEditFat(String(meal.fat || 0));
    setEditFiber(String(meal.fiber || 0));
    setEditMealType(meal.meal_type);
    setEditIngredients(Array.isArray(meal.ingredients) ? [...(meal.ingredients as string[])] : []);
    setEditPrepSteps(Array.isArray(meal.prep_steps) ? [...(meal.prep_steps as string[])] : []);
    setDetailEditMode(true);
  };

  const cancelEditMode = () => {
    setDetailEditMode(false);
  };

  const saveEditMeal = async () => {
    if (!detailMeal || !editTitle.trim()) return;
    const mealId = (detailMeal as MealLog).id;
    const updates = {
      title: editTitle.trim(),
      protein: parseInt(editProtein) || 0,
      calories: parseInt(editCalories) || 0,
      carbs: parseInt(editCarbs) || 0,
      fat: parseInt(editFat) || 0,
      fiber: parseInt(editFiber) || 0,
      meal_type: editMealType,
      ingredients: editIngredients.filter(s => s.trim()),
      prep_steps: editPrepSteps.filter(s => s.trim()),
    };
    const { error } = await supabase.from("meal_logs").update(updates).eq("id", mealId);
    if (!error) {
      const updatedMeal = { ...(detailMeal as MealLog), ...updates };
      setAllMeals(prev => prev.map(m => m.id === mealId ? { ...m, ...updates } : m));
      setDetailMeal(updatedMeal);
      setDetailEditMode(false);
      toast.success("Meal updated");
    }
  };

  const getWeekMonday = (dateStr: string) => {
    const d = new Date(dateStr + "T00:00:00");
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const mon = new Date(d);
    mon.setDate(mon.getDate() + diff);
    return fmtDate(mon);
  };

  const getWeekSunday = (mondayStr: string) => {
    const d = new Date(mondayStr + "T00:00:00");
    d.setDate(d.getDate() + 6);
    return fmtDate(d);
  };

  const saveToShoppingList = async () => {
    if (!user || !shopPrompt) return;
    setShopSaving(true);
    const selectedItems = shopPrompt.ingredients.filter((_, i) => shopChecked[i]);
    if (selectedItems.length === 0) {
      toast.info("No items selected");
      dismissShopPrompt();
      setShopSaving(false);
      return;
    }
    const weekStart = getWeekMonday(shopPrompt.mealDate);
    const weekEnd = getWeekSunday(weekStart);
    const monDate = new Date(weekStart + "T00:00:00");
    const sunDate = new Date(weekEnd + "T00:00:00");
    const weekLabel = `Week of ${monDate.getMonth() + 1}/${monDate.getDate()} (Mon) – ${sunDate.getMonth() + 1}/${sunDate.getDate()} (Sun)`;

    let listQuery = supabase.from("shopping_lists").select("*")
      .eq("user_id", user.id).eq("is_meal_plan", true).eq("date_range_start", weekStart).eq("date_range_end", weekEnd);
    if (groupId) listQuery = listQuery.eq("group_id", groupId);

    const { data: existingLists } = await listQuery;
    let listId: string;

    if (existingLists && existingLists.length > 0) {
      listId = existingLists[0].id;
    } else {
      const insertData: any = { user_id: user.id, group_id: groupId, label: weekLabel, date_range_start: weekStart, date_range_end: weekEnd, is_meal_plan: true };
      const { data: listData, error: listErr } = await supabase.from("shopping_lists").insert(insertData).select().single();
      if (listErr || !listData) { toast.error("Failed to create shopping list"); setShopSaving(false); return; }
      listId = (listData as any).id;
    }

    const { data: existingItems } = await supabase.from("shopping_list_items").select("*").eq("list_id", listId);
    const existingNames = new Set((existingItems || []).map((it: any) => (it.name as string).toLowerCase().trim()));
    const newItems = selectedItems.filter(name => !existingNames.has(name.toLowerCase().trim()));
    if (newItems.length > 0) {
      const rows = newItems.map(name => ({ list_id: listId, user_id: user.id, name }));
      await supabase.from("shopping_list_items").insert(rows);
    }
    toast.success(existingLists && existingLists.length > 0 ? "Items added to weekly shopping list!" : "Weekly shopping list created!");
    dismissShopPrompt();
    setShopSaving(false);
  };

  const saveGoals = async () => {
    if (!user) return;
    const payload: any = {
      user_id: user.id, group_id: groupId,
      protein_goal: parseInt(goalProtein) || 150,
      calorie_goal: goalCalories ? parseInt(goalCalories) : null,
      carbs_goal: goalCarbs ? parseInt(goalCarbs) : null,
      fat_goal: goalFat ? parseInt(goalFat) : null,
      fiber_goal: goalFiber ? parseInt(goalFiber) : null,
      show_calories: goalEnabledTrackers.includes("calories"),
      enabled_trackers: goalEnabledTrackers,
      tracker_order: goals.tracker_order,
    };
    const { error } = await supabase.from("nutrition_goals").upsert(payload, { onConflict: "user_id,group_id" });
    if (!error) {
      setGoals({
        protein_goal: payload.protein_goal, calorie_goal: payload.calorie_goal,
        carbs_goal: payload.carbs_goal, fat_goal: payload.fat_goal, fiber_goal: payload.fiber_goal,
        show_calories: payload.show_calories, enabled_trackers: goalEnabledTrackers, tracker_order: goals.tracker_order,
      });
      setShowGoalSettings(false);
      toast.success("Goals updated");
    }
  };

  const aiEstimateMacros = async () => {
    if (!manualFoodText.trim()) return;
    setAiEstimating(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-nutrition", {
        body: { action: "estimate_macros", food_description: manualFoodText.trim() },
      });
      if (error) throw error;
      const parsed = typeof data === "string" ? JSON.parse(data) : data;
      if (parsed.title) setManualTitle(parsed.title);
      if (parsed.protein) setManualProtein(String(parsed.protein));
      if (parsed.calories) setManualCalories(String(parsed.calories));
      if (parsed.carbs) setManualCarbs(String(parsed.carbs));
      if (parsed.fat) setManualFat(String(parsed.fat));
      if (parsed.fiber) setManualFiber(String(parsed.fiber));
      toast.success("Macros estimated by AI");
    } catch {
      toast.error("Couldn't estimate macros");
    } finally {
      setAiEstimating(false);
    }
  };

  const handleCameraCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCameraAnalyzing(true);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const { data, error } = await supabase.functions.invoke("ai-nutrition", {
        body: { action: "analyze_image", image_base64: base64 },
      });
      if (error) throw error;
      const parsed = typeof data === "string" ? JSON.parse(data) : data;
      if (parsed.title) setManualTitle(parsed.title);
      if (parsed.protein) setManualProtein(String(parsed.protein));
      if (parsed.calories) setManualCalories(String(parsed.calories));
      if (parsed.carbs) setManualCarbs(String(parsed.carbs));
      if (parsed.fat) setManualFat(String(parsed.fat));
      if (parsed.fiber) setManualFiber(String(parsed.fiber));
      toast.success("Food analyzed from photo!");
    } catch (err) {
      console.error("Camera analysis error:", err);
      toast.error("Couldn't analyze the photo");
    } finally {
      setCameraAnalyzing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const dateLabel = selectedDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  // Set of dates that have meal data (for date strip dots)
  const mealDatesSet = useMemo(() => {
    const s = new Set<string>();
    allMeals.forEach(m => { if (m.consumed) s.add(m.meal_date); });
    otherUserMeals.forEach(m => { if (m.consumed) s.add(m.meal_date); });
    return s;
  }, [allMeals, otherUserMeals]);

  // Check if other user has logged nutrition today
  const otherUserHasLoggedToday = useCallback((userId: string) => {
    return otherUserMeals.some(m => m.user_id === userId && m.meal_date === dateStr && m.consumed);
  }, [otherUserMeals, dateStr]);

  // Nudge handler
  const sendNudge = async (toUserId: string) => {
    if (!user) return;
    const { error } = await supabase.from("nudges").insert({
      from_user_id: user.id,
      to_user_id: toUserId,
      message: `${profile?.display_name || "Your partner"} nudged you to log your nutrition! 🍎`,
    });
    if (!error) toast.success("Nudge sent!");
  };

  // Render multi-user tracker card
  const renderMultiUserTrackers = () => {
    const userColumns: { id: string; name: string; avatarUrl: string | null; totals: Record<TrackerKey, number> }[] = [];

    if (isMySelected) {
      userColumns.push({ id: user!.id, name: profile?.display_name?.split(" ")[0] || "Me", avatarUrl: profile?.avatar_url || null, totals: myTotals });
    }

    for (const otherId of selectedOtherIds) {
      const info = getMemberInfo(otherId);
      const otherMealsToday = otherUserMeals.filter(m => m.user_id === otherId && m.meal_date === dateStr && m.consumed);
      const totals: Record<TrackerKey, number> = {
        protein: otherMealsToday.reduce((s, m) => s + m.protein, 0),
        calories: otherMealsToday.reduce((s, m) => s + (m.calories || 0), 0),
        carbs: otherMealsToday.reduce((s, m) => s + (m.carbs || 0), 0),
        fat: otherMealsToday.reduce((s, m) => s + (m.fat || 0), 0),
        fiber: otherMealsToday.reduce((s, m) => s + (m.fiber || 0), 0),
      };
      userColumns.push({ id: otherId, name: info.name, avatarUrl: info.avatarUrl || null, totals });
    }

    if (userColumns.length === 0) return null;

    return (
      <div className="mb-2 mt-1">
        <div className="bg-card rounded-2xl p-4 shadow-card border border-border">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Daily Trackers</span>
            {isMySelected && (
              <button onClick={() => setShowGoalSettings(true)} className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold text-primary bg-primary/10 border border-primary/20 hover:bg-primary/20 transition-colors" title="Nutrition Goals">
                <Target size={12} /> Goals
              </button>
            )}
          </div>

          {userColumns.length > 1 ? (
            // Multi-user side-by-side table
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th className="text-left py-1 pr-2 font-semibold text-muted-foreground" />
                    {userColumns.map(col => (
                      <th key={col.id} className="text-center py-1 px-1 min-w-[70px]">
                        <div className="flex flex-col items-center gap-0.5">
                          {col.avatarUrl ? (
                            <img src={col.avatarUrl} alt="" className="w-5 h-5 rounded-full object-cover" />
                          ) : (
                            <span className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[8px] font-bold text-primary">{col.name.charAt(0)}</span>
                          )}
                          <span className="text-[10px] font-medium text-foreground truncate max-w-[60px]">{col.name}</span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {orderedTrackers.map((key: TrackerKey) => {
                    const info = ALL_TRACKERS.find(t => t.key === key)!;
                    const goal = (trackerGoals[key] as number) || info.defaultGoal;
                    return (
                      <tr key={key} className="border-t border-border/30">
                        <td className="py-1.5 pr-2 font-semibold text-foreground flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: info.color }} />
                          {info.label}
                        </td>
                        {userColumns.map(col => {
                          const val = col.totals[key] || 0;
                          return (
                            <td key={col.id} className="text-center py-1.5 px-1">
                              <span className="text-foreground font-medium">{Math.round(val)}{info.unit}</span>
                              <span className="text-muted-foreground">/{goal}{info.unit}</span>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            // Single user: progress bars
            <div className="space-y-3">
              {orderedTrackers.map((key: TrackerKey) => {
                const info = ALL_TRACKERS.find(t => t.key === key)!;
                const consumed = userColumns[0]?.totals[key] || 0;
                const goal = (trackerGoals[key] as number) || info.defaultGoal;
                const pct = goal > 0 ? Math.min((consumed / goal) * 100, 100) : 0;
                return (
                  <div key={key}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-foreground">{info.label}</span>
                      <span className="text-[11px] text-muted-foreground">{Math.round(consumed)}{info.unit} / {goal}{info.unit}</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-secondary overflow-hidden">
                      <motion.div className="h-full rounded-full" style={{ backgroundColor: info.color }} initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6, ease: "easeOut" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {orderedTrackers.length === 0 && (
            <div className="flex flex-col items-center py-4 gap-2">
              <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center"><Target size={20} className="text-muted-foreground" /></div>
              <p className="text-sm font-medium text-foreground">No trackers selected</p>
              <button onClick={() => setShowGoalSettings(true)} className="mt-1 px-4 py-2 rounded-full bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity flex items-center gap-1.5">
                <Settings size={12} /> Customize Trackers
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Render meal cards for a user
  const renderUserMeals = (userId: string, mealsForUser: MealLog[], label: string, isOwn: boolean) => {
    const todayMealsForUser = mealsForUser.filter(m => m.meal_date === dateStr);

    return (
      <div className="mb-4" key={userId}>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            {label}
          </h2>
          {isOwn && (
            <div className="flex items-center gap-1.5">
              <button onClick={() => openAddMealModal("snack", dateStr)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full bg-secondary text-foreground hover:bg-secondary/80 transition-colors">
                <Plus size={12} /> Add
              </button>
              <button onClick={generateSuggestions} disabled={aiLoading} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50">
                {aiLoading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                AI Suggest
              </button>
            </div>
          )}
        </div>

        {todayMealsForUser.length > 0 ? (
          <div className="space-y-2">
            {todayMealsForUser.map(meal => {
              const onlyYou = isOwn && isOnlyYou(meal);
              return (
                <div key={meal.id} className={`relative bg-card rounded-xl p-3 shadow-card border transition-colors ${meal.consumed ? "border-primary/30 bg-primary/5" : "border-border"}`}>
                  <div className="flex items-center gap-3">
                    {isOwn && (
                      <button onClick={() => toggleConsumed(meal.id, !meal.consumed)} className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${meal.consumed ? "bg-primary text-primary-foreground" : "border-2 border-muted-foreground/30 hover:border-primary"}`}>
                        {meal.consumed && <Check size={16} />}
                      </button>
                    )}
                    <button onClick={() => setDetailMeal(meal)} className="flex-1 text-left min-w-0">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className={`text-sm font-medium truncate ${meal.consumed ? "line-through text-muted-foreground" : ""}`}>{meal.title}</p>
                            {onlyYou && (
                              <span className="flex items-center gap-0.5 text-[9px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded-full flex-shrink-0">
                                <EyeOff size={8} /> Only you
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground capitalize flex items-center gap-1">
                            {MEAL_TYPES.find(mt => mt.key === meal.meal_type)?.icon} {meal.meal_type}
                            {meal.is_ai_generated && <><Sparkles size={8} className="text-primary" /> AI</>}
                            {meal.consumed && <><Check size={8} className="text-primary" /> Consumed</>}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0 ml-2">
                          <p className="text-xs font-bold text-primary">{meal.protein}g prot</p>
                          <p className="text-[10px] text-muted-foreground">{meal.calories} kcal{meal.carbs ? ` · ${meal.carbs}g C` : ""}{meal.fat ? ` · ${meal.fat}g F` : ""}</p>
                        </div>
                      </div>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-card rounded-xl p-4 border border-dashed border-border text-center">
            <p className="text-xs text-muted-foreground">
              {isOwn ? "No meals planned yet. Use AI Suggest or tap + to add." : "No meals planned today"}
            </p>
          </div>
        )}

        {/* Nudge for other users who haven't logged today */}
        {!isOwn && !otherUserHasLoggedToday(userId) && (
          <button onClick={() => sendNudge(userId)} className="mt-2 flex items-center gap-1.5 text-xs text-primary font-semibold hover:underline">
            <Bell size={12} /> Nudge {getMemberInfo(userId).name}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col min-h-full px-5">
      {/* Header */}
      <div className="flex items-center justify-between pt-6 pb-2">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Apple size={24} className="text-primary" /> Nutrition
        </h1>
        {onOpenSettings && (
          <button onClick={onOpenSettings} className="p-2 rounded-full hover:bg-secondary">
            <Settings size={18} className="text-muted-foreground" />
          </button>
        )}
      </div>

      <PageGroupSelector page="nutrition" />

      {/* User filter pills — not shown on Personal */}
      <NutritionUserFilter selectedUserIds={selectedUserIds} onSelectionChange={handlePillChange} />

      {/* Nav mode toggle + Today button */}
      <div className="flex items-center gap-2 pb-2">
        <div className="flex-1" />
        {!isToday && (
          <button
            onClick={() => setSelectedDate(new Date())}
            className="px-2.5 py-1.5 rounded-lg bg-primary/10 text-primary text-[10px] font-bold border border-primary/20 hover:bg-primary/20 transition-colors"
          >
            Today
          </button>
        )}
        <button
          onClick={() => setNavMode(navMode === "day" ? "week" : "day")}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-secondary border border-border text-foreground hover:bg-muted transition-colors"
        >
          {navMode === "day" ? <><LayoutList size={12} /> Day</> : <><CalendarDays size={12} /> Week</>}
        </button>
      </div>

      {/* Date navigation */}
      {navMode === "day" ? (
        <NutritionDateStrip
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          mealDates={mealDatesSet}
        />
      ) : (
        <NutritionWeekView
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          mealDates={mealDatesSet}
        />
      )}

      {/* Selected date label */}
      <div className="pb-2">
        <p className="text-xs font-semibold text-muted-foreground">
          {isToday
            ? `Today, ${selectedDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
            : fmtDate(selectedDate) > fmtDate(new Date())
              ? `Upcoming — ${selectedDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}`
              : selectedDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
        </p>
      </div>

      {/* Tracker progress - unified multi-user card */}
      {renderMultiUserTrackers()}

      {/* AI insight — only for own view */}
      {isMySelected && !multipleSelected && (
        <div className="mb-3">
          <div className="bg-primary/5 rounded-xl px-4 py-3 border border-primary/10">
            <div className="flex items-start gap-2">
              <Sparkles size={14} className="text-primary mt-0.5 flex-shrink-0" />
              <p className="text-xs text-foreground/80">
                {todayMyMeals.filter(m => m.consumed).length === 0
                  ? "Plan your meals and mark them as consumed to track nutrition."
                  : goals.protein_goal - myTotals.protein <= 0
                    ? "🎉 You've hit your protein goal! Great job today."
                    : `${goals.protein_goal - myTotals.protein}g of protein remaining. Keep it up!`}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto pb-24">
          {/* My Meals */}
          {isMySelected && renderUserMeals(user!.id, myMealsForView.filter(m => m.user_id === user?.id), multipleSelected ? "My Planned Meals" : "Planned Meals", true)}

          {/* Other users' meals — read-only */}
          {selectedOtherIds.map(otherId => {
            const otherMealsForUser = otherUserMeals.filter(m => m.user_id === otherId);
            const info = getMemberInfo(otherId);
            return renderUserMeals(otherId, otherMealsForUser, `${info.name}'s Meals`, false);
          })}

          {/* Meal Ideas — only for Mine */}
          {isMySelected && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Meal Ideas</h2>
              </div>
              <div className="flex gap-1 bg-secondary rounded-xl p-1 mb-3">
                <button onClick={() => setMealIdeasTab("suggestions")} className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg transition-all ${mealIdeasTab === "suggestions" ? "bg-card text-foreground shadow-card" : "text-muted-foreground"}`}>
                  <Zap size={12} /> Quick Suggestions
                </button>
                <button onClick={() => setMealIdeasTab("frequent")} className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg transition-all ${mealIdeasTab === "frequent" ? "bg-card text-foreground shadow-card" : "text-muted-foreground"}`}>
                  <Clock size={12} /> Frequent Items
                </button>
              </div>

              {mealIdeasTab === "suggestions" ? (
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { title: "Greek Yogurt Bowl", protein: 20, calories: 250, carbs: 30, fat: 8, fiber: 3, meal_type: "breakfast", ingredients: ["200g Greek yogurt", "1/4 cup granola", "1 tbsp honey", "Mixed berries", "1 tbsp chia seeds"], prep_steps: ["Add Greek yogurt to a bowl", "Top with granola and mixed berries", "Drizzle honey and sprinkle chia seeds"] },
                    { title: "Chicken Rice Bowl", protein: 35, calories: 450, carbs: 45, fat: 12, fiber: 4, meal_type: "lunch", ingredients: ["200g chicken breast", "1 cup cooked rice", "1/2 avocado", "Mixed greens", "Soy sauce", "Sesame seeds"], prep_steps: ["Season and grill chicken breast until cooked through", "Cook rice according to package directions", "Slice avocado", "Assemble bowl with rice, sliced chicken, greens, and avocado", "Drizzle with soy sauce and top with sesame seeds"] },
                    { title: "Turkey Lettuce Wraps", protein: 28, calories: 280, carbs: 12, fat: 14, fiber: 3, meal_type: "lunch", ingredients: ["200g ground turkey", "Large lettuce leaves", "1/2 diced onion", "2 cloves garlic", "Soy sauce", "Sriracha"], prep_steps: ["Cook ground turkey with diced onion and garlic", "Season with soy sauce and sriracha", "Spoon mixture into lettuce leaves", "Serve immediately"] },
                    { title: "Protein Smoothie", protein: 30, calories: 320, carbs: 35, fat: 6, fiber: 5, meal_type: "snack", ingredients: ["1 scoop protein powder", "1 banana", "1 cup spinach", "1 cup almond milk", "1 tbsp peanut butter", "Ice cubes"], prep_steps: ["Add all ingredients to a blender", "Blend until smooth", "Pour into a glass and serve"] },
                    { title: "Salmon & Veggies", protein: 32, calories: 380, carbs: 15, fat: 18, fiber: 6, meal_type: "dinner", ingredients: ["170g salmon fillet", "1 cup broccoli florets", "1/2 cup bell peppers", "Olive oil", "Lemon juice", "Garlic powder"], prep_steps: ["Preheat oven to 200°C / 400°F", "Season salmon with garlic powder, olive oil, and lemon juice", "Arrange salmon and veggies on a baking sheet", "Bake for 15-18 minutes until salmon flakes easily"] },
                    { title: "Egg White Omelette", protein: 24, calories: 200, carbs: 4, fat: 8, fiber: 1, meal_type: "breakfast", ingredients: ["6 egg whites", "1/4 cup diced bell pepper", "1/4 cup spinach", "2 tbsp feta cheese", "Salt and pepper"], prep_steps: ["Whisk egg whites with salt and pepper", "Heat a non-stick pan over medium heat", "Pour in egg whites and cook until edges set", "Add bell pepper, spinach, and feta to one half", "Fold and cook for 1 more minute"] },
                  ].map((item, i) => (
                    <button key={i} onClick={() => { applyDefaultSharingSelection(); setIdeaPreview(item); }} className="bg-card rounded-xl p-3 border border-border hover:border-primary/30 transition-colors text-left">
                      <p className="text-xs font-semibold text-foreground truncate">{item.title}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-[10px] font-bold text-primary">{item.protein}g P</span>
                        <span className="text-[10px] text-muted-foreground">{item.calories} kcal</span>
                        {item.carbs > 0 && <span className="text-[10px] text-muted-foreground">{item.carbs}g C</span>}
                      </div>
                      <p className="text-[9px] text-muted-foreground mt-1 line-clamp-1">{item.ingredients.slice(0, 3).join(", ")}…</p>
                    </button>
                  ))}
                </div>
              ) : (
                <div>
                  {frequentMeals.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2">
                      {frequentMeals.map((item, i) => (
                        <button key={i} onClick={() => { applyDefaultSharingSelection(); setIdeaPreview(item); }} className="bg-card rounded-xl p-3 border border-border hover:border-primary/30 transition-colors text-left">
                          <p className="text-xs font-semibold text-foreground truncate">{item.title}</p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className="text-[10px] font-bold text-primary">{item.protein}g P</span>
                            <span className="text-[10px] text-muted-foreground">{item.calories} kcal</span>
                          </div>
                          {item.ingredients.length > 0 ? (
                            <p className="text-[9px] text-muted-foreground mt-1 line-clamp-1">{item.ingredients.slice(0, 3).join(", ")}…</p>
                          ) : (
                            <span className="text-[9px] text-muted-foreground mt-1">Added {item.count}×</span>
                          )}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-card rounded-xl p-4 border border-dashed border-border text-center">
                      <p className="text-xs text-muted-foreground">Add meals a few times and they'll appear here for quick re-adding.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
      </div>

      {/* Hidden file input for camera */}
      <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleCameraCapture} />

      {/* ───── AI Results Selection Modal ───── */}
      <AnimatePresence>
        {showAiResults && aiResults.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[80] bg-black/60 flex items-end justify-center" style={{ touchAction: "none" }} onClick={() => setShowAiResults(false)}>
            <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 300 }} onClick={e => e.stopPropagation()} className="w-full max-w-md bg-card rounded-t-2xl border-t border-x border-border shadow-lg h-[92dvh] max-h-[92dvh] flex flex-col min-h-0">
              <div className="flex justify-center pt-3 pb-1 flex-shrink-0"><div className="w-10 h-1 rounded-full bg-border" /></div>
              <div className="flex items-center justify-between px-5 pt-1 pb-3 flex-shrink-0">
                <h3 className="text-lg font-bold flex items-center gap-2"><Sparkles size={18} className="text-primary" /> AI Meal Suggestions</h3>
                <button onClick={() => setShowAiResults(false)} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center"><X size={16} /></button>
              </div>
              <p className="px-5 text-xs text-muted-foreground mb-3">Select the meals you want to add to your plan:</p>
              <div className="px-5 flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-3" style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y", overscrollBehaviorY: "contain", paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}>
                {aiResults.map((s, idx) => (
                  <div key={idx} className="bg-background rounded-xl p-4 border border-border">
                    <div className="flex items-start justify-between mb-2">
                      <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{s.title}</p><p className="text-[10px] text-muted-foreground capitalize">{s.meal_type}</p></div>
                    </div>
                    <div className="grid grid-cols-5 gap-1.5 mb-3">
                      <div className="bg-primary/10 rounded-lg px-2 py-1.5 text-center"><p className="text-xs font-bold text-primary">{s.protein || 0}g</p><p className="text-[8px] text-muted-foreground">Protein</p></div>
                      <div className="bg-secondary rounded-lg px-2 py-1.5 text-center"><p className="text-xs font-bold">{s.calories || 0}</p><p className="text-[8px] text-muted-foreground">Cal</p></div>
                      <div className="bg-secondary rounded-lg px-2 py-1.5 text-center"><p className="text-xs font-bold">{s.carbs || 0}g</p><p className="text-[8px] text-muted-foreground">Carbs</p></div>
                      <div className="bg-secondary rounded-lg px-2 py-1.5 text-center"><p className="text-xs font-bold">{s.fat || 0}g</p><p className="text-[8px] text-muted-foreground">Fat</p></div>
                      <div className="bg-secondary rounded-lg px-2 py-1.5 text-center"><p className="text-xs font-bold">{s.fiber || 0}g</p><p className="text-[8px] text-muted-foreground">Fiber</p></div>
                    </div>
                    {s.ingredients && s.ingredients.length > 0 && <p className="text-[10px] text-muted-foreground mb-2 line-clamp-2">{(s.ingredients as string[]).join(", ")}</p>}
                    <button onClick={() => openAiSuggestionConfirm(s, idx)} className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5">
                      <Plus size={14} /> Add to Plan
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ───── AI Sharing Confirmation Modal ───── */}
      <AnimatePresence>
        {aiConfirmSelection && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[90] bg-black/60 flex items-end justify-center" style={{ touchAction: "none" }} onClick={() => setAiConfirmSelection(null)}>
            <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 300 }} onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-card rounded-t-2xl border-t border-x border-border shadow-lg">
              <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full bg-border" /></div>
              <div className="flex items-center justify-between px-5 pt-1 pb-3">
                <h3 className="text-lg font-bold flex items-center gap-2"><Sparkles size={18} className="text-primary" /> Confirm AI Meal</h3>
                <button onClick={() => setAiConfirmSelection(null)} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center"><X size={16} /></button>
              </div>
              <div className="px-5 pb-6 space-y-3" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.5rem)" }}>
                <div className="bg-background rounded-xl border border-border p-3">
                  <p className="text-sm font-semibold mb-2">{aiConfirmSelection.suggestion.title}</p>
                  <div className="grid grid-cols-5 gap-1.5">
                    <div className="bg-primary/10 rounded-lg px-2 py-1.5 text-center"><p className="text-xs font-bold text-primary">{aiConfirmSelection.suggestion.protein || 0}g</p><p className="text-[8px] text-muted-foreground">Protein</p></div>
                    <div className="bg-secondary rounded-lg px-2 py-1.5 text-center"><p className="text-xs font-bold">{aiConfirmSelection.suggestion.calories || 0}</p><p className="text-[8px] text-muted-foreground">Cal</p></div>
                    <div className="bg-secondary rounded-lg px-2 py-1.5 text-center"><p className="text-xs font-bold">{aiConfirmSelection.suggestion.carbs || 0}g</p><p className="text-[8px] text-muted-foreground">Carbs</p></div>
                    <div className="bg-secondary rounded-lg px-2 py-1.5 text-center"><p className="text-xs font-bold">{aiConfirmSelection.suggestion.fat || 0}g</p><p className="text-[8px] text-muted-foreground">Fat</p></div>
                    <div className="bg-secondary rounded-lg px-2 py-1.5 text-center"><p className="text-xs font-bold">{aiConfirmSelection.suggestion.fiber || 0}g</p><p className="text-[8px] text-muted-foreground">Fiber</p></div>
                  </div>
                </div>
                <SharingSelector groups={nutritionGroups} selectedGroupIds={addMealGroupIds} onGroupIdsChange={setAddMealGroupIds} />
                <button onClick={addAiMealAsPlanned} className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity">Add to Plan</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ───── Meal Detail Modal (with inline editing) ───── */}
      <AnimatePresence>
        {detailMeal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[80] bg-black/60 flex items-end justify-center" style={{ touchAction: "none" }} onClick={() => { setDetailMeal(null); setDetailEditMode(false); }}>
            <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 300 }} onClick={e => e.stopPropagation()} onTouchMove={e => e.stopPropagation()} className="relative z-[81] w-full max-w-md bg-card rounded-t-2xl border-t border-x border-border shadow-lg h-[92dvh] max-h-[92dvh] flex flex-col min-h-0">
              <div className="flex justify-center pt-3 pb-1 flex-shrink-0"><div className="w-10 h-1 rounded-full bg-border" /></div>
              <div className="flex items-center justify-between px-5 pt-1 pb-2 flex-shrink-0">
                {detailEditMode ? (
                  <h3 className="text-lg font-bold pr-2 truncate flex items-center gap-2"><Pencil size={18} className="text-primary" /> Edit Meal</h3>
                ) : (
                  <h3 className="text-lg font-bold pr-2 truncate">{detailMeal.title}</h3>
                )}
                <button onClick={() => { setDetailMeal(null); setDetailEditMode(false); }} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0"><X size={16} /></button>
              </div>
              <div className="px-5 flex-1 min-h-0 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y", overscrollBehaviorY: "contain", paddingBottom: detailEditMode ? "calc(env(safe-area-inset-bottom, 0px) + 6rem)" : "calc(env(safe-area-inset-bottom, 0px) + 1rem)" }}>
                {detailEditMode ? (
                  /* ── EDIT MODE ── */
                  <div className="space-y-4 pb-4">
                    {/* Meal type selector */}
                    <div className="flex gap-1.5">
                      {MEAL_TYPES.map(mt => (
                        <button key={mt.key} onClick={() => setEditMealType(mt.key)} className={`flex-1 py-2 rounded-lg text-[10px] font-semibold transition-colors ${editMealType === mt.key ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>{mt.icon} {mt.label}</button>
                      ))}
                    </div>

                    {/* Meal name */}
                    <div>
                      <label className="text-[10px] font-semibold text-muted-foreground mb-1 block">Meal Name</label>
                      <input value={editTitle} onChange={e => setEditTitle(e.target.value)} className="w-full text-sm px-3 py-2.5 rounded-xl border border-border bg-background placeholder:text-muted-foreground" />
                    </div>

                    {/* Nutrition stats */}
                    <div className="grid grid-cols-2 gap-2">
                      <div><label className="text-[10px] font-semibold text-muted-foreground mb-1 block">Protein (g)</label><input type="number" value={editProtein} onChange={e => setEditProtein(e.target.value)} className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background" /></div>
                      <div><label className="text-[10px] font-semibold text-muted-foreground mb-1 block">Calories</label><input type="number" value={editCalories} onChange={e => setEditCalories(e.target.value)} className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background" /></div>
                      <div><label className="text-[10px] font-semibold text-muted-foreground mb-1 block">Carbs (g)</label><input type="number" value={editCarbs} onChange={e => setEditCarbs(e.target.value)} className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background" /></div>
                      <div><label className="text-[10px] font-semibold text-muted-foreground mb-1 block">Fat (g)</label><input type="number" value={editFat} onChange={e => setEditFat(e.target.value)} className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background" /></div>
                      <div className="col-span-2"><label className="text-[10px] font-semibold text-muted-foreground mb-1 block">Fiber (g)</label><input type="number" value={editFiber} onChange={e => setEditFiber(e.target.value)} className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background" /></div>
                    </div>

                    {/* Ingredients */}
                    <div>
                      <h4 className="text-sm font-semibold mb-2">Ingredients</h4>
                      <div className="space-y-1.5">
                        {editIngredients.map((ing, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                            <input value={ing} onChange={e => { const next = [...editIngredients]; next[i] = e.target.value; setEditIngredients(next); }} className="flex-1 text-xs px-2.5 py-1.5 rounded-lg border border-border bg-background" />
                            <button onClick={() => setEditIngredients(prev => prev.filter((_, idx) => idx !== i))} className="p-1 text-destructive hover:bg-destructive/10 rounded transition-colors"><X size={12} /></button>
                          </div>
                        ))}
                      </div>
                      <button onClick={() => setEditIngredients(prev => [...prev, ""])} className="mt-2 flex items-center gap-1 text-xs text-primary font-semibold hover:underline">
                        <Plus size={12} /> Add Ingredient
                      </button>
                    </div>

                    {/* Preparation steps */}
                    <div>
                      <h4 className="text-sm font-semibold mb-2">Preparation</h4>
                      <div className="space-y-1.5">
                        {editPrepSteps.map((step, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-primary flex-shrink-0 w-4">{i + 1}.</span>
                            <input value={step} onChange={e => { const next = [...editPrepSteps]; next[i] = e.target.value; setEditPrepSteps(next); }} className="flex-1 text-xs px-2.5 py-1.5 rounded-lg border border-border bg-background" />
                            <button onClick={() => setEditPrepSteps(prev => prev.filter((_, idx) => idx !== i))} className="p-1 text-destructive hover:bg-destructive/10 rounded transition-colors"><X size={12} /></button>
                          </div>
                        ))}
                      </div>
                      <button onClick={() => setEditPrepSteps(prev => [...prev, ""])} className="mt-2 flex items-center gap-1 text-xs text-primary font-semibold hover:underline">
                        <Plus size={12} /> Add Step
                      </button>
                    </div>

                    {/* spacer for sticky bottom actions */}
                    <div className="h-6" />
                  </div>
                ) : (
                  /* ── READ MODE ── */
                  <>
                    <div className="grid grid-cols-2 gap-2 mb-4">
                      <div className="bg-primary/10 rounded-xl px-3 py-2 text-center"><p className="text-lg font-bold text-primary">{detailMeal.protein}g</p><p className="text-[10px] text-muted-foreground">Protein</p></div>
                      <div className="bg-secondary rounded-xl px-3 py-2 text-center"><p className="text-lg font-bold">{detailMeal.calories}</p><p className="text-[10px] text-muted-foreground">Calories</p></div>
                      {(detailMeal.carbs > 0 || detailMeal.fat > 0 || detailMeal.fiber > 0) && (
                        <>
                          <div className="bg-secondary rounded-xl px-3 py-2 text-center"><p className="text-base font-bold">{detailMeal.carbs || 0}g</p><p className="text-[10px] text-muted-foreground">Carbs</p></div>
                          <div className="bg-secondary rounded-xl px-3 py-2 text-center"><p className="text-base font-bold">{detailMeal.fat || 0}g</p><p className="text-[10px] text-muted-foreground">Fat</p></div>
                          {detailMeal.fiber > 0 && <div className="bg-secondary rounded-xl px-3 py-2 text-center col-span-2"><p className="text-base font-bold">{detailMeal.fiber}g</p><p className="text-[10px] text-muted-foreground">Fiber</p></div>}
                        </>
                      )}
                    </div>
                    {detailMeal.ingredients && (detailMeal.ingredients as string[]).length > 0 && (
                      <div className="mb-4"><h4 className="text-sm font-semibold mb-2">Ingredients</h4><ul className="space-y-1">{(detailMeal.ingredients as string[]).map((ing, i) => (<li key={i} className="text-xs text-muted-foreground flex items-start gap-2"><span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />{ing}</li>))}</ul></div>
                    )}
                    {detailMeal.prep_steps && (detailMeal.prep_steps as string[]).length > 0 && (
                      <div className="mb-4"><h4 className="text-sm font-semibold mb-2">Preparation</h4><ol className="space-y-1.5">{(detailMeal.prep_steps as string[]).map((step, i) => (<li key={i} className="text-xs text-muted-foreground flex items-start gap-2"><span className="text-[10px] font-bold text-primary mt-0.5 flex-shrink-0 w-4">{i + 1}.</span>{step}</li>))}</ol></div>
                    )}
                    <div className="flex flex-col gap-2 mt-4 pb-4">
                      {"meal_date" in detailMeal && (detailMeal as MealLog).user_id === user?.id && (
                        <>
                          <button onClick={() => enterEditMode(detailMeal as MealLog)} className="w-full py-2.5 rounded-xl bg-secondary text-foreground text-sm font-semibold hover:bg-secondary/80 transition-colors flex items-center justify-center gap-2"><Pencil size={16} /> Edit Meal</button>
                          <button onClick={() => { toggleConsumed((detailMeal as MealLog).id, !(detailMeal as MealLog).consumed); setDetailMeal(null); }}
                            className={`w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${(detailMeal as MealLog).consumed ? "bg-secondary text-foreground hover:bg-secondary/80" : "bg-primary text-primary-foreground hover:opacity-90"}`}>
                            <Check size={16} /> {(detailMeal as MealLog).consumed ? "Unmark Consumed" : "Mark as Consumed"}
                          </button>
                          <button onClick={() => deleteMeal((detailMeal as MealLog).id)} className="w-full py-2.5 rounded-xl bg-destructive/10 text-destructive text-sm font-semibold hover:bg-destructive/20 transition-colors">Remove</button>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
              {detailEditMode && (
                <div className="sticky bottom-0 z-[82] flex-shrink-0 border-t border-border bg-card/95 px-5 py-3 backdrop-blur supports-[backdrop-filter]:bg-card/80" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 0.75rem)" }}>
                  <div className="flex gap-2">
                    <button onClick={cancelEditMode} className="flex-1 py-3 rounded-xl bg-secondary text-foreground text-sm font-semibold hover:bg-secondary/80 transition-colors">Cancel</button>
                    <button onClick={() => setShowSaveConfirm(true)} disabled={!editTitle.trim()} className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 hover:opacity-90 transition-opacity">Done</button>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ───── Save Confirmation Dialog ───── */}
      <AlertDialog open={showSaveConfirm} onOpenChange={setShowSaveConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save changes?</AlertDialogTitle>
            <AlertDialogDescription>Do you want to save your changes to this meal?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={saveEditMeal}>Save</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ───── Add Meal Modal ───── */}
      <AnimatePresence>
        {showAddMeal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[80] bg-black/60 flex items-end justify-center" style={{ touchAction: "none" }} onClick={() => { setShowAddMeal(null); setManualTitle(""); setManualProtein(""); setManualCalories(""); setManualFoodText(""); }}>
            <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 300 }} onClick={e => e.stopPropagation()} className="w-full max-w-md bg-card rounded-t-2xl border-t border-x border-border shadow-lg h-[92dvh] max-h-[92dvh] flex flex-col min-h-0">
              <div className="flex justify-center pt-3 pb-1 flex-shrink-0"><div className="w-10 h-1 rounded-full bg-border" /></div>
              <div className="flex items-center justify-between px-5 pt-1 pb-2 flex-shrink-0">
                <h3 className="text-lg font-bold">Add Meal</h3>
                <button onClick={() => { setShowAddMeal(null); setManualFoodText(""); }} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center"><X size={16} /></button>
              </div>
              <div className="px-5 flex-1 min-h-0 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y", overscrollBehaviorY: "contain", paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}>
                {showAddMeal.date !== dateStr && (
                  <p className="text-xs text-muted-foreground mb-3">For: {new Date(showAddMeal.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</p>
                )}
                <div className="flex gap-1.5 mb-4">
                  {MEAL_TYPES.map(mt => (
                    <button key={mt.key} onClick={() => setShowAddMeal(prev => prev ? { ...prev, mealType: mt.key } : null)}
                      className={`flex-1 py-2 rounded-lg text-[10px] font-semibold transition-colors ${showAddMeal.mealType === mt.key ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
                      {mt.icon} {mt.label}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2 mb-4">
                  <button onClick={() => fileInputRef.current?.click()} disabled={cameraAnalyzing} className="flex items-center gap-2 px-4 py-3 rounded-xl bg-secondary border border-border hover:border-primary/30 transition-colors disabled:opacity-50">
                    {cameraAnalyzing ? <Loader2 size={18} className="animate-spin text-primary" /> : <Camera size={18} className="text-primary" />}
                    <div className="text-left"><p className="text-xs font-semibold">{cameraAnalyzing ? "Analyzing..." : "Photo"}</p><p className="text-[9px] text-muted-foreground">Snap food or label</p></div>
                  </button>
                  <div className="flex-1 bg-primary/5 rounded-xl p-3 border border-primary/10">
                    <p className="text-[10px] font-semibold text-primary mb-1.5 flex items-center gap-1"><Sparkles size={10} /> AI Estimate</p>
                    <div className="flex gap-1.5">
                      <input value={manualFoodText} onChange={e => setManualFoodText(e.target.value)} placeholder="e.g. chicken salad" className="flex-1 text-xs px-2.5 py-1.5 rounded-lg border border-border bg-background placeholder:text-muted-foreground" />
                      <button onClick={aiEstimateMacros} disabled={aiEstimating || !manualFoodText.trim()} className="px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-[10px] font-semibold disabled:opacity-50">
                        {aiEstimating ? <Loader2 size={12} className="animate-spin" /> : "Go"}
                      </button>
                    </div>
                  </div>
                </div>

                <SharingSelector groups={nutritionGroups} selectedGroupIds={addMealGroupIds} onGroupIdsChange={setAddMealGroupIds} />

                <div className="space-y-3 pb-4">
                  <input value={manualTitle} onChange={e => setManualTitle(e.target.value)} placeholder="Meal name" className="w-full text-sm px-3 py-2.5 rounded-xl border border-border bg-background placeholder:text-muted-foreground" />
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className="text-[10px] font-semibold text-muted-foreground mb-1 block">Protein (g)</label><input type="number" value={manualProtein} onChange={e => setManualProtein(e.target.value)} placeholder="0" className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background" /></div>
                    <div><label className="text-[10px] font-semibold text-muted-foreground mb-1 block">Calories</label><input type="number" value={manualCalories} onChange={e => setManualCalories(e.target.value)} placeholder="0" className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background" /></div>
                    <div><label className="text-[10px] font-semibold text-muted-foreground mb-1 block">Carbs (g)</label><input type="number" value={manualCarbs} onChange={e => setManualCarbs(e.target.value)} placeholder="0" className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background" /></div>
                    <div><label className="text-[10px] font-semibold text-muted-foreground mb-1 block">Fat (g)</label><input type="number" value={manualFat} onChange={e => setManualFat(e.target.value)} placeholder="0" className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background" /></div>
                    <div className="col-span-2"><label className="text-[10px] font-semibold text-muted-foreground mb-1 block">Fiber (g)</label><input type="number" value={manualFiber} onChange={e => setManualFiber(e.target.value)} placeholder="0" className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background" /></div>
                  </div>
                  <button onClick={() => logManualMeal(showAddMeal.mealType, showAddMeal.date)} disabled={!manualTitle.trim()} className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 hover:opacity-90 transition-opacity">Add to Plan</button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ───── Goal Settings Modal ───── */}
      <AnimatePresence>
        {showGoalSettings && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[80] bg-black/60 flex items-end justify-center" style={{ touchAction: "none" }} onClick={() => setShowGoalSettings(false)}>
            <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 300 }} onClick={e => e.stopPropagation()} className="w-full max-w-md bg-card rounded-t-2xl border-t border-x border-border shadow-lg h-[92dvh] max-h-[92dvh] flex flex-col min-h-0">
              <div className="flex justify-center pt-3 pb-1 flex-shrink-0"><div className="w-10 h-1 rounded-full bg-border" /></div>
              <div className="flex items-center justify-between px-5 pt-1 pb-2 flex-shrink-0">
                <h3 className="text-lg font-bold">Nutrition Goals</h3>
                <button onClick={() => setShowGoalSettings(false)} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center"><X size={16} /></button>
              </div>
              <div className="px-5 flex-1 min-h-0 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y", overscrollBehaviorY: "contain", paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}>
                <div className="space-y-4 pb-4">
                  <p className="text-xs text-muted-foreground">Toggle trackers on/off and set daily goals.</p>
                  {ALL_TRACKERS.map(tracker => {
                    const isEnabled = goalEnabledTrackers.includes(tracker.key);
                    const goalValue = tracker.key === "protein" ? goalProtein : tracker.key === "calories" ? goalCalories : tracker.key === "carbs" ? goalCarbs : tracker.key === "fat" ? goalFat : goalFiber;
                    const setGoalValue = tracker.key === "protein" ? setGoalProtein : tracker.key === "calories" ? setGoalCalories : tracker.key === "carbs" ? setGoalCarbs : tracker.key === "fat" ? setGoalFat : setGoalFiber;
                    return (
                      <div key={tracker.key} className="bg-background rounded-xl border border-border p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: tracker.color }} />
                            <span className="text-sm font-semibold">{tracker.label}</span>
                          </div>
                          <button onClick={() => setGoalEnabledTrackers(prev => prev.includes(tracker.key) ? prev.filter(k => k !== tracker.key) : [...prev, tracker.key])}
                            className={`w-12 h-7 rounded-full transition-colors relative ${isEnabled ? "bg-primary" : "bg-secondary"}`}>
                            <div className={`w-5 h-5 rounded-full bg-card shadow absolute top-1 transition-transform ${isEnabled ? "translate-x-6" : "translate-x-1"}`} />
                          </button>
                        </div>
                        {isEnabled && (
                          <div><label className="text-[10px] font-semibold text-muted-foreground mb-1 block">Daily Goal ({tracker.unit})</label><input type="number" value={goalValue} onChange={e => setGoalValue(e.target.value)} placeholder={String(tracker.defaultGoal)} className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-card" /></div>
                        )}
                      </div>
                    );
                  })}
                  <button onClick={saveGoals} className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity">Save Goals</button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ───── Meal Idea Preview Modal ───── */}
      <AnimatePresence>
        {ideaPreview && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[80] bg-black/60 flex items-end justify-center" style={{ touchAction: "none" }} onClick={() => setIdeaPreview(null)}>
            <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 300 }} onClick={e => e.stopPropagation()} className="w-full max-w-md bg-card rounded-t-2xl border-t border-x border-border shadow-lg max-h-[85dvh] flex flex-col min-h-0">
              <div className="flex justify-center pt-3 pb-1 flex-shrink-0"><div className="w-10 h-1 rounded-full bg-border" /></div>
              <div className="flex items-center justify-between px-5 pt-1 pb-2 flex-shrink-0">
                <h3 className="text-lg font-bold pr-2 truncate">{ideaPreview.title}</h3>
                <button onClick={() => setIdeaPreview(null)} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0"><X size={16} /></button>
              </div>
              <div className="px-5 flex-1 min-h-0 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y", overscrollBehaviorY: "contain", paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}>
                <div className="grid grid-cols-5 gap-1.5 mb-4">
                  <div className="bg-primary/10 rounded-lg px-2 py-1.5 text-center"><p className="text-xs font-bold text-primary">{ideaPreview.protein}g</p><p className="text-[8px] text-muted-foreground">Protein</p></div>
                  <div className="bg-secondary rounded-lg px-2 py-1.5 text-center"><p className="text-xs font-bold">{ideaPreview.calories}</p><p className="text-[8px] text-muted-foreground">Cal</p></div>
                  <div className="bg-secondary rounded-lg px-2 py-1.5 text-center"><p className="text-xs font-bold">{ideaPreview.carbs || 0}g</p><p className="text-[8px] text-muted-foreground">Carbs</p></div>
                  <div className="bg-secondary rounded-lg px-2 py-1.5 text-center"><p className="text-xs font-bold">{ideaPreview.fat || 0}g</p><p className="text-[8px] text-muted-foreground">Fat</p></div>
                  <div className="bg-secondary rounded-lg px-2 py-1.5 text-center"><p className="text-xs font-bold">{ideaPreview.fiber || 0}g</p><p className="text-[8px] text-muted-foreground">Fiber</p></div>
                </div>
                {ideaPreview.ingredients.length > 0 && (
                  <div className="mb-4"><h4 className="text-sm font-semibold mb-2">Ingredients</h4><ul className="space-y-1">{ideaPreview.ingredients.map((ing, i) => (<li key={i} className="text-xs text-muted-foreground flex items-start gap-2"><span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />{ing}</li>))}</ul></div>
                )}
                {ideaPreview.prep_steps.length > 0 && (
                  <div className="mb-4"><h4 className="text-sm font-semibold mb-2">Preparation</h4><ol className="space-y-1.5">{ideaPreview.prep_steps.map((step, i) => (<li key={i} className="text-xs text-muted-foreground flex items-start gap-2"><span className="text-[10px] font-bold text-primary mt-0.5 flex-shrink-0 w-4">{i + 1}.</span>{step}</li>))}</ol></div>
                )}
                <SharingSelector groups={nutritionGroups} selectedGroupIds={addMealGroupIds} onGroupIdsChange={setAddMealGroupIds} />
                <button onClick={addIdeaAsPlanned} className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity flex items-center justify-center gap-2 mb-4">
                  <Plus size={16} /> Add to My Planned Meals
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Shopping list prompt */}
      <AnimatePresence>
        {shopPrompt && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[90] bg-black/40 flex items-end justify-center" onClick={() => dismissShopPrompt()}>
            <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 300 }} className="w-full max-w-md bg-card rounded-t-2xl max-h-[75dvh] flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="flex-shrink-0 px-5 pt-5 pb-3">
                <div className="w-10 h-1 bg-muted rounded-full mx-auto mb-4" />
                <h3 className="text-base font-bold text-foreground">🛒 Add to Shopping List?</h3>
                <p className="text-xs text-muted-foreground mt-1">Uncheck items you already have at home.</p>
              </div>
              <div className="flex-1 overflow-y-auto px-5 pb-3" style={{ WebkitOverflowScrolling: "touch" }}>
                {shopPrompt.ingredients.map((ing, i) => (
                  <label key={i} className="flex items-center gap-3 py-2 border-b border-border/30 last:border-0 cursor-pointer">
                    <button onClick={() => setShopChecked(prev => ({ ...prev, [i]: !prev[i] }))} className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all ${shopChecked[i] ? "bg-primary border-primary" : "border-muted-foreground/30"}`}>
                      {shopChecked[i] && <Check size={12} className="text-primary-foreground" />}
                    </button>
                    <span className={`text-sm ${shopChecked[i] ? "text-foreground" : "text-muted-foreground line-through"}`}>{ing}</span>
                  </label>
                ))}
              </div>
              <div className="flex-shrink-0 px-5 pb-6 pt-3 flex gap-2">
                <button onClick={() => dismissShopPrompt()} className="flex-1 py-2.5 rounded-xl bg-secondary text-foreground text-sm font-semibold">Skip</button>
                <button onClick={saveToShoppingList} disabled={shopSaving} className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
                  {shopSaving ? <Loader2 size={14} className="animate-spin" /> : null} Add to Shopping List
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

/* ────────── Sharing Selector — Personal always locked ────────── */
function SharingSelector({ groups, selectedGroupIds, onGroupIdsChange }: {
  groups: Group[];
  selectedGroupIds: string[];
  onGroupIdsChange: (ids: string[]) => void;
}) {
  const toggleGroup = (groupId: string) => {
    onGroupIdsChange(
      selectedGroupIds.includes(groupId)
        ? selectedGroupIds.filter((id) => id !== groupId)
        : [...selectedGroupIds, groupId]
    );
  };

  return (
    <div className="mb-4">
      <label className="text-[10px] font-semibold text-muted-foreground mb-2 block flex items-center gap-1">
        <Users size={10} /> Shared With
      </label>
      <div className="flex flex-wrap gap-1.5">
        <span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-primary text-primary-foreground border border-primary cursor-default opacity-80">
          🔒 Personal
        </span>
        {groups.map((g) => {
          const isSelected = selectedGroupIds.includes(g.id);
          return (
            <button key={g.id} onClick={() => toggleGroup(g.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border ${isSelected ? "bg-primary text-primary-foreground border-primary" : "bg-secondary text-muted-foreground border-border hover:border-primary/30"}`}>
              {g.emoji} {g.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default NutritionPage;
