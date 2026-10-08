"use server";

import { requireAdmin } from "@/lib/auth/guards";
import { isDemoMode } from "@/lib/demo/mode";
import { findInvoiceByDocNumber, loadTokens } from "@/lib/quickbooks/client";
import { importInvoice, type ImportInvoiceResult } from "@/lib/quickbooks/import";
import { createServiceClient } from "@/lib/supabase/server";

export type ManualImportResult = ImportInvoiceResult | { status: "error"; message: string };

/**
 * Import one invoice by the number printed on it — for invoices the webhook
 * missed (created before the integration went live, or while it was down).
 * Reads only: nothing on the invoice changes, so the payment gateway doesn't
 * re-send the customer a link.
 */
export async function importQuickBooksInvoiceByNumber(docNumber: string): Promise<ManualImportResult> {
  await requireAdmin();
  if (isDemoMode()) return { status: "error", message: "Not available in demo mode" };

  const trimmed = docNumber.trim();
  if (!/^[A-Za-z0-9-]{1,21}$/.test(trimmed)) return { status: "error", message: "Enter the invoice number as printed, e.g. 2810" };

  const supabase = createServiceClient();
  try {
    const tokens = await loadTokens(supabase);
    if (!tokens) return { status: "error", message: "QuickBooks is not connected" };
    const invoice = await findInvoiceByDocNumber(supabase, trimmed);
    if (!invoice?.Id) return { status: "skipped", reason: `No invoice #${trimmed} in QuickBooks` };
    return await importInvoice(supabase, tokens.realmId, invoice.Id);
  } catch (error) {
    console.error(`[quickbooks] manual import of invoice #${trimmed} failed`, error);
    return { status: "error", message: error instanceof Error ? error.message : "Import failed" };
  }
}
