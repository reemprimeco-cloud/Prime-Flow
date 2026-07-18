# Disaster recovery notes

Scenarios worth having a plan for, given this app's actual architecture (Next.js on some host + one Supabase project, no other infrastructure).

## Supabase project becomes unreachable / is deleted

**Impact:** total outage — every page except `/tv` and `/login` requires a working Supabase connection (Server Components and Server Actions all go through `lib/supabase/server.ts`), and `/tv`/`/login` are non-functional without it too (no data, no auth).

**Recovery:**
1. Restore the Supabase project from its most recent backup (see `BACKUP_CHECKLIST.md`), or provision a fresh project if the old one is unrecoverable.
2. Apply `supabase/migrations/*.sql` in order if starting fresh (see `MIGRATION_STRATEGY.md`).
3. Update `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` on the hosting platform to point at the (restored or new) project.
4. Re-seed at least the admin account if data wasn't recoverable (`pnpm seed`).
5. Redeploy so the new env vars take effect.

**Mitigation available today:** `DEMO_MODE=true` (+ `NEXT_PUBLIC_DEMO_MODE=true`) lets the app run in a fully static, read-only mode with zero Supabase dependency — this is not a substitute for real service, but it means the UI can stay reachable (e.g. for a status page or to avoid a blank error screen) while Supabase is being restored. Never leave it on longer than needed; it's read-only and shows synthetic data.

## Twilio outage / credentials revoked

**Impact:** none to core production tracking. WhatsApp sends fail gracefully — `notification_logs` rows get `status: "failed"` with the Twilio error captured in `error`/`provider_response`, and the automatic retry cron (`/api/cron/retry-notifications`) will keep retrying with exponential backoff until it succeeds or the retry ceiling is reached. Nothing about order creation, status transitions, or the Manager/Employee/TV dashboards depends on Twilio.

**Recovery:** fix the Twilio account/credentials, update env vars, redeploy. The retry queue will drain on its own; failed notifications can also be resent manually from the Notification Center.

## Realtime (websocket) degradation

**Impact:** dashboards stop updating live but keep working — every live-data view has a safety-net `refetchInterval` (typically 15–30s) on top of its realtime subscription (see `REALTIME.md`), so the worst case is a 15–30 second staleness window, not a broken page. A manual refresh always shows current data regardless of realtime state.

**Recovery:** usually self-heals — `lib/realtime/manager.ts` reconnects with capped exponential backoff automatically. `/diagnostics`'s "Realtime Status" row shows the live channel state if you need to confirm.

## Accidental bad data (wrong bulk action, bad manual SQL edit, etc.)

**Impact:** varies by scope. Every status change and manager override is captured in `audit_logs` with before/after values (`old_value`/`new_value`) — see `AUDIT_LOG.md` — so "what changed and when" is always reconstructible even when the fix itself requires manual intervention.

**Recovery:**
1. Query `audit_logs` for the affected `order_id`(s)/time range to understand exactly what happened.
2. For a small number of affected rows: hand-correct via the Supabase SQL editor or `mcp__supabase__execute_sql`, referencing the audit trail for the "before" values.
3. For wide-scale corruption: PITR restore to just before the bad operation (see `BACKUP_CHECKLIST.md`) — this loses any legitimate writes after that point too, so weigh it against manual correction first.

## Cron jobs stop firing (month-end archive / notification retry)

**Impact:** orders that reached `collected`/`delivered` stay there instead of advancing to `completed`/`archived` — they remain fully visible and functional on the Manager Dashboard, just not archived. Failed notifications stop auto-retrying (manual resend from the Notification Center still works).

**Recovery:** fix the scheduler, then either wait for the next scheduled fire or trigger the endpoint manually with `curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/month-end`. The month-end endpoint is idempotent for a given month (upserts `monthly_statistics` on `(year, month)`, only archives orders not already archived), so a late or repeated run is safe.

## What has **not** been tested against a real failure

Everything above is derived from reading the code paths, not from inducing an actual failure against a live deployment — this sandbox can't reach Supabase over app-level HTTPS to rehearse any of these (see `ARCHITECTURE.md`). Treat this document as a reasoned starting point, not a validated runbook, until at least the PITR restore and the "Supabase unreachable" mitigation have been rehearsed once against the real environment.
