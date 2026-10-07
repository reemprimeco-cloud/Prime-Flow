export const OAUTH_STATE_COOKIE = "qbo_oauth_state";

/**
 * The redirect URI registered on the Intuit app must match this exactly —
 * `QUICKBOOKS_REDIRECT_URI` when set, otherwise derived from the request so
 * it's right on every host (the live domain, Netlify's own subdomain, local dev).
 */
export function buildCallbackUrl(request: Request): string {
  // An explicit override wins: behind Netlify's proxy the request's own host
  // can differ from the public domain, and Intuit needs an exact match.
  const configured = process.env.QUICKBOOKS_REDIRECT_URI?.trim();
  if (configured) return configured;

  const host = request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}/api/integrations/quickbooks/callback`;
}
