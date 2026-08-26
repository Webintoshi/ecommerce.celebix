# Global Product Query Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make customer-panel product search, filtering, and sorting authoritative across the tenant's complete catalog while preserving additive migration-first rollout and v1/v2 compatibility.

**Architecture:** Add a tenant-authorized `catalog_list_products_v3` SQL projection that accepts normalized query context and keyset anchors while leaving v1/v2 untouched. Carry the same finite query model through shared contracts, the data repository, HTTP input parsing, the browser client, and a debounced URL-backed product console; application cursors bind store and every query dimension before SQL checkout.

**Tech Stack:** PostgreSQL 16 PL/pgSQL, TypeScript 5.9, Node test runner, React 19, Next.js App Router.

**Spec:** `/Users/Celebix/.codex/attachments/28b5fe2b-05c3-4abf-b903-81fbe95c1afa/pasted-text.txt` — `PARALEL HAT B — GLOBAL ÜRÜN ARAMA, FİLTRE VE SIRALAMA`

## Global Constraints

- Canonical base is `origin/codex/design-tabs-save-fix-live` at exact SHA `13c68846a2ae05dc2c23a8e268543fb33217645b`.
- Work only in `/Users/Celebix/Desktop/ecommerce-celebix/.codex-worktrees/atlas-products-global-query` on `codex/atlas-products-global-query`.
- Do not modify `apps/admin/**` or any user worktree.
- Do not merge a PR, deploy Coolify, mutate shared databases, change environment variables, restart containers, or mutate staging/production data.
- Preserve `catalog_list_products` v1 and `catalog_list_products_v2` definitions and ACLs exactly.
- Roll out migration first; old app + new schema, current app + new schema, new app + new schema, and code-only rollback must pass.
- Search is tenant-scoped, case-insensitive, trimmed, and spans title, slug, SKU, and barcode.
- Query cursors bind store, search, status, stock, category, brand, collection, and sort.
- List projection remains one repository SQL read with zero product-detail fan-out.
- Commit exactly `feat(customer-panel): add global product search filters and sorting` and open, but do not merge, a PR with the same exact title against `codex/design-tabs-save-fix-live`.

---

### Task 1: Shared finite query contract and query-bound cursor

**Files:**
- Modify: `packages/saas-contracts/src/catalog/types.ts`
- Modify: `packages/saas-contracts/src/catalog/validation.ts`
- Modify: `packages/saas-contracts/src/catalog/index.ts`
- Modify: `packages/saas-contracts/src/catalog/catalog.test.ts`
- Modify: `packages/saas-data/src/catalog/types.ts`
- Modify: `packages/saas-data/src/catalog/validation.ts`
- Modify: `packages/saas-data/src/catalog/cursor.ts`
- Test: `packages/saas-data/src/catalog/repository.test.ts`

**Interfaces:**
- Produces: `CatalogProductStockFilter = "in-stock" | "out-of-stock" | "untracked"`.
- Produces: `CatalogProductSort = "updated-desc" | "title-asc" | "title-desc" | "created-desc" | "created-asc"`.
- Produces: `CatalogProductListQuery` with optional normalized `search`, `status`, `stock`, `categoryId`, `brandId`, `collectionId`, and required defaulted `sort`.
- Produces: cursor v2 containing exact query context plus one SQL-provided timestamp/title/id keyset anchor.

- [ ] **Step 1: Write contract tests that name invalid query dimensions and normalization failures**

```ts
assert.deepEqual(parseCatalogProductListQuery({ search: "  SoN SKU  ", sort: "title-asc" }), {
  search: "SoN SKU",
  sort: "title-asc",
});
assert.throws(() => parseCatalogProductListQuery({ stock: "hidden" }));
assert.throws(() => parseCatalogProductListQuery({ categoryId: "foreign" }));
```

- [ ] **Step 2: Run the contract test and verify RED because the parser and finite types do not exist**

Run: `node --experimental-strip-types --test packages/saas-contracts/src/catalog/catalog.test.ts`

Expected: FAIL on the missing query parser export.

- [ ] **Step 3: Implement the exact shared parser and list input types**

The parser must reject unknown keys, controls, overlong search, noncanonical UUIDs, unknown enums, and normalize blank search to omission while defaulting sort to `updated-desc`.

- [ ] **Step 4: Run contracts GREEN, then write repository tests for query-bound and filter-bound cursor rejection**

```ts
const first = await repository(pool).listProducts({ ...base, search: "last sku", sort: "title-asc" });
await assert.rejects(
  repository(noCheckoutPool).listProducts({ ...base, search: "other", sort: "title-asc", cursor: first.nextCursor }),
  invalidInput,
);
```

The same mutation test covers status, stock, category, brand, collection, and sort one dimension at a time and asserts zero pool checkout.

- [ ] **Step 5: Run the repository test and verify RED because cursor v1 binds only store/status**

Run: `node --experimental-strip-types --test packages/saas-data/src/catalog/repository.test.ts`

Expected: FAIL because the current cursor accepts or cannot encode the new query context.

- [ ] **Step 6: Implement cursor v2 exact parsing, context binding, and keyset anchor validation**

Keep the cursor opaque and base64url-canonical, cap it at 2048 characters, and reject malformed dates, titles, UUIDs, extra keys, cross-store use, and every query mismatch before database access.

- [ ] **Step 7: Run contract and repository tests GREEN**

Run: `node --experimental-strip-types --test packages/saas-contracts/src/catalog/catalog.test.ts packages/saas-data/src/catalog/repository.test.ts`

Expected: PASS with all query and cursor cases.

### Task 2: Additive v3 SQL authority and migration compatibility

**Files:**
- Create: `apps/owner/scripts/sql/saas/202608260116_catalog_product_global_query.up.sql`
- Create: `apps/owner/scripts/sql/saas/202608260116_catalog_product_global_query.down.sql`
- Create: `apps/owner/scripts/sql/saas/202608260116_catalog_product_global_query_assertions.sql`
- Create: `apps/owner/scripts/sql/saas/catalog-product-global-query-migration.test.ts`
- Create: `tests/saas-phase3/catalog-product-global-query/postgres-harness.mjs`
- Modify: `packages/saas-data/src/catalog/repository.ts`
- Modify: `packages/saas-data/src/catalog/repository.test.ts`
- Modify: `apps/customer-panel/lib/server-panel-access/postgres-runtime.ts`
- Modify: `apps/customer-panel/lib/server-panel-access/postgres-runtime.test.ts`

**Interfaces:**
- Consumes: the normalized query and decoded keyset anchor from Task 1.
- Produces: `saas.catalog_list_products_v3(...query..., p_page_size, p_cursor_timestamp, p_cursor_title, p_cursor_id)`.
- Produces: exact v3 payload `items`, `hasMore`, `catalogTotal`, `featuredImages`, `variantSummaries`, and `cursorAnchor`.
- Preserves: v1 and v2 definitions/ACLs byte-for-byte and makes v3 readiness a migration-first prerequisite for new code.

- [ ] **Step 1: Write static migration tests before SQL exists**

Tests require additive-only v3 creation, owner/security-definer fixed search path, app-only execute ACL, no v1/v2 replacement, tenant predicates on every joined table, finite filters/sorts, and down migration dropping only v3.

- [ ] **Step 2: Run static migration test and verify RED because 116 files do not exist**

Run: `node --experimental-transform-types --test apps/owner/scripts/sql/saas/catalog-product-global-query-migration.test.ts`

Expected: FAIL with the three 116 files missing.

- [ ] **Step 3: Write PostgreSQL 16 rehearsal scenarios before the migration implementation**

The disposable harness seeds 1,631 tenant-A products plus a tenant-B sentinel and asserts:

```text
title and slug search outside page one
last-page SKU search
barcode search
case/trim normalization
cross-tenant exclusion
active/draft/archived
in-stock/out-of-stock/untracked
category/brand/collection
global title A-Z/title Z-A/updated/newest/oldest
keyset pages have no duplicate or missing rows
v1 old app unchanged on new schema
v2 current app unchanged on new schema
v3 new app on new schema
v2 code-only rollback after v3 down
```

- [ ] **Step 4: Run rehearsal and verify RED because v3 is absent**

Run: `node tests/saas-phase3/catalog-product-global-query/postgres-harness.mjs`

Expected: FAIL when resolving the v3 regprocedure.

- [ ] **Step 5: Implement v3 with one page-scoped projection query**

Use tenant-bound `EXISTS` predicates for variant search and merchandising filters, a deterministic representative variant for stock state and list projection, finite CASE-based keyset ordering, and page-scoped featured media/variant JSON aggregation. Do not grant base-table privileges or alter v1/v2.

- [ ] **Step 6: Switch the new repository to v3 and require v3 in server readiness**

The repository must pass one exact SQL call, parse the exact payload, encode the returned anchor only when `hasMore`, and reject hostile/mismatched projections. The readiness probe checks regprocedure existence and `celebix_saas_app` execute privilege so migration precedes code.

- [ ] **Step 7: Run repository, readiness, static migration, and PostgreSQL rehearsal GREEN**

Run:

```bash
node --experimental-strip-types --test packages/saas-data/src/catalog/repository.test.ts
node --conditions=react-server --experimental-transform-types --test apps/customer-panel/lib/server-panel-access/postgres-runtime.test.ts
node --experimental-transform-types --test apps/owner/scripts/sql/saas/catalog-product-global-query-migration.test.ts
node tests/saas-phase3/catalog-product-global-query/postgres-harness.mjs
```

Expected: PASS, including explicit four-way compatibility and 1,631-product scenarios.

### Task 3: Exact HTTP and browser-client query transport

**Files:**
- Modify: `apps/customer-panel/lib/catalog-http/request-input.ts`
- Modify: `apps/customer-panel/lib/catalog-http/request-input.test.ts`
- Modify: `apps/customer-panel/lib/catalog-http/handler.test.ts`
- Modify: `apps/customer-panel/lib/catalog-ui/client.ts`
- Modify: `apps/customer-panel/lib/catalog-ui/client.test.ts`
- Create: `apps/customer-panel/lib/catalog-ui/product-list-query.ts`
- Create: `apps/customer-panel/lib/catalog-ui/product-list-query.test.ts`

**Interfaces:**
- Consumes: shared query types from Task 1.
- Produces: bounded URL keys `q`, `status`, `stock`, `category`, `brand`, `collection`, `sort`, `limit`, and `cursor`.
- Produces: pure URL state parser/serializer used by the server page and client history writer.

- [ ] **Step 1: Write failing request/client tests for every query dimension**

```ts
assert.deepEqual(readCatalogListInput(request("?q=%20Son%20SKU%20&stock=out-of-stock&sort=title-asc")), {
  kind: "valid",
  value: { pageSize: 20, search: "Son SKU", stock: "out-of-stock", sort: "title-asc" },
});
assert.equal(fetchPath, "/api/catalog/products?limit=20&q=Son+SKU&stock=out-of-stock&sort=title-asc");
```

Reject duplicate keys, encoded keys, malformed percent escapes, unknown enums, invalid UUID filters, oversized search/query, and private authority.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
node --conditions=react-server --experimental-transform-types --test apps/customer-panel/lib/catalog-http/request-input.test.ts apps/customer-panel/lib/catalog-http/handler.test.ts
node --experimental-transform-types --test apps/customer-panel/lib/catalog-ui/client.test.ts apps/customer-panel/lib/catalog-ui/product-list-query.test.ts
```

Expected: FAIL because the new transport keys and URL helpers are absent.

- [ ] **Step 3: Implement canonical bounded decoding, handler forwarding, client encoding, and URL helpers**

Encoded values and Turkish search text are allowed; encoded parameter names and malformed encodings remain rejected. Blank search is omitted, default filters/sort are omitted from browser URL state, and no store/principal authority is accepted.

- [ ] **Step 4: Run focused HTTP/client tests GREEN**

Use the Step 2 commands and require zero failures.

### Task 4: Debounced server-authoritative product console

**Files:**
- Modify: `apps/customer-panel/app/products/page.tsx`
- Modify: `apps/customer-panel/components/catalog/ProductListConsole.tsx`
- Modify: `apps/customer-panel/lib/product-console.test.ts`
- Modify: `apps/customer-panel/app/globals.css` only if the existing filter layout cannot render the added controls accessibly.

**Interfaces:**
- Consumes: server-parsed initial URL state and `catalogApi.listProducts(query, signal)`.
- Produces: debounced search, all required status/stock/category/brand/collection filters, five server sort modes, URL replacement, selection/cursor reset, stale response suppression, and distinct true-empty/no-result states.

- [ ] **Step 1: Write mounted failing tests for server authority and concurrency**

Tests prove:

```text
typing does not request before debounce
trimmed search requests after debounce
search and every filter clear selection/cursor
sort clears cursor
an old search response cannot overwrite a newer query
no rows plus catalogTotal=0 renders “Henüz ürün yok”
no rows plus catalogTotal>0 renders “Aramanızla eşleşen ürün bulunamadı”
all query state serializes into the URL
no rows.filter or rows.sort remains as catalog authority
request budget remains one list plus optional one summary/options request and zero detail calls
```

- [ ] **Step 2: Run product-console test and verify RED**

Run: `node --experimental-transform-types --test apps/customer-panel/lib/product-console.test.ts`

Expected: FAIL on missing query controls/behavior.

- [ ] **Step 3: Implement debounced query state and remove client catalog filtering/sorting**

Invalidate in-flight reads as soon as search text changes, issue the normalized query after the fixed debounce, abort superseded transport where safe, and retain the generation check before every state write. Query context changes replace rows, clear the old next cursor and selection, and update the current `/products` URL without navigation.

- [ ] **Step 4: Render category/brand/collection options from the existing tenant-scoped onboarding options API**

Load finite options only when filters are opened, never per row, and expose an honest unavailable state without weakening list query authority.

- [ ] **Step 5: Run product-console and client tests GREEN**

Run:

```bash
node --experimental-transform-types --test apps/customer-panel/lib/product-console.test.ts apps/customer-panel/lib/catalog-ui/client.test.ts apps/customer-panel/lib/catalog-ui/product-list-query.test.ts
```

Expected: PASS with stale-response and zero-detail-call coverage.

### Task 5: Full verification, independent review, commit, and PR

**Files:**
- Verify every modified file; do not add scope-external repairs.

**Interfaces:**
- Produces: fresh test/build evidence, independent reviewer verdict, exact commit, remote SHA, and unmerged PR URL.

- [ ] **Step 1: Run contracts, data, customer-panel, and migration tests**

```bash
npm test --workspace @celebix/saas-contracts
npm test --workspace @celebix/saas-data
npm test --workspace @celebix/customer-panel
node --experimental-transform-types --test apps/owner/scripts/sql/saas/catalog-product-list-projection-migration.test.ts apps/owner/scripts/sql/saas/catalog-product-global-query-migration.test.ts
node tests/saas-phase3/catalog-product-list-projection/postgres-harness.mjs
node tests/saas-phase3/catalog-product-global-query/postgres-harness.mjs
```

- [ ] **Step 2: Run three typechecks, production build, and whitespace gate**

```bash
npm run typecheck --workspace @celebix/saas-contracts
npm run typecheck --workspace @celebix/saas-data
npm run typecheck --workspace @celebix/customer-panel
npm run build --workspace @celebix/customer-panel
git diff --check
```

- [ ] **Step 3: Review the final diff for forbidden paths and requirements coverage**

Run `git status --short`, `git diff --stat`, `git diff --name-only`, and confirm no path starts with `apps/admin/` and every Hat B acceptance item maps to a passing test.

- [ ] **Step 4: Request an independent read-only code review**

Give the reviewer base `13c68846a2ae05dc2c23a8e268543fb33217645b`, the final head, this plan, and the Hat B requirements. Fix every Critical/Important issue through a new RED/GREEN cycle and repeat all affected verification.

- [ ] **Step 5: Create the exact commit and push without force**

```bash
git add docs/superpowers/plans/2026-08-26-global-product-query.md packages/saas-contracts/src/catalog packages/saas-data/src/catalog apps/customer-panel/app/products/page.tsx apps/customer-panel/components/catalog/ProductListConsole.tsx apps/customer-panel/lib/catalog-http apps/customer-panel/lib/catalog-ui apps/customer-panel/lib/product-console.test.ts apps/customer-panel/lib/server-panel-access apps/customer-panel/app/globals.css apps/owner/scripts/sql/saas/202608260116_catalog_product_global_query.up.sql apps/owner/scripts/sql/saas/202608260116_catalog_product_global_query.down.sql apps/owner/scripts/sql/saas/202608260116_catalog_product_global_query_assertions.sql apps/owner/scripts/sql/saas/catalog-product-global-query-migration.test.ts tests/saas-phase3/catalog-product-global-query
git commit -m "feat(customer-panel): add global product search filters and sorting"
git push -u origin codex/atlas-products-global-query
```

- [ ] **Step 6: Open the exact unmerged PR**

```text
Base: codex/design-tabs-save-fix-live
Head: codex/atlas-products-global-query
Title: feat(customer-panel): add global product search filters and sorting
```

The PR body reports query scope, additive v3 compatibility matrix, PostgreSQL 16 rehearsal, tests/typechecks/build, review verdict, and all prohibited mutations as `NONE`.
