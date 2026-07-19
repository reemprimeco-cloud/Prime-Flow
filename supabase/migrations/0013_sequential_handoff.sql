-- Sequential employee hand-off: when a manager orders multiple employees on
-- one order (e.g. Kumar then Siva), the later stages shouldn't see the job
-- at all until the person before them clicks "Ready for Next". `sequence`
-- is only set for employees the manager explicitly ordered via the Assign
-- Employees list; item-level and auto-assigned (e.g. delivery-role) rows
-- stay NULL so they're never gated and never block anyone else.

alter table order_assignments
  add column sequence integer,
  add column handed_off_at timestamptz;

create index order_assignments_order_sequence_idx
  on order_assignments (order_id, sequence)
  where sequence is not null;
