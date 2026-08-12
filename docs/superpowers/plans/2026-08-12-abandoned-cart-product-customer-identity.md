# Abandoned Cart Product and Customer Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Terk edilen sepet listesinde kalıcı ürün snapshot'ını ve yalnız doğrulanmış storefront hesabına bağlı müşteri bilgisini göstermek.

**Architecture:** Mevcut cart/customer credential authority genişletilmeden yeniden kullanılır. Doğrulanmış customer credential, mutasyon transaction'ı içinde durable abandoned-cart snapshot'ına store-scoped foreign key olarak bağlanır; projection ürün ve müşteri snapshot'ını tek sorguda merchant paneline verir.

**Tech Stack:** PostgreSQL 16, TypeScript, Node test runner, React/Next.js, CSS Modules.

## Global Constraints

- E-posta veya telefonla tahmini hesap eşleştirmesi yok.
- Ham cookie, credential veya digest projection/log içinde yok.
- Anonim sepet davranışı korunur.
- Tüm veri aynı `store_id` foreign-key ve authority sınırında kalır.
- Değişiklikler kırmızı/yeşil TDD ile yapılır.

---

### Task 1: Contract ve liste projection'ı

**Files:**
- Modify: `packages/saas-contracts/src/abandoned-carts/types.ts`
- Modify: `packages/saas-contracts/src/abandoned-carts/validation.ts`
- Modify: `packages/saas-contracts/src/abandoned-carts/abandoned-carts.test.ts`
- Create: `apps/owner/scripts/sql/saas/202608120103_abandoned_cart_customer_identity.up.sql`
- Create: `apps/owner/scripts/sql/saas/202608120103_abandoned_cart_customer_identity.down.sql`
- Create: `apps/owner/scripts/sql/saas/202608120103_abandoned_cart_customer_identity_assertions.sql`

**Interfaces:**
- Produces: optional `customerId: string` and non-empty carts for optional `firstProductName: string` on `AbandonedCartListItem`.
- Consumes: persisted `abandoned_cart_items.position = 0` and verified store-scoped customer FK.

- [ ] Add failing strict-contract tests for `customerId` and `firstProductName`, including unknown/malformed values.
- [ ] Run `npm test --workspace @celebix/saas-contracts`; expect contract failures.
- [ ] Add the minimal immutable contract fields and validators.
- [ ] Add migration and assertions that project first product and verified customer without exposing credentials.
- [ ] Run contract tests; expect PASS.

### Task 2: Storefront verified customer binding

**Files:**
- Modify: `packages/saas-data/src/storefront-commerce/types.ts`
- Modify: `packages/saas-data/src/storefront-commerce/repository.ts`
- Modify: `packages/saas-data/src/storefront-commerce/repository.test.ts`
- Modify: `apps/storefront-shared/lib/cart/runtime.ts`
- Modify: `apps/storefront-shared/lib/cart/runtime.test.ts`

**Interfaces:**
- Consumes: `customerCandidates: readonly StorefrontCredentialCandidate[]` derived from the signed customer cookie.
- Produces: cart mutate calls that let SQL bind a verified customer account without making read-only cart resolution stateful.

- [ ] Add failing runtime tests proving valid customer candidates are forwarded and missing/invalid cookies remain anonymous.
- [ ] Add failing repository tests for exact SQL parameters and the 16-candidate bound.
- [ ] Run focused tests; expect assertion failures.
- [ ] Implement the minimal runtime/repository parameter path without Request or cookie mutation.
- [ ] Run focused and workspace tests; expect PASS.

### Task 3: Merchant list and mobile UI

**Files:**
- Modify: `apps/customer-panel/components/orders/AbandonedCartConsole.tsx`
- Modify: `apps/customer-panel/components/orders/abandoned-cart-console.module.css`
- Modify: `apps/customer-panel/lib/abandoned-cart-ui/client.test.ts`
- Modify: `apps/customer-panel/lib/abandoned-cart-http/handler.test.ts`
- Modify: focused abandoned-cart presentation tests if present.

**Interfaces:**
- Consumes: `firstProductName`, `itemCount`, optional `customerId/name/email/phone`.
- Produces: product summary and verified customer display on desktop and mobile.

- [ ] Add failing tests for first product, `+N ürün`, full available contact information, customer link and anonymous fallback.
- [ ] Run focused panel tests; expect render/source assertion failures.
- [ ] Implement accessible desktop/mobile presentation and product-name search copy.
- [ ] Run focused panel tests; expect PASS.

### Task 4: PostgreSQL proof and release verification

**Files:**
- Modify: `apps/owner/scripts/sql/saas/phase4t-durable-abandoned-cart-integration-manifest.json` or create a dedicated follow-up manifest matching repository convention.
- Modify: matching migration test/harness allowlists only as required.

**Interfaces:**
- Consumes: migration 103 and existing disposable PostgreSQL harness.
- Produces: exact checksums and regression evidence.

- [ ] Update checksums with `shasum -a 256`; no manual fake values.
- [ ] Run disposable PostgreSQL migration/assertion/rollback/reapply coverage.
- [ ] Run `@celebix/saas-contracts`, `@celebix/saas-data`, customer-panel and storefront-shared focused tests.
- [ ] Run customer-panel/storefront typecheck and builds plus `git diff --check`.
- [ ] Scan tracked diff for credentials, raw digests and cross-store authority leaks.
- [ ] Commit, push, deploy only customer-panel/storefront staging components required by the changed runtime, then verify the live list.
