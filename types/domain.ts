import type {
  DesignApprovalStatus,
  EmployeeRole,
  MaterialPriority,
  MaterialRequestStatus,
  MaterialType,
  OrderDeliveryProvider,
  OrderFulfillmentType,
  OrderPriority,
  OrderStatus,
} from "@/types/database.types";

export const ORDER_STATUSES: OrderStatus[] = [
  "new",
  "in_progress",
  "ready_internal_pickup",
  "waiting_materials",
  "ready_pickup",
  "ready_delivery",
  "collected",
  "delivered",
  "completed",
];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  new: "New",
  in_progress: "In Progress",
  ready_internal_pickup: "Ready for Internal Pickup",
  waiting_materials: "Waiting for Materials",
  ready_pickup: "Ready for Pickup",
  ready_delivery: "Ready for Delivery",
  collected: "Collected",
  delivered: "Delivered",
  completed: "Completed",
};

export const ACTIVE_ORDER_STATUSES: OrderStatus[] = ORDER_STATUSES.filter(
  (status) => status !== "completed"
);

/** Statuses that still count as "in flight" for delayed-order detection. */
export const DELAYABLE_STATUSES: OrderStatus[] = [
  "new",
  "in_progress",
  "ready_internal_pickup",
  "waiting_materials",
  "ready_pickup",
  "ready_delivery",
];

export const EMPLOYEE_ROLE_LABELS: Record<EmployeeRole, string> = {
  admin: "Administrator",
  employee: "Employee",
  supervisor: "Supervisor",
  store: "Store",
  delivery: "Delivery",
};

export const MATERIAL_TYPE_LABELS: Record<MaterialType, string> = {
  paper: "Paper",
  ink: "Ink",
  vinyl: "Vinyl",
  packaging: "Packaging",
  lamination: "Lamination",
  other: "Other",
};

export const MATERIAL_PRIORITY_LABELS: Record<MaterialPriority, string> = {
  low: "Low",
  normal: "Normal",
  urgent: "Urgent",
};

export const MATERIAL_REQUEST_STATUS_LABELS: Record<MaterialRequestStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  fulfilled: "Fulfilled",
};

export const ORDER_PRIORITY_LABELS: Record<OrderPriority, string> = {
  normal: "Normal",
  urgent: "Urgent",
};

export const ORDER_FULFILLMENT_TYPE_LABELS: Record<OrderFulfillmentType, string> = {
  pickup: "Pickup",
  delivery: "Delivery",
};

/**
 * Who actually carries out a `delivery`-fulfillment order once it's ready:
 * in-house delivery-role staff (e.g. Naresh, auto-assigned and notified —
 * see notifyDeliveryStaffForStatus) or Armada's courier API (dispatched
 * automatically the moment the order hits ready_delivery — see
 * lib/armada/client.ts and docs/ARMADA_DELIVERY.md). Chosen via the "Who's
 * delivering this?" prompt (components/orders/delivery-provider-dialog.tsx)
 * at the moment an order goes ready_delivery, not earlier at order-creation
 * time — meaningless for `pickup` orders either way.
 */
export const ORDER_DELIVERY_PROVIDER_LABELS: Record<OrderDeliveryProvider, string> = {
  internal: "Internal delivery staff",
  armada: "Armada",
};

/**
 * Customer-facing design/proof approval, sent as a public link
 * (components/orders/order-detail-drawer.tsx "Send for Approval" ->
 * app/approve/[token]). `not_sent` is the default for every order and
 * never shown as a badge -- most orders never use this feature at all.
 * While `pending` or `changes_requested`, the customer hasn't signed off
 * yet, so `applyOrderStatusTransition` (lib/actions/status-transition.ts)
 * blocks `new -> in_progress` ("Start Production") until it's `approved`.
 * See docs/DESIGN_APPROVAL.md.
 */
export const DESIGN_APPROVAL_STATUS_LABELS: Record<DesignApprovalStatus, string> = {
  not_sent: "Not Sent",
  pending: "Awaiting Customer Approval",
  approved: "Design Approved",
  changes_requested: "Changes Requested",
};

/** Countdown badge thresholds, in minutes remaining until delivery. */
export const COUNTDOWN_THRESHOLDS = {
  green: 240, // more than 4 hours remaining
  yellow: 120, // less than 2 hours remaining
  orange: 60, // less than 1 hour remaining
  // anything below 0 (past due) is red
} as const;

export type CountdownColor = "green" | "yellow" | "orange" | "red";

/**
 * Status action buttons shown on an employee's job card, keyed by the
 * order's *current* status — only the statuses that make sense from there.
 * `in_progress` is handled separately by `getEmployeeNextActions` below,
 * since its "done" action depends on the order's fulfillment type (and
 * whether the acting employee is outsourced) rather than a fixed target.
 */
export const EMPLOYEE_NEXT_ACTIONS: Partial<Record<OrderStatus, { status: OrderStatus; label: string }[]>> = {
  new: [{ status: "in_progress", label: "Start Production" }],
  in_progress: [{ status: "waiting_materials", label: "Waiting for Materials" }],
  ready_internal_pickup: [{ status: "in_progress", label: "Picked Up — Back to Production" }],
  waiting_materials: [{ status: "in_progress", label: "Resume Production" }],
  ready_pickup: [
    { status: "collected", label: "Collected" },
    { status: "in_progress", label: "Back to Production" },
  ],
  ready_delivery: [
    { status: "delivered", label: "Delivered" },
    { status: "in_progress", label: "Back to Production" },
  ],
};

/**
 * Resolves the actual action list for a job card.
 *
 * On `in_progress`, "done" depends on who's acting:
 * - An outsourced employee never gets the customer-facing pickup/delivery
 *   choice — their only "done" action is ready_internal_pickup, which
 *   notifies the designated in-house contact to go collect it rather than
 *   telling the customer anything.
 * - Everyone else gets the fulfillment-aware action from before: the order
 *   picked pickup vs. delivery at creation time, so marking done routes
 *   automatically to the right status instead of the employee choosing.
 */
export function getEmployeeNextActions(
  status: OrderStatus,
  fulfillmentType: OrderFulfillmentType,
  isOutsourced: boolean
): { status: OrderStatus; label: string }[] {
  const actions = EMPLOYEE_NEXT_ACTIONS[status] ?? [];
  if (status !== "in_progress") return actions;

  if (isOutsourced) {
    return [...actions, { status: "ready_internal_pickup" as const, label: "Ready for Internal Pickup" }];
  }

  const doneAction =
    fulfillmentType === "pickup"
      ? { status: "ready_pickup" as const, label: "Ready for Pickup" }
      : { status: "ready_delivery" as const, label: "Ready for Delivery" };

  return [...actions, doneAction];
}

/** Pseudo-id for an order's own (first) item in toggleJobItemReady — it isn't a row in order_items, unlike items 2+. */
export const PRIMARY_ITEM_ID = "primary";

/** Every status an employee is allowed to set via updateEmployeeJobStatus. */
export const EMPLOYEE_ALLOWED_TARGET_STATUSES: OrderStatus[] = [
  "in_progress",
  "waiting_materials",
  "ready_internal_pickup",
  "ready_pickup",
  "ready_delivery",
  "collected",
  "delivered",
];

/** Statuses that keep a job in "My Active Jobs" on the employee dashboard. */
export const EMPLOYEE_ACTIVE_STATUSES: OrderStatus[] = [
  "in_progress",
  "ready_internal_pickup",
  "waiting_materials",
  "ready_pickup",
  "ready_delivery",
];

export const PRIORITY_SORT_WEIGHT: Record<OrderPriority, number> = {
  urgent: 0,
  normal: 1,
};

/**
 * The four production columns shown on the TV Dashboard board, in display
 * order. `new` ("Queue Orders") leads and is rendered narrower with
 * compact cards (tv-status-column.tsx) -- it's just a glance at what's
 * about to start, not a working view, so it doesn't get equal billing
 * with the three production-flow columns. `waiting_materials` is
 * deliberately NOT shown on the TV at all (only on the Manager/Employee
 * dashboards) -- it's an internal procurement concern for staff, not
 * something to broadcast to the shop floor.
 */
export type TvColumnKey = "new" | "in_progress" | "ready_pickup" | "ready_delivery";

export const TV_COLUMNS: TvColumnKey[] = ["new", "in_progress", "ready_pickup", "ready_delivery"];
