import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { exerciseName } = await req.json();
    if (!exerciseName) throw new Error("exerciseName is required");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const headers = {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    };

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are a certified personal trainer and YouTube fitness expert. Given an exercise name, provide detailed guidance AND a real YouTube video search query. Return data using the provided tool.`,
          },
          { role: "user", content: `Tell me how to do: ${exerciseName}` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "exercise_detail",
              description: "Return detailed exercise guidance with video search query",
              parameters: {
                type: "object",
                properties: {
                  steps: {
                    type: "array",
                    items: { type: "string" },
                    description: "Step-by-step instructions (4-6 steps)",
                  },
                  formCues: {
                    type: "array",
                    items: { type: "string" },
                    description: "3-4 key form cues to remember",
                  },
                  commonMistakes: {
                    type: "array",
                    items: { type: "string" },
                    description: "3-4 common mistakes to avoid",
                  },
                  musclesWorked: {
                    type: "array",
                    items: { type: "string" },
                    description: "Primary and secondary muscles worked",
                  },
                  videoSearchQuery: {
                    type: "string",
                    description: "A YouTube search query to find the best tutorial for this exercise, e.g. 'how to barbell bench press proper form'",
                  },
                },
                required: ["steps", "formCues", "commonMistakes", "musclesWorked", "videoSearchQuery"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "exercise_detail" } },
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
    let parsed;

    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      try { parsed = JSON.parse(toolCall.function.arguments); } catch (e) { console.error("Tool call parse failed:", e); }
    }

    if (!parsed) {
      const content = data.choices?.[0]?.message?.content || "";
      let cleaned = content.trim();
      if (cleaned.startsWith("```")) {
        cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
      }
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try { parsed = JSON.parse(jsonMatch[0]); } catch (e) { console.error("Content parse failed:", e); }
      }
    }

    if (!parsed) throw new Error("Could not extract exercise details from AI response");

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("exercise-detail error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
