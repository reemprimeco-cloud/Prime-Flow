"use server";

import { differenceInMinutes, startOfMonth } from "date-fns";

import { requireAdmin } from "@/lib/auth/guards";
import { createServiceClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/demo/mode";
import { getDemoOperationsKpis } from "@/lib/demo/data";
import { toDeliveryDate } from "@/lib/utils/countdown";
import { DELAYABLE_STATUSES, EMPLOYEE_ACTIVE_STATUSES } from "@/types/domain";

export interface OperationsKpis {
  ordersInProduction: number;
  ordersDelayed: number;
  avgProductionMinutes: number | null;
  pendingMaterialRequests: number;
  employeeUtilizationPercent: number;
  completionRatePercent: number;
  todaysDeliveries: number;
  todaysPickups: number;
}

export async function getOperationsKpis(): Promise<OperationsKpis> {
  await requireAdmin();
  if (isDemoMode()) return getDemoOperationsKpis();
  const supabase = createServiceClient();
  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);
  const monthStartIso = startOfMonth(now).toISOString().slice(0, 10);

  const [{ data: activeOrders }, { data: monthOrders }, { count: pendingMaterialsCount }, { data: activeEmployees }] =
    await Promise.all([
      supabase
        .from("orders")
        .select("id, status, delivery_date, delivery_time")
        .eq("archived", false)
        .not("status", "in", "(completed)"),
      supabase
        .from("orders")
        .select("status, created_at, completed_at")
        .gte("delivery_date", monthStartIso)
        .eq("archived", false),
      supabase.from("material_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("employees").select("id").eq("active", true).eq("role", "employee"),
    ]);

  const activeOrderIds = (activeOrders ?? [])
    .filter((o) => EMPLOYEE_ACTIVE_STATUSES.includes(o.status))
    .map((o) => o.id);
  const { data: assignedToActiveOrders } =
    activeOrderIds.length > 0
      ? await supabase.from("order_assignments").select("employee_id").in("order_id", activeOrderIds)
      : { data: [] as { employee_id: string }[] };

  const ordersInProduction = (activeOrders ?? []).filter((o) => o.status === "in_progress").length;
  const ordersDelayed = (activeOrders ?? []).filter(
    (o) => DELAYABLE_STATUSES.includes(o.status) && toDeliveryDate(o.delivery_date, o.delivery_time) < now
  ).length;

  const todaysDeliveries = (activeOrders ?? []).filter(
    (o) => o.delivery_date === todayIso && (o.status === "ready_delivery" || o.status === "delivered")
  ).length;
  const todaysPickups = (activeOrders ?? []).filter(
    (o) => o.delivery_date === todayIso && (o.status === "ready_pickup" || o.status === "collected")
  ).length;

  const monthCompleted = (monthOrders ?? []).filter((o) => o.status === "completed" && o.completed_at);
  const completionRatePercent =
    (monthOrders?.length ?? 0) > 0 ? Math.round((monthCompleted.length / (monthOrders?.length ?? 1)) * 100) : 0;
  const completionTimes = monthCompleted.map((o) => differenceInMinutes(new Date(o.completed_at!), new Date(o.created_at)));
  const avgProductionMinutes =
    completionTimes.length > 0 ? Math.round(completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length) : null;

  const totalActiveEmployees = activeEmployees?.length ?? 0;
  const workingEmployeeIds = new Set((assignedToActiveOrders ?? []).map((a) => a.employee_id));
  const employeeUtilizationPercent =
    totalActiveEmployees > 0 ? Math.round((workingEmployeeIds.size / totalActiveEmployees) * 100) : 0;

  return {
    ordersInProduction,
    ordersDelayed,
    avgProductionMinutes,
    pendingMaterialRequests: pendingMaterialsCount ?? 0,
    employeeUtilizationPercent,
    completionRatePercent,
    todaysDeliveries,
    todaysPickups,
  };
}
