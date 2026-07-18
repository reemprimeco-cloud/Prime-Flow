"use server";

import { revalidatePath } from "next/cache";
import { isSameMonth } from "date-fns";

import { requireAdmin } from "@/lib/auth/guards";
import { createServiceClient } from "@/lib/supabase/server";
import { broadcast, CHANNELS } from "@/lib/realtime/channels";
import { orderFormSchema } from "@/lib/validation/order";
import { isAllowedUpload, MAX_FILE_SIZE_BYTES } from "@/lib/files/constants";
import { toDeliveryDate } from "@/lib/utils/countdown";
import { DEFAULT_ORDERS_PAGE_SIZE } from "@/lib/orders/constants";
import { DELAYABLE_STATUSES } from "@/types/domain";
import { isDemoMode } from "@/lib/demo/mode";
import { getDemoDashboardStats, getDemoOrderDetail, getDemoOrders } from "@/lib/demo/data";
import { recordAuditLog } from "@/lib/audit/log";
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
  MaterialPriority,
  MaterialRequestStatus,
  MaterialType,
  NotificationChannel,
  OrderFileType,
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
  notes: string | null;
  whatsappEnabled: boolean;
  preferredLanguage: OrderLanguage;
  assignedEmployees: { id: string; fullName: string }[];
  thumbnailUrl: string | null;
  pendingMaterialTypes: MaterialType[];
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
  notes: string | null;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
  assignedEmployees: { id: string; fullName: string }[];
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

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

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
    .select(
      "id, order_number, customer_name, customer_mobile, product, paper, paper_size, quantity, finishing, priority, delivery_date, delivery_time, status, notes, whatsapp_enabled, preferred_language",
      { count: "exact" }
    )
    .eq("archived", false)
    .order("delivery_date", { ascending: true })
    .order("delivery_time", { ascending: true });

  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
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

  const orderIds = orders.map((o) => o.id);

  const [{ data: assignmentRows }, { data: fileRows }, { data: materialRows }] = await Promise.all([
    supabase.from("order_assignments").select("order_id, employee_id").in("order_id", orderIds),
    supabase
      .from("order_files")
      .select("order_id, storage_path")
      .in("order_id", orderIds)
      .eq("file_type", "product_image"),
    supabase.from("material_requests").select("order_id, status, material_type").in("order_id", orderIds),
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

  const items: OrderListItem[] = orders.map((o) => {
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
      notes: o.notes,
      whatsappEnabled: o.whatsapp_enabled,
      preferredLanguage: o.preferred_language,
      assignedEmployees: assignmentsByOrder.get(o.id) ?? [],
      thumbnailUrl: thumbnailPath ? signedUrlByPath.get(thumbnailPath) ?? null : null,
      pendingMaterialTypes: pendingTypesByOrder.get(o.id) ?? [],
    };
  });

  return { items, totalCount, page, pageSize };
}

export async function getOrderDetail(orderId: string): Promise<OrderDetail> {
  await requireAdmin();
  if (isDemoMode()) return getDemoOrderDetail(orderId);
  const supabase = createServiceClient();

  const { data: order, error } = await supabase.from("orders").select("*").eq("id", orderId).single();
  if (error || !order) throw new Error(error?.message ?? "Order not found");

  const [{ data: assignmentRows }, { data: fileRows }, { data: noteRows }, { data: historyRows }, { data: materialRows }] =
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
    ]);

  const employeeIds = new Set<string>();
  (assignmentRows ?? []).forEach((r) => employeeIds.add(r.employee_id));
  (noteRows ?? []).forEach((r) => employeeIds.add(r.employee_id));
  (historyRows ?? []).forEach((r) => {
    if (r.changed_by) employeeIds.add(r.changed_by);
  });
  (materialRows ?? []).forEach((r) => employeeIds.add(r.employee_id));
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
    notes: order.notes,
    status: order.status,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
    assignedEmployees: (assignmentRows ?? []).map((r) => ({
      id: r.employee_id,
      fullName: employeesById.get(r.employee_id) ?? "Unknown",
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
      priority: input.priority,
      delivery_date: input.deliveryDate,
      delivery_time: input.deliveryTime,
      notes: input.notes || null,
      created_by: session.employeeId,
    })
    .select("id, order_number")
    .single();

  if (error || !order) throw new Error(error?.message ?? "Failed to create order");

  if (input.employeeIds.length > 0) {
    const { error: assignError } = await supabase
      .from("order_assignments")
      .insert(input.employeeIds.map((employeeId) => ({ order_id: order.id, employee_id: employeeId })));
    if (assignError) throw new Error(assignError.message);
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
  for (const employeeId of input.employeeIds) {
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

  if (input.employeeIds.length > 0) {
    const assignedEmployees = await fetchEmployeePhones(supabase, input.employeeIds);
    for (const employeeId of input.employeeIds) {
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

  await broadcast(CHANNELS.production, "order.created", { orderId: order.id });
  revalidatePath("/dashboard");

  return { id: order.id };
}

export async function updateOrder(orderId: string, formData: FormData): Promise<{ id: string }> {
  const session = await requireAdmin();
  if (isDemoMode()) throw new Error(DEMO_WRITE_ERROR);
  const supabase = createServiceClient();
  const input = parseOrderForm(formData);

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
      priority: input.priority,
      delivery_date: input.deliveryDate,
      delivery_time: input.deliveryTime,
      notes: input.notes || null,
    })
    .eq("id", orderId);
  if (error) throw new Error(error.message);

  const { data: existingAssignments } = await supabase
    .from("order_assignments")
    .select("employee_id")
    .eq("order_id", orderId);
  const existingIds = new Set((existingAssignments ?? []).map((a) => a.employee_id));
  const nextIds = new Set(input.employeeIds);

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

  const [{ data: assignments }, { data: files }] = await Promise.all([
    supabase.from("order_assignments").select("employee_id").eq("order_id", orderId),
    supabase.from("order_files").select("*").eq("order_id", orderId),
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
      priority: original.priority,
      delivery_date: original.delivery_date,
      delivery_time: original.delivery_time,
      notes: original.notes,
      status: "new",
      created_by: session.employeeId,
    })
    .select("id")
    .single();
  if (insertError || !newOrder) throw new Error(insertError?.message ?? "Failed to duplicate order");

  if (assignments && assignments.length > 0) {
    await supabase
      .from("order_assignments")
      .insert(assignments.map((a) => ({ order_id: newOrder.id, employee_id: a.employee_id })));
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
    priority: formData.get("priority"),
    deliveryDate: formData.get("deliveryDate"),
    deliveryTime: formData.get("deliveryTime"),
    notes: formData.get("notes") || undefined,
    employeeIds: formData.getAll("employeeIds").map(String),
  };

  const parsed = orderFormSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid order data");
  }
  return parsed.data;
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

async function signUrls(
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

async function uploadOrderFiles(
  supabase: ServiceClient,
  orderId: string,
  uploadedBy: string,
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
  uploadedBy: string,
  file: File
): Promise<void> {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(`${file.name} is larger than 25MB`);
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
