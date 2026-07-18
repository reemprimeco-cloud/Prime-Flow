# Database migration strategy

## Source of truth

`supabase/migrations/*.sql` in this repository is the schema's source of truth — not the live Supabase project's current state. Every schema change, from this build's very first migration through the Stabilization phase, was written as a numbered, additive SQL file and applied via the Supabase MCP tools (`apply_migration`) during development. Going forward, use the Supabase CLI against the linked project instead:

```
supabase link --project-ref <project-ref>
supabase db push
```

`db push` applies any local migration files not yet recorded in the project's migration history, in filename order. Do not hand-apply SQL through the dashboard's SQL editor for anything that should persist as a repeatable migration — one-off `execute_sql` calls are fine for read-only investigation or a genuinely one-time data fix, but any schema change belongs in a migration file.

## Current migration history

| File | What it does |
|---|---|
| `0001_init.sql` | Full initial schema — every table, enum, RLS enable (no policies), the `order_number` sequence. |
| `0002_storage.sql` | Creates the `product-images` and `design-files` private Storage buckets. |
| `0003_fix_function_search_path.sql` | Security hardening — pins `search_path` on a SQL function to close a schema-injection vector flagged by the security advisor. |
| `0004_audit_logs.sql` | Adds `audit_logs` (Phase 5 — Production Core). Additive only. |
| `0005_notification_preferences.sql` | Adds `orders.preferred_channel`/`notification_preferences`, `notification_logs.provider_response`/`body`/`last_attempted_at`/`channel` (Phase 6 — Communication & Notifications). Additive only. |
| `0006_monthly_statistics_unique.sql` | Adds `unique(year, month)` to `monthly_statistics` for the month-end cron's upsert, and drops the `NOT NULL` constraint on `order_status_history.changed_by` (system-triggered transitions have no employee actor). |
| `0007_drop_duplicate_monthly_statistics_index.sql` | Stabilization phase fix — `0006` added a unique constraint that duplicated one already present in `0001_init.sql`; this drops the redundant one. See `QA_REPORT_v1.0.0.md`. |
| `0008_add_missing_foreign_key_indexes.sql` | Stabilization phase performance pass — adds 6 indexes on foreign key columns the performance advisor flagged as unindexed. |

Note: the live project's migration history (visible via `mcp__supabase__list_migrations`) has a few more entries than local filenames because some phases were applied as several small incremental `apply_migration` calls during development (e.g. `0005`'s four column additions were four separate remote migrations) before being consolidated into one local file per logical change. The **local files are what matters** for reproducing the schema elsewhere — the remote history is just how it happened to get there this time.

## Writing a new migration

1. **Additive by default.** Every migration so far has been additive (new tables/columns/indexes, or loosening a constraint) except `0007`, which removed a genuinely redundant duplicate index — and even that only ran after confirming via `pg_indexes` that a functionally identical constraint already existed. Prefer additive changes; they don't risk breaking whatever's already deployed against the old schema during a rolling deploy.
2. **Never edit a migration that's already been applied to any shared environment** (including this project's own Supabase instance) — write a new one instead, even to fix a mistake in an old one (see `0007` fixing `0006`, rather than editing `0006` in place).
3. **Name it `NNNN_description.sql`**, next sequential number, snake_case description.
4. **Check for existing constraints/indexes before adding one** — `0006`/`0007` exist specifically because that check was skipped once. `select * from pg_indexes where tablename = '<table>'` before adding a unique constraint or index.
5. **RLS**: every new table needs `alter table <name> enable row level security;` with **no policies** — this project's auth is fully custom (no `auth.uid()`), so all access goes through the service-role client server-side. See the Auth Model section of `ARCHITECTURE.md`. A table with RLS enabled and no policies is intentional here, not an oversight — don't "fix" it by adding permissive policies.
6. **Run the advisors after applying**: `mcp__supabase__get_advisors` for both `security` and `performance`. Expect `INFO`-level `rls_enabled_no_policy` notices (intentional, see above); investigate anything at `WARN` or higher.
7. **Update `types/database.types.ts`** — regenerate via `mcp__supabase__generate_typescript_types` (or the Supabase CLI's `gen types` equivalent) after any schema change, so TypeScript catches drift at compile time rather than at runtime.

## Rollback

There is no automated down-migration tooling in this project — every migration is forward-only. To undo a migration, write a new migration that reverses it (as `0007` did for `0006`), rather than attempting to run a prior migration file "backwards." For anything beyond a simple additive undo (e.g. a change that already has dependent data), restoring from a Point-in-Time-Recovery snapshot from just before the migration was applied is safer — see `BACKUP_CHECKLIST.md`.
