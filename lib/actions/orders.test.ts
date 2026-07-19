import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireAdmin,
  mockIsDemoMode,
  mockRecordAuditLog,
  mockBroadcast,
  mockNotifyOrderCreated,
  mockNotifyOrderStatusChanged,
  mockRevalidatePath,
} = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockIsDemoMode: vi.fn(() => false),
  mockRecordAuditLog: vi.fn(async () => {}),
  mockBroadcast: vi.fn(async () => {}),
  mockNotifyOrderCreated: vi.fn(async () => {}),
  mockNotifyOrderStatusChanged: vi.fn(async () => {}),
  mockRevalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/demo/mode", () => ({ isDemoMode: mockIsDemoMode }));
vi.mock("@/lib/audit/log", () => ({ recordAuditLog: mockRecordAuditLog }));
vi.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));
vi.mock("@/lib/realtime/channels", () => ({
  broadcast: mockBroadcast,
  CHANNELS: { materialRequests: "material-requests", production: "production", notifications: "notifications" },
}));
vi.mock("@/lib/notifications/service", () => ({
  notifyOrderCreated: mockNotifyOrderCreated,
  notifyEmployeeJobAssigned: vi.fn(async () => {}),
  notifyEmployeeHighPriorityAssigned: vi.fn(async () => {}),
  notifyEmployeeJobReassigned: vi.fn(async () => {}),
  notifyEmployeeJobCancelled: vi.fn(async () => {}),
  notifyOrderStatusChanged: mockNotifyOrderStatusChanged,
  notifyOrderMovedBackToProduction: vi.fn(async () => {}),
  notifyEmployeeInternalPickupReady: vi.fn(async () => {}),
  notifyEmployeeOutForDeliveryStaff: vi.fn(async () => {}),
}));

// Same minimal chainable Supabase stand-in as lib/actions/material-requests.test.ts.
type Response = { data: unknown; error: unknown };
let tableResponses: Record<string, Response[]> = {};
let tableCallCounts: Record<string, number> = {};
// Records every chained call made on the FIRST builder handed out for the
// "orders" table in a test — enough to assert getOrders/getCompletedOrders
// built the right filter without modeling a real query engine.
let recordedOrdersCalls: { method: string; args: unknown[] }[] = [];

function resetSupabaseMock(responses: Record<string, Response[]>) {
  tableResponses = responses;
  tableCallCounts = {};
  recordedOrdersCalls = [];
}

function makeBuilder(result: Response, record?: boolean) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "update", "insert", "eq", "in", "not", "or", "order", "range"]) {
    builder[method] = (...args: unknown[]) => {
      if (record) recordedOrdersCalls.push({ method, args });
      return builder;
    };
  }
  builder.single = () => builder;
  builder.then = (resolve: (v: Response) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return builder;
}

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      const queue = tableResponses[table] ?? [];
      const idx = tableCallCounts[table] ?? 0;
      tableCallCounts[table] = idx + 1;
      return makeBuilder(queue[idx] ?? { data: null, error: null }, table === "orders" && idx === 0);
    },
  }),
}));

import { createOrder, getCompletedOrders, getOrders, updateOrderStatus } from "@/lib/actions/orders";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "@/lib/notifications/constants";

const ADMIN_SESSION = { employeeId: "admin-1", username: "admin", fullName: "Rana Al-Fadhli", role: "admin" as const };

function minimalOrderFormData(): FormData {
  const fd = new FormData();
  fd.set("customerName", "Layla Hassan");
  fd.set("customerMobile", "+96555044444");
  fd.set("preferredLanguage", "en");
  fd.set("whatsappEnabled", "true");
  fd.set("preferredChannel", "whatsapp");
  fd.set("notificationPreferences", JSON.stringify(DEFAULT_NOTIFICATION_PREFERENCES));
  fd.set("product", "Business Cards");
  fd.set("quantity", "500");
  fd.set("fulfillmentType", "pickup");
  fd.set("priority", "normal");
  fd.set("deliveryDate", "2026-07-20");
  fd.set("deliveryTime", "14:00");
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
  mockIsDemoMode.mockReturnValue(false);
  resetSupabaseMock({});
});

describe("Order Creation — createOrder", () => {
  it("creates an order, logs an audit entry, notifies the customer, and broadcasts", async () => {
    resetSupabaseMock({
      orders: [{ data: { id: "order-1", order_number: "#1050" }, error: null }],
    });

    const result = await createOrder(minimalOrderFormData());

    expect(result).toEqual({ id: "order-1" });
    expect(mockRecordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "order_created", entityId: "order-1" })
    );
    expect(mockNotifyOrderCreated).toHaveBeenCalledTimes(1);
    expect(mockBroadcast).toHaveBeenCalledWith("production", "order.created", { orderId: "order-1" });
  });

  it("rejects when required fields are missing (server-side Zod validation, not just the client form)", async () => {
    const fd = minimalOrderFormData();
    fd.delete("customerName");

    await expect(createOrder(fd)).rejects.toThrow();
    // Never reached the database.
    expect(mockRecordAuditLog).not.toHaveBeenCalled();
  });

  it("surfaces the database error message when the insert fails", async () => {
    resetSupabaseMock({
      orders: [{ data: null, error: { message: "duplicate order number" } }],
    });

    await expect(createOrder(minimalOrderFormData())).rejects.toThrow("duplicate order number");
  });

  it("blocks writes in demo mode without touching the database", async () => {
    mockIsDemoMode.mockReturnValue(true);
    await expect(createOrder(minimalOrderFormData())).rejects.toThrow("read-only demo");
  });

  it("requires admin auth before validating or touching the database", async () => {
    mockRequireAdmin.mockRejectedValueOnce(new Error("REDIRECT:/login"));
    await expect(createOrder(minimalOrderFormData())).rejects.toThrow("REDIRECT:/login");
  });
});

function currentOrderRow(status: string) {
  return {
    status,
    order_number: "#1050",
    customer_name: "Layla Hassan",
    customer_mobile: "+96555044444",
    product: "Business Cards",
    delivery_date: "2026-07-20",
    delivery_time: "14:00",
    delivery_address: null,
    whatsapp_enabled: true,
    preferred_channel: "whatsapp",
    preferred_language: "en",
    notification_preferences: DEFAULT_NOTIFICATION_PREFERENCES,
  };
}

describe("Manager quick status action — updateOrderStatus", () => {
  it("lets an admin advance an order the same way an employee would (e.g. Ready for Delivery)", async () => {
    resetSupabaseMock({
      orders: [
        { data: currentOrderRow("in_progress"), error: null },
        { data: null, error: null },
      ],
      order_status_history: [{ data: null, error: null }],
      employees: [{ data: [], error: null }],
    });

    await updateOrderStatus("order-1", "ready_delivery");

    expect(mockRecordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "status_changed",
        entityId: "order-1",
        oldValue: { status: "in_progress" },
        newValue: { status: "ready_delivery" },
      })
    );
    expect(mockNotifyOrderStatusChanged).toHaveBeenCalledWith(
      expect.objectContaining({ orderNumber: "#1050", toStatus: "ready_delivery" }),
      "admin-1",
      "Rana Al-Fadhli"
    );
    expect(mockBroadcast).toHaveBeenCalledWith("production", "order.updated", { orderId: "order-1" });
  });

  it("rejects a transition the Status Engine doesn't allow from the current status", async () => {
    resetSupabaseMock({
      orders: [{ data: currentOrderRow("new"), error: null }],
    });

    await expect(updateOrderStatus("order-1", "ready_delivery")).rejects.toThrow();
    expect(mockRecordAuditLog).not.toHaveBeenCalled();
  });

  it("blocks writes in demo mode without touching the database", async () => {
    mockIsDemoMode.mockReturnValue(true);
    await expect(updateOrderStatus("order-1", "in_progress")).rejects.toThrow("read-only demo");
  });

  it("requires admin auth", async () => {
    mockRequireAdmin.mockRejectedValueOnce(new Error("REDIRECT:/login"));
    await expect(updateOrderStatus("order-1", "in_progress")).rejects.toThrow("REDIRECT:/login");
  });
});

describe("Completed Orders — dashboard board vs. Reports tab", () => {
  it("getOrders excludes collected/delivered/completed from the default (unfiltered) board", async () => {
    resetSupabaseMock({ orders: [{ data: [], error: null }] });

    await getOrders();

    expect(recordedOrdersCalls).toContainEqual({
      method: "not",
      args: ["status", "in", "(collected,delivered,completed)"],
    });
  });

  it("getOrders skips the exclusion when an explicit status filter is set", async () => {
    resetSupabaseMock({ orders: [{ data: [], error: null }] });

    await getOrders({ status: "collected" });

    expect(recordedOrdersCalls.some((c) => c.method === "not")).toBe(false);
    expect(recordedOrdersCalls).toContainEqual({ method: "eq", args: ["status", "collected"] });
  });

  it("getCompletedOrders queries only finished-job statuses", async () => {
    resetSupabaseMock({ orders: [{ data: [], error: null }] });

    await getCompletedOrders();

    expect(recordedOrdersCalls).toContainEqual({
      method: "in",
      args: ["status", ["collected", "delivered", "completed"]],
    });
  });
});
