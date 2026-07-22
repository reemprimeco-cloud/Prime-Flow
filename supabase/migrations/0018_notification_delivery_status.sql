-- Twilio WhatsApp delivery-status tracking (app/api/twilio/whatsapp/status).
-- Twilio's status-callback webhook reports a message's lifecycle
-- (queued -> accepted -> sent -> delivered -> read, or failed/undelivered)
-- asynchronously, keyed by the MessageSid returned when the message was
-- first sent. `provider_message_id` is that SID, captured at send time
-- (see lib/notifications/providers/twilio-whatsapp.ts) so the webhook can
-- look the row back up. Each value in the enum extension below is added in
-- its own statement -- Postgres requires ALTER TYPE ... ADD VALUE to run
-- outside the transaction that first uses the new value, which isn't a
-- concern here since nothing in this migration uses them yet.

alter type notification_status add value if not exists 'queued';
alter type notification_status add value if not exists 'accepted';
alter type notification_status add value if not exists 'read';
alter type notification_status add value if not exists 'undelivered';

alter table notification_logs
  add column provider_message_id text,
  add column delivered_at timestamptz,
  add column read_at timestamptz,
  add column failed_reason text;

create index notification_logs_provider_message_id_idx on notification_logs (provider_message_id);
