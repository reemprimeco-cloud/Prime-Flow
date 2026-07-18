"use server";

import { requireAdmin } from "@/lib/auth/guards";
import { createServiceClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/demo/mode";
import { getDemoArchivedOrders } from "@/lib/demo/data";
import type { OrderStatus } from "@/types/database.types";

export interface ArchivedOrderItem {
  id: string;
  orderNumber: string;
  customerName: string;
  product: string;
  status: OrderStatus;
  completedAt: string | null;
  deliveryDate: string;
}

export async function listArchivedOrders(): Promise<ArchivedOrderItem[]> {
  await requireAdmin();
  if (isDemoMode()) return getDemoArchivedOrders();
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("orders")
    .select("id, order_number, customer_name, product, status, completed_at, delivery_date")
    .eq("archived", true)
    .order("completed_at", { ascending: false });
  if (error) throw new Error(error.message);

  return (data ?? []).map((o) => ({
    id: o.id,
    orderNumber: o.order_number,
    customerName: o.customer_name,
    product: o.product,
    status: o.status,
    completedAt: o.completed_at,
    deliveryDate: o.delivery_date,
  }));
}
