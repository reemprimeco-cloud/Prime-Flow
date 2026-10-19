import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import { phoneKey } from "@/lib/utils/phone";

type ServiceClient = ReturnType<typeof createServiceClient>;

/** Rows scanned per lookup — the loose LIKE below can match a few unrelated numbers. */
const CANDIDATE_LIMIT = 25;

/**
 * A LIKE pattern for a phoneKey: its last 8 digits in order with anything
 * between, so it catches every stored spacing and country-code prefix.
 * Loose on purpose — callers confirm each row with phoneKey.
 */
function looseMobilePattern(key: string): string {
  return `%${key.slice(-8).split("").join("%")}`;
}

/**
 * Ids of every order under this customer's number, whatever format each was
 * stored in. A number too short to be a real phone (e.g. "N/A") matches only
 * itself.
 */
export async function findCustomerOrderIds(supabase: ServiceClient, customerMobile: string): Promise<string[]> {
  const key = phoneKey(customerMobile);
  const exact = key.length < 8;
  const query = supabase.from("orders").select("id, customer_mobile");
  const { data, error } = await (exact
    ? query.eq("customer_mobile", customerMobile)
    : query.like("customer_mobile", looseMobilePattern(key)));
  if (error) throw new Error(error.message);
  return (data ?? []).filter((row) => exact || phoneKey(row.customer_mobile) === key).map((row) => row.id);
}

export interface CustomerIdentity {
  customerName: string;
  customerMobile: string;
  /** True when the mobile belongs to a customer already on file. */
  matched: boolean;
}

/**
 * A customer has no row of their own — they're the mobile number on their
 * orders (see lib/actions/customers.ts). So when a new order arrives from a
 * customer-entered source (the public request form, WooCommerce, a QuickBooks
 * invoice) carrying a number that's already on file, it joins that customer:
 * the name and the number's stored spelling come from their latest order,
 * not from what was just typed. That keeps one customer under one name in
 * the customer list and in every message, instead of a new entry per typo
 * or per "Mohammed" / "محمد" / "Abu Ali".
 *
 * Matching is by phoneKey, since stored numbers mix "+965 5000 1111",
 * "+96550001111" and "50001111". A failed lookup never blocks the order —
 * it just keeps what was entered.
 */
export async function resolveExistingCustomer(
  supabase: ServiceClient,
  customerName: string,
  customerMobile: string
): Promise<CustomerIdentity> {
  const entered: CustomerIdentity = {
    customerName,
    customerMobile,
    matched: false,
  };
  const key = phoneKey(customerMobile);
  if (key.length < 8) return entered;

  // Every digit in order with anything between — matches any stored spacing
  // or country-code prefix; phoneKey then confirms the exact match.
  const pattern = looseMobilePattern(key);
  try {
    const { data, error } = await supabase
      .from("orders")
      .select("customer_name, customer_mobile")
      .like("customer_mobile", pattern)
      .order("created_at", { ascending: false })
      .limit(CANDIDATE_LIMIT);
    if (error) throw new Error(error.message);

    const existing = (data ?? []).find((row) => phoneKey(row.customer_mobile) === key && row.customer_name.trim());
    if (!existing) return entered;
    return {
      customerName: existing.customer_name,
      customerMobile: existing.customer_mobile,
      matched: true,
    };
  } catch (err) {
    console.warn(`[customers] existing-customer lookup failed: ${err instanceof Error ? err.message : String(err)}`);
    return entered;
  }
}
