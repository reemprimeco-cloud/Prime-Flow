/**
 * Netlify Scheduled Function: keeps the Next.js server function warm.
 *
 * Every Server Action, page render and login runs in that one function.
 * After a few idle minutes Netlify unloads it, and the next request pays a
 * cold start — the production logs showed 6-14s logins and employee taps
 * after quiet spells, against ~0.5s when warm. Calling a no-op route
 * (app/api/ping) on a schedule keeps an instance loaded.
 */
export default async function keepWarm(): Promise<void> {
  const base = process.env.URL ?? "https://flow.primekw.net";
  try {
    await fetch(`${base}/api/ping`, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
  } catch (error) {
    console.warn("[keep-warm] ping failed:", error);
  }
}

export const config = { schedule: "*/5 * * * *" };
