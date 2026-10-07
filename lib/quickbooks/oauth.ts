export const OAUTH_STATE_COOKIE = "qbo_oauth_state";

/**
 * The redirect URI registered on the Intuit app must match this exactly —
 * derived from the request so it's right on every host (the live domain,
 * Netlify's own subdomain, local dev) rather than hard-coded.
 */
export function buildCallbackUrl(request: Request): string {
  const host = request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}/api/integrations/quickbooks/callback`;
}
