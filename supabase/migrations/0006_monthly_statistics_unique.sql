-- Reports/Archive phase. Lets the month-end cron upsert on (year, month)
-- instead of risking duplicate rows if it's ever run twice for the same
-- closed month. Additive only.

alter table monthly_statistics add constraint monthly_statistics_year_month_unique unique (year, month);

-- The month-end cron records order_status_history entries for system-
-- triggered transitions (no employee actor) — same reasoning as
-- audit_logs.actor_id being nullable since Phase 5.
alter table order_status_history alter column changed_by drop not null;
