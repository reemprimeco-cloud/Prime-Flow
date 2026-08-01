-- Structured template variables alongside the already-rendered `body` text,
-- so a message can be re-sent as an approved WhatsApp Message Template
-- (Content SID + positional variables) instead of freeform text — approved
-- templates bypass WhatsApp's 24h customer-service window entirely.
alter table notification_logs
  add column template_variables jsonb;
