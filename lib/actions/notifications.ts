"use server";

import { requireAdmin } from "@/lib/auth/guards";
import { createServiceClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/demo/mode";
import { getDemoNotificationLogs } from "@/lib/demo/data";
import type { NotificationReceiver, NotificationStatus, OrderLanguage } from "@/types/database.types";

export interface NotificationLogItem {
  id: string;
  orderId: string | null;
  orderNumber: string | null;
  phone: string;
  receiverType: NotificationReceiver;
  templateName: string;
  language: OrderLanguage;
  status: NotificationStatus;
  retryCount: number;
  error: string | null;
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
  if (orderIds.length > 0) {
    const { data: orders } = await supabase.from("orders").select("id, order_number").in("id", orderIds);
    for (const o of orders ?? []) orderNumberById.set(o.id, o.order_number);
  }

  return logs.map((l) => ({
    id: l.id,
    orderId: l.order_id,
    orderNumber: l.order_id ? orderNumberById.get(l.order_id) ?? null : null,
    phone: l.phone,
    receiverType: l.receiver_type,
    templateName: l.template_name,
    language: l.language,
    status: l.status,
    retryCount: l.retry_count,
    error: l.error,
    sentAt: l.sent_at,
    createdAt: l.created_at,
  }));
}
