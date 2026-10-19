# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **The owner-manager (admin).** Runs the shop and the board, switching between a laptop in the office and a phone on the move. Creates and approves orders, assigns them to staff, starts production, marks orders ready or delivered, sends design-approval links, and watches for anything running late. Currently one person (Reem) holds this role.
- **Production staff (employees).** Work the shop floor on their phones. They open the job's files, start it, hand it to the next person in the chain, request materials, and mark it ready. Roles in the system: `employee`, `supervisor`, `store`, `delivery`, plus outsourced workers and a per-person flag that lets a designer send customer design approvals.
- **Customers.** Never log in. They meet the product through WhatsApp messages, the public order-request form, the design-approval link, and the shop's TV board while they wait.

## Product Purpose

Prime Flow (internally "Prime Production Board") is the production control center for Prime Printing Co., a print shop in Kuwait. It tracks every print job from the moment it arrives to the moment it is picked up or delivered, across three surfaces: the manager dashboard, the employee floor screen, and an unattended TV board in the shop. It is deliberately not an ERP or CRM.

Success means the daily work moves fast: the manager and staff move orders forward with as few taps and as little waiting as possible, and nothing is late or lost along the way.

## Positioning

Built for this one shop's real workflow rather than a generic job tracker: orders arrive from the shop's own website (WooCommerce), its accounting system (QuickBooks invoices), a public request form, or manual entry, and they all land on one live board. Staff hand jobs to each other in a set sequence, customers get WhatsApp updates at each stage and approve designs from a link, and delivery can go out through Armada or in-house staff.

## Operating Context

- Live production floor in Kuwait (Asia/Kuwait time, KWD currency). Delivery dates and "late" countdowns drive the day.
- Order lifecycle: new → in progress (or waiting for materials) → ready for pickup / ready for delivery (or ready for internal pickup when outsourced) → collected / delivered. A design-approval gate can hold an order before production starts.
- Orders can carry several items, each with its own assignee and a per-item readiness check.
- Realtime: every connected screen updates without refresh when anything changes.
- Integrations in use: WooCommerce (website orders), QuickBooks Online (invoices become orders), Twilio WhatsApp (customer and staff messages), Armada (courier), Supabase (data and file storage), Netlify (hosting, Singapore region). Web push alerts for staff.
- Production URL: `flow.primekw.net`. The shop's storefront is `primekw.net`.

## Capabilities and Constraints

- Interface language for the manager and staff is **English only**, and stays that way. Arabic appears only in customer-facing places: WhatsApp messages and the public order-request form.
- Light theme throughout, including the TV board. No dark mode.
- The staff floor screen must work well on a phone; the manager screens must work on both a laptop and a phone.
- Customer and order data is shown only to staff, except the TV board, which shows customer names and order details by design and never phone numbers or notes.
- Changes ship through a pull request into the deploy branch; the owner approves every publish.

## Brand Commitments

- Company name: Prime Printing Co. Product name in use: Prime Flow.
- Logo: `public/logo.jpg` (also the app icon, `app/icon.jpg`).

## Evidence on Hand

- Real production data: around 110 orders to date, with staff, assignments, and status history.
- No testimonials, case studies, metrics claims, or press exist. Do not invent any.

## Product Principles

1. **Speed in daily operation comes first.** Every routine move (start, ready, assign, deliver) should take the fewest taps and never make anyone wait on things they didn't ask for.
2. **No order slips.** What's late, what's waiting, and who has it must be visible at a glance.
3. **Phone-first for the floor, both for the manager.** Staff screens are designed for one hand on a phone; manager screens hold up on a laptop and a phone.
4. **One board, many sources.** Website, invoice, form, or manual: every order looks and behaves the same once it lands.
5. **Customers stay informed without logging in.** Their touchpoints are WhatsApp, links, and the TV board, so those must be accurate and clear.
