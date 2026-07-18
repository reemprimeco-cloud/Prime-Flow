"use server";

import { requireAdmin } from "@/lib/auth/guards";
import { createServiceClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/demo/mode";
import { getDemoCalendarOrders } from "@/lib/demo/data";
import { toDeliveryDate } from "@/lib/utils/countdown";
import { DELAYABLE_STATUSES } from "@/types/domain";
import type { OrderPriority, OrderStatus } from "@/types/database.types";

export interface CalendarOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  product: string;
  deliveryDate: string;
  deliveryTime: string;
  status: OrderStatus;
  priority: OrderPriority;
  isOverdue: boolean;
}

export async function listCalendarOrders(startDate: string, endDate: string): Promise<CalendarOrder[]> {
  await requireAdmin();
  if (isDemoMode()) return getDemoCalendarOrders(startDate, endDate);
  const supabase = createServiceClient();
  const now = new Date();

  const { data, error } = await supabase
    .from("orders")
    .select("id, order_number, customer_name, product, delivery_date, delivery_time, status, priority")
    .eq("archived", false)
    .gte("delivery_date", startDate)
    .lte("delivery_date", endDate)
    .order("delivery_time", { ascending: true });
  if (error) throw new Error(error.message);

  return (data ?? []).map((o) => ({
    id: o.id,
    orderNumber: o.order_number,
    customerName: o.customer_name,
    product: o.product,
    deliveryDate: o.delivery_date,
    deliveryTime: o.delivery_time,
    status: o.status,
    priority: o.priority,
    isOverdue: DELAYABLE_STATUSES.includes(o.status) && toDeliveryDate(o.delivery_date, o.delivery_time) < now,
  }));
}
