# QuickBooks Online integration

Every QuickBooks Online invoice becomes a new order on the board as soon as it is created, the same way a WooCommerce order does (`ARCHITECTURE.md`). Payment is not a gate: the shop invoices from QuickBooks and its payment-gateway integration settles the balance later. The order's notes say whether the invoice was paid or carry the outstanding balance, so the manager sees it before approving.

## Flow

1. Intuit's webhook (`app/api/webhooks/quickbooks/route.ts`) is told an Invoice was created/updated — the payload carries only ids, never the invoice itself. The route verifies the `intuit-signature` HMAC against `QUICKBOOKS_WEBHOOK_VERIFIER`, acknowledges immediately, and runs the import after the response (`after()`) — Intuit expects a 2xx within a few seconds and retries otherwise.
2. `lib/quickbooks/import.ts` fetches the invoice. Already imported (`orders.source_ref` = invoice id) → ignored; QuickBooks sends an update event for every change (sent, paid, closed, edited), so this is the common path.
3. The customer record is fetched for the phone number (an invoice carries addresses but not a phone). `mapInvoiceToOrder` builds the order — pure, unit-tested.
4. The order lands as `new`, `approved: false`, with `notes` spelling out what still needs confirming before approval. Admins get the same "needs specs, assignment, and approval" alert a WooCommerce import sends.

## Field mapping

| Order | Invoice |
|---|---|
| Customer name | `CustomerRef.name` (fallback: customer `DisplayName`) |
| Mobile | Customer `Mobile`, else `PrimaryPhone` — `"N/A"` + WhatsApp off when neither exists |
| Product / quantity | First `SalesItemLineDetail` line: item name, `Qty` |
| Order details (`finishing`) | That line's `Description` — where size/paper/finishing get typed on the invoice |
| Additional items | Remaining product lines → `order_items` |
| Pickup vs delivery | Delivery when there's a shipping line (QuickBooks' `SHIPPING_ITEM_ID`, or an item named shipping/delivery) or a non-pickup Ship Method; with neither, delivery iff a Ship To address is present. QuickBooks copies the customer's default address onto every invoice, so this is a guess the notes ask the manager to confirm |
| Delivery address | `ShipAddr`, else the customer's, else `BillAddr` |
| Delivery date | `ShipDate` when set and not in the past, else 2 days out; time 17:00 |
| Notes | Invoice number/date, total, customer memo, item count |

**Not importing an invoice twice for a website order:** an invoice raised for an order that's already on the board (a WooCommerce order, say) is skipped when its customer memo or private note mentions an existing order number, e.g. `#1106`. That's the convention — write the board's order number on the invoice.

## Setup (one time)

Intuit Developer app (`developer.intuit.com`, signed in as the QuickBooks company owner):

1. Create an app → *QuickBooks Online and Payments* → scope **Accounting**.
2. **Keys & credentials → Production**: fill the required app URLs (the live dashboard URL works for all of them), add the redirect URI `https://flow.primekw.net/api/integrations/quickbooks/callback`, copy Client ID + Secret → `QUICKBOOKS_CLIENT_ID` / `QUICKBOOKS_CLIENT_SECRET`.
3. **Webhooks → Production**: endpoint `https://flow.primekw.net/api/webhooks/quickbooks`, entity Invoice, operations Create + Update; copy the Verifier Token → `QUICKBOOKS_WEBHOOK_VERIFIER`.
4. Deploy, then **Diagnostics → Connect QuickBooks** (admin only; `app/api/integrations/quickbooks/connect` → Intuit → `.../callback`). Authorize the company once.

## Tokens

`integration_tokens` (migration `0027`) holds the one connected company: realm id, access token (1h), refresh token (~100 days, **rotated on every refresh** — which is why this is a table and not an env var). `getValidAccessToken` refreshes a couple of minutes before expiry and persists the new pair. A refresh token lapses after 100 days without use; the Diagnostics page shows the expiry and turns the button into *Reconnect*.

The redirect URI is derived from the incoming request's host (`lib/quickbooks/oauth.ts`), so the same code works on the live domain and locally — whichever host the admin clicks Connect from must be registered on the Intuit app.

## Sandbox

`QUICKBOOKS_ENV=sandbox` targets `sandbox-quickbooks.api.intuit.com` and pairs with the app's Development keys and a sandbox company. Intuit sandbox webhooks fire the same payloads, so the whole flow can be rehearsed before production keys are approved.

## Testing

`lib/quickbooks/client.test.ts` (signature, authorize URL, token refresh), `lib/quickbooks/import.test.ts` (mapping, the unpaid note, the duplicate/website-reference gates, the insert), `app/api/webhooks/quickbooks/route.test.ts` (signature enforcement, acknowledgement, deferred processing). No live Intuit calls — `fetch` is mocked.
