import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const WEEKDAY_TO_INDEX: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thur: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

const MONTH_TO_INDEX: Record<string, number> = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sep: 8,
  sept: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11,
};

type WorkoutAnchor = {
  date: string;
  weekdayIndex: number;
  sourceText: string;
  explicitWeekdayIndex?: number | null;
};

type WorkoutPlanProposal = {
  operationType: "create" | "replace";
  createActions: any[];
  deleteWorkoutIds: string[];
  previewText: string;
  createdAt: string;
};

type WorkoutSummary = {
  id: string;
  title: string;
  scheduled_date: string | null;
};

function getTodayInTimeZone(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

function parseIsoDateString(iso: string) {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) return null;

  return new Date(Date.UTC(year, month, day));
}

function formatUtcDate(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function addDaysToIso(iso: string, days: number) {
  const date = parseIsoDateString(iso);
  if (!date) return iso;
  date.setUTCDate(date.getUTCDate() + days);
  return formatUtcDate(date);
}

function getIsoWeekday(iso: string) {
  const date = parseIsoDateString(iso);
  return date ? date.getUTCDay() : 0;
}

function parseNaturalDateToIso(raw: string, fallbackYear: number) {
  const match = raw.match(/\b([A-Za-z]+)\s+(\d{1,2})(?:,\s*(\d{4}))?\b/);
  if (!match) return null;

  const monthIndex = MONTH_TO_INDEX[match[1].toLowerCase()];
  if (monthIndex === undefined) return null;

  const day = Number(match[2]);
  const year = match[3] ? Number(match[3]) : fallbackYear;
  if (!Number.isFinite(day) || !Number.isFinite(year)) return null;

  return formatUtcDate(new Date(Date.UTC(year, monthIndex, day)));
}

function parseSlashDateToIso(raw: string, fallbackYear: number) {
  const match = raw.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
  if (!match) return null;

  const month = Number(match[1]);
  const day = Number(match[2]);
  let year = match[3] ? Number(match[3]) : fallbackYear;

  if (!Number.isFinite(month) || !Number.isFinite(day) || !Number.isFinite(year)) return null;
  if (year < 100) year += 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return formatUtcDate(date);
}

function extractExplicitWeekdayIndex(text: string) {
  const match = text.toLowerCase().match(/\b(sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?)\b/);
  if (!match) return null;
  return WEEKDAY_TO_INDEX[match[1]] ?? null;
}

function getWeekdayName(dayIndex: number) {
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][dayIndex] || "Unknown";
}

function formatPreviewDate(iso: string) {
  const date = parseIsoDateString(iso);
  if (!date) return iso;
  return date.toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function isConfirmationMessage(raw: string) {
  const text = raw.toLowerCase().trim();
  if (!text) return false;
  if (/\b(no|not yet|wait|hold|cancel|change|update|adjust|instead|except|but)\b/.test(text)) return false;

  return /\b(yes|yeah|yep|sure|ok|okay|looks good|sounds good|go ahead|proceed|confirm|save(?: it| this| them)?|do it|import(?: it| them)?|add(?: it| them)?|schedule(?: it| them)?|replace(?: it| them)?|fix it)\b/.test(text);
}

function isCorrectionMessage(raw: string) {
  return /\b(fix|correct|replace|update|wrong|offset|shifted|move it|reschedule|remap)\b/i.test(raw);
}

function getWorkoutCreateActions(actions: any[]) {
  return Array.isArray(actions) ? actions.filter((action) => action?.action_type === "create_workout") : [];
}

function isStructuredWorkoutPlan(actions: any[], message: string, imageUrl?: string | null, anchor?: WorkoutAnchor | null) {
  const workoutActions = getWorkoutCreateActions(actions);
  if (workoutActions.length < 2) return false;

  return Boolean(
    imageUrl ||
    anchor ||
    isCorrectionMessage(message) ||
    workoutActions.some((action) => extractPlanDayIndex(action) !== null)
  );
}

function validateWorkoutPlanActions(actions: any[], anchor: WorkoutAnchor | null) {
  if (anchor?.explicitWeekdayIndex !== null && anchor?.explicitWeekdayIndex !== undefined) {
    const actualWeekday = getIsoWeekday(anchor.date);
    if (actualWeekday !== anchor.explicitWeekdayIndex) {
      return `I found a weekday/date mismatch in your instruction: ${anchor.sourceText}. ${formatPreviewDate(anchor.date)} is ${getWeekdayName(actualWeekday)}, not ${getWeekdayName(anchor.explicitWeekdayIndex)}. Please confirm which date you want.`;
    }
  }

  for (const action of getWorkoutCreateActions(actions)) {
    if (typeof action.scheduled_date !== "string" || !parseIsoDateString(action.scheduled_date)) {
      return `I couldn't validate the scheduled date for ${action.title || "that workout"}. Please confirm the start date again.`;
    }

    const planDayIndex = extractPlanDayIndex(action);
    if (planDayIndex !== null && getIsoWeekday(action.scheduled_date) !== planDayIndex) {
      return `${action.title || "That workout"} is mapped to ${formatPreviewDate(action.scheduled_date)}, which does not match ${getWeekdayName(planDayIndex)}. I stopped before saving so we can correct it.`;
    }
  }

  return null;
}

function buildWorkoutPlanPreview(actions: any[], operationType: "create" | "replace", existingWorkouts: WorkoutSummary[] = []) {
  const previewLines = getWorkoutCreateActions(actions)
    .map((action) => `- ${action.title || "Workout"} -> ${formatPreviewDate(action.scheduled_date)}`)
    .join("\n");

  if (operationType === "replace") {
    const currentLines = existingWorkouts.length > 0
      ? existingWorkouts
          .sort((a, b) => String(a.scheduled_date || "").localeCompare(String(b.scheduled_date || "")))
          .map((workout) => `- ${workout.title} -> ${workout.scheduled_date ? formatPreviewDate(workout.scheduled_date) : "unscheduled"}`)
          .join("\n")
      : "- I found the current imported workout block and will replace it completely.";

    return [
      "I found the current imported plan is offset.",
      "",
      "I will replace:",
      currentLines,
      "",
      "with:",
      previewLines,
      "",
      "Should I proceed?",
    ].join("\n");
  }

  return [
    "Here’s how I’ll schedule it:",
    "",
    previewLines,
    "",
    "Do you want me to save this?",
  ].join("\n");
}

async function fetchRecentWorkoutPlanState(client: any, conversationId: string | null | undefined, userId: string) {
  if (!conversationId) {
    return {
      latestPendingPlan: null as WorkoutPlanProposal | null,
      latestExecutedPlanIds: [] as string[],
    };
  }

  const { data, error } = await client
    .from("ai_messages")
    .select("role, metadata, created_at")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error || !data) {
    return {
      latestPendingPlan: null as WorkoutPlanProposal | null,
      latestExecutedPlanIds: [] as string[],
    };
  }

  const latestAssistant = data.find((row: any) => row.role === "assistant");
  const latestPendingPlan = latestAssistant?.metadata?.pendingWorkoutPlan || null;

  const latestExecutedPlanMessage = data.find((row: any) => {
    if (row.role !== "assistant") return false;
    const actions = Array.isArray(row.metadata?.actions) ? row.metadata.actions : [];
    const results = Array.isArray(row.metadata?.actionResults) ? row.metadata.actionResults : [];
    return isStructuredWorkoutPlan(actions, row.metadata?.sourceMessage || "", null, null) && results.some((result: any) => result?.action_type === "create_workout" && result?.success);
  });

  const latestExecutedPlanIds = Array.isArray(latestExecutedPlanMessage?.metadata?.actionResults)
    ? latestExecutedPlanMessage.metadata.actionResults
        .filter((result: any) => result?.action_type === "create_workout" && result?.success && typeof result?.id === "string")
        .map((result: any) => result.id)
    : [];

  return {
    latestPendingPlan,
    latestExecutedPlanIds,
  };
}

async function fetchWorkoutSummariesByIds(client: any, userId: string, ids: string[]) {
  if (!ids.length) return [] as WorkoutSummary[];
  const { data, error } = await client
    .from("workouts")
    .select("id, title, scheduled_date")
    .eq("user_id", userId)
    .in("id", ids);

  if (error || !data) return [] as WorkoutSummary[];
  return data as WorkoutSummary[];
}

async function createWorkoutAtomic(client: any, userId: string, groupId: string, action: any, ignoreDuplicateIds = new Set<string>()) {
  const scheduledDate = typeof action.scheduled_date === "string" && action.scheduled_date
    ? action.scheduled_date
    : new Date().toISOString().slice(0, 10);
  const workoutTitle = (action.title || "Workout").trim();
  const workoutTag = action.tag || "Full Body";

  const { data: existingWorkout, error: existingWorkoutError } = await (groupId
    ? client
        .from("workouts")
        .select("id")
        .eq("user_id", userId)
        .eq("group_id", groupId)
        .eq("title", workoutTitle)
        .eq("scheduled_date", scheduledDate)
        .eq("tag", workoutTag)
        .limit(1)
        .maybeSingle()
    : client
        .from("workouts")
        .select("id")
        .eq("user_id", userId)
        .is("group_id", null)
        .eq("title", workoutTitle)
        .eq("scheduled_date", scheduledDate)
        .eq("tag", workoutTag)
        .limit(1)
        .maybeSingle());

  if (existingWorkoutError) throw existingWorkoutError;
  if (existingWorkout?.id && !ignoreDuplicateIds.has(existingWorkout.id)) {
    return { action_type: "create_workout", success: true, id: existingWorkout.id, duplicate: true };
  }

  const { data, error } = await client.from("workouts").insert({
    user_id: userId,
    group_id: groupId,
    title: workoutTitle,
    emoji: action.emoji || "💪",
    duration: action.duration || "30 min",
    cal: action.cal || 0,
    tag: workoutTag,
    exercises: action.exercises || [],
    scheduled_date: scheduledDate,
  }).select().single();

  return { action_type: "create_workout", success: !error, id: data?.id, error: error?.message };
}

async function executeWorkoutPlanProposal(client: any, userId: string, groupId: string, proposal: WorkoutPlanProposal) {
  const validationError = validateWorkoutPlanActions(proposal.createActions, null);
  if (validationError) {
    return {
      success: false,
      error: validationError,
      results: [] as any[],
      createdWorkoutIds: [] as string[],
    };
  }

  const createdWorkoutIds: string[] = [];
  const results: any[] = [];
  const ignoreDuplicateIds = new Set(proposal.deleteWorkoutIds || []);

  for (const action of proposal.createActions) {
    const result = await createWorkoutAtomic(client, userId, groupId, action, ignoreDuplicateIds);
    results.push(result);

    if (!result.success) {
      if (createdWorkoutIds.length > 0) {
        await client.from("workouts").delete().eq("user_id", userId).in("id", createdWorkoutIds);
      }

      return {
        success: false,
        error: result.error || "Failed to create one or more workouts",
        results,
        createdWorkoutIds: [] as string[],
      };
    }

    if (result.id && !result.duplicate) {
      createdWorkoutIds.push(result.id);
    }
  }

  if (proposal.operationType === "replace" && proposal.deleteWorkoutIds.length > 0) {
    const { error } = await client
      .from("workouts")
      .delete()
      .eq("user_id", userId)
      .in("id", proposal.deleteWorkoutIds);

    if (error) {
      if (createdWorkoutIds.length > 0) {
        await client.from("workouts").delete().eq("user_id", userId).in("id", createdWorkoutIds);
      }

      return {
        success: false,
        error: error.message,
        results: [{ action_type: "delete_workout", success: false, error: error.message }, ...results],
        createdWorkoutIds: [] as string[],
      };
    }

    results.unshift({ action_type: "delete_workout", success: true, count: proposal.deleteWorkoutIds.length });
  }

  return {
    success: true,
    error: null,
    results,
    createdWorkoutIds,
  };
}

function extractWorkoutAnchor(message: string, conversationHistory: any[] | undefined, timeZone: string): WorkoutAnchor | null {
  const userMessages = [
    ...(Array.isArray(conversationHistory) ? conversationHistory : []),
    { role: "user", content: message },
  ]
    .filter((entry) => entry?.role === "user" && typeof entry?.content === "string")
    .map((entry) => (entry.content as string).replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const todayIso = getTodayInTimeZone(timeZone);
  const todayWeekday = getIsoWeekday(todayIso);
  const fallbackYear = Number(todayIso.slice(0, 4));

  for (let index = userMessages.length - 1; index >= 0; index -= 1) {
    const text = userMessages[index];
    const explicitWeekdayIndex = extractExplicitWeekdayIndex(text);

    const isoDateMatch = text.match(/\b(?:start(?:ing)?|begin|schedule|map|put|make)\b[^.\n]{0,80}?\b(?:on\s+)?(\d{4}-\d{2}-\d{2})\b/i);
    if (isoDateMatch) {
      return {
        date: isoDateMatch[1],
        weekdayIndex: getIsoWeekday(isoDateMatch[1]),
        sourceText: text,
        explicitWeekdayIndex,
      };
    }

    const slashDateMatch = text.match(/\b(?:start(?:ing)?|begin|schedule|map|put|make)\b[^.\n]{0,80}?\b(?:on\s+)?(\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)\b/i);
    if (slashDateMatch) {
      const iso = parseSlashDateToIso(slashDateMatch[1], fallbackYear);
      if (iso) {
        return {
          date: iso,
          weekdayIndex: getIsoWeekday(iso),
          sourceText: text,
          explicitWeekdayIndex,
        };
      }
    }

    const naturalDateMatch = text.match(/\b(?:start(?:ing)?|begin|schedule|map|put|make)\b[^.\n]{0,80}?\b(?:on\s+)?((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:,\s*\d{4})?)\b/i);
    if (naturalDateMatch) {
      const iso = parseNaturalDateToIso(naturalDateMatch[1], fallbackYear);
      if (iso) {
        return {
          date: iso,
          weekdayIndex: getIsoWeekday(iso),
          sourceText: text,
          explicitWeekdayIndex,
        };
      }
    }

    const weekdayMatch = text.match(/\b(?:start(?:ing)?|begin|schedule|map|put|make)\b[^.\n]{0,100}?\b(?:(next|this|coming|this coming)\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
    if (weekdayMatch) {
      const qualifier = (weekdayMatch[1] || "").toLowerCase();
      const weekdayIndex = WEEKDAY_TO_INDEX[weekdayMatch[2].toLowerCase()];
      let offset = (weekdayIndex - todayWeekday + 7) % 7;

      if (qualifier === "next") {
        offset = offset === 0 ? 7 : offset;
      }

      return {
        date: addDaysToIso(todayIso, offset),
        weekdayIndex,
        sourceText: text,
        explicitWeekdayIndex: weekdayIndex,
      };
    }
  }

  return null;
}

function extractPlanDayIndex(action: any) {
  const candidates = [action?.plan_day_label, action?.day_label, action?.source_day_label, action?.title];

  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const match = candidate.toLowerCase().match(/\b(sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?)\b/);
    if (match) {
      return WEEKDAY_TO_INDEX[match[1]] ?? null;
    }
  }

  return null;
}

function applyWorkoutAnchorToActions(actions: any[], anchor: WorkoutAnchor | null) {
  if (!anchor || !Array.isArray(actions)) return actions;

  const workoutIndexes = actions
    .map((action, index) => (action?.action_type === "create_workout" ? index : -1))
    .filter((index) => index >= 0);

  if (workoutIndexes.length < 2) return actions;

  const hasDayLabels = workoutIndexes.some((index) => extractPlanDayIndex(actions[index]) !== null);
  if (!hasDayLabels) return actions;

  const normalizedActions = actions.map((action) => ({ ...action }));
  let previousDate: string | null = null;
  let previousDayIndex: number | null = null;

  for (const index of workoutIndexes) {
    const action = { ...normalizedActions[index] };
    const currentDayIndex = extractPlanDayIndex(action);

    if (previousDate === null) {
      const initialOffset = currentDayIndex === null ? 0 : (currentDayIndex - anchor.weekdayIndex + 7) % 7;
      action.scheduled_date = addDaysToIso(anchor.date, initialOffset);
    } else if (currentDayIndex !== null && previousDayIndex !== null) {
      let delta = currentDayIndex - previousDayIndex;
      if (delta <= 0) delta += 7;
      action.scheduled_date = addDaysToIso(previousDate, delta);
    } else {
      action.scheduled_date = addDaysToIso(previousDate, 1);
    }

    normalizedActions[index] = action;
    previousDate = action.scheduled_date;
    previousDayIndex = currentDayIndex;
  }

  return normalizedActions;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { message, groupId, conversationId, conversationHistory, phase, context, timezone, appContext, executeActions, imageUrl } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");

    // Create admin client for executing actions
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Get user ID from token
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey);
    const { data: { user } } = await userClient.auth.getUser(token);
    const userId = user?.id;
    if (!userId) throw new Error("Not authenticated");

    // If executeActions is set, run the actions directly
    if (executeActions && Array.isArray(executeActions)) {
      const results = await executeAppActions(adminClient, userId, groupId, executeActions);
      return new Response(JSON.stringify({ success: true, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const recentWorkoutPlanState = await fetchRecentWorkoutPlanState(adminClient, conversationId, userId);
    if (recentWorkoutPlanState.latestPendingPlan && isConfirmationMessage(message || "")) {
      const execution = await executeWorkoutPlanProposal(adminClient, userId, groupId, recentWorkoutPlanState.latestPendingPlan);
      const savedCount = execution.results.filter((result: any) => result.action_type === "create_workout" && result.success).length;

      return new Response(JSON.stringify({
        reply: execution.success
          ? recentWorkoutPlanState.latestPendingPlan.operationType === "replace"
            ? `Done — I replaced the imported workout plan with ${savedCount} workout${savedCount !== 1 ? "s" : ""}.`
            : `Done — I saved ${savedCount} workout${savedCount !== 1 ? "s" : ""}.`
          : `I couldn’t complete the full workout-plan ${recentWorkoutPlanState.latestPendingPlan.operationType === "replace" ? "replacement" : "save"}, so I stopped before leaving a partial update. ${execution.error ? `Reason: ${execution.error}` : ""}`.trim(),
        phase: execution.success ? "done" : "gathering",
        suggestions: execution.success
          ? ["Adjust this plan", "Create another workout plan", "Show my workouts"]
          : ["Review the mapped dates", "Change the start date", "Try again"],
        actions: execution.success ? recentWorkoutPlanState.latestPendingPlan.createActions : [],
        actionResults: execution.results,
        workoutPlanExecution: execution.success ? {
          operationType: recentWorkoutPlanState.latestPendingPlan.operationType,
          createdWorkoutIds: execution.createdWorkoutIds,
        } : undefined,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userTz = timezone || "America/New_York";
    const now = new Date();
    const todayStr = getTodayInTimeZone(userTz);
    const userName = appContext?.userName || "there";
    const groups = appContext?.groups || [];
    const activeGroupName = appContext?.activeGroupName || "your group";
    const workoutAnchor = extractWorkoutAnchor(message || "", conversationHistory, userTz);

    // Fetch current app data for context
    let currentData = "";
    try {
      const [workoutsRes, eventsRes, habitsRes, sectionsRes, sobrietyRes, specialDaysRes, exerciseLogsRes, mealLogsRes, nutritionGoalsRes] = await Promise.all([
        adminClient.from("workouts").select("id,title,emoji,tag,duration,cal,done,scheduled_date,exercises").eq("user_id", userId).eq("group_id", groupId).order("scheduled_date", { ascending: true }).limit(50),
        adminClient.from("events").select("id,title,day,month,year,time,end_time,assignee,done,description").eq("group_id", groupId).order("year", { ascending: true }).order("month", { ascending: true }).order("day", { ascending: true }).limit(50),
        adminClient.from("habits").select("id,label,category").eq("user_id", userId).eq("group_id", groupId),
        adminClient.from("habit_sections").select("id,key,label,icon,sort_order").eq("user_id", userId).eq("group_id", groupId).order("sort_order"),
        adminClient.from("sobriety_categories").select("id,label,icon,start_date,money_per_day").eq("user_id", userId).eq("group_id", groupId),
        adminClient.from("special_days").select("id,title,icon,event_date,count_direction,repeats_yearly,is_featured").eq("user_id", userId).eq("group_id", groupId),
        adminClient.from("exercise_logs").select("exercise_name,set_number,weight,unit,reps,completed,logged_date,workout_id").eq("user_id", userId).order("logged_date", { ascending: false }).order("exercise_name").order("set_number").limit(200),
        adminClient.from("meal_logs").select("id,meal_type,title,protein,calories,meal_date,is_ai_generated").eq("user_id", userId).order("meal_date", { ascending: false }).limit(50),
        adminClient.from("nutrition_goals").select("protein_goal,calorie_goal,show_calories").eq("user_id", userId).eq("group_id", groupId).maybeSingle(),
      ]);

      const upcoming = (eventsRes.data || []).filter((e: any) => {
        const d = new Date(e.year, e.month, e.day);
        return d >= new Date(todayStr + "T00:00:00");
      }).slice(0, 20);

      const futureWorkouts = (workoutsRes.data || []).filter((w: any) => w.scheduled_date >= todayStr && !w.done).slice(0, 20);

      const nutritionGoal = nutritionGoalsRes.data || { protein_goal: 150, calorie_goal: null };
      const todayMeals = (mealLogsRes.data || []).filter((m: any) => m.meal_date === todayStr);
      const todayProtein = todayMeals.reduce((s: number, m: any) => s + (m.protein || 0), 0);

      currentData = `
CURRENT APP DATA (for this group "${activeGroupName}"):
Workouts (upcoming/incomplete): ${JSON.stringify(futureWorkouts)}
Events (upcoming): ${JSON.stringify(upcoming)}
Habits: ${JSON.stringify(habitsRes.data || [])}
Habit Sections: ${JSON.stringify(sectionsRes.data || [])}
Sobriety Trackers: ${JSON.stringify(sobrietyRes.data || [])}
Special Days: ${JSON.stringify(specialDaysRes.data || [])}
Exercise Logs (recent weight/rep history, sorted newest first): ${JSON.stringify(exerciseLogsRes.data || [])}
Meal Logs (recent): ${JSON.stringify(mealLogsRes.data || [])}
Nutrition Goals: protein_goal=${nutritionGoal.protein_goal}g, calorie_goal=${nutritionGoal.calorie_goal || 'not set'}
Today's nutrition: ${todayProtein}g protein consumed from ${todayMeals.length} meals

EXERCISE LOG INSTRUCTIONS: When the user asks about weights they've used, their recent lifts, or strength progress, use the Exercise Logs data above.

NUTRITION INSTRUCTIONS: When the user asks about protein intake, meals eaten, or nutrition progress, use the Meal Logs and Nutrition Goals data above. Answer questions like "How much protein have I had today?", "What did I eat yesterday?", "Am I hitting my protein goal?" using the logged data.`;
    } catch (e) {
      console.error("Failed to fetch context data:", e);
    }

    const systemPrompt = `You are a friendly, knowledgeable universal AI assistant inside a shared planning & wellness app. Today is ${todayStr}. User timezone: ${userTz}. User's name: ${userName}. Active group: ${activeGroupName}. Group ID: ${groupId}.

Available groups: ${groups.map((g: any) => `${g.emoji} ${g.name} (${g.memberCount} members, id: ${g.id})`).join(", ") || "none"}

${currentData}

YOU ARE THE APP'S CENTRAL AI. You can help with EVERYTHING and EXECUTE REAL ACTIONS.

CAPABILITIES:
1. **Workouts** - Create, edit, delete workout plans with exercises
2. **Events/Scheduling** - Create, edit, delete calendar events with dates/times
3. **Habits** - Create, delete habits in sections
4. **Habit Sections** - Create, rename, delete habit sections
5. **Sobriety Tracking** - Set up/delete sobriety trackers
6. **Special Days** - Add/delete special day trackers
7. **Group Chat** - Send messages to group chats
8. **Tasks** - Create, edit, delete tasks
9. **Summaries** - Summarize activity, completions, streaks
10. **Nutrition** - Log meals, answer protein/calorie questions, suggest meals
11. **Image Understanding** - Analyze uploaded images including workout plans, schedules, meal plans, notes

ACTION SYSTEM:
When the user wants you to DO something (create, edit, delete, send), you MUST include an "actions" array.
Each action has an "action_type" and relevant fields.

ACTION TYPES:
 - "create_workout": { title, emoji, duration, cal, tag, exercises: [{name, sets, reps}], scheduled_date, plan_day_label? }
- "delete_workout": { workout_id } (use ID from current data)
- "create_event": { title, day, month, year, time, end_time, assignee, description }
- "delete_event": { event_id }
- "create_habit": { label, category }
- "delete_habit": { habit_id }
- "create_section": { key, label, icon, shared }
- "delete_section": { section_id }
- "rename_section": { section_id, new_label }
- "create_sobriety": { label, icon, start_date, money_per_day }
- "delete_sobriety": { sobriety_id }
- "create_special_day": { title, icon, event_date, count_direction, repeats_yearly }
- "delete_special_day": { special_day_id }
- "send_message": { group_id, content }
- "create_task": { title, tag, time, assignee, scheduled_day, scheduled_month, scheduled_year }
- "delete_task": { task_id }
- "log_meal": { meal_type (breakfast/lunch/dinner/snack), title, protein (grams), calories, meal_date (YYYY-MM-DD), ingredients (array of strings, e.g. ["2 eggs", "1 cup spinach"]), prep_steps (array of strings, e.g. ["Scramble eggs", "Add spinach"]) }
- "delete_meal": { meal_id }
- "create_shopping_list": { date_range_start (YYYY-MM-DD - any date in the target week; system auto-groups by Mon-Sun), is_meal_plan (boolean), items (array of strings - ingredient names with quantities combined, e.g. "5 eggs" not "2 eggs" + "3 eggs") }

CRITICAL RULES:
1. When the user clearly states what they want, EXECUTE IT with actions. Don't just suggest—DO IT.
2. If details are missing or ambiguous, ask follow-up questions first (no actions yet).
3. After executing, confirm what you did clearly.
4. For delete requests with multiple possible targets, ask which one(s) to delete.
5. When creating workout plans, include real exercises with sets/reps.
6. Keep responses concise and mobile-friendly.
7. Always provide 2-4 quick-reply suggestions.
8. Use the CURRENT APP DATA above to reference existing items by ID when editing/deleting.
9. For multi-day workout plans, create one action per day.
10. If the user explicitly gives a start day or start date for a workout import (for example: "start next Monday", "begin on Monday", "start on Apr 6"), treat that anchor literally. Monday means Monday. Do NOT shift the plan because of week-start preferences, locale assumptions, or Sunday/Monday calendar grouping.
11. Week-start preference only affects display/grouping elsewhere. It must NEVER override explicit workout import date mapping.

IMAGE UNDERSTANDING - WORKOUT PLAN IMPORT:
When the user uploads an image of a workout plan, schedule, or exercise routine:
1. CAREFULLY parse and identify ALL exercises, sets, reps, and day-based splits from the image.
2. Present a clear summary of what you found: list each day/workout and its exercises.
3. DO NOT immediately create workouts. Instead, ask smart follow-up questions:
   - "When do you want this plan to start? (e.g., today, next Monday)"
   - "Should I import all days or just specific ones?"
   - "Do you want to keep the sets/reps exactly as shown?"
4. If the plan has labeled days (Monday, Tuesday, etc.) and the user gives an explicit anchor like "start next Monday", map those labels literally: Monday → Monday, Tuesday → Tuesday, and so on. Never shift the whole split by one day.
5. CRITICAL: For workout-plan imports and corrections, ALWAYS include the full proposed create_workout actions in the actions array even during the preview/confirmation step. The backend will hold them as a preview and will NOT save them until the user confirms.
6. Before creating any workouts, show the exact mapped dates clearly in the reply (for example: "Monday Push on Mon Apr 6, Tuesday Pull on Tue Apr 7") and ask for confirmation such as "Should I save this?"
7. Only after the user confirms, create the workouts with actions again so the backend can execute the confirmed plan.
8. For imported or day-labeled workout splits, include plan_day_label on each create_workout action whenever a source day label exists so the app can preserve literal mapping.
9. When the user asks to fix, update, replace, or correct a previously imported workout plan, return the FULL corrected replacement plan as create_workout actions for preview. Do not return partial delete/add sets.
10. Match exercise names to common canonical names (e.g., "DB Shoulder Press" → "Dumbbell Shoulder Press", "RDLs" → "Romanian Deadlifts").
11. If you can't read part of the image clearly, tell the user what you couldn't make out and ask for clarification.

When the user uploads other types of images (meal plans, schedules, screenshots), analyze them appropriately and offer to help integrate the information into the app.

MEAL PLANNING:
You can create multi-day meal plans (up to 1 month / 31 days). When the user asks for a meal plan:
1. If key details are missing (dietary preferences, calorie/protein targets, how many meals per day, start date), ask clarifying questions first. But if you already have nutrition goals data and the request is clear, proceed.
2. Generate a structured plan organized by date with breakfast, lunch, dinner, and snacks.
3. IMPORTANT: Do NOT immediately save. First, present a summary of the plan (e.g. "Here's your 7-day meal plan: Day 1: Breakfast - ..., Lunch - ..., etc."). Keep the summary concise but informative.
4. Ask the user: "Would you like me to add this meal plan to your Nutrition page?"
5. Only when the user confirms, include the "actions" array with one "log_meal" action per meal, each with the correct meal_date (YYYY-MM-DD), meal_type, title, protein, calories, ingredients, and prep_steps.
6. For meal plans, set phase to "gathering" when presenting the plan, and "executing" when saving after confirmation.
7. CRITICAL: Each log_meal action MUST include ALL of these fields: meal_type, title, protein, calories, meal_date, ingredients (array of ingredient strings with quantities), prep_steps (array of preparation instruction strings). This ensures AI-generated meals match the same quality as the Nutrition page's AI Suggest feature.

SHOPPING LIST FROM MEAL PLANS:
After a meal plan is confirmed and saved, ALWAYS ask the user: "Would you also like me to create a shopping list from these ingredients?"
If the user says yes, BEFORE creating the shopping list, ask: "Do you already have any of these items at home? Let me know what you have and I'll remove those from the list."
Wait for the user's response. Then:
1. Remove items the user says they already have.
2. Consolidate/deduplicate similar ingredients across all meals and SUM quantities (e.g. "2 eggs" + "3 eggs" = "5 eggs").
3. Create ONE "create_shopping_list" action per week with the finalized combined list. Set is_meal_plan=true, include date_range_start as any date in the target week (the system auto-groups by Monday-Sunday). Items should be pre-combined with total quantities.
The user can also ask to create a shopping list from an existing meal plan at any time.

CONVERSATION PHASES:
- "idle": Ready to help
- "gathering": Collecting info for a task
- "executing": Taking action (include actions array)
- "done": Action completed`;
    const messages: any[] = [{ role: "system", content: systemPrompt }];
    if (conversationHistory && Array.isArray(conversationHistory)) {
      for (const msg of conversationHistory) {
        // Support multimodal messages with image_url
        if (msg.image_url && msg.role === "user") {
          messages.push({
            role: "user",
            content: [
              ...(msg.content ? [{ type: "text", text: msg.content }] : []),
              { type: "image_url", image_url: { url: msg.image_url } },
            ],
          });
        } else {
          messages.push({ role: msg.role, content: msg.content });
        }
      }
    }

    // Build the current user message (possibly with image)
    if (imageUrl) {
      messages.push({
        role: "user",
        content: [
          ...(message ? [{ type: "text", text: message }] : [{ type: "text", text: "Please analyze this image." }]),
          { type: "image_url", image_url: { url: imageUrl } },
        ],
      });
    } else {
      messages.push({ role: "user", content: message });
    }

    const tools = [
      {
        type: "function",
        function: {
          name: "assistant_response",
          description: "Respond and optionally execute actions in the app.",
          parameters: {
            type: "object",
            properties: {
              reply: { type: "string", description: "The conversational reply to the user" },
              phase: { type: "string", enum: ["idle", "gathering", "executing", "done"] },
              suggestions: { type: "array", items: { type: "string" } },
              actions: {
                type: "array",
                description: "Actions to execute in the app. Include when the user wants something done.",
                items: {
                  type: "object",
                  properties: {
                    action_type: { type: "string", enum: [
                      "create_workout", "delete_workout",
                      "create_event", "delete_event",
                      "create_habit", "delete_habit",
                      "create_section", "delete_section", "rename_section",
                      "create_sobriety", "delete_sobriety",
                      "create_special_day", "delete_special_day",
                      "send_message",
                      "create_task", "delete_task",
                      "log_meal", "delete_meal",
                      "create_shopping_list"
                    ]},
                    title: { type: "string" },
                    emoji: { type: "string" },
                    duration: { type: "string" },
                    cal: { type: "number" },
                    tag: { type: "string" },
                    exercises: { type: "array", items: { type: "object", properties: { name: { type: "string" }, sets: { type: "number" }, reps: { type: "string" } } } },
                    scheduled_date: { type: "string" },
                     plan_day_label: { type: "string" },
                    day: { type: "number" },
                    month: { type: "number" },
                    year: { type: "number" },
                    time: { type: "string" },
                    end_time: { type: "string" },
                    assignee: { type: "string" },
                    description: { type: "string" },
                    label: { type: "string" },
                    category: { type: "string" },
                    key: { type: "string" },
                    icon: { type: "string" },
                    shared: { type: "boolean" },
                    start_date: { type: "string" },
                    money_per_day: { type: "number" },
                    event_date: { type: "string" },
                    count_direction: { type: "string" },
                    repeats_yearly: { type: "boolean" },
                    group_id: { type: "string" },
                    content: { type: "string" },
                    workout_id: { type: "string" },
                    event_id: { type: "string" },
                    habit_id: { type: "string" },
                    section_id: { type: "string" },
                    sobriety_id: { type: "string" },
                    special_day_id: { type: "string" },
                    task_id: { type: "string" },
                    meal_id: { type: "string" },
                    meal_type: { type: "string" },
                    meal_date: { type: "string" },
                    protein: { type: "number" },
                    calories: { type: "number" },
                    ingredients: { type: "array", items: { type: "string" }, description: "List of ingredients with quantities" },
                    prep_steps: { type: "array", items: { type: "string" }, description: "Step-by-step preparation instructions" },
                    new_label: { type: "string" },
                    scheduled_day: { type: "number" },
                    scheduled_month: { type: "number" },
                    scheduled_year: { type: "number" },
                    is_meal_plan: { type: "boolean" },
                    date_range_start: { type: "string" },
                    date_range_end: { type: "string" },
                    shopping_items: { type: "array", items: { type: "string" }, description: "Shopping list item names" },
                  },
                  required: ["action_type"],
                },
              },
              draftPlan: {
                type: "object",
                description: "Legacy draft plan for backward compat. Prefer using actions instead.",
                properties: {
                  type: { type: "string" },
                  items: { type: "array", items: { type: "object", properties: { title: { type: "string" } } } },
                },
              },
            },
            required: ["reply", "phase"],
            additionalProperties: false,
          },
        },
      },
    ];

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages,
        tools,
        tool_choice: { type: "function", function: { name: "assistant_response" } },
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) return new Response(JSON.stringify({ error: "Rate limited, try again shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const t = await response.text();
      console.error("AI error:", status, t);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      const content = data.choices?.[0]?.message?.content || "I'm here to help! What would you like to do?";
      return new Response(JSON.stringify({
        reply: content, phase: "idle",
        suggestions: ["Plan a workout", "Schedule an event", "Help me set up habits"],
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const parsed = JSON.parse(toolCall.function.arguments);
    const actions = applyWorkoutAnchorToActions(parsed.actions || [], workoutAnchor);
    const workoutPlanValidationError = validateWorkoutPlanActions(actions, workoutAnchor);

    if (isStructuredWorkoutPlan(actions, message || "", imageUrl, workoutAnchor)) {
      if (workoutPlanValidationError) {
        return new Response(JSON.stringify({
          reply: workoutPlanValidationError,
          phase: "gathering",
          suggestions: ["Change the start date", "Use next Monday", "Review the mapping"],
          actions: [],
          actionResults: [],
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const operationType: "create" | "replace" = isCorrectionMessage(message || "") && recentWorkoutPlanState.latestExecutedPlanIds.length > 0
        ? "replace"
        : "create";
      const deleteWorkoutIds = operationType === "replace" ? recentWorkoutPlanState.latestExecutedPlanIds : [];
      const existingWorkouts = operationType === "replace"
        ? await fetchWorkoutSummariesByIds(adminClient, userId, deleteWorkoutIds)
        : [];

      const pendingWorkoutPlan: WorkoutPlanProposal = {
        operationType,
        createActions: getWorkoutCreateActions(actions),
        deleteWorkoutIds,
        previewText: buildWorkoutPlanPreview(actions, operationType, existingWorkouts),
        createdAt: new Date().toISOString(),
      };

      return new Response(JSON.stringify({
        reply: pendingWorkoutPlan.previewText,
        phase: "gathering",
        suggestions: operationType === "replace"
          ? ["Yes, replace it", "Change the start date", "Cancel"]
          : ["Yes, save it", "Adjust the dates", "Cancel"],
        actions: [],
        actionResults: [],
        pendingWorkoutPlan,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Execute actions server-side
    let actionResults: any[] = [];
    if (actions.length > 0) {
      actionResults = await executeAppActions(adminClient, userId, groupId, actions);
    }

    return new Response(JSON.stringify({
      reply: parsed.reply,
      phase: parsed.phase || "idle",
      suggestions: parsed.suggestions || [],
      actions: actions,
      actionResults: actionResults,
      draftPlan: parsed.draftPlan || null,
      sourceMessage: message || "",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-coach error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function executeAppActions(client: any, userId: string, groupId: string, actions: any[]): Promise<any[]> {
  const results: any[] = [];
  const now = new Date();

  const parseIsoDate = (raw?: string) => {
    if (!raw || typeof raw !== "string") return null;
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const year = Number(m[1]);
    const month = Number(m[2]) - 1;
    const day = Number(m[3]);
    if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) return null;
    if (month < 0 || month > 11 || day < 1 || day > 31) return null;
    return { year, month, day };
  };

  const normalizeMonth = (raw: unknown, fallbackMonth: number) => {
    const parsed = typeof raw === "string" ? Number(raw) : Number(raw);
    if (!Number.isFinite(parsed)) return fallbackMonth;
    const intVal = Math.trunc(parsed);
    if (intVal >= 1 && intVal <= 12) return intVal - 1;
    if (intVal >= 0 && intVal <= 11) return intVal;
    return fallbackMonth;
  };

  const normalizeDay = (raw: unknown, fallbackDay: number) => {
    const parsed = typeof raw === "string" ? Number(raw) : Number(raw);
    if (!Number.isFinite(parsed)) return fallbackDay;
    const intVal = Math.trunc(parsed);
    if (intVal >= 1 && intVal <= 31) return intVal;
    return fallbackDay;
  };

  const normalizeYear = (raw: unknown, fallbackYear: number) => {
    const parsed = typeof raw === "string" ? Number(raw) : Number(raw);
    if (!Number.isFinite(parsed)) return fallbackYear;
    const intVal = Math.trunc(parsed);
    if (intVal >= 1900 && intVal <= 3000) return intVal;
    return fallbackYear;
  };

  const normalizeEventDate = (action: any) => {
    const fromIso = parseIsoDate(action.date);
    if (fromIso) return fromIso;

    return {
      day: normalizeDay(action.day, now.getDate()),
      month: normalizeMonth(action.month, now.getMonth()),
      year: normalizeYear(action.year, now.getFullYear()),
    };
  };

  const normalizeEventEndDate = (action: any, start: { day: number; month: number; year: number }) => {
    const fromIso = parseIsoDate(action.end_date);
    if (fromIso) return fromIso;

    const hasEndParts = action.end_day !== undefined || action.end_month !== undefined || action.end_year !== undefined;
    if (!hasEndParts) return start;

    return {
      day: normalizeDay(action.end_day, start.day),
      month: normalizeMonth(action.end_month, start.month),
      year: normalizeYear(action.end_year, start.year),
    };
  };

  const normalizeTaskSchedule = (action: any) => {
    const fromIso = parseIsoDate(action.scheduled_date || action.date);
    if (fromIso) {
      return {
        scheduled_day: fromIso.day,
        scheduled_month: fromIso.month,
        scheduled_year: fromIso.year,
      };
    }

    const hasParts = action.scheduled_day !== undefined || action.scheduled_month !== undefined || action.scheduled_year !== undefined;
    if (!hasParts) {
      return {
        scheduled_day: null,
        scheduled_month: null,
        scheduled_year: null,
      };
    }

    return {
      scheduled_day: normalizeDay(action.scheduled_day, now.getDate()),
      scheduled_month: normalizeMonth(action.scheduled_month, now.getMonth()),
      scheduled_year: normalizeYear(action.scheduled_year, now.getFullYear()),
    };
  };

  const normalizeTime = (raw: unknown, fallback = "All day") => {
    if (typeof raw !== "string") return fallback;
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : fallback;
  };

  const normalizeAssignee = (raw: unknown): "me" | "partner" | "both" => {
    if (raw === "partner" || raw === "both") return raw;
    return "me";
  };

  const applyGroupFilter = (query: any) => {
    return groupId ? query.eq("group_id", groupId) : query.is("group_id", null);
  };

  for (const action of actions) {
    try {
      switch (action.action_type) {
        case "create_workout": {
          const scheduledDate = typeof action.scheduled_date === "string" && action.scheduled_date
            ? action.scheduled_date
            : new Date().toISOString().slice(0, 10);
          const workoutTitle = (action.title || "Workout").trim();
          const workoutTag = action.tag || "Full Body";

          const existingWorkoutQuery = applyGroupFilter(
            client
              .from("workouts")
              .select("id")
              .eq("user_id", userId)
              .eq("title", workoutTitle)
              .eq("scheduled_date", scheduledDate)
              .eq("tag", workoutTag)
              .limit(1)
          );
          const { data: existingWorkout, error: existingWorkoutError } = await existingWorkoutQuery.maybeSingle();
          if (existingWorkoutError) throw existingWorkoutError;
          if (existingWorkout?.id) {
            results.push({ action_type: "create_workout", success: true, id: existingWorkout.id, duplicate: true });
            break;
          }

          const { data, error } = await client.from("workouts").insert({
            user_id: userId,
            group_id: groupId,
            title: workoutTitle,
            emoji: action.emoji || "💪",
            duration: action.duration || "30 min",
            cal: action.cal || 0,
            tag: workoutTag,
            exercises: action.exercises || [],
            scheduled_date: scheduledDate,
          }).select().single();
          results.push({ action_type: "create_workout", success: !error, id: data?.id, error: error?.message });
          break;
        }
        case "delete_workout": {
          const { error } = await client.from("workouts").delete().eq("id", action.workout_id).eq("user_id", userId);
          results.push({ action_type: "delete_workout", success: !error, error: error?.message });
          break;
        }
        case "create_event": {
          const start = normalizeEventDate(action);
          const end = normalizeEventEndDate(action, start);
          const title = (action.title || "Event").trim();
          const time = normalizeTime(action.time, "All day");
          const allDay = time === "All day";
          const endTime = allDay ? "" : normalizeTime(action.end_time, "");
          const assignee = normalizeAssignee(action.assignee);

          const existingEventQuery = applyGroupFilter(
            client
              .from("events")
              .select("id")
              .eq("user_id", userId)
              .eq("title", title)
              .eq("day", start.day)
              .eq("month", start.month)
              .eq("year", start.year)
              .eq("time", time)
              .eq("assignee", assignee)
              .limit(1)
          );
          const { data: existingEvent, error: existingEventError } = await existingEventQuery.maybeSingle();
          if (existingEventError) throw existingEventError;
          if (existingEvent?.id) {
            results.push({ action_type: "create_event", success: true, id: existingEvent.id, duplicate: true });
            break;
          }

          const { data, error } = await client.from("events").insert({
            user_id: userId,
            group_id: groupId,
            title,
            day: start.day,
            month: start.month,
            year: start.year,
            end_day: end.day,
            end_month: end.month,
            end_year: end.year,
            all_day: allDay,
            time,
            end_time: endTime,
            assignee,
            description: action.description || null,
          }).select().single();
          results.push({ action_type: "create_event", success: !error, id: data?.id, error: error?.message });
          break;
        }
        case "delete_event": {
          const { error } = await client.from("events").delete().eq("id", action.event_id).eq("user_id", userId);
          results.push({ action_type: "delete_event", success: !error, error: error?.message });
          break;
        }
        case "create_habit": {
          const { data, error } = await client.from("habits").insert({
            user_id: userId,
            group_id: groupId,
            label: action.label || action.title || "Habit",
            category: action.category || "other",
          }).select().single();
          results.push({ action_type: "create_habit", success: !error, id: data?.id, error: error?.message });
          break;
        }
        case "delete_habit": {
          const { error } = await client.from("habits").delete().eq("id", action.habit_id).eq("user_id", userId);
          results.push({ action_type: "delete_habit", success: !error, error: error?.message });
          break;
        }
        case "create_section": {
          if (action.shared) {
            const { data, error } = await client.rpc("create_shared_section", {
              _key: action.key || action.label?.toLowerCase().replace(/\s+/g, "_") || "custom",
              _label: action.label || "Section",
              _icon: action.icon || "📋",
              _group_id: groupId,
            });
            results.push({ action_type: "create_section", success: !error, error: error?.message });
          } else {
            const maxOrderRes = await client.from("habit_sections").select("sort_order").eq("user_id", userId).eq("group_id", groupId).order("sort_order", { ascending: false }).limit(1);
            const maxOrder = maxOrderRes.data?.[0]?.sort_order ?? -1;
            const { data, error } = await client.from("habit_sections").insert({
              user_id: userId,
              group_id: groupId,
              key: action.key || action.label?.toLowerCase().replace(/\s+/g, "_") || "custom",
              label: action.label || "Section",
              icon: action.icon || "📋",
              sort_order: maxOrder + 1,
            }).select().single();
            results.push({ action_type: "create_section", success: !error, id: data?.id, error: error?.message });
          }
          break;
        }
        case "delete_section": {
          const { error } = await client.from("habit_sections").delete().eq("id", action.section_id).eq("user_id", userId);
          results.push({ action_type: "delete_section", success: !error, error: error?.message });
          break;
        }
        case "rename_section": {
          const { error } = await client.from("habit_sections").update({ label: action.new_label }).eq("id", action.section_id).eq("user_id", userId);
          results.push({ action_type: "rename_section", success: !error, error: error?.message });
          break;
        }
        case "create_sobriety": {
          const { data, error } = await client.from("sobriety_categories").insert({
            user_id: userId,
            group_id: groupId,
            label: action.label || action.title || "Tracker",
            icon: action.icon || "🚫",
            start_date: action.start_date || new Date().toISOString().slice(0, 10),
            money_per_day: action.money_per_day || 0,
          }).select().single();
          results.push({ action_type: "create_sobriety", success: !error, id: data?.id, error: error?.message });
          break;
        }
        case "delete_sobriety": {
          const { error } = await client.from("sobriety_categories").delete().eq("id", action.sobriety_id).eq("user_id", userId);
          results.push({ action_type: "delete_sobriety", success: !error, error: error?.message });
          break;
        }
        case "create_special_day": {
          const { data, error } = await client.from("special_days").insert({
            user_id: userId,
            group_id: groupId,
            title: action.title || "Special Day",
            icon: action.icon || "❤️",
            event_date: action.event_date || new Date().toISOString().slice(0, 10),
            count_direction: action.count_direction || "since",
            repeats_yearly: action.repeats_yearly || false,
          }).select().single();
          results.push({ action_type: "create_special_day", success: !error, id: data?.id, error: error?.message });
          break;
        }
        case "delete_special_day": {
          const { error } = await client.from("special_days").delete().eq("id", action.special_day_id).eq("user_id", userId);
          results.push({ action_type: "delete_special_day", success: !error, error: error?.message });
          break;
        }
        case "send_message": {
          const targetGroupId = action.group_id || groupId;
          const { data, error } = await client.from("messages").insert({
            group_id: targetGroupId,
            user_id: userId,
            content: action.content || "",
            is_ai_coach: false,
          }).select().single();
          results.push({ action_type: "send_message", success: !error, id: data?.id, error: error?.message });
          break;
        }
        case "create_task": {
          const schedule = normalizeTaskSchedule(action);
          const title = (action.title || "Task").trim();
          const time = normalizeTime(action.time, "");
          const assignee = normalizeAssignee(action.assignee);
          const tag = action.tag || "Personal";

          const existingTaskQuery = applyGroupFilter(
            client
              .from("tasks")
              .select("id")
              .eq("user_id", userId)
              .eq("title", title)
              .eq("time", time)
              .eq("assignee", assignee)
              .eq("tag", tag)
              .eq("scheduled_day", schedule.scheduled_day)
              .eq("scheduled_month", schedule.scheduled_month)
              .eq("scheduled_year", schedule.scheduled_year)
              .limit(1)
          );
          const { data: existingTask, error: existingTaskError } = await existingTaskQuery.maybeSingle();
          if (existingTaskError) throw existingTaskError;
          if (existingTask?.id) {
            results.push({ action_type: "create_task", success: true, id: existingTask.id, duplicate: true });
            break;
          }

          const { data, error } = await client.from("tasks").insert({
            user_id: userId,
            group_id: groupId,
            title,
            tag,
            time,
            assignee,
            scheduled_day: schedule.scheduled_day,
            scheduled_month: schedule.scheduled_month,
            scheduled_year: schedule.scheduled_year,
          }).select().single();
          results.push({ action_type: "create_task", success: !error, id: data?.id, error: error?.message });
          break;
        }
        case "delete_task": {
          const { error } = await client.from("tasks").delete().eq("id", action.task_id).eq("user_id", userId);
          results.push({ action_type: "delete_task", success: !error, error: error?.message });
          break;
        }
        case "log_meal": {
          const mealDate = action.meal_date || now.toISOString().slice(0, 10);
          const { data, error } = await client.from("meal_logs").insert({
            user_id: userId,
            group_id: groupId,
            meal_date: mealDate,
            meal_type: action.meal_type || "snack",
            title: (action.title || "Meal").trim(),
            protein: action.protein || 0,
            calories: action.calories || 0,
            ingredients: Array.isArray(action.ingredients) ? action.ingredients : [],
            prep_steps: Array.isArray(action.prep_steps) ? action.prep_steps : [],
            is_ai_generated: true,
          }).select().single();
          results.push({ action_type: "log_meal", success: !error, id: data?.id, error: error?.message });
          break;
        }
        case "delete_meal": {
          const { error } = await client.from("meal_logs").delete().eq("id", action.meal_id).eq("user_id", userId);
          results.push({ action_type: "delete_meal", success: !error, error: error?.message });
          break;
        }
        case "create_shopping_list": {
          // Compute Monday-Sunday week range from date_range_start
          const getWeekMon = (ds: string) => {
            const d = new Date(ds + "T00:00:00Z");
            const day = d.getUTCDay();
            const diff = day === 0 ? -6 : 1 - day;
            d.setUTCDate(d.getUTCDate() + diff);
            return d.toISOString().slice(0, 10);
          };
          const getWeekSun = (monStr: string) => {
            const d = new Date(monStr + "T00:00:00Z");
            d.setUTCDate(d.getUTCDate() + 6);
            return d.toISOString().slice(0, 10);
          };

          const rawStart = action.date_range_start || new Date().toISOString().slice(0, 10);
          const weekStart = getWeekMon(rawStart);
          const weekEnd = getWeekSun(weekStart);
          const monD = new Date(weekStart + "T00:00:00Z");
          const sunD = new Date(weekEnd + "T00:00:00Z");
          const weekLabel = `Week of ${monD.getUTCMonth() + 1}/${monD.getUTCDate()} (Mon) – ${sunD.getUTCMonth() + 1}/${sunD.getUTCDate()} (Sun)`;

          // Find existing weekly list
          let listQuery = client.from("shopping_lists").select("*")
            .eq("user_id", userId)
            .eq("is_meal_plan", true)
            .eq("date_range_start", weekStart)
            .eq("date_range_end", weekEnd);
          if (groupId) listQuery = listQuery.eq("group_id", groupId);

          const { data: existingLists } = await listQuery;
          let listId: string;

          if (existingLists && existingLists.length > 0) {
            listId = existingLists[0].id;
          } else {
            const { data: listData, error: listError } = await client.from("shopping_lists").insert({
              user_id: userId,
              group_id: groupId,
              label: weekLabel,
              date_range_start: weekStart,
              date_range_end: weekEnd,
              is_meal_plan: action.is_meal_plan ?? true,
            }).select().single();

            if (listError || !listData) {
              results.push({ action_type: "create_shopping_list", success: false, error: listError?.message });
              break;
            }
            listId = listData.id;
          }

          const shopItems = Array.isArray(action.shopping_items) ? action.shopping_items : (Array.isArray(action.items) ? action.items : []);
          if (shopItems.length > 0) {
            // Fetch existing items to avoid duplicates
            const { data: existingItems } = await client.from("shopping_list_items").select("*").eq("list_id", listId);
            const existingNames = new Set((existingItems || []).map((it: any) => (it.name as string).toLowerCase().trim()));
            const newItems = shopItems.filter((name: string) => !existingNames.has((typeof name === "string" ? name : String(name)).toLowerCase().trim()));

            if (newItems.length > 0) {
              const rows = newItems.map((name: string) => ({
                list_id: listId,
                user_id: userId,
                name: typeof name === "string" ? name : String(name),
                meal_name: action.meal_title || null,
              }));
              const { error: itemsError } = await client.from("shopping_list_items").insert(rows);
              if (itemsError) {
                results.push({ action_type: "create_shopping_list", success: false, error: itemsError.message });
                break;
              }
            }
          }

          results.push({ action_type: "create_shopping_list", success: true, id: listId });
          break;
        }
        default:
          results.push({ action_type: action.action_type, success: false, error: "Unknown action type" });
      }
    } catch (e) {
      results.push({ action_type: action.action_type, success: false, error: e instanceof Error ? e.message : "Unknown error" });
    }
  }

  return results;
}
