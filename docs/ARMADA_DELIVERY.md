# Armada Delivery Integration

Lets whoever marks a `delivery`-fulfillment order ready choose, right at that
moment, whether it's handed to in-house delivery staff (e.g. Naresh —
auto-assigned and notified, the existing default) or dispatched to
[Armada](https://armadadelivery.com)'s courier API. The choice is deliberately
**not** made earlier at order-creation time — it's asked via a "Who's
delivering this?" prompt exactly when the order goes `ready_delivery`, since
that's the first point the answer is actually known, and it can genuinely
vary order to order.

## How it works

1. Someone marks a delivery-fulfillment order ready:
   - **Single-item order**: clicking the "Ready for Delivery" button
     (`components/orders/status-actions.tsx`, used by both the employee job
     card and the manager order detail drawer) pops the "Who's delivering
     this?" choice (`components/orders/delivery-provider-dialog.tsx`) before
     the transition fires.
   - **Multi-item order**: this transition normally auto-fires the moment
     the last item's readiness checkbox is ticked, with no button click to
     hang a prompt on — so the same choice pops there instead, right before
     that last checkbox actually commits
     (`components/employee/item-readiness-dialog.tsx`).
2. Whichever provider is chosen is persisted onto the order
   (`orders.delivery_provider`) in the same update as the status flip, and
   the single status-transition path (`applyOrderStatusTransition` in
   `lib/actions/status-transition.ts`) acts on it immediately:
   - **`armada`**: calls `dispatchArmadaDelivery` (`lib/armada/dispatch.ts`),
     which creates the delivery via Armada's API and stores the result
     (`armada_delivery_code`, `armada_tracking_link`, `armada_delivery_fee`)
     on the order. If Armada can't be reached or isn't configured, it falls
     back to the internal-staff notification below rather than silently
     leaving the order undelivered, and logs `armada_delivery_dispatch_failed`
     to the audit trail.
   - **`internal`** (default, unchanged behavior): notifies every active
     `delivery`-role employee and puts the job on their dashboard, exactly
     as before this integration existed.
3. Armada calls back `POST /api/webhooks/armada` as the delivery progresses
   (driver assigned, en route, completed, etc.) — see
   `app/api/webhooks/armada/route.ts`. Every callback updates
   `armada_delivery_status`/`armada_driver_name`/`armada_driver_phone`/
   `armada_tracking_link` on the order; only `orderStatus: "completed"`
   drives an actual Prime Flow status change, from `ready_delivery` to
   `delivered` (a transition already legal in `lib/status/engine.ts` —
   nothing new was added to the `order_status` enum for this).
4. The order detail drawer (`components/orders/order-detail-drawer.tsx`)
   shows the current Armada status, tracking link, and driver info once
   dispatched, with **Dispatch to Armada** (retry after a failed
   auto-dispatch) and **Cancel Armada Delivery** actions
   (`lib/actions/armada.ts`).

## Setup

1. **Env vars** (see `.env.local.example` / `docs/ENVIRONMENT_VARIABLES.md`):
   ```
   ARMADA_API_KEY=<from Armada dashboard, "Show secret">
   ARMADA_WEBHOOK_KEY=<any random 12-32 char string you generate — NOT from Armada>
   ARMADA_ENV=production
   ```
2. **Register the webhook URL** in the Armada dashboard → Automated Ordering
   → your key → "Order update webhook" field:
   ```
   https://<your-prime-flow-domain>/api/webhooks/armada
   ```
   Check all 5 event boxes: Accepted, En_route, Completed, Failed, Canceled.
   Click **Save changes**, then **Send delivery test** to confirm it reaches
   this app (should return a 200).
3. Run the `0021_armada_delivery.sql` migration against your Supabase
   project (adds `delivery_provider` and the `armada_*` columns to `orders`).

Leaving either env var blank doesn't break anything else in the app — every
order set to the Armada provider just falls back to the internal-staff
notification path when it hits `ready_delivery`, same as if Armada were
temporarily down.

## Address handling

Armada computes its km-based delivery fee from a **structured Kuwait
address** — area, block, street, and building number, with the shipping
country fixed to Kuwait — not from a free-text address. This was confirmed
directly by an Armada integration engineer, who specified the following as
required to get accurate pricing/dispatch: `_shipping_block`,
`_shipping_street`, `_shipping_building_number`, and `shipping.country` =
`"Kuwait"`. That message described the field names for Armada's WooCommerce
plugin (order meta keys) — a different integration surface than this app's
direct REST client — so `lib/armada/client.ts` adapts them to this API's
existing camelCase convention, nested under a `shipping` object
(`{ country: "Kuwait", block, street, buildingNumber }`). **This exact REST
payload shape hasn't been independently confirmed against Armada's REST API
docs** (`docs.armadadelivery.com` is unreachable from this project's usual
dev environment) — recommend one live test dispatch to confirm before
relying on it for real pricing.

Prime Flow collects these four fields (`delivery_area`, `delivery_block`,
`delivery_street`, `delivery_building_number` — see
`0025_armada_structured_address.sql`) directly from whoever creates the
order — the customer on the public order-request form
(`components/public/order-request-form.tsx`, required there once "Delivery"
is selected) or staff on the internal order form
(`components/orders/order-form.tsx`) — so a delivery order already has
everything `dispatchArmadaDelivery` needs by the time it reaches
`ready_delivery`, with no manual re-entry. The existing free-text
`delivery_address` and `delivery_map_link` fields stay too, for human
readers (drivers, staff) and as a fallback.

`dispatchArmadaDelivery` (`lib/armada/dispatch.ts`) picks a source in this
order:

1. **Structured address** (block + street + buildingNumber all present) —
   sent as Armada's `shipping` object, which is what it actually prices
   from. Always preferred when available.
2. **Map pin** — if `delivery_map_link` is a pin-share link containing
   `@lat,lng` or `?q=lat,lng` (the common Google Maps "Share > Copy Link"
   formats), `parseLatLngFromMapsLink` (`lib/armada/client.ts`) extracts
   real coordinates and sends those instead.
3. **Free-text fallback** — for an order created before this structured
   address existed, the whole free-text `delivery_address` is sent as
   Armada's single `area` field — a best-effort fallback, not a structured
   Kuwait address. Expect Armada's driver app to need the instructions text
   to actually find the building in this case.

Order notes are always sent as `instructions`, regardless of which address
source is used.

## Payment

Every dispatch is sent as `paymentType: "paid"`. Prime Flow doesn't
currently track whether an order is cash-on-delivery, so there's nothing to
populate Armada's `amount` field with for a `"cash"` delivery. If Prime Flow
later adds a payment-collected-on-delivery flag to the order model, wire it
into `dispatchArmadaDelivery` in `lib/armada/dispatch.ts`.

## Status mapping

Armada's own delivery status is stored as-is in `armada_delivery_status`
rather than mapped onto Prime Flow's `orders.status` — only `completed`
drives a real status transition:

| Armada `orderStatus` | Meaning |
|---|---|
| `pending` | waiting for a driver |
| `dispatched` | driver heading to the shop |
| `waiting_pack` | driver at the shop, waiting for the package |
| `en_route` | picked up, heading to the customer |
| `completed` | delivered — Prime Flow order moves `ready_delivery` → `delivered` |
| `canceled` | canceled on Armada's end |
| `failed` | no driver found |

## Not built here

- Customer WhatsApp updates as the Armada delivery progresses (driver
  assigned, en route) — today only the existing "order ready for delivery"
  and "delivered" notifications fire, both already part of the normal
  status-transition flow. Wiring intermediate Armada states into
  `lib/notifications/service.ts` would need new templates in both English
  and Arabic (see `docs/NOTIFICATIONS.md`) and is a reasonable follow-up.
- A cash-on-delivery amount, per the Payment note above.
