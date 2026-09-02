"use server";

import crypto from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/guards";
import { createServiceClient } from "@/lib/supabase/server";
import { sendOrderApprovedNotifications, signUrls } from "@/lib/actions/orders";
import { broadcast, CHANNELS } from "@/lib/realtime/channels";
import { isDemoMode } from "@/lib/demo/mode";
import { recordAuditLog } from "@/lib/audit/log";
import { notifyAdminDesignApprovalResponded, notifyCustomerDesignApprovalRequested } from "@/lib/notifications/service";
import { DESIGN_APPROVAL_STATUS_LABELS } from "@/types/domain";
import { getDemoDesignApprovalByToken } from "@/lib/demo/data";
import type { DesignApprovalStatus } from "@/types/database.types";

const DEMO_WRITE_ERROR = "This is a read-only demo — writes are disabled.";

type ServiceClient = ReturnType<typeof createServiceClient>;

/**
 * What the public /approve/[token] page needs to render — deliberately a
 * narrower shape than OrderDetail (lib/actions/orders.ts): no
 * customer_mobile, notes, assigned employees, or anything else internal.
 * The token is the only credential this route checks (see
 * docs/DESIGN_APPROVAL.md) so it must never leak more than a customer
 * reviewing their own order needs to see.
 */
export interface PublicDesignApproval {
  orderNumber: string;
  customerName: string;
  product: string;
  status: DesignApprovalStatus;
  note: string | null;
  productImages: { id: string; fileName: string; url: string | null }[];
  designFiles: { id: string; fileName: string; url: string | null }[];
}

async function buildApprovalLink(token: string): Promise<string> {
  const hdrs = await headers();
  const host = hdrs.get("host");
  const proto = hdrs.get("x-forwarded-proto") ?? "https";
  const origin = host ? `${proto}://${host}` : "http://localhost:3000";
  return `${origin}/approve/${token}`;
}

/**
 * Admin action — "Send for Approval" on the order detail drawer
 * (components/orders/order-detail-drawer.tsx). Always issues a fresh token,
 * so a previously-sent link stops working once a new one goes out (and any
 * stale note/response from a prior round is cleared). WhatsApps the
 * customer a link to app/approve/[token]; once they respond, Start
 * Production stays blocked until it's "approved" — see the gate in
 * lib/actions/status-transition.ts.
 */
export async function requestDesignApproval(orderId: string): Promise<void> {
  const session = await requireAdmin();
  if (isDemoMode()) throw new Error(DEMO_WRITE_ERROR);
  const supabase = createServiceClient();

  const { data: order, error } = await supabase
    .from("orders")
    .select(
      "order_number, customer_name, customer_mobile, product, whatsapp_enabled, preferred_channel, preferred_language"
    )
    .eq("id", orderId)
    .single();
  if (error || !order) throw new Error(error?.message ?? "Order not found");

  const token = crypto.randomBytes(24).toString("hex");

  const { error: updateError } = await supabase
    .from("orders")
    .update({
      design_approval_status: "pending",
      design_approval_token: token,
      design_approval_note: null,
      design_approval_requested_at: new Date().toISOString(),
      design_approval_responded_at: null,
    })
    .eq("id", orderId);
  if (updateError) throw new Error(updateError.message);

  const approvalLink = await buildApprovalLink(token);

  await notifyCustomerDesignApprovalRequested(
    {
      orderId,
      orderNumber: order.order_number,
      customerName: order.customer_name,
      customerMobile: order.customer_mobile,
      product: order.product,
      deliveryDate: "",
      deliveryTime: "",
      whatsappEnabled: order.whatsapp_enabled,
      preferredChannel: order.preferred_channel,
      language: order.preferred_language,
      notificationPreferences: null,
    },
    approvalLink,
    session.employeeId,
    session.fullName
  );

  await recordAuditLog({
    actorId: session.employeeId,
    actorName: session.fullName,
    action: "design_approval_requested",
    entityType: "order",
    entityId: orderId,
    orderId,
    newValue: { orderNumber: order.order_number },
  });

  await broadcast(CHANNELS.production, "order.updated", { orderId });
  revalidatePath("/dashboard");
}

async function signOrderFiles(supabase: ServiceClient, orderId: string) {
  const { data: fileRows } = await supabase
    .from("order_files")
    .select("id, file_type, storage_path, file_name")
    .eq("order_id", orderId)
    .order("created_at");

  const productImageFiles = (fileRows ?? []).filter((f) => f.file_type === "product_image");
  const designFilesRaw = (fileRows ?? []).filter((f) => f.file_type === "design_file");

  const [productSigned, designSigned] = await Promise.all([
    signUrls(supabase, "product-images", productImageFiles.map((f) => f.storage_path)),
    signUrls(supabase, "design-files", designFilesRaw.map((f) => f.storage_path)),
  ]);

  return {
    productImages: productImageFiles.map((f) => ({ id: f.id, fileName: f.file_name, url: productSigned.get(f.storage_path) ?? null })),
    designFiles: designFilesRaw.map((f) => ({ id: f.id, fileName: f.file_name, url: designSigned.get(f.storage_path) ?? null })),
  };
}

/**
 * PUBLIC — no `requireAdmin`/`requireEmployee` call. The token itself is
 * the only credential: an unguessable 48-char secret nobody can enumerate
 * (see the unique index in 0022_design_approval.sql). Returns null for an
 * unknown/never-issued token so the page can show "link not found" rather
 * than leaking whether an order exists.
 */
export async function getDesignApprovalByToken(token: string): Promise<PublicDesignApproval | null> {
  if (isDemoMode()) return getDemoDesignApprovalByToken(token);

  const supabase = createServiceClient();
  const { data: order } = await supabase
    .from("orders")
    .select("id, order_number, customer_name, product, design_approval_status, design_approval_note")
    .eq("design_approval_token", token)
    .maybeSingle();
  if (!order) return null;

  const { productImages, designFiles } = await signOrderFiles(supabase, order.id);

  return {
    orderNumber: order.order_number,
    customerName: order.customer_name,
    product: order.product,
    status: order.design_approval_status,
    note: order.design_approval_note,
    productImages,
    designFiles,
  };
}

/**
 * PUBLIC — the customer's Approve / Request Changes action on
 * app/approve/[token]. Only actionable while the link is still "pending":
 * once responded to (by this customer, or a stale reload after a manager
 * sent a fresh link), it's a no-op error rather than silently overwriting
 * an existing decision.
 */
export async function respondToDesignApproval(
  token: string,
  decision: Extract<DesignApprovalStatus, "approved" | "changes_requested">,
  note?: string
): Promise<void> {
  if (isDemoMode()) throw new Error(DEMO_WRITE_ERROR);
  if (decision === "changes_requested" && !note?.trim()) {
    throw new Error("Please describe what needs to change.");
  }

  const supabase = createServiceClient();
  const { data: order, error } = await supabase
    .from("orders")
    .select("id, order_number, customer_name, product, delivery_date, delivery_time, design_approval_status, approved")
    .eq("design_approval_token", token)
    .maybeSingle();
  if (error || !order) throw new Error("This approval link is invalid.");
  if (order.design_approval_status !== "pending") {
    throw new Error("This design approval has already been responded to.");
  }

  // Approving the design doubles as the manager's own production-approval
  // gate (orders.approved) -- the customer saying yes is exactly the signal
  // that gate exists to wait for, so there's no separate manual step for a
  // manager to remember. If the order was still unapproved, this is also
  // the moment the deferred "order confirmed" notifications go out (see
  // sendOrderApprovedNotifications in lib/actions/orders.ts) -- nobody was
  // told about this order while it sat waiting on the customer.
  const justApproved = decision === "approved" && !order.approved;

  const { error: updateError } = await supabase
    .from("orders")
    .update({
      design_approval_status: decision,
      design_approval_note: decision === "changes_requested" ? note!.trim() : null,
      design_approval_responded_at: new Date().toISOString(),
      ...(decision === "approved" ? { approved: true } : {}),
    })
    .eq("id", order.id);
  if (updateError) throw new Error(updateError.message);

  if (justApproved) {
    await sendOrderApprovedNotifications(supabase, order.id, null, `${order.customer_name} (design approval link)`);
  }

  await recordAuditLog({
    actorId: null,
    actorName: `${order.customer_name} (design approval link)`,
    action: "design_approval_responded",
    entityType: "order",
    entityId: order.id,
    orderId: order.id,
    newValue: { status: decision, note: decision === "changes_requested" ? note!.trim() : null },
  });

  const { data: admins } = await supabase.from("employees").select("id, phone").eq("role", "admin").eq("active", true);
  for (const admin of admins ?? []) {
    await notifyAdminDesignApprovalResponded(
      {
        employeeId: admin.id,
        employeePhone: admin.phone,
        orderId: order.id,
        orderNumber: order.order_number,
        product: order.product,
        deliveryDate: order.delivery_date,
        deliveryTime: order.delivery_time,
        customerName: order.customer_name,
        statusLabel: DESIGN_APPROVAL_STATUS_LABELS[decision],
        noteText: decision === "changes_requested" ? note!.trim() : undefined,
      },
      null,
      order.customer_name
    );
  }

  await broadcast(CHANNELS.production, "order.updated", { orderId: order.id });
  revalidatePath("/dashboard");
}
