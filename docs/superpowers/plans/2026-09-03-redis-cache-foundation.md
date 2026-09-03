# Redis Cache Foundation Implementation Plan

> **For Codex:** Execute this plan task-by-task with test-first red/green evidence. Preserve the approved staging-only and fail-open boundaries.

**Goal:** Deploy one private cache-only Redis service and integrate a safe reusable cache layer for public Storefront projections with Customer Panel post-commit invalidation.

**Architecture:** `@celebix/saas-cache` provides configuration, keys, envelopes, Node Redis lifecycle, read-through, singleflight, metrics, health, and namespace rotation. Storefront wraps only public projection repository methods after authoritative hostname resolution. Customer Panel wraps mutation repositories and rotates tenant-scoped namespaces after successful writes.

**Tech Stack:** TypeScript, Node.js 24, npm workspaces, Next.js 16, official `redis` 6.2.1 client, official Redis 8.10.1 Alpine image, Node test runner, Docker/Coolify.

---

### Task 1: Freeze dependencies and package contract

**Files:**
- Create: `packages/saas-cache/package.json`
- Create: `packages/saas-cache/tsconfig.json`
- Create: `packages/saas-cache/src/config.test.ts`
- Create: `packages/saas-cache/src/config.ts`
- Modify: `package-lock.json`

1. Write failing tests for exact environment parsing, safe defaults, bounded timeouts/TTLs/payload, optional malformed configuration, and secret-free errors.
2. Run `npm test --workspace @celebix/saas-cache` and capture the expected failure.
3. Implement the parser and package metadata with exact `redis` version `6.2.1`.
4. Re-run tests and commit the red/green unit.

### Task 2: Build keys, envelopes, metrics, and read-through behavior

**Files:**
- Create: `packages/saas-cache/src/key.test.ts`
- Create: `packages/saas-cache/src/key.ts`
- Create: `packages/saas-cache/src/cache.test.ts`
- Create: `packages/saas-cache/src/cache.ts`
- Create: `packages/saas-cache/src/metrics.ts`
- Create: `packages/saas-cache/src/index.ts`

1. Write failing behavioral tests for canonical hashing, tenant separation, namespace token rotation, schema-version parsing, payload rejection, TTL jitter bounds, positive/negative entries, fail-open misses, and singleflight joins.
2. Implement the smallest cache-client abstraction and behavior to pass those tests.
3. Prove no raw hostname, slug, query, or customer data appears in generated keys.
4. Run package tests and typecheck.

### Task 3: Add bounded Node Redis singleton and health

**Files:**
- Create: `packages/saas-cache/src/redis-client.test.ts`
- Create: `packages/saas-cache/src/redis-client.ts`
- Create: `packages/saas-cache/src/runtime.test.ts`
- Create: `packages/saas-cache/src/runtime.ts`

1. Write failing tests with a fake Node Redis client for lazy connection, bounded commands, optional failure, reconnect, no secret logging, singleton reuse, and graceful shutdown.
2. Implement the adapter and default runtime resolver.
3. Verify `REDIS_CACHE_REQUIRED=false` always preserves authoritative application reads.

### Task 4: Cache public Storefront projections

**Files:**
- Create: `apps/storefront-shared/lib/cache/public-storefront-cache.test.ts`
- Create: `apps/storefront-shared/lib/cache/public-storefront-cache.ts`
- Modify: `apps/storefront-shared/lib/default-runtime.ts`
- Modify: `apps/storefront-shared/package.json`

1. Write failing repository-level tests showing hostname resolution bypasses cache and all approved public projection methods use store-scoped read-through.
2. Test parser rejection, negative caching, database fallback, singleflight, and catalogue/settings TTL selection.
3. Implement and compose the decorator without touching commerce, cart, checkout, identity, payment, stock, or analytics authority.
4. Run Storefront tests and typecheck.

### Task 5: Invalidate only after successful Customer Panel mutations

**Files:**
- Create: `apps/customer-panel/lib/server-cache/invalidation.test.ts`
- Create: `apps/customer-panel/lib/server-cache/invalidation.ts`
- Modify: `apps/customer-panel/lib/server-panel-access/postgres-runtime.ts`
- Modify: `apps/customer-panel/lib/server-media/default.ts`
- Modify: `apps/customer-panel/lib/server-storefront-design/default.ts`
- Modify: `apps/customer-panel/lib/server-storefront-assets/default.ts`
- Modify: `apps/customer-panel/package.json`

1. Write failing tests that assert successful catalog/media/pricing/resource mutations rotate catalog, successful design/asset mutations rotate settings, failed writes never rotate, and Redis errors remain fail-open.
2. Implement typed mutation decorators and wire them at the repository composition points.
3. Run Customer Panel tests and typecheck.

### Task 6: Expose optional dependency health in all three apps

**Files:**
- Modify: `apps/storefront-shared/app/api/health/route.ts`
- Modify: `apps/storefront-shared/lib/store-domain-origin-health.ts`
- Modify: relevant Storefront health tests
- Modify: `apps/customer-panel/app/api/health/route.ts`
- Modify: relevant Customer Panel health tests
- Create: `apps/owner/app/api/health/route.ts`
- Create: `apps/owner/app/api/health/route.test.ts`
- Modify: `apps/owner/package.json`

1. Write failing tests for `healthy`, `degraded`, and `disabled` cache states with HTTP 200 for optional cache failure.
2. Compose the shared health probe without exposing URLs, passwords, hostnames, or keys.
3. Run the three application test suites and typechecks.

### Task 7: Add the exact-image disposable Redis rehearsal

**Files:**
- Create: `tests/saas-phase3/redis-cache-foundation/postgres-independent-harness.mjs`
- Create: `tests/saas-phase3/redis-cache-foundation/redis-harness.test.mjs`
- Modify: `tests/saas-phase3/run-current-suite.mjs`

1. Write a harness registration test that fails before the harness is registered.
2. Start a disposable authenticated container from `redis:8.10.1-alpine@sha256:becdda6c7f4b3fb42e42fd7f120bbf5c54c4caaaf16f26da24e4563d2c1f0576` with production-equivalent cache flags.
3. Prove auth rejection, read/write/TTL, negative cache, tenant isolation, namespace rotation, fail-open stop, and reconnect; remove the container in `finally`.
4. Compare Phase 3 base and branch results and require zero new failures.

### Task 8: Full verification, review, and integration

**Files:** all files changed by Tasks 1–7.

1. Run package/app tests, contracts, data, Phase 3 current suite, runtime preflight, three app typechecks, three production builds, migration static tests, `git diff --check`, and a secret scan.
2. Request an independent review. Fix all Critical and Important findings and rerun affected and full gates.
3. Create logical commits, push normally, open the approved PR, verify base/head/files, and merge with a merge commit only.

### Task 9: Provision and roll out staging

**Files:** no repository files.

1. Create the private authenticated Redis resource with the approved pinned image, limits, memory policy, and persistence-off settings.
2. Add the approved Redis environment variables to Storefront Shared, Customer Panel, and Owner without disclosing the URL.
3. Deploy the exact merge SHA in Storefront Shared, Customer Panel, then Owner order and verify container SHA plus health after each deployment.

### Task 10: Staging performance, failure, and browser certification

**Files:** no repository files.

1. Capture 20–50 cold and warm samples for home, category, product detail, and health; record p50/p95 and cache hit ratio.
2. Stop Redis and prove all three apps remain functional with zero unexpected 5xx; restart Redis and prove reconnect without app redeploy.
3. In a real browser, create only `ATLAS-QA-REDIS-CACHE-<timestamp>`, verify Storefront freshness after mutation/invalidation, inspect console/network, then archive the QA product and verify cleanup.
4. Confirm production was untouched and produce the exact 22-line Atlas report.
