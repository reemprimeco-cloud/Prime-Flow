-- Stabilization phase performance pass. The Supabase performance advisor
-- flags these 5 foreign keys as unindexed. They're each queried via
-- `.in(...)`/`.eq(...)` on the referencing column in hot paths (order list,
-- order detail, timeline, workload, month-end cron), so at production scale
-- (the "1000+ active orders" case) these matter — Postgres would otherwise
-- seq-scan the referencing table for every FK lookup and, without an index,
-- take a full table lock on every update/delete to the referenced row.

create index if not exists audit_logs_actor_id_idx on audit_logs (actor_id);
create index if not exists material_requests_order_id_idx on material_requests (order_id);
create index if not exists material_requests_resolved_by_idx on material_requests (resolved_by);
create index if not exists order_files_uploaded_by_idx on order_files (uploaded_by);
create index if not exists order_notes_employee_id_idx on order_notes (employee_id);
create index if not exists orders_created_by_idx on orders (created_by);
