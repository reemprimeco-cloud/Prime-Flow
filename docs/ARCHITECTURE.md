# Architecture

Prime Production Board is a production control center for Prime Printing Co. — not an ERP/CRM. It tracks a print job from creation to delivery across three surfaces (Manager, Employee, TV) with realtime updates and zero manual refresh.

This document describes the system **as built**. For focused deep-dives, see:

- [`REALTIME.md`](./REALTIME.md) — Realtime Broadcast architecture
- [`STATUS_ENGINE.md`](./STATUS_ENGINE.md) — order workflow state machine
- [`NOTIFICATIONS.md`](./NOTIFICATIONS.md) — notification service
- [`AUDIT_LOG.md`](./AUDIT_LOG.md) — audit trail
- [`OPERATIONS.md`](./OPERATIONS.md) — Operations Control Center (timeline, workload, calendar, KPIs, search, bulk actions, manager override, activity feed, diagnostics)

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

## Reports & Archive

`app/api/cron/month-end/route.ts` (CRON_SECRET-protected, intended to run once on the 1st of each month) closes out the previous month: orders sitting in `collected`/`delivered` become `completed` + `archived` — finally exercising the transition the status engine has modeled since Phase 5 — and a `monthly_statistics` row is generated (total/completed/delayed orders, orders per employee, avg completion time, most-used paper, most-requested material). `lib/reports/compute-monthly-stats.ts` holds that aggregation logic, shared between the cron (closed historical months) and `/reports`'s live "this month so far" card, so the two can't drift apart.

`/reports` (`lib/actions/reports.ts`, `components/manager/reports-client.tsx`) charts that history with recharts, plus CSV export. `/archive` lists everything the cron has archived, with search and a month filter.

## Operations Control Center

Built on top of the Production Core infrastructure (Realtime, Audit Log, Status Engine) without new tracking tables — the Live Production Timeline and Activity Feed are both just filtered/formatted reads of `audit_logs`, and Manager Override is the sole deliberate exception that bypasses the Status Engine (with a required reason and an audit trail flagging it as such). Full module-by-module detail — Employee Workload, Production Calendar, the Operations Dashboard KPIs, Global Search, Bulk Actions, and the Diagnostics health check — is in `OPERATIONS.md`.

## What's deferred

Email and SMS notification providers — only WhatsApp (via Twilio) is implemented, behind the same provider abstraction the other two will use (see `NOTIFICATIONS.md`). The **Notification Service**, **Audit Log**, and **Status Engine** built in the infrastructure phase are designed so both land as pure additions — no dashboard code changes required.

## Known gaps (not yet built, tracked here rather than silently)

- No persistent customer entity — customer info (including notification preferences) is denormalized per-order, not shared across a customer's orders. Deliberate, per "not an ERP/CRM"; means preferences are re-entered per order rather than remembered.
- Live Twilio delivery was not runtime-verified in this environment (sandbox network policy blocks direct third-party API calls) — see the Testing boundary in `NOTIFICATIONS.md`.
- The month-end cron has no scheduler wired up yet (e.g. Vercel Cron config) — the endpoint exists and works, but nothing calls it automatically until that's configured on deployment.
- No persisted "pickup vs. delivery" field on an order — Operations KPIs and the Calendar infer it from current status. See `OPERATIONS.md`.
- "Active Users" on the Diagnostics page is an approximation (distinct recent audit-log actors), not a real session count — there's no session-tracking table since auth is stateless JWT cookies. See `OPERATIONS.md`.
