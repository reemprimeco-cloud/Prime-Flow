-- Web Push device registrations. One row per browser/device an employee
-- has enabled notifications on — the same person legitimately has several
-- (phone, shop tablet), and every one of them should get the alert.
--
-- `endpoint` is the push service's per-device URL and is globally unique,
-- so it doubles as the natural key: re-subscribing the same device (which
-- browsers do on their own when a subscription is refreshed) upserts
-- rather than piling up duplicates.
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees (id) on delete cascade,
  endpoint text not null unique,
  -- The two keys web-push needs to encrypt a payload for this device.
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index push_subscriptions_employee_id_idx on push_subscriptions (employee_id);

alter table push_subscriptions enable row level security;
