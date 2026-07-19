-- Supports an outsourced/external worker whose jobs shouldn't trigger
-- customer-facing "ready for pickup/delivery" -- instead they mark a job
-- ready_internal_pickup, which notifies every active employee with the
-- existing 'delivery' role (e.g. a logistics/delivery staffer) to go
-- collect it, after which it moves back to in_progress for Prime's own
-- team to finish/package before the customer is told. That same
-- 'delivery' role is also notified when an order becomes ready_delivery
-- (to go deliver it) and when a material request is approved (to go buy
-- it) -- see lib/notifications/service.ts.

alter type order_status add value 'ready_internal_pickup' after 'in_progress';

alter table employees add column is_outsourced boolean not null default false;
