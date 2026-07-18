import type {
  EmployeeRole,
  MaterialPriority,
  MaterialRequestStatus,
  MaterialType,
  OrderPriority,
  OrderStatus,
} from "@/types/database.types";

export const ORDER_STATUSES: OrderStatus[] = [
  "new",
  "in_progress",
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
 */
export const EMPLOYEE_NEXT_ACTIONS: Partial<Record<OrderStatus, { status: OrderStatus; label: string }[]>> = {
  new: [{ status: "in_progress", label: "Start Production" }],
  in_progress: [
    { status: "waiting_materials", label: "Waiting for Materials" },
    { status: "ready_pickup", label: "Ready for Pickup" },
    { status: "ready_delivery", label: "Ready for Delivery" },
  ],
  waiting_materials: [{ status: "in_progress", label: "Resume Production" }],
  ready_pickup: [{ status: "collected", label: "Collected" }],
  ready_delivery: [{ status: "delivered", label: "Delivered" }],
};

/** Every status an employee is allowed to set via updateEmployeeJobStatus. */
export const EMPLOYEE_ALLOWED_TARGET_STATUSES: OrderStatus[] = [
  "in_progress",
  "waiting_materials",
  "ready_pickup",
  "ready_delivery",
  "collected",
  "delivered",
];

/** Statuses that keep a job in "My Active Jobs" on the employee dashboard. */
export const EMPLOYEE_ACTIVE_STATUSES: OrderStatus[] = [
  "in_progress",
  "waiting_materials",
  "ready_pickup",
  "ready_delivery",
];

export const PRIORITY_SORT_WEIGHT: Record<OrderPriority, number> = {
  urgent: 0,
  normal: 1,
};

/** The four production columns shown on the TV Dashboard board. */
export type TvColumnKey = "in_progress" | "waiting_materials" | "ready_pickup" | "ready_delivery";

export const TV_COLUMNS: TvColumnKey[] = ["in_progress", "waiting_materials", "ready_pickup", "ready_delivery"];
