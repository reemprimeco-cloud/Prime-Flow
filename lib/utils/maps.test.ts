import { describe, expect, it } from "vitest";

import { buildGoogleMapsLink } from "@/lib/utils/maps";

describe("buildGoogleMapsLink", () => {
  it("builds a Google Maps search URL from an address", () => {
    const link = buildGoogleMapsLink("Shuwaikh Industrial, Kuwait");
    expect(link).toBe("https://www.google.com/maps/search/?api=1&query=Shuwaikh%20Industrial%2C%20Kuwait");
  });

  it("url-encodes special characters in the address", () => {
    const link = buildGoogleMapsLink("Block 5, Street 10 & Ave 2");
    expect(link).toContain("query=Block%205%2C%20Street%2010%20%26%20Ave%202");
  });
});
