# Durable Abandoned Cart Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development for every behavior change and superpowers:verification-before-completion before reporting success.

**Goal:** Bind every durable storefront cart mutation and checkout conversion to the existing merchant abandoned-cart projection without trusting the browser or duplicating cart authority.

**Architecture:** Add one PostgreSQL 16 migration with a tenant-scoped source binding, deferred transaction triggers and deterministic stale reconciliation. Keep `storefront_carts` authoritative and keep existing customer-panel repository/routes unchanged. Validate the full lifecycle in a new disposable PostgreSQL harness, then run existing storefront cart/checkout and abandoned-cart regressions.

**Tech Stack:** PostgreSQL 16 PL/pgSQL, Node.js test runner, existing SaaS SQL migration/manifest system, Next.js customer-panel and storefront workspaces.

## Global constraints

- Do not call the legacy browser `/api/cart/capture` path.
- Do not parse or persist raw cart cookies or credentials.
- Do not change browser cart, tenant or price authority.
- Do not rewrite migrations `001-100`.
- Do not add dependencies.
- Do not enable automatic recovery email/SMS.
- Production deploy/mutation remains forbidden.

---

### Task 1: Write the failing durable lifecycle harness

**Files:**
- Create: `tests/saas-phase3/durable-abandoned-cart-integration/postgres-harness.mjs`
- Create: `tests/saas-phase3/durable-abandoned-cart-integration/static-security.test.mjs`

**Interfaces:**
- Consumes: `saas.public_cart_mutate`, `saas.public_cart_resolve`, `saas.public_checkout_complete`, existing merchant `abandoned_carts_summary/list/get` functions.
- Expects: `saas.abandoned_carts.source_cart_id`, `saas.sync_durable_abandoned_cart(uuid,uuid,timestamptz)`, deferred cart/item triggers and store-scoped reconciliation.

- [ ] **Step 1: Add a disposable PostgreSQL harness that applies migrations through 100**

Reuse the isolated native/container PostgreSQL selection and fixture discipline from `tests/saas-phase3/storefront-cart-checkout/postgres-harness.mjs`. Create two stores, active catalogs, host authority, merchant memberships, cart credentials and built-in payment/shipping fixtures.

- [ ] **Step 2: Add RED scenarios**

Prove at minimum:

```js
assert.equal(mutateCart({ action: "add", quantity: 2 }).outcome, "committed");
assert.equal(sql(`SELECT status FROM saas.abandoned_carts WHERE source_cart_id='${CART}'`), "active");
assert.equal(sql(`SELECT quantity FROM saas.abandoned_cart_items WHERE cart_id='${CART}'`), "2");
```

Add scenarios for quantity, empty removal, 29:59/30:00 stale boundary, reactivation, active conversion, abandoned recovery, operation replay, concurrent mutation, rollback, cross-store isolation, backup/restore and migration rollback/reapply.

- [ ] **Step 3: Add RED static-security tests**

Require deferred constraint triggers, `SECURITY DEFINER` with fixed search path, source FK/unique binding, digest-only persistence, no raw credential/cookie/header authority, no grants on underlying tables and rollback that leaves migrations `001-100` intact.

- [ ] **Step 4: Run and confirm RED**

```bash
node --test tests/saas-phase3/durable-abandoned-cart-integration/static-security.test.mjs
node tests/saas-phase3/durable-abandoned-cart-integration/postgres-harness.mjs
```

Expected: FAIL because migration 101 and its functions/triggers do not exist.

**Commit boundary:** no commit while tests are red.

---

### Task 2: Implement migration 101 transactional bridge

**Files:**
- Create: `apps/owner/scripts/sql/saas/202608120101_durable_abandoned_cart_integration.up.sql`
- Create: `apps/owner/scripts/sql/saas/202608120101_durable_abandoned_cart_integration.down.sql`
- Create: `apps/owner/scripts/sql/saas/202608120101_durable_abandoned_cart_integration_assertions.sql`
- Create: `apps/owner/scripts/sql/saas/phase4t-durable-abandoned-cart-integration-manifest.json`

**Interfaces:**
- Add nullable `source_cart_id uuid` with `(store_id, source_cart_id)` unique binding and FK to `saas.storefront_carts(store_id,id)`.
- Add `saas.sync_durable_abandoned_cart(p_store_id uuid,p_cart_id uuid,p_now timestamptz) RETURNS void`.
- Add a no-argument trigger function that derives store/cart only from `NEW`/`OLD` rows.
- Add deferred constraint triggers on `saas.storefront_carts` and `saas.storefront_cart_items`.
- Add `saas.reconcile_durable_abandoned_carts(p_store_id uuid,p_now timestamptz) RETURNS bigint` with exact 30-minute threshold.
- Replace merchant summary/list/get function bodies without changing signatures or authority checks so they reconcile only after authority succeeds.

- [ ] **Step 1: Add the source binding and indexes**

Legacy captured rows retain `NULL source_cart_id`. New durable rows bind exact same-store cart id. Do not make the column browser-writable or grant direct table access.

- [ ] **Step 2: Implement the final-state projection**

For an active, non-empty durable cart, upsert one header and recreate ordered items from authoritative cart/catalog/media data. Use the stored effective unit price from `storefront_cart_items`; never accept a client total.

- [ ] **Step 3: Implement lifecycle transitions**

Handle active create/update, abandoned-to-active reactivation, empty-cart archive, active-to-archived checkout conversion and abandoned-to-recovered checkout conversion with exact `storefront_checkout_operations.order_id`.

- [ ] **Step 4: Install deferred triggers**

Use `DEFERRABLE INITIALLY DEFERRED` constraint triggers so projection observes the transaction's final cart, item and checkout-operation state. Guard the same store/cart with `pg_advisory_xact_lock`.

- [ ] **Step 5: Add store-scoped stale reconciliation**

Only authorized admin summary/list/get calls invoke the reconciler. A cart becomes abandoned when `last_activity_at <= p_now - interval '30 minutes'`. The reconciler must not touch archived/recovered/other-store rows.

- [ ] **Step 6: Add down migration and assertions**

Rollback drops only migration-101 triggers/functions/index/column and restores prior merchant API definitions. Assertions verify ownership, volatility, fixed search path, privileges, source FK, trigger deferral and no direct runtime table access.

- [ ] **Step 7: Generate manifest checksums from actual files**

```bash
shasum -a 256 apps/owner/scripts/sql/saas/202608120101_durable_abandoned_cart_integration.{up,down}.sql \
  apps/owner/scripts/sql/saas/202608120101_durable_abandoned_cart_integration_assertions.sql
```

Write exactly those hashes to `phase4t-durable-abandoned-cart-integration-manifest.json`; do not fabricate them.

- [ ] **Step 8: Run focused tests and confirm GREEN**

```bash
node --test tests/saas-phase3/durable-abandoned-cart-integration/static-security.test.mjs
node tests/saas-phase3/durable-abandoned-cart-integration/postgres-harness.mjs
```

Expected: all static and PostgreSQL lifecycle scenarios PASS.

**Commit:** `feat(saas): bind durable abandoned carts`

---

### Task 3: Preserve application and database regressions

**Files:**
- Verify all files from Tasks 1-2.
- Modify only a narrow existing harness if migration-101 discovery requires it; do not weaken old assertions or scenario counts.

- [ ] **Step 1: Run existing abandoned-cart and cart/checkout suites**

```bash
node --test tests/saas-phase3/storefront-cart-checkout/static-security.test.mjs
node tests/saas-phase3/storefront-cart-checkout/postgres-harness.mjs
node tests/saas-phase3/abandoned-cart-foundation/postgres-harness.mjs
```

Expected: all existing scenarios PASS unchanged.

- [ ] **Step 2: Run workspace tests and types**

```bash
npm test --workspace @celebix/customer-panel
npm test --workspace @celebix/storefront-shared
npm run typecheck --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/storefront-shared
```

Expected: all commands PASS.

- [ ] **Step 3: Run builds**

```bash
npm run build --workspace @celebix/customer-panel
npm run build --workspace @celebix/storefront-shared
```

Expected: both builds PASS.

- [ ] **Step 4: Run static quality and secret scans**

```bash
git diff --check
git diff --name-only c47989d08e86d54ccac01bffeef39a6a2b1c99b1...HEAD
git diff c47989d08e86d54ccac01bffeef39a6a2b1c99b1...HEAD | rg -n '(c1\.|__Host-celebix_cart|password|secret|token)' || true
```

Expected: no raw credential or secret material; changes limited to approved docs, migration, manifest and durable abandoned-cart tests.

---

### Task 4: Staging deployment and real browser acceptance

**Files:** none unless a separately diagnosed source defect requires a new authorization.

- [ ] **Step 1: Push the feature branch without force-push**

Verify local/remote exact SHA parity.

- [ ] **Step 2: Deploy only required isolated staging services**

Apply migration 101 through the existing Owner migration path, then deploy exact SHA to storefront and customer-panel staging. Do not deploy or mutate production.

- [ ] **Step 3: Perform genuine browser flow**

Using a fresh browser context:

1. Open the Güzide staging storefront.
2. Add a real product to an empty cart.
3. Confirm the admin list immediately shows one `Aktif` anonymous cart with exact product, quantity, image and price.
4. Mutate quantity and confirm the same row/version updates without duplication.
5. Use controlled PostgreSQL time fixtures for the exact 30-minute stale boundary; do not wait in real time.
6. Complete a fresh checkout and confirm exact recovered/archived lifecycle and order id.
7. Confirm another store cannot observe the row.

- [ ] **Step 4: Verify logs and cleanup**

Scan runtime logs/DOM/network for raw cart credentials, cookies, tokens and internal hostnames. Remove disposable browser carts/orders created solely for validation where the existing authorized cleanup flow permits it.

Expected final status: `PASS — DURABLE_ABANDONED_CART_INTEGRATION_COMPLETE` only after PostgreSQL, regressions, deploy and browser acceptance all pass.

