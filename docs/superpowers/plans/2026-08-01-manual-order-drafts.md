# Manual Order Drafts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tenant-safe order drafts that a merchant can create, edit, archive, and convert into a real manual order from the Celebix admin panel.

**Architecture:** Extend the existing order contract, PostgreSQL repository, same-origin HTTP boundary, browser client, and order navigation rather than creating a parallel authority stack. Drafts snapshot customer, address, catalog, and money facts; conversion validates the current catalog variants, atomically creates the order/items/event, and records an immutable idempotent operation. Stock is deducted only when the merchant explicitly enables inventory adjustment; the conversion result records that choice truthfully.

**Tech Stack:** TypeScript 5.9, React 19, Next.js 16 App Router, CSS Modules, Node test runner, PostgreSQL 16 PL/pgSQL, `@celebix/saas-contracts`, and `@celebix/saas-data`.

## Global Constraints

- Work only in `/Users/Celebix/Desktop/ecommerce-celebix/.codex-worktrees/guzide-staging-integration` on `codex/guzide-staging-integration`.
- Store, principal, membership, plan, database, credential, and provider authority remains server-side.
- Draft mutations require `orders.manage`; draft reads require `orders.read`.
- Browser requests never send store IDs, tenant IDs, membership IDs, plan facts, database facts, or provider secrets.
- Draft line prices are safe integer minor units. Server conversion recalculates totals from the persisted draft and rejects arithmetic mismatch.
- A draft contains 1-100 dense lines. Quantities are 1-9,999 and per-line discounts cannot exceed `unitPriceCents * quantity`.
- Draft status is one of `draft`, `converted`, or `archived`. Only `draft` records can be edited, archived, or converted.
- Conversion creates an order with source `manual`, status `pending`, and payment status `pending`.
- `adjustInventory=true` locks active variants in stable UUID order, rejects insufficient tracked stock, uses the existing `checkout_sale` inventory marker with the new order ID, writes immutable inventory movements, and records a restorable manual-order inventory commitment. `adjustInventory=false` is rendered as `Stok değiştirilmedi` in the order event.
- Cancelling an inventory-adjusted manual order restores each committed tracked quantity exactly once before the order becomes cancelled. Replay cannot duplicate the restoration.
- Conversion never claims payment, shipment, invoice, or provider success.
- Every production behavior starts with a focused failing test observed before implementation.
- Migration `078` is additive and must include up, down, assertions, manifest, and disposable PostgreSQL 16 rehearsal.

---

### Task 1: Strict order-draft contracts

**Files:**
- Modify: `packages/saas-contracts/src/orders/types.ts`
- Modify: `packages/saas-contracts/src/orders/validation.ts`
- Modify: `packages/saas-contracts/src/orders/index.ts`
- Modify: `packages/saas-contracts/src/orders/orders.test.ts`
- Modify: `packages/saas-contracts/src/contracts.test.ts`
- Modify: `packages/saas-contracts/src/index.ts`
- Modify: `packages/saas-data/src/analytics/types.ts`
- Modify: `packages/saas-data/src/analytics/validation.ts`
- Modify: `packages/saas-data/src/analytics/outbox-repository.test.ts`

**Interfaces:**
- Produce `ORDER_DRAFT_STATUSES`, `OrderDraftStatus`, `OrderDraftLine`, `OrderDraftListItem`, `OrderDraftDetail`, `OrderDraftSaveIntent`, and `OrderDraftConversionResult`.
- Produce `parseOrderDraftListItem(value)`, `parseOrderDraftDetail(value)`, `parseOrderDraftSaveIntent(value)`, and `parseOrderDraftConversionResult(value)`.
- Add `manual` to `ORDER_SOURCES` and `OrderSource`.

- [ ] **Step 1: Write the failing contract test**

Use a literal draft containing one variant line, a customer snapshot, separate shipping/billing addresses, `shippingCents`, `discountCents`, `note`, `adjustInventory`, timestamps, and version. Assert exact keys, deep freezing, arithmetic, 100-line maximum, unique line/variant IDs, canonical UUIDs, TRY currency, dense arrays, and rejection of private authority fields.

- [ ] **Step 2: Run the contract test and observe RED**

Run: `node --experimental-transform-types --test packages/saas-contracts/src/orders/orders.test.ts`

Expected: FAIL because `parseOrderDraftDetail` and the other draft exports do not exist.

- [ ] **Step 3: Implement strict parsers**

Reuse the existing `exact`, `uuid`, `timestamp`, `safeInteger`, address, item arithmetic, and recursive freeze helpers. Extend the analytics purchase-source union and outbox claim parser with `manual`, backed by a failing `outbox-repository.test.ts` case that parses a real claimed payload with `source: "manual"`. `parseOrderDraftSaveIntent` accepts exactly:

```ts
{
  customerId?: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  currency: "TRY";
  shippingCents: number;
  discountCents: number;
  shippingAddress: OrderAddress;
  billingAddress: OrderAddress;
  note?: string;
  adjustInventory: boolean;
  lines: readonly {
    lineId: string;
    productId: string;
    variantId: string;
    quantity: number;
    discountCents: number;
  }[];
  expectedVersion?: number;
}
```

- [ ] **Step 4: Run GREEN and package regression**

Run:

```bash
node --experimental-transform-types --test packages/saas-contracts/src/orders/orders.test.ts
npm test --workspace @celebix/saas-contracts
npm run typecheck --workspace @celebix/saas-contracts
```

- [ ] **Step 5: Commit the contract slice**

Commit: `feat(orders): define strict manual order drafts`

---

### Task 2: Tenant-scoped PostgreSQL draft authority

**Files:**
- Create: `apps/owner/scripts/sql/saas/202608010078_manual_order_drafts.up.sql`
- Create: `apps/owner/scripts/sql/saas/202608010078_manual_order_drafts.down.sql`
- Create: `apps/owner/scripts/sql/saas/202608010078_manual_order_drafts_assertions.sql`
- Create: `apps/owner/scripts/sql/saas/manual-order-drafts-migration.test.ts`
- Create: `apps/owner/scripts/sql/saas/phase3-manual-order-drafts-manifest.json`
- Create: `tests/saas-phase3/manual-order-drafts/postgres-harness.mjs`

**Interfaces:**
- Create `saas.order_drafts`, `saas.order_draft_lines`, immutable `saas.order_draft_operations`, and `saas.manual_order_inventory_commitments`.
- Produce `saas.order_drafts_list`, `saas.order_drafts_get`, `saas.order_drafts_create`, `saas.order_drafts_update`, `saas.order_drafts_archive`, `saas.order_drafts_convert`, and `saas.order_drafts_recover_operation`.
- Extend `saas.orders.source` to allow `manual` and extend analytics source validation to accept the same source.

- [ ] **Step 1: Write migration/static tests and observe RED**

Assert the migration triple and manifest hashes, all exact function signatures, `SECURITY DEFINER`, fixed `search_path`, owner role, PUBLIC revoke, app-only execute grants, tenant-prefixed keys, foreign keys, finite timestamps, safe money/version checks, and rollback coverage.

Run: `node --experimental-transform-types --test apps/owner/scripts/sql/saas/manual-order-drafts-migration.test.ts`

Expected: FAIL because migration `078` does not exist.

- [ ] **Step 2: Create the additive schema**

`order_drafts` stores merchant/customer snapshots, status, currency, subtotal/shipping/discount/total, both addresses, note, `adjust_inventory`, converted order ID, version, and timestamps. `order_draft_lines` stores the catalog IDs plus immutable product/variant/SKU/price snapshots. `order_draft_operations` stores `operation_id`, `operation_kind`, SHA-256 fingerprint, safe result payload, and commit time; update/delete triggers reject mutation. `manual_order_inventory_commitments` stores the converted order, variant, committed quantity, and nullable restoration operation/time under tenant-prefixed unique keys.

- [ ] **Step 3: Implement list/get/create/update/archive functions**

All functions call `saas.merchant_action_authority_error` with the required orders action, reject malformed arrays before reading their elements, lock the draft for mutation, enforce expected version, copy active product/variant display and current price values on save, and return only safe camelCase JSON projections.

- [ ] **Step 4: Implement idempotent conversion**

`order_drafts_convert` must:

1. recover/replay an existing matching conversion operation;
2. lock the draft and its lines, then lock active catalog variants in UUID order;
3. reject non-draft status, stale version, missing lines, inactive variants, unsafe arithmetic, or insufficient tracked stock;
4. create a `manual`/`pending`/`pending` order, dense order items, and one immutable `order_created` event;
5. when `adjust_inventory` is true, set `saas.inventory.source_marker=checkout_sale`, `source_id=order_id`, and `source_time=p_now`, then decrement tracked variant quantities before clearing the markers;
6. mark the draft `converted`, store the order ID, increment version, and save the immutable operation result;
7. return `{draftId, orderId, orderNumber, draftVersion, adjustedInventory, replayed}`.

Replace `saas.orders_transition_status` in the same migration with a source-aware body that preserves every existing transition and adds one atomic rule: before a `manual` order enters `cancelled`, any unrestored inventory commitments are locked in UUID order, returned with `catalog_adjustment` markers keyed by the status-transition operation ID, and marked restored. The existing order operation replay check runs before restoration, so a repeated request returns the stored result without changing inventory.

Order numbers use the collision-resistant canonical format `MAN-` plus the first 20 lowercase hexadecimal characters of the order UUID without dashes. This avoids a shared mutable counter and remains unique under the existing `(store_id, order_number)` constraint.

- [ ] **Step 5: Add PostgreSQL 16 rehearsal**

Cover create/get/list/update/archive, exact replay, payload mismatch, stale version, cross-store isolation, role denial, inactive store, missing feature, 100/101 lines, duplicate variants, price snapshot refresh, insufficient stock, tracked and untracked conversion, inventory marker cleanup, order/item/event creation, cancellation restoration, cancellation replay without duplicate stock, operation immutability, rollback, and reapply.

- [ ] **Step 6: Run GREEN and commit**

Run:

```bash
node --experimental-transform-types --test apps/owner/scripts/sql/saas/manual-order-drafts-migration.test.ts
node tests/saas-phase3/manual-order-drafts/postgres-harness.mjs
npm test --workspace @celebix/owner
```

Commit: `feat(saas): add tenant-safe manual order drafts`

---

### Task 3: Repository and runtime methods

**Files:**
- Modify: `packages/saas-data/src/orders/types.ts`
- Modify: `packages/saas-data/src/orders/validation.ts`
- Modify: `packages/saas-data/src/orders/canonical.ts`
- Modify: `packages/saas-data/src/orders/errors.ts`
- Modify: `packages/saas-data/src/orders/repository.ts`
- Modify: `packages/saas-data/src/orders/repository.test.ts`
- Modify: `packages/saas-data/src/orders/index.ts`
- Modify: `apps/customer-panel/lib/server-orders/runtime.ts`
- Modify: `apps/customer-panel/lib/server-orders/runtime.test.ts`

**Interfaces:**
- Add `listDrafts`, `getDraft`, `createDraft`, `updateDraft`, `archiveDraft`, and `convertDraft` to `OrderRepository`.
- All mutations accept `operationId`; update/archive/convert also accept `expectedVersion`.
- Add errors `draft_not_found`, `draft_not_editable`, `inventory_conflict`, and `catalog_conflict`.

- [ ] **Step 1: Write repository and runtime failing tests**

Assert exact SQL names/argument order, transaction options, operation fingerprints, mutation recovery after unknown commit, replay semantics, safe parser use, output freezing, cross-identity rejection, rollback, destroy-on-unknown-commit, and inclusion of all six methods in the server facade.

- [ ] **Step 2: Run RED**

Run:

```bash
node --experimental-transform-types --test packages/saas-data/src/orders/repository.test.ts
node --experimental-transform-types --test apps/customer-panel/lib/server-orders/runtime.test.ts
```

- [ ] **Step 3: Implement validated repository methods**

Reuse `acquirePostgresClient`, authority tuples, bounded statement/lock timeouts, immutable projections, canonical JSON fingerprints, and the existing recovery pattern. Never pass browser-derived authority into SQL.

- [ ] **Step 4: Run GREEN and commit**

Run:

```bash
npm test --workspace @celebix/saas-data
npm run typecheck --workspace @celebix/saas-data
node --experimental-transform-types --test apps/customer-panel/lib/server-orders/runtime.test.ts
```

Commit: `feat(orders): expose draft repository authority`

---

### Task 4: Same-origin HTTP and strict browser client

**Files:**
- Modify: `apps/customer-panel/lib/order-http/request-authority.ts`
- Modify: `apps/customer-panel/lib/order-http/request-input.ts`
- Modify: `apps/customer-panel/lib/order-http/handler.ts`
- Modify: `apps/customer-panel/lib/order-http/handler.test.ts`
- Modify: `apps/customer-panel/lib/order-http/default.ts`
- Modify: `apps/customer-panel/lib/order-ui/client.ts`
- Modify: `apps/customer-panel/lib/order-console.test.ts`
- Create: `apps/customer-panel/app/api/orders/drafts/route.ts`
- Create: `apps/customer-panel/app/api/orders/drafts/[draftId]/route.ts`
- Create: `apps/customer-panel/app/api/orders/drafts/[draftId]/archive/route.ts`
- Create: `apps/customer-panel/app/api/orders/drafts/[draftId]/convert/route.ts`

**Interfaces:**
- `GET /api/orders/drafts?pageSize=…&cursor=…`
- `POST /api/orders/drafts`
- `GET|POST /api/orders/drafts/:draftId`
- `POST /api/orders/drafts/:draftId/archive`
- `POST /api/orders/drafts/:draftId/convert`
- `orderApi.listDrafts`, `getDraft`, `createDraft`, `updateDraft`, `archiveDraft`, and `convertDraft`.

- [ ] **Step 1: Write failing HTTP and client tests**

Cover exact paths/methods, Origin checks, query policy, same-origin credentials, no-store headers, session cookie authority, private authority headers, malformed IDs/payloads, idempotency keys, new error mapping, strict response parsing, replay, and provider-secret rejection.

- [ ] **Step 2: Run RED**

Run:

```bash
node --experimental-transform-types --test apps/customer-panel/lib/order-http/handler.test.ts
node --experimental-transform-types --test apps/customer-panel/lib/order-console.test.ts
```

- [ ] **Step 3: Implement the minimal HTTP/client boundary**

Reuse the current order authorization, cookie resolution, request IDs, safe JSON helpers, and UUID-based operation IDs. Creation/update sends only `OrderDraftSaveIntent`; conversion sends only `{expectedVersion}` because `adjustInventory` is persisted on the draft.

- [ ] **Step 4: Run GREEN and commit**

Commit: `feat(admin): add secure order draft endpoints`

---

### Task 5: Draft list and editor workspace

**Files:**
- Create: `apps/customer-panel/components/orders/OrderDraftListConsole.tsx`
- Create: `apps/customer-panel/components/orders/OrderDraftEditor.tsx`
- Create: `apps/customer-panel/components/orders/order-drafts.module.css`
- Modify: `apps/customer-panel/components/orders/OrderListConsole.tsx`
- Modify: `apps/customer-panel/components/orders/OrderDetailConsole.tsx`
- Create: `apps/customer-panel/app/orders/drafts/page.tsx`
- Create: `apps/customer-panel/app/orders/drafts/new/page.tsx`
- Create: `apps/customer-panel/app/orders/drafts/[draftId]/page.tsx`
- Modify: `apps/customer-panel/lib/panel-ui/navigation.ts`
- Modify: `apps/customer-panel/lib/panel-ui/navigation.test.ts`
- Modify: `apps/customer-panel/lib/panel-shell.test.ts`
- Modify: `apps/customer-panel/lib/order-console.test.ts`

**Interfaces:**
- Add `Taslak Siparişler` under the Siparişler dropdown between `Tüm Siparişler` and `Hızlı Siparişler`.
- List route shows number, customer, line count, total, inventory policy, status, updated time, and exact detail link.
- Editor consumes `loadCatalogVariantChoices` and `customerApi.list` without duplicating catalog/customer authority.

- [ ] **Step 1: Write failing route/navigation/presentation tests**

Assert list loading/empty/error/loaded states, create and edit routes, product search and selection, quantity/discount arithmetic, customer selection/manual identity, separate or copied billing address, inventory-adjustment checkbox, note, save, archive confirmation, convert confirmation, version conflict reload, converted order link, read-only role behavior, `manual` source rendered as `Manuel sipariş`, and no provider-success copy.

- [ ] **Step 2: Run UI RED**

Run:

```bash
node --experimental-transform-types --test apps/customer-panel/lib/order-console.test.ts
node --experimental-transform-types --test apps/customer-panel/lib/panel-ui/navigation.test.ts
node --experimental-transform-types --test apps/customer-panel/lib/panel-shell.test.ts
```

- [ ] **Step 3: Implement the responsive list/editor**

Desktop editor uses a main form plus sticky summary rail; at 1024px it becomes one column, and at 640px line rows/actions stack with 44px targets. Save keeps the merchant on the draft detail. Conversion requires an inline confirmation and navigates to `/orders/:orderId` only after the server returns the durable conversion result.

- [ ] **Step 4: Run GREEN and commit**

Run:

```bash
npm test --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/customer-panel
```

Commit: `feat(admin): deliver manual order draft workspace`

---

### Task 6: Build, migration, deployment, and live evidence

**Files:**
- Modify generated build metadata only through the existing build workflow, then restore source-controlled null metadata.

- [ ] **Step 1: Run complete local verification**

Run touched-package tests/typechecks, customer-panel and Owner production builds with exact `SOURCE_COMMIT`, migration static tests, PostgreSQL harness, `git diff --check`, and `git status --short`.

- [ ] **Step 2: Push and verify immutable source identity**

Push `codex/guzide-staging-integration` and compare local/remote SHAs exactly.

- [ ] **Step 3: Apply migration `078` and assertions**

Apply to the self-hosted staging PostgreSQL database before the new customer-panel image receives traffic. Verify function ownership, execute ACL, tables, constraints, triggers, and current migration hash.

- [ ] **Step 4: Deploy through Coolify**

Deploy the existing customer-panel and Owner applications from the pushed SHA and wait for finished/healthy state.

- [ ] **Step 5: Run live Güzide Kuyumcu QA**

Use safe test data to prove list -> new draft -> save -> edit -> convert -> order detail, exact inventory behavior, refresh persistence, no duplicate conversion on replay, desktop/mobile rendering, empty/error handling, no framework overlay, and no relevant console errors. Remove only the dedicated test records through the supported archive workflow.

- [ ] **Step 6: Update the maturity ledger truthfully**

Mark `draft_orders` and `manual_order_creation` operational only after live evidence. Keep order tags, gift cards, hosted payment requests, invoices, and shipping labels as explicit gaps for subsequent plans.
