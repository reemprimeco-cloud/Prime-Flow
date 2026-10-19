import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { resolveExistingCustomer } from "./existing-customer";

type Row = { customer_name: string; customer_mobile: string };

/** Minimal stand-in for the one query resolveExistingCustomer makes; rows are newest-first. */
function fakeSupabase(rows: Row[], error: { message: string } | null = null) {
  const like = vi.fn();
  const builder = {
    select: () => builder,
    like: (...args: unknown[]) => {
      like(...args);
      return builder;
    },
    order: () => builder,
    limit: async () => ({ data: error ? null : rows, error }),
  };
  return { client: { from: () => builder } as never, like };
}

describe("resolveExistingCustomer", () => {
  it("uses the name and number spelling already on file for a returning customer", async () => {
    const { client } = fakeSupabase([
      { customer_name: "Fatima Noor", customer_mobile: "+965 5002 2222" },
      { customer_name: "Fatima N.", customer_mobile: "+96550022222" },
    ]);
    await expect(resolveExistingCustomer(client, "فاطمة", "+96550022222")).resolves.toEqual({
      customerName: "Fatima Noor",
      customerMobile: "+965 5002 2222",
      matched: true,
    });
  });

  it("ignores rows the loose LIKE caught that are a different number", async () => {
    const { client } = fakeSupabase([{ customer_name: "Someone Else", customer_mobile: "+965 5500 0022 2222" }]);
    const result = await resolveExistingCustomer(client, "New Person", "50022222");
    expect(result).toEqual({
      customerName: "New Person",
      customerMobile: "50022222",
      matched: false,
    });
  });

  it("matches on the last 8 digits regardless of spacing or country code", async () => {
    const { client, like } = fakeSupabase([]);
    await resolveExistingCustomer(client, "A", "+965 5002 2222");
    expect(like).toHaveBeenCalledWith("customer_mobile", "%5%0%0%2%2%2%2%2");
  });

  it("keeps what was entered for a new number", async () => {
    const { client } = fakeSupabase([]);
    const result = await resolveExistingCustomer(client, "New Person", "+96551234567");
    expect(result).toEqual({
      customerName: "New Person",
      customerMobile: "+96551234567",
      matched: false,
    });
  });

  it("skips the lookup for a number too short to identify anyone", async () => {
    const { client, like } = fakeSupabase([]);
    const result = await resolveExistingCustomer(client, "Walk-in", "N/A");
    expect(result.matched).toBe(false);
    expect(like).not.toHaveBeenCalled();
  });

  it("never blocks the order when the lookup fails", async () => {
    const { client } = fakeSupabase([], { message: "connection reset" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await resolveExistingCustomer(client, "Ali", "+96550001111");
    expect(result).toEqual({
      customerName: "Ali",
      customerMobile: "+96550001111",
      matched: false,
    });
    warn.mockRestore();
  });
});
