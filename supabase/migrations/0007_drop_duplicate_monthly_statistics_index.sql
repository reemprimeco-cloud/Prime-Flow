-- Stabilization phase. 0001_init.sql already declares `unique (year, month)`
-- inline on monthly_statistics (constraint monthly_statistics_year_month_key).
-- Migration 0006 added a second, identical unique constraint
-- (monthly_statistics_year_month_unique) without checking for the existing
-- one — flagged by the Supabase performance advisor as a duplicate index.
--
-- The month-end cron's upsert targets onConflict: "year,month" (a column
-- list, not a constraint name), so dropping the redundant constraint is
-- safe and changes no application behavior.

alter table monthly_statistics drop constraint monthly_statistics_year_month_unique;
