# Audit log

`audit_logs` is an additive table (migration `create_audit_logs`) — no existing table or enum was touched to add it. Like every other table in this project, RLS is enabled with zero policies; only the service-role client writes to it, via `lib/audit/log.ts`.

## Schema

| Column | Notes |
|---|---|
| `actor_id` | FK → `employees.id`, nullable, `on delete set null` |
| `actor_name` | Denormalized at write time — survives the employee record changing or being removed |
| `action` | `audit_action` enum (see below) |
| `entity_type` / `entity_id` | Free-form (`"order"`, `"order_assignment"`, …) + a bare UUID — not FK'd, so it can reference something already deleted (see Deletions below) |
| `order_id` | FK → `orders.id`, nullable, `on delete set null` — the convenience column for "show me everything that happened to order X" |
| `old_value` / `new_value` | `jsonb`, whatever's relevant to the action — not a full row snapshot |

```ts
type AuditAction =
  | "order_created" | "order_updated" | "order_deleted"
  | "employee_assigned" | "employee_unassigned"
  | "status_changed"
  | "material_requested" | "material_approved" | "material_rejected"
  | "notification_sent";
```

`material_approved` / `material_rejected` are defined but unused — there's no material request approve/reject action yet (see the known gap in `ARCHITECTURE.md`). They're in the enum now so that feature's migration, when built, is "add the button," not "add the button and a schema change."

## Writing

```ts
await recordAuditLog({
  actorId: session.employeeId,
  actorName: session.fullName,
  action: "status_changed",
  entityType: "order",
  entityId: orderId,
  orderId,
  oldValue: { status: current.status },
  newValue: { status },
});
```

`recordAuditLog` **never throws** — same philosophy as `lib/realtime/channels.ts`'s `broadcast()`. A failed audit write must never fail the mutation that triggered it; the error is logged to the server console and swallowed. It's also a no-op in Demo Mode, since writes are disabled there entirely.

## Deletions

When an order is deleted, the audit entry for `order_deleted` is written with `orderId: null` (the FK'd column) but `entityId` still set to the now-gone order's UUID. Inserting a row whose `order_id` pointed at a deleted order would violate the foreign key; `entity_id` has no such constraint, so the record of *which* order it was survives even though the relational link doesn't.

## Current call sites

`lib/actions/orders.ts` (`createOrder`, `updateOrder`, `duplicateOrder`, `deleteOrder`, and per-employee `employee_assigned`/`employee_unassigned` entries on assignment diffs) and `lib/actions/employee-jobs.ts` (`updateEmployeeJobStatus`). The notification service also writes `notification_sent` entries — see `NOTIFICATIONS.md`.

## Intended use

This table has no viewer UI yet by design — it exists to make the Reports phase (deferred) additive rather than requiring new instrumentation. Until then, it's queryable directly (e.g. via the Supabase SQL editor) for support/debugging: "what happened to order #1045" is `select * from audit_logs where order_id = '...' order by created_at`.
