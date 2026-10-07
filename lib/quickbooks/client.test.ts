import crypto from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

let tokenRow: Record<string, unknown> | null = null;
const upserts: Record<string, unknown>[] = [];

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: tokenRow, error: null }) }) }),
      upsert: async (row: Record<string, unknown>) => {
        upserts.push(row);
        return { error: null };
      },
    }),
  }),
}));

import { createServiceClient } from "@/lib/supabase/server";
import { buildAuthorizeUrl, fetchInvoice, getValidAccessToken, verifyWebhookSignature } from "@/lib/quickbooks/client";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.QUICKBOOKS_CLIENT_ID = "client-id";
  process.env.QUICKBOOKS_CLIENT_SECRET = "client-secret";
  delete process.env.QUICKBOOKS_ENV;
  tokenRow = null;
  upserts.length = 0;
  globalThis.fetch = originalFetch;
});

describe("verifyWebhookSignature", () => {
  it("accepts Intuit's base64 HMAC-SHA256 of the raw body", () => {
    const body = '{"eventNotifications":[]}';
    const sig = crypto.createHmac("sha256", "verifier").update(body, "utf8").digest("base64");
    expect(verifyWebhookSignature(body, sig, "verifier")).toBe(true);
  });

  it("rejects a missing or wrong signature", () => {
    expect(verifyWebhookSignature("{}", null, "verifier")).toBe(false);
    expect(verifyWebhookSignature("{}", "nope", "verifier")).toBe(false);
  });
});

describe("buildAuthorizeUrl", () => {
  it("points at Intuit with the accounting scope, redirect URI and state", () => {
    const url = new URL(buildAuthorizeUrl("https://flow.example/api/integrations/quickbooks/callback", "abc"));
    expect(url.origin + url.pathname).toBe("https://appcenter.intuit.com/connect/oauth2");
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("scope")).toBe("com.intuit.quickbooks.accounting");
    expect(url.searchParams.get("redirect_uri")).toBe("https://flow.example/api/integrations/quickbooks/callback");
    expect(url.searchParams.get("state")).toBe("abc");
  });
});

describe("getValidAccessToken", () => {
  const future = (ms: number) => new Date(Date.now() + ms).toISOString();

  it("throws when QuickBooks was never connected", async () => {
    await expect(getValidAccessToken(createServiceClient())).rejects.toThrow("isn't connected");
  });

  it("returns the stored token while it's still fresh", async () => {
    tokenRow = { realm_id: "123", access_token: "fresh", refresh_token: "r", access_expires_at: future(30 * 60_000), refresh_expires_at: future(86_400_000) };
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(getValidAccessToken(createServiceClient())).resolves.toEqual({ accessToken: "fresh", realmId: "123" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refreshes an expiring token and persists the rotated pair", async () => {
    tokenRow = { realm_id: "123", access_token: "stale", refresh_token: "old-refresh", access_expires_at: future(30_000), refresh_expires_at: future(86_400_000) };
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ access_token: "new-access", refresh_token: "new-refresh", expires_in: 3600, x_refresh_token_expires_in: 8_726_400 }), { status: 200 })
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(getValidAccessToken(createServiceClient())).resolves.toEqual({ accessToken: "new-access", realmId: "123" });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer");
    expect(String(init.body)).toContain("grant_type=refresh_token");
    expect(String(init.body)).toContain("refresh_token=old-refresh");
    expect(upserts[0]).toMatchObject({ provider: "quickbooks", realm_id: "123", access_token: "new-access", refresh_token: "new-refresh" });
  });

  it("throws when the refresh token itself has lapsed", async () => {
    tokenRow = { realm_id: "123", access_token: "x", refresh_token: "r", access_expires_at: future(30 * 60_000), refresh_expires_at: future(-1000) };
    await expect(getValidAccessToken(createServiceClient())).rejects.toThrow("expired");
  });
});

describe("fetchInvoice", () => {
  it("reads the invoice from the company's API with the bearer token, and maps 404 to null", async () => {
    tokenRow = { realm_id: "123", access_token: "tok", refresh_token: "r", access_expires_at: new Date(Date.now() + 3_600_000).toISOString(), refresh_expires_at: new Date(Date.now() + 86_400_000).toISOString() };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ Invoice: { Id: "9", Balance: 0 } }), { status: 200 }))
      .mockResolvedValueOnce(new Response("", { status: 404 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(fetchInvoice(createServiceClient(), "9")).resolves.toEqual({ Id: "9", Balance: 0 });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://quickbooks.api.intuit.com/v3/company/123/invoice/9?minorversion=75");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");

    await expect(fetchInvoice(createServiceClient(), "missing")).resolves.toBeNull();
  });
});
