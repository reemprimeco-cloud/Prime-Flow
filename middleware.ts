import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";
import { isDemoMode } from "@/lib/demo/mode";

/**
 * Every route in the `(manager)` route group — route groups don't add a URL
 * segment, so these are top-level paths, not nested under `/dashboard`.
 * Every one of these also calls `requireAdmin()` directly in its
 * page.tsx/Server Action (defense in depth, not the only line of defense),
 * but middleware catching it first means an unauthenticated visit redirects
 * before any render and preserves `?next=` for redirect-back after login.
 * Keep this list in sync with `app/(manager)/*`.
 */
const MANAGER_ROUTES = [
  "/dashboard",
  "/operations",
  "/calendar",
  "/workload",
  "/employees",
  "/material-requests",
  "/notifications",
  "/reports",
  "/archive",
  "/diagnostics",
];

export async function middleware(request: NextRequest) {
  if (isDemoMode()) {
    // Demo mode bypasses auth entirely — see lib/demo/mode.ts.
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;

  const isManagerRoute = MANAGER_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
  const isEmployeeRoute = pathname.startsWith("/employee");
  const isLoginRoute = pathname === "/login";

  if ((isManagerRoute || isEmployeeRoute) && !session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isManagerRoute && session && session.role !== "admin") {
    return NextResponse.redirect(new URL("/employee", request.url));
  }

  if (isEmployeeRoute && session && session.role === "admin") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (isLoginRoute && session) {
    const destination = session.role === "admin" ? "/dashboard" : "/employee";
    return NextResponse.redirect(new URL(destination, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/operations/:path*",
    "/calendar/:path*",
    "/workload/:path*",
    "/employees/:path*",
    "/material-requests/:path*",
    "/notifications/:path*",
    "/reports/:path*",
    "/archive/:path*",
    "/diagnostics/:path*",
    "/employee/:path*",
    "/login",
  ],
};
