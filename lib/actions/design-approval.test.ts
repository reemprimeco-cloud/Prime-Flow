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
vi.mock("@/lib/auth/guards", () => ({ requireAdmin: vi.fn() }));
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

import { respondToDesignApproval } from "@/lib/actions/design-approval";

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
