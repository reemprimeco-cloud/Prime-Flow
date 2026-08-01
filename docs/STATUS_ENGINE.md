# Status engine

`lib/status/engine.ts` is the single source of truth for which `orders.status` transitions are legal. Nothing else in the app should re-derive or duplicate this graph.

## The graph

```ts
export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  new: ["in_progress"],
  in_progress: ["waiting_materials", "ready_pickup", "ready_delivery"],
  waiting_materials: ["in_progress"],
  ready_pickup: ["collected", "in_progress"],
  ready_delivery: ["delivered", "in_progress"],
  collected: ["completed"],
  delivered: ["completed"],
  completed: [],
};
```

```
new ─▶ in_progress ─┬─▶ waiting_materials ─▶ in_progress (loop)
                     ├─▶ ready_pickup ─▶ collected ─▶ completed
                     │        └─▶ in_progress (revert — marked ready by mistake)
                     └─▶ ready_delivery ─▶ delivered ─▶ completed
                              └─▶ in_progress (revert — marked ready by mistake)
```

The `ready_pickup`/`ready_delivery → in_progress` edges (added RC3) exist so an employee can undo marking a job ready by mistake, before it's actually collected/delivered. `notifyOrderMovedBackToProduction` (see `NOTIFICATIONS.md`) fires a correction message to the customer on this specific transition, since a "ready" message may have already gone out.

`collected`/`delivered` → `completed` is modeled even though nothing triggers it yet. That transition belongs to the month-end Archive job (deferred — see `ARCHITECTURE.md`), not to a Manager/Employee button. Keeping it in the graph now means the Archive phase adds a caller, not a new edge.

## API

- `canTransition(from, to)` — boolean check.
- `getNextStatuses(from)` — for building UI (e.g. which buttons to show).
- `assertValidTransition(from, to)` — throws `InvalidStatusTransitionError` with a human-readable message (`Can't move an order from "In Progress" to "Delivered".`) if the transition isn't in the graph.

## Where it's enforced

`updateEmployeeJobStatus` (`lib/actions/employee-jobs.ts`) is currently the only place `orders.status` changes. It applies two independent checks, in this order:

1. **Role allowlist** — `EMPLOYEE_ALLOWED_TARGET_STATUSES` (`types/domain.ts`): which statuses an employee is permitted to set at all (never `new` or `completed`).
2. **Workflow validity** — `assertValidTransition(current.status, status)`: whether that specific jump is legal from the order's *current* status.

Before this existed, only the role allowlist was checked — an employee could jump an order from `new` straight to `delivered` in one call, since target-status membership was the only check. The engine closes that gap without changing the set of statuses employees are allowed to set.

## UI labels

`EMPLOYEE_NEXT_ACTIONS` (`types/domain.ts`) maps a job's current status to the button(s) shown on its card (`{ status, label }[]`). It's a presentation-layer concern (button copy, which statuses get *offered* as one-click actions) and intentionally stays a subset of what the engine allows — e.g. `waiting_materials → in_progress` is offered as "Resume Production" but `completed` is never offered anywhere since no dashboard sets it yet.

`in_progress → waiting_materials` ("Waiting for Materials") is the one entry in this map that never fires the plain status-change action directly — `employee-dashboard-client.tsx`'s `handleStatusChange` intercepts that specific target and opens the Request Material dialog instead. The engine transition itself only actually runs inside `submitMaterialRequestForJob` (`lib/actions/employee-jobs.ts`) once the form is submitted, so a manager can never see an order sitting in `waiting_materials` with no corresponding row on the Material Requests page explaining what's needed — the two used to be entirely decoupled (an employee could flip the status without ever filing a request), which is exactly what broke.
