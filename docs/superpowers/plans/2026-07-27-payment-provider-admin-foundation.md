# Payment Provider Admin Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the first independently testable payment-platform slice: every real GurmePOS provider variant appears in a truthful, locally branded catalog; merchants can manage durable store-scoped payment methods, emergency state and checkout order; and the Celebix payment settings page uses the approved ikas-style interaction model without enabling an unverified provider.

**Architecture:** Public provider catalog metadata is immutable application code and is deliberately separate from the executable adapter registry. Existing sealed `MerchantProviderProfile` authority is extended with `payment_processing`, while a new PostgreSQL payment-method aggregate owns checkout visibility, emergency state and ordering. The customer panel exposes narrow authenticated APIs and a dedicated React console; Wave 0 performs zero provider network calls and keeps the production adapter registry empty.

**Tech Stack:** Next.js 16, React 19, TypeScript, Node test runner, PostgreSQL 16, existing `@celebix/saas-contracts` and `@celebix/saas-data` packages, CSS Modules, Coolify isolated staging.

## Global Constraints

- `apps/admin/**` and `apps/storefront-base/**` are read-only donors and must have zero diff.
- Tenant/store authority comes only from authenticated server `TenantContext`; browser-supplied tenant/store/principal IDs are forbidden.
- Every non-dummy gateway variant in POS Entegratör Pro 2.6.73 must map to exactly one visible catalog entry; `dummy-payment` must never enter a production DTO or bundle.
- All provider cards use a locally stored, provenance-recorded official logo where permitted; no hotlinking.
- Wave 0 performs zero provider HTTP calls, accepts zero real provider credentials and activates zero production adapters.
- The executable provider registry stays fail-closed and empty by default.
- PAN and CVV must not appear in contracts, database objects, requests, logs, fixtures or UI fields.
- Existing responsive dropdown sidebar and fixed panel topbar behavior must not regress.
- Generic `payment_setting` records remain readable only for compatibility; new payment-method state uses the dedicated aggregate.
- Every mutation uses exact Origin, server session, role checks, idempotency fingerprint and optimistic version.
- No production database, production provider, production credential or production deployment mutation is authorized.
- An isolated staging migration/deploy is allowed only after every local gate passes and the exact pushed SHA is pinned.
- RED -> GREEN -> REFACTOR and a focused commit are required for every task.

---

## File Structure

### Shared contracts

- Create `packages/saas-contracts/src/payment-providers/types.ts`: immutable catalog and payment-method DTO types/constants.
- Create `packages/saas-contracts/src/payment-providers/validation.ts`: exact-shape parsers and bounded validation.
- Create `packages/saas-contracts/src/payment-providers/index.ts`: public exports.
- Create `packages/saas-contracts/src/payment-providers/payment-providers.test.ts`: hostile-input and invariant tests.
- Modify `packages/saas-contracts/src/merchant-admin/types.ts` and `validation.ts`: add only the `payment_processing` provider capability.
- Modify `packages/saas-contracts/src/merchant-admin/merchant-admin.test.ts`, `src/index.ts` and `src/contracts.test.ts`: lock exports and backward compatibility.

### Provider catalog and assets

- Create `apps/customer-panel/lib/payment-providers/source-inventory.json`: exact licensed-plugin source inventory and 59 raw gateway slugs.
- Create `apps/customer-panel/lib/payment-providers/catalog-data.ts`: 58 non-dummy normalized provider/mode entries.
- Create `apps/customer-panel/lib/payment-providers/catalog.ts`: frozen catalog lookup/search projection.
- Create `apps/customer-panel/lib/payment-providers/catalog.test.ts`: completeness, uniqueness, readiness and asset checks.
- Create `apps/customer-panel/lib/payment-providers/logo-sources.json`: official source provenance.
- Create `apps/customer-panel/lib/payment-providers/logo-manifest.json`: deterministic local-file digests.
- Create `apps/customer-panel/public/payment-providers/*`: sanitized SVG/PNG/WebP assets.
- Create `scripts/payment-provider-assets/build-manifest.mjs`: deterministic manifest builder and active-content rejection.
- Create `tests/saas-phase3/payment-provider-admin/logo-assets.test.mjs`: production asset/provenance gate.
- Modify `apps/customer-panel/package.json`: include payment-provider tests in the workspace suite.

### Durable payment-method authority

- Create `apps/owner/scripts/sql/saas/202607270051_payment_method_admin.up.sql`.
- Create `apps/owner/scripts/sql/saas/202607270051_payment_method_admin.down.sql`.
- Create `apps/owner/scripts/sql/saas/202607270051_payment_method_admin_assertions.sql`.
- Create `apps/owner/scripts/sql/saas/phase3j-payment-method-admin-manifest.json`.
- Create `tests/saas-phase3/payment-provider-admin/static-security.test.mjs`.
- Create `tests/saas-phase3/payment-provider-admin/postgres-harness.mjs`.
- Create `tests/saas-phase3/payment-provider-admin/isolated-staging-preflight.sql`.
- Create `tests/saas-phase3/payment-provider-admin/isolated-staging-runner.mjs`.
- Modify `tests/saas-phase3/run-current-suite.mjs`: include the new static/logo/PostgreSQL gates.

### Data and server boundaries

- Create `packages/saas-data/src/payment-methods/types.ts`, `canonical.ts`, `errors.ts`, `repository.ts`, `repository.test.ts` and `index.ts`.
- Modify `packages/saas-data/src/index.ts` to export the payment-method repository.
- Create `apps/customer-panel/lib/server-payment-methods/runtime.ts` and `default.ts`.
- Create `apps/customer-panel/lib/payment-method-http/handler.ts`, `handler.test.ts` and `default.ts`.
- Create Next route adapters under `apps/customer-panel/app/api/payment-providers/catalog` and `apps/customer-panel/app/api/payment-methods`.
- Modify `apps/customer-panel/package.json`: include payment-method HTTP tests.

### Browser client and UI

- Create `apps/customer-panel/lib/payment-method-ui/client.ts` and `client.test.ts`.
- Create `apps/customer-panel/lib/payment-settings-ui/model.ts` and `model.test.ts`.
- Create `apps/customer-panel/components/settings/payment/PaymentSettingsConsole.tsx`.
- Create `apps/customer-panel/components/settings/payment/PaymentProviderCatalogDialog.tsx`.
- Create `apps/customer-panel/components/settings/payment/PaymentProviderConnectionDrawer.tsx`.
- Create `apps/customer-panel/components/settings/payment/PaymentMethodOrderDialog.tsx`.
- Create `apps/customer-panel/components/settings/payment/payment-settings.module.css`.
- Create `apps/customer-panel/lib/payment-settings-console.test.ts`.
- Modify the three `apps/customer-panel/app/settings/payment/**/page.tsx` routes and related route/source tests.
- Modify `apps/customer-panel/package.json`: include payment-method client/model tests.

## Wave Boundary

This plan covers the approved design's Wave 0 control plane and one truthful staging release. It intentionally does not implement payment initiation, provider callbacks, refunds, captures, reconciliation, a hosted-provider network adapter or the isolated direct-POS runtime.

Those remaining design sections are split into independently reviewable follow-up plans:

1. Hosted payment runtime plus the first verified PayTR/iframe adapter, using the current shared-storefront PayTR behavior and PayTR's current official documentation.
2. Additional redirect/iframe/tokenized provider adapters, one conformance-gated provider family per task group.
3. Isolated direct-POS service, PCI operational controls and bank adapters.

Wave 0 is complete only when all 58 real source variants are visible and accurately labeled, not when they are operational. No planned catalog entry may be promoted by this plan.

---

### Task 1: Add immutable payment catalog and method contracts

**Files:**
- Create: `packages/saas-contracts/src/payment-providers/types.ts`
- Create: `packages/saas-contracts/src/payment-providers/validation.ts`
- Create: `packages/saas-contracts/src/payment-providers/index.ts`
- Create: `packages/saas-contracts/src/payment-providers/payment-providers.test.ts`
- Modify: `packages/saas-contracts/src/merchant-admin/types.ts`
- Modify: `packages/saas-contracts/src/merchant-admin/validation.ts`
- Modify: `packages/saas-contracts/src/merchant-admin/merchant-admin.test.ts`
- Modify: `packages/saas-contracts/src/index.ts`
- Modify: `packages/saas-contracts/src/contracts.test.ts`

**Interfaces:**
- Produces `PaymentProviderCatalogEntry` and `parsePaymentProviderCatalogEntry(value)`.
- Produces `MerchantPaymentMethod` and `parseMerchantPaymentMethod(value)`.
- Produces `PaymentMethodMutationResult` and `parsePaymentMethodMutationResult(value)`.
- Produces `PaymentMethodReorderResult` and `parsePaymentMethodReorderResult(value)`.
- Extends `MerchantProviderCapability` with the exact value `payment_processing`.

- [ ] **Step 1: Write the failing catalog/parser tests**

Use exact fixtures shaped like:

```ts
const entry = parsePaymentProviderCatalogEntry({
  providerCode: "paytr_iframe",
  familyCode: "paytr",
  modeCode: "iframe",
  sourceSlug: "paytr-iframe",
  label: "PayTR",
  modeLabel: "iFrame",
  category: "payment_institution",
  interactionMode: "iframe",
  readiness: "planned",
  support: {
    threeDSecure: "unknown",
    installments: "unknown",
    refund: "unknown",
    cancel: "unknown",
    capture: "unknown"
  },
  logoPath: "/payment-providers/paytr.svg",
  aliases: ["pay tr"],
  environments: ["test", "live"]
});
assert.equal(entry.providerCode, "paytr_iframe");
assert(Object.isFrozen(entry));
```

Add rejection tests for unknown keys, getters, symbols, sparse arrays, duplicate aliases, non-local logo paths, `dummy_payment`, unsupported enum values, strings with control characters and more than 100 catalog entries.

- [ ] **Step 2: Write failing method/profile capability tests**

Lock these exact public enums:

```ts
PAYMENT_PROVIDER_READINESS = [
  "production_ready", "sandbox_ready", "verification", "planned", "maintenance"
]
PAYMENT_PROVIDER_INTERACTION_MODES = [
  "redirect", "iframe", "tokenized", "direct_pos", "wallet", "offline"
]
PAYMENT_METHOD_STATES = ["active", "disabled", "emergency_disabled"]
PAYMENT_METHOD_KINDS = ["provider", "cash_on_delivery", "bank_transfer"]
MERCHANT_PROVIDER_CAPABILITIES includes "payment_processing"
```

The method fixture must include `id`, `kind`, nullable `profileId`/`providerCode`, `label`, `state`, nullable `emergencyReason`, `position`, immutable safe `config`, `version`, `createdAt` and `updatedAt`. Require a profile/provider for kind `provider` and forbid it for built-in kinds.

Lock mutation projections to:

```ts
interface PaymentMethodMutationResult {
  readonly id: string;
  readonly state: PaymentMethodState;
  readonly position: number;
  readonly version: number;
  readonly updatedAt: string;
  readonly replayed: boolean;
}
interface PaymentMethodReorderResult {
  readonly items: readonly PaymentMethodMutationResult[];
  readonly replayed: boolean;
}
```

The outer reorder `replayed` value and every item `replayed` value must agree.

- [ ] **Step 3: Run the focused tests and verify RED**

Run:

```bash
node --experimental-strip-types --test packages/saas-contracts/src/payment-providers/payment-providers.test.ts packages/saas-contracts/src/merchant-admin/merchant-admin.test.ts
```

Expected: missing payment-provider module/exports and missing `payment_processing` failures.

- [ ] **Step 4: Implement the exact frozen types and parsers**

Start `types.ts` with:

```ts
export const PAYMENT_PROVIDER_READINESS = Object.freeze([
  "production_ready", "sandbox_ready", "verification", "planned", "maintenance",
] as const);
export type PaymentProviderReadiness = (typeof PAYMENT_PROVIDER_READINESS)[number];
export type ProviderSupport = "yes" | "no" | "unknown";
export interface PaymentProviderCatalogEntry {
  readonly providerCode: string;
  readonly familyCode: string;
  readonly modeCode: string;
  readonly sourceSlug: string;
  readonly label: string;
  readonly modeLabel: string;
  readonly category: "bank_pos" | "payment_institution" | "wallet" | "international";
  readonly interactionMode: "redirect" | "iframe" | "tokenized" | "direct_pos" | "wallet";
  readonly readiness: PaymentProviderReadiness;
  readonly support: Readonly<Record<"threeDSecure" | "installments" | "refund" | "cancel" | "capture", ProviderSupport>>;
  readonly logoPath: string;
  readonly aliases: readonly string[];
  readonly environments: readonly ("test" | "live")[];
}
```

Reuse the hostile-object style in `merchant-admin/validation.ts`: exact own enumerable data properties, dense arrays, byte bounds, lower-snake codes, ISO timestamps and frozen results. Do not reuse JSON parsers that allow secret-looking keys for catalog fields.

- [ ] **Step 5: Export the new contracts without changing old shapes**

Add `payment_processing` to the existing capability constant and parser only. Existing six capability values retain order and behavior; append the new value. Export all new types/parsers from the local and root indexes and extend root export-presence tests.

- [ ] **Step 6: Run contract tests and typecheck**

Run:

```bash
npm test --workspace @celebix/saas-contracts
npm run typecheck --workspace @celebix/saas-contracts
```

Expected: all tests PASS; existing provider profile fixtures remain byte-shape compatible.

- [ ] **Step 7: Commit**

```bash
git add packages/saas-contracts
git commit -m "feat(payments): add provider catalog contracts"
```

---

### Task 2: Normalize all licensed-plugin gateway variants into the visible catalog

**Files:**
- Create: `apps/customer-panel/lib/payment-providers/source-inventory.json`
- Create: `apps/customer-panel/lib/payment-providers/catalog-data.ts`
- Create: `apps/customer-panel/lib/payment-providers/catalog.ts`
- Create: `apps/customer-panel/lib/payment-providers/catalog.test.ts`
- Modify: `apps/customer-panel/package.json`

**Interfaces:**
- Produces `PAYMENT_PROVIDER_CATALOG` as a dense frozen array of exactly 58 entries.
- Produces `listPaymentProviderCatalog()` and `getPaymentProviderCatalogEntry(providerCode)`.
- Every entry's `providerCode` is the source slug with hyphens changed to underscores.

- [ ] **Step 1: Record the exact source inventory**

Set `source-inventory.json` to plugin `POS Entegratör Pro`, version `2.6.73`, inspected path `/Users/Celebix/Downloads/gurmepos-pro`, inspected date `2026-07-27` and this exact sorted slug list:

```json
[
  "akbank", "akbank-json", "akode", "albaraka", "craftgate", "denizbank",
  "dummy-payment", "erpapay", "esnekpos", "finansbank", "finansbank-payfor",
  "finansbank-payfor-v2", "garanti", "garanti-pay", "halkbank", "halkbank-mkd",
  "hepsipay", "is-bankasi", "is-bankasi-girogate", "isyerimpos", "iyzico",
  "iyzico-iframe", "kuveyt-turk", "lidio", "moka", "mollie", "ozan", "paidora",
  "papara", "papara-checkout", "papel", "param", "paratika", "pay-with-iyzico",
  "paybull", "paycell", "paynkolay", "paytr", "paytr-iframe", "qnbpay",
  "rubikpara", "sekerbank", "setcard", "shopier", "sipay", "tami", "teb",
  "united-payment", "vakif-katilim", "vakifbank", "vallet", "vepara", "weepay",
  "worldpay", "wyld", "yapi-kredi", "ziraat", "ziraat-katilim", "ziraatpay"
]
```

- [ ] **Step 2: Write the failing completeness and normalization tests**

The test must assert:

```ts
assert.equal(sourceInventory.gatewaySlugs.length, 59);
assert.equal(PAYMENT_PROVIDER_CATALOG.length, 58);
assert(!PAYMENT_PROVIDER_CATALOG.some((entry) => entry.sourceSlug === "dummy-payment"));
assert.deepEqual(
  new Set(PAYMENT_PROVIDER_CATALOG.map((entry) => entry.sourceSlug)),
  new Set(sourceInventory.gatewaySlugs.filter((slug) => slug !== "dummy-payment")),
);
assert.equal(new Set(PAYMENT_PROVIDER_CATALOG.map((entry) => entry.providerCode)).size, 58);
assert(PAYMENT_PROVIDER_CATALOG.every((entry) => entry.readiness === "planned"));
```

Also assert every entry parses through `parsePaymentProviderCatalogEntry`, is deeply frozen and resolves from exact provider code only; uppercase, hyphenated or padded lookup input returns null.

- [ ] **Step 3: Run the catalog test and verify RED**

Run:

```bash
node --experimental-transform-types --test apps/customer-panel/lib/payment-providers/catalog.test.ts
```

Expected: missing catalog modules.

- [ ] **Step 4: Implement the curated family/mode mapping**

Use this exact source-slug -> family/mode normalization:

```text
akbank -> akbank/virtual_pos
akbank-json -> akbank/json
akode -> akode/hosted
albaraka -> albaraka_turk/virtual_pos
craftgate -> craftgate/orchestration
denizbank -> denizbank/virtual_pos
erpapay -> erpapay/hosted
esnekpos -> esnekpos/hosted
finansbank -> qnb_finansbank/virtual_pos
finansbank-payfor -> qnb_finansbank/payfor
finansbank-payfor-v2 -> qnb_finansbank/payfor_v2
garanti -> garanti_bbva/virtual_pos
garanti-pay -> garanti_bbva/garanti_pay
halkbank -> halkbank/virtual_pos
halkbank-mkd -> halkbank/mkd
hepsipay -> hepsipay/wallet
is-bankasi -> is_bankasi/virtual_pos
is-bankasi-girogate -> is_bankasi/girogate
isyerimpos -> isyerimpos/orchestration
iyzico -> iyzico/api
iyzico-iframe -> iyzico/iframe
kuveyt-turk -> kuveyt_turk/virtual_pos
lidio -> lidio/hosted
moka -> moka/api
mollie -> mollie/hosted
ozan -> ozan/wallet
paidora -> paidora/hosted
papara -> papara/api
papara-checkout -> papara/checkout
papel -> papel/wallet
param -> param/hosted
paratika -> paratika/hosted
pay-with-iyzico -> iyzico/pay_with_iyzico
paybull -> paybull/hosted
paycell -> paycell/wallet
paynkolay -> paynkolay/hosted
paytr -> paytr/direct_api
paytr-iframe -> paytr/iframe
qnbpay -> qnbpay/hosted
rubikpara -> rubikpara/hosted
sekerbank -> sekerbank/virtual_pos
setcard -> setcard/meal_card
shopier -> shopier/hosted
sipay -> sipay/hosted
tami -> tami/hosted
teb -> teb/virtual_pos
united-payment -> united_payment/hosted
vakif-katilim -> vakif_katilim/virtual_pos
vakifbank -> vakifbank/virtual_pos
vallet -> vallet/hosted
vepara -> vepara/hosted
weepay -> weepay/hosted
worldpay -> worldpay/hosted
wyld -> wyld/hosted
yapi-kredi -> yapi_kredi/virtual_pos
ziraat -> ziraat_bankasi/virtual_pos
ziraat-katilim -> ziraat_katilim/virtual_pos
ziraatpay -> ziraatpay/hosted
```

Do not infer capability support from directory names. Set every support value to `unknown` and readiness to `planned` until a provider-specific official-doc plan changes it.

- [ ] **Step 5: Implement frozen catalog access**

`catalog.ts` validates every static entry at module initialization, rejects duplicate provider/family-mode pairs, clones no mutable source object into the result and exposes:

```ts
export function listPaymentProviderCatalog(): readonly PaymentProviderCatalogEntry[];
export function getPaymentProviderCatalogEntry(providerCode: string): PaymentProviderCatalogEntry | null;
```

- [ ] **Step 6: Register the catalog test in the workspace script**

Append `lib/payment-providers/*.test.ts` to the customer-panel `test` command. Do not remove or reorder existing suites.

- [ ] **Step 7: Run focused and workspace tests**

```bash
node --experimental-transform-types --test apps/customer-panel/lib/payment-providers/catalog.test.ts
npm run typecheck --workspace @celebix/customer-panel
```

Expected: catalog tests PASS; TypeScript sees all catalog entries as immutable.

- [ ] **Step 8: Commit**

```bash
git add apps/customer-panel/lib/payment-providers
git commit -m "feat(payments): add complete provider catalog"
```

---

### Task 3: Research, sanitize and pin every provider-family logo

**Files:**
- Create: `apps/customer-panel/lib/payment-providers/logo-sources.json`
- Create: `apps/customer-panel/lib/payment-providers/logo-manifest.json`
- Create: `apps/customer-panel/public/payment-providers/*`
- Create: `scripts/payment-provider-assets/build-manifest.mjs`
- Create: `tests/saas-phase3/payment-provider-admin/logo-assets.test.mjs`
- Modify: `apps/customer-panel/lib/payment-providers/catalog-data.ts`

**Interfaces:**
- Produces one local logo path for each of 48 family codes.
- Produces provenance records with `familyCode`, `sourceUrl`, `officialHost`, `retrievedAt`, `usageNote`, `file`, `mimeType` and SHA-256.
- Catalog entries reference only manifest-owned paths.

- [ ] **Step 1: Write the failing logo-family coverage test**

Lock this exact family set:

```js
[
  "akbank", "akode", "albaraka_turk", "craftgate", "denizbank", "erpapay",
  "esnekpos", "qnb_finansbank", "garanti_bbva", "halkbank", "hepsipay",
  "is_bankasi", "isyerimpos", "iyzico", "kuveyt_turk", "lidio", "moka",
  "mollie", "ozan", "paidora", "papara", "papel", "param", "paratika",
  "paybull", "paycell", "paynkolay", "paytr", "qnbpay", "rubikpara",
  "sekerbank", "setcard", "shopier", "sipay", "tami", "teb",
  "united_payment", "vakif_katilim", "vakifbank", "vallet", "vepara",
  "weepay", "worldpay", "wyld", "yapi_kredi", "ziraat_bankasi",
  "ziraat_katilim", "ziraatpay"
]
```

Require exactly one manifest row per family; local path under `/payment-providers/`; HTTPS source; no query credential; existing non-empty file; digest match; allowed SVG/PNG/WebP media type.

- [ ] **Step 2: Run the logo test and verify RED**

```bash
node --test tests/saas-phase3/payment-provider-admin/logo-assets.test.mjs
```

Expected: missing logo source/manifest/assets.

- [ ] **Step 3: Research official sources in four bounded batches**

For each family, use image search only to discover a source, then open and verify the provider's official brand, press, developer or corporate domain. Process families 1–12, 13–24, 25–36 and 37–48 as four separate checkpoints. Record the final official URL and a short usage/source note; do not use search-result/CDN hotlinks without tracing them to the official owner.

If no reusable official asset can be verified, add a Celebix-generated text monogram asset and set `usageNote` to `official_asset_unavailable_fallback`. Never copy ikas-hosted assets.

- [ ] **Step 4: Add and sanitize local assets**

Prefer SVG. Reject any SVG containing:

```js
/<(?:script|foreignObject|iframe|object|embed)\b|\bon[a-z]+\s*=|(?:href|xlink:href)\s*=\s*["'](?:https?:|data:|\/\/)/i
```

Strip metadata not needed for rendering, require an explicit `viewBox`, and cap each asset at 256 KiB. Raster assets must be PNG or WebP, at most 2048 x 2048 and 512 KiB. Do not modify brand colors.

- [ ] **Step 5: Implement deterministic manifest generation**

`build-manifest.mjs` reads `logo-sources.json`, validates exact keys and family uniqueness, reads the referenced local file, applies active-content/size checks and writes rows sorted by `familyCode` with lowercase SHA-256.

Run:

```bash
node scripts/payment-provider-assets/build-manifest.mjs
node --test tests/saas-phase3/payment-provider-admin/logo-assets.test.mjs
```

Expected: 48/48 source and manifest records PASS.

- [ ] **Step 6: Bind catalog logo paths and run UI package checks**

Update every catalog entry to `/payment-providers/<family>.<ext>` from the manifest. Add negative tests for missing, duplicated, remote and cross-family paths.

Run:

```bash
node --experimental-transform-types --test apps/customer-panel/lib/payment-providers/catalog.test.ts
npm run typecheck --workspace @celebix/customer-panel
```

- [ ] **Step 7: Commit**

```bash
git add apps/customer-panel/lib/payment-providers apps/customer-panel/public/payment-providers scripts/payment-provider-assets tests/saas-phase3/payment-provider-admin/logo-assets.test.mjs
git commit -m "feat(payments): add verified provider logos"
```

---

### Task 4: Add store-scoped payment-method persistence and migration gates

**Files:**
- Create: `apps/owner/scripts/sql/saas/202607270051_payment_method_admin.up.sql`
- Create: `apps/owner/scripts/sql/saas/202607270051_payment_method_admin.down.sql`
- Create: `apps/owner/scripts/sql/saas/202607270051_payment_method_admin_assertions.sql`
- Create: `apps/owner/scripts/sql/saas/phase3j-payment-method-admin-manifest.json`
- Create: `tests/saas-phase3/payment-provider-admin/static-security.test.mjs`
- Create: `tests/saas-phase3/payment-provider-admin/postgres-harness.mjs`
- Create: `tests/saas-phase3/payment-provider-admin/isolated-staging-preflight.sql`
- Create: `tests/saas-phase3/payment-provider-admin/isolated-staging-runner.mjs`
- Modify: `tests/saas-phase3/run-current-suite.mjs`

**Interfaces:**
- Adds `payment_processing` to durable provider-definition capability.
- Adds `saas.payment_methods` and `saas.payment_method_operations`.
- Adds `saas.payment_method_list`, `save`, `set_state`, `reorder` and `recover_operation` SECURITY DEFINER functions.

- [ ] **Step 1: Write static migration tests before SQL**

Assert the up migration:

```js
assert.match(up, /payment_processing/);
assert.match(up, /CREATE TABLE saas\.payment_methods/);
assert.match(up, /UNIQUE\(store_id,id\)/);
assert.match(up, /FOREIGN KEY\(store_id,profile_id\)/);
assert.match(up, /CHECK\(state IN\('active','disabled','emergency_disabled'\)\)/);
assert.match(up, /CREATE FUNCTION saas\.payment_method_reorder/);
assert.doesNotMatch(up, /GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE)[\s\S]*payment_methods/i);
assert.doesNotMatch(up, /\b(?:pan|cvv|card_number|raw_response|api_secret)\b/i);
```

Require the down migration to raise `PAYMENT_METHOD_ADMIN_ROLLBACK_REQUIRES_DRAIN` when payment profiles or methods would be destroyed.

- [ ] **Step 2: Write the PostgreSQL harness scenarios**

The PostgreSQL 16 harness must cover:

- empty list and configuration.read/configuration.manage role matrix;
- provider method accepts only same-store active `payment_processing` profile;
- cross-store, wrong capability, disabled/revoked profile and unknown ID rejection;
- built-in kinds require null profile/provider and provider kind requires both;
- save replay, operation mismatch, stale version and commit-unknown recovery;
- active/disabled/emergency transitions and required bounded emergency reason;
- atomic reorder, exact member set, duplicate ID/position, stale version and two-writer conflict;
- list ordering by position then ID;
- direct table access denied to app/workflow/browser roles;
- legacy active `payment_setting.config.cashOnDelivery=true` migrates only the latest active record per store into one `cash_on_delivery` method;
- false/missing/malformed legacy value creates no method;
- rollback/reapply on an empty disposable database and guarded non-empty rollback.

- [ ] **Step 3: Run static and PostgreSQL tests and verify RED**

```bash
node --test tests/saas-phase3/payment-provider-admin/static-security.test.mjs
node tests/saas-phase3/payment-provider-admin/postgres-harness.mjs
```

Expected: missing 051 migration and functions.

- [ ] **Step 4: Implement additive SQL authority**

`saas.payment_methods` uses:

```sql
id uuid NOT NULL,
store_id uuid NOT NULL,
kind text NOT NULL,
profile_id uuid,
provider_code text,
label text NOT NULL,
state text NOT NULL,
emergency_reason text,
position integer NOT NULL,
config jsonb NOT NULL,
version bigint NOT NULL DEFAULT 1,
created_at timestamptz NOT NULL,
updated_at timestamptz NOT NULL,
PRIMARY KEY(id),
UNIQUE(store_id,id),
FOREIGN KEY(store_id,profile_id,provider_code)
  REFERENCES saas.merchant_provider_profiles(store_id,id,provider_code)
```

Add shape checks tying nullable profile/provider to kind, requiring emergency reason only in emergency state, bounding position to 0–9999, requiring `merchant_provider_public_config_valid(config)` and forbidding direct DML grants.

`payment_method_operations` stores `operation_id`, `store_id`, `operation_kind` in `save|set_state|reorder`, fingerprint, result payload and committed time. It is append-only.

- [ ] **Step 5: Implement exact authority functions**

All app functions call:

```sql
saas.merchant_admin_authority_error(
  p_store_id, p_principal_id, p_membership_id, p_plan_id,
  p_plan_code, p_plan_version, p_now, 'payment_setting', p_mutation
)
```

`save` locks operation then record/profile, verifies the active payment profile and capability, applies optimistic version and writes one operation result. `set_state` permits only exact transitions and reason shape. `reorder` accepts a bounded JSON array, locks all named methods in deterministic ID order, requires the exact live-method set and updates versions atomically.

- [ ] **Step 6: Migrate only legacy cash-on-delivery truth**

Use `DISTINCT ON (store_id)` ordered by `updated_at DESC,id DESC` over active `payment_setting` records. Insert one built-in method only when JSON boolean `cashOnDelivery` is exactly true. Do not parse or activate free-text `enabledMethods`.

- [ ] **Step 7: Add assertions, manifest and staging runner**

The manifest pins the complete previously approved chain plus 051 up/assertions and the 051 down checksum. The staging runner is dry-run by default; `--apply` requires:

- exact pushed source SHA;
- deployment tier `staging`;
- expected staging database sentinel;
- PostgreSQL 16;
- no recovery/read-only server;
- manifest checksum match;
- read-only preflight proving 049/050 objects and absence of 051 objects;
- successful encrypted custom-format backup before DDL;
- `psql -X -v ON_ERROR_STOP=1 --single-transaction`;
- post-apply assertions.

It must never print a connection string or secret.

- [ ] **Step 8: Run all migration gates**

```bash
node --test tests/saas-phase3/payment-provider-admin/static-security.test.mjs
node tests/saas-phase3/payment-provider-admin/postgres-harness.mjs
node tests/saas-phase3/payment-provider-admin/isolated-staging-runner.mjs --source-sha 0000000000000000000000000000000000000000 --dry-run
```

Expected: static and PostgreSQL tests PASS; the deliberately invalid source SHA dry-run exits nonzero before any connection/mutation.

- [ ] **Step 9: Register the new suite in the Phase 3 runner**

Add the static test, logo test and PostgreSQL harness after the provider-execution foundation and before the full customer-panel gate. Preserve fail-fast exit propagation and the final executed/passed totals.

- [ ] **Step 10: Commit**

```bash
git add apps/owner/scripts/sql/saas/202607270051_payment_method_admin.* apps/owner/scripts/sql/saas/phase3j-payment-method-admin-manifest.json tests/saas-phase3/payment-provider-admin
git commit -m "feat(payments): add payment method authority"
```

---

### Task 5: Implement the SaaS data repository

**Files:**
- Create: `packages/saas-data/src/payment-methods/types.ts`
- Create: `packages/saas-data/src/payment-methods/canonical.ts`
- Create: `packages/saas-data/src/payment-methods/errors.ts`
- Create: `packages/saas-data/src/payment-methods/repository.ts`
- Create: `packages/saas-data/src/payment-methods/repository.test.ts`
- Create: `packages/saas-data/src/payment-methods/index.ts`
- Modify: `packages/saas-data/src/index.ts`

**Interfaces:**
- Produces `PaymentMethodRepository` with `list`, `save`, `setState`, `reorder` and `recoverOperation`.
- Consumes only `TenantContext` and the SQL functions from Task 4.

- [ ] **Step 1: Write failing repository projection and call-shape tests**

Define the exact public inputs:

```ts
type ListPaymentMethodsInput = {
  tenantContext: TenantContext;
  now: Date;
};
type SavePaymentMethodInput = {
  tenantContext: TenantContext;
  now: Date;
  operationId: string;
  methodId: string;
  expectedVersion: number;
  kind: PaymentMethodKind;
  profileId: string | null;
  providerCode: string | null;
  label: string;
  config: Readonly<Record<string, MerchantAdminJson>>;
};
type SetPaymentMethodStateInput = {
  tenantContext: TenantContext;
  now: Date;
  operationId: string;
  methodId: string;
  expectedVersion: number;
  state: PaymentMethodState;
  emergencyReason: string | null;
};
type ReorderPaymentMethodsInput = {
  tenantContext: TenantContext;
  now: Date;
  operationId: string;
  items: readonly Readonly<{ id: string; expectedVersion: number; position: number }>[];
};
```

Assert SQL receives authority fields from `tenantContext`, not caller-supplied store IDs. Assert exact function names and parameter order.

- [ ] **Step 2: Add error and commit-unknown tests**

Lock safe codes:

```ts
[
  "invalid_input", "unauthenticated", "membership_denied", "store_inactive",
  "feature_not_enabled", "profile_not_found", "profile_not_active",
  "provider_capability_mismatch", "record_not_found", "invalid_transition",
  "version_conflict", "operation_mismatch", "operation_not_found",
  "durable_authority_invalid", "unavailable"
]
```

For a writer connection error after `save`, `setState` or `reorder`, call `payment_method_recover_operation` exactly once through an independent recovery client. Never blindly repeat the write.

- [ ] **Step 3: Run repository tests and verify RED**

```bash
node --experimental-strip-types --test packages/saas-data/src/payment-methods/repository.test.ts
```

- [ ] **Step 4: Implement canonical fingerprints and repository**

Reuse the provider-execution repository pattern: exact input object validation, canonical JSON hashing, database row count exactly one, parser-owned safe DTO and injected `writer`/`recovery` clients. Freeze all successful values.

- [ ] **Step 5: Export and run package tests**

```bash
npm test --workspace @celebix/saas-data
npm run typecheck --workspace @celebix/saas-data
```

Expected: all tests PASS with no change to existing provider execution behavior.

- [ ] **Step 6: Commit**

```bash
git add packages/saas-data
git commit -m "feat(payments): add payment method repository"
```

---

### Task 6: Add authenticated catalog and payment-method HTTP APIs

**Files:**
- Create: `apps/customer-panel/lib/server-payment-methods/runtime.ts`
- Create: `apps/customer-panel/lib/server-payment-methods/default.ts`
- Create: `apps/customer-panel/lib/payment-method-http/handler.ts`
- Create: `apps/customer-panel/lib/payment-method-http/handler.test.ts`
- Create: `apps/customer-panel/lib/payment-method-http/default.ts`
- Create: `apps/customer-panel/app/api/payment-providers/catalog/route.ts`
- Create: `apps/customer-panel/app/api/payment-methods/route.ts`
- Create: `apps/customer-panel/app/api/payment-methods/[methodId]/state/route.ts`
- Create: `apps/customer-panel/app/api/payment-methods/reorder/route.ts`
- Modify: `apps/customer-panel/lib/provider-execution-http/default.ts`
- Modify: `apps/customer-panel/lib/provider-execution-http/handler.test.ts`
- Modify: `apps/customer-panel/package.json`

**Interfaces:**
- `GET /api/payment-providers/catalog` returns `{items: PaymentProviderCatalogEntry[]}`.
- `GET /api/payment-methods` returns `{items: MerchantPaymentMethod[]}`.
- `POST /api/payment-methods` saves a built-in or profile-backed method.
- `POST /api/payment-methods/{methodId}/state` changes active/disabled/emergency state.
- `POST /api/payment-methods/reorder` atomically reorders the exact active list.

- [ ] **Step 1: Write failing authorization and input tests**

For every route test method, exact path/query, duplicate query, malformed URL, private headers, absent/invalid session, expired membership, wrong role, inactive store, exact Origin, content type, transfer encoding, declared/streamed body size and parser failure.

Catalog/list require `configuration.read`. Method mutations require `configuration.manage`. Existing provider-profile creation continues to require `integrations.manage`.

- [ ] **Step 2: Write failing behavior tests**

Require:

```ts
GET catalog -> 58 entries, all planned, no dummy, cache-control no-store
GET methods -> repository list
POST methods -> Idempotency-Key UUID and exact body
POST state -> exact method route ID, expectedVersion, state, emergencyReason
POST reorder -> 1..100 dense items, unique IDs/positions
planned provider profile save -> invalid_input/unavailable; no credential parsing
```

- [ ] **Step 3: Run focused HTTP tests and verify RED**

```bash
node --experimental-transform-types --test apps/customer-panel/lib/payment-method-http/handler.test.ts apps/customer-panel/lib/provider-execution-http/handler.test.ts
```

- [ ] **Step 4: Implement server runtime and bounded handlers**

Copy the proven request-boundary mechanics from `provider-execution-http/handler.ts`: no-store JSON, nosniff, exact Origin, private-header rejection, bounded fatal UTF-8 JSON, persistent session resolution and stable error mapping.

The runtime shape is:

```ts
export interface ServerPaymentMethodsRuntime {
  readonly access: ServerPanelAccessRuntime;
  readonly methods: PaymentMethodRepository;
  readonly catalog: readonly PaymentProviderCatalogEntry[];
}
```

Catalog data is returned only after authenticated read authorization, even though it is non-secret.

- [ ] **Step 5: Keep the executable registry fail-closed**

Leave `providerCodes: () => Object.freeze([])` in the default provider runtime. Extend only the handler tests so `payment_processing` is accepted as a capability and returns an empty definitions list. Do not add a fixture or planned provider to production registry.

- [ ] **Step 6: Add thin Next route adapters**

Each route exports only the supported method and delegates to `default.ts`. No route reads cookies, IDs, environment or database directly.

- [ ] **Step 7: Register the HTTP test in the workspace suite**

Append `lib/payment-method-http/*.test.ts` to the customer-panel `test` command without removing existing patterns.

- [ ] **Step 8: Run HTTP, route and type checks**

```bash
node --experimental-transform-types --test apps/customer-panel/lib/payment-method-http/handler.test.ts apps/customer-panel/lib/provider-execution-http/handler.test.ts
npm run typecheck --workspace @celebix/customer-panel
```

- [ ] **Step 9: Commit**

```bash
git add apps/customer-panel/lib/server-payment-methods apps/customer-panel/lib/payment-method-http apps/customer-panel/app/api/payment-providers apps/customer-panel/app/api/payment-methods apps/customer-panel/lib/provider-execution-http
git commit -m "feat(payments): add payment settings APIs"
```

---

### Task 7: Add strict browser clients and pure UI view models

**Files:**
- Create: `apps/customer-panel/lib/payment-method-ui/client.ts`
- Create: `apps/customer-panel/lib/payment-method-ui/client.test.ts`
- Create: `apps/customer-panel/lib/payment-settings-ui/model.ts`
- Create: `apps/customer-panel/lib/payment-settings-ui/model.test.ts`
- Modify: `apps/customer-panel/package.json`

**Interfaces:**
- Produces `paymentMethodApi.catalog/list/save/setState/reorder`.
- Produces `buildPaymentSettingsViewModel(catalog, definitions, profiles, methods, query, filters)`.
- Consumes existing `providerExecutionApi` for future ready-provider profile forms.

- [ ] **Step 1: Write failing client tests**

Require same-origin credentials, no-store GET, JSON POST, UUID idempotency keys and exact paths. Parse every success through shared contracts. Map only the safe server codes; malformed JSON/content type/status becomes `PaymentMethodApiError("unavailable")`.

- [ ] **Step 2: Write failing view-model tests**

Test:

- Turkish-case and accent-tolerant search across label, aliases and mode label;
- filters by category, interaction mode, readiness and environment;
- all 58 entries remain visible with empty query;
- `connectable` is true only when readiness is `production_ready` or `sandbox_ready` and an exact `payment_processing` executable descriptor exists;
- planned card never exposes credential fields or connect action;
- profile/method status labels and tones are deterministic;
- counts use real methods/profiles only;
- active checkout preview excludes disabled/emergency methods and sorts position then ID;
- every returned object/array is frozen.

- [ ] **Step 3: Run focused tests and verify RED**

```bash
node --experimental-transform-types --test apps/customer-panel/lib/payment-method-ui/client.test.ts apps/customer-panel/lib/payment-settings-ui/model.test.ts
```

- [ ] **Step 4: Implement clients**

Expose:

```ts
export function createPaymentMethodApi(
  fetcher: typeof fetch = fetch,
  uuid: () => string = crypto.randomUUID.bind(crypto),
): Readonly<{
  catalog(): Promise<readonly PaymentProviderCatalogEntry[]>;
  list(): Promise<readonly MerchantPaymentMethod[]>;
  save(input: SavePaymentMethodCommand): Promise<PaymentMethodMutationResult>;
  setState(methodId: string, input: SetPaymentMethodStateCommand): Promise<PaymentMethodMutationResult>;
  reorder(items: readonly PaymentMethodOrderCommand[]): Promise<PaymentMethodReorderResult>;
}>;
```

- [ ] **Step 5: Implement pure view-model functions**

No React, DOM, Date.now, locale default or network access belongs in `model.ts`. Accept all time/text inputs and return explicit Turkish display strings. Normalize search with `toLocaleLowerCase("tr-TR")` plus Unicode decomposition.

- [ ] **Step 6: Register client/model tests in the workspace suite**

Append `lib/payment-method-ui/*.test.ts` and `lib/payment-settings-ui/*.test.ts` to the customer-panel `test` command.

- [ ] **Step 7: Run tests and typecheck**

```bash
node --experimental-transform-types --test apps/customer-panel/lib/payment-method-ui/client.test.ts apps/customer-panel/lib/payment-settings-ui/model.test.ts
npm run typecheck --workspace @celebix/customer-panel
```

- [ ] **Step 8: Commit**

```bash
git add apps/customer-panel/lib/payment-method-ui apps/customer-panel/lib/payment-settings-ui
git commit -m "feat(payments): add payment settings client model"
```

---

### Task 8: Build the ikas-style Celebix payment settings console

**Files:**
- Create: `apps/customer-panel/components/settings/payment/PaymentSettingsConsole.tsx`
- Create: `apps/customer-panel/components/settings/payment/PaymentProviderCatalogDialog.tsx`
- Create: `apps/customer-panel/components/settings/payment/PaymentProviderConnectionDrawer.tsx`
- Create: `apps/customer-panel/components/settings/payment/PaymentMethodOrderDialog.tsx`
- Create: `apps/customer-panel/components/settings/payment/payment-settings.module.css`
- Create: `apps/customer-panel/lib/payment-settings-console.test.ts`

**Interfaces:**
- Produces `<PaymentSettingsConsole canManage={boolean} initialDialog={...} initialMethodId={...} />`.
- Uses `PanelTopbarBridge` for fixed title/actions and existing panel shell/sidebar unchanged.
- Uses only strict clients/view models from Tasks 6–7.

- [ ] **Step 1: Write failing source/behavior tests**

Require the component tree to contain:

```text
Ödeme Ayarları
Ödeme kullanılabilirliği
Önizleme ve Sıralama
Ödeme Yöntemi Ekle
Ödeme Yöntemleri
Acil Durum
Durum
```

Assert it imports `PanelTopbarBridge`, not `MerchantModuleConsole`; renders local `next/image` assets; has no ikas brand strings; has no floating-order/right-action rail; and never renders secret values from a profile DTO.

- [ ] **Step 2: Write failing interaction tests around pure seams**

Cover:

- initial concurrent catalog/definitions/profiles/method loading;
- independent loading, empty and error states;
- catalog open/close with focus restoration;
- search/filter results and 58-card visibility;
- disabled Hazırlanıyor controls;
- connection drawer only for exact executable descriptor;
- secret inputs reset after submit and never refill;
- active/disabled/emergency confirmation;
- preview reorder dirty state;
- Kaydet disabled until order changes;
- stale conflict reload path;
- canManage=false read-only behavior.

- [ ] **Step 3: Run the console test and verify RED**

```bash
node --experimental-transform-types --test apps/customer-panel/lib/payment-settings-console.test.ts
```

- [ ] **Step 4: Implement the page shell and real status card**

Use `PanelTopbarBridge` with desktop topbar actions and duplicate inline actions only at the existing mobile breakpoint. The status card derives active count, pending profile count and emergency count from loaded DTOs; it shows `Henüz yöntem yok` rather than invented availability when empty.

- [ ] **Step 5: Implement the provider catalog dialog**

Use a real modal/dialog surface with:

- heading and description IDs;
- initial focus on search;
- Escape/backdrop close only when no mutation is busy;
- focus trap and opener focus restoration;
- 48 px controls;
- cards with logo, provider/mode, category, readiness and interaction badges;
- search plus category/mode/status filters;
- disabled `Hazırlanıyor` action for all Wave 0 entries.

- [ ] **Step 6: Implement the connection drawer as a dormant reusable path**

The drawer receives an executable `MerchantProviderDescriptor`; it never invents fields from catalog metadata. Render public fields as text and credential fields as password inputs with autocomplete off. Submit through `providerExecutionApi.save` with capability `payment_processing` and display `Doğrulama bekliyor`. Because production registry is empty in Wave 0, no production catalog card can open this drawer.

- [ ] **Step 7: Implement method rows, emergency control and ordering**

Rows display logo, label, provider/mode, environment/profile status, method state and actions. Emergency action requires a bounded reason and confirmation. Ordering supports native drag/drop plus keyboard Yukarı/Aşağı controls; it posts the full exact method set once and enables Kaydet only when the sequence differs.

- [ ] **Step 8: Implement responsive/accessibility CSS**

Preserve the existing 1025 px desktop boundary, dropdown sidebar and fixed topbar. At 320 px no horizontal page overflow is allowed; the method table may become cards. Respect `prefers-reduced-motion` and visible focus. Do not use fixed right-side floating controls.

- [ ] **Step 9: Run focused checks**

```bash
node --experimental-transform-types --test apps/customer-panel/lib/payment-settings-console.test.ts apps/customer-panel/lib/payment-settings-ui/model.test.ts
npm run typecheck --workspace @celebix/customer-panel
```

- [ ] **Step 10: Commit**

```bash
git add apps/customer-panel/components/settings/payment apps/customer-panel/lib/payment-settings-console.test.ts
git commit -m "feat(panel): add payment provider settings console"
```

---

### Task 9: Wire routes and retire the generic payment editor safely

**Files:**
- Modify: `apps/customer-panel/app/settings/payment/page.tsx`
- Modify: `apps/customer-panel/app/settings/payment/new/page.tsx`
- Modify: `apps/customer-panel/app/settings/payment/[recordId]/edit/page.tsx`
- Modify: `apps/customer-panel/lib/merchant-admin-console.test.ts`
- Modify: `apps/customer-panel/lib/routes.test.ts`
- Modify: `apps/customer-panel/lib/merchant-admin-ui/route-behavior.test.ts`
- Modify: `apps/customer-panel/lib/merchant-admin-ui/presentation.ts`

**Interfaces:**
- `/settings/payment` renders the dedicated console.
- Legacy new/edit URLs redirect to safe query-selected dialog states on `/settings/payment`.

- [ ] **Step 1: Write failing route/source tests**

Require:

```ts
/settings/payment -> PaymentSettingsConsole
/settings/payment/new -> redirect("/settings/payment?dialog=provider-catalog")
/settings/payment/[recordId]/edit -> redirect("/settings/payment?method=<validated UUID>")
```

Invalid legacy record ID redirects to `/settings/payment` without reflecting input. Remove payment from generic console/editor expectations while leaving historical `payment_setting` contract and list data untouched.

- [ ] **Step 2: Run route tests and verify RED**

```bash
node --experimental-transform-types --test apps/customer-panel/lib/merchant-admin-console.test.ts apps/customer-panel/lib/routes.test.ts apps/customer-panel/lib/merchant-admin-ui/route-behavior.test.ts
```

- [ ] **Step 3: Implement route wiring**

The payment page still calls `requireServerPanelAccess()`, accepts Next's promised `searchParams`, allows only the exact query shapes `dialog=provider-catalog` and `method=<lowercase UUID>`, and derives:

```ts
const canManage =
  isMerchantActionAllowed(tenantContext.membership.role, "configuration.manage") &&
  isMerchantActionAllowed(tenantContext.membership.role, "integrations.manage");
```

Pass only the boolean plus the validated `initialDialog`/`initialMethodId` resource hints to the client component. Do not serialize `TenantContext`. The client opens the requested surface only after its authenticated method/catalog load proves the hinted resource exists; an unknown method hint is cleared without disclosure.

- [ ] **Step 4: Update generic presentation compatibility copy**

Keep `payment_setting` parsing for legacy rows, but change its notice to explain that historical settings are shown through the dedicated payment page. Do not expose generic create/edit buttons for this kind.

- [ ] **Step 5: Run route and complete customer-panel tests**

```bash
npm test --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/customer-panel
```

- [ ] **Step 6: Commit**

```bash
git add apps/customer-panel/app/settings/payment apps/customer-panel/lib/merchant-admin-console.test.ts apps/customer-panel/lib/routes.test.ts apps/customer-panel/lib/merchant-admin-ui
git commit -m "feat(panel): activate dedicated payment settings"
```

---

### Task 10: Whole-slice security, regression and visual verification

**Files:**
- Modify only test allowlists proven necessary by the exact new modules.
- Create evidence only under pre-existing untracked `.codex-evidence/payment-provider-admin/`; never commit it.

**Interfaces:**
- Produces a clean, reviewable code-complete SHA with provider calls 0 and production mutations 0.

- [ ] **Step 1: Run focused suites**

```bash
npm test --workspace @celebix/saas-contracts
npm test --workspace @celebix/saas-data
npm test --workspace @celebix/customer-panel
node --test tests/saas-phase3/payment-provider-admin/static-security.test.mjs tests/saas-phase3/payment-provider-admin/logo-assets.test.mjs
node tests/saas-phase3/payment-provider-admin/postgres-harness.mjs
```

- [ ] **Step 2: Run typechecks and production builds**

```bash
npm run typecheck --workspace @celebix/saas-contracts
npm run typecheck --workspace @celebix/saas-data
npm run typecheck --workspace @celebix/customer-panel
npm run build --workspace @celebix/customer-panel
```

- [ ] **Step 3: Run repository regressions**

```bash
npm run test:saas-phase3:current
git diff --check
```

Expected: Phase 3 suite, diff check and all workspace gates PASS.

- [ ] **Step 4: Run static safety scans**

Check:

```bash
git diff --name-only 6ccca303cd7b9189f8383c6d5ef77aab67033c20...HEAD -- apps/admin apps/storefront-base deploy infra infrastructure
git diff 6ccca303cd7b9189f8383c6d5ef77aab67033c20...HEAD | rg -n \"(BEGIN (?:RSA |EC )?PRIVATE KEY|card_number|\\bCVV\\b|api[_-]?(?:key|secret)\\s*[:=]\\s*['\\\"]?[A-Za-z0-9_-]{16,})\"
rg -n "https?://" apps/customer-panel/public/payment-providers apps/customer-panel/lib/payment-providers/logo-manifest.json
```

Expected: donor/deploy diff 0; secret/PAN scan 0; no remote logo URL in asset files or runtime manifest. `logo-sources.json` is the only intentional source-URL record.

- [ ] **Step 5: Verify desktop and mobile in a local browser**

Start the panel with its approved local test runtime. Verify at 1440 x 900 and 390 x 844:

- fixed title/actions;
- existing dropdown sidebar;
- all 58 provider variants discoverable;
- 48 family logos and fallbacks;
- filters and empty result;
- Hazırlanıyor disabled behavior;
- existing migrated cash-on-delivery method when fixture data enables it;
- emergency confirmation;
- preview/reorder dirty state;
- Escape, Tab loop, focus restoration and reduced motion;
- no right floating buttons and no horizontal overflow.

Save screenshots under `.codex-evidence/payment-provider-admin/`.

- [ ] **Step 6: Review the diff and repair findings**

Inspect every new source and SQL file against the approved design. Re-run the smallest affected RED/GREEN test after each repair, then repeat Steps 1–4.

- [ ] **Step 7: Commit verification-only repairs**

```bash
git add --update
git status --short
git commit -m "test(payments): verify provider admin foundation"
```

Do not add `.codex-evidence/`. If there are no tracked repairs, do not create an empty commit.

---

### Task 11: Push, migrate isolated staging, deploy Coolify and verify live panel

**Files:**
- No source changes expected.
- Evidence remains untracked under `.codex-evidence/payment-provider-admin/staging/`.

**Interfaces:**
- Consumes the exact clean code-complete SHA from Task 10.
- Produces branch/remote parity, isolated staging schema 051, a successful Coolify panel deployment and live read-only/browser evidence.

- [ ] **Step 1: Pin and push the exact candidate**

```bash
git status --short
git rev-parse HEAD
git push origin HEAD
git rev-parse HEAD
git ls-remote origin refs/heads/codex/celebix-managed-umami-analytics
```

Expected: only pre-existing `.codex-evidence/` is untracked; local and remote SHA match exactly; no force push.

- [ ] **Step 2: Run isolated-staging migration dry-run**

Set `SOURCE_SHA` to the proven 40-character HEAD and run:

```bash
node tests/saas-phase3/payment-provider-admin/isolated-staging-runner.mjs --source-sha "$SOURCE_SHA" --dry-run
```

Expected: checksum, PostgreSQL 16, staging sentinel, current 049/050 authority and 051 absence all PASS; no mutation.

- [ ] **Step 3: Back up and apply migration 051 to isolated staging**

Run the same runner with `--apply`. It must create the protected custom-format backup first, apply only 051 in one transaction and pass `202607270051_payment_method_admin_assertions.sql`. Abort on any identity, checksum, preflight or backup failure.

- [ ] **Step 4: Trigger the existing Coolify customer-panel application**

Resolve the application read-only inside project `fy34knkv8p3d73ksirgcsgg6` and environment `yv44k7b9mhn6edakw9nw6b32` by exact domain `panel.saas-staging.celebix.site`. Assert its repository branch points to `codex/celebix-managed-umami-analytics` and deployed candidate equals `SOURCE_SHA`, then trigger the existing deploy using stored credentials without printing them.

- [ ] **Step 5: Poll deployment and health**

Wait for terminal deployment success and verify:

```text
https://panel.saas-staging.celebix.site/api/health -> 200
unauthenticated /api/payment-providers/catalog -> 401
unauthenticated /api/payment-methods -> 401
```

Any build/runtime failure triggers rollback to the previously proven application SHA `6ccca303cd7b9189f8383c6d5ef77aab67033c20`; the additive schema remains because the old binary ignores it.

- [ ] **Step 6: Verify the authenticated live UI and leave it open**

Using the user's existing authenticated browser session, open `https://panel.saas-staging.celebix.site/settings/payment` and verify the same desktop/mobile checklist from Task 10. Confirm all catalog cards are truthful `Hazırlanıyor` and no provider connection can be submitted. Leave the payment page open for the user after the final browser action.

- [ ] **Step 7: Report exact outcome**

Report:

```text
branch/local/remote SHA
migration 051 backup/apply/assertion result
Coolify deployment ID and terminal status
health/auth/API results
catalog entry count 58
logo family count 48
provider network calls 0
real credentials accepted 0
production impact 0
apps/admin diff 0
```

Do not claim any payment provider is operational. Wave 1 begins with a separately reviewed hosted-provider plan, starting from the existing PayTR checkout path and official provider documentation.
