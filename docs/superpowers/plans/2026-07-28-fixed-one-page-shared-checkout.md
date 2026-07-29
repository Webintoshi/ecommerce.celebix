# Fixed One-Page Shared Checkout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Shopify-parity, single-page `/odeme` checkout that is owned by `apps/storefront-shared`, uses only self-hosted PostgreSQL authority, and renders identically for every Celebix tenant and theme.

**Architecture:** The existing exact-host runtime and `__Host-celebix_cart` credential remain the public authority boundary. A new PostgreSQL checkout projection and mutation API extends the durable abandoned-cart foundation, creates built-in orders directly, and creates hosted-payment attempts plus inventory reservations atomically for PayTR/iyzico. The checkout page and its CSS are isolated platform components; theme code supplies only product/variant IDs and quantities through the existing same-origin cart capture route.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.9, Node test runner, PostgreSQL 16, `pg`, existing `@celebix/saas-contracts`, `@celebix/saas-data`, `@celebix/payment-adapters`, CSS Modules, Playwright/browser acceptance harnesses, Coolify.

## Global Constraints

- Self-hosted PostgreSQL is the only durable authority; production checkout code must not import or call Supabase.
- Database access stays server-only behind `CELEBIX_SAAS_DATABASE_URL`; no connection string, database role, provider secret, sealed credential, tenant ID, or store ID is browser-visible.
- `/odeme` is platform-owned and must not import theme components, theme CSS, theme fonts, theme layout state, or legacy `apps/storefront-base` checkout code.
- The checkout shell, spacing, colors, typography, responsive layout, field order, validation behavior, errors, loading states, and result states are identical across tenants and themes.
- Tenant-variable values are limited to store name/safe logo fallback, canonical cart data, currency/locale, active shipping and payment methods, instructions, and policy links.
- One store may expose at most one active online provider; active `cash_on_delivery` and `bank_transfer` methods may coexist with it.
- Card data is never collected or persisted by Celebix checkout; PayTR and iyzico use the existing hosted iframe/redirect adapter boundary.
- Browser-supplied prices, totals, shipping fees, discounts, provider codes, payment status, and tenant authority are ignored or rejected.
- Every write is exact-input, same-origin, idempotent, replay-safe, and recoverable after an unknown commit result.
- Provider failure, callback replay, duplicate submit, or recovery ambiguity must never create a second order or synthetic paid state.
- New PostgreSQL DDL is additive and targets PostgreSQL 16 with preflight, assertions, ACL/RLS checks, forward-only data safety, and a guarded down migration.
- Checkout responses are `no-store`, `noindex`, `no-referrer`, `nosniff`, and protected by the existing nonce/CSP and trusted-host boundary.
- Analytics must not contain name, e-mail, phone, address, IBAN, card fields, provider bodies, or credentials.
- Legacy quick-order routes remain operational and their contracts remain unchanged.
- Use red-green-refactor for every task and make the exact commit listed at the end of each task only after its focused tests pass.
- Preserve the existing untracked `.codex-evidence/` and `apps/customer-panel/docs/` trees; never stage them.

## File Structure

### Shared contracts

- `packages/saas-contracts/src/checkout/types.ts` — public quote, address, shipping, payment-method, submit, and status DTOs.
- `packages/saas-contracts/src/checkout/validation.ts` — exact parsers and canonical bounds for all browser-visible checkout DTOs.
- `packages/saas-contracts/src/checkout/index.ts` — checkout exports.
- `packages/saas-contracts/src/checkout/checkout.test.ts` — hostile-object, arithmetic, and union coverage.
- `packages/saas-contracts/src/index.ts` — additive checkout exports.

### PostgreSQL data adapter

- `packages/saas-data/src/storefront-checkout/errors.ts` — finite public checkout repository errors.
- `packages/saas-data/src/storefront-checkout/types.ts` — repository inputs and private hosted-payment authority.
- `packages/saas-data/src/storefront-checkout/validation.ts` — exact repository input validation.
- `packages/saas-data/src/storefront-checkout/repository.ts` — PostgreSQL function calls, parsing, transactions, and commit-unknown recovery.
- `packages/saas-data/src/storefront-checkout/repository.test.ts` — SQL signature, result parsing, replay, and corruption tests.
- `packages/saas-data/src/storefront-checkout/index.ts` — repository exports.
- `packages/saas-data/src/index.ts` — additive exports.

### Database migration and proof

- `apps/owner/scripts/sql/saas/202607280064_storefront_one_page_checkout.up.sql` — checkout projection, shipping/discount authority, built-in order placement, hosted bridge, reservation settlement, ACLs, and preflight.
- `apps/owner/scripts/sql/saas/202607280064_storefront_one_page_checkout.down.sql` — guarded rollback to the verified platform state before migration 064.
- `apps/owner/scripts/sql/saas/202607280064_storefront_one_page_checkout_assertions.sql` — immutable schema/function/ACL/preflight assertions.
- `tests/saas-phase3/storefront-one-page-checkout/postgres-harness.mjs` — disposable PostgreSQL 16 tenant, race, replay, stock, discount, shipping, built-in, and hosted settlement proof.
- `tests/saas-phase3/storefront-one-page-checkout/static-security.test.mjs` — banned import, exact route, migration, response-header, and theme-isolation checks.

### Checkout runtime and routes

- `apps/storefront-shared/lib/checkout/public-checkout.ts` — quote/address/submit/status orchestration independent of Next.js.
- `apps/storefront-shared/lib/checkout/public-checkout.test.ts` — route-independent orchestration tests.
- `apps/storefront-shared/lib/checkout/request.ts` — bounded JSON/form parsing, origin and cookie authority.
- `apps/storefront-shared/lib/checkout/request.test.ts` — hostile bodies, private headers, content length, and origin tests.
- `apps/storefront-shared/lib/checkout/hosted-cart-payment.ts` — normal-cart bridge to the existing hosted payment runtime.
- `apps/storefront-shared/lib/checkout/hosted-cart-payment.test.ts` — PayTR/iyzico handoff and failure/recovery tests.
- `apps/storefront-shared/lib/default-runtime.ts` — construct the checkout repository, require migration 064 preflight, and expose hosted execution.
- `apps/storefront-shared/app/api/checkout/quote/route.ts` — canonical quote GET.
- `apps/storefront-shared/app/api/checkout/delivery/route.ts` — delivery/shipping/discount POST.
- `apps/storefront-shared/app/api/checkout/submit/route.ts` — built-in or hosted submit POST.
- `apps/storefront-shared/app/api/checkout/status/route.ts` — canonical order/payment status GET.

### Fixed platform UI

- `apps/storefront-shared/app/odeme/page.tsx` — server entry, metadata, initial quote, and empty/unavailable state.
- `apps/storefront-shared/app/odeme/sonuc/page.tsx` — status result shell.
- `apps/storefront-shared/app/politikalar/[policyType]/page.tsx` — platform-owned active policy page used by checkout footer links.
- `apps/storefront-shared/app/odeme/checkout.module.css` — isolated Shopify-parity desktop/mobile tokens and layout.
- `apps/storefront-shared/components/checkout/CheckoutClient.tsx` — one-page state machine and accessible form.
- `apps/storefront-shared/components/checkout/OrderSummary.tsx` — desktop sticky/mobile disclosure summary.
- `apps/storefront-shared/components/checkout/DeliverySection.tsx` — contact, delivery, billing, and shipping fields.
- `apps/storefront-shared/components/checkout/PaymentSection.tsx` — provider, bank transfer, COD, consent, and submit UI.
- `apps/storefront-shared/components/checkout/model.ts` — pure reducer, money, payload, and finite error mapping.
- `apps/storefront-shared/components/checkout/model.test.ts` — reducer, stale quote, pending, and error tests.
- `apps/storefront-shared/public/payment-providers/paytr.svg` — verified existing PayTR logo asset.
- `apps/storefront-shared/public/payment-providers/iyzico.svg` — verified existing iyzico logo asset.

### Narrow shipping configuration dependency

- `apps/customer-panel/lib/merchant-admin-ui/presentation.ts` — add `flatRateCents` to `shipping_setting` fields.
- `apps/customer-panel/lib/merchant-admin-ui/presentation.test.ts` — assert exact shipping fields.
- Migration 064 updates `saas.merchant_admin_config_valid` to accept and validate `flatRateCents` without broadening unrelated settings.

### Browser acceptance and rollout

- `tests/saas-phase3/storefront-one-page-checkout/browser-acceptance.mjs` — 1280px and 390px interaction/visual contract.
- `tests/saas-phase3/storefront-one-page-checkout/browser-fixture.mjs` — local deterministic fixture runtime with no secrets.
- `apps/storefront-shared/package.json` — include checkout model tests in the workspace test script.
- `docs/ops/storefront-one-page-checkout-rollout.md` — migration, backup, feature flag, Coolify, smoke, rollback, and incident commands.

---

### Task 1: Add exact public checkout contracts

**Files:**
- Create: `packages/saas-contracts/src/checkout/types.ts`
- Create: `packages/saas-contracts/src/checkout/validation.ts`
- Create: `packages/saas-contracts/src/checkout/index.ts`
- Create: `packages/saas-contracts/src/checkout/checkout.test.ts`
- Modify: `packages/saas-contracts/src/index.ts`

**Interfaces:**
- Consumes: existing `PaymentMethodKind` semantics from `packages/saas-contracts/src/payment-providers/types.ts`.
- Produces: `CheckoutQuote`, `CheckoutAddress`, `CheckoutDeliveryInput`, `CheckoutSubmitInput`, `CheckoutPaymentMethod`, `CheckoutSubmissionResult`, `CheckoutStatus`, `CheckoutHttpError`, and exact parsers used by Tasks 3–8.

- [ ] **Step 1: Write failing contract tests for exact public DTOs**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  parseCheckoutDeliveryInput,
  parseCheckoutQuote,
  parseCheckoutSubmitInput,
  parseCheckoutStatus,
} from "./index.ts";

test("checkout quote enforces exact money arithmetic and one provider", () => {
  const quote = quoteFixture();
  assert.equal(parseCheckoutQuote(quote).totalCents, 12_900);
  assert.throws(() => parseCheckoutQuote({ ...quote, totalCents: 12_901 }));
  assert.throws(() => parseCheckoutQuote({
    ...quote,
    paymentMethods: [...quote.paymentMethods, providerMethod("iyzico_iframe")],
  }));
});

test("checkout inputs reject browser authority and hostile objects", () => {
  assert.throws(() => parseCheckoutSubmitInput({
    ...submitFixture(), storeId: "11111111-1111-4111-8111-111111111111",
  }));
  const hostile = Object.create({ cartVersion: 1 });
  Object.assign(hostile, submitFixture());
  assert.throws(() => parseCheckoutSubmitInput(hostile));
});
```

- [ ] **Step 2: Run the contract test and verify red**

Run: `node --experimental-strip-types --test packages/saas-contracts/src/checkout/checkout.test.ts`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `./index.ts`.

- [ ] **Step 3: Define the exact DTOs**

```ts
export type CheckoutAddress = Readonly<{
  firstName: string;
  lastName: string;
  company?: string;
  line1: string;
  line2?: string;
  district: string;
  city: string;
  postalCode?: string;
  countryCode: "TR";
  phone: string;
}>;

export type CheckoutPaymentMethod =
  | Readonly<{ id: string; kind: "provider"; label: string; providerCode: "paytr_iframe" | "iyzico_iframe"; logoPath: string }>
  | Readonly<{ id: string; kind: "cash_on_delivery"; label: string; instructions: string }>
  | Readonly<{ id: string; kind: "bank_transfer"; label: string; bankName: string; accountHolder: string; iban: string; instructions: string }>;

export type CheckoutPolicyLink = Readonly<{
  policyType: "distance_sales" | "pre_information" | "privacy" | "returns" | "shipping";
  label: string;
  href: string;
}>;

export type CheckoutPolicy = Readonly<{
  policyType: CheckoutPolicyLink["policyType"];
  label: string;
  body: string;
  effectiveAt: string;
}>;

export type CheckoutQuote = Readonly<{
  schemaVersion: 1;
  cartId: string;
  cartVersion: number;
  checkoutNonce: string;
  storeName: string;
  currency: "TRY";
  locale: "tr";
  items: readonly CheckoutQuoteItem[];
  shippingOptions: readonly CheckoutShippingOption[];
  selectedShippingId: string | null;
  paymentMethods: readonly CheckoutPaymentMethod[];
  policyLinks: readonly CheckoutPolicyLink[];
  subtotalCents: number;
  shippingCents: number;
  discountCents: number;
  totalCents: number;
  discountCode: string | null;
}>;
```

Define `CheckoutDeliveryInput` with exact keys `cartVersion`, `checkoutNonce`, `operationId`, `email`, `marketingOptIn`, `shippingAddress`, `billingAddress`, `shippingId`, and `discountCode`. Define `CheckoutSubmitInput` with exact keys `cartVersion`, `checkoutNonce`, `operationId`, `paymentMethodId`, and `consents`. Define result unions:

```ts
export type CheckoutSubmissionResult =
  | Readonly<{ kind: "placed"; orderNumber: string; statusPath: string }>
  | Readonly<{ kind: "hosted"; location: string }>;

export type CheckoutHttpError =
  | "invalid_input" | "origin_denied" | "cart_not_found" | "cart_changed"
  | "discount_invalid" | "stock_unavailable" | "payment_unavailable"
  | "processing" | "unavailable";

export type CheckoutStatus =
  | Readonly<{ kind: "ready" }>
  | Readonly<{ kind: "processing"; orderNumber: string }>
  | Readonly<{ kind: "placed"; orderNumber: string; paymentStatus: "pending"; method: Extract<CheckoutPaymentMethod, { kind: "cash_on_delivery" | "bank_transfer" }> }>
  | Readonly<{ kind: "paid"; orderNumber: string }>
  | Readonly<{ kind: "failed"; orderNumber: string }>;
```

- [ ] **Step 4: Implement exact parsers and canonical bounds**

Use descriptor-safe own-property reads. Reject proxies, accessors, inherited keys, sparse arrays, unknown keys, control characters, non-canonical UUIDs, non-safe integers, and inconsistent arithmetic. Enforce:

```ts
const MAX_ITEMS = 100;
const MAX_COMPONENT_CENTS = 500_000_000_000_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const OPERATION_ID = UUID;
const NONCE = /^[A-Za-z0-9_-]{43}$/;
const LOGO = /^\/payment-providers\/(?:paytr|iyzico)\.svg$/;
```

`parseCheckoutQuote` must require `totalCents === subtotalCents + shippingCents - discountCents`, no more than one `kind: "provider"`, and policy hrefs matching `/politikalar/(?:distance_sales|pre_information|privacy|returns|shipping)`. `parseCheckoutDeliveryInput` must require `billingAddress === null` or a separately valid address. `parseCheckoutSubmitInput` must accept only consent keys `distanceSales` and `preInformation`, both `true`.

- [ ] **Step 5: Run focused and package contract tests**

Run: `node --experimental-strip-types --test packages/saas-contracts/src/checkout/checkout.test.ts`

Expected: PASS.

Run: `npm test --workspace @celebix/saas-contracts`

Expected: all contract tests PASS.

- [ ] **Step 6: Commit the contract slice**

```bash
git add packages/saas-contracts/src/checkout packages/saas-contracts/src/index.ts
git commit -m "feat(checkout): add public checkout contracts"
```

### Task 2: Make the existing shipping setting checkout-ready

**Files:**
- Modify: `apps/customer-panel/lib/merchant-admin-ui/presentation.ts`
- Modify: `apps/customer-panel/lib/merchant-admin-ui/presentation.test.ts`
- Covered by migration files created in Task 3.

**Interfaces:**
- Consumes: existing `shipping_setting` merchant-admin record.
- Produces: exact active configuration `{ regions, flatRateCents, freeShippingThresholdCents, estimatedDays }` read by the PostgreSQL quote function in Task 3.

- [ ] **Step 1: Add a failing field-definition test**

```ts
test("shipping settings expose the exact checkout rate fields", () => {
  const shipping = MERCHANT_MODULE_DEFINITIONS.find((entry) => entry.kind === "shipping_setting");
  assert.deepEqual(shipping?.fields.map((field) => field.key), [
    "regions",
    "flatRateCents",
    "freeShippingThresholdCents",
    "estimatedDays",
  ]);
});
```

- [ ] **Step 2: Run the focused customer-panel test and verify red**

Run: `node --experimental-transform-types --test apps/customer-panel/lib/merchant-admin-ui/presentation.test.ts`

Expected: FAIL because `flatRateCents` is absent.

- [ ] **Step 3: Add the bounded flat-rate field**

Change only the `shipping_setting` definition:

```ts
definition({
  kind: "shipping_setting",
  family: "settings",
  route: "/settings/shipping",
  title: "Kargo Ayarları",
  singular: "kargo profili",
  description: "Teslimat bölgeleri, sabit ücret ve ücretsiz kargo eşiğini yönetin.",
  fields: [
    field("regions", "Teslimat bölgeleri", "textarea"),
    field("flatRateCents", "Standart kargo ücreti (kuruş)", "number"),
    field("freeShippingThresholdCents", "Ücretsiz kargo eşiği (kuruş)", "number"),
    field("estimatedDays", "Tahmini gün", "number"),
  ],
}),
```

- [ ] **Step 4: Run focused and customer-panel tests**

Run: `node --experimental-transform-types --test apps/customer-panel/lib/merchant-admin-ui/presentation.test.ts`

Expected: PASS.

Run: `npm test --workspace @celebix/customer-panel`

Expected: all customer-panel tests PASS.

- [ ] **Step 5: Commit the shipping configuration slice**

```bash
git add apps/customer-panel/lib/merchant-admin-ui/presentation.ts apps/customer-panel/lib/merchant-admin-ui/presentation.test.ts
git commit -m "feat(shipping): expose checkout flat rate"
```

### Task 3: Add PostgreSQL quote, delivery, discount, and payment-method authority

**Files:**
- Create: `apps/owner/scripts/sql/saas/202607280064_storefront_one_page_checkout.up.sql`
- Create: `apps/owner/scripts/sql/saas/202607280064_storefront_one_page_checkout.down.sql`
- Create: `apps/owner/scripts/sql/saas/202607280064_storefront_one_page_checkout_assertions.sql`
- Create: `tests/saas-phase3/storefront-one-page-checkout/postgres-harness.mjs`

**Interfaces:**
- Consumes: `saas.abandoned_carts`, `saas.abandoned_cart_items`, `saas.payment_methods`, `saas.merchant_provider_profiles`, `saas.merchant_admin_records`, `saas.products`, `saas.product_variants`, and exact-host functions.
- Produces: `saas.storefront_checkout_get_quote`, `saas.storefront_checkout_issue_nonce`, `saas.storefront_checkout_update_delivery`, `saas.storefront_checkout_get_status`, `saas.storefront_checkout_get_policy`, `saas.storefront_checkout_preflight`, and durable operation/state tables consumed by Task 4.

- [ ] **Step 1: Write the failing PostgreSQL harness scenarios**

The harness must create disposable PostgreSQL 16 databases and prove these exact results:

```js
assert.equal(quote(STORE_A, CART_A).storeName, "Store A");
assert.equal(quote(STORE_A, CART_A).shippingOptions[0].priceCents, 2_500);
assert.equal(quote(STORE_A, CART_A).paymentMethods.filter((m) => m.kind === "provider").length, 1);
assert.equal(quote(STORE_A, CART_A).paymentMethods.some((m) => m.kind === "bank_transfer"), true);
assert.equal(quote(STORE_A, CART_A).paymentMethods.some((m) => m.kind === "cash_on_delivery"), true);
assert.equal(invokeQuote(HOST_B, CART_A_DIGEST).outcome, "not_found");
assert.equal(updateDelivery({ expectedVersion: 99 }).outcome, "version_conflict");
assert.equal(applyDiscount("YAZ10").discountCents, 1_000);
assert.equal(applyDiscount("EXPIRED").outcome, "discount_invalid");
```

Also assert one active provider filtering, emergency-disable exclusion, active settings only, price/stock revalidation, unknown keys, wrong host, wrong credential, invalid address, duplicate operation replay, operation mismatch, and concurrent delivery update serialization.

- [ ] **Step 2: Run the harness and verify red**

Run: `node tests/saas-phase3/storefront-one-page-checkout/postgres-harness.mjs`

Expected: FAIL because migration 064 does not exist.

- [ ] **Step 3: Add checkout state and operation tables**

Migration 064 must add checkout fields to the existing cart authority and create immutable operations:

```sql
ALTER TABLE saas.abandoned_carts
  ADD COLUMN marketing_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN shipping_address jsonb,
  ADD COLUMN billing_address jsonb,
  ADD COLUMN shipping_method_code text,
  ADD COLUMN shipping_cents bigint NOT NULL DEFAULT 0,
  ADD COLUMN discount_record_id uuid,
  ADD COLUMN discount_code text,
  ADD COLUMN checkout_nonce_digest character(64),
  ADD COLUMN selected_payment_method_id uuid;

ALTER TABLE saas.abandoned_carts
  DROP CONSTRAINT abandoned_carts_total_check,
  ADD CONSTRAINT abandoned_carts_total_check CHECK (
    total_cents = subtotal_cents + shipping_cents - discount_cents
    AND total_cents >= 0
  );

CREATE TABLE saas.storefront_checkout_operations(
  operation_id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  cart_id uuid NOT NULL,
  action text NOT NULL CHECK(action IN('delivery','submit_builtin','submit_hosted')),
  fingerprint character(64) NOT NULL,
  result_payload jsonb NOT NULL,
  committed_at timestamptz NOT NULL,
  UNIQUE(store_id,cart_id,operation_id),
  FOREIGN KEY(store_id,cart_id) REFERENCES saas.abandoned_carts(store_id,id) ON DELETE RESTRICT
);
```

Reuse the existing `customer_email`, `customer_name`, and `customer_phone` columns for contact data. Add exact checks for address JSON, non-negative money, canonical uppercase discount code, nonce digest, and a composite `(store_id,selected_payment_method_id)` payment-method FK. Enable and force RLS. Table DML is denied to runtime roles; only security-definer functions receive EXECUTE.

- [ ] **Step 4: Extend strict shipping setting validation**

`saas.merchant_admin_config_valid('shipping_setting', config)` must allow only `regions`, `flatRateCents`, `freeShippingThresholdCents`, and `estimatedDays`. Existing active records without `flatRateCents` remain valid and resolve to a truthful 0-cent standard method. When the fields are present, require:

```sql
(
  NOT config ? 'flatRateCents' OR (
    pg_catalog.jsonb_typeof(config->'flatRateCents')='number'
    AND (config->>'flatRateCents')::numeric=pg_catalog.trunc((config->>'flatRateCents')::numeric)
    AND (config->>'flatRateCents')::numeric BETWEEN 0 AND 500000000000000
  )
)
AND (NOT config ? 'freeShippingThresholdCents' OR (
  pg_catalog.jsonb_typeof(config->'freeShippingThresholdCents')='number'
  AND (config->>'freeShippingThresholdCents')::numeric BETWEEN 0 AND 500000000000000
))
AND (NOT config ? 'estimatedDays' OR (
  pg_catalog.jsonb_typeof(config->'estimatedDays')='number'
  AND (config->>'estimatedDays')::numeric BETWEEN 1 AND 90
));
```

If no active shipping setting exists, quote a single `standard` method at 0 cents and label it `Ücretsiz standart teslimat`; do not invent a paid rate.

- [ ] **Step 5: Implement canonical quote projection**

Create `saas.storefront_checkout_get_quote(p_hostname text,p_credential_digest text,p_now timestamptz)` returning `(outcome text,result_payload jsonb)`. It must:

1. Resolve only an active exact host.
2. Find an active/recovered cart by credential digest.
3. Lock nothing because this is a stable read.
4. Re-read products, variants, effective prices, media, available stock minus held reservations, shipping setting, discount record, and active payment methods.
5. Return at most one provider method and any active built-ins in merchant position order.
6. Generate no secret or sealed material.
7. Expose provider logos only as `/payment-providers/paytr.svg` or `/payment-providers/iyzico.svg`.
8. Return no nonce credential from quote SQL; the repository generates it and `saas.storefront_checkout_issue_nonce` stores/verifies only its digest.
9. Project active policy records only as fixed platform paths; policy bodies are returned only by `saas.storefront_checkout_get_policy`.

The safe JSON projection uses these keys exactly:

```sql
pg_catalog.jsonb_build_object(
  'schemaVersion',1,'cartId',cart.id,'cartVersion',cart.version,
  'storeName',store.name,'currency',store.currency,'locale','tr',
  'items',items_json,'shippingOptions',shipping_json,
  'selectedShippingId',cart.shipping_method_code,
  'paymentMethods',methods_json,
  'policyLinks',policy_links_json,
  'subtotalCents',subtotal,'shippingCents',shipping,
  'discountCents',discount,'totalCents',subtotal+shipping-discount,
  'discountCode',cart.discount_code
)
```

- [ ] **Step 6: Implement delivery/discount mutation and recovery**

Create `saas.storefront_checkout_issue_nonce` with hostname, credential digest, new nonce digest, and timestamp. It locks the latest active/recovered cart, replaces the nonce digest, increments version, and returns the canonical quote without exposing the digest. Issuing a new nonce intentionally invalidates an older tab for the same cart credential.

Create `saas.storefront_checkout_update_delivery` with hostname, credential digest, expected version, operation ID, fingerprint, current nonce digest, next nonce digest, e-mail, marketing flag, shipping/billing address JSON, shipping code, discount code, and timestamp. Acquire locks in order: operation advisory lock → cart → discount row → products by ID → variants by ID. On success, store canonical values, rotate to the next nonce digest, increment cart version, persist the replay projection, and return `updated`. Return finite outcomes `not_found`, `invalid_input`, `version_conflict`, `discount_invalid`, `stock_unavailable`, `operation_mismatch`, and `operation_replayed`.

Create `saas.storefront_checkout_recover_operation(p_hostname,p_credential_digest,p_operation_id,p_fingerprint,p_now)` and verify host/cart binding before returning a replay.

- [ ] **Step 7: Implement canonical status and preflight**

`saas.storefront_checkout_get_status` must return only `ready`, `processing`, `placed`, `paid`, or `failed` and public order number. A `placed` built-in result also returns the selected method's safe customer instructions and, for bank transfer, bank name/account holder/IBAN; it returns no provider profile or credential. `saas.storefront_checkout_get_policy` accepts exact host, a finite policy type, and timestamp, then returns only the latest active policy label/body/effective time for that store. `saas.storefront_checkout_preflight()` must prove required columns, constraints, functions, trigger bindings, owner roles, forced RLS, exact grants, and compatibility with migrations 058–063.

- [ ] **Step 8: Write guarded down migration and assertions**

The down migration must refuse when any cart has checkout state, any checkout operation exists, any checkout bridge exists, or any order points to a storefront cart. It must restore the original `abandoned_carts_total_check` formula `total_cents = subtotal_cents - discount_cents`, restore the prior `merchant_admin_config_valid` definition without `flatRateCents`, then remove only migration-064 functions, triggers, tables, constraints, and columns.

- [ ] **Step 9: Run PostgreSQL harness and static migration assertions**

Run: `node tests/saas-phase3/storefront-one-page-checkout/postgres-harness.mjs`

Expected: PASS including race and rollback databases.

Run: `psql "$CELEBIX_SAAS_DATABASE_URL" -v ON_ERROR_STOP=1 -f apps/owner/scripts/sql/saas/202607280064_storefront_one_page_checkout_assertions.sql`

Expected: exit 0 only against an explicitly approved disposable/staging database; do not run this command against production during implementation.

- [ ] **Step 10: Commit quote and delivery authority**

```bash
git add apps/owner/scripts/sql/saas/202607280064_storefront_one_page_checkout.* tests/saas-phase3/storefront-one-page-checkout/postgres-harness.mjs
git commit -m "feat(checkout): add postgres quote authority"
```

### Task 4: Add the typed PostgreSQL checkout repository

**Files:**
- Create: `packages/saas-data/src/storefront-checkout/errors.ts`
- Create: `packages/saas-data/src/storefront-checkout/types.ts`
- Create: `packages/saas-data/src/storefront-checkout/validation.ts`
- Create: `packages/saas-data/src/storefront-checkout/repository.ts`
- Create: `packages/saas-data/src/storefront-checkout/repository.test.ts`
- Create: `packages/saas-data/src/storefront-checkout/index.ts`
- Modify: `packages/saas-data/src/index.ts`

**Interfaces:**
- Consumes: Task 1 DTO parsers and Task 3 SQL functions.
- Produces: `PostgresPublicCheckoutRepository` and `PublicCheckoutRepository`, used by the storefront runtime in Tasks 5–8.

- [ ] **Step 1: Write failing repository query and parser tests**

```ts
test("issueNonce binds exact host, digest, nonce digest and timestamp", async () => {
  const repo = repository(pool(row("selected", quotePayload())));
  await repo.issueNonce({ hostname: "shop.celebix.site", credentialDigest: DIGEST, now: NOW });
  const selected = pool.calls.find((call) => /saas\.storefront_checkout_issue_nonce/.test(call.text));
  assert.deepEqual(selected?.values.slice(0, 2), ["shop.celebix.site", DIGEST]);
  assert.match(String(selected?.values[2]), /^[a-f0-9]{64}$/);
  assert.equal(selected?.values[3], NOW);
});

test("commit unknown never becomes a successful delivery update", async () => {
  await assert.rejects(
    repository(commitUnknownPool()).updateDelivery(deliveryInput()),
    (error) => error instanceof PublicCheckoutRepositoryError && error.code === "commit_unknown",
  );
});
```

- [ ] **Step 2: Run the repository test and verify red**

Run: `node --experimental-strip-types --test packages/saas-data/src/storefront-checkout/repository.test.ts`

Expected: FAIL with missing repository module.

- [ ] **Step 3: Define repository interfaces and finite errors**

```ts
export interface PublicCheckoutRepository {
  issueNonce(input: IssueCheckoutNonceInput): Promise<CheckoutQuote>;
  updateDelivery(input: UpdateCheckoutDeliveryInput): Promise<CheckoutQuote>;
  submitBuiltIn(input: SubmitBuiltInCheckoutInput): Promise<CheckoutSubmissionResult>;
  beginHosted(input: BeginHostedCheckoutInput): Promise<HostedCheckoutAuthority>;
  getStatus(input: GetCheckoutStatusInput): Promise<CheckoutStatus>;
  getPolicy(input: GetCheckoutPolicyInput): Promise<CheckoutPolicy>;
  recover(input: RecoverCheckoutOperationInput): Promise<CheckoutOperationResult>;
}

export const PUBLIC_CHECKOUT_ERROR_CODES = Object.freeze([
  "invalid_input", "not_found", "version_conflict", "discount_invalid",
  "stock_unavailable", "payment_method_unavailable", "operation_mismatch",
  "commit_unknown", "unavailable",
] as const);
```

`HostedCheckoutAuthority` is private and includes exact `storeId`, `paymentMethodId`, `providerCode`, `orderReference`, `amountMinor`, `currency`, canonical customer/basket data, attempt/bridge identity, and environment; it must not be exported by a public route DTO.

- [ ] **Step 4: Implement transaction wrapper and strict result parsing**

Follow the existing `PostgresPublicAbandonedCartRepository` transaction pattern:

```ts
await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
await client.query("SELECT pg_catalog.set_config('statement_timeout', $1, true)", [timeout(statementMs)]);
await client.query("SELECT pg_catalog.set_config('lock_timeout', $1, true)", [timeout(lockMs)]);
await client.query("SET LOCAL ROLE celebix_saas_workflow");
```

Read exactly one `{ outcome, result_payload }` row, map known finite outcomes, validate every successful payload with Task 1 parsers, and destroy the connection after unknown commit. `issueNonce` creates 32 random bytes, sends only its SHA-256 digest to `saas.storefront_checkout_issue_nonce`, and attaches the base64url credential to the parsed returned quote. `updateDelivery` generates and persists a fresh next nonce digest, then returns only the corresponding next base64url credential.

- [ ] **Step 5: Run focused and package data tests**

Run: `node --experimental-strip-types --test packages/saas-data/src/storefront-checkout/repository.test.ts`

Expected: PASS.

Run: `npm test --workspace @celebix/saas-data`

Expected: all data tests PASS.

- [ ] **Step 6: Commit the repository slice**

```bash
git add packages/saas-data/src/storefront-checkout packages/saas-data/src/index.ts
git commit -m "feat(checkout): add postgres checkout repository"
```

### Task 5: Add built-in order placement and hosted payment settlement

**Files:**
- Modify: `apps/owner/scripts/sql/saas/202607280064_storefront_one_page_checkout.up.sql`
- Modify: `apps/owner/scripts/sql/saas/202607280064_storefront_one_page_checkout.down.sql`
- Modify: `apps/owner/scripts/sql/saas/202607280064_storefront_one_page_checkout_assertions.sql`
- Modify: `tests/saas-phase3/storefront-one-page-checkout/postgres-harness.mjs`
- Modify: `packages/saas-data/src/storefront-checkout/types.ts`
- Modify: `packages/saas-data/src/storefront-checkout/repository.ts`
- Modify: `packages/saas-data/src/storefront-checkout/repository.test.ts`

**Interfaces:**
- Consumes: Task 3 quote/delivery state and existing generic `saas.payment_attempts` plus `saas.checkout_inventory_reservations` from migration 058.
- Produces: atomic built-in submission and hosted bridge authority consumed by Task 6.

- [ ] **Step 1: Add failing built-in and hosted settlement scenarios**

```js
assert.deepEqual(submitBuiltIn("cash_on_delivery"), {
  outcome: "placed", paymentStatus: "pending", orderStatus: "confirmed",
});
assert.equal(orderCountForCart(CART_A), 1);
assert.equal(replaySubmitSameOperation().outcome, "operation_replayed");
assert.equal(simultaneousBuiltInSubmits().createdOrders, 1);

const hosted = beginHosted("iyzico_iframe");
assert.equal(hosted.reservationStatus, "held");
settleAttempt(hosted.attemptId, "captured");
assert.equal(orderForCart(CART_A).paymentStatus, "completed");
assert.equal(reservation(hosted.attemptId).status, "consumed");
```

Also prove provider failure releases the reservation and creates no paid order, callback replay creates no duplicate, cross-store method IDs fail, emergency-disable races fail closed, discount usage limit is serialized, and stock decrements exactly once.

- [ ] **Step 2: Run focused tests and verify red**

Run: `node tests/saas-phase3/storefront-one-page-checkout/postgres-harness.mjs`

Expected: FAIL because submit and bridge functions are absent.

- [ ] **Step 3: Create discount redemption and hosted bridge tables**

```sql
CREATE TABLE saas.storefront_checkout_discount_redemptions(
  store_id uuid NOT NULL,
  discount_record_id uuid NOT NULL,
  order_id uuid NOT NULL,
  redeemed_at timestamptz NOT NULL,
  PRIMARY KEY(store_id,discount_record_id,order_id),
  FOREIGN KEY(store_id,discount_record_id) REFERENCES saas.merchant_admin_records(store_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(store_id,order_id) REFERENCES saas.orders(store_id,id) ON DELETE RESTRICT
);

CREATE TABLE saas.storefront_checkout_payment_bridges(
  attempt_id uuid PRIMARY KEY REFERENCES saas.payment_attempts(id) ON DELETE RESTRICT,
  store_id uuid NOT NULL,
  cart_id uuid NOT NULL,
  order_id uuid NOT NULL,
  order_item_ids uuid[] NOT NULL,
  order_event_id uuid NOT NULL,
  order_number text NOT NULL,
  status text NOT NULL CHECK(status IN('active','captured','failed','cancelled','expired')),
  created_at timestamptz NOT NULL,
  settled_at timestamptz,
  UNIQUE(store_id,cart_id),
  FOREIGN KEY(store_id,cart_id) REFERENCES saas.abandoned_carts(store_id,id) ON DELETE RESTRICT
);
```

Force RLS and deny table access to runtime roles.

- [ ] **Step 4: Implement built-in submit**

`saas.storefront_checkout_submit_builtin` must lock in this order: operation → cart → selected payment method → discount → products → variants → held reservations. Recompute quote. For `cash_on_delivery`, create a `source='storefront'` order with `status='confirmed'`, `payment_status='pending'`, and event payload `paymentMethod='cash_on_delivery'`. For `bank_transfer`, use the same truthful pending payment state and event payload `paymentMethod='bank_transfer'`; never mark either paid. Consume stock atomically, set the cart's `recovered_order_id`, archive the cart, write discount redemption, and persist the replay result.

- [ ] **Step 5: Implement hosted begin and terminal trigger**

`saas.storefront_checkout_begin_hosted` must:

1. Recompute quote and verify selected active provider method.
2. Reject any provider outside `paytr_iframe` and `iyzico_iframe`.
3. Create a generic `saas.payment_attempts` row using the existing execution authority.
4. Insert exact held reservations into `saas.checkout_inventory_reservations(id,store_id,payment_attempt_id,product_id,variant_id,quantity,stock_tracked,status,held_at,version,updated_at)` after subtracting all active holds.
5. Insert one bridge row with deterministic UUIDs/order number.
6. Return the private hosted authority without credentials; the existing payment-attempt repository opens sealed provider credentials.

Extend the existing generic attempt terminal trigger through a separate trigger function `saas.storefront_checkout_payment_attempt_terminal`. On `captured`, lock bridge/cart/products/variants/reservations, create the `source='storefront'` order, consume holds, decrement tracked stock once, set `recovered_order_id`, archive the cart, write the discount redemption, and mark the bridge captured. On `failed`, `cancelled`, or `expired`, release held reservations and leave the cart recoverable.

- [ ] **Step 6: Extend repository submit/begin/recovery methods**

Add exact SQL calls:

```ts
submitBuiltIn(input) {
  return this.execute(
    {
      text: "SELECT outcome,result_payload FROM saas.storefront_checkout_submit_builtin($1::text,$2::text,$3::bigint,$4::uuid,$5::text,$6::text,$7::uuid,$8::timestamptz)",
      values: [input.hostname, input.credentialDigest, input.expectedVersion, input.operationId,
        input.fingerprint, input.nonceDigest, input.paymentMethodId, input.now],
    },
    parseCheckoutSubmissionResult,
    ["placed", "operation_replayed"],
  );
}

beginHosted(input) {
  return this.execute(
    {
      text: "SELECT outcome,result_payload FROM saas.storefront_checkout_begin_hosted($1::text,$2::text,$3::bigint,$4::uuid,$5::text,$6::text,$7::uuid,$8::uuid,$9::text,$10::uuid,$11::uuid[],$12::uuid,$13::text,$14::timestamptz)",
      values: [input.hostname, input.credentialDigest, input.expectedVersion, input.operationId,
        input.fingerprint, input.nonceDigest, input.paymentMethodId, input.attemptId,
        input.callbackBindingDigest, input.orderId, input.orderItemIds, input.orderEventId,
        input.orderNumber, input.now],
    },
    parseHostedCheckoutAuthority,
    ["created", "operation_replayed"],
  );
}
```

The actual implementation uses parameterized query objects consistent with the repository; no string interpolation is permitted.

- [ ] **Step 7: Run PostgreSQL and repository tests**

Run: `node tests/saas-phase3/storefront-one-page-checkout/postgres-harness.mjs`

Expected: PASS.

Run: `node --experimental-strip-types --test packages/saas-data/src/storefront-checkout/repository.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit submission and settlement authority**

```bash
git add apps/owner/scripts/sql/saas/202607280064_storefront_one_page_checkout.* tests/saas-phase3/storefront-one-page-checkout/postgres-harness.mjs packages/saas-data/src/storefront-checkout
git commit -m "feat(checkout): place orders and settle hosted payments"
```

### Task 6: Wire the exact-host checkout runtime and HTTP routes

**Files:**
- Create: `apps/storefront-shared/lib/checkout/public-checkout.ts`
- Create: `apps/storefront-shared/lib/checkout/public-checkout.test.ts`
- Create: `apps/storefront-shared/lib/checkout/request.ts`
- Create: `apps/storefront-shared/lib/checkout/request.test.ts`
- Create: `apps/storefront-shared/lib/checkout/hosted-cart-payment.ts`
- Create: `apps/storefront-shared/lib/checkout/hosted-cart-payment.test.ts`
- Modify: `apps/storefront-shared/lib/default-runtime.ts`
- Create: `apps/storefront-shared/app/api/checkout/quote/route.ts`
- Create: `apps/storefront-shared/app/api/checkout/delivery/route.ts`
- Create: `apps/storefront-shared/app/api/checkout/submit/route.ts`
- Create: `apps/storefront-shared/app/api/checkout/status/route.ts`

**Interfaces:**
- Consumes: `PublicCheckoutRepository`, trusted host selection, cart credential helpers, client IP parsing, and existing `HostedPaymentRuntime`.
- Produces: same-origin checkout APIs and server helpers used by the page in Task 7.

- [ ] **Step 1: Write failing request-boundary tests**

```ts
test("delivery rejects cross-origin and browser tenant authority", async () => {
  assert.equal((await handlers.delivery(request({ origin: "https://evil.test" }))).status, 403);
  assert.equal((await handlers.delivery(request({ headers: { "x-store-id": STORE } }))).status, 400);
});

test("submit redirects only to an exact hosted presentation", async () => {
  const response = await handlers.submit(validSubmitRequest());
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "https://sandbox-cpp.iyzipay.com/?token=validToken1234567890&lang=tr");
});
```

- [ ] **Step 2: Run storefront checkout tests and verify red**

Run: `npm test --workspace @celebix/storefront-shared`

Expected: FAIL because new modules are absent.

- [ ] **Step 3: Implement bounded request parsing**

`request.ts` must accept JSON only for delivery and URL-encoded form only for final submit. Apply 32 KiB and 4 KiB limits respectively. Require exact same-origin `https://${trustedHostname}`, reject authorization/private tenant headers, duplicate cookies, transfer encoding, query/hash, wrong path/method, and malformed UTF-8. Reuse `readCartCredential` and hash the credential server-side.

Return these finite JSON errors only:

```ts
import type { CheckoutHttpError } from "@celebix/saas-contracts";

const CHECKOUT_HTTP_ERRORS: readonly CheckoutHttpError[] = Object.freeze([
  "invalid_input", "origin_denied", "cart_not_found", "cart_changed",
  "discount_invalid", "stock_unavailable", "payment_unavailable",
  "processing", "unavailable",
]);
```

Route code must not add an app-local error string.

- [ ] **Step 4: Implement route-independent orchestration**

```ts
export type PublicCheckoutRuntime = Readonly<{
  checkout: PublicCheckoutRepository;
  hosted: HostedPaymentRuntime | null;
}>;

export async function resolveCheckoutPage(input: Readonly<{
  hostname: string;
  cookieHeader: string | null;
  now: Date;
  repository: PublicCheckoutRepository;
}>): Promise<Readonly<{ kind: "active"; quote: CheckoutQuote }> | Readonly<{ kind: "not_found" | "unavailable" }>>;
```

Map repository codes without leaking SQL/provider messages. On `commit_unknown`, call `recover` with the same operation ID/fingerprint before choosing a response.

- [ ] **Step 5: Implement normal-cart hosted payment bridge**

`hosted-cart-payment.ts` receives only the private authority returned from `beginHosted`, then calls the existing runtime:

```ts
const presentation = await runtime.initialize({
  headers: new Headers(request.headers),
  storeId: authority.storeId,
  operationId: authority.operationId,
  paymentMethodId: authority.paymentMethodId,
  orderReference: authority.orderReference,
  amountMinor: authority.amountMinor,
  currency: authority.currency,
  customer: { ...authority.customer, ipAddress: trustedClientIp },
  basket: authority.basket,
});
```

Allow only provider-origin URLs already validated by the adapter runtime. Return 303 for redirect/iframe, 202 for processing, and 503 for rejected/invalid presentations. Do not add card inputs to Celebix.

- [ ] **Step 6: Wire default runtime and migration preflight**

Add `PostgresPublicCheckoutRepository` to the same bounded pool in `default-runtime.ts`. Extend the preflight query with:

```sql
to_regprocedure('saas.storefront_checkout_preflight()') IS NOT NULL
AND saas.storefront_checkout_preflight() AS migration_064
```

If false, return the existing controlled unavailable runtime; never fall back to Supabase or a theme checkout. Keep quick-order initialization unchanged.

- [ ] **Step 7: Create the four route adapters**

- `GET /api/checkout/quote` returns the parsed quote.
- `POST /api/checkout/delivery` returns the updated parsed quote.
- `POST /api/checkout/submit` returns 303 to hosted provider or `/odeme/sonuc`; built-ins never redirect to a provider.
- `GET /api/checkout/status` returns finite public status.

All responses set:

```ts
const CHECKOUT_HEADERS = Object.freeze({
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow",
});
```

- [ ] **Step 8: Run focused storefront tests and typecheck**

Run: `npm test --workspace @celebix/storefront-shared`

Expected: PASS.

Run: `npm run typecheck --workspace @celebix/storefront-shared`

Expected: PASS.

- [ ] **Step 9: Commit runtime and routes**

```bash
git add apps/storefront-shared/lib/checkout apps/storefront-shared/lib/default-runtime.ts apps/storefront-shared/app/api/checkout
git commit -m "feat(checkout): expose exact-host checkout routes"
```

### Task 7: Build the fixed Shopify-parity checkout shell

**Files:**
- Create: `apps/storefront-shared/app/odeme/page.tsx`
- Create: `apps/storefront-shared/app/odeme/checkout.module.css`
- Create: `apps/storefront-shared/app/politikalar/[policyType]/page.tsx`
- Create: `apps/storefront-shared/components/checkout/CheckoutClient.tsx`
- Create: `apps/storefront-shared/components/checkout/OrderSummary.tsx`
- Create: `apps/storefront-shared/components/checkout/DeliverySection.tsx`
- Create: `apps/storefront-shared/components/checkout/PaymentSection.tsx`
- Create: `apps/storefront-shared/components/checkout/model.ts`
- Create: `apps/storefront-shared/components/checkout/model.test.ts`
- Create: `apps/storefront-shared/public/payment-providers/paytr.svg`
- Create: `apps/storefront-shared/public/payment-providers/iyzico.svg`
- Modify: `apps/storefront-shared/package.json`

**Interfaces:**
- Consumes: `CheckoutQuote` and the Task 6 API routes.
- Produces: fixed one-page UI and pure state model used by browser acceptance in Task 9.

- [ ] **Step 1: Write failing pure model tests**

```ts
test("delivery success replaces canonical quote and clears pending state", () => {
  const next = reduceCheckout(state({ pending: "delivery" }), {
    type: "delivery_succeeded",
    quote: quote({ cartVersion: 2, shippingCents: 2_500, totalCents: 12_500 }),
  });
  assert.equal(next.pending, null);
  assert.equal(next.quote.cartVersion, 2);
  assert.equal(next.quote.totalCents, 12_500);
});

test("stale cart keeps server quote and announces a visible error", () => {
  const next = reduceCheckout(state(), { type: "failed", code: "cart_changed" });
  assert.equal(next.error, "Sepetiniz güncellendi. Lütfen bilgileri yeniden kontrol edin.");
});
```

- [ ] **Step 2: Run the model test and verify red**

Run: `node --experimental-transform-types --test apps/storefront-shared/components/checkout/model.test.ts`

Expected: FAIL because `model.ts` is absent.

- [ ] **Step 3: Implement the pure reducer and payload builders**

```ts
export type CheckoutUiState = Readonly<{
  quote: CheckoutQuote;
  summaryOpen: boolean;
  pending: null | "delivery" | "submit";
  selectedPaymentMethodId: string | null;
  error: string | null;
}>;

export type CheckoutUiAction =
  | Readonly<{ type: "toggle_summary" }>
  | Readonly<{ type: "select_payment"; paymentMethodId: string }>
  | Readonly<{ type: "delivery_started" }>
  | Readonly<{ type: "delivery_succeeded"; quote: CheckoutQuote }>
  | Readonly<{ type: "submit_started" }>
  | Readonly<{ type: "failed"; code: CheckoutHttpError }>;
```

The reducer never computes authoritative totals; it displays only the last parsed server quote. Payload builders include only Task 1 contract keys. `CheckoutHttpError` is imported from `@celebix/saas-contracts`; it is not redefined in the UI.

- [ ] **Step 4: Add verified provider logo assets**

Create the two storefront SVG files from the already-reviewed same-repository sources:

- `apps/customer-panel/public/payment-providers/paytr.svg`
- `apps/customer-panel/public/payment-providers/iyzico.svg`

Preserve exact SVG bytes and add a later static test comparing SHA-256 digests. Do not hotlink external provider assets.

- [ ] **Step 5: Implement the server page**

```tsx
export const metadata: Metadata = Object.freeze({
  title: "Güvenli ödeme",
  robots: Object.freeze({ index: false, follow: false }),
  referrer: "no-referrer",
});
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CheckoutPage() {
  const selected = await resolveDefaultCheckoutPage();
  if (selected.kind !== "active") return <CheckoutUnavailable kind={selected.kind} />;
  return <CheckoutClient initialQuote={selected.quote} />;
}
```

The page must not render `Header`, `Footer`, `StorefrontFrame`, or any theme component.

Create the policy route as a platform page that validates `policyType`, resolves the exact host, reads `getPolicy`, renders only the active policy body as React text with `white-space: pre-wrap` (never `dangerouslySetInnerHTML`), uses the same neutral system typography, and returns not-found for missing/inactive policy records.

- [ ] **Step 6: Implement desktop/mobile layout tokens**

`checkout.module.css` must encode the observed Shopify layout:

```css
.page { min-height: 100vh; background: #fff; color: #000; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
.grid { display: grid; grid-template-columns: minmax(0, 690px) minmax(0, 590px); justify-content: center; }
.main { width: 100%; max-width: 499px; margin-left: auto; padding: 40px 0 48px; }
.summaryColumn { min-height: 100vh; background: #f5f5f5; }
.summarySticky { position: sticky; top: 0; width: 100%; max-width: 480px; padding: 40px; }
.field { min-height: 47px; border: 1px solid #dedede; border-radius: 5px; padding: 13px 11px; }
.submit { min-height: 50px; width: 100%; border: 0; border-radius: 999px; background: #000; color: #fff; }
@media (max-width: 767px) {
  .grid { display: block; }
  .main { max-width: none; padding: 24px 20px 40px; }
  .summaryColumn { min-height: 0; background: #f5f5f5; }
  .summarySticky { position: static; max-width: none; padding: 0; }
}
```

Use 20px section headings, 14px form text, 24–32px section rhythm, visible 2px focus rings, and `prefers-reduced-motion` with no nonessential transitions.

- [ ] **Step 7: Implement accessible sections and summary**

- `OrderSummary` uses a desktop `aside` and mobile `button aria-expanded` disclosure.
- `DeliverySection` uses labels, `autocomplete`, inline errors, and `fieldset/legend` for shipping.
- `PaymentSection` uses one radio group, provider logo only for provider methods, bank instructions only when selected, COD instructions only when selected, two required consent checkboxes, and a full-width submit button.
- `CheckoutClient` sends delivery changes only on explicit continue/apply actions, aborts stale requests, disables submit while pending, parses every response through Task 1, and sends no analytics PII.
- The footer renders only `quote.policyLinks`; links always remain on the exact checkout host.
- No express-checkout heading or empty express container is rendered because the current executable registry contains no wallet/express adapter.

- [ ] **Step 8: Add checkout model tests to workspace script**

Append `components/checkout/*.test.ts` to the storefront `test` script without changing existing globs.

- [ ] **Step 9: Run model, storefront, typecheck, and build**

Run: `node --experimental-transform-types --test apps/storefront-shared/components/checkout/model.test.ts`

Expected: PASS.

Run: `npm test --workspace @celebix/storefront-shared`

Expected: PASS.

Run: `npm run typecheck --workspace @celebix/storefront-shared`

Expected: PASS.

Run: `npm run build --workspace @celebix/storefront-shared`

Expected: PASS with `/odeme`, `/politikalar/[policyType]`, and four checkout API routes present.

- [ ] **Step 10: Commit the fixed UI shell**

```bash
git add apps/storefront-shared/app/odeme apps/storefront-shared/components/checkout apps/storefront-shared/public/payment-providers apps/storefront-shared/package.json
git commit -m "feat(checkout): add fixed one-page storefront UI"
```

#### Task 7 fix round 1 verification record — 2026-07-29

- Node proxy detection is captured once at module initialization, works on supported Node runtimes without `process.getBuiltinModule`, rejects post-startup authority replacement, stays browser-bundle safe, and fails closed without a synchronous authority.
- Exact `Accept: application/json` checkout submissions return only the finite `{ kind: "redirect", location }` success contract; native form submissions retain the existing validated 303 behavior.
- The client uses one same-origin URL-encoded request with `redirect: "manual"`, aborts stale work, blocks duplicate pending submissions, parses every result, and navigates only to a contract-validated location.
- Delivery, provider identity, payment method, and both consent errors are rendered inline with `aria-invalid`/`aria-describedby`; the first invalid control receives focus and its error clears on correction.
- Chrome evidence was captured outside the protected evidence tree at 1440×1000 and 390×844 for both the initial and payment/error states. Measured mobile targets were 48px for the email field, 59.7px for the payment method, and 62px for the summary disclosure; console warnings/errors were empty.
- The four renders preserve the reviewed v2 geometry: 690/590 desktop split, 499px form content, 400px summary content, neutral white/`#f5f5f5` surfaces, fixed checkout typography, provider logos, all four available methods, consents, and the full-width submit action.
- Red/green ledger: proxy fallback tests failed before the captured fallback and passed afterward; JSON redirect tests failed before presentation conversion and passed afterward; client request/model tests failed before their modules and passed afterward; first-invalid Chrome focus failed before scheduled focus recovery and passed afterward; the frozen public-export test failed when the two parsers were added and passed after its explicit allowlist was updated.
- Final gates: `@celebix/saas-contracts` 178/178, `@celebix/storefront-shared` 243/243, both workspace typechecks, storefront production build, and `git diff --check` all pass with the temporary preview route removed.

### Task 8: Add result state, analytics privacy, and security headers

**Files:**
- Create: `apps/storefront-shared/app/odeme/sonuc/page.tsx`
- Modify: `apps/storefront-shared/components/checkout/CheckoutClient.tsx`
- Modify: `apps/storefront-shared/lib/analytics/events.ts`
- Modify: `apps/storefront-shared/lib/analytics/events.test.ts`
- Modify: `apps/storefront-shared/lib/analytics/tracker-client.test.ts`
- Modify: `apps/storefront-shared/proxy.ts`
- Create: `tests/saas-phase3/storefront-one-page-checkout/static-security.test.mjs`

**Interfaces:**
- Consumes: Task 6 status route and existing PII-safe analytics delivery.
- Produces: truthful final state, bounded checkout events, and static security proof.

- [ ] **Step 1: Write failing analytics and static security tests**

```ts
test("checkout analytics accepts only finite non-PII facts", () => {
  const value = fixture("/odeme");
  const event = createCheckoutCommerceEvent({
    name: "checkout_submitted",
    data: { methodKind: "provider", providerCode: "iyzico_iframe", currency: "TRY", itemCount: 1 },
  });
  trackCommerceEvent(value.tracker, event, value.browser);
  assert.equal(value.sent[0]?.name, "checkout_submitted");
  assert.throws(() => createCheckoutCommerceEvent({
    name: "checkout_submitted",
    data: { email: "buyer@example.com" },
  } as never));
});
```

Static checks must reject `supabase`, `apps/storefront-base`, `Header`, `Footer`, `themeKey`, raw database URL, inline scripts without nonce, and missing no-store/noindex response headers under checkout paths.

- [ ] **Step 2: Run focused tests and verify red**

Run: `node --experimental-transform-types --test apps/storefront-shared/lib/analytics/events.test.ts`

Expected: FAIL because checkout events are not defined.

Run: `node --test tests/saas-phase3/storefront-one-page-checkout/static-security.test.mjs`

Expected: FAIL because the security test contract is not yet satisfied.

- [ ] **Step 3: Add bounded analytics events**

Add only:

```ts
export const CHECKOUT_EVENTS = Object.freeze([
  "checkout_started",
  "checkout_delivery_saved",
  "checkout_submitted",
  "checkout_completed",
  "checkout_failed",
] as const);

export function createCheckoutCommerceEvent(input: CheckoutCommerceEvent): PublicCommerceEvent;
```

Properties are limited to `methodKind`, optional `providerCode`, `itemCount`, `currency`, and finite result code. Reject all unknown properties. Keep values bounded to 64 bytes except item count.

- [ ] **Step 4: Implement truthful result rendering**

`/odeme/sonuc` reads no query-supplied paid status. It calls `/api/checkout/status`/server repository using host + cart credential and renders:

- `processing`: “Ödemeniz doğrulanıyor” with bounded refresh;
- `placed`: order number and method-specific pending instructions;
- `paid`: order number and confirmed success;
- `failed`: retry link to `/odeme` without claiming an order succeeded;
- `ready`/not found: controlled unavailable state.

- [ ] **Step 5: Apply checkout CSP/security path rules**

Extend `proxy.ts` without weakening existing headers. Checkout HTML and APIs receive no-store, noindex, no-referrer, frame-ancestor denial for Celebix pages, and the existing nonce. Provider iframe navigation is not embedded in Celebix unless the existing adapter presentation explicitly requires and allowlists it.

- [ ] **Step 6: Run analytics, static security, and storefront tests**

Run: `npm test --workspace @celebix/storefront-shared`

Expected: PASS.

Run: `node --test tests/saas-phase3/storefront-one-page-checkout/static-security.test.mjs`

Expected: PASS.

- [ ] **Step 7: Commit result, analytics, and security**

```bash
git add apps/storefront-shared/app/odeme/sonuc apps/storefront-shared/components/checkout/CheckoutClient.tsx apps/storefront-shared/lib/analytics apps/storefront-shared/proxy.ts tests/saas-phase3/storefront-one-page-checkout/static-security.test.mjs
git commit -m "feat(checkout): secure result and analytics flow"
```

### Task 9: Prove visual parity, accessibility, tenant isolation, and end-to-end behavior

**Files:**
- Create: `tests/saas-phase3/storefront-one-page-checkout/browser-fixture.mjs`
- Create: `tests/saas-phase3/storefront-one-page-checkout/browser-acceptance.mjs`
- Modify: `tests/saas-phase3/storefront-one-page-checkout/static-security.test.mjs`

**Interfaces:**
- Consumes: completed checkout APIs/UI and disposable PostgreSQL fixture.
- Produces: deterministic desktop/mobile evidence and regression gates.

- [ ] **Step 1: Write the failing browser acceptance contract**

The fixture starts the production build against synthetic Store A and Store B hosts and two different theme keys. Browser assertions:

```js
const desktop = await cdp.evaluate(`(() => {
  const text = (node) => node?.textContent?.replace(/\\s+/g, " ").trim() ?? "";
  const main = document.querySelector("main");
  const aside = document.querySelector('aside[aria-label="Sipariş özeti"]');
  return {
    mainWidth: Math.round(main.getBoundingClientRect().width),
    summaryWidth: Math.round(aside.getBoundingClientRect().width),
    headings: [...document.querySelectorAll("h1,h2")].map(text),
  };
})()`);
assert.equal(desktop.mainWidth, 499);
assert.equal(desktop.summaryWidth, 400);
for (const heading of ["İletişim", "Teslimat", "Kargo yöntemi", "Ödeme"]) {
  assert.equal(desktop.headings.includes(heading), true);
}
```

Use the repository's existing raw Chrome DevTools Protocol harness pattern from `tests/saas-phase3/hemenaku-admin-presentation/browser-acceptance.mjs`; do not add Playwright as a dependency. At 390px assert the desktop aside is replaced by one `aria-expanded` summary control, no horizontal overflow, and all inputs/buttons have at least 44px interactive height.

- [ ] **Step 2: Run browser acceptance and verify red**

Run: `node tests/saas-phase3/storefront-one-page-checkout/browser-acceptance.mjs`

Expected: FAIL until the deterministic fixture and selectors are complete.

- [ ] **Step 3: Implement deterministic fixture and two-theme proof**

Seed two tenants with different `theme_key`, store names, products, prices, shipping rates, and payment methods. Load `/odeme` through each exact host. Normalize store-specific text and assert the checkout root class list, section order, field order, computed layout tokens, and CSS asset digest are identical.

Do not inject provider credentials. Hosted payment calls use a local fake adapter at the existing transport boundary and prove only redirect/processing/rejected outcomes.

- [ ] **Step 4: Add interaction and accessibility scenarios**

Prove:

- delivery validation and focus to the first invalid field;
- shipping fee/free-threshold recalculation;
- valid/invalid discount code;
- provider, bank transfer, and COD selection;
- required consent enforcement;
- duplicate submit disabled in the browser and idempotent on the server;
- mobile summary disclosure with `aria-expanded`;
- keyboard-only completion and visible focus;
- 200% zoom without horizontal scroll;
- reduced-motion behavior;
- axe critical/serious violations equal zero by injecting the already-locked `axe-core/axe.min.js` asset into the synthetic browser page.

- [ ] **Step 5: Add visual snapshots with stable masks**

Capture 1280×900 and 390×844 screenshots after fonts/layout settle. Mask only store name, product text/image, and order number; do not mask spacing, fields, summary, totals, method cards, buttons, or error states. Store snapshots in the harness's existing evidence/temp output, not under the protected `.codex-evidence/` tree.

- [ ] **Step 6: Run browser, PostgreSQL, and static proof**

Run: `node tests/saas-phase3/storefront-one-page-checkout/browser-acceptance.mjs`

Expected: PASS for both tenants/themes and both viewports.

Run: `node tests/saas-phase3/storefront-one-page-checkout/postgres-harness.mjs`

Expected: PASS.

Run: `node --test tests/saas-phase3/storefront-one-page-checkout/static-security.test.mjs`

Expected: PASS.

- [ ] **Step 7: Commit browser and isolation proof**

```bash
git add tests/saas-phase3/storefront-one-page-checkout
git commit -m "test(checkout): prove fixed one-page flow"
```

### Task 10: Run the full gate and prepare controlled Coolify rollout

**Files:**
- Create: `docs/ops/storefront-one-page-checkout-rollout.md`
- Modify only if the cumulative runner requires explicit registration: `tests/saas-phase3/current-test-matrix.json`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: one immutable candidate commit, verification evidence, and reversible rollout commands.

- [ ] **Step 1: Write the rollout runbook before deployment**

The runbook must include exact sequence:

```text
1. Record candidate SHA and current production SHA.
2. Verify encrypted PostgreSQL backup and restore target.
3. Apply migration 064 up.sql with ON_ERROR_STOP.
4. Run migration 064 assertions and storefront_checkout_preflight().
5. Deploy the exact candidate SHA to the shared storefront service.
6. Verify /health, container SHA, /odeme no-store/noindex, and two allowlisted synthetic hosts.
7. Enable the checkout flag for synthetic hosts, then a bounded tenant allowlist.
8. Verify provider test-mode redirect, bank transfer, COD, callback, stock, order, and logs.
9. Expand the allowlist only after the error-rate window stays within the documented threshold.
10. Roll back application SHA/flag before considering guarded migration down.
```

Include commands that read secrets only from the deployment environment and never print them. Production migration/deploy execution requires the existing authorized Coolify/PostgreSQL credentials; the document contains variable names, not values.

- [ ] **Step 2: Run focused workspace gates**

Run:

```bash
npm test --workspace @celebix/saas-contracts
npm test --workspace @celebix/saas-data
npm test --workspace @celebix/customer-panel
npm test --workspace @celebix/storefront-shared
npm run typecheck --workspace @celebix/saas-contracts
npm run typecheck --workspace @celebix/saas-data
npm run typecheck --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/storefront-shared
npm run build --workspace @celebix/customer-panel
npm run build --workspace @celebix/storefront-shared
```

Expected: every command exits 0.

- [ ] **Step 3: Run phase-3 cumulative and checkout-specific gates**

Run:

```bash
node tests/saas-phase3/storefront-one-page-checkout/postgres-harness.mjs
node --test tests/saas-phase3/storefront-one-page-checkout/static-security.test.mjs
node tests/saas-phase3/storefront-one-page-checkout/browser-acceptance.mjs
npm run test:saas-phase3:current
```

Expected: every command exits 0; no historical snapshot exclusion is added for the new checkout tests.

- [ ] **Step 4: Inspect exact staged scope and secret scan**

Run:

```bash
git diff --check
git status --short
git diff --name-only HEAD~10..HEAD
git grep -nE '(api[_-]?key|credential|secret).{0,40}[A-Za-z0-9_-]{24,}' -- ':!package-lock.json' ':!docs/superpowers/plans/**' || true
```

Expected: no whitespace errors; protected untracked directories remain unstaged; the credential scan prints no matches.

- [ ] **Step 5: Commit the rollout runbook**

```bash
git add docs/ops/storefront-one-page-checkout-rollout.md tests/saas-phase3/current-test-matrix.json
git commit -m "docs(checkout): add rollout and rollback gate"
```

If `current-test-matrix.json` required no change, stage only the runbook.

- [ ] **Step 6: Perform pre-push verification and publish**

Use `superpowers:verification-before-completion` before making completion claims. Then push the current branch without force:

```bash
git status --short --branch
git log -12 --oneline --decorate
git push origin codex/celebix-managed-umami-analytics
```

Expected: push succeeds and remote branch points to the exact verified candidate SHA.

- [ ] **Step 7: Deploy and verify the immutable candidate**

Follow `docs/ops/storefront-one-page-checkout-rollout.md` using the already-authorized Coolify project/service. Verify the deployed container SHA equals the pushed candidate, `/health` is healthy, `/odeme` uses the fixed platform shell on at least two exact hosts/themes, and provider/built-in smoke tests return truthful states. Do not enable live provider charging with test credentials and do not submit a real paid order during smoke verification.

- [ ] **Step 8: Record final evidence and completion**

Record candidate SHA, migration preflight result, build/test commands, synthetic host results, HTTP security headers, payment-method smoke outcomes, and rollback readiness in the task response. If any required gate is red or unavailable, report that exact gate as blocked; do not claim production completion.
