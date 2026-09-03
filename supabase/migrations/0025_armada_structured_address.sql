-- Structured Kuwait delivery-address fields, additive alongside the
-- existing free-text `delivery_address` (still shown to humans — drivers,
-- staff) and `delivery_map_link` (still the most precise option when
-- present). These four exist specifically for Armada: per a direct message
-- from an Armada integration engineer, their system computes the km-based
-- delivery fee from area/block/street/building-number (plus the shipping
-- country fixed to Kuwait), not from the free-text address — so without
-- these, dispatchArmadaDelivery (lib/armada/dispatch.ts) can only fall back
-- to sending the whole free-text address as one opaque `area` string, which
-- Armada can't price accurately. See docs/ARMADA_DELIVERY.md.
--
-- Nullable: only meaningful for delivery-fulfillment orders, and existing
-- delivery orders predate this column, so backfilling isn't possible.
alter table orders
  add column delivery_area text,
  add column delivery_block text,
  add column delivery_street text,
  add column delivery_building_number text;
