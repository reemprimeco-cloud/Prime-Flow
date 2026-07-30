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

Stub-safe by the same convention as the rest of this project (Supabase MCP-only sandbox access, Demo Mode, etc.): with no `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN`, or with neither `TWILIO_MESSAGING_SERVICE_SID` nor `TWILIO_WHATSAPP_NUMBER`, configured, `send()` returns `{ status: "skipped", error: "Twilio credentials not configured" }` instead of throwing, so the rest of the pipeline (logging, audit trail, Notification Center) stays fully exercisable without live credentials. This is also why sending could not be runtime-verified inside this sandbox — see the Testing section.

**Two ways to send**, picked at send time — `messagingServiceSid` if `TWILIO_MESSAGING_SERVICE_SID` is set (Twilio picks the sender from that service's own Sender Pool; `from` is omitted entirely per Twilio's guidance), otherwise `from: TWILIO_WHATSAPP_NUMBER` directly. The Messaging Service path is preferred and wins if both are set. **A Messaging Service's Sender Pool needs an actual WhatsApp-capable sender added** (Console → Messaging → Services → your service → Senders) — an SMS-only Long Code number sitting in that pool does not make the service WhatsApp-capable, it'll just fail/skip WhatsApp sends. Add either the WhatsApp Sandbox number (dev) or an approved WhatsApp Business Sender (production) as a Sender on the service.

Twilio's REST API accepts a message and returns a SID (`message.sid`, stored as `notification_logs.provider_message_id`); final delivery status (delivered/read/failed) arrives later via a status-callback webhook — see "Delivery status callback" below for how that's wired up. `send()` passes `statusCallback: TWILIO_STATUS_CALLBACK_URL` on every message when that env var is set, so Twilio knows where to report back; unset, messages still send, they just never get a delivery update past "sent."

## Delivery status callback

`app/api/twilio/whatsapp/status/route.ts` — the receiving end of the SID above. Twilio POSTs here every time a message's status changes (`queued → accepted → sent → delivered → read`, or `failed`/`undelivered`), and this route updates the matching `notification_logs` row by `provider_message_id`.

**Configure in the Twilio console** (Messaging Service, or the WhatsApp Sender's own settings → Status Callback URL) — or set `TWILIO_STATUS_CALLBACK_URL` and the app sets it per-message itself, which also works without touching the console at all:

```
https://primeflowboard.netlify.app/api/twilio/whatsapp/status
```

Request handling, in order:
1. **Signature verification** — `twilio.validateRequest(TWILIO_AUTH_TOKEN, signature, url, params)` against the `X-Twilio-Signature` header. Fails closed: no `TWILIO_AUTH_TOKEN`, no/invalid signature → `403`, nothing is written. This is the actual security boundary on this route (there's no other auth — it can't require a login, Twilio is the caller), so unlike everything below it, a signature failure is a real rejection, not a "log and 200" case.
2. **Field extraction** — `MessageSid`, `MessageStatus`, `ErrorCode`, `ErrorMessage`, `To`, `From` from the `application/x-www-form-urlencoded` body.
3. **Everything past this point is "log and return 200 anyway,"** deliberately — Twilio retries a webhook that doesn't answer 2xx, and none of these get better on a retry: a missing `MessageSid`/`MessageStatus`, a `MessageStatus` outside the 7 recognized values, or a SID with no matching row (expected for any send made before `TWILIO_STATUS_CALLBACK_URL` was configured).
4. **The update itself** sets `status` to the mapped value, always overwrites `provider_response` with the callback's payload (superseding the original "accepted" response from send time — the terminal delivery state matters more than the initial acceptance receipt), and conditionally sets exactly one more field: `delivered_at` (status `delivered`), `read_at` (status `read`), or `failed_reason` (status `failed`/`undelivered`, preferring Twilio's `ErrorMessage`, falling back to `` `Twilio error ${ErrorCode}` ``).
5. Broadcasts `notification.status_updated` on the `notifications` Realtime channel on a successful match, so the Notification Center updates live — same channel the resend button and initial sends already broadcast on indirectly (via the query invalidation it's already subscribed to).

Runs on the Node.js runtime (Route Handlers default to it, pinned explicitly in the file) since `twilio.validateRequest` needs Node's `crypto` module — this is not Edge-compatible, and `@netlify/plugin-nextjs` deploys it as a standard Netlify Function accordingly.

A resend (manual, from the Notification Center, or the automatic retry cron) creates a brand-new Twilio message with its own SID — `resendNotification()` overwrites `provider_message_id` with it and clears `delivered_at`/`read_at`/`failed_reason`, since those described the previous attempt, not the one now in flight.

## Message templates

`lib/notifications/templates.ts` holds every message, in English and Arabic, as small functions of `TemplateVariables` (`customerName`, `employeeName`, `orderNumber`, `productName`, `deliveryDate`, `deliveryTime`, `pickupLocation`, `pickupHours`, `companyName`, `mapsLink`, `noteText`, `statusLabel`; `trackingLink` is reserved but unused — no customer-facing tracking page exists yet). `companyName`/`pickupLocation`/`pickupHours` default from the `COMPANY_NAME`/`PICKUP_LOCATION`/`PICKUP_HOURS` env vars since there's one shop, not a per-order field. `pickupHours` only appears in `order_ready_for_pickup`, e.g. "ready for pickup at Prime Printing Co. — Shuwaikh Industrial, Kuwait, open 9:00 AM – 5:00 PM."

The Arabic copy is standard business MSA, not reviewed by a native speaker — treat it as a solid starting point to have proofread before real customers see it, not final copy.

## What triggers a notification

Customer-facing, gated by `whatsappEnabled` **and** the order's `notification_preferences`:

- **`notifyOrderCreated`** — `createOrder`. Template `order_received`, gated off by default — see Notification Preferences.
- **`notifyOrderStatusChanged`** — `updateEmployeeJobStatus`, after the status engine validates the transition. Maps `toStatus` to a template: `in_progress → order_in_production`, `ready_pickup → order_ready_for_pickup`, `ready_delivery → order_out_for_delivery`, `collected → order_collected_confirmation` (gated off by default, same preference as `delivered`), `delivered → order_delivered_confirmation` (gated off by default). Other statuses (`waiting_materials`) stay silent. In practice, with the default preferences, this means a customer gets exactly two WhatsApp messages per order: "in production" and "ready for pickup/delivery."
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

`orders.notification_preferences` (jsonb) and `orders.preferred_channel` extend the existing `whatsapp_enabled`/`preferred_language` columns — see `lib/notifications/constants.ts` for the shape and defaults. The Order Form has no per-type toggle UI; `DEFAULT_NOTIFICATION_PREFERENCES` is applied unconditionally to every order as a fixed business rule, not a user choice: `order_in_production` and (`ready_for_pickup` or `out_for_delivery`, whichever applies to that order) on — the customer's two updates — with `order_received`, `order_collected_confirmation`, and `order_delivered_confirmation` all off, since none of those tell the customer anything they don't already know (they just placed the order, or they already have it in hand).

These are **per-order**, not per-customer — this project has no persistent customer entity by design (not an ERP/CRM, see `ARCHITECTURE.md`), so preferences are captured at order-creation time the same way `whatsapp_enabled` always has been. `preferredChannel` is stored per order too; only `"whatsapp"` currently routes to a real provider, but the field is real and ready for Email/SMS.

## What gets written

Every dispatch attempt writes one `notification_logs` row: `status`, `template_name`, `channel`, `body` (the fully-rendered message — stored so a later resend doesn't need to reconstruct template variables), `phone`, `receiver_type`, `language`, `error`, `provider_response`, `provider_message_id`, `last_attempted_at`. On success it also writes one `audit_logs` row with action `notification_sent` (see `AUDIT_LOG.md`). The delivery-status callback (above) later updates `status`/`provider_response` again on the same row, plus `delivered_at`/`read_at`/`failed_reason` depending on what Twilio reports.

## Retry (exponential backoff)

`app/api/cron/retry-notifications/route.ts` — GET, protected by `Authorization: Bearer $CRON_SECRET` (fails closed if the secret isn't set). Intended to run on a schedule (e.g. Vercel Cron, hourly); not meant to be called by a person.

Each sweep selects `notification_logs` rows with `status` in `('failed', 'undelivered')` and `retry_count < 5`, keeps the ones where `now() >= last_attempted_at + min(2^retry_count, 1440) minutes`, and calls `resendNotification()` on each — same function the manager's one-click "Resend" button calls (`manualResendNotification` in `lib/actions/notifications.ts`, `requireAdmin`-guarded). Every attempt, automatic or manual, updates the *same* `notification_logs` row: `retry_count` increments, `status`/`error`/`provider_response`/`provider_message_id`/`last_attempted_at` update (and `delivered_at`/`read_at`/`failed_reason` clear — they described the attempt being replaced, not this new one). `skipped` rows (e.g. logged before Twilio was configured) are resendable through the manual button but aren't picked up by the automatic sweep, which only targets failed/undelivered.

## Notification Center

`/notifications` (`components/manager/notification-center-client.tsx`) — realtime-updated (subscribes to the `notifications` broadcast channel, plus a 30s poll), with tabs (All / Sent / Pending / Failed / Retry Queue — the last being failed rows still under the 5-attempt cap) and filters (free-text search across recipient/phone/order #, receiver type, channel, date). `recipientName` is resolved server-side in `listNotificationLogs` — the customer's name via `orders.customer_name` when `order_id` is set, or an employee's name via matching `employees.phone`.

## Environment variables

```
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_MESSAGING_SERVICE_SID= # preferred — MG... SID; needs a WhatsApp sender in its Sender Pool
TWILIO_WHATSAPP_NUMBER=       # alternative to the above — e.g. +14155238886, ignored if the SID is set
TWILIO_STATUS_CALLBACK_URL=   # this app's own URL for app/api/twilio/whatsapp/status — see above
CRON_SECRET=                  # shared secret for /api/cron/* routes
COMPANY_NAME=                 # optional, defaults to "Prime Printing Co."
PICKUP_LOCATION=              # optional, defaults to a placeholder address
PICKUP_HOURS=                 # optional, defaults to "9:00 AM – 5:00 PM"
```

Get `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN` from the Twilio Console dashboard. For development, Twilio's WhatsApp Sandbox works without business verification — add it as a Sender (Messaging Service path) or use its number directly as `TWILIO_WHATSAPP_NUMBER`. Production sending to arbitrary numbers requires a WhatsApp Business-verified sender, which is a multi-day Meta approval process outside this app's control. Leave `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN` unset, or leave both sending options unset, to run stub-safe (every send logs as `skipped`, nothing else changes).

## Testing boundary

This sandbox's network policy allows Supabase access only via MCP tools, not direct app-level HTTPS to third-party APIs — so live Twilio sending was **not** runtime-verified here, the same limitation documented for Supabase itself in `ARCHITECTURE.md`. Verified by static analysis (typecheck/lint/build) and in a real browser via Demo Mode: the unconfigured-credentials path (`skipped` status), the full pipeline end-to-end (trigger → log → audit trail → Notification Center display → resend button), and the Order Form's preference UI. Actually sending a WhatsApp message through Twilio needs verification on a real deployment with real credentials.

The status-callback route (`app/api/twilio/whatsapp/status`) doesn't have that limitation for its core logic, since signature verification is pure crypto with no network call — `route.test.ts` computes real signatures with Twilio's own signing algorithm (`getExpectedTwilioSignature`, exported by the `twilio` package) and drives the handler through valid/invalid signatures, all 7 recognized statuses, missing fields, unrecognized statuses, and no-matching-row, against a mocked Supabase client. What that suite can't cover is Twilio's real infrastructure actually reaching the deployed URL — confirming that end-to-end needs a live send with `TWILIO_STATUS_CALLBACK_URL` configured and the console pointed at the same URL, then checking `notification_logs` for the row updating.

## Adding Email or SMS

1. Implement `NotificationProvider` in a new file under `lib/notifications/providers/`.
2. Register it in `PROVIDERS` in `lib/notifications/service.ts`.
3. Add the option to the Order Form's "Preferred Channel" select (currently Email/SMS are shown disabled).
4. Nothing in `createOrder`, `updateEmployeeJobStatus`, `approveMaterialRequest`, or any dashboard component changes.
