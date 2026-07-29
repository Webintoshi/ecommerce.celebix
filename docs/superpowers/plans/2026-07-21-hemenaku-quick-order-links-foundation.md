# Hemenaku Quick-Order Links Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the hidden, tenant-safe contracts, PostgreSQL authority, and repository foundation for Hemenaku-compatible quick-order payment links without exposing a menu item or unusable public link.

**Architecture:** Add immutable quick-link quote contracts, store-composite PostgreSQL tables, least-privilege merchant functions, and a constrained `@celebix/saas-data` repository. Creation snapshots canonical active catalog variants and canonical prices in PostgreSQL, stores only a SHA-256 token digest plus an application-sealed envelope, requires a persisted active checkout-provider configuration, and remains unreachable from HTTP/navigation until the separately planned provider settlement and exact-host redemption slices are complete.

**Tech Stack:** TypeScript, Node.js test runner, PostgreSQL 16, PL/pgSQL `SECURITY DEFINER`, `pg`, existing SaaS contracts/data transaction patterns.

## Global Constraints

- Implementation base is exact commit `301637111de040fc3bbf3cfed718a2d772e42130`.
- Donor presentation/behavior authority is only `apps/admin` at `fc6c5318b47f045a7cefcedc7612d5b10563ba32`, read only through `git show`.
- `apps/admin/**`, current customer-panel routes/navigation, storefront routes, deploy, infrastructure, dependencies, lockfiles, credentials, and production stay unchanged in this foundation.
- No HTTP route, merchant page, navigation destination, public redemption route, payment redirect, webhook, or fake provider success is introduced by this plan.
- Browser input is never authority for store, tenant, principal, membership, hostname, product snapshot, variant snapshot, price, totals, status, or provider configuration.
- Canonical catalog price is the only quote price in this foundation; merchant price override is not supported.
- Raw public tokens are never persisted, logged, placed in an operation result, or returned by the repository. SQL receives only a 64-character lowercase SHA-256 digest and an opaque bounded sealed envelope. Random link IDs/token material are deliberately excluded from the idempotency fingerprint: replay is bound only to stable merchant intent and returns the originally persisted safe result.
- Every tenant relationship uses `store_id`; direct table DML remains denied to `celebix_saas_app`; app access is through exact functions only.
- `orders` and `checkout` plan features plus persisted role/action authority are both revalidated for every operation. SQL maps `quick_links.read` to the existing durable `orders.read` decision and `quick_links.manage` to `orders.manage`, then independently proves the persisted `checkout` entitlement.
- Creation, cancellation, and duplication use immutable operation UUID/fingerprint/result rows with replay and mismatch semantics.
- Effective expiry is computed from authoritative `p_now`; reads do not mutate `active` to `opened` or materialize expiry.
- Status vocabulary is exactly `active | opened | paid | cancelled | expired`; terminal `paid/cancelled/expired` states cannot return to an active state.
- Link items are bounded to 1–100 positions, quantities to 1–9,999, expiry to 4/12/24/48/72 hours, unit prices to `8_000_000_000` cents, shipping/discount components to `500_000_000_000_000` cents, and the final total to `8_500_000_000_000_000` cents. SQL calculates with `numeric`, checks those exact maxima, then converts to `bigint`; JavaScript projections remain safe integers.
- This foundation selects PayTR as the first adapter key because the pinned Turkish donor supports it through HTTPS form-token initiation without a new SDK dependency. The canonical provider origin is `https://www.paytr.com` and later initiation endpoint is `https://www.paytr.com/odeme/api/get-token`; credentials remain staging-environment-operator owned and are neither created nor consumed in this plan. The later provider plan must use isolated staging credentials with PayTR `test_mode=1`; live credentials and production mode remain forbidden.
- A clean independent spec review and quality review is required after every task; Critical/Important findings are repaired and re-reviewed before the next task.

---

## File Map

### New immutable contract surface

- `packages/saas-contracts/src/quick-orders/types.ts` — DTOs, status/expiry registries, create/list/detail/mutation contracts.
- `packages/saas-contracts/src/quick-orders/validation.ts` — exact-key parsing, bounds, arithmetic, canonical timestamps/e-mail/address/provider-key validation, deep freeze.
- `packages/saas-contracts/src/quick-orders/quick-orders.test.ts` — positive and hostile boundary tests.
- `packages/saas-contracts/src/quick-orders/index.ts` — public quick-order exports.

### New PostgreSQL authority

- `apps/owner/scripts/sql/saas/202607220024_quick_order_links.up.sql` — tables, constraints, indexes, immutability triggers and shared quick-link authority helper.
- `apps/owner/scripts/sql/saas/202607220024_quick_order_links.down.sql` — dependency-safe rollback of only migration 024 objects.
- `apps/owner/scripts/sql/saas/202607220024_quick_order_links_assertions.sql` — exact catalog/ACL/RLS/constraint/source assertions.
- `apps/owner/scripts/sql/saas/202607220025_quick_order_links_api.up.sql` — list/detail/create/cancel/duplicate/recover functions.
- `apps/owner/scripts/sql/saas/202607220025_quick_order_links_api.down.sql` — exact API rollback.
- `apps/owner/scripts/sql/saas/202607220025_quick_order_links_api_assertions.sql` — exact signature/body/grant assertions.
- `apps/owner/scripts/sql/saas/phase3b2-quick-order-links-manifest.json` — exact SHA-256 artifact binding.

### New constrained repository

- `packages/saas-data/src/quick-orders/types.ts` — repository ports/options/results.
- `packages/saas-data/src/quick-orders/validation.ts` — exact server input and authority validation.
- `packages/saas-data/src/quick-orders/canonical.ts` — domain-separated canonical fingerprints.
- `packages/saas-data/src/quick-orders/cursor.ts` — opaque store/filter/position-bound list cursor.
- `packages/saas-data/src/quick-orders/errors.ts` — stable safe error codes.
- `packages/saas-data/src/quick-orders/repository.ts` — transaction, role, commit-unknown recovery and strict projection.
- `packages/saas-data/src/quick-orders/repository.test.ts` — driver, projection, replay/recovery, disposal and hostile-input tests.
- `packages/saas-data/src/quick-orders/index.ts` — public exports.

### New final gates

- `tests/saas-phase3/quick-order-links/postgres-harness.mjs` — isolated native PostgreSQL 16 apply/assert/concurrency/isolation/backup/rollback/reapply/cleanup proof.
- `tests/saas-phase3/quick-order-links/in-process.test.mjs` — contract-to-repository behavior and no-HTTP/no-navigation proof.
- `tests/saas-phase3/quick-order-links/static-security.test.mjs` — donor SHA, manifest, protected paths, token/secret/private-ID and deferred-navigation scans.

### Existing export/authorization files

- `packages/saas-contracts/src/authorization/actions.ts:3-22`
- `packages/saas-contracts/src/authorization/actions.test.ts:1-end`
- `packages/saas-contracts/src/index.ts:1-end`
- `packages/saas-contracts/src/contracts.test.ts:1-end`
- `packages/saas-data/src/index.ts:1-end`

---

### Task 1: Immutable quick-link contracts and merchant actions

**Files:**
- Create: `packages/saas-contracts/src/quick-orders/types.ts`
- Create: `packages/saas-contracts/src/quick-orders/validation.ts`
- Create: `packages/saas-contracts/src/quick-orders/quick-orders.test.ts`
- Create: `packages/saas-contracts/src/quick-orders/index.ts`
- Modify: `packages/saas-contracts/src/authorization/actions.ts:3-22`
- Modify: `packages/saas-contracts/src/authorization/actions.test.ts:1-end`
- Modify: `packages/saas-contracts/src/index.ts:1-end`
- Modify: `packages/saas-contracts/src/contracts.test.ts:1-end`

**Interfaces:**
- Produces: `QUICK_ORDER_LINK_STATUSES`, `QUICK_ORDER_EXPIRY_HOURS`, `QUICK_ORDER_MAX_UNIT_PRICE_CENTS`, `QUICK_ORDER_MAX_COMPONENT_CENTS`, `QUICK_ORDER_MAX_TOTAL_CENTS`, `QuickOrderLinkStatus`, `QuickOrderAddress`, `QuickOrderLinkItem`, `QuickOrderLinkListItem`, `QuickOrderLinkDetail`, `QuickOrderLinkMutationResult`, `parseQuickOrderLinkListItem`, `parseQuickOrderLinkDetail`, `parseQuickOrderLinkMutationResult`.
- Extends: `MerchantAction` with exact `quick_links.read` and `quick_links.manage`.
- Role matrix: owner/admin read+manage; editor/analyst read only.

- [ ] **Step 1: Verify donor behavior without reading the working-tree donor**

Run:

```bash
test "$(git show -s --format=%H fc6c5318b47f045a7cefcedc7612d5b10563ba32)" = "fc6c5318b47f045a7cefcedc7612d5b10563ba32"
git show fc6c5318b47f045a7cefcedc7612d5b10563ba32:apps/admin/components/admin/QuickOrderLinksPanel.tsx | rg "Hızlı|Ödeme linki oluştur|Oluşturulan Linkler"
git diff --quiet 301637111de040fc3bbf3cfed718a2d772e42130 -- apps/admin
```

Expected: exact donor SHA succeeds, all three donor labels are present, and `apps/admin` diff exits 0.

- [ ] **Step 2: Write failing exact-contract tests**

Add tests that construct one valid deeply nested detail and assert:

```ts
assert.deepEqual(QUICK_ORDER_LINK_STATUSES, ["active", "opened", "paid", "cancelled", "expired"]);
assert.deepEqual(QUICK_ORDER_EXPIRY_HOURS, [4, 12, 24, 48, 72]);
const parsed = parseQuickOrderLinkDetail(validDetail);
assert.equal(Object.isFrozen(parsed), true);
assert.equal(Object.isFrozen(parsed.items), true);
assert.equal(Object.isFrozen(parsed.shippingAddress), true);
assert.equal(parsed.subtotalCents, parsed.items.reduce((sum, item) => sum + item.lineTotalCents, 0));
assert.equal(parsed.totalCents, parsed.subtotalCents + parsed.shippingCents - parsed.discountCents);
```

Use table-driven negatives for unknown/missing keys, inherited objects, arrays in place of objects, hostile getters/proxies, controls, whitespace-altered e-mail, invalid UUID/timestamp/currency/provider key, 0/101 items, quantity/money bounds, arithmetic mismatch, noncanonical URLs, lifecycle timestamp/status mismatches, any `token`, `tokenDigest`, `sealedToken`, `tokenKeyId`, `storeId`, `membershipId`, or `principalId` projection key. Assert inputs are not mutated.

Add action tests:

```ts
assert.equal(isMerchantActionAllowed("store_owner", "quick_links.manage"), true);
assert.equal(isMerchantActionAllowed("admin", "quick_links.manage"), true);
assert.equal(isMerchantActionAllowed("editor", "quick_links.manage"), false);
assert.equal(isMerchantActionAllowed("editor", "quick_links.read"), true);
assert.equal(isMerchantActionAllowed("analyst", "quick_links.read"), true);
```

- [ ] **Step 3: Run RED**

Run:

```bash
npm test --workspace @celebix/saas-contracts
```

Expected: FAIL because `quick-orders` exports and actions do not exist.

- [ ] **Step 4: Implement the minimal immutable contract**

Define the exact public shape:

```ts
export const QUICK_ORDER_LINK_STATUSES = Object.freeze(["active", "opened", "paid", "cancelled", "expired"] as const);
export const QUICK_ORDER_EXPIRY_HOURS = Object.freeze([4, 12, 24, 48, 72] as const);
export const QUICK_ORDER_MAX_UNIT_PRICE_CENTS = 8_000_000_000;
export const QUICK_ORDER_MAX_COMPONENT_CENTS = 500_000_000_000_000;
export const QUICK_ORDER_MAX_TOTAL_CENTS = 8_500_000_000_000_000;

export interface QuickOrderLinkItem {
  readonly id: string;
  readonly position: number;
  readonly productName: string;
  readonly variantName?: string;
  readonly sku?: string;
  readonly imageUrl?: string;
  readonly unitPriceCents: number;
  readonly quantity: number;
  readonly lineTotalCents: number;
}

export interface QuickOrderAddress {
  readonly recipientName: string;
  readonly phone: string;
  readonly line1: string;
  readonly line2?: string;
  readonly district?: string;
  readonly city: string;
  readonly postalCode?: string;
  readonly country: string;
}

export interface QuickOrderLinkListItem {
  readonly id: string;
  readonly customerName: string;
  readonly customerEmail: string;
  readonly firstProductName: string;
  readonly itemCount: number;
  readonly status: QuickOrderLinkStatus;
  readonly currency: string;
  readonly totalCents: number;
  readonly expiresAt: string;
  readonly createdAt: string;
  readonly version: number;
}

export interface QuickOrderLinkDetail extends QuickOrderLinkListItem {
  readonly customerPhone?: string;
  readonly shippingAddress: Readonly<QuickOrderAddress>;
  readonly billingAddress: Readonly<QuickOrderAddress>;
  readonly customerNote?: string;
  readonly internalLabel?: string;
  readonly providerKey: "paytr";
  readonly subtotalCents: number;
  readonly shippingCents: number;
  readonly discountCents: number;
  readonly items: readonly QuickOrderLinkItem[];
  readonly openedAt?: string;
  readonly paidAt?: string;
  readonly cancelledAt?: string;
  readonly orderId?: string;
  readonly updatedAt: string;
}

export interface QuickOrderLinkMutationResult {
  readonly id: string;
  readonly status: QuickOrderLinkStatus;
  readonly version: number;
  readonly expiresAt: string;
  readonly updatedAt: string;
  readonly replayed: boolean;
}
```

The detail deliberately excludes raw/digest/sealed token material and all private authority IDs. Validators must copy exact own data properties into new deeply frozen objects, accept only the exact provider key `paytr`, enforce the lifecycle matrix from Task 2, and use canonical UTC timestamps with exactly three or six fractional digits.

Extend `MERCHANT_ACTIONS` exactly:

```ts
"quick_links.read",
"quick_links.manage",
```

- [ ] **Step 5: Run GREEN and regression**

Run:

```bash
npm test --workspace @celebix/saas-contracts
npm run typecheck --workspace @celebix/saas-contracts
```

Expected: all contract tests pass and typecheck exits 0.

- [ ] **Step 6: Commit and review**

```bash
git add packages/saas-contracts
git commit -m "feat(saas): define quick order link contracts"
```

Review must prove no browser/private token authority appears in any DTO and role decisions exactly match the shared design.

---

### Task 2: Store-scoped quick-link schema

**Files:**
- Create: `apps/owner/scripts/sql/saas/202607220024_quick_order_links.up.sql`
- Create: `apps/owner/scripts/sql/saas/202607220024_quick_order_links.down.sql`
- Create: `apps/owner/scripts/sql/saas/202607220024_quick_order_links_assertions.sql`
- Create: `apps/owner/scripts/sql/saas/phase3b2-quick-order-links-manifest.json`
- Create: `tests/saas-phase3/quick-order-links/postgres-harness.mjs`

**Interfaces:**
- Produces: `saas.checkout_provider_configs`, `saas.quick_order_links`, `saas.quick_order_link_items`, `saas.quick_order_link_operations`, `saas.quick_link_merchant_authority_error(...)`.
- Consumes: current `stores`, `memberships`, `subscriptions`, `plans`, `plan_features`, `products`, `product_variants`, `product_media`, and `merchant_action_authority_error(...)`.

- [ ] **Step 1: Write PostgreSQL catalog/isolation RED scenarios 1–18**

The harness must start an isolated PostgreSQL 16 cluster/socket, apply migrations 001–024, and prove:

```text
1 apply + assertions
2 manifest exact bytes
3 owner + forced RLS on four tables
4 exact columns/checks/uniques
5 every child/composite store FK
6 PUBLIC ACL empty
7 app direct table DML denied
8 token digest unique and lowercase SHA-256 only
9 sealed envelope bounded JSON object and never projected
10 operation rows immutable
11 cross-store catalog reference rejected
12 store currency mismatch rejected
13 provider config must belong to same active store
14 invalid status/expiry/timestamps rejected
15 total arithmetic enforced
16 RLS store isolation
17 down removes only 024 objects; reapply restores them
18 cleanup removes disposable cluster/socket
```

Run:

```bash
node tests/saas-phase3/quick-order-links/postgres-harness.mjs
```

Expected: RED at scenario 1 because migration 024 is absent.

- [ ] **Step 2: Implement exact schema**

Create these key definitions; all text fields also receive trimmed/control/length checks:

```sql
CREATE TABLE saas.checkout_provider_configs (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  provider_key text NOT NULL CHECK (provider_key = 'paytr'),
  status text NOT NULL CHECK (status IN ('active','disabled','revoked')),
  public_origin text NOT NULL CHECK (public_origin = 'https://www.paytr.com'),
  configuration_key_id text NOT NULL,
  sealed_configuration jsonb NOT NULL,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CHECK (saas.quick_link_sealed_envelope_is_valid(sealed_configuration, configuration_key_id)),
  CHECK (updated_at >= created_at),
  UNIQUE (store_id, id),
  UNIQUE (store_id, provider_key),
  FOREIGN KEY (store_id) REFERENCES saas.stores(id)
);

CREATE TABLE saas.quick_order_links (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  creating_membership_id uuid NOT NULL,
  provider_config_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('active','opened','paid','cancelled','expired')),
  token_digest char(64) NOT NULL UNIQUE CHECK (token_digest ~ '^[a-f0-9]{64}$'),
  token_key_id text NOT NULL,
  sealed_token jsonb NOT NULL,
  customer_name text NOT NULL,
  customer_email text NOT NULL,
  customer_phone text,
  shipping_address jsonb NOT NULL,
  billing_address jsonb NOT NULL,
  customer_note text,
  internal_label text,
  currency text NOT NULL,
  subtotal_cents bigint NOT NULL CHECK (subtotal_cents >= 0),
  shipping_cents bigint NOT NULL CHECK (shipping_cents >= 0),
  discount_cents bigint NOT NULL CHECK (discount_cents >= 0),
  total_cents bigint NOT NULL CHECK (
    subtotal_cents BETWEEN 0 AND 7999200000000000
    AND shipping_cents BETWEEN 0 AND 500000000000000
    AND discount_cents BETWEEN 0 AND 500000000000000
    AND total_cents = subtotal_cents + shipping_cents - discount_cents
    AND total_cents BETWEEN 0 AND 8500000000000000
  ),
  expires_at timestamptz NOT NULL,
  opened_at timestamptz,
  paid_at timestamptz,
  cancelled_at timestamptz,
  order_id uuid,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (store_id, id),
  FOREIGN KEY (store_id, currency) REFERENCES saas.stores(id, currency),
  FOREIGN KEY (store_id, creating_membership_id) REFERENCES saas.memberships(store_id, id),
  FOREIGN KEY (store_id, provider_config_id) REFERENCES saas.checkout_provider_configs(store_id, id),
  FOREIGN KEY (store_id, order_id) REFERENCES saas.orders(store_id, id)
);
```

Add `saas.quick_link_address_is_valid(jsonb)` and `saas.quick_link_sealed_envelope_is_valid(jsonb,text)` helpers. Address JSON has exact required keys `recipientName,phone,line1,city,country`, exact optional keys `line2,district,postalCode`, only string values, trimmed/control-free bounded text, ISO two-letter uppercase country, and no unknown keys. The sealed-envelope helper requires exact keys `algorithm,ciphertext,iv,keyId,tag,version`, `algorithm='A256GCM'`, `version=1`, `keyId` equal to the separate key column, base64url `iv` length 16, tag length 22, ciphertext length 1–8192, and a total JSON size at most 12,288 bytes.

`quick_order_link_items` has exact columns `id,store_id,quick_order_link_id,product_id,variant_id,position,product_name,variant_name,sku,image_url,unit_price_cents,quantity,line_total_cents,created_at`, unique `(store_id,id)` and `(store_id,quick_order_link_id,position)`, position `0..99`, and a composite FK `(store_id,product_id,variant_id)` to a new 024 unique constraint on `product_variants(store_id,product_id,id)`. Because position is unique and bounded, at most 100 items can exist per link. Canonical image selection is deterministic: active `product_media` for the same product is eligible only when `media.variant_id = selected_variant.id OR media.variant_id IS NULL`; exact-variant media sorts first, then `sort_order ASC,id ASC`; absent eligible media yields no `imageUrl` snapshot. A sibling-variant media row is never eligible, even if its sort order is lower.

The link table adds exact checks:

```sql
CHECK (saas.quick_link_address_is_valid(shipping_address)),
CHECK (saas.quick_link_address_is_valid(billing_address)),
CHECK (saas.quick_link_sealed_envelope_is_valid(sealed_token, token_key_id)),
CHECK (expires_at-created_at IN (interval '4 hours',interval '12 hours',interval '24 hours',interval '48 hours',interval '72 hours')),
CHECK (updated_at >= created_at AND updated_at >= COALESCE(opened_at,created_at) AND updated_at >= COALESCE(paid_at,created_at) AND updated_at >= COALESCE(cancelled_at,created_at)),
CHECK (
  (status='active' AND opened_at IS NULL AND paid_at IS NULL AND cancelled_at IS NULL AND order_id IS NULL)
  OR (status='opened' AND opened_at IS NOT NULL AND opened_at>=created_at AND paid_at IS NULL AND cancelled_at IS NULL AND order_id IS NULL)
  OR (status='paid' AND opened_at IS NOT NULL AND paid_at IS NOT NULL AND paid_at>=opened_at AND cancelled_at IS NULL AND order_id IS NOT NULL)
  OR (status='cancelled' AND paid_at IS NULL AND cancelled_at IS NOT NULL AND cancelled_at>=created_at AND order_id IS NULL)
  OR (status='expired' AND paid_at IS NULL AND cancelled_at IS NULL AND order_id IS NULL)
)
```

Item constraints additionally require `unit_price_cents BETWEEN 0 AND 8000000000`, quantity `1..9999`, `line_total_cents = unit_price_cents*quantity`, and `line_total_cents BETWEEN 0 AND 79992000000000`; these bounds make the persisted bigint expression safe. Contract detail parsing separately proves `subtotalCents === sum(items.lineTotalCents)` before the link total equation.

`quick_order_link_operations` has exact kinds `create|cancel|duplicate`, immutable 64-hex fingerprints, safe result payloads at most 32,768 bytes, and composite store/link references. All four tables use forced RLS deny-by-default policies, owner ownership, no app table grants, and indexes for store/status/expiry list, token digest lookup, provider readiness and operations. The 024 down migration drops the added variant composite unique only after quick-link items are removed. Assertions and direct table-negative tests pin every money maximum, allowed expiry interval, lifecycle/updated timestamp relation, exact address/envelope constraint, same-product variant FK and product-media source dependency.

Define the helper exactly:

```sql
saas.quick_link_merchant_authority_error(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,p_required_action text
) RETURNS text
```

It rejects all actions except `quick_links.read|quick_links.manage`; maps them exactly to `orders.read|orders.manage` when calling `merchant_action_authority_error(...,'orders',mapped_action)`; returns that controlled error when non-null; then independently queries the ordered persisted plan-feature set for enabled `checkout`. Assertions pin the mapping strings and both feature checks so either entitlement missing fails closed.

- [ ] **Step 3: Add down/assertions/manifest**

The down migration drops functions/triggers/indexes/tables in reverse dependency order only. Assertions pin owner, forced RLS, exact FK columns, exact action/feature source, immutability triggers, no PUBLIC/app DML and every sealed/token constraint. Generate checksums only with:

```bash
shasum -a 256 apps/owner/scripts/sql/saas/202607220024_quick_order_links*.sql
```

- [ ] **Step 4: Run GREEN and commit**

```bash
node tests/saas-phase3/quick-order-links/postgres-harness.mjs
git diff --check
git add apps/owner/scripts/sql/saas/202607220024_* apps/owner/scripts/sql/saas/phase3b2-quick-order-links-manifest.json tests/saas-phase3/quick-order-links/postgres-harness.mjs
git commit -m "feat(saas): add tenant quick order link schema"
```

Expected: scenarios 1–18 pass with cluster/socket cleanup confirmed.

---

### Task 3: Least-privilege merchant API and operation recovery

**Files:**
- Create: `apps/owner/scripts/sql/saas/202607220025_quick_order_links_api.up.sql`
- Create: `apps/owner/scripts/sql/saas/202607220025_quick_order_links_api.down.sql`
- Create: `apps/owner/scripts/sql/saas/202607220025_quick_order_links_api_assertions.sql`
- Modify: `apps/owner/scripts/sql/saas/phase3b2-quick-order-links-manifest.json`
- Modify: `tests/saas-phase3/quick-order-links/postgres-harness.mjs`

**Interfaces:**
- Produces: `quick_links_list`, `quick_links_get`, `quick_links_create`, `quick_links_cancel`, `quick_links_duplicate`, `quick_links_recover_operation`.
- Function result convention: exactly one row `(outcome text, result_payload jsonb)` with stable outcomes; no exception text crosses the repository boundary.

Exact signatures and parameter order:

```sql
quick_links_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,bigint,timestamptz,uuid)
quick_links_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid)
quick_links_create(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,
  uuid,uuid[],uuid[],bigint[],uuid,
  text,text,text,jsonb,jsonb,text,text,bigint,bigint,bigint,
  text,text,jsonb,uuid,text
)
quick_links_cancel(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,bigint,uuid,text)
quick_links_duplicate(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,
  uuid,uuid,uuid[],text,text,jsonb,uuid,text
)
quick_links_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,text)
```

The first seven parameters are always store/principal/membership/plan ID/plan code/plan version/now. List then receives effective-status filter, page size, cursor timestamp and cursor ID; this foundation deliberately has no invented search contract. Create then receives link ID, item ID array, variant ID array, quantity array, provider-config ID, customer name/e-mail/phone, shipping/billing JSON, customer note, internal label, shipping cents, discount cents, expiry hours, token digest/key/envelope, operation ID and stable fingerprint. Duplicate receives source link ID, new link ID, new item ID array, fresh digest/key/envelope, operation ID and stable fingerprint. Recovery receives operation ID, exact kind and fingerprint.

Stable outcomes are exactly `listed|found|committed|operation_replayed|invalid_input|quick_link_not_found|provider_not_ready|catalog_item_unavailable|stock_unavailable|version_conflict|invalid_transition|operation_mismatch|store_inactive|membership_denied|feature_not_enabled|action_denied|durable_authority_invalid`.

- [ ] **Step 1: Add failing scenarios 19–40**

Add exact tests for owner/admin create/list/get/cancel/duplicate; editor/analyst read-only; exact quick-link-to-order action mapping; inactive/wrong membership/store/plan/features; canonical active product/variant/media snapshot and price; an exact-variant image beating generic media; generic media fallback; sibling-variant media remaining ineligible even with lower sort order; inactive/out-of-stock/cross-store variant denial; exact provider config readiness; expiry options; effective expired reads/list filters; no GET-side mutation; duplicate creates fresh digest/envelope and 24-hour expiry; optimistic version; state machine; replay with different regenerated IDs/token envelope but the same stable intent; fingerprint mismatch from changed merchant intent; concurrent same-version cancel single winner; safe money maxima/overflow rejection; exact microsecond pagination and adversarial same-millisecond/opposite-UUID rows; secret-free JSON; backup/restore; rollback/reapply.

Run the harness and expect scenario 19 RED because function 025 is absent.

- [ ] **Step 2: Implement deterministic projections and list**

`quick_links_list` is bounded 1–100 and keyset ordered by raw `created_at DESC,id DESC`. It emits list `createdAt` and cursor `createdAt` through the same canonical six-fractional-digit PostgreSQL formatter. Status filtering applies the effective-status expression before pagination. Its list projection contains only the Task 1 list DTO. Both list and `quick_links_get` calculate effective status with:

```sql
CASE
  WHEN link.status IN ('active','opened') AND link.expires_at <= p_now THEN 'expired'
  ELSE link.status
END
```

Neither function updates a row. Every function calls `quick_link_merchant_authority_error` with exact read/manage action.

- [ ] **Step 3: Implement atomic create**

`quick_links_create` receives server-validated recipient/address/note/expiry/provider ID, item inputs containing only generated item UUID + variant UUID + quantity, generated link/token material, operation UUID/stable-intent fingerprint, and authoritative context. Link/item IDs, digest, key ID and sealed envelope are excluded from that fingerprint. Under one transaction/function it:

1. advisory-locks operation UUID;
2. replays identical committed operation or rejects mismatch;
3. locks and validates each same-store active product/variant in requested position order;
4. uses canonical `product.name`, variant title/SKU and `variant.price_cents`, plus the deterministic active `product_media` choice defined in Task 2;
5. rejects unavailable or insufficient current stock when stock tracking is enabled;
6. confirms the selected provider config is same-store, active and exactly `paytr`;
7. uses store currency and server arithmetic only;
8. calculates line/subtotal/total with `numeric`, applies the Global Constraint maxima before `bigint` conversion, and returns `invalid_input` rather than allowing overflow;
9. inserts link, items, its single provider-config FK and immutable operation result atomically.

If the operation already exists, SQL compares only the supplied stable-intent fingerprint and returns the original safe result before inspecting newly generated link/item/token values. Same intent therefore replays; changed customer/item/provider/expiry/price-component intent mismatches.

The result is the safe mutation projection only:

```json
{"id":"<uuid>","status":"active","version":1,"expiresAt":"<canonical UTC>","updatedAt":"<canonical UTC>"}
```

- [ ] **Step 4: Implement cancel, duplicate and recovery**

Cancel accepts only effective active/opened and exact expected version; its stable fingerprint covers link ID + expected version. Duplicate accepts a source link plus fresh server IDs/digest/key/envelope and always derives a 24-hour expiry from `p_now`; its stable fingerprint covers only source link ID and the fixed duplicate intent. It revalidates provider readiness/catalog availability/prices and creates new canonical snapshots. Recovery is a read-only exact operation/kind/fingerprint lookup with no row locks or mutation.

Only exact API functions are granted to `celebix_saas_app`; PUBLIC and all tables remain denied.

- [ ] **Step 5: Run GREEN and commit**

```bash
node tests/saas-phase3/quick-order-links/postgres-harness.mjs
git diff --check
git add apps/owner/scripts/sql/saas/202607220025_* apps/owner/scripts/sql/saas/phase3b2-quick-order-links-manifest.json tests/saas-phase3/quick-order-links/postgres-harness.mjs
git commit -m "feat(saas): add quick order link postgres api"
```

Expected: exactly 40/40 PostgreSQL scenarios pass, including concurrency, backup/restore, down/reapply and cleanup.

---

### Task 4: Constrained PostgreSQL quick-link repository

**Files:**
- Create: `packages/saas-data/src/quick-orders/types.ts`
- Create: `packages/saas-data/src/quick-orders/validation.ts`
- Create: `packages/saas-data/src/quick-orders/canonical.ts`
- Create: `packages/saas-data/src/quick-orders/cursor.ts`
- Create: `packages/saas-data/src/quick-orders/errors.ts`
- Create: `packages/saas-data/src/quick-orders/repository.ts`
- Create: `packages/saas-data/src/quick-orders/repository.test.ts`
- Create: `packages/saas-data/src/quick-orders/index.ts`
- Modify: `packages/saas-data/src/index.ts:1-end`

**Interfaces:**
- Produces: `QuickOrderLinkRepository` and `PostgresQuickOrderLinkRepository`.
- Required methods: `list`, `get`, `create`, `cancel`, `duplicate`.
- Constructor options: pool, exact role `celebix_saas_app`, four timeout values, audit callback. All IDs/digest/envelope and the single provider-config ID are supplied by a server-only caller; the repository never generates or decrypts token material.

Define the exact port:

```ts
export interface QuickLinkAuthorityInput { readonly tenantContext: TenantContext; readonly now: Date }
export interface ListQuickLinksInput extends QuickLinkAuthorityInput {
  readonly pageSize: number; readonly cursor?: string;
  readonly status?: QuickOrderLinkStatus;
}
export interface GetQuickLinkInput extends QuickLinkAuthorityInput { readonly linkId: string }
export interface SealedQuickLinkToken {
  readonly algorithm: "A256GCM"; readonly ciphertext: string; readonly iv: string;
  readonly keyId: string; readonly tag: string; readonly version: 1;
}
export interface CreateQuickLinkItemInput {
  readonly itemId: string; readonly variantId: string; readonly quantity: number;
}
export interface CreateQuickLinkInput extends QuickLinkAuthorityInput {
  readonly operationId: string; readonly linkId: string;
  readonly items: readonly CreateQuickLinkItemInput[];
  readonly providerConfigId: string;
  readonly customerName: string; readonly customerEmail: string; readonly customerPhone?: string;
  readonly shippingAddress: Readonly<QuickOrderAddress>;
  readonly billingAddress: Readonly<QuickOrderAddress>;
  readonly customerNote?: string; readonly internalLabel?: string;
  readonly shippingCents: number; readonly discountCents: number;
  readonly expiryHours: 4 | 12 | 24 | 48 | 72;
  readonly tokenDigest: string; readonly sealedToken: Readonly<SealedQuickLinkToken>;
}
export interface CancelQuickLinkInput extends GetQuickLinkInput {
  readonly operationId: string; readonly expectedVersion: number;
}
export interface DuplicateQuickLinkInput extends GetQuickLinkInput {
  readonly operationId: string; readonly newLinkId: string;
  readonly newItemIds: readonly string[];
  readonly tokenDigest: string; readonly sealedToken: Readonly<SealedQuickLinkToken>;
}
export interface ListQuickLinksResult {
  readonly items: readonly QuickOrderLinkListItem[]; readonly nextCursor?: string;
}
export interface QuickOrderLinkRepository {
  list(input: ListQuickLinksInput): Promise<ListQuickLinksResult>;
  get(input: GetQuickLinkInput): Promise<QuickOrderLinkDetail>;
  create(input: CreateQuickLinkInput): Promise<QuickOrderLinkMutationResult>;
  cancel(input: CancelQuickLinkInput): Promise<QuickOrderLinkMutationResult>;
  duplicate(input: DuplicateQuickLinkInput): Promise<QuickOrderLinkMutationResult>;
}
```

`QUICK_LINK_ERROR_CODES` is the exact controlled SQL error subset plus repository-only `unavailable|commit_unknown`. `tokenKeyId` is always derived from `sealedToken.keyId`; callers cannot provide two disagreeing values.

- [ ] **Step 1: Write repository RED tests**

Cover exact constructor keys/prototypes, validation before checkout, hostile getters/proxies, authority tuple validation, exact SQL signatures/argument order, `BEGIN` + timeout configs + `SET LOCAL ROLE`, safe one-row outcomes, projection strictness/freezing, no raw token/private IDs, list cursor binding/tamper rejection, controlled errors, rollback/release, unknown read/write, commit success, unknown commit recovery, replay/mismatch and audit failure containment.

The critical unknown-commit state matrix must prove:

```ts
await assert.rejects(repository.create(input), quickLinkError("commit_unknown"));
assert.equal(client.destroyed, true);
assert.equal(writeCalls, 1);
assert.equal(recoveryCalls, 1);
```

After uncertain `COMMIT`, the writer is destroyed without `ROLLBACK` or reuse. Recovery is attempted exactly once on a fresh client, read-only, with the same operation/kind/stable fingerprint; no second write is allowed. Exact recovered operation returns the original frozen mutation as `replayed: true`. Missing, multiple, malformed or mismatched recovery preserves `commit_unknown`. Recovery acquisition/query/read-transaction COMMIT failures preserve `commit_unknown` and destroy uncertain clients. Audit callback sync/async failure is swallowed and cannot alter the already-known result. Read COMMIT uncertainty remains `unavailable` and destroys the client; it is never mislabeled as a write commit result.

- [ ] **Step 2: Run RED**

```bash
npm test --workspace @celebix/saas-data
```

Expected: FAIL because the quick-order repository module does not exist.

- [ ] **Step 3: Implement validation and repository**

Follow the existing `PostgresOrderRepository` transaction template without sharing mutable state. Validate all inputs before pool acquisition. Copy only own data properties into frozen values. Build a domain-separated stable-intent fingerprint that deliberately excludes `linkId`, every generated item ID, `tokenDigest`, and `sealedToken`:

```ts
quickOrderFingerprint("create", storeId, {
  customerName,
  customerEmail,
  customerPhone: customerPhone ?? null,
  shippingAddress,
  billingAddress,
  customerNote: customerNote ?? null,
  internalLabel: internalLabel ?? null,
  shippingCents,
  discountCents,
  expiryHours,
  items: items.map(({ variantId, quantity }) => ({ variantId, quantity })),
  providerConfigId,
});
```

Cancel fingerprint contains only `linkId,expectedVersion`; duplicate fingerprint contains only `sourceLinkId`. Cursor binding includes store ID, effective status filter, six-digit created timestamp and ID. The database cursor must exactly equal the final DTO's normalized six-digit timestamp/ID; Date/millisecond comparison is forbidden. Add a rejection test where final DTO is `.000800Z` and cursor is `.000700Z`. Database projections are parsed only through Task 1 contract parsers. For mutations the repository strictly parses the SQL payload without `replayed`, constructs exactly `{ ...safeSqlPayload, replayed }`, and passes that object to `parseQuickOrderLinkMutationResult`. Map driver failures to stable safe codes; never expose SQLSTATE/query/connection strings.

- [ ] **Step 4: Run GREEN and commit**

```bash
npm test --workspace @celebix/saas-data
npm run typecheck --workspace @celebix/saas-data
git diff --check
git add packages/saas-data
git commit -m "feat(saas): add postgres quick order repository"
```

Expected: all data tests and typecheck pass; no changed dependency or lockfile.

---

### Task 5: Foundation security and regression gate

**Files:**
- Create: `tests/saas-phase3/quick-order-links/in-process.test.mjs`
- Create: `tests/saas-phase3/quick-order-links/static-security.test.mjs`
- Modify only if required by new authorized exports/migrations: existing narrow Phase 3 static allowlists that fail specifically on 024/025 or `quick-orders`.

**Interfaces:**
- Consumes all Task 1–4 public interfaces.
- Produces no runtime surface.

- [ ] **Step 1: Write the final failing gates**

The in-process test traverses contract -> repository with fake driver results for list/get/create/cancel/duplicate/recovery and stable negative outcomes. The static test proves:

```text
donor SHA exact
apps/admin diff 0
024/025 manifest exact
no direct app table DML
no raw token or sealed material in public DTO/result parsers
no customer-panel HTTP/page/navigation file changed
no storefront route/runtime changed
no /api/admin, Supabase or legacy auth import
no production/deploy/infra/config/credential change
no quick-links navigation label or href visible yet
no secret/private key/database URL in tracked diff
```

Run RED before adding any necessary export/allowlist alignment.

- [ ] **Step 2: Make only mechanical gate alignments**

Update export inventories and exact migration allowlists only when they reject the newly reviewed files. Do not weaken protected-path, token, private-ID, role, navigation or production scans.

- [ ] **Step 3: Run the complete foundation matrix**

```bash
node tests/saas-phase3/quick-order-links/postgres-harness.mjs
node --experimental-transform-types --test tests/saas-phase3/quick-order-links/*.test.mjs
node tests/saas-phase3/product-catalog/postgres-harness.mjs
NODE_OPTIONS='--conditions=react-server' node tests/saas-phase3/product-catalog-api/postgres-harness.mjs
node tests/saas-phase3/order-management/postgres-harness.mjs
npm test --workspace @celebix/saas-contracts
npm test --workspace @celebix/saas-data
npm test --workspace @celebix/customer-panel
NODE_OPTIONS='--conditions=react-server' node --experimental-transform-types --test $(rg --files apps/owner | rg '\.test\.(ts|mjs)$')
npm run typecheck --workspace @celebix/saas-contracts
npm run typecheck --workspace @celebix/saas-data
npm run typecheck --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/owner
npm run build --workspace @celebix/customer-panel
npm run build --workspace @celebix/owner
git diff --check
git diff --name-only 301637111de040fc3bbf3cfed718a2d772e42130 -- apps/admin apps/customer-panel apps/storefront-shared apps/storefront-base deploy infra infrastructure package.json package-lock.json apps/customer-panel/package.json apps/owner/package.json apps/storefront-shared/package.json packages/saas-contracts/package.json packages/saas-data/package.json
git diff 301637111de040fc3bbf3cfed718a2d772e42130 | rg -n 'BEGIN (RSA|EC|OPENSSH) PRIVATE KEY|postgres(ql)?://[^[:space:]]+:[^[:space:]@]+@|__Host-celebix_panel=' || true
rg -n 'tokenDigest|sealedToken|tokenKeyId' packages/saas-contracts/src/quick-orders/types.ts packages/saas-contracts/src/quick-orders/validation.ts || true
```

Expected: quick-link PostgreSQL 40/40; product-catalog 33/33, product-catalog API 26/26, and order-management 40/40 remain exact; customer-panel remains 144/144; contracts/data totals increase only by the reviewed new tests and pass; four typechecks and two builds pass; protected/dependency diff is empty; both scans return no matches.

The explicit full Owner source baseline at `301637111...` is 336/343 with exactly seven pre-existing stale failures: `app/api/internal/self-serve/oidc-callback/route.test.ts`, `app/api/self-serve/register/route.test.ts`, `lib/self-serve-flags.test.ts`, `lib/self-serve-onboarding.test.ts`, `lib/self-serve-persistent-registration-adapter.test.ts`, `lib/self-serve-registration.test.ts`, and `lib/self-serve-request-store.test.ts`. The foundation must retain exactly those seven and introduce no new Owner failure; typecheck/build must still pass. Do not alter those stale tests or weaken the command.

- [ ] **Step 4: Commit the final gate**

```bash
git add tests/saas-phase3/quick-order-links
git add -u tests/saas-phase3 packages/saas-contracts/src/contracts.test.ts packages/saas-data/src/index.ts
git commit -m "test(saas): verify quick order link foundation"
```

- [ ] **Step 5: Whole-foundation independent review**

Review exact range `301637111de040fc3bbf3cfed718a2d772e42130..HEAD`. Required verdicts: Spec PASS, Quality APPROVED, no Critical/Important. Confirm `apps/admin/**` byte diff 0, navigation remains unchanged, and no HTTP/public/provider claim exists.

---

## Completion Boundary

This plan is complete when the hidden durable foundation is fully tested and reviewed. It does **not** activate `Siparişler > Hızlı Sipariş`.

Immediately after this plan, write and execute the next plan for:

1. server-only A256GCM token/config sealing and key rotation;
2. authenticated customer-panel quick-link HTTP/runtime and Hemenaku builder/list UI, still unmounted from navigation;
3. real PayTR sandbox adapter, payment attempts, inventory reservations, signed callback and atomic one-order settlement;
4. exact-host public storefront redemption and route-owned CSP;
5. full create -> redeem -> settle -> order staging proof, then and only then navigation activation.

No staging/production deployment, provider credential mutation, or menu activation is authorized by this foundation plan.
