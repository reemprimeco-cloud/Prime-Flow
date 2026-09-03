import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockIsDemoMode, mockRecordAuditLog, mockBroadcast, mockRevalidatePath, mockUploadOrderFiles } = vi.hoisted(() => ({
  mockIsDemoMode: vi.fn(() => false),
  mockRecordAuditLog: vi.fn(async () => {}),
  mockBroadcast: vi.fn(async () => {}),
  mockRevalidatePath: vi.fn(),
  mockUploadOrderFiles: vi.fn(async () => {}),
}));

vi.mock("@/lib/demo/mode", () => ({ isDemoMode: mockIsDemoMode }));
vi.mock("@/lib/audit/log", () => ({ recordAuditLog: mockRecordAuditLog }));
vi.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));
vi.mock("@/lib/realtime/channels", () => ({
  broadcast: mockBroadcast,
  CHANNELS: { production: "production" },
}));
vi.mock("@/lib/actions/orders", () => ({ uploadOrderFiles: mockUploadOrderFiles }));

type Response = { data: unknown; error: unknown };
let tableResponses: Record<string, Response[]> = {};
let tableCallCounts: Record<string, number> = {};
let insertsByTable: Record<string, unknown[]> = {};

function resetSupabaseMock(responses: Record<string, Response[]>) {
  tableResponses = responses;
  tableCallCounts = {};
  insertsByTable = {};
}

function makeBuilder(table: string, result: Response) {
  const builder: Record<string, unknown> = {
    insert: (value: unknown) => {
      (insertsByTable[table] ??= []).push(value);
      return builder;
    },
    select: () => builder,
    eq: () => builder,
    single: () => builder,
    then: (resolve: (v: Response) => unknown, reject?: (e: unknown) => unknown) =>
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

import { submitOrderRequest } from "@/lib/actions/order-request";

function minimalRequestFormData(): FormData {
  const fd = new FormData();
  fd.set("customerName", "Ahmad almodhayan");
  fd.set("customerMobile", "+96555011111");
  fd.set("product", "Coffee Cup Sleeves");
  fd.set("quantity", "100");
  fd.set("fulfillmentType", "pickup");
  fd.set("deliveryDate", "2026-09-10");
  fd.set("deliveryTime", "14:00");
  fd.set("items", "[]");
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockIsDemoMode.mockReturnValue(false);
  resetSupabaseMock({});
});

describe("submitOrderRequest", () => {
  it("creates an unapproved order with no employee actor, and never notifies anyone", async () => {
    resetSupabaseMock({
      orders: [{ data: { id: "order-1", order_number: "#1080" }, error: null }],
      order_status_history: [{ data: null, error: null }],
    });

    const result = await submitOrderRequest(minimalRequestFormData());

    expect(result).toEqual({ orderNumber: "#1080" });
    expect(insertsByTable.orders[0]).toEqual(
      expect.objectContaining({ approved: false, created_by: null, customer_name: "Ahmad almodhayan" })
    );
    expect(mockUploadOrderFiles).toHaveBeenCalledWith(expect.anything(), "order-1", null, expect.any(FormData));
    expect(mockRecordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: null, action: "order_created", entityId: "order-1" })
    );
    expect(mockBroadcast).toHaveBeenCalledWith("production", "order.created", { orderId: "order-1" });
  });

  it("defaults delivery date and time when the customer leaves them blank", async () => {
    resetSupabaseMock({
      orders: [{ data: { id: "order-1", order_number: "#1080" }, error: null }],
      order_status_history: [{ data: null, error: null }],
    });
    const fd = minimalRequestFormData();
    fd.set("deliveryDate", "");
    fd.set("deliveryTime", "");

    await submitOrderRequest(fd);

    expect(insertsByTable.orders[0]).toEqual(
      expect.objectContaining({
        delivery_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        delivery_time: "12:00",
      })
    );
  });

  it("rejects invalid submissions before touching the database", async () => {
    const fd = minimalRequestFormData();
    fd.delete("customerName");

    await expect(submitOrderRequest(fd)).rejects.toThrow();
    expect(mockRecordAuditLog).not.toHaveBeenCalled();
  });

  it("rejects a mobile number without the +965 country code", async () => {
    const fd = minimalRequestFormData();
    fd.set("customerMobile", "55011111");

    await expect(submitOrderRequest(fd)).rejects.toThrow("+965");
    expect(mockRecordAuditLog).not.toHaveBeenCalled();
  });

  it("blocks writes in demo mode", async () => {
    mockIsDemoMode.mockReturnValue(true);
    await expect(submitOrderRequest(minimalRequestFormData())).rejects.toThrow("read-only demo");
  });

  it("surfaces the database error message when the insert fails", async () => {
    resetSupabaseMock({
      orders: [{ data: null, error: { message: "duplicate order number" } }],
    });

    await expect(submitOrderRequest(minimalRequestFormData())).rejects.toThrow("duplicate order number");
  });
});
