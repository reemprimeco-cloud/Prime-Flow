import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockSendNotification, mockSetVapidDetails } = vi.hoisted(() => ({
  // Params are declared so the mock's call tuple is typed — asserting on
  // mock.calls[0] needs them, even though the body ignores both.
  mockSendNotification: vi.fn(async (_subscription: unknown, _payload: string) => ({})),
  mockSetVapidDetails: vi.fn(),
}));

vi.mock("web-push", () => ({
  default: { sendNotification: mockSendNotification, setVapidDetails: mockSetVapidDetails },
}));

type Response_ = { data: unknown; error: unknown };
let tableResponses: Record<string, Response_[]> = {};
let tableCallCounts: Record<string, number> = {};
let deletedIds: unknown[] = [];

function makeBuilder(table: string, result: Response_) {
  const builder: Record<string, unknown> = {
    select: () => builder,
    delete: () => builder,
    eq: () => builder,
    in: (_column: string, values: unknown[]) => {
      if (table === "push_subscriptions" && (tableCallCounts[table] ?? 0) > 1) deletedIds = values;
      return builder;
    },
    then: (resolve: (v: Response_) => unknown, reject?: (e: unknown) => unknown) =>
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

import { sendPushToEmployees } from "@/lib/push/server";

const SUBSCRIPTION = { id: "sub-1", endpoint: "https://push.example/abc", p256dh: "p256", auth: "auth" };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.VAPID_PUBLIC_KEY = "public-key";
  process.env.VAPID_PRIVATE_KEY = "private-key";
  tableResponses = {};
  tableCallCounts = {};
  deletedIds = [];
});

afterEach(() => {
  delete process.env.VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
});

describe("sendPushToEmployees", () => {
  it("sends the payload to every registered device", async () => {
    tableResponses = {
      push_subscriptions: [
        { data: [SUBSCRIPTION, { ...SUBSCRIPTION, id: "sub-2", endpoint: "https://push.example/def" }], error: null },
      ],
    };

    await sendPushToEmployees(["emp-1"], { title: "New job assigned", body: "Job #1029", url: "/employee" });

    expect(mockSendNotification).toHaveBeenCalledTimes(2);
    const [subscription, payload] = mockSendNotification.mock.calls[0];
    expect(subscription).toEqual({
      endpoint: "https://push.example/abc",
      keys: { p256dh: "p256", auth: "auth" },
    });
    expect(JSON.parse(payload)).toMatchObject({ title: "New job assigned", body: "Job #1029" });
  });

  it("does nothing when VAPID keys aren't configured, so the app stays stub-safe", async () => {
    delete process.env.VAPID_PRIVATE_KEY;

    await sendPushToEmployees(["emp-1"], { title: "x", body: "y" });

    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it("does nothing when given no employees", async () => {
    await sendPushToEmployees([], { title: "x", body: "y" });
    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it("does nothing when the employee has no registered devices", async () => {
    tableResponses = { push_subscriptions: [{ data: [], error: null }] };

    await sendPushToEmployees(["emp-1"], { title: "x", body: "y" });

    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it("deletes subscriptions the push service reports as gone", async () => {
    tableResponses = {
      push_subscriptions: [{ data: [SUBSCRIPTION], error: null }, { data: null, error: null }],
    };
    mockSendNotification.mockRejectedValueOnce(Object.assign(new Error("gone"), { statusCode: 410 }));

    await sendPushToEmployees(["emp-1"], { title: "x", body: "y" });

    expect(deletedIds).toEqual(["sub-1"]);
  });

  it("keeps a subscription that failed for a transient reason", async () => {
    tableResponses = { push_subscriptions: [{ data: [SUBSCRIPTION], error: null }] };
    mockSendNotification.mockRejectedValueOnce(Object.assign(new Error("boom"), { statusCode: 500 }));

    await sendPushToEmployees(["emp-1"], { title: "x", body: "y" });

    expect(deletedIds).toEqual([]);
  });

  it("never throws when a send fails, so it can't break the action that triggered it", async () => {
    tableResponses = { push_subscriptions: [{ data: [SUBSCRIPTION], error: null }] };
    mockSendNotification.mockRejectedValueOnce(new Error("network down"));

    await expect(sendPushToEmployees(["emp-1"], { title: "x", body: "y" })).resolves.toBeUndefined();
  });
});
