import "server-only";

import { addDays, format } from "date-fns";

import { createServiceClient } from "@/lib/supabase/server";
import { broadcast, CHANNELS } from "@/lib/realtime/channels";
import { recordAuditLog } from "@/lib/audit/log";
import { notifyAdminOrderStatusChanged, notifyOrderCreated } from "@/lib/notifications/service";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "@/lib/notifications/constants";
import { sanitizePhoneInput } from "@/lib/utils/phone";
import { fetchCustomer, fetchInvoice, loadTokens, type QboAddress, type QboCustomer, type QboInvoice } from "@/lib/quickbooks/client";

/**
 * Turns a QuickBooks invoice into an order on the board — the
 * QuickBooks counterpart of app/api/webhooks/woocommerce/route.ts, and it
 * lands the same way: `new`, `approved: false`, with `notes` spelling out
 * what the manager still has to confirm before approving. Nothing an
 * employee can act on until then. See docs/QUICKBOOKS.md.
 *
 * Every invoice is imported as soon as QuickBooks reports it, paid or not
 * (the shop's call: the job starts on the invoice, and the payment gateway
 * settles the balance later). The notes carry the payment state so the
 * manager sees an outstanding balance before approving.
 */

type ServiceClient = ReturnType<typeof createServiceClient>;

export interface QuickBooksWebhookPayload {
  eventNotifications?: {
    realmId?: string;
    dataChangeEvent?: {
      entities?: { name?: string; id?: string; operation?: string }[];
    };
  }[];
}

export interface MappedOrder {
  customerName: string;
  customerMobile: string;
  whatsappEnabled: boolean;
  product: string;
  quantity: number;
  finishing: string | null;
  items: { product: string; quantity: number; finishing: string | null }[];
  fulfillmentType: "pickup" | "delivery";
  deliveryAddress: string | null;
  deliveryDate: string;
  deliveryTime: string;
  notes: string;
}

/** QuickBooks' built-in shipping line uses this fixed item id regardless of what the item is named. */
const SHIPPING_ITEM_ID = "SHIPPING_ITEM_ID";
const DELIVERY_TIME = "17:00";

function buildAddress(address: QboAddress | undefined): string {
  if (!address) return "";
  return [address.Line1, address.Line2, address.Line3, address.Line4, address.Line5, address.City, address.CountrySubDivisionCode, address.PostalCode, address.Country]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(", ");
}

function isShippingLine(line: NonNullable<QboInvoice["Line"]>[number]): boolean {
  const item = line.SalesItemLineDetail?.ItemRef;
  if (!item) return false;
  return item.value === SHIPPING_ITEM_ID || /\b(shipping|delivery)\b/i.test(item.name ?? "");
}

/**
 * Order numbers like "#1106" written into the invoice's memo/note — the
 * convention for "this invoice is for an order that's already on the board"
 * (a website order, say), which must not be imported a second time.
 */
export function findReferencedOrderNumbers(invoice: QboInvoice): string[] {
  const text = [invoice.CustomerMemo?.value, invoice.PrivateNote].filter(Boolean).join(" ");
  return [...new Set([...text.matchAll(/#(\d{3,})/g)].map((m) => `#${m[1]}`))];
}

/** Pure mapping from invoice + customer to the order we'd insert — no I/O, so it's unit-testable on its own. */
export function mapInvoiceToOrder(invoice: QboInvoice, customer: QboCustomer | null): MappedOrder | null {
  const lines = invoice.Line ?? [];
  const productLines = lines.filter((line) => line.DetailType === "SalesItemLineDetail" && !isShippingLine(line));
  if (productLines.length === 0) return null;

  const toItem = (line: (typeof productLines)[number]) => {
    const detail = line.SalesItemLineDetail;
    const product = detail?.ItemRef?.name?.trim() || line.Description?.trim() || "QuickBooks item";
    const description = line.Description?.trim() || null;
    return {
      product,
      quantity: Math.max(1, Math.round(detail?.Qty ?? 1)),
      // The line description is where the specs get typed on the invoice
      // (size, paper, finishing) — it maps onto the order's free-text
      // "Order Details" field. Dropped when it just repeats the item name.
      finishing: description && description !== product ? description : null,
    };
  };
  const [primary, ...rest] = productLines.map(toItem);

  const hasShippingLine = lines.some(isShippingLine);
  const shipMethod = invoice.ShipMethodRef?.name ?? "";
  const shipAddress = buildAddress(invoice.ShipAddr);
  // QuickBooks copies the customer's default shipping address onto every
  // invoice, so an address alone doesn't prove it's a delivery — a shipping
  // line or a non-pickup ship method does. With neither, fall back to the
  // address being there at all; the notes tell the manager to confirm.
  const isDelivery = hasShippingLine || (shipMethod ? !/pick\s*-?\s*up|استلام/i.test(shipMethod) : shipAddress.length > 0);

  const rawPhone = sanitizePhoneInput(customer?.Mobile?.FreeFormNumber ?? customer?.PrimaryPhone?.FreeFormNumber ?? "");
  const docNumber = invoice.DocNumber ?? invoice.Id;
  const customerName = invoice.CustomerRef?.name?.trim() || customer?.DisplayName?.trim() || `QuickBooks Invoice #${docNumber}`;

  const today = format(new Date(), "yyyy-MM-dd");
  const shipDate = invoice.ShipDate && /^\d{4}-\d{2}-\d{2}$/.test(invoice.ShipDate) && invoice.ShipDate >= today ? invoice.ShipDate : null;
  const deliveryDate = shipDate ?? format(addDays(new Date(), 2), "yyyy-MM-dd");

  const balance = invoice.Balance ?? 0;
  const currency = invoice.CurrencyRef?.value ?? "KWD";
  const paymentState = balance > 0 ? `NOT PAID (balance ${currency} ${balance})` : "paid";
  const noteLines = [
    `Imported from QuickBooks invoice #${docNumber}${invoice.TxnDate ? ` (dated ${invoice.TxnDate})` : ""} — ${paymentState}.`,
    `Confirm ${shipDate ? "" : "delivery date/time, "}${isDelivery ? "delivery address, " : ""}fulfillment type, and print specs (paper, size, finishing) before approving.`,
  ];
  if (invoice.TotalAmt != null) noteLines.push(`Invoice total: ${currency} ${invoice.TotalAmt}`);
  if (invoice.CustomerMemo?.value?.trim()) noteLines.push(`Customer memo: "${invoice.CustomerMemo.value.trim()}"`);
  if (rest.length > 0) noteLines.push(`Additional items also imported below (${rest.length}).`);

  return {
    customerName,
    customerMobile: rawPhone || "N/A",
    whatsappEnabled: rawPhone.length >= 6,
    product: primary.product,
    quantity: primary.quantity,
    finishing: primary.finishing,
    items: rest,
    fulfillmentType: isDelivery ? "delivery" : "pickup",
    deliveryAddress: isDelivery ? shipAddress || buildAddress(customer?.ShipAddr) || buildAddress(invoice.BillAddr) || null : null,
    deliveryDate,
    deliveryTime: DELIVERY_TIME,
    notes: noteLines.join(" "),
  };
}

/** One webhook delivery can carry several entities; only Invoice create/update events matter here. */
export async function processQuickBooksWebhook(payload: QuickBooksWebhookPayload): Promise<void> {
  for (const notification of payload.eventNotifications ?? []) {
    const realmId = notification.realmId;
    for (const entity of notification.dataChangeEvent?.entities ?? []) {
      if (entity.name !== "Invoice" || !entity.id || !realmId) continue;
      if (entity.operation !== "Create" && entity.operation !== "Update") continue;
      try {
        await importInvoice(createServiceClient(), realmId, entity.id);
      } catch (error) {
        console.error(`[quickbooks] import failed for invoice ${entity.id}`, error);
      }
    }
  }
}

export type ImportInvoiceResult =
  | { status: "imported"; orderNumber: string }
  | { status: "already_imported"; orderNumber: string }
  | { status: "skipped"; reason: string };

export async function importInvoice(supabase: ServiceClient, realmId: string, invoiceId: string): Promise<ImportInvoiceResult> {
  const tokens = await loadTokens(supabase);
  if (!tokens) {
    console.warn(`[quickbooks] webhook received but QuickBooks isn't connected — skipping invoice ${invoiceId}`);
    return { status: "skipped", reason: "QuickBooks is not connected" };
  }
  if (tokens.realmId !== realmId) {
    console.warn(`[quickbooks] ignoring webhook for a different company (${realmId})`);
    return { status: "skipped", reason: "Invoice belongs to a different QuickBooks company" };
  }

  // Cheapest check first: this invoice already produced an order. QuickBooks
  // fires an update event for every change (sent, paid, closed, edited), so
  // this path runs far more often than a real import.
  const { data: existing } = await supabase
    .from("orders")
    .select("order_number")
    .eq("source", "quickbooks")
    .eq("source_ref", invoiceId)
    .maybeSingle();
  if (existing) return { status: "already_imported", orderNumber: existing.order_number };

  const invoice = await fetchInvoice(supabase, invoiceId);
  if (!invoice) return { status: "skipped", reason: "Invoice not found in QuickBooks" };

  const referenced = findReferencedOrderNumbers(invoice);
  if (referenced.length > 0) {
    const { data: known } = await supabase.from("orders").select("order_number").in("order_number", referenced);
    if (known && known.length > 0) {
      const numbers = known.map((o) => o.order_number).join(", ");
      console.info(`[quickbooks] invoice ${invoiceId} references existing order ${numbers} — not importing`);
      return { status: "skipped", reason: `Invoice memo references existing order ${numbers}` };
    }
  }

  const customer = invoice.CustomerRef?.value ? await fetchCustomer(supabase, invoice.CustomerRef.value).catch(() => null) : null;
  const mapped = mapInvoiceToOrder(invoice, customer);
  if (!mapped) {
    console.warn(`[quickbooks] invoice ${invoiceId} has no product lines — skipping import`);
    return { status: "skipped", reason: "Invoice has no product lines" };
  }

  const { data: admins } = await supabase
    .from("employees")
    .select("id, full_name, phone")
    .eq("role", "admin")
    .eq("active", true)
    .order("created_at", { ascending: true });
  const importingAdmin = admins?.[0];
  if (!importingAdmin) {
    console.error(`[quickbooks] no active admin on file to attribute invoice ${invoiceId} to — skipping import`);
    return { status: "skipped", reason: "No active admin to attribute the order to" };
  }

  const { data: newOrder, error } = await supabase
    .from("orders")
    .insert({
      customer_name: mapped.customerName,
      customer_mobile: mapped.customerMobile,
      preferred_language: "en",
      whatsapp_enabled: mapped.whatsappEnabled,
      preferred_channel: "whatsapp",
      notification_preferences: { ...DEFAULT_NOTIFICATION_PREFERENCES },
      product: mapped.product,
      quantity: mapped.quantity,
      finishing: mapped.finishing,
      fulfillment_type: mapped.fulfillmentType,
      priority: "normal",
      delivery_date: mapped.deliveryDate,
      delivery_time: mapped.deliveryTime,
      delivery_address: mapped.deliveryAddress,
      notes: mapped.notes,
      approved: false,
      created_by: importingAdmin.id,
      source: "quickbooks",
      source_ref: invoiceId,
    })
    .select("id, order_number")
    .single();

  if (error || !newOrder) {
    // 23505 = the unique (source, source_ref) index: a second delivery for
    // the same invoice raced past the check above. Already imported — done.
    if (error?.code === "23505") {
      const { data: raced } = await supabase.from("orders").select("order_number").eq("source", "quickbooks").eq("source_ref", invoiceId).maybeSingle();
      return { status: "already_imported", orderNumber: raced?.order_number ?? "?" };
    }
    console.error(`[quickbooks] failed to create order for invoice ${invoiceId}`, error);
    return { status: "skipped", reason: error?.message ?? "Could not create the order" };
  }

  if (mapped.items.length > 0) {
    await supabase.from("order_items").insert(
      mapped.items.map((item, index) => ({
        order_id: newOrder.id,
        product: item.product,
        quantity: item.quantity,
        finishing: item.finishing,
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
    actorName: "QuickBooks Import",
    action: "order_created",
    entityType: "order",
    entityId: newOrder.id,
    orderId: newOrder.id,
    newValue: { orderNumber: newOrder.order_number, source: "quickbooks", invoiceId, docNumber: invoice.DocNumber ?? null },
  });

  await notifyOrderCreated(
    {
      orderId: newOrder.id,
      orderNumber: newOrder.order_number,
      customerName: mapped.customerName,
      customerMobile: mapped.customerMobile,
      product: mapped.product,
      deliveryDate: mapped.deliveryDate,
      deliveryTime: mapped.deliveryTime,
      whatsappEnabled: mapped.whatsappEnabled,
      preferredChannel: "whatsapp",
      language: "en",
      notificationPreferences: DEFAULT_NOTIFICATION_PREFERENCES,
    },
    importingAdmin.id,
    "QuickBooks Import"
  );

  for (const admin of admins ?? []) {
    await notifyAdminOrderStatusChanged(
      {
        employeeId: admin.id,
        employeePhone: admin.phone,
        orderId: newOrder.id,
        orderNumber: newOrder.order_number,
        customerName: mapped.customerName,
        product: mapped.product,
        deliveryDate: mapped.deliveryDate,
        deliveryTime: mapped.deliveryTime,
        employeeName: "QuickBooks",
        statusLabel: "Paid — needs specs, assignment, and approval",
      },
      importingAdmin.id,
      "QuickBooks Import"
    );
  }

  await broadcast(CHANNELS.production, "order.created", { orderId: newOrder.id });
  return { status: "imported", orderNumber: newOrder.order_number };
}
