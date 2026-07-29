import "server-only";

import twilio from "twilio";

import type { NotificationProvider, NotificationPayload, NotificationResult } from "@/lib/notifications/service";

/**
 * The only file in this project that touches Twilio credentials or the
 * `twilio` package. Credentials are read from `process.env` here and
 * nowhere else — this file has no client-facing counterpart and is only
 * ever reached through `lib/notifications/service.ts`, itself only called
 * from Server Actions.
 *
 * Stub-safe by design, same as every other environment-dependent piece of
 * this project: with no credentials configured, `send()` returns
 * `{ status: "skipped" }` instead of throwing, so the rest of the
 * notification pipeline (logging, audit trail) keeps working end-to-end
 * whether or not Twilio is actually wired up for a given deployment.
 */
export class TwilioWhatsAppProvider implements NotificationProvider {
  readonly channel = "whatsapp" as const;

  async send(payload: NotificationPayload): Promise<NotificationResult> {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_WHATSAPP_NUMBER;
    const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

    // A Messaging Service (its Sender Pool holds the actual WhatsApp
    // number) is preferred when configured — Twilio picks the sender and
    // handles scaling/failover, so `from` is omitted entirely in that case
    // per Twilio's own guidance. Falls back to a single direct number for
    // setups that haven't moved to a Messaging Service.
    if (!accountSid || !authToken || (!messagingServiceSid && !fromNumber)) {
      return { status: "skipped", error: "Twilio credentials not configured" };
    }

    try {
      const client = twilio(accountSid, authToken);
      // Set to receive delivered/read/failed updates asynchronously at
      // app/api/twilio/whatsapp/status — see docs/NOTIFICATIONS.md. Left
      // unset (no statusCallback param sent) if not configured, same
      // stub-safe pattern as the credentials above: the message still
      // sends, it just won't get delivery-status updates after acceptance.
      // Redundant (and harmless) if the Messaging Service already has its
      // own Status Callback URL set in the Twilio console.
      const statusCallback = process.env.TWILIO_STATUS_CALLBACK_URL || undefined;
      const message = await client.messages.create({
        ...(messagingServiceSid
          ? { messagingServiceSid }
          : { from: toWhatsAppAddress(fromNumber!) }),
        to: toWhatsAppAddress(payload.phone),
        body: payload.body,
        ...(statusCallback ? { statusCallback } : {}),
      });

      // Twilio accepts the message for delivery here; final delivery status
      // (delivered/read/failed) arrives later via the status-callback
      // webhook above, which updates this same row by providerMessageId.
      const status = message.status === "failed" || message.status === "undelivered" ? "failed" : "sent";

      return {
        status,
        providerResponse: { sid: message.sid, status: message.status, errorCode: message.errorCode },
        providerMessageId: message.sid,
      };
    } catch (error) {
      const twilioError = error as { message?: string; code?: number; moreInfo?: string };
      return {
        status: "failed",
        error: twilioError.message ?? "Twilio send failed",
        providerResponse: { code: twilioError.code ?? null, moreInfo: twilioError.moreInfo ?? null },
      };
    }
  }
}

function toWhatsAppAddress(rawNumber: string): string {
  return rawNumber.startsWith("whatsapp:") ? rawNumber : `whatsapp:${rawNumber}`;
}
