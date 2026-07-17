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

/** Statuses an employee can advance an order through from the job card. */
export const EMPLOYEE_STATUS_ACTIONS: { status: OrderStatus; label: string }[] = [
  { status: "in_progress", label: "Start Production" },
  { status: "waiting_materials", label: "Waiting For Materials" },
  { status: "ready_pickup", label: "Ready for Pickup" },
  { status: "ready_delivery", label: "Ready for Delivery" },
  { status: "collected", label: "Collected" },
  { status: "delivered", label: "Delivered" },
];
