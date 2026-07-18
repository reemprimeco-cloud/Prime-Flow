import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequireAdmin, mockIsDemoMode, mockRecordAuditLog, mockBroadcast, mockNotifyOrderCreated, mockRevalidatePath } =
  vi.hoisted(() => ({
    mockRequireAdmin: vi.fn(),
    mockIsDemoMode: vi.fn(() => false),
    mockRecordAuditLog: vi.fn(async () => {}),
    mockBroadcast: vi.fn(async () => {}),
    mockNotifyOrderCreated: vi.fn(async () => {}),
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
  notifyOrderStatusChanged: vi.fn(async () => {}),
}));

// Same minimal chainable Supabase stand-in as lib/actions/material-requests.test.ts.
type Response = { data: unknown; error: unknown };
let tableResponses: Record<string, Response[]> = {};
let tableCallCounts: Record<string, number> = {};

function resetSupabaseMock(responses: Record<string, Response[]>) {
  tableResponses = responses;
  tableCallCounts = {};
}

function makeBuilder(result: Response) {
  const builder: Record<string, unknown> = {
    select: () => builder,
    update: () => builder,
    insert: () => builder,
    eq: () => builder,
    in: () => builder,
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
      return makeBuilder(queue[idx] ?? { data: null, error: null });
    },
  }),
}));

import { createOrder } from "@/lib/actions/orders";
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
