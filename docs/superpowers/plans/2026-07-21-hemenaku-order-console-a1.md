# Hemenaku Order Console A1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Every production change follows superpowers:test-driven-development.

**Goal:** Deliver the first missing Hemenaku menu slice as a real tenant-safe `/orders` list/detail/operations console backed by shared PostgreSQL authority.

**Architecture:** Add an immutable order contract, reusable membership-action decision, PostgreSQL 16 schema/function boundary, constrained `@celebix/saas-data` repository, authenticated same-origin customer-panel API, and pinned-donor presentation adapter. Activate only `Siparişler -> Tüm Siparişler`; quick-order links and abandoned carts remain absent until A2/A3.

**Tech Stack:** TypeScript, Node test runner, Next.js App Router, PostgreSQL 16 PL/pgSQL, `pg`, React, CSS Modules, existing Lucide/Framer Motion dependencies.

## Global Constraints

- Implementation starts from `86b3a4ad` on `codex/hemenaku-admin-presentation-transplant-implementation`.
- Donor reads use only `git show fc6c5318b47f045a7cefcedc7612d5b10563ba32:<path>`.
- `apps/admin/**`, production configuration, deploy files, infrastructure and credentials remain unchanged.
- Target presentation remains `apps/customer-panel`; shared contracts/data and additive SaaS SQL are allowed for the real vertical slice.
- Authority remains durable panel session -> current server membership/store -> `TenantContext`.
- Browser tenant/store/principal/membership IDs, private headers, cookies, tokens, SQL and infrastructure details are forbidden.
- No `/api/admin/**`, Supabase, legacy admin auth, iframe, proxy, second admin app, fake order, fake KPI or dead navigation.
- Direct table writes by `celebix_saas_app` stay denied; app operations use exact `SECURITY DEFINER` functions.
- Money is non-negative integer minor units plus exact `TRY`-style three-letter uppercase currency.
- Every mutation is operation-ID/fingerprint bound, version checked, replay safe and store isolated.
- Tests are written and observed failing before production implementation.

---

### Task 1: Immutable order and action contracts

**Files:**
- Create: `packages/saas-contracts/src/authorization/actions.ts`
- Create: `packages/saas-contracts/src/authorization/actions.test.ts`
- Create: `packages/saas-contracts/src/orders/types.ts`
- Create: `packages/saas-contracts/src/orders/validation.ts`
- Create: `packages/saas-contracts/src/orders/orders.test.ts`
- Create: `packages/saas-contracts/src/orders/index.ts`
- Modify: `packages/saas-contracts/src/index.ts:1-65`
- Modify: `packages/saas-contracts/package.json:8-12`

**Interfaces:**
- Produces `MerchantAction`, `isMerchantActionAllowed(role, action)`, immutable order status constants, order read models, and strict parsers.
- No contract contains `storeId`, `principalId`, `membershipId`, cookie, issuer or provider subject.

- [ ] **Step 1: Write failing authorization tests**

Assert the exact role matrix:

```ts
const cases = [
  ["store_owner", "orders.read", true],
  ["store_owner", "orders.manage", true],
  ["admin", "orders.manage", true],
  ["editor", "orders.read", true],
  ["editor", "orders.fulfill", true],
  ["editor", "orders.payment", false],
  ["analyst", "orders.read", true],
  ["analyst", "orders.note", false],
] as const;
```

Also assert unknown actions fail closed and the exported action list/root value are frozen.

- [ ] **Step 2: Run RED authorization test**

Run: `node --experimental-transform-types --test packages/saas-contracts/src/authorization/actions.test.ts`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `actions.ts`.

- [ ] **Step 3: Implement the minimal action contract**

```ts
import type { StoreMembershipRole } from "../types.ts";

export const MERCHANT_ACTIONS = Object.freeze([
  "orders.read",
  "orders.manage",
  "orders.fulfill",
  "orders.payment",
  "orders.note",
] as const);

export type MerchantAction = (typeof MERCHANT_ACTIONS)[number];

const ROLE_ACTIONS: Readonly<Record<StoreMembershipRole, ReadonlySet<MerchantAction>>> = Object.freeze({
  store_owner: new Set(MERCHANT_ACTIONS),
  admin: new Set(MERCHANT_ACTIONS),
  editor: new Set(["orders.read", "orders.fulfill", "orders.note"]),
  analyst: new Set(["orders.read"]),
});

export function isMerchantActionAllowed(role: StoreMembershipRole, action: MerchantAction): boolean {
  return ROLE_ACTIONS[role]?.has(action) === true;
}
```

- [ ] **Step 4: Write failing order contract tests**

Cover exactly ten behaviors: valid list item; valid detail; valid nested items/events/notes; every value deeply frozen; unknown key rejected; invalid status rejected; invalid currency rejected; negative/unsafe money rejected; invalid timestamp rejected; private authority key rejected.

Required status constants:

```ts
export const ORDER_STATUSES = Object.freeze([
  "pending", "confirmed", "preparing", "shipped", "delivered", "cancelled", "refunded",
] as const);
export const ORDER_PAYMENT_STATUSES = Object.freeze([
  "pending", "processing", "completed", "failed", "refunded",
] as const);
export const ORDER_SOURCES = Object.freeze(["storefront", "quick_link", "marketplace", "manual_import"] as const);
```

Required safe read models:

```ts
export interface OrderListItem {
  readonly id: string;
  readonly orderNumber: string;
  readonly source: OrderSource;
  readonly customerName: string;
  readonly customerEmail: string;
  readonly currency: string;
  readonly totalCents: number;
  readonly status: OrderStatus;
  readonly paymentStatus: OrderPaymentStatus;
  readonly itemCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly version: number;
}

export interface OrderDetail extends OrderListItem {
  readonly customerPhone?: string;
  readonly subtotalCents: number;
  readonly shippingCents: number;
  readonly discountCents: number;
  readonly shippingAddress: Readonly<OrderAddress>;
  readonly tracking?: Readonly<OrderTracking>;
  readonly items: readonly OrderItem[];
  readonly events: readonly OrderEvent[];
  readonly notes: readonly OrderNote[];
}

export interface OrderDashboardSummary {
  readonly totalOrders: number;
  readonly pendingOrders: number;
  readonly fulfilledOrders: number;
  readonly revenueCents: number;
  readonly currency: string;
  readonly asOf: string;
}
```

- [ ] **Step 5: Run RED order contract test**

Run: `node --experimental-transform-types --test packages/saas-contracts/src/orders/orders.test.ts`

Expected: FAIL because order exports do not exist.

- [ ] **Step 6: Implement strict parsers and exports**

Use exact plain-object key sets, UUID validation for entity IDs, ISO UTC timestamps, safe integers for versions/money, three-letter uppercase currency, bounded strings, bounded arrays (items 100, events 200, notes 100), and recursive `Object.freeze`. Export from `orders/index.ts` and package root.

Change the workspace test script from the single root test file to `node --experimental-strip-types --test src/*.test.ts src/**/*.test.ts` so the new contract suites run in every workspace regression.

- [ ] **Step 7: Run GREEN contract tests**

Run:

```bash
node --experimental-transform-types --test packages/saas-contracts/src/authorization/actions.test.ts packages/saas-contracts/src/orders/orders.test.ts
npm test --workspace @celebix/saas-contracts
npm run typecheck --workspace @celebix/saas-contracts
```

Expected: focused **14/14 PASS**; workspace and typecheck PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/saas-contracts
git commit -m "feat(saas): define tenant order contracts"
```

---

### Task 2: Store-scoped order schema and reusable database authorization

**Files:**
- Create: `apps/owner/scripts/sql/saas/202607210022_order_management.up.sql`
- Create: `apps/owner/scripts/sql/saas/202607210022_order_management.down.sql`
- Create: `apps/owner/scripts/sql/saas/202607210022_order_management_assertions.sql`
- Create: `apps/owner/scripts/sql/saas/phase3b1-order-management-manifest.json`
- Create: `tests/saas-phase3/order-management/postgres-harness.mjs`

**Interfaces:**
- Produces `saas.merchant_action_authority_error(...)` and the core order tables.
- Leaves `celebix_saas_app` with no direct table DML privilege.

- [ ] **Step 1: Create the RED PostgreSQL harness**

Use the isolated native PostgreSQL 16 pattern from the Phase 3 harnesses. Apply migrations 001-021, attempt migration 022, and define 18 schema scenarios: manifest hashes; table ownership; exact constraints; composite store foreign keys; action matrix; inactive membership; wrong store; missing feature; expired subscription; no app DML; PUBLIC ACL empty; immutable event; immutable operation fingerprint/result; rollback; reapply; backup/restore; cleanup.

Run: `node tests/saas-phase3/order-management/postgres-harness.mjs`

Expected: FAIL at migration 022 missing.

- [ ] **Step 2: Add the minimal schema migration**

Migration 022 creates these exact tables under owner role:

```sql
CREATE TABLE saas.orders (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES saas.stores(id),
  order_number text NOT NULL,
  source text NOT NULL CHECK (source IN ('storefront','quick_link','marketplace','manual_import')),
  customer_name text NOT NULL,
  customer_email text NOT NULL,
  customer_phone text,
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  subtotal_cents bigint NOT NULL CHECK (subtotal_cents >= 0),
  shipping_cents bigint NOT NULL CHECK (shipping_cents >= 0),
  discount_cents bigint NOT NULL CHECK (discount_cents >= 0),
  total_cents bigint NOT NULL CHECK (total_cents = subtotal_cents + shipping_cents - discount_cents AND total_cents >= 0),
  status text NOT NULL CHECK (status IN ('pending','confirmed','preparing','shipped','delivered','cancelled','refunded')),
  payment_status text NOT NULL CHECK (payment_status IN ('pending','processing','completed','failed','refunded')),
  shipping_address jsonb NOT NULL,
  tracking jsonb,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (store_id, id),
  UNIQUE (store_id, order_number)
);

CREATE TABLE saas.order_items (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  order_id uuid NOT NULL,
  product_id uuid,
  variant_id uuid,
  position integer NOT NULL CHECK (position BETWEEN 0 AND 99),
  product_name text NOT NULL,
  variant_name text,
  sku text,
  unit_price_cents bigint NOT NULL CHECK (unit_price_cents >= 0),
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 9999),
  discount_cents bigint NOT NULL CHECK (discount_cents >= 0),
  line_total_cents bigint NOT NULL CHECK (line_total_cents = unit_price_cents * quantity - discount_cents AND line_total_cents >= 0),
  created_at timestamptz NOT NULL,
  UNIQUE (store_id, order_id, position),
  FOREIGN KEY (store_id, order_id) REFERENCES saas.orders(store_id, id),
  FOREIGN KEY (store_id, product_id) REFERENCES saas.products(store_id, id),
  FOREIGN KEY (store_id, variant_id) REFERENCES saas.product_variants(store_id, id)
);
```

Also create `order_events`, `order_notes`, and `order_operations` with `(store_id, order_id)` composite references, immutable event payloads, author membership references, operation fingerprint/result columns, bounded indexes, and no app table grants.

- [ ] **Step 3: Add database action authority**

`saas.merchant_action_authority_error` accepts the exact server authority tuple plus required feature/action. It re-reads active store, membership, plan/version, subscription validity, ordered enabled feature, and the role-action matrix from Task 1. Return only stable outcomes: `membership_denied`, `store_inactive`, `feature_not_enabled`, `durable_authority_invalid`, or null.

- [ ] **Step 4: Add assertions, rollback and manifest hashes**

The down migration drops only 022 objects in dependency order and is labeled disposable-only. Assertions fail on owner, constraints, FK, ACL, definer/search_path, function volatility, role matrix or cross-store drift. Generate SHA-256 values from exact bytes and place them in the manifest; never fabricate them.

- [ ] **Step 5: Run GREEN schema harness**

Run: `node tests/saas-phase3/order-management/postgres-harness.mjs`

Expected: **18/18 PASS**, PostgreSQL 16.x, cleanup confirmed.

- [ ] **Step 6: Commit**

```bash
git add apps/owner/scripts/sql/saas/202607210022_order_management.* apps/owner/scripts/sql/saas/phase3b1-order-management-manifest.json tests/saas-phase3/order-management/postgres-harness.mjs
git commit -m "feat(saas): add tenant order schema"
```

---

### Task 3: Order SQL read/mutation API and concurrency proof

**Files:**
- Create: `apps/owner/scripts/sql/saas/202607210023_order_management_api.up.sql`
- Create: `apps/owner/scripts/sql/saas/202607210023_order_management_api.down.sql`
- Create: `apps/owner/scripts/sql/saas/202607210023_order_management_api_assertions.sql`
- Modify: `apps/owner/scripts/sql/saas/phase3b1-order-management-manifest.json`
- Modify: `tests/saas-phase3/order-management/postgres-harness.mjs`

**Interfaces:**
- Produces exact app-callable functions for summary, list, detail, status/payment/shipping transitions, notes and operation recovery.

- [ ] **Step 1: Extend harness with 22 RED API scenarios**

The harness total becomes **40 scenarios**. Add happy-path read, bounded deterministic cursor, exact search/status filters, summary, cross-store not-found, analyst read, analyst/editor payment denial, editor fulfillment, status state-machine denial, payment state-machine denial, stale version, same-operation replay, fingerprint mismatch, concurrent same-version single winner, shipping update, note add/archive, invalid address/tracking JSON, operation recovery, result immutability, and no raw private authority in JSON.

Run: `node tests/saas-phase3/order-management/postgres-harness.mjs`

Expected: FAIL because migration 023/functions are missing.

- [ ] **Step 2: Implement exact read functions**

Create these signatures with `SECURITY DEFINER`, safe search path and app EXECUTE only:

```text
orders_get_dashboard_summary(authority tuple, now)
orders_list(authority tuple, now, status, search, page_size, cursor_created_at, cursor_id)
orders_get(authority tuple, now, order_id)
```

List returns newest-first `(created_at,id)` ordering, `page_size + 1`, a safe result payload without `store_id`, and a next cursor only when more rows exist. Detail returns ordered items/events/active notes. Summary counts non-archived orders and revenue only from delivered orders with completed payment.

- [ ] **Step 3: Implement exact mutation functions**

```text
orders_transition_status(authority tuple, now, operation_id, fingerprint, order_id, expected_version, next_status)
orders_transition_payment(authority tuple, now, operation_id, fingerprint, order_id, expected_version, next_payment_status)
orders_update_shipping(authority tuple, now, operation_id, fingerprint, order_id, expected_version, shipping_address, tracking)
orders_add_note(authority tuple, now, operation_id, fingerprint, note_id, order_id, body)
orders_archive_note(authority tuple, now, operation_id, fingerprint, order_id, note_id)
orders_recover_operation(authority tuple, now, operation_id, fingerprint)
```

All lock the referenced order/operation row, call the exact action authority, enforce the state machine, write one immutable event and operation result atomically, increment version exactly once, and return either `committed`, `operation_replayed` or a stable denial. Unknown commit recovery is read-only.

- [ ] **Step 4: Assert/grant and update genuine manifest hashes**

PUBLIC has no execute. `celebix_saas_app` has execute only. Tables still have no direct app DML. Assertions verify every signature, owner, volatility, search path and ACL.

- [ ] **Step 5: Run GREEN PostgreSQL API harness**

Run: `node tests/saas-phase3/order-management/postgres-harness.mjs`

Expected: **40/40 PASS**, including rollback/reapply/backup/restore/cleanup.

- [ ] **Step 6: Commit**

```bash
git add apps/owner/scripts/sql/saas/202607210023_order_management_api.* apps/owner/scripts/sql/saas/phase3b1-order-management-manifest.json tests/saas-phase3/order-management/postgres-harness.mjs
git commit -m "feat(saas): add tenant order postgres api"
```

---

### Task 4: Constrained PostgreSQL order repository

**Files:**
- Create: `packages/saas-data/src/orders/types.ts`
- Create: `packages/saas-data/src/orders/errors.ts`
- Create: `packages/saas-data/src/orders/validation.ts`
- Create: `packages/saas-data/src/orders/canonical.ts`
- Create: `packages/saas-data/src/orders/cursor.ts`
- Create: `packages/saas-data/src/orders/repository.ts`
- Create: `packages/saas-data/src/orders/repository.test.ts`
- Create: `packages/saas-data/src/orders/index.ts`
- Modify: `packages/saas-data/src/index.ts:1-80`

**Interfaces:**

```ts
export interface OrderRepository {
  getDashboardSummary(input: OrderAuthorityInput): Promise<OrderDashboardSummary>;
  listOrders(input: ListOrdersInput): Promise<Readonly<{ items: readonly OrderListItem[]; nextCursor?: string }>>;
  getOrder(input: GetOrderInput): Promise<OrderDetail>;
  transitionStatus(input: TransitionOrderStatusInput): Promise<OrderMutationResult>;
  transitionPayment(input: TransitionOrderPaymentInput): Promise<OrderMutationResult>;
  updateShipping(input: UpdateOrderShippingInput): Promise<OrderMutationResult>;
  addNote(input: AddOrderNoteInput): Promise<OrderMutationResult>;
  archiveNote(input: ArchiveOrderNoteInput): Promise<OrderMutationResult>;
}
```

- [ ] **Step 1: Write 18 failing repository tests**

Cover exact SQL/signature values, TenantContext validation, action/feature propagation, list cursor encoding, strict result parsing, read-only success, mutation fingerprint stability, replay, mismatch, not-found, version conflict, role denial, invalid input before pool use, pool/statement/lock classification, unknown commit audit + recovery once, corrupt payload, frozen outputs, and no private input in error text.

Run: `node --experimental-transform-types --test packages/saas-data/src/orders/repository.test.ts`

Expected: FAIL because `orders/index.ts` is missing.

- [ ] **Step 2: Implement types, validators, errors, cursor and canonical fingerprints**

Use the catalog repository conventions with order-specific safe codes:

```ts
export const ORDER_ERROR_CODES = Object.freeze([
  "invalid_input", "unauthenticated", "membership_denied", "store_inactive",
  "feature_not_enabled", "order_not_found", "note_not_found", "invalid_transition",
  "version_conflict", "operation_replayed", "operation_mismatch",
  "durable_authority_invalid", "unavailable",
] as const);
```

Canonical mutation fingerprints include the operation kind and every normalized immutable input; they never include `TenantContext` secrets because it contains no credential material.

- [ ] **Step 3: Implement `PostgresOrderRepository`**

Use `celebix_saas_app`, catalog-style transaction timeout setup, parameterized function calls only, strict rowCount/outcome/payload parsing, client destroy on unknown COMMIT, exactly one read-only operation recovery, and stable local transaction-state errors. Generate no entity IDs except note IDs where required by the interface.

- [ ] **Step 4: Run GREEN repository tests**

Run:

```bash
node --experimental-transform-types --test packages/saas-data/src/orders/repository.test.ts
npm test --workspace @celebix/saas-data
npm run typecheck --workspace @celebix/saas-data
```

Expected: focused **18/18 PASS**; workspace and typecheck PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/saas-data
git commit -m "feat(saas): add postgres order repository"
```

---

### Task 5: Authenticated same-origin order HTTP API

**Files:**
- Create: `apps/customer-panel/lib/server-orders/runtime.ts`
- Create: `apps/customer-panel/lib/server-orders/runtime.test.ts`
- Create: `apps/customer-panel/lib/order-http/request-authority.ts`
- Create: `apps/customer-panel/lib/order-http/request-input.ts`
- Create: `apps/customer-panel/lib/order-http/handler.ts`
- Create: `apps/customer-panel/lib/order-http/handler.test.ts`
- Create: `apps/customer-panel/lib/order-http/default.ts`
- Create: `apps/customer-panel/app/api/orders/summary/route.ts`
- Create: `apps/customer-panel/app/api/orders/route.ts`
- Create: `apps/customer-panel/app/api/orders/[orderId]/route.ts`
- Create: `apps/customer-panel/app/api/orders/[orderId]/status/route.ts`
- Create: `apps/customer-panel/app/api/orders/[orderId]/payment/route.ts`
- Create: `apps/customer-panel/app/api/orders/[orderId]/shipping/route.ts`
- Create: `apps/customer-panel/app/api/orders/[orderId]/notes/route.ts`
- Create: `apps/customer-panel/app/api/orders/[orderId]/notes/[noteId]/archive/route.ts`
- Modify: `apps/customer-panel/lib/server-panel-access/postgres-runtime.ts:1-170`
- Modify: `apps/customer-panel/lib/routes.test.ts`

**Interfaces:**
- Browser-visible endpoints expose only the safe Task 1 contract.
- Runtime is registered only beside the already-approved access runtime after database preflight proves migrations/functions 022-023.

- [ ] **Step 1: Write 24 failing HTTP/runtime tests**

Test disabled runtime, authenticated happy paths, exact methods/paths, query allowlist, page size/cursor/status/search, wrong Origin, near paths, query on mutations, fragment, private authority headers, missing/malformed cookie, access denial, body media type/size/unknown keys, invalid UUID/version/operation ID, repository error mapping, no internal error leak, one repository call, server TenantContext forwarding, immutable runtime facade, and production-default disabled behavior.

Run:

```bash
node --experimental-transform-types --test apps/customer-panel/lib/server-orders/runtime.test.ts apps/customer-panel/lib/order-http/handler.test.ts
```

Expected: FAIL because server-orders/order-http files do not exist.

- [ ] **Step 2: Implement runtime registration and preflight extension**

Mirror the frozen catalog repository facade, but expose only `OrderRepository`. Extend preflight with exact 022 tables and 023 function signatures. Construct `PostgresOrderRepository` from the existing pool/timeouts/role and register it against the same approved access object. Any missing object keeps the entire live runtime unavailable.

- [ ] **Step 3: Implement request authority and strict input readers**

GET list permits only `pageSize`, `cursor`, `status`, and `search`; all other queries fail. Mutations require exact panel Origin, `application/json`, bounded content length, no transfer encoding, exact keys, and a UUID operation ID. Reject Authorization, X-Celebix, tenant/store/principal/membership/database headers.

- [ ] **Step 4: Implement handlers and thin App Router exports**

Map stable repository codes to 400/401/403/404/409/503, set `cache-control: no-store` and `nosniff`, and return no SQL/driver/error message. Route modules only delegate to default handlers.

- [ ] **Step 5: Run GREEN HTTP/runtime tests**

Run:

```bash
node --experimental-transform-types --test apps/customer-panel/lib/server-orders/runtime.test.ts apps/customer-panel/lib/order-http/handler.test.ts
npm test --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/customer-panel
```

Expected: focused **24/24 PASS**; customer-panel baseline rises from 127 with no regression; typecheck PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/customer-panel/lib/server-orders apps/customer-panel/lib/order-http apps/customer-panel/app/api/orders apps/customer-panel/lib/server-panel-access/postgres-runtime.ts apps/customer-panel/lib/routes.test.ts
git commit -m "feat(customer-panel): add authenticated order api"
```

---

### Task 6: Pinned-donor order list/detail presentation and navigation

**Files:**
- Create: `apps/customer-panel/lib/order-ui/client.ts`
- Create: `apps/customer-panel/lib/order-console.test.ts`
- Create: `apps/customer-panel/components/orders/OrderListConsole.tsx`
- Create: `apps/customer-panel/components/orders/OrderDetailConsole.tsx`
- Create: `apps/customer-panel/components/orders/order-console.module.css`
- Create: `apps/customer-panel/app/orders/page.tsx`
- Create: `apps/customer-panel/app/orders/[orderId]/page.tsx`
- Modify: `apps/customer-panel/lib/panel-ui/navigation.ts:1-90`
- Modify: `apps/customer-panel/components/panel/PanelNavigation.tsx:1-90`
- Modify: `apps/customer-panel/lib/panel-ui/dashboard-model.ts`
- Modify: `apps/customer-panel/components/dashboard/PanelDashboardHomeView.tsx`
- Modify: `apps/customer-panel/lib/panel-shell.test.ts`

**Interfaces:**
- Produces same-origin `orderApi`, order list/detail screens, exact navigation activation and real order dashboard summary.
- `Quick Order` and `Abandoned Carts` labels/hrefs remain absent in A1.

- [ ] **Step 1: Reverify and record exact donor sources**

```bash
git show -s --format=%H fc6c5318b47f045a7cefcedc7612d5b10563ba32
git show fc6c5318b47f045a7cefcedc7612d5b10563ba32:apps/admin/app/admin/siparisler/page.tsx > /tmp/hemenaku-orders-page.tsx
git show fc6c5318b47f045a7cefcedc7612d5b10563ba32:apps/admin/app/admin/siparisler/[id]/OrderDetailClient.tsx > /tmp/hemenaku-order-detail.tsx
```

Expected donor SHA exact; temporary files remain untracked and are deleted after implementation.

- [ ] **Step 2: Write 16 failing UI/navigation tests**

Cover same-origin client calls, no private authority, list loaded/empty/loading/error, search/status/sort/pagination, detail item/event/note rendering, status/payment/shipping/note mutations, optimistic conflict reload, exact `/orders` activation, `/orders-evil` and encoded/query/fragment denial, role-based control hiding, 48px targets, mobile cards, and dashboard exact durable order summary.

Run:

```bash
node --experimental-transform-types --test apps/customer-panel/lib/order-console.test.ts apps/customer-panel/lib/panel-shell.test.ts
```

Expected: FAIL because order UI/client/navigation is absent.

- [ ] **Step 3: Implement safe same-origin client**

Every request uses relative `/api/orders` URLs, JSON, `credentials: "same-origin"`, safe DTO parsers, and stable `OrderApiError`. No browser storage, cookie access, tenant/store IDs or donor endpoints.

- [ ] **Step 4: Transplant list/detail presentation**

Adapt pinned donor `AdminPageShell`, topbar bridge, dense desktop table, mobile cards, filters, status chips, list/detail panels, order timeline, shipping/payment controls and internal notes. Replace donor runtime/auth/data calls with `orderApi`. Render controlled states from real requests only. Never import donor code.

- [ ] **Step 5: Activate only the genuine navigation**

Add an `orders` group with one child `Tüm Siparişler -> /orders`, a ShoppingBag icon, exact active-path checks, route title mappings for list/detail, and no quick/abandoned child. Dashboard fetches `/api/orders/summary`; it replaces only the `orders` unsupported slice and leaves customers/analytics/carts unsupported.

- [ ] **Step 6: Run GREEN presentation tests**

Run:

```bash
node --experimental-transform-types --test apps/customer-panel/lib/order-console.test.ts apps/customer-panel/lib/panel-shell.test.ts
npm test --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/customer-panel
npm run build --workspace @celebix/customer-panel
```

Expected: focused **16 new order behaviors PASS**, all pre-existing 127 behaviors remain green, typecheck/build PASS.

- [ ] **Step 7: Remove temporary donor files and commit**

```bash
rm -f /tmp/hemenaku-orders-page.tsx /tmp/hemenaku-order-detail.tsx
git add apps/customer-panel
git commit -m "feat(customer-panel): add hemenaku order console"
```

---

### Task 7: Whole-slice security, PostgreSQL and regression gate

**Files:**
- Create: `tests/saas-phase3/order-management/in-process.test.mjs`
- Create: `tests/saas-phase3/order-management/static-security.test.mjs`
- Modify only when an assertion is genuinely stale: `tests/saas-phase3/hemenaku-merchant-shell/static-security.test.mjs`
- Modify only when an assertion is genuinely stale: `tests/saas-phase3/hemenaku-admin-presentation/static-security.test.mjs`

- [ ] **Step 1: Write RED final-gate tests**

Static tests prove exact donor SHA, no implementation-start diff under `apps/admin`, no Supabase/admin API/browser authority, only authorized new routes, no private IDs in client DTO/DOM sources, no fake quick/abandoned menu, SQL manifest hashes, no app DML and no secrets. In-process tests exercise authenticated list/detail/mutations and cross-store/session/role/error negatives through real handlers.

- [ ] **Step 2: Run RED and repair only genuine gaps**

Run:

```bash
node --experimental-transform-types --test tests/saas-phase3/order-management/in-process.test.mjs tests/saas-phase3/order-management/static-security.test.mjs
```

Expected before repair: at least one assertion fails for a genuine missing proof; repair production code only through a new focused RED/GREEN cycle.

- [ ] **Step 3: Run complete PostgreSQL and application matrix**

```bash
node tests/saas-phase3/order-management/postgres-harness.mjs
node --experimental-transform-types --test tests/saas-phase3/order-management/*.test.mjs
npm test --workspace @celebix/saas-contracts
npm test --workspace @celebix/saas-data
npm test --workspace @celebix/customer-panel
node --experimental-transform-types --test tests/saas-phase3/hemenaku-merchant-shell/*.test.mjs
node --experimental-transform-types --test tests/saas-phase3/hemenaku-admin-presentation/*.test.mjs tests/saas-phase3/shared-merchant-catalog-dashboard/*.test.mjs tests/saas-phase3/product-catalog/*.test.mjs tests/saas-phase3/product-catalog-api/*.test.mjs tests/saas-phase3/product-media/*.test.mjs
npm run typecheck --workspace @celebix/saas-contracts
npm run typecheck --workspace @celebix/saas-data
npm run typecheck --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/owner
npm run build --workspace @celebix/customer-panel
npm run build --workspace @celebix/owner
git diff --check
```

Expected: order PostgreSQL **40/40 PASS**; all focused/workspace/regression/typecheck/build commands PASS except only an already documented unchanged Owner baseline failure may be reported with exact evidence.

- [ ] **Step 4: Run scope and secret proofs**

```bash
git diff --name-only 86b3a4ad...HEAD -- apps/admin deploy infra infrastructure
git diff --name-only 86b3a4ad...HEAD -- apps/admin | wc -l
git diff 86b3a4ad...HEAD | rg -n 'BEGIN (RSA|EC|OPENSSH) PRIVATE KEY|postgres(ql)?://[^[:space:]]+:[^[:space:]@]+@|__Host-celebix_panel=' || true
git status --short
```

Expected: protected/deploy/infra changes 0; `apps/admin` diff count 0; secret scan 0; only intended tracked files plus pre-existing untracked screenshot artifacts.

- [ ] **Step 5: Independent review and repair loop**

Generate a review package from `86b3a4ad...HEAD`. Require both spec compliance and code quality approval. Repair every Critical/Important finding with focused tests and re-review before completion.

- [ ] **Step 6: Commit final proof**

```bash
git add tests/saas-phase3/order-management tests/saas-phase3/hemenaku-merchant-shell/static-security.test.mjs tests/saas-phase3/hemenaku-admin-presentation/static-security.test.mjs
git commit -m "test(saas): verify tenant order console"
```

## Commit Map

1. `feat(saas): define tenant order contracts`
2. `feat(saas): add tenant order schema`
3. `feat(saas): add tenant order postgres api`
4. `feat(saas): add postgres order repository`
5. `feat(customer-panel): add authenticated order api`
6. `feat(customer-panel): add hemenaku order console`
7. `test(saas): verify tenant order console`

## A1 Completion Definition

- `/orders` and `/orders/[orderId]` are genuine guarded routes backed by tenant-filtered PostgreSQL 16 authority.
- Order list/detail, filters, summary, status/payment/shipping/note operations, controlled conflicts and role denials work.
- `Siparişler -> Tüm Siparişler` appears and activates only on exact paths; quick-order and abandoned-cart menu entries remain absent.
- Dashboard order facts are real; customers/analytics/carts remain truthful unsupported states.
- No donor runtime/auth/data code, private browser authority, fake KPI, secret, production/deploy mutation or `apps/admin` change exists.
- A2 quick-order links and A3 abandoned carts start only after A1 review is clean; execution continues without a human continuation prompt.
