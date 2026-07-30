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
| `TWILIO_STATUS_CALLBACK_URL` | Server only | This app's own production URL for `app/api/twilio/whatsapp/status` — e.g. `https://primeflowboard.netlify.app/api/twilio/whatsapp/status`. Passed as `statusCallback` on every outbound message *and* used by the webhook itself as the exact URL it validates Twilio's signature against, so it must be this app's real, exact URL — not just any value. Redundant (harmlessly) if the Messaging Service already has its own Status Callback URL set in the console. Leave blank to send WhatsApp messages without delivery-status tracking (they stay at `sent` and never update further); nothing errors either way. |

Leaving `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`, or both of `TWILIO_MESSAGING_SERVICE_SID` and `TWILIO_WHATSAPP_NUMBER`, blank makes every WhatsApp send resolve to `status: "skipped"` (logged in `notification_logs`, visible in the Notification Center) instead of erroring — the app runs fully otherwise. The Diagnostics page (`/diagnostics`) shows "Twilio Status: Not configured (stub-safe)" in this state, which is expected, not a fault.

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
