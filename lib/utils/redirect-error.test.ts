import { describe, expect, it } from "vitest";

import { isRedirectError } from "./redirect-error";

describe("isRedirectError", () => {
  it("recognises Next's redirect signal", () => {
    expect(isRedirectError(Object.assign(new Error("x"), { digest: "NEXT_REDIRECT;replace;/dashboard;307;" }))).toBe(true);
  });

  it("treats a genuine failure as a failure", () => {
    expect(isRedirectError(new Error("Failed to fetch"))).toBe(false);
    expect(isRedirectError(Object.assign(new Error("x"), { digest: "NEXT_NOT_FOUND" }))).toBe(false);
  });

  it("handles values that aren't errors at all", () => {
    expect(isRedirectError(null)).toBe(false);
    expect(isRedirectError(undefined)).toBe(false);
    expect(isRedirectError("NEXT_REDIRECT")).toBe(false);
    expect(isRedirectError({ digest: 42 })).toBe(false);
  });
});
