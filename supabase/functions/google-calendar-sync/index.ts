import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type Assignee = "me" | "partner" | "both";

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const isDefinitelyInvalidTokenError = (message?: string) => {
  if (!message) return false;
  return /invalid|jwt|expired|signature|malformed|session[\s._-]*not[\s._-]*found|auth[\s._-]*session[\s._-]*missing|refresh[\s._-]*token[\s._-]*not[\s._-]*found|not[\s._-]*found|forbidden|unauthorized/i.test(message);
};

const isRetriableAuthError = (message?: string, status?: number) => {
  if (status && status >= 500) return true;
  if (!message) return false;
  return /timeout|temporar|network|fetch|connection|econn|rate limit|try again/i.test(message);
};

async function resolveUserId(
  supabaseUrl: string,
  anonKey: string,
  authHeader: string,
  token: string,
): Promise<{ userId?: string; status?: number; error?: string }> {
  const supabaseAuth = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  try {
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    const sub = claimsData?.claims?.sub;
    if (typeof sub === "string" && sub.length > 0) {
      return { userId: sub };
    }

    const claimsMessage = claimsError?.message ?? "";
    const claimsStatus = (claimsError as { status?: number } | null)?.status;

    if (
      isDefinitelyInvalidTokenError(claimsMessage) ||
      claimsStatus === 400 ||
      claimsStatus === 401 ||
      claimsStatus === 403
    ) {
      return { status: 401, error: "Invalid token" };
    }
  } catch {
    // Fall back to getUser with retry below.
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const {
        data: { user },
        error,
      } = await supabaseAuth.auth.getUser(token);

      if (user?.id) {
        return { userId: user.id };
      }

      const message = error?.message ?? "";
      const status = (error as { status?: number } | null)?.status;

      const retriable = isRetriableAuthError(message, status);

      if (!retriable) {
        return { status: 401, error: "Invalid token" };
      }

      if (attempt === 1) {
        return { status: 503, error: "Authentication temporarily unavailable" };
      }

      await wait(150 * (attempt + 1));
    } catch {
      if (attempt === 1) {
        return { status: 503, error: "Authentication temporarily unavailable" };
      }
      await wait(150 * (attempt + 1));
    }
  }

  return { status: 503, error: "Authentication temporarily unavailable" };
}

async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number } | null> {
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

function toViewerPerspective(assignee: Assignee, isOwnerView: boolean): Assignee {
  if (isOwnerView) return assignee;
  if (assignee === "me") return "partner";
  if (assignee === "partner") return "me";
  return "both";
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

    const authResult = await resolveUserId(SUPABASE_URL, SUPABASE_ANON_KEY, authHeader, token);
    if (!authResult.userId) {
      return jsonResponse({ error: authResult.error ?? "Invalid token" }, authResult.status ?? 401);
    }

    const userId = authResult.userId;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const url = new URL(req.url);
    const timeMin = url.searchParams.get("timeMin") || new Date().toISOString();
    const timeMax = url.searchParams.get("timeMax") || new Date(Date.now() + 30 * 86400000).toISOString();

    // Account-level: get the user's single Google token
    const { data: tokenRow } = await supabase
      .from("google_calendar_tokens")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (!tokenRow) {
      return jsonResponse({ events: [] });
    }

    let accessToken = tokenRow.access_token;

    if (new Date(tokenRow.expires_at) <= new Date()) {
      const refreshed = await refreshAccessToken(tokenRow.refresh_token);
      if (!refreshed) return jsonResponse({ events: [] });

      accessToken = refreshed.access_token;
      const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();

      await supabase
        .from("google_calendar_tokens")
        .update({ access_token: accessToken, expires_at: newExpiry, updated_at: new Date().toISOString() })
        .eq("id", tokenRow.id);
    }

    const { data: hiddenRows } = await supabase
      .from("hidden_gcal_events")
      .select("gcal_event_id")
      .eq("user_id", userId);
    const hiddenEventIds = new Set((hiddenRows || []).map((r: any) => r.gcal_event_id));

    // Get ALL Google calendars for this user from DB (visibility is handled client-side per context)
    const { data: allGoogleCalendars } = await supabase
      .from("calendars")
      .select("provider_calendar_id, color")
      .eq("user_id", userId)
      .eq("provider", "google");

    const calendarIds = allGoogleCalendars && allGoogleCalendars.length > 0
      ? allGoogleCalendars.map((c: any) => c.provider_calendar_id).filter(Boolean)
      : ["primary"];

    const calendarColorMap = new Map<string, string>();
    if (allGoogleCalendars) {
      allGoogleCalendars.forEach((c: any) => {
        if (c.provider_calendar_id) calendarColorMap.set(c.provider_calendar_id, c.color);
      });
    }

    const allEvents: any[] = [];
    const seenEventIds = new Set<string>();

    for (const calendarId of calendarIds) {
      try {
        const calRes = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?` +
            new URLSearchParams({
              timeMin,
              timeMax,
              singleEvents: "true",
              orderBy: "startTime",
              maxResults: "250",
            }),
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          }
        );

        if (!calRes.ok) {
          console.error("Google Calendar API error for calendar", calendarId, ":", await calRes.text());
          continue;
        }

        const calData = await calRes.json();
        const calColor = calendarColorMap.get(calendarId) || null;

        for (const item of (calData.items || [])) {
          if (seenEventIds.has(item.id)) continue;
          seenEventIds.add(item.id);
          if (hiddenEventIds.has(item.id)) continue;

          allEvents.push({
            id: item.id,
            title: item.summary || "(No title)",
            description: item.description || null,
            start: item.start?.dateTime || item.start?.date,
            end: item.end?.dateTime || item.end?.date,
            allDay: !item.start?.dateTime,
            location: item.location || null,
            htmlLink: item.htmlLink,
            ownerUserId: userId,
            calendarId: calendarId,
            calendarColor: calColor,
          });
        }
      } catch (calErr) {
        console.error("Error fetching calendar", calendarId, ":", calErr);
      }
    }

    const eventIds = [...new Set(allEvents.map((e: any) => e.id).filter(Boolean))];

    const designationMap = new Map<string, Assignee>();
    if (eventIds.length > 0) {
      const { data: designationRows } = await supabase
        .from("gcal_event_designations")
        .select("user_id, gcal_event_id, assignee")
        .eq("user_id", userId)
        .in("gcal_event_id", eventIds);

      (designationRows || []).forEach((row: any) => {
        designationMap.set(`${row.user_id}:${row.gcal_event_id}`, row.assignee as Assignee);
      });
    }

    const events = allEvents.map((event: any) => {
      const key = `${event.ownerUserId}:${event.id}`;
      const ownerAssignee = designationMap.get(key);
      const assignee = ownerAssignee || "me";
      return { ...event, assignee };
    });

    return jsonResponse({ events });
  } catch (error) {
    console.error("google-calendar-sync runtime error:", error);
    return jsonResponse({ error: "Sync failed" }, 500);
  }
});
