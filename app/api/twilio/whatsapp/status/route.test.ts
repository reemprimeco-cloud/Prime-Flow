import { beforeEach, describe, expect, it, vi } from "vitest";
import { getExpectedTwilioSignature } from "twilio";

const { mockBroadcast } = vi.hoisted(() => ({
  mockBroadcast: vi.fn(async () => {}),
}));

vi.mock("@/lib/realtime/channels", () => ({
  broadcast: mockBroadcast,
  CHANNELS: { materialRequests: "material-requests", production: "production", notifications: "notifications" },
}));

// Same minimal chainable Supabase stand-in as lib/actions/*.test.ts.
type Response = { data: unknown; error: unknown };
let updateResponse: Response = { data: [{ id: "log-1", order_id: "order-1" }], error: null };
let lastUpdatePayload: Record<string, unknown> | null = null;
let lastEqArgs: [string, unknown] | null = null;

function makeBuilder(): Record<string, unknown> {
  const builder: Record<string, unknown> = {
    update: (payload: Record<string, unknown>) => {
      lastUpdatePayload = payload;
      return builder;
    },
    eq: (...args: [string, unknown]) => {
      lastEqArgs = args;
      return builder;
    },
    select: () => Promise.resolve(updateResponse),
  };
  return builder;
}

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({
    from: () => makeBuilder(),
  }),
}));

import { POST } from "@/app/api/twilio/whatsapp/status/route";

const AUTH_TOKEN = "test-auth-token";
const CALLBACK_URL = "https://primeflowboard.netlify.app/api/twilio/whatsapp/status";

function signedRequest(params: Record<string, string>, overrides: { signature?: string; url?: string } = {}) {
  const url = overrides.url ?? CALLBACK_URL;
  const signature = overrides.signature ?? getExpectedTwilioSignature(AUTH_TOKEN, url, params);
  const body = new URLSearchParams(params).toString();
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": signature },
    body,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.TWILIO_AUTH_TOKEN = AUTH_TOKEN;
  process.env.TWILIO_STATUS_CALLBACK_URL = CALLBACK_URL;
  updateResponse = { data: [{ id: "log-1", order_id: "order-1" }], error: null };
  lastUpdatePayload = null;
  lastEqArgs = null;
});

describe("POST /api/twilio/whatsapp/status", () => {
  it("rejects a request with an invalid signature", async () => {
    const request = signedRequest(
      { MessageSid: "SM123", MessageStatus: "delivered" },
      { signature: "not-the-real-signature" }
    );
    const response = await POST(request);
    expect(response.status).toBe(403);
    expect(lastUpdatePayload).toBeNull();
  });

  it("rejects a request when TWILIO_AUTH_TOKEN isn't configured", async () => {
    delete process.env.TWILIO_AUTH_TOKEN;
    const request = signedRequest({ MessageSid: "SM123", MessageStatus: "delivered" });
    const response = await POST(request);
    expect(response.status).toBe(403);
  });

  it("updates the matching row and sets delivered_at for a delivered status", async () => {
    const request = signedRequest({ MessageSid: "SM123", MessageStatus: "delivered", To: "whatsapp:+96555011111", From: "whatsapp:+14155238886" });
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(lastEqArgs).toEqual(["provider_message_id", "SM123"]);
    expect(lastUpdatePayload).toMatchObject({ status: "delivered" });
    expect(lastUpdatePayload?.delivered_at).toEqual(expect.any(String));
    expect(lastUpdatePayload?.read_at).toBeUndefined();
    expect(mockBroadcast).toHaveBeenCalledWith(
      "notifications",
      "notification.status_updated",
      expect.objectContaining({ messageSid: "SM123", status: "delivered" })
    );
  });

  it("sets read_at for a read status", async () => {
    const request = signedRequest({ MessageSid: "SM124", MessageStatus: "read" });
    await POST(request);
    expect(lastUpdatePayload).toMatchObject({ status: "read" });
    expect(lastUpdatePayload?.read_at).toEqual(expect.any(String));
  });

  it("stores a failed_reason for a failed status, preferring ErrorMessage over ErrorCode", async () => {
    const request = signedRequest({
      MessageSid: "SM125",
      MessageStatus: "failed",
      ErrorCode: "63016",
      ErrorMessage: "Message failed to send",
    });
    await POST(request);
    expect(lastUpdatePayload).toMatchObject({ status: "failed", failed_reason: "Message failed to send" });
  });

  it("falls back to the error code when Twilio sends no ErrorMessage", async () => {
    const request = signedRequest({ MessageSid: "SM126", MessageStatus: "undelivered", ErrorCode: "30003" });
    await POST(request);
    expect(lastUpdatePayload).toMatchObject({ status: "undelivered", failed_reason: "Twilio error 30003" });
  });

  it("accepts every status in the required set", async () => {
    for (const status of ["queued", "accepted", "sent", "delivered", "read", "failed", "undelivered"]) {
      const request = signedRequest({ MessageSid: `SM-${status}`, MessageStatus: status });
      const response = await POST(request);
      expect(response.status).toBe(200);
      expect(lastUpdatePayload).toMatchObject({ status });
    }
  });

  it("logs and returns 200 for an unrecognized MessageStatus instead of failing", async () => {
    const request = signedRequest({ MessageSid: "SM127", MessageStatus: "some-future-status" });
    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(lastUpdatePayload).toBeNull();
  });

  it("logs and returns 200 when required fields are missing", async () => {
    const request = signedRequest({ MessageStatus: "delivered" });
    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(lastUpdatePayload).toBeNull();
  });

  it("logs and returns 200 when no notification_logs row matches the MessageSid", async () => {
    updateResponse = { data: [], error: null };
    const request = signedRequest({ MessageSid: "SM-unknown", MessageStatus: "delivered" });
    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(mockBroadcast).not.toHaveBeenCalled();
  });

  it("logs and returns 200 when the database update itself errors", async () => {
    updateResponse = { data: null, error: { message: "connection reset" } };
    const request = signedRequest({ MessageSid: "SM128", MessageStatus: "delivered" });
    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(mockBroadcast).not.toHaveBeenCalled();
  });
});
