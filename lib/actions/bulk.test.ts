import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequireAdmin, mockIsDemoMode, mockRecordAuditLog, mockDeleteOrder, mockBroadcast, supabaseRef } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockIsDemoMode: vi.fn(() => false),
  mockRecordAuditLog: vi.fn(async () => {}),
  mockDeleteOrder: vi.fn<(orderId: string) => Promise<void>>(async () => {}),
  mockBroadcast: vi.fn(),
  supabaseRef: { current: {} as unknown },
}));

vi.mock("@/lib/auth/guards", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/demo/mode", () => ({ isDemoMode: mockIsDemoMode }));
vi.mock("@/lib/audit/log", () => ({ recordAuditLog: mockRecordAuditLog }));
vi.mock("@/lib/actions/orders", () => ({ deleteOrder: mockDeleteOrder }));
vi.mock("@/lib/realtime/channels", () => ({ broadcast: mockBroadcast, CHANNELS: { production: "production" } }));
vi.mock("@/lib/notifications/service", () => ({ notifyEmployeeJobAssigned: vi.fn(), notifyOrderStatusChanged: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => supabaseRef.current }));

import { bulkDeleteOrders, bulkMarkCompleted } from "@/lib/actions/bulk";

const ADMIN_SESSION = { employeeId: "admin-1", username: "admin", fullName: "Rana Al-Fadhli", role: "admin" as const };

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
  mockIsDemoMode.mockReturnValue(false);
  mockDeleteOrder.mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
  supabaseRef.current = {};
});

describe("bulkDeleteOrders", () => {
  it("deletes each selected order through the single-order action", async () => {
    const result = await bulkDeleteOrders(["o1", "o2", "o3"]);
    expect(mockDeleteOrder.mock.calls.map((c) => c[0])).toEqual(["o1", "o2", "o3"]);
    expect(result).toEqual({ requested: 3, succeeded: 3, skipped: 0 });
    expect(mockRecordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "order_deleted", oldValue: { bulk: true, orderIds: ["o1", "o2", "o3"], succeeded: 3 } })
    );
  });

  it("keeps going when one delete fails and reports it as skipped", async () => {
    mockDeleteOrder.mockImplementation(async (id: string) => {
      if (id === "o2") throw new Error("boom");
    });
    const result = await bulkDeleteOrders(["o1", "o2", "o3"]);
    expect(result).toEqual({ requested: 3, succeeded: 2, skipped: 1 });
    expect(mockDeleteOrder).toHaveBeenCalledTimes(3);
  });

  it("does nothing for an empty selection", async () => {
    const result = await bulkDeleteOrders([]);
    expect(result).toEqual({ requested: 0, succeeded: 0, skipped: 0 });
    expect(mockDeleteOrder).not.toHaveBeenCalled();
  });

  it("refuses in demo mode", async () => {
    mockIsDemoMode.mockReturnValue(true);
    await expect(bulkDeleteOrders(["o1"])).rejects.toThrow(/read-only demo/);
  });
});

/** Records the writes bulkMarkCompleted makes; `rows` is what the status lookup returns. */
function fakeOrdersDb(rows: { id: string; status: string }[]) {
  const updates: { patch: Record<string, unknown>; ids: string[] }[] = [];
  const history: unknown[] = [];
  supabaseRef.current = {
    from: (table: string) => {
      if (table === "order_status_history") {
        return { insert: async (r: unknown[]) => (history.push(...r), { error: null }) };
      }
      return {
        select: () => ({ in: async () => ({ data: rows, error: null }) }),
        update: (patch: Record<string, unknown>) => ({
          in: async (_col: string, ids: string[]) => (updates.push({ patch, ids }), { error: null }),
        }),
      };
    },
  };
  return { updates, history };
}

describe("bulkMarkCompleted", () => {
  it("completes every selected order from whatever stage it's at, without notifying anyone", async () => {
    const db = fakeOrdersDb([
      { id: "o1", status: "new" },
      { id: "o2", status: "in_progress" },
      { id: "o3", status: "ready_pickup" },
    ]);
    const result = await bulkMarkCompleted(["o1", "o2", "o3"]);

    expect(result).toEqual({ requested: 3, succeeded: 3, skipped: 0 });
    expect(db.updates).toHaveLength(1);
    expect(db.updates[0].ids).toEqual(["o1", "o2", "o3"]);
    expect(db.updates[0].patch).toEqual(expect.objectContaining({ status: "completed", completed_at: expect.any(String) }));
    expect(db.history).toEqual([
      { order_id: "o1", from_status: "new", to_status: "completed", changed_by: "admin-1" },
      { order_id: "o2", from_status: "in_progress", to_status: "completed", changed_by: "admin-1" },
      { order_id: "o3", from_status: "ready_pickup", to_status: "completed", changed_by: "admin-1" },
    ]);
    expect(mockRecordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "status_changed", newValue: expect.objectContaining({ status: "completed", managerOverride: true, bulk: true }) })
    );
    expect(mockBroadcast).toHaveBeenCalledTimes(1);
  });

  it("skips orders that are already completed", async () => {
    const db = fakeOrdersDb([
      { id: "o1", status: "completed" },
      { id: "o2", status: "delivered" },
    ]);
    const result = await bulkMarkCompleted(["o1", "o2"]);
    expect(result).toEqual({ requested: 2, succeeded: 1, skipped: 1 });
    expect(db.updates[0].ids).toEqual(["o2"]);
  });

  it("writes nothing when every selected order is already completed", async () => {
    const db = fakeOrdersDb([{ id: "o1", status: "completed" }]);
    const result = await bulkMarkCompleted(["o1"]);
    expect(result).toEqual({ requested: 1, succeeded: 0, skipped: 1 });
    expect(db.updates).toHaveLength(0);
    expect(mockRecordAuditLog).not.toHaveBeenCalled();
  });

  it("requires an admin and refuses in demo mode", async () => {
    mockRequireAdmin.mockRejectedValueOnce(new Error("REDIRECT:/login"));
    await expect(bulkMarkCompleted(["o1"])).rejects.toThrow("REDIRECT:/login");
    mockIsDemoMode.mockReturnValue(true);
    await expect(bulkMarkCompleted(["o1"])).rejects.toThrow(/read-only demo/);
  });
});
