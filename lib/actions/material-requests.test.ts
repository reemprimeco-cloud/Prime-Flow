import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireAdmin,
  mockIsDemoMode,
  mockRecordAuditLog,
  mockBroadcast,
  mockNotifyApproved,
  mockRevalidatePath,
} = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockIsDemoMode: vi.fn(() => false),
  mockRecordAuditLog: vi.fn(async () => {}),
  mockBroadcast: vi.fn(async () => {}),
  mockNotifyApproved: vi.fn<(context: unknown, actorId: string, actorName: string) => Promise<void>>(
    async () => undefined
  ),
  mockRevalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/demo/mode", () => ({ isDemoMode: mockIsDemoMode }));
vi.mock("@/lib/audit/log", () => ({ recordAuditLog: mockRecordAuditLog }));
vi.mock("@/lib/notifications/service", () => ({ notifyEmployeeMaterialApproved: mockNotifyApproved }));
vi.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));
vi.mock("@/lib/realtime/channels", () => ({
  broadcast: mockBroadcast,
  CHANNELS: { materialRequests: "material-requests", production: "production", notifications: "notifications" },
}));

// A minimal chainable stand-in for the real Supabase query builder: every
// method returns the same object so calls can be chained in any order/depth
// the real code uses (.select().eq().single(), .update().eq(), ...), and
// awaiting it resolves to the next queued { data, error } response for that
// table — one response per successive .from(table) call, in call order.
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

import { approveMaterialRequest, rejectMaterialRequest } from "@/lib/actions/material-requests";

const ADMIN_SESSION = { employeeId: "admin-1", username: "admin", fullName: "Rana Al-Fadhli", role: "admin" as const };

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
  mockIsDemoMode.mockReturnValue(false);
  resetSupabaseMock({});
});

describe("Material Requests — approveMaterialRequest", () => {
  it("refuses to approve a request that isn't pending", async () => {
    resetSupabaseMock({
      material_requests: [{ data: { id: "req-1", order_id: null, employee_id: "emp-1", status: "approved" }, error: null }],
    });

    await expect(approveMaterialRequest("req-1")).rejects.toThrow("Only pending requests can be approved.");
    // Never reached the update step.
    expect(mockRecordAuditLog).not.toHaveBeenCalled();
    expect(mockBroadcast).not.toHaveBeenCalled();
  });

  it("refuses to approve a request that's already been rejected", async () => {
    resetSupabaseMock({
      material_requests: [{ data: { id: "req-1", order_id: null, employee_id: "emp-1", status: "rejected" }, error: null }],
    });

    await expect(approveMaterialRequest("req-1")).rejects.toThrow("Only pending requests can be approved.");
  });

  it("approves a pending request, records an audit entry, and broadcasts the update", async () => {
    resetSupabaseMock({
      material_requests: [
        { data: { id: "req-1", order_id: null, employee_id: "emp-1", status: "pending" }, error: null }, // fetch
        { data: null, error: null }, // update
      ],
    });

    await approveMaterialRequest("req-1");

    expect(mockRecordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "material_approved", entityId: "req-1" })
    );
    expect(mockBroadcast).toHaveBeenCalledWith("material-requests", "material_request.updated", { requestId: "req-1" });
    // No order attached to this request -> no employee notification attempted.
    expect(mockNotifyApproved).not.toHaveBeenCalled();
  });

  it("notifies the requesting employee when the request is tied to an order", async () => {
    resetSupabaseMock({
      material_requests: [
        { data: { id: "req-1", order_id: "order-1", employee_id: "emp-1", status: "pending" }, error: null },
        { data: null, error: null },
      ],
      employees: [{ data: { phone: "+96550002222" }, error: null }],
      orders: [
        {
          data: { order_number: "#1045", product: "Business Cards", delivery_date: "2026-07-18", delivery_time: "14:00" },
          error: null,
        },
      ],
    });

    await approveMaterialRequest("req-1");

    expect(mockNotifyApproved).toHaveBeenCalledTimes(1);
    const [context] = mockNotifyApproved.mock.calls[0];
    expect(context).toMatchObject({ orderId: "order-1", orderNumber: "#1045", employeePhone: "+96550002222" });
  });

  it("propagates the database error message when the request isn't found", async () => {
    resetSupabaseMock({
      material_requests: [{ data: null, error: { message: "not found" } }],
    });

    await expect(approveMaterialRequest("missing")).rejects.toThrow("not found");
  });

  it("requires admin auth before touching the database", async () => {
    mockRequireAdmin.mockRejectedValueOnce(new Error("REDIRECT:/login"));
    await expect(approveMaterialRequest("req-1")).rejects.toThrow("REDIRECT:/login");
  });
});

describe("Material Requests — rejectMaterialRequest", () => {
  it("refuses to reject a request that isn't pending", async () => {
    resetSupabaseMock({
      material_requests: [{ data: { id: "req-1", order_id: null, status: "approved" }, error: null }],
    });

    await expect(rejectMaterialRequest("req-1")).rejects.toThrow("Only pending requests can be rejected.");
  });

  it("rejects a pending request and records an audit entry", async () => {
    resetSupabaseMock({
      material_requests: [
        { data: { id: "req-1", order_id: null, status: "pending" }, error: null },
        { data: null, error: null },
      ],
    });

    await rejectMaterialRequest("req-1");

    expect(mockRecordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "material_rejected", entityId: "req-1" })
    );
    expect(mockBroadcast).toHaveBeenCalledWith("material-requests", "material_request.updated", { requestId: "req-1" });
  });
});

describe("Material Requests — Demo Mode", () => {
  it("blocks writes in demo mode without touching the database", async () => {
    mockIsDemoMode.mockReturnValue(true);
    await expect(approveMaterialRequest("req-1")).rejects.toThrow("read-only demo");
  });
});
