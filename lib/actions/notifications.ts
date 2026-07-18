"use server";

import { requireAdmin } from "@/lib/auth/guards";
import { createServiceClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/demo/mode";
import { getDemoNotificationLogs } from "@/lib/demo/data";
import { resendNotification as resendNotificationInternal } from "@/lib/notifications/service";
import type { NotificationChannel, NotificationReceiver, NotificationStatus, OrderLanguage } from "@/types/database.types";

export interface NotificationLogItem {
  id: string;
  orderId: string | null;
  orderNumber: string | null;
  recipientName: string | null;
  phone: string;
  receiverType: NotificationReceiver;
  channel: NotificationChannel;
  templateName: string;
  body: string | null;
  language: OrderLanguage;
  status: NotificationStatus;
  retryCount: number;
  error: string | null;
  providerResponse: unknown;
  sentAt: string | null;
  createdAt: string;
}

export async function listNotificationLogs(): Promise<NotificationLogItem[]> {
  await requireAdmin();
  if (isDemoMode()) return getDemoNotificationLogs();
  const supabase = createServiceClient();

  const { data: logs, error } = await supabase
    .from("notification_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  if (!logs || logs.length === 0) return [];

  const orderIds = [...new Set(logs.map((l) => l.order_id).filter((id): id is string => !!id))];
  const orderNumberById = new Map<string, string>();
  const customerNameByOrderId = new Map<string, string>();
  if (orderIds.length > 0) {
    const { data: orders } = await supabase.from("orders").select("id, order_number, customer_name").in("id", orderIds);
    for (const o of orders ?? []) {
      orderNumberById.set(o.id, o.order_number);
      customerNameByOrderId.set(o.id, o.customer_name);
    }
  }

  const employeePhones = [...new Set(logs.filter((l) => l.receiver_type === "employee").map((l) => l.phone))];
  const employeeNameByPhone = new Map<string, string>();
  if (employeePhones.length > 0) {
    const { data: employees } = await supabase.from("employees").select("full_name, phone").in("phone", employeePhones);
    for (const e of employees ?? []) {
      if (e.phone) employeeNameByPhone.set(e.phone, e.full_name);
    }
  }

  return logs.map((l) => ({
    id: l.id,
    orderId: l.order_id,
    orderNumber: l.order_id ? orderNumberById.get(l.order_id) ?? null : null,
    recipientName:
      l.receiver_type === "customer"
        ? (l.order_id && customerNameByOrderId.get(l.order_id)) ?? null
        : employeeNameByPhone.get(l.phone) ?? null,
    phone: l.phone,
    receiverType: l.receiver_type,
    channel: l.channel,
    templateName: l.template_name,
    body: l.body,
    language: l.language,
    status: l.status,
    retryCount: l.retry_count,
    error: l.error,
    providerResponse: l.provider_response,
    sentAt: l.sent_at,
    createdAt: l.created_at,
  }));
}

const DEMO_WRITE_ERROR = "This is a read-only demo — writes are disabled.";

export async function manualResendNotification(logId: string): Promise<void> {
  const session = await requireAdmin();
  if (isDemoMode()) throw new Error(DEMO_WRITE_ERROR);
  await resendNotificationInternal(logId, session.employeeId, session.fullName);
}
