# Starter Commerce Cart, Checkout, and Policies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the real shared starter-storefront cart, buy-now, checkout, bank-transfer/COD order path, public search/favorites/account utilities, and seven fixed merchant-managed policy pages.

**Architecture:** Two append-only PostgreSQL 16 migrations extend the existing host-resolver, workflow, order, inventory, payment-method, customer, and merchant-admin authorities. Public Next.js routes receive only trusted-host and opaque-cookie authority; server repositories recompute every public projection and checkout total. The legacy `apps/storefront-base` cart and payment pages remain read-only visual donors and contribute no Supabase, authentication, API, or pricing code.

**Tech Stack:** PostgreSQL 16, TypeScript 5.9, Node test runner, Next.js 16 App Router, React 19, existing `pg` repositories, existing platform rich-text sanitizer, CSS modules/global starter-theme CSS.

## Global Constraints

- Implementation base is commit `6b811ed656b17e3cb8bbe629aa2d2e9631803d8b` on `codex/starter-theme-commerce-foundation`.
- `apps/storefront-base/**` and `apps/admin/**` are read-only donors and must have a byte diff count of zero.
- No Supabase, legacy admin API, iframe, reverse proxy, browser tenant/store authority, client-trusted price, or fake order is permitted.
- Store authority comes only from the existing authenticated storefront proxy hostname and PostgreSQL relationships.
- Raw cart, checkout-intent, customer, and receipt credentials never enter URLs, logs, RSC payloads, analytics, or database rows; persist digests only.
- Bank transfer is usable only with an active checksum-valid built-in configuration. Cash on delivery is visible only when explicitly active.
- Bank transfer and cash-on-delivery orders start with `payment_status = pending`.
- Exactly seven fixed policy definitions exist; merchants may edit Markdown and draft/publish state but cannot create, delete, rename, reorder, or change routes.
- Policy Markdown uses the existing finite rich-text sanitizer; raw HTML, script, iframe, event handler, style, form, and unsafe URL output is forbidden.
- No new runtime dependency is required. Use local SVG icon components rather than adding lockfile churn.
- Every behavior is implemented red-green-refactor. A production change is written only after its real test failed for the intended missing behavior.
- All new SQL is append-only after migration `070`, transaction-wrapped, checksum-manifested, reversible, and rehearsed on disposable PostgreSQL 16.
- No staging deployment occurs until every local/disposable gate passes and deployment is separately authorized.
- Production database, credentials, DNS, deployment, merge, provider activation, and customer data impact remain zero.

---

### Task 1: Public commerce contracts and fixed policy definitions

**Files:**
- Create: `packages/saas-contracts/src/storefront/commerce.ts`
- Create: `packages/saas-contracts/src/storefront/commerce.test.ts`
- Modify: `packages/saas-contracts/src/storefront/index.ts:1-4`
- Modify: `packages/saas-contracts/src/index.ts` at the storefront export block

**Interfaces:**
- Produces `FIXED_STOREFRONT_POLICIES`, `parsePublicPolicyPage`, `parsePublicPolicyIndex`, `parsePublicProductSearch`, `parsePublicCart`, `parsePublicCheckoutQuote`, `parsePublicCheckoutReceipt`, and their exact readonly types.
- Later tasks import these parsers at every database and HTTP boundary.

- [ ] **Step 1: Write failing contract tests**

Add literal fixtures proving the seven ordered keys/routes/labels, exact-object rejection, safe unavailable-policy projection, bounded search results, cart totals, payment kinds, receipt fields, and rejection of private keys such as `storeId`, `operationId`, `credential`, and `objectKey`.

```ts
test("fixed policy definitions expose seven immutable public routes", () => {
  assert.deepEqual(FIXED_STOREFRONT_POLICIES.map(({ key, route, label }) => ({ key, route, label })), [
    { key: "privacy_security", route: "/policies/privacy-security", label: "Gizlilik ve Güvenlik" },
    { key: "distance_sales", route: "/policies/distance-sales", label: "Mesafeli Satış Sözleşmesi" },
    { key: "kvkk", route: "/policies/kvkk", label: "KVKK" },
    { key: "payment_delivery", route: "/policies/payment-delivery", label: "Ödeme & Teslimat" },
    { key: "cookie_usage", route: "/policies/cookies", label: "Çerez Kullanımı" },
    { key: "returns_exchanges", route: "/policies/returns-exchanges", label: "İade & Değişim" },
    { key: "membership", route: "/policies/membership", label: "Üyelik" },
  ]);
  assert.throws(() => parsePublicPolicyPage({ key: "kvkk", label: "KVKK", route: "/policies/kvkk", published: true, html: "<p>x</p>", storeId: crypto.randomUUID() }));
});
```

- [ ] **Step 2: Run the contract test and observe the intended failure**

Run: `npm test --workspace @celebix/saas-contracts -- --test-name-pattern='fixed policy|public cart|checkout receipt'`

Expected: FAIL because `commerce.ts` exports do not exist.

- [ ] **Step 3: Implement exact public contracts**

Define these core types and parsers with finite enum/length/integer/URL/object-key validation:

```ts
export type StorefrontPolicyKey = "privacy_security" | "distance_sales" | "kvkk" | "payment_delivery" | "cookie_usage" | "returns_exchanges" | "membership";
export type PublicPolicyPage = Readonly<{ key: StorefrontPolicyKey; label: string; route: string; published: boolean; html?: string; updatedAt?: string }>;
export type PublicProductSearch = Readonly<{ items: readonly PublicProduct[]; nextCursor?: string }>;
export type PublicCartLine = Readonly<{ productId: string; variantId: string; slug: string; title: string; variantTitle: string; media?: PublicProductMedia; quantity: number; unitPriceCents: number; lineTotalCents: number; available: boolean }>;
export type PublicCart = Readonly<{ version: number; currency: "TRY"; itemCount: number; subtotalCents: number; shippingCents: number; totalCents: number; checkoutReady: boolean; items: readonly PublicCartLine[] }>;
export type PublicPaymentMethod = Readonly<{ kind: "bank_transfer" | "cash_on_delivery"; label: string; instructions: string; bankName?: string; accountHolder?: string; iban?: string }>;
export type PublicCheckoutQuote = Readonly<{ cart: PublicCart; paymentMethods: readonly PublicPaymentMethod[]; estimatedDays?: number }>;
export type PublicCheckoutReceipt = Readonly<{ orderReference: string; currency: "TRY"; subtotalCents: number; shippingCents: number; totalCents: number; paymentStatus: "pending"; paymentMethod: PublicPaymentMethod; items: readonly PublicCartLine[]; createdAt: string }>;
```

Parsers must require exact keys, freeze all arrays/objects, cap items at 100, cap text using UTF-8 bytes, and reject inherited/accessor-backed objects.

- [ ] **Step 4: Run contracts and typecheck**

Run: `npm test --workspace @celebix/saas-contracts && npm run typecheck --workspace @celebix/saas-contracts`

Expected: all existing and new contract tests PASS.

- [ ] **Step 5: Commit the contract boundary**

```bash
git add packages/saas-contracts/src/storefront/commerce.ts packages/saas-contracts/src/storefront/commerce.test.ts packages/saas-contracts/src/storefront/index.ts packages/saas-contracts/src/index.ts
git commit -m "feat(storefront): define public commerce contracts"
```

### Task 2: Migration 071 — fixed policy authority and public product search

**Files:**
- Create: `apps/owner/scripts/sql/saas/202607310071_storefront_policy_search.up.sql`
- Create: `apps/owner/scripts/sql/saas/202607310071_storefront_policy_search.down.sql`
- Create: `apps/owner/scripts/sql/saas/202607310071_storefront_policy_search_assertions.sql`
- Create: `apps/owner/scripts/sql/saas/phase4a-storefront-policy-search-manifest.json`
- Create: `tests/saas-phase3/storefront-policy-search/postgres-harness.mjs`
- Create: `tests/saas-phase3/storefront-policy-search/static-security.test.mjs`
- Modify: `tests/saas-phase3/run-current-suite.mjs` after the migration-070 suite entry
- Modify: `tests/saas-phase3/current-test-matrix.json` with the exact new suite counts

**Interfaces:**
- Produces SQL functions `saas.store_policy_list_admin`, `saas.store_policy_save`, `saas.store_policy_recover`, `saas.public_policy_index`, `saas.public_policy_get`, `saas.public_search_products`, and `saas.public_resolve_product_ids`.
- App functions consume the full persisted TenantContext tuple; public functions consume hostname and time only.

- [ ] **Step 1: Write the failing PostgreSQL harness**

The harness boots migrations `001–070`, then proves migration 071 is absent by expecting `to_regclass('saas.store_policy_pages') IS NULL` before applying the new file. Add scenarios for exact seven-row backfill/new-store seeding, fixed-key uniqueness, no archive/delete, Markdown bounds, publish/version/replay/concurrency, cross-store denial, public draft/published projection, search isolation/cursor/bounds, resolve-ID isolation, ACL/RLS, backup/restore, rollback/reapply, and cleanup.

```js
await scenario("each store has exactly seven fixed policy rows", () => {
  assert.equal(psql(box, `SELECT count(*) FROM saas.store_policy_pages WHERE store_id='${STORE_A}'`), "7");
  assert.equal(psql(box, `SELECT string_agg(policy_key,',' ORDER BY ordinal) FROM saas.store_policy_pages WHERE store_id='${STORE_A}'`), "privacy_security,distance_sales,kvkk,payment_delivery,cookie_usage,returns_exchanges,membership");
});
```

- [ ] **Step 2: Run the harness and observe migration absence**

Run: `node tests/saas-phase3/storefront-policy-search/postgres-harness.mjs`

Expected: FAIL at bootstrap because migration 071 files/functions are missing.

- [ ] **Step 3: Implement migration 071**

Create `saas.store_policy_pages` with primary key `(store_id,policy_key)`, ordinal/key/route/label checks, `status IN ('draft','published')`, bounded Markdown, version/timestamps, forced RLS, and no direct app/host access. Create immutable `saas.store_policy_operations` keyed by operation ID. Seed all existing stores and install an owner trigger that inserts the seven exact draft rows for each future store.

The public and admin signatures are exact:

```sql
CREATE FUNCTION saas.store_policy_list_admin(uuid,uuid,uuid,uuid,text,bigint,timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb);
CREATE FUNCTION saas.store_policy_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,text,bigint,text,text)
RETURNS TABLE(outcome text,result_payload jsonb);
CREATE FUNCTION saas.store_policy_recover(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text)
RETURNS TABLE(outcome text,result_payload jsonb);
CREATE FUNCTION saas.public_policy_index(text,timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb);
CREATE FUNCTION saas.public_policy_get(text,timestamptz,text)
RETURNS TABLE(outcome text,result_payload jsonb);
CREATE FUNCTION saas.public_search_products(text,timestamptz,text,integer,text)
RETURNS TABLE(outcome text,result_payload jsonb);
CREATE FUNCTION saas.public_resolve_product_ids(text,timestamptz,uuid[])
RETURNS TABLE(outcome text,result_payload jsonb);
```

`store_policy_save` accepts only one of the seven keys, preserves immutable label/route/ordinal, uses expected version, stores the exact Markdown body and `draft|published`, and records replay payload. Public functions return sanitized source Markdown only to the server repository; HTML is produced by the existing sanitizer in application code. Search uses the existing public product projection, active hostname authority, normalized query, deterministic `(created_at,id)` cursor, and maximum 48 rows.

Grant admin functions only to `celebix_saas_app`; grant public functions only to `celebix_saas_host_resolver`; revoke helper/table privileges from every runtime role.

- [ ] **Step 4: Add assertions, manifest, and cumulative runner entries**

Assertions execute behavior and ACL checks rather than source-string checks. Manifest SHA-256 values must match exact bytes. Register expected totals in `run-current-suite.mjs` and `current-test-matrix.json` only after observing harness output.

- [ ] **Step 5: Run PostgreSQL/static tests**

Run:

```bash
node tests/saas-phase3/storefront-policy-search/postgres-harness.mjs
node --test tests/saas-phase3/storefront-policy-search/static-security.test.mjs
```

Expected: all migration scenarios PASS; rollback/reapply and cleanup PASS.

- [ ] **Step 6: Commit migration 071**

```bash
git add apps/owner/scripts/sql/saas/202607310071_storefront_policy_search.* apps/owner/scripts/sql/saas/phase4a-storefront-policy-search-manifest.json tests/saas-phase3/storefront-policy-search tests/saas-phase3/run-current-suite.mjs tests/saas-phase3/current-test-matrix.json
git commit -m "feat(saas): add storefront policy and search authority"
```

### Task 3: Policy/search repositories and runtime preflight

**Files:**
- Create: `packages/saas-data/src/storefront-content/types.ts`
- Create: `packages/saas-data/src/storefront-content/validation.ts`
- Create: `packages/saas-data/src/storefront-content/repository.ts`
- Create: `packages/saas-data/src/storefront-content/repository.test.ts`
- Create: `packages/saas-data/src/storefront-content/index.ts`
- Modify: `packages/saas-data/src/index.ts` exports
- Modify: `apps/storefront-shared/lib/default-runtime.ts` public runtime type and database preflight
- Modify: `apps/storefront-shared/lib/runtime-config.test.ts`

**Interfaces:**
- Produces `PostgresPublicStorefrontContentRepository` and `PostgresStorePolicyAdminRepository`.
- `PublicStorefrontRuntime` gains `content: PublicStorefrontContentRepository`.
- Later HTTP/UI tasks never call SQL directly.

- [ ] **Step 1: Write failing repository tests**

Use real repository instances with deterministic fake PostgreSQL clients. Assert exact transaction order, role, SQL signature/parameters, projection parsing, commit release, rollback/destroy behavior, `not_found`, `version_conflict`, operation replay, and malformed payload rejection.

```ts
test("public policy read uses hostname authority and projects no private fields", async () => {
  const result = await repository.getPolicy({ hostname: HOST, now: NOW, key: "kvkk" });
  assert.deepEqual(result, { key: "kvkk", label: "KVKK", route: "/policies/kvkk", published: false });
  assert.equal(client.queries.at(-2)?.text.includes("saas.public_policy_get"), true);
});
```

- [ ] **Step 2: Run and observe missing repository failure**

Run: `npm test --workspace @celebix/saas-data -- --test-name-pattern='public policy|public search|policy save'`

Expected: FAIL because storefront-content exports are missing.

- [ ] **Step 3: Implement repositories and validators**

Define:

```ts
export interface PublicStorefrontContentRepository {
  listPolicies(input: { hostname: string; now: Date }): Promise<readonly PublicPolicyPage[]>;
  getPolicy(input: { hostname: string; now: Date; key: StorefrontPolicyKey }): Promise<PublicPolicyPage>;
  search(input: { hostname: string; now: Date; query: string; limit: number; cursor?: string }): Promise<PublicProductSearch>;
  resolveProductIds(input: { hostname: string; now: Date; productIds: readonly string[] }): Promise<readonly PublicProduct[]>;
}
export interface StorePolicyAdminRepository {
  list(input: { tenantContext: TenantContext; now: Date }): Promise<readonly StorePolicyAdminPage[]>;
  save(input: { tenantContext: TenantContext; now: Date; operationId: string; fingerprint: string; key: StorefrontPolicyKey; expectedVersion: number; body: string; status: "draft" | "published" }): Promise<StorePolicyAdminPage>;
  recover(input: { tenantContext: TenantContext; now: Date; operationId: string; fingerprint: string }): Promise<StorePolicyAdminPage | null>;
}
```

All readers use `BEGIN READ ONLY`, timeout configuration, exact `SET LOCAL ROLE`, one function call, `COMMIT`, and release. Writes use `BEGIN`, one save call, and single read-only recovery only after `commit_unknown` classification.

- [ ] **Step 4: Extend storefront runtime preflight**

Require migration 071 functions and table in the existing startup query; instantiate the public content repository with the same pool and host-resolver role. A missing migration returns runtime `null` before a request can receive a partial surface.

- [ ] **Step 5: Run data/runtime suites**

Run:

```bash
npm test --workspace @celebix/saas-data
npm run typecheck --workspace @celebix/saas-data
npm test --workspace @celebix/storefront-shared
npm run typecheck --workspace @celebix/storefront-shared
```

Expected: PASS.

- [ ] **Step 6: Commit repository boundary**

```bash
git add packages/saas-data/src/storefront-content packages/saas-data/src/index.ts apps/storefront-shared/lib/default-runtime.ts apps/storefront-shared/lib/runtime-config.test.ts
git commit -m "feat(saas): expose public storefront content repository"
```

### Task 4: Fixed policy administration

**Files:**
- Create: `apps/customer-panel/lib/server-store-policy/runtime.ts`
- Create: `apps/customer-panel/lib/server-store-policy/runtime.test.ts`
- Create: `apps/customer-panel/lib/store-policy-http/handler.ts`
- Create: `apps/customer-panel/lib/store-policy-http/handler.test.ts`
- Create: `apps/customer-panel/lib/store-policy-ui/client.ts`
- Create: `apps/customer-panel/lib/store-policy-ui/client.test.ts`
- Create: `apps/customer-panel/components/content/PolicyConsole.tsx`
- Create: `apps/customer-panel/components/content/PolicyConsole.test.ts`
- Create: `apps/customer-panel/components/content/policy-console.module.css`
- Create: `apps/customer-panel/app/api/storefront-policies/route.ts`
- Create: `apps/customer-panel/app/api/storefront-policies/[policyKey]/route.ts`
- Modify: `apps/customer-panel/app/content/policies/page.tsx`
- Rename/modify: `apps/customer-panel/app/content/policies/[recordId]/edit/page.tsx` to `apps/customer-panel/app/content/policies/[policyKey]/edit/page.tsx`
- Modify: `apps/customer-panel/app/content/policies/new/page.tsx` to permanent redirect to `/content/policies`
- Modify: `apps/customer-panel/lib/merchant-admin-ui/record-route.ts` to remove policy create/edit ownership

**Interfaces:**
- Routes expose same-origin authenticated `GET /api/storefront-policies`, `GET /api/storefront-policies/:key`, and `PATCH /api/storefront-policies/:key`.
- PATCH body is exact `{ operationId, expectedVersion, body, status }`.

- [ ] **Step 1: Write failing runtime/HTTP/UI tests**

Tests prove seven fixed rows in order, no create/delete/archive control, immutable key/label/route, Markdown body/status edit, read-only membership behavior, exact Origin/path/content-type, private-header rejection, version conflict refresh, commit-unknown single recovery, Escape/focus recovery, and no tenant/private IDs in DOM or requests.

- [ ] **Step 2: Run focused tests and observe missing modules**

Run:

```bash
npm test --workspace @celebix/customer-panel -- --test-name-pattern='fixed polic|store policy'
```

Expected: FAIL because the dedicated policy runtime/UI do not exist.

- [ ] **Step 3: Implement server runtime and handlers**

Resolve the existing authenticated `TenantContext`, require `content.read` for GET and `content.manage` for PATCH, call only `StorePolicyAdminRepository`, hash canonical body/status/key/version for the fingerprint, and map finite outcomes to 200/400/401/403/404/409/503. Do not accept store, principal, membership, plan, label, route, or ordinal from the browser.

- [ ] **Step 4: Implement the fixed console and editor**

Render seven cards/rows from `FIXED_STOREFRONT_POLICIES`; editor title/route are read-only, body uses a bounded Markdown textarea and safe preview, status is draft/published, and save uses one operation ID. Remove generic “Yeni politika” and archive actions.

- [ ] **Step 5: Run customer-panel focused/full gates**

Run:

```bash
npm test --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/customer-panel
npm run build --workspace @celebix/customer-panel
```

Expected: PASS.

- [ ] **Step 6: Commit policy administration**

```bash
git add apps/customer-panel/lib/server-store-policy apps/customer-panel/lib/store-policy-http apps/customer-panel/lib/store-policy-ui apps/customer-panel/components/content apps/customer-panel/app/api/storefront-policies apps/customer-panel/app/content/policies apps/customer-panel/lib/merchant-admin-ui/record-route.ts
git commit -m "feat(panel): manage fixed storefront policies"
```

### Task 5: Public policies, search, favorites, and utility components

**Files:**
- Create: `apps/storefront-shared/lib/policy-page.ts`
- Create: `apps/storefront-shared/lib/policy-page.test.ts`
- Create: `apps/storefront-shared/lib/favorites.ts`
- Create: `apps/storefront-shared/lib/favorites.test.ts`
- Create: `apps/storefront-shared/components/StoreIcon.tsx`
- Create: `apps/storefront-shared/components/StoreUtilities.tsx`
- Create: `apps/storefront-shared/components/FavoriteButton.tsx`
- Create: `apps/storefront-shared/app/api/favorites/resolve/route.ts`
- Create: `apps/storefront-shared/app/search/page.tsx`
- Create: `apps/storefront-shared/app/favorites/page.tsx`
- Create: `apps/storefront-shared/app/policies/[policyKey]/page.tsx`
- Modify: `apps/storefront-shared/components/Footer.tsx`
- Modify: `apps/storefront-shared/components/ProductCard.tsx`
- Modify: `apps/storefront-shared/app/globals.css`
- Modify: `apps/storefront-shared/lib/storefront-app.test.ts`

**Interfaces:**
- `StoreUtilities` accepts `{ cartCount: number }` later; until Task 9 mounts it, these components remain unexposed.
- Favorites storage key is `celebix:storefront:favorites:v1:<hostname>` and values are a maximum of 100 UUIDs.

- [ ] **Step 1: Write failing public behavior tests**

Name mutations caught: wrong policy key mapping, unsanitized HTML, draft page pretending to be published, query bypassing bounds, favorites crossing hostnames, unresolved IDs remaining visible, missing fixed footer links, and nested interactive product-card markup.

- [ ] **Step 2: Run and observe missing routes/components**

Run: `npm test --workspace @celebix/storefront-shared -- --test-name-pattern='policy page|favorites|search|footer'`

Expected: FAIL for missing modules/routes.

- [ ] **Step 3: Implement policy renderer and public routes**

Use `normalizeProductDescriptionHtml(body, label)` for sanitized Markdown/HTML. Published pages render the exact label and safe body; drafts render “Bu metin mağaza tarafından henüz yayımlanmadı”, no body, and noindex metadata. Invalid keys call `notFound()`; repository unavailability throws the shared unavailable error.

- [ ] **Step 4: Implement search and favorites**

Search reads `searchParams.q`, validates with the repository contract, and renders `ProductGrid`. Favorites client code parses only the hostname-scoped UUID array, posts it to the resolve API, rewrites storage to the canonical returned IDs, synchronizes storage events, and renders real `ProductCard` components.

- [ ] **Step 5: Implement unmounted utility icons and fixed footer**

Build local SVG icons for search, heart, account, and cart. Footer renders all seven fixed policy routes in order. Refactor `ProductCard` so the product link and favorite button are sibling interactive controls.

- [ ] **Step 6: Run storefront gates**

Run:

```bash
npm test --workspace @celebix/storefront-shared
npm run typecheck --workspace @celebix/storefront-shared
npm run build --workspace @celebix/storefront-shared
```

Expected: PASS; cart/account utilities are still not mounted.

- [ ] **Step 7: Commit public content shell**

```bash
git add apps/storefront-shared/lib/policy-page* apps/storefront-shared/lib/favorites* apps/storefront-shared/components apps/storefront-shared/app/api/favorites apps/storefront-shared/app/search apps/storefront-shared/app/favorites apps/storefront-shared/app/policies apps/storefront-shared/app/globals.css apps/storefront-shared/lib/storefront-app.test.ts
git commit -m "feat(storefront): add search favorites and fixed policies"
```

### Task 6: Cart credentials, exact HTTP schemas, and client protocol

**Files:**
- Create: `apps/storefront-shared/lib/cart/credential.ts`
- Create: `apps/storefront-shared/lib/cart/credential.test.ts`
- Create: `apps/storefront-shared/lib/cart/request.ts`
- Create: `apps/storefront-shared/lib/cart/request.test.ts`
- Create: `apps/storefront-shared/lib/cart/client.ts`
- Create: `apps/storefront-shared/lib/cart/client.test.ts`
- Create: `apps/storefront-shared/lib/cart/types.ts`

**Interfaces:**
- Produces `parseCartCredentialCookie`, `serializeCartCredentialCookie`, `readCartMutationRequest`, `readCheckoutRequest`, and `storefrontCartClient`.
- Raw credential format is `c1.<key-id>.<43-char-base64url>`; checkout/customer/receipt use distinct `i1`, `u1`, and `r1` prefixes and key purposes.

- [ ] **Step 1: Write failing credential/request tests**

Tests reject wrong prefixes, wrong key IDs, non-canonical base64url, duplicates, whitespace, control characters, oversized bodies, unknown JSON keys, wrong Origin/path/method/content type, transfer encoding, Authorization, private headers, and cookies from another purpose. Tests prove cookie attributes exactly and no raw credential in JSON.

- [ ] **Step 2: Run and observe missing protocol failure**

Run: `npm test --workspace @celebix/storefront-shared -- --test-name-pattern='cart credential|cart request|checkout request'`

Expected: FAIL because `lib/cart/**` does not exist.

- [ ] **Step 3: Implement minimal exact protocol**

Define mutation union:

```ts
export type CartCommand =
  | Readonly<{ kind: "add"; operationId: string; productId: string; variantId: string; quantity: number; expectedVersion?: number }>
  | Readonly<{ kind: "set_quantity"; operationId: string; variantId: string; quantity: number; expectedVersion: number }>
  | Readonly<{ kind: "remove"; operationId: string; variantId: string; expectedVersion: number }>
  | Readonly<{ kind: "buy_now"; operationId: string; productId: string; variantId: string; quantity: number }>;
```

Generate 32 random bytes, parse keyring from a dedicated staging environment, hash with SHA-256 over a purpose-bound framed message, compare digests without early-exit string comparison, zero buffers after use, and serialize `__Host-celebix_cart`, `__Host-celebix_customer`, and short-lived intent/receipt cookies.

- [ ] **Step 4: Run protocol tests**

Run: `npm test --workspace @celebix/storefront-shared -- --test-name-pattern='cart credential|cart request|checkout request'`

Expected: PASS.

- [ ] **Step 5: Commit protocol modules**

```bash
git add apps/storefront-shared/lib/cart
git commit -m "feat(storefront): define secure cart protocol"
```

### Task 7: Migration 072 — durable cart, checkout, receipt, and guest account authority

**Files:**
- Create: `apps/owner/scripts/sql/saas/202607310072_storefront_cart_checkout.up.sql`
- Create: `apps/owner/scripts/sql/saas/202607310072_storefront_cart_checkout.down.sql`
- Create: `apps/owner/scripts/sql/saas/202607310072_storefront_cart_checkout_assertions.sql`
- Create: `apps/owner/scripts/sql/saas/phase4b-storefront-cart-checkout-manifest.json`
- Create: `tests/saas-phase3/storefront-cart-checkout/postgres-harness.mjs`
- Create: `tests/saas-phase3/storefront-cart-checkout/static-security.test.mjs`
- Modify: `tests/saas-phase3/run-current-suite.mjs` after migration 071
- Modify: `tests/saas-phase3/current-test-matrix.json`

**Interfaces:**
- Produces workflow functions `public_cart_mutate`, `public_cart_resolve`, `public_buy_now_create`, `public_checkout_quote`, `public_checkout_complete`, `public_checkout_recover`, `public_receipt_get`, and `public_account_orders`.

- [ ] **Step 1: Write the failing PostgreSQL harness**

The harness covers table/role setup, credential digest/key binding, trusted hostname, add/update/remove/replay/version/expiry, concurrent line mutation, buy-now separation, public quote recomputation, active bank/COD projection, missing payment/shipping, price and stock drift, double checkout, operation mismatch, customer/address/order/item/event creation, inventory source markers, bank/COD pending status, commit recovery, receipt/account isolation, cleanup, backup/restore, rollback/reapply, and external connection count zero.

```js
await scenario("concurrent checkout creates exactly one order", async () => {
  const outcomes = (await Promise.all([checkout(box, OPERATION), checkout(box, OPERATION)])).sort();
  assert.deepEqual(outcomes, ["committed", "operation_replayed"]);
  assert.equal(psql(box, `SELECT count(*) FROM saas.orders WHERE source='storefront' AND store_id='${STORE_A}'`), "1");
});
```

- [ ] **Step 2: Run and observe missing migration failure**

Run: `node tests/saas-phase3/storefront-cart-checkout/postgres-harness.mjs`

Expected: FAIL because migration 072 is missing.

- [ ] **Step 3: Implement durable tables and triggers**

Create forced-RLS/no-direct-runtime-access tables:

```sql
saas.storefront_carts(id,store_id,status,version,expires_at,created_at,updated_at)
saas.storefront_cart_credentials(cart_id,store_id,key_id,credential_digest,expires_at)
saas.storefront_cart_items(cart_id,store_id,product_id,variant_id,quantity,position,created_at,updated_at)
saas.storefront_cart_operations(operation_id,store_id,cart_id,operation_kind,payload_fingerprint,result_payload,committed_at)
saas.storefront_checkout_intents(id,store_id,kind,status,key_id,credential_digest,product_id,variant_id,quantity,expires_at,created_at)
saas.storefront_customer_credentials(id,store_id,key_id,credential_digest,expires_at,created_at,last_seen_at)
saas.storefront_order_receipts(id,store_id,order_id,customer_credential_id,key_id,credential_digest,expires_at,created_at)
saas.storefront_checkout_operations(operation_id,store_id,cart_id,intent_id,payload_fingerprint,result_payload,committed_at)
```

Add immutable operation triggers, exact composite foreign keys, one active digest uniqueness, expiry/version checks, and lookup indexes. Extend `shipping_setting` validation with optional `shippingPriceCents` bounded `0..100000000`; absent values project as zero for backward compatibility.

- [ ] **Step 4: Implement public workflow functions**

Every function first validates hostname and `saas.public_storefront_authorized`. Credential matching receives at most 16 `(key_id,digest)` candidates in one JSON array and matches under row lock in one SQL call. `public_checkout_complete` accepts canonical delivery JSON, payment kind, operation ID/fingerprint, and pre-generated UUIDs; it recomputes product prices through `resolve_effective_variant_price`, locks stock, resolves shipping/payment configuration, upserts same-store customer/address, creates one order/items/event, applies inventory source markers, binds receipt/customer credentials, converts cart/intent, and stores replay result in one transaction.

The exact terminal outcomes are finite: `committed`, `operation_replayed`, `operation_mismatch`, `version_conflict`, `cart_empty`, `cart_expired`, `price_changed`, `stock_unavailable`, `shipping_unavailable`, `payment_unavailable`, `invalid_input`, `not_found`.

- [ ] **Step 5: Add assertions/manifest/cumulative entries and run**

Run:

```bash
node tests/saas-phase3/storefront-cart-checkout/postgres-harness.mjs
node --test tests/saas-phase3/storefront-cart-checkout/static-security.test.mjs
```

Expected: all scenarios, rollback/reapply, backup/restore, and cleanup PASS.

- [ ] **Step 6: Commit migration 072**

```bash
git add apps/owner/scripts/sql/saas/202607310072_storefront_cart_checkout.* apps/owner/scripts/sql/saas/phase4b-storefront-cart-checkout-manifest.json tests/saas-phase3/storefront-cart-checkout tests/saas-phase3/run-current-suite.mjs tests/saas-phase3/current-test-matrix.json
git commit -m "feat(saas): add durable storefront cart checkout"
```

### Task 8: Cart/checkout repository, runtime, and HTTP routes

**Files:**
- Create: `packages/saas-data/src/storefront-commerce/types.ts`
- Create: `packages/saas-data/src/storefront-commerce/validation.ts`
- Create: `packages/saas-data/src/storefront-commerce/repository.ts`
- Create: `packages/saas-data/src/storefront-commerce/repository.test.ts`
- Create: `packages/saas-data/src/storefront-commerce/index.ts`
- Modify: `packages/saas-data/src/index.ts`
- Create: `apps/storefront-shared/lib/cart/runtime.ts`
- Create: `apps/storefront-shared/lib/cart/runtime.test.ts`
- Create: `apps/storefront-shared/lib/cart/route.ts`
- Create: `apps/storefront-shared/lib/cart/route.test.ts`
- Create: `apps/storefront-shared/app/api/cart/[action]/route.ts`
- Create: `apps/storefront-shared/app/api/checkout/quote/route.ts`
- Create: `apps/storefront-shared/app/api/checkout/complete/route.ts`
- Modify: `apps/storefront-shared/app/api/cart/route.ts` so GET resolves cart and POST remains backward-compatible abandoned-cart capture only at `/api/cart/capture`
- Create: `apps/storefront-shared/app/api/cart/capture/route.ts`
- Modify: `apps/storefront-shared/lib/default-runtime.ts` to require migration 072 and expose commerce repository

**Interfaces:**
- Produces `StorefrontCommerceRepository` and route factories returning only canonical contract projections.
- `PublicStorefrontRuntime` gains `commerce` while existing `checkout` quick-link runtime remains unchanged.

- [ ] **Step 1: Write failing repository/runtime/route tests**

Tests exercise real parsing and route factories with complete repository doubles. Assert transaction/client destruction, exact SQL arguments, no raw credential persistence, at-most-16 candidate digests, one recovery read after commit unknown, Set-Cookie only on proven success, no Location on failure, same-origin authority, and old abandoned-cart capture behavior at its new exact route.

- [ ] **Step 2: Run focused red tests**

Run:

```bash
npm test --workspace @celebix/saas-data -- --test-name-pattern='storefront cart|checkout repository'
npm test --workspace @celebix/storefront-shared -- --test-name-pattern='cart route|checkout route'
```

Expected: FAIL for missing repository and route factories.

- [ ] **Step 3: Implement repository**

Define:

```ts
export interface StorefrontCommerceRepository {
  resolveCart(input: ResolveCartInput): Promise<PublicCart>;
  mutateCart(input: MutateCartInput): Promise<PublicCart>;
  createBuyNow(input: CreateBuyNowInput): Promise<Readonly<{ intentCredential: Uint8Array }>>;
  quote(input: CheckoutQuoteInput): Promise<PublicCheckoutQuote>;
  complete(input: CompleteCheckoutInput): Promise<Readonly<{ receipt: PublicCheckoutReceipt; customerCredential?: Uint8Array; receiptCredential: Uint8Array }>>;
  recover(input: RecoverCheckoutInput): Promise<Readonly<{ receipt: PublicCheckoutReceipt; receiptCredential: Uint8Array }> | null>;
  getReceipt(input: ReceiptInput): Promise<PublicCheckoutReceipt>;
  listAccountOrders(input: AccountOrdersInput): Promise<readonly PublicCheckoutReceipt[]>;
}
```

Repository owns buffer zeroization in `finally`; classifies acquisition/begin/query/commit/rollback errors consistently with existing SaaS repositories; destroys clients after unknown commit or failed cleanup.

- [ ] **Step 4: Implement runtime and exact routes**

GET `/api/cart` resolves the credential or returns canonical empty cart. POST `/api/cart/add|quantity|remove|buy-now` uses exact commands. Quote/complete routes use credential purpose isolation. Successful complete sets customer and receipt cookies and returns `303 /checkout/success`; failures return finite JSON without Location or receipt cookie. Preserve `/api/cart/capture` abandoned-cart behavior and update callers/tests from the old POST path.

- [ ] **Step 5: Extend runtime preflight and run suites**

Run:

```bash
npm test --workspace @celebix/saas-data
npm run typecheck --workspace @celebix/saas-data
npm test --workspace @celebix/storefront-shared
npm run typecheck --workspace @celebix/storefront-shared
```

Expected: PASS.

- [ ] **Step 6: Commit server cart/checkout runtime**

```bash
git add packages/saas-data/src/storefront-commerce packages/saas-data/src/index.ts apps/storefront-shared/lib/cart apps/storefront-shared/app/api/cart apps/storefront-shared/app/api/checkout apps/storefront-shared/lib/default-runtime.ts
git commit -m "feat(storefront): expose durable cart checkout api"
```

### Task 9: Product purchase controls, cart page, and mounted header utilities

**Files:**
- Create: `apps/storefront-shared/components/ProductPurchasePanel.tsx`
- Create: `apps/storefront-shared/components/ProductPurchasePanel.test.ts`
- Create: `apps/storefront-shared/components/CartPageClient.tsx`
- Create: `apps/storefront-shared/components/CartPageClient.test.ts`
- Create: `apps/storefront-shared/components/CartStatusProvider.tsx`
- Create: `apps/storefront-shared/app/cart/page.tsx`
- Modify: `apps/storefront-shared/app/products/[slug]/page.tsx`
- Modify: `apps/storefront-shared/components/ProductCard.tsx`
- Modify: `apps/storefront-shared/components/Header.tsx`
- Modify: `apps/storefront-shared/components/StorefrontFrame.tsx`
- Modify: `apps/storefront-shared/app/globals.css`

**Interfaces:**
- `ProductPurchasePanel` receives `Readonly<{ product: PublicProduct }>` and emits no TenantContext/private IDs.
- `CartStatusProvider` is the single client owner of canonical cart count and refresh after mutation.

- [ ] **Step 1: Write failing component behavior tests**

Tests prove explicit variant selection, unavailable variants disabled, add payload exactness, buy-now independent action, one submit while pending, finite feedback, cart quantity/remove/version conflict refresh, empty state, header count update, 48×48 controls, and no nested button/link.

- [ ] **Step 2: Run red component tests**

Run: `npm test --workspace @celebix/storefront-shared -- --test-name-pattern='purchase panel|cart page|cart status'`

Expected: FAIL because components/page are missing.

- [ ] **Step 3: Implement purchase controls**

Render a radio/select variant group, bounded quantity, **Sepete ekle**, and **Şimdi satın al**. Add calls the canonical API then opens an accessible status region. Buy now calls its API and follows only the returned fixed `/checkout?intent=buy-now` destination.

- [ ] **Step 4: Implement cart page and mount utilities**

Server page renders the shell; client fetches canonical cart, sends versioned mutations, and renders primary media, titles, price, quantity, remove, subtotal/shipping/total, checkout readiness, empty state, and fixed links. Mount `StoreUtilities` in Header with real search/favorites/account/cart links and canonical cart count.

- [ ] **Step 5: Run storefront tests/typecheck/build**

Run:

```bash
npm test --workspace @celebix/storefront-shared
npm run typecheck --workspace @celebix/storefront-shared
npm run build --workspace @celebix/storefront-shared
```

Expected: PASS.

- [ ] **Step 6: Commit purchase and cart UI**

```bash
git add apps/storefront-shared/components/ProductPurchasePanel* apps/storefront-shared/components/CartPageClient* apps/storefront-shared/components/CartStatusProvider.tsx apps/storefront-shared/app/cart apps/storefront-shared/app/products/'[slug]'/page.tsx apps/storefront-shared/components/ProductCard.tsx apps/storefront-shared/components/Header.tsx apps/storefront-shared/components/StorefrontFrame.tsx apps/storefront-shared/app/globals.css
git commit -m "feat(storefront): add product cart experience"
```

### Task 10: Checkout, receipt, and browser-bound account UI

**Files:**
- Create: `apps/storefront-shared/lib/checkout-form.ts`
- Create: `apps/storefront-shared/lib/checkout-form.test.ts`
- Create: `apps/storefront-shared/components/CheckoutForm.tsx`
- Create: `apps/storefront-shared/components/CheckoutForm.test.ts`
- Create: `apps/storefront-shared/components/CheckoutSummary.tsx`
- Create: `apps/storefront-shared/app/checkout/page.tsx`
- Create: `apps/storefront-shared/app/checkout/success/page.tsx`
- Create: `apps/storefront-shared/app/account/page.tsx`
- Modify: `apps/storefront-shared/app/globals.css`
- Modify: `apps/storefront-shared/lib/storefront-app.test.ts`

**Interfaces:**
- Checkout client submits exact `{ operationId, cartVersion, intentKind, contact, shippingAddress, shippingMethod: "standard", paymentKind, note? }`.
- Receipt/account server pages read only HttpOnly credentials and repository projections.

- [ ] **Step 1: Write failing validation/component/page tests**

Tests catch invalid email/name/phone/address/city/district/postal code/note, browser price/payment ID injection, advancing without shipping, inactive COD visibility, incomplete bank transfer visibility, double submit, safe 303, bank receipt instructions, refresh idempotency, account credential isolation, and no raw credential/private ID in rendered trees.

- [ ] **Step 2: Run red checkout tests**

Run: `npm test --workspace @celebix/storefront-shared -- --test-name-pattern='checkout form|receipt|guest account'`

Expected: FAIL because checkout/account UI is missing.

- [ ] **Step 3: Implement bounded checkout form**

Adapt the donor's two-column/two-step hierarchy, not its code. Step one collects exact delivery fields. Step two renders only server-projected payment methods. Submit sends no items, price, shipping amount, IBAN, store ID, customer ID, or order ID. The summary is always the last server quote.

- [ ] **Step 4: Implement success and account pages**

Success resolves the receipt credential and renders order reference, lines, totals, payment method, and bank details/instructions. Account resolves only customer credential and lists bounded receipts from the current store. Missing/invalid credentials render truthful empty/loginless states without leaking existence.

- [ ] **Step 5: Run storefront full gates**

Run:

```bash
npm test --workspace @celebix/storefront-shared
npm run typecheck --workspace @celebix/storefront-shared
npm run build --workspace @celebix/storefront-shared
```

Expected: PASS.

- [ ] **Step 6: Commit checkout/account UI**

```bash
git add apps/storefront-shared/lib/checkout-form* apps/storefront-shared/components/Checkout* apps/storefront-shared/app/checkout apps/storefront-shared/app/account apps/storefront-shared/app/globals.css apps/storefront-shared/lib/storefront-app.test.ts
git commit -m "feat(storefront): add verified checkout and receipts"
```

### Task 11: Cross-layer security, accessibility, and responsive acceptance

**Files:**
- Create: `tests/saas-phase3/starter-commerce/in-process.test.mjs`
- Create: `tests/saas-phase3/starter-commerce/static-security.test.mjs`
- Create: `tests/saas-phase3/starter-commerce/browser-acceptance.mjs`
- Modify: `tests/saas-phase3/run-current-suite.mjs`
- Modify: `tests/saas-phase3/current-test-matrix.json`
- Modify only defects found by this task within files introduced/authorized by Tasks 1–10

**Interfaces:**
- Browser script accepts `STOREFRONT_BASE_URL` and writes screenshots only beneath `.codex-artifacts/starter-commerce/`; artifacts remain untracked.

- [ ] **Step 1: Write failing cross-layer tests**

Test real route composition and static boundaries: donor byte diff zero, no Supabase/legacy API, no tenant authority in browser, exact cookies/CSP, policy keys/footer links, no private IDs/credentials, runtime preflight 071/072, and no unmounted/fake controls.

- [ ] **Step 2: Run and observe any missing acceptance behavior**

Run:

```bash
node --test tests/saas-phase3/starter-commerce/in-process.test.mjs tests/saas-phase3/starter-commerce/static-security.test.mjs
```

Expected: FAIL only for acceptance assertions not yet implemented; fix the product behavior, not the assertion.

- [ ] **Step 3: Run local browser acceptance**

Start the built shared storefront against disposable fixtures and run:

```bash
STOREFRONT_BASE_URL=http://127.0.0.1:3450 node tests/saas-phase3/starter-commerce/browser-acceptance.mjs
```

Assert add/cart/buy-now/checkout/receipt/search/favorites/account/policies, desktop 1440×900 and 1025×768, mobile 1024×768/390×844/320×720, zero horizontal overflow, 48×48 targets, CTA contrast ≥4.5:1, reduced-motion duration ≈0.01ms, keyboard order, live regions, and no console/network error.

- [ ] **Step 4: Repair observed product defects with focused red-green cycles**

For each defect, add the smallest behavior test that fails for the exact bug, run it red, patch only the owning component/module, and rerun green plus the browser assertion.

- [ ] **Step 5: Commit integrated acceptance**

```bash
git add tests/saas-phase3/starter-commerce tests/saas-phase3/run-current-suite.mjs tests/saas-phase3/current-test-matrix.json apps/storefront-shared apps/customer-panel packages/saas-contracts packages/saas-data
git commit -m "test(storefront): verify starter commerce experience"
```

### Task 12: Whole-branch verification and isolated-staging gate

**Files:**
- No planned production file changes
- Untracked evidence: `.codex-artifacts/starter-commerce/**`

**Interfaces:**
- Produces the exact code-complete SHA and verification report. Deployment remains a separate authorization gate.

- [ ] **Step 1: Run disposable PostgreSQL and cumulative suites**

```bash
node tests/saas-phase3/storefront-policy-search/postgres-harness.mjs
node tests/saas-phase3/storefront-cart-checkout/postgres-harness.mjs
node tests/saas-phase3/run-current-suite.mjs
```

Expected: all declared totals PASS and every disposable PostgreSQL process/socket/directory is removed.

- [ ] **Step 2: Run workspace regression matrix**

```bash
npm ci
npm test --workspace @celebix/saas-contracts
npm test --workspace @celebix/saas-data
npm test --workspace @celebix/customer-panel
npm test --workspace @celebix/storefront-shared
npm test --workspace @celebix/owner
npm run typecheck --workspace @celebix/saas-contracts
npm run typecheck --workspace @celebix/saas-data
npm run typecheck --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/storefront-shared
npm run typecheck --workspace @celebix/owner
npm run build --workspace @celebix/customer-panel
npm run build --workspace @celebix/storefront-shared
npm run build --workspace @celebix/owner
```

Expected: PASS.

- [ ] **Step 3: Run diff, donor, secret, and forbidden-authority gates**

```bash
git diff --check
test -z "$(git diff --name-only bbe68885986279f8642f1852ac3db74eb8bc06ab...HEAD -- apps/admin apps/storefront-base)"
git diff --name-only bbe68885986279f8642f1852ac3db74eb8bc06ab...HEAD
git status --short
```

Run the tracked-diff scanner without printing matches; fail on credential, token, private-key, raw-cookie, Supabase, `/api/admin/`, browser `storeId|tenantId|membershipId|planId`, wildcard CSP, or production credential patterns.

- [ ] **Step 4: Push code-complete branch normally**

```bash
git push -u origin codex/starter-theme-commerce-foundation
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/codex/starter-theme-commerce-foundation)"
```

- [ ] **Step 5: Stop before staging deployment**

Report exact branch/SHA, commit map, changed files, checkbox count, red/green evidence, PostgreSQL totals, workspace totals, browser screenshots/measurements, donor diff zero, secret scans, clean worktree, remote parity, staging deployment zero, and production impacts all zero. Request separate authorization for migration backup/apply and isolated customer-panel/storefront staging deployment.
