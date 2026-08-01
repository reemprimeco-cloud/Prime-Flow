/**
 * Strips invisible Unicode formatting characters (bidi embeddings/overrides/
 * isolates, zero-width marks — Unicode category Cf) from a phone number,
 * then trims. These sneak in when a number is copied from WhatsApp or an
 * iOS/Android contact card, which wrap digits in directional marks for
 * RTL-aware rendering — invisible on screen, but they break `tel:`/`wa.me`
 * links and any strict phone-format check downstream. The visible digits
 * are untouched either way.
 */
export function sanitizePhoneInput(value: string): string {
  return value.replace(/\p{Cf}/gu, "").trim();
}
