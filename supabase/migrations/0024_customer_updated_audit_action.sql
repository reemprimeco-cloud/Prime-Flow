-- Additive only. Adds the audit_action value used when an admin corrects a
-- customer's name/mobile number from the new /customers page (see
-- lib/actions/customers.ts) — this doesn't introduce a customers table
-- (still "not an ERP/CRM", see docs/ARCHITECTURE.md), it just lets staff fix
-- a customer_name/customer_mobile typo across every one of that customer's
-- orders in one place instead of it drifting into duplicate-looking entries.
alter type audit_action add value 'customer_updated';
