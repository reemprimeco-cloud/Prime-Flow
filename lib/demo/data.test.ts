import { describe, expect, it } from "vitest";

import { getDemoCompletedOrders, getDemoOrders } from "@/lib/demo/data";

describe("Completed Orders — demo data", () => {
  it("excludes collected/delivered/completed orders from the default (unfiltered) board", async () => {
    const result = getDemoOrders();
    const statuses = result.items.map((o) => o.status);
    expect(statuses).not.toContain("collected");
    expect(statuses).not.toContain("delivered");
    expect(statuses).not.toContain("completed");
  });

  it("still returns collected orders when explicitly filtered by status", async () => {
    const result = getDemoOrders({ status: "collected" });
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items.every((o) => o.status === "collected")).toBe(true);
  });

  it("getDemoCompletedOrders returns only finished-job statuses", async () => {
    const result = getDemoCompletedOrders();
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items.every((o) => ["collected", "delivered", "completed"].includes(o.status))).toBe(true);
  });

  it("getDemoCompletedOrders honors search", async () => {
    const all = getDemoCompletedOrders();
    const target = all.items[0];
    const result = getDemoCompletedOrders({ search: target.orderNumber.replace("#", "") });
    expect(result.items.some((o) => o.id === target.id)).toBe(true);
  });
});
