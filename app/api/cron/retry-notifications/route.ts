import { NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/server";
import { resendNotification } from "@/lib/notifications/service";

/**
 * Automatic retry sweep for failed WhatsApp notifications, with exponential
 * backoff (2^retry_count minutes, capped at 24h) — see docs/NOTIFICATIONS.md.
 * Every retry attempt (successful or not) is recorded on the same
 * notification_logs row via resendNotification(): retry_count increments,
 * status/error/provider_response update, last_attempted_at advances.
 *
 * Intended to be invoked on a schedule (e.g. Vercel Cron, hourly) rather
 * than by a human — protected by CRON_SECRET, not employee auth.
 */

const MAX_RETRIES = 5;
const MAX_BACKOFF_MINUTES = 24 * 60;

function isEligibleForRetry(retryCount: number, lastAttemptedAt: string, now: Date): boolean {
  if (retryCount >= MAX_RETRIES) return false;
  const backoffMinutes = Math.min(2 ** retryCount, MAX_BACKOFF_MINUTES);
  const eligibleAt = new Date(lastAttemptedAt).getTime() + backoffMinutes * 60_000;
  return now.getTime() >= eligibleAt;
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data: failedLogs, error } = await supabase
    .from("notification_logs")
    .select("id, retry_count, last_attempted_at")
    .eq("status", "failed")
    .lt("retry_count", MAX_RETRIES);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const now = new Date();
  const eligible = (failedLogs ?? []).filter((log) => isEligibleForRetry(log.retry_count, log.last_attempted_at, now));

  // "processed" = the retry attempt ran and updated the log row (status
  // there reflects whether the resend actually succeeded); "errored" means
  // the retry itself couldn't even be attempted (e.g. DB error).
  let processed = 0;
  let errored = 0;
  for (const log of eligible) {
    try {
      await resendNotification(log.id, null, "System (auto-retry)");
      processed++;
    } catch (retryError) {
      errored++;
      console.error(`[retry-notifications] failed to retry ${log.id}`, retryError);
    }
  }

  return NextResponse.json({
    scanned: failedLogs?.length ?? 0,
    attempted: eligible.length,
    processed,
    errored,
  });
}
