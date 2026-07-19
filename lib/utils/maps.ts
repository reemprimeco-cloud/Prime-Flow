/**
 * A plain search-by-address Google Maps URL — no Maps API key or geocoding
 * needed. Opening it (e.g. from a WhatsApp message) drops a pin on that
 * address and offers turn-by-turn directions from the driver's location.
 */
export function buildGoogleMapsLink(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}
