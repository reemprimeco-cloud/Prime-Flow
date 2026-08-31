import "server-only";

import type { createServiceClient } from "@/lib/supabase/server";
import { recordAuditLog } from "@/lib/audit/log";
import { createArmadaDelivery, parseLatLngFromMapsLink } from "@/lib/armada/client";

type ServiceClient = ReturnType<typeof createServiceClient>;

export interface DispatchableOrder {
  order_number: string;
  customer_name: string;
  customer_mobile: string;
  delivery_address: string | null;
  delivery_map_link: string | null;
  notes: string | null;
}

/**
 * Creates the Armada delivery for an order that just became ready_delivery
 * with delivery_provider = "armada", and persists the result (code,
 * tracking link, fee, initial status) onto the order row. Throws on
 * failure — see applyOrderStatusTransition in
 * lib/actions/status-transition.ts for the internal-staff fallback this is
 * paired with.
 *
 * Payment: always dispatched as "paid" — Prime Flow doesn't currently track
 * whether an order is cash-on-delivery, so there's nothing to pass as
 * Armada's required `amount` for a "cash" delivery. Revisit once/if the
 * order model grows a payment-collected-on-delivery flag.
 */
export async function dispatchArmadaDelivery(
  supabase: ServiceClient,
  orderId: string,
  order: DispatchableOrder,
  actorId: string | null,
  actorName: string
): Promise<{ code: string; trackingLink: string | null }> {
  const pin = parseLatLngFromMapsLink(order.delivery_map_link);

  try {
    const result = await createArmadaDelivery({
      orderId,
      customerName: order.customer_name,
      customerPhone: order.customer_mobile,
      paymentType: "paid",
      latitude: pin?.latitude ?? null,
      longitude: pin?.longitude ?? null,
      area: pin ? null : order.delivery_address,
      instructions: order.notes,
    });

    const { error } = await supabase
      .from("orders")
      .update({
        armada_delivery_code: result.code,
        armada_delivery_status: result.status,
        armada_tracking_link: result.trackingLink,
        armada_delivery_fee: result.deliveryFee,
      })
      .eq("id", orderId);
    if (error) throw new Error(error.message);

    await recordAuditLog({
      actorId,
      actorName,
      action: "armada_delivery_dispatched",
      entityType: "order",
      entityId: orderId,
      orderId,
      newValue: { code: result.code, trackingLink: result.trackingLink },
    });

    return { code: result.code, trackingLink: result.trackingLink };
  } catch (error) {
    await recordAuditLog({
      actorId,
      actorName,
      action: "armada_delivery_dispatch_failed",
      entityType: "order",
      entityId: orderId,
      orderId,
      newValue: { error: error instanceof Error ? error.message : String(error) },
    });
    throw error;
  }
}
