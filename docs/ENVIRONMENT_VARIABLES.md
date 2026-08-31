# Environment variables

Every variable below lives in `.env.local` for local development (see `.env.local.example`) and must be set as real secrets in whatever hosting platform runs production (e.g. Vercel Project Settings → Environment Variables). None of these belong in git.

## Required

| Variable | Where it's used | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Server + browser | Supabase project URL. Public by design — it's just an endpoint, not a secret. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser only | Used exclusively to open Realtime Broadcast channels (`lib/supabase/client.ts`). The browser never queries Postgres directly, so this key needs no table grants — RLS is enabled with zero policies everywhere (see `ARCHITECTURE.md`). |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Full-access key used by every Server Action/Server Component (`lib/supabase/server.ts`). **Never** reference this from a Client Component or expose it in any API response — it bypasses RLS entirely. |
| `SESSION_SECRET` | Server only | HMAC signing key for the login JWT (`lib/auth/session.ts`). Generate with `openssl rand -base64 32`. Rotating it invalidates every active session (forces re-login) — that's a legitimate way to force a global logout, not a bug. |
| `CRON_SECRET` | Server only | Shared secret required in `Authorization: Bearer <value>` for `/api/cron/month-end` and `/api/cron/retry-notifications`. **Both routes fail closed if this is unset** — they return 401 rather than silently allowing unauthenticated access. Generate with `openssl rand -base64 24` or similar. |

## Optional — stub-safe if blank

| Variable | Where it's used | Notes |
|---|---|---|
| `TWILIO_ACCOUNT_SID` | Server only | See `NOTIFICATIONS.md` for full Twilio setup (including the free WhatsApp Sandbox for development). |
| `TWILIO_AUTH_TOKEN` | Server only | Never logged, never returned in any Server Action response. Also the secret the status-callback webhook uses to verify Twilio's request signature — see below. |
| `TWILIO_MESSAGING_SERVICE_SID` | Server only | Preferred sending method — a Messaging Service SID (`MG...`). Twilio picks the sender from the service's own Sender Pool, which **must have a WhatsApp-capable sender added** (Console → Messaging → Services → your service → Senders); an SMS-only Long Code sender in that pool does not enable WhatsApp. Wins over `TWILIO_WHATSAPP_NUMBER` if both are set. |
| `TWILIO_WHATSAPP_NUMBER` | Server only | Simpler alternative to a Messaging Service — a single Twilio WhatsApp-enabled sender number, e.g. `whatsapp:+14155238886`. Ignored if `TWILIO_MESSAGING_SERVICE_SID` is also set. |
| `TWILIO_TEMPLATE_JOB_ASSIGNED_SID`, `TWILIO_TEMPLATE_ORDER_IN_PRODUCTION_SID`, `TWILIO_TEMPLATE_ORDER_READY_FOR_PICKUP_SID`, `TWILIO_TEMPLATE_ORDER_OUT_FOR_DELIVERY_SID`, `TWILIO_TEMPLATE_ADMIN_ORDER_STATUS_CHANGED_SID` | Server only | Each is an approved WhatsApp Message Template's Content SID (`HX...`, Console → Messaging → Content Editor). These bypass the 24h customer-service window that freeform `body` messages are subject to — see `NOTIFICATIONS.md`. Independent and optional: a template only takes effect for its one corresponding notification once its SID is set; every other notification keeps sending as freeform text until its own SID is added. Twilio rejects a send with that SID if Meta hasn't approved it yet — surfaces as a normal `failed` row, same as any other Twilio error. |
| `TWILIO_STATUS_CALLBACK_URL` | Server only | This app's own production URL for `app/api/twilio/whatsapp/status` — e.g. `https://primeflowboard.netlify.app/api/twilio/whatsapp/status`. Passed as `statusCallback` on every outbound message *and* used by the webhook itself as the exact URL it validates Twilio's signature against, so it must be this app's real, exact URL — not just any value. Redundant (harmlessly) if the Messaging Service already has its own Status Callback URL set in the console. Leave blank to send WhatsApp messages without delivery-status tracking (they stay at `sent` and never update further); nothing errors either way. |

Leaving `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`, or both of `TWILIO_MESSAGING_SERVICE_SID` and `TWILIO_WHATSAPP_NUMBER`, blank makes every WhatsApp send resolve to `status: "skipped"` (logged in `notification_logs`, visible in the Notification Center) instead of erroring — the app runs fully otherwise. The Diagnostics page (`/diagnostics`) shows "Twilio Status: Not configured (stub-safe)" in this state, which is expected, not a fault.

| Variable | Where it's used | Notes |
|---|---|---|
| `WOOCOMMERCE_WEBHOOK_SECRET` | Server only | Shared secret for the WooCommerce order-import webhook (`app/api/webhooks/woocommerce`) — must match the Secret field on the webhook in WooCommerce (Settings → Advanced → Webhooks). The route **fails closed** if unset: every request gets 403, so leaving it blank cleanly disables auto-import. See `ARCHITECTURE.md`. |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Browser | The Web Push public key the browser subscribes with. Public by design — it's half a keypair, useless without the private half. Must hold the **same value** as `VAPID_PUBLIC_KEY`; they're separate entries only because Next.js can't read a non-`NEXT_PUBLIC_` var from the browser. |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Server only | The keypair proving a push genuinely came from this server. Generate with `node -e "console.log(require('web-push').generateVAPIDKeys())"`. **Rotating these invalidates every existing device registration** — everyone has to tap "Turn on alerts" again. Leave blank to disable push entirely (stub-safe: WhatsApp is unaffected). |
| `VAPID_SUBJECT` | Server only | `mailto:` address push services use to reach the operator about delivery problems. Defaults to `mailto:reemprimeco@gmail.com`. |
| `WOOCOMMERCE_STORE_HOST` | Server only | The store's bare hostname (e.g. `primeprint.com.kw`) — the only host customer artwork is downloaded from during an import. Also **fails closed**: unset means artwork is skipped and orders import without design files, rather than the webhook fetching whatever URL its payload names. See `ARCHITECTURE.md`. |
| `ARMADA_API_KEY` | Server only | Armada courier API key, from the Armada dashboard: Automated Ordering > your key > "Show secret". Used by `lib/armada/client.ts` to create/cancel deliveries. **Not stub-safe** like Twilio — a delivery that silently no-opped would strand a real order, so an order set to the Armada provider that fails to dispatch (this unset, or the API unreachable) falls back to notifying internal delivery staff instead, logged as `armada_delivery_dispatch_failed` in the audit trail. See `ARMADA_DELIVERY.md`. |
| `ARMADA_WEBHOOK_KEY` | Server only | **Not** issued by Armada — generate any random 12–32 character string yourself (e.g. `openssl rand -hex 16`) and paste the *same* value into Armada's "Order update webhook" setup. Sent as the `order-webhook-key` header on every delivery creation, and Armada echoes it back in the `Authorization` header of every webhook call to `/api/webhooks/armada`, which verifies it (timing-safe compare) before trusting the payload. Leaving this blank makes the webhook route return 403 to every request and disables Armada dispatch (same fallback as `ARMADA_API_KEY` above). |
| `ARMADA_ENV` | Server only | `"production"` (default) or `"staging"` — selects Armada's API base URL. |

| Variable | Where it's used | Default if unset |
|---|---|---|
| `COMPANY_NAME` | Server only (message templates) | `Prime Printing Co.` |
| `PICKUP_LOCATION` | Server only (message templates) | `Prime Printing Co. — Shuwaikh Industrial, Kuwait` |
| `PICKUP_HOURS` | Server only (message templates) | `9:00 AM – 5:00 PM` |

## Dev-only — never set true in production

| Variable | Where it's used | Notes |
|---|---|---|
| `DEMO_MODE` | Server only | `"true"` bypasses auth entirely, serves static seeded data (`lib/demo/data.ts`), and blocks every write with a "read-only demo" error. See `ARCHITECTURE.md`'s Demo Mode section. |
| `NEXT_PUBLIC_DEMO_MODE` | Browser only | Client-visible copy of `DEMO_MODE`, used solely to stop `useRealtimeChannel` from opening a real Supabase Realtime websocket (`lib/realtime/use-realtime-channel.ts`) — pointless in demo mode since writes are disabled and nothing will ever broadcast. **Keep this exactly in sync with `DEMO_MODE`** — Next.js can't read a non-`NEXT_PUBLIC_` var from the browser, so the duplication is required, not accidental. If they ever disagree, the server will serve demo data while the browser still tries (and in most environments fails) to open a real websocket.

If both are unset (the production default), the app runs against Supabase for real with full auth.

## A note on `NEXT_PUBLIC_*` variables

Anything prefixed `NEXT_PUBLIC_` is inlined into the client JS bundle at build time and is visible to anyone who opens dev tools. Only `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_DEMO_MODE` carry that prefix, and all three are safe to expose by design (see the table above). Never add the prefix to `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`, `CRON_SECRET`, or the Twilio credentials.
