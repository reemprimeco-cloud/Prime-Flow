"use server";

import { revalidatePath } from "next/cache";
import { isToday } from "date-fns";

import { requireEmployee } from "@/lib/auth/guards";
import { createServiceClient } from "@/lib/supabase/server";
import { broadcast, CHANNELS } from "@/lib/realtime/channels";
import { isDemoMode } from "@/lib/demo/mode";
import { getDemoMyJobs } from "@/lib/demo/data";
import { materialRequestSchema, orderNoteSchema } from "@/lib/validation/material-request";
import { assertValidTransition } from "@/lib/status/engine";
import { recordAuditLog } from "@/lib/audit/log";
import {
  notifyEmployeeInternalPickupReady,
  notifyEmployeeOutForDeliveryStaff,
  notifyOrderMovedBackToProduction,
  notifyOrderStatusChanged,
} from "@/lib/notifications/service";
import { EMPLOYEE_ACTIVE_STATUSES, EMPLOYEE_ALLOWED_TARGET_STATUSES, PRIORITY_SORT_WEIGHT } from "@/types/domain";
import type { MaterialType, OrderFulfillmentType, OrderPriority, OrderStatus } from "@/types/database.types";

type ServiceClient = ReturnType<typeof createServiceClient>;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EmployeeJobItem {
  id: string;
  orderNumber: string;
  customerName: string;
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
  managerNotes: string | null;
  productImages: { id: string; fileName: string; url: string | null }[];
  designFiles: { id: string; fileName: string; url: string | null }[];
  pendingMaterialTypes: MaterialType[];
  assignedAt: string;
}

export interface MyJobsResult {
  active: EmployeeJobItem[];
  queue: EmployeeJobItem[];
  completedToday: number;
  /** Whether the *acting* employee (not each job) is an outsourced worker — drives which "done" action their job cards show. */
  isOutsourced: boolean;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getMyJobs(): Promise<MyJobsResult> {
  const session = await requireEmployee();
  if (isDemoMode()) return getDemoMyJobs(session.employeeId);

  const supabase = createServiceClient();

  const [{ data: assignments }, { data: employeeRow }] = await Promise.all([
    supabase.from("order_assignments").select("order_id, assigned_at").eq("employee_id", session.employeeId),
    supabase.from("employees").select("is_outsourced").eq("id", session.employeeId).maybeSingle(),
  ]);
  const orderIds = (assignments ?? []).map((a) => a.order_id);
  const isOutsourced = employeeRow?.is_outsourced ?? false;

  const completedToday = await countCompletedToday(supabase, session.employeeId);

  if (orderIds.length === 0) return { active: [], queue: [], completedToday, isOutsourced };

  const assignedAtByOrder = new Map((assignments ?? []).map((a) => [a.order_id, a.assigned_at]));

  const { data: orders, error } = await supabase
    .from("orders")
    .select(
      "id, order_number, customer_name, product, paper, paper_size, quantity, finishing, priority, delivery_date, delivery_time, status, fulfillment_type, notes"
    )
    .in("id", orderIds)
    .eq("archived", false)
    .not("status", "in", "(collected,delivered,completed)");
  if (error) throw new Error(error.message);
  if (!orders || orders.length === 0) return { active: [], queue: [], completedToday, isOutsourced };

  const jobOrderIds = orders.map((o) => o.id);
  const [{ data: fileRows }, { data: materialRows }] = await Promise.all([
    supabase
      .from("order_files")
      .select("id, order_id, file_type, storage_path, file_name")
      .in("order_id", jobOrderIds),
    supabase.from("material_requests").select("order_id, status, material_type").in("order_id", jobOrderIds),
  ]);

  const productImagesByOrder = new Map<string, { id: string; fileName: string; storagePath: string }[]>();
  const designFilesByOrder = new Map<string, { id: string; fileName: string; storagePath: string }[]>();
  for (const row of fileRows ?? []) {
    const target = row.file_type === "product_image" ? productImagesByOrder : designFilesByOrder;
    const list = target.get(row.order_id) ?? [];
    list.push({ id: row.id, fileName: row.file_name, storagePath: row.storage_path });
    target.set(row.order_id, list);
  }

  const pendingTypesByOrder = new Map<string, MaterialType[]>();
  for (const row of materialRows ?? []) {
    if (row.status === "pending" && row.order_id) {
      const list = pendingTypesByOrder.get(row.order_id) ?? [];
      if (!list.includes(row.material_type)) list.push(row.material_type);
      pendingTypesByOrder.set(row.order_id, list);
    }
  }

  const allProductPaths = [...productImagesByOrder.values()].flat().map((f) => f.storagePath);
  const allDesignPaths = [...designFilesByOrder.values()].flat().map((f) => f.storagePath);
  const [productUrls, designUrls] = await Promise.all([
    signUrls(supabase, "product-images", allProductPaths),
    signUrls(supabase, "design-files", allDesignPaths),
  ]);

  const jobs: EmployeeJobItem[] = orders.map((o) => ({
    id: o.id,
    orderNumber: o.order_number,
    customerName: o.customer_name,
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
    managerNotes: o.notes,
    productImages: (productImagesByOrder.get(o.id) ?? []).map((f) => ({
      id: f.id,
      fileName: f.fileName,
      url: productUrls.get(f.storagePath) ?? null,
    })),
    designFiles: (designFilesByOrder.get(o.id) ?? []).map((f) => ({
      id: f.id,
      fileName: f.fileName,
      url: designUrls.get(f.storagePath) ?? null,
    })),
    pendingMaterialTypes: pendingTypesByOrder.get(o.id) ?? [],
    assignedAt: assignedAtByOrder.get(o.id) ?? new Date(0).toISOString(),
  }));

  const active = jobs
    .filter((j) => EMPLOYEE_ACTIVE_STATUSES.includes(j.status))
    .sort(byPriorityThenDelivery);
  const queue = jobs
    .filter((j) => j.status === "new")
    .sort((a, b) => byPriorityThenDelivery(a, b) || a.assignedAt.localeCompare(b.assignedAt));

  return { active, queue, completedToday, isOutsourced };
}

function byPriorityThenDelivery(a: EmployeeJobItem, b: EmployeeJobItem): number {
  const priorityDiff = PRIORITY_SORT_WEIGHT[a.priority] - PRIORITY_SORT_WEIGHT[b.priority];
  if (priorityDiff !== 0) return priorityDiff;
  return `${a.deliveryDate}${a.deliveryTime}`.localeCompare(`${b.deliveryDate}${b.deliveryTime}`);
}

async function countCompletedToday(supabase: ServiceClient, employeeId: string): Promise<number> {
  const { data } = await supabase
    .from("order_status_history")
    .select("changed_at, to_status")
    .eq("changed_by", employeeId)
    .in("to_status", ["collected", "delivered"]);
  return (data ?? []).filter((row) => isToday(new Date(row.changed_at))).length;
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

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

const DEMO_WRITE_ERROR = "This is a read-only demo — writes are disabled.";

/**
 * Auto-assigns every active employee with the 'delivery' role (logistics
 * staff -- e.g. Naresh) so the job appears on their dashboard, then sends
 * each of them the given notification. Used for both "go collect it from
 * the outsourced worker" (ready_internal_pickup) and "go deliver it to the
 * customer" (ready_delivery). A no-op if no employee currently has that role.
 */
async function notifyDeliveryStaff(
  supabase: ServiceClient,
  orderId: string,
  order: { order_number: string; product: string; delivery_date: string; delivery_time: string },
  templateName: "internal_pickup_ready" | "order_out_for_delivery_staff",
  actorId: string,
  actorName: string
): Promise<void> {
  const { data: staff } = await supabase.from("employees").select("id, phone").eq("role", "delivery").eq("active", true);
  if (!staff || staff.length === 0) return;

  const notify = templateName === "internal_pickup_ready" ? notifyEmployeeInternalPickupReady : notifyEmployeeOutForDeliveryStaff;

  for (const handler of staff) {
    const { data: existingAssignment } = await supabase
      .from("order_assignments")
      .select("id")
      .eq("order_id", orderId)
      .eq("employee_id", handler.id)
      .maybeSingle();

    if (!existingAssignment) {
      await supabase.from("order_assignments").insert({ order_id: orderId, employee_id: handler.id });
      await recordAuditLog({
        actorId,
        actorName,
        action: "employee_assigned",
        entityType: "order_assignment",
        entityId: handler.id,
        orderId,
        newValue: { employeeId: handler.id, reason: templateName },
      });
    }

    await notify(
      {
        employeeId: handler.id,
        employeePhone: handler.phone,
        orderId,
        orderNumber: order.order_number,
        product: order.product,
        deliveryDate: order.delivery_date,
        deliveryTime: order.delivery_time,
      },
      actorId,
      actorName
    );
  }
}

export async function updateEmployeeJobStatus(orderId: string, status: OrderStatus): Promise<void> {
  const session = await requireEmployee();
  if (isDemoMode()) throw new Error(DEMO_WRITE_ERROR);
  if (!EMPLOYEE_ALLOWED_TARGET_STATUSES.includes(status)) {
    throw new Error("That status can't be set from the employee dashboard.");
  }

  const supabase = createServiceClient();

  const { data: assignment } = await supabase
    .from("order_assignments")
    .select("id")
    .eq("order_id", orderId)
    .eq("employee_id", session.employeeId)
    .maybeSingle();
  if (!assignment) throw new Error("You're not assigned to this order.");

  const { data: current, error: fetchError } = await supabase
    .from("orders")
    .select(
      "status, order_number, customer_name, customer_mobile, product, delivery_date, delivery_time, whatsapp_enabled, preferred_channel, preferred_language, notification_preferences"
    )
    .eq("id", orderId)
    .single();
  if (fetchError || !current) throw new Error(fetchError?.message ?? "Order not found");

  assertValidTransition(current.status, status);

  const { error } = await supabase.from("orders").update({ status }).eq("id", orderId);
  if (error) throw new Error(error.message);

  await supabase.from("order_status_history").insert({
    order_id: orderId,
    from_status: current.status,
    to_status: status,
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
    newValue: { status },
  });

  const notificationContext = {
    orderId,
    orderNumber: current.order_number,
    customerName: current.customer_name,
    customerMobile: current.customer_mobile,
    product: current.product,
    deliveryDate: current.delivery_date,
    deliveryTime: current.delivery_time,
    whatsappEnabled: current.whatsapp_enabled,
    preferredChannel: current.preferred_channel,
    language: current.preferred_language,
    notificationPreferences: current.notification_preferences,
  };

  const isRevertToProduction =
    (current.status === "ready_pickup" || current.status === "ready_delivery") && status === "in_progress";

  if (status === "ready_internal_pickup") {
    // Outsourced worker's "done" -- internal handoff only, no customer
    // notification. Auto-assign the delivery-role staff so this job shows
    // up on their dashboard, and let them know to go collect it.
    await notifyDeliveryStaff(
      supabase,
      orderId,
      current,
      "internal_pickup_ready",
      session.employeeId,
      session.fullName
    );
  } else if (isRevertToProduction) {
    await notifyOrderMovedBackToProduction(notificationContext, session.employeeId, session.fullName);
  } else {
    await notifyOrderStatusChanged(
      { ...notificationContext, toStatus: status },
      session.employeeId,
      session.fullName
    );

    if (status === "ready_delivery") {
      // On top of the customer notification above: tell delivery-role
      // staff (e.g. Naresh) to go deliver it, and put it on their dashboard.
      await notifyDeliveryStaff(
        supabase,
        orderId,
        current,
        "order_out_for_delivery_staff",
        session.employeeId,
        session.fullName
      );
    }
  }

  await broadcast(CHANNELS.production, "order.updated", { orderId });
  revalidatePath("/employee");
  revalidatePath("/dashboard");
}

export async function addJobNote(orderId: string, note: string): Promise<void> {
  const session = await requireEmployee();
  if (isDemoMode()) throw new Error(DEMO_WRITE_ERROR);

  const parsed = orderNoteSchema.safeParse({ note });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid note");

  const supabase = createServiceClient();

  const { data: assignment } = await supabase
    .from("order_assignments")
    .select("id")
    .eq("order_id", orderId)
    .eq("employee_id", session.employeeId)
    .maybeSingle();
  if (!assignment) throw new Error("You're not assigned to this order.");

  const { error } = await supabase.from("order_notes").insert({
    order_id: orderId,
    employee_id: session.employeeId,
    note: parsed.data.note,
  });
  if (error) throw new Error(error.message);

  await broadcast(CHANNELS.production, "order.noted", { orderId });
  revalidatePath("/employee");
}

export async function submitMaterialRequestForJob(
  orderId: string,
  input: { materialType: string; description: string; quantity: string; priority: string }
): Promise<void> {
  const session = await requireEmployee();
  if (isDemoMode()) throw new Error(DEMO_WRITE_ERROR);

  const parsed = materialRequestSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid request");

  const supabase = createServiceClient();

  const { data: assignment } = await supabase
    .from("order_assignments")
    .select("id")
    .eq("order_id", orderId)
    .eq("employee_id", session.employeeId)
    .maybeSingle();
  if (!assignment) throw new Error("You're not assigned to this order.");

  const { error } = await supabase.from("material_requests").insert({
    order_id: orderId,
    employee_id: session.employeeId,
    material_type: parsed.data.materialType,
    description: parsed.data.description,
    quantity: parsed.data.quantity,
    priority: parsed.data.priority,
  });
  if (error) throw new Error(error.message);

  await broadcast(CHANNELS.materialRequests, "material_request.created", { orderId });
  await broadcast(CHANNELS.notifications, "material_request.created", { orderId });
  revalidatePath("/employee");
  revalidatePath("/dashboard");
}
