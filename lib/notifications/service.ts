import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/demo/mode";
import { recordAuditLog } from "@/lib/audit/log";
import type { NotificationReceiver, NotificationStatus, OrderLanguage, OrderStatus } from "@/types/database.types";

/**
 * Reusable notification layer — the only thing dashboards and Server
 * Actions should ever call. It owns *when* a notification fires and *what*
 * gets logged; it does not know or care how a message is actually
 * delivered. Swapping in a real WhatsApp/SMS/email provider later means
 * implementing `NotificationProvider` and changing `ACTIVE_PROVIDERS` here
 * — nothing outside this file changes.
 */

export interface NotificationPayload {
  orderId: string;
  phone: string;
  receiverType: NotificationReceiver;
  templateName: string;
  language: OrderLanguage;
}

export interface NotificationResult {
  status: NotificationStatus;
  error?: string;
}

export interface NotificationProvider {
  readonly channel: "whatsapp" | "browser" | "email" | "sms";
  send(payload: NotificationPayload): Promise<NotificationResult>;
}

/**
 * Stub-safe default provider: never calls a real API, always logs the
 * attempt as 'skipped'. This keeps the notification pipeline fully wired
 * end-to-end (order events -> notification_logs -> audit trail) without a
 * live Twilio/SMTP/etc integration, matching the project's "stub-safe"
 * design — see Phase 6 for the real WhatsApp provider.
 */
class LogOnlyProvider implements NotificationProvider {
  readonly channel = "whatsapp" as const;

  async send(): Promise<NotificationResult> {
    return { status: "skipped" };
  }
}

const ACTIVE_PROVIDERS: NotificationProvider[] = [new LogOnlyProvider()];

async function dispatch(payload: NotificationPayload, actorId: string, actorName: string): Promise<void> {
  if (isDemoMode()) return;

  const supabase = createServiceClient();

  for (const provider of ACTIVE_PROVIDERS) {
    const result = await provider.send(payload);

    const { error } = await supabase.from("notification_logs").insert({
      order_id: payload.orderId,
      phone: payload.phone,
      receiver_type: payload.receiverType,
      template_name: payload.templateName,
      language: payload.language,
      status: result.status,
      error: result.error ?? null,
      sent_at: result.status === "sent" || result.status === "delivered" ? new Date().toISOString() : null,
    });
    if (error) {
      console.error(`[notifications] failed to log ${payload.templateName}`, error);
      continue;
    }

    await recordAuditLog({
      actorId,
      actorName,
      action: "notification_sent",
      entityType: "order",
      entityId: payload.orderId,
      orderId: payload.orderId,
      newValue: { templateName: payload.templateName, receiverType: payload.receiverType, status: result.status },
    });
  }
}

interface OrderNotificationContext {
  orderId: string;
  orderNumber: string;
  customerName: string;
  customerMobile: string;
  whatsappEnabled: boolean;
  language: OrderLanguage;
}

/** Customer-facing statuses worth a notification — internal workflow steps (in_progress, waiting_materials) stay silent. */
const CUSTOMER_NOTIFIABLE_STATUSES: Partial<Record<OrderStatus, string>> = {
  ready_pickup: "order_ready_for_pickup",
  ready_delivery: "order_out_for_delivery",
  collected: "order_collected_confirmation",
  delivered: "order_delivered_confirmation",
};

export async function notifyOrderCreated(
  order: OrderNotificationContext,
  actorId: string,
  actorName: string
): Promise<void> {
  if (!order.whatsappEnabled || !order.customerMobile) return;
  await dispatch(
    {
      orderId: order.orderId,
      phone: order.customerMobile,
      receiverType: "customer",
      templateName: "order_created",
      language: order.language,
    },
    actorId,
    actorName
  );
}

export async function notifyOrderStatusChanged(params: {
  orderId: string;
  orderNumber: string;
  customerName: string;
  customerMobile: string;
  whatsappEnabled: boolean;
  language: OrderLanguage;
  fromStatus: OrderStatus;
  toStatus: OrderStatus;
  actorId: string;
  actorName: string;
}): Promise<void> {
  const template = CUSTOMER_NOTIFIABLE_STATUSES[params.toStatus];
  if (!template || !params.whatsappEnabled || !params.customerMobile) return;

  await dispatch(
    {
      orderId: params.orderId,
      phone: params.customerMobile,
      receiverType: "customer",
      templateName: template,
      language: params.language,
    },
    params.actorId,
    params.actorName
  );
}
