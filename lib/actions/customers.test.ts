import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequireAdmin, mockIsDemoMode, mockRecordAuditLog, mockRevalidatePath } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockIsDemoMode: vi.fn(() => false),
  mockRecordAuditLog: vi.fn(async () => {}),
  mockRevalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/demo/mode", () => ({ isDemoMode: mockIsDemoMode }));
vi.mock("@/lib/audit/log", () => ({ recordAuditLog: mockRecordAuditLog }));
vi.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));

type Response = { data: unknown; error: unknown };
let tableResponse: Response = { data: null, error: null };
let recordedUpdateCalls: { method: string; args: unknown[] }[] = [];

function resetSupabaseMock(response: Response) {
  tableResponse = response;
  recordedUpdateCalls = [];
}

function makeBuilder(result: Response) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "update", "eq", "in", "like", "order", "limit"]) {
    builder[method] = (...args: unknown[]) => {
      recordedUpdateCalls.push({ method, args });
      return builder;
    };
  }
  builder.then = (resolve: (v: Response) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return builder;
}

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({
    from: () => makeBuilder(tableResponse),
  }),
}));

import { listCustomers, updateCustomerInfo } from "@/lib/actions/customers";

const ADMIN_SESSION = { employeeId: "admin-1", username: "admin", fullName: "Rana Al-Fadhli", role: "admin" as const };

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
  mockIsDemoMode.mockReturnValue(false);
  resetSupabaseMock({ data: null, error: null });
});

describe("listCustomers", () => {
  it("dedupes orders by mobile number (whatever its formatting), keeping the newest name and counting repeat orders", async () => {
    resetSupabaseMock({
      data: [
        {
          customer_name: "Ahmad (new spelling)",
          customer_mobile: "+96555011111",
          preferred_language: "ar",
          whatsapp_enabled: true,
          preferred_channel: "whatsapp",
          created_at: "2026-09-02T10:00:00Z",
        },
        {
          customer_name: "Ahmed (old spelling)",
          customer_mobile: "+96555011111",
          preferred_language: "ar",
          whatsapp_enabled: true,
          preferred_channel: "whatsapp",
          created_at: "2026-08-01T10:00:00Z",
        },
        {
          customer_name: "Ahmad (older, spaced number)",
          customer_mobile: "+965 5501 1111",
          preferred_language: "ar",
          whatsapp_enabled: true,
          preferred_channel: "whatsapp",
          created_at: "2026-07-01T10:00:00Z",
        },
        {
          customer_name: "Fatima Noor",
          customer_mobile: "+96555022222",
          preferred_language: "en",
          whatsapp_enabled: true,
          preferred_channel: "whatsapp",
          created_at: "2026-08-15T10:00:00Z",
        },
      ],
      error: null,
    });

    const customers = await listCustomers();

    expect(customers).toHaveLength(2);
    const ahmad = customers.find((c) => c.customerMobile === "+96555011111");
    expect(ahmad).toEqual(
      expect.objectContaining({ customerName: "Ahmad (new spelling)", orderCount: 3 })
    );
  });

  it("requires an admin session", async () => {
    mockRequireAdmin.mockRejectedValueOnce(new Error("REDIRECT:/login"));
    await expect(listCustomers()).rejects.toThrow("REDIRECT:/login");
  });
});

describe("updateCustomerInfo", () => {
  it("updates every order under the old mobile number, in any stored format, and logs an audit entry", async () => {
    resetSupabaseMock({
      data: [
        { id: "order-1", customer_mobile: "+96555011111" },
        { id: "order-2", customer_mobile: "+965 5501 1111" },
        { id: "order-3", customer_mobile: "+965 5500 0001 1111" }, // caught by the loose LIKE, a different number
      ],
      error: null,
    });

    await updateCustomerInfo("+96555011111", {
      customerName: "Ahmad Al-Sayed",
      customerMobile: "+96555099999",
    });

    expect(recordedUpdateCalls.find((c) => c.method === "update")).toEqual({
      method: "update",
      args: [{ customer_name: "Ahmad Al-Sayed", customer_mobile: "+96555099999" }],
    });
    expect(recordedUpdateCalls.find((c) => c.method === "in")?.args).toEqual(["id", ["order-1", "order-2"]]);
    expect(mockRecordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "customer_updated",
        entityType: "customer",
        oldValue: { customerMobile: "+96555011111" },
        newValue: { customerName: "Ahmad Al-Sayed", customerMobile: "+96555099999" },
      })
    );
  });

  it("blocks writes in demo mode", async () => {
    mockIsDemoMode.mockReturnValue(true);
    await expect(
      updateCustomerInfo("+96555011111", { customerName: "Ahmad", customerMobile: "+96555099999" })
    ).rejects.toThrow("read-only demo");
  });

  it("rejects invalid input before touching the database", async () => {
    await expect(
      updateCustomerInfo("+96555011111", { customerName: "", customerMobile: "+96555099999" })
    ).rejects.toThrow();
    expect(mockRecordAuditLog).not.toHaveBeenCalled();
  });
});
