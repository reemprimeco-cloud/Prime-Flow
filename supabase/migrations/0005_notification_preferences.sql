-- Phase 6 (Communication & Notifications). Additive only — no existing
-- column, table, or enum value is changed.
--
-- "Per customer" preferences live on `orders` rather than a new customers
-- table: this project has no persistent customer entity by design (see
-- docs/ARCHITECTURE.md — "not an ERP/CRM"), so preferences are captured at
-- order-creation time, same as the existing whatsapp_enabled/
-- preferred_language columns they extend.

create type notification_channel as enum ('whatsapp', 'email', 'sms');

alter table orders
  add column preferred_channel notification_channel not null default 'whatsapp',
  add column notification_preferences jsonb not null default '{"order_received":true,"order_in_production":false,"ready_for_pickup":true,"out_for_delivery":true,"delivered":true}'::jsonb;

alter table notification_logs
  add column provider_response jsonb,
  add column body text,
  add column last_attempted_at timestamptz not null default now(),
  add column channel notification_channel not null default 'whatsapp';
