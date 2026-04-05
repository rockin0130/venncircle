import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { items } = await req.json();
    if (!Array.isArray(items) || items.length === 0) {
      return new Response(JSON.stringify({ error: "Items array required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const itemList = items.map((i: { id: string; name: string }) => `- ${i.name} (id: ${i.id})`).join("\n");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are a shopping list organizer. Given a list of items, you must:
1. Determine what type of list this is (grocery, clothing, electronics, general, etc.)
2. Choose two smart toggle labels: the LEFT label describes the original/ungrouped view, the RIGHT label describes your organized view. These should be contextually relevant — NOT hardcoded. Examples: grocery → "By meal" / "By aisle", clothing → "By outfit" / "By type", general → "Original" / "Organized".
3. Group items into logical categories relevant to the list type (e.g. Produce, Dairy, Bakery for groceries; or Tops, Bottoms, Accessories for clothing).
4. Merge duplicate or very similar items, combining quantities. Track which original IDs were merged.
Return the result using the organize_list tool.`,
          },
          {
            role: "user",
            content: `Organize these items:\n${itemList}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "organize_list",
              description: "Return organized shopping list with smart labels and grouped categories.",
              parameters: {
                type: "object",
                properties: {
                  toggle_labels: {
                    type: "array",
                    items: { type: "string" },
                    minItems: 2,
                    maxItems: 2,
                    description: "Two toggle option names: [original_view_label, organized_view_label]",
                  },
                  categories: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        label: { type: "string", description: "Category section name" },
                        items: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              name: { type: "string", description: "Display name for this item or merged group" },
                              quantity: { type: "number", description: "Number of items (>1 if merged)" },
                              merged: { type: "boolean", description: "True if this combines multiple similar items" },
                              original_ids: {
                                type: "array",
                                items: { type: "string" },
                                description: "IDs of original items this represents",
                              },
                            },
                            required: ["name", "quantity", "merged", "original_ids"],
                            additionalProperties: false,
                          },
                        },
                      },
                      required: ["label", "items"],
                      additionalProperties: false,
                    },
                  },
                  duplicates_merged: {
                    type: "number",
                    description: "Total number of duplicate items that were merged",
                  },
                },
                required: ["toggle_labels", "categories", "duplicates_merged"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "organize_list" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, try again shortly" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Credits exhausted" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in response");

    const result = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("organize error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
