"use server";

import { revalidatePath } from "next/cache";
import { isSameMonth } from "date-fns";

import { requireAdmin } from "@/lib/auth/guards";
import { createServiceClient } from "@/lib/supabase/server";
import { broadcast, CHANNELS } from "@/lib/realtime/channels";
import { orderFormSchema } from "@/lib/validation/order";
import { isAllowedUpload, MAX_FILE_SIZE_BYTES } from "@/lib/files/constants";
import { toDeliveryDate } from "@/lib/utils/countdown";
import { getTodayBoundsInKuwait } from "@/lib/utils/date";
import { DEFAULT_ORDERS_PAGE_SIZE } from "@/lib/orders/constants";
import { DELAYABLE_STATUSES } from "@/types/domain";
import { isDemoMode } from "@/lib/demo/mode";
import {
  getDemoCompletedOrders,
  getDemoCustomerSuggestions,
  getDemoDashboardBoard,
  getDemoDashboardStats,
  getDemoOrderDetail,
  getDemoOrders,
} from "@/lib/demo/data";
import { recordAuditLog } from "@/lib/audit/log";
import { applyOrderStatusTransition } from "@/lib/actions/status-transition";
import {
  notifyEmployeeHighPriorityAssigned,
  notifyEmployeeJobAssigned,
  notifyEmployeeJobCancelled,
  notifyEmployeeJobReassigned,
  notifyOrderCreated,
} from "@/lib/notifications/service";
import { DEFAULT_NOTIFICATION_PREFERENCES, normalizeNotificationPreferences } from "@/lib/notifications/constants";
import type { NotificationPreferences } from "@/lib/notifications/constants";
import type {
  DesignApprovalStatus,
  MaterialPriority,
  MaterialRequestStatus,
  MaterialType,
  NotificationChannel,
  OrderDeliveryProvider,
  OrderFileType,
  OrderFulfillmentType,
  OrderLanguage,
  OrderPriority,
  OrderStatus,
} from "@/types/database.types";

type ServiceClient = ReturnType<typeof createServiceClient>;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OrderFilters {
  search?: string;
  status?: OrderStatus | "all";
  employeeId?: string | "all";
  priority?: OrderPriority | "all";
  deliveryDate?: string;
  page?: number;
  pageSize?: number;
}

export interface OrderListResult {
  items: OrderListItem[];
  totalCount: number;
  page: number;
  pageSize: number;
}

export interface OrderListItem {
  id: string;
  orderNumber: string;
  customerName: string;
  customerMobile: string;
  product: string;
  paper: string | null;
  paperSize: string | null;
  quantity: number;
  finishing: string | null;
  priority: OrderPriority;
  deliveryDate: string;
  deliveryTime: string;
  status: OrderStatus;
  fulfillmentType: OrderFulfillmentType;
  deliveryProvider: OrderDeliveryProvider;
  notes: string | null;
  whatsappEnabled: boolean;
  preferredLanguage: OrderLanguage;
  approved: boolean;
  designApprovalStatus: DesignApprovalStatus;
  assignedEmployees: { id: string; fullName: string }[];
  thumbnailUrl: string | null;
  pendingMaterialTypes: MaterialType[];
  itemCount: number;
}

export interface OrderItemDetail {
  id: string;
  product: string;
  paper: string | null;
  paperSize: string | null;
  quantity: number;
  finishing: string | null;
  employeeId: string | null;
  employeeName: string | null;
}

export interface OrderDetail {
  id: string;
  orderNumber: string;
  customerName: string;
  customerMobile: string;
  preferredLanguage: OrderLanguage;
  whatsappEnabled: boolean;
  preferredChannel: NotificationChannel;
  notificationPreferences: NotificationPreferences;
  product: string;
  paper: string | null;
  paperSize: string | null;
  quantity: number;
  finishing: string | null;
  priority: OrderPriority;
  deliveryDate: string;
  deliveryTime: string;
  deliveryAddress: string | null;
  deliveryMapLink: string | null;
  deliveryArea: string | null;
  deliveryBlock: string | null;
  deliveryStreet: string | null;
  deliveryBuildingNumber: string | null;
  notes: string | null;
  status: OrderStatus;
  fulfillmentType: OrderFulfillmentType;
  deliveryProvider: OrderDeliveryProvider;
  armadaDeliveryCode: string | null;
  armadaDeliveryStatus: string | null;
  armadaTrackingLink: string | null;
  armadaDriverName: string | null;
  armadaDriverPhone: string | null;
  approved: boolean;
  designApprovalStatus: DesignApprovalStatus;
  designApprovalNote: string | null;
  designApprovalRequestedAt: string | null;
  designApprovalRespondedAt: string | null;
  createdAt: string;
  updatedAt: string;
  assignedEmployees: { id: string; fullName: string }[];
  items: OrderItemDetail[];
  productImages: { id: string; fileName: string; url: string | null }[];
  designFiles: { id: string; fileName: string; url: string | null }[];
  orderNotes: { id: string; note: string; employeeName: string; createdAt: string }[];
  statusHistory: {
    id: string;
    fromStatus: OrderStatus | null;
    toStatus: OrderStatus;
    employeeName: string;
    changedAt: string;
  }[];
  materialRequests: {
    id: string;
    materialType: MaterialType;
    description: string;
    quantity: string;
    priority: MaterialPriority;
    status: MaterialRequestStatus;
    employeeName: string;
    createdAt: string;
  }[];
}

export interface DashboardStats {
  new: number;
  inProgress: number;
  waitingMaterials: number;
  readyPickup: number;
  readyDelivery: number;
  completedThisMonth: number;
  delayed: number;
}

export interface CustomerSuggestion {
  customerName: string;
  customerMobile: string;
  preferredLanguage: OrderLanguage;
  whatsappEnabled: boolean;
  preferredChannel: NotificationChannel;
}

export interface CompletedOrderFilters {
  search?: string;
  page?: number;
  pageSize?: number;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Statuses that represent a finished job. These stay off the default
 * (unfiltered) dashboard board — see getOrders below — and instead surface
 * under Reports > Completed Orders (getCompletedOrders), until month-end
 * archival moves them to /archive.
 */
const DASHBOARD_COMPLETED_STATUSES: OrderStatus[] = ["collected", "delivered", "completed"];

const ORDER_LIST_SELECT =
  "id, order_number, customer_name, customer_mobile, product, paper, paper_size, quantity, finishing, priority, delivery_date, delivery_time, status, fulfillment_type, delivery_provider, notes, whatsapp_enabled, preferred_language, approved, design_approval_status";

interface OrderListRow {
  id: string;
  order_number: string;
  customer_name: string;
  customer_mobile: string;
  product: string;
  paper: string | null;
  paper_size: string | null;
  quantity: number;
  finishing: string | null;
  priority: OrderPriority;
  delivery_date: string;
  delivery_time: string;
  status: OrderStatus;
  fulfillment_type: OrderFulfillmentType;
  delivery_provider: OrderDeliveryProvider;
  notes: string | null;
  whatsapp_enabled: boolean;
  preferred_language: OrderLanguage;
  approved: boolean;
  design_approval_status: DesignApprovalStatus;
}

/**
 * Paginated by design — an earlier version fetched every non-archived order
 * in one unbounded query, which is fine at today's data volume but was
 * flagged as the top scaling risk for shops running 1000+ active orders
 * (see docs/QA_REPORT_v1.0.0.md §6). `employeeId` can't be pushed into the
 * main `.range()` query directly since assignment lives in a join table
 * (order_assignments), not a column on `orders` — so when it's set, this
 * resolves the employee's order IDs first and adds them as an `.in()`
 * filter to the same paginated query, rather than fetching a page and then
 * filtering it in JS (which would silently under-fill or empty out pages).
 */
export async function getOrders(filters: OrderFilters = {}): Promise<OrderListResult> {
  await requireAdmin();
  if (isDemoMode()) return getDemoOrders(filters);
  const supabase = createServiceClient();

  const page = Math.max(1, Math.floor(filters.page ?? 1));
  const pageSize = Math.min(Math.max(1, Math.floor(filters.pageSize ?? DEFAULT_ORDERS_PAGE_SIZE)), 100);

  let employeeOrderIds: string[] | null = null;
  if (filters.employeeId && filters.employeeId !== "all") {
    const { data: assignments, error: assignError } = await supabase
      .from("order_assignments")
      .select("order_id")
      .eq("employee_id", filters.employeeId);
    if (assignError) throw new Error(assignError.message);
    employeeOrderIds = [...new Set((assignments ?? []).map((a) => a.order_id))];
    if (employeeOrderIds.length === 0) {
      return { items: [], totalCount: 0, page, pageSize };
    }
  }

  let query = supabase
    .from("orders")
    .select(ORDER_LIST_SELECT, { count: "exact" })
    .eq("archived", false)
    .order("delivery_date", { ascending: true })
    .order("delivery_time", { ascending: true });

  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  } else {
    // Default (unfiltered) board view — finished jobs move to the
    // Completed Orders tab (getCompletedOrders) instead of sitting here
    // indefinitely. An explicit status filter (e.g. "Collected") still
    // works via the branch above.
    query = query.not("status", "in", `(${DASHBOARD_COMPLETED_STATUSES.join(",")})`);
  }
  if (filters.priority && filters.priority !== "all") {
    query = query.eq("priority", filters.priority);
  }
  if (filters.deliveryDate) {
    query = query.eq("delivery_date", filters.deliveryDate);
  }
  if (employeeOrderIds) {
    query = query.in("id", employeeOrderIds);
  }
  if (filters.search?.trim()) {
    const term = `%${filters.search.trim().replace(/[%,]/g, "")}%`;
    query = query.or(
      `order_number.ilike.${term},customer_name.ilike.${term},customer_mobile.ilike.${term},product.ilike.${term}`
    );
  }

  const from = (page - 1) * pageSize;
  const { data: orders, error, count } = await query.range(from, from + pageSize - 1);
  if (error) throw new Error(error.message);
  const totalCount = count ?? 0;
  if (!orders || orders.length === 0) return { items: [], totalCount, page, pageSize };

  const items = await buildOrderListItems(supabase, orders);
  return { items, totalCount, page, pageSize };
}

/**
 * Powers Reports > Completed Orders — the counterpart to getOrders' default
 * exclusion of finished jobs. Shows collected/delivered/completed orders
 * that haven't been archived yet (post month-end, they move to /archive
 * instead), so a manager can find a recently-finished order without paging
 * through the active board.
 */
export async function getCompletedOrders(filters: CompletedOrderFilters = {}): Promise<OrderListResult> {
  await requireAdmin();
  if (isDemoMode()) return getDemoCompletedOrders(filters);
  const supabase = createServiceClient();

  const page = Math.max(1, Math.floor(filters.page ?? 1));
  const pageSize = Math.min(Math.max(1, Math.floor(filters.pageSize ?? DEFAULT_ORDERS_PAGE_SIZE)), 100);

  let query = supabase
    .from("orders")
    .select(ORDER_LIST_SELECT, { count: "exact" })
    .eq("archived", false)
    .in("status", DASHBOARD_COMPLETED_STATUSES)
    .order("delivery_date", { ascending: false })
    .order("delivery_time", { ascending: false });

  if (filters.search?.trim()) {
    const term = `%${filters.search.trim().replace(/[%,]/g, "")}%`;
    query = query.or(
      `order_number.ilike.${term},customer_name.ilike.${term},customer_mobile.ilike.${term},product.ilike.${term}`
    );
  }

  const from = (page - 1) * pageSize;
  const { data: orders, error, count } = await query.range(from, from + pageSize - 1);
  if (error) throw new Error(error.message);
  const totalCount = count ?? 0;
  if (!orders || orders.length === 0) return { items: [], totalCount, page, pageSize };

  const items = await buildOrderListItems(supabase, orders);
  return { items, totalCount, page, pageSize };
}

/** The board's "in flight" sections — everything that still needs floor attention. */
const BOARD_ACTIVE_STATUSES: OrderStatus[] = [
  "new",
  "in_progress",
  "ready_internal_pickup",
  "waiting_materials",
  "ready_pickup",
  "ready_delivery",
];

/**
 * `ready_internal_pickup` (an outsourced worker's stage) folds into
 * "In Progress" on the board — it's still work-in-progress from the
 * manager's perspective, and doesn't earn its own section for what's a
 * rare workflow.
 */
const BOARD_IN_PROGRESS_STATUSES: OrderStatus[] = ["in_progress", "ready_internal_pickup"];

export interface DashboardBoardResult {
  new: OrderListItem[];
  inProgress: OrderListItem[];
  waitingMaterials: OrderListItem[];
  readyPickup: OrderListItem[];
  readyDelivery: OrderListItem[];
  /** Collected/delivered orders whose completing transition happened today (Kuwait time) — clears itself the next day, no cron involved. */
  deliveredToday: OrderListItem[];
}

/**
 * TV-style status board for the manager dashboard — every in-flight order
 * grouped by stage, plus a same-day "Delivered" section for what just
 * finished. Not paginated like getOrders: this is meant to show the whole
 * live floor at a glance, capped at 200 active orders as a safety limit
 * (see getDashboardStats for the same tradeoff elsewhere) rather than
 * true pagination, since a board split across pages defeats the point.
 *
 * The Delivered section isn't a separate status — it's collected/delivered
 * orders (already excluded from the active board, same as getOrders)
 * filtered to today's Kuwait calendar day via order_status_history. There's
 * no cron or write involved in it "clearing" at midnight: it's just a
 * narrower read each time this is called, so the order quietly stops
 * qualifying once the clock rolls over. The order's real record (visible
 * any time via Completed Orders / Archive) never moves or changes because
 * of this.
 */
export async function getDashboardBoard(
  filters: Pick<OrderFilters, "search" | "employeeId" | "priority" | "deliveryDate"> = {}
): Promise<DashboardBoardResult> {
  await requireAdmin();
  if (isDemoMode()) return getDemoDashboardBoard(filters);
  const supabase = createServiceClient();

  const empty: DashboardBoardResult = {
    new: [],
    inProgress: [],
    waitingMaterials: [],
    readyPickup: [],
    readyDelivery: [],
    deliveredToday: [],
  };

  let employeeOrderIds: string[] | null = null;
  if (filters.employeeId && filters.employeeId !== "all") {
    const { data: assignments, error: assignError } = await supabase
      .from("order_assignments")
      .select("order_id")
      .eq("employee_id", filters.employeeId);
    if (assignError) throw new Error(assignError.message);
    employeeOrderIds = [...new Set((assignments ?? []).map((a) => a.order_id))];
    if (employeeOrderIds.length === 0) return empty;
  }

  const searchTerm = filters.search?.trim() ? `%${filters.search.trim().replace(/[%,]/g, "")}%` : null;
  const searchClause = searchTerm
    ? `order_number.ilike.${searchTerm},customer_name.ilike.${searchTerm},customer_mobile.ilike.${searchTerm},product.ilike.${searchTerm}`
    : null;

  let activeQuery = supabase
    .from("orders")
    .select(ORDER_LIST_SELECT)
    .eq("archived", false)
    .in("status", BOARD_ACTIVE_STATUSES)
    .order("delivery_date", { ascending: true })
    .order("delivery_time", { ascending: true })
    .limit(200);
  if (filters.deliveryDate) activeQuery = activeQuery.eq("delivery_date", filters.deliveryDate);
  if (filters.priority && filters.priority !== "all") activeQuery = activeQuery.eq("priority", filters.priority);
  if (employeeOrderIds) activeQuery = activeQuery.in("id", employeeOrderIds);
  if (searchClause) activeQuery = activeQuery.or(searchClause);

  const { start, end } = getTodayBoundsInKuwait();
  const historyQuery = supabase
    .from("order_status_history")
    .select("order_id")
    .in("to_status", ["delivered", "collected"])
    .gte("changed_at", start.toISOString())
    .lt("changed_at", end.toISOString());

  const [{ data: activeOrders, error: activeError }, { data: historyRows, error: historyError }] = await Promise.all([
    activeQuery,
    historyQuery,
  ]);
  if (activeError) throw new Error(activeError.message);
  if (historyError) throw new Error(historyError.message);

  let deliveredTodayIds = [...new Set((historyRows ?? []).map((r) => r.order_id))];
  if (employeeOrderIds) {
    const employeeOrderIdSet = new Set(employeeOrderIds);
    deliveredTodayIds = deliveredTodayIds.filter((id) => employeeOrderIdSet.has(id));
  }
  let deliveredTodayRows: OrderListRow[] = [];
  if (deliveredTodayIds.length > 0) {
    let deliveredQuery = supabase
      .from("orders")
      .select(ORDER_LIST_SELECT)
      .eq("archived", false)
      .in("id", deliveredTodayIds)
      .order("delivery_date", { ascending: false });
    if (filters.priority && filters.priority !== "all") deliveredQuery = deliveredQuery.eq("priority", filters.priority);
    if (searchClause) deliveredQuery = deliveredQuery.or(searchClause);
    const { data, error } = await deliveredQuery;
    if (error) throw new Error(error.message);
    deliveredTodayRows = data ?? [];
  }

  const allRows = [...(activeOrders ?? []), ...deliveredTodayRows];
  if (allRows.length === 0) return empty;

  const items = await buildOrderListItems(supabase, allRows);
  const itemsById = new Map(items.map((i) => [i.id, i]));
  const byStatus = (statuses: OrderStatus[]) =>
    (activeOrders ?? [])
      .filter((o) => statuses.includes(o.status))
      .map((o) => itemsById.get(o.id))
      .filter((i): i is OrderListItem => !!i);

  return {
    new: byStatus(["new"]),
    inProgress: byStatus(BOARD_IN_PROGRESS_STATUSES),
    waitingMaterials: byStatus(["waiting_materials"]),
    readyPickup: byStatus(["ready_pickup"]),
    readyDelivery: byStatus(["ready_delivery"]),
    deliveredToday: deliveredTodayRows.map((o) => itemsById.get(o.id)).filter((i): i is OrderListItem => !!i),
  };
}

async function buildOrderListItems(supabase: ServiceClient, orders: OrderListRow[]): Promise<OrderListItem[]> {
  const orderIds = orders.map((o) => o.id);

  const [{ data: assignmentRows }, { data: fileRows }, { data: materialRows }, { data: itemRows }] = await Promise.all([
    supabase.from("order_assignments").select("order_id, employee_id").in("order_id", orderIds),
    supabase
      .from("order_files")
      .select("order_id, storage_path")
      .in("order_id", orderIds)
      .eq("file_type", "product_image"),
    supabase.from("material_requests").select("order_id, status, material_type").in("order_id", orderIds),
    supabase.from("order_items").select("order_id").in("order_id", orderIds),
  ]);

  const employeeIds = [...new Set((assignmentRows ?? []).map((r) => r.employee_id))];
  const employeesById = await fetchEmployeeNames(supabase, employeeIds);

  const assignmentsByOrder = new Map<string, { id: string; fullName: string }[]>();
  for (const row of assignmentRows ?? []) {
    const fullName = employeesById.get(row.employee_id);
    if (!fullName || !row.order_id) continue;
    const list = assignmentsByOrder.get(row.order_id) ?? [];
    list.push({ id: row.employee_id, fullName });
    assignmentsByOrder.set(row.order_id, list);
  }

  const thumbnailPathByOrder = new Map<string, string>();
  for (const row of fileRows ?? []) {
    if (row.order_id && !thumbnailPathByOrder.has(row.order_id)) {
      thumbnailPathByOrder.set(row.order_id, row.storage_path);
    }
  }

  const pendingTypesByOrder = new Map<string, MaterialType[]>();
  for (const row of materialRows ?? []) {
    if (row.status === "pending" && row.order_id) {
      const list = pendingTypesByOrder.get(row.order_id) ?? [];
      if (!list.includes(row.material_type)) list.push(row.material_type);
      pendingTypesByOrder.set(row.order_id, list);
    }
  }

  const itemCountByOrder = new Map<string, number>();
  for (const row of itemRows ?? []) {
    if (row.order_id) itemCountByOrder.set(row.order_id, (itemCountByOrder.get(row.order_id) ?? 0) + 1);
  }

  const thumbnailPaths = [...thumbnailPathByOrder.values()];
  const signedUrlByPath = new Map<string, string>();
  if (thumbnailPaths.length > 0) {
    const { data: signed } = await supabase.storage
      .from("product-images")
      .createSignedUrls(thumbnailPaths, 3600);
    for (const s of signed ?? []) {
      if (s.signedUrl && s.path && !s.error) signedUrlByPath.set(s.path, s.signedUrl);
    }
  }

  return orders.map((o) => {
    const thumbnailPath = thumbnailPathByOrder.get(o.id);
    return {
      id: o.id,
      orderNumber: o.order_number,
      customerName: o.customer_name,
      customerMobile: o.customer_mobile,
      product: o.product,
      paper: o.paper,
      paperSize: o.paper_size,
      quantity: o.quantity,
      finishing: o.finishing,
      priority: o.priority,
      deliveryDate: o.delivery_date,
      deliveryTime: o.delivery_time,
      status: o.status,
      fulfillmentType: o.fulfillment_type,
      deliveryProvider: o.delivery_provider,
      notes: o.notes,
      whatsappEnabled: o.whatsapp_enabled,
      preferredLanguage: o.preferred_language,
      approved: o.approved,
      designApprovalStatus: o.design_approval_status,
      assignedEmployees: assignmentsByOrder.get(o.id) ?? [],
      thumbnailUrl: thumbnailPath ? signedUrlByPath.get(thumbnailPath) ?? null : null,
      pendingMaterialTypes: pendingTypesByOrder.get(o.id) ?? [],
      itemCount: itemCountByOrder.get(o.id) ?? 0,
    };
  });
}

/**
 * Powers the customer-name autocomplete on the order form. Not a real
 * customer entity (see ARCHITECTURE.md's "not an ERP/CRM" note) -- just a
 * distinct-by-mobile-number read over existing order history, so a repeat
 * customer's name/mobile/preferences don't need retyping from scratch.
 */
export async function searchCustomers(query: string): Promise<CustomerSuggestion[]> {
  await requireAdmin();
  const term = query.trim();
  if (term.length < 2) return [];
  if (isDemoMode()) return getDemoCustomerSuggestions(term);

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("orders")
    .select("customer_name, customer_mobile, preferred_language, whatsapp_enabled, preferred_channel, created_at")
    .ilike("customer_name", `%${term.replace(/[%,]/g, "")}%`)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);

  return dedupeCustomersByMobile(
    (data ?? []).map((row) => ({
      customerName: row.customer_name,
      customerMobile: row.customer_mobile,
      preferredLanguage: row.preferred_language,
      whatsappEnabled: row.whatsapp_enabled,
      preferredChannel: row.preferred_channel,
    }))
  );
}

function dedupeCustomersByMobile(rows: CustomerSuggestion[]): CustomerSuggestion[] {
  const seen = new Set<string>();
  const suggestions: CustomerSuggestion[] = [];
  for (const row of rows) {
    if (seen.has(row.customerMobile)) continue;
    seen.add(row.customerMobile);
    suggestions.push(row);
    if (suggestions.length >= 8) break;
  }
  return suggestions;
}

export async function getOrderDetail(orderId: string): Promise<OrderDetail> {
  await requireAdmin();
  if (isDemoMode()) return getDemoOrderDetail(orderId);
  const supabase = createServiceClient();

  const { data: order, error } = await supabase.from("orders").select("*").eq("id", orderId).single();
  if (error || !order) throw new Error(error?.message ?? "Order not found");

  const [{ data: assignmentRows }, { data: fileRows }, { data: noteRows }, { data: historyRows }, { data: materialRows }, { data: itemRows }] =
    await Promise.all([
      supabase.from("order_assignments").select("employee_id").eq("order_id", orderId),
      supabase
        .from("order_files")
        .select("id, file_type, storage_path, file_name")
        .eq("order_id", orderId)
        .order("created_at"),
      supabase
        .from("order_notes")
        .select("id, note, employee_id, created_at")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false }),
      supabase
        .from("order_status_history")
        .select("id, from_status, to_status, changed_by, changed_at")
        .eq("order_id", orderId)
        .order("changed_at"),
      supabase
        .from("material_requests")
        .select("id, material_type, description, quantity, priority, status, employee_id, created_at")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false }),
      supabase
        .from("order_items")
        .select("id, product, paper, paper_size, quantity, finishing, employee_id")
        .eq("order_id", orderId)
        .order("sort_order"),
    ]);

  const employeeIds = new Set<string>();
  (assignmentRows ?? []).forEach((r) => employeeIds.add(r.employee_id));
  (noteRows ?? []).forEach((r) => employeeIds.add(r.employee_id));
  (historyRows ?? []).forEach((r) => {
    if (r.changed_by) employeeIds.add(r.changed_by);
  });
  (materialRows ?? []).forEach((r) => employeeIds.add(r.employee_id));
  (itemRows ?? []).forEach((r) => {
    if (r.employee_id) employeeIds.add(r.employee_id);
  });
  const employeesById = await fetchEmployeeNames(supabase, [...employeeIds]);

  const productImageFiles = (fileRows ?? []).filter((f) => f.file_type === "product_image");
  const designFilesRaw = (fileRows ?? []).filter((f) => f.file_type === "design_file");

  const [productSigned, designSigned] = await Promise.all([
    signUrls(supabase, "product-images", productImageFiles.map((f) => f.storage_path)),
    signUrls(supabase, "design-files", designFilesRaw.map((f) => f.storage_path)),
  ]);

  return {
    id: order.id,
    orderNumber: order.order_number,
    customerName: order.customer_name,
    customerMobile: order.customer_mobile,
    preferredLanguage: order.preferred_language,
    whatsappEnabled: order.whatsapp_enabled,
    preferredChannel: order.preferred_channel,
    notificationPreferences: normalizeNotificationPreferences(order.notification_preferences),
    product: order.product,
    paper: order.paper,
    paperSize: order.paper_size,
    quantity: order.quantity,
    finishing: order.finishing,
    priority: order.priority,
    deliveryDate: order.delivery_date,
    deliveryTime: order.delivery_time,
    deliveryAddress: order.delivery_address,
    deliveryMapLink: order.delivery_map_link,
    deliveryArea: order.delivery_area,
    deliveryBlock: order.delivery_block,
    deliveryStreet: order.delivery_street,
    deliveryBuildingNumber: order.delivery_building_number,
    notes: order.notes,
    status: order.status,
    fulfillmentType: order.fulfillment_type,
    deliveryProvider: order.delivery_provider,
    armadaDeliveryCode: order.armada_delivery_code,
    armadaDeliveryStatus: order.armada_delivery_status,
    armadaTrackingLink: order.armada_tracking_link,
    armadaDriverName: order.armada_driver_name,
    armadaDriverPhone: order.armada_driver_phone,
    approved: order.approved,
    designApprovalStatus: order.design_approval_status,
    designApprovalNote: order.design_approval_note,
    designApprovalRequestedAt: order.design_approval_requested_at,
    designApprovalRespondedAt: order.design_approval_responded_at,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
    assignedEmployees: (assignmentRows ?? []).map((r) => ({
      id: r.employee_id,
      fullName: employeesById.get(r.employee_id) ?? "Unknown",
    })),
    items: (itemRows ?? []).map((r) => ({
      id: r.id,
      product: r.product,
      paper: r.paper,
      paperSize: r.paper_size,
      quantity: r.quantity,
      finishing: r.finishing,
      employeeId: r.employee_id,
      employeeName: r.employee_id ? employeesById.get(r.employee_id) ?? "Unknown" : null,
    })),
    productImages: productImageFiles.map((f) => ({
      id: f.id,
      fileName: f.file_name,
      url: productSigned.get(f.storage_path) ?? null,
    })),
    designFiles: designFilesRaw.map((f) => ({
      id: f.id,
      fileName: f.file_name,
      url: designSigned.get(f.storage_path) ?? null,
    })),
    orderNotes: (noteRows ?? []).map((r) => ({
      id: r.id,
      note: r.note,
      employeeName: employeesById.get(r.employee_id) ?? "Unknown",
      createdAt: r.created_at,
    })),
    statusHistory: (historyRows ?? []).map((r) => ({
      id: r.id,
      fromStatus: r.from_status,
      toStatus: r.to_status,
      employeeName: r.changed_by ? employeesById.get(r.changed_by) ?? "Unknown" : "System",
      changedAt: r.changed_at,
    })),
    materialRequests: (materialRows ?? []).map((r) => ({
      id: r.id,
      materialType: r.material_type,
      description: r.description,
      quantity: r.quantity,
      priority: r.priority,
      status: r.status,
      employeeName: employeesById.get(r.employee_id) ?? "Unknown",
      createdAt: r.created_at,
    })),
  };
}

export async function getDashboardStats(): Promise<DashboardStats> {
  await requireAdmin();
  if (isDemoMode()) return getDemoDashboardStats();
  const supabase = createServiceClient();

  const { data: rows, error } = await supabase
    .from("orders")
    .select("status, delivery_date, delivery_time, completed_at")
    .eq("archived", false);
  if (error) throw new Error(error.message);

  const now = new Date();
  const stats: DashboardStats = {
    new: 0,
    inProgress: 0,
    waitingMaterials: 0,
    readyPickup: 0,
    readyDelivery: 0,
    completedThisMonth: 0,
    delayed: 0,
  };

  for (const row of rows ?? []) {
    switch (row.status) {
      case "new":
        stats.new++;
        break;
      case "in_progress":
        stats.inProgress++;
        break;
      case "waiting_materials":
        stats.waitingMaterials++;
        break;
      case "ready_pickup":
        stats.readyPickup++;
        break;
      case "ready_delivery":
        stats.readyDelivery++;
        break;
      case "completed":
        if (row.completed_at && isSameMonth(new Date(row.completed_at), now)) {
          stats.completedThisMonth++;
        }
        break;
    }

    if (
      DELAYABLE_STATUSES.includes(row.status) &&
      toDeliveryDate(row.delivery_date, row.delivery_time) < now
    ) {
      stats.delayed++;
    }
  }

  return stats;
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

const DEMO_WRITE_ERROR = "This is a read-only demo — writes are disabled.";

export async function createOrder(formData: FormData): Promise<{ id: string }> {
  const session = await requireAdmin();
  if (isDemoMode()) throw new Error(DEMO_WRITE_ERROR);
  const supabase = createServiceClient();
  const input = parseOrderForm(formData);

  // An item can be assigned to an employee who wasn't separately checked in
  // the "Assign Employees" list — folding item-level assignees into the
  // same order_assignments set (rather than a parallel path) means they
  // still show up on the order and get the normal assignment notification,
  // without duplicating that logic.
  const itemEmployeeIds = input.items.map((item) => item.employeeId).filter((id): id is string => !!id);
  const allEmployeeIds = [...new Set([...input.employeeIds, ...itemEmployeeIds])];

  const { data: order, error } = await supabase
    .from("orders")
    .insert({
      customer_name: input.customerName,
      customer_mobile: input.customerMobile,
      preferred_language: input.preferredLanguage,
      whatsapp_enabled: input.whatsappEnabled,
      preferred_channel: input.preferredChannel,
      notification_preferences: input.notificationPreferences,
      product: input.product,
      paper: input.paper || null,
      paper_size: input.paperSize || null,
      quantity: input.quantity,
      finishing: input.finishing || null,
      fulfillment_type: input.fulfillmentType,
      delivery_provider: input.deliveryProvider,
      priority: input.priority,
      delivery_date: input.deliveryDate,
      delivery_time: input.deliveryTime,
      delivery_address: input.deliveryAddress || null,
      delivery_map_link: input.deliveryMapLink || null,
      delivery_area: input.deliveryArea || null,
      delivery_block: input.deliveryBlock || null,
      delivery_street: input.deliveryStreet || null,
      delivery_building_number: input.deliveryBuildingNumber || null,
      notes: input.notes || null,
      approved: input.approved,
      created_by: session.employeeId,
    })
    .select("id, order_number")
    .single();

  if (error || !order) throw new Error(error?.message ?? "Failed to create order");

  if (allEmployeeIds.length > 0) {
    const { error: assignError } = await supabase.from("order_assignments").insert(
      allEmployeeIds.map((employeeId) => ({
        order_id: order.id,
        employee_id: employeeId,
        sequence: sequenceFor(employeeId, input.employeeIds),
      }))
    );
    if (assignError) throw new Error(assignError.message);
  }

  if (input.items.length > 0) {
    const { error: itemsError } = await supabase.from("order_items").insert(
      input.items.map((item, index) => ({
        order_id: order.id,
        product: item.product,
        paper: item.paper || null,
        paper_size: item.paperSize || null,
        quantity: item.quantity,
        finishing: item.finishing || null,
        employee_id: item.employeeId || null,
        sort_order: index,
      }))
    );
    if (itemsError) throw new Error(itemsError.message);
  }

  await supabase.from("order_status_history").insert({
    order_id: order.id,
    from_status: null,
    to_status: "new",
    changed_by: session.employeeId,
  });

  await uploadOrderFiles(supabase, order.id, session.employeeId, formData);

  await recordAuditLog({
    actorId: session.employeeId,
    actorName: session.fullName,
    action: "order_created",
    entityType: "order",
    entityId: order.id,
    orderId: order.id,
    newValue: { orderNumber: order.order_number, product: input.product, deliveryDate: input.deliveryDate },
  });
  for (const employeeId of allEmployeeIds) {
    await recordAuditLog({
      actorId: session.employeeId,
      actorName: session.fullName,
      action: "employee_assigned",
      entityType: "order_assignment",
      entityId: employeeId,
      orderId: order.id,
      newValue: { employeeId },
    });
  }

  // A brand-new order defaults to unapproved (the order form's "Production
  // Approval" switch — see 0017_order_approval.sql) -- while it sits
  // unapproved, nobody's told about it yet: no customer "order received"
  // confirmation, no employee assignment ping. sendOrderApprovedNotifications
  // fires this same burst later, the moment it actually clears (an admin
  // flips the toggle on an edit, or the customer approves a design approval
  // link — see updateOrder and lib/actions/design-approval.ts).
  if (input.approved) {
    await notifyOrderCreated(
      {
        orderId: order.id,
        orderNumber: order.order_number,
        customerName: input.customerName,
        customerMobile: input.customerMobile,
        product: input.product,
        deliveryDate: input.deliveryDate,
        deliveryTime: input.deliveryTime,
        whatsappEnabled: input.whatsappEnabled,
        preferredChannel: input.preferredChannel,
        language: input.preferredLanguage,
        notificationPreferences: input.notificationPreferences,
      },
      session.employeeId,
      session.fullName
    );

    if (allEmployeeIds.length > 0) {
      const assignedEmployees = await fetchEmployeePhones(supabase, allEmployeeIds);
      for (const employeeId of allEmployeeIds) {
        const employee = assignedEmployees.get(employeeId);
        if (!employee) continue;
        const context = {
          employeeId,
          employeePhone: employee.phone,
          orderId: order.id,
          orderNumber: order.order_number,
          product: input.product,
          deliveryDate: input.deliveryDate,
          deliveryTime: input.deliveryTime,
        };
        if (input.priority === "urgent") {
          await notifyEmployeeHighPriorityAssigned(context, session.employeeId, session.fullName);
        } else {
          await notifyEmployeeJobAssigned(context, session.employeeId, session.fullName);
        }
      }
    }
  }

  await broadcast(CHANNELS.production, "order.created", { orderId: order.id });
  revalidatePath("/dashboard");

  return { id: order.id };
}

/**
 * Fires the "order confirmed" notification burst deferred from createOrder
 * above — customer "order received" plus a job-assigned ping to every
 * currently assigned employee — the first time an order's approval gate
 * actually clears. `actorId` is null when the customer themselves is the
 * one clearing it (approving a design approval link, see
 * lib/actions/design-approval.ts); an admin flipping the edit-form toggle
 * (updateOrder below) passes their own session instead.
 */
export async function sendOrderApprovedNotifications(
  supabase: ServiceClient,
  orderId: string,
  actorId: string | null,
  actorName: string
): Promise<void> {
  const { data: order } = await supabase
    .from("orders")
    .select(
      "order_number, customer_name, customer_mobile, product, delivery_date, delivery_time, whatsapp_enabled, preferred_channel, preferred_language, notification_preferences, priority"
    )
    .eq("id", orderId)
    .single();
  if (!order) return;

  await notifyOrderCreated(
    {
      orderId,
      orderNumber: order.order_number,
      customerName: order.customer_name,
      customerMobile: order.customer_mobile,
      product: order.product,
      deliveryDate: order.delivery_date,
      deliveryTime: order.delivery_time,
      whatsappEnabled: order.whatsapp_enabled,
      preferredChannel: order.preferred_channel,
      language: order.preferred_language,
      notificationPreferences: order.notification_preferences,
    },
    actorId,
    actorName
  );

  const { data: assignments } = await supabase.from("order_assignments").select("employee_id").eq("order_id", orderId);
  const employeeIds = (assignments ?? []).map((a) => a.employee_id);
  if (employeeIds.length === 0) return;

  const assignedEmployees = await fetchEmployeePhones(supabase, employeeIds);
  for (const employeeId of employeeIds) {
    const employee = assignedEmployees.get(employeeId);
    if (!employee) continue;
    const context = {
      employeeId,
      employeePhone: employee.phone,
      orderId,
      orderNumber: order.order_number,
      product: order.product,
      deliveryDate: order.delivery_date,
      deliveryTime: order.delivery_time,
    };
    if (order.priority === "urgent") {
      await notifyEmployeeHighPriorityAssigned(context, actorId, actorName);
    } else {
      await notifyEmployeeJobAssigned(context, actorId, actorName);
    }
  }
}

export async function updateOrder(orderId: string, formData: FormData): Promise<{ id: string }> {
  const session = await requireAdmin();
  if (isDemoMode()) throw new Error(DEMO_WRITE_ERROR);
  const supabase = createServiceClient();
  const input = parseOrderForm(formData);

  // Whether this edit is the one that actually clears the order's approval
  // gate -- see sendOrderApprovedNotifications above for why that moment
  // (not order creation) is when the deferred notification burst fires.
  const { data: beforeUpdate } = await supabase.from("orders").select("approved").eq("id", orderId).single();
  const justApproved = beforeUpdate?.approved === false && input.approved;

  const { error } = await supabase
    .from("orders")
    .update({
      customer_name: input.customerName,
      customer_mobile: input.customerMobile,
      preferred_language: input.preferredLanguage,
      whatsapp_enabled: input.whatsappEnabled,
      preferred_channel: input.preferredChannel,
      notification_preferences: input.notificationPreferences,
      product: input.product,
      paper: input.paper || null,
      paper_size: input.paperSize || null,
      quantity: input.quantity,
      finishing: input.finishing || null,
      fulfillment_type: input.fulfillmentType,
      delivery_provider: input.deliveryProvider,
      priority: input.priority,
      delivery_date: input.deliveryDate,
      delivery_time: input.deliveryTime,
      delivery_address: input.deliveryAddress || null,
      delivery_map_link: input.deliveryMapLink || null,
      delivery_area: input.deliveryArea || null,
      delivery_block: input.deliveryBlock || null,
      delivery_street: input.deliveryStreet || null,
      delivery_building_number: input.deliveryBuildingNumber || null,
      notes: input.notes || null,
      approved: input.approved,
    })
    .eq("id", orderId);
  if (error) throw new Error(error.message);

  // Items are replaced wholesale on every edit (rather than diffed) since
  // the form always submits the full current item list with no stable
  // client-side item id to diff against.
  await supabase.from("order_items").delete().eq("order_id", orderId);
  if (input.items.length > 0) {
    const { error: itemsError } = await supabase.from("order_items").insert(
      input.items.map((item, index) => ({
        order_id: orderId,
        product: item.product,
        paper: item.paper || null,
        paper_size: item.paperSize || null,
        quantity: item.quantity,
        finishing: item.finishing || null,
        employee_id: item.employeeId || null,
        sort_order: index,
      }))
    );
    if (itemsError) throw new Error(itemsError.message);
  }

  const itemEmployeeIds = input.items.map((item) => item.employeeId).filter((id): id is string => !!id);

  const { data: existingAssignments } = await supabase
    .from("order_assignments")
    .select("employee_id")
    .eq("order_id", orderId);
  const existingIds = new Set((existingAssignments ?? []).map((a) => a.employee_id));
  const nextIds = new Set([...input.employeeIds, ...itemEmployeeIds]);

  const toRemove = [...existingIds].filter((id) => !nextIds.has(id));
  const toAdd = [...nextIds].filter((id) => !existingIds.has(id));

  if (toRemove.length > 0) {
    await supabase.from("order_assignments").delete().eq("order_id", orderId).in("employee_id", toRemove);
    for (const employeeId of toRemove) {
      await recordAuditLog({
        actorId: session.employeeId,
        actorName: session.fullName,
        action: "employee_unassigned",
        entityType: "order_assignment",
        entityId: employeeId,
        orderId,
        oldValue: { employeeId },
      });
    }
  }
  if (toAdd.length > 0) {
    await supabase
      .from("order_assignments")
      .insert(toAdd.map((employeeId) => ({ order_id: orderId, employee_id: employeeId })));
    for (const employeeId of toAdd) {
      await recordAuditLog({
        actorId: session.employeeId,
        actorName: session.fullName,
        action: "employee_assigned",
        entityType: "order_assignment",
        entityId: employeeId,
        orderId,
        newValue: { employeeId },
      });
    }

    // Still unapproved, or just cleared its approval gate this edit -- in
    // either case, don't ping toAdd individually here: unapproved means
    // nobody's told yet (see createOrder), and justApproved fires everyone
    // currently assigned -- toAdd included -- via the bulk call below
    // instead of a second, duplicate ping.
    if (input.approved && !justApproved) {
      // A removal in the same update means these adds are filling a vacated
      // slot — "reassigned" — rather than a fresh assignment.
      const isReassignment = toRemove.length > 0;
      const [assignedEmployees, orderRow] = await Promise.all([
        fetchEmployeePhones(supabase, toAdd),
        supabase.from("orders").select("order_number").eq("id", orderId).single(),
      ]);
      const orderNumber = orderRow.data?.order_number ?? orderId;

      for (const employeeId of toAdd) {
        const employee = assignedEmployees.get(employeeId);
        if (!employee) continue;
        const context = {
          employeeId,
          employeePhone: employee.phone,
          orderId,
          orderNumber,
          product: input.product,
          deliveryDate: input.deliveryDate,
          deliveryTime: input.deliveryTime,
        };

        if (input.priority === "urgent") {
          await notifyEmployeeHighPriorityAssigned(context, session.employeeId, session.fullName);
        } else if (isReassignment) {
          await notifyEmployeeJobReassigned(context, session.employeeId, session.fullName);
        } else {
          await notifyEmployeeJobAssigned(context, session.employeeId, session.fullName);
        }
      }
    }
  }

  if (justApproved) {
    await sendOrderApprovedNotifications(supabase, orderId, session.employeeId, session.fullName);
  }

  await syncAssignmentSequences(supabase, orderId, input.employeeIds, [...nextIds]);

  await uploadOrderFiles(supabase, orderId, session.employeeId, formData);

  await recordAuditLog({
    actorId: session.employeeId,
    actorName: session.fullName,
    action: "order_updated",
    entityType: "order",
    entityId: orderId,
    orderId,
    newValue: { product: input.product, deliveryDate: input.deliveryDate, deliveryTime: input.deliveryTime },
  });

  await broadcast(CHANNELS.production, "order.updated", { orderId });
  revalidatePath("/dashboard");

  return { id: orderId };
}

export async function duplicateOrder(orderId: string): Promise<{ id: string }> {
  const session = await requireAdmin();
  if (isDemoMode()) throw new Error(DEMO_WRITE_ERROR);
  const supabase = createServiceClient();

  const { data: original, error } = await supabase.from("orders").select("*").eq("id", orderId).single();
  if (error || !original) throw new Error(error?.message ?? "Order not found");

  const [{ data: assignments }, { data: files }, { data: existingItems }] = await Promise.all([
    supabase.from("order_assignments").select("employee_id, sequence").eq("order_id", orderId),
    supabase.from("order_files").select("*").eq("order_id", orderId),
    supabase
      .from("order_items")
      .select("product, paper, paper_size, quantity, finishing, employee_id, sort_order")
      .eq("order_id", orderId),
  ]);

  const { data: newOrder, error: insertError } = await supabase
    .from("orders")
    .insert({
      customer_name: original.customer_name,
      customer_mobile: original.customer_mobile,
      preferred_language: original.preferred_language,
      whatsapp_enabled: original.whatsapp_enabled,
      preferred_channel: original.preferred_channel,
      notification_preferences: original.notification_preferences,
      product: original.product,
      paper: original.paper,
      paper_size: original.paper_size,
      quantity: original.quantity,
      finishing: original.finishing,
      fulfillment_type: original.fulfillment_type,
      // The provider choice carries over, but never an already-dispatched
      // Armada delivery -- that code/tracking belongs to the original
      // order's actual courier run, not this fresh copy (which starts
      // production from scratch and hasn't been dispatched to anyone yet).
      delivery_provider: original.delivery_provider,
      priority: original.priority,
      delivery_date: original.delivery_date,
      delivery_time: original.delivery_time,
      delivery_address: original.delivery_address,
      delivery_map_link: original.delivery_map_link,
      delivery_area: original.delivery_area,
      delivery_block: original.delivery_block,
      delivery_street: original.delivery_street,
      delivery_building_number: original.delivery_building_number,
      notes: original.notes,
      status: "new",
      // A duplicate is a fresh production job, not a resumption of the
      // original — it goes through approval again regardless of whether the
      // original had already been approved.
      approved: false,
      created_by: session.employeeId,
    })
    .select("id")
    .single();
  if (insertError || !newOrder) throw new Error(insertError?.message ?? "Failed to duplicate order");

  if (assignments && assignments.length > 0) {
    // Hand-off order carries over, but not progress — the duplicate starts
    // the chain fresh (handed_off_at defaults to null on every new row).
    await supabase.from("order_assignments").insert(
      assignments.map((a) => ({ order_id: newOrder.id, employee_id: a.employee_id, sequence: a.sequence }))
    );
  }

  if (existingItems && existingItems.length > 0) {
    await supabase.from("order_items").insert(
      existingItems.map((item) => ({
        order_id: newOrder.id,
        product: item.product,
        paper: item.paper,
        paper_size: item.paper_size,
        quantity: item.quantity,
        finishing: item.finishing,
        employee_id: item.employee_id,
        sort_order: item.sort_order,
      }))
    );
  }

  for (const file of files ?? []) {
    const bucket = file.file_type === "product_image" ? "product-images" : "design-files";
    const suffix = file.storage_path.split("/").slice(1).join("/");
    const newPath = `${newOrder.id}/${suffix}`;
    const { error: copyError } = await supabase.storage.from(bucket).copy(file.storage_path, newPath);
    if (!copyError) {
      await supabase.from("order_files").insert({
        order_id: newOrder.id,
        file_type: file.file_type,
        storage_path: newPath,
        file_name: file.file_name,
        uploaded_by: session.employeeId,
      });
    }
  }

  await supabase.from("order_status_history").insert({
    order_id: newOrder.id,
    from_status: null,
    to_status: "new",
    changed_by: session.employeeId,
  });

  await recordAuditLog({
    actorId: session.employeeId,
    actorName: session.fullName,
    action: "order_created",
    entityType: "order",
    entityId: newOrder.id,
    orderId: newOrder.id,
    newValue: { duplicatedFrom: orderId, product: original.product },
  });

  await broadcast(CHANNELS.production, "order.created", { orderId: newOrder.id });
  revalidatePath("/dashboard");

  return { id: newOrder.id };
}

export async function deleteOrder(orderId: string): Promise<void> {
  const session = await requireAdmin();
  if (isDemoMode()) throw new Error(DEMO_WRITE_ERROR);
  const supabase = createServiceClient();

  const [{ data: order }, { data: assignments }] = await Promise.all([
    supabase
      .from("orders")
      .select("order_number, product, delivery_date, delivery_time")
      .eq("id", orderId)
      .single(),
    supabase.from("order_assignments").select("employee_id").eq("order_id", orderId),
  ]);
  const assignedEmployeeIds = (assignments ?? []).map((a) => a.employee_id);
  const assignedEmployees = await fetchEmployeePhones(supabase, assignedEmployeeIds);

  const { data: files } = await supabase
    .from("order_files")
    .select("file_type, storage_path")
    .eq("order_id", orderId);

  const productPaths = (files ?? []).filter((f) => f.file_type === "product_image").map((f) => f.storage_path);
  const designPaths = (files ?? []).filter((f) => f.file_type === "design_file").map((f) => f.storage_path);
  if (productPaths.length > 0) await supabase.storage.from("product-images").remove(productPaths);
  if (designPaths.length > 0) await supabase.storage.from("design-files").remove(designPaths);

  const { error } = await supabase.from("orders").delete().eq("id", orderId);
  if (error) throw new Error(error.message);

  // orderId is set null (not the FK'd order_id column) since the order no longer exists — see audit_logs schema.
  await recordAuditLog({
    actorId: session.employeeId,
    actorName: session.fullName,
    action: "order_deleted",
    entityType: "order",
    entityId: orderId,
    orderId: null,
    oldValue: { orderNumber: order?.order_number, product: order?.product },
  });

  if (order) {
    for (const employeeId of assignedEmployeeIds) {
      const employee = assignedEmployees.get(employeeId);
      if (!employee?.phone) continue;
      await notifyEmployeeJobCancelled(
        {
          employeeId,
          employeePhone: employee.phone,
          orderId: null, // the order row is already gone — see EmployeeNotificationContext
          orderNumber: order.order_number,
          product: order.product,
          deliveryDate: order.delivery_date,
          deliveryTime: order.delivery_time,
        },
        session.employeeId,
        session.fullName
      );
    }
  }

  await broadcast(CHANNELS.production, "order.deleted", { orderId });
  revalidatePath("/dashboard");
}

/**
 * The same guarded "next status" action the employee dashboard uses (Start
 * Production, Ready for Pickup/Delivery, Collected/Delivered, etc.) —
 * available on the manager dashboard too, since an admin doing floor work
 * shouldn't have to reach for Override Status (which requires typing a
 * reason and bypasses the Status Engine) just to advance an order normally.
 * Unlike the employee path there's no order_assignments check — an admin
 * can act on any order — and admins don't need to be told about their own
 * change, so notifyAdmins is skipped.
 */
export async function updateOrderStatus(
  orderId: string,
  status: OrderStatus,
  deliveryProvider?: OrderDeliveryProvider
): Promise<void> {
  const session = await requireAdmin();
  if (isDemoMode()) throw new Error(DEMO_WRITE_ERROR);
  const supabase = createServiceClient();

  await applyOrderStatusTransition(supabase, orderId, status, session.employeeId, session.fullName, deliveryProvider);
}

/**
 * Manager override — deliberately bypasses the status engine's transition
 * graph (lib/status/engine.ts). That graph exists to stop an *employee*
 * from skipping steps by mistake; a manager correcting a stuck or
 * mis-clicked order needs to be able to set any status directly. The
 * tradeoff is enforced here instead: every use requires a reason and is
 * audit-logged with `managerOverride: true` so it's always visible in the
 * order's timeline and distinguishable from a normal transition.
 */
export async function overrideOrderStatus(orderId: string, newStatus: OrderStatus, reason: string): Promise<void> {
  const session = await requireAdmin();
  if (isDemoMode()) throw new Error(DEMO_WRITE_ERROR);
  if (!reason.trim()) throw new Error("A reason is required for a manager override.");
  const supabase = createServiceClient();

  const { data: current, error: fetchError } = await supabase
    .from("orders")
    .select("status")
    .eq("id", orderId)
    .single();
  if (fetchError || !current) throw new Error(fetchError?.message ?? "Order not found");
  if (current.status === newStatus) throw new Error("Order is already in that status.");

  const { error } = await supabase.from("orders").update({ status: newStatus }).eq("id", orderId);
  if (error) throw new Error(error.message);

  await supabase.from("order_status_history").insert({
    order_id: orderId,
    from_status: current.status,
    to_status: newStatus,
    changed_by: session.employeeId,
  });

  await recordAuditLog({
    actorId: session.employeeId,
    actorName: session.fullName,
    action: "status_changed",
    entityType: "order",
    entityId: orderId,
    orderId,
    oldValue: { status: current.status },
    newValue: { status: newStatus, managerOverride: true, reason },
  });

  await broadcast(CHANNELS.production, "order.updated", { orderId });
  revalidatePath("/dashboard");
}

export async function deleteOrderFile(fileId: string): Promise<void> {
  await requireAdmin();
  if (isDemoMode()) throw new Error(DEMO_WRITE_ERROR);
  const supabase = createServiceClient();

  const { data: file, error } = await supabase
    .from("order_files")
    .select("file_type, storage_path, order_id")
    .eq("id", fileId)
    .single();
  if (error || !file) throw new Error(error?.message ?? "File not found");

  const bucket = file.file_type === "product_image" ? "product-images" : "design-files";
  await supabase.storage.from(bucket).remove([file.storage_path]);
  await supabase.from("order_files").delete().eq("id", fileId);

  await broadcast(CHANNELS.production, "order.updated", { orderId: file.order_id });
  revalidatePath("/dashboard");
}

// ---------------------------------------------------------------------------
// Internal helpers (not server actions — not exported)
// ---------------------------------------------------------------------------

function parseOrderForm(formData: FormData) {
  const rawPreferences = formData.get("notificationPreferences");
  let notificationPreferences: unknown = DEFAULT_NOTIFICATION_PREFERENCES;
  if (typeof rawPreferences === "string" && rawPreferences.length > 0) {
    try {
      notificationPreferences = JSON.parse(rawPreferences);
    } catch {
      // fall through with defaults — validated (and rejected if malformed) by the schema below
    }
  }

  const rawItems = formData.get("items");
  let items: unknown = [];
  if (typeof rawItems === "string" && rawItems.length > 0) {
    try {
      items = JSON.parse(rawItems);
    } catch {
      // fall through with an empty array — validated (and rejected if malformed) by the schema below
    }
  }

  const raw = {
    customerName: formData.get("customerName"),
    customerMobile: formData.get("customerMobile"),
    preferredLanguage: formData.get("preferredLanguage"),
    whatsappEnabled: formData.get("whatsappEnabled") === "true",
    preferredChannel: formData.get("preferredChannel") || "whatsapp",
    notificationPreferences,
    product: formData.get("product"),
    paper: formData.get("paper") || undefined,
    paperSize: formData.get("paperSize") || undefined,
    quantity: formData.get("quantity"),
    finishing: formData.get("finishing") || undefined,
    fulfillmentType: formData.get("fulfillmentType"),
    deliveryProvider: formData.get("deliveryProvider") || "internal",
    priority: formData.get("priority"),
    approved: formData.get("approved") === "true",
    deliveryDate: formData.get("deliveryDate"),
    deliveryTime: formData.get("deliveryTime"),
    deliveryAddress: formData.get("deliveryAddress") || undefined,
    deliveryMapLink: formData.get("deliveryMapLink") || undefined,
    deliveryArea: formData.get("deliveryArea") || undefined,
    deliveryBlock: formData.get("deliveryBlock") || undefined,
    deliveryStreet: formData.get("deliveryStreet") || undefined,
    deliveryBuildingNumber: formData.get("deliveryBuildingNumber") || undefined,
    notes: formData.get("notes") || undefined,
    employeeIds: formData.getAll("employeeIds").map(String),
    items,
  };

  const parsed = orderFormSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid order data");
  }
  return parsed.data;
}

/**
 * The manager's ordered "Assign Employees" list defines the sequential
 * hand-off chain (1-based position). Anyone assigned some other way — a
 * per-item assignee, or an auto-assigned delivery-role employee — gets
 * `null`, which means "not gated, always visible, never blocks anyone else"
 * (see 0013_sequential_handoff.sql).
 */
function sequenceFor(employeeId: string, orderedEmployeeIds: string[]): number | null {
  const index = orderedEmployeeIds.indexOf(employeeId);
  return index === -1 ? null : index + 1;
}

/** Persists the manager's current hand-off order for every already-assigned employee (called after the add/remove diff in updateOrder, where sequence can't just be set at insert time like createOrder does). */
async function syncAssignmentSequences(
  supabase: ServiceClient,
  orderId: string,
  orderedEmployeeIds: string[],
  allEmployeeIds: string[]
): Promise<void> {
  for (const employeeId of allEmployeeIds) {
    await supabase
      .from("order_assignments")
      .update({ sequence: sequenceFor(employeeId, orderedEmployeeIds) })
      .eq("order_id", orderId)
      .eq("employee_id", employeeId);
  }
}

async function fetchEmployeeNames(supabase: ServiceClient, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data } = await supabase.from("employees").select("id, full_name").in("id", ids);
  return new Map((data ?? []).map((e) => [e.id, e.full_name]));
}

async function fetchEmployeePhones(
  supabase: ServiceClient,
  ids: string[]
): Promise<Map<string, { phone: string | null }>> {
  if (ids.length === 0) return new Map();
  const { data } = await supabase.from("employees").select("id, phone").in("id", ids);
  return new Map((data ?? []).map((e) => [e.id, { phone: e.phone }]));
}

/** Also used by lib/actions/design-approval.ts to sign design/product image URLs for the public approval page. */
export async function signUrls(
  supabase: ServiceClient,
  bucket: "product-images" | "design-files",
  paths: string[]
): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map();
  const { data } = await supabase.storage.from(bucket).createSignedUrls(paths, 3600);
  const map = new Map<string, string>();
  for (const s of data ?? []) {
    if (s.signedUrl && s.path && !s.error) map.set(s.path, s.signedUrl);
  }
  return map;
}

/** Also used by lib/actions/order-request.ts to attach files to a public order request. */
export async function uploadOrderFiles(
  supabase: ServiceClient,
  orderId: string,
  uploadedBy: string | null,
  formData: FormData
): Promise<void> {
  const productImages = formData.getAll("productImages").filter((f): f is File => f instanceof File && f.size > 0);
  const designFiles = formData.getAll("designFiles").filter((f): f is File => f instanceof File && f.size > 0);

  await Promise.all([
    ...productImages.map((file) =>
      uploadSingleFile(supabase, "product-images", "product_image", "image", orderId, uploadedBy, file)
    ),
    ...designFiles.map((file) =>
      uploadSingleFile(supabase, "design-files", "design_file", "design", orderId, uploadedBy, file)
    ),
  ]);
}

async function uploadSingleFile(
  supabase: ServiceClient,
  bucket: "product-images" | "design-files",
  fileType: OrderFileType,
  uploadKind: "image" | "design",
  orderId: string,
  uploadedBy: string | null,
  file: File
): Promise<void> {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(`${file.name} is larger than ${Math.round(MAX_FILE_SIZE_BYTES / 1024 / 1024)}MB`);
  }
  if (!isAllowedUpload(file, uploadKind)) {
    throw new Error(`${file.name} isn't a supported file type.`);
  }
  const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  const path = `${orderId}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(path, file, { contentType: file.type || "application/octet-stream" });
  if (uploadError) throw new Error(uploadError.message);

  const { error: insertError } = await supabase.from("order_files").insert({
    order_id: orderId,
    file_type: fileType,
    storage_path: path,
    file_name: file.name,
    uploaded_by: uploadedBy,
  });
  if (insertError) throw new Error(insertError.message);
}
