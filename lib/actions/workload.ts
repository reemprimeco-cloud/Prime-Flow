"use server";

import { differenceInMinutes, isToday } from "date-fns";

import { requireAdmin } from "@/lib/auth/guards";
import { createServiceClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/demo/mode";
import { getDemoEmployeeWorkload } from "@/lib/demo/data";
import { toDeliveryDate } from "@/lib/utils/countdown";
import { DELAYABLE_STATUSES, EMPLOYEE_ACTIVE_STATUSES } from "@/types/domain";

export interface EmployeeWorkload {
  employeeId: string;
  employeeName: string;
  activeJobs: number;
  queuedJobs: number;
  completedToday: number;
  avgCompletionMinutes: number | null;
  waitingMaterials: number;
  delayedJobs: number;
}

export async function listEmployeeWorkload(): Promise<EmployeeWorkload[]> {
  await requireAdmin();
  if (isDemoMode()) return getDemoEmployeeWorkload();
  const supabase = createServiceClient();
  const now = new Date();

  const [{ data: employees }, { data: assignments }, { data: historyRows }] = await Promise.all([
    supabase.from("employees").select("id, full_name").eq("active", true).eq("role", "employee"),
    supabase.from("order_assignments").select("employee_id, order_id"),
    supabase
      .from("order_status_history")
      .select("changed_by, changed_at, to_status")
      .in("to_status", ["collected", "delivered"]),
  ]);
  if (!employees || employees.length === 0) return [];

  const orderIds = [...new Set((assignments ?? []).map((a) => a.order_id))];
  const { data: orders } =
    orderIds.length > 0
      ? await supabase
          .from("orders")
          .select("id, status, delivery_date, delivery_time, created_at, completed_at")
          .in("id", orderIds)
          .eq("archived", false)
      : { data: [] };
  const orderById = new Map((orders ?? []).map((o) => [o.id, o]));

  const employeeOrderIds = new Map<string, string[]>();
  for (const a of assignments ?? []) {
    const list = employeeOrderIds.get(a.employee_id) ?? [];
    list.push(a.order_id);
    employeeOrderIds.set(a.employee_id, list);
  }

  const completionsByEmployee = new Map<string, Date[]>();
  for (const row of historyRows ?? []) {
    if (!row.changed_by) continue;
    const list = completionsByEmployee.get(row.changed_by) ?? [];
    list.push(new Date(row.changed_at));
    completionsByEmployee.set(row.changed_by, list);
  }

  return employees
    .map((emp) => {
      const myOrderIds = employeeOrderIds.get(emp.id) ?? [];
      const myOrders = myOrderIds.map((id) => orderById.get(id)).filter((o): o is NonNullable<typeof o> => !!o);

      const activeJobs = myOrders.filter((o) => EMPLOYEE_ACTIVE_STATUSES.includes(o.status)).length;
      const queuedJobs = myOrders.filter((o) => o.status === "new").length;
      const waitingMaterials = myOrders.filter((o) => o.status === "waiting_materials").length;
      const delayedJobs = myOrders.filter(
        (o) => DELAYABLE_STATUSES.includes(o.status) && toDeliveryDate(o.delivery_date, o.delivery_time) < now
      ).length;

      const myCompletions = completionsByEmployee.get(emp.id) ?? [];
      const completedToday = myCompletions.filter((d) => isToday(d)).length;

      const completedOrdersWithTimes = myOrders.filter((o) => o.status === "completed" && o.completed_at);
      const completionMinutes = completedOrdersWithTimes.map((o) => differenceInMinutes(new Date(o.completed_at!), new Date(o.created_at)));
      const avgCompletionMinutes =
        completionMinutes.length > 0 ? Math.round(completionMinutes.reduce((a, b) => a + b, 0) / completionMinutes.length) : null;

      return {
        employeeId: emp.id,
        employeeName: emp.full_name,
        activeJobs,
        queuedJobs,
        completedToday,
        avgCompletionMinutes,
        waitingMaterials,
        delayedJobs,
      };
    })
    .sort((a, b) => b.activeJobs - a.activeJobs);
}
