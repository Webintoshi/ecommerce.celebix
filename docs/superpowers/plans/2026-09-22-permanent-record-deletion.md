# Permanent Record Deletion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add owner/admin-only, versioned, idempotent permanent deletion for orders, products, and categories while preserving archive flows, tenant isolation, historical order snapshots, and provider boundaries.

**Architecture:** Define one strict shared deletion contract and one immutable SQL operation ledger, then implement resource-specific impact and commit functions behind existing repository/runtime boundaries. Customer Panel routes derive authority from the session, clients parse exact responses, and a reusable compact confirmation dialog drives the three resource surfaces. Product deletion adapts the existing removal engine; orders and categories receive explicit dependency-detachment functions. All destructive verification uses disposable records only.

**Tech Stack:** TypeScript, React/Next.js App Router, Node test runner, PostgreSQL security-definer functions, existing Celebix repository/runtime abstractions, existing R2 media cleanup saga.

**Spec:** `docs/superpowers/specs/2026-09-22-permanent-record-deletion-design.md`

## Global Constraints

- Preserve existing archive/restore behavior and compatibility clients.
- Never trust browser-supplied tenant, store, principal, membership, role, plan, or provider authority.
- Only `store_owner` and `admin` receive permanent deletion actions.
- No blanket cascade on shared commerce tables and no provider calls from deletion paths.
- No PII, record payload, free-form reason, total, payment data, or credential in the immutable deletion ledger.
- A pending or ambiguous commit is not success; perform one read-only operation recovery before returning `unavailable`.
- Do not run permanent deletion against an existing customer record. Live acceptance requires a separately approved, newly created disposable QA record.
- Do not change payment credentials/modes, DNS, migration hooks, Auto Deploy, or unrelated application behavior.

## Review Focus

Each failure mode below must have an explicit test in the task that owns it:

1. Cross-tenant identifiers must resolve as opaque `not_found`, never membership or dependency disclosure.
2. Reusing an operation ID with a different resource, version, or confirmation must return `operation_mismatch` without mutation.
3. Order deletion must not call payment, shipping, email, inventory, or other external providers.
4. Product deletion must not remove immutable order-line purchase snapshots and must not report success before media cleanup is proven.
5. Category deletion must reparent direct children deterministically and leave no partial tree mutation on version conflict.

---

## Task 1: Freeze the Shared Deletion Contract and Authorization Matrix

**Files:**

- Create: `packages/saas-contracts/src/deletion/types.ts`
- Create: `packages/saas-contracts/src/deletion/validation.ts`
- Create: `packages/saas-contracts/src/deletion/index.ts`
- Create: `packages/saas-contracts/src/deletion/deletion.test.ts`
- Modify: `packages/saas-contracts/src/authorization/actions.ts`
- Modify: `packages/saas-contracts/src/authorization/actions.test.ts`
- Modify: `packages/saas-contracts/src/index.ts`

- [ ] **Step 1: Write failing contract parser and role-matrix tests**

```ts
test("only owner and admin receive permanent deletion actions", () => {
  for (const role of ["store_owner", "admin"] as const) {
    assert.equal(isMerchantActionAllowed(role, "orders.delete"), true);
    assert.equal(isMerchantActionAllowed(role, "catalog_admin.delete"), true);
  }
  for (const role of ["editor", "analyst"] as const) {
    assert.equal(isMerchantActionAllowed(role, "orders.delete"), false);
    assert.equal(isMerchantActionAllowed(role, "catalog_admin.delete"), false);
  }
});

test("impact parser rejects unknown effects and non-finite counts", () => {
  assert.throws(() => parsePermanentDeletionImpact({
    resourceKind: "order",
    resourceId: ORDER_ID,
    expectedVersion: 4,
    confirmationLabel: "SF-1001",
    effects: [{ kind: "raw_sql", count: 1, disposition: "delete" }],
  }));
});
```

- [ ] **Step 2: Run the focused tests and confirm RED**

Run: `node --experimental-strip-types --test packages/saas-contracts/src/authorization/actions.test.ts packages/saas-contracts/src/deletion/deletion.test.ts`

Expected: FAIL because the actions, types, parsers, and exports do not exist.

- [ ] **Step 3: Implement finite public types and exact parsers**

```ts
export const PERMANENT_DELETION_RESOURCE_KINDS = ["order", "product", "category"] as const;
export const PERMANENT_DELETION_DISPOSITIONS = [
  "delete", "detach", "retain_snapshot", "external_unchanged",
] as const;

export const PERMANENT_DELETION_EFFECT_KINDS = Object.freeze({
  order: ["order_items", "notes", "notifications", "shipping_records", "draft_links", "cart_links", "external_payment", "external_fulfillment"],
  product: ["variants", "media", "catalog_relations", "pricing_records", "barcode_records", "order_line_snapshots"],
  category: ["product_links", "child_categories", "design_references"],
} as const);

export type PermanentDeletionCommand = Readonly<{
  operationId: string;
  expectedVersion: number;
  confirmation: string;
}>;
```

Implement `parsePermanentDeletionImpact`, `parsePermanentDeletionCommand`, and `parsePermanentDeletionResult` with exact object-key validation, UUID/positive-version validation, canonical string limits, non-negative safe-integer counts, and resource-specific effect vocabulary.

- [ ] **Step 4: Map product `remove` to the new delete action**

Add `orders.delete` and `catalog_admin.delete` to `MERCHANT_ACTIONS`; map the existing `CatalogProductOperation` value `remove` to `catalog_admin.delete`. Do not add either action to editor or analyst explicit sets.

- [ ] **Step 5: Run package tests and typecheck**

Run: `npm test --workspace @celebix/saas-contracts && npm run typecheck --workspace @celebix/saas-contracts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/saas-contracts/src
git commit -m "feat(contracts): define permanent deletion boundary"
```

## Task 2: Add the Immutable Deletion Ledger and SQL Contract Tests

**Files:**

- Create: `apps/owner/scripts/sql/saas/202609220142_permanent_record_deletion.up.sql`
- Create: `apps/owner/scripts/sql/saas/202609220142_permanent_record_deletion.down.sql`
- Create: `apps/owner/scripts/sql/saas/202609220142_permanent_record_deletion_assertions.sql`
- Create: `apps/owner/scripts/sql/saas/permanent-record-deletion-migration.test.ts`

- [ ] **Step 1: Write failing artifact/security assertions**

```ts
test("142 creates an immutable PII-free deletion ledger", () => {
  const up = source("up");
  assert.match(up, /CREATE TABLE saas[.]record_deletion_operations/u);
  assert.match(up, /CREATE TRIGGER record_deletion_operations_immutable/u);
  assert.match(up, /REVOKE ALL ON TABLE saas[.]record_deletion_operations FROM celebix_saas_app/u);
  for (const forbidden of ["email", "phone", "address", "title", "reason", "total", "payload", "credential"]) {
    assert.doesNotMatch(tableDefinition(up), new RegExp(forbidden, "iu"));
  }
});
```

Also assert owner-scoped transaction wrappers, no connection strings, exact check constraints for resource kind/outcome, no direct app-table grant, and a rollback guard that refuses to erase committed audit rows.

- [ ] **Step 2: Run the migration artifact test and confirm RED**

Run: `node --experimental-transform-types --test apps/owner/scripts/sql/saas/permanent-record-deletion-migration.test.ts`

Expected: FAIL because migration artifacts do not exist.

- [ ] **Step 3: Implement the ledger and private helpers**

Use this minimum schema shape:

```sql
CREATE TABLE saas.record_deletion_operations (
  store_id uuid NOT NULL REFERENCES saas.stores(id),
  operation_id uuid NOT NULL,
  resource_kind text NOT NULL CHECK (resource_kind IN ('order','product','category')),
  resource_id uuid NOT NULL,
  principal_id uuid NOT NULL,
  membership_id uuid NOT NULL,
  committed_at timestamptz NOT NULL,
  request_fingerprint text NOT NULL,
  outcome text NOT NULL CHECK (outcome = 'deleted'),
  replay_count bigint NOT NULL DEFAULT 0 CHECK (replay_count >= 0),
  PRIMARY KEY (store_id, operation_id)
);
```

Add an owner-only immutable trigger rejecting `UPDATE`, `DELETE`, and `TRUNCATE`; private helpers for operation lock/replay/mismatch; and exact assertion SQL for ownership, ACLs, triggers, and constraints. No app role table access.

- [ ] **Step 4: Run artifact and existing owner SQL suites**

Run: `node --experimental-transform-types --test apps/owner/scripts/sql/saas/permanent-record-deletion-migration.test.ts`

Run: `npm test --workspace @celebix/owner`

Expected: PASS with no unrelated migration-regression changes.

- [ ] **Step 5: Commit**

```bash
git add apps/owner/scripts/sql/saas/202609220142_permanent_record_deletion*
git add apps/owner/scripts/sql/saas/permanent-record-deletion-migration.test.ts
git commit -m "feat(sql): add immutable deletion operation ledger"
```

## Task 3: Implement Versioned Order Impact and Atomic Deletion

**Files:**

- Modify: `apps/owner/scripts/sql/saas/202609220142_permanent_record_deletion.up.sql`
- Modify: `apps/owner/scripts/sql/saas/202609220142_permanent_record_deletion.down.sql`
- Modify: `apps/owner/scripts/sql/saas/202609220142_permanent_record_deletion_assertions.sql`
- Modify: `apps/owner/scripts/sql/saas/permanent-record-deletion-migration.test.ts`
- Modify: `packages/saas-data/src/orders/types.ts`
- Modify: `packages/saas-data/src/orders/repository.ts`
- Modify: `packages/saas-data/src/orders/repository.test.ts`
- Modify: `packages/saas-data/src/index.ts`

- [ ] **Step 1: Write failing repository tests for impact, commit, replay, and mismatch**

```ts
test("deleteOrder binds tenant, version, confirmation and operation id", async () => {
  const result = await repo.deleteOrder({
    tenantContext, now: NOW, orderId: ORDER_ID,
    operationId: OPERATION_ID, expectedVersion: 7, confirmation: "SF-1001",
  });
  assert.deepEqual(result, {
    resourceKind: "order", resourceId: ORDER_ID, deleted: true,
    auditId: AUDIT_ID, replayed: false,
  });
  assert.match(pool.calls.at(-1)?.text ?? "", /saas[.]delete_order/u);
});
```

Add cases for cross-store opaque `not_found`, `version_conflict`, `invalid_confirmation`, same-fingerprint replay, different-fingerprint `operation_mismatch`, and exactly one read-only recovery after commit ambiguity.

- [ ] **Step 2: Run focused data tests and confirm RED**

Run: `node --experimental-transform-types --test packages/saas-data/src/orders/repository.test.ts`

Expected: FAIL because the repository interface and SQL functions are absent.

- [ ] **Step 3: Add repository methods and strict result parsing**

```ts
export interface DeleteOrderInput extends OrderOperationInput, PermanentDeletionCommand {}

export interface OrderRepository {
  getDeletionImpact(input: GetOrderInput): Promise<PermanentDeletionImpact>;
  deleteOrder(input: DeleteOrderInput): Promise<PermanentDeletionResult>;
  // existing methods remain unchanged
}
```

Implement `getDeletionImpact` and `deleteOrder` using the existing tenant authority values, operation fingerprint convention, timeout handling, error mapping, and audit callback. Never accept provider callbacks or clients in the repository method.

- [ ] **Step 4: Implement SQL impact and deletion functions**

Create security-definer `saas.order_deletion_impact(...)` and `saas.delete_order(...)`. Lock in this order: deletion operation, order, direct dependents, relation tables. Verify `orders.delete` via the existing merchant-action authority helper. Detach `manual_order_drafts.converted_order_id` and abandoned-cart recovered-order references; delete order notes, notification/delivery rows, shipping projections, archive state, events, operation rows, items, then the order. Insert the minimal audit record in the same transaction.

Explicitly avoid any provider function or network-capable queue insertion. Return finite effects for detected external payment/fulfillment families with `external_unchanged`.

- [ ] **Step 5: Add disposable PostgreSQL coverage**

Extend the repository disposable-Postgres harness to create active, archived, paid, shipped, refunded, inventory-adjusting, and externally referenced fixture orders. Assert:

```ts
assert.equal(await scalar("select count(*) from saas.orders where id=$1", [ORDER_ID]), 0);
assert.equal(await scalar("select converted_order_id from saas.manual_order_drafts where id=$1", [DRAFT_ID]), null);
assert.equal(await scalar("select recovered_order_id from saas.abandoned_carts where id=$1", [CART_ID]), null);
assert.equal(providerCalls.length, 0);
```

Verify each tenant-isolation, replay, mismatch, stale-version, and no-partial-mutation case.

- [ ] **Step 6: Run focused and package checks**

Run: `npm test --workspace @celebix/saas-data && npm run typecheck --workspace @celebix/saas-data`

Run: `npm test --workspace @celebix/owner`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/owner/scripts/sql/saas/202609220142_permanent_record_deletion* apps/owner/scripts/sql/saas/permanent-record-deletion-migration.test.ts packages/saas-data/src
git commit -m "feat(orders): add atomic permanent deletion"
```

## Task 4: Adapt Existing Product Removal to the Shared Deletion Workflow

**Files:**

- Modify: `apps/owner/scripts/sql/saas/202609220142_permanent_record_deletion.up.sql`
- Modify: `apps/owner/scripts/sql/saas/202609220142_permanent_record_deletion.down.sql`
- Modify: `apps/owner/scripts/sql/saas/202609220142_permanent_record_deletion_assertions.sql`
- Modify: `apps/owner/scripts/sql/saas/permanent-record-deletion-migration.test.ts`
- Modify: `packages/saas-data/src/catalog/types.ts`
- Modify: `packages/saas-data/src/catalog/repository.ts`
- Modify: `packages/saas-data/src/catalog/repository.test.ts`

- [ ] **Step 1: Write failing product deletion tests**

Cover active/draft internal archive, archived deletion, media cleanup pending/failure/replay, order-line snapshot preservation, cross-store opaque not-found, stale version, confirmation mismatch, operation mismatch, and successful shared result parsing.

```ts
assert.deepEqual(await repo.getProductDeletionImpact(authority), {
  resourceKind: "product",
  resourceId: PRODUCT_ID,
  expectedVersion: 8,
  confirmationLabel: "14 Ayar Altın Küpe",
  effects: [
    { kind: "variants", count: 2, disposition: "delete" },
    { kind: "order_line_snapshots", count: 3, disposition: "retain_snapshot" },
  ],
});
```

- [ ] **Step 2: Run catalog repository tests and confirm RED**

Run: `node --experimental-transform-types --test packages/saas-data/src/catalog/repository.test.ts`

Expected: FAIL because shared impact/delete methods are not implemented.

- [ ] **Step 3: Extend the repository without creating a second engine**

Add `getProductDeletionImpact` and `deleteProduct` to `CatalogRepository`. Keep `getProductRemovalEligibility` and `removeProduct` as compatibility adapters that delegate to the same internal implementation after their legacy checks. Do not retain `catalog_admin.archive` as the remove authorization action.

- [ ] **Step 4: Extend SQL around existing `catalog_remove_product` primitives**

Implement shared `catalog_product_deletion_impact` and versioned `delete_product` functions. Archive active/draft rows internally, detach live product/variant references from historical order lines without changing snapshot columns, delete variants and product-scoped relations/operations, and commit the common ledger row only after relational cleanup.

The SQL function must accept a server-proven media-cleanup receipt/status, not R2 credentials or URLs. Return `cleanup_pending` until the application has unpublished each owned object and proven absence through the existing media cleanup saga.

- [ ] **Step 5: Add media saga orchestration tests**

At the application boundary, assert this sequence:

```ts
await archiveIfNeeded(product);
await cleanupOwnedMedia(product.id);
await repository.deleteProduct(command);
await invalidateProductCaches({ storeId, productId, slug });
```

Prove a storage failure hides the product but leaves relational data retryable; replay does not repeat confirmed object deletion; and success is impossible before absence proof.

- [ ] **Step 6: Run catalog, owner, and type checks**

Run: `node --experimental-transform-types --test packages/saas-data/src/catalog/repository.test.ts`

Run: `npm run typecheck --workspace @celebix/saas-data && npm test --workspace @celebix/owner`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/owner/scripts/sql/saas/202609220142_permanent_record_deletion* apps/owner/scripts/sql/saas/permanent-record-deletion-migration.test.ts packages/saas-data/src/catalog
git commit -m "feat(catalog): adapt product removal to permanent deletion"
```

## Task 5: Implement Deterministic Category Deletion

**Files:**

- Modify: `apps/owner/scripts/sql/saas/202609220142_permanent_record_deletion.up.sql`
- Modify: `apps/owner/scripts/sql/saas/202609220142_permanent_record_deletion.down.sql`
- Modify: `apps/owner/scripts/sql/saas/202609220142_permanent_record_deletion_assertions.sql`
- Modify: `apps/owner/scripts/sql/saas/permanent-record-deletion-migration.test.ts`
- Modify: `packages/saas-data/src/catalog-onboarding/types.ts`
- Modify: `packages/saas-data/src/catalog-onboarding/repository.ts`
- Modify: `packages/saas-data/src/catalog-onboarding/repository.test.ts`

- [ ] **Step 1: Write failing category behavior tests**

Add tests for linked-product detachment, direct-child reparenting, root deletion, stable sibling order, design-reference detachment, stale version atomicity, cross-tenant opaque not-found, confirmation mismatch, replay, and operation mismatch.

```ts
const result = await repo.deleteCategory({
  tenantContext, now: NOW, categoryId: CATEGORY_ID,
  operationId: OPERATION_ID, expectedVersion: 3, confirmation: "Küpeler",
});
assert.equal(result.resourceKind, "category");
assert.equal(result.deleted, true);
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `node --experimental-transform-types --test packages/saas-data/src/catalog-onboarding/repository.test.ts`

Expected: FAIL because category impact/delete APIs do not exist.

- [ ] **Step 3: Add repository interfaces and parsers**

Add `getCategoryDeletionImpact` and `deleteCategory` to `CatalogOnboardingRepository`, both returning shared contract types. Reuse the existing catalog-onboarding error mapping and authority tuple.

- [ ] **Step 4: Implement category SQL atomically**

Lock the deletion operation, selected category, direct children ordered by `(position, id)`, product links, and design references. Delete selected product-category relations, set child `parent_id` to the deleted parent, preserve stable order using the existing position plus ID tie-break, detach draft/published design references without choosing replacements, delete category operation rows, delete the category, then insert the audit ledger row.

- [ ] **Step 5: Prove no partial tree mutation**

In disposable PostgreSQL, issue a stale `expectedVersion`, then assert the category, its children, product links, and design references are byte-for-byte unchanged. Repeat against a different store ID and assert `not_found` with no counts disclosed.

- [ ] **Step 6: Run focused/package checks**

Run: `node --experimental-transform-types --test packages/saas-data/src/catalog-onboarding/repository.test.ts`

Run: `npm test --workspace @celebix/saas-data && npm test --workspace @celebix/owner`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/owner/scripts/sql/saas/202609220142_permanent_record_deletion* apps/owner/scripts/sql/saas/permanent-record-deletion-migration.test.ts packages/saas-data/src/catalog-onboarding
git commit -m "feat(catalog): add deterministic category deletion"
```

## Task 6: Expose Fail-Closed Customer Panel HTTP Endpoints

**Files:**

- Modify: `apps/customer-panel/lib/order-http/request-authority.ts`
- Modify: `apps/customer-panel/lib/order-http/handler.ts`
- Modify: `apps/customer-panel/lib/order-http/default.ts`
- Modify: `apps/customer-panel/lib/order-http/handler.test.ts`
- Modify: `apps/customer-panel/lib/order-ui/client.ts`
- Modify: `apps/customer-panel/lib/order-console.test.ts`
- Modify: `apps/customer-panel/lib/catalog-http/request-authority.ts`
- Modify: `apps/customer-panel/lib/catalog-http/handler.ts`
- Modify: `apps/customer-panel/lib/catalog-http/default.ts`
- Modify: `apps/customer-panel/lib/catalog-http/handler.test.ts`
- Modify: `apps/customer-panel/lib/catalog-ui/client.ts`
- Modify: `apps/customer-panel/lib/catalog-ui/client.test.ts`
- Modify: `apps/customer-panel/lib/catalog-onboarding-http/request-authority.ts`
- Modify: `apps/customer-panel/lib/catalog-onboarding-http/handler.ts`
- Modify: `apps/customer-panel/lib/catalog-onboarding-http/default.ts`
- Modify: `apps/customer-panel/lib/catalog-onboarding-http/handler.test.ts`
- Modify: `apps/customer-panel/lib/catalog-onboarding-ui/client.ts`
- Modify: `apps/customer-panel/lib/catalog-onboarding-ui/client.test.ts`
- Create: `apps/customer-panel/app/api/orders/[orderId]/deletion-impact/route.ts`
- Create: `apps/customer-panel/app/api/orders/[orderId]/delete/route.ts`
- Create: `apps/customer-panel/app/api/catalog/products/[productId]/deletion-impact/route.ts`
- Create: `apps/customer-panel/app/api/catalog/products/[productId]/delete/route.ts`
- Create: `apps/customer-panel/app/api/catalog/onboarding/categories/[categoryId]/deletion-impact/route.ts`
- Create: `apps/customer-panel/app/api/catalog/onboarding/categories/[categoryId]/delete/route.ts`
- Modify: `apps/customer-panel/app/api/catalog/products/[productId]/remove/route.ts`

- [ ] **Step 1: Write failing authority and handler tests**

For all three resource families, cover unauthenticated, editor/analyst denial, wrong/missing same-origin headers, custom admin host mismatch, browser-supplied private authority fields, malformed UUID/version/confirmation, unknown effect, repository error mapping, and `cache-control: no-store`.

```ts
const response = await handlers.deleteOrder(request("POST", {
  operationId: OPERATION_ID,
  expectedVersion: 4,
  confirmation: "SF-1001",
  storeId: OTHER_STORE_ID,
}), ORDER_ID);
assert.equal(response.status, 400);
assert.deepEqual(await response.json(), { code: "invalid_input" });
```

- [ ] **Step 2: Run focused HTTP/client tests and confirm RED**

Run: `node --experimental-transform-types --test apps/customer-panel/lib/order-http/handler.test.ts apps/customer-panel/lib/catalog-http/handler.test.ts apps/customer-panel/lib/catalog-ui/client.test.ts apps/customer-panel/lib/catalog-onboarding-http/handler.test.ts apps/customer-panel/lib/catalog-onboarding-ui/client.test.ts`

Expected: FAIL because routes/handlers/client methods are absent.

- [ ] **Step 3: Implement GET impact and POST delete handlers**

Each handler must derive `TenantContext` from the existing authorized runtime and call only:

```ts
runtime.orders.getDeletionImpact({ tenantContext, now, orderId });
runtime.orders.deleteOrder({ tenantContext, now, orderId, ...command });
```

Mirror the shape for product and category. Parse body with the shared parser, map the approved public error codes exactly, and emit secret-free no-store JSON.

- [ ] **Step 4: Add exact routes and compatibility adapter**

Wire the six specified routes to default handlers. Replace the deliberate product `/remove` 404 with a compatibility adapter that still accepts only its legacy request shape, checks `catalog_admin.delete`, and delegates to the same internal product deletion service; it must not create a parallel mutation implementation.

- [ ] **Step 5: Implement strict browser clients and preserve ambiguous-write safety**

Add `getDeletionImpact` and resource-specific delete methods to each client. Generate the operation UUID in the UI layer and retain it across retries. The handler/repository path performs the one read-only ledger recovery defined in Task 3 after a transport-ambiguous commit; the browser client must not automatically issue a second POST and must keep the same operation ID for a user-initiated retry.

- [ ] **Step 6: Run focused tests and Customer Panel typecheck**

Run the focused command from Step 2.

Run: `npm run typecheck --workspace @celebix/customer-panel`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/customer-panel/app/api apps/customer-panel/lib
git commit -m "feat(panel): expose permanent deletion endpoints"
```

## Task 7: Wire Runtime Preflight and Exact Cache Invalidation

**Files:**

- Modify: `apps/customer-panel/lib/server-orders/runtime.ts`
- Modify: `apps/customer-panel/lib/server-orders/runtime.test.ts`
- Modify: `apps/customer-panel/lib/server-catalog/runtime.ts`
- Modify: `apps/customer-panel/lib/server-catalog/runtime.test.ts`
- Modify: `apps/customer-panel/lib/server-catalog-onboarding/runtime.ts`
- Modify: `apps/customer-panel/lib/server-catalog-onboarding/runtime.test.ts`
- Modify: `apps/customer-panel/lib/server-panel-access/postgres-runtime.ts`
- Modify: `apps/customer-panel/lib/server-panel-access/postgres-runtime.test.ts`
- Modify: `apps/customer-panel/lib/server-catalog/default.ts`
- Modify: `apps/customer-panel/lib/server-catalog-onboarding/default.ts`
- Modify: `apps/customer-panel/lib/server-orders/default.ts`
- Modify: `packages/saas-cache/src/cache.ts`
- Modify: `packages/saas-cache/src/key.ts`
- Modify: `packages/saas-cache/src/cache.test.ts`
- Modify: `apps/customer-panel/lib/server-cache/invalidation.ts`
- Modify: `apps/customer-panel/lib/server-cache/invalidation.test.ts`
- Modify: `apps/storefront-shared/lib/cache/public-storefront-cache.test.ts`

- [ ] **Step 1: Write failing runtime completeness tests**

```ts
assert.equal(typeof runtime.orders.getDeletionImpact, "function");
assert.equal(typeof runtime.orders.deleteOrder, "function");
```

Add the equivalent catalog and onboarding assertions and prove startup/preflight fails closed when any new SQL function is absent.

- [ ] **Step 2: Write failing cache-scope tests**

Extend the cache API with an exact-entry invalidation input that derives the same namespace token and cache-entry key as `readThrough`. Assert product deletion invalidates the exact store/product media entry; catalog lists, search, and product detail need no cache purge because `public-storefront-cache.ts` already resolves those price-bearing projections live. Category deletion rotates only that store's `settings` namespace because design/navigation are store-scoped aggregate projections. Order deletion performs no storefront cache mutation. Assert no all-tenant purge and no unrelated data-class rotation.

- [ ] **Step 3: Run focused runtime/cache tests and confirm RED**

Run: `node --experimental-transform-types --test apps/customer-panel/lib/server-orders/runtime.test.ts apps/customer-panel/lib/server-catalog/runtime.test.ts apps/customer-panel/lib/server-catalog-onboarding/runtime.test.ts apps/customer-panel/lib/server-panel-access/postgres-runtime.test.ts`

Expected: FAIL because runtime methods/preflight declarations are absent.

- [ ] **Step 4: Expose repository methods and migration requirements**

Add new method names to the strict runtime key lists and SQL-function readiness requirements. Do not enable UI capability if preflight reports missing functions.

- [ ] **Step 5: Implement post-commit exact invalidation**

Call cache invalidation only after the repository returns `deleted: true`. Never invalidate before commit, and never turn an invalidation failure into a false deletion failure; record it through the existing safe audit/log channel and make the affected exact tags short-lived/retryable.

- [ ] **Step 6: Run runtime tests and typecheck**

Run the focused command from Step 3.

Run: `node --experimental-transform-types --test packages/saas-cache/src/cache.test.ts apps/customer-panel/lib/server-cache/invalidation.test.ts apps/storefront-shared/lib/cache/public-storefront-cache.test.ts`

Run: `npm run typecheck --workspace @celebix/customer-panel`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/saas-cache/src/cache.ts packages/saas-cache/src/key.ts packages/saas-cache/src/cache.test.ts
git add apps/customer-panel/lib/server-orders apps/customer-panel/lib/server-catalog apps/customer-panel/lib/server-catalog-onboarding apps/customer-panel/lib/server-panel-access apps/customer-panel/lib/server-cache
git add apps/storefront-shared/lib/cache/public-storefront-cache.test.ts
git commit -m "feat(runtime): require deletion support and exact invalidation"
```

## Task 8: Build the Compact Reusable Confirmation Dialog

**Files:**

- Create: `apps/customer-panel/components/shared/PermanentDeleteDialog.tsx`
- Create: `apps/customer-panel/components/shared/permanent-delete-dialog.module.css`
- Create: `apps/customer-panel/lib/permanent-delete-dialog.test.ts`

- [ ] **Step 1: Write failing UI source/behavior tests**

Test that the dialog renders only finite effect labels, requires exact canonical label plus checkbox, disables duplicate submission, retains a stable operation ID for retry, moves focus to the confirmation control on recoverable failure, restores origin focus on close/success, handles Escape, and fits 390/1024/1440 widths without horizontal page overflow.

```ts
assert.equal(canSubmitPermanentDeletion({
  typedLabel: "Küpeler",
  confirmationLabel: "Küpeler",
  irreversibleAccepted: true,
  busy: false,
}), true);
```

- [ ] **Step 2: Run the focused dialog test and confirm RED**

Run: `node --experimental-transform-types --test apps/customer-panel/lib/permanent-delete-dialog.test.ts`

Expected: FAIL because the component and pure state helpers do not exist.

- [ ] **Step 3: Implement accessible dialog state and presentation**

Use `role="dialog"`, `aria-modal="true"`, labelled title/description, a finite effect-to-Turkish label map, exact-label input, checkbox, cancel, and destructive submit. Never render raw effect kinds or internal IDs. Keep one `operationId` per opened user intent and clear it only after terminal success or explicit cancel.

- [ ] **Step 4: Implement responsive styling**

Use existing panel tokens (`#FE6100`, `#2B2B2B`, `#201C19`, `#F8F7F5`, `#FFFDFC`, `#E7E2DD`) and existing control spacing. At 390px use a single-column effect summary and full-width actions; at 1024/1440 preserve the compact modal width. Do not introduce a new visual system.

- [ ] **Step 5: Run focused test and panel typecheck**

Run: `node --experimental-transform-types --test apps/customer-panel/lib/permanent-delete-dialog.test.ts`

Run: `npm run typecheck --workspace @celebix/customer-panel`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/customer-panel/components/shared apps/customer-panel/lib/permanent-delete-dialog.test.ts
git commit -m "feat(panel): add permanent deletion confirmation dialog"
```

## Task 9: Integrate Order, Product, and Category Surfaces

**Files:**

- Modify: `apps/customer-panel/app/orders/[orderId]/page.tsx`
- Modify: `apps/customer-panel/components/orders/OrderDetailConsole.tsx`
- Modify: `apps/customer-panel/components/orders/order-console.module.css`
- Modify: `apps/customer-panel/lib/order-console.test.ts`
- Modify: `apps/customer-panel/app/products/[productId]/page.tsx`
- Modify: `apps/customer-panel/components/catalog/ProductDetailConsole.tsx`
- Modify: `apps/customer-panel/components/catalog/catalog-operations.module.css`
- Modify: `apps/customer-panel/lib/product-console.test.ts`
- Modify: `apps/customer-panel/app/products/categories/page.tsx`
- Modify: `apps/customer-panel/components/catalog-onboarding/CategoryManager.tsx`
- Modify: `apps/customer-panel/components/catalog-onboarding/category-management.module.css`
- Modify: `apps/customer-panel/lib/product-onboarding-console.test.ts`

- [ ] **Step 1: Write failing capability and flow tests**

Assert owner/admin controls are present and editor/analyst controls are absent. For each surface, assert impact loads before confirmation, the expected version and canonical label are used, duplicate submits are blocked, success navigates/refetches only after committed result, and errors remain visible without false success.

```ts
assert.match(orderPage, /isMerchantActionAllowed\(role, "orders[.]delete"\)/u);
assert.match(productPage, /isMerchantActionAllowed\(role, "catalog_admin[.]delete"\)/u);
assert.match(categoryPage, /isMerchantActionAllowed\(role, "catalog_admin[.]delete"\)/u);
```

- [ ] **Step 2: Run focused console tests and confirm RED**

Run: `node --experimental-transform-types --test apps/customer-panel/lib/order-console.test.ts apps/customer-panel/lib/product-console.test.ts apps/customer-panel/lib/product-onboarding-console.test.ts apps/customer-panel/lib/permanent-delete-dialog.test.ts`

Expected: FAIL because delete capabilities and flows are absent/disabled.

- [ ] **Step 3: Add server-derived capabilities**

Extend `OrderUiCapabilities` with `delete`, pass `canDelete` to product detail, and pass `canDelete` to `CategoryManager` from its server page. Compute only through `isMerchantActionAllowed`; never infer from client role strings or hidden buttons.

- [ ] **Step 4: Integrate the dialog on all three surfaces**

Keep `Arşivle` as-is and add a distinct `Kalıcı sil` control. Load impact on open, submit exactly once with the stable operation ID, show the public error reason, and after success:

- order: navigate to the orders list and restore focus/list context;
- product: navigate to the products list and refresh exact list counters;
- category: refetch the category tree and restore focus to the nearest surviving row.

- [ ] **Step 5: Verify keyboard and responsive presentation**

Use component tests/static assertions plus browser acceptance against fixture data at 1440, 1024, and 390. Verify Tab order, Escape, origin-focus restoration, no clipped confirmation label, and no horizontal page overflow. Do not press delete against live customer data.

- [ ] **Step 6: Run focused tests and typecheck**

Run the focused command from Step 2.

Run: `npm run typecheck --workspace @celebix/customer-panel`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/customer-panel/app/orders apps/customer-panel/app/products apps/customer-panel/components apps/customer-panel/lib
git commit -m "feat(panel): add owner controlled permanent deletion"
```

## Task 10: Prove Storefront Absence, Compatibility, and End-to-End Isolation

**Files:**

- Modify: `apps/customer-panel/lib/product-console.test.ts`
- Modify: `apps/customer-panel/lib/catalog-http/handler.test.ts`
- Modify: `packages/saas-data/src/catalog/repository.test.ts`
- Modify: `packages/saas-data/src/orders/repository.test.ts`
- Modify: `packages/saas-data/src/catalog-onboarding/repository.test.ts`
- Modify: `packages/saas-data/src/storefront/repository.test.ts`
- Modify: `apps/storefront-shared/lib/cache/public-storefront-cache.test.ts`
- Modify: `apps/storefront-shared/lib/product-catalog-query.test.ts`
- Create: `docs/qa/permanent-record-deletion.md`

- [ ] **Step 1: Add a disposable full-story regression**

Create two tenant fixtures and disposable order/product/category records. Through real repository functions, preview then delete each record in tenant A. Assert tenant B is unchanged, deleted product/category are absent from storefront list/search/direct lookup, order list/detail are absent, and retained order-line snapshots survive deletion of their catalog source.

- [ ] **Step 2: Add legacy product compatibility coverage**

Prove the existing `/removal-eligibility` and `/remove` client surface either retains its documented response or delegates to the shared service, uses `catalog_admin.delete`, and cannot bypass confirmation/version/idempotency.

- [ ] **Step 3: Run focused cross-package regression**

Run: `npm test --workspace @celebix/saas-contracts`

Run: `npm test --workspace @celebix/saas-data`

Run: `npm test --workspace @celebix/customer-panel`

Run: `npm test --workspace @celebix/owner`

Expected: PASS; record exact totals and any pre-existing skip separately.

- [ ] **Step 4: Run typecheck and release build once**

Run: `npm run typecheck --workspace @celebix/saas-contracts && npm run typecheck --workspace @celebix/saas-data && npm run typecheck --workspace @celebix/customer-panel`

Run: `npm run build:coolify:customer-panel`

Expected: PASS, including the existing payment build generators without changing approval inputs.

- [ ] **Step 5: Perform deletion-focused independent review**

Review the branch diff specifically against the five Review Focus failure modes. Resolve every correctness/security finding and rerun only affected focused tests, followed by the once-per-final-head typecheck/build if source changed.

- [ ] **Step 6: Record evidence without live deletion**

In `docs/qa/permanent-record-deletion.md`, record exact source SHA, commands/results, disposable fixture identifiers, authorization matrix, SQL migration/preflight result, cache/storefront outcome, compatibility outcome, and the explicit statement that no existing customer record was deleted.

- [ ] **Step 7: Commit final verification evidence**

```bash
git add docs/qa/permanent-record-deletion.md
git commit -m "docs(qa): record permanent deletion verification"
```

## Task 11: Prepare a Controlled Rollout Candidate Without Deleting Customer Data

**Files:**

- Modify only files required by findings from Task 10.
- Update: `docs/qa/permanent-record-deletion.md`

- [ ] **Step 1: Verify branch scope and clean status**

Run: `git status --short && git diff --check && git log --oneline --decorate -12`

Expected: clean working tree, no whitespace errors, and only permanent-deletion/spec/QA commits on top of the verified base.

- [ ] **Step 2: Verify migration/runtime ordering**

Confirm contracts and migration support are available before UI capability exposure, runtime preflight names match exact deployed SQL signatures, and rollback refuses to destroy audit history. Do not apply the migration to a shared database in this task.

- [ ] **Step 3: Record the exact candidate SHA**

Run: `git rev-parse HEAD`

Update the QA report with that exact SHA. If the report-only commit changes HEAD, state separately which application-source SHA the test/build evidence covers.

- [ ] **Step 4: Stop before live destructive acceptance**

Do not delete any live order, product, or category. Hand off one exact next step: create/select a newly created disposable QA record and obtain explicit exact-record authorization before a staged/live deletion acceptance run.
