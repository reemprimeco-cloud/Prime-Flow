"use server";

import { requireAdmin } from "@/lib/auth/guards";
import { createServiceClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/demo/mode";
import { getDemoGlobalSearch } from "@/lib/demo/data";

export interface SearchResult {
  type: "order" | "employee";
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

const MAX_RESULTS_PER_TYPE = 8;

export async function globalSearch(query: string): Promise<SearchResult[]> {
  await requireAdmin();
  const term = query.trim();
  if (term.length < 2) return [];
  if (isDemoMode()) return getDemoGlobalSearch(term);

  const supabase = createServiceClient();
  const like = `%${term.replace(/[%,]/g, "")}%`;

  const [{ data: orders }, { data: employees }] = await Promise.all([
    supabase
      .from("orders")
      .select("id, order_number, customer_name, customer_mobile, product, notes")
      .eq("archived", false)
      .or(
        `order_number.ilike.${like},customer_name.ilike.${like},customer_mobile.ilike.${like},product.ilike.${like},notes.ilike.${like}`
      )
      .limit(MAX_RESULTS_PER_TYPE),
    supabase
      .from("employees")
      .select("id, full_name, phone, role")
      .or(`full_name.ilike.${like},phone.ilike.${like}`)
      .limit(MAX_RESULTS_PER_TYPE),
  ]);

  const orderResults: SearchResult[] = (orders ?? []).map((o) => ({
    type: "order",
    id: o.id,
    title: `${o.order_number} — ${o.customer_name}`,
    subtitle: o.product,
    href: `/dashboard?order=${o.id}`,
  }));

  const employeeResults: SearchResult[] = (employees ?? []).map((e) => ({
    type: "employee",
    id: e.id,
    title: e.full_name,
    subtitle: e.phone ?? "No phone on file",
    href: `/employees`,
  }));

  return [...orderResults, ...employeeResults];
}
