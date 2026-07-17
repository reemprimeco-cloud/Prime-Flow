"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

let browserClient: SupabaseClient<Database> | undefined;

/**
 * Anon-key Supabase client for the browser. Used exclusively to open
 * Realtime Broadcast channels — RLS grants no table access to this key,
 * so it can never read or write rows directly (see lib/realtime/channels.ts).
 */
export function getBrowserClient() {
  if (browserClient) return browserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables."
    );
  }

  browserClient = createClient<Database>(url, anonKey, {
    auth: { persistSession: false },
  });
  return browserClient;
}
