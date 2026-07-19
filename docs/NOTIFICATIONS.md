# Notification service

`lib/notifications/service.ts` is the only thing Server Actions call to notify a customer or employee. Dashboards and other Server Actions never touch a provider, a phone number, a message template, or `notification_logs` directly — the point of this layer is that adding Email or SMS later means implementing one interface and registering it, not touching every mutation that might want to notify someone.

## Shape

```ts
interface NotificationProvider {
  readonly channel: NotificationChannel; // "whatsapp" | "email" | "sms"
  send(payload: NotificationPayload): Promise<NotificationResult>;
}

const PROVIDERS: Partial<Record<NotificationChannel, NotificationProvider>> = {
  whatsapp: new TwilioWhatsAppProvider(),
};
```

`dispatch()` looks up `PROVIDERS[payload.channel]`. Only `"whatsapp"` is implemented — per this phase's scope, Email and SMS are deliberately not built yet. Routing to an unimplemented channel doesn't throw or silently drop the attempt: it still writes a `notification_logs` row with `status: "skipped"` and a `"channel isn't implemented yet"` error, so the attempt is visible in the Notification Center rather than disappearing.

## Twilio WhatsApp provider

`lib/notifications/providers/twilio-whatsapp.ts` is the **only** file in this project that imports the `twilio` package or reads `TWILIO_*` env vars — both `import "server-only"`-guarded, so credentials can never reach client code even by accident. See "Environment variables" below for setup.

Stub-safe by the same convention as the rest of this project (Supabase MCP-only sandbox access, Demo Mode, etc.): with no `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_WHATSAPP_NUMBER` configured, `send()` returns `{ status: "skipped", error: "Twilio credentials not configured" }` instead of throwing, so the rest of the pipeline (logging, audit trail, Notification Center) stays fully exercisable without live credentials. This is also why sending could not be runtime-verified inside this sandbox — see the Testing section.

Twilio's REST API accepts a message and returns a SID; final delivery status (delivered/read/failed) arrives later via a status-callback webhook, which is out of scope for this phase. What's recorded today reflects "Twilio accepted the send," not confirmed delivery — `provider_response` stores the SID and Twilio's own `status` field for whatever visibility that gives.

## Message templates

`lib/notifications/templates.ts` holds every message, in English and Arabic, as small functions of `TemplateVariables` (`customerName`, `employeeName`, `orderNumber`, `productName`, `deliveryDate`, `deliveryTime`, `pickupLocation`, `companyName`, `mapsLink`, `noteText`, `statusLabel`; `trackingLink` is reserved but unused — no customer-facing tracking page exists yet). `companyName`/`pickupLocation` default from the `COMPANY_NAME`/`PICKUP_LOCATION` env vars since there's one shop, not a per-order field.

The Arabic copy is standard business MSA, not reviewed by a native speaker — treat it as a solid starting point to have proofread before real customers see it, not final copy.

## What triggers a notification

Customer-facing, gated by `whatsappEnabled` **and** the order's `notification_preferences`:

- **`notifyOrderCreated`** — `createOrder`. Template `order_received`.
- **`notifyOrderStatusChanged`** — `updateEmployeeJobStatus`, after the status engine validates the transition. Maps `toStatus` to a template: `in_progress → order_in_production` (off by default — see Notification Preferences), `ready_pickup → order_ready_for_pickup`, `ready_delivery → order_out_for_delivery`, `collected → order_collected_confirmation` (gated by the same preference as pickup), `delivered → order_delivered_confirmation`. Other statuses (`waiting_materials`) stay silent.
- **`notifyOrderMovedBackToProduction`** — `updateEmployeeJobStatus`, specifically when a job is reverted from `ready_pickup`/`ready_delivery` back to `in_progress` (an employee correcting a job marked ready by mistake — see `STATUS_ENGINE.md`). Template `order_returned_to_production`. Deliberately **not** gated by `notification_preferences` like every other status message above: those toggles opt a customer into routine updates, but this corrects a "ready" message that already went out, so it's sent regardless of whether the customer opted into `order_in_production` updates. Still respects `whatsappEnabled`.

Employee-facing, always WhatsApp, no preference gating (staff, not customers), always English (employees have no stored language preference in this schema):

- **`notifyEmployeeJobAssigned`** — `createOrder`, and `updateOrder` when employees are added with no removals in the same edit.
- **`notifyEmployeeJobReassigned`** — `updateOrder`, when employees are both removed and added in the same edit (the adds are read as filling a vacated slot).
- **`notifyEmployeeHighPriorityAssigned`** — `createOrder` / `updateOrder`, takes precedence over assigned/reassigned when `priority === "urgent"`.
- **`notifyEmployeeJobCancelled`** — `deleteOrder`, for every employee who was assigned. Fires *after* the delete succeeds, with `orderId: null` in the log row — the order no longer exists, so the FK can't reference it; `orderNumber`/`product` still reach the message via the rendered `body`.
- **`notifyEmployeeMaterialApproved`** / **`notifyEmployeeMaterialPurchaseNeeded`** — `approveMaterialRequest`, only when the request is tied to an order. The former goes to the requester; the latter additionally goes to every active `role='delivery'` employee, since they're the ones who go buy it.
- **`notifyEmployeeInternalPickupReady`** / **`notifyEmployeeOutForDeliveryStaff`** — `updateEmployeeJobStatus`, via `notifyDeliveryStaff` (`lib/actions/employee-jobs.ts`), to every active `role='delivery'` employee (e.g. Naresh) — auto-assigning them to the order first so it shows up on their dashboard. Fires on `ready_internal_pickup` (go collect from the outsourced worker) and `ready_delivery` (go deliver to the customer, alongside the customer's own notification). The `ready_delivery` message includes a clickable Google Maps link built from `orders.delivery_address` when the manager entered one (`mapsLink` template var, `lib/utils/maps.ts`).
- **`notifyEmployeeJobReadyForYou`** — `handOffJob`, to the next employee in a sequential hand-off chain once the person before them clicks "Ready for Next" (see `ARCHITECTURE.md`'s Sequential Employee Hand-off section).
- **`notifyAdminOrderNoteAdded`** / **`notifyAdminOrderStatusChanged`** — `addJobNote` / `updateEmployeeJobStatus`, to every active `role='admin'` employee, so the manager doesn't have to be watching the dashboard to know an employee added a floor note or moved an order's status. Admins aren't tracked via `order_assignments` (they already see every order), so this is a plain broadcast to the role via `notifyAdmins` rather than an assignment-based lookup.

## Notification preferences

`orders.notification_preferences` (jsonb) and `orders.preferred_channel` extend the existing `whatsapp_enabled`/`preferred_language` columns — see `lib/notifications/constants.ts` for the shape and defaults (`order_received`, `ready_for_pickup`, `out_for_delivery`, `delivered` on by default; `order_in_production` off, since most customers don't need a message the moment production starts). Editable per-order in the Order Form's "Notifications" section.

These are **per-order**, not per-customer — this project has no persistent customer entity by design (not an ERP/CRM, see `ARCHITECTURE.md`), so preferences are captured at order-creation time the same way `whatsapp_enabled` always has been. `preferredChannel` is stored per order too; only `"whatsapp"` currently routes to a real provider, but the field is real and ready for Email/SMS.

## What gets written

Every dispatch attempt writes one `notification_logs` row: `status`, `template_name`, `channel`, `body` (the fully-rendered message — stored so a later resend doesn't need to reconstruct template variables), `phone`, `receiver_type`, `language`, `error`, `provider_response`, `last_attempted_at`. On success it also writes one `audit_logs` row with action `notification_sent` (see `AUDIT_LOG.md`).

## Retry (exponential backoff)

`app/api/cron/retry-notifications/route.ts` — GET, protected by `Authorization: Bearer $CRON_SECRET` (fails closed if the secret isn't set). Intended to run on a schedule (e.g. Vercel Cron, hourly); not meant to be called by a person.

Each sweep selects `notification_logs` rows with `status = 'failed'` and `retry_count < 5`, keeps the ones where `now() >= last_attempted_at + min(2^retry_count, 1440) minutes`, and calls `resendNotification()` on each — same function the manager's one-click "Resend" button calls (`manualResendNotification` in `lib/actions/notifications.ts`, `requireAdmin`-guarded). Every attempt, automatic or manual, updates the *same* `notification_logs` row: `retry_count` increments, `status`/`error`/`provider_response`/`last_attempted_at` update. `skipped` rows (e.g. logged before Twilio was configured) are resendable through the manual button but aren't picked up by the automatic sweep, which only targets `failed`.

## Notification Center

`/notifications` (`components/manager/notification-center-client.tsx`) — realtime-updated (subscribes to the `notifications` broadcast channel, plus a 30s poll), with tabs (All / Sent / Pending / Failed / Retry Queue — the last being failed rows still under the 5-attempt cap) and filters (free-text search across recipient/phone/order #, receiver type, channel, date). `recipientName` is resolved server-side in `listNotificationLogs` — the customer's name via `orders.customer_name` when `order_id` is set, or an employee's name via matching `employees.phone`.

## Environment variables

```
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_NUMBER=      # e.g. +14155238886 — the WhatsApp-enabled Twilio number
CRON_SECRET=                 # shared secret for /api/cron/* routes
COMPANY_NAME=                # optional, defaults to "Prime Printing Co."
PICKUP_LOCATION=             # optional, defaults to a placeholder address
```

Get `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN` from the Twilio Console dashboard. For development, Twilio's WhatsApp Sandbox works without business verification — join the sandbox from the Console and use its sandbox number as `TWILIO_WHATSAPP_NUMBER`. Production sending to arbitrary numbers requires a WhatsApp Business-verified sender, which is a multi-day Meta approval process outside this app's control. Leave all three unset to run stub-safe (every send logs as `skipped`, nothing else changes).

## Testing boundary

This sandbox's network policy allows Supabase access only via MCP tools, not direct app-level HTTPS to third-party APIs — so live Twilio sending was **not** runtime-verified here, the same limitation documented for Supabase itself in `ARCHITECTURE.md`. Verified by static analysis (typecheck/lint/build) and in a real browser via Demo Mode: the unconfigured-credentials path (`skipped` status), the full pipeline end-to-end (trigger → log → audit trail → Notification Center display → resend button), and the Order Form's preference UI. Actually sending a WhatsApp message through Twilio needs verification on a real deployment with real credentials.

## Adding Email or SMS

1. Implement `NotificationProvider` in a new file under `lib/notifications/providers/`.
2. Register it in `PROVIDERS` in `lib/notifications/service.ts`.
3. Add the option to the Order Form's "Preferred Channel" select (currently Email/SMS are shown disabled).
4. Nothing in `createOrder`, `updateEmployeeJobStatus`, `approveMaterialRequest`, or any dashboard component changes.
