import { describe, expect, it } from "vitest";

import { phoneKey, sanitizePhoneInput } from "./phone";

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

describe("phoneKey", () => {
  it("gives every Kuwait format of the same number one key", () => {
    for (const raw of [
      "+965 5000 1111",
      "+96550001111",
      "0096550001111",
      "96550001111",
      "50001111",
      "5000 1111",
    ]) {
      expect(phoneKey(raw)).toBe("50001111");
    }
  });

  it("folds Arabic-Indic digits", () => {
    expect(phoneKey("+٩٦٥ ٥٠٠٠ ١١١١")).toBe("50001111");
    expect(phoneKey("۵۰۰۰۱۱۱۱")).toBe("50001111");
  });

  it("keeps a non-Kuwaiti number's full digits", () => {
    expect(phoneKey("+971 50 123 4567")).toBe("971501234567");
  });

  it("returns empty for a placeholder like N/A", () => {
    expect(phoneKey("N/A")).toBe("");
  });
});
