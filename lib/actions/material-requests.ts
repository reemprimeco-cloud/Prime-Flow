"use server";

import { requireAdmin } from "@/lib/auth/guards";
import { createServiceClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/demo/mode";
import { getDemoMaterialRequests } from "@/lib/demo/data";
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
