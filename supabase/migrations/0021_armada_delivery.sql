-- Armada courier integration: a per-order delivery provider choice
-- (internal delivery-role staff, e.g. Naresh, vs. Armada's dispatch API)
-- plus the bookkeeping columns needed to create an Armada delivery and
-- match its webhook callbacks back to the right order. See
-- docs/ARMADA_DELIVERY.md.

create type order_delivery_provider as enum ('internal', 'armada');

alter table orders add column delivery_provider order_delivery_provider not null default 'internal';

-- Armada's own delivery id for this order -- the field their webhook
-- callbacks carry to identify which order they're about, so lookups go
-- through this column, not orders.id.
alter table orders add column armada_delivery_code text;

-- Armada's own status string (pending/dispatched/waiting_pack/en_route/
-- completed/canceled/failed), stored as-is rather than mapped onto
-- orders.status -- only `completed` ever drives an actual Prime Flow
-- status transition (ready_delivery -> delivered), see
-- applyOrderStatusTransition in lib/actions/status-transition.ts.
alter table orders add column armada_delivery_status text;
alter table orders add column armada_tracking_link text;
alter table orders add column armada_driver_name text;
alter table orders add column armada_driver_phone text;
alter table orders add column armada_delivery_fee numeric;

create unique index orders_armada_delivery_code_idx on orders (armada_delivery_code) where armada_delivery_code is not null;

alter type audit_action add value 'armada_delivery_dispatched';
alter type audit_action add value 'armada_delivery_dispatch_failed';
alter type audit_action add value 'armada_delivery_canceled';
alter type audit_action add value 'armada_webhook_status_update';
