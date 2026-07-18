import type { Metadata } from "next";
import { Users } from "lucide-react";

import { requireAdmin } from "@/lib/auth/guards";
import { listEmployees } from "@/lib/actions/employees";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EMPLOYEE_ROLE_LABELS } from "@/types/domain";

export const metadata: Metadata = {
  title: "Employees — Prime Production Board",
};

export default async function EmployeesPage() {
  await requireAdmin();
  const employees = await listEmployees();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Employees</h1>
        <p className="text-sm text-muted-foreground">{employees.length} on the roster</p>
      </div>

      {employees.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <Users className="size-6" />
          </div>
          <p className="font-semibold text-foreground">No employees yet</p>
        </Card>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Username</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {employees.map((employee) => (
              <TableRow key={employee.id}>
                <TableCell className="font-medium text-foreground">{employee.fullName}</TableCell>
                <TableCell className="font-mono text-xs">{employee.username}</TableCell>
                <TableCell>
                  <Badge variant={employee.role === "admin" ? "default" : "muted"}>
                    {EMPLOYEE_ROLE_LABELS[employee.role]}
                  </Badge>
                </TableCell>
                <TableCell>{employee.phone || "—"}</TableCell>
                <TableCell>
                  <Badge variant={employee.active ? "success" : "muted"}>
                    {employee.active ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
