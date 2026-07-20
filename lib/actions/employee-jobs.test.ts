import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireEmployee,
  mockIsDemoMode,
  mockRecordAuditLog,
  mockBroadcast,
  mockNotifyOrderStatusChanged,
  mockRevalidatePath,
} = vi.hoisted(() => ({
  mockRequireEmployee: vi.fn(),
  mockIsDemoMode: vi.fn(() => false),
  mockRecordAuditLog: vi.fn(async () => {}),
  mockBroadcast: vi.fn(async () => {}),
  mockNotifyOrderStatusChanged: vi.fn(async () => {}),
  mockRevalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requireEmployee: mockRequireEmployee }));
vi.mock("@/lib/demo/mode", () => ({ isDemoMode: mockIsDemoMode }));
vi.mock("@/lib/audit/log", () => ({ recordAuditLog: mockRecordAuditLog }));
vi.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));
vi.mock("@/lib/realtime/channels", () => ({
  broadcast: mockBroadcast,
  CHANNELS: { materialRequests: "material-requests", production: "production", notifications: "notifications" },
}));
vi.mock("@/lib/notifications/service", () => ({
  notifyAdminOrderNoteAdded: vi.fn(async () => {}),
  notifyAdminOrderStatusChanged: vi.fn(async () => {}),
  notifyEmployeeJobReadyForYou: vi.fn(async () => {}),
  notifyEmployeeInternalPickupReady: vi.fn(async () => {}),
  notifyEmployeeOutForDeliveryStaff: vi.fn(async () => {}),
  notifyOrderMovedBackToProduction: vi.fn(async () => {}),
  notifyOrderStatusChanged: mockNotifyOrderStatusChanged,
}));

// Same minimal chainable Supabase stand-in as lib/actions/orders.test.ts.
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

import { toggleJobItemReady, updateEmployeeJobStatus } from "@/lib/actions/employee-jobs";
import { PRIMARY_ITEM_ID } from "@/types/domain";

const EMPLOYEE_SESSION = { employeeId: "emp-1", username: "hassan", fullName: "Hassan Youssef", role: "employee" as const };

function currentOrderRow(status: string) {
  return {
    status,
    order_number: "#1050",
    customer_name: "Layla Hassan",
    customer_mobile: "+96555044444",
    product: "Product Packaging Boxes",
    delivery_date: "2026-07-20",
    delivery_time: "14:00",
    delivery_address: null,
    whatsapp_enabled: true,
    preferred_channel: "whatsapp",
    preferred_language: "en",
    notification_preferences: {},
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireEmployee.mockResolvedValue(EMPLOYEE_SESSION);
  mockIsDemoMode.mockReturnValue(false);
  resetSupabaseMock({});
});

describe("Item Readiness — toggleJobItemReady", () => {
  it("toggles an additional item ready without advancing the order while other items are still unready", async () => {
    resetSupabaseMock({
      order_assignments: [{ data: { id: "assignment-1" }, error: null }],
      order_items: [
        { data: null, error: null }, // update is_ready
        { data: [{ is_ready: true }, { is_ready: false }], error: null }, // not everything ready
      ],
      orders: [{ data: { status: "in_progress", item_ready: true, fulfillment_type: "pickup" }, error: null }],
    });

    await toggleJobItemReady("order-1", "item-2", true);

    expect(mockNotifyOrderStatusChanged).not.toHaveBeenCalled();
    expect(mockBroadcast).toHaveBeenCalledTimes(1);
  });

  it("toggles the primary item (orders.item_ready) the same way as an additional item", async () => {
    resetSupabaseMock({
      order_assignments: [{ data: { id: "assignment-1" }, error: null }],
      orders: [
        { data: null, error: null }, // update item_ready
        { data: { status: "in_progress", item_ready: true, fulfillment_type: "pickup" }, error: null },
      ],
      order_items: [{ data: [{ is_ready: false }], error: null }],
    });

    await toggleJobItemReady("order-1", PRIMARY_ITEM_ID, true);

    expect(mockNotifyOrderStatusChanged).not.toHaveBeenCalled();
  });

  it("auto-advances the order once the last item is checked ready", async () => {
    resetSupabaseMock({
      order_assignments: [{ data: { id: "assignment-1" }, error: null }],
      order_items: [
        { data: null, error: null }, // update is_ready
        { data: [{ is_ready: true }], error: null }, // every item now ready
      ],
      orders: [
        { data: { status: "in_progress", item_ready: true, fulfillment_type: "pickup" }, error: null },
        { data: currentOrderRow("in_progress"), error: null }, // applyOrderStatusTransition fetch
        { data: null, error: null }, // status update
      ],
      employees: [
        { data: { is_outsourced: false }, error: null }, // isOutsourced lookup
        { data: [], error: null }, // notifyAdmins — no admins, no-op
      ],
      order_status_history: [{ data: null, error: null }],
    });

    await toggleJobItemReady("order-1", "item-2", true);

    expect(mockNotifyOrderStatusChanged).toHaveBeenCalledWith(
      expect.objectContaining({ orderNumber: "#1050", toStatus: "ready_pickup" }),
      "emp-1",
      "Hassan Youssef"
    );
    expect(mockRecordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "status_changed", entityId: "order-1" })
    );
  });

  it("auto-advances a delivery order to ready_delivery, never straight to delivered", async () => {
    resetSupabaseMock({
      order_assignments: [{ data: { id: "assignment-1" }, error: null }],
      order_items: [
        { data: null, error: null }, // update is_ready
        { data: [{ is_ready: true }], error: null }, // every item now ready
      ],
      orders: [
        { data: { status: "in_progress", item_ready: true, fulfillment_type: "delivery" }, error: null },
        { data: currentOrderRow("in_progress"), error: null }, // applyOrderStatusTransition fetch
        { data: null, error: null }, // status update
      ],
      employees: [
        { data: { is_outsourced: false }, error: null }, // isOutsourced lookup
        { data: [], error: null }, // notifyAdmins — no admins, no-op
      ],
      order_status_history: [{ data: null, error: null }],
    });

    await toggleJobItemReady("order-1", "item-2", true);

    expect(mockNotifyOrderStatusChanged).toHaveBeenCalledWith(
      expect.objectContaining({ orderNumber: "#1050", toStatus: "ready_delivery" }),
      "emp-1",
      "Hassan Youssef"
    );
  });

  it("never auto-advances when unchecking an item", async () => {
    resetSupabaseMock({
      order_assignments: [{ data: { id: "assignment-1" }, error: null }],
      order_items: [{ data: null, error: null }], // update is_ready = false
    });

    await toggleJobItemReady("order-1", "item-2", false);

    expect(mockNotifyOrderStatusChanged).not.toHaveBeenCalled();
  });

  it("rejects when the employee isn't assigned to the order", async () => {
    resetSupabaseMock({
      order_assignments: [{ data: null, error: null }],
    });

    await expect(toggleJobItemReady("order-1", "item-2", true)).rejects.toThrow("not assigned");
  });

  it("blocks writes in demo mode without touching the database", async () => {
    mockIsDemoMode.mockReturnValue(true);
    await expect(toggleJobItemReady("order-1", "item-2", true)).rejects.toThrow("read-only demo");
  });
});

describe("Production Approval — updateEmployeeJobStatus", () => {
  it("blocks Start Production when the order is new and not yet approved", async () => {
    resetSupabaseMock({
      order_assignments: [{ data: { id: "assignment-1" }, error: null }],
      orders: [{ data: { status: "new", approved: false }, error: null }], // approval pre-check
    });

    await expect(updateEmployeeJobStatus("order-1", "in_progress")).rejects.toThrow("Wait for Admin Approval");
    expect(mockNotifyOrderStatusChanged).not.toHaveBeenCalled();
  });

  it("allows Start Production once the order is approved", async () => {
    resetSupabaseMock({
      order_assignments: [{ data: { id: "assignment-1" }, error: null }],
      orders: [
        { data: { status: "new", approved: true }, error: null }, // approval pre-check
        { data: currentOrderRow("new"), error: null }, // applyOrderStatusTransition fetch
        { data: null, error: null }, // status update
      ],
      order_status_history: [{ data: null, error: null }],
      employees: [{ data: [], error: null }], // notifyAdmins — no admins, no-op
    });

    await updateEmployeeJobStatus("order-1", "in_progress");

    expect(mockNotifyOrderStatusChanged).toHaveBeenCalledWith(
      expect.objectContaining({ orderNumber: "#1050", toStatus: "in_progress" }),
      "emp-1",
      "Hassan Youssef"
    );
  });

  it("doesn't re-check approval for transitions that aren't the initial Start Production", async () => {
    resetSupabaseMock({
      order_assignments: [{ data: { id: "assignment-1" }, error: null }],
      orders: [
        { data: { status: "waiting_materials", approved: false }, error: null }, // approval pre-check — not "new", so ignored
        { data: currentOrderRow("waiting_materials"), error: null }, // applyOrderStatusTransition fetch
        { data: null, error: null }, // status update
      ],
      order_status_history: [{ data: null, error: null }],
      employees: [{ data: [], error: null }],
    });

    await updateEmployeeJobStatus("order-1", "in_progress");

    expect(mockNotifyOrderStatusChanged).toHaveBeenCalledWith(
      expect.objectContaining({ toStatus: "in_progress" }),
      "emp-1",
      "Hassan Youssef"
    );
  });
});
