"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/guards";
import { createServiceClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/demo/mode";
import { getDemoAssignableEmployees, getDemoEmployees } from "@/lib/demo/data";
import { recordAuditLog } from "@/lib/audit/log";
import { hashPassword } from "@/lib/auth/password";
import {
  createEmployeeSchema,
  resetPasswordSchema,
  updateEmployeeSchema,
  type CreateEmployeeInput,
  type ResetPasswordInput,
  type UpdateEmployeeInput,
} from "@/lib/validation/employee";
import type { EmployeeRole } from "@/types/database.types";

type ServiceClient = ReturnType<typeof createServiceClient>;

const DEMO_WRITE_ERROR = "This is a read-only demo — writes are disabled.";

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

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Guards against locking the shop out of its own Manager Dashboard: refuses
 * a role/active change that would leave zero active admins. Called with the
 * *proposed* post-change role/active for the employee being edited.
 */
async function assertKeepsAnActiveAdmin(
  supabase: ServiceClient,
  employeeId: string,
  nextRole: EmployeeRole,
  nextActive: boolean
): Promise<void> {
  if (nextRole === "admin" && nextActive) return; // still (or newly) an active admin themselves

  const { count, error } = await supabase
    .from("employees")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin")
    .eq("active", true)
    .neq("id", employeeId);
  if (error) throw new Error(error.message);
  if (!count || count === 0) {
    throw new Error("Can't do that — at least one active administrator must remain.");
  }
}

function friendlyUsernameError(error: { code?: string; message: string }): Error {
  if (error.code === "23505") return new Error("That username is already taken.");
  return new Error(error.message);
}

export async function createEmployee(input: CreateEmployeeInput): Promise<{ id: string }> {
  const session = await requireAdmin();
  if (isDemoMode()) throw new Error(DEMO_WRITE_ERROR);

  const parsed = createEmployeeSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid employee details");
  const data = parsed.data;

  const supabase = createServiceClient();
  const passwordHash = await hashPassword(data.password);

  const { data: employee, error } = await supabase
    .from("employees")
    .insert({
      username: data.username,
      password_hash: passwordHash,
      full_name: data.fullName,
      role: data.role,
      phone: data.phone || null,
    })
    .select("id")
    .single();
  if (error || !employee) throw friendlyUsernameError(error ?? { message: "Failed to create employee" });

  await recordAuditLog({
    actorId: session.employeeId,
    actorName: session.fullName,
    action: "employee_created",
    entityType: "employee",
    entityId: employee.id,
    newValue: { username: data.username, fullName: data.fullName, role: data.role },
  });

  revalidatePath("/employees");
  return { id: employee.id };
}

export async function updateEmployee(employeeId: string, input: UpdateEmployeeInput): Promise<void> {
  const session = await requireAdmin();
  if (isDemoMode()) throw new Error(DEMO_WRITE_ERROR);

  const parsed = updateEmployeeSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid employee details");
  const data = parsed.data;

  const supabase = createServiceClient();
  const { data: current, error: fetchError } = await supabase
    .from("employees")
    .select("full_name, role, phone, active")
    .eq("id", employeeId)
    .single();
  if (fetchError || !current) throw new Error(fetchError?.message ?? "Employee not found");

  await assertKeepsAnActiveAdmin(supabase, employeeId, data.role, current.active);

  const { error } = await supabase
    .from("employees")
    .update({ full_name: data.fullName, role: data.role, phone: data.phone || null })
    .eq("id", employeeId);
  if (error) throw new Error(error.message);

  await recordAuditLog({
    actorId: session.employeeId,
    actorName: session.fullName,
    action: "employee_updated",
    entityType: "employee",
    entityId: employeeId,
    oldValue: { fullName: current.full_name, role: current.role, phone: current.phone },
    newValue: { fullName: data.fullName, role: data.role, phone: data.phone || null },
  });

  revalidatePath("/employees");
}

export async function setEmployeeActive(employeeId: string, active: boolean): Promise<void> {
  const session = await requireAdmin();
  if (isDemoMode()) throw new Error(DEMO_WRITE_ERROR);

  const supabase = createServiceClient();
  const { data: current, error: fetchError } = await supabase
    .from("employees")
    .select("role, active")
    .eq("id", employeeId)
    .single();
  if (fetchError || !current) throw new Error(fetchError?.message ?? "Employee not found");
  if (current.active === active) return;

  await assertKeepsAnActiveAdmin(supabase, employeeId, current.role, active);

  const { error } = await supabase.from("employees").update({ active }).eq("id", employeeId);
  if (error) throw new Error(error.message);

  await recordAuditLog({
    actorId: session.employeeId,
    actorName: session.fullName,
    action: "employee_updated",
    entityType: "employee",
    entityId: employeeId,
    oldValue: { active: current.active },
    newValue: { active },
  });

  revalidatePath("/employees");
}

export async function resetEmployeePassword(employeeId: string, input: ResetPasswordInput): Promise<void> {
  const session = await requireAdmin();
  if (isDemoMode()) throw new Error(DEMO_WRITE_ERROR);

  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid password");

  const supabase = createServiceClient();
  const passwordHash = await hashPassword(parsed.data.password);

  const { error } = await supabase
    .from("employees")
    .update({ password_hash: passwordHash })
    .eq("id", employeeId);
  if (error) throw new Error(error.message);

  // Deliberately no old/new password material in the audit entry.
  await recordAuditLog({
    actorId: session.employeeId,
    actorName: session.fullName,
    action: "employee_password_reset",
    entityType: "employee",
    entityId: employeeId,
  });

  revalidatePath("/employees");
}
