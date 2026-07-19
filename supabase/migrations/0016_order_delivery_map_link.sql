-- Delivery Address is now two separate lines on the order form: a plain
-- text address (existing `delivery_address` column) and an optional
-- explicit Google Maps link the manager can paste in directly (e.g. from
-- sharing a pin) rather than relying solely on geocoding the free-text
-- address. buildGoogleMapsLink(address) remains the fallback whenever this
-- column is null.
alter table orders add column delivery_map_link text;
