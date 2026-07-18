"use server";

import { revalidatePath } from "next/cache";
import { isSameMonth } from "date-fns";

import { requireAdmin } from "@/lib/auth/guards";
import { createServiceClient } from "@/lib/supabase/server";
import { broadcast, CHANNELS } from "@/lib/realtime/channels";
import { orderFormSchema, MAX_FILE_SIZE_BYTES } from "@/lib/validation/order";
import { toDeliveryDate } from "@/lib/utils/countdown";
import { DELAYABLE_STATUSES } from "@/types/domain";
import { isDemoMode } from "@/lib/demo/mode";
import { getDemoDashboardStats, getDemoOrderDetail, getDemoOrders } from "@/lib/demo/data";
import type {
  MaterialPriority,
  MaterialRequestStatus,
  MaterialType,
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
  pendingMaterialRequests: number;
}

export interface OrderDetail {
  id: string;
  orderNumber: string;
  customerName: string;
  customerMobile: string;
  preferredLanguage: OrderLanguage;
  whatsappEnabled: boolean;
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

export async function getOrders(filters: OrderFilters = {}): Promise<OrderListItem[]> {
  await requireAdmin();
  if (isDemoMode()) return getDemoOrders(filters);
  const supabase = createServiceClient();

  let query = supabase
    .from("orders")
    .select(
      "id, order_number, customer_name, customer_mobile, product, paper, paper_size, quantity, finishing, priority, delivery_date, delivery_time, status, notes, whatsapp_enabled, preferred_language"
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
  if (filters.search?.trim()) {
    const term = `%${filters.search.trim().replace(/[%,]/g, "")}%`;
    query = query.or(
      `order_number.ilike.${term},customer_name.ilike.${term},customer_mobile.ilike.${term},product.ilike.${term}`
    );
  }

  const { data: orders, error } = await query;
  if (error) throw new Error(error.message);
  if (!orders || orders.length === 0) return [];

  const orderIds = orders.map((o) => o.id);

  const [{ data: assignmentRows }, { data: fileRows }, { data: materialRows }] = await Promise.all([
    supabase.from("order_assignments").select("order_id, employee_id").in("order_id", orderIds),
    supabase
      .from("order_files")
      .select("order_id, storage_path")
      .in("order_id", orderIds)
      .eq("file_type", "product_image"),
    supabase.from("material_requests").select("order_id, status").in("order_id", orderIds),
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

  const pendingByOrder = new Map<string, number>();
  for (const row of materialRows ?? []) {
    if (row.status === "pending" && row.order_id) {
      pendingByOrder.set(row.order_id, (pendingByOrder.get(row.order_id) ?? 0) + 1);
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

  let items: OrderListItem[] = orders.map((o) => {
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
      pendingMaterialRequests: pendingByOrder.get(o.id) ?? 0,
    };
  });

  if (filters.employeeId && filters.employeeId !== "all") {
    items = items.filter((item) => item.assignedEmployees.some((e) => e.id === filters.employeeId));
  }

  return items;
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
  (historyRows ?? []).forEach((r) => employeeIds.add(r.changed_by));
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
      employeeName: employeesById.get(r.changed_by) ?? "Unknown",
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
    .select("id")
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
  }
  if (toAdd.length > 0) {
    await supabase
      .from("order_assignments")
      .insert(toAdd.map((employeeId) => ({ order_id: orderId, employee_id: employeeId })));
  }

  await uploadOrderFiles(supabase, orderId, session.employeeId, formData);
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

  await broadcast(CHANNELS.production, "order.created", { orderId: newOrder.id });
  revalidatePath("/dashboard");

  return { id: newOrder.id };
}

export async function deleteOrder(orderId: string): Promise<void> {
  await requireAdmin();
  if (isDemoMode()) throw new Error(DEMO_WRITE_ERROR);
  const supabase = createServiceClient();

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

  await broadcast(CHANNELS.production, "order.deleted", { orderId });
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
  const raw = {
    customerName: formData.get("customerName"),
    customerMobile: formData.get("customerMobile"),
    preferredLanguage: formData.get("preferredLanguage"),
    whatsappEnabled: formData.get("whatsappEnabled") === "true",
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
      uploadSingleFile(supabase, "product-images", "product_image", orderId, uploadedBy, file)
    ),
    ...designFiles.map((file) =>
      uploadSingleFile(supabase, "design-files", "design_file", orderId, uploadedBy, file)
    ),
  ]);
}

async function uploadSingleFile(
  supabase: ServiceClient,
  bucket: "product-images" | "design-files",
  fileType: OrderFileType,
  orderId: string,
  uploadedBy: string,
  file: File
): Promise<void> {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(`${file.name} is larger than 25MB`);
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
