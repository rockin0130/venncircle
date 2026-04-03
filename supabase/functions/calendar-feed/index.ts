import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function escapeICS(text: string): string {
  return (text || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function formatICSDate(year: number, month: number, day: number, time?: string): string {
  // month is 0-indexed in the DB (matching JS Date), so add 1
  const m = String(month + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");

  if (time && time !== "" && time.toLowerCase() !== "all day") {
    // Parse time like "2:30 PM" or "14:00"
    const match = time.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (match) {
      let hours = parseInt(match[1]);
      const minutes = match[2];
      const ampm = match[3];
      if (ampm) {
        if (ampm.toUpperCase() === "PM" && hours !== 12) hours += 12;
        if (ampm.toUpperCase() === "AM" && hours === 12) hours = 0;
      }
      return `${year}${m}${d}T${String(hours).padStart(2, "0")}${minutes}00`;
    }
  }

  // All-day event
  return `${year}${m}${d}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");

    if (!token) {
      return new Response("Missing token", { status: 400 });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find user by calendar token
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, display_name")
      .eq("calendar_token", token.toUpperCase())
      .single();

    if (profileError || !profile) {
      return new Response("Invalid token", { status: 401 });
    }

    const userId = profile.id;

    // Fetch events and tasks
    const [eventsRes, tasksRes] = await Promise.all([
      supabase.from("events").select("*").eq("user_id", userId),
      supabase.from("tasks").select("*").eq("user_id", userId),
    ]);

    const events = eventsRes.data || [];
    const tasks = tasksRes.data || [];

    // Build ICS
    const lines: string[] = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//WC Planner//EN",
      `X-WR-CALNAME:${escapeICS(profile.display_name)}'s WC Planner`,
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
    ];

    for (const event of events) {
      const dtStart = formatICSDate(event.year, event.month, event.day, event.time);
      const isAllDay = !dtStart.includes("T");

      lines.push("BEGIN:VEVENT");
      lines.push(`UID:event-${event.id}@wcplanner`);
      if (isAllDay) {
        lines.push(`DTSTART;VALUE=DATE:${dtStart}`);
        // All-day events need next day as DTEND
        const nextDay = new Date(event.year, event.month, event.day + 1);
        const nd = `${nextDay.getFullYear()}${String(nextDay.getMonth() + 1).padStart(2, "0")}${String(nextDay.getDate()).padStart(2, "0")}`;
        lines.push(`DTEND;VALUE=DATE:${nd}`);
      } else {
        lines.push(`DTSTART:${dtStart}`);
        // Default 1 hour duration
        const startHour = parseInt(dtStart.slice(9, 11));
        const endHour = String(Math.min(startHour + 1, 23)).padStart(2, "0");
        lines.push(`DTEND:${dtStart.slice(0, 9)}${endHour}${dtStart.slice(11)}`);
      }
      lines.push(`SUMMARY:${escapeICS(event.title)}`);
      if (event.description) {
        lines.push(`DESCRIPTION:${escapeICS(event.description)}`);
      }
      lines.push("END:VEVENT");
    }

    for (const task of tasks) {
      if (task.scheduled_year == null || task.scheduled_month == null || task.scheduled_day == null) continue;

      const dtStart = formatICSDate(task.scheduled_year, task.scheduled_month, task.scheduled_day, task.time);
      const isAllDay = !dtStart.includes("T");

      lines.push("BEGIN:VEVENT");
      lines.push(`UID:task-${task.id}@wcplanner`);
      if (isAllDay) {
        lines.push(`DTSTART;VALUE=DATE:${dtStart}`);
        const nextDay = new Date(task.scheduled_year, task.scheduled_month, task.scheduled_day + 1);
        const nd = `${nextDay.getFullYear()}${String(nextDay.getMonth() + 1).padStart(2, "0")}${String(nextDay.getDate()).padStart(2, "0")}`;
        lines.push(`DTEND;VALUE=DATE:${nd}`);
      } else {
        lines.push(`DTSTART:${dtStart}`);
        const startHour = parseInt(dtStart.slice(9, 11));
        const endHour = String(Math.min(startHour + 1, 23)).padStart(2, "0");
        lines.push(`DTEND:${dtStart.slice(0, 9)}${endHour}${dtStart.slice(11)}`);
      }
      lines.push(`SUMMARY:${escapeICS(task.title)}${task.done ? " ✓" : ""}`);
      lines.push(`CATEGORIES:${escapeICS(task.tag)}`);
      lines.push("END:VEVENT");
    }

    lines.push("END:VCALENDAR");

    return new Response(lines.join("\r\n"), {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'attachment; filename="wcplanner.ics"',
      },
    });
  } catch (error) {
    console.error("Calendar feed error:", error);
    return new Response("Internal error", { status: 500 });
  }
});
