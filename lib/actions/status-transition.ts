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
import { dispatchArmadaDelivery } from "@/lib/armada/dispatch";
import type { OrderDeliveryProvider, OrderStatus } from "@/types/database.types";

type ServiceClient = ReturnType<typeof createServiceClient>;

interface DeliveryStaffOrder {
  order_number: string;
  product: string;
  delivery_date: string;
  delivery_time: string;
  delivery_address?: string | null;
  delivery_map_link?: string | null;
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
        deliveryMapLink: order.delivery_map_link ?? null,
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
  actorId: string | null,
  actorName: string,
  /**
   * Who's actually delivering it — only meaningful (and only ever passed)
   * when `status` is "ready_delivery". Asked at this exact moment (the
   * "Who's delivering this?" prompt in components/orders/status-actions.tsx
   * and components/employee/item-readiness-dialog.tsx) rather than earlier
   * at order-creation time, since the answer genuinely varies order to
   * order and isn't known until the job's actually ready. Persisted onto
   * the order in the same update as the status flip below.
   */
  deliveryProviderChoice?: OrderDeliveryProvider
) {
  const { data: current, error: fetchError } = await supabase
    .from("orders")
    .select(
      "status, order_number, customer_name, customer_mobile, product, delivery_date, delivery_time, delivery_address, delivery_map_link, whatsapp_enabled, preferred_channel, preferred_language, notification_preferences, delivery_provider, notes, design_approval_status"
    )
    .eq("id", orderId)
    .single();
  if (fetchError || !current) throw new Error(fetchError?.message ?? "Order not found");

  assertValidTransition(current.status, status);

  // Customer design approval gate -- blocks Start Production for BOTH
  // employee and admin callers (unlike the internal `orders.approved` gate,
  // which only blocks employees -- see updateEmployeeJobStatus). An admin
  // who genuinely needs to skip this still can, via Override Status, which
  // bypasses this function entirely. See docs/DESIGN_APPROVAL.md.
  if (
    status === "in_progress" &&
    current.status === "new" &&
    (current.design_approval_status === "pending" || current.design_approval_status === "changes_requested")
  ) {
    throw new Error("Waiting on the customer to approve the design before production can start.");
  }

  const setsDeliveryProvider = status === "ready_delivery" && deliveryProviderChoice != null;
  const effectiveDeliveryProvider = setsDeliveryProvider ? deliveryProviderChoice : current.delivery_provider;

  const { error } = await supabase
    .from("orders")
    .update(setsDeliveryProvider ? { status, delivery_provider: deliveryProviderChoice } : { status })
    .eq("id", orderId);
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

  if (isRevertToProduction) {
    // The per-item readiness checklist (item_ready / order_items.is_ready)
    // only means anything while the order is actively being reworked --
    // reset it so the employee has to recheck every item before the order
    // can auto-advance again, rather than silently jumping straight back to
    // "ready" off stale checkmarks from before the correction.
    await supabase.from("orders").update({ item_ready: false }).eq("id", orderId);
    await supabase.from("order_items").update({ is_ready: false }).eq("order_id", orderId);
  }

  // Every branch below except the customer notification assumes a human
  // actor -- the Armada webhook (the only null-actorId caller) always
  // targets "delivered", never "ready_internal_pickup"/"ready_delivery"/a
  // revert, so `actorId!` here is a documented invariant, not a guess.
  if (status === "ready_internal_pickup") {
    // Outsourced worker's "done" -- internal handoff only, no customer
    // notification. Auto-assign the delivery-role staff so this job shows
    // up on their dashboard, and let them know to go collect it.
    await notifyDeliveryStaffForStatus(supabase, orderId, current, "internal_pickup_ready", actorId!, actorName);
  } else if (isRevertToProduction) {
    await notifyOrderMovedBackToProduction(notificationContext, actorId!, actorName);
  } else {
    await notifyOrderStatusChanged({ ...notificationContext, toStatus: status }, actorId, actorName);

    if (status === "ready_delivery") {
      if (effectiveDeliveryProvider === "armada") {
        // Whoever marked this ready picked Armada in the "Who's delivering
        // this?" prompt -- dispatch it to their API instead of paging
        // internal delivery staff. If Armada can't be reached or isn't
        // configured, fall back to the internal notify below so the order
        // still gets delivered by someone rather than stranding it.
        try {
          await dispatchArmadaDelivery(supabase, orderId, current, actorId, actorName);
        } catch (dispatchError) {
          console.error(`[armada] dispatch failed for ${current.order_number}, falling back to internal delivery staff`, dispatchError);
          await notifyDeliveryStaffForStatus(supabase, orderId, current, "order_out_for_delivery_staff", actorId!, actorName);
        }
      } else {
        // On top of the customer notification above: tell delivery-role
        // staff (e.g. Naresh) to go deliver it, and put it on their dashboard.
        await notifyDeliveryStaffForStatus(supabase, orderId, current, "order_out_for_delivery_staff", actorId!, actorName);
      }
    }
  }

  await broadcast(CHANNELS.production, "order.updated", { orderId });
  revalidatePath("/employee");
  revalidatePath("/dashboard");

  return current;
}
