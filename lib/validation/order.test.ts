import { describe, expect, it } from "vitest";

import { orderFormSchema } from "@/lib/validation/order";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "@/lib/notifications/constants";

function validOrder(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    customerName: "Layla Hassan",
    customerMobile: "+96555044444",
    preferredLanguage: "en",
    whatsappEnabled: true,
    preferredChannel: "whatsapp",
    notificationPreferences: DEFAULT_NOTIFICATION_PREFERENCES,
    product: "Business Cards",
    paper: "400gsm Card",
    paperSize: "9x5cm",
    quantity: 500,
    finishing: "Matte lamination",
    fulfillmentType: "pickup",
    priority: "normal",
    deliveryDate: "2026-07-20",
    deliveryTime: "14:00",
    notes: "",
    employeeIds: [],
    ...overrides,
  };
}

describe("Order Creation — orderFormSchema", () => {
  it("accepts a fully valid order", () => {
    const result = orderFormSchema.safeParse(validOrder());
    expect(result.success).toBe(true);
  });

  it("accepts an order with optional fields omitted/empty", () => {
    const result = orderFormSchema.safeParse(
      validOrder({ paper: "", paperSize: "", finishing: "", notes: "" })
    );
    expect(result.success).toBe(true);
  });

  it("rejects a blank customer name", () => {
    const result = orderFormSchema.safeParse(validOrder({ customerName: "" }));
    expect(result.success).toBe(false);
  });

  it("rejects a customer name over 200 characters", () => {
    const result = orderFormSchema.safeParse(validOrder({ customerName: "x".repeat(201) }));
    expect(result.success).toBe(false);
  });

  it("rejects a mobile number shorter than 6 characters", () => {
    const result = orderFormSchema.safeParse(validOrder({ customerMobile: "123" }));
    expect(result.success).toBe(false);
  });

  it("rejects an invalid preferred language", () => {
    const result = orderFormSchema.safeParse(validOrder({ preferredLanguage: "fr" }));
    expect(result.success).toBe(false);
  });

  it("rejects a blank product name", () => {
    const result = orderFormSchema.safeParse(validOrder({ product: "" }));
    expect(result.success).toBe(false);
  });

  it("rejects a zero or negative quantity", () => {
    expect(orderFormSchema.safeParse(validOrder({ quantity: 0 })).success).toBe(false);
    expect(orderFormSchema.safeParse(validOrder({ quantity: -5 })).success).toBe(false);
  });

  it("rejects a non-integer quantity", () => {
    const result = orderFormSchema.safeParse(validOrder({ quantity: 12.5 }));
    expect(result.success).toBe(false);
  });

  it("coerces a numeric-string quantity (as FormData would submit it)", () => {
    const result = orderFormSchema.safeParse(validOrder({ quantity: "250" }));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.quantity).toBe(250);
  });

  it("rejects an invalid priority value", () => {
    const result = orderFormSchema.safeParse(validOrder({ priority: "critical" }));
    expect(result.success).toBe(false);
  });

  it("rejects a missing delivery date or time", () => {
    expect(orderFormSchema.safeParse(validOrder({ deliveryDate: "" })).success).toBe(false);
    expect(orderFormSchema.safeParse(validOrder({ deliveryTime: "" })).success).toBe(false);
  });

  it("rejects a non-UUID employee id", () => {
    const result = orderFormSchema.safeParse(validOrder({ employeeIds: ["not-a-uuid"] }));
    expect(result.success).toBe(false);
  });

  it("accepts a well-formed employee id list", () => {
    const result = orderFormSchema.safeParse(
      validOrder({ employeeIds: ["7ab83d84-613c-4ae0-96d0-7e704426ede9"] })
    );
    expect(result.success).toBe(true);
  });

  it("rejects an incomplete notificationPreferences object", () => {
    const result = orderFormSchema.safeParse(
      validOrder({ notificationPreferences: { order_received: true } })
    );
    expect(result.success).toBe(false);
  });

  it("rejects an invalid preferredChannel", () => {
    const result = orderFormSchema.safeParse(validOrder({ preferredChannel: "carrier_pigeon" }));
    expect(result.success).toBe(false);
  });

  it("defaults items to an empty array when omitted", () => {
    const result = orderFormSchema.safeParse(validOrder());
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.items).toEqual([]);
  });

  it("accepts one or more additional items, each with its own optional employee", () => {
    const result = orderFormSchema.safeParse(
      validOrder({
        items: [
          { product: "Flyers", paper: "170gsm Gloss", paperSize: "A6", quantity: 300, finishing: "", employeeId: "7ab83d84-613c-4ae0-96d0-7e704426ede9" },
          { product: "Posters", quantity: 10, employeeId: "" },
        ],
      })
    );
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.items).toHaveLength(2);
  });

  it("rejects an additional item with a blank product name", () => {
    const result = orderFormSchema.safeParse(
      validOrder({ items: [{ product: "", quantity: 1 }] })
    );
    expect(result.success).toBe(false);
  });

  it("rejects an additional item with a zero quantity", () => {
    const result = orderFormSchema.safeParse(
      validOrder({ items: [{ product: "Flyers", quantity: 0 }] })
    );
    expect(result.success).toBe(false);
  });

  it("accepts an optional delivery address", () => {
    const result = orderFormSchema.safeParse(
      validOrder({ fulfillmentType: "delivery", deliveryAddress: "Block 3, Street 10, Salmiya" })
    );
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.deliveryAddress).toBe("Block 3, Street 10, Salmiya");
  });

  it("accepts an order with no delivery address", () => {
    const result = orderFormSchema.safeParse(validOrder());
    expect(result.success).toBe(true);
  });

  it("defaults approved to false when omitted", () => {
    const result = orderFormSchema.safeParse(validOrder());
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.approved).toBe(false);
  });

  it("accepts an explicit approved value", () => {
    const result = orderFormSchema.safeParse(validOrder({ approved: true }));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.approved).toBe(true);
  });
});
