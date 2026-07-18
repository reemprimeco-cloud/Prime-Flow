# Prime Production Board — v1.0.0 QA Report

**Date:** 2026-07-18
**Scope:** Stabilization & Production Readiness phase, covering everything built across Phases 1–7 (scaffold, Manager/Employee/TV dashboards, Production Core infrastructure, Communication & Notifications, Reports & Archive, Operations Control Center).

This report is the honest record of what's been verified, how, and what hasn't — including the boundary this entire build has worked within: the development sandbox's network policy allows Supabase access only through MCP tools, not direct app-level HTTPS. Every claim below is tagged with how it was checked, so "verified" never quietly means "assumed."

---

## 1. Features completed

**Auth & core:** Custom JWT-cookie auth (bcrypt + `jose`), one `employees` table serving `admin`/`employee` roles today (`supervisor`/`store`/`delivery` reserved in the enum, not yet wired into any authorization logic), route-level + Server-Action-level guards.

**Manager Dashboard:** Order board (card + list views), create/edit/duplicate/delete/archive orders, employee assignment, material request approve/reject, employee roster (read-only), stats, filters, search, bulk actions (assign/priority/delivery date/archive/notify), Global Search (⌘K), Manager Override (bypasses the status engine with a required reason, always audit-logged).

**Employee Dashboard:** Assigned jobs (active + queue), status transitions, notes, material request submission, file viewing.

**TV Dashboard:** Unauthenticated fullscreen kiosk board — status columns, weekly schedule, no PII beyond what customers/staff would see on a physical order board (see §5).

**Production Core infrastructure:** Central Status Engine (single transition graph, `assertValidTransition`), multiplexed Realtime Broadcast channel manager with capped-backoff reconnect, Audit Log (backbone for Live Production Timeline, Activity Feed, and Manager Override's trail), provider-agnostic Notification Service, centralized file upload validation, global error boundaries, offline detection.

**Communication & Notifications:** Twilio WhatsApp provider (stub-safe without credentials), 5 employee + 6 customer message templates (EN/AR), per-order notification preferences, Notification History + Notification Center (filterable, one-click resend), automatic retry with exponential backoff.

**Reports & Archive:** Month-end archival cron (`collected`/`delivered` → `completed` + archived), monthly statistics, live "this month so far" card, historical charts (recharts), CSV export, Archive browser with search/month filter.

**Operations Control Center:** Live Production Timeline (per-order), Employee Workload (sortable), Production Calendar (Day/Week/Month), Operations Dashboard (8 live KPIs + Activity Feed), Diagnostics/health check page.

**Verification method throughout:** `tsc --noEmit` + `eslint` + `next build` after every phase (all clean at time of writing), plus Demo Mode (`DEMO_MODE=true`) driven by Playwright in a real headless browser — the only way to visually verify a real UI in this sandbox, since Demo Mode requires no live Supabase connection.

---

## 2. Stabilization phase — what changed

Real issues found and fixed this phase, not just re-verification of prior work:

| # | Finding | Severity | Fix |
|---|---|---|---|
| 1 | `monthly_statistics` had a duplicate unique index (`0006` added one that already existed from `0001`) — flagged `WARN` by the Supabase performance advisor | Low (wasted index maintenance cost, no correctness impact) | Migration `0007` drops the redundant one. |
| 2 | 6 foreign keys had no covering index (`audit_logs.actor_id`, `material_requests.order_id`/`resolved_by`, `order_files.uploaded_by`, `order_notes.employee_id`, `orders.created_by`) — directly relevant to the "1000+ active orders" performance requirement | Medium | Migration `0008` adds all 6. |
| 3 | Production Calendar and Employee Workload pages had no realtime subscription — Calendar had no polling fallback either, so it could go stale indefinitely until manually reloaded | Medium (contradicts the explicit "no stale data" requirement for exactly these two "live" pages) | Added `useRealtimeChannel` + a 30s safety-net poll to both, matching the pattern already used by Operations/Activity Feed. |
| 4 | An already-open Order Detail Drawer didn't reflect changes made elsewhere (e.g. an employee advancing the order's status while a manager had it open) | Low–Medium (stale-data / race-condition risk in a genuinely concurrent scenario) | Added realtime invalidation for both the order query and its timeline. |
| 5 | Demo Mode's client-side realtime hook still attempted a real Supabase Realtime websocket connection, which fails (and retries with backoff, indefinitely) in any environment without a reachable Supabase instance — this is exactly why every browser check this session showed console errors that had to be manually filtered out as "expected" | Medium (wasted resources, console noise, mildly misleading during QA — see §7) | Added `NEXT_PUBLIC_DEMO_MODE`, gated `useRealtimeChannel` to no-op entirely in demo mode. Verified: 0 console errors before vs. after, screenshots unchanged. |
| 6 | Middleware's route matcher only covered `/dashboard/:path*`, missing the 9 other manager routes added in Phases 6–7 (`/operations`, `/calendar`, `/workload`, `/diagnostics`, `/employees`, `/material-requests`, `/notifications`, `/reports`, `/archive`) — route groups don't add a URL segment, so these are top-level paths | Low (every page still calls `requireAdmin()` directly, so there was no actual authorization bypass — this is a defense-in-depth gap, and a UX one: unauthenticated visits lost the `?next=` redirect-back) | Widened the matcher and the `isManagerRoute` check to cover all 10 manager routes explicitly. |
| 7 | `getTvBoard()`'s code comment and `ARCHITECTURE.md` both claimed the TV board "never returns PII beyond first names" — the code actually returns full customer/employee names (by design; customers need to recognize their own order on a public pickup-shop display) | Low (documentation accuracy, not a code defect — verified no phone numbers/notes/other fields leak) | Corrected both the code comment and `ARCHITECTURE.md` to describe what's actually exposed. |
| 8 | 4 icon-only buttons (remove-file, two order-actions dropdown triggers, clear-bulk-selection) had no accessible name — a screen reader would announce them as bare "button" | Low–Medium (accessibility) | Added `aria-label` to all 4, scanned the rest of the component tree with a heuristic pass and found no other instances. |

**Verification of this session's own changes:** `tsc --noEmit` and `eslint` clean after every edit; a full Playwright sweep across Dashboard, Calendar, Workload, Employee, TV, Notification Center, Material Requests, Employees, Archive, Reports, and Login in Demo Mode returned **zero console errors** (down from the 10 websocket-failure errors present before fix #5).

**Live database validation:** The entire golden-path scenario from the phase spec — order created → employee assigned → notifications logged → production started → material requested → approved → production resumed → ready for pickup → customer notified → collected → archived — was run as a single atomic SQL simulation directly against the real (currently empty, pre-launch) Supabase project via the Supabase MCP tools, mirroring the exact insert/update shapes each Server Action performs. It completed with **zero constraint violations** across every enum, foreign key, check constraint, and the two intentionally-nullable columns (`order_status_history.changed_by`, `audit_logs.actor_id`) added for system-triggered events. All test data was cleaned up afterward — the project was left exactly as found (3 seeded employees, 0 orders). See §7 for why this was SQL-level rather than full browser E2E.

---

## 3. Known limitations

- **No employee management UI.** There is no Server Action or page to create, edit, deactivate, or reset the password of an employee — `lib/actions/employees.ts` is read-only (`listEmployees`/`listAssignableEmployees`), and `/employees` is a read-only roster table. Provisioning staff today means re-running `pnpm seed` (idempotent, safe to rerun) or editing the `employees` table directly via the Supabase dashboard. This is the single most significant operational gap for actually running the shop day-to-day.
- **No persisted "pickup vs. delivery" field.** Operations KPIs and the Calendar infer fulfillment method from current order status rather than a stored field — documented in `OPERATIONS.md`.
- **"Active Users" on Diagnostics is an approximation** (distinct recent audit-log actors, not a real session count) — there's no session-tracking table since auth is stateless JWT cookies.
- **No customer entity.** Customer info (including notification preferences) is denormalized per-order, not shared across a customer's orders — deliberate, per the "not an ERP/CRM" brief, but means preferences are re-entered per order.
- **Cron jobs aren't scheduled anywhere yet.** Both `/api/cron/month-end` and `/api/cron/retry-notifications` work correctly when called but have no scheduler wired up on any platform — see `DEPLOYMENT_CHECKLIST.md`.
- **Live Twilio delivery has never been runtime-verified** in any environment this build has run in (sandbox network policy blocks direct third-party API calls). The provider code, template rendering, retry logic, and stub-safe fallback have all been verified by direct code reading and the stub path's actual execution (which does run for real in Demo-Mode-off/no-credentials configurations) — but no real WhatsApp message has ever actually been sent and confirmed delivered by this build process.
- **Global Search and order-list search use raw string interpolation into PostgREST's `.or()` filter syntax** (`lib/actions/search.ts`, `lib/actions/orders.ts`). Commas and `%` are stripped from the search term, which prevents the two most obvious injection vectors (clause injection via comma, wildcard injection via percent), but it's a code-smell pattern rather than best practice — a parameterized approach or Postgres full-text search would be more robust. No exploit was found or attempted; this is a defense-in-depth recommendation, not a confirmed vulnerability.
- **`role` enum includes `supervisor`/`store`/`delivery`** (reserved for future modules per the original plan) but authorization logic only distinguishes `admin` vs. everyone-else — those three roles would currently behave identically to `employee` if ever assigned. Not a bug (nothing assigns those roles today), but worth knowing before building anything that assumes role-specific behavior.

## 4. Recommended future improvements

Roughly in priority order:

1. **Employee management UI** — the most impactful gap for actual production use.
2. **Pagination/virtualization for the order list** at scale — see §6, this is the top performance risk and deserves dedicated design (page size, sort stability under concurrent writes, how bulk-select interacts with "select all" across pages) rather than a rushed fix.
3. **Wire up the two cron schedulers** on the actual hosting platform (a checklist item, not a code change — see `DEPLOYMENT_CHECKLIST.md`).
4. **A real end-to-end test suite** (Playwright against a real staging Supabase project, in an environment where that's reachable) to replace this build's Demo-Mode-plus-SQL-simulation approach with genuine browser-driven, full-stack coverage including live Twilio sandbox sends.
5. **Full-text search indexing** (`pg_trgm` or Postgres FTS) if search performance ever becomes noticeable at scale — not needed at today's data volume.
6. Email/SMS notification providers, behind the existing provider abstraction (deliberately deferred since Phase 6, architecture already supports it — see `NOTIFICATIONS.md`).

## 5. Open technical debt

- Middleware route list (`MANAGER_ROUTES` in `middleware.ts`) must be kept in sync by hand with `app/(manager)/*` — there's no automated check that a new manager page remembers to add itself. Low risk today (every page also self-guards via `requireAdmin()`), but a lint rule or route-discovery approach would remove the manual-sync requirement entirely.
- `DEMO_MODE`/`NEXT_PUBLIC_DEMO_MODE` duplication (§2, fix #5) is a structural necessity of Next.js's server/client env var split, not eliminable — but it is a footgun if someone ever sets one without the other. Worth a startup-time consistency check if this bites anyone in practice.
- No automated test suite exists (unit or integration) — all verification to date is `tsc`/`eslint`/`build` plus manual/scripted browser and SQL verification. For a v1.0.0 shipping to real production use, this is the most consequential process gap, independent of any specific bug.

## 6. Risk assessment

| Risk | Likelihood | Impact | Mitigation status |
|---|---|---|---|
| Order list/dashboard performance degrades at 1000+ active orders (unbounded query, no pagination — see `lib/actions/orders.ts`'s `getOrders`) | Medium (depends entirely on shop volume/growth) | Medium — slow page loads, not data loss or corruption | **Not mitigated.** Deliberately not patched with a guessed row limit this phase — a silent cap risks *hiding* orders past the limit, which is worse than the slowness it would "fix." Needs a real pagination design (see §4). Foreign-key indexes added this phase (§2, fix #2) help the downstream `.in()` queries but don't address the core unbounded fetch. |
| No employee management UI blocks onboarding new staff without direct DB access | High (will happen the first time staff turnover occurs) | Low–Medium — workaround exists (reseed/direct DB edit), not a data-safety issue | Documented, not fixed (out of scope — new feature). |
| Twilio integration unverified against a live send | Low–Medium (code path is well-isolated and stub-safe; risk is specifically "does the real API call work as coded") | Low if it fails (graceful `failed` status + retry, never blocks core workflow) | Documented as an explicit testing boundary; first real deployment should send one manual test message before relying on it. |
| No automated test suite | Medium (regressions can slip through if a future change isn't manually re-verified as thoroughly as this session did) | Medium — depends on what breaks | Not mitigated. Recommended in §4. |
| Search injection via raw `.or()` string interpolation | Low (comma/percent stripped; no working exploit identified) | Would be Medium-High if wrong | Partial mitigation in place; recommend hardening (§3) before treating as closed. |

No `WARN`- or `ERROR`-level Supabase security/performance advisor findings remain unaddressed as of this report (verified via `mcp__supabase__get_advisors` for both categories — see §2).

## 7. Performance summary

- **Database:** All foreign keys now indexed (§2, fix #2). Remaining advisor `INFO` notices are either expected-by-design (`rls_enabled_no_policy` — see `ARCHITECTURE.md`'s Auth Model) or inevitable-on-an-empty-database (`unused_index` — these tables have zero query traffic yet since the project has no production data; they'll stop being flagged once real usage accrues).
- **Query patterns:** Every list-style Server Action reviewed this phase batches its related-data fetches via `.in(orderIds)` rather than N+1 querying per row (confirmed across `getOrders`, `getMyJobs`, `getTvBoard`, `listEmployeeWorkload`, and others). The one real exception is the *primary* orders query itself having no upper bound — see the top risk in §6.
- **Realtime:** Multiplexed channel manager (3 named channels, ref-counted subscriptions) means N components subscribing to the same channel share one underlying websocket connection, not N connections. Verified by code reading of `lib/realtime/manager.ts`; live websocket behavior itself is one of the things this sandbox cannot exercise (see below).
- **Images:** Signed URLs are batch-generated (`createSignedUrls` called once per list of paths, not once per file) everywhere thumbnails are shown.
- **What was NOT measurable in this environment:** actual page-load timing, realtime message latency, and search query latency against a populated database all require either a live browser hitting a real deployment or a Supabase project with realistic data volume — neither was available. The "1000+ active orders" scenario specifically was reasoned about via code review (finding the unbounded-query risk in §6), not load-tested, because generating and then safely removing 1000+ rows of realistic test data against the shared pre-launch Supabase project was judged higher-risk than valuable given that the actual code-level bottleneck (no `.limit()`/pagination) was already clearly identifiable without needing to reproduce it empirically.

## 8. Production readiness score

**6.5 / 10 — functionally complete and structurally sound, not yet operationally ready.**

What earns the score: every feature in the original spec through Phase 7 is built and passes static analysis + Demo Mode browser verification; the full golden-path workflow was validated end-to-end at the database/constraint level with zero errors; every Server Action has a real, verified authorization guard; no unresolved security advisor findings; the realtime/audit/notification architecture is coherent and was specifically checked for cross-dashboard staleness this phase (and 3 real gaps were found and fixed).

What holds it back from higher: **this build has never run against a live deployment** — no real browser has ever logged in over real HTTPS, no real WhatsApp message has ever been sent, no real user has ever clicked a real button against real Supabase Auth-equivalent infrastructure. Everything above the database-constraint layer is verified by code reading, Demo Mode (synthetic data, writes disabled), and a SQL-level simulation — rigorous, but not the same as production traffic. Combined with the missing employee management UI (a real operational blocker for onboarding staff) and the unaddressed order-list scaling risk, this is a **v1.0.0 that is safe to deploy for a first real trial with close monitoring**, not one to hand off and walk away from. The `DEPLOYMENT_CHECKLIST.md` first-login smoke test is not optional — it is the first time several of these code paths will run against reality.
