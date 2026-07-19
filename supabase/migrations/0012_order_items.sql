-- Multi-item orders: a single order can now hold more than one product
-- line, each optionally assigned to a different employee. The order's own
-- product/paper/paper_size/quantity/finishing columns keep representing
-- the first item (so every existing read path stays valid unchanged);
-- this table holds items 2+.

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  product text not null,
  paper text,
  paper_size text,
  quantity integer not null check (quantity > 0),
  finishing text,
  employee_id uuid references employees (id) on delete set null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index order_items_order_idx on order_items (order_id);
create index order_items_employee_idx on order_items (employee_id) where employee_id is not null;

alter table order_items enable row level security;
