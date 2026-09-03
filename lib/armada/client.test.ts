import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ENV_KEYS = ["ARMADA_API_KEY", "ARMADA_WEBHOOK_KEY", "ARMADA_ENV"] as const;

describe("createArmadaDelivery — address handling", () => {
  let originalEnv: Record<string, string | undefined>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    originalEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
    process.env.ARMADA_API_KEY = "key_test";
    process.env.ARMADA_WEBHOOK_KEY = "webhook_key_test";
    delete process.env.ARMADA_ENV;

    fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ code: "del_1", status: "pending", trackingLink: "https://track", deliveryFee: 1.5 }),
    }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
    vi.unstubAllGlobals();
  });

  function lastRequestBody(): Record<string, unknown> {
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    return JSON.parse(options.body as string);
  }

  it("sends the structured Kuwait address as a nested shipping object when block/street/buildingNumber are all present", async () => {
    const { createArmadaDelivery } = await import("./client");

    await createArmadaDelivery({
      orderId: "order-1",
      customerName: "Ahmad Al-Sayed",
      customerPhone: "+96555011111",
      paymentType: "paid",
      area: "Salmiya",
      block: "5",
      street: "Salem Al-Mubarak St",
      buildingNumber: "12",
      latitude: 29.3, // present but should be ignored in favor of structured address
      longitude: 48.0,
    });

    const body = lastRequestBody();
    expect(body.platformData).toEqual(
      expect.objectContaining({
        shipping: { country: "Kuwait", block: "5", street: "Salem Al-Mubarak St", buildingNumber: "12" },
        area: "Salmiya",
      })
    );
    expect(body.platformData).not.toHaveProperty("location");
  });

  it("falls back to a lat/lng pin when the structured address is incomplete", async () => {
    const { createArmadaDelivery } = await import("./client");

    await createArmadaDelivery({
      orderId: "order-1",
      customerName: "Ahmad Al-Sayed",
      customerPhone: "+96555011111",
      paymentType: "paid",
      block: "5",
      street: null, // incomplete — structured address shouldn't fire
      buildingNumber: "12",
      latitude: 29.3,
      longitude: 48.0,
    });

    const body = lastRequestBody();
    expect(body.platformData).toEqual(expect.objectContaining({ location: { latitude: 29.3, longitude: 48.0 } }));
    expect(body.platformData).not.toHaveProperty("shipping");
  });

  it("falls back to the free-text area when neither structured address nor a pin is available", async () => {
    const { createArmadaDelivery } = await import("./client");

    await createArmadaDelivery({
      orderId: "order-1",
      customerName: "Ahmad Al-Sayed",
      customerPhone: "+96555011111",
      paymentType: "paid",
      area: "Block 5, Street 10, House 12, Salmiya",
    });

    const body = lastRequestBody();
    expect(body.platformData).toEqual(
      expect.objectContaining({ area: "Block 5, Street 10, House 12, Salmiya" })
    );
    expect(body.platformData).not.toHaveProperty("shipping");
    expect(body.platformData).not.toHaveProperty("location");
  });
});
