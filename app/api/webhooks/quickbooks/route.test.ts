import crypto from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockProcess, afterCallbacks } = vi.hoisted(() => ({
  mockProcess: vi.fn(async () => {}),
  afterCallbacks: [] as (() => unknown)[],
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: (cb: () => unknown) => afterCallbacks.push(cb) };
});
vi.mock("@/lib/quickbooks/import", () => ({ processQuickBooksWebhook: mockProcess }));

import { POST } from "./route";

const VERIFIER = "verifier-token";
const PAYLOAD = {
  eventNotifications: [{ realmId: "123", dataChangeEvent: { entities: [{ name: "Invoice", id: "6107", operation: "Update" }] } }],
};

function makeRequest(body: unknown, signature?: string | null) {
  const rawBody = typeof body === "string" ? body : JSON.stringify(body);
  const sig = signature === undefined ? crypto.createHmac("sha256", VERIFIER).update(rawBody, "utf8").digest("base64") : signature;
  const headers: Record<string, string> = {};
  if (sig) headers["intuit-signature"] = sig;
  return new Request("https://flow.primekw.net/api/webhooks/quickbooks", { method: "POST", headers, body: rawBody });
}

beforeEach(() => {
  vi.clearAllMocks();
  afterCallbacks.length = 0;
  process.env.QUICKBOOKS_WEBHOOK_VERIFIER = VERIFIER;
});

describe("POST /api/webhooks/quickbooks", () => {
  it("acknowledges a signed delivery immediately and defers the import to after the response", async () => {
    const response = await POST(makeRequest(PAYLOAD));

    expect(response.status).toBe(200);
    expect(mockProcess).not.toHaveBeenCalled();
    expect(afterCallbacks).toHaveLength(1);

    await afterCallbacks[0]();
    expect(mockProcess).toHaveBeenCalledWith(PAYLOAD);
  });

  it("rejects a bad or missing signature", async () => {
    expect((await POST(makeRequest(PAYLOAD, "wrong"))).status).toBe(403);
    expect((await POST(makeRequest(PAYLOAD, null))).status).toBe(403);
    expect(afterCallbacks).toHaveLength(0);
  });

  it("rejects everything when no verifier token is configured", async () => {
    delete process.env.QUICKBOOKS_WEBHOOK_VERIFIER;
    expect((await POST(makeRequest(PAYLOAD))).status).toBe(403);
  });

  it("acknowledges a non-JSON body without scheduling anything", async () => {
    const response = await POST(makeRequest("not json"));
    expect(response.status).toBe(200);
    expect(afterCallbacks).toHaveLength(0);
  });
});
