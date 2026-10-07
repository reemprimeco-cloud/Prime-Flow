import { after, NextResponse } from "next/server";

import { verifyWebhookSignature } from "@/lib/quickbooks/client";
import { processQuickBooksWebhook, type QuickBooksWebhookPayload } from "@/lib/quickbooks/import";

/**
 * Receives QuickBooks Online's webhook (configured on the Intuit Developer
 * app: Webhooks → endpoint URL https://flow.primekw.net/api/webhooks/quickbooks,
 * entity Invoice, operations Create + Update). The payload only names which
 * invoices changed — the import fetches each one and acts only once it's
 * paid. See docs/QUICKBOOKS.md.
 *
 * Intuit expects a 2xx within a few seconds and retries otherwise, so the
 * import runs after the response via `after()`: it does several API calls
 * and sends notifications, which is longer than that budget.
 *
 * Node.js runtime — signature verification needs Node's `crypto` module.
 */
export const runtime = "nodejs";

export async function POST(request: Request) {
  const verifier = process.env.QUICKBOOKS_WEBHOOK_VERIFIER;
  const signature = request.headers.get("intuit-signature");
  const rawBody = await request.text();

  if (!verifier) {
    console.error("[quickbooks] QUICKBOOKS_WEBHOOK_VERIFIER not configured — rejecting webhook");
    return NextResponse.json({ error: "Not configured" }, { status: 403 });
  }
  if (!verifyWebhookSignature(rawBody, signature, verifier)) {
    console.error("[quickbooks] request failed signature verification");
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  let payload: QuickBooksWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    console.warn("[quickbooks] payload wasn't valid JSON");
    return NextResponse.json({ received: true });
  }

  after(() => processQuickBooksWebhook(payload).catch((error) => console.error("[quickbooks] webhook processing failed", error)));

  return NextResponse.json({ received: true });
}
