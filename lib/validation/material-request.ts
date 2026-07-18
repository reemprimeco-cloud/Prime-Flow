import { z } from "zod";

export const materialRequestSchema = z.object({
  materialType: z.enum(["paper", "ink", "vinyl", "packaging", "lamination", "other"]),
  description: z.string().trim().min(1, "Describe what's needed").max(500),
  quantity: z.string().trim().min(1, "Quantity is required").max(100),
  priority: z.enum(["low", "normal", "urgent"]),
});

export type MaterialRequestInput = z.infer<typeof materialRequestSchema>;

export const orderNoteSchema = z.object({
  note: z.string().trim().min(1, "Note can't be empty").max(2000),
});
