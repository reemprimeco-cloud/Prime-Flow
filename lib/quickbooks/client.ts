import "server-only";
import crypto from "node:crypto";

import { createServiceClient } from "@/lib/supabase/server";

/**
 * QuickBooks Online API client — OAuth2 token lifecycle, the two reads the
 * import needs (invoice + customer), and webhook signature verification.
 * See docs/QUICKBOOKS.md.
 *
 * Env vars:
 *   QUICKBOOKS_CLIENT_ID / QUICKBOOKS_CLIENT_SECRET — from the Intuit
 *     Developer app. Both unset => the integration is off: the connect
 *     route refuses, the webhook rejects (403), nothing else changes.
 *   QUICKBOOKS_WEBHOOK_VERIFIER — the "Verifier Token" Intuit shows on the
 *     app's Webhooks page. Signs every webhook delivery.
 *   QUICKBOOKS_ENV — "production" (default) or "sandbox".
 *
 * Tokens live in integration_tokens (migration 0027), not env vars: the
 * refresh token rotates on every refresh, so it has to be writable.
 */

const AUTHORIZE_URL = "https://appcenter.intuit.com/connect/oauth2";
const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const SCOPE = "com.intuit.quickbooks.accounting";
const MINOR_VERSION = 75;
const PROVIDER = "quickbooks";
/** Refresh when the access token has less than this long left — a request that starts right before expiry still completes. */
const ACCESS_TOKEN_REFRESH_MARGIN_MS = 2 * 60 * 1000;

type ServiceClient = ReturnType<typeof createServiceClient>;

export class QuickBooksApiError extends Error {
  status?: number;
  body?: unknown;
}

function apiBase(): string {
  return process.env.QUICKBOOKS_ENV === "sandbox"
    ? "https://sandbox-quickbooks.api.intuit.com"
    : "https://quickbooks.api.intuit.com";
}

function clientCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.QUICKBOOKS_CLIENT_ID;
  const clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("QUICKBOOKS_CLIENT_ID / QUICKBOOKS_CLIENT_SECRET are not set — QuickBooks isn't configured.");
  }
  return { clientId, clientSecret };
}

export function isQuickBooksConfigured(): boolean {
  return !!process.env.QUICKBOOKS_CLIENT_ID && !!process.env.QUICKBOOKS_CLIENT_SECRET;
}

// ---------------------------------------------------------------------------
// OAuth2
// ---------------------------------------------------------------------------

export function buildAuthorizeUrl(redirectUri: string, state: string): string {
  const { clientId } = clientCredentials();
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPE);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  return url.toString();
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  /** Seconds. Intuit issues 1-hour access tokens. */
  expires_in: number;
  /** Seconds. Intuit issues ~100-day refresh tokens, rotated on every refresh. */
  x_refresh_token_expires_in: number;
}

async function requestTokens(params: Record<string, string>): Promise<TokenResponse> {
  const { clientId, clientSecret } = clientCredentials();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params).toString(),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new QuickBooksApiError(
      (body as { error_description?: string; error?: string } | null)?.error_description ||
        (body as { error?: string } | null)?.error ||
        `QuickBooks token request failed (${res.status})`
    );
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body as TokenResponse;
}

export function exchangeAuthorizationCode(code: string, redirectUri: string): Promise<TokenResponse> {
  return requestTokens({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
}

function refreshTokens(refreshToken: string): Promise<TokenResponse> {
  return requestTokens({ grant_type: "refresh_token", refresh_token: refreshToken });
}

// ---------------------------------------------------------------------------
// Token storage
// ---------------------------------------------------------------------------

export interface StoredTokens {
  realmId: string;
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: string;
  refreshExpiresAt: string;
}

export async function saveTokens(
  supabase: ServiceClient,
  realmId: string,
  tokens: TokenResponse,
  connectedBy: string | null
): Promise<void> {
  const now = Date.now();
  const { error } = await supabase.from("integration_tokens").upsert(
    {
      provider: PROVIDER,
      realm_id: realmId,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      access_expires_at: new Date(now + tokens.expires_in * 1000).toISOString(),
      refresh_expires_at: new Date(now + tokens.x_refresh_token_expires_in * 1000).toISOString(),
      ...(connectedBy ? { connected_by: connectedBy } : {}),
      updated_at: new Date(now).toISOString(),
    },
    { onConflict: "provider" }
  );
  if (error) throw new Error(error.message);
}

export async function loadTokens(supabase: ServiceClient): Promise<StoredTokens | null> {
  const { data } = await supabase
    .from("integration_tokens")
    .select("realm_id, access_token, refresh_token, access_expires_at, refresh_expires_at")
    .eq("provider", PROVIDER)
    .maybeSingle();
  if (!data) return null;
  return {
    realmId: data.realm_id,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    accessExpiresAt: data.access_expires_at,
    refreshExpiresAt: data.refresh_expires_at,
  };
}

/**
 * The access token to use right now — refreshed (and the rotated refresh
 * token persisted) when it's about to expire. Throws when QuickBooks was
 * never connected, or the refresh token itself has lapsed (100 days with no
 * activity): either way an admin has to click Connect again.
 */
export async function getValidAccessToken(supabase: ServiceClient): Promise<{ accessToken: string; realmId: string }> {
  const stored = await loadTokens(supabase);
  if (!stored) throw new Error("QuickBooks isn't connected — an admin needs to connect it from Diagnostics.");
  if (new Date(stored.refreshExpiresAt).getTime() <= Date.now()) {
    throw new Error("The QuickBooks connection has expired — an admin needs to reconnect it from Diagnostics.");
  }
  if (new Date(stored.accessExpiresAt).getTime() - Date.now() > ACCESS_TOKEN_REFRESH_MARGIN_MS) {
    return { accessToken: stored.accessToken, realmId: stored.realmId };
  }
  const refreshed = await refreshTokens(stored.refreshToken);
  await saveTokens(supabase, stored.realmId, refreshed, null);
  return { accessToken: refreshed.access_token, realmId: stored.realmId };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export interface QboRef {
  value: string;
  name?: string;
}

export interface QboAddress {
  Line1?: string;
  Line2?: string;
  Line3?: string;
  Line4?: string;
  Line5?: string;
  City?: string;
  CountrySubDivisionCode?: string;
  PostalCode?: string;
  Country?: string;
}

export interface QboInvoiceLine {
  DetailType?: string;
  Description?: string;
  Amount?: number;
  SalesItemLineDetail?: {
    ItemRef?: QboRef;
    Qty?: number;
    UnitPrice?: number;
  };
}

export interface QboInvoice {
  Id: string;
  DocNumber?: string;
  TxnDate?: string;
  ShipDate?: string;
  TotalAmt?: number;
  Balance?: number;
  CurrencyRef?: QboRef;
  CustomerRef?: QboRef;
  CustomerMemo?: { value?: string };
  PrivateNote?: string;
  BillAddr?: QboAddress;
  ShipAddr?: QboAddress;
  ShipMethodRef?: QboRef;
  Line?: QboInvoiceLine[];
}

export interface QboCustomer {
  Id: string;
  DisplayName?: string;
  PrimaryPhone?: { FreeFormNumber?: string };
  Mobile?: { FreeFormNumber?: string };
  ShipAddr?: QboAddress;
}

async function apiGet<T>(supabase: ServiceClient, path: string): Promise<T | null> {
  const { accessToken, realmId } = await getValidAccessToken(supabase);
  const url = `${apiBase()}/v3/company/${encodeURIComponent(realmId)}${path}${path.includes("?") ? "&" : "?"}minorversion=${MINOR_VERSION}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 404) return null;
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const fault = (body as { Fault?: { Error?: { Message?: string; Detail?: string }[] } } | null)?.Fault?.Error?.[0];
    const err = new QuickBooksApiError(fault?.Detail || fault?.Message || `QuickBooks API error (${res.status})`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body as T;
}

export async function fetchInvoice(supabase: ServiceClient, invoiceId: string): Promise<QboInvoice | null> {
  const body = await apiGet<{ Invoice?: QboInvoice }>(supabase, `/invoice/${encodeURIComponent(invoiceId)}`);
  return body?.Invoice ?? null;
}

export async function fetchCustomer(supabase: ServiceClient, customerId: string): Promise<QboCustomer | null> {
  const body = await apiGet<{ Customer?: QboCustomer }>(supabase, `/customer/${encodeURIComponent(customerId)}`);
  return body?.Customer ?? null;
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

/**
 * Intuit signs every delivery: `intuit-signature` = base64(HMAC-SHA256(verifier
 * token, raw body)). Same shape as the WooCommerce check — timing-safe
 * compare, fails closed on a missing header.
 */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null, verifier: string): boolean {
  if (!signatureHeader) return false;
  const expected = crypto.createHmac("sha256", verifier).update(rawBody, "utf8").digest("base64");
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(signatureHeader);
  if (expectedBuf.length !== actualBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}
