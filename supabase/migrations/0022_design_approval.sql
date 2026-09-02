-- Customer-facing design/proof approval: a manager sends a public,
-- unauthenticated link (see app/approve/[token]) so the customer can review
-- the uploaded design files/product images and approve or request changes
-- before production starts. See docs/DESIGN_APPROVAL.md.

create type design_approval_status as enum ('not_sent', 'pending', 'approved', 'changes_requested');

alter table orders add column design_approval_status design_approval_status not null default 'not_sent';

-- The unguessable public link secret -- looked up with no auth check (the
-- link itself is the credential), so it's never derived from anything
-- predictable like the order id/number.
alter table orders add column design_approval_token text;

-- Set only on "Request Changes" -- the customer's note to the shop on what
-- needs fixing before they'll approve.
alter table orders add column design_approval_note text;

alter table orders add column design_approval_requested_at timestamptz;
alter table orders add column design_approval_responded_at timestamptz;

create unique index orders_design_approval_token_idx on orders (design_approval_token) where design_approval_token is not null;

alter type audit_action add value 'design_approval_requested';
alter type audit_action add value 'design_approval_responded';
