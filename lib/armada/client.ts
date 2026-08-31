import "server-only";
import crypto from "node:crypto";

/**
 * Armada Delivery API client.
 *
 * Env vars (see docs/ARMADA_DELIVERY.md and .env.local.example):
 *   ARMADA_API_KEY     — from Armada dashboard > Automated Ordering > your key > "Show secret"
 *   ARMADA_WEBHOOK_KEY — a random 12-32 char string YOU generate (NOT from Armada). Sent as
 *                         `order-webhook-key` on delivery creation, and echoed back by Armada
 *                         in the Authorization header of every webhook call — see
 *                         verifyArmadaWebhookKey and app/api/webhooks/armada/route.ts.
 *   ARMADA_ENV         — "production" | "staging", defaults to "production"
 *
 * Deliberately NOT stub-safe like the Twilio provider: a delivery that
 * silently no-ops would strand a real customer's order with nobody told to
 * deliver it. dispatchArmadaDelivery in lib/actions/status-transition.ts
 * catches failures from here and falls back to notifying internal delivery
 * staff instead, rather than pretending the dispatch worked.
 */

const BASE_URL: Record<"production" | "staging", string> = {
  production: "https://api.armadadelivery.com/v0",
  staging: "https://staging.api.armadadelivery.com/v0",
};

function baseUrl(): string {
  return BASE_URL[process.env.ARMADA_ENV === "staging" ? "staging" : "production"];
}

export function isArmadaConfigured(): boolean {
  return !!process.env.ARMADA_API_KEY && !!process.env.ARMADA_WEBHOOK_KEY;
}

export class ArmadaApiError extends Error {
  status?: number;
  body?: unknown;
}

async function armadaFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const apiKey = process.env.ARMADA_API_KEY;
  if (!apiKey) throw new Error("ARMADA_API_KEY is not set — Armada delivery isn't configured.");

  const res = await fetch(`${baseUrl()}${path}`, {
    ...options,
    headers: {
      Authorization: `Key ${apiKey}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new ArmadaApiError((body as { message?: string } | null)?.message || `Armada API error (${res.status})`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body as T;
}

/**
 * Normalizes a Prime Flow customer_mobile value to E.164 for Armada, which
 * requires it. Prime Flow only sanitizes invisible formatting characters on
 * input (see lib/utils/phone.ts) — it doesn't enforce a leading "+". Since
 * the business operates in Kuwait, a number with no country code is assumed
 * local and given +965; anything already starting with "+" is passed
 * through as-is (trusting whatever country code the customer's number
 * actually carries).
 */
export function toE164KuwaitPhone(rawPhone: string): string {
  const digitsAndPlus = rawPhone.replace(/[^\d+]/g, "");
  if (digitsAndPlus.startsWith("+")) return digitsAndPlus;
  return `+965${digitsAndPlus.replace(/^0+/, "")}`;
}

export interface CreateArmadaDeliveryInput {
  orderId: string;
  customerName: string;
  /** Raw Prime Flow customer_mobile — normalized to E.164 internally. */
  customerPhone: string;
  /** Required only when paymentType is "cash" — the amount the driver collects on delivery. */
  amount?: number | null;
  paymentType: "paid" | "cash";
  latitude?: number | null;
  longitude?: number | null;
  /** Best-effort single-field address fallback when no lat/lng pin is available — see parseLatLngFromMapsLink. */
  area?: string | null;
  instructions?: string | null;
}

export interface ArmadaDeliveryResult {
  /** Armada's delivery id — store on the order (armada_delivery_code) to match webhook callbacks back to it. */
  code: string;
  status: string;
  trackingLink: string | null;
  deliveryFee: number | null;
}

interface ArmadaCreateDeliveryResponse {
  code: string;
  status?: string;
  trackingLink?: string | null;
  deliveryFee?: number | null;
}

/** Creates a delivery for a Prime Flow order ready for dispatch. Throws ArmadaApiError on failure — callers decide the fallback. */
export async function createArmadaDelivery(order: CreateArmadaDeliveryInput): Promise<ArmadaDeliveryResult> {
  const webhookKey = process.env.ARMADA_WEBHOOK_KEY;
  if (!webhookKey) throw new Error("ARMADA_WEBHOOK_KEY is not set — Armada delivery isn't configured.");

  const platformData: Record<string, unknown> = {
    orderId: order.orderId,
    name: order.customerName,
    phone: toE164KuwaitPhone(order.customerPhone),
    paymentType: order.paymentType,
  };
  if (order.paymentType === "cash" && order.amount != null) platformData.amount = String(order.amount);
  if (order.instructions) platformData.instructions = order.instructions;

  if (order.latitude != null && order.longitude != null) {
    platformData.location = { latitude: order.latitude, longitude: order.longitude };
  } else if (order.area) {
    platformData.area = order.area;
  }

  const result = await armadaFetch<ArmadaCreateDeliveryResponse>("/deliveries", {
    method: "POST",
    headers: { "order-webhook-key": webhookKey },
    body: JSON.stringify({ platformName: "primeflow", platformData }),
  });

  return {
    code: result.code,
    status: result.status ?? "pending",
    trackingLink: result.trackingLink ?? null,
    deliveryFee: result.deliveryFee ?? null,
  };
}

export async function getArmadaDelivery(code: string): Promise<unknown> {
  return armadaFetch(`/deliveries/${encodeURIComponent(code)}`, { method: "GET" });
}

/** Cancels an in-flight Armada delivery. Throws ArmadaApiError on any non-200 response. */
export async function cancelArmadaDelivery(code: string): Promise<void> {
  const apiKey = process.env.ARMADA_API_KEY;
  if (!apiKey) throw new Error("ARMADA_API_KEY is not set — Armada delivery isn't configured.");

  const res = await fetch(`${baseUrl()}/deliveries/${encodeURIComponent(code)}/cancel`, {
    method: "POST",
    headers: { Authorization: `Key ${apiKey}` },
  });
  if (res.status === 200) return;

  const body = await res.json().catch(() => null);
  const err = new ArmadaApiError((body as { message?: string } | null)?.message || `Armada cancel failed (${res.status})`);
  err.status = res.status;
  err.body = body;
  throw err;
}

/**
 * Best-effort lat/lng extraction from a pasted Google Maps link (Prime
 * Flow's `delivery_map_link` field — see 0016_order_delivery_map_link.sql).
 * Handles the two common pin-share formats (`@lat,lng,zoom` and
 * `?q=lat,lng`); returns null for a plain address-search link or a
 * shortened maps.app.goo.gl link, which can't be parsed without following
 * a redirect. Callers fall back to the free-text address in that case.
 */
export function parseLatLngFromMapsLink(mapLink: string | null | undefined): { latitude: number; longitude: number } | null {
  if (!mapLink) return null;
  const atMatch = mapLink.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (atMatch) return { latitude: Number(atMatch[1]), longitude: Number(atMatch[2]) };
  const qMatch = mapLink.match(/[?&]q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (qMatch) return { latitude: Number(qMatch[1]), longitude: Number(qMatch[2]) };
  return null;
}

/**
 * Verifies the `Authorization` header Armada echoes back on every webhook
 * call against ARMADA_WEBHOOK_KEY (the random secret we sent them at
 * delivery-creation time — see createArmadaDelivery). Timing-safe compare,
 * same approach as the WooCommerce webhook's HMAC check
 * (app/api/webhooks/woocommerce/route.ts). Fails closed: no configured key
 * or no header both return false.
 */
export function verifyArmadaWebhookKey(headerValue: string | null): boolean {
  const expected = process.env.ARMADA_WEBHOOK_KEY;
  if (!expected || !headerValue) return false;
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(headerValue);
  if (expectedBuf.length !== actualBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}
