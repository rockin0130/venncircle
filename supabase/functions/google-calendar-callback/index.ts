import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const decodeState = (state: string): { user_id: string } | null => {
  try {
    const normalized = state.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
};

function hexToHsl(hex: string): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16) / 255;
  const g = parseInt(h.substring(2, 4), 16) / 255;
  const b = parseInt(h.substring(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let hue = 0, sat = 0;
  const lit = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    sat = lit > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) hue = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) hue = ((b - r) / d + 2) / 6;
    else hue = ((r - g) / d + 4) / 6;
  }
  return `hsl(${Math.round(hue * 360)} ${Math.round(sat * 100)}% ${Math.round(lit * 100)}%)`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const oauthError = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const stateRaw = url.searchParams.get("state");

  if (oauthError) {
    console.error("Google OAuth returned error:", oauthError);
    return new Response(JSON.stringify({ type: "google_oauth_error", error: oauthError }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!code || !stateRaw) {
    return new Response("Missing code or state", { status: 400, headers: corsHeaders });
  }

  const state = decodeState(stateRaw);
  if (!state?.user_id) {
    return new Response("Invalid state", { status: 400, headers: corsHeaders });
  }

  const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
  const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response("Server misconfigured", { status: 500, headers: corsHeaders });
  }

  const redirectUri = `${SUPABASE_URL}/functions/v1/google-calendar-callback`;

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok) {
      console.error("Token exchange failed:", tokenData);
      return new Response(`Token exchange failed: ${tokenData.error_description || tokenData.error}`, {
        status: 400,
        headers: corsHeaders,
      });
    }

    const { access_token, refresh_token, expires_in } = tokenData;
    const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Account-level upsert: one token row per user
    const { data: existing } = await supabase
      .from("google_calendar_tokens")
      .select("refresh_token")
      .eq("user_id", state.user_id)
      .maybeSingle();

    const finalRefreshToken = refresh_token || existing?.refresh_token;
    if (!finalRefreshToken) {
      return new Response("Missing refresh token from Google", { status: 400, headers: corsHeaders });
    }

    const { error } = await supabase
      .from("google_calendar_tokens")
      .upsert(
        {
          user_id: state.user_id,
          group_id: null,
          access_token,
          refresh_token: finalRefreshToken,
          expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    if (error) {
      console.error("DB upsert error:", error);
      return new Response("Failed to store tokens", { status: 500, headers: corsHeaders });
    }

    // Auto-populate the user's Google calendars
    try {
      let accountEmail = state.user_id;
      try {
        const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
          headers: { Authorization: `Bearer ${access_token}` },
        });
        if (profileRes.ok) {
          const profile = await profileRes.json();
          accountEmail = profile.email || accountEmail;
        }
      } catch { /* non-critical */ }

      const calRes = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
        headers: { Authorization: `Bearer ${access_token}` },
      });

      if (calRes.ok) {
        const calData = await calRes.json();
        const items = calData.items || [];

        for (let idx = 0; idx < items.length; idx++) {
          const item = items[idx];
          const calName = item.summaryOverride || item.summary || item.id;
          const bgColor = item.backgroundColor || "#4285f4";
          const hslColor = hexToHsl(bgColor);

          const { data: existingCal } = await supabase
            .from("calendars")
            .select("id")
            .eq("user_id", state.user_id)
            .eq("provider", "google")
            .eq("provider_calendar_id", item.id)
            .maybeSingle();

          if (!existingCal) {
            await supabase.from("calendars").insert({
              user_id: state.user_id,
              group_id: null,
              name: calName,
              color: hslColor,
              provider: "google",
              provider_calendar_id: item.id,
              provider_account_id: accountEmail,
              is_visible: item.primary === true,
              is_default: false,
              sort_order: item.primary ? 0 : idx + 1,
            });
          }
        }
      }
    } catch (calListErr) {
      console.error("Failed to auto-populate Google calendars:", calListErr);
    }

    const appUrl = req.headers.get("origin") || "https://widecity.lovable.app";
    return new Response(null, {
      status: 302,
      headers: {
        ...corsHeaders,
        Location: `${appUrl}/?tab=settings&gcal=connected`,
      },
    });
  } catch (err) {
    console.error("Callback error:", err);
    return new Response("Internal error", { status: 500, headers: corsHeaders });
  }
});
