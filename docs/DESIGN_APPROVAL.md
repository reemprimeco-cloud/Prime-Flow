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
