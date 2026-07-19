"use server";

import { revalidatePath } from "next/cache";
import { isToday } from "date-fns";

import { requireEmployee } from "@/lib/auth/guards";
import { createServiceClient } from "@/lib/supabase/server";
import { broadcast, CHANNELS } from "@/lib/realtime/channels";
import { isDemoMode } from "@/lib/demo/mode";
import { getDemoMyJobs } from "@/lib/demo/data";
import { materialRequestSchema, orderNoteSchema } from "@/lib/validation/material-request";
import { applyOrderStatusTransition } from "@/lib/actions/status-transition";
import { recordAuditLog } from "@/lib/audit/log";
import {
  notifyAdminOrderNoteAdded,
  notifyAdminOrderStatusChanged,
  notifyEmployeeJobReadyForYou,
} from "@/lib/notifications/service";
import {
  EMPLOYEE_ACTIVE_STATUSES,
  EMPLOYEE_ALLOWED_TARGET_STATUSES,
  getEmployeeNextActions,
  ORDER_STATUS_LABELS,
  PRIMARY_ITEM_ID,
  PRIORITY_SORT_WEIGHT,
} from "@/types/domain";
import type { MaterialType, OrderFulfillmentType, OrderPriority, OrderStatus } from "@/types/database.types";

type ServiceClient = ReturnType<typeof createServiceClient>;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface JobItemReadiness {
  id: string;
  product: string;
  paper: string | null;
  paperSize: string | null;
  quantity: number;
  finishing: string | null;
  isReady: boolean;
}

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
  deliveryAddress: string | null;
  deliveryMapLink: string | null;
  status: OrderStatus;
  fulfillmentType: OrderFulfillmentType;
  managerNotes: string | null;
  productImages: { id: string; fileName: string; url: string | null }[];
  designFiles: { id: string; fileName: string; url: string | null }[];
  pendingMaterialTypes: MaterialType[];
  assignedAt: string;
  /** True when this job is part of a sequential hand-off chain and someone else picks it up after this employee. Drives the "Ready for Next" button. */
  canHandOff: boolean;
  nextEmployeeName: string | null;
  /** Whether the order's own (first) item is marked ready. */
  itemReady: boolean;
  /** Items 2+ on the order (see order_items) — empty for a single-item order. */
  additionalItems: JobItemReadiness[];
  /** additionalItems.length, exposed directly so the card can decide "open the checklist" vs. "nothing to open" without recounting. */
  itemCount: number;
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
    supabase
      .from("order_assignments")
      .select("order_id, assigned_at, sequence, handed_off_at")
      .eq("employee_id", session.employeeId),
    supabase.from("employees").select("is_outsourced").eq("id", session.employeeId).maybeSingle(),
  ]);
  const isOutsourced = employeeRow?.is_outsourced ?? false;

  const completedToday = await countCompletedToday(supabase, session.employeeId);

  // Once I've handed my stage off, the job is no longer mine to work on —
  // it's already excluded here rather than filtered out later.
  const myAssignments = (assignments ?? []).filter((a) => !a.handed_off_at);
  const orderIds = myAssignments.map((a) => a.order_id);
  if (orderIds.length === 0) return { active: [], queue: [], completedToday, isOutsourced };

  const assignedAtByOrder = new Map(myAssignments.map((a) => [a.order_id, a.assigned_at]));
  const mySequenceByOrder = new Map(myAssignments.map((a) => [a.order_id, a.sequence]));

  const { data: orders, error } = await supabase
    .from("orders")
    .select(
      "id, order_number, customer_name, product, paper, paper_size, quantity, finishing, priority, delivery_date, delivery_time, delivery_address, delivery_map_link, status, fulfillment_type, notes, item_ready"
    )
    .in("id", orderIds)
    .eq("archived", false)
    .not("status", "in", "(collected,delivered,completed)");
  if (error) throw new Error(error.message);
  if (!orders || orders.length === 0) return { active: [], queue: [], completedToday, isOutsourced };

  const jobOrderIds = orders.map((o) => o.id);
  const [{ data: fileRows }, { data: materialRows }, { data: allAssignmentRows }, { data: itemRows }] = await Promise.all([
    supabase
      .from("order_files")
      .select("id, order_id, file_type, storage_path, file_name")
      .in("order_id", jobOrderIds),
    supabase.from("material_requests").select("order_id, status, material_type").in("order_id", jobOrderIds),
    supabase.from("order_assignments").select("order_id, employee_id, sequence, handed_off_at").in("order_id", jobOrderIds),
    supabase
      .from("order_items")
      .select("id, order_id, product, paper, paper_size, quantity, finishing, is_ready")
      .in("order_id", jobOrderIds)
      .order("sort_order"),
  ]);

  const additionalItemsByOrder = new Map<string, JobItemReadiness[]>();
  for (const row of itemRows ?? []) {
    const list = additionalItemsByOrder.get(row.order_id) ?? [];
    list.push({
      id: row.id,
      product: row.product,
      paper: row.paper,
      paperSize: row.paper_size,
      quantity: row.quantity,
      finishing: row.finishing,
      isReady: row.is_ready,
    });
    additionalItemsByOrder.set(row.order_id, list);
  }

  // Sequential hand-off: a chain position (sequence != null) is locked for
  // me while an earlier, still-unhandled position exists on the same order
  // — that's how Siva stays invisible until Kumar clicks "Ready for Next".
  // Positions outside the chain (sequence null — item assignees, delivery
  // staff) never block and are never blocked.
  interface AssignmentRow {
    order_id: string;
    employee_id: string;
    sequence: number | null;
    handed_off_at: string | null;
  }
  const assignmentsByOrder = new Map<string, AssignmentRow[]>();
  for (const row of allAssignmentRows ?? []) {
    const list = assignmentsByOrder.get(row.order_id) ?? [];
    list.push(row);
    assignmentsByOrder.set(row.order_id, list);
  }

  const lockedOrderIds = new Set<string>();
  const nextEmployeeIdByOrder = new Map<string, string>();
  for (const orderId of jobOrderIds) {
    const mySequence = mySequenceByOrder.get(orderId);
    const rows = assignmentsByOrder.get(orderId) ?? [];
    if (mySequence != null) {
      const isLocked = rows.some(
        (r) => r.sequence != null && r.sequence < mySequence && !r.handed_off_at
      );
      if (isLocked) lockedOrderIds.add(orderId);

      const nextRow = rows
        .filter((r) => r.sequence != null && r.sequence > mySequence)
        .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))[0];
      if (nextRow) nextEmployeeIdByOrder.set(orderId, nextRow.employee_id);
    }
  }

  const visibleOrders = orders.filter((o) => !lockedOrderIds.has(o.id));
  if (visibleOrders.length === 0) return { active: [], queue: [], completedToday, isOutsourced };

  const nextEmployeeNamesById = await fetchEmployeeNames(supabase, [...new Set(nextEmployeeIdByOrder.values())]);

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
  const allDesignFiles = [...designFilesByOrder.values()]
    .flat()
    .map((f) => ({ storagePath: f.storagePath, fileName: f.fileName }));
  const [productUrls, designUrls] = await Promise.all([
    signUrls(supabase, "product-images", allProductPaths),
    signDesignFileDownloadUrls(supabase, allDesignFiles),
  ]);

  const jobs: EmployeeJobItem[] = visibleOrders.map((o) => {
    const nextEmployeeId = nextEmployeeIdByOrder.get(o.id) ?? null;
    return {
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
      deliveryAddress: o.delivery_address,
      deliveryMapLink: o.delivery_map_link,
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
      canHandOff: nextEmployeeId != null,
      nextEmployeeName: nextEmployeeId ? nextEmployeeNamesById.get(nextEmployeeId) ?? null : null,
      itemReady: o.item_ready,
      additionalItems: additionalItemsByOrder.get(o.id) ?? [],
      itemCount: additionalItemsByOrder.get(o.id)?.length ?? 0,
    };
  });

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

async function countCompletedToday(supabase: ServiceClient, employeeId: string): Promise<number> {
  const { data } = await supabase
    .from("order_status_history")
    .select("changed_at, to_status")
    .eq("changed_by", employeeId)
    .in("to_status", ["collected", "delivered"]);
  return (data ?? []).filter((row) => isToday(new Date(row.changed_at))).length;
}

/**
 * Design files are the actual production artwork the employee needs to
 * download and print from -- a plain signed URL just opens/previews in the
 * browser tab (unreliable for PDFs/large images on a shop-floor tablet), so
 * each one is signed individually with `download` set to its original file
 * name. That's the one option `createSignedUrl` supports for forcing a real
 * download with a clean name, at the cost of one request per file instead of
 * a single batched call (product image thumbnails stay on the batched path
 * below since they're just previews, not something to download).
 */
async function signDesignFileDownloadUrls(
  supabase: ServiceClient,
  files: { storagePath: string; fileName: string }[]
): Promise<Map<string, string>> {
  if (files.length === 0) return new Map();
  const signed = await Promise.all(
    files.map(async (file) => {
      const { data } = await supabase.storage
        .from("design-files")
        .createSignedUrl(file.storagePath, 3600, { download: file.fileName });
      return [file.storagePath, data?.signedUrl ?? null] as const;
    })
  );
  const map = new Map<string, string>();
  for (const [path, url] of signed) {
    if (url) map.set(path, url);
  }
  return map;
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
 * Keeps the manager in the loop on the shop floor without them having to
 * watch the dashboard — every active admin gets a WhatsApp message whenever
 * an employee adds a note or moves an order's status. Admins aren't tracked
 * via order_assignments (they already see every order), so this is a plain
 * broadcast to the role rather than an assignment-based lookup.
 */
async function notifyAdmins(
  supabase: ServiceClient,
  orderId: string,
  order: { order_number: string; product: string; delivery_date: string; delivery_time: string },
  templateName: "admin_order_note_added" | "admin_order_status_changed",
  extra: { noteText?: string; statusLabel?: string },
  actorId: string,
  actorName: string
): Promise<void> {
  const { data: admins } = await supabase.from("employees").select("id, phone").eq("role", "admin").eq("active", true);
  if (!admins || admins.length === 0) return;

  const notify = templateName === "admin_order_note_added" ? notifyAdminOrderNoteAdded : notifyAdminOrderStatusChanged;

  for (const admin of admins) {
    await notify(
      {
        employeeId: admin.id,
        employeePhone: admin.phone,
        orderId,
        orderNumber: order.order_number,
        product: order.product,
        deliveryDate: order.delivery_date,
        deliveryTime: order.delivery_time,
        employeeName: actorName,
        noteText: extra.noteText,
        statusLabel: extra.statusLabel,
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

  const current = await applyOrderStatusTransition(supabase, orderId, status, session.employeeId, session.fullName);

  await notifyAdmins(
    supabase,
    orderId,
    current,
    "admin_order_status_changed",
    { statusLabel: ORDER_STATUS_LABELS[status] },
    session.employeeId,
    session.fullName
  );
}

/**
 * Toggles one item's "Ready" checkbox on a multi-item order — `itemId` is
 * either PRIMARY_ITEM_ID (the order's own product/paper/etc., tracked on
 * `orders.item_ready`) or an `order_items.id`. Checking the last remaining
 * item auto-advances the order past the employee having to separately click
 * a "done" button: once every item is ready and the order is still
 * `in_progress`, this fires the same transition `getEmployeeNextActions`
 * would offer as the manual "done" action, so single- and multi-item orders
 * land in the same place without a redundant confirmation click.
 * Unchecking never reverts a status that already advanced.
 */
export async function toggleJobItemReady(orderId: string, itemId: string, ready: boolean): Promise<void> {
  const session = await requireEmployee();
  if (isDemoMode()) throw new Error(DEMO_WRITE_ERROR);
  const supabase = createServiceClient();

  const { data: assignment } = await supabase
    .from("order_assignments")
    .select("id")
    .eq("order_id", orderId)
    .eq("employee_id", session.employeeId)
    .maybeSingle();
  if (!assignment) throw new Error("You're not assigned to this order.");

  if (itemId === PRIMARY_ITEM_ID) {
    const { error } = await supabase.from("orders").update({ item_ready: ready }).eq("id", orderId);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("order_items")
      .update({ is_ready: ready })
      .eq("id", itemId)
      .eq("order_id", orderId);
    if (error) throw new Error(error.message);
  }

  await broadcast(CHANNELS.production, "order.updated", { orderId });
  revalidatePath("/employee");

  if (!ready) return;

  const { data: order } = await supabase
    .from("orders")
    .select("status, item_ready, fulfillment_type")
    .eq("id", orderId)
    .single();
  if (!order || order.status !== "in_progress" || !order.item_ready) return;

  const { data: items } = await supabase.from("order_items").select("is_ready").eq("order_id", orderId);
  if (!(items ?? []).every((i) => i.is_ready)) return;

  const { data: employeeRow } = await supabase
    .from("employees")
    .select("is_outsourced")
    .eq("id", session.employeeId)
    .maybeSingle();
  const isOutsourced = employeeRow?.is_outsourced ?? false;

  const actions = getEmployeeNextActions("in_progress", order.fulfillment_type, isOutsourced);
  const doneAction = actions[actions.length - 1];
  if (!doneAction) return;

  const current = await applyOrderStatusTransition(supabase, orderId, doneAction.status, session.employeeId, session.fullName);
  await notifyAdmins(
    supabase,
    orderId,
    current,
    "admin_order_status_changed",
    { statusLabel: ORDER_STATUS_LABELS[doneAction.status] },
    session.employeeId,
    session.fullName
  );
}

/**
 * Sequential hand-off: marks this employee's stage on the order done so it
 * drops off their dashboard, and unlocks the job for whoever's next in the
 * chain (the order's status/Status Engine are untouched — this is purely
 * about who can see and work the job, not what stage the order itself is
 * in). A no-op on the order's own status field; see 0013_sequential_handoff.sql.
 */
export async function handOffJob(orderId: string): Promise<void> {
  const session = await requireEmployee();
  if (isDemoMode()) throw new Error(DEMO_WRITE_ERROR);
  const supabase = createServiceClient();

  const { data: myAssignment } = await supabase
    .from("order_assignments")
    .select("id, sequence, handed_off_at")
    .eq("order_id", orderId)
    .eq("employee_id", session.employeeId)
    .maybeSingle();
  if (!myAssignment) throw new Error("You're not assigned to this order.");
  if (myAssignment.sequence == null) throw new Error("This job isn't part of a hand-off chain.");
  if (myAssignment.handed_off_at) throw new Error("You've already handed this job off.");

  const { error } = await supabase
    .from("order_assignments")
    .update({ handed_off_at: new Date().toISOString() })
    .eq("id", myAssignment.id);
  if (error) throw new Error(error.message);

  await recordAuditLog({
    actorId: session.employeeId,
    actorName: session.fullName,
    action: "employee_unassigned",
    entityType: "order_assignment",
    entityId: session.employeeId,
    orderId,
    newValue: { handOff: true, sequence: myAssignment.sequence },
  });

  const { data: nextAssignment } = await supabase
    .from("order_assignments")
    .select("employee_id")
    .eq("order_id", orderId)
    .gt("sequence", myAssignment.sequence)
    .is("handed_off_at", null)
    .order("sequence", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (nextAssignment) {
    const [{ data: order }, employeePhones] = await Promise.all([
      supabase
        .from("orders")
        .select("order_number, product, delivery_date, delivery_time")
        .eq("id", orderId)
        .single(),
      fetchEmployeePhones(supabase, [nextAssignment.employee_id]),
    ]);
    const nextEmployee = employeePhones.get(nextAssignment.employee_id);
    if (order && nextEmployee) {
      await notifyEmployeeJobReadyForYou(
        {
          employeeId: nextAssignment.employee_id,
          employeePhone: nextEmployee.phone,
          orderId,
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

  await broadcast(CHANNELS.production, "order.updated", { orderId });
  revalidatePath("/employee");
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

  const { data: order } = await supabase
    .from("orders")
    .select("order_number, product, delivery_date, delivery_time")
    .eq("id", orderId)
    .single();
  if (order) {
    await notifyAdmins(
      supabase,
      orderId,
      order,
      "admin_order_note_added",
      { noteText: parsed.data.note },
      session.employeeId,
      session.fullName
    );
  }

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
