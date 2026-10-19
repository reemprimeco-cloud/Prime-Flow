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

/**
 * The identity of a phone number, independent of how it was typed: digits
 * only (Arabic-Indic digits folded to ASCII), with Kuwait's country code
 * dropped — so "+965 5000 1111", "+96550001111", "0096550001111" and
 * "50001111" all give "50001111". Stored numbers mix all of these formats,
 * so two orders belong to the same customer when their keys match, not
 * their raw strings. Non-Kuwaiti numbers keep their full digits.
 */
export function phoneKey(value: string): string {
  let digits = value
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("965"))
    digits = digits.slice(3);
  return digits;
}

/**
 * What groups orders into one customer: the phoneKey for a real number, or
 * the raw string for a placeholder too short to be one ("N/A").
 */
export function customerKey(mobile: string): string {
  const key = phoneKey(mobile);
  return key.length >= 8 ? key : mobile;
}
