-- Production approval gate: a manager must explicitly approve an order
-- before an employee can start production on it (new -> in_progress).
-- Defaults to true so this column's arrival doesn't lock up any order
-- already sitting on a live board — the order form defaults new orders to
-- unapproved from here on (see components/orders/order-form.tsx), so the
-- gate only actually applies going forward.
alter table orders add column approved boolean not null default true;
