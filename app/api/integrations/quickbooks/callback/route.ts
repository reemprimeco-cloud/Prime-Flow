import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/guards";
import { createServiceClient } from "@/lib/supabase/server";
import { recordAuditLog } from "@/lib/audit/log";
import { exchangeAuthorizationCode, saveTokens } from "@/lib/quickbooks/client";
import { buildCallbackUrl, OAUTH_STATE_COOKIE } from "@/lib/quickbooks/oauth";

export const runtime = "nodejs";

function backToDiagnostics(request: Request, result: "connected" | "error", message?: string) {
  const url = new URL("/diagnostics", request.url);
  url.searchParams.set("quickbooks", result);
  if (message) url.searchParams.set("message", message);
  const response = NextResponse.redirect(url);
  response.cookies.delete({ name: OAUTH_STATE_COOKIE, path: "/api/integrations/quickbooks" });
  return response;
}

/** Where Intuit sends the admin back after authorizing — exchanges the code for tokens and stores them. */
export async function GET(request: Request) {
  const session = await requireAdmin();
  const params = new URL(request.url).searchParams;

  const intuitError = params.get("error");
  if (intuitError) return backToDiagnostics(request, "error", intuitError);

  const code = params.get("code");
  const realmId = params.get("realmId");
  const state = params.get("state");
  const cookieHeader = request.headers.get("cookie") ?? "";
  const expectedState = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${OAUTH_STATE_COOKIE}=`))
    ?.slice(OAUTH_STATE_COOKIE.length + 1);

  if (!code || !realmId || !state || !expectedState || state !== expectedState) {
    return backToDiagnostics(request, "error", "The sign-in attempt didn't match — please try connecting again.");
  }

  try {
    const tokens = await exchangeAuthorizationCode(code, buildCallbackUrl(request));
    const supabase = createServiceClient();
    await saveTokens(supabase, realmId, tokens, session.employeeId);
    await recordAuditLog({
      actorId: session.employeeId,
      actorName: session.fullName,
      action: "employee_updated",
      entityType: "integration",
      entityId: "quickbooks",
      newValue: { provider: "quickbooks", realmId, connected: true },
    });
  } catch (error) {
    console.error("[quickbooks] token exchange failed", error);
    return backToDiagnostics(request, "error", error instanceof Error ? error.message : "Token exchange failed");
  }

  return backToDiagnostics(request, "connected");
}
