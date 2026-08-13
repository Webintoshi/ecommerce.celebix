# Payment Settings Control Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` and `superpowers:test-driven-development`; complete every task red-green-refactor.

**Goal:** PayTR ve iyzico hosted ödeme ayarlarını gerçek adapter çağrılarına kadar taşıyan, mağaza-bazlı ve capability-aware ödeme kontrol merkezi oluşturmak.

**Architecture:** Strict provider preference contract `payment_methods.config` otoritesini doğrular. Begin-attempt PostgreSQL projection bu config'i immutable snapshot olarak runtime'a taşır. Runtime generic preferences üretir; provider adapterları resmi payload'a çevirir. UI aynı contract ve adapter packet capabilities üzerinden düzenleme sunar.

**Tech Stack:** TypeScript, React 19, Next.js 16, Node test runner, PostgreSQL 16, existing payment adapters.

## Global constraints

- Production deploy/credential/payment yok.
- Kart verisi, token ve raw secret yok.
- Bilinmeyen config fail-closed.
- Default config mevcut PayTR/iyzico davranışıyla geriye uyumlu.
- Her adım küçük ve bağımsız commit olur.

### Task 1: Strict provider preferences contract

**Files:**
- Create: `packages/saas-contracts/src/payment-providers/provider-method-config.ts`
- Create: `packages/saas-contracts/src/payment-providers/provider-method-config.test.ts`
- Modify: `packages/saas-contracts/src/payment-providers/index.ts`
- Modify: `packages/saas-contracts/src/index.ts`

**Contract:** `parseProviderPaymentMethodConfig(providerCode, value)` and `defaultProviderPaymentMethodConfig(providerCode, environment)`.

- [ ] Add failing tests for PayTR/iyzico defaults, exact fields, enum bounds, hostile descriptors and unknown providers.
- [ ] Run `node --experimental-transform-types --test packages/saas-contracts/src/payment-providers/provider-method-config.test.ts`; expect missing-export failure.
- [ ] Implement immutable strict parser and defaults.
- [ ] Run focused and `npm test --workspace @celebix/saas-contracts`; expect PASS.
- [ ] Commit `feat(payment): define hosted checkout preferences`.

### Task 2: Payment method API and console state

**Files:**
- Modify: `apps/customer-panel/lib/payment-method-http/handler.ts`
- Modify: `apps/customer-panel/lib/payment-method-http/handler.test.ts`
- Modify: `apps/customer-panel/lib/payment-settings-ui/console-state.ts`
- Modify: `apps/customer-panel/lib/payment-settings-ui/console-state.test.ts`

**Behavior:** Provider save validates strict config and activation creates provider-specific defaults.

- [ ] Add failing tests for defaults, preference update, wrong environment, unsupported/unknown fields and no repository call on denial.
- [ ] Run focused tests; expect assertion failures.
- [ ] Replace exact environment-only checks with strict provider preference checks while preserving execution authority matching.
- [ ] Run focused tests; expect PASS.
- [ ] Commit `feat(payment): persist provider checkout preferences`.

### Task 3: Durable attempt snapshot and runtime projection

**Files:**
- Modify: `packages/saas-data/src/payment-attempts/types.ts`
- Modify: `packages/saas-data/src/payment-attempts/validation.ts`
- Modify: `packages/saas-data/src/payment-attempts/repository.ts`
- Modify: `packages/saas-data/src/payment-attempts/repository.test.ts`
- Create: `apps/owner/scripts/sql/saas/202608120104_payment_method_preference_snapshot.up.sql`
- Create: `apps/owner/scripts/sql/saas/202608120104_payment_method_preference_snapshot.down.sql`
- Create: `apps/owner/scripts/sql/saas/202608120104_payment_method_preference_snapshot_assertions.sql`
- Modify: `apps/storefront-shared/lib/payment-adapters/runtime.ts`
- Modify: `apps/storefront-shared/lib/payment-adapters/runtime.test.ts`

**Contract:** Begin result and callback/reconciliation authority include immutable `methodConfig`; runtime parses it and emits generic `preferences`.

- [ ] Add failing repository and runtime tests for exact config snapshot, replay stability and hostile config rejection before provider call.
- [ ] Run focused tests; expect failures.
- [ ] Add SQL projection and strict repository validation.
- [ ] Thread preferences into adapter initialize input without mutating request or authority objects.
- [ ] Run focused tests; expect PASS.
- [ ] Commit `feat(payment): bind checkout preferences to attempts`.

### Task 4: PayTR and iyzico provider payloads

**Files:**
- Modify: `packages/payment-adapters/src/contracts.ts`
- Modify: `packages/payment-adapters/src/providers/paytr/adapter.ts`
- Modify: `packages/payment-adapters/src/providers/paytr/adapter.test.ts`
- Modify: `packages/payment-adapters/src/providers/iyzico/adapter.ts`
- Modify: `packages/payment-adapters/src/providers/iyzico/adapter.test.ts`

**Behavior:** PayTR receives exact `no_installment/max_installment`; iyzico receives exact `locale/enabledInstallments`.

- [ ] Add failing tests for default, single-payment, bounded installments, locale and malformed preferences.
- [ ] Run adapter tests; expect failures.
- [ ] Implement minimal exact mapping; leave callback/signature behavior unchanged.
- [ ] Run `npm test --workspace @celebix/payment-adapters`; expect PASS.
- [ ] Commit `feat(payment): apply checkout preferences to adapters`.

### Task 5: Modern payment control UI

**Files:**
- Create: `apps/customer-panel/components/settings/payment/ProviderCheckoutSettingsDrawer.tsx`
- Modify: `apps/customer-panel/components/settings/payment/PaymentSettingsConsole.tsx`
- Modify: `apps/customer-panel/components/settings/payment/payment-settings.module.css`
- Modify: `apps/customer-panel/lib/payment-settings-ui/model.ts`
- Modify: `apps/customer-panel/lib/payment-settings-ui/model.test.ts`
- Create: `apps/customer-panel/lib/payment-settings-ui/provider-preferences.test.ts`

**UI contract:** Active/configured provider rows expose “Checkout ayarları”; drawer shows environment, provider-managed 3D, language support and installment choices with exact capability copy.

- [ ] Add failing view-model/source tests for honest capability labels and saved config.
- [ ] Run focused tests; expect failures.
- [ ] Implement accessible dialog, busy/error states and version-aware save.
- [ ] Add responsive CSS; ensure all interactive targets >= 48px.
- [ ] Run focused UI tests; expect PASS.
- [ ] Commit `feat(payment): add payment control center`.

### Task 6: Verification and release handoff

**Files:**
- Modify migration manifest/checksums following repository convention only if migration Task 3 is retained.

- [ ] Run migration apply/assert/rollback/reapply on disposable PostgreSQL 16.
- [ ] Run `npm test --workspace @celebix/saas-contracts`.
- [ ] Run `npm test --workspace @celebix/saas-data`.
- [ ] Run `npm test --workspace @celebix/payment-adapters`.
- [ ] Run focused storefront-shared payment tests.
- [ ] Run `npm test --workspace @celebix/customer-panel`.
- [ ] Run customer-panel/storefront typecheck and build.
- [ ] Run `git diff --check` and secret/card-data scan.
- [ ] Whole-branch review; repair Critical/Important findings.
- [ ] Push without force. Staging deployment remains a separate explicit gate; production impact stays zero.

