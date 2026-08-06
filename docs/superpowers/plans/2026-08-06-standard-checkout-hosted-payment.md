# Standard Checkout Hosted Payment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the standard shared-storefront cart checkout to the store's one active PayTR or iyzico hosted provider with durable stock holds, verified settlement, and unchanged offline checkout.

**Architecture:** PostgreSQL owns a store-scoped hosted-checkout session that snapshots canonical cart, delivery, payment-method, credential, and inventory authority. The existing generic `PaymentAttemptRepository` and provider adapters keep ownership of provider execution; a scoped bridge creates the session and hold during begin, persists a sealed presentation, and finalizes one paid order from a verified captured attempt.

**Tech Stack:** TypeScript, React 19, Next.js App Router, Node test runner, PostgreSQL 16 PL/pgSQL, `pg`, `@celebix/payment-adapters`, `@celebix/saas-contracts`, `@celebix/saas-data`.

## Global Constraints

- Work only in `/Users/Celebix/Desktop/ecommerce-celebix/.codex-worktrees/guzide-staging-integration` on `codex/design-tabs-save-fix-live`.
- Never touch or stage the user-owned untracked `.superpowers/` directory.
- Follow strict red-green-refactor; observe every behavior test fail before production code.
- Store authority comes only from the authenticated storefront proxy hostname.
- Browser inputs never own store, totals, stock, method profile, provider authority, or payment result.
- Only one hosted provider may be active per store and checkout exposes one generic card choice.
- Card data, provider secrets, Authorization, raw callback bodies, identity number, and raw presentation tokens never enter logs or public DTOs.
- Only a verified durable `captured` attempt may create a paid order; browser return is not proof.
- Offline bank transfer, cash on delivery, customer account, and guest checkout remain operational.
- Use additive migrations `090`, `091`, and `092`; never edit historical migration artifacts.
- Every migration has up/down/assertions, SHA-pinned manifest, static tests, and PostgreSQL 16 disposable proof.
- Hosted execution remains fail-closed without exact compiled provider authority, evidence, credential version, worker readiness, and feature gate.

---

## File Map

- `packages/saas-contracts/src/storefront/commerce.ts`: public hosted-card and completed-receipt contract.
- `apps/owner/scripts/sql/saas/202608060090_*`: hosted session tables, reservation ownership, available-stock helper, quote projection.
- `apps/owner/scripts/sql/saas/202608060091_*`: authority, begin, presentation, and public status RPCs.
- `apps/owner/scripts/sql/saas/202608060092_*`: captured/failure finalizer, trigger, expiry/reconciliation RPCs.
- `packages/saas-data/src/storefront-hosted-checkout/*`: typed PostgreSQL repository boundary.
- `apps/storefront-shared/lib/checkout/standard-hosted-*`: cookie, start, presentation, and status orchestration.
- `apps/storefront-shared/app/api/checkout/payment/start/route.ts`: exact same-origin hosted start endpoint.
- `apps/storefront-shared/app/checkout/payment/route.ts`: token-free provider presentation route.
- `apps/storefront-shared/app/checkout/payment/result/page.tsx`: server-status-owned result surface.
- `apps/storefront-shared/scripts/reconcile-standard-checkouts.mjs`: bounded workflow worker.
- `apps/storefront-shared/components/CheckoutForm.tsx`: generic card selection without local card fields.
- `tests/saas-phase3/storefront-hosted-checkout/*`: cumulative database and security gates.

---

### Task 1: Public Hosted-Card Contract

**Files:**
- Modify: `packages/saas-contracts/src/storefront/commerce.ts`
- Modify: `packages/saas-contracts/src/storefront/commerce.test.ts`

**Interfaces:**
- Produces: `PublicHostedCardPaymentMethod`, expanded `PublicPaymentMethod`, and `PublicCheckoutReceipt.paymentStatus: "pending" | "completed"`.
- Consumed by: quote repository, checkout UI, hosted receipt finalizer.

- [x] **Step 1: Write the failing exact-contract tests**

```ts
const HOSTED_CARD = Object.freeze({
  kind: "hosted_card" as const,
  id: "81000000-0000-4000-8000-000000000083",
  label: "Kredi veya banka kartı",
  instructions: "Güvenli sağlayıcı ekranında tamamlanır.",
  providerCode: "iyzico_iframe" as const,
  presentation: "redirect" as const,
  requiredCustomerFields: Object.freeze(["identity_number"] as const),
});

test("checkout quote accepts one exact hosted card without private authority", () => {
  assert.deepEqual(parsePublicCheckoutQuote({ cart: CART, paymentMethods: [HOSTED_CARD] }).paymentMethods, [HOSTED_CARD]);
  assert.throws(() => parsePublicCheckoutQuote({ cart: CART, paymentMethods: [{ ...HOSTED_CARD, profileId: crypto.randomUUID() }] }));
  assert.throws(() => parsePublicCheckoutQuote({ cart: CART, paymentMethods: [{ ...HOSTED_CARD, requiredCustomerFields: ["card_number"] }] }));
});

test("only hosted receipts may be completed", () => {
  assert.equal(parsePublicCheckoutReceipt({ ...RECEIPT, paymentMethod: HOSTED_CARD, paymentStatus: "completed" }).paymentStatus, "completed");
  assert.throws(() => parsePublicCheckoutReceipt({ ...RECEIPT, paymentMethod: BANK_TRANSFER, paymentStatus: "completed" }));
});
```

- [x] **Step 2: Run RED**

Run: `node --experimental-strip-types --test packages/saas-contracts/src/storefront/commerce.test.ts`

Expected: FAIL because hosted cards and completed receipts are not accepted.

- [x] **Step 3: Implement the discriminated union**

```ts
export type PublicHostedCardPaymentMethod = Readonly<{
  kind: "hosted_card";
  id: string;
  label: string;
  instructions: string;
  providerCode: "paytr_iframe" | "iyzico_iframe";
  presentation: "iframe" | "redirect";
  requiredCustomerFields: readonly "identity_number"[];
}>;
```

Keep built-in shapes unchanged, raise quote cardinality from two to three, reject duplicate kinds/IDs, and require `completed` only with `hosted_card`.

- [x] **Step 4: Run GREEN and regression**

```bash
node --experimental-strip-types --test packages/saas-contracts/src/storefront/commerce.test.ts
npm test --workspace @celebix/saas-contracts
npm run typecheck --workspace @celebix/saas-contracts
```

- [x] **Step 5: Commit**

```bash
git add packages/saas-contracts/src/storefront/commerce.ts packages/saas-contracts/src/storefront/commerce.test.ts
git commit -m "feat(checkout): add hosted card public contract"
```

### Task 2: Hosted Checkout Foundation and Canonical Available Stock

**Files:**
- Create: `apps/owner/scripts/sql/saas/202608060090_storefront_hosted_checkout_foundation.up.sql`
- Create: `apps/owner/scripts/sql/saas/202608060090_storefront_hosted_checkout_foundation.down.sql`
- Create: `apps/owner/scripts/sql/saas/202608060090_storefront_hosted_checkout_foundation_assertions.sql`
- Create: `apps/owner/scripts/sql/saas/phase4j-storefront-hosted-checkout-foundation-manifest.json`
- Create: `apps/owner/scripts/sql/saas/storefront-hosted-checkout-migration.test.ts`
- Create: `tests/saas-phase3/storefront-hosted-checkout/postgres-harness.mjs`

**Interfaces:**
- Produces: `storefront_hosted_checkout_sessions`, immutable operations, `storefront_available_stock`, and hosted method public projection.
- Consumed by: Tasks 3–9.

- [x] **Step 1: Write failing artifact and disposable database tests**

Require all `090` artifacts and prove these are initially absent:

```sql
SELECT to_regclass('saas.storefront_hosted_checkout_sessions') IS NOT NULL;
SELECT to_regprocedure('saas.storefront_available_stock(uuid,uuid,timestamp with time zone,uuid)') IS NOT NULL;
```

Add a scenario where physical stock is eight, another active session holds two, available stock is six, and exact owner exclusion returns eight.

- [x] **Step 2: Run RED**

```bash
node --experimental-transform-types --test apps/owner/scripts/sql/saas/storefront-hosted-checkout-migration.test.ts
node tests/saas-phase3/storefront-hosted-checkout/postgres-harness.mjs
```

Expected: FAIL because `090` artifacts and functions do not exist.

- [x] **Step 3: Add exact tables and ownership constraints**

The session stores one-of cart/intent ownership, immutable method/profile/provider execution facts, canonical money/items/delivery, generated order/customer/address/event/receipt IDs, credential digests, sealed presentation authority, finite state/version/timestamps. Generalize reservations exactly:

```sql
ALTER TABLE saas.checkout_inventory_reservations
  ALTER COLUMN quick_order_link_id DROP NOT NULL,
  ADD COLUMN storefront_hosted_session_id uuid,
  ADD CONSTRAINT checkout_inventory_reservations_commerce_owner_check CHECK (
    (quick_order_link_id IS NOT NULL AND storefront_hosted_session_id IS NULL)
    OR (quick_order_link_id IS NULL AND storefront_hosted_session_id IS NOT NULL)
  ),
  ADD CONSTRAINT checkout_inventory_reservations_standard_session_store_fk
    FOREIGN KEY(store_id,storefront_hosted_session_id)
    REFERENCES saas.storefront_hosted_checkout_sessions(store_id,id) ON DELETE RESTRICT;
```

Keep legacy `attempt_id` versus generic `payment_attempt_id` one-owner constraint and add a partial unique index on standard session plus variant.

- [x] **Step 4: Implement canonical available-stock use**

`storefront_available_stock` subtracts only unexpired `held` reservations across legacy quick order, hosted quick order, and standard sessions. Replace the current definitions of cart mutation, buy-now, cart/intent projection, quote readiness, and offline complete so every storefront path uses this helper. Only the exact current standard session may exclude its own hold.

- [x] **Step 5: Add hosted payment quote projection**

Return at most one method with exact public shape:

```json
{"kind":"hosted_card","id":"<uuid>","label":"Kredi veya banka kartı","instructions":"Güvenli sağlayıcı ekranında tamamlanır.","providerCode":"paytr_iframe","presentation":"iframe","requiredCustomerFields":[]}
```

Iyzico uses `presentation:"redirect"` and `requiredCustomerFields:["identity_number"]`. Require active method/profile, matching environment/credential/execution evidence, and the existing single-active-provider preflight. Keep active offline methods.

- [x] **Step 6: Finish assertions, rollback, SHA manifest, and GREEN proof**

The down migration blocks on nonterminal standard sessions, restores prior reservation constraints/functions, and drops only `090` authority. Run both focused tests until exact PASS and cleanup.

- [x] **Step 7: Commit**

```bash
git add apps/owner/scripts/sql/saas/202608060090_* apps/owner/scripts/sql/saas/phase4j-* apps/owner/scripts/sql/saas/storefront-hosted-checkout-migration.test.ts tests/saas-phase3/storefront-hosted-checkout/postgres-harness.mjs
git commit -m "feat(checkout): add hosted checkout foundation"
```

### Task 3: Start, Presentation, and Status Database RPCs

**Files:**
- Create: `apps/owner/scripts/sql/saas/202608060091_storefront_hosted_checkout_start.up.sql`
- Create matching down/assertions/manifest files.
- Modify: migration test and PostgreSQL harness from Task 2.

**Interfaces:**
- Produces: authority, begin, presentation-save/read, and status RPCs for the typed repository.

- [x] **Step 1: Add RED lifecycle scenarios**

Cover cross-store denial, expired credential, cart version drift, authority-digest mismatch, replay, one active session, stock hold, provider rejection release, sealed-presentation exactness, and status lookup by hostname plus payment-session digest.

- [x] **Step 2: Run RED**

Run the migration test and PostgreSQL harness; expected failure is missing `091` RPCs.

- [x] **Step 3: Implement authority and begin**

`public_storefront_hosted_checkout_authority` recomputes method/profile/execution facts, delivery/items/totals, and returns only server facts required by `HostedPaymentRuntime.initialize`. `public_storefront_hosted_checkout_begin` re-locks and recomputes authority, calls existing `payment_attempt_begin`, creates one session, and inserts held reservations atomically.

- [x] **Step 4: Implement presentation and status**

Presentation save accepts only a digest-bound sealed envelope and only `active|processing -> provider_ready`. Presentation/status lookups require exact hostname and payment-session credential digest and never return profile IDs, sealed merchant credentials, raw identity, or tenant authority.

- [x] **Step 5: Run GREEN and commit**

```bash
node --experimental-transform-types --test apps/owner/scripts/sql/saas/storefront-hosted-checkout-migration.test.ts
node tests/saas-phase3/storefront-hosted-checkout/postgres-harness.mjs
git add apps/owner/scripts/sql/saas/202608060091_* apps/owner/scripts/sql/saas/phase4k-* apps/owner/scripts/sql/saas/storefront-hosted-checkout-migration.test.ts tests/saas-phase3/storefront-hosted-checkout/postgres-harness.mjs
git commit -m "feat(checkout): add hosted checkout start authority"
```

### Task 4: Typed Hosted Checkout Repository

**Files:**
- Create: `packages/saas-data/src/storefront-hosted-checkout/types.ts`
- Create: `packages/saas-data/src/storefront-hosted-checkout/validation.ts`
- Create: `packages/saas-data/src/storefront-hosted-checkout/repository.ts`
- Create: `packages/saas-data/src/storefront-hosted-checkout/repository.test.ts`
- Create: `packages/saas-data/src/storefront-hosted-checkout/index.ts`
- Modify: `packages/saas-data/src/index.ts`

**Interfaces:**
- Produces:

```ts
export interface StorefrontHostedCheckoutRepository {
  authority(input: HostedCheckoutAuthorityInput): Promise<HostedCheckoutAuthority>;
  begin(input: HostedCheckoutBeginInput): Promise<BeginPaymentAttemptResult>;
  savePresentation(input: HostedCheckoutPresentationSaveInput): Promise<HostedCheckoutPresentationState>;
  presentation(input: HostedCheckoutPresentationInput): Promise<HostedCheckoutPresentationState>;
  status(input: HostedCheckoutStatusInput): Promise<HostedCheckoutPublicStatus>;
}
```

- [x] **Step 1: Write RED repository tests**

Assert exact SQL signatures/values, descriptor-safe deep-frozen output, private/secret field rejection, finite error mapping, replay, and one read-only status recovery after an ambiguous write.

- [x] **Step 2: Observe RED**

Run: `node --experimental-strip-types --test packages/saas-data/src/storefront-hosted-checkout/repository.test.ts`

Expected: module and repository are missing.

- [x] **Step 3: Implement validation and repository**

Follow the transaction and parser patterns in `quick-orders/hosted-payment-repository.ts` and `storefront-commerce/repository.ts`. Public methods use role `celebix_saas_host_resolver`; future worker methods use `celebix_saas_workflow`. Enforce bounded timeouts, exact input keys, safe integer cents, canonical UUID/hostname/timestamp, and finite outcomes.

- [x] **Step 4: Run GREEN and package regression**

```bash
node --experimental-strip-types --test packages/saas-data/src/storefront-hosted-checkout/repository.test.ts
npm test --workspace @celebix/saas-data
npm run typecheck --workspace @celebix/saas-data
```

- [x] **Step 5: Commit**

```bash
git add packages/saas-data/src/storefront-hosted-checkout packages/saas-data/src/index.ts
git commit -m "feat(checkout): add hosted checkout repository"
```

### Task 5: Exact Hosted Start Request and Cookie

**Files:**
- Modify: `apps/storefront-shared/lib/cart/types.ts`
- Modify: `apps/storefront-shared/lib/cart/request.ts`
- Modify: `apps/storefront-shared/lib/cart/request.test.ts`
- Create: `apps/storefront-shared/lib/checkout/standard-hosted-cookie.ts`
- Create: `apps/storefront-shared/lib/checkout/standard-hosted-cookie.test.ts`

**Interfaces:**
- Produces `HostedCheckoutStartRequest` and purpose-separated payment-session cookie helpers.

- [ ] **Step 1: Write RED parser and cookie tests**

Use the exact request:

```ts
type HostedCheckoutStartRequest = Readonly<{
  kind: "hosted_start";
  operationId: string;
  cartVersion: number;
  intentKind: "cart" | "buy_now";
  contact: CheckoutContact;
  shippingAddress: CheckoutShippingAddress;
  shippingMethod: "standard";
  paymentMethodId: string;
  identityNumber?: string;
  note?: string;
}>;
```

Accept only `/api/checkout/payment/start`; reject extras, bad origin/content type, oversized bodies, fake `12345678901`, repeated digits, controls, and non-11-digit identity. Cookie tests prove purpose separation, key rotation candidates, Secure/HttpOnly/SameSite=Lax/Path=/checkout/payment, expiry, and deletion.

- [ ] **Step 2: Observe RED**

```bash
NODE_OPTIONS='--conditions=react-server' node --experimental-transform-types --test apps/storefront-shared/lib/cart/request.test.ts apps/storefront-shared/lib/checkout/standard-hosted-cookie.test.ts
```

- [ ] **Step 3: Implement minimum parser and cookie helper**

Reuse existing credential cryptography with a new `hosted_checkout` purpose and independent cookie name. Never reuse cart, intent, customer, or receipt digests.

- [ ] **Step 4: Run GREEN and commit**

```bash
NODE_OPTIONS='--conditions=react-server' node --experimental-transform-types --test apps/storefront-shared/lib/cart/request.test.ts apps/storefront-shared/lib/checkout/standard-hosted-cookie.test.ts
git add apps/storefront-shared/lib/cart/types.ts apps/storefront-shared/lib/cart/request.ts apps/storefront-shared/lib/cart/request.test.ts apps/storefront-shared/lib/checkout/standard-hosted-cookie.ts apps/storefront-shared/lib/checkout/standard-hosted-cookie.test.ts
git commit -m "feat(checkout): validate hosted payment start"
```

### Task 6: Provider-Neutral Start and Presentation Runtime

**Files:**
- Create: `apps/storefront-shared/lib/checkout/standard-hosted-payment.ts`
- Create: `apps/storefront-shared/lib/checkout/standard-hosted-payment.test.ts`
- Modify: `apps/storefront-shared/lib/default-runtime.ts`
- Modify: `apps/storefront-shared/lib/cart/runtime.ts` and test.
- Modify: `apps/storefront-shared/lib/cart/route.ts` and test.
- Create: `apps/storefront-shared/app/api/checkout/payment/start/route.ts`
- Create: `apps/storefront-shared/app/checkout/payment/route.ts`

**Interfaces:**
- Produces `StandardHostedCheckoutRuntime.start`, `.presentation`, `.status`, and `createHostedCheckoutStartRoute`.

- [ ] **Step 1: Write RED runtime and route tests**

Cover trusted host, exact method, iyzico identity requirement, deterministic authority, scoped attempt begin, provider rejected/processing/iframe/redirect results, sealed presentation persistence, replay, same-origin destination, and absence of raw token/URL in JSON.

- [ ] **Step 2: Observe RED**

Run focused runtime, cart runtime, and route tests; failures must identify missing hosted behavior.

- [ ] **Step 3: Implement the scoped payment-attempt bridge**

```ts
const attempts: PaymentAttemptRepository = Object.freeze({
  begin: (payment) => repository.begin({
    hostname,
    sessionCredentialDigest,
    expectedAuthorityDigest: authority.authorityDigest,
    payment,
  }),
  markInitialized: base.markInitialized.bind(base),
  markUnknown: base.markUnknown.bind(base),
  getCallbackAuthority: base.getCallbackAuthority.bind(base),
  getReconciliationAuthority: base.getReconciliationAuthority.bind(base),
  settleCallback: base.settleCallback.bind(base),
  applyHostedCallback: base.applyHostedCallback.bind(base),
  claimReconciliation: base.claimReconciliation.bind(base),
  finalizeReconciliation: base.finalizeReconciliation.bind(base),
});
```

Generate receipt/customer/session credentials before begin, set only raw browser cookies, keep identity in request memory for initialize, exact-validate adapter presentation, seal under a dedicated purpose, and persist.

- [ ] **Step 4: Wire approved-staging runtime and quote filter**

Require migrations `090/091`, workflow membership, current compiled authority, and provider-specific activation flag. If unavailable, remove hosted card from quote and recompute a truthful payment blocker only when no offline method remains.

- [ ] **Step 5: Add start and token-free presentation routes**

Start returns only `{destination:"/checkout/payment"}` plus exact cookies. Presentation GET opens the cookie-bound sealed presentation; redirect uses exact provider origin/path/query allowlist and iframe emits provider-specific CSP without wildcard origins.

- [ ] **Step 6: Run GREEN, regression, and commit**

```bash
NODE_OPTIONS='--conditions=react-server' node --experimental-transform-types --test apps/storefront-shared/lib/checkout/standard-hosted-payment.test.ts apps/storefront-shared/lib/cart/runtime.test.ts apps/storefront-shared/lib/cart/route.test.ts
npm test --workspace @celebix/storefront-shared
npm run typecheck --workspace @celebix/storefront-shared
git add apps/storefront-shared/lib apps/storefront-shared/app/api/checkout/payment/start apps/storefront-shared/app/checkout/payment
git commit -m "feat(checkout): start hosted provider payments"
```

### Task 7: Verified Settlement, Expiry, and Reconciliation

**Files:**
- Create: `apps/owner/scripts/sql/saas/202608060092_storefront_hosted_checkout_settlement.up.sql`
- Create matching down/assertions/manifest files.
- Modify: migration test and PostgreSQL harness.
- Extend: `packages/saas-data/src/storefront-hosted-checkout/*` with worker methods/tests.
- Create: `apps/storefront-shared/scripts/reconcile-standard-checkouts.mjs`
- Create: `apps/storefront-shared/scripts/reconcile-standard-checkouts.test.mjs`
- Modify: `apps/storefront-shared/package.json`

**Interfaces:**
- Produces trigger `payment_attempt_standard_checkout_terminal`, terminal finalizer, leased expiry/reconciliation RPCs, and `reconcile:standard-checkouts`.

- [ ] **Step 1: Add RED settlement and concurrency scenarios**

Prove captured creates one `payment_status='completed'` order, consumes one hold, decrements stock once, converts source, activates receipt/customer authority, and emits one event. Prove callback replay, failure release, unknown no order, expiry lease, offline checkout cannot consume held stock, and late capture becomes `stock_conflict`.

- [ ] **Step 2: Observe RED**

Run migration test, database harness, and repository worker tests; expected failures are missing `092` functions and trigger.

- [ ] **Step 3: Implement trigger-driven terminal finalizer**

`AFTER UPDATE OF status ON payment_attempts` locates a standard session by store and attempt. Captured locks session/source/variants/holds, creates canonical customer/address/order/items/event/receipt, consumes holds and stock, and marks captured. Failed/cancelled releases holds and retains the source cart. Terminal repeats are immutable no-ops.

- [ ] **Step 4: Implement leased expiry and reconciliation**

Workflow claims with `FOR UPDATE SKIP LOCKED`, checks current attempt authority before releasing, and never treats timeout as failure. A verified late capture that cannot consume stock records `stock_conflict`; it does not fabricate fulfillment or automatic refund.

- [ ] **Step 5: Implement bounded worker**

Use workflow DB authority, batch 25, lease 60 seconds, finite safe logs, and non-zero preflight failure. Test repository interaction plus one disposable database lifecycle.

- [ ] **Step 6: Run GREEN and commit**

```bash
node --experimental-transform-types --test apps/owner/scripts/sql/saas/storefront-hosted-checkout-migration.test.ts
node tests/saas-phase3/storefront-hosted-checkout/postgres-harness.mjs
node --experimental-strip-types --test packages/saas-data/src/storefront-hosted-checkout/repository.test.ts
NODE_OPTIONS='--conditions=react-server' node --test apps/storefront-shared/scripts/reconcile-standard-checkouts.test.mjs
git add apps/owner/scripts/sql/saas/202608060092_* apps/owner/scripts/sql/saas/phase4l-* apps/owner/scripts/sql/saas/storefront-hosted-checkout-migration.test.ts tests/saas-phase3/storefront-hosted-checkout packages/saas-data/src/storefront-hosted-checkout apps/storefront-shared/scripts apps/storefront-shared/package.json
git commit -m "feat(checkout): settle hosted payments atomically"
```

### Task 8: Customer Return and Minimal Checkout UI

**Files:**
- Create: `apps/storefront-shared/app/checkout/payment/result/page.tsx`
- Modify: `apps/storefront-shared/components/commerce/CheckoutForm.tsx`
- Modify: `apps/storefront-shared/lib/cart/client.ts`
- Modify: `apps/storefront-shared/lib/cart/client.test.ts`
- Modify: `apps/storefront-shared/lib/storefront/checkout-readiness.ts`
- Modify: `apps/storefront-shared/lib/storefront/checkout-readiness.test.ts`
- Modify: `apps/storefront-shared/app/globals.css`
- Modify: `apps/storefront-shared/tests/storefront-app.test.ts`

**Interfaces:**
- `startHosted(input: HostedCheckoutStartRequest): Promise<{destination:"/checkout/payment"}>`
- The result page reads server-owned hosted-session status through the purpose-bound cookie; query parameters never decide success.

- [ ] **Step 1: Add RED client and source-boundary tests**

Prove the client exact-validates the single same-origin destination and rejects provider URLs, extra keys, missing keys, and non-JSON responses. Prove the checkout form does not contain provider secrets, provider action URLs, or query-string success authority.

- [ ] **Step 2: Observe RED**

```bash
NODE_OPTIONS='--conditions=react-server' node --experimental-transform-types --test apps/storefront-shared/lib/cart/client.test.ts apps/storefront-shared/lib/storefront/checkout-readiness.test.ts apps/storefront-shared/tests/storefront-app.test.ts
```

Expected failure: `startHosted`, the hosted-card readiness branch, and the result page do not exist.

- [ ] **Step 3: Add provider-neutral card selection**

Render one `hosted_card` option from the public quote. Show the provider label and only the exact customer fields declared by `requiredCustomerFields`; iyzico may request `identity_number`, while PayTR must not. Keep bank transfer and cash-on-delivery submission on `/api/checkout/complete` without changing their payload or completion behavior.

- [ ] **Step 4: Add same-origin handoff and authoritative result**

Call `/api/checkout/payment/start`, require exactly `{destination:"/checkout/payment"}`, then navigate on-origin. The result page obtains `captured`, `processing`, `failed`, `cancelled`, `expired`, or `stock_conflict` from the session repository. Captured shows the canonical receipt; processing offers a bounded refresh; terminal failures return to the retained cart. Provider query parameters are display-inert.

- [ ] **Step 5: Keep the surface quiet and responsive**

Use the existing store theme tokens, one concise status sentence, no duplicated title, and no provider-specific brand markup in the generic checkout component. Preserve keyboard focus, labels, disabled/loading state, and mobile stacking.

- [ ] **Step 6: Run GREEN, full storefront gates, and commit**

```bash
NODE_OPTIONS='--conditions=react-server' node --experimental-transform-types --test apps/storefront-shared/lib/cart/client.test.ts apps/storefront-shared/lib/storefront/checkout-readiness.test.ts apps/storefront-shared/tests/storefront-app.test.ts
npm test --workspace @celebix/storefront-shared
npm run typecheck --workspace @celebix/storefront-shared
npm run build --workspace @celebix/storefront-shared
git add apps/storefront-shared/app/checkout/payment/result apps/storefront-shared/components/commerce/CheckoutForm.tsx apps/storefront-shared/lib/cart/client.ts apps/storefront-shared/lib/cart/client.test.ts apps/storefront-shared/lib/storefront/checkout-readiness.ts apps/storefront-shared/lib/storefront/checkout-readiness.test.ts apps/storefront-shared/app/globals.css apps/storefront-shared/tests/storefront-app.test.ts
git commit -m "feat(checkout): present hosted card checkout"
```

### Task 9: Cumulative Gates and Truthful Capability Reporting

**Files:**
- Create: `tests/saas-phase3/storefront-hosted-payment-security.test.mjs`
- Modify: `tests/saas-phase3/run-current-suite.mjs`
- Modify only if an exact existing registry entry now becomes true: `packages/saas-contracts/src/functional-maturity.ts`
- Modify only with the matching exact assertion: `packages/saas-contracts/src/functional-maturity.test.ts`

**Interfaces:**
- The current-suite runner includes the hosted-checkout PostgreSQL harness and static security test.
- Capability reporting changes only when the named registry capability is fully satisfied; a similarly named inventory-admin gap must remain open.

- [ ] **Step 1: Add RED security assertions**

Assert the browser surface contains no payment credentials, provider callback secrets, raw identity numbers, presentation seals, unrestricted external redirect, or client-authoritative paid state. Assert the standard start and result surfaces use the purpose-bound cookie and server repository.

- [ ] **Step 2: Register the complete disposable-database lifecycle**

Add the `090` through `092` harness and security test to `run-current-suite.mjs` with exact expected test totals. Run the suite once and observe the expected registration or implementation failure before correcting production or runner code.

- [ ] **Step 3: Audit maturity without inflating it**

Search the registry for the exact standard-hosted-checkout capability. Remove a gap only if its acceptance wording is now met by the committed database, runtime, UI, and tests. Do not remove `stock_reservations` when it describes inventory-management UX rather than checkout holds.

- [ ] **Step 4: Run all cumulative gates**

```bash
npm test --workspace @celebix/saas-contracts
npm run typecheck --workspace @celebix/saas-contracts
npm test --workspace @celebix/saas-data
npm run typecheck --workspace @celebix/saas-data
npm test --workspace @celebix/storefront-shared
npm run typecheck --workspace @celebix/storefront-shared
npm test --workspace @celebix/customer-panel
node tests/saas-phase3/run-current-suite.mjs
```

- [ ] **Step 5: Commit gates separately**

```bash
git add tests/saas-phase3/storefront-hosted-payment-security.test.mjs tests/saas-phase3/run-current-suite.mjs packages/saas-contracts/src/functional-maturity.ts packages/saas-contracts/src/functional-maturity.test.ts
git commit -m "test(checkout): gate hosted payment lifecycle"
```

Omit unchanged maturity files from `git add`.

### Task 10: Final Verification and Branch Handoff

**Files:**
- Verify only; no new production file is expected.

- [ ] **Step 1: Inspect the exact diff and migration symmetry**

```bash
git status --short
git diff --check
git diff --stat 18a6c702..HEAD
git diff -- apps/donor
```

The donor diff must be empty, `.superpowers/` must remain untracked and untouched, and each migration must have up/down/assertions/manifest coverage.

- [ ] **Step 2: Run provider and build gates**

```bash
npm run check:iyzico-sandbox-build
npm run build --workspace @celebix/storefront-shared
npm run build --workspace @celebix/customer-panel
node tests/saas-phase3/run-current-suite.mjs
```

- [ ] **Step 3: Scan for secret and authority leaks**

```bash
rg -n --hidden --glob '!node_modules/**' --glob '!.git/**' '(merchant_key|merchant_salt|api[_-]?secret|private[_-]?key|identity_number)' apps/storefront-shared packages/saas-data
rg -n '(searchParams|query).*?(paid|captured|success)|destination.*https?://' apps/storefront-shared
```

Review every match; constants and server-only type names are acceptable, browser-delivered values and logs are not.

- [ ] **Step 4: Verify feature-gated readiness**

With no compiled migration/provider authority, quote must omit hosted card. With an active provider plus exact compiled authority in a disposable staging database, quote must expose exactly one hosted card. Official provider sandbox execution is performed only when valid sandbox credentials and documented test data are available; otherwise report that boundary without claiming live readiness.

- [ ] **Step 5: Apply completion skills and hand off**

Read and follow `superpowers:verification-before-completion`, then `superpowers:finishing-a-development-branch`. Present verified commands, remaining external sandbox boundary, commits, and branch state. Do not push or deploy unless the user separately authorizes those external mutations.
