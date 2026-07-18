# Automated Tests

`pnpm test` (or `pnpm test:watch` while developing) runs the Vitest suite. As of RC2: 78 tests across 8 files, all passing, covering the five areas called out for RC2 — the Status Engine, Permissions, Notifications, Order Creation, and Material Requests.

## What's covered and how

| Area | File(s) | Approach |
|---|---|---|
| Status Engine | `lib/status/engine.test.ts` | Exhaustive: every declared transition in `ORDER_STATUS_TRANSITIONS` is asserted to succeed, and every *undeclared* from→to pair across all 8 statuses is asserted to throw `InvalidStatusTransitionError`. Pure functions, no mocking needed. |
| Permissions | `lib/auth/guards.test.ts` | Behavioral: mocks `next/headers`, `next/navigation`, `lib/auth/session`, and `lib/demo/mode`, then exercises `requireAdmin`/`requireEmployee`/`requireSession`/`getSession` across authenticated-admin, authenticated-employee, unauthenticated, tampered-token, and Demo Mode cases — including confirming a role mismatch redirects rather than granting access. |
| Notifications | `lib/notifications/templates.test.ts`, `lib/notifications/constants.test.ts` | Every template (all 11: 6 customer + 5 employee) rendered in both languages; variable interpolation and company-name/pickup-location defaults verified; `normalizeNotificationPreferences` tested for partial/legacy/null input handling. |
| Order Creation | `lib/validation/order.test.ts` (schema), `lib/actions/orders.test.ts` (behavior) | Schema: every field's valid/invalid boundary (blank required fields, over-length strings, non-integer/negative quantity, invalid enums, malformed UUIDs, incomplete nested preferences object). Behavior: `createOrder` exercised against a mocked Supabase client — happy path (order created, audited, customer notified, broadcast fired), server-side validation rejecting a request the client shouldn't have been able to send, a surfaced database error, Demo Mode's write block, and the admin-auth guard running before any database access. |
| Material Requests | `lib/validation/material-request.test.ts` (schema), `lib/actions/material-requests.test.ts` (behavior) | Schema: material type/priority enums, description/quantity/note length and blankness rules. Behavior: `approveMaterialRequest`/`rejectMaterialRequest` exercised against a mocked Supabase client — the core "only a pending request can be approved/rejected" guard (rejecting an already-approved or already-rejected request), successful approval firing an audit entry + broadcast, the employee notification path when a request is tied to an order, and Demo Mode's write block. |

## How the mocking works

Nothing in this suite talks to a real Supabase project — this project's Server Actions are plain async functions with `"use server"`, so they're directly importable and callable from a test without any Next.js request/route machinery. Two patterns handle the rest:

- **`server-only` alias** (`vitest.config.ts` → `test/stubs/server-only.ts`): the real `server-only` package throws unconditionally outside Next.js's bundler-level client/server split, which Vitest (running under plain Node) doesn't have. Every module using it gets the stub instead.
- **Minimal chainable Supabase mock** (duplicated locally in `lib/actions/orders.test.ts` and `lib/actions/material-requests.test.ts`): a `.from(table)` call returns an object where every builder method (`.select()`, `.eq()`, `.update()`, `.insert()`, `.single()`, …) returns itself, and awaiting it at any point resolves to the next queued `{ data, error }` response configured for that table. This mirrors the real `@supabase/supabase-js` builder's thenable-chaining shape closely enough to exercise real business logic (the pending-only guard, the audit/notify/broadcast side effects) without needing the full client.

## What's intentionally not covered

- **Component/UI tests.** Every dashboard was instead verified via Demo Mode + Playwright in a real browser (see `ARCHITECTURE.md`'s Demo Mode section) throughout every phase of this build — that remains the UI verification method; this suite is for business logic.
- **Real Supabase integration tests.** The mocked-client tests above verify the *code's* behavior, not that the real schema accepts the same calls — that was separately verified once via a live SQL simulation against the real project for the full golden-path (see `QA_REPORT_v1.0.0.md` §2), not as part of this repeatable suite.
- **Employee Management, Reports, Operations Control Center, etc.** RC2 scoped automated tests to the five areas explicitly requested. Extending coverage to newer modules (Employee Management's role/last-admin guard would be a good next candidate, following the same mocked-client pattern as Material Requests) is straightforward future work, not architecturally blocked.
