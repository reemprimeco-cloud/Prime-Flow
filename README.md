# Prime Production Board

Production control center for Prime Printing Co. — Next.js 15 (App Router) + Supabase + Tailwind v4.

## Setup

```bash
pnpm install
cp .env.local.example .env.local   # fill in Supabase + session secret
pnpm seed                          # creates demo admin/employee accounts
pnpm dev
```

Required env vars (see `.env.local.example`):

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — from Supabase Project Settings → API
- `SESSION_SECRET` — `openssl rand -base64 32`
- `TWILIO_*` — optional; WhatsApp sends run stub-safe (logged, not sent) when unset. See `docs/NOTIFICATIONS.md` for setup, including the free WhatsApp Sandbox for development.
- `COMPANY_NAME`, `PICKUP_LOCATION` — optional, used in WhatsApp message templates
- `CRON_SECRET` — required by `/api/cron/retry-notifications` and (once built) `/api/cron/month-end`

## Structure

See `supabase/migrations/` for the schema and `lib/` for auth, validation, and Server Actions. Route groups: `(auth)` for login, `(manager)` for the admin dashboard, `employee` for the floor dashboard, `(tv)` for the unattended kiosk board.

## Documentation

See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the full system design, and [`docs/REALTIME.md`](./docs/REALTIME.md), [`docs/STATUS_ENGINE.md`](./docs/STATUS_ENGINE.md), [`docs/NOTIFICATIONS.md`](./docs/NOTIFICATIONS.md), and [`docs/AUDIT_LOG.md`](./docs/AUDIT_LOG.md) for the infrastructure layer added in the Production Core phase.
