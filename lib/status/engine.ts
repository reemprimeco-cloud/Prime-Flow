import { ORDER_STATUS_LABELS } from "@/types/domain";
import type { OrderStatus } from "@/types/database.types";

/**
 * Canonical order workflow graph — the single source of truth for which
 * status transitions are legal. Every dashboard (Manager, Employee, TV) and
 * every Server Action that changes `orders.status` must go through
 * `assertValidTransition` rather than re-deriving this logic locally.
 *
 * `collected`/`delivered` -> `completed` is modeled here even though nothing
 * triggers it yet — that transition belongs to the month-end Archive job
 * (deferred to a later phase), not to the Manager/Employee dashboards.
 */
export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  new: ["in_progress"],
  in_progress: ["waiting_materials", "ready_pickup", "ready_delivery"],
  waiting_materials: ["in_progress"],
  ready_pickup: ["collected"],
  ready_delivery: ["delivered"],
  collected: ["completed"],
  delivered: ["completed"],
  completed: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_STATUS_TRANSITIONS[from].includes(to);
}

export function getNextStatuses(from: OrderStatus): OrderStatus[] {
  return ORDER_STATUS_TRANSITIONS[from];
}

export class InvalidStatusTransitionError extends Error {
  readonly from: OrderStatus;
  readonly to: OrderStatus;

  constructor(from: OrderStatus, to: OrderStatus) {
    super(`Can't move an order from "${ORDER_STATUS_LABELS[from]}" to "${ORDER_STATUS_LABELS[to]}".`);
    this.name = "InvalidStatusTransitionError";
    this.from = from;
    this.to = to;
  }
}

/** Throws InvalidStatusTransitionError if the transition isn't legal. */
export function assertValidTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) throw new InvalidStatusTransitionError(from, to);
}
