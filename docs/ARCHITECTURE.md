# Architecture

Prime Production Board is a production control center for Prime Printing Co. — not an ERP/CRM. It tracks a print job from creation to delivery across three surfaces (Manager, Employee, TV) with realtime updates and zero manual refresh.

This document describes the system **as built**. For focused deep-dives, see:

- [`REALTIME.md`](./REALTIME.md) — Realtime Broadcast architecture
- [`STATUS_ENGINE.md`](./STATUS_ENGINE.md) — order workflow state machine
- [`NOTIFICATIONS.md`](./NOTIFICATIONS.md) — notification service
- [`AUDIT_LOG.md`](./AUDIT_LOG.md) — audit trail

## Tech stack

Next.js 15 (App Router, Server Components, Server Actions) · TypeScript (strict) · Tailwind v4 · Supabase (Postgres + Realtime Broadcast + Storage) · React Hook Form + Zod · TanStack Query · nuqs (URL-synced filters) · `jose` + `bcryptjs` (custom auth) · date-fns.

Light theme throughout, including the TV Dashboard, per product direction — no dark mode toggle.

## Auth model

A single `employees` table serves every role (`admin`, `employee`, `supervisor`, `store`, `delivery`) via a `role` column. There is **no Supabase Auth** — login is a Server Action that verifies a bcrypt hash and issues a signed httpOnly JWT cookie (`lib/auth/session.ts`), verified per-request in `middleware.ts` and re-verified inside every Server Action via `lib/auth/guards.ts` (`requireAdmin`, `requireEmployee`, `requireSession`).

Because there's no Supabase Auth, there's no `auth.uid()` for RLS to key off of. Every table has RLS **enabled with zero policies** — all reads/writes go through the service-role client (`lib/supabase/server.ts`) inside Server Components/Actions. The browser never talks to Postgres directly; the anon-key browser client (`lib/supabase/client.ts`) is used exclusively to open Realtime Broadcast channels, which don't require table grants.

`/tv` has no auth guard by design (spec: unattended fullscreen kiosk display) and never returns PII beyond first names.

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

## What's deferred

Reports/analytics UI, Archive screen polish, the month-end archival cron, and a live Twilio WhatsApp provider are intentionally not built yet. The **Notification Service**, **Audit Log**, and **Status Engine** built in the infrastructure phase are designed so those land as pure additions — no dashboard code changes required.

## Known gaps (not yet built, tracked here rather than silently)

- Material request **approve/reject** — `/material-requests` is currently a read-only table with no mutation actions.
- Manager-initiated order status changes — today only employees change `orders.status` (via `updateEmployeeJobStatus`); a manager override action doesn't exist.
