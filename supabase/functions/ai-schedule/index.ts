import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type TimeMention = {
  raw: string;
  hour: number;
  minute: number;
  meridiem: "AM" | "PM" | null;
  ambiguous: boolean;
};

type DateSignals = {
  hasDate: boolean;
  hasToday: boolean;
  hasTomorrow: boolean;
};

const parseLocalDate = (dateStr: string) => {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
};

const formatDateStringLocal = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const to12HourTime = (hour24: number, minute: number) => {
  const meridiem = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${meridiem}`;
};

const getNowInTimezone = (timeZone: string) => {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || "";

  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));

  const dayOfWeek = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long" }).format(now);

  return {
    now,
    todayStr: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    currentTime: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    hour,
    minute,
    dayOfWeek,
  };
};

const extractDateSignals = (text: string): DateSignals => {
  const lower = text.toLowerCase();
  const hasToday = /\btoday\b/.test(lower);
  const hasTomorrow = /\btomorrow\b/.test(lower);
  const hasDayName = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(lower);
  const hasIsoDate = /\b\d{4}-\d{2}-\d{2}\b/.test(lower);
  const hasSlashDate = /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/.test(lower);

  return {
    hasDate: hasToday || hasTomorrow || hasDayName || hasIsoDate || hasSlashDate,
    hasToday,
    hasTomorrow,
  };
};

const extractTimeMention = (text: string): TimeMention | null => {
  const regex = /\b(\d{1,2})(?::([0-5]\d))?\s*(am|pm)?\b/gi;
  const matches = text.matchAll(regex);

  for (const match of matches) {
    const raw = match[0];
    const hourRaw = Number(match[1]);
    const minute = Number(match[2] ?? "0");
    const meridiemRaw = match[3]?.toUpperCase() as "AM" | "PM" | undefined;

    if (Number.isNaN(hourRaw) || Number.isNaN(minute)) continue;
    if (meridiemRaw && (hourRaw < 1 || hourRaw > 12)) continue;
    if (!meridiemRaw && (hourRaw < 0 || hourRaw > 23)) continue;

    const start = match.index ?? -1;
    const end = start + raw.length;
    const prev = text[start - 1] ?? "";
    const next = text[end] ?? "";
    if (prev === "-" || next === "-" || prev === "/" || next === "/") continue;

    const ambiguous = !meridiemRaw && hourRaw >= 1 && hourRaw <= 12;

    return {
      raw,
      hour: hourRaw,
      minute,
      meridiem: meridiemRaw || null,
      ambiguous,
    };
  }

  return null;
};

const normalizeMentionedTime = (mention: TimeMention) => {
  if (mention.meridiem) {
    const hour = mention.hour === 0 ? 12 : mention.hour;
    return `${hour}:${String(mention.minute).padStart(2, "0")} ${mention.meridiem}`;
  }

  if (mention.hour > 12) {
    return to12HourTime(mention.hour, mention.minute);
  }

  return `${mention.hour}:${String(mention.minute).padStart(2, "0")}`;
};

const askClarification = (payload: {
  question: string;
  suggestions: string[];
  spokenResponse?: string;
  context: string;
}) => {
  return new Response(
    JSON.stringify({
      type: "clarification",
      question: payload.question,
      suggestions: payload.suggestions,
      spokenResponse: payload.spokenResponse || payload.question,
      context: payload.context,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
};

const inferTodayMeridiem = (
  mention: TimeMention,
  nowHour: number,
  nowMinute: number,
): { resolvedTime: string | null; shouldClarify: boolean } => {
  const nowMinutes = nowHour * 60 + nowMinute;

  const amHour24 = mention.hour % 12;
  const pmHour24 = (mention.hour % 12) + 12;

  const amMinutes = amHour24 * 60 + mention.minute;
  const pmMinutes = pmHour24 * 60 + mention.minute;

  const amDelta = amMinutes - nowMinutes;
  const pmDelta = pmMinutes - nowMinutes;

  const nearFutureThreshold = 120;

  if (amDelta >= 0 && pmDelta < 0) {
    if (amDelta <= nearFutureThreshold) {
      return { resolvedTime: `${mention.hour}:${String(mention.minute).padStart(2, "0")} AM`, shouldClarify: false };
    }
    return { resolvedTime: null, shouldClarify: true };
  }

  if (pmDelta >= 0 && amDelta < 0) {
    if (pmDelta <= nearFutureThreshold) {
      return { resolvedTime: `${mention.hour}:${String(mention.minute).padStart(2, "0")} PM`, shouldClarify: false };
    }
    return { resolvedTime: null, shouldClarify: true };
  }

  if (amDelta >= 0 && pmDelta >= 0) {
    const nearest = Math.min(amDelta, pmDelta);
    const farthest = Math.max(amDelta, pmDelta);

    if (nearest <= 90 && farthest - nearest >= 360) {
      const meridiem = amDelta < pmDelta ? "AM" : "PM";
      return { resolvedTime: `${mention.hour}:${String(mention.minute).padStart(2, "0")} ${meridiem}`, shouldClarify: false };
    }

    return { resolvedTime: null, shouldClarify: true };
  }

  return { resolvedTime: null, shouldClarify: true };
};

const makeActionSignature = (action: any) => {
  const actionType = action.action_type || "";
  if (actionType === "create_event") {
    return [
      actionType,
      String(action.title || "").trim().toLowerCase(),
      String(action.date || "").trim(),
      String(action.time || "").trim().toLowerCase(),
      String(action.assignee || "me").trim().toLowerCase(),
    ].join("|");
  }

  if (actionType === "add_habit") {
    return [
      actionType,
      String(action.label || "").trim().toLowerCase(),
      String(action.category || "other").trim().toLowerCase(),
    ].join("|");
  }

  return JSON.stringify(action);
};

// Detect intent category from text
const detectIntent = (text: string): "delete" | "query" | "update" | "create" => {
  const lower = text.toLowerCase();
  if (/\b(delete|remove|cancel|drop|get rid of)\b/.test(lower)) return "delete";
  if (/\b(what|how many|do i have|what's|whats|show me|list|tell me about|look like|anything)\b/.test(lower)) return "query";
  if (/\b(update|change|move|reschedule|modify|edit)\b/.test(lower)) return "update";
  return "create";
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { text, conversationHistory, timezone, currentSchedule, currentHabits } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const userTz = timezone || "America/New_York";
    const nowInfo = getNowInTimezone(userTz);
    const dateSignals = extractDateSignals(text || "");
    const timeMention = extractTimeMention(text || "");
    const intent = detectIntent(text || "");

    const tomorrowStr = formatDateStringLocal(
      new Date(parseLocalDate(nowInfo.todayStr).getFullYear(), parseLocalDate(nowInfo.todayStr).getMonth(), parseLocalDate(nowInfo.todayStr).getDate() + 1),
    );

    let forcedTime: string | null = null;
    let forcedDate: string | null = null;

    // Only do time/date pre-processing for create intents
    if (intent === "create" && timeMention) {
      if (!dateSignals.hasDate) {
        return askClarification({
          question: `I caught "${timeMention.raw}". What date is this for?`,
          suggestions: ["Today", "Tomorrow"],
          spokenResponse: `I heard ${timeMention.raw}. What day is that for?`,
          context: `Detected a timed request (${timeMention.raw}) but no date was provided.`,
        });
      }

      if (dateSignals.hasToday) {
        forcedDate = nowInfo.todayStr;
      } else if (dateSignals.hasTomorrow) {
        forcedDate = tomorrowStr;
      }

      if (timeMention.ambiguous) {
        if (dateSignals.hasToday) {
          const inference = inferTodayMeridiem(timeMention, nowInfo.hour, nowInfo.minute);
          if (inference.shouldClarify || !inference.resolvedTime) {
            return askClarification({
              question: `For ${timeMention.raw} today, did you mean ${timeMention.hour}:${String(timeMention.minute).padStart(2, "0")} AM or ${timeMention.hour}:${String(timeMention.minute).padStart(2, "0")} PM?`,
              suggestions: [`${timeMention.hour}:${String(timeMention.minute).padStart(2, "0")} AM`, `${timeMention.hour}:${String(timeMention.minute).padStart(2, "0")} PM`, "Use tomorrow instead"],
              spokenResponse: `Did you mean ${timeMention.hour}:${String(timeMention.minute).padStart(2, "0")} AM or ${timeMention.hour}:${String(timeMention.minute).padStart(2, "0")} PM?`,
              context: `Ambiguous time (${timeMention.raw}) with explicit 'today'.`,
            });
          }
          forcedTime = inference.resolvedTime;
        } else {
          return askClarification({
            question: `Did you mean ${timeMention.hour}:${String(timeMention.minute).padStart(2, "0")} AM or ${timeMention.hour}:${String(timeMention.minute).padStart(2, "0")} PM?`,
            suggestions: [`${timeMention.hour}:${String(timeMention.minute).padStart(2, "0")} AM`, `${timeMention.hour}:${String(timeMention.minute).padStart(2, "0")} PM`],
            spokenResponse: `Did you mean ${timeMention.hour}:${String(timeMention.minute).padStart(2, "0")} AM or ${timeMention.hour}:${String(timeMention.minute).padStart(2, "0")} PM?`,
            context: `Ambiguous time (${timeMention.raw}) without explicit AM/PM.`,
          });
        }
      } else {
        forcedTime = normalizeMentionedTime(timeMention);
      }
    }

    // Build context about current schedule/habits for query & delete intents
    let scheduleContext = "";
    if ((intent === "query" || intent === "delete" || intent === "update") && (currentSchedule || currentHabits)) {
      if (currentSchedule && currentSchedule.length > 0) {
        scheduleContext += "\n\nCurrent schedule for today:\n" + currentSchedule.map((item: any) =>
          `- "${item.title}" at ${item.time || "All day"} (ID: ${item.id}, type: ${item.type})`
        ).join("\n");
      } else {
        scheduleContext += "\n\nNo scheduled items for today.";
      }
      if (currentHabits && currentHabits.length > 0) {
        scheduleContext += "\n\nCurrent habits:\n" + currentHabits.map((h: any) =>
          `- "${h.label}" (${h.category}, ${h.done ? "completed" : "not completed"}, ID: ${h.id})`
        ).join("\n");
      }
    }

    const systemPrompt = `You are a smart, proactive scheduling and habit assistant for a couple named Harrison and Evelyn. Today is ${nowInfo.todayStr} (${nowInfo.dayOfWeek}). Current time is ${nowInfo.currentTime}. User timezone: ${userTz}.

You must parse the user's natural language into structured actions.

CRITICAL RULES:
- If any time is mentioned, treat it as a scheduled calendar event (create_event), never an unscheduled task.
- If time is mentioned but date is missing, ask_clarification.
- If AM/PM is ambiguous, ask_clarification unless there is an explicit disambiguation instruction in this system context.
- Respect explicit date words like "today" and "tomorrow" exactly; do not shift dates silently.
- For one user intent, return one action. Do not duplicate the same event.

ACTIONS YOU CAN PERFORM:
1. create_event — Schedule an event with date and optionally time
2. add_habit — Add a daily habit
3. delete_item — Delete a scheduled event, task, or habit by ID
4. query_schedule — Answer questions about the user's schedule or habits
5. perform_actions — Batch multiple distinct actions only when user clearly asked for multiple items
6. ask_clarification — Ask a specific follow-up question when critical information is missing

DELETE RULES:
- When a user wants to delete something, match their description against the current schedule/habits provided.
- If exactly one item matches, delete it directly.
- If multiple items match, ask_clarification to confirm which one.
- If no items match, respond saying nothing was found.

QUERY RULES:
- When asked about their schedule, habits, or upcoming items, use query_schedule to provide a natural-language answer.
- Summarize the relevant items conversationally.

PERSON/ASSIGNMENT RULES:
- "Harrison", "mine", "my", "me", "I" → assignee "me"
- "Evelyn", "her", "partner", "for Evelyn" → assignee "partner"
- "both", "us", "shared", "household", "together" → assignee "both"
- Default: "me"
- IMPORTANT: When someone says "Schedule X for Evelyn" or "Add X for partner", the assignee MUST be "partner". The item is being created FOR the partner, not for "me".

HABIT RULES:
- Keywords: "habit", "routine", "daily", "every day", "add to routine", "mornings"
- "morning habit/routine/mornings" → category "morning"
- Other habits → category "other"

TAG/CATEGORY RULES (CRITICAL - always assign a tag):
- "work", "office", "meeting", "project", "work call", "standup", "presentation", "deadline", "client", "report", "interview" → tag "Work"
- "household", "chores", "cleaning", "trash", "laundry", "groceries", "dishes", "vacuum", "mop", "cook", "repair", "fix" → tag "Household"
- "personal", "gym", "doctor", "dentist", "workout", "lunch", "dinner", "coffee", "date", "birthday", "hangout", "call mom", "therapist" → tag "Personal"
- If the category is ambiguous and cannot be inferred from the title or context, you MUST use ask_clarification to ask the user: "Is this Work, Personal, or Household?"
- NEVER leave tag empty or undefined. Always set a tag value.
- Use context clues: time of day, keywords, and common sense to infer the best tag.

VOICE RESPONSE:
- Always include a spokenResponse field with a natural confirmation or question.
- Keep it concise and conversational.
${scheduleContext}`;

    const messages: any[] = [{ role: "system", content: systemPrompt }];

    if (forcedDate || forcedTime) {
      messages.push({
        role: "system",
        content: `Deterministic parsing hint: ${forcedDate ? `date must be ${forcedDate}.` : ""} ${forcedTime ? `time should be interpreted as ${forcedTime}.` : ""}`.trim(),
      });
    }

    if (conversationHistory && Array.isArray(conversationHistory)) {
      for (const msg of conversationHistory) {
        messages.push(msg);
      }
    }

    messages.push({ role: "user", content: text });

    const tools = [
      {
        type: "function",
        function: {
          name: "create_event",
          description: "Create a single calendar event.",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string", description: "Event title" },
              date: { type: "string", description: "Date in YYYY-MM-DD format" },
              time: { type: "string", description: "Time like '2:00 PM'. Include if user provided any time." },
              description: { type: "string", description: "Brief description" },
              assignee: { type: "string", enum: ["me", "partner", "both"] },
              tag: { type: "string", enum: ["Work", "Personal", "Household"] },
              spokenResponse: { type: "string", description: "Natural spoken confirmation" },
            },
            required: ["title", "date", "spokenResponse"],
            additionalProperties: false,
          },
        },
      },
      {
        type: "function",
        function: {
          name: "add_habit",
          description: "Add a new daily habit to the user's habit list",
          parameters: {
            type: "object",
            properties: {
              label: { type: "string" },
              category: { type: "string", enum: ["morning", "other"] },
              spokenResponse: { type: "string", description: "Natural spoken confirmation" },
            },
            required: ["label", "category", "spokenResponse"],
            additionalProperties: false,
          },
        },
      },
      {
        type: "function",
        function: {
          name: "delete_item",
          description: "Delete a scheduled event, task, or habit by ID",
          parameters: {
            type: "object",
            properties: {
              item_id: { type: "string", description: "The ID of the item to delete" },
              item_type: { type: "string", enum: ["event", "task", "habit"], description: "Type of item" },
              item_title: { type: "string", description: "Title of the item being deleted for confirmation" },
              spokenResponse: { type: "string", description: "Natural spoken confirmation" },
            },
            required: ["item_id", "item_type", "item_title", "spokenResponse"],
            additionalProperties: false,
          },
        },
      },
      {
        type: "function",
        function: {
          name: "query_schedule",
          description: "Answer questions about the user's schedule, habits, or upcoming items",
          parameters: {
            type: "object",
            properties: {
              answer: { type: "string", description: "Natural language answer to the user's question" },
              spokenResponse: { type: "string", description: "Natural spoken version of the answer" },
            },
            required: ["answer", "spokenResponse"],
            additionalProperties: false,
          },
        },
      },
      {
        type: "function",
        function: {
          name: "ask_clarification",
          description: "Ask the user follow-up questions when critical information is missing.",
          parameters: {
            type: "object",
            properties: {
              question: { type: "string", description: "The follow-up question" },
              suggestions: {
                type: "array",
                items: { type: "string" },
                description: "2-4 quick-reply suggestions",
              },
              spokenResponse: { type: "string", description: "Natural spoken version of the question" },
              context: { type: "string", description: "What the AI understood so far" },
            },
            required: ["question", "suggestions", "spokenResponse", "context"],
            additionalProperties: false,
          },
        },
      },
      {
        type: "function",
        function: {
          name: "perform_actions",
          description: "Perform multiple distinct actions at once",
          parameters: {
            type: "object",
            properties: {
              actions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    action_type: { type: "string", enum: ["create_event", "add_habit", "delete_item"] },
                    title: { type: "string" },
                    date: { type: "string" },
                    time: { type: "string" },
                    description: { type: "string" },
                    assignee: { type: "string", enum: ["me", "partner", "both"] },
                    tag: { type: "string", enum: ["Work", "Personal", "Household"] },
                    label: { type: "string" },
                    category: { type: "string", enum: ["morning", "other"] },
                    item_id: { type: "string" },
                    item_type: { type: "string", enum: ["event", "task", "habit"] },
                    item_title: { type: "string" },
                  },
                  required: ["action_type"],
                  additionalProperties: false,
                },
              },
              spokenResponse: { type: "string", description: "Natural spoken confirmation" },
            },
            required: ["actions", "spokenResponse"],
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
        model: "google/gemini-3-flash-preview",
        messages,
        tools,
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
    const toolCalls = data.choices?.[0]?.message?.tool_calls;
    if (!toolCalls || toolCalls.length === 0) {
      // Model returned text instead of a tool call — treat as conversational response
      const textContent = data.choices?.[0]?.message?.content || "";
      if (textContent) {
        return new Response(JSON.stringify({
          type: "query_response",
          answer: textContent,
          spokenResponse: textContent,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("No tool call in response");
    }

    const tc = toolCalls[0];
    const parsed = JSON.parse(tc.function.arguments);
    const fname = tc.function.name;

    if (fname === "ask_clarification") {
      return askClarification({
        question: parsed.question,
        suggestions: parsed.suggestions || [],
        spokenResponse: parsed.spokenResponse || parsed.question,
        context: parsed.context || "",
      });
    }

    if (fname === "query_schedule") {
      return new Response(JSON.stringify({
        type: "query_response",
        answer: parsed.answer,
        spokenResponse: parsed.spokenResponse || parsed.answer,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (fname === "delete_item") {
      return new Response(JSON.stringify({
        type: "delete_item",
        item_id: parsed.item_id,
        item_type: parsed.item_type,
        item_title: parsed.item_title,
        spokenResponse: parsed.spokenResponse || "",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (fname === "perform_actions" && parsed.actions) {
      const seen = new Set<string>();
      const uniqueActions = [];

      for (const action of parsed.actions) {
        const actionType = action.action_type || "";
        if (actionType === "create_event") {
          if (forcedDate) action.date = forcedDate;
          if (forcedTime) action.time = forcedTime;
          if (!action.time && timeMention && !timeMention.ambiguous) {
            action.time = normalizeMentionedTime(timeMention);
          }
        }

        const signature = makeActionSignature(action);
        if (seen.has(signature)) continue;
        seen.add(signature);
        uniqueActions.push(action);
      }

      return new Response(JSON.stringify({
        type: "multi",
        actions: uniqueActions,
        spokenResponse: parsed.spokenResponse || "",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (fname === "add_habit") {
      return new Response(JSON.stringify({
        type: "add_habit",
        label: parsed.label,
        category: parsed.category,
        spokenResponse: parsed.spokenResponse || "",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // create_event
    if (forcedDate) parsed.date = forcedDate;
    if (forcedTime) parsed.time = forcedTime;

    if (!parsed.time && timeMention && !timeMention.ambiguous) {
      parsed.time = normalizeMentionedTime(timeMention);
    }

    if (dateSignals.hasToday) {
      parsed.date = nowInfo.todayStr;
    } else if (dateSignals.hasTomorrow) {
      parsed.date = tomorrowStr;
    }

    return new Response(JSON.stringify({
      type: "create_event",
      title: parsed.title,
      date: parsed.date,
      time: parsed.time,
      description: parsed.description,
      assignee: parsed.assignee || "me",
      tag: parsed.tag || "Personal",
      spokenResponse: parsed.spokenResponse || "",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-schedule error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
