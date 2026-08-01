import { z } from "zod";

import { sanitizePhoneInput } from "@/lib/utils/phone";

const notificationPreferencesSchema = z.object({
  order_received: z.boolean(),
  order_in_production: z.boolean(),
  ready_for_pickup: z.boolean(),
  out_for_delivery: z.boolean(),
  delivered: z.boolean(),
});

const orderItemSchema = z.object({
  product: z.string().trim().min(1, "Product is required").max(200),
  paper: z.string().trim().max(200).optional().or(z.literal("")),
  paperSize: z.string().trim().max(100).optional().or(z.literal("")),
  quantity: z.coerce.number().int("Whole numbers only").positive("Must be greater than 0"),
  finishing: z.string().trim().max(300).optional().or(z.literal("")),
  employeeId: z.string().uuid().optional().or(z.literal("")),
});

export type OrderItemInput = z.infer<typeof orderItemSchema>;

export const orderFormSchema = z.object({
  customerName: z.string().trim().min(1, "Customer name is required").max(200),
  customerMobile: z.string().trim().min(6, "Enter a valid mobile number").max(30).transform(sanitizePhoneInput),
  preferredLanguage: z.enum(["ar", "en"]),
  whatsappEnabled: z.boolean(),
  preferredChannel: z.enum(["whatsapp", "email", "sms"]).default("whatsapp"),
  notificationPreferences: notificationPreferencesSchema,
  product: z.string().trim().min(1, "Product is required").max(200),
  paper: z.string().trim().max(200).optional().or(z.literal("")),
  paperSize: z.string().trim().max(100).optional().or(z.literal("")),
  quantity: z.coerce.number().int("Whole numbers only").positive("Must be greater than 0"),
  finishing: z.string().trim().max(300).optional().or(z.literal("")),
  fulfillmentType: z.enum(["pickup", "delivery"]),
  priority: z.enum(["normal", "urgent"]),
  approved: z.boolean().default(false),
  deliveryDate: z.string().min(1, "Delivery date is required"),
  deliveryTime: z.string().min(1, "Delivery time is required"),
  deliveryAddress: z.string().trim().max(500).optional().or(z.literal("")),
  deliveryMapLink: z.string().trim().max(1000).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  employeeIds: z.array(z.string().uuid()).default([]),
  items: z.array(orderItemSchema).default([]),
});

export type OrderFormInput = z.infer<typeof orderFormSchema>;
