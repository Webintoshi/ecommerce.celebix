# PayTR Merchant Self-Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let every Celebix merchant enter its own PayTR credentials, select test or live mode, save once, and receive a real active hosted-card payment method after bounded provider validation.

**Architecture:** Keep the existing sealed tenant profile, owner validation worker, payment-method authority, hosted runtime, fixed PayTR callback, and standard checkout. Expose PayTR profile saving through the existing verification path before execution authority exists; validate the merchant credentials in the owner worker; bind the exact compiled environment authority and activate the PayTR method atomically after validation. The merchant UI remains a compact provider-specific form and never exposes internal evidence concepts.

**Tech Stack:** TypeScript, React 19, Next.js App Router, Node test runner, PostgreSQL 16 SECURITY DEFINER functions, Celebix payment adapter/provider-execution packages, CSS Modules, Lucide React.

## Global Constraints

- Each merchant uses only its own sealed `merchantId`, `merchantKey`, and `merchantSalt`.
- No shared PayTR runtime credential, store-specific hardcode, raw secret log, or credential response payload.
- The fixed notification URL is `https://${storefrontHostname}/api/payments/paytr/callback`.
- `Test Modu` maps to `test_mode=1`; live maps to `test_mode=0`.
- Browser return is not payment proof; only verified callback or reconciliation may capture an attempt.
- Save, validation, authority binding, method activation, and callback remain replay-safe and fail closed.
- Preserve bank transfer, cash on delivery, iyzico, standard checkout, quick-order, and single-active-hosted-provider behavior.
- Do not import credentials from the donor WordPress page.
- Use test-first red-green-refactor for every production behavior change.

---

### Task 1: PayTR Test/Live Adapter Contract

**Files:**
- Modify: `packages/payment-adapters/src/providers/paytr/adapter.test.ts`
- Modify: `packages/payment-adapters/src/providers/paytr/adapter.ts`
- Modify: `packages/payment-adapters/src/providers/paytr/packet.ts`
- Modify: `packages/payment-adapters/src/index.ts`

**Interfaces:**
- Consumes: existing `ProviderTransport`, `PaytrIframeCredential`, hosted adapter contracts.
- Produces: `validatePaytrIframeCredentialWithTransport()` and `createPaytrIframeAdapter()` that preserve the selected `"test" | "live"` environment and exact PayTR `test_mode` value.

- [ ] **Step 1: Write failing environment tests**

Add focused cases proving:

```ts
test("PayTR live credential validation signs test_mode zero without opening an iframe", async () => {
  const result = await validatePaytrIframeCredentialWithTransport(transport((request) => {
    assert.match(new TextDecoder().decode(request.body), /(?:^|&)test_mode=0(?:&|$)/);
    return json({ status: "success", token: VALID_TOKEN });
  }), { ...validationInput(), environment: "live" });
  assert.deepEqual(result, { kind: "validated" });
});

test("PayTR live hosted initialize and callback require test_mode zero", async () => {
  // Initialize must send test_mode=0; callback with test_mode=1 must reject.
});
```

- [ ] **Step 2: Verify RED**

Run:

```bash
npm test --workspace @celebix/payment-adapters -- --test-name-pattern="PayTR live"
```

Expected: FAIL because current parser rejects `environment: "live"` and callback/status parsing requires test mode `1`.

- [ ] **Step 3: Implement exact environment mapping**

Update PayTR initialization, validation, query, hosted initialize, callback verification, and result types so:

```ts
const testMode = environment === "test" ? 1 : 0;
```

The callback parser accepts only the expected mode passed by the hosted runtime. No mode coercion, fallback, or environment inference from browser input is allowed.

- [ ] **Step 4: Run focused and package tests**

```bash
npm test --workspace @celebix/payment-adapters
npm run typecheck --workspace @celebix/payment-adapters
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/payment-adapters/src/providers/paytr
git add packages/payment-adapters/src/index.ts
git commit -m "feat(payments): support PayTR test and live modes"
```

### Task 2: PayTR Build and Environment Authority Binding

**Files:**
- Create: `packages/payment-adapters/src/providers/paytr/build-binding.ts`
- Create: `packages/payment-adapters/src/providers/paytr/build-binding.test.ts`
- Create: `packages/payment-adapters/src/providers/paytr/build-metadata.generated.ts`
- Create: `scripts/generate-paytr-build.mjs`
- Create: `scripts/generate-paytr-build.test.mjs`
- Modify: `packages/payment-adapters/src/index.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `PAYTR_APPROVED_EXECUTION_AUTHORITIES`, an immutable environment-keyed map:

```ts
type PaytrExecutionAuthorityMap = Readonly<{
  test: Readonly<PaymentProviderExecutionAuthority> | null;
  live: Readonly<PaymentProviderExecutionAuthority> | null;
}>;
```

- [ ] **Step 1: Write failing build-binding tests**

Cover deterministic source manifests, test/live candidate digests, mismatched source SHA, unapproved authority, wrong environment, and generated metadata tampering. Require a single adapter source manifest and separate evidence digests per environment.

- [ ] **Step 2: Verify RED**

```bash
npm test --workspace @celebix/payment-adapters -- --test-name-pattern="PayTR build"
```

Expected: FAIL because the PayTR build-binding exports do not exist.

- [ ] **Step 3: Implement build binding and generator**

Mirror the strict iyzico source-manifest pattern without sharing provider constants. Accept only:

```text
CELEBIX_PAYTR_TEST_APPROVAL_MODE=approved_test_sandbox
CELEBIX_PAYTR_TEST_APPROVED_EVIDENCE_DIGEST must equal the generated test candidate digest
CELEBIX_PAYTR_LIVE_APPROVAL_MODE=approved_live
CELEBIX_PAYTR_LIVE_APPROVED_EVIDENCE_DIGEST must equal the generated live candidate digest
SOURCE_COMMIT must be the exact 40-character lowercase source commit SHA
```

Generated source-control defaults remain `null`; build-time approval must exactly match the generated candidate.

- [ ] **Step 4: Add root scripts and test generator**

Add:

```json
"generate:paytr-build": "node --experimental-strip-types ./scripts/generate-paytr-build.mjs",
"check:paytr-build": "node --experimental-strip-types ./scripts/generate-paytr-build.mjs --check",
"test:paytr-build": "node --experimental-strip-types --test ./scripts/generate-paytr-build.test.mjs"
```

Include `generate:paytr-build` in the three Coolify payment-capable builds before Next.js build.

- [ ] **Step 5: Verify**

```bash
npm test --workspace @celebix/payment-adapters
npm run test:paytr-build
npm run typecheck --workspace @celebix/payment-adapters
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json scripts/generate-paytr-build.mjs scripts/generate-paytr-build.test.mjs
git add packages/payment-adapters/src/providers/paytr packages/payment-adapters/src/index.ts
git commit -m "feat(payments): bind PayTR build authority"
```

### Task 3: PayTR Verification Registry and Worker Activation

**Files:**
- Modify: `apps/owner/lib/merchant-provider-execution/paytr-validation-adapter.test.ts`
- Modify: `apps/owner/lib/merchant-provider-execution/paytr-validation-adapter.ts`
- Modify: `apps/owner/lib/merchant-provider-execution/registry.ts`
- Modify: `apps/owner/lib/merchant-provider-execution/production-config.test.ts`
- Modify: `apps/owner/lib/merchant-provider-execution/production-config.ts`
- Modify: `apps/owner/lib/merchant-provider-execution/production.test.ts`
- Modify: `apps/owner/lib/merchant-provider-execution/production.ts`
- Modify: `apps/owner/lib/merchant-provider-execution/worker.test.ts`
- Modify: `apps/owner/lib/merchant-provider-execution/worker.ts`

**Interfaces:**
- Produces: PayTR verification adapters for `{ environment: "test", adapterVersion: 1 }` and `{ environment: "live", adapterVersion: 1 }`, independent from execution-authority availability.

- [ ] **Step 1: Write failing registry tests**

Assert both PayTR verification identities register when configured, credentials are opened only inside the worker, selected environment reaches the adapter, unavailable remains pending, and rejection becomes rotation-required.

- [ ] **Step 2: Verify RED**

```bash
npm test --workspace @celebix/owner -- --test-name-pattern="PayTR verification"
```

Expected: FAIL because PayTR identities are currently empty and its validation adapter is execution-authority bound.

- [ ] **Step 3: Split PayTR verification from execution validation**

Make the PayTR adapter implement `MerchantProviderVerificationAdapter` with one selected `validationIdentity`. Preserve bounded transport, public egress IP, fixed validation origin, secret wiping, and finite outcome codes.

- [ ] **Step 4: Enable identities in production config**

`compiledVerificationIdentities()` returns test and live PayTR identities. `paytrValidation` is required when either a PayTR verification identity or execution authority exists, not only when test execution authority exists.

- [ ] **Step 5: Verify**

```bash
npm test --workspace @celebix/owner -- --test-name-pattern="merchant-provider|PayTR"
npm run typecheck --workspace @celebix/owner
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/owner/lib/merchant-provider-execution
git commit -m "feat(payments): verify merchant PayTR credentials"
```

### Task 4: Durable PayTR Verification Finalize and Method Activation

**Files:**
- Create: `apps/owner/scripts/sql/saas/202608130105_paytr_merchant_self_service.up.sql`
- Create: `apps/owner/scripts/sql/saas/202608130105_paytr_merchant_self_service.down.sql`
- Create: `apps/owner/scripts/sql/saas/202608130105_paytr_merchant_self_service_assertions.sql`
- Create: `apps/owner/scripts/sql/saas/paytr-merchant-self-service-migration.test.ts`
- Modify: `packages/saas-data/src/provider-execution/workflow-repository.test.ts`
- Modify: `packages/saas-data/src/provider-execution/workflow-repository.ts`

**Interfaces:**
- Consumes: existing `merchant_provider_profile_mark_verification` lease result and compiled authority rows.
- Produces: one transaction that marks a validated PayTR profile active, binds the matching authority when present, creates/updates the provider payment method with safe defaults, disables another active hosted provider, and returns the final profile projection.

- [ ] **Step 1: Write failing migration/source tests**

Assert the migration:

```sql
-- locks profile and all store payment methods deterministically;
-- matches authority on provider/environment/adapter/evidence;
-- activates only paytr_iframe after validated outcome;
-- keeps unavailable pending and rejects invalid credentials;
-- writes full strict provider config defaults;
-- preserves emergency-disabled state;
-- grants execution only to celebix_saas_workflow.
```

- [ ] **Step 2: Verify RED**

```bash
npm test --workspace @celebix/owner -- --test-name-pattern="PayTR merchant self-service migration"
```

Expected: FAIL because migration 105 does not exist.

- [ ] **Step 3: Implement additive SQL replacement**

Replace the verification finalize function through a wrapper/renamed predecessor, without adding a new table. On PayTR validated outcome:

```sql
SELECT exact authority FOR SHARE;
UPDATE profile SET execution_* = authority.*;
UPDATE other hosted methods SET state='disabled';
INSERT ... ON CONFLICT ... PayTR method state='active';
```

If authority is absent, the profile may be credential-validated but no method becomes active. The UI must not label that state active.

- [ ] **Step 4: Add PostgreSQL 16 disposable tests**

Cover two-store isolation, replay, concurrent single-active-provider enforcement, invalid credential outcome, missing authority, test/live config, ACL, rollback, and reapply.

- [ ] **Step 5: Update repository parsing only if result shape changes**

Keep secrets and evidence out of the returned profile projection. No new browser DTO is introduced.

- [ ] **Step 6: Verify**

```bash
npm test --workspace @celebix/saas-data -- --test-name-pattern="verification"
npm test --workspace @celebix/owner -- --test-name-pattern="PayTR merchant self-service migration"
npm run typecheck --workspace @celebix/saas-data
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/owner/scripts/sql/saas packages/saas-data/src/provider-execution
git commit -m "feat(payments): activate validated PayTR methods"
```

### Task 5: Merchant PayTR Setup Surface

**Files:**
- Modify: `apps/customer-panel/lib/payment-provider-adapters/default.test.ts`
- Modify: `apps/customer-panel/lib/payment-provider-adapters/default.ts`
- Modify: `apps/customer-panel/lib/payment-providers/catalog.test.ts`
- Modify: `apps/customer-panel/lib/payment-providers/catalog.ts`
- Modify: `apps/customer-panel/lib/payment-settings-ui/model.test.ts`
- Modify: `apps/customer-panel/lib/payment-settings-ui/model.ts`
- Create: `apps/customer-panel/components/settings/payment/PaytrConnectionForm.tsx`
- Modify: `apps/customer-panel/components/settings/payment/PaymentProviderConnectionDrawer.tsx`
- Modify: `apps/customer-panel/components/settings/payment/PaymentProviderCatalogDialog.tsx`
- Modify: `apps/customer-panel/components/settings/payment/PaymentSettingsConsole.tsx`
- Modify: `apps/customer-panel/components/settings/payment/payment-settings.module.css`
- Modify: `apps/customer-panel/lib/payment-settings-console.test.ts`

**Interfaces:**
- Consumes: existing verification descriptor and `providerExecutionApi.save()`.
- Produces: provider-specific PayTR form with `Test Modu`, three fields, fixed callback URL, PayTR panel link, one save action, and finite statuses.

- [ ] **Step 1: Write failing model tests**

Assert:

```ts
assert.equal(paytrCard.actionLabel, "Kur");
assert.equal(paytrView.callbackUrl, "https://shop.example/api/payments/paytr/callback");
assert.equal(paytrView.submitLabel, "Ayarları Kaydet");
assert.doesNotMatch(JSON.stringify(paytrView), /evidence|authority|merchantKey|merchantSalt/);
```

Also cover pending, active-test, active-live, rotation-required, unavailable, and another-provider-active warning.

- [ ] **Step 2: Verify RED**

```bash
npm test --workspace @celebix/customer-panel -- --test-name-pattern="PayTR.*setup|PayTR.*callback"
```

Expected: FAIL because PayTR is not configurable without authority and callback URL is generic.

- [ ] **Step 3: Expose PayTR verification profiles**

Make `paytrEntry()` always use `profileSaveMode: "verification"` and expose both
environments with `executionAuthority: null`. The worker and SQL layer bind the
exact approved authority after credential validation. Catalog readiness remains
truthful: configurable credentials do not imply executable checkout.

- [ ] **Step 4: Build the compact PayTR form**

Use Lucide `ShieldCheck`, `Eye`, `EyeOff`, `Copy`, and `ExternalLink`. Render a switch for test mode, password reveal controls, read-only callback row, merchant panel link, and one orange `Ayarları Kaydet` button. Keep labels and errors in Turkish and preserve focus trap/Escape behavior.

- [ ] **Step 5: Add bounded polling**

After save, refresh profiles/methods with bounded delays while status is pending. Stop on active, rotation-required, disabled, component unmount, or timeout. Do not resend secrets and do not auto-submit on GET.

- [ ] **Step 6: Verify UI tests and typecheck**

```bash
npm test --workspace @celebix/customer-panel -- --test-name-pattern="payment|PayTR"
npm run typecheck --workspace @celebix/customer-panel
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/customer-panel/lib/payment-provider-adapters apps/customer-panel/lib/payment-providers
git add apps/customer-panel/lib/payment-settings-ui apps/customer-panel/components/settings/payment
git add apps/customer-panel/lib/payment-settings-console.test.ts
git commit -m "feat(customer-panel): add PayTR merchant setup"
```

### Task 6: Storefront PayTR Authority and Checkout Runtime

**Files:**
- Modify: `apps/storefront-shared/lib/payment-adapters/default.test.ts`
- Modify: `apps/storefront-shared/lib/payment-adapters/default.ts`
- Modify: `apps/storefront-shared/lib/payment-adapters/runtime.test.ts`
- Modify: `apps/storefront-shared/lib/checkout/paytr.test.ts`
- Modify: `apps/storefront-shared/lib/checkout/runtime.ts`
- Modify: `apps/storefront-shared/lib/default-runtime.test.ts`
- Modify: `apps/storefront-shared/lib/default-runtime.ts`

**Interfaces:**
- Consumes: selected profile environment, compiled PayTR authority map, sealed credential, existing fixed callback route.
- Produces: hosted runtime that selects exact `paytr_iframe + environment` authority and supports test/live initialization without changing callback URL.

- [ ] **Step 1: Write failing runtime tests**

Cover approved test, approved live, missing selected authority, mismatched profile environment, callback mode mismatch, and exact fixed callback bridging by `merchant_oid` digest.

- [ ] **Step 2: Verify RED**

```bash
npm test --workspace @celebix/storefront-shared -- --test-name-pattern="PayTR.*authority|PayTR.*live"
```

Expected: FAIL because compiled authorities currently hardcode PayTR to `null` and selector ignores environment.

- [ ] **Step 3: Implement environment-aware selector**

Change the internal selector signature to:

```ts
selectCompiledAuthority(providerCode: string, environment: "test" | "live")
```

Do not change the public callback route. The runtime derives environment from the durable attempt/profile, never request input.

- [ ] **Step 4: Verify storefront**

```bash
npm test --workspace @celebix/storefront-shared -- --test-name-pattern="payment|checkout|PayTR"
npm run typecheck --workspace @celebix/storefront-shared
npm run build --workspace @celebix/storefront-shared
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/storefront-shared/lib
git commit -m "feat(storefront): run merchant PayTR checkout"
```

### Task 7: Full Validation and Authenticated Staging Smoke

**Files:**
- Modify only when a failing acceptance test identifies a scoped defect.
- Do not add credential artifacts, screenshots containing secrets, or deployment env files.

**Interfaces:**
- Produces: reviewable code and evidence; no production deployment in this task unless separately authorized after staging passes.

- [ ] **Step 1: Run diff and focused suites**

```bash
git diff --check
npm test --workspace @celebix/payment-adapters
npm test --workspace @celebix/saas-contracts
npm test --workspace @celebix/saas-data
npm test --workspace @celebix/owner
npm test --workspace @celebix/customer-panel
npm test --workspace @celebix/storefront-shared
```

- [ ] **Step 2: Run typechecks and builds**

```bash
npm run typecheck --workspace @celebix/payment-adapters
npm run typecheck --workspace @celebix/saas-contracts
npm run typecheck --workspace @celebix/saas-data
npm run typecheck --workspace @celebix/owner
npm run typecheck --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/storefront-shared
npm run build --workspace @celebix/owner
npm run build --workspace @celebix/customer-panel
npm run build --workspace @celebix/storefront-shared
```

- [ ] **Step 3: Verify scope and secret hygiene**

```bash
git diff --name-only 61145074...HEAD
git diff 61145074...HEAD | rg -n "merchant_(key|salt)|Merchant Password|Merchant Salt"
```

Only field names and test placeholders may match. No real value, token, callback body, env, or store-specific credential may appear.

- [ ] **Step 4: Authenticated browser smoke**

On Güzide staging, with merchant-entered test credentials only:

1. Open payment settings at 1440, 768, and 390 px.
2. Confirm PayTR `Kur` opens the compact form.
3. Confirm test toggle, three fields, fixed callback URL, merchant-panel link, and one save action.
4. Save once and observe pending -> active without another activation click.
5. Confirm checkout exposes one hosted-card method and opens the PayTR iframe.
6. Complete only an approved PayTR test transaction; verify callback -> one captured attempt -> one order.
7. Confirm no fatal console/hydration/overflow and no raw secret in DOM/network/console/screenshots.

- [ ] **Step 5: Final commit for scoped acceptance fixes**

```bash
git add apps/customer-panel apps/owner apps/storefront-shared packages/payment-adapters packages/saas-data package.json scripts
git commit -m "fix(payments): complete PayTR setup acceptance"
```

Skip this commit when no acceptance fix is needed.
