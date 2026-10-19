import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequireAdmin, mockIsDemoMode, mockRecordAuditLog, mockDeleteOrder } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockIsDemoMode: vi.fn(() => false),
  mockRecordAuditLog: vi.fn(async () => {}),
  mockDeleteOrder: vi.fn<(orderId: string) => Promise<void>>(async () => {}),
}));

vi.mock("@/lib/auth/guards", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/demo/mode", () => ({ isDemoMode: mockIsDemoMode }));
vi.mock("@/lib/audit/log", () => ({ recordAuditLog: mockRecordAuditLog }));
vi.mock("@/lib/actions/orders", () => ({ deleteOrder: mockDeleteOrder }));
vi.mock("@/lib/realtime/channels", () => ({ broadcast: vi.fn(), CHANNELS: { production: "production" } }));
vi.mock("@/lib/notifications/service", () => ({ notifyEmployeeJobAssigned: vi.fn(), notifyOrderStatusChanged: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => ({}) }));

import { bulkDeleteOrders } from "@/lib/actions/bulk";

const ADMIN_SESSION = { employeeId: "admin-1", username: "admin", fullName: "Rana Al-Fadhli", role: "admin" as const };

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
  mockIsDemoMode.mockReturnValue(false);
  mockDeleteOrder.mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
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
