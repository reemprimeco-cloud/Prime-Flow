# Architecture

Prime Production Board is a production control center for Prime Printing Co. — not an ERP/CRM. It tracks a print job from creation to delivery across three surfaces (Manager, Employee, TV) with realtime updates and zero manual refresh.

This document describes the system **as built**. For focused deep-dives, see:

- [`REALTIME.md`](./REALTIME.md) — Realtime Broadcast architecture
- [`STATUS_ENGINE.md`](./STATUS_ENGINE.md) — order workflow state machine
- [`NOTIFICATIONS.md`](./NOTIFICATIONS.md) — notification service
- [`AUDIT_LOG.md`](./AUDIT_LOG.md) — audit trail
- [`OPERATIONS.md`](./OPERATIONS.md) — Operations Control Center (timeline, workload, calendar, KPIs, search, bulk actions, manager override, activity feed, diagnostics)
- [`TESTING.md`](./TESTING.md) — automated test suite (Status Engine, Permissions, Notifications, Order Creation, Material Requests)

## Tech stack

Next.js 15 (App Router, Server Components, Server Actions) · TypeScript (strict) · Tailwind v4 · Supabase (Postgres + Realtime Broadcast + Storage) · React Hook Form + Zod · TanStack Query · nuqs (URL-synced filters) · `jose` + `bcryptjs` (custom auth) · date-fns.

Light theme throughout, including the TV Dashboard, per product direction — no dark mode toggle.

## Auth model

A single `employees` table serves every role (`admin`, `employee`, `supervisor`, `store`, `delivery`) via a `role` column. There is **no Supabase Auth** — login is a Server Action that verifies a bcrypt hash and issues a signed httpOnly JWT cookie (`lib/auth/session.ts`), verified per-request in `middleware.ts` and re-verified inside every Server Action via `lib/auth/guards.ts` (`requireAdmin`, `requireEmployee`, `requireSession`).

Because there's no Supabase Auth, there's no `auth.uid()` for RLS to key off of. Every table has RLS **enabled with zero policies** — all reads/writes go through the service-role client (`lib/supabase/server.ts`) inside Server Components/Actions. The browser never talks to Postgres directly; the anon-key browser client (`lib/supabase/client.ts`) is used exclusively to open Realtime Broadcast channels, which don't require table grants.

`/tv` has no auth guard by design (spec: unattended fullscreen kiosk display) — customers waiting in the shop are expected to read it, so customer/employee names and order details are shown intentionally. It never returns phone numbers, order notes, or any other field beyond what `TvOrderCardData`/`TvDaySummary` declare (`lib/actions/tv.ts`).

## Route groups

```
app/
  (auth)/login/                unified login
  (manager)/                   admin: dashboard, employees, material-requests, notifications, archive
  employee/                    floor dashboard — assigned jobs only
  (tv)/tv/                     no-auth kiosk board
```

## Data flow

Server Components fetch initial data through the service-role client — first paint has no client fetch waterfall. TanStack Query hydrates from that initial data and owns subsequent client-side cache. Server Action mutations broadcast a Realtime event; every other connected client refetches the affected query via the same Server Action (see `REALTIME.md`) rather than trusting the broadcast payload as source of truth.

Filters on the Manager order board are URL-synced via `nuqs` — shareable and back-button friendly, no extra client store needed.

## Demo Mode

`DEMO_MODE=true` bypasses auth, serves static seeded data (`lib/demo/data.ts`), renders all three dashboards, and blocks writes with a consistent "read-only demo" error. It exists because this sandbox's network policy allows Supabase access only via MCP tools, not direct app-level HTTPS — Demo Mode is how every phase of this build gets verified in a real browser (Playwright) without a live deployment. Never enable it in production.

## Multi-item Orders

An order can hold more than one product line via the `order_items` table (`supabase/migrations/0012_order_items.sql`) — `orders.product`/`paper`/`paper_size`/`quantity`/`finishing` keep representing the first item unchanged, so every existing read path stays valid; `order_items` holds items 2+, each optionally assigned to its own employee. The New Order/Edit sheet's "+ Add Item" button (`components/orders/order-form.tsx`) manages the array with `useFieldArray`; on submit, items are replaced wholesale (delete + reinsert) rather than diffed, since the form has no stable per-item id to diff against. An item's assigned employee is folded into the same `order_assignments`/notification pipeline as the order-level "Assign Employees" picker — they see the whole order on their dashboard and get the normal assignment notification. Per-item *status* tracking (each item independently moving through the production pipeline, with its own Employee/TV dashboard card) remains out of scope — see Known Gaps. Per-item *readiness* (a lighter-weight "is this item done" checkbox that gates the order's overall completion) is covered below.

### Per-item Readiness

Multi-item orders get a "Ready" checkbox per item instead of one "done" button for the whole order: `orders.item_ready` (item 1) and `order_items.is_ready` (items 2+) — both `boolean not null default false`, migration `0015_order_item_readiness.sql`. `toggleJobItemReady(orderId, itemId, ready)` (`lib/actions/employee-jobs.ts`) flips one flag (`itemId` is either `PRIMARY_ITEM_ID` from `types/domain.ts`, or an `order_items.id`); checking the last remaining item while the order is still `in_progress` auto-fires the same transition `getEmployeeNextActions` would offer as the manual "done" action (`ready_pickup`/`ready_delivery`/`ready_internal_pickup`, fulfillment- and outsourced-aware) via `applyOrderStatusTransition` — no separate confirmation click needed. Unchecking an item never reverts a status that already advanced; `applyOrderStatusTransition`'s revert-to-production branch resets every item's flag back to `false` so the employee has to re-confirm readiness after a correction, rather than the order silently re-advancing off stale checkmarks.

On the Employee Dashboard, `JobCard` (`components/employee/job-card.tsx`) only shows the checklist entry point ("N items — X/N ready") when `job.itemCount > 0` — a single-item order already shows everything inline on the card, so there's nothing to open. `StatusActions`' `suppressDoneAction` prop hides the manual done button for those same multi-item jobs, since completion is gated behind the checklist instead. The checklist itself is `components/employee/item-readiness-dialog.tsx`, dynamically imported like the other job-card dialogs (Add Note, Request Material). Design files on the job card are downloaded (not just previewed) via a signed URL created per-file with `download` set to the original file name (`signDesignFileDownloadUrls`), so the browser saves them with a clean name and a forced Content-Disposition regardless of file type.

The TV Dashboard surfaces the same per-item flags read-only: `getTvBoard()`/`TvOrderCardData` (`lib/actions/tv.ts`) carry `itemReady` + `additionalItems`, and `TvOrderCard` renders one small "Item N Ready/Pending" pill per item — only for orders with more than one item — so the shop floor can see at a glance which items on a multi-item job are still outstanding without opening anything.

## Shared Status Transition

`lib/actions/status-transition.ts`'s `applyOrderStatusTransition` is the single implementation behind every guarded "move this order to a new status" action, regardless of who's driving it — it validates against the Status Engine, persists the change, and fires every notification a status change can trigger (customer update, revert-to-production correction, delivery-staff hand-off via `notifyDeliveryStaffForStatus`). The employee dashboard's `updateEmployeeJobStatus` (`lib/actions/employee-jobs.ts`) wraps it with an `order_assignments` check and an admin notification; the manager dashboard's `updateOrderStatus` (`lib/actions/orders.ts`) wraps it with `requireAdmin()` and neither of those — an admin can act on any order and doesn't need to be told about their own change. Both surfaces render the same `<StatusActions>` component (`components/orders/status-actions.tsx`, driven by `getEmployeeNextActions`), so a manager doing floor work sees the identical Start Production / Ready for Pickup / Ready for Delivery buttons an employee would, instead of having to reach for **Override Status** (which requires typing a reason and bypasses the Status Engine entirely — still there for correcting a stuck or mis-clicked order).

## Sequential Employee Hand-off

When a manager assigns more than one employee to an order, the order form's "Assign Employees" list becomes reorderable (up/down arrows) and that order defines a hand-off chain — `order_assignments.sequence` (1, 2, 3…), set by `sequenceFor`/`syncAssignmentSequences` in `lib/actions/orders.ts`. Only stage 1's employee sees the job initially; `getMyJobs()` (`lib/actions/employee-jobs.ts`) excludes an order entirely from an employee's dashboard while an earlier, still-unhandled sequence position exists on it — so Siva never sees the job at all until Kumar clicks **Ready for Next**, which calls `handOffJob()` to stamp `handed_off_at` on Kumar's assignment (removing it from his dashboard) and notify whoever's next. The order's own `status` is untouched by this — hand-off is purely about who can see and work the job, not what stage the order is in; the normal Status Engine transitions still apply once the last person in the chain acts. Assignments outside the explicit list — a per-item assignee (Multi-item Orders above) or an auto-assigned delivery-role employee — get `sequence = null`, which means never gated and never blocking anyone else.

## Delivery Address → Google Maps

`orders.delivery_address` (migration 0014) is a plain text field the manager fills in on the order form when Fulfillment is "Delivery" — no Google Maps API key or geocoding involved. `lib/utils/maps.ts`'s `buildGoogleMapsLink` turns it into a `google.com/maps/search/?api=1&query=...` URL on the fly, both in the WhatsApp message sent to delivery-role staff (`order_out_for_delivery_staff` template, via `EmployeeNotificationContext.deliveryAddress` in `lib/notifications/service.ts`) and as a clickable link in-app (order detail drawer, employee job card) — tapping it opens Maps with the address ready to navigate.

A second, optional field — `orders.delivery_map_link` (migration `0016_order_delivery_map_link.sql`) — lets the manager paste an exact Google Maps link (e.g. from a pin's Share > Copy Link) instead of relying on geocoding a free-text address. Every place that builds a maps link (`EmployeeNotificationContext`, the order detail drawer, the employee job card) prefers `deliveryMapLink` when present and falls back to `buildGoogleMapsLink(deliveryAddress)` otherwise — same pattern everywhere, so the two never drift.

## Customer phone on the employee job card

`getMyJobs` (`lib/actions/employee-jobs.ts`) includes `customer_mobile` in `EmployeeJobItem`, rendered as a `tel:` link on the job card (`components/employee/job-card.tsx`) — an assigned employee (delivery staff especially) can call the customer directly, which previously required going through the manager since the number wasn't exposed anywhere on the employee side at all.

Phone numbers copied from WhatsApp or an iOS/Android contact card often carry invisible Unicode bidi-formatting characters (`‪`/`‬` embedding marks, zero-width spaces, LRM/RLM) wrapped around the visible digits — harmless to the eye, but they break `tel:`/`wa.me` links outright. `lib/utils/phone.ts`'s `sanitizePhoneInput` strips anything in Unicode category Cf (format characters) via `/\p{Cf}/gu`. Applied two places: as a `.transform()` in the `customerMobile`/`phone` zod schemas (`lib/validation/order.ts`, `order-request.ts`, `employee.ts`) so new/edited records are saved clean, and again on read in `getMyJobs` so rows saved before this existed (or written directly, bypassing validation) still render correctly.

## Order Form — English-only, always-notify, mobile-responsive

The New Order/Edit sheet locks a few things that used to be per-order choices, since in practice they were never actually varied: `preferredLanguage` is always submitted as `"en"` and `whatsappEnabled` always `true` — the Preferred Language select and WhatsApp Notifications toggle are gone from the UI, and `defaultValues()` normalizes both back to these on every edit regardless of what an older order was created with. `notificationPreferences` is no longer a per-type checkbox list either — every order uses `DEFAULT_NOTIFICATION_PREFERENCES` (`lib/notifications/constants.ts`): `order_received`/`order_in_production`/`ready_for_pickup`/`out_for_delivery` all `true`, `delivered` `false` (the customer already has the order by then, so a second confirmation text is redundant). The `ar` language/Arabic templates and the `NotificationPreferences` type itself are untouched — only the order form's UI and defaults changed, so nothing downstream (templates, the Status Engine, `sendCustomerNotification`'s preference gate) needed to change shape.

Every field grid in the order form uses `grid-cols-1 sm:grid-cols-2` rather than a bare `grid-cols-2` — below the `sm` breakpoint (640px) every field stacks full-width instead of squeezing two fields into a phone-width sheet. Optional Specifications fields (Paper, Paper Size, Finishing) are labeled "(optional)" with a neutral "Optional" placeholder instead of a real-looking example value (e.g. "300gsm Matte"), so leaving them blank doesn't read as skipping a recommendation.

Delivery times are rendered as `h:mm AM/PM` everywhere they're shown to a human — order cards, the employee job card, the calendar, the TV board, and outgoing WhatsApp messages — via `formatDeliveryTime()` (`lib/utils/countdown.ts`). The one exception is the `<input type="time">` picker itself, which always needs a 24-hour `HH:mm` value; native time-input display (12h vs 24h) follows the device's own regional format setting, which isn't something a web page can override.

A follow-up mobile-layout bug in `order-form.tsx`'s Delivery section: `grid-cols-1 sm:grid-cols-2` correctly collapses to one explicit column below 640px, but a `col-span-2` field (Delivery Address, Map Location Link, Finishing, Assign To) still asked to span *two* columns — a plain, unconditional `grid-column: span 2` isn't gated behind `sm:`. With only one explicit column defined, the browser had to invent an implicit second column sized off content to satisfy the span, so those fields rendered as two uneven columns instead of stacking full-width. Fix: every such field uses `sm:col-span-2` instead of `col-span-2`, so the span only kicks in once the grid actually has two columns to span across. Caught via `getComputedStyle(grid).gridTemplateColumns` at a 390px viewport (returns multiple track sizes for a "single column" grid when this bug is present) — a screenshot alone reads as ambiguous at this width, so this is the reliable way to verify a responsive grid actually collapsed.

## Reports & Archive

`app/api/cron/month-end/route.ts` (CRON_SECRET-protected, intended to run once on the 1st of each month) closes out the previous month: orders sitting in `collected`/`delivered` become `completed` + `archived` — finally exercising the transition the status engine has modeled since Phase 5 — and a `monthly_statistics` row is generated (total/completed/delayed orders, orders per employee, avg completion time, most-used paper, most-requested material). `lib/reports/compute-monthly-stats.ts` holds that aggregation logic, shared between the cron (closed historical months) and `/reports`'s live "this month so far" card, so the two can't drift apart.

`/reports` (`lib/actions/reports.ts`, `components/manager/reports-client.tsx`) charts that history with recharts, plus CSV export. `/archive` lists everything the cron has archived, with search and a month filter.

`getOrders()` excludes `collected`/`delivered`/`completed` from the default (unfiltered) dashboard board — finished jobs would otherwise sit on the live board indefinitely, since nothing moves them to `archived` until the month-end cron runs. They still show up if the manager explicitly filters by one of those statuses. The counterpart, `getCompletedOrders()`, powers its own `/completed-orders` page (`components/manager/completed-orders-panel.tsx`, linked from the sidebar and a dashboard quick-action button next to Monthly Reports) — the same order cards, search, and pagination as the dashboard board, scoped to `archived = false` orders in those three statuses, so a manager can find a recently-finished order without paging through `/archive`. It started as a tab on `/reports` but was moved to its own page for one-click access from the dashboard. Both `getOrders` and `getCompletedOrders` share the row-enrichment logic (`buildOrderListItems` in `lib/actions/orders.ts`) so assignment/thumbnail/material-request lookups can't drift between the two views.

## Operations Control Center

Built on top of the Production Core infrastructure (Realtime, Audit Log, Status Engine) without new tracking tables — the Live Production Timeline and Activity Feed are both just filtered/formatted reads of `audit_logs`, and Manager Override is the sole deliberate exception that bypasses the Status Engine (with a required reason and an audit trail flagging it as such). Full module-by-module detail — Employee Workload, Production Calendar, the Operations Dashboard KPIs, Global Search, Bulk Actions, and the Diagnostics health check — is in `OPERATIONS.md`.

## Employee Management

`/employees` (`lib/actions/employees.ts`, `components/manager/employees-client.tsx`) is a full admin CRUD module, not just a roster view: create, edit (name/phone/role), reset password, and activate/deactivate, each Zod-validated (`lib/validation/employee.ts`) and audit-logged (`employee_created`/`employee_updated`/`employee_password_reset` — the password-reset action deliberately never carries password/hash material in its audit payload). `assertKeepsAnActiveAdmin` blocks any role change or deactivation that would leave zero active administrators, since nothing else in the app can recover from that state. Deactivating an employee blocks login immediately (`login()` has always gated on `employees.active`); it does **not** revoke an already-issued session cookie, which stays valid until its ~12h natural expiry — see the Known Gaps note below.

## Large Dataset Support

`getOrders()` (`lib/actions/orders.ts`) is page-based paginated — `.range()` + `{ count: "exact" }` in one round trip — rather than fetching every non-archived order unconditionally, which was the top scaling risk identified for shops running 1000+ active orders. `employeeId` filtering resolves the employee's assigned order IDs first and folds them into the same paginated query, so pagination math stays correct under every filter combination rather than post-filtering a page down to fewer rows than requested. `page` is `nuqs`-synced and resets to 1 on any other filter change. `getDashboardStats()` still runs one unbounded (but narrow, 4-column) query to compute the stat-card counts — a smaller instance of the same risk shape, deliberately left out of this pass; see `QA_REPORT_RC2.md`.

## Public Order Request Form

`/order-request` (`app/order-request/page.tsx`, `components/public/order-request-form.tsx`) is an unauthenticated, public page a manager can link to from WhatsApp so a customer can describe what they need printed in a form shaped like `order-form.tsx` — name, mobile, product, quantity, paper/size/finishing, additional items, pickup/delivery with date/time and address, attachments, notes. It's route-public by construction: `middleware.ts` protects routes via an explicit `MANAGER_ROUTES` allowlist, and `/order-request` (like `/tv`) simply isn't in it, so no middleware change was needed to expose it.

This first pass is intentionally UI-only — submitting shows a "Request received" confirmation, but nothing is written to the database and no order is created (`lib/validation/order-request.ts` validates client-side only). Turning a request into a real order is a deliberate follow-up (e.g. a manager-side review/approve queue), not built here, since accepting arbitrary public submissions straight into the live order board has trust/spam implications worth designing deliberately rather than wiring in as a byproduct of the form UI. A native in-chat WhatsApp Flow (rather than a web page reached via a WhatsApp-sent link) is also deferred.

## Employee Dashboard — compact card style, mobile-first

`JobCard` and `QueueCard` (`components/employee/`) were rebuilt to match the density of the manager dashboard's `OrderCard` — a small thumbnail next to the order number/customer/product instead of a large hero image, a compact `bg-muted/40` delivery chip, and a `text-[11px]` label / `text-sm` value spec grid, all using the same font scale as the manager side rather than the previous oversized `text-xl`/`text-lg` mix. `StatusActions` takes an optional `size` prop (`"lg"` by default for the manager's order detail drawer, `"default"` from `JobCard`) so the employee action row — status buttons, hand-off, Add Note, Request Material — stays compact instead of overflowing a phone-width card. `EmployeeTopBar`'s stats moved from an inline row that wrapped unpredictably at narrow widths to a `grid-cols-3` block, and `app/employee/layout.tsx` drops its padding from `p-6` to `p-4` below the `sm` breakpoint so cards get more usable width on a phone.

The Manager Notes block on `JobCard` switched from `bg-secondary/10`/`text-secondary` (the same dark blue used for order numbers, map links, and most other accents on the card) to `bg-warning/15`/`text-warning-foreground` (amber) — it was blending into every other blue element on the card rather than standing out as a note worth reading.

## Production Approval Gate

Every order now carries `orders.approved` (`0017_order_approval.sql`, `boolean not null default true`), toggled by a "Production Approval" switch on the order form (default **off** for a brand-new order — the admin has to deliberately flip it on, either at creation or later via Edit). The column defaults to `true` so it doesn't retroactively lock any order that existed before this migration; the form is what actually makes new orders start unapproved.

The gate applies to exactly one transition: an employee's "Start Production" tap (`new` → `in_progress`) on `QueueCard`. `updateEmployeeJobStatus` (`lib/actions/employee-jobs.ts`) checks `orders.approved` server-side right before calling `applyOrderStatusTransition` whenever the target is `in_progress` — the authoritative check, independent of what the UI shows. `QueueCard` mirrors it client-side: an unapproved job shows a "Wait for Admin Approval" banner instead of the Start Production button, so there's nothing to tap in the first place. Once an order is past `new`, later transitions (`waiting_materials` → `in_progress`, etc.) are never re-checked — the admin already implicitly signed off by letting it progress.

The admin's own "Start Production" click (`updateOrderStatus`, used from the order detail drawer) is deliberately **not** gated — an admin setting the approval flag has no reason to block themselves from acting on the same order. `duplicateOrder` always resets the copy to unapproved regardless of the original's state, since a duplicate is a fresh production job that should go through approval again. A `Pending Approval` badge (amber, `ShieldAlert` icon) surfaces on `OrderCard`, `order-list-view`, and the order detail drawer header whenever `status === "new" && !approved`, so a manager can spot what's still waiting without opening every order.

## Delivery Confirmation

Marking an order **Delivered** now requires an explicit confirm step in `StatusActions` (`components/orders/status-actions.tsx`) — clicking "Delivered" opens a dialog ("Confirm delivery… Only confirm once it's actually in the customer's hands") rather than firing the transition on the first tap. Every other status action is unchanged and still fires immediately; only `delivered` (`CONFIRM_REQUIRED`) is gated this way, since it's the one irreversible-from-here action a delivery driver could otherwise trigger by mistake. `StatusActions` is shared by both the employee job card and the manager's order detail drawer, so the confirm step applies everywhere the button appears. The Google Maps link on the delivery card (`job-card.tsx`, `order-detail-drawer.tsx`) was already a plain `<a target="_blank" rel="noreferrer">` with no shared click handler — opening it has never affected order status; nothing there needed to change.

## Job Card Status Badge

`JobCard` (`components/employee/job-card.tsx`) had no visible indicator of the order's *current* status — only the action buttons for what to do next. That reads as ambiguous once a multi-item order auto-advances past `in_progress`: the item checklist correctly lands it on `ready_delivery`/`ready_pickup` (verified — see the "auto-advances a delivery order..." test in `employee-jobs.test.ts`, which was missing coverage for the delivery branch until now, only the pickup one), but the card would then show a green "Delivered" button with nothing nearby saying the order is merely *ready* for delivery, not delivered yet. Fixed by adding the same `OrderStatusBadge` the manager dashboard already uses next to the Urgent badge, so the current stage is always visible and distinct from the next-step buttons below it. "Delivered" stays a button the delivery driver clicks later, once the order is actually in the customer's hands (and, per the Delivery Confirmation section above, requires an explicit confirm).

## Manager Dashboard Board View

`/dashboard`'s default view is now a TV-style status board (`components/manager/dashboard-board.tsx`), not a flat filtered grid — `ViewToggle` gained a third "board" option (`components/manager/view-toggle.tsx`) alongside the existing Card/List views, and it's the fallback when no `?view=` is set. `getDashboardBoard()` (`lib/actions/orders.ts`) fetches every in-flight order in one call (capped at 200, same tradeoff as `getDashboardStats`) and groups it by status into six sections: New, In Progress (folding in the rare `ready_internal_pickup` outsourced stage), Waiting for Materials, Ready for Pickup, Ready for Delivery, and Delivered Today. Search/Employee/Priority/Date filters still apply in board mode; the Status filter is hidden there (`OrderFilters`'s `hideStatus` prop) since the sections already are the status breakdown.

**Delivered Today** isn't a real status — it's `collected`/`delivered` orders (already excluded from the active board, same as `getOrders`) whose completing transition happened today, read from `order_status_history` filtered to the current Kuwait calendar day (`lib/utils/date.ts`'s `getTodayBoundsInKuwait` — Kuwait is UTC+3 with no DST, so a fixed offset is enough without pulling in a timezone library; using the server's own timezone would clear the section at the wrong hour for a Kuwait-based shop). Nothing is written or moved at midnight — it's purely a narrower read each time the board loads, so the section quietly stops including an order once the Kuwait day rolls over. The order's real record is unaffected and stays visible any time via Completed Orders / Archive.

**Quick status actions on the card itself**: `OrderCard` now accepts an optional `onQuickStatusChange` — when set, a ready_pickup/ready_delivery order shows a single compact "Collected"/"Delivered" button (via `StatusActions` with a new `only` filter prop, restricted to just those two terminal targets, and a new `"sm"` size) without opening the full detail drawer. This reuses the same confirm-dialog gating for Delivered as everywhere else `StatusActions` appears (see Delivery Confirmation above). Wired via `updateOrderStatus` — the same ungated admin path the detail drawer's status buttons already use — on both the board and the flat card grid.

## Twilio WhatsApp Delivery Status Tracking

`app/api/twilio/whatsapp/status/route.ts` — a webhook Twilio calls back on whenever a sent WhatsApp message's status changes (queued/accepted/sent/delivered/read/failed/undelivered), closing the loop `NOTIFICATIONS.md` previously documented as out of scope. Signature-verified against `TWILIO_AUTH_TOKEN` (rejects with 403 if invalid — the only real failure case; every other edge case, from a missing field to an unmatched `MessageSid`, is logged and still answered 200 so Twilio doesn't retry-storm over something a retry can't fix), it updates the originating `notification_logs` row — found via `provider_message_id`, the Twilio SID captured when the message was first sent — with the new `status` plus whichever of `delivered_at`/`read_at`/`failed_reason` applies. Full detail, including the exact production callback URL and how to configure it, is in `NOTIFICATIONS.md`'s "Delivery status callback" section.

## What's deferred

Email and SMS notification providers — only WhatsApp (via Twilio) is implemented, behind the same provider abstraction the other two will use (see `NOTIFICATIONS.md`). The **Notification Service**, **Audit Log**, and **Status Engine** built in the infrastructure phase are designed so both land as pure additions — no dashboard code changes required.

## Known gaps (not yet built, tracked here rather than silently)

- No persistent customer entity — customer info (including notification preferences) is denormalized per-order, not shared across a customer's orders. Deliberate, per "not an ERP/CRM"; means preferences are re-entered per order rather than remembered.
- Live Twilio delivery was not runtime-verified in this environment (sandbox network policy blocks direct third-party API calls) — see the Testing boundary in `NOTIFICATIONS.md`.
- The month-end cron has no scheduler wired up yet (e.g. Vercel Cron config) — the endpoint exists and works, but nothing calls it automatically until that's configured on deployment.
- ~~No persisted "pickup vs. delivery" field on an order~~ — added in RC3 as `orders.fulfillment_type`, chosen on the order form at creation. Employees no longer choose between "Ready for Pickup"/"Ready for Delivery" when marking a job done — `getEmployeeNextActions` (`types/domain.ts`) resolves the single correct one from the order's `fulfillmentType`. Operations KPIs and the Calendar still infer pickup/delivery from current status rather than reading the new column directly — that's an accuracy improvement left for a later pass, not required for this feature. See `OPERATIONS.md`.
- "Active Users" on the Diagnostics page is an approximation (distinct recent audit-log actors), not a real session count — there's no session-tracking table since auth is stateless JWT cookies. See `OPERATIONS.md`.
- No session revocation — deactivating an employee, resetting their password, or changing their role doesn't invalidate a JWT cookie they already hold; it stays valid until its ~12h natural expiry. Fixing this properly means either shortening session lifetime or adding server-side session tracking, a real architectural change rather than a quick patch. See `QA_REPORT_RC2.md`.
- ~~Multi-item orders (`order_items`) don't yet have independent per-item status~~ — items now get a per-item *readiness* checkbox that gates the order's overall completion (see "Per-item Readiness" above). Full per-item *status* (each item independently moving through `new`→…→`collected`/`delivered`, with its own Employee/TV dashboard card) is still one unit per order — that's a larger production-floor rework (Status Engine transition graph, TV Dashboard columns, per-item notifications) intentionally deferred to a follow-up pass.
- No automated tests yet for Employee Management — the mocked-Supabase pattern used for Order Creation/Material Requests (see `TESTING.md`) extends cleanly to it, just not built this pass.
- Live deployment has never been verified — the app has run in Demo Mode and against the real Supabase project only via MCP tools (SQL-level checks, never a live browser over real HTTPS) throughout every phase. As of RC2, a Netlify site and all production environment variables are provisioned and ready; the code deploy itself is what's outstanding. See `QA_REPORT_RC2.md` §2 for exactly what's left.
