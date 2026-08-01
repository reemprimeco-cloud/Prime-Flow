import crypto from "node:crypto";

import { NextResponse } from "next/server";
import { addDays, format } from "date-fns";

import { createServiceClient } from "@/lib/supabase/server";
import { broadcast, CHANNELS } from "@/lib/realtime/channels";
import { recordAuditLog } from "@/lib/audit/log";
import { notifyAdminOrderStatusChanged, notifyOrderCreated } from "@/lib/notifications/service";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "@/lib/notifications/constants";
import { sanitizePhoneInput } from "@/lib/utils/phone";

/**
 * Auto-imports a WooCommerce order the moment it's placed — configure in
 * WooCommerce: Settings > Advanced > Webhooks > Add webhook, Topic
 * "Order created", Delivery URL
 * https://primeflowboard.netlify.app/api/webhooks/woocommerce, Secret =
 * WOOCOMMERCE_WEBHOOK_SECRET below (must match exactly).
 *
 * WooCommerce doesn't know this shop's print-specific fields (paper, size,
 * finishing) or a requested delivery date/time, and "pickup vs delivery" is
 * only a rough guess from shipping_lines — so every imported order lands as
 * `approved: false`, same "new" gate `updateEmployeeJobStatus` already
 * enforces before Start Production (see STATUS_ENGINE.md). Nothing an
 * employee can act on until the manager opens it, fills in the missing
 * specs, and approves it. `notes` spells out exactly what needs confirming.
 *
 * Runs on the Node.js runtime (default for Route Handlers, pinned
 * explicitly) — signature verification needs Node's `crypto` module.
 */
export const runtime = "nodejs";

interface WooCommerceAddress {
  first_name?: string;
  last_name?: string;
  address_1?: string;
  address_2?: string;
  city?: string;
  state?: string;
  postcode?: string;
  country?: string;
  phone?: string;
}

interface WooCommerceLineItem {
  name: string;
  quantity: number;
}

interface WooCommerceShippingLine {
  method_id?: string;
  method_title?: string;
}

interface WooCommerceOrder {
  id: number;
  number?: string;
  date_created?: string;
  currency?: string;
  total?: string;
  customer_note?: string;
  billing?: WooCommerceAddress;
  shipping?: WooCommerceAddress;
  line_items?: WooCommerceLineItem[];
  shipping_lines?: WooCommerceShippingLine[];
}

function verifySignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(signatureHeader);
  if (expectedBuf.length !== actualBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

function buildAddress(address: WooCommerceAddress | undefined): string {
  if (!address) return "";
  return [address.address_1, address.address_2, address.city, address.state, address.postcode, address.country]
    .filter(Boolean)
    .join(", ");
}

function looksLikeDelivery(shippingLines: WooCommerceShippingLine[] | undefined): boolean {
  if (!shippingLines || shippingLines.length === 0) return false;
  return !shippingLines.some((line) => `${line.method_id ?? ""} ${line.method_title ?? ""}`.toLowerCase().includes("pickup"));
}

export async function POST(request: Request) {
  const secret = process.env.WOOCOMMERCE_WEBHOOK_SECRET;
  const signature = request.headers.get("x-wc-webhook-signature");
  const topic = request.headers.get("x-wc-webhook-topic");
  const rawBody = await request.text();

  if (!secret) {
    console.error("[woocommerce] WOOCOMMERCE_WEBHOOK_SECRET not configured — rejecting webhook");
    return NextResponse.json({ error: "Not configured" }, { status: 403 });
  }
  if (!verifySignature(rawBody, signature, secret)) {
    console.error("[woocommerce] request failed signature verification");
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  // WooCommerce sends a near-empty "ping" payload once when a webhook is
  // first saved, to confirm the URL is reachable — not a real order, and it
  // won't have an id. Acknowledge it without trying to import anything.
  let order: WooCommerceOrder;
  try {
    order = JSON.parse(rawBody);
  } catch {
    console.warn("[woocommerce] payload wasn't valid JSON");
    return NextResponse.json({ received: true });
  }
  if (!order.id) {
    return NextResponse.json({ received: true });
  }

  // Only order.created is wired up — configuring any other topic on the
  // WooCommerce side is a setup mistake, not something to act on silently.
  if (topic && topic !== "order.created") {
    console.warn(`[woocommerce] ignoring unexpected topic "${topic}"`);
    return NextResponse.json({ received: true });
  }

  const lineItems = order.line_items ?? [];
  if (lineItems.length === 0) {
    console.warn(`[woocommerce] order ${order.id} has no line items — skipping import`);
    return NextResponse.json({ received: true });
  }

  const supabase = createServiceClient();

  const { data: admins } = await supabase
    .from("employees")
    .select("id, full_name, phone")
    .eq("role", "admin")
    .eq("active", true)
    .order("created_at", { ascending: true });
  const importingAdmin = admins?.[0];
  if (!importingAdmin) {
    console.error(`[woocommerce] no active admin on file to attribute order ${order.id} to — skipping import`);
    return NextResponse.json({ received: true });
  }

  const billing = order.billing ?? {};
  const customerName = `${billing.first_name ?? ""} ${billing.last_name ?? ""}`.trim() || `WooCommerce Order #${order.number ?? order.id}`;
  const rawPhone = sanitizePhoneInput(billing.phone ?? "");
  const customerMobile = rawPhone || "N/A";
  const whatsappEnabled = rawPhone.length >= 6;

  const isDelivery = looksLikeDelivery(order.shipping_lines);
  const deliveryAddress = isDelivery ? buildAddress(order.shipping) || buildAddress(billing) || null : null;

  const [primaryItem, ...restItems] = lineItems;

  const placeholderDate = format(addDays(new Date(), 2), "yyyy-MM-dd");
  const noteLines = [
    `Imported from WooCommerce order #${order.number ?? order.id}${order.date_created ? ` (placed ${order.date_created})` : ""}.`,
    `Confirm delivery date/time, ${isDelivery ? "delivery address, " : ""}fulfillment type, and print specs (paper, size, finishing) before approving.`,
  ];
  if (order.total) noteLines.push(`Order total: ${order.currency ?? ""} ${order.total}`.trim());
  if (order.customer_note) noteLines.push(`Customer note: "${order.customer_note}"`);
  if (restItems.length > 0) noteLines.push(`Additional items also imported below (${restItems.length}).`);

  const { data: newOrder, error } = await supabase
    .from("orders")
    .insert({
      customer_name: customerName,
      customer_mobile: customerMobile,
      preferred_language: "en",
      whatsapp_enabled: whatsappEnabled,
      preferred_channel: "whatsapp",
      notification_preferences: { ...DEFAULT_NOTIFICATION_PREFERENCES },
      product: primaryItem.name,
      quantity: primaryItem.quantity || 1,
      fulfillment_type: isDelivery ? "delivery" : "pickup",
      priority: "normal",
      delivery_date: placeholderDate,
      delivery_time: "17:00",
      delivery_address: deliveryAddress,
      notes: noteLines.join(" "),
      approved: false,
      created_by: importingAdmin.id,
    })
    .select("id, order_number")
    .single();

  if (error || !newOrder) {
    console.error(`[woocommerce] failed to create order for WooCommerce order ${order.id}`, error);
    return NextResponse.json({ received: true });
  }

  if (restItems.length > 0) {
    await supabase.from("order_items").insert(
      restItems.map((item, index) => ({
        order_id: newOrder.id,
        product: item.name,
        quantity: item.quantity || 1,
        sort_order: index,
      }))
    );
  }

  await supabase.from("order_status_history").insert({
    order_id: newOrder.id,
    from_status: null,
    to_status: "new",
    changed_by: importingAdmin.id,
  });

  await recordAuditLog({
    actorId: importingAdmin.id,
    actorName: "WooCommerce Import",
    action: "order_created",
    entityType: "order",
    entityId: newOrder.id,
    orderId: newOrder.id,
    newValue: { orderNumber: newOrder.order_number, source: "woocommerce", wooOrderId: order.id },
  });

  await notifyOrderCreated(
    {
      orderId: newOrder.id,
      orderNumber: newOrder.order_number,
      customerName,
      customerMobile,
      product: primaryItem.name,
      deliveryDate: placeholderDate,
      deliveryTime: "17:00",
      whatsappEnabled,
      preferredChannel: "whatsapp",
      language: "en",
      notificationPreferences: DEFAULT_NOTIFICATION_PREFERENCES,
    },
    importingAdmin.id,
    "WooCommerce Import"
  );

  // Tell every admin a WooCommerce order just landed and needs their
  // attention — without this the import is silent, and an unapproved order
  // sits on the board with nobody knowing to fill in its specs and assign
  // it. Reuses the admin_order_status_changed template rather than adding a
  // new one: it's already Meta-approved (so it reaches an admin outside the
  // 24h window, see NOTIFICATIONS.md) and its three variables — who acted,
  // which order, what state — fit this exactly.
  for (const admin of admins ?? []) {
    await notifyAdminOrderStatusChanged(
      {
        employeeId: admin.id,
        employeePhone: admin.phone,
        orderId: newOrder.id,
        orderNumber: newOrder.order_number,
        product: primaryItem.name,
        deliveryDate: placeholderDate,
        deliveryTime: "17:00",
        employeeName: "WooCommerce",
        statusLabel: "New — needs specs, assignment, and approval",
      },
      importingAdmin.id,
      "WooCommerce Import"
    );
  }

  await broadcast(CHANNELS.production, "order.created", { orderId: newOrder.id });

  return NextResponse.json({ received: true, orderId: newOrder.id, orderNumber: newOrder.order_number });
}
