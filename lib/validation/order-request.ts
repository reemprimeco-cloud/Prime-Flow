import { z } from "zod";

import { sanitizePhoneInput } from "@/lib/utils/phone";

interface ValidationMessages {
  nameRequired: string;
  mobileInvalid: string;
  productRequired: string;
  wholeNumbers: string;
  positive: string;
}

export type OrderRequestLanguage = "ar" | "en";

const MESSAGES: Record<OrderRequestLanguage, ValidationMessages> = {
  en: {
    nameRequired: "Your name is required",
    mobileInvalid: "Enter a valid 8-digit Kuwait mobile number, e.g. 5000 1111",
    productRequired: "Product is required",
    wholeNumbers: "Whole numbers only",
    positive: "Must be greater than 0",
  },
  ar: {
    nameRequired: "الاسم مطلوب",
    mobileInvalid: "أدخل رقم جوال كويتي صحيح مكوّن من 8 أرقام، مثال: 5000 1111",
    productRequired: "نوع الطلب مطلوب",
    wholeNumbers: "أرقام صحيحة فقط",
    positive: "لازم يكون أكبر من 0",
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
    // customer_mobile goes straight to Twilio's WhatsApp send as-is (see
    // toWhatsAppAddress, lib/notifications/providers/twilio-whatsapp.ts),
    // which needs E.164 with the country code to actually reach them. The
    // customer just types their local 8-digit number (no country code
    // expected of them); +965 is prepended here automatically so the
    // number that lands in the database is always send-ready.
    customerMobile: z
      .string()
      .trim()
      .max(30)
      .transform((val) => {
        const cleaned = sanitizePhoneInput(val).replace(/[\s-]/g, "");
        if (/^\+965\d{8}$/.test(cleaned)) return cleaned;
        if (/^965\d{8}$/.test(cleaned)) return `+${cleaned}`;
        if (/^\d{8}$/.test(cleaned)) return `+965${cleaned}`;
        return cleaned;
      })
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
    notes: z.string().trim().max(2000).optional().or(z.literal("")),
    items: z.array(buildItemSchema(m)).default([]),
  });
}

/** English-message schema — the shape/type reference, and what the server action falls back to validating with when no language is submitted. */
export const orderRequestSchema = createOrderRequestSchema("en");

export type OrderRequestInput = z.infer<typeof orderRequestSchema>;
