"use server";

import { revalidatePath } from "next/cache";

import { createServiceClient } from "@/lib/supabase/server";
import { uploadOrderFiles } from "@/lib/actions/orders";
import { broadcast, CHANNELS } from "@/lib/realtime/channels";
import { recordAuditLog } from "@/lib/audit/log";
import { isDemoMode } from "@/lib/demo/mode";
import { createOrderRequestSchema, type OrderRequestLanguage } from "@/lib/validation/order-request";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "@/lib/notifications/constants";

const DEMO_WRITE_ERROR = "This is a read-only demo — writes are disabled.";

/**
 * PUBLIC — no auth, meant to be linked from a WhatsApp Business auto-reply
 * (Meta's own canned-message/quick-reply feature on the WhatsApp Business
 * App, unrelated to this app's Twilio integration) so a customer can submit
 * a print job themselves without a manager typing it in first.
 *
 * Lands as a normal `new` order, always unapproved (`approved: false` —
 * same production-approval gate every order goes through, see
 * 0017_order_approval.sql). Per that gate, no employee or customer
 * notification fires until a manager actually reviews it and approves
 * (sendOrderApprovedNotifications, lib/actions/orders.ts) — a raw,
 * unvetted public submission should never page a floor employee on its
 * own. `created_by`/`order_files.uploaded_by` are left null: there's no
 * employee actor behind a public submission, unlike every other writer in
 * this app (0023_public_order_request.sql made both columns nullable for
 * exactly this).
 */
export async function submitOrderRequest(formData: FormData): Promise<{ orderNumber: string }> {
  if (isDemoMode()) throw new Error(DEMO_WRITE_ERROR);

  const rawItems = formData.get("items");
  let items: unknown = [];
  if (typeof rawItems === "string" && rawItems.length > 0) {
    try {
      items = JSON.parse(rawItems);
    } catch {
      // fall through with an empty array — validated (and rejected if malformed) by the schema below
    }
  }

  const language: OrderRequestLanguage = formData.get("preferredLanguage") === "en" ? "en" : "ar";
  const parsed = createOrderRequestSchema(language).safeParse({
    customerName: formData.get("customerName"),
    customerMobile: formData.get("customerMobile"),
    product: formData.get("product"),
    paper: formData.get("paper") || undefined,
    paperSize: formData.get("paperSize") || undefined,
    quantity: formData.get("quantity"),
    finishing: formData.get("finishing") || undefined,
    fulfillmentType: formData.get("fulfillmentType"),
    deliveryDate: formData.get("deliveryDate"),
    deliveryTime: formData.get("deliveryTime"),
    deliveryAddress: formData.get("deliveryAddress") || undefined,
    deliveryMapLink: formData.get("deliveryMapLink") || undefined,
    notes: formData.get("notes") || undefined,
    items,
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid order request");
  }
  const input = parsed.data;

  const supabase = createServiceClient();

  const { data: order, error } = await supabase
    .from("orders")
    .insert({
      customer_name: input.customerName,
      customer_mobile: input.customerMobile,
      preferred_language: language,
      whatsapp_enabled: true,
      preferred_channel: "whatsapp",
      notification_preferences: DEFAULT_NOTIFICATION_PREFERENCES as never,
      product: input.product,
      paper: input.paper || null,
      paper_size: input.paperSize || null,
      quantity: input.quantity,
      finishing: input.finishing || null,
      fulfillment_type: input.fulfillmentType,
      priority: "normal",
      delivery_date: input.deliveryDate,
      delivery_time: input.deliveryTime,
      delivery_address: input.deliveryAddress || null,
      delivery_map_link: input.deliveryMapLink || null,
      notes: input.notes || null,
      approved: false,
      created_by: null,
    })
    .select("id, order_number")
    .single();
  if (error || !order) throw new Error(error?.message ?? "Failed to submit request");

  if (input.items.length > 0) {
    const { error: itemsError } = await supabase.from("order_items").insert(
      input.items.map((item, index) => ({
        order_id: order.id,
        product: item.product,
        paper: item.paper || null,
        paper_size: item.paperSize || null,
        quantity: item.quantity,
        finishing: item.finishing || null,
        sort_order: index,
      }))
    );
    if (itemsError) throw new Error(itemsError.message);
  }

  await supabase.from("order_status_history").insert({
    order_id: order.id,
    from_status: null,
    to_status: "new",
    changed_by: null,
  });

  await uploadOrderFiles(supabase, order.id, null, formData);

  await recordAuditLog({
    actorId: null,
    actorName: `${input.customerName} (order request form)`,
    action: "order_created",
    entityType: "order",
    entityId: order.id,
    orderId: order.id,
    newValue: { orderNumber: order.order_number, product: input.product, deliveryDate: input.deliveryDate },
  });

  await broadcast(CHANNELS.production, "order.created", { orderId: order.id });
  revalidatePath("/dashboard");

  return { orderNumber: order.order_number };
}
