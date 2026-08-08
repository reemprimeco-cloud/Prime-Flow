import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequireSession, mockIsDemoMode } = vi.hoisted(() => ({
  mockRequireSession: vi.fn(),
  mockIsDemoMode: vi.fn(() => false),
}));

vi.mock("@/lib/auth/guards", () => ({ requireSession: mockRequireSession }));
vi.mock("@/lib/demo/mode", () => ({ isDemoMode: mockIsDemoMode }));

let upsertedRows: unknown[] = [];

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({
    from: () => {
      const builder: Record<string, unknown> = {
        upsert: (row: unknown) => {
          upsertedRows.push(row);
          return builder;
        },
        delete: () => builder,
        select: () => builder,
        eq: () => builder,
        maybeSingle: () => builder,
        then: (resolve: (v: { data: unknown; error: unknown }) => unknown) =>
          Promise.resolve({ data: null, error: null }).then(resolve),
      };
      return builder;
    },
  }),
}));

import { savePushSubscription } from "@/lib/actions/push";

const SUBSCRIPTION = { endpoint: "https://push.example/abc", p256dh: "p256", auth: "auth" };

beforeEach(() => {
  vi.clearAllMocks();
  mockIsDemoMode.mockReturnValue(false);
  upsertedRows = [];
});

describe("savePushSubscription", () => {
  // The original bug: this used requireEmployee, which redirects an admin
  // to /dashboard — so a manager tapping "Turn on alerts" got a raw
  // NEXT_REDIRECT error instead of a registered device.
  it("registers a device for an admin, not just an employee", async () => {
    mockRequireSession.mockResolvedValue({ employeeId: "admin-1", role: "admin", fullName: "Reem" });

    await savePushSubscription(SUBSCRIPTION);

    expect(mockRequireSession).toHaveBeenCalled();
    expect(upsertedRows[0]).toMatchObject({ employee_id: "admin-1", endpoint: SUBSCRIPTION.endpoint });
  });

  it("registers a device for an employee", async () => {
    mockRequireSession.mockResolvedValue({ employeeId: "emp-1", role: "employee", fullName: "Siva" });

    await savePushSubscription(SUBSCRIPTION);

    expect(upsertedRows[0]).toMatchObject({ employee_id: "emp-1" });
  });

  it("writes nothing in demo mode", async () => {
    mockRequireSession.mockResolvedValue({ employeeId: "demo", role: "admin", fullName: "Demo" });
    mockIsDemoMode.mockReturnValue(true);

    await savePushSubscription(SUBSCRIPTION);

    expect(upsertedRows).toEqual([]);
  });
});
