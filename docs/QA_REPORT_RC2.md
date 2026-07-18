# Prime Production Board — Release Candidate 2 (v1.0.0-rc2) QA Report

**Date:** 2026-07-18
**Scope:** The four priority tasks assigned after `QA_REPORT_v1.0.0.md`: Employee Management, Deployment Verification, Large Dataset Support, and Automated Tests. This report assumes that one as prior context and only restates what changed.

**Bottom line up front:** 3 of 4 priority tasks are complete and verified. The 4th — Deployment Verification — is **partially complete**: the production infrastructure (Netlify site, all environment variables, the real Supabase connection) is provisioned and ready, but the actual code deploy could not be completed from this sandbox, so live end-to-end verification against a real hosted URL did not happen. Per your own instruction ("Only after RC2 passes should the application be labeled Version 1.0.0"), **RC2 does not fully pass yet** — not because of a code defect, but because one task has a concrete, external blocker that needs about 10–15 minutes of action outside this sandbox to close out. Everything else is genuinely done.

---

## 1. Employee Management — ✅ Complete

A full admin module replacing the read-only roster from v1.0.0:

- **Create / Edit / Change Role**: `createEmployee`/`updateEmployee` (`lib/actions/employees.ts`), Zod-validated (`lib/validation/employee.ts`), one dialog handling both modes (`components/manager/employee-form-dialog.tsx`).
- **Reset Password**: `resetEmployeePassword` — bcrypt-hashed, never logs the password/hash itself (a dedicated `employee_password_reset` audit action instead, deliberately payload-free).
- **Activate / Deactivate**: `setEmployeeActive`, one click from the row menu. Deactivation alone is sufficient to block login — `login()` already gated on `employee.active` since v1.0.0, so no schema gap existed here.
- **Search / Filters**: client-side search (name/username/phone) + role filter + active/inactive filter (`components/manager/employees-client.tsx`), matching the pattern used by Notification Center and Workload.
- **Audit Log integration**: 3 new `audit_action` enum values (`employee_created`, `employee_updated`, `employee_password_reset` — migration `0009`), every mutation logged, and `describeAuditEntry`/the Activity Feed/order timeline icon map all updated so these show up correctly in the existing Activity Feed and Live Production Timeline infrastructure rather than needing a new surface.
- **Safety guard (new, not explicitly requested but a direct consequence of building real admin controls):** `assertKeepsAnActiveAdmin` refuses any role change or deactivation that would leave the shop with zero active administrators — an unrecoverable-lockout guard, checked before every `updateEmployee`/`setEmployeeActive` call.

**Verified:** `tsc`/`eslint`/`next build` clean. Playwright in Demo Mode: roster renders with search/filters, create dialog shows correct inline validation (username <3 chars, blank full name, password <8 chars all correctly flagged), row action menu shows Edit/Reset Password/Activate-Deactivate, and submitting a valid create correctly surfaces the "read-only demo" block with the form data preserved — confirming the full request/response cycle works, not just the UI shell.

## 2. Deployment Verification — ⚠️ Partially complete

### What was attempted and why Vercel isn't the platform

Investigated first: no Vercel CLI or token exists in this environment, and the sandbox's network egress proxy returns a hard 403 for `vercel.com` — confirmed via `/root/.ccr/README.md`, which is explicit that a host blocked by organization policy should be reported, not retried or routed around. I raised this with you; your answer was to try Netlify instead, which — unlike Vercel — has working MCP tools available in this session.

### What Netlify deployment actually accomplished

1. **Site provisioned**: `prime-production-board` (site ID `fa42a94c-cf42-4882-85c4-5a1869a98eea`), created in the same Netlify team as your other `prime-*` projects — dashboard: https://app.netlify.com/projects/prime-production-board
2. **All required production environment variables set** on that site (see `ENVIRONMENT_VARIABLES.md` for what each does):
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — pointing at the real project (`hodqbuewaivgkgrcjrzi.supabase.co`)
   - `SUPABASE_SERVICE_ROLE_KEY` — marked secret
   - `SESSION_SECRET`, `CRON_SECRET` — **freshly generated for this deployment**, not reused from the dev `.env.local`, per `DEPLOYMENT_CHECKLIST.md`'s own instruction. Marked secret.
   - `DEMO_MODE=false`, `NEXT_PUBLIC_DEMO_MODE=false` — real auth, not the demo bypass.
3. **The actual code deploy failed.** Three attempts (one before committing RC2's work, two after — a clean git state was one legitimate hypothesis for the retry, not a blind repeat) all failed identically at the upload/build step with `Error: Failed to deploy site: 403 Forbidden` from `zipAndBuild`. This is **not** the same failure class as the Vercel block: the proxy's own failure log (`$HTTPS_PROXY/__agentproxy/status`) shows zero rejected connections to any `netlify.app`/`netlify.com` host, meaning the network path itself was open — the 403 is coming from Netlify's own upload endpoint, most likely a permission/auth-scope mismatch specific to the one-shot proxy-token flow this MCP tool uses. I don't have visibility into Netlify's server-side logs to diagnose further than that, and three identical failures is where I stopped rather than keep guessing.

### What this means and what's needed to finish

The **infrastructure is deploy-ready right now** — someone with a working Netlify login just needs to push the actual code. Two ways to do that, either takes a few minutes:

- **Fastest**: from a machine with normal internet access, `cd` into this repo and run `netlify login && netlify link --id fa42a94c-cf42-4882-85c4-5a1869a98eea && netlify deploy --prod`. Netlify auto-detects Next.js and installs its official Next.js Runtime during that build — no `netlify.toml` was needed for this repo.
- **More robust long-term**: connect the site to this GitHub repo (`reemprimeco-cloud/prime-flow`, branch `claude/prime-printing-system-mtezgz` or wherever you merge to) via Netlify's dashboard for continuous deployment, instead of one-off CLI pushes.

Once deployed, the verification checklist below is what's outstanding — I've structured it so it's a quick pass for whoever finishes the deploy, not a research task:

| Scenario | What to check | Why it specifically matters here |
|---|---|---|
| Login | Log in as the seeded admin/employee accounts against the **real** Supabase project (not Demo Mode) | First real exercise of the custom JWT auth path outside code review |
| Realtime | Two browser sessions (manager + employee), confirm a status change on one appears on the other within ~1s | First real exercise of Supabase Realtime Broadcast — this sandbox has never been able to open a real websocket to Supabase (confirmed blocked, same as the app-level HTTPS block) |
| File Upload | Upload a product image / design file on an order, confirm it appears via signed URL on the Manager Dashboard, Employee Dashboard, and TV Dashboard | First real exercise of Supabase Storage |
| Notifications | Approve a material request or advance an order to Ready for Pickup with WhatsApp enabled, confirm a `notification_logs` row appears with status `sent`/`skipped` as expected (Twilio isn't configured, so `skipped` with `"Twilio credentials not configured"` is the correct outcome unless you also set the three `TWILIO_*` env vars) | First real exercise of the notification dispatch path end-to-end |
| TV Dashboard | Load `/tv` unauthenticated, confirm it updates live as orders change | Confirms the no-auth kiosk route + realtime together |
| Employee Dashboard | Full job lifecycle: assigned → in progress → material request → approved → resumed → ready → collected, on the real deployment | This exact sequence was validated at the database/constraint level via a SQL simulation against the real project (see `QA_REPORT_v1.0.0.md` §2) — this step is the first time it will run through the actual application code end-to-end |
| Manager Dashboard | Create/edit/duplicate/delete an order, bulk actions, Global Search, Employee Management (new this phase), pagination on a filtered view | Confirms everything built across every phase together, live |

I'd rather hand you an honest "here's exactly what's left and how to finish it" than claim a live deployment I can't actually verify happened.

## 3. Large Dataset Support — ✅ Complete

**Chosen architecture: page-based pagination**, not infinite scroll or virtualization. Reasoning:

- The actual bottleneck identified in `QA_REPORT_v1.0.0.md` §6 was an **unbounded database query** (`getOrders()` fetched every non-archived order every time, with no `.limit()`), not a rendering-performance problem. Virtualization alone (react-window/react-virtual) only helps DOM rendering — it wouldn't touch the query cost, so it wouldn't have fixed the actual risk that was flagged.
- Infinite scroll shares pagination's query-shaping benefit, but accumulates pages in client memory and is meaningfully harder to keep correct under this app's realtime invalidation (a background broadcast reflowing an already-scrolled, partially-loaded list is a real source of subtle bugs) and under bulk-select (what does "select all" mean against an open-ended, growing list?).
- Page-based pagination bounds both the query and the DOM trivially, and React Query's existing `invalidateQueries` pattern (already used everywhere in this app) just refetches the current page cleanly on a realtime event — no new state-management concept introduced.

**What changed:**
- `getOrders()` now takes `page`/`pageSize` and returns `{ items, totalCount, page, pageSize }` instead of an unbounded array, using Supabase's `.range()` + `{ count: "exact" }` — one round trip, not two.
- The `employeeId` filter (previously applied client-side *after* fetching, which would have silently under-filled or emptied pages once real pagination was added) now resolves the employee's order IDs first and folds them into the same paginated SQL query — verified this specific correctness concern before shipping it, not discovered after.
- `page` is URL-synced via `nuqs` (consistent with every other filter on this dashboard) and resets to 1 whenever a real filter changes, so "page 3" of a brand-new narrower filter can't render an incorrectly-empty page.
- Pagination controls (Previous/Next, "Page X of Y", "A–B of N") added below both the card and list views.

**Verified:** `tsc`/`eslint`/`next build` clean. Since the demo dataset (~20 orders) is smaller than the default page size (25) and couldn't demonstrate multiple pages as-is, I temporarily set the page size to 5, ran a full Playwright pass confirming page 1 → Next → page 2 showed genuinely different orders (not the same data re-rendered), Previous correctly returned to page 1, the URL (`?page=2`) synced correctly including direct navigation, and list-view pagination worked identically — then reverted the page size to 25 and re-verified clean. Zero console errors throughout.

**What this does not fix** (documented, not silently left implicit): `getDashboardStats()` still fetches every non-archived order's status/delivery fields in one unbounded query to compute the stat-card counts client-side. This is a narrower, lighter-weight query than the old `getOrders()` (4 columns, not the full order shape) and wasn't the risk `QA_REPORT_v1.0.0.md` flagged, but it's the same *shape* of risk at large enough scale. Left out of this task's scope deliberately — pushing the "orders delayed" comparison (which needs a per-row `delivery_date + delivery_time < now()` check) into pure SQL is a reasonable follow-up, not a required fix for this pass.

## 4. Automated Tests — ✅ Complete

Vitest suite, **78 tests across 8 files, all passing**, plus `tsc`/`eslint`/`next build` all clean with the suite in place. Full breakdown in `docs/TESTING.md`; summary:

| Area | Coverage |
|---|---|
| Status Engine | Exhaustive — every declared transition asserted to succeed, every undeclared from→to pair across all 8 statuses asserted to throw |
| Permissions | Behavioral — `requireAdmin`/`requireEmployee`/`requireSession`/`getSession` under authenticated-admin, authenticated-employee, unauthenticated, tampered-token, and Demo Mode, including confirming a role mismatch redirects rather than granting access |
| Notifications | All 11 templates × 2 languages render correctly with variable interpolation and default fallbacks; preference normalization tested for null/partial/legacy input |
| Order Creation | Schema (every field's valid/invalid boundary) + behavioral (`createOrder` against a mocked Supabase client: happy path with audit/notify/broadcast side effects, server-side validation catching what the client shouldn't have sent, a surfaced database error, Demo Mode's write block, auth-before-database-access ordering) |
| Material Requests | Schema + behavioral (`approveMaterialRequest`/`rejectMaterialRequest` against a mocked Supabase client: the core "only pending requests can be approved/rejected" guard, successful approval's audit/broadcast/notify side effects, Demo Mode's write block) |

No real Supabase project is touched by this suite — every Server Action test uses a small hand-built chainable mock matching the real `@supabase/supabase-js` builder shape closely enough to exercise actual business logic (the pending-only guard, the last-active-admin lockout, etc.) without needing a live connection. This is a deliberate, documented boundary (see `TESTING.md`'s "What's intentionally not covered"): this suite verifies the *code's* behavior; the *schema's* behavior under those same calls was separately verified once via the live SQL simulation in `QA_REPORT_v1.0.0.md` §2, not as part of this repeatable suite.

`pnpm test` runs it; `pnpm test:watch` for development.

---

## 5. Updated known limitations

Carried forward from `QA_REPORT_v1.0.0.md` §3, with changes noted:

- ~~No employee management UI~~ — **resolved this phase.**
- ~~No persisted pagination on the order list~~ — **resolved this phase.**
- **New:** Employee sessions aren't revoked on deactivation, password reset, or role change — a deactivated employee's existing JWT cookie stays valid until its ~12h natural expiry. This was already true in v1.0.0 (sessions have always been stateless), but Employee Management is the first feature where it's operationally relevant (deactivating someone mid-shift doesn't immediately log them out). Fixing this properly means either shortening session lifetime or adding server-side session tracking (a real architectural change) — flagged here rather than fixed speculatively.
- **New:** No dedicated automated tests for Employee Management yet (the 5 areas tested this phase were the ones explicitly requested). The mocked-Supabase pattern proven out for Material Requests/Order Creation extends cleanly to it — noted as good, low-effort future work in `TESTING.md`.
- Still open from v1.0.0: no persisted pickup-vs-delivery field (Operations/Calendar infer it from status), "Active Users" on Diagnostics is an approximation, no persistent customer entity, cron jobs need a scheduler wired up post-deploy, live Twilio delivery still unverified, the `getDashboardStats()` unbounded query noted in §3 above.
- **Newly closed by this phase's investigation, not by a fix:** live deployment infrastructure now exists and is ready (see §2) — what remains is finishing one CLI command, not further engineering.

## 6. Updated risk assessment

| Risk | v1.0.0 status | RC2 status |
|---|---|---|
| Order list unbounded at 1000+ orders | Not mitigated — flagged, undecided fix | **Mitigated** — paginated, verified |
| No employee management UI | Documented gap | **Closed** |
| No automated tests | Not mitigated | **Substantially mitigated** for the 5 core business-logic areas; UI and newer modules still rely on manual/Demo Mode verification |
| Live deployment never verified | N/A (not attempted in v1.0.0) | **Infra ready, code deploy blocked** — see §2. This is now the single largest gap between "code is correct" and "the product has been proven to work" |
| Session not revoked on deactivation | Pre-existing, not previously surfaced as employee-management-relevant | Newly documented (§5) |
| Twilio integration unverified live | Not mitigated | Unchanged — still pending a real deployment to test against |

## 7. Performance summary (delta from v1.0.0)

- The order list's unbounded-query risk (the top item in v1.0.0's performance summary) is fixed — see §3.
- `getDashboardStats()`'s unbounded fetch (narrower, lighter than the old order list, but the same shape of risk) is newly documented, not fixed — see §3's closing note.
- No other query-pattern changes this phase. Foreign-key indexing, realtime channel consolidation, and image-loading batching from v1.0.0 are unchanged and still in place.
- Real page-load/realtime-latency numbers are still unmeasured against a live deployment — this remains blocked on §2, same boundary as v1.0.0.

## 8. Production readiness score

**7.5 / 10** (up from 6.5 in v1.0.0) — genuinely more production-ready, not yet provably production-ready.

What moved the needle up: the two most concrete operational gaps from v1.0.0 (no way to manage employees, no answer for order-list scale) are both closed with real, verified work — not documentation promising a future fix. A real automated test suite now exists covering the business logic most likely to have a silent regression (status transitions, permissions, notification gating, the two most state-machine-heavy write paths). Deployment infrastructure — the real Supabase connection, real secrets, a real hosting platform — is provisioned and configured, which is genuine progress even though the deploy itself didn't complete.

What's holding it at 7.5 rather than higher: the code has still never run as a live, deployed product handling a real HTTP request from a real browser over the public internet. Every verification method used across both QA passes — Demo Mode, mocked Supabase clients, a SQL-level golden-path simulation, static analysis — is a deliberately-chosen, honestly-reasoned substitute for that, not equivalent to it. §2's checklist is short and mostly mechanical, but until someone runs it, "production ready" is still an inference from strong indirect evidence, not a direct observation.

## 9. Verdict: does RC2 pass?

**Not yet, by your own stated bar.** Three of four priority tasks are complete, verified, and committed. The fourth — Deployment Verification — has real, valuable partial progress (a fully-configured, deploy-ready Netlify site connected to the real Supabase project) but the live E2E verification you asked for did not happen, because the actual code push failed for reasons outside this session's control.

**What closes this out:** run the one CLI command in §2 (or connect the Netlify site to the repo for git-based deploys) from an environment with normal internet access, then walk the 7-row checklist in §2. That's it — nothing else in this report is waiting on more engineering work. Once that's done and reported back, RC2 passes and the **v1.0.0** label is appropriate.
