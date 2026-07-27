# Payment Adapter Runtime Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Replace the PayTR-specific execution seam with a provider-neutral, fail-closed hosted-payment runtime; inventory all 58 real POS Entegratör variants; and move PayTR iFrame behind the common contract as the first sandbox-gated adapter.

**Architecture:** A server-only @celebix/payment-adapters workspace owns immutable compatibility packets, bounded HTTP transport, adapter contracts, and the executable registry. MerchantProviderProfile remains the only store-scoped credential authority; @celebix/saas-data gains an additive generic attempt/event aggregate, and apps/storefront-shared invokes only registered adapters. Direct POS and PAN handling stay outside this runtime.

**Tech Stack:** Node.js 20.9+, TypeScript 5.9, Next.js 16.2, React 19.2, PostgreSQL 16, built-in fetch and node:crypto, Node test runner, @celebix/saas-contracts, @celebix/saas-data, Coolify isolated staging.

## Global Constraints

- apps/admin/** and apps/storefront-base/** are read-only donors and must have zero diff.
- All 58 non-dummy POS Entegratör Pro 2.6.73 variants receive one exact compatibility record; dummy-payment never enters production packets, DTOs, registries, or bundles.
- The supplied plugin is a behavior reference; current official provider documentation is authoritative when sources differ.
- Visible packet, connectable descriptor, executable adapter, sandbox readiness, and live readiness are separate states.
- Provider endpoints are compile-time canonical HTTPS allowlists. Merchant input never supplies provider origins, callback origins, DNS names, or paths.
- Store/profile/method authority comes only from authenticated server context or an opaque server-created callback binding.
- Credentials remain AES-256-GCM envelopes bound to store, profile, provider, capability, credential version, and key ID.
- Test/live credentials, endpoints, flags, bindings, and readiness are separate; credentials are never tried across environments.
- PAN, CVV, full card numbers, authorization headers, plaintext credentials, raw responses, and uncontrolled PII never enter contracts, database JSON, logs, traces, fixtures, or UI state.
- This plan handles hosted redirect/iFrame/token flows only. Direct POS stays verification until the isolated PCI runtime and external gates exist.
- Browser return pages are never financial authority. Only a verified callback/webhook or provider status query settles an attempt.
- Ambiguous provider writes are never automatically retried; they become provider_outcome_unknown and enter reconciliation.
- Every mutation uses server authority, operation ID, fingerprint, optimistic version, and fail-closed unknown-commit recovery.
- RED -> GREEN -> REFACTOR is mandatory for every task.
- No production credential or real-money transaction is used. Sandbox evidence never exposes a full test card, CVV, merchant key, or merchant salt.
- Coolify deploy pins the exact pushed SHA and runs health, auth, callback, checkout, desktop, and mobile smoke tests before readiness changes.

## Scope Decomposition

This is the first executable sub-project from the approved platform design. It produces one reusable provider-neutral path plus one real hosted adapter.

After it is green, separate plans use these exact contracts in this order:

1. Hosted/iframe/orchestrator adapters: iyzico modes, Craftgate, İşyerimPOS, Shopier, Papara Checkout, Mollie, Moka, Lidio, PayNKolay, Vallet, AkÖde, and remaining hosted institutions.
2. Wallet and alternative methods: Hepsipay, Papara, Paycell, Papel, Ozan, Setcard, Garanti Pay, and provider-specific wallet modes.
3. Isolated direct-POS runtime: EST v3, PayFor, Posnet/Posnet v1, Pay Smart, PayFlex v4, InterPOS, and custom bank APIs.
4. Provider certification and live activation: refund/cancel/capture matrices, sandbox/live evidence, runbooks, and per-provider feature flags.

Later plans may not create a second transport, registry, credential format, callback authority model, or payment state machine.

---

## File Structure

### New workspace

- Create packages/payment-adapters/package.json and tsconfig.json.
- Create src/contracts.ts, validation.ts, transport.ts, registry.ts, index.ts, and focused tests.
- Create src/packets/plugin-inventory.ts and plugin-inventory.test.ts.
- Create src/providers/paytr/packet.ts, config.ts, adapter.ts, and tests.

### Durable authority

- Create migration 202607270052_payment_adapter_runtime with up/down/assertions and phase3k manifest.
- Create packages/saas-data/src/payment-attempts/types.ts, validation.ts, errors.ts, repository.ts, repository.test.ts, index.ts.
- Create tests/saas-phase3/payment-adapter-runtime PostgreSQL, static-security, and cross-layer tests.

### Runtime and UI

- Create apps/storefront-shared/lib/payment-adapters/runtime.ts and callback-authority.ts with tests.
- Create apps/storefront-shared/app/api/payments/[providerCode]/callback/[binding]/route.ts.
- Create apps/customer-panel/lib/payment-provider-adapters/default.ts with tests.
- Modify catalog-data.ts, catalog tests, provider-execution registry/runtime, payment settings model, connection drawer, and workspace package manifests.

---

### Task 1: Add exact hosted-adapter contracts

**Files:**
- Create: packages/payment-adapters/package.json
- Create: packages/payment-adapters/tsconfig.json
- Create: packages/payment-adapters/src/contracts.ts
- Create: packages/payment-adapters/src/validation.ts
- Create: packages/payment-adapters/src/contracts.test.ts
- Create: packages/payment-adapters/src/index.ts

**Interfaces:**
- Produces PaymentAdapterPacket, HostedPaymentAdapter, HostedPaymentInitialization, HostedPaymentStatus, VerifiedProviderCallback, and parsePaymentAdapterPacket(value).
- Consumes only safe types from @celebix/saas-contracts.

- [ ] **Step 1: Write the failing exact-contract test**

~~~ts
const packet = parsePaymentAdapterPacket({
  providerCode: "paytr_iframe",
  familyCode: "paytr",
  modeCode: "iframe",
  adapterVersion: 1,
  implementation: "hosted",
  readiness: { test: "verification", live: "planned" },
  endpoints: {
    test: [
      "https://www.paytr.com/odeme/api/get-token",
      "https://www.paytr.com/odeme/durum-sorgu"
    ],
    live: [
      "https://www.paytr.com/odeme/api/get-token",
      "https://www.paytr.com/odeme/durum-sorgu"
    ]
  },
  publicFields: [
    { key: "merchantId", label: "Mağaza numarası", minimum: 1, maximum: 128 }
  ],
  credentialFields: [
    { key: "merchantKey", label: "Mağaza parolası", minimum: 1, maximum: 256, secret: true },
    { key: "merchantSalt", label: "Mağaza gizli anahtarı", minimum: 1, maximum: 256, secret: true }
  ],
  capabilities: {
    initialize: true,
    callback: true,
    query: true,
    threeDSecure: true,
    installments: true,
    preAuth: false,
    capture: false,
    cancel: false,
    refund: false,
    partialRefund: false,
    tokenization: false
  },
  documentation: [
    { url: "https://dev.paytr.com/iframe-api", verifiedAt: "2026-07-27", authority: "official" }
  ]
});
assert.equal(packet.providerCode, "paytr_iframe");
assert.equal(Object.isFrozen(packet.capabilities), true);
~~~

Reject unknown keys, getters, proxies, sparse arrays, duplicate fields/endpoints, HTTP URLs, user-info/ports/query/fragment URLs, overlapping public/secret keys, unsupported capability combinations, control characters, dummy_payment, and arrays beyond fixed bounds.

- [ ] **Step 2: Run RED**

~~~bash
npm test --workspace @celebix/payment-adapters
~~~

Expected: workspace or exports do not exist.

- [ ] **Step 3: Implement the minimal immutable contracts**

~~~ts
export type HostedPaymentInitialization =
  | Readonly<{ kind: "redirect"; url: string; providerReference: string | null }>
  | Readonly<{ kind: "iframe"; url: string; token: string; providerReference: string | null }>
  | Readonly<{ kind: "pending"; providerReference: string | null }>
  | Readonly<{ kind: "rejected"; code: string }>
  | Readonly<{ kind: "unknown"; code: "provider_outcome_unknown" }>;

export type HostedPaymentStatus =
  | Readonly<{ kind: "succeeded"; providerReference: string; paidAmountMinor: number; currency: string }>
  | Readonly<{ kind: "failed"; providerReference: string | null; code: string }>
  | Readonly<{ kind: "pending"; providerReference: string | null }>
  | Readonly<{ kind: "unknown"; providerReference: string | null }>;

export type VerifiedProviderCallback = Readonly<{
  eventKey: string;
  status: "succeeded" | "failed";
  providerReference: string | null;
  paidAmountMinor: number;
  currency: string;
  safeCode: string;
}>;

export type HostedPaymentInitializeInput<TCredential extends object> = Readonly<{
  environment: "test" | "live";
  credential: TCredential;
  attemptId: string;
  orderReference: string;
  amountMinor: number;
  currency: string;
  callbackUrl: string;
  successUrl: string;
  failureUrl: string;
  customer: Readonly<{
    name: string;
    email: string;
    phone: string;
    ipAddress: string;
    address: string;
  }>;
  basket: readonly Readonly<{
    reference: string;
    name: string;
    quantity: number;
    unitAmountMinor: number;
  }>[];
  signal: AbortSignal;
}>;

export type HostedPaymentCallbackInput<TCredential extends object> = Readonly<{
  environment: "test" | "live";
  credential: TCredential;
  method: "POST";
  headers: Readonly<Record<string, string>>;
  body: Uint8Array;
  expected: Readonly<{
    attemptId: string;
    orderReference: string;
    amountMinor: number;
    currency: string;
  }>;
}>;

export type HostedPaymentQueryInput<TCredential extends object> = Readonly<{
  environment: "test" | "live";
  credential: TCredential;
  attemptId: string;
  orderReference: string;
  providerReference: string | null;
  amountMinor: number;
  currency: string;
  signal: AbortSignal;
}>;
~~~

`HostedPaymentAdapter<TCredential>` exposes packet, parseCredential, maskAccount, initialize, verifyCallback, and query using only the three exact inputs above. The callback body is bounded before adapter invocation; none of the contracts contains PAN/CVV. Validation uses exact own enumerable data properties, rejects accessors/proxies, copies dense bounded arrays, canonicalizes lower-snake codes and HTTPS URLs, and deep-freezes outputs.

- [ ] **Step 4: Run GREEN and commit**

~~~bash
npm test --workspace @celebix/payment-adapters
npm run typecheck --workspace @celebix/payment-adapters
git add packages/payment-adapters package-lock.json
git commit -m "feat(payments): add hosted adapter contracts"
~~~

---

### Task 2: Inventory all 58 plugin variants

**Files:**
- Create: packages/payment-adapters/src/packets/source-types.ts
- Create: packages/payment-adapters/src/packets/plugin-inventory.ts
- Create: packages/payment-adapters/src/packets/plugin-inventory.test.ts
- Modify: packages/payment-adapters/src/index.ts
- Modify: apps/customer-panel/lib/payment-providers/catalog.test.ts

**Interfaces:**
- Produces PAYMENT_ADAPTER_PACKET_INVENTORY as an exact 58-record frozen array.
- Produces getPaymentAdapterPacketSource(providerCode) with exact lowercase lookup.

- [ ] **Step 1: Write failing one-to-one coverage tests**

~~~ts
assert.equal(PAYMENT_ADAPTER_PACKET_INVENTORY.length, 58);
assert.equal(new Set(PAYMENT_ADAPTER_PACKET_INVENTORY.map((item) => item.providerCode)).size, 58);
assert.deepEqual(
  PAYMENT_ADAPTER_PACKET_INVENTORY.map((item) => item.sourceSlug).sort(),
  sourceInventory.gatewaySlugs.filter((slug) => slug !== "dummy-payment").sort()
);
assert.equal(PAYMENT_ADAPTER_PACKET_INVENTORY.some((item) => item.sourceSlug === "dummy-payment"), false);
assert.equal(PAYMENT_ADAPTER_PACKET_INVENTORY.every((item) => item.implementationState === "inventory_only"), true);
~~~

Each record includes provider/family/mode/source codes, gateway/settings classes, protocol family, plugin/base versions, implementation state, source paths, and official documentation candidates. Reject duplicate classes and paths outside includes/payment-gateways or includes/abstracts.

- [ ] **Step 2: Run RED**

~~~bash
node --experimental-transform-types --test packages/payment-adapters/src/packets/plugin-inventory.test.ts apps/customer-panel/lib/payment-providers/catalog.test.ts
~~~

Expected: missing inventory module/export.

- [ ] **Step 3: Implement curated protocol mapping**

~~~ts
export const PAYMENT_PROTOCOL_FAMILIES = Object.freeze([
  "est_v3",
  "payfor",
  "posnet",
  "posnet_v1",
  "pay_smart",
  "payflex_v4",
  "interpos",
  "provider_specific",
  "base_plugin"
] as const);
~~~

Map Akbank/QNB/Halkbank/İş Bankası/Şekerbank/TEB/Ziraat variants to est_v3; QNB PayFor variants and Ziraat Katılım to payfor; Yapı Kredi/Worldpay to posnet; Albaraka to posnet_v1; PayBull/QNBpay/Sipay/Vepara to pay_smart; VakıfBank to payflex_v4; DenizBank to interpos; lite-plugin inherited providers to base_plugin; all others to provider_specific.

- [ ] **Step 4: Run GREEN and commit**

~~~bash
npm test --workspace @celebix/payment-adapters
node --experimental-transform-types --test apps/customer-panel/lib/payment-providers/catalog.test.ts
git add packages/payment-adapters/src/packets apps/customer-panel/lib/payment-providers/catalog.test.ts
git commit -m "feat(payments): inventory provider adapter variants"
~~~

---

### Task 3: Add bounded transport and immutable registries

**Files:**
- Create: packages/payment-adapters/src/transport.ts
- Create: packages/payment-adapters/src/transport.test.ts
- Create: packages/payment-adapters/src/registry.ts
- Create: packages/payment-adapters/src/registry.test.ts
- Modify: packages/payment-adapters/src/index.ts

**Interfaces:**
- Produces createBoundedProviderTransport(options).request(input).
- Produces createPaymentAdapterRegistry(packets, adapters).packet(code)/adapter(code).
- Transport accepts only a byte-equal packet/environment allowlisted endpoint.

- [ ] **Step 1: Write failing transport and registry tests**

~~~ts
const transport = createBoundedProviderTransport({
  fetch: observedFetch,
  timeoutMs: 20_000,
  maximumResponseBytes: 8_192
});
const response = await transport.request({
  packet: paytrPacket,
  environment: "test",
  url: "https://www.paytr.com/odeme/api/get-token",
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new TextEncoder().encode("merchant_id=123456")
});
assert.equal(response.kind, "response");
~~~

Reject origin/path/query mismatch, redirects, Set-Cookie, invalid content type, announced/streamed overflow, duplicate JSON keys, timeout, retry, duplicate registry entries, mutable adapters, packet/version mismatch, missing inventory, and executable inventory_only packets.

- [ ] **Step 2: Run RED**

~~~bash
node --experimental-strip-types --test packages/payment-adapters/src/transport.test.ts packages/payment-adapters/src/registry.test.ts
~~~

- [ ] **Step 3: Implement fail-closed result and behavior**

~~~ts
export type ProviderTransportResult =
  | Readonly<{ kind: "response"; status: number; contentType: string; body: Uint8Array }>
  | Readonly<{ kind: "unknown"; code: "transport_outcome_unknown" }>;
~~~

Use redirect manual, cache no-store, bounded timeout, streamed byte counting, exact content types, and finally-zeroed buffers. Caught errors and raw bodies never escape.

- [ ] **Step 4: Run GREEN and commit**

~~~bash
npm test --workspace @celebix/payment-adapters
npm run typecheck --workspace @celebix/payment-adapters
git add packages/payment-adapters/src
git commit -m "feat(payments): add bounded adapter transport"
~~~

---

### Task 4: Add generic durable attempts, events, and callback bindings

**Files:**
- Create: apps/owner/scripts/sql/saas/202607270052_payment_adapter_runtime.up.sql
- Create: apps/owner/scripts/sql/saas/202607270052_payment_adapter_runtime.down.sql
- Create: apps/owner/scripts/sql/saas/202607270052_payment_adapter_runtime_assertions.sql
- Create: apps/owner/scripts/sql/saas/phase3k-payment-adapter-runtime-manifest.json
- Create: tests/saas-phase3/payment-adapter-runtime/postgres-harness.mjs
- Create: tests/saas-phase3/payment-adapter-runtime/static-security.test.mjs
- Modify: tests/saas-phase3/run-current-suite.mjs

**Interfaces:**
- Produces saas.payment_attempts, payment_attempt_events, payment_callback_bindings, and payment_attempt_operations.
- Produces payment_attempt_begin, payment_attempt_mark_initialized, payment_attempt_mark_unknown, payment_callback_authority, payment_attempt_settle_callback, payment_attempt_claim_reconciliation, and payment_attempt_finalize_reconciliation.
- Keeps historical checkout_payment_attempts compatible until Task 7.

- [ ] **Step 1: Write failing static and PostgreSQL tests**

Enforce owner role, forced RLS, exact revokes/grants, no CASCADE/dynamic SQL/session tenant authority, and reverse-order down migration. Prove:

~~~text
created -> awaiting_customer -> submitted -> captured
created -> provider_outcome_unknown -> reconciliation_required -> captured
created -> failed
captured -> partially_refunded -> refunded
created -> expired
~~~

Reject skipped states, cross-store references, inactive/emergency methods, non-active profiles, credential-version/amount/currency mismatch, callback replay mismatch, duplicate command fingerprint mismatch, direct DML, event mutation, stale versions, and unknown callback tokens.

- [ ] **Step 2: Run RED**

~~~bash
node --test tests/saas-phase3/payment-adapter-runtime/static-security.test.mjs
node tests/saas-phase3/payment-adapter-runtime/postgres-harness.mjs
~~~

- [ ] **Step 3: Implement exact additive schema**

~~~sql
CHECK(status IN(
  'created','awaiting_customer','submitted','provider_outcome_unknown',
  'authorized','captured','failed','cancelled','partially_refunded',
  'refunded','expired','reconciliation_required'
))
~~~

Persist immutable store/method/profile/provider/environment/credential-version/amount/currency/order authority. Store bounded safe references and digests only. The application creates a random 32-byte callback credential, computes its SHA-256 digest, and passes only that digest into `payment_attempt_begin`; SQL stores and returns no plaintext callback credential. Events are append-only and raw-payload-free.

- [ ] **Step 4: Run GREEN and commit**

~~~bash
node tests/saas-phase3/payment-adapter-runtime/postgres-harness.mjs
npm run test:saas-phase3:current
git add apps/owner/scripts/sql/saas/202607270052_payment_adapter_runtime.* apps/owner/scripts/sql/saas/phase3k-payment-adapter-runtime-manifest.json tests/saas-phase3/payment-adapter-runtime tests/saas-phase3/run-current-suite.mjs
git commit -m "feat(payments): add durable adapter runtime authority"
~~~

---

### Task 5: Add the generic attempt repository

**Files:**
- Create: packages/saas-data/src/payment-attempts/types.ts
- Create: packages/saas-data/src/payment-attempts/validation.ts
- Create: packages/saas-data/src/payment-attempts/errors.ts
- Create: packages/saas-data/src/payment-attempts/repository.ts
- Create: packages/saas-data/src/payment-attempts/repository.test.ts
- Create: packages/saas-data/src/payment-attempts/index.ts
- Modify: packages/saas-data/src/index.ts

**Interfaces:**
- Produces PaymentAttemptRepository methods matching Task 4 SQL functions.
- Produces PostgresPaymentAttemptRepository using role celebix_saas_workflow.
- Returns exact frozen authority objects and bounded PaymentAttemptRepositoryError codes.

- [ ] **Step 1: Write failing repository tests**

Prove exact query/value order, BEGIN/SET LOCAL ROLE/timeouts/COMMIT, rollback/client destruction, hostile row rejection, unknown outcomes, idempotent commit recovery, and one audit event after unknown commit.

~~~ts
type BeginPaymentAttemptResult = Readonly<{
  outcome: "created" | "replayed";
  attemptId: string;
  storeId: string;
  paymentMethodId: string;
  profileId: string;
  providerCode: string;
  environment: "test" | "live";
  credentialVersion: number;
  amountMinor: number;
  currency: string;
  publicConfig: Readonly<Record<string, MerchantAdminJson>>;
  sealedCredentials: SealedMerchantProviderCredential;
}>;

type BeginPaymentAttemptInput = Readonly<{
  authority: StoreAuthority;
  operationId: string;
  fingerprint: string;
  paymentMethodId: string;
  orderReference: string;
  amountMinor: number;
  currency: string;
  callbackBindingDigest: string;
}>;
~~~

- [ ] **Step 2: Run RED**

~~~bash
node --experimental-strip-types --test packages/saas-data/src/payment-attempts/repository.test.ts
~~~

- [ ] **Step 3: Implement strict repository/parsers**

Follow provider-execution repository for AAD-bound envelope parsing and payments repository for commit-unknown recovery. Do not carry PayTR-only merchantOid, testMode 1, or TRY restrictions into generic types.

- [ ] **Step 4: Run GREEN and commit**

~~~bash
npm test --workspace @celebix/saas-data
npm run typecheck --workspace @celebix/saas-data
git add packages/saas-data/src/payment-attempts packages/saas-data/src/index.ts
git commit -m "feat(payments): add generic attempt repository"
~~~

---

### Task 6: Build the provider-neutral storefront execution seam

**Files:**
- Create: apps/storefront-shared/lib/payment-adapters/runtime.ts
- Create: apps/storefront-shared/lib/payment-adapters/runtime.test.ts
- Create: apps/storefront-shared/lib/payment-adapters/callback-authority.ts
- Create: apps/storefront-shared/lib/payment-adapters/callback-authority.test.ts
- Create: apps/storefront-shared/app/api/payments/[providerCode]/callback/[binding]/route.ts
- Modify: apps/storefront-shared/lib/default-runtime.ts
- Modify: apps/storefront-shared/package.json

**Interfaces:**
- Produces createHostedPaymentRuntime(dependencies) with initialize, callback, and reconcile operations.
- Consumes PaymentAttemptRepository, credential keyring, adapter registry, trusted host authority, clock, and cryptographic random source.
- Callback path is /api/payments/{providerCode}/callback/{binding}; binding is canonical 32-byte base64url.

- [ ] **Step 1: Write failing runtime and callback tests**

~~~ts
const runtime = createHostedPaymentRuntime({
  attempts,
  adapters,
  keyring,
  selectAuthority: () => ({ kind: "trusted", hostname: "pilot.saas-staging.celebix.site" }),
  now: () => new Date("2026-07-27T12:00:00.000Z"),
  randomBytes: (size) => new Uint8Array(size).fill(7)
});
~~~

Cover trusted host/origin, active method/profile, environment equality, adapter lookup, credential open/digest/zeroing, callback credential generation/digest persistence, timeout classification, safe projection, wrong provider, malformed/unknown binding, forbidden headers, oversize body, invalid content type, duplicate fields, cross-store reference, signature/amount/currency mismatch, and replay mismatch.

- [ ] **Step 2: Run RED**

~~~bash
node --experimental-transform-types --test apps/storefront-shared/lib/payment-adapters/*.test.ts
~~~

- [ ] **Step 3: Implement minimal safe projection**

~~~ts
type HostedPaymentPresentation =
  | Readonly<{ kind: "redirect"; url: string }>
  | Readonly<{ kind: "iframe"; url: string; token: string }>
  | Readonly<{ kind: "processing" }>
  | Readonly<{ kind: "rejected" }>;
~~~

Never project provider reference, callback binding, credential version, raw errors, or secrets. Reparse and allowlist-match every redirect/iFrame URL.

- [ ] **Step 4: Run GREEN and commit**

~~~bash
npm test --workspace @celebix/storefront-shared
npm run typecheck --workspace @celebix/storefront-shared
git add apps/storefront-shared/lib/payment-adapters apps/storefront-shared/app/api/payments/'[providerCode]'/callback/'[binding]'/route.ts apps/storefront-shared/lib/default-runtime.ts apps/storefront-shared/package.json package-lock.json
git commit -m "feat(payments): add hosted adapter runtime"
~~~

---

### Task 7: Port PayTR iFrame behind the common contract

**Files:**
- Create: packages/payment-adapters/src/providers/paytr/packet.ts
- Create: packages/payment-adapters/src/providers/paytr/config.ts
- Create: packages/payment-adapters/src/providers/paytr/config.test.ts
- Create: packages/payment-adapters/src/providers/paytr/adapter.ts
- Create: packages/payment-adapters/src/providers/paytr/adapter.test.ts
- Modify: packages/payment-adapters/src/packets/plugin-inventory.ts
- Modify: packages/payment-adapters/src/index.ts
- Modify: apps/storefront-shared/lib/checkout/paytr.ts
- Modify: apps/storefront-shared/lib/checkout/paytr.test.ts
- Modify: apps/storefront-shared/lib/checkout/runtime.ts
- Modify: apps/storefront-shared/app/api/payments/paytr/callback/route.ts

**Interfaces:**
- Produces PAYTR_IFRAME_PACKET and createPaytrIframeAdapter(transport).
- Preserves old PayTR helper exports as compatibility delegates for one release.
- Marks paytr_iframe executable after conformance but does not promote readiness; paytr direct API remains verification.

- [ ] **Step 1: Write failing official-vector tests**

Port canonical merchant ID/key/salt, token, callback HMAC, status query, malformed response, timeout, duplicate callback, amount mismatch, and no-retry tests.

~~~text
POST https://www.paytr.com/odeme/api/get-token
POST https://www.paytr.com/odeme/durum-sorgu
presentation https://www.paytr.com/odeme/guvenli/{token}
callback acknowledgment exact text/plain UTF-8 OK
callback hash HMAC-SHA256 then Base64 with timing-safe compare
~~~

- [ ] **Step 2: Run RED**

~~~bash
node --experimental-strip-types --test packages/payment-adapters/src/providers/paytr/*.test.ts
~~~

- [ ] **Step 3: Move implementation behind common transport**

Move rather than duplicate canonical body, HMAC, response parsing, and query code. Preserve exactly one call/no retry. Every transport/parse ambiguity returns provider_outcome_unknown.

~~~ts
const expectedCallback: VerifiedProviderCallback = {
  eventKey: "merchant-order-123:success",
  status: "succeeded",
  providerReference: null,
  paidAmountMinor: 10_000,
  currency: "TRY",
  safeCode: "success"
};
~~~

- [ ] **Step 4: Switch shared storefront with equivalence tests**

Historical PayTR callback route becomes a delegate. Equivalence tests prove byte-equal request body, callback hash, exact OK, status query, ambiguity, and replay behavior before deleting private helpers.

- [ ] **Step 5: Run GREEN and commit**

~~~bash
npm test --workspace @celebix/payment-adapters
npm test --workspace @celebix/storefront-shared
npm run typecheck --workspace @celebix/payment-adapters
npm run typecheck --workspace @celebix/storefront-shared
git add packages/payment-adapters/src/providers/paytr packages/payment-adapters/src/packets/plugin-inventory.ts packages/payment-adapters/src/index.ts apps/storefront-shared/lib/checkout apps/storefront-shared/app/api/payments/paytr/callback/route.ts
git commit -m "feat(payments): port PayTR to hosted adapter runtime"
~~~

---

### Task 8: Expose exact connection fields and adapter-backed readiness

**Files:**
- Create: apps/customer-panel/lib/payment-provider-adapters/default.ts
- Create: apps/customer-panel/lib/payment-provider-adapters/default.test.ts
- Modify: apps/customer-panel/lib/server-provider-execution/registry.ts
- Modify: apps/customer-panel/lib/server-provider-execution/registry.test.ts
- Modify: apps/customer-panel/lib/server-provider-execution/runtime.ts
- Modify: apps/customer-panel/lib/payment-providers/catalog-data.ts
- Modify: apps/customer-panel/lib/payment-providers/catalog.test.ts
- Modify: apps/customer-panel/lib/payment-settings-ui/model.ts
- Modify: apps/customer-panel/lib/payment-settings-ui/model.test.ts
- Modify: apps/customer-panel/components/settings/payment/PaymentProviderConnectionDrawer.tsx
- Modify: apps/customer-panel/components/settings/payment/PaymentSettingsConsole.tsx
- Modify: apps/customer-panel/package.json

**Interfaces:**
- Produces an explicit executable registry; it never discovers adapters from filesystem or environment.
- Produces PayTR fields merchantId, merchantKey, merchantSalt from the packet.
- connectable requires sandbox_ready/production_ready plus matching executable descriptor; an executable adapter in verification is still non-connectable.

- [ ] **Step 1: Write failing registry/model/UI tests**

~~~ts
assert.equal(registry.size, 1);
assert.equal(registry.get("paytr_iframe", "payment_processing")?.credentialFields.length, 2);
assert.equal(view.cards.find((card) => card.providerCode === "paytr_iframe")?.actionLabel, "Hazırlanıyor");
assert.equal(view.cards.find((card) => card.providerCode === "paytr")?.actionLabel, "Hazırlanıyor");
assert.equal(view.cards.filter((card) => card.connectable).length, 0);

const sandboxReadyView = buildPaymentSettingsView({
  catalog: promoteTestReadiness(catalog, "paytr_iframe", {
    state: "sandbox_ready",
    adapterVersion: 1,
    evidenceDigest: "sha256:test-only-fixture"
  }),
  registry
});
assert.equal(sandboxReadyView.cards.find((card) => card.providerCode === "paytr_iframe")?.actionLabel, "Bağla");
assert.equal(sandboxReadyView.cards.filter((card) => card.connectable).length, 1);
~~~

Add secret scans, environment mismatch, failed validation, rotation, disabled/revoked profile, and permission-denied tests.

- [ ] **Step 2: Run RED**

~~~bash
node --experimental-transform-types --test apps/customer-panel/lib/payment-provider-adapters/*.test.ts apps/customer-panel/lib/server-provider-execution/registry.test.ts apps/customer-panel/lib/payment-settings-ui/model.test.ts
~~~

- [ ] **Step 3: Implement explicit assembly and exact drawer fields**

The default catalog remains verification. A test-only readiness fixture proves the gated UI path without promoting production data. When readiness is legitimately promoted, the drawer shows environment, exact public/secret labels, generated callback URL, test status, masked reference, and rotation. It never pre-fills a secret. Failed validation stays pending_validation; successful merchant credential validation activates only the test profile/method; it does not promote platform adapter readiness.

- [ ] **Step 4: Run GREEN and commit**

~~~bash
npm test --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/customer-panel
git add apps/customer-panel/lib/payment-provider-adapters apps/customer-panel/lib/server-provider-execution apps/customer-panel/lib/payment-providers apps/customer-panel/lib/payment-settings-ui apps/customer-panel/components/settings/payment apps/customer-panel/package.json package-lock.json
git commit -m "feat(payments): connect admin to adapter registry"
~~~

---

### Task 9: Verify, collect sandbox evidence, push, and deploy staging

**Files:**
- Create: tests/saas-phase3/payment-adapter-runtime/in-process.test.mjs
- Create: tests/saas-phase3/payment-adapter-runtime/evidence-artifact.test.mjs
- Create: apps/owner/scripts/paytr-iframe-sandbox-evidence.ts
- Create: docs/ops/evidence/paytr-iframe-sandbox-2026-07-27.json
- Create: docs/ops/payment-adapter-runtime-runbook.md
- Create: apps/owner/scripts/sql/saas/202607270054_paytr_iframe_sandbox_promotion.up.sql
- Create: apps/owner/scripts/sql/saas/202607270054_paytr_iframe_sandbox_promotion.down.sql
- Create: apps/owner/scripts/sql/saas/202607270054_paytr_iframe_sandbox_promotion_assertions.sql
- Create: apps/owner/scripts/sql/saas/phase3m-paytr-iframe-sandbox-promotion-manifest.json
- Modify: packages/payment-adapters/src/providers/paytr/packet.ts
- Modify: apps/customer-panel/lib/payment-providers/catalog-data.ts
- Modify: apps/customer-panel/lib/payment-provider-adapters/default.ts
- Modify: apps/owner/lib/merchant-provider-execution/default.ts
- Modify: apps/storefront-shared/lib/payment-adapters/default.ts
- Modify: apps/storefront-shared/lib/payment-adapters/runtime.ts
- Modify: tests/saas-phase3/run-current-suite.mjs

**Interfaces:**
- Produces a cumulative cross-layer gate, canonical secret-free PayTR TEST evidence,
  an exact owner-approved sandbox authority, and a PayTR rollback/circuit-breaker runbook.
- Produces no production credential, real-money transaction, PAN/CVV capture, or
  production activation.
- Keeps the customer-panel, owner worker, storefront runtime, and database authority
  on one immutable `{ environment, adapterVersion, evidenceDigest }` tuple.

- [ ] **Step 1: Write failing cross-layer acceptance test**

Prove store A active PayTR test profile/method -> generic attempt -> official request vector -> iFrame -> signed callback -> captured outcome. Prove store B cannot access store A data and browser return alone cannot settle.

Also prove that an absent, stale, superseded, or revoked authority causes zero
profile persistence, zero validation claim/decrypt/network, zero method activation,
and zero new payment attempt. Replayed operations must recheck current authority.

- [ ] **Step 2: Run RED**

~~~bash
node --test tests/saas-phase3/payment-adapter-runtime/in-process.test.mjs
~~~

- [ ] **Step 3: Add dormant final wiring and the evidence runner**

Wire the real PayTR adapter registry and `PostgresPaymentAttemptRepository` into
storefront-shared, but keep it disabled unless the exact compiled authority and the
operator activation mode agree. The customer panel must likewise remain
non-connectable while its activation mode is disabled. Owner validation claims and
marks carry the same compiled tuple; the evidence digest is not merchant input and
is not trusted from an unverified environment value.

Add a one-use PayTR TEST evidence runner that reuses the already approved fixed
staging PayTR callback path while generic merchant activation remains unavailable.
It may initialize only `test_mode=1`, never logs a response/token/body, never accepts
merchant-supplied origins, and emits only the bounded evidence schema below. The
new hosted adapter remains protected by the Task 7 byte-equivalence tests and the
Task 9 in-process generic runtime test.

Document exact feature flag, callback path, health checks, reconciliation command, circuit breaker, and rollback SHA. Register the test in the cumulative suite. Do not add another adapter.

- [ ] **Step 4: Run complete fail-closed local gate**

~~~bash
git diff --check
npm test --workspace @celebix/payment-adapters
npm test --workspace @celebix/saas-contracts
npm test --workspace @celebix/saas-data
npm test --workspace @celebix/customer-panel
npm test --workspace @celebix/owner
npm test --workspace @celebix/storefront-shared
npm run typecheck --workspace @celebix/payment-adapters
npm run typecheck --workspace @celebix/saas-contracts
npm run typecheck --workspace @celebix/saas-data
npm run typecheck --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/owner
npm run typecheck --workspace @celebix/storefront-shared
npm run test:saas-phase3:current
npm run build --workspace @celebix/customer-panel
npm run build --workspace @celebix/owner
npm run build --workspace @celebix/storefront-shared
~~~

Require zero payment-scope failures and exit 0 for each command. The user-approved
exception remains only the previously recorded unrelated root/donor typecheck
failures; do not touch donor applications to hide them.

- [ ] **Step 5: Run official PayTR sandbox evidence**

Required cases:

~~~text
successful iFrame initiation and signed callback
provider-declined test transaction
duplicate callback replay
status query after simulated write timeout
status verification through the official query endpoint
~~~

Run the evidence from isolated staging with the existing operator-managed TEST
credential variables. Never read or print their values. PayTR iFrame supplies its
own test-card data; the browser session must not record HAR, trace, video,
screenshot, console/network bodies, PAN, expiry, or CVV.

The committed canonical evidence object contains only:

~~~text
schemaVersion, providerCode, capability, environment, adapterVersion
testedGitSha, packetDigest, officialDocumentationUrls, verifiedAt
maskedMerchantSuffix
cases[]: caseId, operationId/attemptId, safeProviderReferenceDigest,
         resultClass, callbackDigest, startedAt, completedAt
testMode=true, realMoney=false, rawCardCaptured=false, secretsCaptured=false
~~~

Its canonical JSON SHA-256 becomes the exact evidence digest. If any required case
is missing, ambiguous, or cannot be verified by the provider, stop: readiness stays
`verification`, authority remains absent, and tests are not weakened. Refund,
cancel, capture, tokenization, and live-readiness claims remain false.

- [ ] **Step 6: Commit the fail-closed runner, push, and deploy all three apps dormant**

Commit the evidence runner, dormant storefront composition, in-process tests, and
runbook without readiness promotion. Push and verify the exact remote SHA. Configure
the same newly generated dedicated provider credential keyring on customer-panel,
owner, and storefront without exposing it in output. Keep owner worker, storefront
PayTR runtime, and panel PayTR activation modes disabled.

Pin and deploy the same SHA to:

~~~text
customer-panel yk1h6d97z7ex0h74ok3zrj5c
owner          bpsgdwfiswna06mooguu2mr3
storefront     vtc2aah63jbqnmtxmvykn6jl
~~~

Apply migration 053, then verify all health/preflight endpoints while the durable
authority table still has no PayTR row. Confirm the disabled modes produce no claim,
provider network call, connectable UI, or generic payment attempt.

- [ ] **Step 7: Create the exact sandbox promotion commit**

Only after Step 5 evidence passes:

- freeze one shared PayTR TEST authority constant;
- change only PayTR iFrame packet/catalog TEST readiness to `sandbox_ready`;
- give the panel descriptor, owner validation registry, and storefront runtime the
  byte-identical authority;
- add migration 054, whose owner-only approval path inserts that exact tuple and no
  live authority;
- pin 054 ACL/RLS/function bodies and test approve/revoke races, rollback, and stale
  tuples; and
- snapshot adapter version/evidence digest on payment attempts so callbacks and
  status queries cannot silently switch adapter authority mid-attempt.

Re-run Steps 1 and 4, commit, push, and verify local/remote SHA equality. PayTR
Direct and every other provider remain truthful non-connectable.

- [ ] **Step 8: Deploy and activate staging in dependency order**

Deploy the exact promotion SHA to owner, storefront, and customer-panel while all
three activation modes remain disabled. Let owner apply migration 054. Verify the
database exact authority, owner preflight, storefront health, and panel health.

Then enable and redeploy in this order:

~~~text
1. storefront PayTR TEST runtime
2. owner approved TEST validation worker
3. customer-panel PayTR TEST connection surface
~~~

The panel is last so `Bağla` cannot appear before worker, database, and checkout are
ready. Determine and verify the actual Coolify egress IPv4 from the deployed owner
container before configuring PayTR validation. Use the tenant storefront origin,
never the admin origin, for customer return URLs.

- [ ] **Step 9: Verify live browser and HTTP**

~~~bash
git status --short
git rev-parse HEAD
git ls-remote --heads origin codex/celebix-managed-umami-analytics
~~~

Reconfirm local/remote SHA equality; only `.codex-evidence/` may remain untracked.

~~~text
owner/customer-panel/storefront health -> 200
/settings/payment -> authenticated panel
58/58 provider cards visible
48 unique logos loaded
PayTR iFrame -> Bağla only with exact DB+catalog+descriptor+adapter evidence
all other adapters -> truthful non-connectable state
PayTR TEST profile save -> pending_validation -> worker validated -> active method
TEST checkout -> generic attempt -> PayTR iFrame -> signed callback -> settled once
browser success/failure return alone -> no settlement authority
duplicate callback -> exact plain OK with no duplicate fulfillment
official status query -> same final result
desktop 1440px and mobile 390px -> no overflow
browser console -> no payment-surface errors or warnings
~~~

At any failure, revoke the exact DB authority first. That immediately cuts new
profile saves, claims, provider validation calls, method activation, and payment
begins while existing TEST callback/query reconciliation drains. Then disable panel,
owner, and storefront modes and roll back to the last known-good SHA. Migration 053
down remains forbidden until profiles, methods, attempts, and authority are drained.

Leave the live payment settings tab open for user inspection.

---

## Plan Self-Review Checklist

- Tasks 1-9 cover every runtime-foundation requirement in the approved specification.
- All 58 variants enter the inventory; inventory never implies readiness.
- Credentials remain store/profile/version-bound and never become browser-readable.
- Callbacks use opaque bindings plus provider verification; browser return cannot settle.
- Unknown outcomes enter reconciliation without duplicate writes.
- Direct POS/PAN remains outside shared storefront and this plan.
- Existing PayTR behavior migrates by equivalence tests rather than duplication.
- Historical quick-order behavior remains compatible while the generic aggregate is additive.
- Later provider plans must reuse these exact contracts and security boundaries.
