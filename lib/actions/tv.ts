"use server";

import { addDays, format, startOfWeek } from "date-fns";

import { createServiceClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/demo/mode";
import { getDemoTvBoard } from "@/lib/demo/data";
import { toDeliveryDate } from "@/lib/utils/countdown";
import { DELAYABLE_STATUSES, EMPLOYEE_ACTIVE_STATUSES, TV_COLUMNS, type TvColumnKey } from "@/types/domain";
import type { OrderPriority, OrderStatus } from "@/types/database.types";

export interface TvOrderItemReadiness {
  product: string;
  isReady: boolean;
}

export interface TvOrderCardData {
  id: string;
  orderNumber: string;
  customerName: string;
  product: string;
  assignedEmployees: string[];
  deliveryDate: string;
  deliveryTime: string;
  priority: OrderPriority;
  status: OrderStatus;
  thumbnailUrl: string | null;
  /** Item 1's (this order's own product) readiness — only meaningful/shown when additionalItems is non-empty. */
  itemReady: boolean;
  /** Items 2+ on the order — empty for a single-item order. */
  additionalItems: TvOrderItemReadiness[];
}

export interface TvDaySummary {
  dayIndex: number;
  label: string;
  date: string;
  totalOrders: number;
  completedOrders: number;
  pendingOrders: number;
  orders: { orderNumber: string; customerName: string; deliveryTime: string; status: OrderStatus }[];
}

export interface TvBoardData {
  activeOrders: number;
  delayedOrders: number;
  employeesWorking: number;
  columns: Record<TvColumnKey, TvOrderCardData[]>;
  week: TvDaySummary[];
  generatedAt: string;
}

const TERMINAL_STATUSES: OrderStatus[] = ["completed", "delivered", "collected"];

/**
 * No auth guard on purpose — this is the unattended kiosk board (spec:
 * "No login. Fullscreen."), meant to be read by customers waiting in the
 * shop as well as staff, so customer/employee full names and order details
 * are shown by design (a customer needs to recognize their own order on the
 * board). What it never returns: phone numbers, order notes, or anything
 * else from `orders`/`employees` beyond what TvOrderCardData/TvDaySummary
 * declare — see the select() calls below.
 */
export async function getTvBoard(): Promise<TvBoardData> {
  if (isDemoMode()) return getDemoTvBoard();

  const supabase = createServiceClient();
  const now = new Date();

  const { data: orders, error } = await supabase
    .from("orders")
    .select("id, order_number, customer_name, product, status, priority, delivery_date, delivery_time, item_ready")
    .eq("archived", false);
  if (error) throw new Error(error.message);

  const allOrders = orders ?? [];
  const activeRows = allOrders.filter((o) => o.status !== "completed");
  const orderIds = activeRows.map((o) => o.id);

  const [{ data: assignmentRows }, { data: fileRows }, { data: itemRows }] = await Promise.all([
    orderIds.length > 0
      ? supabase.from("order_assignments").select("order_id, employee_id").in("order_id", orderIds)
      : Promise.resolve({ data: [] as { order_id: string; employee_id: string }[] }),
    orderIds.length > 0
      ? supabase
          .from("order_files")
          .select("order_id, storage_path")
          .in("order_id", orderIds)
          .eq("file_type", "product_image")
      : Promise.resolve({ data: [] as { order_id: string; storage_path: string }[] }),
    orderIds.length > 0
      ? supabase.from("order_items").select("order_id, product, is_ready").in("order_id", orderIds).order("sort_order")
      : Promise.resolve({ data: [] as { order_id: string; product: string; is_ready: boolean }[] }),
  ]);

  const additionalItemsByOrder = new Map<string, TvOrderItemReadiness[]>();
  for (const row of itemRows ?? []) {
    const list = additionalItemsByOrder.get(row.order_id) ?? [];
    list.push({ product: row.product, isReady: row.is_ready });
    additionalItemsByOrder.set(row.order_id, list);
  }

  const employeeIds = [...new Set((assignmentRows ?? []).map((a) => a.employee_id))];
  let employeeNameById = new Map<string, string>();
  if (employeeIds.length > 0) {
    const { data: employees } = await supabase.from("employees").select("id, full_name").in("id", employeeIds);
    employeeNameById = new Map((employees ?? []).map((e) => [e.id, e.full_name]));
  }

  const assignmentsByOrder = new Map<string, string[]>();
  const activeStatusOrderIds = new Set(
    activeRows.filter((o) => EMPLOYEE_ACTIVE_STATUSES.includes(o.status)).map((o) => o.id)
  );
  const workingEmployeeIds = new Set<string>();
  for (const row of assignmentRows ?? []) {
    const name = employeeNameById.get(row.employee_id);
    if (name) {
      const list = assignmentsByOrder.get(row.order_id) ?? [];
      list.push(name);
      assignmentsByOrder.set(row.order_id, list);
    }
    if (activeStatusOrderIds.has(row.order_id)) workingEmployeeIds.add(row.employee_id);
  }

  const thumbnailPathByOrder = new Map<string, string>();
  for (const row of fileRows ?? []) {
    if (!thumbnailPathByOrder.has(row.order_id)) thumbnailPathByOrder.set(row.order_id, row.storage_path);
  }
  const thumbnailPaths = [...thumbnailPathByOrder.values()];
  const signedUrlByPath = new Map<string, string>();
  if (thumbnailPaths.length > 0) {
    const { data: signed } = await supabase.storage.from("product-images").createSignedUrls(thumbnailPaths, 3600);
    for (const s of signed ?? []) {
      if (s.signedUrl && s.path && !s.error) signedUrlByPath.set(s.path, s.signedUrl);
    }
  }

  const toCard = (o: (typeof activeRows)[number]): TvOrderCardData => {
    const path = thumbnailPathByOrder.get(o.id);
    return {
      id: o.id,
      orderNumber: o.order_number,
      customerName: o.customer_name,
      product: o.product,
      assignedEmployees: assignmentsByOrder.get(o.id) ?? [],
      deliveryDate: o.delivery_date,
      deliveryTime: o.delivery_time,
      priority: o.priority,
      status: o.status,
      thumbnailUrl: path ? signedUrlByPath.get(path) ?? null : null,
      itemReady: o.item_ready,
      additionalItems: additionalItemsByOrder.get(o.id) ?? [],
    };
  };

  const columns = Object.fromEntries(
    TV_COLUMNS.map((key) => [
      key,
      activeRows
        .filter((o) => o.status === key)
        .map(toCard)
        .sort((a, b) => `${a.deliveryDate}${a.deliveryTime}`.localeCompare(`${b.deliveryDate}${b.deliveryTime}`)),
    ])
  ) as Record<TvColumnKey, TvOrderCardData[]>;

  const delayedOrders = activeRows.filter(
    (o) => DELAYABLE_STATUSES.includes(o.status) && toDeliveryDate(o.delivery_date, o.delivery_time) < now
  ).length;

  const weekStart = startOfWeek(now);
  const week: TvDaySummary[] = Array.from({ length: 7 }).map((_, i) => {
    const date = addDays(weekStart, i);
    const isoDate = format(date, "yyyy-MM-dd");
    const dayOrders = allOrders.filter((o) => o.delivery_date === isoDate);
    return {
      dayIndex: i,
      label: format(date, "EEEE"),
      date: isoDate,
      totalOrders: dayOrders.length,
      completedOrders: dayOrders.filter((o) => TERMINAL_STATUSES.includes(o.status)).length,
      pendingOrders: dayOrders.filter((o) => !TERMINAL_STATUSES.includes(o.status)).length,
      orders: dayOrders
        .sort((a, b) => a.delivery_time.localeCompare(b.delivery_time))
        .map((o) => ({
          orderNumber: o.order_number,
          customerName: o.customer_name,
          deliveryTime: o.delivery_time,
          status: o.status,
        })),
    };
  });

  return {
    activeOrders: activeRows.length,
    delayedOrders,
    employeesWorking: workingEmployeeIds.size,
    columns,
    week,
    generatedAt: now.toISOString(),
  };
}
