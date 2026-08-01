import { describe, expect, it } from "vitest";

import { sanitizePhoneInput } from "./phone";

describe("sanitizePhoneInput", () => {
  it("strips bidi embedding marks pasted around a number (e.g. copied from WhatsApp/iOS)", () => {
    expect(sanitizePhoneInput("‪+965 9994 0535‬")).toBe("+965 9994 0535");
  });

  it("strips a zero-width space in the middle of a number", () => {
    expect(sanitizePhoneInput("+965​99940535")).toBe("+96599940535");
  });

  it("strips left-to-right/right-to-left marks", () => {
    expect(sanitizePhoneInput("‎+96599940535‏")).toBe("+96599940535");
  });

  it("leaves an already-clean number untouched", () => {
    expect(sanitizePhoneInput("+96599940535")).toBe("+96599940535");
  });

  it("still trims ordinary whitespace", () => {
    expect(sanitizePhoneInput("  +965 9994 0535  ")).toBe("+965 9994 0535");
  });
});
