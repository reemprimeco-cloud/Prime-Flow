/**
 * `redirect()` inside a Server Action reaches the client as a *thrown
 * error* carrying a NEXT_REDIRECT digest. It's control flow, not a
 * failure — so any `try/catch` around a Server Action call has to let it
 * through, or it both cancels the navigation and shows the user Next's
 * internal digest string as if it were an error message.
 *
 * This bit us twice: a successful login reported "Couldn't reach the
 * server" (the redirect to /dashboard was swallowed after the session
 * cookie had already been set), and enabling push alerts as an admin
 * showed a literal "NEXT_REDIRECT" toast.
 */
export function isRedirectError(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}
