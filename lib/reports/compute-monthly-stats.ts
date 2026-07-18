import "server-only";

import { differenceInMinutes, format } from "date-fns";

import { createServiceClient } from "@/lib/supabase/server";
import { toDeliveryDate } from "@/lib/utils/countdown";
import type { OrderStatus } from "@/types/database.types";

/**
 * Shared by the month-end cron (closed, historical months) and the live
 * Reports "this month so far" card — same aggregation logic either way, so
 * the two never drift.
 */

type ServiceClient = ReturnType<typeof createServiceClient>;

export interface MonthOrderInput {
  id: string;
  status: OrderStatus;
  paper: string | null;
  delivery_date: string;
  delivery_time: string;
  created_at: string;
  completed_at: string | null;
}

export interface MonthlyStatsResult {
  month: string;
  totalOrders: number;
  completedOrders: number;
  delayedOrders: number;
  ordersPerEmployee: Record<string, number>;
  avgCompletionMinutes: number | null;
  mostUsedPaper: string | null;
  mostRequestedMaterial: string | null;
}

export async function computeMonthlyStatistics(
  supabase: ServiceClient,
  monthOrders: MonthOrderInput[],
  monthStart: Date,
  { isClosedMonth }: { isClosedMonth: boolean }
): Promise<MonthlyStatsResult> {
  const totalOrders = monthOrders.length;
  const completedOrders = monthOrders.filter((o) => o.status === "completed");

  const delayedOrders = monthOrders.filter((o) => {
    const deliveryAt = toDeliveryDate(o.delivery_date, o.delivery_time);
    if (o.completed_at) return new Date(o.completed_at) > deliveryAt;
    // Still open: for a closed month that never finished counts as delayed;
    // for the current in-progress month, only count it once its own
    // delivery slot has already passed.
    return isClosedMonth || deliveryAt < new Date();
  }).length;

  const completionTimes = completedOrders
    .filter((o) => o.completed_at)
    .map((o) => differenceInMinutes(new Date(o.completed_at!), new Date(o.created_at)));
  const avgCompletionMinutes =
    completionTimes.length > 0 ? Math.round(completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length) : null;

  const mostUsedPaper = mode(monthOrders.map((o) => o.paper).filter((p): p is string => !!p));

  const orderIds = monthOrders.map((o) => o.id);
  const ordersPerEmployee: Record<string, number> = {};
  let mostRequestedMaterial: string | null = null;

  if (orderIds.length > 0) {
    const [assignmentResult, materialResult] = await Promise.all([
      supabase.from("order_assignments").select("order_id, employee_id").in("order_id", orderIds),
      supabase.from("material_requests").select("material_type").in("order_id", orderIds),
    ]);

    for (const row of (assignmentResult.data ?? []) as { employee_id: string }[]) {
      ordersPerEmployee[row.employee_id] = (ordersPerEmployee[row.employee_id] ?? 0) + 1;
    }

    mostRequestedMaterial = mode(((materialResult.data ?? []) as { material_type: string }[]).map((r) => r.material_type));
  }

  return {
    month: format(monthStart, "yyyy-MM"),
    totalOrders,
    completedOrders: completedOrders.length,
    delayedOrders,
    ordersPerEmployee,
    avgCompletionMinutes,
    mostUsedPaper,
    mostRequestedMaterial,
  };
}

function mode(values: string[]): string | null {
  if (values.length === 0) return null;
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: string | null = null;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}
