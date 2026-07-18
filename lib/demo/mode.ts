/**
 * Development-only demo mode: bypasses auth and serves static demo data
 * instead of querying Supabase. Used to visually verify the app in
 * environments where the app server can't reach the Supabase project
 * directly (see README). Never enable in production — writes are disabled
 * and no request is authenticated when this is on.
 */
export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "true";
}

/**
 * Client-side counterpart of `isDemoMode()`. Server env vars aren't visible
 * to the browser, so this reads the separate `NEXT_PUBLIC_DEMO_MODE` — kept
 * in sync with `DEMO_MODE` by convention (see .env.local.example). Used
 * solely to stop `useRealtimeChannel` from opening real Supabase Realtime
 * websocket connections in demo mode, where nothing ever broadcasts (writes
 * are disabled) and, in sandboxed/offline demo deployments, the connection
 * would just fail and retry forever.
 */
export function isDemoModeClient(): boolean {
  return process.env.NEXT_PUBLIC_DEMO_MODE === "true";
}
