-- Structured print settings, mirroring the Fiery Command WorkStation "Job
-- Properties" the operator has to set before printing (preset, media type,
-- paper source, output size, sides, colour mode, layout, fold, staple…).
-- Stored as jsonb — one object per order (item 1) and per extra item — so a
-- new Fiery field later is a code change, not a schema change. Null means
-- "no settings specified"; the shape is validated by lib/print-settings.
alter table orders add column print_settings jsonb;
alter table order_items add column print_settings jsonb;
