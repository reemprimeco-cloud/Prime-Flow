import type { Metadata } from "next";

import { requireAdmin } from "@/lib/auth/guards";
import { listEmployees } from "@/lib/actions/employees";
import { EmployeesClient } from "@/components/manager/employees-client";

export const metadata: Metadata = {
  title: "Employees — Prime Production Board",
};

export const dynamic = "force-dynamic";

export default async function EmployeesPage() {
  await requireAdmin();
  const employees = await listEmployees();

  return <EmployeesClient initialEmployees={employees} />;
}
