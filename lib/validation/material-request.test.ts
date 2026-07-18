import { describe, expect, it } from "vitest";

import { materialRequestSchema, orderNoteSchema } from "@/lib/validation/material-request";

function validRequest(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    materialType: "paper",
    description: "400gsm card stock running low",
    quantity: "2 reams",
    priority: "normal",
    ...overrides,
  };
}

describe("Material Requests — materialRequestSchema", () => {
  it("accepts a fully valid request", () => {
    expect(materialRequestSchema.safeParse(validRequest()).success).toBe(true);
  });

  it("accepts every declared material type", () => {
    for (const materialType of ["paper", "ink", "vinyl", "packaging", "lamination", "other"]) {
      expect(materialRequestSchema.safeParse(validRequest({ materialType })).success).toBe(true);
    }
  });

  it("rejects a material type outside the enum", () => {
    expect(materialRequestSchema.safeParse(validRequest({ materialType: "glitter" })).success).toBe(false);
  });

  it("accepts every declared priority", () => {
    for (const priority of ["low", "normal", "urgent"]) {
      expect(materialRequestSchema.safeParse(validRequest({ priority })).success).toBe(true);
    }
  });

  it("rejects a priority outside the enum", () => {
    expect(materialRequestSchema.safeParse(validRequest({ priority: "asap" })).success).toBe(false);
  });

  it("rejects a blank description", () => {
    expect(materialRequestSchema.safeParse(validRequest({ description: "" })).success).toBe(false);
    expect(materialRequestSchema.safeParse(validRequest({ description: "   " })).success).toBe(false);
  });

  it("rejects a description over 500 characters", () => {
    expect(materialRequestSchema.safeParse(validRequest({ description: "x".repeat(501) })).success).toBe(false);
  });

  it("rejects a blank quantity", () => {
    expect(materialRequestSchema.safeParse(validRequest({ quantity: "" })).success).toBe(false);
  });

  it("accepts a free-text quantity (not required to be numeric)", () => {
    expect(materialRequestSchema.safeParse(validRequest({ quantity: "a few rolls" })).success).toBe(true);
  });
});

describe("Material Requests — orderNoteSchema", () => {
  it("accepts a normal note", () => {
    expect(orderNoteSchema.safeParse({ note: "Client asked for extra lamination." }).success).toBe(true);
  });

  it("rejects an empty note", () => {
    expect(orderNoteSchema.safeParse({ note: "" }).success).toBe(false);
    expect(orderNoteSchema.safeParse({ note: "   " }).success).toBe(false);
  });

  it("rejects a note over 2000 characters", () => {
    expect(orderNoteSchema.safeParse({ note: "x".repeat(2001) }).success).toBe(false);
  });
});
