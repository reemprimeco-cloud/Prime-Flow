import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequireAdmin, mockLoadTokens, mockFindInvoice, mockImportInvoice } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(async () => ({ employeeId: "admin-1", role: "admin" })),
  mockLoadTokens: vi.fn(),
  mockFindInvoice: vi.fn(),
  mockImportInvoice: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/demo/mode", () => ({ isDemoMode: () => false }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => ({}) }));
vi.mock("@/lib/quickbooks/client", () => ({ loadTokens: mockLoadTokens, findInvoiceByDocNumber: mockFindInvoice }));
vi.mock("@/lib/quickbooks/import", () => ({ importInvoice: mockImportInvoice }));

import { importQuickBooksInvoiceByNumber } from "./quickbooks";

beforeEach(() => {
  vi.clearAllMocks();
  mockLoadTokens.mockResolvedValue({ realmId: "123" });
});

describe("importQuickBooksInvoiceByNumber", () => {
  it("looks the invoice up by its printed number and imports it by id", async () => {
    mockFindInvoice.mockResolvedValue({ Id: "6107", DocNumber: "2810" });
    mockImportInvoice.mockResolvedValue({ status: "imported", orderNumber: "#1130" });

    const result = await importQuickBooksInvoiceByNumber(" 2810 ");

    expect(mockRequireAdmin).toHaveBeenCalled();
    expect(mockFindInvoice).toHaveBeenCalledWith({}, "2810");
    expect(mockImportInvoice).toHaveBeenCalledWith({}, "123", "6107");
    expect(result).toEqual({ status: "imported", orderNumber: "#1130" });
  });

  it("reports an unknown invoice number without importing", async () => {
    mockFindInvoice.mockResolvedValue(null);
    expect(await importQuickBooksInvoiceByNumber("9999")).toEqual({ status: "skipped", reason: "No invoice #9999 in QuickBooks" });
    expect(mockImportInvoice).not.toHaveBeenCalled();
  });

  it("rejects malformed input and a missing connection", async () => {
    expect((await importQuickBooksInvoiceByNumber("drop table")).status).toBe("error");
    mockLoadTokens.mockResolvedValue(null);
    expect(await importQuickBooksInvoiceByNumber("2810")).toEqual({ status: "error", message: "QuickBooks is not connected" });
  });
});
