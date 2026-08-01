import crypto from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockBroadcast, mockRecordAuditLog, mockNotifyOrderCreated } = vi.hoisted(() => ({
  mockBroadcast: vi.fn(async () => {}),
  mockRecordAuditLog: vi.fn(async () => {}),
  mockNotifyOrderCreated: vi.fn(async () => {}),
}));

vi.mock("@/lib/audit/log", () => ({ recordAuditLog: mockRecordAuditLog }));
vi.mock("@/lib/notifications/service", () => ({ notifyOrderCreated: mockNotifyOrderCreated }));
vi.mock("@/lib/realtime/channels", () => ({
  broadcast: mockBroadcast,
  CHANNELS: { production: "production", materialRequests: "material-requests", notifications: "notifications" },
}));

type Response_ = { data: unknown; error: unknown };
let tableResponses: Record<string, Response_[]> = {};
let tableCallCounts: Record<string, number> = {};
let insertedRows: Record<string, unknown[]> = {};

function resetSupabaseMock(responses: Record<string, Response_[]>) {
  tableResponses = responses;
  tableCallCounts = {};
  insertedRows = {};
}

function makeBuilder(table: string, result: Response_) {
  const builder: Record<string, unknown> = {
    select: () => builder,
    insert: (rows: unknown) => {
      insertedRows[table] = [...(insertedRows[table] ?? []), rows];
      return builder;
    },
    eq: () => builder,
    order: () => builder,
    limit: () => builder,
    single: () => builder,
    maybeSingle: () => builder,
    then: (resolve: (v: Response_) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      const queue = tableResponses[table] ?? [];
      const idx = tableCallCounts[table] ?? 0;
      tableCallCounts[table] = idx + 1;
      return makeBuilder(table, queue[idx] ?? { data: null, error: null });
    },
  }),
}));

import { POST } from "./route";

const SECRET = "woo-test-secret";

const WOO_ORDER = {
  id: 4412,
  number: "4412",
  date_created: "2026-08-01T10:00:00",
  currency: "KWD",
  total: "45.500",
  customer_note: "Please match the brand blue exactly.",
  billing: { first_name: "Hanan", last_name: "Al-Fadhli", phone: "+965 9994 0535", city: "Hawalli", country: "KW" },
  shipping: { address_1: "Block 9, Street 908", address_2: "House 4", city: "Abdullah Mubarak", country: "KW" },
  line_items: [
    { name: "Water Bottle Labels", quantity: 160 },
    { name: "Gift Box Stickers", quantity: 50 },
  ],
  shipping_lines: [{ method_id: "flat_rate", method_title: "Flat rate" }],
};

function makeRequest(body: unknown, { secret = SECRET, topic = "order.created" as string | null, signature }: { secret?: string; topic?: string | null; signature?: string } = {}) {
  const rawBody = typeof body === "string" ? body : JSON.stringify(body);
  const sig = signature ?? crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
  const headers: Record<string, string> = { "x-wc-webhook-signature": sig };
  if (topic) headers["x-wc-webhook-topic"] = topic;
  return new Request("https://primeflowboard.netlify.app/api/webhooks/woocommerce", {
    method: "POST",
    headers,
    body: rawBody,
  });
}

function withAdminAndInsert(orderRow: unknown = { id: "order-new", order_number: "#1029" }) {
  return {
    employees: [{ data: { id: "admin-1", full_name: "Reem" }, error: null }],
    orders: [{ data: orderRow, error: null }],
    order_items: [{ data: null, error: null }],
    order_status_history: [{ data: null, error: null }],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.WOOCOMMERCE_WEBHOOK_SECRET = SECRET;
  resetSupabaseMock({});
});

describe("WooCommerce order webhook", () => {
  it("rejects a request with an invalid signature", async () => {
    const response = await POST(makeRequest(WOO_ORDER, { signature: "not-the-real-signature" }));

    expect(response.status).toBe(403);
    expect(insertedRows.orders).toBeUndefined();
  });

  it("rejects a request signed with the wrong secret", async () => {
    const response = await POST(makeRequest(WOO_ORDER, { secret: "some-other-secret" }));

    expect(response.status).toBe(403);
    expect(insertedRows.orders).toBeUndefined();
  });

  it("rejects when no webhook secret is configured", async () => {
    delete process.env.WOOCOMMERCE_WEBHOOK_SECRET;

    const response = await POST(makeRequest(WOO_ORDER));

    expect(response.status).toBe(403);
  });

  it("creates an unapproved order from a valid signed payload", async () => {
    resetSupabaseMock(withAdminAndInsert());

    const response = await POST(makeRequest(WOO_ORDER));

    expect(response.status).toBe(200);
    const inserted = insertedRows.orders?.[0] as Record<string, unknown>;
    expect(inserted).toMatchObject({
      customer_name: "Hanan Al-Fadhli",
      customer_mobile: "+965 9994 0535",
      product: "Water Bottle Labels",
      quantity: 160,
      fulfillment_type: "delivery",
      approved: false,
      created_by: "admin-1",
    });
    expect(inserted.notes).toContain("#4412");
    expect(inserted.notes).toContain("Please match the brand blue exactly.");
    expect(mockBroadcast).toHaveBeenCalledWith("production", "order.created", { orderId: "order-new" });
  });

  it("imports line items beyond the first as additional order items", async () => {
    resetSupabaseMock(withAdminAndInsert());

    await POST(makeRequest(WOO_ORDER));

    expect(insertedRows.order_items?.[0]).toEqual([
      expect.objectContaining({ order_id: "order-new", product: "Gift Box Stickers", quantity: 50 }),
    ]);
  });

  it("treats a pickup shipping method as a pickup order with no delivery address", async () => {
    resetSupabaseMock(withAdminAndInsert());

    await POST(
      makeRequest({ ...WOO_ORDER, shipping_lines: [{ method_id: "local_pickup", method_title: "Local pickup" }] })
    );

    const inserted = insertedRows.orders?.[0] as Record<string, unknown>;
    expect(inserted.fulfillment_type).toBe("pickup");
    expect(inserted.delivery_address).toBeNull();
  });

  it("disables WhatsApp when the billing phone is missing rather than sending to a junk number", async () => {
    resetSupabaseMock(withAdminAndInsert());

    await POST(makeRequest({ ...WOO_ORDER, billing: { first_name: "Hanan", last_name: "Al-Fadhli" } }));

    const inserted = insertedRows.orders?.[0] as Record<string, unknown>;
    expect(inserted.whatsapp_enabled).toBe(false);
    expect(inserted.customer_mobile).toBe("N/A");
  });

  it("strips invisible formatting characters from a pasted billing phone", async () => {
    resetSupabaseMock(withAdminAndInsert());

    await POST(makeRequest({ ...WOO_ORDER, billing: { ...WOO_ORDER.billing, phone: "‪+96599940535‬" } }));

    const inserted = insertedRows.orders?.[0] as Record<string, unknown>;
    expect(inserted.customer_mobile).toBe("+96599940535");
  });

  it("acknowledges WooCommerce's setup ping without importing anything", async () => {
    resetSupabaseMock(withAdminAndInsert());

    const response = await POST(makeRequest({ webhook_id: 7 }, { topic: null }));

    expect(response.status).toBe(200);
    expect(insertedRows.orders).toBeUndefined();
  });

  it("ignores a topic other than order.created", async () => {
    resetSupabaseMock(withAdminAndInsert());

    await POST(makeRequest(WOO_ORDER, { topic: "order.updated" }));

    expect(insertedRows.orders).toBeUndefined();
  });

  it("skips an order with no line items rather than creating a productless order", async () => {
    resetSupabaseMock(withAdminAndInsert());

    await POST(makeRequest({ ...WOO_ORDER, line_items: [] }));

    expect(insertedRows.orders).toBeUndefined();
  });

  it("skips the import when there's no active admin to attribute the order to", async () => {
    resetSupabaseMock({ employees: [{ data: null, error: null }] });

    const response = await POST(makeRequest(WOO_ORDER));

    expect(response.status).toBe(200);
    expect(insertedRows.orders).toBeUndefined();
  });

  it("still returns 200 when the order insert fails, so WooCommerce doesn't retry forever", async () => {
    resetSupabaseMock({
      employees: [{ data: { id: "admin-1", full_name: "Reem" }, error: null }],
      orders: [{ data: null, error: { message: "insert exploded" } }],
    });

    const response = await POST(makeRequest(WOO_ORDER));

    expect(response.status).toBe(200);
    expect(mockBroadcast).not.toHaveBeenCalled();
  });
});
