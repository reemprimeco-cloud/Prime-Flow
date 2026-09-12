import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockIsDemoMode, mockRecordAuditLog, mockBroadcast, mockRevalidatePath, mockSendOrderApprovedNotifications } =
  vi.hoisted(() => ({
    mockIsDemoMode: vi.fn(() => false),
    mockRecordAuditLog: vi.fn(async () => {}),
    mockBroadcast: vi.fn(async () => {}),
    mockRevalidatePath: vi.fn(),
    mockSendOrderApprovedNotifications: vi.fn(async () => {}),
  }));

vi.mock("@/lib/demo/mode", () => ({ isDemoMode: mockIsDemoMode }));
vi.mock("@/lib/demo/data", () => ({ getDemoDesignApprovalByToken: vi.fn(() => null) }));
vi.mock("@/lib/audit/log", () => ({ recordAuditLog: mockRecordAuditLog }));
vi.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Map()) }));
vi.mock("@/lib/auth/guards", () => ({ requireAdmin: vi.fn(), requireSession: vi.fn() }));
vi.mock("@/lib/realtime/channels", () => ({
  broadcast: mockBroadcast,
  CHANNELS: { production: "production" },
}));
vi.mock("@/lib/notifications/service", () => ({
  notifyAdminDesignApprovalResponded: vi.fn(async () => {}),
  notifyCustomerDesignApprovalRequested: vi.fn(async () => {}),
}));
vi.mock("@/lib/actions/orders", () => ({
  signUrls: vi.fn(async () => new Map()),
  sendOrderApprovedNotifications: mockSendOrderApprovedNotifications,
}));

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
    eq: () => builder,
    single: () => builder,
    maybeSingle: () => builder,
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

import { requestDesignApproval, respondToDesignApproval } from "@/lib/actions/design-approval";
import { requireSession } from "@/lib/auth/guards";

const mockRequireSession = vi.mocked(requireSession);

function requestableOrderRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    order_number: "#1050",
    customer_name: "Layla Hassan",
    customer_mobile: "+96555044444",
    product: "Business Cards",
    whatsapp_enabled: true,
    preferred_channel: "whatsapp",
    preferred_language: "en",
    ...overrides,
  };
}

function orderRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "order-1",
    order_number: "#1050",
    customer_name: "Layla Hassan",
    product: "Business Cards",
    delivery_date: "2026-07-20",
    delivery_time: "14:00",
    design_approval_status: "pending",
    approved: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockIsDemoMode.mockReturnValue(false);
  resetSupabaseMock({});
});

describe("respondToDesignApproval", () => {
  it("approving also flips orders.approved and fires the deferred notification burst when it was still unapproved", async () => {
    resetSupabaseMock({
      orders: [{ data: orderRow({ approved: false }), error: null }],
      employees: [{ data: [], error: null }], // no active admins to notify
    });

    await respondToDesignApproval("tok", "approved");

    expect(mockSendOrderApprovedNotifications).toHaveBeenCalledTimes(1);
    expect(mockSendOrderApprovedNotifications).toHaveBeenCalledWith(expect.anything(), "order-1", null, expect.any(String));
  });

  it("doesn't re-fire the notification burst if the order was already approved", async () => {
    resetSupabaseMock({
      orders: [{ data: orderRow({ approved: true }), error: null }],
      employees: [{ data: [], error: null }],
    });

    await respondToDesignApproval("tok", "approved");

    expect(mockSendOrderApprovedNotifications).not.toHaveBeenCalled();
  });

  it("requesting changes never flips orders.approved or fires the notification burst", async () => {
    resetSupabaseMock({
      orders: [{ data: orderRow({ approved: false }), error: null }],
      employees: [{ data: [], error: null }],
    });

    await respondToDesignApproval("tok", "changes_requested", "Please use a darker blue.");

    expect(mockSendOrderApprovedNotifications).not.toHaveBeenCalled();
  });

  it("rejects requesting changes without a note", async () => {
    await expect(respondToDesignApproval("tok", "changes_requested")).rejects.toThrow("describe what needs to change");
  });

  it("rejects a token that's already been responded to", async () => {
    resetSupabaseMock({
      orders: [{ data: orderRow({ design_approval_status: "approved" }), error: null }],
    });

    await expect(respondToDesignApproval("tok", "approved")).rejects.toThrow("already been responded to");
  });

  it("rejects an unknown token", async () => {
    resetSupabaseMock({ orders: [{ data: null, error: null }] });
    await expect(respondToDesignApproval("bad-token", "approved")).rejects.toThrow("invalid");
  });

  it("blocks writes in demo mode", async () => {
    mockIsDemoMode.mockReturnValue(true);
    await expect(respondToDesignApproval("tok", "approved")).rejects.toThrow("read-only demo");
  });
});

describe("requestDesignApproval", () => {
  it("lets an admin send the approval link without checking employees.can_request_design_approval", async () => {
    mockRequireSession.mockResolvedValue({ employeeId: "admin-1", username: "rana", fullName: "Rana Al-Fadhli", role: "admin" });
    resetSupabaseMock({
      orders: [
        { data: requestableOrderRow(), error: null },
        { data: null, error: null },
      ],
    });

    await requestDesignApproval("order-1");

    expect(tableCallCounts.employees ?? 0).toBe(0);
  });

  it("rejects a non-admin employee without the permission flag", async () => {
    mockRequireSession.mockResolvedValue({ employeeId: "emp-1", username: "hamdy", fullName: "Hamdy", role: "employee" });
    resetSupabaseMock({
      employees: [{ data: { can_request_design_approval: false }, error: null }],
    });

    await expect(requestDesignApproval("order-1")).rejects.toThrow("don't have permission");
  });

  it("lets a non-admin employee with the permission flag send the approval link", async () => {
    mockRequireSession.mockResolvedValue({ employeeId: "emp-1", username: "hamdy", fullName: "Hamdy", role: "employee" });
    resetSupabaseMock({
      employees: [{ data: { can_request_design_approval: true }, error: null }],
      orders: [
        { data: requestableOrderRow(), error: null },
        { data: null, error: null },
      ],
    });

    await expect(requestDesignApproval("order-1")).resolves.toBeUndefined();
  });

  it("rejects a non-admin employee with no employees row found", async () => {
    mockRequireSession.mockResolvedValue({ employeeId: "emp-1", username: "hamdy", fullName: "Hamdy", role: "employee" });
    resetSupabaseMock({
      employees: [{ data: null, error: null }],
    });

    await expect(requestDesignApproval("order-1")).rejects.toThrow("don't have permission");
  });

  it("blocks writes in demo mode", async () => {
    mockRequireSession.mockResolvedValue({ employeeId: "admin-1", username: "rana", fullName: "Rana Al-Fadhli", role: "admin" });
    mockIsDemoMode.mockReturnValue(true);
    await expect(requestDesignApproval("order-1")).rejects.toThrow("read-only demo");
  });
});
