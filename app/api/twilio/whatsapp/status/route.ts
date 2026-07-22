import { NextResponse } from "next/server";
import twilio from "twilio";

import { createServiceClient } from "@/lib/supabase/server";
import { broadcast, CHANNELS } from "@/lib/realtime/channels";
import type { Database } from "@/types/database.types";

/**
 * Twilio WhatsApp status-callback webhook — the counterpart to the send
 * path in lib/notifications/providers/twilio-whatsapp.ts. Twilio posts
 * here every time a message we sent changes state (queued -> accepted ->
 * sent -> delivered -> read, or failed/undelivered), identified by the
 * MessageSid captured on that row's `provider_message_id` at send time.
 *
 * Runs on the Node.js runtime (the default for Route Handlers, pinned
 * explicitly here) because signature verification needs Node's `crypto`
 * module — Twilio's SDK isn't Edge-compatible. `@netlify/plugin-nextjs`
 * deploys this as a regular Netlify Function.
 *
 * Configure in the Twilio console (Messaging Service or WhatsApp Sender
 * -> Status Callback URL):
 *   https://primeflowboard.netlify.app/api/twilio/whatsapp/status
 * (matches TWILIO_STATUS_CALLBACK_URL below, which is also what
 * twilio-whatsapp.ts sets per-message — keep both in sync if the domain
 * ever changes.)
 */
export const runtime = "nodejs";

type NotificationStatus = Database["public"]["Enums"]["notification_status"];

const RECOGNIZED_STATUSES: ReadonlySet<string> = new Set<NotificationStatus>([
  "queued",
  "accepted",
  "sent",
  "delivered",
  "read",
  "failed",
  "undelivered",
]);

/**
 * The exact URL Twilio signs the request against. An explicit env var is
 * the reliable option in production — proxy layers can normalize the
 * scheme/host Next.js sees (`request.url`) in ways that don't byte-for-byte
 * match what Twilio actually posted to, which silently breaks signature
 * validation. Falls back to `request.url` for local/dev use where that
 * mismatch doesn't happen (e.g. an ngrok tunnel hit directly).
 */
function resolveCallbackUrl(request: Request): string {
  return process.env.TWILIO_STATUS_CALLBACK_URL || request.url;
}

export async function POST(request: Request) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const signature = request.headers.get("x-twilio-signature");
  const rawBody = await request.text();
  const params = Object.fromEntries(new URLSearchParams(rawBody));

  // Signature verification is the actual security boundary here — reject
  // outright rather than "return 200 and log", since a request that fails
  // this check isn't a Twilio payload quirk, it's not from Twilio at all.
  if (!authToken) {
    console.error("[twilio-status] TWILIO_AUTH_TOKEN not configured — rejecting webhook");
    return NextResponse.json({ error: "Not configured" }, { status: 403 });
  }
  if (!signature || !twilio.validateRequest(authToken, signature, resolveCallbackUrl(request), params)) {
    console.error("[twilio-status] request failed Twilio signature verification");
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  // From here on: a genuine, verified Twilio request. Every other problem
  // (missing fields, an unrecognized status, no matching row) is logged
  // and still answered with 200 — Twilio retries a webhook that doesn't
  // acknowledge with 2xx, and none of these cases get better on retry.
  const messageSid = params.MessageSid;
  const messageStatus = params.MessageStatus;
  const errorCode = params.ErrorCode || null;
  const errorMessage = params.ErrorMessage || null;
  const to = params.To || null;
  const from = params.From || null;

  if (!messageSid || !messageStatus) {
    console.warn("[twilio-status] payload missing MessageSid/MessageStatus", params);
    return NextResponse.json({ received: true });
  }

  if (!RECOGNIZED_STATUSES.has(messageStatus)) {
    console.warn(`[twilio-status] unrecognized MessageStatus "${messageStatus}" for ${messageSid}`, params);
    return NextResponse.json({ received: true });
  }

  const status = messageStatus as NotificationStatus;
  const now = new Date().toISOString();

  const update: Database["public"]["Tables"]["notification_logs"]["Update"] = {
    status,
    provider_response: { messageSid, messageStatus, errorCode, errorMessage, to, from },
  };
  if (status === "delivered") update.delivered_at = now;
  if (status === "read") update.read_at = now;
  if (status === "failed" || status === "undelivered") {
    update.failed_reason = errorMessage ?? (errorCode ? `Twilio error ${errorCode}` : "Delivery failed");
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("notification_logs")
    .update(update)
    .eq("provider_message_id", messageSid)
    .select("id, order_id");

  if (error) {
    console.error(`[twilio-status] failed to update notification_logs for ${messageSid}`, error);
    return NextResponse.json({ received: true });
  }
  if (!data || data.length === 0) {
    // Expected for sends made before TWILIO_STATUS_CALLBACK_URL was set (no
    // provider_message_id on file), or a stray/test callback — not an error.
    console.warn(`[twilio-status] no notification_logs row found for MessageSid ${messageSid}`);
    return NextResponse.json({ received: true });
  }

  await broadcast(CHANNELS.notifications, "notification.status_updated", { messageSid, status });

  return NextResponse.json({ received: true });
}
