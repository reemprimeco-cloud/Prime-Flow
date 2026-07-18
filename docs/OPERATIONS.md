# Operations Control Center

Phase 7 gives managers shop-wide visibility and control, layered on top of the Manager Dashboard built in earlier phases. Every module here is **additive**: it reads data that already existed (`orders`, `order_assignments`, `material_requests`, `audit_logs`) and reuses infrastructure from the Production Core phase (Realtime Broadcast, the Audit Log, the Status Engine) rather than introducing new tracking tables. The one deliberate exception is Manager Override, which exists specifically to bypass the Status Engine under audit.

All pages below live under `(manager)/` and are admin-only (`requireAdmin`), all support Demo Mode via `lib/demo/data.ts` generators, and all follow the same client pattern used since Phase 5: a Server Component fetches initial data, a `"use client"` component wraps it in `useQuery` with `initialData`, and `useRealtimeChannel` + a safety-net `refetchInterval` keep it live.

## 1. Live Production Timeline

`lib/actions/timeline.ts` (`getOrderTimeline(orderId)`) reads `audit_logs` filtered to one order, ordered oldest-first, and computes `minutesSincePrevious` via `date-fns`'s `differenceInMinutes` between consecutive rows. Every event type the spec asked for — order created, employee assigned/unassigned, status changes, material requested/approved/rejected, notifications sent, deletion — is already written to `audit_logs` by existing call sites (see `AUDIT_LOG.md`), so this module is a formatting layer, not a new data source.

Human-readable labels come from `lib/timeline/describe.ts`'s `describeAuditEntry(action, oldValue, newValue)`. It's a plain module rather than living in `lib/actions/timeline.ts` because `"use server"` files may only export async functions — `describeAuditEntry` is synchronous and is also called directly by the Demo Mode data generator, so it needed a home outside the Server Action file.

Rendered by `components/orders/order-timeline.tsx` inside the Order Detail Drawer (`components/orders/order-detail-drawer.tsx`), replacing what was previously a plain "Status History" list.

## 2. Employee Workload

`lib/actions/workload.ts` (`listEmployeeWorkload()`) joins `employees` (active, role `employee`) against `order_assignments` and `orders` to compute, per employee: active jobs (status in `EMPLOYEE_ACTIVE_STATUSES`), queued jobs (status `new`), completed today (from `order_status_history` rows transitioning to `collected`/`delivered` today), average completion time (minutes between `created_at` and `completed_at` on their completed orders), waiting-for-materials count, and delayed-jobs count (delivery deadline passed while in a `DELAYABLE_STATUSES` state). Results are sorted by active job count descending by default.

`components/manager/workload-client.tsx` renders this as a sortable table — clicking a column header re-sorts client-side. `app/(manager)/workload/page.tsx` is the route.

## 3. Production Calendar

`lib/actions/calendar.ts` (`listCalendarOrders(startDate, endDate)`) fetches non-archived orders with a delivery date in range, flagging `isOverdue` the same way the dashboard countdown does (`DELAYABLE_STATUSES` + deadline in the past).

`components/manager/calendar-client.tsx` provides Day / Week / Month views (`ViewMode`), computed via a `rangeFor(view, anchor)` helper built on `date-fns` (`startOfWeek`/`endOfWeek`/`startOfMonth`/`endOfMonth`). The month grid shows per-day badges (order count, urgent count, overdue count); clicking a day drills into the day view. There's no persisted "pickup vs. delivery" field on an order — see the Known Gaps note below for how that's inferred.

## 4. Operations Dashboard

`lib/actions/operations.ts` (`getOperationsKpis()`) computes eight live KPIs in one call: orders in production, orders delayed, average production time (this month, completed orders only), pending material requests, employee utilization (% of active employees currently assigned to an in-flight order), completion rate (this month), and today's deliveries/pickups.

`components/manager/operations-client.tsx` renders these as stat cards above the Activity Feed (module 8). `app/(manager)/operations/page.tsx` is the route.

## 5. Global Search

`lib/actions/search.ts` (`globalSearch(query)`) searches orders (`order_number`, `customer_name`, `customer_mobile`, `product`, `notes` via `ilike .or()`) and employees (`full_name`, `phone`), capped at 8 results per type. Queries under 2 characters short-circuit to an empty result rather than hitting the database.

`components/manager/global-search.tsx` is a Cmd+K modal (mounted once in `app/(manager)/layout.tsx`), debounced 250ms. Selecting an order result navigates to `/dashboard?order=<id>`; `components/manager/dashboard-client.tsx` reads that `order` query param via `nuqs`'s `useQueryState` and opens the Order Detail Drawer directly — this is the same deep-link mechanism a bookmarked or shared URL would use.

## 6. Bulk Actions

`lib/actions/bulk.ts` exposes five functions, each returning `BulkResult { requested, succeeded, skipped }` so the UI can report exactly what happened rather than a single pass/fail:

- `bulkAssignEmployees(orderIds, employeeIds)` — inserts only the `(order, employee)` pairs that don't already exist, notifies each newly-assigned employee, audit-logs each assignment with `bulk: true`.
- `bulkChangePriority(orderIds, priority)`
- `bulkMoveDeliveryDate(orderIds, newDate)`
- `bulkArchiveCompleted(orderIds)` — silently skips any selected order that isn't `completed`; only eligible orders count toward `succeeded`.
- `bulkSendNotifications(orderIds)` — re-sends the current-status customer notification for each order that has WhatsApp enabled and a mobile number on file; others are skipped.

Selection state (`selectedIds: Set<string>`) lives in `dashboard-client.tsx` and is passed down to `OrderCard`/`OrderListView`, which render a checkbox. `components/manager/bulk-actions-bar.tsx` is the floating action bar that appears once anything is selected, with per-action dialogs for assign/priority/date.

## 7. Manager Override

`overrideOrderStatus(orderId, newStatus, reason)` in `lib/actions/orders.ts` is the one place in the app that changes `orders.status` **without** calling `assertValidTransition` (see `STATUS_ENGINE.md`) — that's the entire point of an override: a manager can move an order to any status regardless of the normal workflow graph, for cases the graph doesn't anticipate (a mis-click, a customer walk-back, a floor correction).

A non-empty `reason` is required. The audit log entry is written with `newValue: { status: newStatus, managerOverride: true, reason }`, so every override is distinguishable from a normal employee-driven status change in both the Live Production Timeline and the Activity Feed (`describeAuditEntry` appends `"(manager override)"` to the label). `components/orders/override-status-dialog.tsx` is the status-select + reason-textarea UI, launched from an "Override Status" button in the Order Detail Drawer.

## 8. Activity Feed

`lib/actions/activity.ts` (`listRecentActivity(limit = 40)`) is the shop-wide counterpart to the per-order timeline: same `audit_logs` source, unfiltered, capped and ordered newest-first. `components/manager/activity-feed.tsx` renders it with realtime invalidation plus a 30s poll, and a human-readable `actionVerb()` on top of `describeAuditEntry` (e.g. "Hassan Youssef requested materials for #1045"). Displayed on the Operations Dashboard.

## 9. Health Monitoring (Diagnostics)

`lib/actions/diagnostics.ts` (`getDiagnosticsSnapshot()`) reports:

- **Database Connection / Supabase Latency** — a lightweight `select id from employees limit 1`, timed.
- **Notification Queue** — counts of `notification_logs` rows with status `pending` / `failed`.
- **Twilio Status** — whether `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_WHATSAPP_NUMBER` are all set (never the values themselves — nothing credential-shaped leaves the server).
- **Active Users** — distinct `audit_logs.actor_id` values in the last 15 minutes. This is an approximation, not a real session count: auth is stateless JWT cookies with no session-tracking table, so "active" means "did something recently," not "has an open tab."

**Realtime Status** is client-only and not part of the snapshot: `components/manager/diagnostics-client.tsx` subscribes to the `production` channel via `useRealtimeChannel` and polls `getChannelStatus()` (exported from `lib/realtime/manager.ts`, which already tracks each multiplexed channel's underlying Supabase `SUBSCRIBED`/`SUBSCRIBING`/`CLOSED` state for its own reconnect logic) once a second.

`app/(manager)/diagnostics/page.tsx` is the route.

## Known gaps / simplifications carried into Phase 7

- **Fulfillment method is now persisted** (`orders.fulfillment_type`, added RC3) but Today's Deliveries/Pickups (Operations Dashboard) and the Calendar's pickup/delivery framing still infer it from current status — `ready_pickup`/`collected` = pickup-track, `ready_delivery`/`delivered` = delivery-track — rather than reading the new column. Still correct for orders that have reached those stages; switching these KPIs to read `fulfillment_type` directly (so an order's method is known from creation, before either stage is reached) is straightforward follow-up work, not done in this pass.
- **Active Users is an approximation**, not a session count — see Diagnostics above.
- **Manager Override bypasses the Status Engine by design.** Every other write path in the app still goes through `assertValidTransition`; this is the sole deliberate exception, and it's the reason the audit log entry is tagged `managerOverride: true` rather than looking like a normal transition.
