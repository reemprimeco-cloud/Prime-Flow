import { describe, expect, it } from "vitest";

import { createOrderRequestSchema } from "./order-request";

const base = { customerName: "Sara", product: "Business cards", quantity: 100, fulfillmentType: "pickup" as const };

function mobile(value: string) {
  const result = createOrderRequestSchema("ar").safeParse({ ...base, customerMobile: value });
  return result.success ? result.data.customerMobile : null;
}

describe("order request mobile number", () => {
  it("accepts every way a phone keyboard gives a Kuwait number, stored as +965 and 8 digits", () => {
    for (const typed of ["50001111", "5000 1111", "+965 5000 1111", "+96550001111", "0096550001111", "965-5000-1111"]) {
      expect(mobile(typed)).toBe("+96550001111");
    }
  });

  it("accepts Arabic-Indic digits", () => {
    expect(mobile("٥٠٠٠١١١١")).toBe("+96550001111");
    expect(mobile("+٩٦٥ ٥٠٠٠ ١١١١")).toBe("+96550001111");
  });

  it("strips invisible marks pasted from WhatsApp", () => {
    expect(mobile("‪+965 5000 1111‬")).toBe("+96550001111");
  });

  it("rejects a number that isn't 8 digits after the country code", () => {
    expect(mobile("5000111")).toBeNull();
    expect(mobile("500011112")).toBeNull();
    expect(mobile("+971501234567")).toBeNull();
    expect(mobile("")).toBeNull();
  });
});
