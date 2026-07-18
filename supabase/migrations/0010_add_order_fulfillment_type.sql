-- Persists whether an order is pickup or delivery, chosen at creation time
-- instead of the employee choosing reactively when marking a job ready.
-- Default 'pickup' only backfills the handful of pre-existing rows; every
-- new order requires an explicit choice via the order form.

create type order_fulfillment_type as enum ('pickup', 'delivery');

alter table orders
  add column fulfillment_type order_fulfillment_type not null default 'pickup';
