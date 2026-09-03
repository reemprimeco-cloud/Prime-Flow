import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreateArmadaDelivery, mockRecordAuditLog } = vi.hoisted(() => ({
  mockCreateArmadaDelivery: vi.fn(),
  mockRecordAuditLog: vi.fn(async () => {}),
}));

vi.mock("@/lib/audit/log", () => ({ recordAuditLog: mockRecordAuditLog }));
vi.mock("@/lib/armada/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./client")>();
  return { ...actual, createArmadaDelivery: mockCreateArmadaDelivery };
});

import { dispatchArmadaDelivery, type DispatchableOrder } from "@/lib/armada/dispatch";

function baseOrder(overrides: Partial<DispatchableOrder> = {}): DispatchableOrder {
  return {
    order_number: "#1080",
    customer_name: "Ahmad Al-Sayed",
    customer_mobile: "+96555011111",
    delivery_address: "Some free-text address",
    delivery_map_link: null,
    delivery_area: null,
    delivery_block: null,
    delivery_street: null,
    delivery_building_number: null,
    notes: "Ring the bell twice",
    ...overrides,
  };
}

function makeSupabase() {
  const update = vi.fn().mockReturnThis();
  const eq = vi.fn().mockResolvedValue({ error: null });
  return { from: vi.fn(() => ({ update, eq })) } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateArmadaDelivery.mockResolvedValue({ code: "del_1", status: "pending", trackingLink: "https://track", deliveryFee: 1.5 });
});

describe("dispatchArmadaDelivery — address source priority", () => {
  it("prefers the structured Kuwait address when block/street/buildingNumber are all present", async () => {
    const order = baseOrder({
      delivery_area: "Salmiya",
      delivery_block: "5",
      delivery_street: "Salem Al-Mubarak St",
      delivery_building_number: "12",
      delivery_map_link: "https://maps.google.com/?q=29.3,48.0",
    });

    await dispatchArmadaDelivery(makeSupabase(), "order-1", order, "admin-1", "Rana");

    expect(mockCreateArmadaDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        area: "Salmiya",
        block: "5",
        street: "Salem Al-Mubarak St",
        buildingNumber: "12",
        latitude: null,
        longitude: null,
      })
    );
  });

  it("falls back to the map pin when there's no structured address", async () => {
    const order = baseOrder({ delivery_map_link: "https://maps.google.com/?q=29.3,48.0" });

    await dispatchArmadaDelivery(makeSupabase(), "order-1", order, "admin-1", "Rana");

    expect(mockCreateArmadaDelivery).toHaveBeenCalledWith(
      expect.objectContaining({ latitude: 29.3, longitude: 48.0, area: null, block: null, street: null, buildingNumber: null })
    );
  });

  it("falls back to the free-text address when there's no structured address and no pin", async () => {
    const order = baseOrder();

    await dispatchArmadaDelivery(makeSupabase(), "order-1", order, "admin-1", "Rana");

    expect(mockCreateArmadaDelivery).toHaveBeenCalledWith(
      expect.objectContaining({ area: "Some free-text address", latitude: null, longitude: null, block: null })
    );
  });
});
