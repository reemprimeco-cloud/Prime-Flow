import "server-only";

import type { OrderLanguage } from "@/types/database.types";

/**
 * Reusable message templates. This is the only place WhatsApp copy lives —
 * the notification service picks a template name + language and calls
 * `renderTemplate`; no dashboard or Server Action ever builds message text
 * itself.
 */

export const COMPANY_NAME = process.env.COMPANY_NAME || "Prime Printing Co.";
export const PICKUP_LOCATION = process.env.PICKUP_LOCATION || "Prime Printing Co. — Shuwaikh Industrial, Kuwait";
export const PICKUP_HOURS = process.env.PICKUP_HOURS || "9:00 AM – 5:00 PM";

export type CustomerTemplateName =
  | "order_received"
  | "order_in_production"
  | "order_ready_for_pickup"
  | "order_out_for_delivery"
  | "order_returned_to_production"
  | "order_collected_confirmation"
  | "order_delivered_confirmation"
  | "design_approval_requested";

export type EmployeeTemplateName =
  | "job_assigned"
  | "job_reassigned"
  | "high_priority_job_assigned"
  | "material_request_approved"
  | "job_cancelled"
  | "internal_pickup_ready"
  | "order_out_for_delivery_staff"
  | "material_purchase_needed"
  | "job_ready_for_you"
  | "admin_order_note_added"
  | "admin_order_status_changed"
  | "design_approval_responded";

export type TemplateName = CustomerTemplateName | EmployeeTemplateName;

export interface TemplateVariables {
  customerName?: string;
  employeeName?: string;
  orderNumber: string;
  productName?: string;
  deliveryDate?: string;
  deliveryTime?: string;
  pickupLocation?: string;
  pickupHours?: string;
  companyName?: string;
  /** Not implemented yet — reserved for a future customer-facing order tracking page. */
  trackingLink?: string;
  /** Google Maps search-by-address link, built from the order's delivery address — see lib/utils/maps.ts. */
  mapsLink?: string;
  /** The floor note text, for admin_order_note_added. */
  noteText?: string;
  /** Human-readable status label (ORDER_STATUS_LABELS), for admin_order_status_changed. */
  statusLabel?: string;
}

type TemplateFn = (vars: TemplateVariables) => string;

const TEMPLATES: Record<TemplateName, Record<OrderLanguage, TemplateFn>> = {
  order_received: {
    en: (v) =>
      `Hi ${v.customerName}, ${v.companyName} received your order ${v.orderNumber} (${v.productName}). We'll let you know as it moves through production.`,
    ar: (v) => `مرحباً ${v.customerName}، استلمنا طلبكم ${v.orderNumber} (${v.productName}) في ${v.companyName}. سنُبقيكم على اطلاع بمراحل التنفيذ.`,
  },
  order_in_production: {
    en: (v) => `Your order ${v.orderNumber} (${v.productName}) is now in production at ${v.companyName}.`,
    ar: (v) => `طلبكم ${v.orderNumber} (${v.productName}) الآن قيد التنفيذ في ${v.companyName}.`,
  },
  order_ready_for_pickup: {
    en: (v) =>
      `Good news! Order ${v.orderNumber} (${v.productName}) is ready for pickup at ${v.pickupLocation}, open ${v.pickupHours}. Delivery slot was ${v.deliveryDate} ${v.deliveryTime}.`,
    ar: (v) =>
      `أخبار سارة! طلبكم ${v.orderNumber} (${v.productName}) جاهز للاستلام من ${v.pickupLocation}، ساعات العمل ${v.pickupHours}.`,
  },
  order_out_for_delivery: {
    en: (v) => `Order ${v.orderNumber} (${v.productName}) is out for delivery, expected ${v.deliveryDate} ${v.deliveryTime}.`,
    ar: (v) => `طلبكم ${v.orderNumber} (${v.productName}) في الطريق إليكم، الوصول المتوقع ${v.deliveryDate} ${v.deliveryTime}.`,
  },
  order_returned_to_production: {
    en: (v) =>
      `A quick update on order ${v.orderNumber} (${v.productName}): it needs a little more work before it's ready, so it's back in production. We'll message you again as soon as it's actually ready.`,
    ar: (v) =>
      `تحديث بخصوص طلبكم ${v.orderNumber} (${v.productName}): يحتاج القليل من العمل الإضافي، لذا أعدناه إلى التنفيذ. سنُرسل لكم رسالة أخرى بمجرد أن يصبح جاهزاً فعلياً.`,
  },
  order_collected_confirmation: {
    en: (v) => `Thanks for picking up order ${v.orderNumber} (${v.productName}) — enjoy! From all of us at ${v.companyName}.`,
    ar: (v) => `شكراً لاستلامكم طلبكم ${v.orderNumber} (${v.productName})! نتمنى لكم كل التوفيق من فريق ${v.companyName}.`,
  },
  order_delivered_confirmation: {
    en: (v) => `Order ${v.orderNumber} (${v.productName}) has been delivered. Thank you for choosing ${v.companyName}!`,
    ar: (v) => `تم تسليم طلبكم ${v.orderNumber} (${v.productName}). شكراً لاختياركم ${v.companyName}!`,
  },
  design_approval_requested: {
    en: (v) =>
      `Hi ${v.customerName}, please review the design for order ${v.orderNumber} (${v.productName}) and let us know if it's approved: ${v.trackingLink}`,
    ar: (v) =>
      `مرحباً ${v.customerName}، يرجى مراجعة تصميم طلبكم ${v.orderNumber} (${v.productName}) وإخبارنا بالاعتماد من خلال الرابط: ${v.trackingLink}`,
  },
  job_assigned: {
    en: (v) => `New job assigned: ${v.orderNumber} (${v.productName}), due ${v.deliveryDate} ${v.deliveryTime}.`,
    ar: (v) => `تم إسناد مهمة جديدة إليك: ${v.orderNumber} (${v.productName})، التسليم في ${v.deliveryDate} ${v.deliveryTime}.`,
  },
  job_reassigned: {
    en: (v) => `Job ${v.orderNumber} (${v.productName}) has been reassigned to you, due ${v.deliveryDate} ${v.deliveryTime}.`,
    ar: (v) => `تم إعادة إسناد المهمة ${v.orderNumber} (${v.productName}) إليك، التسليم في ${v.deliveryDate} ${v.deliveryTime}.`,
  },
  high_priority_job_assigned: {
    en: (v) => `URGENT job assigned: ${v.orderNumber} (${v.productName}), due ${v.deliveryDate} ${v.deliveryTime}. Please prioritize.`,
    ar: (v) => `مهمة عاجلة أُسندت إليك: ${v.orderNumber} (${v.productName})، التسليم في ${v.deliveryDate} ${v.deliveryTime}. يرجى إعطاؤها الأولوية.`,
  },
  material_request_approved: {
    en: (v) => `Your material request for order ${v.orderNumber} was approved.`,
    ar: (v) => `تمت الموافقة على طلب المواد الخاص بطلبكم ${v.orderNumber}.`,
  },
  job_cancelled: {
    en: (v) => `Job ${v.orderNumber} (${v.productName}) has been cancelled and removed from your queue.`,
    ar: (v) => `تم إلغاء المهمة ${v.orderNumber} (${v.productName}) وإزالتها من قائمتك.`,
  },
  internal_pickup_ready: {
    en: (v) => `Job ${v.orderNumber} (${v.productName}) is ready for pickup from the outsource worker. Please collect it.`,
    ar: (v) => `المهمة ${v.orderNumber} (${v.productName}) جاهزة للاستلام من المورّد الخارجي. يرجى استلامها.`,
  },
  order_out_for_delivery_staff: {
    en: (v) =>
      `Order ${v.orderNumber} (${v.productName}) is ready — please deliver it to the customer, expected ${v.deliveryDate} ${v.deliveryTime}.${v.mapsLink ? ` Location: ${v.mapsLink}` : ""}`,
    ar: (v) =>
      `الطلب ${v.orderNumber} (${v.productName}) جاهز — يرجى تسليمه للعميل، الموعد المتوقع ${v.deliveryDate} ${v.deliveryTime}.${v.mapsLink ? ` الموقع: ${v.mapsLink}` : ""}`,
  },
  material_purchase_needed: {
    en: (v) => `Material request approved for order ${v.orderNumber} (${v.productName}) — please go buy it.`,
    ar: (v) => `تمت الموافقة على طلب المواد لطلب ${v.orderNumber} (${v.productName}) — يرجى شراؤه.`,
  },
  job_ready_for_you: {
    en: (v) => `Job ${v.orderNumber} (${v.productName}) is ready for your stage — the work before you is done.`,
    ar: (v) => `المهمة ${v.orderNumber} (${v.productName}) جاهزة لمرحلتك — انتهى العمل الذي قبلك.`,
  },
  admin_order_note_added: {
    en: (v) => `${v.employeeName} added a note to ${v.orderNumber} for ${v.customerName} (${v.productName}): "${v.noteText}"`,
    ar: (v) => `أضاف ${v.employeeName} ملاحظة على الطلب ${v.orderNumber} للعميل ${v.customerName} (${v.productName}): "${v.noteText}"`,
  },
  admin_order_status_changed: {
    en: (v) => `${v.employeeName} moved ${v.orderNumber} for ${v.customerName} (${v.productName}) to ${v.statusLabel}.`,
    ar: (v) => `قام ${v.employeeName} بنقل الطلب ${v.orderNumber} للعميل ${v.customerName} (${v.productName}) إلى ${v.statusLabel}.`,
  },
  design_approval_responded: {
    en: (v) =>
      `${v.customerName} responded to the design approval for ${v.orderNumber} (${v.productName}): ${v.statusLabel}.${v.noteText ? ` Note: "${v.noteText}"` : ""}`,
    ar: (v) =>
      `رد ${v.customerName} على طلب اعتماد التصميم لطلب ${v.orderNumber} (${v.productName}): ${v.statusLabel}.${v.noteText ? ` ملاحظة: "${v.noteText}"` : ""}`,
  },
};

export function renderTemplate(name: TemplateName, language: OrderLanguage, vars: TemplateVariables): string {
  const withDefaults: TemplateVariables = {
    companyName: COMPANY_NAME,
    pickupLocation: PICKUP_LOCATION,
    pickupHours: PICKUP_HOURS,
    ...vars,
  };
  return TEMPLATES[name][language](withDefaults);
}
