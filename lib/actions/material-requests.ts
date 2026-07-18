"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/guards";
import { createServiceClient } from "@/lib/supabase/server";
import { broadcast, CHANNELS } from "@/lib/realtime/channels";
import { isDemoMode } from "@/lib/demo/mode";
import { getDemoMaterialRequests } from "@/lib/demo/data";
import { recordAuditLog } from "@/lib/audit/log";
import { notifyEmployeeMaterialApproved } from "@/lib/notifications/service";
import type {
  MaterialPriority,
  MaterialRequestStatus,
  MaterialType,
} from "@/types/database.types";

export interface MaterialRequestListItem {
  id: string;
  orderId: string | null;
  orderNumber: string | null;
  employeeName: string;
  materialType: MaterialType;
  description: string;
  quantity: string;
  priority: MaterialPriority;
  status: MaterialRequestStatus;
  createdAt: string;
}

export async function listMaterialRequests(): Promise<MaterialRequestListItem[]> {
  await requireAdmin();
  if (isDemoMode()) return getDemoMaterialRequests();
  const supabase = createServiceClient();

  const { data: requests, error } = await supabase
    .from("material_requests")
    .select("id, order_id, employee_id, material_type, description, quantity, priority, status, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  if (!requests || requests.length === 0) return [];

  const employeeIds = [...new Set(requests.map((r) => r.employee_id))];
  const orderIds = [...new Set(requests.map((r) => r.order_id).filter((id): id is string => !!id))];

  const [{ data: employees }, { data: orders }] = await Promise.all([
    employeeIds.length > 0
      ? supabase.from("employees").select("id, full_name").in("id", employeeIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    orderIds.length > 0
      ? supabase.from("orders").select("id, order_number").in("id", orderIds)
      : Promise.resolve({ data: [] as { id: string; order_number: string }[] }),
  ]);

  const employeeNameById = new Map((employees ?? []).map((e) => [e.id, e.full_name]));
  const orderNumberById = new Map((orders ?? []).map((o) => [o.id, o.order_number]));

  return requests.map((r) => ({
    id: r.id,
    orderId: r.order_id,
    orderNumber: r.order_id ? orderNumberById.get(r.order_id) ?? null : null,
    employeeName: employeeNameById.get(r.employee_id) ?? "Unknown",
    materialType: r.material_type,
    description: r.description,
    quantity: r.quantity,
    priority: r.priority,
    status: r.status,
    createdAt: r.created_at,
  }));
}

const DEMO_WRITE_ERROR = "This is a read-only demo — writes are disabled.";

export async function approveMaterialRequest(requestId: string): Promise<void> {
  const session = await requireAdmin();
  if (isDemoMode()) throw new Error(DEMO_WRITE_ERROR);
  const supabase = createServiceClient();

  const { data: request, error: fetchError } = await supabase
    .from("material_requests")
    .select("id, order_id, employee_id, status")
    .eq("id", requestId)
    .single();
  if (fetchError || !request) throw new Error(fetchError?.message ?? "Material request not found");
  if (request.status !== "pending") throw new Error("Only pending requests can be approved.");

  const { error } = await supabase
    .from("material_requests")
    .update({ status: "approved", resolved_at: new Date().toISOString(), resolved_by: session.employeeId })
    .eq("id", requestId);
  if (error) throw new Error(error.message);

  await recordAuditLog({
    actorId: session.employeeId,
    actorName: session.fullName,
    action: "material_approved",
    entityType: "material_request",
    entityId: requestId,
    orderId: request.order_id,
    oldValue: { status: "pending" },
    newValue: { status: "approved" },
  });

  if (request.order_id) {
    const [{ data: employee }, { data: order }] = await Promise.all([
      supabase.from("employees").select("phone").eq("id", request.employee_id).single(),
      supabase
        .from("orders")
        .select("order_number, product, delivery_date, delivery_time")
        .eq("id", request.order_id)
        .single(),
    ]);
    if (employee && order) {
      await notifyEmployeeMaterialApproved(
        {
          employeeId: request.employee_id,
          employeePhone: employee.phone,
          orderId: request.order_id,
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

  await broadcast(CHANNELS.materialRequests, "material_request.updated", { requestId });
  revalidatePath("/material-requests");
  revalidatePath("/dashboard");
}

export async function rejectMaterialRequest(requestId: string): Promise<void> {
  const session = await requireAdmin();
  if (isDemoMode()) throw new Error(DEMO_WRITE_ERROR);
  const supabase = createServiceClient();

  const { data: request, error: fetchError } = await supabase
    .from("material_requests")
    .select("id, order_id, status")
    .eq("id", requestId)
    .single();
  if (fetchError || !request) throw new Error(fetchError?.message ?? "Material request not found");
  if (request.status !== "pending") throw new Error("Only pending requests can be rejected.");

  const { error } = await supabase
    .from("material_requests")
    .update({ status: "rejected", resolved_at: new Date().toISOString(), resolved_by: session.employeeId })
    .eq("id", requestId);
  if (error) throw new Error(error.message);

  await recordAuditLog({
    actorId: session.employeeId,
    actorName: session.fullName,
    action: "material_rejected",
    entityType: "material_request",
    entityId: requestId,
    orderId: request.order_id,
    oldValue: { status: "pending" },
    newValue: { status: "rejected" },
  });

  await broadcast(CHANNELS.materialRequests, "material_request.updated", { requestId });
  revalidatePath("/material-requests");
  revalidatePath("/dashboard");
}
