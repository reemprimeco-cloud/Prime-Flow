# Public Order Request Form

A public, unauthenticated page (`/order-request`) a customer can fill out
themselves — name, mobile, product, quantity, delivery preference — and it
lands directly in the Manager dashboard's queue as a real `new` order, no
staff typing required.

## How it works

1. A customer opens `https://<your-domain>/order-request`
   (`app/order-request/page.tsx` + `components/public/order-request-form.tsx`)
   and fills in the form.
2. On submit, `submitOrderRequest` (`lib/actions/order-request.ts`) — no
   auth required — validates the input (`orderRequestSchema`,
   `lib/validation/order-request.ts`) and inserts a normal order row:
   - `status: "new"`, `approved: false` — the same production-approval
     gate every order goes through (see `docs/ARCHITECTURE.md`'s
     "Production Approval Gate"). Because it's unapproved, **no employee
     or customer notification fires yet** — the same deferred-notification
     behavior added for the design approval flow (see
     `docs/DESIGN_APPROVAL.md`).
   - `created_by` (on `orders`) and `uploaded_by` (on any attached
     `order_files`) are both `null` — there's no employee actor behind a
     public submission (`0023_public_order_request.sql` made both columns
     nullable for exactly this).
3. The order just sits in the manager dashboard's New Orders queue,
   identical to one an admin typed in by hand, until a manager reviews it —
   checks the details, assigns employees, sets priority/delivery specifics
   the form doesn't ask for — and approves it (or sends it through a
   design approval link first). Approving is what actually notifies the
   customer and any assigned employees.

## Getting the link to customers

This app never sends the `/order-request` link itself — that's the
**WhatsApp Business App's own auto-reply / greeting message / quick reply**
feature (configured on your phone in the WhatsApp Business App, or in Meta
Business Suite), completely separate from this app's Twilio integration.
No Twilio Content Template, no Twilio involvement at all: set your
auto-reply to a new incoming chat to include the link, e.g.

```
Thanks for reaching out! Submit your order details here and our team will confirm it shortly:
https://<your-domain>/order-request
```

## What the form doesn't ask for

Deliberately staff-only decisions, same reasoning as the "not built here"
notes on the design approval flow — a manager fills these in when
reviewing the request, not the customer: `priority` (always created
`normal`), `preferredLanguage`/`whatsappEnabled` (defaulted `ar`/`true`),
employee assignment, and Armada vs. internal delivery.
