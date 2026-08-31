import { NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/server";
import { broadcast, CHANNELS } from "@/lib/realtime/channels";
import { recordAuditLog } from "@/lib/audit/log";
import { applyOrderStatusTransition } from "@/lib/actions/status-transition";
import { verifyArmadaWebhookKey } from "@/lib/armada/client";

/**
 * POST /api/webhooks/armada
 *
 * Register this exact URL in Armada dashboard > Automated Ordering > your
 * key > "Order update webhook", with all 5 event boxes checked (Accepted,
 * En_route, Completed, Failed, Canceled). See docs/ARMADA_DELIVERY.md.
 *
 * Armada echoes ARMADA_WEBHOOK_KEY (the random secret we sent them at
 * delivery-creation time, NOT ARMADA_API_KEY) back in the Authorization
 * header of every call — verifyArmadaWebhookKey checks it before trusting
 * anything in the body. Fails closed: unset key or no/wrong header both
 * get rejected rather than silently accepted.
 *
 * A delivery is matched back to its order via `armada_delivery_code`
 * (stored at dispatch time — see lib/armada/dispatch.ts), never orders.id,
 * since Armada only ever knows its own delivery id.
 *
 * Runs on the Node.js runtime (default for Route Handlers, pinned
 * explicitly) — webhook key verification needs Node's `crypto` module via
 * lib/armada/client.ts.
 */
export const runtime = "nodejs";

interface ArmadaWebhookPayload {
  code?: string;
  orderStatus?: string;
  driver?: { name?: string; phoneNumber?: string } | null;
  trackingLink?: string | null;
}

export async function POST(request: Request) {
  if (!process.env.ARMADA_WEBHOOK_KEY) {
    return NextResponse.json({ error: "Armada webhook not configured" }, { status: 403 });
  }
  if (!verifyArmadaWebhookKey(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "invalid webhook key" }, { status: 401 });
  }

  let payload: ArmadaWebhookPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const { code, orderStatus, driver, trackingLink } = payload;
  if (!code || !orderStatus) {
    return NextResponse.json({ error: "missing code/orderStatus" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: order, error: lookupError } = await supabase
    .from("orders")
    .select("id, status, order_number")
    .eq("armada_delivery_code", code)
    .maybeSingle();

  if (lookupError) {
    console.error(`[armada webhook] lookup failed for delivery code ${code}`, lookupError);
    return NextResponse.json({ error: lookupError.message }, { status: 500 });
  }
  if (!order) {
    // Not this app's problem to fail loudly over -- Armada retries on
    // non-2xx, and a code we don't recognize (test webhook, stale delivery)
    // will never resolve no matter how many times it's retried.
    console.warn(`[armada webhook] no order for delivery code ${code}`);
    return NextResponse.json({ received: true });
  }

  const { error: updateError } = await supabase
    .from("orders")
    .update({
      armada_delivery_status: orderStatus,
      armada_driver_name: driver?.name ?? null,
      armada_driver_phone: driver?.phoneNumber ?? null,
      armada_tracking_link: trackingLink ?? null,
    })
    .eq("id", order.id);
  if (updateError) {
    console.error(`[armada webhook] failed to update ${order.order_number}`, updateError);
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await recordAuditLog({
    actorId: null,
    actorName: "System (Armada webhook)",
    action: "armada_webhook_status_update",
    entityType: "order",
    entityId: order.id,
    orderId: order.id,
    newValue: { code, orderStatus },
  });

  // Only "completed" drives an actual Prime Flow status change, and only
  // from ready_delivery -- a duplicate/late webhook after the order's
  // already delivered (or moved back to production by a manager override)
  // is a no-op rather than an error, since assertValidTransition would
  // otherwise throw on the second "completed" call for the same delivery.
  if (orderStatus === "completed" && order.status === "ready_delivery") {
    try {
      await applyOrderStatusTransition(supabase, order.id, "delivered", null, "System (Armada webhook)");
    } catch (transitionError) {
      console.error(`[armada webhook] failed to mark ${order.order_number} delivered`, transitionError);
    }
  }

  await broadcast(CHANNELS.production, "order.updated", { orderId: order.id });

  return NextResponse.json({ received: true });
}
