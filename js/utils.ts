/**
 * @fileoverview Validation, sanitization, and date helpers.
 */

/**
 * Validates that a URL points to an allowed Clockify API host over HTTPS.
 * Prevents SSRF by rejecting requests to attacker-controlled URLs.
 */
export function isAllowedClockifyUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol !== 'https:') return false;
    return hostname === 'api.clockify.me' ||
      hostname === 'global.api.clockify.me' ||
      hostname.endsWith('.clockify.me');
  } catch {
    return false;
  }
}

/**
 * Escapes HTML special characters to prevent XSS.
 */
export function escapeHtml(str: string | null | undefined): string {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Formats minutes as "Xh Ym" display string.
 */
export function formatMinutes(minutes: number): string {
  if (minutes <= 0) return '0m';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * Returns ISO date string (YYYY-MM-DD) from a Date.
 */
export function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Generates an array of date strings for the week containing the given date.
 * Week starts on Monday.
 */
export function getWeekDates(referenceDate: Date): string[] {
  const d = new Date(referenceDate);
  const day = d.getDay();
  // Adjust to Monday (day 0 = Sunday -> offset 6, day 1 = Monday -> offset 0, etc.)
  const mondayOffset = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + mondayOffset);

  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    dates.push(toDateKey(d));
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

/**
 * Gets the short day name (Mon, Tue, ...) from a date string.
 */
export function getDayName(dateStr: string): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const d = new Date(dateStr + 'T00:00:00');
  return days[d.getDay()];
}

/**
 * Returns the ISO 8601 week number for a given date.
 * ISO weeks start on Monday and week 1 contains the year's first Thursday.
 */
export function getIsoWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  // Set to nearest Thursday: current date + 4 - current day number (Monday=1, Sunday=7)
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  // Get first day of year
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  // Calculate full weeks to nearest Thursday
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
