---
target: dashboard
total_score: 22
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/home/user/Prime-Flow/app/(manager)/dashboard/page.tsx"
target_fingerprint: "sha256:f85b557f6e87a5637393464025341aacd9df91e1be3a3afb13ccecd68b407793"
target_path: /home/user/Prime-Flow/app/(manager)/dashboard/page.tsx
timestamp: 2026-10-19T17-03-21Z
slug: app-manager-dashboard-page-tsx
---
Method: dual-agent (A: design review · B: detector + browser overlay)

## Design Health Score — 22/40 (Acceptable)

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | Realtime + live countdowns strong; lateness not promoted; blocked actions look available |
| 2 | Match System / Real World | 2 | "Production line" stacks vertically; hours-only countdowns ("73h late"); three meanings of "pending" |
| 3 | User Control and Freedom | 3 | Back to Queue + Override exist; no undo on quick status moves |
| 4 | Consistency and Standards | 2 | Tile tones contradict chip colors; green confirm for Start; One Navy rule broken (5 navy buttons in first viewport) |
| 5 | Error Prevention | 2 | Start Production offered on approval-blocked orders; Ready (notifies customer) unguarded while Start is guarded |
| 6 | Recognition Rather Than Recall | 3 | Good labels; kebab invisible until hover; icon-only view toggle |
| 7 | Flexibility and Efficiency | 1 | No shortcuts beyond ⌘K; confirm on every Start; list view (best triage) has no row actions |
| 8 | Aesthetic and Minimalist Design | 2 | Greeting + 7 tiles + 5 nav-duplicating buttons precede the work |
| 9 | Error Recovery | 2 | Server reason arrives as a toast only after the card already moved |
| 10 | Help and Documentation | 2 | Terse inline hints only |

## Design Specificity
~70% generic SaaS admin frame (greeting, 7 KPI tiles, quick-action row, filter bar, 12-item sidebar) with a genuine print-shop layer (countdown pill with words, material-request strip, Pickup/Delivery/Armada chips, mono order numbers, hand-off order in assign). Board stacks statuses vertically, contradicting DESIGN.md's "flows left to right"; nothing is ordered by deadline.
Detector: CLI 5 advisory findings (off-scale font sizes: manager-shell.tsx:81 17px, sidebar-nav.tsx:60 9px, mobile-tab-bar.tsx:56,71 10px, order-form.tsx:468 11px), all true positives. Browser overlay: 26 desktop / 8 list / 31 mobile — side-tab stripe ×9 (order-card.tsx:84), low contrast: status chips 1.9:1 amber / 2.0:1 green / 3.1:1 red on own tint (order-status-badge.tsx:8-12), white on red 3.8:1 (Urgent, late pill), muted-on-muted 4.3:1 (count chips), "Qty:" labels 2.7:1; 10px tab labels on mobile.

## Priority Issues
- [P1] Late/at-risk orders not first; Delayed tile not clickable; on phone first order at y≈1345px behind tiles + 5 quick actions that duplicate nav. Fix: one deadline-sorted "Needs attention" strip first; compact clickable count chips; drop nav-duplicate quick actions. → /impeccable layout, then /impeccable distill
- [P1] Start Production offered on approval-blocked orders (order-card.tsx QUICK_TARGETS, drawer StatusActions ignore designApprovalStatus; server refuses at status-transition.ts:129-137). Fix: swap for "Customer approved" / "Resend link" or disabled "Waiting on customer". → /impeccable harden
- [P1] Status colors contradict each other and tinted chips fail contrast (1.9–3.1:1). Fix: dark ink on tints (#92400e / #166534 / #b91c1c), tile tones = status colors, navy Start confirm, approval badges as tints, stripe follows blocked status. → /impeccable colorize
- [P2] Touch targets under 44px; kebab opacity-0 on touch (Edit/Duplicate/Delete undiscoverable); 20px checkbox; 36px card buttons; 32px view toggle. → /impeccable adapt
- [P2] Friction misplaced: confirm on every Start with generic/false WhatsApp copy; Ready unguarded; list view has no row actions; no keyboard shortcuts. Fix: undo toast holding the WhatsApp send; specific confirm copy; row actions. → /impeccable clarify

## Persona Red Flags
Alex: no start/ready/assign shortcuts; 2 clicks + modal per Start; list view can't act on rows; bulk via 20px checkboxes.
Sam: unlabeled checkbox ×11; nameless thumbnail button; status chip text fails contrast so meaning rests on hue; card body is click-only div.
Reem (phone): ~1,345px scroll to first order; 4 stacked filter rows; invisible kebab; 36px buttons; customer phone not a tel: link; assign shows no staff load and lists the admin herself.

## Minor Observations
Greeting/date use server timezone; Ready orders still show shop-urgency countdown; "Completed This Month" mixed into live counts; empty sections render full "Nothing here" cards; empty-filter state lacks Clear filters; drawer header omits design-approval state; off-scale 9/10/11/17px type.

## Questions to Consider
- Why does Reem see a greeting and seven numbers before the order that's already 20 minutes late?
- Should the default be a true left-to-right production line or the deadline-sorted list that already triages better?
- Why does starting a job need "are you sure?" while telling a customer their order is ready needs nothing?
