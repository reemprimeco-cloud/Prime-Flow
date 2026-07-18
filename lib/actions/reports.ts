"use server";

import { format, startOfMonth } from "date-fns";

import { requireAdmin } from "@/lib/auth/guards";
import { createServiceClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/demo/mode";
import { getDemoCurrentMonthStats, getDemoMonthlyStatistics } from "@/lib/demo/data";
import { listEmployees } from "@/lib/actions/employees";
import { computeMonthlyStatistics, type MonthlyStatsResult } from "@/lib/reports/compute-monthly-stats";
import { MATERIAL_TYPE_LABELS } from "@/types/domain";
import type { MaterialType } from "@/types/database.types";

export interface EmployeeOrderCount {
  employeeId: string;
  employeeName: string;
  count: number;
}

export interface MonthlyStatisticItem {
  year: number;
  month: number;
  label: string;
  totalOrders: number;
  completedOrders: number;
  delayedOrders: number;
  ordersPerEmployee: EmployeeOrderCount[];
  avgCompletionMinutes: number | null;
  mostUsedPaper: string | null;
  mostRequestedMaterial: string | null;
  generatedAt: string;
}

export interface CurrentMonthStats {
  label: string;
  totalOrders: number;
  completedOrders: number;
  delayedOrders: number;
  ordersPerEmployee: EmployeeOrderCount[];
  avgCompletionMinutes: number | null;
  mostUsedPaper: string | null;
  mostRequestedMaterial: string | null;
}

function toDisplayItem(
  raw: MonthlyStatsResult,
  year: number,
  monthNum: number,
  generatedAt: string,
  employeeNameById: Map<string, string>
): MonthlyStatisticItem {
  return {
    year,
    month: monthNum,
    label: format(new Date(year, monthNum - 1, 1), "MMMM yyyy"),
    totalOrders: raw.totalOrders,
    completedOrders: raw.completedOrders,
    delayedOrders: raw.delayedOrders,
    ordersPerEmployee: resolveEmployeeCounts(raw.ordersPerEmployee, employeeNameById),
    avgCompletionMinutes: raw.avgCompletionMinutes,
    mostUsedPaper: raw.mostUsedPaper,
    mostRequestedMaterial: raw.mostRequestedMaterial
      ? MATERIAL_TYPE_LABELS[raw.mostRequestedMaterial as MaterialType] ?? raw.mostRequestedMaterial
      : null,
    generatedAt,
  };
}

function resolveEmployeeCounts(
  counts: Record<string, number>,
  employeeNameById: Map<string, string>
): EmployeeOrderCount[] {
  return Object.entries(counts)
    .map(([employeeId, count]) => ({
      employeeId,
      employeeName: employeeNameById.get(employeeId) ?? "Unknown",
      count,
    }))
    .sort((a, b) => b.count - a.count);
}

export async function listMonthlyStatistics(): Promise<MonthlyStatisticItem[]> {
  await requireAdmin();
  if (isDemoMode()) return getDemoMonthlyStatistics();
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("monthly_statistics")
    .select("*")
    .order("year", { ascending: false })
    .order("month", { ascending: false })
    .limit(24);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return [];

  const employees = await listEmployees();
  const employeeNameById = new Map(employees.map((e) => [e.id, e.fullName]));

  return data.map((row) =>
    toDisplayItem(
      {
        month: format(new Date(row.year, row.month - 1, 1), "yyyy-MM"),
        totalOrders: row.total_orders,
        completedOrders: row.completed_orders,
        delayedOrders: row.delayed_orders,
        ordersPerEmployee: (row.orders_per_employee as Record<string, number>) ?? {},
        avgCompletionMinutes: row.avg_completion_minutes,
        mostUsedPaper: row.most_used_paper,
        mostRequestedMaterial: row.most_requested_material,
      },
      row.year,
      row.month,
      row.generated_at,
      employeeNameById
    )
  );
}

export async function getCurrentMonthStats(): Promise<CurrentMonthStats> {
  await requireAdmin();
  if (isDemoMode()) return getDemoCurrentMonthStats();
  const supabase = createServiceClient();

  const now = new Date();
  const monthStart = startOfMonth(now);
  const startIso = format(monthStart, "yyyy-MM-dd");

  const { data: monthOrders, error } = await supabase
    .from("orders")
    .select("id, status, paper, delivery_date, delivery_time, created_at, completed_at")
    .gte("delivery_date", startIso);
  if (error) throw new Error(error.message);

  const stats = await computeMonthlyStatistics(supabase, monthOrders ?? [], monthStart, { isClosedMonth: false });

  const employees = await listEmployees();
  const employeeNameById = new Map(employees.map((e) => [e.id, e.fullName]));

  return {
    label: format(monthStart, "MMMM yyyy"),
    totalOrders: stats.totalOrders,
    completedOrders: stats.completedOrders,
    delayedOrders: stats.delayedOrders,
    ordersPerEmployee: resolveEmployeeCounts(stats.ordersPerEmployee, employeeNameById),
    avgCompletionMinutes: stats.avgCompletionMinutes,
    mostUsedPaper: stats.mostUsedPaper,
    mostRequestedMaterial: stats.mostRequestedMaterial
      ? MATERIAL_TYPE_LABELS[stats.mostRequestedMaterial as MaterialType] ?? stats.mostRequestedMaterial
      : null,
  };
}
