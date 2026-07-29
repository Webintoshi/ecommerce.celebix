# Hemenaku Abandoned Cart Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the tenant-safe shared contract, role policy, PostgreSQL 16 persistence/API, and repository authority required by the real Hemenaku `Terkedilen Sepetler` workflow while keeping its navigation hidden until storefront capture, merchant HTTP, and UI are complete.

**Architecture:** Add immutable abandoned-cart DTOs in `@celebix/saas-contracts`, store-scoped tables and SECURITY DEFINER functions in migrations 030–031, and a constrained `PostgresAbandonedCartRepository` in `@celebix/saas-data`. Reuse the proven `saas.merchant_action_authority_error` boundary with the existing `orders` entitlement and new `carts.read`/`carts.manage` actions. Direct table DML remains denied to `celebix_saas_app`; every mutation is versioned, idempotent, and recoverable after unknown commit.

**Tech Stack:** TypeScript, Node test runner, PostgreSQL 16, `pg`, existing TenantContext and SaaS repository transaction patterns.

## Global Constraints

- Design authority: `docs/superpowers/specs/2026-07-21-hemenaku-full-merchant-admin-parity-design.md`, Slice A3.
- Donor authority: `apps/admin` at `fc6c5318b47f045a7cefcedc7612d5b10563ba32`; donor stays byte-for-byte unchanged.
- Target browser app remains `apps/customer-panel`; no navigation activation in this foundation plan.
- No Supabase, legacy donor API, `/api/admin/**`, browser tenant/store IDs, fake carts, direct app-role table DML, production deploy, production credential mutation, or merge.
- `store_id` participates in every tenant-owned relationship.
- Money is integer minor units plus exact three-letter currency.
- Missing or unavailable data is never converted to zero success data.
- Preserve untracked `.codex-artifacts/` and never stage it.

---

### Task 1: Add frozen abandoned-cart contracts and role actions

**Files:**
- Create: `packages/saas-contracts/src/abandoned-carts/types.ts`
- Create: `packages/saas-contracts/src/abandoned-carts/validation.ts`
- Create: `packages/saas-contracts/src/abandoned-carts/index.ts`
- Create: `packages/saas-contracts/src/abandoned-carts/abandoned-carts.test.ts`
- Modify: `packages/saas-contracts/src/authorization/actions.ts`
- Modify: `packages/saas-contracts/src/index.ts`

**Interfaces:**
- Produces: `ABANDONED_CART_STATUSES`, `ABANDONED_CART_SORTS`.
- Produces: `AbandonedCartListItem`, `AbandonedCartDetail`, `AbandonedCartItem`, `AbandonedCartSummary`, `AbandonedCartMutationResult`.
- Produces: strict frozen parsers for each DTO.
- Extends: `MerchantAction` with `carts.read` and `carts.manage`.

- [ ] **Step 1: Write failing contract tests**

```ts
test("parses and deeply freezes a safe abandoned-cart detail", () => {
  const parsed = parseAbandonedCartDetail({
    id: CART_ID,
    status: "abandoned",
    customerName: "Ada Lovelace",
    customerEmail: "ada@example.com",
    currency: "TRY",
    subtotalCents: 12500,
    discountCents: 500,
    totalCents: 12000,
    itemCount: 2,
    lastActivityAt: NOW,
    abandonedAt: NOW,
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    items: [{
      id: ITEM_ID, position: 0, productName: "Keten Gömlek", variantName: "M",
      unitPriceCents: 6000, quantity: 2, discountCents: 0, lineTotalCents: 12000,
    }],
  });
  assert.equal(Object.isFrozen(parsed), true);
  assert.equal(Object.isFrozen(parsed.items), true);
  assert.equal(Object.isFrozen(parsed.items[0]), true);
});

test("denies hostile totals timestamps fields and private authority", () => {
  for (const patch of [
    { storeId: STORE_ID }, { totalCents: 1 }, { currency: "try" },
    { customerEmail: " ada@example.com" }, { updatedAt: "not-a-time" },
  ]) assert.throws(() => parseAbandonedCartListItem({ ...LIST_ITEM, ...patch }), /abandoned_cart_contract_invalid/);
});

test("role policy keeps read broad and manage bounded", () => {
  for (const role of ["store_owner", "admin", "editor", "analyst"] as const) {
    assert.equal(isMerchantActionAllowed(role, "carts.read"), true);
  }
  assert.equal(isMerchantActionAllowed("store_owner", "carts.manage"), true);
  assert.equal(isMerchantActionAllowed("admin", "carts.manage"), true);
  assert.equal(isMerchantActionAllowed("editor", "carts.manage"), false);
  assert.equal(isMerchantActionAllowed("analyst", "carts.manage"), false);
});
```

- [ ] **Step 2: Run RED**

```bash
node --experimental-transform-types --test packages/saas-contracts/src/abandoned-carts/abandoned-carts.test.ts
```

Expected: FAIL because the module and actions do not exist.

- [ ] **Step 3: Implement exact immutable types and parsers**

```ts
export const ABANDONED_CART_STATUSES = Object.freeze(["active", "abandoned", "recovered", "archived"] as const);
export const ABANDONED_CART_SORTS = Object.freeze(["newest", "oldest", "highest", "lowest"] as const);
export type AbandonedCartStatus = (typeof ABANDONED_CART_STATUSES)[number];
export type AbandonedCartSort = (typeof ABANDONED_CART_SORTS)[number];

export interface AbandonedCartListItem {
  readonly id: string;
  readonly status: AbandonedCartStatus;
  readonly customerName?: string;
  readonly customerEmail?: string;
  readonly customerPhone?: string;
  readonly currency: string;
  readonly subtotalCents: number;
  readonly discountCents: number;
  readonly totalCents: number;
  readonly itemCount: number;
  readonly checkoutStartedAt?: string;
  readonly lastActivityAt: string;
  readonly abandonedAt?: string;
  readonly recoveredAt?: string;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AbandonedCartItem {
  readonly id: string;
  readonly position: number;
  readonly productName: string;
  readonly variantName?: string;
  readonly sku?: string;
  readonly imageUrl?: string;
  readonly unitPriceCents: number;
  readonly quantity: number;
  readonly discountCents: number;
  readonly lineTotalCents: number;
}

export interface AbandonedCartDetail extends AbandonedCartListItem {
  readonly items: readonly AbandonedCartItem[];
}

export interface AbandonedCartSummary {
  readonly abandoned: number;
  readonly recovered: number;
  readonly lostValueCents: number;
  readonly recoveredValueCents: number;
  readonly currency: string;
  readonly asOf: string;
}

export interface AbandonedCartMutationResult {
  readonly id: string;
  readonly status: AbandonedCartStatus;
  readonly version: number;
  readonly updatedAt: string;
  readonly replayed: boolean;
}
```

Parsers must accept exact own-key plain objects only; canonical UUID, millisecond-or-microsecond UTC timestamps, trimmed bounded text, optional canonical HTTPS `imageUrl`, exact money arithmetic, `itemCount === items.length`, ordered positions, monotonic timestamps, and deep freeze. Add `carts.read` to all four roles and `carts.manage` only to owner/admin.

- [ ] **Step 4: Run GREEN**

Run Step 2 and `npm test --workspace @celebix/saas-contracts`.

Expected: new contract tests and the complete contract workspace PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/saas-contracts/src/abandoned-carts packages/saas-contracts/src/authorization/actions.ts packages/saas-contracts/src/index.ts
git commit -m "feat(saas): add abandoned cart contracts"
```

### Task 2: Add store-scoped abandoned-cart persistence

**Files:**
- Create: `apps/owner/scripts/sql/saas/202607220030_abandoned_carts.up.sql`
- Create: `apps/owner/scripts/sql/saas/202607220030_abandoned_carts.down.sql`
- Create: `apps/owner/scripts/sql/saas/202607220030_abandoned_carts_assertions.sql`
- Create: `apps/owner/scripts/sql/saas/phase3b3-abandoned-cart-manifest.json`
- Create: `tests/saas-phase3/abandoned-cart-foundation/postgres-harness.mjs`

**Interfaces:**
- Produces tables: `saas.abandoned_carts`, `saas.abandoned_cart_items`, `saas.abandoned_cart_operations`.
- Preserves: `saas.orders` and migrations 001–029 byte-for-byte.
- Grants: no table privilege to `celebix_saas_app`, `celebix_saas_workflow`, or `celebix_saas_host_resolver`.

- [ ] **Step 1: Write the failing PostgreSQL harness catalog scenarios**

Harness migrations include 001–029 then 030. Assert PostgreSQL 16, table ownership by `celebix_saas_owner`, FORCE RLS, no PUBLIC/app/workflow/host-resolver table privileges, exact store-composite foreign keys, immutable operation trigger, constrained status/currency/money/timestamps, and cross-store FK denial.

```js
await scenario("030 owns forced-RLS store-scoped cart tables", () => {
  assert.equal(psql(backend, `SELECT relname||':'||relforcerowsecurity FROM pg_class WHERE relname IN ('abandoned_carts','abandoned_cart_items','abandoned_cart_operations') ORDER BY relname;`), [
    "abandoned_cart_items:true", "abandoned_cart_operations:true", "abandoned_carts:true",
  ].join("\n"));
});
```

- [ ] **Step 2: Run RED**

```bash
node --experimental-transform-types tests/saas-phase3/abandoned-cart-foundation/postgres-harness.mjs
```

Expected: FAIL because migration 030 is missing.

- [ ] **Step 3: Implement migration 030**

Core table contract:

```sql
CREATE TABLE saas.abandoned_carts (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  public_cart_digest char(64) NOT NULL,
  status text NOT NULL CHECK (status IN ('active','abandoned','recovered','archived')),
  customer_name text,
  customer_email text,
  customer_phone text,
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  subtotal_cents bigint NOT NULL CHECK (subtotal_cents >= 0),
  discount_cents bigint NOT NULL CHECK (discount_cents >= 0),
  total_cents bigint NOT NULL CHECK (total_cents = subtotal_cents - discount_cents AND total_cents >= 0),
  checkout_started_at timestamptz,
  last_activity_at timestamptz NOT NULL,
  abandoned_at timestamptz,
  recovered_at timestamptz,
  archived_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (store_id,id),
  UNIQUE (store_id,public_cart_digest),
  FOREIGN KEY (store_id,currency) REFERENCES saas.stores(id,currency),
  CHECK (public_cart_digest ~ '^[a-f0-9]{64}$'),
  CHECK (updated_at >= created_at AND last_activity_at >= created_at),
  CHECK ((status='abandoned')=(abandoned_at IS NOT NULL)),
  CHECK ((status='recovered')=(recovered_at IS NOT NULL)),
  CHECK ((status='archived')=(archived_at IS NOT NULL))
);
```

Items use store/cart composite FK, positions 0–99, snapshot text, optional product/variant store-composite FKs, exact line arithmetic, and HTTPS-only image URL. Operations contain operation UUID, store/cart IDs, kind `mark_recovered|archive`, SHA-256 fingerprint, immutable bounded result JSON, and committed timestamp. Enable and FORCE RLS; create no permissive policy; revoke all table/sequence privileges from PUBLIC and runtime roles.

- [ ] **Step 4: Add assertions, manifest checksums, rollback, and run GREEN**

Down migration must fail closed with `ABANDONED_CART_DOWN_HISTORY_CONFLICT` when rows exist, then remove only migration-030 objects. Assertions check tables, columns, constraints, triggers, indexes, ACL, RLS, owner, and no legacy `public` schema reference. Run the harness through apply, backup/restore, rollback/reapply, and cleanup.

- [ ] **Step 5: Commit**

```bash
git add apps/owner/scripts/sql/saas/202607220030_abandoned_carts.*.sql apps/owner/scripts/sql/saas/phase3b3-abandoned-cart-manifest.json tests/saas-phase3/abandoned-cart-foundation/postgres-harness.mjs
git commit -m "feat(saas): add abandoned cart persistence"
```

### Task 3: Add least-privilege merchant functions and repository

**Files:**
- Create: `apps/owner/scripts/sql/saas/202607220031_abandoned_cart_api.up.sql`
- Create: `apps/owner/scripts/sql/saas/202607220031_abandoned_cart_api.down.sql`
- Create: `apps/owner/scripts/sql/saas/202607220031_abandoned_cart_api_assertions.sql`
- Modify: `apps/owner/scripts/sql/saas/phase3b3-abandoned-cart-manifest.json`
- Create: `packages/saas-data/src/abandoned-carts/{canonical,cursor,errors,types,validation,repository,index}.ts`
- Create: `packages/saas-data/src/abandoned-carts/abandoned-carts.test.ts`
- Modify: `packages/saas-data/src/index.ts`
- Extend: `tests/saas-phase3/abandoned-cart-foundation/postgres-harness.mjs`

**Interfaces:**
- Produces SQL functions: `abandoned_carts_summary`, `abandoned_carts_list`, `abandoned_carts_get`, `abandoned_carts_mark_recovered`, `abandoned_carts_archive`, `abandoned_carts_recover_operation`.
- Produces: `AbandonedCartRepository` and `PostgresAbandonedCartRepository`.

- [ ] **Step 1: Write failing repository and SQL API tests**

```ts
export interface AbandonedCartRepository {
  getSummary(input: AbandonedCartAuthorityInput): Promise<AbandonedCartSummary>;
  list(input: ListAbandonedCartsInput): Promise<ListAbandonedCartsResult>;
  get(input: GetAbandonedCartInput): Promise<AbandonedCartDetail>;
  markRecovered(input: MutateAbandonedCartInput): Promise<AbandonedCartMutationResult>;
  archive(input: MutateAbandonedCartInput): Promise<AbandonedCartMutationResult>;
}
```

Tests require exact query text, seven TenantContext authority arguments, bounded page size/search/cursor, role action separation, cross-store/not-found denial, idempotent replay, mismatch conflict, one read-only recovery after `commit_unknown`, client eviction after unknown COMMIT, stable errors, and no second write.

- [ ] **Step 2: Run RED**

```bash
node --experimental-transform-types --test packages/saas-data/src/abandoned-carts/abandoned-carts.test.ts
node --experimental-transform-types tests/saas-phase3/abandoned-cart-foundation/postgres-harness.mjs
```

Expected: FAIL because migration 031 and repository modules do not exist.

- [ ] **Step 3: Implement migration 031 and repository**

All read functions call:

```sql
authority_error := saas.merchant_action_authority_error(
  p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,
  'orders','carts.read'
);
```

Mutations use `carts.manage`, row lock by `(store_id,id)`, expected version, operation fingerprint, immutable stored projection, exact replay/mismatch outcomes, and status transitions `abandoned -> recovered` or `active|abandoned|recovered -> archived`. List projection is cursor-based, capped at 100, deterministically ordered by requested sort then timestamp/id; archived rows are excluded unless exact archived filter is requested. Grant EXECUTE only to `celebix_saas_app`; helpers remain owner-only.

Repository follows the existing order repository transaction state machine: `BEGIN READ ONLY` for reads, `BEGIN` for mutations, `SET LOCAL ROLE celebix_saas_app`, bounded timeouts, safe projection parsing, rollback/release, destroy on unknown COMMIT, audit event `abandoned_cart_commit_unknown`, and one `abandoned_carts_recover_operation` read on ambiguous mutation.

- [ ] **Step 4: Run GREEN and full foundation rehearsal**

```bash
npm test --workspace @celebix/saas-contracts
npm test --workspace @celebix/saas-data
node --experimental-transform-types tests/saas-phase3/abandoned-cart-foundation/postgres-harness.mjs
git diff --check
```

Expected: contracts/data PASS and PostgreSQL harness passes every catalog, RLS, cross-store, role, cursor, transition, replay, concurrency, backup/restore, rollback/reapply, and cleanup scenario.

- [ ] **Step 5: Commit and push foundation**

```bash
git add apps/owner/scripts/sql/saas/202607220031_abandoned_cart_api.*.sql apps/owner/scripts/sql/saas/phase3b3-abandoned-cart-manifest.json packages/saas-data/src/abandoned-carts packages/saas-data/src/index.ts tests/saas-phase3/abandoned-cart-foundation/postgres-harness.mjs
git commit -m "feat(saas): add abandoned cart repository authority"
git push origin codex/hemenaku-admin-presentation-transplant-implementation
```

## Next Required Plan

After this foundation passes, write and execute `abandoned-cart-runtime-console`: exact storefront capture credential/cookie and host authority, capture/update/checkout-conversion APIs, scheduled abandonment lifecycle, customer-panel HTTP/runtime, donor-adapted loaded/empty/error/detail UI, exact navigation activation, dashboard summary replacement, browser/security tests, and local screenshots. The destination remains hidden until that plan is completely green.
