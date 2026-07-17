import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SESSION_COOKIE, verifySession, type SessionPayload } from "@/lib/auth/session";

/** Reads and verifies the session cookie for the current request. Null if absent/invalid. */
export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}

/** For Server Components/Actions on manager-only routes. Redirects otherwise. */
export async function requireAdmin(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/employee");
  return session;
}

/** For Server Components/Actions on the employee routes. Redirects otherwise. */
export async function requireEmployee(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "admin") redirect("/dashboard");
  return session;
}

/** Any authenticated employee record, admin or otherwise. Redirects if signed out. */
export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}
