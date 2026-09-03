-- Public order request form (app/order-request, lib/actions/order-request.ts):
-- a customer can submit a new order with no employee session at all --
-- meant to be linked from a WhatsApp Business auto-reply, no Twilio
-- involvement. `created_by`/`uploaded_by` were NOT NULL because every
-- previous writer was an authenticated employee; a public submission has no
-- employee actor, so both go nullable rather than pointing at a fake
-- "system" employee row.

alter table orders alter column created_by drop not null;
alter table order_files alter column uploaded_by drop not null;
