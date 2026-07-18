import { z } from "zod";

const notificationPreferencesSchema = z.object({
  order_received: z.boolean(),
  order_in_production: z.boolean(),
  ready_for_pickup: z.boolean(),
  out_for_delivery: z.boolean(),
  delivered: z.boolean(),
});

export const orderFormSchema = z.object({
  customerName: z.string().trim().min(1, "Customer name is required").max(200),
  customerMobile: z.string().trim().min(6, "Enter a valid mobile number").max(30),
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
  deliveryDate: z.string().min(1, "Delivery date is required"),
  deliveryTime: z.string().min(1, "Delivery time is required"),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  employeeIds: z.array(z.string().uuid()).default([]),
});

export type OrderFormInput = z.infer<typeof orderFormSchema>;
