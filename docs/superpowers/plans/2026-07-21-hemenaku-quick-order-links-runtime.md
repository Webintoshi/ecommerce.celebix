# Hemenaku Quick-Order Links Runtime, Redemption, and Settlement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the reviewed hidden quick-order-link foundation into the real Hemenaku-style merchant builder/list, exact-host public redemption, PayTR sandbox checkout, callback-driven one-order settlement, and only then activate `Siparişler > Hızlı Sipariş`.

**Architecture:** The merchant panel remains authenticated by the existing PostgreSQL panel session and `TenantContext`; browsers submit only merchant intent and never store/tenant/provider/price authority. Server-only A256GCM keyrings seal link and provider credentials, PostgreSQL owns quote, reservation, attempt, callback, and order invariants, and the shared storefront resolves every bearer token inside the exact signed-proxy hostname authority before it can initiate checkout. PayTR return redirects are informational; only a verified server-to-server callback can atomically consume stock, create exactly one order, and mark the link paid.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.9, Node `crypto`, PostgreSQL 16, `pg`, existing `@celebix/saas-contracts`, `@celebix/saas-data`, `@celebix/saas-storefront-runtime`, official PayTR iFrame and status-query APIs.

## Global Constraints

- Approved design authority: `docs/superpowers/specs/2026-07-21-hemenaku-full-merchant-admin-parity-design.md`.
- Foundation authority: commits `b061f18d..eccbeeaf439d5bcdd393f333d73897ded877c51f`; do not rewrite migrations `001–025`.
- Donor authority is read-only and pinned to `fc6c5318b47f045a7cefcedc7612d5b10563ba32`; inspect it only with `git show <sha>:<path>`.
- `apps/admin/**` must remain byte-for-byte unchanged.
- Full `TenantContext`, store/tenant/principal/membership/plan IDs, database authority, provider secrets, token digests, sealed envelopes, callback hashes, PayTR tokens, and session credentials must not cross into client components, public DTOs, RSC payloads, logs, analytics, or error payloads. There are exactly two protocol-bound exceptions: the authenticated merchant-only `QuickOrderMerchantUrl.url` contains the original shareable redemption path segment, and the provider-issued `iframe_token` appears only in the `src` of one server-rendered PayTR iframe HTML response after cookie-bound checkout initiation. Neither token is exposed as a separate field or application-origin URL parameter.
- Browser input is never authority for store, hostname, product/variant snapshot, price, total, currency, provider configuration, order/payment status, or settlement.
- A quick-link create/duplicate replay must reveal the original persisted token through a server-only authenticated projection; it must never mint a replacement token.
- Raw redemption tokens are 32 random bytes encoded as canonical unpadded base64url; persistence receives only SHA-256 digest plus an A256GCM envelope.
- A256GCM AAD binds envelope version, purpose, store ID, object ID, digest, and key ID. One key is encrypt-active; retired keys are decrypt-only. Unknown or duplicate key IDs fail closed.
- Public redemption resolves `(exact persisted store hostname, token digest, now)` in one authority boundary. Global digest-first lookup and suffix/default-store fallback are forbidden.
- Successful redemption immediately exchanges the path token for a random, digested `__Host-celebix_quick` HttpOnly/Secure/SameSite=Lax cookie and redirects to token-free `/odeme/hizli`.
- PayTR provider initiation is server-side only at `https://www.paytr.com/odeme/api/get-token`, uses `test_mode=1` in isolated staging, and never disables TLS verification. The provider token is opened only by the token-free same-origin `GET /odeme/hizli/odeme` HTML route and is embedded solely as `https://www.paytr.com/odeme/guvenli/<token>` in an iframe `src` under an exact-origin `frame-src` CSP.
- PayTR success/failure return URLs are informational. No query string or browser redirect can create/update an order or mark payment complete.
- Callback authentication is exact `base64(HMAC-SHA256(merchant_oid + merchant_salt + status + total_amount, merchant_key))` with constant-time comparison. Valid first and duplicate callbacks return exactly plain `OK`.
- A successful callback validates persisted `payment_amount` against the quote; signed `total_amount` may be higher for installments and is stored separately.
- Settlement is one PostgreSQL transaction: callback receipt, attempt, link, reservations, variant stock, order, order items, event, link paid state, and attempt success.
- At most one order may exist for a quick link, enforced by a nullable store-composite `orders.quick_order_link_id` foreign key plus a unique partial index and a source/link consistency CHECK.
- Direct table DML stays denied. Merchant functions are executable only by `celebix_saas_app`; public checkout/callback functions are executable only by existing narrow `celebix_saas_workflow`. Do not broaden `celebix_saas_host_resolver`.
- Migration 027 activates the previously placeholder `celebix_saas_workflow` with schema USAGE plus only its exact checkout functions. Historical migration/assertion files and the Phase 2A1 manifest remain byte-pinned; the new 027 assertion owns the current exact function-only authority proof.
- Navigation stays unchanged until the real isolated PayTR sandbox create → redeem → callback → single-order proof is complete.
- No donor/admin iframe, reverse proxy to the donor, Supabase/legacy admin auth/API, fake KPI, fake customer search, fake provider success, or unsupported menu is introduced. The sole iframe is the public checkout's exact PayTR iframe required by the official iFrame API; it cannot load any other origin and is never present in the merchant panel.
- No production connection, credential, deployment, mutation, merge, or pilot activation.
- No new external dependency is permitted. Only missing direct internal workspace dependencies and already-locked `pg`/`server-only` declarations may be added with minimal lockfile changes.
- Staging parses exact `CELEBIX_QUICK_ORDER_ACTIVE_KEY_ID` and `CELEBIX_QUICK_ORDER_KEYS` fields. The latter is a whitespace-free comma list of `<canonical-key-id>:<32-byte-canonical-base64url>` entries; duplicate IDs, duplicate bytes, missing active ID, empty segments, or noncanonical encodings fail closed. Customer-panel and storefront use matching values and never print them.
- Staging PayTR input is exactly `CELEBIX_PAYTR_STAGING_MERCHANT_ID`, `CELEBIX_PAYTR_STAGING_MERCHANT_KEY`, `CELEBIX_PAYTR_STAGING_MERCHANT_SALT`, `CELEBIX_PAYTR_STAGING_CALLBACK_URL`, and `CELEBIX_PAYTR_STAGING_TEST_MODE=1`. The callback URL is canonical HTTPS with exact `/api/payments/paytr/callback`; every field is rejected outside `approved_staging`/`staging`.
- Official protocol references: [PayTR iFrame Step 1](https://dev.paytr.com/en/iframe-api/iframe-api-1-adim), [PayTR iFrame Step 2](https://dev.paytr.com/iframe-api/iframe-api-2-adim), [PayTR integration process](https://dev.paytr.com/home/iframe-api-entegrasyon-sureci), and [PayTR status query](https://dev.paytr.com/durum-sorgu).

### PayTR protocol decision

The official iFrame API does not document a top-level redirect to `/odeme/guvenli/<iframe_token>`; it requires the provider URL to be loaded in an iframe. Therefore this plan does **not** perform the previously considered top-level PayTR 303. Checkout initiation redirects only to the token-free same-origin `/odeme/hizli/odeme`; that route returns a non-RSC, no-store HTML document containing exactly one iframe whose source is the canonical PayTR secure URL. This is a payment-provider protocol boundary, not an iframe transplant of the donor or another admin application. The application never accepts iframe URLs from a browser, never uses a wildcard or generic `https:` CSP, and never treats a return URL as payment truth.

---

## File Structure

### Shared contracts and server-only data

- `packages/saas-contracts/src/quick-orders/public-types.ts` — public redemption, checkout-state, and merchant URL response DTOs with no private authority.
- `packages/saas-contracts/src/quick-orders/public-validation.ts` — exact-key, bounded, deep-frozen public validators.
- `packages/saas-contracts/src/quick-orders/{types,validation,index,quick-orders.test}.ts` — merchant create intent and export/test extensions.
- `packages/saas-data/src/quick-orders/token-crypto.ts` — server-only A256GCM keyring, sealing, opening, digest generation, constant-time-safe validation.
- `packages/saas-data/src/quick-orders/private-repository.ts` — authenticated provider readiness and sealed link/config projections.
- `packages/saas-data/src/quick-orders/public-repository.ts` — exact-host redemption sessions and status reads under `celebix_saas_workflow`.
- `packages/saas-data/src/payments/{types,repository,errors,validation,index}.ts` — attempt initiation/finalization/callback settlement repository.
- Corresponding focused tests plus `packages/saas-data/src/index.ts` exports.

### Additive PostgreSQL 16 authority

- `apps/owner/scripts/sql/saas/202607220026_quick_order_checkout_runtime.{up,down}.sql`
- `apps/owner/scripts/sql/saas/202607220026_quick_order_checkout_runtime_assertions.sql`
- `apps/owner/scripts/sql/saas/202607220027_quick_order_checkout_api.{up,down}.sql`
- `apps/owner/scripts/sql/saas/202607220027_quick_order_checkout_api_assertions.sql`
- `apps/owner/scripts/sql/saas/phase3b2-quick-order-runtime-manifest.json`
- `tests/saas-phase3/quick-order-runtime/postgres-harness.mjs`
- `tests/saas-phase3/quick-order-runtime/in-process.test.mjs`
- `tests/saas-phase3/quick-order-runtime/static-security.test.mjs`

### Authenticated customer panel

- `apps/customer-panel/lib/server-quick-links/{config,runtime,default}.ts` and tests — approved-staging keyring/runtime composition.
- `apps/customer-panel/lib/quick-link-http/{request-authority,request-input,handler,default}.ts` and tests — session/Origin/path/body authority and repository orchestration.
- `apps/customer-panel/lib/quick-link-ui/client.ts` and tests — safe no-store request client.
- `apps/customer-panel/components/orders/QuickOrderLinksConsole.tsx`
- `apps/customer-panel/components/orders/quick-order-links.module.css`
- `apps/customer-panel/app/orders/quick-links/page.tsx`
- Routes under `apps/customer-panel/app/api/orders/quick-links/**`.
- `apps/customer-panel/lib/server-panel-access/postgres-runtime.ts` — exact 026/027 preflight and repository registration only.

### Exact-host shared storefront and PayTR

- `apps/storefront-shared/lib/checkout/{config,runtime,public-quick-link,paytr,callback-authority,redemption-cookie,trusted-client-ip}.ts` and tests.
- `apps/storefront-shared/app/odeme/hizli/[token]/route.ts` — token claim and scrub redirect.
- `apps/storefront-shared/app/odeme/hizli/page.tsx` — cookie-bound quote and checkout form.
- `apps/storefront-shared/app/odeme/hizli/odeme/route.ts` — token-free, cookie-bound, server-rendered PayTR iframe HTML with exact CSP and no RSC serialization.
- `apps/storefront-shared/app/odeme/hizli/sonuc/page.tsx` — informational callback-status view only.
- `apps/storefront-shared/app/api/quick-order/checkout/route.ts` — same-origin form initiation and same-origin 303 to the token-free iframe document.
- `apps/storefront-shared/app/api/quick-order/status/route.ts` — cookie-bound no-store status.
- `apps/storefront-shared/scripts/reconcile-quick-orders.mjs` — server-process-only bounded cleanup/status reconciliation command; no public HTTP route.
- `apps/storefront-shared/app/api/payments/paytr/callback/route.ts` — callback HMAC + atomic settlement + exact `OK`.
- `apps/storefront-shared/{proxy.ts,package.json}` and root `package-lock.json` — exact route-owned CSP/callback classifier and direct dependencies only.

### Final activation only

- `apps/customer-panel/lib/panel-ui/navigation.ts`
- `apps/customer-panel/lib/panel-ui/navigation.test.ts`
- `apps/customer-panel/components/panel/PanelNavigation.tsx`
- Exact staging evidence remains untracked under `.codex-artifacts/`; never commit it.

---

## Pre-execution documentation checkpoint

- [ ] Commit the reviewed specification clarification and this plan before Task 1:

```bash
git diff --check
git add docs/superpowers/specs/2026-07-21-hemenaku-full-merchant-admin-parity-design.md docs/superpowers/plans/2026-07-21-hemenaku-quick-order-links-runtime.md
git commit -m "docs(saas): plan quick order runtime"
```

Record that exact documentation SHA in `.superpowers/sdd/progress.md` on a line exactly `Documentation checkpoint SHA: <40-lowercase-hex>`; every implementer treats both files as frozen requirements. Task 12 must prove they are unchanged from that SHA, and `git status --short` may then contain only the pre-existing untracked `.codex-artifacts/`.

---

### Task 1: Public DTOs and server-only A256GCM keyring

**Files:**
- Create: `packages/saas-contracts/src/quick-orders/public-types.ts`
- Create: `packages/saas-contracts/src/quick-orders/public-validation.ts`
- Modify: `packages/saas-contracts/src/quick-orders/types.ts:1-end`
- Modify: `packages/saas-contracts/src/quick-orders/validation.ts:1-end`
- Modify: `packages/saas-contracts/src/quick-orders/index.ts:1-end`
- Modify: `packages/saas-contracts/src/quick-orders/quick-orders.test.ts:1-end`
- Create: `packages/saas-data/src/quick-orders/token-crypto.ts`
- Create: `packages/saas-data/src/quick-orders/token-crypto.test.ts`
- Create: `packages/saas-data/src/quick-orders/provider-configuration.ts`
- Create: `packages/saas-data/src/quick-orders/provider-configuration.test.ts`
- Modify: `packages/saas-data/src/quick-orders/index.ts:1-end`

**Interfaces:**
- Produces:

```ts
export interface QuickOrderCreateIntent {
  readonly items: readonly Readonly<{ variantId: string; quantity: number }>[];
  readonly customerName: string;
  readonly customerEmail: string;
  readonly customerPhone: string;
  readonly shippingAddress: Readonly<QuickOrderAddress>;
  readonly billingAddress: Readonly<QuickOrderAddress>;
  readonly customerNote?: string;
  readonly internalLabel?: string;
  readonly shippingCents: number;
  readonly discountCents: number;
  readonly expiryHours: 4 | 12 | 24 | 48 | 72;
}

export interface QuickOrderPublicQuote {
  readonly schemaVersion: 1;
  readonly status: "active" | "opened";
  readonly merchantName: string;
  readonly currency: "TRY";
  readonly subtotalCents: number;
  readonly shippingCents: number;
  readonly discountCents: number;
  readonly totalCents: number;
  readonly expiresAt: string;
  readonly items: readonly Readonly<{
    productName: string;
    variantName?: string;
    imageUrl?: string;
    unitPriceCents: number;
    quantity: number;
    lineTotalCents: number;
  }>[];
}

export interface QuickOrderMerchantUrl {
  readonly url: string;
  readonly expiresAt: string;
}

export type CheckoutState =
  | Readonly<{ kind: "ready"; quote: QuickOrderPublicQuote }>
  | Readonly<{ kind: "processing" }>
  | Readonly<{ kind: "paid"; orderNumber: string }>
  | Readonly<{ kind: "failed" }>
  | Readonly<{ kind: "unavailable" }>;

export type SealedEnvelope = Readonly<{
  algorithm: "A256GCM";
  ciphertext: string;
  iv: string;
  keyId: string;
  tag: string;
  version: 1;
}>;

export interface QuickLinkKeyring {
  readonly activeKeyId: string;
  readonly keys: readonly Readonly<{ keyId: string; key: Uint8Array }>[];
}

export function generateQuickLinkToken(randomBytes?: (size: number) => Buffer): string;
export function digestQuickLinkToken(token: string): string;
export function sealQuickLinkSecret(input: Readonly<{
  plaintext: string;
  purpose: "link-token" | "provider-config" | "provider-token";
  storeId: string;
  objectId: string;
  digest: string;
  keyring: QuickLinkKeyring;
}>): SealedEnvelope;
export function openQuickLinkSecret(input: Readonly<{
  envelope: SealedEnvelope;
  purpose: "link-token" | "provider-config" | "provider-token";
  storeId: string;
  objectId: string;
  digest: string;
  keyring: QuickLinkKeyring;
}>): string;

export interface CanonicalPaytrConfiguration {
  readonly version: 1;
  readonly merchantId: string;
  readonly merchantKey: string;
  readonly merchantSalt: string;
  readonly callbackUrl: string;
  readonly testMode: 1;
}
export function serializeCanonicalPaytrConfiguration(input: CanonicalPaytrConfiguration): string;
export function parseCanonicalPaytrConfiguration(serialized: string): CanonicalPaytrConfiguration;
export function digestCanonicalPaytrConfiguration(serialized: string): string;
```

- [ ] **Step 1: Write failing exact-key and crypto tests**

Add table-driven tests for unknown/missing/inherited keys, hostile getters/proxies, arrays, mutation, noncanonical UUID/e-mail/required phone/address/timestamp/money/status, non-`TRY` currency, private IDs/material in public DTOs, invalid 31/33-byte keys, duplicate key IDs, unknown retired key, changed AAD field, changed ciphertext/tag/IV, noncanonical base64url, and input mutation. Assert one active key encrypts, a retired key decrypts an old envelope, and re-encryption does not change the raw token. Provider configuration tests require exact own keys, bounded non-whitespace merchant values, canonical HTTPS callback URL with exact `/api/payments/paytr/callback` and no credentials/query/fragment/port, `testMode === 1`, stable field ordering, parse→serialize byte equality, and digest equality.

- [ ] **Step 2: Run RED**

```bash
npm test --workspace @celebix/saas-contracts -- --test-name-pattern='quick order'
node --experimental-strip-types --test packages/saas-data/src/quick-orders/token-crypto.test.ts packages/saas-data/src/quick-orders/provider-configuration.test.ts
```

Expected: FAIL because the new public validators and crypto exports do not exist.

- [ ] **Step 3: Implement minimal immutable validators and crypto**

Use `randomBytes(32).toString("base64url")`, lowercase SHA-256 hex, 12-byte random IV, 16-byte GCM tag, and canonical base64url. Copy every key byte array before use. Build AAD from an exact JSON array, never an object with unstable key ordering; sealing uses `activeKeyId`, while opening uses the persisted `envelope.keyId`:

```ts
const aad = Buffer.from(JSON.stringify([
  "celebix-quick-link", 1, input.purpose, input.storeId,
  input.objectId, input.digest, selectedEnvelopeKeyId,
]), "utf8");
```

Copy exact own data properties into new frozen objects. Do not export a function that serializes plaintext or secrets for browser code.

Canonical provider bytes are exactly the UTF-8 encoding of `JSON.stringify(["celebix-paytr",1,merchantId,merchantKey,merchantSalt,callbackUrl,1])`; the parser requires byte-for-byte reserialization equality and returns a deep-frozen object. The configuration digest is lowercase SHA-256 of those exact bytes. This server-only helper is the single producer/consumer contract used by customer-panel activation, storefront initiation, callback verification, and status reconciliation.

- [ ] **Step 4: Run GREEN and typecheck**

```bash
npm test --workspace @celebix/saas-contracts
npm run typecheck --workspace @celebix/saas-contracts
npm test --workspace @celebix/saas-data
npm run typecheck --workspace @celebix/saas-data
```

Expected totals: contracts 75/75; token crypto 18/18 and data workspace 132/132; both typechecks PASS.

- [ ] **Step 5: Review and commit**

```bash
git add packages/saas-contracts/src/quick-orders packages/saas-data/src/quick-orders/token-crypto.ts packages/saas-data/src/quick-orders/token-crypto.test.ts packages/saas-data/src/quick-orders/provider-configuration.ts packages/saas-data/src/quick-orders/provider-configuration.test.ts packages/saas-data/src/quick-orders/index.ts
git commit -m "feat(saas): add quick order runtime contracts"
```

---

### Task 2: PostgreSQL checkout schema, terminal guards, and least privilege

**Files:**
- Create: `apps/owner/scripts/sql/saas/202607220026_quick_order_checkout_runtime.up.sql`
- Create: `apps/owner/scripts/sql/saas/202607220026_quick_order_checkout_runtime.down.sql`
- Create: `apps/owner/scripts/sql/saas/202607220026_quick_order_checkout_runtime_assertions.sql`
- Create: `apps/owner/scripts/sql/saas/phase3b2-quick-order-runtime-manifest.json`
- Create: `tests/saas-phase3/quick-order-runtime/postgres-harness.mjs`

**Interfaces:**
- Produces nullable additions `orders.quick_order_link_id uuid`, `orders.billing_address jsonb`, composite `(store_id,quick_order_link_id) -> quick_order_links(store_id,id)`, unique partial `(store_id,quick_order_link_id) WHERE quick_order_link_id IS NOT NULL`, and a CHECK binding `source='quick_link'` exactly to a non-null quick-link ID. Migration precondition rejects any historical `source='quick_link'` order that cannot be bound rather than weakening the CHECK.
- Adds nullable `checkout_provider_configs.configuration_digest char(64)` with canonical lowercase SHA-256 validation. Existing configurations remain unreadable by the runtime until an owner/admin reconfiguration writes a digest-bound envelope; no digest is fabricated from ciphertext.
- Replaces the historical unconditional `(store_id,provider_key)` UNIQUE constraint with an equivalent unique partial index for rows whose status is not `revoked`. A revoked configuration remains immutable and cannot be reactivated, while a later owner/admin may provision a new configuration ID for the same store/provider; old link/attempt foreign keys and immutable snapshots remain bound to the revoked historical row.
- Produces `saas.quick_order_redemption_sessions`, `saas.checkout_payment_attempts`, `saas.checkout_inventory_reservations`, `saas.checkout_callback_receipts`, `saas.checkout_reconciliation_jobs`, singleton `saas.checkout_reconciliation_run`, `saas.checkout_reconciliation_receipts`, `saas.checkout_operations`.
- `checkout_payment_attempts.merchant_oid` is globally UNIQUE as well as exactly 32 lowercase hex characters. A collision is a controlled no-mutation result before any provider call; it is never resolved by overwriting or by attaching one provider transaction to another attempt.
- `checkout_payment_attempts.status`: `reserved|provider_ready|initiation_unknown|succeeded|failed|expired`.
- `checkout_inventory_reservations.status`: `held|consumed|released|expired`.
- Every quick-order attempt/receipt/order is `TRY` only; provider `TL` is normalized to persisted `TRY` at the server boundary, and every other currency fails before provider access or mutation.
- No application role receives table privileges.

- [ ] **Step 1: Write PostgreSQL scenarios 1–18 first**

Pin exact columns, FKs, CHECKs, indexes, owner, forced RLS, empty PUBLIC ACLs, app/host/workflow table-DML denial, composite store authority, canonical UUID/digest/envelope/timestamps, JS-safe versions, globally unique canonical `merchant_oid` plus collision denial, terminal transitions, one held reservation per attempt+variant with immutable `stock_tracked`, tracked/untracked semantics, one callback receipt per attempt+callback digest, one bounded reconciliation job per attempt, immutable reconciliation receipts, one order per source link, immutable operation/callback receipts, down/reapply, partial-start cleanup, and manifest bytes.

- [ ] **Step 2: Run RED on native PostgreSQL 16**

```bash
node tests/saas-phase3/quick-order-runtime/postgres-harness.mjs
```

Expected: FAIL scenario 1 because migration 026 is absent.

- [ ] **Step 3: Implement migration 026**

The payment attempt stores expected quote amounts/currency, high-entropy `merchant_oid` as exactly 32 lowercase hex characters derived from 16 random bytes, provider/config identifiers and version, a full configuration digest/key-ID/sealed-envelope snapshot, sealed provider token plus its digest only after readiness, callback/settlement timestamps, version, and no raw secrets. Rotation or revocation blocks new attempts but does not alter an already persisted attempt snapshot; that snapshot remains decryptable through callback/reconciliation receipt retention so terminal duplicate callbacks and post-query duplicates can still be authenticated before exact `OK`. Reservations carry store, attempt, link, product, variant, quantity and terminal lifecycle. Redemption sessions store only cookie digest, store/link, expiry, consumed/revoked timestamps, and version.

Add owner-only transition triggers so revoked provider configurations, terminal attempts, reservations, receipts, and paid links cannot be reopened. A separate quick-link transition guard denies `cancelled`/`expired` transitions and expiry shortening while any `reserved|provider_ready|initiation_unknown` attempt still owns held reservations; there is no archive surface in this schema. Migration 026 `CREATE OR REPLACE`s `quick_links_cancel` so it prelocks all such live attempts for the link in deterministic attempt-ID order before locking the link and preserves the complete 025 behavior otherwise; the down migration restores the exact 025 function body. Begin-attempt insertion also locks the link before inserting, so a concurrent cancel either wins before any attempt exists (and begin then fails) or observes/prelocks the live attempt and is denied. A proven Step 1 rejection first terminalizes the attempt and releases its hold, after which cancel may succeed; no provider token can be exposed from a cancelled link. Settlement keeps `attempt -> link -> variants -> reservations`; cancellation never holds the link while waiting for an attempt. Tests race cancel/expiry against reserved initiation, provider-ready, initiation-unknown, signed failure, and success settlement and prove no charged-without-order terminal split.

A `reserved` attempt that never reaches the provider has a five-minute pre-provider hold that cleanup may release. `provider_ready` and `initiation_unknown` reservations are never released by time alone: a signed failure callback may release them, while a successful verified status query may only consume them through the same one-order settlement core. A status-query error, timeout, malformed response, or “not found” text is not terminal proof and never releases stock.

Install a reservation-aware `BEFORE UPDATE` guard on the existing `saas.product_variants` table. All checkout functions use the deadlock-safe order `attempt -> link -> product_variants ordered by id -> reservations ordered by variant_id`; a catalog UPDATE already owns the variant row before its guard reads reservations, so it follows the same variant-before-reservation order. While held reservations exist, catalog functions may not archive/deactivate a variant, change `stock_tracking`, or reduce `stock_quantity` below aggregate held tracked quantity; increases and unrelated metadata edits remain allowed.

Migration 026 also `CREATE OR REPLACE`s the existing `saas.catalog_archive_product` with its prior behavior plus one mandatory prelock: select all affected `product_variants` by `(store_id, product_id)` using `ORDER BY id FOR UPDATE` before its multi-row UPDATE. The down migration restores the exact pre-026 function body. Single-variant update/archive paths already lock their one variant before the guard. PostgreSQL tests run a two-variant product archive concurrently with reversed-order checkout settlement and require deterministic completion without deadlock.

Each reservation snapshots `stock_tracked`. A variant with `stock_tracking=true` is availability-checked and decremented exactly once at settlement. A variant with `stock_tracking=false` still receives a reservation row for lifecycle/idempotency but has no quantity ceiling and is not decremented. Any `stock_tracking` toggle while a held reservation exists is denied, preventing semantic switching mid-payment. The guard is owner-defined and cannot be disabled by application roles. Inactive/archived variants and insufficient aggregate tracked stock fail before external provider access. Backfill no secret/digest data; both new order columns remain nullable for historical non-quick-link orders. The down migration removes only 026 objects/constraints/triggers and restores prior catalog behavior.

- [ ] **Step 4: Run GREEN**

```bash
node tests/saas-phase3/quick-order-runtime/postgres-harness.mjs
```

Expected: exact 18/18 PASS with rollback/reapply and cleanup.

- [ ] **Step 5: Review and commit**

```bash
git add apps/owner/scripts/sql/saas/202607220026_* apps/owner/scripts/sql/saas/phase3b2-quick-order-runtime-manifest.json tests/saas-phase3/quick-order-runtime/postgres-harness.mjs
git commit -m "feat(saas): add quick order checkout schema"
```

---

### Task 3: Merchant reveal, exact-host redemption, and attempt SQL

**Files:**
- Create: `apps/owner/scripts/sql/saas/202607220027_quick_order_checkout_api.up.sql`
- Create: `apps/owner/scripts/sql/saas/202607220027_quick_order_checkout_api.down.sql`
- Create: `apps/owner/scripts/sql/saas/202607220027_quick_order_checkout_api_assertions.sql`
- Modify: `apps/owner/scripts/sql/saas/phase3b2-quick-order-runtime-manifest.json:1-end`
- Modify: `tests/saas-phase3/quick-order-runtime/postgres-harness.mjs:1-end`

**Interfaces:**
- Merchant role (`celebix_saas_app`):

```text
quick_links_get_provider_readiness(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamptz) -> one safe row
quick_links_configure_provider(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamptz, p_provider_config_id uuid, p_expected_version bigint, p_configuration_digest text, p_configuration_key_id text, p_sealed_configuration jsonb, p_operation_id uuid, p_fingerprint text) -> safe readiness row
quick_links_revoke_provider(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamptz, p_provider_config_id uuid, p_expected_version bigint, p_operation_id uuid, p_fingerprint text) -> safe readiness row
quick_links_reveal_credential(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamptz, p_link_id uuid) -> sealed token + canonical hostname server-only row
quick_links_reveal_provider_configuration(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamptz, p_provider_config_id uuid) -> sealed config server-only row
```

- Workflow role (`celebix_saas_workflow`):

```text
quick_links_claim_redemption(hostname, token_digest, redemption_id, redemption_digest, now, expires_at)
quick_links_resolve_redemption(hostname, redemption_digest, now)
quick_links_revoke_redemption(hostname, redemption_digest, operation_id, fingerprint, now)
checkout_begin_attempt(hostname, redemption_digest, attempt_id, merchant_oid, operation_id, fingerprint, now)
checkout_mark_provider_ready(attempt_id, operation_id, fingerprint, sealed_provider_token, provider_token_digest, now)
checkout_mark_initiation_unknown(attempt_id, operation_id, fingerprint, now)
checkout_mark_initiation_failed(attempt_id, operation_id, fingerprint, now)
checkout_get_payment_presentation(hostname, redemption_digest, now)
checkout_get_callback_authority(merchant_oid, now)
checkout_settle_callback(merchant_oid, callback_digest, operation_id, fingerprint, status, payment_amount, total_amount, currency, payment_type, test_mode, failed_reason_code, failed_reason_message_digest, order_id, order_item_ids, order_event_id, order_number, now)
checkout_begin_reconciliation_run(worker_id, run_token_digest, now, lease_expires_at)
checkout_claim_reconciliation(worker_id, now, lease_expires_at, claim_limit)
checkout_claim_redemption_reconciliation(hostname, redemption_digest, worker_id, now, lease_expires_at)
checkout_apply_reconciliation_success(merchant_oid, worker_id, lease_token, operation_id, fingerprint, payment_amount, total_amount, currency, test_mode, order_id, order_item_ids, order_event_id, order_number, now)
checkout_record_reconciliation_unknown(merchant_oid, worker_id, lease_token, operation_id, fingerprint, next_attempt_at, now)
checkout_finish_reconciliation_run(worker_id, run_token, now)
checkout_cleanup_pre_provider_attempts(worker_id, operation_id, fingerprint, now, cleanup_limit)
checkout_get_redemption_status(hostname, redemption_digest, now)
checkout_recover_attempt_operation(attempt_id, operation_id, kind, fingerprint)
checkout_recover_callback(merchant_oid, callback_digest, operation_id, fingerprint)
checkout_recover_reconciliation(merchant_oid, operation_id, fingerprint)
checkout_recover_reconciliation_run(worker_id, run_token_digest, now)
```

- Every function returns exactly one controlled row and no unhandled typed-input/arithmetic/datetime exception.

- [ ] **Step 1: Extend harness to exact 34 scenarios and prove RED**

Add direct tests for owner/admin configure/rotate/revoke/reveal, editor/analyst denial, config optimistic version/replay, revoked terminal/new-config replacement, rotation/revocation blocking new attempts, an in-flight attempt snapshot surviving later rotation/revocation, replay revealing the same sealed token, no global link oracle, exact canonical domain, alias canonicalization before claim, active/opened-only claims, cookie-digest isolation, redemption expiry/revocation, cross-store denial, exact persisted `TRY`, PayTR Step 1 name/email/address/phone/basket bounds before reservation, global `merchant_oid` collision as a controlled no-mutation result, aggregate tracked reservation stock, untracked reservation/no-decrement semantics, tracking-toggle denial while held, inactive catalog interlock, concurrent catalog stock reduction/archive denial without deadlock, concurrent initiation single winner, cancellation/expiry racing live provider attempts without deadlock or terminal split, five-minute pre-provider cleanup, provider-ready/unknown holds never released by time alone, payment presentation secrecy, attempt recovery, and 026/027 partial rollback/reapply. Keep exactly 34 named scenarios by grouping table-driven cases without removing Task 2 assertions.

- [ ] **Step 2: Run RED**

```bash
node tests/saas-phase3/quick-order-runtime/postgres-harness.mjs
```

Expected: scenarios 1–18 PASS; scenario 19 FAIL because migration 027 is absent.

- [ ] **Step 3: Implement merchant, redemption, and attempt functions**

Implement only provider readiness/configure/revoke/reveal, canonical-host claim/resolve/revoke, begin/ready/unknown/failed attempts, pre-provider cleanup, payment presentation, redemption status, and attempt recovery. `CREATE OR REPLACE` the 025 merchant create and duplicate functions without changing their authority/idempotency contract so they require the persisted link currency exactly `TRY` before storing or revealing a credential; duplicate rejects a historical non-TRY source. Credential reveal and canonical-host claim also reject historical non-TRY rows before token/session/opened-state mutation, so unsupported links cannot be issued or opened. The down migration restores the exact 025 bodies. The authenticated runtime repeats the TRY check before credential generation/repository call, but PostgreSQL remains authoritative. Before inserting any attempt or reservation, `checkout_begin_attempt` rechecks persisted currency exactly `TRY`, customer name 1–60 UTF-8 characters, email 3–100 ASCII without Turkish/control/whitespace alteration, phone 1–20 canonical characters, flattened address 1–400 bounded characters, 1–100 basket lines with each persisted name 1–200 characters, positive JS-safe cents/quantities, and a bounded canonical basket encoding. Every function validates all typed inputs before casts/arithmetic, returns one controlled row, uses the exact role grant, and never exposes a secret in safe projections.

- [ ] **Step 4: Run Task 3 GREEN**

```bash
node tests/saas-phase3/quick-order-runtime/postgres-harness.mjs
```

Expected: exact 34/34 PASS with 026/027 rollback/reapply and cleanup.

- [ ] **Step 5: Review and commit Task 3**

```bash
git add apps/owner/scripts/sql/saas/202607220027_* apps/owner/scripts/sql/saas/phase3b2-quick-order-runtime-manifest.json tests/saas-phase3/quick-order-runtime/postgres-harness.mjs
git commit -m "feat(saas): add quick order checkout authority"
```

---

### Task 4: Atomic callback settlement and status reconciliation SQL

**Files:**
- Modify: `apps/owner/scripts/sql/saas/202607220027_quick_order_checkout_api.up.sql:1-end`
- Modify: `apps/owner/scripts/sql/saas/202607220027_quick_order_checkout_api.down.sql:1-end`
- Modify: `apps/owner/scripts/sql/saas/202607220027_quick_order_checkout_api_assertions.sql:1-end`
- Modify: `apps/owner/scripts/sql/saas/phase3b2-quick-order-runtime-manifest.json:1-end`
- Modify: `tests/saas-phase3/quick-order-runtime/postgres-harness.mjs:1-end`

- [ ] **Step 1: Extend the harness from 34 to exact 48 scenarios**

Add bounded reconciliation claim/lease/backoff, successful status reconciliation through the settlement core, unknown/error status retaining holds, callback lookup opacity, invalid/duplicate hash receipt, failed callback release, exact success/failure protocol shapes, amount/currency/test-mode validation, exact one order, persisted snapshots, stock decrement once, duplicate callback replay, competing callback/status-query settlement one winner, one quick-link order constraint, callback/reconciliation unknown-commit recovery, backup/restore, and final cleanup. Do not reduce the first 34 scenarios.

- [ ] **Step 2: Run Task 4 RED**

```bash
node tests/saas-phase3/quick-order-runtime/postgres-harness.mjs
```

Expected: scenarios 1–34 PASS; scenario 35 FAIL because settlement/reconciliation functions are absent.

- [ ] **Step 3: Implement settlement in deterministic lock order**

Lock `attempt -> link -> product_variants ordered by id -> reservations ordered by variant_id`. On settlement, construct the order from persisted link/item snapshots only. Insert `order_created` with `actor_membership_id = NULL`, `source='quick_link'`, `quick_order_link_id=link.id`, `status='confirmed'`, `payment_status='completed'`, shipping and billing snapshots, and one item per persisted quick-link item. Decrement only reservations whose persisted `stock_tracked` snapshot is true. Do not accept browser/provider names, prices, quantities, addresses, order status, or store IDs.

`checkout_settle_callback` must treat valid duplicates as replay before inspecting regenerated order IDs. A success callback requires canonical JS-safe integer-cent `payment_amount`, documented `payment_type` (`card|eft`), staging `test_mode=1`, and currency and exact quote equality; canonical JS-safe integer-cent `total_amount` must be greater than or equal to `payment_amount` and may be higher for installments. A lower total is underpayment and is denied without mutation. A failed callback requires documented `payment_type`, failure code/message fields and staging `test_mode=1`, stores only a bounded message digest, and permits absent `payment_amount`/currency. Missing `test_mode` is valid in the general protocol but is denied by this approved-staging-only configuration because all initiated attempts persist expected test mode 1. Failed callbacks do not mark the link terminal; they release the attempt reservations and leave an unexpired active/opened link retryable. Success makes link and attempt terminal.

`checkout_get_callback_authority` returns the immutable configuration snapshot for `provider_ready`, `initiation_unknown`, `succeeded`, and `failed` attempts during receipt retention. The route always verifies callback HMAC before asking settlement for replay/conflict. A terminal callback with the same canonical digest returns replay/`OK`; a different callback for a terminal attempt is denied without mutation and never bypasses authentication.

Every write has one stable UUID operation ID and canonical SHA-256 fingerprint. Attempt recovery is scoped by `attempt_id`; callback recovery is scoped by `merchant_oid + callback_digest`; reconciliation recovery is scoped by `merchant_oid`. An unresolved callback `commit_unknown` returns non-`OK` 503 so PayTR retries; a read-only recovery proving the commit returns exact `OK`; the same request never issues a second write.

Callback and reconciliation fingerprints cover only their canonical verified provider facts plus persisted attempt identity; they exclude newly generated order/item/event IDs. Duplicate detection and recovery inspect the immutable receipt/operation result before comparing caller-generated IDs, so a provider retry cannot conflict merely because the process generated fresh UUIDs.

`checkout_claim_reconciliation` claims at most 25 due `provider_ready|initiation_unknown` attempts with `FOR UPDATE SKIP LOCKED`, a canonical worker UUID, a random 32-byte lease token stored only as a digest, a lease of 5–60 seconds, exponential backoff capped at six hours, and no secret-bearing result beyond the server-only immutable provider snapshot. Apply/unknown functions require exact worker ID plus constant-time-matched live lease token, consume the lease atomically, and reject expired/replayed/cross-worker proof. Only a strict PayTR status response with `status='success'`, exact quote `payment_amount`, normalized `TL|TRY -> TRY`, matching `test_mode=1`, and canonical JS-safe `payment_total >= payment_amount` may call `checkout_apply_reconciliation_success`; lower total is underpayment and is denied. Provider errors, “not found”, malformed data, network ambiguity, and timeouts call `checkout_record_reconciliation_unknown`; they never release reservations or fabricate failure. A later signed failure callback remains the only provider proof that releases a provider-ready hold.

The CLI first acquires the singleton reconciliation-run lease with a separate random run-token digest. A live lease makes an overlapping invocation report `busy` and exit successfully without claims; an expired lease may be replaced atomically. Unknown commit on lease acquisition performs one read-only `checkout_recover_reconciliation_run(worker_id,run_token_digest,now)` call and never a second acquisition write. Normal completion proves the raw run token against its digest and clears the lease; finish ambiguity exits nonzero and relies on the bounded 60-second expiry. Output is one safe JSON line containing only `outcome`, claimed/succeeded/unknown/cleaned counts, duration bucket, and exit code—never IDs, amounts, provider text, or credentials. Provider/network/repository failure exits nonzero after recording only a stable safe code.

Grant `USAGE ON SCHEMA saas` and exact public-checkout/callback function execution to `celebix_saas_workflow`; revoke every other 027 helper. Leave the historical catalog assertion byte-pinned. The new 027 assertion proves workflow schema USAGE, exact function execution, zero table/sequence privileges, no inheritance/BYPASSRLS/superuser/login, and clean rollback to the original placeholder state.

- [ ] **Step 4: Run GREEN and catalog assertions**

```bash
node tests/saas-phase3/quick-order-runtime/postgres-harness.mjs
node tests/saas-phase3/quick-order-links/postgres-harness.mjs
node tests/saas-phase3/order-management/postgres-harness.mjs
```

Expected: 48/48 runtime, 40/40 link foundation, 40/40 order management; runtime scenario 20 executes the new 027 current-catalog workflow assertion; cleanup confirmed.

- [ ] **Step 5: Review and commit**

```bash
git add apps/owner/scripts/sql/saas/202607220027_* apps/owner/scripts/sql/saas/phase3b2-quick-order-runtime-manifest.json tests/saas-phase3/quick-order-runtime/postgres-harness.mjs
git commit -m "feat(saas): add atomic quick order settlement"
```

---

### Task 5: Private merchant and exact-host public repositories

**Files:**
- Create: `packages/saas-data/src/quick-orders/private-repository.ts`
- Create: `packages/saas-data/src/quick-orders/private-repository.test.ts`
- Create: `packages/saas-data/src/quick-orders/public-repository.ts`
- Create: `packages/saas-data/src/quick-orders/public-repository.test.ts`
- Modify: `packages/saas-data/src/quick-orders/index.ts:1-end`
- Modify: `packages/saas-data/src/index.ts:1-end`

**Interfaces:**

```ts
export interface QuickOrderPrivateRepository {
  getProviderReadiness(input: QuickLinkAuthorityInput): Promise<ProviderReadiness>;
  configureProvider(input: ConfigureQuickOrderProviderInput): Promise<ProviderReadiness & Readonly<{ status: "active" }>>;
  revokeProvider(input: RevokeQuickOrderProviderInput): Promise<ProviderReadiness & Readonly<{ status: "revoked" }>>;
  revealLinkCredential(input: QuickLinkAuthorityInput & Readonly<{ linkId: string }>): Promise<Readonly<{
    storeId: string; linkId: string; tokenDigest: string;
    sealedToken: SealedEnvelope; canonicalHostname: string; expiresAt: string;
  }>>;
  revealProviderConfiguration(input: QuickLinkAuthorityInput & Readonly<{ providerConfigId: string }>): Promise<Readonly<{
    storeId: string; providerConfigId: string; configurationDigest: string;
    sealedConfiguration: SealedEnvelope;
  }>>;
}

export type ProviderReadiness = Readonly<{
  status: "missing" | "active" | "disabled" | "revoked";
  providerConfigId?: string;
  version?: number;
}>;
export type ConfigureQuickOrderProviderInput = QuickLinkAuthorityInput & Readonly<{
  providerConfigId: string; expectedVersion: number; operationId: string;
  configurationDigest: string; configurationKeyId: string;
  sealedConfiguration: SealedEnvelope; fingerprint: string;
}>;
export type RevokeQuickOrderProviderInput = QuickLinkAuthorityInput & Readonly<{
  providerConfigId: string; expectedVersion: number;
  operationId: string; fingerprint: string;
}>;

export type ClaimRedemptionInput = Readonly<{
  hostname: string; tokenDigest: string; redemptionId: string;
  redemptionDigest: string; now: Date; expiresAt: Date;
}>;
export type ResolveRedemptionInput = Readonly<{
  hostname: string; redemptionDigest: string; now: Date;
}>;

export interface PublicQuickOrderRepository {
  claimRedemption(input: ClaimRedemptionInput): Promise<QuickOrderPublicQuote>;
  resolveRedemption(input: ResolveRedemptionInput): Promise<QuickOrderPublicQuote>;
  getStatus(input: ResolveRedemptionInput): Promise<CheckoutState>;
  revokeRedemption(input: ResolveRedemptionInput & Readonly<{ operationId: string; fingerprint: string }>): Promise<void>;
}

export interface CheckoutPaymentRepository {
  beginAttempt(input: BeginAttemptInput): Promise<BeginAttemptResult>;
  markProviderReady(input: MarkProviderReadyInput): Promise<ProviderReadyResult>;
  markInitiationUnknown(input: MarkInitiationFailedInput): Promise<void>;
  markInitiationFailed(input: MarkInitiationFailedInput): Promise<void>;
  getPaymentPresentation(input: ResolveRedemptionInput): Promise<PaymentPresentationAuthority>;
  getCallbackAuthority(input: Readonly<{ merchantOid: string; now: Date }>): Promise<CallbackAuthority>;
  settleCallback(input: SettleCallbackInput): Promise<Readonly<{ outcome: "settled" | "replayed" | "failed" | "commit_unknown"; orderNumber?: string }>>;
  beginReconciliationRun(input: ReconciliationRunInput): Promise<Readonly<{ outcome: "acquired" | "busy" }>>;
  claimReconciliation(input: ClaimReconciliationInput): Promise<readonly ReconciliationAuthority[]>;
  claimRedemptionReconciliation(input: ResolveRedemptionInput & Readonly<{ workerId: string; leaseExpiresAt: Date }>): Promise<ReconciliationAuthority | undefined>;
  applyReconciliationSuccess(input: ApplyReconciliationSuccessInput): Promise<Readonly<{ outcome: "settled" | "replayed"; orderNumber: string }>>;
  recordReconciliationUnknown(input: RecordReconciliationUnknownInput): Promise<void>;
  finishReconciliationRun(input: Readonly<{ workerId: string; runToken: string; now: Date }>): Promise<void>;
  cleanupPreProviderAttempts(input: CleanupPreProviderAttemptsInput): Promise<Readonly<{ releasedCount: number }>>;
}

export type BeginAttemptInput = Readonly<{
  hostname: string; redemptionDigest: string; attemptId: string;
  merchantOid: string; operationId: string; fingerprint: string; now: Date;
}>;
export type BeginAttemptResult = Readonly<{
  outcome: "created" | "replayed"; status: "reserved" | "provider_ready" | "initiation_unknown";
  storeId: string; attemptId: string; merchantOid: string; currency: "TRY"; paymentAmount: number;
  customerEmail: string; customerName: string; customerPhone: string; customerAddress: string;
  basket: readonly Readonly<{ name: string; unitPriceCents: number; quantity: number }>[];
  providerConfigId: string; configurationDigest: string;
  configurationKeyId: string; sealedConfiguration: SealedEnvelope;
}>;
export type MarkProviderReadyInput = Readonly<{
  attemptId: string; operationId: string; fingerprint: string;
  providerTokenDigest: string; sealedProviderToken: SealedEnvelope; now: Date;
}>;
export type ProviderReadyResult = Readonly<{
  attemptId: string; status: "provider_ready"; replayed: boolean;
  providerTokenDigest: string; sealedProviderToken: SealedEnvelope;
}>;
export type PaymentPresentationAuthority = Readonly<{
  attemptId: string; storeId: string; merchantOid: string;
  providerTokenDigest: string; sealedProviderToken: SealedEnvelope;
}>;
export type MarkInitiationFailedInput = Readonly<{
  attemptId: string; operationId: string; fingerprint: string; now: Date;
}>;
export type CallbackAuthority = Readonly<{
  storeId: string; attemptId: string; merchantOid: string; providerConfigId: string;
  status: "provider_ready" | "initiation_unknown" | "succeeded" | "failed";
  expectedPaymentAmount: number; currency: "TRY";
  configurationDigest: string; configurationKeyId: string;
  sealedConfiguration: SealedEnvelope;
}>;
export type SettleCallbackInput =
  | Readonly<{
      status: "success"; merchantOid: string; callbackDigest: string;
      operationId: string; fingerprint: string; paymentAmount: number;
      totalAmount: number; currency: "TRY"; paymentType: "card" | "eft"; testMode: 1;
      orderId: string; orderItemIds: readonly string[]; orderEventId: string;
      orderNumber: string; now: Date;
    }>
  | Readonly<{
      status: "failed"; merchantOid: string; callbackDigest: string;
      operationId: string; fingerprint: string; totalAmount: number;
      paymentType: "card" | "eft"; testMode: 1;
      failedReasonCode: string; failedReasonMessageDigest: string; now: Date;
    }>;
export type ClaimReconciliationInput = Readonly<{
  workerId: string; now: Date; leaseExpiresAt: Date; limit: number;
}>;
export type ReconciliationRunInput = Readonly<{
  workerId: string; runTokenDigest: string; now: Date; leaseExpiresAt: Date;
}>;
export type ReconciliationAuthority = CallbackAuthority & Readonly<{
  leaseToken: string; attemptNumber: number;
}>;
export type ApplyReconciliationSuccessInput = Readonly<{
  merchantOid: string; workerId: string; leaseToken: string;
  operationId: string; fingerprint: string;
  paymentAmount: number; totalAmount: number; currency: "TRY"; testMode: 1;
  orderId: string; orderItemIds: readonly string[]; orderEventId: string;
  orderNumber: string; now: Date;
}>;
export type RecordReconciliationUnknownInput = Readonly<{
  merchantOid: string; workerId: string; leaseToken: string;
  operationId: string; fingerprint: string;
  nextAttemptAt: Date; now: Date;
}>;
export type CleanupPreProviderAttemptsInput = Readonly<{
  workerId: string; operationId: string; fingerprint: string; now: Date; limit: number;
}>;
```

- [ ] **Step 1: Write private/public fake-pool RED tests**

Cover exact app/workflow roles, BEGIN/SET LOCAL/timeouts, hostile rows/getters/proxies, exact one-row outcome, safe DTO parsing, secret projection remaining server-only, transaction release, rollback failure, pool acquisition failure, merchant operation recovery, redemption revoke/replay, and no SQL/driver text in public errors.

- [ ] **Step 2: Run RED**

```bash
node --experimental-strip-types --test packages/saas-data/src/quick-orders/private-repository.test.ts packages/saas-data/src/quick-orders/public-repository.test.ts
```

Expected: FAIL because private/public repositories are absent.

- [ ] **Step 3: Implement constrained repositories**

Reuse existing transaction/failure classification patterns. Merchant methods set `celebix_saas_app`; public methods set `celebix_saas_workflow`. Never expose sealed rows through the root public contract validators. Recovery is one exact read-only function call after `commit_unknown`; no second write.

- [ ] **Step 4: Run GREEN**

```bash
npm test --workspace @celebix/saas-data
npm run typecheck --workspace @celebix/saas-data
```

Expected: private/public focused 24/24; data workspace/typecheck PASS.

- [ ] **Step 5: Review and commit**

```bash
git add packages/saas-data/src/quick-orders packages/saas-data/src/index.ts
git commit -m "feat(saas): add quick order redemption repositories"
```

---

### Task 6: Payment, callback, and reconciliation repository

**Files:**
- Create: `packages/saas-data/src/payments/types.ts`
- Create: `packages/saas-data/src/payments/validation.ts`
- Create: `packages/saas-data/src/payments/errors.ts`
- Create: `packages/saas-data/src/payments/repository.ts`
- Create: `packages/saas-data/src/payments/repository.test.ts`
- Create: `packages/saas-data/src/payments/index.ts`
- Modify: `packages/saas-data/src/index.ts:1-end`

- [ ] **Step 1: Write payment fake-pool RED tests**

Cover every `CheckoutPaymentRepository` method and type above, exact workflow role, canonical parameters, hostile results, provider presentation secrecy, commit unknown, authority-bound attempt/callback/reconciliation read-only recovery, recovery mismatch, unresolved callback returning a retryable internal result without a second write, audit-hook failure not masking unknown commit, bounded reconciliation claims, cleanup limits, and safe errors.

- [ ] **Step 2: Run RED**

```bash
node --experimental-strip-types --test packages/saas-data/src/payments/repository.test.ts
```

Expected: FAIL because payment modules are absent.

- [ ] **Step 3: Implement the exact payment repository surface**

Use `celebix_saas_workflow`, the existing PostgreSQL transaction state machine, exact one-row parsing, and one read-only recovery after unknown commit. Callback settlement returns the exact internal `commit_unknown` outcome until recovery proves the write; callers cannot turn it into `OK` without proof.

- [ ] **Step 4: Run GREEN**

```bash
node --experimental-strip-types --test packages/saas-data/src/payments/repository.test.ts
npm test --workspace @celebix/saas-data
npm run typecheck --workspace @celebix/saas-data
```

Expected: payment focused 18/18, combined new repositories 42/42, data workspace 174/174; typecheck PASS.

- [ ] **Step 5: Review and commit**

```bash
git add packages/saas-data/src/payments packages/saas-data/src/index.ts
git commit -m "feat(saas): add quick order payment repository"
```

---

### Task 7: Authenticated merchant runtime and HTTP routes, still unmounted

**Files:**
- Create: `apps/customer-panel/lib/server-quick-links/config.ts`
- Create: `apps/customer-panel/lib/server-quick-links/config.test.ts`
- Create: `apps/customer-panel/lib/server-quick-links/runtime.ts`
- Create: `apps/customer-panel/lib/server-quick-links/runtime.test.ts`
- Create: `apps/customer-panel/lib/server-quick-links/default.ts`
- Create: `apps/customer-panel/lib/server-quick-links/default.test.ts`
- Create: `apps/customer-panel/lib/quick-link-http/request-authority.ts`
- Create: `apps/customer-panel/lib/quick-link-http/request-authority.test.ts`
- Create: `apps/customer-panel/lib/quick-link-http/request-input.ts`
- Create: `apps/customer-panel/lib/quick-link-http/request-input.test.ts`
- Create: `apps/customer-panel/lib/quick-link-http/handler.ts`
- Create: `apps/customer-panel/lib/quick-link-http/handler.test.ts`
- Create: `apps/customer-panel/lib/quick-link-http/default.ts`
- Create: `apps/customer-panel/app/api/orders/quick-links/route.ts`
- Create: `apps/customer-panel/app/api/orders/quick-links/[linkId]/route.ts`
- Create: `apps/customer-panel/app/api/orders/quick-links/[linkId]/cancel/route.ts`
- Create: `apps/customer-panel/app/api/orders/quick-links/[linkId]/duplicate/route.ts`
- Create: `apps/customer-panel/app/api/orders/quick-links/[linkId]/url/route.ts`
- Create: `apps/customer-panel/app/api/orders/quick-links/provider/activate/route.ts`
- Create: `apps/customer-panel/app/api/orders/quick-links/provider/revoke/route.ts`
- Modify: `apps/customer-panel/lib/server-panel-access/postgres-runtime.ts:1-end`
- Modify: `apps/customer-panel/package.json:1-end`
- Create: `tests/saas-phase3/quick-order-runtime/in-process.test.mjs`

**Interfaces:**
- `createQuickLinkHttpHandlers({ resolveRuntime, now, requestId, generateId, generateToken })` produces list/get/create/cancel/duplicate/revealUrl/activateProvider/revokeProvider handlers.
- Exact routes:

```text
GET  /api/orders/quick-links
POST /api/orders/quick-links
GET  /api/orders/quick-links/:id
POST /api/orders/quick-links/:id/cancel
POST /api/orders/quick-links/:id/duplicate
POST /api/orders/quick-links/:id/url
POST /api/orders/quick-links/provider/activate
POST /api/orders/quick-links/provider/revoke
```

- Every merchant-panel mutation requires canonical UUID `Idempotency-Key`; every POST requires exact configured panel Origin. All routes require the existing `__Host-celebix_panel` credential and reject Authorization, X-Celebix, store/tenant/principal IDs, transfer encoding, body on GET, unknown content type, query on non-list routes, and unknown JSON keys.

- [ ] **Step 1: Write authority/runtime/handler RED tests**

Prove disabled/default 503/no Set-Cookie/no mutation; approved-staging exact Origin; proxy-safe internal URL path validation; wrong/missing/comma Origin 403; forged forwarded headers no rescue; session before repository; role/read/manage capabilities; browser store/price/currency/provider fields rejected; create uses canonical TRY catalog snapshots and denies every unsupported currency before credential generation/repository/provider access; replay decrypts original token; URL reveal is POST/no-store; no token in list/detail; create/cancel/duplicate conflicts; hostile repository results; and no raw secret/error logging. Provider activation/revocation is not a configuration body: the staging-only owner/admin activation POST reads the five `CELEBIX_PAYTR_STAGING_*` fields server-side, constructs `CanonicalPaytrConfiguration`, serializes/digests it with the single server-only helper from Task 1, seals the exact bytes, and calls `configureProvider`; revocation accepts no configuration body and calls `revokeProvider`. All other modes/roles return controlled denial without mutation.

- [ ] **Step 2: Run RED**

```bash
node --experimental-transform-types --test apps/customer-panel/lib/server-quick-links/*.test.ts apps/customer-panel/lib/quick-link-http/*.test.ts
node --experimental-transform-types --test tests/saas-phase3/quick-order-runtime/in-process.test.mjs
```

Expected: FAIL because runtime and routes do not exist.

- [ ] **Step 3: Implement minimal authenticated runtime and routes**

On create/duplicate, generate IDs/token once, digest and seal, call the foundation repository, then reveal/open the persisted credential for both committed and replayed outcomes. Build the URL only from the persisted canonical hostname and decrypted persisted token:

```ts
const url = `https://${canonicalHostname}/odeme/hizli/${token}`;
```

No browser response receives `TenantContext` or private IDs. Submitted lines contain only variant ID and quantity; catalog names/prices are revalidated by the database authority.

Extend only the customer-panel test script so these exact new nested suites are included without sweeping unrelated historical directories:

```json
"test": "node --experimental-transform-types --test lib/*.test.ts lib/panel-ui/*.test.ts lib/server-quick-links/*.test.ts lib/quick-link-http/*.test.ts"
```

- [ ] **Step 4: Run GREEN, workspace tests, typecheck/build**

```bash
npm test --workspace @celebix/customer-panel
node --experimental-transform-types --test tests/saas-phase3/quick-order-runtime/in-process.test.mjs
npm run typecheck --workspace @celebix/customer-panel
npm run build --workspace @celebix/customer-panel
```

Expected: customer-panel server suites and quick-order in-process 12/12 PASS; typecheck/build PASS; navigation remains unchanged.

- [ ] **Step 5: Review and commit**

```bash
git add apps/customer-panel/lib/server-quick-links apps/customer-panel/lib/quick-link-http apps/customer-panel/app/api/orders/quick-links apps/customer-panel/lib/server-panel-access/postgres-runtime.ts apps/customer-panel/package.json tests/saas-phase3/quick-order-runtime/in-process.test.mjs
git commit -m "feat(customer-panel): add quick order link runtime"
```

---

### Task 8: Donor-parity quick-order console, still hidden from navigation

**Files:**
- Create: `apps/customer-panel/lib/quick-link-ui/client.ts`
- Create: `apps/customer-panel/lib/quick-link-ui/client.test.ts`
- Create: `apps/customer-panel/components/orders/QuickOrderLinksConsole.tsx`
- Create: `apps/customer-panel/components/orders/quick-order-links.module.css`
- Create: `apps/customer-panel/app/orders/quick-links/page.tsx`
- Modify: `apps/customer-panel/lib/routes.test.ts:1-end`
- Modify: `apps/customer-panel/package.json:1-end`

- [ ] **Step 1: Write donor-presentation RED tests**

Test “Sipariş Detayı”, real product search, expiry, selected lines, recipient/address, separate note/internal label, PayTR readiness, subtotal/shipping/discount/total, create button, statuses, copy/open, cancel, duplicate, responsive table/cards, 48px targets, keyboard/focus, and error/empty/loading/conflict states. Customer search remains absent rather than fake until the customer slice exists. Prove no `TenantContext`, private UUIDs, provider material, token digest, or sealed payload reaches client props.

- [ ] **Step 2: Run RED**

```bash
node --experimental-transform-types --test apps/customer-panel/lib/quick-link-ui/client.test.ts apps/customer-panel/lib/routes.test.ts
```

Expected: FAIL because the client/console/page are absent.

- [ ] **Step 3: Implement the donor presentation adapter**

Reuse the real catalog search endpoint and authenticated Task 7 routes. Client commands send only variant ID, quantity, contact/address intent, expiry, shipping/discount intent, expected version, and idempotency key. Render truthful provider readiness and loaded/empty/error states; do not add the navigation entry.

After creating the UI test directory, extend the customer-panel test command to exactly:

```json
"test": "node --experimental-transform-types --test lib/*.test.ts lib/panel-ui/*.test.ts lib/server-quick-links/*.test.ts lib/quick-link-http/*.test.ts lib/quick-link-ui/*.test.ts"
```

- [ ] **Step 4: Run GREEN**

```bash
npm test --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/customer-panel
npm run build --workspace @celebix/customer-panel
```

Expected: customer-panel 174/174, typecheck/build PASS; `/orders/quick-links` is directly routable but absent from all navigation models.

- [ ] **Step 5: Review and commit**

```bash
git add apps/customer-panel/lib/quick-link-ui apps/customer-panel/components/orders apps/customer-panel/app/orders/quick-links apps/customer-panel/lib/routes.test.ts apps/customer-panel/package.json
git commit -m "feat(customer-panel): add quick order link console"
```

---

### Task 9: Exact-host redemption cookie and public quote

**Files:**
- Create: `apps/storefront-shared/lib/checkout/config.ts`
- Create: `apps/storefront-shared/lib/checkout/config.test.ts`
- Create: `apps/storefront-shared/lib/checkout/runtime.ts`
- Create: `apps/storefront-shared/lib/checkout/runtime.test.ts`
- Create: `apps/storefront-shared/lib/checkout/public-quick-link.ts`
- Create: `apps/storefront-shared/lib/checkout/public-quick-link.test.ts`
- Create: `apps/storefront-shared/lib/checkout/redemption-cookie.ts`
- Create: `apps/storefront-shared/lib/checkout/redemption-cookie.test.ts`
- Create: `apps/storefront-shared/lib/checkout/trusted-client-ip.ts`
- Create: `apps/storefront-shared/lib/checkout/trusted-client-ip.test.ts`
- Create: `apps/storefront-shared/app/odeme/hizli/[token]/route.ts`
- Create: `apps/storefront-shared/app/odeme/hizli/page.tsx`
- Create: `apps/storefront-shared/app/api/quick-order/status/route.ts`
- Modify: `apps/storefront-shared/lib/runtime-config.ts:1-end`
- Modify: `apps/storefront-shared/lib/default-runtime.ts:1-end`
- Modify: `apps/storefront-shared/lib/storefront-app.test.ts:1-end`
- Modify: `apps/storefront-shared/package.json:1-end`
- Modify: `package-lock.json` through npm workspace install only.

**Interfaces:**
- `claimPublicQuickOrder({ trustedHostname, token, now })` returns exactly one of: canonical-host `303` with `__Host-celebix_quick`; active-alias `308` to the persisted canonical hostname with no cookie/mutation; or controlled no-Location/no-cookie failure.
- Cookie credential: `q1.` + 32-byte canonical base64url; persistence sees lowercase SHA-256 only; `Path=/; HttpOnly; Secure; SameSite=Lax`; no Domain; max-age bounded by link expiry and 30 minutes.
- Token route accepts exact GET, exact path segment, no query/fragment/private headers/body. A pre-existing well-formed `__Host-celebix_quick` cookie is never link/store authority: the route ignores its value while resolving the new exact hostname+token, and a valid new claim atomically replaces it with the newly issued host-only cookie. Well-formed unrelated cookies are ignored; malformed Cookie syntax or duplicate redemption-cookie names fail closed. Token-free page requires the current redemption cookie.
- An active alias host never claims a token and never mints `__Host-celebix_quick`. It returns one no-store/no-referrer 308 to the persisted canonical primary hostname while preserving the exact validated redemption path; only a subsequent canonical-host request may claim and set the host-only cookie. Unknown/inactive/ambiguous aliases fail without Location.

- [ ] **Step 1: Write RED tests**

Test public HTTPS and signed internal proxy URL, exact host/store binding, active alias 308 to the persisted canonical host before claim, alias response with no cookie/mutation, canonical host claim, valid new claim safely replacing a pre-existing redemption cookie without treating the old value as authority, malformed/duplicate/unrelated cookies denied, wrong/unknown/inactive/cross-store host, missing/malformed/wrong/expired token, duplicate query, child path, credentials, forwarded-header forgery, no global token lookup, exactly one scrub redirect, cookie attributes, raw token absent from token-free redirect/HTML/RSC/console/log, public DTO PII omissions, no-store/noindex/referrer headers, and no mutation on failures.

- [ ] **Step 2: Run RED**

```bash
node --experimental-strip-types --test apps/storefront-shared/lib/checkout/config.test.ts apps/storefront-shared/lib/checkout/runtime.test.ts apps/storefront-shared/lib/checkout/public-quick-link.test.ts apps/storefront-shared/lib/checkout/redemption-cookie.test.ts apps/storefront-shared/lib/checkout/trusted-client-ip.test.ts
```

Expected: FAIL because checkout modules/routes are absent.

- [ ] **Step 3: Implement minimal claim/resolve page**

The dynamic route hashes the token only after the signed proxy selected an exact hostname. SQL claims hostname+digest and creates a redemption session. Redirect to `/odeme/hizli`; the page renders only the safe quote from cookie digest+hostname. Do not add PayTR initiation in this task.

Add only the already-locked direct runtime dependencies with npm so lock entries are generated, not fabricated:

```bash
npm install @celebix/saas-data@0.1.0 pg@^8.22.0 server-only@^0.0.1 --workspace @celebix/storefront-shared
```

Expected package diff: only `apps/storefront-shared/package.json` and the corresponding workspace dependency block in `package-lock.json`; no resolved package version changes.

Extend the storefront test script to discover only its existing root tests and the new checkout directory:

```json
"test": "node --experimental-strip-types --test lib/*.test.ts lib/checkout/*.test.ts"
```

- [ ] **Step 4: Run GREEN and regression**

```bash
npm test --workspace @celebix/storefront-shared
npm run typecheck --workspace @celebix/storefront-shared
npm run build --workspace @celebix/storefront-shared
node --test packages/saas-storefront-runtime/src/*.test.ts
```

Expected: storefront-shared 48/48; storefront-runtime baseline PASS; typecheck/build PASS.

- [ ] **Step 5: Review and commit**

```bash
git add apps/storefront-shared package-lock.json
git commit -m "feat(storefront): redeem exact-host quick order links"
```

---

### Task 10: PayTR initiation adapter and protocol-required iframe

**Files:**
- Create: `apps/storefront-shared/lib/checkout/paytr.ts`
- Create: `apps/storefront-shared/lib/checkout/paytr.test.ts`
- Extend: `apps/storefront-shared/lib/checkout/runtime.ts`
- Create: `apps/storefront-shared/app/api/quick-order/checkout/route.ts`
- Create: `apps/storefront-shared/app/odeme/hizli/odeme/route.ts`
- Create: `apps/storefront-shared/app/odeme/hizli/sonuc/page.tsx`
- Modify: `apps/storefront-shared/app/odeme/hizli/page.tsx:1-end`
- Modify: `apps/storefront-shared/proxy.ts:1-end` — after exact signed host/path authority, emit the quote page's exact-origin form CSP only for exact `/odeme/hizli` and the exact PayTR iframe CSP only for exact `/odeme/hizli/odeme`; every other default remains unchanged.
- Modify: `apps/storefront-shared/lib/storefront-app.test.ts:1-end`
- Modify: `tests/saas-phase3/quick-order-runtime/in-process.test.mjs:1-end`

**Interfaces:**

```ts
export type PaytrConfiguration = CanonicalPaytrConfiguration;

export function createPaytrToken(input: Readonly<{
  configuration: PaytrConfiguration;
  userIp: string;
  merchantOid: string;
  email: string;
  paymentAmount: number;
  userBasket: string;
  noInstallment: 0 | 1;
  maxInstallment: number;
  currency: "TL";
}>): string;

export function verifyPaytrCallback(input: Readonly<{
  configuration: PaytrConfiguration;
  merchantOid: string;
  status: "success" | "failed";
  totalAmount: string;
  providedHash: string;
}>): boolean;

export type PaytrCallback =
  | Readonly<{
      status: "success"; merchantOid: string; hash: string;
      totalAmount: number; paymentAmount: number; paymentType: "card" | "eft";
      currency: "TRY"; testMode: 1;
    }>
  | Readonly<{
      status: "failed"; merchantOid: string; hash: string; totalAmount: number;
      paymentType: "card" | "eft"; failedReasonCode: string;
      failedReasonMessageDigest: string; testMode: 1;
    }>;

export function createPaytrStatusToken(configuration: PaytrConfiguration, merchantOid: string): string;
export function queryPaytrStatus(input: Readonly<{
  configuration: PaytrConfiguration; merchantOid: string; signal: AbortSignal;
}>): Promise<Readonly<{
  status: "success"; paymentAmount: number; totalAmount: number;
  currency: "TRY"; testMode: 1;
}> | Readonly<{ status: "unknown" }>>;
```

Status-query `payment_amount` and `payment_total` are strict major-unit decimal strings. Accept only 1–12 ASCII digits followed by zero or one `.` or `,` and exactly one or two ASCII fractional digits, normalize the documented comma form to dot, convert exactly to integer cents without floating point, and reject signs, exponent notation, grouping, whitespace, leading plus, more than two decimals, overflow, mixed separators, or noncanonical zero padding. Callback amounts remain canonical integer-cent strings and use a separate parser.

The status-query success parser accepts the official documented object vocabulary: required `status`, `payment_amount`, `payment_total`, `payment_date`, `currency`, `test_mode`, and documented bounded optional `net_tutar`, `kesinti_tutari`, `taksit`, `kart_marka`, `masked_pan`, `auth_code`, `auth_date`, `odeme_tipi`, and `returns`. It validates every present field and bounded return entry, rejects unknown/top-level duplicate/hostile values, then projects only payment cents, total cents, normalized currency, and test mode. Card/PAN/auth/refund metadata is never persisted or logged. The official error object (`status='error'`, bounded `err_no`, `err_msg`) always projects only `{status:'unknown'}` and its text is discarded.

- [ ] **Step 1: Write RED initiation/iframe tests from official vectors**

Pin exact versioned configuration serialization/digest including callback URL; exact create-token form field vocabulary/order; HMAC/base64 bytes; `test_mode=1`; `TL` provider currency; canonical bounded basket; forced duplicate `merchant_oid` returning controlled conflict with zero fetch/provider call; exact get-token endpoint; manual redirects; TLS; timeout/body/content-type limits; success token validation; provider error containment; network/parse/timeout unknown state; no initiation retry; trusted client IP rules; same-origin 303; exact proxy path classifier and quote-page response CSP permitting only the canonical same-origin checkout form action; exact proxy-owned iframe CSP and effective built response; exact iframe `src`; usable responsive/scrollable iframe dimensions; no RSC/JSON token; return page not settlement; and raw-secret/log scans.

The client IP parser may read `x-forwarded-for` only after the existing `x-celebix-storefront-proxy` token is authentic. It accepts exactly one canonical public IPv4/IPv6 value, rejects commas, whitespace changes, loopback/private/link-local/documentation ranges, and never uses the IP as store/tenant/link authority.

- [ ] **Step 2: Run RED**

```bash
npm test --workspace @celebix/storefront-shared -- --test-name-pattern='PayTR|checkout|iframe'
node --experimental-transform-types --test tests/saas-phase3/quick-order-runtime/in-process.test.mjs
```

Expected: FAIL because the initiation adapter/iframe routes are absent.

- [ ] **Step 3: Implement initiation adapter and token-free iframe route**

Checkout POST requires the redemption cookie, exact signed-proxy hostname, exact same-origin form authority, `application/x-www-form-urlencoded`, and exactly one body field `operation_id=<canonical UUID>` generated server-side when the quote form is rendered. No custom header or client Fetch is used: the native form POST permits the browser to follow the same-origin 303 as a top-level navigation without fetching/reading the iframe HTML in JavaScript. After the signed storefront proxy has established the exact canonical public hostname and exact request target `/odeme/hizli` with no query or fragment, that proxy emits the response CSP and names only `https://<that-exact-canonical-host>` in `form-action`; it never trusts Host/forwarded input without the existing signed proxy proof and never uses `'self'`, a wildcard, or generic `https:`. Every near-match, query, error, missing authority, and other path keeps the existing strict `form-action 'none'` policy. The page does not attempt to loosen CSP with markup or a meta policy. Unknown/duplicate fields, multipart/JSON, missing body, query, transfer encoding, and noncanonical UUID fail before repository/provider access. The operation UUID is idempotency intent only, never store/link authority. Begin/reserve in PostgreSQL, call PayTR outside the transaction, seal the returned provider token, persist readiness, then 303 only to same-origin `/odeme/hizli/odeme`. Proven provider rejection releases reservations; connection/timeout/parse ambiguity records `initiation_unknown` and emits no Location.

Only `beginAttempt` outcome `created` with status `reserved` may make the one PayTR get-token call. `replayed`, concurrent-existing, `provider_ready`, `initiation_unknown`, and every terminal outcome make zero provider calls: provider-ready replay redirects to the same token-free iframe route, initiation-unknown returns controlled processing with no retry, and terminal outcomes render their persisted state.

`GET /odeme/hizli/odeme` requires the exact redemption cookie and canonical hostname and resolves the current provider-ready attempt. Only after the signed storefront proxy proves that exact canonical host and exact request target with no query/fragment does the proxy emit CSP exactly `default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; object-src 'none'; frame-src https://www.paytr.com`; near matches and failures retain the default frame-denying policy. The route opens the sealed token server-side and returns a minimal non-RSC HTML document with `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, and `X-Content-Type-Options: nosniff`; it does not try to override the proxy's CSP, because Next's proxy response header is authoritative in the built response. The effective browser response is asserted to contain exactly that one CSP. Its only token-bearing byte sequence is the escaped iframe `src=https://www.paytr.com/odeme/guvenli/<canonical-token>`; the iframe uses only inert HTML attributes `width="100%"`, `height="720"`, `scrolling="yes"`, `frameborder="0"`, and a fixed non-secret `title` so it is full-width, independently scrollable, and never falls back to an unusable 300×150 box. No inline or external style is present under the style-denying CSP. The route never redirects off-origin, serializes the token into JSON/RSC, imports provider JavaScript, or accepts a provider URL from the browser.

- [ ] **Step 4: Run Task 10 GREEN**

```bash
npm test --workspace @celebix/storefront-shared
npm run typecheck --workspace @celebix/storefront-shared
npm run build --workspace @celebix/storefront-shared
node --experimental-transform-types --test tests/saas-phase3/quick-order-runtime/in-process.test.mjs
```

Expected: storefront initiation/iframe tests PASS; typecheck/build PASS; no external network request in tests.

- [ ] **Step 5: Review and commit**

```bash
git add apps/storefront-shared/lib/checkout/paytr.ts apps/storefront-shared/lib/checkout/paytr.test.ts apps/storefront-shared/lib/checkout/runtime.ts apps/storefront-shared/app/api/quick-order/checkout apps/storefront-shared/app/odeme/hizli/odeme apps/storefront-shared/app/odeme/hizli/sonuc apps/storefront-shared/app/odeme/hizli/page.tsx apps/storefront-shared/proxy.ts apps/storefront-shared/lib/storefront-app.test.ts tests/saas-phase3/quick-order-runtime/in-process.test.mjs
git commit -m "feat(storefront): add paytr quick order checkout"
```

---

### Task 11: PayTR callback authority and bounded status reconciliation

**Files:**
- Modify: `apps/storefront-shared/lib/checkout/paytr.ts:1-end`
- Modify: `apps/storefront-shared/lib/checkout/paytr.test.ts:1-end`
- Create: `apps/storefront-shared/lib/checkout/callback-authority.ts`
- Create: `apps/storefront-shared/lib/checkout/callback-authority.test.ts`
- Extend: `apps/storefront-shared/lib/checkout/runtime.ts`
- Create: `apps/storefront-shared/scripts/reconcile-quick-orders.mjs`
- Create: `tests/saas-phase3/quick-order-runtime/reconcile-cli.test.mjs`
- Create: `apps/storefront-shared/app/api/payments/paytr/callback/route.ts`
- Modify: `apps/storefront-shared/proxy.ts:1-end`
- Modify: `apps/storefront-shared/lib/storefront-app.test.ts:1-end`
- Modify: `apps/storefront-shared/package.json:1-end` — add exact server-only `reconcile:quick-orders` command.
- Modify: `tests/saas-phase3/quick-order-runtime/in-process.test.mjs:1-end`

- [ ] **Step 1: Write callback/status-query RED tests**

Pin exact success/failure callback fields including `payment_type`, `test_mode`, failure reason code/message; duplicate/unknown/size/type denial; callback HMAC and constant-time compare; exact signed-proxy callback authority; no browser session/Origin; plain `OK`; unresolved commit 503; status-query HMAC/endpoint/decimal parser; success `total_amount/payment_total >= payment_amount` with lower-total denial; singleton CLI overlap exclusion and lease expiry; exact 60-second fencing, three-second provider deadline, five-way concurrency, 40-second issue cutoff, per-write database timeouts, lease-edge requeue, and total run budget; bounded claim/lease/backoff; strict success settlement; unknown/error retention; callback/status race; stable safe metrics/nonzero failures; and no secret/error logging.

- [ ] **Step 2: Run RED**

```bash
node --experimental-transform-types --test apps/storefront-shared/lib/checkout/paytr.test.ts apps/storefront-shared/lib/checkout/callback-authority.test.ts tests/saas-phase3/quick-order-runtime/in-process.test.mjs
```

Expected: FAIL because callback/reconciliation runtime is absent.

- [ ] **Step 3: Implement callback and reconciliation**

Callback lookup by high-entropy `merchant_oid` returns sealed configuration only to the server. Verify HMAC before settlement. Exact `merchant_ok_url` and `merchant_fail_url` are derived from the already verified canonical storefront origin as `/odeme/hizli/sonuc?durum=basarili` and `/odeme/hizli/sonuc?durum=basarisiz`; they never contain order/session/token authority and remain informational. The configured callback URL is independently canonical HTTPS with exact `/api/payments/paytr/callback`. A success callback or status response requires JS-safe positive integer cents with `total_amount/payment_total >= payment_amount`; installment total may be higher, but a lower collected total is underpayment and is denied before settlement. Valid success/failure/replay returns exactly `OK`; invalid input/hash returns a generic non-OK 400 without details. An unresolved settlement `commit_unknown` returns 503 non-`OK` for provider retry; recovery-proven settlement returns `OK` without another write. The proxy bypass for this exact callback path requires the existing authentic proxy token, exact configured external callback hostname, HTTPS forwarded proto, and exact path; near matches remain unavailable.

No public reconciliation HTTP endpoint exists. `scripts/reconcile-quick-orders.mjs` runs only inside the storefront server process with its existing server-only database/runtime configuration; it accepts no CLI credentials, host, store, attempt, or provider parameters. The exact package script is `NODE_OPTIONS='--conditions=react-server' node scripts/reconcile-quick-orders.mjs`, pinning the same server-only export condition used by the runtime and tests. It acquires singleton run and per-attempt leases for exactly 60 seconds, exits cleanly as `busy` on overlap, first calls bounded pre-provider cleanup, then claims at most 25 due attempts. Status queries run with at most five workers and an exact three-second AbortSignal deadline. No worker starts provider I/O after 40 seconds of monotonic run time or with less than ten seconds remaining on its attempt lease; every unstarted/ambiguous claim is requeued through the fenced unknown function while at least six seconds remain. Settlement/unknown transactions set local `statement_timeout=4000` and `lock_timeout=2000`, and the CLI stops all mutation attempts by 50 seconds so it can release the run lease before 60 seconds. It never renews a lease or applies a response after fencing expiry. Fake-clock/slow-network tests cover every cutoff, ensure at most five concurrent calls, and prove an expired worker cannot commit while a later run owns the lease. Within those bounds it opens each immutable configuration snapshot, calls `https://www.paytr.com/odeme/durum-sorgu` once per live lease, settles only strict success, records every other result as unknown with bounded backoff, and releases the run lease. The cookie-bound status route may reconcile only the exact `(hostname, redemption_digest)` attempt through `checkout_claim_redemption_reconciliation`, never the global claim. Neither surface treats PayTR error text as proof of failure or releases held stock. Repository tests force each callback commit classification and prove that only the exact `commit_unknown` result maps to a generic non-`OK` 503; `settled`, authenticated `replayed`, and signed `failed` map to exact `OK`.

Add exactly this package script and no scheduler:

```json
"reconcile:quick-orders": "NODE_OPTIONS='--conditions=react-server' node scripts/reconcile-quick-orders.mjs"
```

- [ ] **Step 4: Run full GREEN matrix**

```bash
npm test --workspace @celebix/storefront-shared
npm run typecheck --workspace @celebix/storefront-shared
npm run build --workspace @celebix/storefront-shared
node --test tests/saas-phase3/quick-order-runtime/reconcile-cli.test.mjs
node tests/saas-phase3/quick-order-runtime/postgres-harness.mjs
node --experimental-transform-types --test tests/saas-phase3/quick-order-runtime/*.test.mjs
```

Expected: storefront-shared 72/72. The reconciliation CLI harness spawns the exact package command with database/runtime/provider configuration deliberately removed, requires the expected nonzero child exit, asserts one exact stable safe JSON error envelope, and proves zero database socket/DNS/fetch access before it exits zero itself. PG 48/48; runtime in-process 34/34; no external request in tests.

- [ ] **Step 5: Review and commit**

```bash
git add apps/storefront-shared/lib/checkout apps/storefront-shared/scripts/reconcile-quick-orders.mjs apps/storefront-shared/app/api/payments/paytr/callback apps/storefront-shared/proxy.ts apps/storefront-shared/lib/storefront-app.test.ts apps/storefront-shared/package.json tests/saas-phase3/quick-order-runtime
git commit -m "feat(saas): add paytr quick order settlement"
```

---

### Task 12: Security, accessibility, concurrency, and complete local regression gate

**Files:**
- Create: `tests/saas-phase3/quick-order-runtime/static-security.test.mjs`
- Create: `tests/saas-phase3/quick-order-runtime/isolated-staging-preflight.sql`
- Create: `tests/saas-phase3/quick-order-runtime/isolated-staging-runner.mjs`
- Create: `tests/saas-phase3/quick-order-runtime/isolated-staging-runner.test.mjs`
- Create: `tests/saas-phase3/quick-order-runtime/owner-regression-baseline.mjs`
- Modify: `apps/customer-panel/lib/routes.test.ts:1-end`
- Modify: `apps/customer-panel/lib/panel-shell.test.ts:1-end`
- Modify: `apps/storefront-shared/lib/storefront-app.test.ts:1-end`
- Do not modify production code unless a reproduced defect requires a focused repair and re-review.

- [ ] **Step 1: Pin static scope and forbidden material**

Assert donor SHA, `apps/admin` byte diff 0, exact production file allowlist, exact migration/manifest bytes, app/workflow/host grants, no Supabase/legacy admin API, no private IDs in client/RSC, no raw/digest/sealed token/provider/callback/session material except the two explicit protocol-bound URL locations from Global Constraints, no production database/provider secrets, no wildcard/generic-https/unsafe-inline payment CSP, no navigation activation, and no external request in tests. The static test obtains `git diff --unified=0 301637111... -- ':!docs/**'` with `spawnSync`, requires child status 0, inspects only added content lines in memory, and exits nonzero on any credential URL/private-key/merchant-key-or-salt pattern without printing the matching bytes; baseline tracked fixtures therefore cannot create false positives and command/tool failure cannot silently pass. The iframe HTML test proves the provider token occurs exactly once and only after the exact PayTR secure origin prefix; it never prints or snapshots its value.

The isolated-staging runner is dry-run by default and accepts a required `--source-sha <40-lowercase-hex>` equal to the already proven clean local/remote HEAD. `--apply` requires all of: runtime mode `approved_staging`, deployment tier `staging`, PostgreSQL major 16, exact configured staging database name, `current_setting('celebix.deployment_tier', true) = 'isolated_staging'`, no recovery/read-only server, and every local 001–027 migration/manifest artifact matching the checksum manifests committed at that source SHA. This repository has no trusted applied-migration ledger, so the runner must not claim historical 001–025 checksum application or a synthetic numeric database version. Instead, before mutation it runs `isolated-staging-preflight.sql` read-only to assert the complete current catalog/constraint/function/RLS/role/grant state required from 001–025, plus absence of every 026/027 object; that proves the database is a compatible current base, not its historical migration provenance. It rejects any name/host/tier sentinel containing production/live/main authority, never prints the connection string, takes a successful PostgreSQL custom-format backup in a `0700` directory with a `0600` file before DDL, applies 026 then 027 with `psql -X -v ON_ERROR_STOP=1 --single-transaction`, runs both new assertion files and manifest postcheck, and exits nonzero on any mismatch. Tests use fake processes/connections only and prove no production/external connection.

- [ ] **Step 2: Run all PostgreSQL suites**

```bash
node tests/saas-phase3/quick-order-runtime/postgres-harness.mjs
node tests/saas-phase3/quick-order-links/postgres-harness.mjs
node tests/saas-phase3/order-management/postgres-harness.mjs
node tests/saas-phase3/product-catalog/postgres-harness.mjs
NODE_OPTIONS='--conditions=react-server' node tests/saas-phase3/product-catalog-api/postgres-harness.mjs
```

Expected: 48/48, 40/40, 40/40, 33/33, 26/26; every disposable cluster/socket/backup directory removed.

- [ ] **Step 3: Run package/app regressions**

```bash
npm test --workspace @celebix/saas-contracts
npm test --workspace @celebix/saas-data
npm test --workspace @celebix/customer-panel
npm test --workspace @celebix/storefront-shared
node --experimental-transform-types --test tests/saas-phase3/quick-order-runtime/*.test.mjs
npm run typecheck --workspace @celebix/saas-contracts
npm run typecheck --workspace @celebix/saas-data
npm run typecheck --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/storefront-shared
npm run build --workspace @celebix/customer-panel
npm run build --workspace @celebix/storefront-shared
NODE_OPTIONS='--conditions=react-server' node tests/saas-phase3/quick-order-runtime/owner-regression-baseline.mjs
npm run typecheck --workspace @celebix/owner
npm run build --workspace @celebix/owner
```

Expected: contracts 75/75, data 174/174, customer-panel 174/174, storefront-shared 72/72, quick-order runtime PG 48/48 and in-process 34/34. The Owner baseline harness runs the full source test command, requires its expected nonzero exit, asserts exactly 336/343 with only these seven unchanged stale failing files and no others—`app/api/internal/self-serve/oidc-callback/route.test.ts`, `app/api/self-serve/register/route.test.ts`, `lib/self-serve-flags.test.ts`, `lib/self-serve-onboarding.test.ts`, `lib/self-serve-persistent-registration-adapter.test.ts`, `lib/self-serve-registration.test.ts`, `lib/self-serve-request-store.test.ts`—then itself exits zero; Owner typecheck/build PASS.

- [ ] **Step 4: Run local browser/accessibility matrix**

At 320×720, 390×844, 768×1024, 1024×768, 1025×768, 1440×900, and 1920×1080 verify quick-order builder/list, public quote, failure/expired/processing/paid states, zero overflow, 48×48 targets, keyboard-only operation, focus restoration, Escape/backdrop drawer, labels/errors/live regions, CTA contrast ≥4.5:1, reduced-motion ≈0.01ms, and no dock/form overlap. Store screenshots untracked.

- [ ] **Step 5: Diff/security checks and commit**

```bash
git diff --check
git diff --quiet 301637111de040fc3bbf3cfed718a2d772e42130..HEAD -- apps/admin
DOCS_SHA="$(awk -F': ' '/^Documentation checkpoint SHA: [0-9a-f]{40}$/ {print $2; exit}' .superpowers/sdd/progress.md)"
test "${#DOCS_SHA}" -eq 40
test "$(git rev-parse HEAD:docs/superpowers/specs/2026-07-21-hemenaku-full-merchant-admin-parity-design.md)" = "$(git rev-parse "$DOCS_SHA:docs/superpowers/specs/2026-07-21-hemenaku-full-merchant-admin-parity-design.md")"
test "$(git rev-parse HEAD:docs/superpowers/plans/2026-07-21-hemenaku-quick-order-links-runtime.md)" = "$(git rev-parse "$DOCS_SHA:docs/superpowers/plans/2026-07-21-hemenaku-quick-order-links-runtime.md")"
git add tests/saas-phase3/quick-order-runtime apps/customer-panel/lib/routes.test.ts apps/customer-panel/lib/panel-shell.test.ts apps/storefront-shared/lib/storefront-app.test.ts
node --test tests/saas-phase3/quick-order-runtime/static-security.test.mjs
git status --short
git commit -m "test(saas): verify quick order runtime"
git push origin codex/hemenaku-admin-presentation-transplant-implementation
```

Expected before staging/commit: checks PASS; both frozen document blob IDs still equal the recorded documentation checkpoint; `git status --short` contains only the exact Task 12 allowlist plus the pre-existing untracked `.codex-artifacts/`. Task 13's post-commit gate must then prove zero tracked changes before deployment.

---

### Task 13: Separately controlled isolated PayTR staging proof

**Files:**
- Source changes: none.
- Evidence: untracked `.codex-artifacts/quick-order-runtime/**` only.

- [ ] **Step 1: Verify staging prerequisites without exposing values**

Record only present/absent and active/retired counts for: isolated staging database, customer-panel/storefront exact SHA, `celebix_saas_app`, `celebix_saas_workflow`, `celebix_saas_host_resolver` membership, link/config keyrings, signed storefront proxy token, exact callback authority, and isolated PayTR test merchant credentials. If any value is absent, stop this task as `PARTIAL — QUICK_ORDER_PAYTR_STAGING_INPUTS_REQUIRED`; do not fabricate or use production credentials.

- [ ] **Step 2: Prove immutable source provenance before any staging mutation**

Run `git diff --check`; load `DOCS_SHA` from the exact `.superpowers/sdd/progress.md` record and rerun both Task 12 document blob-ID comparisons; then run `git diff --quiet 301637111de040fc3bbf3cfed718a2d772e42130..HEAD -- apps/admin` and `test -z "$(git status --porcelain --untracked-files=no)"`. Set `SOURCE_SHA="$(git rev-parse HEAD)"`, obtain `REMOTE_SHA="$(git ls-remote --exit-code origin refs/heads/codex/hemenaku-admin-presentation-transplant-implementation | awk '{print $1}')"`, and require `test "$SOURCE_SHA" = "$REMOTE_SHA"`; do not rely on this repository's main-only remote-tracking refspec. Record that exact clean `SOURCE_SHA`; no database command may run before this gate passes.

- [ ] **Step 3: Apply and assert migrations 026–027 on the isolated staging database**

Run `node tests/saas-phase3/quick-order-runtime/isolated-staging-runner.mjs --source-sha "$SOURCE_SHA" --dry-run`, inspect only its safe readiness projection, then run the same exact command with `--apply`. The runner binds local migration/manifest bytes to `SOURCE_SHA`, takes the required backup, verifies staging sentinels and the complete read-only 001–025 current-state preflight, applies only 026/027, executes both new assertions under intended roles, and records compatible-base plus 026/027 PASS/rollback plan without row, historical-provenance, version, or secret claims. This is an isolated-staging database migration, not an Owner app deploy; production database connections and credentials remain forbidden.

- [ ] **Step 4: Deploy and verify the exact hidden-navigation SHA**

Deploy the already proven-clean `SOURCE_SHA` to customer-panel and shared storefront isolated staging only. No Owner, legacy storefront, admin, or production deploy. Record local/remote/deployed SHA parity, health, and that Hızlı Sipariş remains absent from navigation but directly routable for the controlled proof.

- [ ] **Step 5: Provision one staging-only store provider configuration**

With a genuine owner/admin staging panel session, call the exact same-origin `POST /api/orders/quick-links/provider/activate`. The handler reads the five approved staging PayTR environment fields server-side, seals them, and invokes `quick_links_configure_provider`; it accepts no configuration body and never permits direct browser/SQL DML. Record only `created|used|revoked`; never output values.

- [ ] **Step 6: Complete genuine browser and provider proof**

Create a fresh link from canonical real catalog data; copy/open exact store URL; prove token scrub + cookie; submit checkout; traverse real PayTR test/3DS; receive callback; prove one paid link, one succeeded attempt, consumed reservations, exact stock decrement, one order/quick-link composite FK, matching item/amount/address snapshots, one order event, merchant console paid state, and public paid state.

Negative/replay matrix: wrong host/token/cookie, expired/cancelled link, cross-store token, duplicate checkout, concurrent checkout, callback bad hash/amount/currency/merchant_oid, duplicate valid callback, return URL without callback, callback before/after browser return, unknown provider initiation, cookie replay after paid, and stale status polling. No failure may create a second order or second stock decrement.

Invoke `npm run reconcile:quick-orders --workspace @celebix/storefront-shared` inside the isolated staging service once with a due synthetic provider-unknown attempt created only through the real checkout path. Start one overlapping invocation and prove it reports safe `busy`; prove the first run emits only safe aggregate metrics, uses at most 25 claims, exits nonzero on a controlled provider/network failure, preserves the hold, and later strict success or signed callback settles once. Production scheduling remains out of scope and disabled.

- [ ] **Step 7: Scan and revoke**

Scan DOM, RSC, network, console, database safe projections, runtime logs, and tracked diff for raw link/provider/payment/session material. The only allowed browser token observations are the user-entered initial canonical claim URL (or its single active-alias 308 Location preserving that exact claim path before canonical-host claim) and the PayTR iframe request; record only their redacted origin/path shapes and never either token value. After the canonical claim, the redemption token must disappear from every application-origin redirect/history/network entry, RSC, console, log, analytics event, and safe database projection. The provider token may occur only in the one iframe request. Revoke only the disposable link/redemption session. Retain both the isolated PayTR test merchant credential and provider configuration, without printing them, until Task 14 Step 6; then revoke both. Production impacts remain 0.

Expected gate: `PASS — QUICK_ORDER_PAYTR_STAGING_E2E_COMPLETE`. Navigation remains unchanged until this exact gate passes.

---

### Task 14: Activate `Siparişler > Hızlı Sipariş` after staging proof only

**Files:**
- Modify: `apps/customer-panel/lib/panel-ui/navigation.ts:1-end`
- Modify: `apps/customer-panel/lib/panel-ui/navigation.test.ts:1-end`
- Modify: `apps/customer-panel/components/panel/PanelNavigation.tsx:1-end`
- Verify byte-unchanged: `apps/customer-panel/components/panel/PanelMobileDock.tsx`; the nested quick-order destination belongs in the drawer/sidebar, not the four-item primary dock.
- Modify: `apps/customer-panel/lib/routes.test.ts:1-end`
- Modify: `apps/customer-panel/lib/panel-shell.test.ts:1-end`
- Modify: `tests/saas-phase3/quick-order-runtime/static-security.test.mjs:1-end`

**Interfaces:**
- Add `PanelNavigationHref` value `/orders/quick-links`.
- Add exact child under `PANEL_ORDER_NAVIGATION`:

```ts
Object.freeze({
  key: "quick-orders",
  label: "Hızlı Sipariş",
  href: "/orders/quick-links",
  icon: "quick-orders",
})
```

- [ ] **Step 1: Write RED navigation tests**

Prove exact label/href/order, `/orders/quick-links` active child and Siparişler parent, `/orders`, `/orders-evil`, `/orders/quick-links-evil`, encoded paths, query/hash, double slash and child suffix negatives, desktop/drawer parity, 48px links, and no unsupported donor siblings.

- [ ] **Step 2: Run RED**

```bash
node --experimental-strip-types --test apps/customer-panel/lib/panel-ui/navigation.test.ts
```

Expected: FAIL because `quick-orders` is absent.

- [ ] **Step 3: Add the one proven destination**

Use the existing exact-match helper; do not use prefix-only activation for the child. Add the `Link2` icon import and exact `quick-orders: Link2` icon mapping. Do not add Terk Sepetler or any later menu.

- [ ] **Step 4: Run final complete matrix**

```bash
node --experimental-strip-types --test apps/customer-panel/lib/panel-ui/navigation.test.ts apps/customer-panel/lib/routes.test.ts apps/customer-panel/lib/panel-shell.test.ts
node --experimental-transform-types --test tests/saas-phase3/quick-order-runtime/*.test.mjs
npm test --workspace @celebix/customer-panel
npm test --workspace @celebix/storefront-shared
npm run typecheck --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/storefront-shared
npm run build --workspace @celebix/customer-panel
npm run build --workspace @celebix/storefront-shared
node tests/saas-phase3/quick-order-runtime/postgres-harness.mjs
git diff --check
git diff --quiet 301637111de040fc3bbf3cfed718a2d772e42130..HEAD -- apps/admin
```

Expected: navigation/shell/runtime/workspace/typecheck/build PASS; PostgreSQL 48/48; donor diff 0. Capture fresh local desktop 1025×768 and 1440×900 plus mobile 320×720 and 390×844 screenshots with exact active state, zero overflow, 48px targets, and no unsupported sibling.

- [ ] **Step 5: Review, commit, push**

```bash
git add apps/customer-panel/lib/panel-ui/navigation.ts apps/customer-panel/lib/panel-ui/navigation.test.ts apps/customer-panel/components/panel/PanelNavigation.tsx apps/customer-panel/lib/routes.test.ts apps/customer-panel/lib/panel-shell.test.ts tests/saas-phase3/quick-order-runtime/static-security.test.mjs
git commit -m "feat(customer-panel): activate quick order navigation"
DOCS_SHA="$(awk -F': ' '/^Documentation checkpoint SHA: [0-9a-f]{40}$/ {print $2; exit}' .superpowers/sdd/progress.md)"
test "${#DOCS_SHA}" -eq 40
test "$(git rev-parse HEAD:docs/superpowers/specs/2026-07-21-hemenaku-full-merchant-admin-parity-design.md)" = "$(git rev-parse "$DOCS_SHA:docs/superpowers/specs/2026-07-21-hemenaku-full-merchant-admin-parity-design.md")"
test "$(git rev-parse HEAD:docs/superpowers/plans/2026-07-21-hemenaku-quick-order-links-runtime.md)" = "$(git rev-parse "$DOCS_SHA:docs/superpowers/plans/2026-07-21-hemenaku-quick-order-links-runtime.md")"
test -z "$(git status --porcelain --untracked-files=no)"
git diff --quiet 301637111de040fc3bbf3cfed718a2d772e42130..HEAD -- apps/admin
git push origin codex/hemenaku-admin-presentation-transplant-implementation
REMOTE_SHA="$(git ls-remote --exit-code origin refs/heads/codex/hemenaku-admin-presentation-transplant-implementation | awk '{print $1}')"
test "$(git rev-parse HEAD)" = "$REMOTE_SHA"
```

Expected: normal push, no force-push; remote SHA equals local SHA; `apps/admin/**` diff count 0; production impacts 0.

- [ ] **Step 6: Deploy and prove the exact final navigation SHA**

Deploy the just-pushed exact SHA to isolated customer-panel and shared-storefront staging only. Create a completely fresh quick link, claim it on the canonical host, initiate a fresh PayTR test payment, render the official iframe, complete 3DS, accept the signed callback, and prove exactly one paid link/order/stock decrement at this exact SHA. Repeat callback replay, return-without-callback, wrong host/cookie, and stale status-query negatives; scan DOM/RSC/network/console/logs and then revoke the disposable link/session/merchant credential/provider configuration. Only this post-commit proof permits the menu-ready verdict.

Expected: `PASS — QUICK_ORDER_PAYTR_FINAL_SHA_E2E_COMPLETE`; remote/deployed/local SHA parity; isolated staging credential/config revocation recorded; no Owner/admin/legacy-storefront/production deploy, no production credential mutation, merge, or pilot.

---

## Final Review Gate

- Review the exact range `eccbeeaf439d5bcdd393f333d73897ded877c51f..HEAD` with a fresh whole-branch reviewer.
- Required verdicts: Spec PASS, Quality APPROVED, Critical 0, Important 0.
- Confirm the full donor-parity Quick Order screen is real-backed; list/create/get/cancel/duplicate/copy/open/redeem/initiate/callback/settle/status all cross their intended production code paths.
- Confirm `apps/admin/**` byte diff 0, no Supabase/legacy admin API, no browser tenant/store/provider/price authority, no raw secret/token leakage, no direct table DML, and exact app/workflow/host role separation.
- Confirm genuine PayTR staging evidence or report the precise staging input blocker. Never claim menu-ready/full PASS without the real callback-driven one-order proof.

## Completion Boundary

This plan is complete only when `Siparişler > Hızlı Sipariş` is visible and its real create → exact-host redeem → PayTR callback → atomic one-order flow passes local, PostgreSQL, security, accessibility, and isolated staging proof. The next donor slice is `Siparişler > Terk Sepetler`; it remains unavailable until its own durable authority, API, UI, and staging evidence exist.
