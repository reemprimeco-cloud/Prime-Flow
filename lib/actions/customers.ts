"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/guards";
import { createServiceClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/demo/mode";
import { getDemoCustomers } from "@/lib/demo/data";
import { recordAuditLog } from "@/lib/audit/log";
import { editCustomerSchema, type EditCustomerInput } from "@/lib/validation/customer";
import type { NotificationChannel, OrderLanguage } from "@/types/database.types";

const DEMO_WRITE_ERROR = "This is a read-only demo — writes are disabled.";

/** How many recent order rows to scan when building the customer list — see listCustomers. */
const CUSTOMER_SCAN_LIMIT = 5000;

export interface CustomerListItem {
  customerMobile: string;
  customerName: string;
  orderCount: number;
  lastOrderAt: string;
  preferredLanguage: OrderLanguage;
  whatsappEnabled: boolean;
  preferredChannel: NotificationChannel;
}

/**
 * Not a real customer entity (see docs/ARCHITECTURE.md's "not an ERP/CRM"
 * note) — same as searchCustomers, this is a distinct-by-mobile-number read
 * over order history, just returning every customer instead of a filtered
 * few. Bounded to the CUSTOMER_SCAN_LIMIT most recent orders; a shop
 * generating enough order volume to blow past that would be the signal to
 * revisit the no-customer-entity design, not to raise this number further.
 */
export async function listCustomers(): Promise<CustomerListItem[]> {
  await requireAdmin();
  if (isDemoMode()) return getDemoCustomers();

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("orders")
    .select("customer_name, customer_mobile, preferred_language, whatsapp_enabled, preferred_channel, created_at")
    .order("created_at", { ascending: false })
    .limit(CUSTOMER_SCAN_LIMIT);
  if (error) throw new Error(error.message);

  const byMobile = new Map<string, CustomerListItem>();
  for (const row of data ?? []) {
    const existing = byMobile.get(row.customer_mobile);
    if (existing) {
      existing.orderCount += 1;
      continue; // rows are newest-first, so the first row seen per mobile already has the latest name/prefs
    }
    byMobile.set(row.customer_mobile, {
      customerMobile: row.customer_mobile,
      customerName: row.customer_name,
      orderCount: 1,
      lastOrderAt: row.created_at,
      preferredLanguage: row.preferred_language,
      whatsappEnabled: row.whatsapp_enabled,
      preferredChannel: row.preferred_channel,
    });
  }
  return Array.from(byMobile.values()).sort((a, b) => b.lastOrderAt.localeCompare(a.lastOrderAt));
}

/**
 * Corrects a customer's name/mobile across every order that currently
 * carries the old mobile number — the fix for the "same customer, several
 * slightly different entries" problem that a typo'd or inconsistently
 * formatted phone number causes in the mobile-keyed customer list above. If
 * the new number happens to match another existing customer, this merges
 * the two under one identity, which is the desired outcome, not a conflict
 * to guard against.
 */
export async function updateCustomerInfo(oldMobile: string, input: EditCustomerInput): Promise<{ updated: number }> {
  const session = await requireAdmin();
  if (isDemoMode()) throw new Error(DEMO_WRITE_ERROR);

  const parsed = editCustomerSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid customer details");
  const data = parsed.data;

  const supabase = createServiceClient();
  const { data: updatedRows, error } = await supabase
    .from("orders")
    .update({ customer_name: data.customerName, customer_mobile: data.customerMobile })
    .eq("customer_mobile", oldMobile)
    .select("id");
  if (error) throw new Error(error.message);

  // No entityId: audit_logs.entity_id is a uuid column (it identifies an
  // employee/order/etc. by their DB row id) and a customer has no such row
  // to point at — the old mobile number that identifies which customer this
  // was goes in oldValue instead.
  await recordAuditLog({
    actorId: session.employeeId,
    actorName: session.fullName,
    action: "customer_updated",
    entityType: "customer",
    oldValue: { customerMobile: oldMobile },
    newValue: { customerName: data.customerName, customerMobile: data.customerMobile },
  });

  revalidatePath("/customers");
  revalidatePath("/dashboard");
  return { updated: updatedRows?.length ?? 0 };
}
