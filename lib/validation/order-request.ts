import { z } from "zod";

import { sanitizePhoneInput } from "@/lib/utils/phone";

interface ValidationMessages {
  nameRequired: string;
  mobileInvalid: string;
  productRequired: string;
  wholeNumbers: string;
  positive: string;
  areaRequired: string;
  blockRequired: string;
  streetRequired: string;
  buildingRequired: string;
}

export type OrderRequestLanguage = "ar" | "en";

const MESSAGES: Record<OrderRequestLanguage, ValidationMessages> = {
  en: {
    nameRequired: "Your name is required",
    mobileInvalid: "Enter a Kuwait mobile number starting with +965, e.g. +965 5000 1111",
    productRequired: "Product is required",
    wholeNumbers: "Whole numbers only",
    positive: "Must be greater than 0",
    areaRequired: "Area is required for delivery",
    blockRequired: "Block is required for delivery",
    streetRequired: "Street is required for delivery",
    buildingRequired: "Building number is required for delivery",
  },
  ar: {
    nameRequired: "الاسم مطلوب",
    mobileInvalid: "أدخل رقم جوال كويتي يبدأ بـ +965، مثال: 965 5000 1111+",
    productRequired: "نوع الطلب مطلوب",
    wholeNumbers: "أرقام صحيحة فقط",
    positive: "لازم يكون أكبر من 0",
    areaRequired: "المنطقة مطلوبة للتوصيل",
    blockRequired: "القطعة مطلوبة للتوصيل",
    streetRequired: "الشارع مطلوب للتوصيل",
    buildingRequired: "رقم المبنى مطلوب للتوصيل",
  },
};

function buildItemSchema(m: ValidationMessages) {
  return z.object({
    product: z.string().trim().min(1, m.productRequired).max(200),
    paper: z.string().trim().max(200).optional().or(z.literal("")),
    paperSize: z.string().trim().max(100).optional().or(z.literal("")),
    quantity: z.coerce.number().int(m.wholeNumbers).positive(m.positive),
    finishing: z.string().trim().max(1000).optional().or(z.literal("")),
  });
}

/**
 * Mirrors orderFormSchema (lib/validation/order.ts) for the fields a
 * customer actually fills in — no employeeIds, notificationPreferences,
 * priority, or whatsappEnabled, since those are staff decisions made once
 * the request is turned into a real order (see lib/actions/order-request.ts).
 * `preferredLanguage` is the one staff field the customer *does* pick,
 * implicitly, by which half of the bilingual form they filled in — see the
 * language toggle in components/public/order-request-form.tsx.
 *
 * Takes a language so validation messages match whichever half of the
 * bilingual form the customer is looking at — English error text under an
 * Arabic form reads as broken, not just untranslated.
 */
export function createOrderRequestSchema(lang: OrderRequestLanguage) {
  const m = MESSAGES[lang];
  return z.object({
    customerName: z.string().trim().min(1, m.nameRequired).max(200),
    // Required with the +965 country code, typed by the customer — not
    // auto-added. customer_mobile goes straight to Twilio's WhatsApp send
    // as-is (see toWhatsAppAddress, lib/notifications/providers/twilio-whatsapp.ts),
    // which needs E.164 with the country code to actually reach them, and a
    // silently-added prefix turned out to leave some customers unreachable
    // (bad input slipping past auto-normalization) — so the country code is
    // spelled out and required up front instead.
    customerMobile: z
      .string()
      .trim()
      .max(30)
      .transform((val) => sanitizePhoneInput(val).replace(/[\s-]/g, ""))
      .refine((val) => /^\+965\d{8}$/.test(val), m.mobileInvalid),
    product: z.string().trim().min(1, m.productRequired).max(200),
    paper: z.string().trim().max(200).optional().or(z.literal("")),
    paperSize: z.string().trim().max(100).optional().or(z.literal("")),
    quantity: z.coerce.number().int(m.wholeNumbers).positive(m.positive),
    finishing: z.string().trim().max(1000).optional().or(z.literal("")),
    fulfillmentType: z.enum(["pickup", "delivery"]),
    // Left blank, the customer hasn't picked a date/time yet — the server
    // action defaults it to ~2 business days out so the order still has a
    // real slot to show on the calendar/TV board; staff (or the customer,
    // when following up) can move it once they actually confirm.
    deliveryDate: z.string().optional().or(z.literal("")),
    deliveryTime: z.string().optional().or(z.literal("")),
    deliveryAddress: z.string().trim().max(500).optional().or(z.literal("")),
    deliveryMapLink: z.string().trim().max(1000).optional().or(z.literal("")),
    // Structured Kuwait address — required (below) when fulfillmentType is
    // "delivery". This is what Armada actually prices delivery from
    // (area/block/street/building, not the free-text address above), per a
    // direct confirmation from an Armada integration engineer — see
    // lib/armada/client.ts and docs/ARMADA_DELIVERY.md. Collecting it here,
    // from the customer directly, means a delivery order already has
    // everything dispatchArmadaDelivery needs with no manual re-entry.
    deliveryArea: z.string().trim().max(100).optional().or(z.literal("")),
    deliveryBlock: z.string().trim().max(30).optional().or(z.literal("")),
    deliveryStreet: z.string().trim().max(200).optional().or(z.literal("")),
    deliveryBuildingNumber: z.string().trim().max(30).optional().or(z.literal("")),
    notes: z.string().trim().max(2000).optional().or(z.literal("")),
    items: z.array(buildItemSchema(m)).default([]),
  }).superRefine((data, ctx) => {
    if (data.fulfillmentType !== "delivery") return;
    if (!data.deliveryArea) ctx.addIssue({ code: "custom", path: ["deliveryArea"], message: m.areaRequired });
    if (!data.deliveryBlock) ctx.addIssue({ code: "custom", path: ["deliveryBlock"], message: m.blockRequired });
    if (!data.deliveryStreet) ctx.addIssue({ code: "custom", path: ["deliveryStreet"], message: m.streetRequired });
    if (!data.deliveryBuildingNumber)
      ctx.addIssue({ code: "custom", path: ["deliveryBuildingNumber"], message: m.buildingRequired });
  });
}

/** English-message schema — the shape/type reference, and what the server action falls back to validating with when no language is submitted. */
export const orderRequestSchema = createOrderRequestSchema("en");

export type OrderRequestInput = z.infer<typeof orderRequestSchema>;
