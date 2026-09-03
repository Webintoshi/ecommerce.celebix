# Commerce Analytics and Cart Recovery Implementation Plan

> **For Codex:** Execute test-first from the existing analytics, outbox, durable cart, checkout, order/payment, Umami, and cache components. Do not create parallel authorities and do not touch `apps/admin/**`.

**Goal:** Deliver versioned commerce events, lifecycle-safe abandoned-cart recovery, currency-aware analytics, tenant-authorized Customer Panel surfaces, and staging operational certification.

**Architecture:** Self-hosted Umami remains the anonymous behavior engine; SaaS PostgreSQL remains cart/order/payment/revenue/recovery authority. The existing analytics outbox/worker generalizes to server events. Existing durable carts gain episodes, attribution, recovery digests, and attempts. Customer Panel composes partial Umami data with PostgreSQL aggregates and optional fail-open Redis read caching.

**Tech stack:** TypeScript, React/Next.js, Node.js, PostgreSQL 16, Umami, `@celebix/saas-cache`, npm workspaces, Node test runner, Coolify.

---

### Task 1: Freeze versioned event and analytics contracts

**Files:**
- Modify: `packages/saas-contracts/src/analytics/types.ts`
- Modify: `packages/saas-contracts/src/analytics/validation.ts`
- Modify: `packages/saas-contracts/src/analytics/index.ts`
- Modify: `packages/saas-contracts/src/analytics/analytics.test.ts`

1. Add failing tests for every browser/server event, unknown names/keys, browser server-event rejection, currency/minor units, unsafe search redaction, PII keys/patterns, maximum payload, and formula unavailable states.
2. Implement schema-v1 envelope parsing, opaque-reference validation, search sanitization, and commerce read-model parsers.
3. Require exact keys and immutable parsed output; preserve existing v1 analytics APIs.
4. Run contracts tests and typecheck.

### Task 2: Add migration 124 and PostgreSQL 16 rehearsal

**Files:**
- Create: `apps/owner/scripts/sql/saas/202609030124_commerce_analytics_cart_recovery.up.sql`
- Create: `apps/owner/scripts/sql/saas/202609030124_commerce_analytics_cart_recovery.down.sql`
- Create: `apps/owner/scripts/sql/saas/202609030124_commerce_analytics_cart_recovery_assertions.sql`
- Create: `tests/saas-phase3/commerce-analytics-cart-recovery/migration-static.test.mjs`
- Create: `tests/saas-phase3/commerce-analytics-cart-recovery/postgres-harness.mjs`
- Modify: `tests/saas-phase3/run-current-suite.mjs`

1. Write failing static and disposable-PostgreSQL tests for migration order, additive tables/columns, RLS/grants, host isolation, settings bounds, lifecycle episodes, unique event keys, token digests, no raw tokens, concurrent evaluator claims, replay idempotency, old/new application compatibility, guarded down, and code-only rollback.
2. Apply the full canonical schema through migration `123`, then `124` plus assertions in PostgreSQL 16.
3. Implement store settings, reconciled hosts, attribution/episodes/tokens/attempts, generalized outbox metadata, set-based aggregates, worker status/requeue, and lifecycle functions with composite store authority.
4. Register the exact harness in the Phase 3 current runner and prove zero branch-only failures.

### Task 3: Extend data repositories and outbox worker

**Files:**
- Modify: `packages/saas-data/src/analytics/types.ts`
- Modify: `packages/saas-data/src/analytics/validation.ts`
- Modify: `packages/saas-data/src/analytics/repository.ts`
- Modify: `packages/saas-data/src/analytics/outbox-repository.ts`
- Modify: `packages/saas-data/src/analytics/*.test.ts`
- Modify: `packages/saas-data/src/abandoned-carts/types.ts`
- Modify: `packages/saas-data/src/abandoned-carts/repository.ts`
- Modify: `packages/saas-data/src/abandoned-carts/*.test.ts`
- Modify: `apps/storefront-shared/lib/analytics/delivery.ts`
- Modify: `apps/storefront-shared/lib/analytics/delivery.test.ts`
- Modify: `apps/storefront-shared/scripts/deliver-analytics-events.mjs`

1. Add failing tests for overview/funnel/acquisition/products/status, masked cart detail, settings, token lifecycle, contacted/note attempts, lifecycle evaluation, delivery event kinds, lease expiry, 429/500/timeout, unknown commit, dead-letter, authorized requeue, and backlog recovery.
2. Implement strict repository parsing and bounded PostgreSQL calls; use no N+1 reads.
3. Generalize delivery bodies without weakening the existing purchase guarantee, and add operational metrics without payload/secret logging.
4. Run data and Storefront tests/typechecks.

### Task 4: Expand safe Storefront tracking and attribution capture

**Files:**
- Modify: `apps/storefront-shared/lib/analytics/events.ts`
- Modify: `apps/storefront-shared/lib/analytics/tracker-client.ts`
- Modify: related Storefront analytics tests
- Modify: Storefront product/category/search/cart/checkout components and routes selected by discovery
- Modify: existing cart-capture and checkout repositories/routes selected by discovery
- Create: Storefront recovery-link route and tests in the existing cart route family

1. Add failing tests for all browser events, strict allowlists, HMAC references, search redaction, admin/unknown host rejection, tracker outage, attribution normalization, server-price/stock restoration, expired/revoked/cross-store/converted tokens, and browser attempts to emit server events.
2. Instrument existing pages and behavior boundaries with schema-v1 events; preserve non-blocking tracker semantics.
3. Persist safe first/last attribution through existing cart/checkout authority.
4. Resolve recovery links through hostname authority and current catalog/stock/price services, returning explicit adjustments.
5. Run Storefront tests/typecheck/build.

### Task 5: Add analytics service composition, APIs, and cache

**Files:**
- Modify: `apps/customer-panel/lib/server-analytics/*`
- Modify: `apps/customer-panel/lib/analytics-http/*`
- Create: route handlers under `apps/customer-panel/app/api/analytics/{overview,funnel,abandoned-carts,acquisition,products,status}/route.ts`
- Extend: existing `apps/customer-panel/app/api/orders/abandoned-carts/**` routes
- Create/modify: focused Customer Panel tests for every API and mutation

1. Add failing tests for session/membership/actions, same-origin mutation, client store-ID rejection, range/timezone/currency validation, partial Umami outage HTTP 200, masked analyst data, editor policy, cross-tenant 404, cache keys/TTLs, and cache fail-open.
2. Compose bounded parallel Umami and PostgreSQL reads under a per-request query budget.
3. Add overview/funnel/carts/acquisition/products/status handlers and existing-family recovery mutations.
4. Cache only validated read models with store/range/timezone/currency/filter keys.
5. Run Customer Panel tests/typecheck.

### Task 6: Build the merchant analytics and settings UI

**Files:**
- Modify: `apps/customer-panel/app/analytics/page.tsx`
- Modify/Create: `apps/customer-panel/components/analytics/**`
- Modify/Create: `apps/customer-panel/lib/analytics-ui/**`
- Create: analytics settings page/components under the existing settings layout
- Modify/Create: focused UI tests and styles

1. Add failing tests for tabs, loading/empty/error/partial states, ranges and previous period, currency buckets, formula tooltips, funnel, cart filters/pagination, masked contact, link copy, provider unavailable, browser history, and 390px overflow constraints.
2. Build Overview, Funnel, Carts & Checkout, Acquisition, and Products as one accessible responsive workspace while retaining existing traffic and commercial value.
3. Add settings status/threshold/recovery controls; hide credentials and internal website IDs.
4. Run Customer Panel tests/typecheck/build.

### Task 7: Reconcile Umami provisioning and operational hardening

**Files:**
- Modify: existing Customer Panel/Owner Umami provisioning services discovered during implementation
- Modify: custom-domain lifecycle integration points
- Create/Modify: related provisioning tests
- Create: `docs/ops/commerce-analytics-umami-backup-restore.md`

1. Add failing tests for one website per store, stable website ID across domain changes, exclusion of admin hosts, environment isolation, replay idempotency, cross-tenant 404, and unavailable retry.
2. Implement one reconciler shared by owner provisioning and domain lifecycle.
3. Document exact image/digest, heartbeat, persistent volume, resources, connections, logs, encrypted off-site daily backup retention, isolated restore, and verification commands without secrets.
4. Run Owner/Customer Panel tests/typechecks/builds.

### Task 8: Full verification and independent review

**Files:** all branch changes.

1. Run contracts, data, Customer Panel, Storefront, Owner, migration static, runtime preflight, Phase 3 current, three typechecks, three production builds, secret scan, `git diff --check`, and base-vs-branch failure comparison.
2. Request an independent review specifically for privacy, tenant authority, payment/revenue truth, token safety, concurrency, rollback, and `apps/admin/**` exclusion.
3. Fix every Critical and Important finding with a new failing regression test first, then rerun affected and full gates.
4. Verify branch-only failures are zero and no real customer data or production mutation occurred.

### Task 9: Commit, PR, and merge

**Files:** no additional implementation files.

1. Create logical commits without amend/rebase/force-push and push `codex/atlas-commerce-analytics-v1` normally.
2. Open PR title `feat(customer-panel): add commerce analytics and cart recovery` against `codex/design-tabs-save-fix-live`.
3. Record base/head, commit count, exact file list, test evidence, migration-first rule, compatibility, feature-off code rollback, and operational prohibitions.
4. Revalidate unchanged SHAs and scope; merge with a merge commit only and preserve the source branch.

### Task 10: Migration-first staging rollout and certification

**Files:** no repository changes after merge.

1. Record exact merge SHA; take and restore-verify isolated backups of the SaaS and Umami PostgreSQL databases.
2. Apply migration `124` first, rerun it for idempotency evidence where supported, and verify assertions.
3. Deploy analytics worker, Storefront Shared, Customer Panel, and Owner only if changed, all at the exact merge SHA; verify running SHAs and health.
4. Create only `ATLAS-QA-COMMERCE-ANALYTICS-*` fixtures, temporarily lower store thresholds, and exercise the full UTM/product/cart/checkout/abandon/resume/recover/captured-payment flow without a real payment.
5. Stop only the staging Umami dependency and prove partial dashboard/storefront fail-open; stop the staging worker and prove checkout plus durable backlog/restart delivery.
6. Verify console/network and layouts at 1440, 1024, and 390 pixels with zero unexpected 5xx.
7. Archive the QA product, clean or audit-retain tagged records, revoke QA tokens, remove QA PII, restore thresholds, leave auto messaging off, and preserve the source branch.
