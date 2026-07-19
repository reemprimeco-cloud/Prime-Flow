import "server-only";

import { revalidatePath } from "next/cache";

import { createServiceClient } from "@/lib/supabase/server";
import { broadcast, CHANNELS } from "@/lib/realtime/channels";
import { assertValidTransition } from "@/lib/status/engine";
import { recordAuditLog } from "@/lib/audit/log";
import {
  notifyEmployeeInternalPickupReady,
  notifyEmployeeOutForDeliveryStaff,
  notifyOrderMovedBackToProduction,
  notifyOrderStatusChanged,
} from "@/lib/notifications/service";
import type { OrderStatus } from "@/types/database.types";

type ServiceClient = ReturnType<typeof createServiceClient>;

interface DeliveryStaffOrder {
  order_number: string;
  product: string;
  delivery_date: string;
  delivery_time: string;
  delivery_address?: string | null;
}

/**
 * Auto-assigns every active employee with the 'delivery' role (logistics
 * staff -- e.g. Naresh) so the job appears on their dashboard, then sends
 * each of them the given notification. Used for both "go collect it from
 * the outsourced worker" (ready_internal_pickup) and "go deliver it to the
 * customer" (ready_delivery). A no-op if no employee currently has that role.
 */
export async function notifyDeliveryStaffForStatus(
  supabase: ServiceClient,
  orderId: string,
  order: DeliveryStaffOrder,
  templateName: "internal_pickup_ready" | "order_out_for_delivery_staff",
  actorId: string,
  actorName: string
): Promise<void> {
  const { data: staff } = await supabase.from("employees").select("id, phone").eq("role", "delivery").eq("active", true);
  if (!staff || staff.length === 0) return;

  const notify = templateName === "internal_pickup_ready" ? notifyEmployeeInternalPickupReady : notifyEmployeeOutForDeliveryStaff;

  for (const handler of staff) {
    const { data: existingAssignment } = await supabase
      .from("order_assignments")
      .select("id")
      .eq("order_id", orderId)
      .eq("employee_id", handler.id)
      .maybeSingle();

    if (!existingAssignment) {
      await supabase.from("order_assignments").insert({ order_id: orderId, employee_id: handler.id });
      await recordAuditLog({
        actorId,
        actorName,
        action: "employee_assigned",
        entityType: "order_assignment",
        entityId: handler.id,
        orderId,
        newValue: { employeeId: handler.id, reason: templateName },
      });
    }

    await notify(
      {
        employeeId: handler.id,
        employeePhone: handler.phone,
        orderId,
        orderNumber: order.order_number,
        product: order.product,
        deliveryDate: order.delivery_date,
        deliveryTime: order.delivery_time,
        deliveryAddress: order.delivery_address ?? null,
      },
      actorId,
      actorName
    );
  }
}

/**
 * The single implementation behind every "move this order to a new status"
 * action, whoever's driving it — employee dashboard or manager dashboard.
 * Validates the transition against the Status Engine, persists it, and
 * fires every notification a status change can trigger (customer update,
 * revert-to-production correction, delivery-staff hand-off). Callers own
 * their own auth check and any role-specific extras — the employee path
 * also verifies order_assignments first and notifies admins afterward; the
 * admin path does neither, since an admin can act on any order and doesn't
 * need to be told about their own change.
 */
export async function applyOrderStatusTransition(
  supabase: ServiceClient,
  orderId: string,
  status: OrderStatus,
  actorId: string,
  actorName: string
) {
  const { data: current, error: fetchError } = await supabase
    .from("orders")
    .select(
      "status, order_number, customer_name, customer_mobile, product, delivery_date, delivery_time, delivery_address, whatsapp_enabled, preferred_channel, preferred_language, notification_preferences"
    )
    .eq("id", orderId)
    .single();
  if (fetchError || !current) throw new Error(fetchError?.message ?? "Order not found");

  assertValidTransition(current.status, status);

  const { error } = await supabase.from("orders").update({ status }).eq("id", orderId);
  if (error) throw new Error(error.message);

  await supabase.from("order_status_history").insert({
    order_id: orderId,
    from_status: current.status,
    to_status: status,
    changed_by: actorId,
  });

  await recordAuditLog({
    actorId,
    actorName,
    action: "status_changed",
    entityType: "order",
    entityId: orderId,
    orderId,
    oldValue: { status: current.status },
    newValue: { status },
  });

  const notificationContext = {
    orderId,
    orderNumber: current.order_number,
    customerName: current.customer_name,
    customerMobile: current.customer_mobile,
    product: current.product,
    deliveryDate: current.delivery_date,
    deliveryTime: current.delivery_time,
    whatsappEnabled: current.whatsapp_enabled,
    preferredChannel: current.preferred_channel,
    language: current.preferred_language,
    notificationPreferences: current.notification_preferences,
  };

  const isRevertToProduction =
    (current.status === "ready_pickup" || current.status === "ready_delivery") && status === "in_progress";

  if (status === "ready_internal_pickup") {
    // Outsourced worker's "done" -- internal handoff only, no customer
    // notification. Auto-assign the delivery-role staff so this job shows
    // up on their dashboard, and let them know to go collect it.
    await notifyDeliveryStaffForStatus(supabase, orderId, current, "internal_pickup_ready", actorId, actorName);
  } else if (isRevertToProduction) {
    await notifyOrderMovedBackToProduction(notificationContext, actorId, actorName);
  } else {
    await notifyOrderStatusChanged({ ...notificationContext, toStatus: status }, actorId, actorName);

    if (status === "ready_delivery") {
      // On top of the customer notification above: tell delivery-role
      // staff (e.g. Naresh) to go deliver it, and put it on their dashboard.
      await notifyDeliveryStaffForStatus(supabase, orderId, current, "order_out_for_delivery_staff", actorId, actorName);
    }
  }

  await broadcast(CHANNELS.production, "order.updated", { orderId });
  revalidatePath("/employee");
  revalidatePath("/dashboard");

  return current;
}
