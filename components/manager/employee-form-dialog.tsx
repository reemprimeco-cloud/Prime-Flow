"use client";

import { useEffect, useMemo } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { employeeRoleSchema } from "@/lib/validation/employee";
import { createEmployee, updateEmployee, type EmployeeListItem } from "@/lib/actions/employees";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EMPLOYEE_ROLE_LABELS } from "@/types/domain";
import type { EmployeeRole } from "@/types/database.types";

interface EmployeeFormValues {
  username?: string;
  password?: string;
  fullName: string;
  role: EmployeeRole;
  phone?: string;
}

interface EmployeeFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee?: EmployeeListItem | null;
}

function defaultValues(employee?: EmployeeListItem | null): EmployeeFormValues {
  return {
    username: employee?.username ?? "",
    password: "",
    fullName: employee?.fullName ?? "",
    role: employee?.role ?? "employee",
    phone: employee?.phone ?? "",
  };
}

export function EmployeeFormDialog({ open, onOpenChange, employee }: EmployeeFormDialogProps) {
  const isEdit = !!employee;
  const queryClient = useQueryClient();

  // One schema shape for both modes (react-hook-form needs a single stable
  // resolver type), with username/password only required when creating —
  // the server-side createEmployeeSchema/updateEmployeeSchema in
  // lib/validation/employee.ts remain the authoritative validation either
  // way, this is purely for inline field errors.
  const formSchema = useMemo(
    () =>
      z
        .object({
          username: z
            .string()
            .trim()
            .max(50)
            .regex(/^[a-z0-9._-]*$/i, "Letters, numbers, dots, underscores, and hyphens only")
            .optional()
            .or(z.literal("")),
          password: z.string().optional().or(z.literal("")),
          fullName: z.string().trim().min(1, "Full name is required").max(200),
          role: employeeRoleSchema,
          phone: z.string().trim().max(30).optional().or(z.literal("")),
        })
        .superRefine((data, ctx) => {
          if (isEdit) return;
          if (!data.username || data.username.length < 3) {
            ctx.addIssue({ code: "custom", path: ["username"], message: "At least 3 characters" });
          }
          if (!data.password || data.password.length < 8) {
            ctx.addIssue({ code: "custom", path: ["password"], message: "At least 8 characters" });
          }
        }),
    [isEdit]
  );

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<EmployeeFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: defaultValues(employee),
  });

  useEffect(() => {
    if (open) reset(defaultValues(employee));
  }, [open, employee, reset]);

  const mutation = useMutation({
    mutationFn: async (values: EmployeeFormValues): Promise<void> => {
      if (isEdit) {
        await updateEmployee(employee.id, { fullName: values.fullName, role: values.role, phone: values.phone });
      } else {
        // superRefine above already guarantees non-empty username/password
        // whenever isEdit is false and validation passed.
        await createEmployee({
          username: values.username ?? "",
          password: values.password ?? "",
          fullName: values.fullName,
          role: values.role,
          phone: values.phone,
        });
      }
    },
    onSuccess: () => {
      toast.success(isEdit ? "Employee updated" : "Employee created");
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      onOpenChange(false);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Something went wrong"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Employee" : "New Employee"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update this employee's profile and role." : "Create a new login for the shop floor or office."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="flex flex-col gap-4" noValidate>
          {!isEdit && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="username">Username</Label>
              <Input id="username" autoComplete="off" aria-invalid={!!errors.username} {...register("username")} />
              {errors.username && <p className="text-sm text-destructive">{errors.username.message}</p>}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="fullName">Full name</Label>
            <Input id="fullName" aria-invalid={!!errors.fullName} {...register("fullName")} />
            {errors.fullName && <p className="text-sm text-destructive">{errors.fullName.message}</p>}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="phone">Phone (optional)</Label>
            <Input id="phone" {...register("phone")} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="role">Role</Label>
            <Controller
              control={control}
              name="role"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(EMPLOYEE_ROLE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          {!isEdit && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                aria-invalid={!!errors.password}
                {...register("password")}
              />
              {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="animate-spin" />}
              {isEdit ? "Save changes" : "Create employee"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
