"use server";

import { requireAdmin } from "@/lib/auth/guards";
import { createServiceClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/demo/mode";
import { getDemoDiagnostics } from "@/lib/demo/data";

export interface DiagnosticsSnapshot {
  databaseConnected: boolean;
  supabaseLatencyMs: number | null;
  notificationQueuePending: number;
  notificationQueueFailed: number;
  twilioConfigured: boolean;
  activeUsersApprox: number;
  timestamp: string;
}

/**
 * A best-effort snapshot, not a full monitoring system: "Active Users" has
 * no session-tracking table to query (sessions are stateless JWT cookies),
 * so it's approximated as distinct actors in audit_logs over the last 15
 * minutes — someone who did something recently, not someone with an open
 * tab. See docs/OPERATIONS.md.
 */
export async function getDiagnosticsSnapshot(): Promise<DiagnosticsSnapshot> {
  await requireAdmin();
  if (isDemoMode()) return getDemoDiagnostics();
  const supabase = createServiceClient();

  const pingStart = Date.now();
  const { error: pingError } = await supabase.from("employees").select("id").limit(1);
  const supabaseLatencyMs = Date.now() - pingStart;

  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60_000).toISOString();

  const [{ count: pendingCount }, { count: failedCount }, { data: recentActors }] = await Promise.all([
    supabase.from("notification_logs").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("notification_logs").select("id", { count: "exact", head: true }).eq("status", "failed"),
    supabase.from("audit_logs").select("actor_id").gte("created_at", fifteenMinutesAgo).not("actor_id", "is", null),
  ]);

  const activeUsersApprox = new Set((recentActors ?? []).map((r) => r.actor_id)).size;

  return {
    databaseConnected: !pingError,
    supabaseLatencyMs: pingError ? null : supabaseLatencyMs,
    notificationQueuePending: pendingCount ?? 0,
    notificationQueueFailed: failedCount ?? 0,
    twilioConfigured: Boolean(
      process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_NUMBER
    ),
    activeUsersApprox,
    timestamp: new Date().toISOString(),
  };
}
