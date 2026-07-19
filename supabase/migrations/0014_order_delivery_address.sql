-- Customer delivery address, so the WhatsApp notification sent to delivery
-- staff (e.g. Naresh) when an order becomes ready_delivery can include a
-- clickable Google Maps link built from it (see lib/utils/maps.ts) --
-- no Maps API key needed, just a maps.google.com search-by-address URL.

alter table orders add column delivery_address text;
