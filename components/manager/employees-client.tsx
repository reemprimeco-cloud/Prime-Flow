"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MoreVertical, Plus, ShieldCheck, ShieldOff, UserPlus, Users } from "lucide-react";

import { listEmployees, setEmployeeActive, type EmployeeListItem } from "@/lib/actions/employees";
import { EmployeeFormDialog } from "@/components/manager/employee-form-dialog";
import { ResetPasswordDialog } from "@/components/manager/reset-password-dialog";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EMPLOYEE_ROLE_LABELS } from "@/types/domain";
import type { EmployeeRole } from "@/types/database.types";

type RoleFilter = EmployeeRole | "all";
type StatusFilter = "all" | "active" | "inactive";

export function EmployeesClient({ initialEmployees }: { initialEmployees: EmployeeListItem[] }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EmployeeListItem | null>(null);
  const [resetTarget, setResetTarget] = useState<EmployeeListItem | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["employees"],
    queryFn: () => listEmployees(),
    initialData: initialEmployees,
  });
  const employees = query.data ?? initialEmployees;

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return employees.filter((e) => {
      if (roleFilter !== "all" && e.role !== roleFilter) return false;
      if (statusFilter === "active" && !e.active) return false;
      if (statusFilter === "inactive" && e.active) return false;
      if (term && !`${e.fullName} ${e.username} ${e.phone ?? ""}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [employees, search, roleFilter, statusFilter]);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (employee: EmployeeListItem) => {
    setEditing(employee);
    setFormOpen(true);
  };

  const handleToggleActive = (employee: EmployeeListItem) => {
    setTogglingId(employee.id);
    setEmployeeActive(employee.id, !employee.active)
      .then(() => {
        toast.success(`${employee.fullName} ${employee.active ? "deactivated" : "activated"}`);
        queryClient.invalidateQueries({ queryKey: ["employees"] });
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : "Failed to update employee"))
      .finally(() => setTogglingId(null));
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Employees</h1>
          <p className="text-sm text-muted-foreground">
            {filtered.length} of {employees.length} on the roster
          </p>
        </div>
        <Button type="button" variant="primary" onClick={openCreate}>
          <UserPlus className="size-4" /> New Employee
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search name, username, phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as RoleFilter)}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            {Object.entries(EMPLOYEE_ROLE_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <Users className="size-6" />
          </div>
          <p className="font-semibold text-foreground">
            {employees.length === 0 ? "No employees yet" : "No employees match these filters"}
          </p>
          {employees.length === 0 && (
            <Button type="button" variant="outline" size="sm" onClick={openCreate}>
              <Plus className="size-3.5" /> Add the first one
            </Button>
          )}
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
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((employee) => (
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
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-muted-foreground"
                        aria-label={`Actions for ${employee.fullName}`}
                      >
                        <MoreVertical className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEdit(employee)}>Edit</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setResetTarget(employee)}>Reset Password</DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={togglingId === employee.id}
                        onClick={() => handleToggleActive(employee)}
                      >
                        {employee.active ? (
                          <>
                            <ShieldOff className="size-4" /> Deactivate
                          </>
                        ) : (
                          <>
                            <ShieldCheck className="size-4" /> Activate
                          </>
                        )}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <EmployeeFormDialog open={formOpen} onOpenChange={setFormOpen} employee={editing} />
      <ResetPasswordDialog
        open={!!resetTarget}
        onOpenChange={(open) => !open && setResetTarget(null)}
        employee={resetTarget}
      />
    </div>
  );
}
