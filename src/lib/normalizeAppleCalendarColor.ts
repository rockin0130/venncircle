/** Normalize plugin color strings for CSS (hex / rgb). */
export function normalizeAppleCalendarColor(color: string | null | undefined): string {
  if (!color || !color.trim()) return "hsl(210 100% 50%)";
  const c = color.trim();
  if (c.startsWith("#") || c.startsWith("rgb") || c.startsWith("hsl")) return c;
  if (/^[0-9a-fA-F]{6}$/.test(c)) return `#${c}`;
  return c;
}
