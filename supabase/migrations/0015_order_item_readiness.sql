-- Per-item readiness for multi-item orders. `orders.item_ready` tracks the
-- first item (the order's own product/paper/etc. columns); `order_items.is_ready`
-- tracks items 2+. Once every item on an order is ready, the order
-- auto-advances to ready_pickup/ready_delivery (see
-- lib/actions/item-readiness.ts) -- single-item orders are unaffected, since
-- with zero rows in order_items "all items ready" only depends on item_ready,
-- which the existing Ready for Pickup/Delivery button still sets indirectly
-- via the normal status transition.

alter table orders add column item_ready boolean not null default false;
alter table order_items add column is_ready boolean not null default false;
