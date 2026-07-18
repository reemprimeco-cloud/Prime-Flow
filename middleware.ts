import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";
import { isDemoMode } from "@/lib/demo/mode";

export async function middleware(request: NextRequest) {
  if (isDemoMode()) {
    // Demo mode bypasses auth entirely — see lib/demo/mode.ts.
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;

  const isManagerRoute = pathname.startsWith("/dashboard");
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
  matcher: ["/dashboard/:path*", "/employee/:path*", "/login"],
};
