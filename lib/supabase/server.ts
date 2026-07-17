import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

/**
 * Service-role Supabase client. Bypasses RLS entirely — this is intentional:
 * auth is custom (see lib/auth), so every DB access is gated by our own
 * session/role checks before this client is ever touched, never by RLS.
 * Never import this file from a Client Component.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables."
    );
  }

  return createClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
