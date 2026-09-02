import { ORDER_STATUS_LABELS } from "@/types/domain";
import type { AuditAction, OrderStatus } from "@/types/database.types";

/**
 * Turns one audit_logs row into a human-readable timeline label. Lives
 * outside lib/actions/timeline.ts (a "use server" file, which may only
 * export async functions) so both the server action and demo data
 * generator can call it directly.
 */
export function describeAuditEntry(action: AuditAction, oldValue: unknown, newValue: unknown): string {
  const old = (oldValue ?? {}) as Record<string, unknown>;
  const next = (newValue ?? {}) as Record<string, unknown>;

  switch (action) {
    case "order_created":
      return next.duplicatedFrom ? "Order created (duplicated)" : "Order created";
    case "order_updated":
      return "Order details updated";
    case "order_deleted":
      return "Order deleted";
    case "employee_assigned":
      return "Employee assigned";
    case "employee_unassigned":
      return "Employee unassigned";
    case "status_changed": {
      const from = old.status as OrderStatus | undefined;
      const to = next.status as OrderStatus | undefined;
      const arrow = `${from ? ORDER_STATUS_LABELS[from] : "—"} → ${to ? ORDER_STATUS_LABELS[to] : "—"}`;
      return next.managerOverride ? `${arrow} (manager override)` : arrow;
    }
    case "material_requested":
      return "Material requested";
    case "material_approved":
      return "Material request approved";
    case "material_rejected":
      return "Material request rejected";
    case "notification_sent": {
      const template = typeof next.templateName === "string" ? next.templateName : "notification";
      const status = typeof next.status === "string" ? next.status : "";
      return `Notification sent: ${template}${status ? ` (${status})` : ""}`;
    }
    case "employee_created":
      return "Employee account created";
    case "employee_updated": {
      if (typeof next.active === "boolean" && old.active !== next.active) {
        return next.active ? "Employee activated" : "Employee deactivated";
      }
      if (typeof next.role === "string" && old.role !== next.role) {
        return `Employee role changed to ${next.role}`;
      }
      return "Employee profile updated";
    }
    case "employee_password_reset":
      return "Employee password reset";
    case "armada_delivery_dispatched":
      return "Dispatched to Armada";
    case "armada_delivery_dispatch_failed":
      return "Armada dispatch failed — fell back to internal delivery staff";
    case "armada_delivery_canceled":
      return "Armada delivery canceled";
    case "armada_webhook_status_update": {
      const status = typeof next.orderStatus === "string" ? next.orderStatus : "";
      return status ? `Armada update: ${status}` : "Armada status update";
    }
    case "design_approval_requested":
      return "Sent for customer design approval";
    case "design_approval_responded": {
      const status = typeof next.status === "string" ? next.status : "";
      return status === "approved" ? "Customer approved the design" : "Customer requested design changes";
    }
    default:
      return action;
  }
}
