import { z } from "zod";

export const orderFormSchema = z.object({
  customerName: z.string().trim().min(1, "Customer name is required").max(200),
  customerMobile: z.string().trim().min(6, "Enter a valid mobile number").max(30),
  preferredLanguage: z.enum(["ar", "en"]),
  whatsappEnabled: z.boolean(),
  product: z.string().trim().min(1, "Product is required").max(200),
  paper: z.string().trim().max(200).optional().or(z.literal("")),
  paperSize: z.string().trim().max(100).optional().or(z.literal("")),
  quantity: z.coerce.number().int("Whole numbers only").positive("Must be greater than 0"),
  finishing: z.string().trim().max(300).optional().or(z.literal("")),
  priority: z.enum(["normal", "urgent"]),
  deliveryDate: z.string().min(1, "Delivery date is required"),
  deliveryTime: z.string().min(1, "Delivery time is required"),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  employeeIds: z.array(z.string().uuid()).default([]),
});

export type OrderFormInput = z.infer<typeof orderFormSchema>;

export const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
export const ALLOWED_DESIGN_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/postscript", // .ai / .eps
  "image/vnd.adobe.photoshop", // .psd
  "image/svg+xml",
  "application/octet-stream", // fallback for exotic design-app extensions
];
export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25MB
