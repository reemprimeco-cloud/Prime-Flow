-- QuickBooks Online integration — see docs/QUICKBOOKS.md.
--
-- integration_tokens: the OAuth2 access/refresh token pair for the one
-- connected QuickBooks company (realm). One row per provider; QuickBooks is
-- the only provider today. Refresh tokens rotate on every refresh, so the
-- row is rewritten on each one. RLS enabled with zero policies, same as every
-- other table: only the service-role client (server-side) ever touches it.
create table integration_tokens (
  provider text primary key,
  realm_id text not null,
  access_token text not null,
  refresh_token text not null,
  access_expires_at timestamptz not null,
  refresh_expires_at timestamptz not null,
  connected_by uuid references employees(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table integration_tokens enable row level security;

-- Where an imported order came from and the upstream id it was imported from,
-- so a webhook that fires more than once for the same invoice (QuickBooks
-- sends several "updated" events per invoice: sent, paid, closed) can never
-- create a second order. Null for orders typed in by hand.
alter table orders
  add column source text check (source in ('woocommerce', 'quickbooks', 'order_request')),
  add column source_ref text;

create unique index orders_source_ref_unique
  on orders (source, source_ref)
  where source_ref is not null;
