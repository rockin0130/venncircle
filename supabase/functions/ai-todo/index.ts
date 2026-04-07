import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { action, tasks, taskTitle } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    let systemPrompt = "";
    let userPrompt = "";

    if (action === "prioritize") {
      systemPrompt = `You are a productivity assistant. Given a list of tasks, categorize each into high, medium, or low priority. Consider urgency, importance, and dependencies. Return a JSON array of objects with "id" (task id), "priority" ("high", "medium", or "low"), and "reason" (brief 5-10 word explanation).`;
      userPrompt = `Prioritize these tasks:\n${tasks.map((t: any) => `- ID: ${t.id}, Title: "${t.title}"${t.dueDate ? `, Due: ${t.dueDate}` : ""}`).join("\n")}`;
    } else if (action === "breakdown") {
      systemPrompt = `You are a productivity assistant. Break down the given task into 3-5 practical, actionable steps. Return a JSON array of objects with "title" (concise step name) and "description" (1-2 sentence explanation).`;
      userPrompt = `Break down this task into actionable steps: "${taskTitle}"`;
    } else {
      return new Response(JSON.stringify({ error: "Unknown action" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: action === "prioritize" ? "categorize_tasks" : "breakdown_task",
              description: action === "prioritize"
                ? "Categorize tasks by priority"
                : "Break a task into steps",
              parameters: action === "prioritize"
                ? {
                    type: "object",
                    properties: {
                      results: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            id: { type: "string" },
                            priority: { type: "string", enum: ["high", "medium", "low"] },
                            reason: { type: "string" },
                          },
                          required: ["id", "priority", "reason"],
                          additionalProperties: false,
                        },
                      },
                    },
                    required: ["results"],
                    additionalProperties: false,
                  }
                : {
                    type: "object",
                    properties: {
                      steps: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            title: { type: "string" },
                            description: { type: "string" },
                          },
                          required: ["title", "description"],
                          additionalProperties: false,
                        },
                      },
                    },
                    required: ["steps"],
                    additionalProperties: false,
                  },
            },
          },
        ],
        tool_choice: {
          type: "function",
          function: { name: action === "prioritize" ? "categorize_tasks" : "breakdown_task" },
        },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Credits exhausted, please add funds." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return new Response(JSON.stringify({ error: "No tool call in response" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = JSON.parse(toolCall.function.arguments);
    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-todo error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
