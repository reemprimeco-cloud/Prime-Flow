import { z } from "zod";

const orderRequestItemSchema = z.object({
  product: z.string().trim().min(1, "Product is required").max(200),
  paper: z.string().trim().max(200).optional().or(z.literal("")),
  paperSize: z.string().trim().max(100).optional().or(z.literal("")),
  quantity: z.coerce.number().int("Whole numbers only").positive("Must be greater than 0"),
  finishing: z.string().trim().max(300).optional().or(z.literal("")),
});

export type OrderRequestItemInput = z.infer<typeof orderRequestItemSchema>;

/**
 * Mirrors orderFormSchema (lib/validation/order.ts) for the fields a
 * customer actually fills in — no employeeIds, notificationPreferences,
 * priority, preferredLanguage, or whatsappEnabled, since those are staff
 * decisions made once the request is turned into a real order.
 */
export const orderRequestSchema = z.object({
  customerName: z.string().trim().min(1, "Your name is required").max(200),
  customerMobile: z.string().trim().min(6, "Enter a valid mobile number").max(30),
  product: z.string().trim().min(1, "Product is required").max(200),
  paper: z.string().trim().max(200).optional().or(z.literal("")),
  paperSize: z.string().trim().max(100).optional().or(z.literal("")),
  quantity: z.coerce.number().int("Whole numbers only").positive("Must be greater than 0"),
  finishing: z.string().trim().max(300).optional().or(z.literal("")),
  fulfillmentType: z.enum(["pickup", "delivery"]),
  deliveryDate: z.string().min(1, "Delivery date is required"),
  deliveryTime: z.string().min(1, "Delivery time is required"),
  deliveryAddress: z.string().trim().max(500).optional().or(z.literal("")),
  deliveryMapLink: z.string().trim().max(1000).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  items: z.array(orderRequestItemSchema).default([]),
});

export type OrderRequestInput = z.infer<typeof orderRequestSchema>;
