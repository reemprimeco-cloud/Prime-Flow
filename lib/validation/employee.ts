import { z } from "zod";

export const employeeRoleSchema = z.enum(["admin", "employee", "supervisor", "store", "delivery"]);

const usernameSchema = z
  .string()
  .trim()
  .min(3, "At least 3 characters")
  .max(50)
  .regex(/^[a-z0-9._-]+$/i, "Letters, numbers, dots, underscores, and hyphens only")
  .toLowerCase();

const passwordSchema = z.string().min(8, "At least 8 characters");

export const createEmployeeSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  fullName: z.string().trim().min(1, "Full name is required").max(200),
  role: employeeRoleSchema,
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  isOutsourced: z.boolean().default(false),
});

export const updateEmployeeSchema = z.object({
  fullName: z.string().trim().min(1, "Full name is required").max(200),
  role: employeeRoleSchema,
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  isOutsourced: z.boolean().default(false),
});

export const resetPasswordSchema = z.object({
  password: passwordSchema,
});

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
