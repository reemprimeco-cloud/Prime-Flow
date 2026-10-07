import crypto from "node:crypto";

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/guards";
import { buildAuthorizeUrl, isQuickBooksConfigured } from "@/lib/quickbooks/client";
import { buildCallbackUrl, OAUTH_STATE_COOKIE } from "@/lib/quickbooks/oauth";

export const runtime = "nodejs";

/**
 * Admin-only. Starts the one-time "Connect QuickBooks" OAuth flow — the
 * Diagnostics page links here, Intuit asks the admin to authorize the app
 * against the company file, then sends them back to ../callback.
 */
export async function GET(request: Request) {
  await requireAdmin();
  if (!isQuickBooksConfigured()) {
    return NextResponse.json({ error: "QuickBooks isn't configured — set QUICKBOOKS_CLIENT_ID and QUICKBOOKS_CLIENT_SECRET." }, { status: 503 });
  }

  const state = crypto.randomBytes(16).toString("hex");
  const response = NextResponse.redirect(buildAuthorizeUrl(buildCallbackUrl(request), state));
  response.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/api/integrations/quickbooks",
    maxAge: 10 * 60,
  });
  return response;
}
