# Order Workspace Parity V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Every production behavior change follows superpowers:test-driven-development.

**Goal:** Deliver the first İkas-depth increment as a responsive Celebix order workspace with truthful status hierarchy and deterministic previous/next order navigation backed by tenant-scoped PostgreSQL authority.

**Architecture:** Preserve the existing order detail and mutation boundary while adding a narrow order-neighbor read contract through PostgreSQL, repository, HTTP, and browser layers. Refactor the presentation into a two-column workspace that renders only currently durable facts and keeps all current status, payment, shipping, notes, print, conflict, and permission behavior working.

**Tech Stack:** TypeScript 5.9, React 19, Next.js 16 App Router, CSS Modules, Node test runner, PostgreSQL 16 PL/pgSQL, existing `@celebix/saas-contracts` and `@celebix/saas-data` packages.

## Global Constraints

- Work only in the linked worktree `/Users/Celebix/Desktop/ecommerce-celebix/.codex-worktrees/guzide-staging-integration` on `codex/guzide-staging-integration`.
- İkas is a read-only workflow reference. The target retains Celebix brand, copy, shell, authority, and routes.
- Browser requests never carry tenant, store, principal, membership, plan, database, credential, or provider-secret authority.
- Existing status, payment, shipping, note, archive-note, print, session, and storefront behavior must not regress.
- Previous/next navigation is deterministic by `(created_at DESC, id DESC)` within the active store and never crosses a tenant.
- No payment link, refund, invoice, shipping-label, tag, tax, billing-address, or provider success is shown before its real durable slice exists.
- Every new production behavior has a focused failing test observed before implementation.
- Migrations are additive and include up, down, assertions, manifest, and disposable PostgreSQL 16 rehearsal evidence.

---

### Task 1: Truthful functional maturity ledger

**Files:**
- Create: `apps/customer-panel/lib/panel-ui/functional-maturity.ts`
- Create: `apps/customer-panel/lib/panel-ui/functional-maturity.test.ts`

**Interfaces:**
- Produces `ADMIN_MODULE_MATURITY`, `AdminModuleMaturity`, and `getAdminModuleMaturity(module)`.
- Consumes only literal module capability facts; it does not inspect UI source or replace behavior tests.

- [ ] **Step 1: Write the failing maturity behavior test**

Assert literal expected states independently from the implementation:

```ts
assert.deepEqual(getAdminModuleMaturity("orders"), {
  module: "orders",
  state: "foundation",
  operational: ["list", "detail", "status", "payment_status", "shipping", "notes", "print", "quick_links", "abandoned_carts"],
  gaps: ["billing", "taxes", "fulfillment_locations", "tags", "payment_requests", "provider_refunds", "invoices", "shipping_labels"],
});
```

Also assert the registry is deeply frozen, contains every top-level navigation family exactly once, and no module is `production_ready` while its gap list is non-empty.

- [ ] **Step 2: Run RED**

Run: `node --experimental-transform-types --test apps/customer-panel/lib/panel-ui/functional-maturity.test.ts`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `functional-maturity.ts`.

- [ ] **Step 3: Implement the immutable ledger**

Use the finite states `foundation`, `operational`, `provider_gated`, and `production_ready`. Include `orders`, `customers`, `catalog_inventory`, `discounts_marketing_content`, `settings_team`, `marketplaces_accounting_seo`, and `dashboard_analytics`. Return frozen copies and reject unknown module names at the TypeScript boundary.

- [ ] **Step 4: Run GREEN and commit**

Run:

```bash
node --experimental-transform-types --test apps/customer-panel/lib/panel-ui/functional-maturity.test.ts
npm run typecheck --workspace @celebix/customer-panel
```

Commit: `docs(admin): define truthful functional maturity`

---

### Task 2: Order-neighbor safe contract and repository API

**Files:**
- Modify: `packages/saas-contracts/src/orders/types.ts`
- Modify: `packages/saas-contracts/src/orders/validation.ts`
- Modify: `packages/saas-contracts/src/orders/index.ts`
- Modify: `packages/saas-contracts/src/index.ts`
- Modify: `packages/saas-contracts/src/orders/orders.test.ts`
- Modify: `packages/saas-data/src/orders/types.ts`
- Modify: `packages/saas-data/src/orders/repository.ts`
- Modify: `packages/saas-data/src/orders/repository.test.ts`

**Interfaces:**
- Produces `OrderNeighbor`, `OrderNeighbors`, and `parseOrderNeighbors(value)`.
- Adds `OrderRepository.getOrderNeighbors(input: GetOrderInput): Promise<OrderNeighbors>`.
- `OrderNeighbor` contains only `{ id: string; orderNumber: string }`; absent sides are omitted.

- [ ] **Step 1: Write failing contract tests**

Test a deeply frozen `{ previous, next }` result, either omitted side, exact-key rejection, malformed UUID/order number rejection, and private-authority rejection.

- [ ] **Step 2: Run contract RED**

Run: `node --experimental-transform-types --test packages/saas-contracts/src/orders/orders.test.ts`

Expected: FAIL because `parseOrderNeighbors` is not exported.

- [ ] **Step 3: Implement the minimal contract and rerun GREEN**

Use the existing exact-object, UUID, bounded-text, and deep-freeze rules. Do not include timestamps, store IDs, or cursor internals.

- [ ] **Step 4: Write failing repository tests**

Assert the exact call:

```sql
SELECT outcome, result_payload FROM saas.orders_get_neighbors(
  $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid
)
```

Cover found, order-not-found, corrupt result, cross-order identity mismatch, pool failure, frozen output, and no browser authority inputs.

- [ ] **Step 5: Run repository RED**

Run: `node --experimental-transform-types --test packages/saas-data/src/orders/repository.test.ts`

Expected: FAIL because `getOrderNeighbors` does not exist.

- [ ] **Step 6: Implement the repository method and run GREEN**

Reuse the existing read transaction and safe outcome parsing. Validate that returned neighbor IDs differ from the requested order ID and from each other.

- [ ] **Step 7: Run package regressions and commit**

Run:

```bash
npm test --workspace @celebix/saas-contracts
npm test --workspace @celebix/saas-data
npm run typecheck --workspace @celebix/saas-contracts
npm run typecheck --workspace @celebix/saas-data
```

Commit: `feat(orders): add safe order neighbor contract`

---

### Task 3: Tenant-scoped PostgreSQL order neighbors

**Files:**
- Create: `apps/owner/scripts/sql/saas/202607310075_order_neighbors.up.sql`
- Create: `apps/owner/scripts/sql/saas/202607310075_order_neighbors.down.sql`
- Create: `apps/owner/scripts/sql/saas/202607310075_order_neighbors_assertions.sql`
- Create: `apps/owner/scripts/sql/saas/order-neighbors-migration.test.ts`
- Create: `apps/owner/scripts/sql/saas/phase3-order-neighbors-manifest.json`
- Create: `tests/saas-phase3/order-neighbors/postgres-harness.mjs`

**Interfaces:**
- Produces `saas.orders_get_neighbors(authority tuple, now, order_id)` returning `found`, `order_not_found`, or existing authority failures.
- Grants execute only to `celebix_saas_app`; PUBLIC and other runtime roles receive no execute.

- [ ] **Step 1: Write the failing migration/static tests**

Assert the exact migration triple, manifest hashes, function signature, role owner, fixed search path, PUBLIC revoke, app grant, no direct table privilege, and rollback coverage.

- [ ] **Step 2: Run migration RED**

Run: `node --experimental-transform-types --test apps/owner/scripts/sql/saas/order-neighbors-migration.test.ts`

Expected: FAIL because the migration artifacts do not exist.

- [ ] **Step 3: Write the additive function**

The function must:

1. call `saas.merchant_action_authority_error(..., 'orders', 'orders.read')`;
2. find the requested order only inside `p_store_id`;
3. select the previous row with `(created_at,id) > (current.created_at,current.id)` ordered ascending and limited to one;
4. select the next row with `(created_at,id) < (current.created_at,current.id)` ordered descending and limited to one;
5. return only neighbor `id` and `orderNumber` using `jsonb_strip_nulls`;
6. never accept a store ID outside the authority tuple.

- [ ] **Step 4: Add PostgreSQL 16 behavioral rehearsal**

Cover first/middle/last order, equal timestamps resolved by UUID, cross-store isolation, analyst read access, inactive store, missing feature, malformed authority, function ACL, rollback, reapply, and existing order-session preservation.

- [ ] **Step 5: Run GREEN and commit**

Run:

```bash
node --experimental-transform-types --test apps/owner/scripts/sql/saas/order-neighbors-migration.test.ts
node tests/saas-phase3/order-neighbors/postgres-harness.mjs
npm test --workspace @celebix/owner
```

Commit: `feat(saas): add tenant order neighbors`

---

### Task 4: Same-origin neighbor HTTP and browser client

**Files:**
- Modify: `apps/customer-panel/lib/order-http/handler.ts`
- Modify: `apps/customer-panel/lib/order-http/handler.test.ts`
- Modify: `apps/customer-panel/lib/order-http/default.ts`
- Modify: `apps/customer-panel/lib/order-ui/client.ts`
- Modify: `apps/customer-panel/lib/order-console.test.ts`
- Create: `apps/customer-panel/app/api/orders/[orderId]/neighbors/route.ts`

**Interfaces:**
- Adds `GET /api/orders/:orderId/neighbors` with forbidden query and current panel credential authority.
- Adds `orderApi.getOrderNeighbors(orderId): Promise<OrderNeighbors>`.

- [ ] **Step 1: Write the failing HTTP tests**

Cover exact GET path, query rejection, malformed ID, missing/malformed cookie, private authority headers, store denial, not found, safe response projection, and repository failure mapping.

- [ ] **Step 2: Run HTTP RED**

Run: `node --experimental-transform-types --test apps/customer-panel/lib/order-http/handler.test.ts`

Expected: FAIL because the handler is missing.

- [ ] **Step 3: Implement the handler and route, then run HTTP GREEN**

Reuse `authorize`, `pathId`, `execute`, no-store headers, and `parseOrderNeighbors`; do not add a new authentication mechanism.

- [ ] **Step 4: Write the failing browser-client test**

Assert the exact relative path, default same-origin credentials, GET method, immutable result, malformed payload rejection, and safe error mapping.

- [ ] **Step 5: Implement the browser client and run GREEN**

Run:

```bash
node --experimental-transform-types --test apps/customer-panel/lib/order-console.test.ts
node --experimental-transform-types --test apps/customer-panel/lib/order-http/handler.test.ts
```

- [ ] **Step 6: Commit**

Commit: `feat(admin): expose order neighbor navigation`

---

### Task 5: Responsive Celebix order workspace

**Files:**
- Modify: `apps/customer-panel/components/orders/OrderDetailConsole.tsx`
- Modify: `apps/customer-panel/components/orders/order-console.module.css`
- Modify: `apps/customer-panel/lib/order-console.test.ts`

**Interfaces:**
- `OrderDetailConsole` loads detail and neighbors in parallel with `Promise.all`.
- `OrderDetailPresentation` receives `neighbors?: OrderNeighbors`, keeps all mutation callbacks, and renders previous/next links only when present.

- [ ] **Step 1: Write failing presentation tests**

Assert the rendered hierarchy and behavior:

- compact header contains order number, order status, payment status, print, previous, and next controls;
- left workspace contains products, fulfillment/shipping facts, customer facts, and timeline;
- right summary contains source/time, totals, payment state, and permitted operations;
- no unsupported payment-link, refund, invoice, tag, tax, billing, or shipping-label control is rendered;
- loading/error/conflict and role capability states remain accessible;
- previous/next links use exact encoded order IDs and order numbers.

- [ ] **Step 2: Run presentation RED**

Run: `node --experimental-transform-types --test apps/customer-panel/lib/order-console.test.ts`

Expected: FAIL because the workspace hierarchy and neighbors do not exist.

- [ ] **Step 3: Refactor the presentation**

Use semantic sections and existing panel primitives. Keep status/payment mutations as controlled selects, move shipping editing behind an explicit `<details>` editor, keep notes and immutable events in the timeline column, and make the summary rail sticky only above the desktop breakpoint.

- [ ] **Step 4: Add responsive CSS**

Desktop uses `minmax(0, 1fr) minmax(18rem, 22rem)`. At `max-width: 1024px` it becomes one column and the summary loses sticky positioning. At `max-width: 640px`, neighbor controls remain readable, item rows stack, and all buttons/selects have at least 44px height.

- [ ] **Step 5: Run GREEN and workspace verification**

Run:

```bash
node --experimental-transform-types --test apps/customer-panel/lib/order-console.test.ts
npm test --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/customer-panel
```

- [ ] **Step 6: Commit**

Commit: `feat(admin): deliver responsive order workspace`

---

### Task 6: Build, deploy, migrate, and live evidence

**Files:**
- Modify only generated build metadata when the existing build contract requires it, then restore source-controlled null metadata after verification.

**Interfaces:**
- Customer panel and Owner images must report the exact final commit SHA.
- Migration `075` must be applied before the customer-panel image receives live traffic.

- [ ] **Step 1: Run final local verification**

Run all touched package tests and typechecks, Owner tests, customer-panel and Owner production builds with exact `SOURCE_COMMIT`, and `git diff --check`.

- [ ] **Step 2: Commit and push the clean branch**

Verify `git status --short`, commit any final reviewed change, push `codex/guzide-staging-integration`, and compare local/remote SHAs.

- [ ] **Step 3: Apply and assert migration `075`**

Apply the up migration and assertion script to the self-hosted staging PostgreSQL database with the existing deployment authority. Confirm the function owner and execute ACL from PostgreSQL.

- [ ] **Step 4: Deploy customer panel and Owner**

Trigger the existing Coolify applications from the pushed SHA. Wait for finished state and verify image commit labels.

- [ ] **Step 5: Run live browser QA**

Verify on Güzide Kuyumcu without business-data mutation:

- detail page identity, nonblank content, no framework overlay, and no relevant console errors;
- previous/next navigation between real orders;
- product, customer, shipping, summary, payment-state, print, notes, and timeline visibility;
- desktop and mobile screenshots;
- one safe navigation interaction followed by a URL and DOM state assertion.

- [ ] **Step 6: Record remaining order gaps truthfully**

Keep `orders` at `foundation` until billing, taxes, fulfillment locations, tags, payment requests, provider refunds, invoices, and shipping labels each receive their own durable implementation plan and live evidence.

