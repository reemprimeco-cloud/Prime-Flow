# Deployment checklist

Prime Production Board has never been deployed to a live production environment from this build session — every phase was verified via `tsc`/`eslint`/`next build` plus Demo Mode in a real browser, because this sandbox's network policy allows Supabase access only through MCP tools, not direct app-level HTTPS (see `ARCHITECTURE.md`'s Demo Mode section). This checklist is what the **first real deployment** needs, written from that boundary rather than from a "we deployed it and this is what we did" retrospective.

## 1. Supabase project

- [ ] Confirm the target Supabase project is the intended one — `NEXT_PUBLIC_SUPABASE_URL` should point at `hodqbuewaivgkgrcjrzi.supabase.co` (or wherever you've moved to) if reusing the project provisioned during this build, or a fresh project otherwise.
- [ ] Apply every migration in `supabase/migrations/` **in order** — see `MIGRATION_STRATEGY.md` for how. As of this phase that's `0001` through `0008`.
- [ ] Run `mcp__supabase__get_advisors` (security **and** performance) and confirm no new `WARN`/`ERROR`-level findings beyond the `INFO`-level `rls_enabled_no_policy` notices, which are expected and intentional (see the Auth Model section of `ARCHITECTURE.md` — RLS is enabled everywhere with zero policies by design, since all access is service-role-only).
- [ ] Create the two private Storage buckets if they don't already exist: `product-images`, `design-files` (see `0002_storage.sql`).
- [ ] Seed at least one admin account: `pnpm seed` (edit `scripts/seed.ts`'s `DEMO_EMPLOYEES` list first — its default passwords are for local dev only and must not reach production as-is).
- [ ] **Known gap:** there is no in-app UI to create/edit/deactivate employees or reset a password — see `QA_REPORT_v1.0.0.md`. Provisioning employees today means re-running `pnpm seed` (with `onConflict: "username"`, so it's safe to re-run) or editing the `employees` table directly via the Supabase dashboard/SQL editor.

## 2. Environment variables

- [ ] Every variable in `ENVIRONMENT_VARIABLES.md`'s "Required" table is set on the hosting platform.
- [ ] `DEMO_MODE` and `NEXT_PUBLIC_DEMO_MODE` are **both unset or `false`**. Double-check both — a mismatch (e.g. only one flipped) puts the app in an inconsistent state.
- [ ] `SESSION_SECRET` and `CRON_SECRET` are freshly generated for this environment, not copied from `.env.local.example` or a dev project.
- [ ] Twilio variables are set if WhatsApp sending should be live; otherwise confirmed intentionally blank (stub-safe mode — see `NOTIFICATIONS.md`).
- [ ] If Twilio is live: `TWILIO_STATUS_CALLBACK_URL` is set to this deployment's real URL (e.g. `https://primeflowboard.netlify.app/api/twilio/whatsapp/status`), and the same URL is entered in the Twilio console (Messaging Service or WhatsApp Sender → Status Callback URL) — either alone is enough to receive delivery-status updates, but they must match exactly if both are set. See `NOTIFICATIONS.md`'s "Delivery status callback" section.

## 3. Scheduling

- [ ] `/api/cron/month-end` is wired to a scheduler that fires once on the 1st of each month (e.g. Vercel Cron, a Supabase Edge Function schedule, or any external cron hitting the URL with `Authorization: Bearer $CRON_SECRET`). **This is not configured anywhere yet** — the endpoint works but nothing calls it automatically until this step is done.
- [ ] `/api/cron/retry-notifications` is wired to run on a short interval (e.g. every 5–15 minutes) to drive the exponential-backoff retry queue. Also not configured yet.

## 4. Build & type safety

- [ ] `npx tsc --noEmit` clean.
- [ ] `pnpm lint` clean.
- [ ] `pnpm build` clean, with `DEMO_MODE` unset (building with demo mode on can hide real Supabase-dependent code paths from the build's static analysis in ways that don't reflect production).

## 5. First-login smoke test (do this against the real deployment, not Demo Mode)

- [ ] Log in as the seeded admin.
- [ ] Create an order, assign an employee.
- [ ] Log in as that employee in a separate session, confirm the job appears, advance its status.
- [ ] Confirm the Manager Dashboard and TV Dashboard (`/tv`, no login) reflect the change within ~1s without a manual refresh.
- [ ] Submit a material request, approve it from the Manager Dashboard, confirm the employee notification fires (check `/notifications` — status `sent` if Twilio is configured, `skipped` with `"Twilio credentials not configured"` if not; either is correct, an `error`/`failed` status is not).
- [ ] Open `/diagnostics` and confirm Database Connection, Realtime Status, and Notification Queue all read as healthy.

## 6. Post-deploy

- [ ] Bookmark `/diagnostics` for ongoing health checks — see `DISASTER_RECOVERY.md`.
- [ ] Set up the backup schedule described in `BACKUP_CHECKLIST.md` (Supabase's automatic backups need to be enabled/confirmed on the project's plan tier — the free tier doesn't include them).
- [ ] Confirm `/tv` is reachable from whatever device will display it (kiosk browser, TV dongle, etc.) and stays logged out — it has no auth by design.
