import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockBroadcast, mockRecordAuditLog, mockNotifyOrderCreated, mockNotifyAdminOrderStatusChanged, mockLoadTokens, mockFetchInvoice, mockFetchCustomer } =
  vi.hoisted(() => ({
    mockBroadcast: vi.fn(async () => {}),
    mockRecordAuditLog: vi.fn(async () => {}),
    mockNotifyOrderCreated: vi.fn(async () => {}),
    mockNotifyAdminOrderStatusChanged: vi.fn(async () => {}),
    mockLoadTokens: vi.fn(),
    mockFetchInvoice: vi.fn(),
    mockFetchCustomer: vi.fn(),
  }));

vi.mock("@/lib/audit/log", () => ({ recordAuditLog: mockRecordAuditLog }));
vi.mock("@/lib/notifications/service", () => ({
  notifyOrderCreated: mockNotifyOrderCreated,
  notifyAdminOrderStatusChanged: mockNotifyAdminOrderStatusChanged,
}));
vi.mock("@/lib/realtime/channels", () => ({
  broadcast: mockBroadcast,
  CHANNELS: { production: "production" },
}));
vi.mock("@/lib/quickbooks/client", () => ({
  loadTokens: mockLoadTokens,
  fetchInvoice: mockFetchInvoice,
  fetchCustomer: mockFetchCustomer,
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
    in: () => builder,
    order: () => builder,
    single: () => builder,
    maybeSingle: () => builder,
    then: (resolve: (v: Response_) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(result).then(resolve, reject),
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

import { createServiceClient } from "@/lib/supabase/server";
import { findReferencedOrderNumbers, importInvoice, mapInvoiceToOrder, processQuickBooksWebhook } from "@/lib/quickbooks/import";
import type { QboCustomer, QboInvoice } from "@/lib/quickbooks/client";

const PAID_INVOICE: QboInvoice = {
  Id: "6107",
  DocNumber: "2518",
  TxnDate: "2026-10-01",
  TotalAmt: 45.5,
  Balance: 0,
  CurrencyRef: { value: "KWD" },
  CustomerRef: { value: "77", name: "Hanan Al-Fadhli" },
  CustomerMemo: { value: "Match the brand blue." },
  ShipAddr: { Line1: "Block 9, Street 908", City: "Abdullah Mubarak", Country: "Kuwait" },
  Line: [
    { DetailType: "SalesItemLineDetail", Description: "A5, 300gsm matte, two sides", Amount: 40, SalesItemLineDetail: { ItemRef: { value: "1", name: "Flyers" }, Qty: 500 } },
    { DetailType: "SalesItemLineDetail", Description: "Gift Box Stickers", Amount: 5.5, SalesItemLineDetail: { ItemRef: { value: "2", name: "Gift Box Stickers" }, Qty: 50 } },
    { DetailType: "SubTotalLineDetail", Amount: 45.5 },
  ],
};

const CUSTOMER: QboCustomer = { Id: "77", DisplayName: "Hanan Al-Fadhli", Mobile: { FreeFormNumber: "+965 9994 0535" } };

function withAdminAndInsert(orderRow: unknown = { id: "order-new", order_number: "#1120" }) {
  return {
    orders: [
      { data: null, error: null }, // already-imported check
      { data: orderRow, error: null }, // insert
    ],
    employees: [{ data: [{ id: "admin-1", full_name: "Reem", phone: "+96565068000" }], error: null }],
    order_items: [{ data: null, error: null }],
    order_status_history: [{ data: null, error: null }],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetSupabaseMock({});
  mockLoadTokens.mockResolvedValue({ realmId: "123", accessToken: "t", refreshToken: "r", accessExpiresAt: "", refreshExpiresAt: "" });
  mockFetchInvoice.mockResolvedValue(PAID_INVOICE);
  mockFetchCustomer.mockResolvedValue(CUSTOMER);
});

describe("mapInvoiceToOrder", () => {
  it("maps the first product line to the order and the rest to items, with the line description as the order details", () => {
    const mapped = mapInvoiceToOrder(PAID_INVOICE, CUSTOMER)!;
    expect(mapped).toMatchObject({
      customerName: "Hanan Al-Fadhli",
      customerMobile: "+965 9994 0535",
      whatsappEnabled: true,
      product: "Flyers",
      quantity: 500,
      finishing: "A5, 300gsm matte, two sides",
      items: [{ product: "Gift Box Stickers", quantity: 50, finishing: null }],
      deliveryTime: "17:00",
    });
    expect(mapped.notes).toBe("QuickBooks invoice #2518: PAID");
  });

  it("treats a Ship To address with no ship method as a delivery, and no address as pickup", () => {
    expect(mapInvoiceToOrder(PAID_INVOICE, CUSTOMER)).toMatchObject({
      fulfillmentType: "delivery",
      deliveryAddress: "Block 9, Street 908, Abdullah Mubarak, Kuwait",
    });
    expect(mapInvoiceToOrder({ ...PAID_INVOICE, ShipAddr: undefined }, CUSTOMER)).toMatchObject({ fulfillmentType: "pickup", deliveryAddress: null });
  });

  it("treats an address holding only the customer's name and phone as no address (pickup)", () => {
    const invoice = { ...PAID_INVOICE, CustomerRef: { value: "1", name: "ايمان الساعي" }, ShipAddr: { Line1: "ايمان الساعي", Line2: "9751 8893" } };
    expect(mapInvoiceToOrder(invoice, null)).toMatchObject({ fulfillmentType: "pickup", deliveryAddress: null });

    const withArea = { ...invoice, ShipAddr: { Line1: "ايمان الساعي", Line2: "SOK - Inda", Line3: "6766 6393" } };
    expect(mapInvoiceToOrder(withArea, null)).toMatchObject({ fulfillmentType: "delivery", deliveryAddress: "SOK - Inda" });
  });

  it("strips the QuickBooks category prefix from sub-item names and drops a terms-and-conditions memo", () => {
    const line = PAID_INVOICE.Line![0];
    const invoice = {
      ...PAID_INVOICE,
      Line: [{ ...line, SalesItemLineDetail: { ...line.SalesItemLineDetail, ItemRef: { value: "9", name: "packaging:Paper Bag" } } }],
      CustomerMemo: { value: "الشروط والأحكام: ".padEnd(400, "قد يحدث فرق في الألوان بين البروفة والطباعة النهائية. ") },
    };
    const mapped = mapInvoiceToOrder(invoice, CUSTOMER);
    expect(mapped?.product).toBe("Paper Bag");
    expect(mapped?.notes).toBe("QuickBooks invoice #2518: PAID");
  });

  it("a shipping line forces delivery and isn't imported as a product; a pickup ship method forces pickup", () => {
    const withShipping: QboInvoice = {
      ...PAID_INVOICE,
      Line: [...PAID_INVOICE.Line!, { DetailType: "SalesItemLineDetail", Amount: 2, SalesItemLineDetail: { ItemRef: { value: "SHIPPING_ITEM_ID", name: "Shipping" }, Qty: 1 } }],
    };
    const mapped = mapInvoiceToOrder(withShipping, CUSTOMER)!;
    expect(mapped.fulfillmentType).toBe("delivery");
    expect(mapped.items.map((i) => i.product)).toEqual(["Gift Box Stickers"]);

    expect(mapInvoiceToOrder({ ...PAID_INVOICE, ShipMethodRef: { value: "1", name: "Store Pickup" } }, CUSTOMER)).toMatchObject({ fulfillmentType: "pickup" });
  });

  it("falls back to a placeholder when the customer has no phone, and uses a future ShipDate as the delivery date", () => {
    const mapped = mapInvoiceToOrder({ ...PAID_INVOICE, ShipDate: "2099-01-15" }, { Id: "77", DisplayName: "No Phone" })!;
    expect(mapped).toMatchObject({ customerMobile: "N/A", whatsappEnabled: false, deliveryDate: "2099-01-15" });
  });

  it("returns null for an invoice with no product lines", () => {
    expect(mapInvoiceToOrder({ ...PAID_INVOICE, Line: [{ DetailType: "SubTotalLineDetail" }] }, CUSTOMER)).toBeNull();
  });
});

describe("findReferencedOrderNumbers", () => {
  it("pulls board order numbers out of the memo and private note", () => {
    expect(findReferencedOrderNumbers({ Id: "1", CustomerMemo: { value: "Website order #1106" }, PrivateNote: "see #1106 and #1107" })).toEqual(["#1106", "#1107"]);
    expect(findReferencedOrderNumbers({ Id: "1" })).toEqual([]);
  });
});

describe("importInvoice", () => {
  it("imports a paid invoice as a new unapproved order tagged with the invoice id", async () => {
    resetSupabaseMock(withAdminAndInsert());

    await importInvoice(createServiceClient(), "123", "6107");

    expect(mockFetchInvoice).toHaveBeenCalledWith(expect.anything(), "6107");
    expect(mockFetchCustomer).toHaveBeenCalledWith(expect.anything(), "77");
    expect(insertedRows.orders?.[0]).toMatchObject({
      customer_name: "Hanan Al-Fadhli",
      customer_mobile: "+965 9994 0535",
      product: "Flyers",
      quantity: 500,
      finishing: "A5, 300gsm matte, two sides",
      fulfillment_type: "delivery",
      approved: false,
      created_by: "admin-1",
      source: "quickbooks",
      source_ref: "6107",
    });
    expect(insertedRows.order_items?.[0]).toEqual([{ order_id: "order-new", product: "Gift Box Stickers", quantity: 50, finishing: null, sort_order: 0 }]);
    expect(insertedRows.order_status_history?.[0]).toMatchObject({ order_id: "order-new", from_status: null, to_status: "new" });
    expect(mockRecordAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "order_created", actorName: "QuickBooks Import", newValue: expect.objectContaining({ source: "quickbooks", invoiceId: "6107" }) }));
    // No admin WhatsApp/push for imports — the board update is the signal.
    expect(mockNotifyAdminOrderStatusChanged).not.toHaveBeenCalled();
    expect(mockBroadcast).toHaveBeenCalledWith("production", "order.created", { orderId: "order-new" });
  });

  it("imports an unpaid invoice too, flagging the outstanding balance in the notes", async () => {
    resetSupabaseMock(withAdminAndInsert());
    mockFetchInvoice.mockResolvedValue({ ...PAID_INVOICE, Balance: 45.5 });

    await importInvoice(createServiceClient(), "123", "6107");

    expect(insertedRows.orders?.[0]).toMatchObject({ source: "quickbooks", source_ref: "6107" });
    expect((insertedRows.orders?.[0] as { notes: string }).notes).toBe("QuickBooks invoice #2518: NOT PAID — balance KWD 45.5");
  });

  it("does nothing when the invoice was already imported", async () => {
    resetSupabaseMock({ orders: [{ data: { order_number: "#1120" }, error: null }] });

    await importInvoice(createServiceClient(), "123", "6107");

    expect(mockFetchInvoice).not.toHaveBeenCalled();
    expect(insertedRows.orders).toBeUndefined();
  });

  it("skips an invoice whose memo names an order that's already on the board", async () => {
    resetSupabaseMock({
      orders: [
        { data: null, error: null }, // already-imported check
        { data: [{ order_number: "#1106" }], error: null }, // referenced order lookup
      ],
    });
    mockFetchInvoice.mockResolvedValue({ ...PAID_INVOICE, CustomerMemo: { value: "Website order #1106" } });

    await importInvoice(createServiceClient(), "123", "6107");

    expect(insertedRows.orders).toBeUndefined();
  });

  it("ignores webhooks for a company other than the connected one, and when nothing is connected", async () => {
    resetSupabaseMock(withAdminAndInsert());
    await importInvoice(createServiceClient(), "999", "6107");
    expect(mockFetchInvoice).not.toHaveBeenCalled();

    mockLoadTokens.mockResolvedValue(null);
    await importInvoice(createServiceClient(), "123", "6107");
    expect(mockFetchInvoice).not.toHaveBeenCalled();
  });

  it("treats the unique-index conflict from a racing duplicate delivery as already imported", async () => {
    resetSupabaseMock({
      orders: [
        { data: null, error: null },
        { data: null, error: { code: "23505", message: "duplicate key" } },
      ],
      employees: [{ data: [{ id: "admin-1", full_name: "Reem", phone: null }], error: null }],
    });

    await importInvoice(createServiceClient(), "123", "6107");

    expect(mockRecordAuditLog).not.toHaveBeenCalled();
    expect(mockNotifyAdminOrderStatusChanged).not.toHaveBeenCalled();
  });
});

describe("processQuickBooksWebhook", () => {
  it("imports each created/updated invoice in the payload and ignores other entities and operations", async () => {
    resetSupabaseMock(withAdminAndInsert());

    await processQuickBooksWebhook({
      eventNotifications: [
        {
          realmId: "123",
          dataChangeEvent: {
            entities: [
              { name: "Invoice", id: "6107", operation: "Update" },
              { name: "Invoice", id: "6108", operation: "Delete" },
              { name: "Customer", id: "77", operation: "Update" },
            ],
          },
        },
      ],
    });

    expect(mockFetchInvoice).toHaveBeenCalledTimes(1);
    expect(mockFetchInvoice).toHaveBeenCalledWith(expect.anything(), "6107");
  });
});
