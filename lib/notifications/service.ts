import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/demo/mode";
import { recordAuditLog } from "@/lib/audit/log";
import { renderTemplate, type TemplateName, type TemplateVariables } from "@/lib/notifications/templates";
import { TwilioWhatsAppProvider } from "@/lib/notifications/providers/twilio-whatsapp";
import { normalizeNotificationPreferences, type NotificationPreferences } from "@/lib/notifications/constants";
import { buildGoogleMapsLink } from "@/lib/utils/maps";
import type {
  NotificationChannel,
  NotificationReceiver,
  NotificationStatus,
  OrderLanguage,
  OrderStatus,
} from "@/types/database.types";

/**
 * Reusable notification layer — the only thing dashboards and Server
 * Actions should ever call. It owns *when* a notification fires, *what*
 * template it uses, and *which channel* it routes to; callers never touch
 * a provider, a phone number, or notification_logs directly. Adding Email
 * or SMS later means implementing `NotificationProvider` and registering
 * it in `PROVIDERS` — nothing outside this file changes.
 */

export interface NotificationPayload {
  orderId: string | null;
  phone: string;
  receiverType: NotificationReceiver;
  templateName: TemplateName;
  language: OrderLanguage;
  channel: NotificationChannel;
  body: string;
}

export interface NotificationResult {
  status: NotificationStatus;
  error?: string;
  providerResponse?: unknown;
}

export interface NotificationProvider {
  readonly channel: NotificationChannel;
  send(payload: NotificationPayload): Promise<NotificationResult>;
}

/** Registered providers, keyed by channel. Only "whatsapp" is implemented — see docs/NOTIFICATIONS.md. */
const PROVIDERS: Partial<Record<NotificationChannel, NotificationProvider>> = {
  whatsapp: new TwilioWhatsAppProvider(),
};

async function dispatch(payload: NotificationPayload, actorId: string | null, actorName: string): Promise<void> {
  if (isDemoMode()) return;

  const supabase = createServiceClient();
  const provider = PROVIDERS[payload.channel];
  const result: NotificationResult = provider
    ? await provider.send(payload)
    : { status: "skipped", error: `"${payload.channel}" channel isn't implemented yet` };

  const { error } = await supabase.from("notification_logs").insert({
    order_id: payload.orderId,
    phone: payload.phone,
    receiver_type: payload.receiverType,
    template_name: payload.templateName,
    channel: payload.channel,
    language: payload.language,
    body: payload.body,
    status: result.status,
    error: result.error ?? null,
    provider_response: (result.providerResponse as never) ?? null,
    sent_at: result.status === "sent" || result.status === "delivered" ? new Date().toISOString() : null,
    last_attempted_at: new Date().toISOString(),
  });
  if (error) {
    console.error(`[notifications] failed to log ${payload.templateName}`, error);
    return;
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

// ---------------------------------------------------------------------------
// Customer notifications — gated by whatsappEnabled + per-order preferences
// ---------------------------------------------------------------------------

interface OrderNotificationContext {
  orderId: string;
  orderNumber: string;
  customerName: string;
  customerMobile: string;
  product: string;
  deliveryDate: string;
  deliveryTime: string;
  whatsappEnabled: boolean;
  preferredChannel: NotificationChannel;
  language: OrderLanguage;
  notificationPreferences: unknown;
}

async function sendCustomerNotification(
  order: OrderNotificationContext,
  templateName: TemplateName,
  preferenceKey: keyof NotificationPreferences,
  actorId: string,
  actorName: string
): Promise<void> {
  if (!order.whatsappEnabled || !order.customerMobile) return;
  const prefs = normalizeNotificationPreferences(order.notificationPreferences);
  if (!prefs[preferenceKey]) return;

  const vars: TemplateVariables = {
    customerName: order.customerName,
    orderNumber: order.orderNumber,
    productName: order.product,
    deliveryDate: order.deliveryDate,
    deliveryTime: order.deliveryTime,
  };

  await dispatch(
    {
      orderId: order.orderId,
      phone: order.customerMobile,
      receiverType: "customer",
      templateName,
      language: order.language,
      channel: order.preferredChannel,
      body: renderTemplate(templateName, order.language, vars),
    },
    actorId,
    actorName
  );
}

export async function notifyOrderCreated(
  order: OrderNotificationContext,
  actorId: string,
  actorName: string
): Promise<void> {
  await sendCustomerNotification(order, "order_received", "order_received", actorId, actorName);
}

/**
 * Fires when a job is moved back to in_progress after already being marked
 * ready_pickup/ready_delivery by mistake. Deliberately bypasses the
 * per-order notification preference toggles that gate every other status
 * message: those toggles opt into routine updates, but this is a correction
 * to a "ready" message that already went out, so it goes out regardless of
 * whether the customer opted into "order in production" updates.
 */
export async function notifyOrderMovedBackToProduction(
  order: OrderNotificationContext,
  actorId: string,
  actorName: string
): Promise<void> {
  if (!order.whatsappEnabled || !order.customerMobile) return;

  const vars: TemplateVariables = {
    customerName: order.customerName,
    orderNumber: order.orderNumber,
    productName: order.product,
    deliveryDate: order.deliveryDate,
    deliveryTime: order.deliveryTime,
  };

  await dispatch(
    {
      orderId: order.orderId,
      phone: order.customerMobile,
      receiverType: "customer",
      templateName: "order_returned_to_production",
      language: order.language,
      channel: order.preferredChannel,
      body: renderTemplate("order_returned_to_production", order.language, vars),
    },
    actorId,
    actorName
  );
}

const STATUS_TEMPLATE: Partial<
  Record<OrderStatus, { template: CustomerStatusTemplate; preference: keyof NotificationPreferences }>
> = {
  in_progress: { template: "order_in_production", preference: "order_in_production" },
  ready_pickup: { template: "order_ready_for_pickup", preference: "ready_for_pickup" },
  ready_delivery: { template: "order_out_for_delivery", preference: "out_for_delivery" },
  collected: { template: "order_collected_confirmation", preference: "ready_for_pickup" },
  delivered: { template: "order_delivered_confirmation", preference: "delivered" },
};

type CustomerStatusTemplate = Extract<
  TemplateName,
  "order_in_production" | "order_ready_for_pickup" | "order_out_for_delivery" | "order_collected_confirmation" | "order_delivered_confirmation"
>;

export async function notifyOrderStatusChanged(
  order: OrderNotificationContext & { toStatus: OrderStatus },
  actorId: string,
  actorName: string
): Promise<void> {
  const mapping = STATUS_TEMPLATE[order.toStatus];
  if (!mapping) return;
  await sendCustomerNotification(order, mapping.template, mapping.preference, actorId, actorName);
}

// ---------------------------------------------------------------------------
// Employee notifications — always WhatsApp, no preference gating (staff,
// not customers); English only — employees have no stored language
// preference in this schema.
// ---------------------------------------------------------------------------

interface EmployeeNotificationContext {
  employeeId: string;
  employeePhone: string | null;
  /** null when the order no longer exists (e.g. job_cancelled fires after deleteOrder) — the notification_logs FK can't reference a deleted row. */
  orderId: string | null;
  orderNumber: string;
  product: string;
  deliveryDate: string;
  deliveryTime: string;
  /** Customer delivery address, if the manager entered one — rendered into a clickable Google Maps link for delivery-staff notifications (see lib/utils/maps.ts). Ignored by templates that don't reference it. */
  deliveryAddress?: string | null;
}

async function sendEmployeeNotification(
  employee: EmployeeNotificationContext,
  templateName: EmployeeTemplateNameLocal,
  actorId: string,
  actorName: string
): Promise<void> {
  if (!employee.employeePhone) return;

  const vars: TemplateVariables = {
    orderNumber: employee.orderNumber,
    productName: employee.product,
    deliveryDate: employee.deliveryDate,
    deliveryTime: employee.deliveryTime,
    mapsLink: employee.deliveryAddress ? buildGoogleMapsLink(employee.deliveryAddress) : undefined,
  };

  await dispatch(
    {
      orderId: employee.orderId,
      phone: employee.employeePhone,
      receiverType: "employee",
      templateName,
      language: "en",
      channel: "whatsapp",
      body: renderTemplate(templateName, "en", vars),
    },
    actorId,
    actorName
  );
}

type EmployeeTemplateNameLocal = Extract<
  TemplateName,
  | "job_assigned"
  | "job_reassigned"
  | "high_priority_job_assigned"
  | "material_request_approved"
  | "job_cancelled"
  | "internal_pickup_ready"
  | "order_out_for_delivery_staff"
  | "material_purchase_needed"
  | "job_ready_for_you"
>;

export async function notifyEmployeeJobAssigned(
  employee: EmployeeNotificationContext,
  actorId: string,
  actorName: string
): Promise<void> {
  await sendEmployeeNotification(employee, "job_assigned", actorId, actorName);
}

export async function notifyEmployeeJobReassigned(
  employee: EmployeeNotificationContext,
  actorId: string,
  actorName: string
): Promise<void> {
  await sendEmployeeNotification(employee, "job_reassigned", actorId, actorName);
}

export async function notifyEmployeeHighPriorityAssigned(
  employee: EmployeeNotificationContext,
  actorId: string,
  actorName: string
): Promise<void> {
  await sendEmployeeNotification(employee, "high_priority_job_assigned", actorId, actorName);
}

export async function notifyEmployeeJobCancelled(
  employee: EmployeeNotificationContext,
  actorId: string,
  actorName: string
): Promise<void> {
  await sendEmployeeNotification(employee, "job_cancelled", actorId, actorName);
}

export async function notifyEmployeeMaterialApproved(
  employee: EmployeeNotificationContext,
  actorId: string,
  actorName: string
): Promise<void> {
  await sendEmployeeNotification(employee, "material_request_approved", actorId, actorName);
}

/** Fires to delivery-role staff when an outsourced employee marks a job ready_internal_pickup. */
export async function notifyEmployeeInternalPickupReady(
  employee: EmployeeNotificationContext,
  actorId: string,
  actorName: string
): Promise<void> {
  await sendEmployeeNotification(employee, "internal_pickup_ready", actorId, actorName);
}

/** Fires to delivery-role staff when an order becomes ready_delivery, alongside the customer notification. */
export async function notifyEmployeeOutForDeliveryStaff(
  employee: EmployeeNotificationContext,
  actorId: string,
  actorName: string
): Promise<void> {
  await sendEmployeeNotification(employee, "order_out_for_delivery_staff", actorId, actorName);
}

/** Fires to delivery-role staff when a material request is approved, so they know to go buy it. */
export async function notifyEmployeeMaterialPurchaseNeeded(
  employee: EmployeeNotificationContext,
  actorId: string,
  actorName: string
): Promise<void> {
  await sendEmployeeNotification(employee, "material_purchase_needed", actorId, actorName);
}

/** Fires to the next employee in a sequential hand-off chain once the person before them clicks "Ready for Next". */
export async function notifyEmployeeJobReadyForYou(
  employee: EmployeeNotificationContext,
  actorId: string,
  actorName: string
): Promise<void> {
  await sendEmployeeNotification(employee, "job_ready_for_you", actorId, actorName);
}

// ---------------------------------------------------------------------------
// Manual resend — Notification Center "resend" button
// ---------------------------------------------------------------------------

/** Re-sends a previously logged notification using its original phone/template/language, incrementing retry_count. */
export async function resendNotification(logId: string, actorId: string | null, actorName: string): Promise<void> {
  if (isDemoMode()) throw new Error("This is a read-only demo — writes are disabled.");

  const supabase = createServiceClient();
  const { data: log, error: fetchError } = await supabase
    .from("notification_logs")
    .select("*")
    .eq("id", logId)
    .single();
  if (fetchError || !log) throw new Error(fetchError?.message ?? "Notification not found");

  if (!log.body) throw new Error("This notification has no stored message body to resend.");

  const channel: NotificationChannel = "whatsapp"; // only implemented channel — see PROVIDERS above
  const provider = PROVIDERS[channel];
  const result: NotificationResult = provider
    ? await provider.send({
        orderId: log.order_id,
        phone: log.phone,
        receiverType: log.receiver_type,
        templateName: log.template_name as TemplateName,
        language: log.language,
        channel,
        body: log.body,
      })
    : { status: "skipped", error: `"${channel}" channel isn't implemented yet` };

  const { error: updateError } = await supabase
    .from("notification_logs")
    .update({
      status: result.status,
      error: result.error ?? null,
      provider_response: (result.providerResponse as never) ?? null,
      retry_count: log.retry_count + 1,
      sent_at: result.status === "sent" || result.status === "delivered" ? new Date().toISOString() : log.sent_at,
      last_attempted_at: new Date().toISOString(),
    })
    .eq("id", logId);
  if (updateError) throw new Error(updateError.message);

  await recordAuditLog({
    actorId,
    actorName,
    action: "notification_sent",
    entityType: "order",
    entityId: log.order_id,
    orderId: log.order_id,
    newValue: { templateName: log.template_name, manualResend: true, status: result.status },
  });
}
