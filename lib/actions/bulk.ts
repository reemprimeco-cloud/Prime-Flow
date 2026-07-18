"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/guards";
import { createServiceClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/demo/mode";
import { broadcast, CHANNELS } from "@/lib/realtime/channels";
import { recordAuditLog } from "@/lib/audit/log";
import { notifyEmployeeJobAssigned, notifyOrderStatusChanged } from "@/lib/notifications/service";
import { normalizeNotificationPreferences } from "@/lib/notifications/constants";
import type { OrderPriority } from "@/types/database.types";

const DEMO_WRITE_ERROR = "This is a read-only demo — writes are disabled.";

export interface BulkResult {
  requested: number;
  succeeded: number;
  skipped: number;
}

export async function bulkAssignEmployees(orderIds: string[], employeeIds: string[]): Promise<BulkResult> {
  const session = await requireAdmin();
  if (isDemoMode()) throw new Error(DEMO_WRITE_ERROR);
  if (orderIds.length === 0 || employeeIds.length === 0) return { requested: orderIds.length, succeeded: 0, skipped: orderIds.length };
  const supabase = createServiceClient();

  const [{ data: existing }, { data: orders }, { data: employees }] = await Promise.all([
    supabase.from("order_assignments").select("order_id, employee_id").in("order_id", orderIds),
    supabase.from("orders").select("id, order_number, product, delivery_date, delivery_time").in("id", orderIds),
    supabase.from("employees").select("id, phone").in("id", employeeIds),
  ]);
  const existingPairs = new Set((existing ?? []).map((r) => `${r.order_id}:${r.employee_id}`));
  const orderById = new Map((orders ?? []).map((o) => [o.id, o]));
  const employeeById = new Map((employees ?? []).map((e) => [e.id, e]));

  const toInsert: { order_id: string; employee_id: string }[] = [];
  for (const orderId of orderIds) {
    for (const employeeId of employeeIds) {
      if (!existingPairs.has(`${orderId}:${employeeId}`)) toInsert.push({ order_id: orderId, employee_id: employeeId });
    }
  }
  if (toInsert.length > 0) {
    const { error } = await supabase.from("order_assignments").insert(toInsert);
    if (error) throw new Error(error.message);
  }

  for (const { order_id, employee_id } of toInsert) {
    const order = orderById.get(order_id);
    const employee = employeeById.get(employee_id);
    await recordAuditLog({
      actorId: session.employeeId,
      actorName: session.fullName,
      action: "employee_assigned",
      entityType: "order_assignment",
      entityId: employee_id,
      orderId: order_id,
      newValue: { employeeId: employee_id, bulk: true },
    });
    if (order && employee?.phone) {
      await notifyEmployeeJobAssigned(
        {
          employeeId: employee_id,
          employeePhone: employee.phone,
          orderId: order_id,
          orderNumber: order.order_number,
          product: order.product,
          deliveryDate: order.delivery_date,
          deliveryTime: order.delivery_time,
        },
        session.employeeId,
        session.fullName
      );
    }
  }

  await broadcast(CHANNELS.production, "order.updated", { bulk: true });
  revalidatePath("/dashboard");
  return { requested: orderIds.length * employeeIds.length, succeeded: toInsert.length, skipped: orderIds.length * employeeIds.length - toInsert.length };
}

export async function bulkChangePriority(orderIds: string[], priority: OrderPriority): Promise<BulkResult> {
  const session = await requireAdmin();
  if (isDemoMode()) throw new Error(DEMO_WRITE_ERROR);
  if (orderIds.length === 0) return { requested: 0, succeeded: 0, skipped: 0 };
  const supabase = createServiceClient();

  const { error } = await supabase.from("orders").update({ priority }).in("id", orderIds);
  if (error) throw new Error(error.message);

  await recordAuditLog({
    actorId: session.employeeId,
    actorName: session.fullName,
    action: "order_updated",
    entityType: "order",
    entityId: null,
    orderId: null,
    newValue: { priority, bulk: true, orderIds },
  });

  await broadcast(CHANNELS.production, "order.updated", { bulk: true });
  revalidatePath("/dashboard");
  return { requested: orderIds.length, succeeded: orderIds.length, skipped: 0 };
}

export async function bulkMoveDeliveryDate(orderIds: string[], newDate: string): Promise<BulkResult> {
  const session = await requireAdmin();
  if (isDemoMode()) throw new Error(DEMO_WRITE_ERROR);
  if (orderIds.length === 0) return { requested: 0, succeeded: 0, skipped: 0 };
  const supabase = createServiceClient();

  const { error } = await supabase.from("orders").update({ delivery_date: newDate }).in("id", orderIds);
  if (error) throw new Error(error.message);

  await recordAuditLog({
    actorId: session.employeeId,
    actorName: session.fullName,
    action: "order_updated",
    entityType: "order",
    entityId: null,
    orderId: null,
    newValue: { deliveryDate: newDate, bulk: true, orderIds },
  });

  await broadcast(CHANNELS.production, "order.updated", { bulk: true });
  revalidatePath("/dashboard");
  return { requested: orderIds.length, succeeded: orderIds.length, skipped: 0 };
}

export async function bulkArchiveCompleted(orderIds: string[]): Promise<BulkResult> {
  const session = await requireAdmin();
  if (isDemoMode()) throw new Error(DEMO_WRITE_ERROR);
  if (orderIds.length === 0) return { requested: 0, succeeded: 0, skipped: 0 };
  const supabase = createServiceClient();

  const { data: eligible } = await supabase.from("orders").select("id").in("id", orderIds).eq("status", "completed");
  const eligibleIds = (eligible ?? []).map((o) => o.id);
  if (eligibleIds.length > 0) {
    const { error } = await supabase.from("orders").update({ archived: true }).in("id", eligibleIds);
    if (error) throw new Error(error.message);
  }

  await recordAuditLog({
    actorId: session.employeeId,
    actorName: session.fullName,
    action: "order_updated",
    entityType: "order",
    entityId: null,
    orderId: null,
    newValue: { archived: true, bulk: true, orderIds: eligibleIds },
  });

  await broadcast(CHANNELS.production, "order.archived", { bulk: true });
  revalidatePath("/dashboard");
  return { requested: orderIds.length, succeeded: eligibleIds.length, skipped: orderIds.length - eligibleIds.length };
}

export async function bulkSendNotifications(orderIds: string[]): Promise<BulkResult> {
  const session = await requireAdmin();
  if (isDemoMode()) throw new Error(DEMO_WRITE_ERROR);
  if (orderIds.length === 0) return { requested: 0, succeeded: 0, skipped: 0 };
  const supabase = createServiceClient();

  const { data: orders } = await supabase
    .from("orders")
    .select(
      "id, order_number, customer_name, customer_mobile, product, delivery_date, delivery_time, status, whatsapp_enabled, preferred_channel, preferred_language, notification_preferences"
    )
    .in("id", orderIds);

  let succeeded = 0;
  for (const order of orders ?? []) {
    if (!order.whatsapp_enabled || !order.customer_mobile) continue;
    await notifyOrderStatusChanged(
      {
        orderId: order.id,
        orderNumber: order.order_number,
        customerName: order.customer_name,
        customerMobile: order.customer_mobile,
        product: order.product,
        deliveryDate: order.delivery_date,
        deliveryTime: order.delivery_time,
        whatsappEnabled: order.whatsapp_enabled,
        preferredChannel: order.preferred_channel,
        language: order.preferred_language,
        notificationPreferences: normalizeNotificationPreferences(order.notification_preferences),
        toStatus: order.status,
      },
      session.employeeId,
      session.fullName
    );
    succeeded++;
  }

  return { requested: orderIds.length, succeeded, skipped: orderIds.length - succeeded };
}
