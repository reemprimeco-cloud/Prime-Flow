"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/guards";
import { createServiceClient } from "@/lib/supabase/server";
import { broadcast, CHANNELS } from "@/lib/realtime/channels";
import { recordAuditLog } from "@/lib/audit/log";
import { isDemoMode } from "@/lib/demo/mode";
import { cancelArmadaDelivery as cancelArmadaDeliveryApi } from "@/lib/armada/client";
import { dispatchArmadaDelivery } from "@/lib/armada/dispatch";

const DEMO_WRITE_ERROR = "This is a read-only demo — Armada delivery actions are disabled.";

/**
 * Manual retry for an order whose ready_delivery transition already tried
 * and failed to dispatch to Armada (see the try/catch in
 * applyOrderStatusTransition, lib/actions/status-transition.ts) — e.g. the
 * API key was blank at the time, or Armada was briefly unreachable. Only
 * meaningful for an order that's currently ready_delivery, set to the
 * Armada provider, and not already dispatched.
 */
export async function retryArmadaDispatch(orderId: string): Promise<void> {
  const session = await requireAdmin();
  if (isDemoMode()) throw new Error(DEMO_WRITE_ERROR);
  const supabase = createServiceClient();

  const { data: order, error } = await supabase
    .from("orders")
    .select(
      "id, order_number, status, delivery_provider, armada_delivery_code, customer_name, customer_mobile, delivery_address, delivery_map_link, delivery_area, delivery_block, delivery_street, delivery_building_number, notes"
    )
    .eq("id", orderId)
    .single();
  if (error || !order) throw new Error(error?.message ?? "Order not found");
  if (order.status !== "ready_delivery") throw new Error("Order isn't ready for delivery.");
  if (order.delivery_provider !== "armada") throw new Error("This order isn't set to deliver via Armada.");
  if (order.armada_delivery_code) throw new Error("This order already has an Armada delivery in progress.");

  await dispatchArmadaDelivery(supabase, orderId, order, session.employeeId, session.fullName);

  await broadcast(CHANNELS.production, "order.updated", { orderId });
  revalidatePath("/dashboard");
}

/** Cancels an in-flight Armada delivery from the order detail view. Doesn't touch orders.status — a manager still moves the order back to production or hands it to internal staff separately if needed. */
export async function cancelArmadaDeliveryAction(orderId: string): Promise<void> {
  const session = await requireAdmin();
  if (isDemoMode()) throw new Error(DEMO_WRITE_ERROR);
  const supabase = createServiceClient();

  const { data: order, error } = await supabase
    .from("orders")
    .select("id, order_number, armada_delivery_code")
    .eq("id", orderId)
    .single();
  if (error || !order) throw new Error(error?.message ?? "Order not found");
  if (!order.armada_delivery_code) throw new Error("This order has no Armada delivery to cancel.");

  await cancelArmadaDeliveryApi(order.armada_delivery_code);

  const { error: updateError } = await supabase
    .from("orders")
    .update({ armada_delivery_status: "canceled" })
    .eq("id", orderId);
  if (updateError) throw new Error(updateError.message);

  await recordAuditLog({
    actorId: session.employeeId,
    actorName: session.fullName,
    action: "armada_delivery_canceled",
    entityType: "order",
    entityId: orderId,
    orderId,
    oldValue: { code: order.armada_delivery_code },
  });

  await broadcast(CHANNELS.production, "order.updated", { orderId });
  revalidatePath("/dashboard");
}
