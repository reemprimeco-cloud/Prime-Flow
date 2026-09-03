# Customer Design Approval

Lets a manager send the customer a public, unauthenticated link to review the
uploaded design files/product images for their order and either approve them
or request changes — before production starts.

## How it works

1. On an order's detail drawer (`components/orders/order-detail-drawer.tsx`),
   once at least one product image or design file has been uploaded, a
   manager clicks **Send for Approval** (`requestDesignApproval` in
   `lib/actions/design-approval.ts`). This:
   - Issues a fresh random token (`orders.design_approval_token`) — a
     previously-sent link stops working once a new one goes out.
   - Sets `orders.design_approval_status` to `pending`.
   - WhatsApps the customer a link to `/approve/[token]`
     (`notifyCustomerDesignApprovalRequested` in
     `lib/notifications/service.ts`) — sent regardless of the order's
     per-status notification preference toggles, since it's a manually
     triggered, action-required message rather than a routine update.
2. The customer opens the public page (`app/approve/[token]/page.tsx` +
   `components/public/design-approval-view.tsx`) — no login, the token
   itself is the credential — and reviews the design files, then taps
   **Approve Design** or **Request Changes** (with a required note).
   `respondToDesignApproval` updates `design_approval_status` to `approved`
   or `changes_requested`, stores the note, and notifies every active admin
   (`notifyAdminDesignApprovalResponded`) via push + WhatsApp.
   - **Approving also flips `orders.approved`** — the customer's yes *is*
     the production-approval gate's signal, so there's no separate manual
     toggle for a manager to remember. If the order was still unapproved
     (the default — see "Deferred initial notifications" below),
     approving is also the moment `sendOrderApprovedNotifications`
     (`lib/actions/orders.ts`) fires: the customer's "order received"
     confirmation and each assigned employee's job-assigned ping, both
     held back until now.
3. **While `pending` or `changes_requested`, Start Production is blocked** —
   enforced centrally in `applyOrderStatusTransition`
   (`lib/actions/status-transition.ts`), so it applies to both the employee
   dashboard and the manager's own "Start Production" click, not just
   employees (unlike the separate internal `orders.approved` gate — see
   `docs/STATUS_ENGINE.md`). A manager who genuinely needs to skip it can
   still use **Override Status**, which bypasses this function entirely.
4. The order detail drawer's "Design Approval" section shows the current
   status, the customer's note (if changes were requested), and a
   **Resend Link** button. The order card also shows a small "Awaiting
   Customer"/"Design Changes Requested" badge on `new` orders so it's
   visible at a glance on the board.

## Deferred initial notifications

A brand-new order defaults to unapproved (`orders.approved`, the
pre-existing "Production Approval" gate — see `docs/ARCHITECTURE.md`).
While it sits unapproved, nobody's told about it: `createOrder` skips both
the customer's "order received" confirmation and every assigned employee's
job-assigned ping. That deferred burst fires later, on whichever comes
first — a manager flipping the approval toggle on an edit, or the customer
approving a design approval link (which also flips the toggle, above). This
means a manager can safely send a design approval link right after creating
an order without any employee dashboard, or the customer, hearing about a
job that isn't actually confirmed yet.

## The 24h WhatsApp window

"Send for Approval" is often the *first* message this app ever sends a
given customer, so there's frequently no open 24h customer-service window
yet — Twilio rejects the freeform send with error 63016 ("outside the
allowed window") and it never arrives. `design_approval_requested` is
registered in `CONTENT_TEMPLATES`
(`lib/notifications/providers/twilio-whatsapp.ts`) so that, once
`TWILIO_TEMPLATE_DESIGN_APPROVAL_REQUESTED_SID` is set to a Meta-approved
Content SID, it bypasses the window entirely like the other templates —
see `docs/NOTIFICATIONS.md`. Until that's approved, the workaround is
simply having the customer message the WhatsApp business number first
(opens a 24h window for freeform sends).

## What the public page can see

`getDesignApprovalByToken` (`lib/actions/design-approval.ts`) returns a
narrow, public-safe shape — order number, customer name, product, the
design/product image files, and the current status/note. It never exposes
`customer_mobile`, internal notes, assigned employees, or anything else from
the full `OrderDetail` shape.

## Not built here

- Per-file approval — this is order-level (one status for the whole design
  approval), not tracked per uploaded file.
- Expiring links — a token stays valid until a new one is issued for the
  same order (sending a fresh link invalidates the old one), not on a timer.
