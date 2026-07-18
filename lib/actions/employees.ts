"use server";

import { requireAdmin } from "@/lib/auth/guards";
import { createServiceClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/demo/mode";
import { getDemoAssignableEmployees, getDemoEmployees } from "@/lib/demo/data";
import type { EmployeeRole } from "@/types/database.types";

export interface EmployeeListItem {
  id: string;
  username: string;
  fullName: string;
  role: EmployeeRole;
  phone: string | null;
  active: boolean;
  createdAt: string;
}

export async function listEmployees(): Promise<EmployeeListItem[]> {
  await requireAdmin();
  if (isDemoMode()) return getDemoEmployees();
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("employees")
    .select("id, username, full_name, role, phone, active, created_at")
    .order("full_name");

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: row.id,
    username: row.username,
    fullName: row.full_name,
    role: row.role,
    phone: row.phone,
    active: row.active,
    createdAt: row.created_at,
  }));
}

export async function listAssignableEmployees(): Promise<
  { id: string; fullName: string; role: EmployeeRole }[]
> {
  await requireAdmin();
  if (isDemoMode()) return getDemoAssignableEmployees();
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("employees")
    .select("id, full_name, role")
    .eq("active", true)
    .order("full_name");

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({ id: row.id, fullName: row.full_name, role: row.role }));
}
