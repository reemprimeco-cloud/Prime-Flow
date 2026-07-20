/**
 * Prime Printing Co. operates out of Kuwait (UTC+3, no DST) — "today"
 * for anything day-boundary-sensitive (e.g. the dashboard board's
 * Delivered-today section) means the Kuwait calendar day, not whatever
 * timezone the server happens to run in. There's no general timezone
 * library in this app; a fixed +3:00 offset is enough since Kuwait never
 * observes daylight saving.
 */
const KUWAIT_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Start/end (as UTC Date instances) of the current Kuwait calendar day. */
export function getTodayBoundsInKuwait(now: Date = new Date()): { start: Date; end: Date } {
  const kuwaitNow = new Date(now.getTime() + KUWAIT_OFFSET_MS);
  const kuwaitDateStr = kuwaitNow.toISOString().slice(0, 10);
  const start = new Date(new Date(`${kuwaitDateStr}T00:00:00Z`).getTime() - KUWAIT_OFFSET_MS);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}
