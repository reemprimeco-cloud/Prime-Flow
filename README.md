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
- `TWILIO_*` — optional; WhatsApp sends run stub-safe (logged, not sent) when unset
- `CRON_SECRET` — required by `/api/cron/month-end`

## Structure

See `supabase/migrations/` for the schema and `lib/` for auth, validation, and Server Actions. Route groups: `(auth)` for login, `(manager)` for the admin dashboard, `employee` for the floor dashboard.
