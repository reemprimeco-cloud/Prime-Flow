# Notification service

`lib/notifications/service.ts` is the only thing Server Actions call to notify a customer. Dashboards and other Server Actions never touch a provider, a phone number, or `notification_logs` directly — the point of this layer is that swapping in a real WhatsApp/SMS/email provider later means changing one file, not every mutation that might want to notify someone.

## Shape

```ts
interface NotificationProvider {
  readonly channel: "whatsapp" | "browser" | "email" | "sms";
  send(payload: NotificationPayload): Promise<NotificationResult>;
}
```

`ACTIVE_PROVIDERS` is an array of `NotificationProvider`s the service dispatches to. Today it holds exactly one: `LogOnlyProvider`, which never calls a real API and always resolves `{ status: "skipped" }`. This is the same "stub-safe" design used everywhere in this project for pieces that need live third-party credentials this environment can't reach — the pipeline is fully wired end-to-end (trigger → provider → `notification_logs` row → audit trail) and ready for a real Twilio provider to be dropped into `ACTIVE_PROVIDERS` without touching any call site.

## What triggers a notification

Two semantic entry points, called from Server Actions — never a raw `dispatch()`:

- **`notifyOrderCreated(order, actorId, actorName)`** — called from `createOrder`. No-ops unless `whatsappEnabled` and `customerMobile` are set.
- **`notifyOrderStatusChanged({ ..., fromStatus, toStatus, actorId, actorName })`** — called from `updateEmployeeJobStatus`, after the transition is validated by the status engine (see `STATUS_ENGINE.md`) and the DB write succeeds.

Status changes are filtered through `CUSTOMER_NOTIFIABLE_STATUSES` — only `ready_pickup`, `ready_delivery`, `collected`, `delivered` reach the customer. Internal workflow steps (`in_progress`, `waiting_materials`) stay silent; a customer doesn't need a WhatsApp message every time production pauses for materials.

## What gets written

Every dispatched notification writes one row to `notification_logs` (`status`, `template_name`, `phone`, `receiver_type`, `language`, `error`) and, on success, one `audit_logs` row with action `notification_sent` (see `AUDIT_LOG.md`) — so "was the customer told?" is answerable from either table.

`notification_logs.phone` is `NOT NULL` in the schema, which is why the service only ever dispatches when a mobile number is actually present — there's no "internal" notification type recorded here (that's what the Audit Log is for).

## Adding a real provider

1. Implement `NotificationProvider` (e.g. `TwilioWhatsAppProvider`) in a new file under `lib/notifications/`.
2. Swap or add it in `ACTIVE_PROVIDERS`.
3. Nothing in `createOrder`, `updateEmployeeJobStatus`, or any dashboard component changes.
