import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createMock = vi.fn();

vi.mock("twilio", () => ({
  default: vi.fn(() => ({ messages: { create: createMock } })),
}));

const ENV_KEYS = [
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_MESSAGING_SERVICE_SID",
  "TWILIO_WHATSAPP_NUMBER",
  "TWILIO_STATUS_CALLBACK_URL",
  "TWILIO_TEMPLATE_JOB_ASSIGNED_SID",
  "TWILIO_TEMPLATE_ORDER_IN_PRODUCTION_SID",
  "TWILIO_TEMPLATE_ADMIN_ORDER_STATUS_CHANGED_SID",
] as const;

const BASE_PAYLOAD = {
  orderId: "order-1",
  phone: "+96500000000",
  receiverType: "employee" as const,
  language: "en" as const,
  channel: "whatsapp" as const,
  body: "New job assigned: #1024 (Business Cards), due 2026-08-05 5:00 PM.",
  templateVariables: {
    orderNumber: "#1024",
    productName: "Business Cards",
    deliveryDate: "2026-08-05",
    deliveryTime: "17:00",
  },
};

describe("TwilioWhatsAppProvider — Content Templates", () => {
  let originalEnv: Record<string, string | undefined>;

  beforeEach(() => {
    originalEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
    process.env.TWILIO_ACCOUNT_SID = "AC_test";
    process.env.TWILIO_AUTH_TOKEN = "token_test";
    process.env.TWILIO_MESSAGING_SERVICE_SID = "MG_test";
    delete process.env.TWILIO_WHATSAPP_NUMBER;
    delete process.env.TWILIO_STATUS_CALLBACK_URL;
    delete process.env.TWILIO_TEMPLATE_JOB_ASSIGNED_SID;
    delete process.env.TWILIO_TEMPLATE_ORDER_IN_PRODUCTION_SID;
    delete process.env.TWILIO_TEMPLATE_ADMIN_ORDER_STATUS_CHANGED_SID;
    createMock.mockReset();
    createMock.mockResolvedValue({ sid: "SM_test", status: "sent", errorCode: null });
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
  });

  it("sends freeform body when no Content SID is configured for this template", async () => {
    const { TwilioWhatsAppProvider } = await import("./twilio-whatsapp");
    await new TwilioWhatsAppProvider().send({ ...BASE_PAYLOAD, templateName: "job_assigned" });

    const call = createMock.mock.calls[0][0];
    expect(call.body).toBe(BASE_PAYLOAD.body);
    expect(call.contentSid).toBeUndefined();
    expect(call.contentVariables).toBeUndefined();
  });

  it("sends via Content SID + numbered variables when one's configured and templateVariables are present", async () => {
    process.env.TWILIO_TEMPLATE_JOB_ASSIGNED_SID = "HX_job_assigned";
    const { TwilioWhatsAppProvider } = await import("./twilio-whatsapp");
    await new TwilioWhatsAppProvider().send({ ...BASE_PAYLOAD, templateName: "job_assigned" });

    const call = createMock.mock.calls[0][0];
    expect(call.contentSid).toBe("HX_job_assigned");
    expect(call.body).toBeUndefined();
    expect(JSON.parse(call.contentVariables)).toEqual({
      "1": "#1024",
      "2": "Business Cards",
      "3": "2026-08-05",
      "4": "17:00",
    });
  });

  it("falls back to freeform body when templateVariables is missing, even with a Content SID configured", async () => {
    process.env.TWILIO_TEMPLATE_JOB_ASSIGNED_SID = "HX_job_assigned";
    const { TwilioWhatsAppProvider } = await import("./twilio-whatsapp");
    await new TwilioWhatsAppProvider().send({ ...BASE_PAYLOAD, templateName: "job_assigned", templateVariables: undefined });

    const call = createMock.mock.calls[0][0];
    expect(call.body).toBe(BASE_PAYLOAD.body);
    expect(call.contentSid).toBeUndefined();
  });

  it("uses the correct variable positions for a two-variable template", async () => {
    process.env.TWILIO_TEMPLATE_ORDER_IN_PRODUCTION_SID = "HX_in_production";
    const { TwilioWhatsAppProvider } = await import("./twilio-whatsapp");
    await new TwilioWhatsAppProvider().send({ ...BASE_PAYLOAD, templateName: "order_in_production" });

    const call = createMock.mock.calls[0][0];
    expect(call.contentSid).toBe("HX_in_production");
    expect(JSON.parse(call.contentVariables)).toEqual({ "1": "#1024", "2": "Business Cards" });
  });

  // Regression: this mapping once had one more variable than the approved
  // template had slots, which shifted every value along and produced a real
  // alert reading 'moved order #1007 to status "Devon"' — the customer's
  // name in the status slot. Pins the exact slots of prime_admin_tap_notify3.
  it("sends the admin alert four variables, customer third and status last", async () => {
    process.env.TWILIO_TEMPLATE_ADMIN_ORDER_STATUS_CHANGED_SID = "HX_admin";
    const { TwilioWhatsAppProvider } = await import("./twilio-whatsapp");
    await new TwilioWhatsAppProvider().send({
      ...BASE_PAYLOAD,
      templateName: "admin_order_status_changed",
      templateVariables: {
        orderNumber: "#1029",
        customerName: "Hiba Al Mayouf",
        employeeName: "Siva",
        statusLabel: "Ready for Pickup",
      },
    });

    const call = createMock.mock.calls[0][0];
    expect(call.contentSid).toBe("HX_admin");
    expect(JSON.parse(call.contentVariables)).toEqual({
      "1": "Siva",
      "2": "#1029",
      "3": "Hiba Al Mayouf",
      "4": "Ready for Pickup",
    });
  });

  it("never uses a Content SID for a templateName with no registered template", async () => {
    const { TwilioWhatsAppProvider } = await import("./twilio-whatsapp");
    await new TwilioWhatsAppProvider().send({ ...BASE_PAYLOAD, templateName: "job_cancelled" });

    const call = createMock.mock.calls[0][0];
    expect(call.body).toBe(BASE_PAYLOAD.body);
    expect(call.contentSid).toBeUndefined();
  });
});
