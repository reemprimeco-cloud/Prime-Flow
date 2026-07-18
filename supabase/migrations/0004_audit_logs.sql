-- Centralized audit trail (Production Core / Phase 5). Additive only —
-- no existing table or enum is modified. RLS enabled with zero policies,
-- consistent with every other table: service-role-only access, see
-- docs/AUDIT_LOG.md.

create type audit_action as enum (
  'order_created',
  'order_updated',
  'order_deleted',
  'employee_assigned',
  'employee_unassigned',
  'status_changed',
  'material_requested',
  'material_approved',
  'material_rejected',
  'notification_sent'
);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_id uuid references employees(id) on delete set null,
  actor_name text not null,
  action audit_action not null,
  entity_type text not null,
  entity_id uuid,
  order_id uuid references orders(id) on delete set null,
  old_value jsonb,
  new_value jsonb
);

alter table audit_logs enable row level security;

create index audit_logs_order_id_idx on audit_logs (order_id);
create index audit_logs_created_at_idx on audit_logs (created_at desc);
create index audit_logs_action_idx on audit_logs (action);
