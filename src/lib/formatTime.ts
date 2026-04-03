/** Convert "HH:MM" (24h) or already-formatted time to 12h AM/PM display */
export function formatTime(time: string): string {
  if (!time || time === "All day") return time;
  const match = time.match(/^(\d{1,2}):(\d{2})$/);
  if (match) {
    let h = parseInt(match[1]);
    const m = match[2];
    const ampm = h >= 12 ? "PM" : "AM";
    if (h > 12) h -= 12;
    if (h === 0) h = 12;
    return `${h}:${m} ${ampm}`;
  }
  return time;
}
