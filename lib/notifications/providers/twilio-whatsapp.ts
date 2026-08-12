import "server-only";

import twilio from "twilio";

import type { NotificationProvider, NotificationPayload, NotificationResult } from "@/lib/notifications/service";
import type { TemplateName, TemplateVariables } from "@/lib/notifications/templates";

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

interface ContentTemplateConfig {
  /** Env var holding this template's approved Content SID (HX...) once Meta approves it — see docs/NOTIFICATIONS.md. */
  envVar: string;
  /** Maps our named TemplateVariables onto the numbered {{1}}, {{2}}... placeholders Meta approved the wording with. */
  buildVariables: (vars: TemplateVariables) => Record<string, string>;
}

/**
 * Templates registered as approved (or pending-approval) WhatsApp Message
 * Templates in Twilio's Content Editor. A Content SID here bypasses
 * WhatsApp's 24h customer-service window entirely — the reason these exist
 * at all. Only a subset of TemplateName has one; anything not listed here
 * always sends as freeform text via `body`.
 */
const CONTENT_TEMPLATES: Partial<Record<TemplateName, ContentTemplateConfig>> = {
  job_assigned: {
    envVar: "TWILIO_TEMPLATE_JOB_ASSIGNED_SID",
    buildVariables: (v) => ({ "1": v.orderNumber, "2": v.productName ?? "", "3": v.deliveryDate ?? "", "4": v.deliveryTime ?? "" }),
  },
  order_in_production: {
    envVar: "TWILIO_TEMPLATE_ORDER_IN_PRODUCTION_SID",
    buildVariables: (v) => ({ "1": v.orderNumber, "2": v.productName ?? "" }),
  },
  order_ready_for_pickup: {
    envVar: "TWILIO_TEMPLATE_ORDER_READY_FOR_PICKUP_SID",
    buildVariables: (v) => ({ "1": v.orderNumber, "2": v.productName ?? "" }),
  },
  order_out_for_delivery: {
    envVar: "TWILIO_TEMPLATE_ORDER_OUT_FOR_DELIVERY_SID",
    buildVariables: (v) => ({ "1": v.orderNumber, "2": v.productName ?? "", "3": v.deliveryDate ?? "", "4": v.deliveryTime ?? "" }),
  },
  admin_order_status_changed: {
    envVar: "TWILIO_TEMPLATE_ADMIN_ORDER_STATUS_CHANGED_SID",
    // Four slots, matching prime_admin_tap_notify3. This mapping and the
    // Content SID have to change in the same deploy: Twilio matches
    // variables by position, so a count mismatch renders wrong values
    // rather than erroring — an earlier mismatch produced a real alert
    // reading 'moved order #1007 to status "Devon"' (the customer's name
    // in the status slot). See docs/NOTIFICATIONS.md.
    buildVariables: (v) => ({
      "1": v.employeeName ?? "",
      "2": v.orderNumber,
      "3": v.customerName ?? "",
      "4": v.statusLabel ?? "",
    }),
  },
};

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

      // Prefer an approved Content Template over freeform body whenever one's
      // configured for this templateName and we have the render variables to
      // fill it (resends of log rows from before templateVariables existed
      // won't have them, so those fall back to freeform). Sending with
      // contentSid instead of body is what actually bypasses the 24h window —
      // Twilio rejects the attempt with an error (caught below) if Meta
      // hasn't approved it yet, same as any other Twilio API error.
      const contentConfig = CONTENT_TEMPLATES[payload.templateName];
      const contentSid = contentConfig ? process.env[contentConfig.envVar] : undefined;
      const useContentTemplate = Boolean(contentSid && payload.templateVariables);

      const message = await client.messages.create({
        ...(messagingServiceSid
          ? { messagingServiceSid }
          : { from: toWhatsAppAddress(fromNumber!) }),
        to: toWhatsAppAddress(payload.phone),
        ...(useContentTemplate
          ? { contentSid, contentVariables: JSON.stringify(contentConfig!.buildVariables(payload.templateVariables!)) }
          : { body: payload.body }),
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
