# Google Merchant retail automation implementation plan

> **For agentic workers:** Use subagent-driven development for the three isolated tasks below. ROOT owns integration, review, native migration and the shared release.

**Goal:** Automatically export truthful TRY retail offers and manufacturer identifiers for current and future tenants, and prove real Güzide delivery.

**Architecture:** Reuse the existing immutable, manually published reference-price sets and effective storefront price engine. Add bounded reference/profile change work with source revision fencing; declare own-brand manufacturing per tenant and derive legitimate MPNs. Keep the server-issued checkout price valid during its bounded checkout window.

**Tech stack:** Native PostgreSQL authority/RLS, existing Merchant API v1 queue, TypeScript contracts/data, shared Next.js Customer Panel and storefront.

**Spec:** `docs/superpowers/specs/2026-10-14-google-merchant-design.md`, extended by the user-approved research and explicit instruction to implement without another approval round.

## Global constraints

- Existing stable variant offer IDs, verified domains and tenant credential authority stay in use.
- No live exchange calls, Google calls in saves, browser polling, fake GTINs, fabricated third-party MPNs, or automatic own-brand declaration for unknown tenants.
- Existing invalid-price, missing-image, unpublished-product and genuinely unsupported-product controls remain.
- Short meaningful tests; one build per affected shared app; native compatible support first, panels NET → SITE, storefronts NET → SITE.
- Preserve concurrent shared login changes and all payment, Google and singleton-worker configuration.

## Task 1 — Native retail projection and delivery

- [x] Add `202610140232_google_merchant_retail_identity` migration, rollback and real native assertions.
- [x] Export valid reference-derived TRY prices through `resolve_effective_variant_price`, removing only method-based exclusion.
- [x] Add tenant `identityProfile={ownBrand,brandName,version}`. Overview returns it only with `includeIdentity:true`; authenticated `identity` command validates CAS, operation identity and role.
- [x] Declared own-brand fallback uses real stable SKU/internal code as MPN; explicit GTIN/MPN and explicit no-identifiers choices retain priority; unrelated brands never replaced.
- [x] Add public active-product identifier-only helper `google_merchant_public_product_identifiers(store,product,now)` for host-resolver readers.
- [x] Coalesce reference/profile revisions; drain at most 100 variants per batch. Fence claim/read/finish/defer against revisions so old work cannot mark a new price delivered.

## Task 2 — Bounded checkout price authority

- [x] Add separate `202610140233_google_merchant_checkout_price` migration and regression assertions.
- [x] Reuse existing server quote/cart/customer/source bindings and bounded expiry to protect quoted retail prices across reference activation.
- [x] Keep stock, coupons, tax/shipping, order/payment totals, retry/idempotency and manual sale behavior correct. Browser-supplied old amounts never grant price authority.

## Task 3 — Shared panel and public identifiers

- [x] Add optional compatible profile parser, repository/client identity command and protected POST `/api/marketplaces/google-merchant/identity`.
- [x] Add compact own-brand declaration/brand setting with direct save, CAS and preserved retry buffer.
- [x] Enrich product-detail public variants with optional sanitized `merchantIdentifiers`; no list-level extra lookup. Render selected-variant GTIN/MPN/brand in JSON-LD.
- [x] Test legacy parsing, invalid/foreign identifiers, role/origin, same-operation retry and selected-variant structured data.

## Review focus and live acceptance

- [x] Reference changes during a Google request must produce stale/requeued work, not a false current fingerprint.
- [x] Expired or modified carts cannot reuse protected checkout prices.
- [x] Retailer/third-party products cannot inherit another tenant's brand/MPN declaration.
- [x] Existing readers work during native-first rollout; public helper reveals only genuinely public identifiers.
- [ ] Apply Güzide's user-confirmed own-brand declaration through the authenticated shared setting, requeue the catalog, and inspect actual API/product status. Submitted and Google approval remain distinct.
