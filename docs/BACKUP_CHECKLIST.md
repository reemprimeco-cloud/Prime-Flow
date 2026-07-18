# Backup checklist

All persistent state lives in one place: the Supabase project (Postgres + Storage). There is no other datastore, no local file storage, and no state cached anywhere that isn't reproducible from Postgres — which makes the backup story simpler than most apps, but also means Postgres backups are the *entire* safety net.

## What needs backing up

| Data | Where | Backed up by |
|---|---|---|
| All application data (orders, employees, audit log, notification history, etc.) | Postgres (`public` schema) | Supabase's built-in Point-in-Time-Recovery / daily backups (plan-tier dependent — see below) |
| Uploaded product images & design files | Supabase Storage (`product-images`, `design-files` buckets) | Supabase Storage backups (check your plan tier — this is separate from Postgres backups) |
| Schema definition | `supabase/migrations/*.sql` in this git repo | Git — this is your actual schema source of truth, independent of Supabase's backups |
| Secrets (`SESSION_SECRET`, `CRON_SECRET`, Twilio credentials) | Hosting platform's environment variable store | Whatever secret-backup practice your platform/team already uses — **never** git |

## What does not need backing up (and shouldn't be)

- `.next/` build output — fully reproducible from source + `pnpm build`.
- Signed Storage URLs — short-lived (1 hour, see `lib/actions/orders.ts`/`tv.ts`), regenerated on every read, never stored.
- `notification_logs.provider_response` — Twilio's raw API response, useful for debugging but reconstructible by re-querying Twilio's own API by SID if ever lost.

## Recommended setup

1. **Enable Point-in-Time Recovery (PITR)** on the Supabase project if the plan tier supports it. This is the single highest-value backup step — it lets you restore to any point in the last N days, not just a nightly snapshot.
2. If PITR isn't available on your tier, confirm daily backups are enabled and note the retention window (Supabase's dashboard shows this under Database → Backups).
3. **Test a restore at least once** before going live — a backup that's never been restored is a hope, not a backup. Use a Supabase branch (`mcp__supabase__create_branch`) to test-restore without touching production.
4. **Storage buckets**: confirm whether your plan tier includes Storage in its backup scope separately from Postgres — historically these have been backed up on different schedules on some platforms. If Storage isn't covered, uploaded product images/design files are only as safe as "nobody deletes the bucket," which is a real risk worth escalating before go-live.
5. **Git is your schema backup.** If the Postgres instance is ever rebuilt from scratch, `supabase/migrations/*.sql` applied in order (`0001` → `0008` as of this phase) reproduces the schema exactly — see `MIGRATION_STRATEGY.md`. Data itself still needs a real Postgres backup; migrations only reproduce structure.
6. **Before any risky operation** (a bulk data migration, a schema change touching existing rows, testing something destructive) — take a manual snapshot or work on a Supabase branch first, per the Supabase MCP tool's own guidance: prefer local/branch testing before applying changes to the remote project.

## Recovery time expectations

Not yet measured against a real deployment (see `DEPLOYMENT_CHECKLIST.md` for why). Once live, run an actual timed test restore and record the result here — "we assume it's fast" is not a disaster recovery plan.
