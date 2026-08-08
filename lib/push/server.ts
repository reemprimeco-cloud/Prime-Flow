import "server-only";

import webpush from "web-push";

import { createServiceClient } from "@/lib/supabase/server";

/**
 * Web Push delivery to staff devices — the counterpart to the WhatsApp
 * provider in lib/notifications/providers. Unlike WhatsApp, push has no
 * 24-hour customer-service window and no Meta-approved templates: once a
 * device is subscribed, a notification reaches its lock screen at any
 * time. That's the whole reason this exists alongside WhatsApp rather
 * than replacing it — WhatsApp still reaches people who haven't installed
 * the board, push reaches the ones who have, reliably.
 *
 * Stub-safe like every other environment-dependent piece here: with no
 * VAPID keys configured `sendPushToEmployees` is a no-op, so the rest of
 * the notification pipeline is unaffected.
 */

export interface PushMessage {
  title: string;
  body: string;
  /** Where tapping the notification lands — a dashboard path. */
  url?: string;
  /**
   * Collapses older notifications about the same subject: a second update
   * on one order replaces the first on the lock screen instead of stacking.
   */
  tag?: string;
}

function configured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

function configure(): void {
  webpush.setVapidDetails(
    // Mailto identifies the sender to the push service so it can reach the
    // operator about problems — required by the VAPID spec.
    process.env.VAPID_SUBJECT || "mailto:reemprimeco@gmail.com",
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
}

/**
 * Fans a notification out to every device the given employees have
 * enabled. Never throws — a push that fails should no more break an order
 * status change than a failed WhatsApp send does.
 *
 * Subscriptions the push service reports as gone (404/410 — app deleted,
 * notifications revoked) are deleted rather than retried forever; that's
 * the documented way to prune, since there's no other signal a device has
 * dropped off.
 */
export async function sendPushToEmployees(employeeIds: string[], message: PushMessage): Promise<void> {
  if (!configured() || employeeIds.length === 0) return;

  const supabase = createServiceClient();
  const { data: subscriptions, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("employee_id", employeeIds);

  if (error) {
    console.error("[push] failed to load subscriptions", error);
    return;
  }
  if (!subscriptions || subscriptions.length === 0) return;

  configure();

  const payload = JSON.stringify(message);
  const staleIds: string[] = [];

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          staleIds.push(sub.id);
        } else {
          console.error(`[push] send failed for subscription ${sub.id}`, err);
        }
      }
    })
  );

  if (staleIds.length > 0) {
    await supabase.from("push_subscriptions").delete().in("id", staleIds);
  }
}

/** Every active admin — used for shop-floor events the manager should see. */
export async function sendPushToAdmins(message: PushMessage): Promise<void> {
  if (!configured()) return;
  const supabase = createServiceClient();
  const { data: admins } = await supabase.from("employees").select("id").eq("role", "admin").eq("active", true);
  await sendPushToEmployees((admins ?? []).map((a) => a.id), message);
}
