import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function refreshAccessToken(refreshToken: string) {
  const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
  const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    console.error("Token refresh failed:", await res.text());
    return null;
  }
  return await res.json();
}

function hexToHsl(hex: string): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16) / 255;
  const g = parseInt(h.substring(2, 4), 16) / 255;
  const b = parseInt(h.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let hue = 0;
  let sat = 0;
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

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return jsonResponse({ error: "Not authenticated" }, 401);
    }

    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return jsonResponse({ error: "Not authenticated" }, 401);
    }

    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      console.error("getClaims error:", claimsError);
      return jsonResponse({ error: "Invalid token" }, 401);
    }

    const userId = claimsData.claims.sub as string;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Account-level: get the user's single Google token
    const { data: tokenRow, error: tokenErr } = await supabase
      .from("google_calendar_tokens")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (tokenErr || !tokenRow) {
      return jsonResponse({ error: "No Google account connected" }, 404);
    }

    let accessToken = tokenRow.access_token;

    // Refresh if expired
    if (new Date(tokenRow.expires_at) <= new Date()) {
      const refreshed = await refreshAccessToken(tokenRow.refresh_token);
      if (!refreshed) {
        return jsonResponse({ error: "Failed to refresh Google token" }, 401);
      }
      accessToken = refreshed.access_token;
      const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
      await supabase
        .from("google_calendar_tokens")
        .update({ access_token: accessToken, expires_at: newExpiry, updated_at: new Date().toISOString() })
        .eq("id", tokenRow.id);
    }

    // Fetch Google user info for account email
    let accountEmail = tokenRow.user_id;
    try {
      const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (profileRes.ok) {
        const profile = await profileRes.json();
        accountEmail = profile.email || accountEmail;
      }
    } catch {
      // non-critical
    }

    // Fetch calendar list from Google
    const calRes = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!calRes.ok) {
      console.error("Google Calendar list API error:", await calRes.text());
      return jsonResponse({ error: "Failed to fetch Google calendars" }, 502);
    }

    const calData = await calRes.json();
    const googleCalendars = (calData.items || []).map((item: any, idx: number) => ({
      googleId: item.id,
      name: item.summaryOverride || item.summary || item.id,
      color: item.backgroundColor ? hexToHsl(item.backgroundColor) : "hsl(210 100% 50%)",
      primary: item.primary === true,
      accessRole: item.accessRole,
      sortOrder: item.primary ? 0 : idx + 1,
    }));

    // Upsert into calendars table (account-level, no group_id)
    for (const gcal of googleCalendars) {
      const { data: existing } = await supabase
        .from("calendars")
        .select("id")
        .eq("user_id", userId)
        .eq("provider", "google")
        .eq("provider_calendar_id", gcal.googleId)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("calendars")
          .update({
            name: gcal.name,
            provider_account_id: accountEmail,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
      } else {
        await supabase.from("calendars").insert({
          user_id: userId,
          group_id: null,
          name: gcal.name,
          color: gcal.color,
          provider: "google",
          provider_calendar_id: gcal.googleId,
          provider_account_id: accountEmail,
          is_visible: gcal.primary,
          is_default: false,
          sort_order: gcal.sortOrder,
        });
      }
    }

    // Fetch updated calendars from DB to return
    const { data: dbCalendars } = await supabase
      .from("calendars")
      .select("*")
      .eq("user_id", userId)
      .eq("provider", "google")
      .order("sort_order", { ascending: true });

    return jsonResponse({ calendars: dbCalendars || [], account: accountEmail });
  } catch (error) {
    console.error("google-calendar-list error:", error);
    return jsonResponse({ error: "Failed to list calendars" }, 500);
  }
});
