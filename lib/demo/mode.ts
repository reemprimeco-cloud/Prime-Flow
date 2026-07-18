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
