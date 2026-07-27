# iyzico Checkout Form Adapter Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Every implementation task begins with a failing test, receives a specification review, then a code-quality/security review before it is accepted.

**Goal:** Add a fail-closed, tenant-scoped iyzico Checkout Form adapter to the Celebix payment platform, expose credential setup in the customer panel, and keep checkout activation disabled until exact sandbox evidence exists.

**Architecture:** Implement iyzico as a native `@celebix/payment-adapters` hosted adapter using IYZWSv2 request signing and signed initialize/retrieve responses. Generalize the PayTR-only control-plane composition to provider-keyed registries without weakening execution authority. Extend the shared storefront callback runtime only where provider-initiated result retrieval and customer redirect semantics require it, preserving PayTR's existing acknowledgment behavior.

**Corrected execution order after architecture audit:** Task 4 -> Task 7 foundation -> Task 5 -> Task 6 -> Task 8 -> Task 9. The current HTTP handler, `@celebix/saas-data` repository, migration 053 constraint/RPCs, and validation worker all reject a payment-processing profile without execution evidence. Therefore the additive provider-keyed lifecycle and null-authority verification contract must exist before the panel can truthfully save or validate iyzico credentials. Configuration/validation authority remains distinct from checkout execution authority throughout.

**Tech Stack:** TypeScript, Node.js `crypto`, Next.js route handlers, PostgreSQL 16 SQL migrations/harnesses, Node test runner, existing `@celebix/payment-adapters`, `@celebix/saas-contracts`, and `@celebix/saas-data` packages.

---

## Phase A — Provider protocol and adapter core

### Task 1: Extend the bounded packet and transport vocabulary for iyzico

**Files:**

- Modify: `packages/payment-adapters/src/contracts.ts`
- Modify: `packages/payment-adapters/src/contracts.test.ts`
- Modify: `packages/payment-adapters/src/validation.ts`
- Modify: `packages/payment-adapters/src/transport.ts`
- Modify: `packages/payment-adapters/src/transport.test.ts`
- Create: `packages/payment-adapters/src/providers/iyzico/packet.ts`
- Create: `packages/payment-adapters/src/providers/iyzico/packet.test.ts`
- Modify: `packages/payment-adapters/package.json`

**Step 1: Write the failing contract tests**

Add tests proving:

- PayTR's path-token `provider_token_url` contract remains unchanged;
- a separate closed `provider_query_token_url` rule represents iyzico's exact origin, `/` path, single `token` query and fixed `lang=tr` query without admitting arbitrary URL templates;
- iyzico packet endpoints are exactly the official sandbox/live initialize, retrieve, and BIN-check URLs;
- iyzico API key and secret field schemas are exact and contain no card-data fields;
- transport accepts only canonical lower-case `authorization` and `x-iyzi-rnd` in addition to `content-type`;
- unknown, duplicate-case, control-character, accessor-backed, proxy, or oversized headers fail before `fetch`;
- request body and signature headers survive byte-for-byte to the injected fetch function.

Run:

```bash
npm test --workspace @celebix/payment-adapters
```

Expected: FAIL because the contract has no suffix, iyzico packet is absent, and custom allowlisted headers are rejected.

**Step 2: Implement the minimal contract changes**

- Add a discriminated `provider_query_token_url` rule containing only exact origin/path, token field constraints and fixed query fields; keep `provider_token_url` unchanged.
- Add exact iyzico endpoint/presentation constants to `validation.ts`.
- Add a closed request-header type containing only `content-type`, optional `authorization`, and optional `x-iyzi-rnd`.
- Parse headers into a fresh null-prototype record; reject any other key and any non-canonical value.
- Keep the PayTR packet byte-for-byte compatible and add regression tests for its existing generated URL.
- Add `IYZICO_IFRAME_PACKET` with readiness `verification` for test/live and official documentation metadata dated `2026-07-27`.
- Include `src/providers/iyzico/*.test.ts` in the package test script.

**Step 3: Run focused and package tests**

```bash
node --experimental-strip-types --test packages/payment-adapters/src/contracts.test.ts packages/payment-adapters/src/transport.test.ts packages/payment-adapters/src/providers/iyzico/packet.test.ts
npm test --workspace @celebix/payment-adapters
npm run typecheck --workspace @celebix/payment-adapters
```

Expected: PASS.

**Step 4: Commit**

```bash
git add packages/payment-adapters/src/contracts.ts packages/payment-adapters/src/contracts.test.ts packages/payment-adapters/src/validation.ts packages/payment-adapters/src/transport.ts packages/payment-adapters/src/transport.test.ts packages/payment-adapters/src/providers/paytr/packet.ts packages/payment-adapters/src/providers/iyzico/packet.ts packages/payment-adapters/src/providers/iyzico/packet.test.ts packages/payment-adapters/package.json
git commit -m "feat(payments): add iyzico packet transport contract"
```

### Task 2: Implement IYZWSv2 and response-signature primitives

**Files:**

- Create: `packages/payment-adapters/src/providers/iyzico/config.ts`
- Create: `packages/payment-adapters/src/providers/iyzico/config.test.ts`
- Modify: `packages/payment-adapters/src/index.ts`

**Step 1: Write failing golden-vector tests**

Cover:

- exact credential object parsing for `apiKey` and `secretKey`;
- whitespace/control/accessor/proxy/extra-key rejection;
- deterministic IYZWSv2 authorization output for a fixed random key, URI and JSON body;
- official initialize response-signature parameter order;
- official retrieve response-signature parameter order;
- iyzico trailing-zero amount normalization;
- constant-time signature mismatch rejection;
- credential wiping after use.

Use vectors reproduced from official iyzico documentation and the installed official SDK sample, storing only non-secret test fixtures.

Run:

```bash
node --experimental-strip-types --test packages/payment-adapters/src/providers/iyzico/config.test.ts
```

Expected: FAIL because the module does not exist.

**Step 2: Implement minimal provider crypto/config helpers**

Use only `node:crypto` `createHmac` and `timingSafeEqual`. Serialize the body once and sign the exact UTF-8 bytes that are transported. Return bounded, immutable values. Never expose the secret or authorization input through error messages.

**Step 3: Verify**

```bash
node --experimental-strip-types --test packages/payment-adapters/src/providers/iyzico/config.test.ts
npm test --workspace @celebix/payment-adapters
npm run typecheck --workspace @celebix/payment-adapters
```

Expected: PASS.

**Step 4: Commit**

```bash
git add packages/payment-adapters/src/providers/iyzico/config.ts packages/payment-adapters/src/providers/iyzico/config.test.ts packages/payment-adapters/src/index.ts
git commit -m "feat(payments): implement iyzico signing primitives"
```

### Task 3: Implement initialize, retrieve, query, and credential validation

**Files:**

- Create: `packages/payment-adapters/src/providers/iyzico/adapter.ts`
- Create: `packages/payment-adapters/src/providers/iyzico/adapter.test.ts`
- Modify: `packages/payment-adapters/src/contracts.ts`
- Modify: `packages/payment-adapters/src/index.ts`
- Modify: `packages/payment-adapters/src/registry.test.ts`

**Step 1: Write failing adapter tests**

Create injected-transport tests for:

- initialize JSON field names, exact endpoint, headers, environment isolation, `conversationId=attemptId`, `basketId=orderReference`, amount conversion, and item total preservation;
- mandatory real buyer `identityNumber`, city, country, address and correct item type; optional postal code is omitted when absent and never fabricated;
- rejection before transport when buyer/order/basket data is incomplete, inconsistent, overlong, non-canonical, or contains fake defaults;
- signed success response producing only a validated iyzico payment URL and token reference;
- bad signature, bad URL origin/query, missing token, provider error, timeout, 5xx, malformed JSON, and ambiguous result;
- callback token form parsing followed by a server-to-server retrieve request;
- retrieve signature, token, conversation, basket, amount, paid amount, currency and provider payment-id matching;
- `fraudStatus=1` success, `0` pending/review, `-1` failure;
- query using the saved provider token and the same validation rules;
- BIN-check credential validation with the current official eight-digit test BIN, exact correlation echo and no charge or stale price field;
- credential and intermediate byte wiping on every success/failure path.

Add a callback `AbortSignal` to the generic callback input and a verified callback pending/temporary outcome only if the tests prove the existing two-state callback result cannot safely represent iyzico review/timeout. Preserve strict exact-object parsing.

Run:

```bash
node --experimental-strip-types --test packages/payment-adapters/src/providers/iyzico/adapter.test.ts
```

Expected: FAIL because the adapter does not exist.

**Step 2: Implement the native iyzico adapter**

- Build exact JSON objects; do not use the legacy subprocess runner.
- Generate random keys through an injected dependency so tests are deterministic.
- Accept the provider URL only when its scheme, hostname, port, path, exact query order/multiplicity, language query, and token all match the closed query-token packet rule.
- Treat browser callback token as untrusted until retrieve succeeds.
- Map provider errors to bounded safe codes; do not return raw provider messages.
- Keep `iyzico_iframe` separate from direct `iyzico` and `pay_with_iyzico`.

**Step 3: Verify all adapter and registry tests**

```bash
node --experimental-strip-types --test packages/payment-adapters/src/providers/iyzico/*.test.ts
npm test --workspace @celebix/payment-adapters
npm run typecheck --workspace @celebix/payment-adapters
```

Expected: PASS.

**Step 4: Commit**

```bash
git add packages/payment-adapters/src/providers/iyzico/adapter.ts packages/payment-adapters/src/providers/iyzico/adapter.test.ts packages/payment-adapters/src/contracts.ts packages/payment-adapters/src/index.ts packages/payment-adapters/src/registry.test.ts
git commit -m "feat(payments): implement iyzico checkout form adapter"
```

## Phase B — Shared runtime and control plane

### Task 4: Add provider-safe browser return and callback timeout semantics

**Files:**

- Modify: `apps/storefront-shared/lib/payment-adapters/runtime.ts`
- Modify: `apps/storefront-shared/lib/payment-adapters/runtime.test.ts`
- Modify: `apps/storefront-shared/app/api/payments/[providerCode]/callback/[binding]/route.ts`
- Modify: `tests/saas-phase3/payment-adapter-runtime/in-process.test.mjs`
- Modify: `tests/saas-phase3/payment-adapter-runtime/static-security.test.mjs`

**Step 1: Add failing runtime tests**

Prove:

- adapter callback receives a provider deadline `AbortSignal`;
- iyzico success/failure callback returns a `303` to exact local success/failure paths;
- PayTR continues returning its exact `200 OK`, `503 RETRY`, and invalid behavior;
- provider timeout/temporary failure produces retry/reconcile state without settlement;
- fraud review stays pending and never captures an order;
- redirect target cannot be influenced by request host, forwarded headers, provider body, or query parameters;
- callback replay remains idempotent.

**Step 2: Implement the smallest discriminated callback acknowledgment contract**

Keep provider settlement facts separate from HTTP presentation. The adapter declares its fixed callback acknowledgment mode in the immutable packet or returns a closed acknowledgment enum; the shared route selects only built-in local paths. Do not allow provider-supplied URLs.

**Step 3: Verify**

```bash
node --conditions=react-server --experimental-strip-types --test apps/storefront-shared/lib/payment-adapters/runtime.test.ts
node --experimental-transform-types --test tests/saas-phase3/payment-adapter-runtime/in-process.test.mjs
node --test tests/saas-phase3/payment-adapter-runtime/static-security.test.mjs
```

Expected: PASS.

**Step 4: Commit**

```bash
git add apps/storefront-shared/lib/payment-adapters/runtime.ts apps/storefront-shared/lib/payment-adapters/runtime.test.ts 'apps/storefront-shared/app/api/payments/[providerCode]/callback/[binding]/route.ts' tests/saas-phase3/payment-adapter-runtime/in-process.test.mjs tests/saas-phase3/payment-adapter-runtime/static-security.test.mjs
git commit -m "feat(payments): support hosted customer return callbacks"
```

**Repair note:** migration `055_hosted_callback_lifecycle` is reserved for the
additive callback-specific RPC that atomically settles an initialized hosted
attempt from `awaiting_customer`, records pending/timeout outcomes as callback
events, and preserves migrations 052/053/054 byte-for-byte. Later migration
numbers in this plan are shifted accordingly.

### Task 5: Make customer-panel provider composition multi-provider

**Files:**

- Modify: `apps/customer-panel/lib/payment-provider-adapters/default.ts`
- Modify: `apps/customer-panel/lib/payment-provider-adapters/default.test.ts`
- Modify: `apps/customer-panel/lib/payment-providers/catalog.ts`
- Modify: `apps/customer-panel/lib/payment-providers/catalog-data.ts`
- Modify: `apps/customer-panel/lib/payment-providers/catalog.test.ts`
- Modify: `apps/customer-panel/lib/payment-settings-ui/model.ts`
- Modify: `apps/customer-panel/lib/payment-settings-ui/model.test.ts`
- Modify: `apps/customer-panel/components/settings/payment/PaymentSettingsConsole.tsx`
- Modify: the focused `PaymentSettingsConsole` test used by the customer-panel workspace
- Modify: `apps/customer-panel/lib/provider-execution-http/handler.ts`
- Modify: `apps/customer-panel/lib/provider-execution-http/handler.test.ts`
- Modify: `apps/customer-panel/lib/payment-method-http/handler.test.ts`
- Modify: `apps/customer-panel/lib/server-panel-access/postgres-runtime.ts`
- Modify: `packages/payment-adapters/src/packets/plugin-inventory.ts`
- Modify: `packages/payment-adapters/src/packets/plugin-inventory.test.ts`
- Modify: `tests/saas-phase3/provider-execution-foundation/browser-contract.test.mjs`
- Modify: `tests/saas-phase3/payment-provider-admin/static-security.test.mjs`

**Step 1: Write failing composition/UI tests**

Prove:

- default hosted registry contains exactly PayTR and `iyzico_iframe`;
- each descriptor uses its own packet, public/secret fields, version, environments, and optional authority;
- `verification` allows the merchant to enter and submit credentials for validation but cannot create/enable a checkout payment method;
- the payment console loads the definition/profile for a `verification` provider and offers an explicit test/live environment selection without conflating credential setup with method activation;
- test and live profiles coexist, and rotation cannot change a profile's environment;
- missing/mismatched authority remains fail-closed per provider and cannot disable another provider;
- iyzico card uses the existing local `/payment-providers/iyzico.svg` asset and correct brand/mode label;
- no secret is returned by GET or embedded in page props.

**Step 2: Implement provider-keyed descriptors and policy**

- Replace size-one/PayTR-only assertions with an exact two-provider composition.
- Parse iyzico public config `{ environment: "test" | "live" }` and secret config `{ apiKey, secretKey }` through the adapter.
- Accept profile-save/validate for a known verification provider while keeping execution authority null.
- Use the provider-keyed lifecycle/repository contract from Task 7; do not weaken the legacy migration 053 checks in application code alone.
- Require exact authority and readiness only for payment-method activation.
- Keep activation environment restrictions provider-scoped.
- Keep a separate UI fact for `configurable` versus `executable`; a verification card may open the credential form while its payment-method action remains unavailable.
- Do not derive or expose an iyzico API-key suffix from secret credential bytes; use a bounded non-secret account label until a validated provider response supplies a safe reference.

**Step 3: Verify**

```bash
npm test --workspace customer-panel -- --runInBand
node --test tests/saas-phase3/provider-execution-foundation/browser-contract.test.mjs tests/saas-phase3/payment-provider-admin/static-security.test.mjs
```

If the workspace test script does not support `--runInBand`, run its declared test command without that flag.

Expected: PASS.

**Step 4: Commit**

```bash
git add apps/customer-panel/lib/payment-provider-adapters/default.ts apps/customer-panel/lib/payment-provider-adapters/default.test.ts apps/customer-panel/lib/payment-providers/catalog.ts apps/customer-panel/lib/payment-providers/catalog.test.ts apps/customer-panel/lib/payment-settings-ui/model.ts apps/customer-panel/lib/payment-settings-ui/model.test.ts apps/customer-panel/lib/provider-execution-http/handler.ts apps/customer-panel/lib/provider-execution-http/handler.test.ts apps/customer-panel/lib/server-panel-access/postgres-runtime.ts tests/saas-phase3/provider-execution-foundation/browser-contract.test.mjs tests/saas-phase3/payment-provider-admin/static-security.test.mjs
git commit -m "feat(payments): expose iyzico credential setup"
```

### Task 6: Add iyzico credential validation to the owner worker

**Files:**

- Create: `apps/owner/lib/merchant-provider-execution/iyzico-validation-adapter.ts`
- Create: `apps/owner/lib/merchant-provider-execution/iyzico-validation-adapter.test.ts`
- Modify: `apps/owner/lib/merchant-provider-execution/registry.ts`
- Modify: `apps/owner/lib/merchant-provider-execution/production-config.ts`
- Modify: `apps/owner/lib/merchant-provider-execution/production-config.test.ts`
- Modify: `apps/owner/lib/merchant-provider-execution/production.ts`
- Modify: `apps/owner/lib/merchant-provider-execution/production.test.ts`
- Modify: `tests/saas-phase3/provider-execution-foundation/worker-static-security.test.mjs`

**Step 1: Write failing owner-worker tests**

Cover exact parsing of the encrypted credential bytes, environment matching, BIN-check invocation, safe error mapping, timeout, secret wiping, provider-keyed compiled authority maps, and a production registry containing only entries whose exact authority exists.

**Step 2: Implement validation-only adapter and provider-keyed config**

- Add `createIyzicoValidationAdapter` using the core adapter's BIN-check function.
- Replace the single PayTR execution authority with an immutable map keyed by provider code.
- Keep both compiled authorities `null` until real evidence exists.
- Generalize preflight to validate the selected provider authority function without dynamic SQL or user-provided identifiers.

**Step 3: Verify**

```bash
node --conditions=react-server --experimental-strip-types --test apps/owner/lib/merchant-provider-execution/*.test.ts
node --test tests/saas-phase3/provider-execution-foundation/worker-static-security.test.mjs
```

Expected: PASS.

**Step 4: Commit**

```bash
git add apps/owner/lib/merchant-provider-execution/iyzico-validation-adapter.ts apps/owner/lib/merchant-provider-execution/iyzico-validation-adapter.test.ts apps/owner/lib/merchant-provider-execution/registry.ts apps/owner/lib/merchant-provider-execution/production-config.ts apps/owner/lib/merchant-provider-execution/production-config.test.ts apps/owner/lib/merchant-provider-execution/production.ts apps/owner/lib/merchant-provider-execution/production.test.ts tests/saas-phase3/provider-execution-foundation/worker-static-security.test.mjs
git commit -m "feat(payments): validate iyzico merchant credentials"
```

## Phase C — Durable lifecycle, storefront wiring, and evidence

### Task 7: Add provider-keyed payment-method lifecycle migration

**Files:**

- Create: `apps/owner/scripts/sql/saas/202607270056_payment_provider_keyed_lifecycle.up.sql`
- Create: `apps/owner/scripts/sql/saas/202607270056_payment_provider_keyed_lifecycle.down.sql`
- Create: `apps/owner/scripts/sql/saas/202607270056_payment_provider_keyed_lifecycle_assertions.sql`
- Create: `apps/owner/scripts/sql/saas/phase3o-payment-provider-keyed-lifecycle-manifest.json`
- Create: `tests/saas-phase3/payment-provider-keyed-lifecycle/fixture.sql`
- Create: `tests/saas-phase3/payment-provider-keyed-lifecycle/postgres-harness.mjs`
- Create: `tests/saas-phase3/payment-provider-keyed-lifecycle/static-security.test.mjs`
- Modify: `packages/saas-data/src/provider-execution/types.ts`
- Modify: `packages/saas-data/src/provider-execution/repository.ts`
- Modify: `packages/saas-data/src/provider-execution/repository.test.ts`
- Modify: `packages/saas-data/src/provider-execution/workflow-repository.ts`
- Modify: `packages/saas-data/src/provider-execution/workflow-repository.test.ts`
- Modify: `tests/saas-phase3/run-current-suite.mjs`

**Step 1: Write failing static and PostgreSQL harness tests**

Prove:

- migration 052/053/054 checksums remain unchanged;
- `iyzico_iframe` is a payment-processing provider definition but has no seeded credential, method, execution authority, quick link, attempt, or evidence;
- profile save/validation can occur in verification state;
- payment-processing execution fields are either all null for verification or all exact/non-null for approved execution; mixed tuples fail;
- test and live profiles for the same provider can coexist while duplicate active profiles in the same environment fail;
- method create/enable fails without exact provider authority and evidence;
- PayTR lifecycle still works under the provider-keyed function;
- cross-tenant/provider/profile/credential-version mismatches fail;
- replay, stale version, role grants, RLS and down migration are exact.

**Step 2: Implement additive SQL only**

Introduce provider-keyed lifecycle/preflight functions and iyzico catalog/definition metadata. Add a backward-compatible repository contract that can persist/claim validation-only profiles with null execution authority while continuing to require exact evidence for execution and method activation. Replace the old one-live-profile invariant additively with a provider+capability+environment invariant. Preserve old RPC signatures/privileges during rolling deployment. Do not alter applied migrations or grant browser roles direct table access. Do not seed an authority row.

**Step 3: Verify against fresh PostgreSQL 16**

```bash
node --test tests/saas-phase3/payment-provider-keyed-lifecycle/static-security.test.mjs
node tests/saas-phase3/payment-provider-keyed-lifecycle/postgres-harness.mjs
```

Expected: PASS, including up/down/up replay.

**Step 4: Commit**

```bash
git add apps/owner/scripts/sql/saas/202607270056_payment_provider_keyed_lifecycle.up.sql apps/owner/scripts/sql/saas/202607270056_payment_provider_keyed_lifecycle.down.sql apps/owner/scripts/sql/saas/202607270056_payment_provider_keyed_lifecycle_assertions.sql apps/owner/scripts/sql/saas/phase3o-payment-provider-keyed-lifecycle-manifest.json packages/saas-data/src/provider-execution tests/saas-phase3/payment-provider-keyed-lifecycle tests/saas-phase3/run-current-suite.mjs
git commit -m "feat(payments): add provider keyed activation lifecycle"
```

### Task 8: Wire iyzico into the shared storefront runtime without activating it

**Files:**

- Modify: `apps/storefront-shared/lib/payment-adapters/default.ts`
- Modify: `apps/storefront-shared/lib/payment-adapters/default.test.ts`
- Modify: `apps/storefront-shared/lib/payment-adapters/runtime.ts`
- Modify: `apps/storefront-shared/lib/payment-adapters/runtime.test.ts`
- Modify: `apps/storefront-shared/lib/storefront-app.test.ts`
- Modify: `tests/saas-phase3/payment-adapter-runtime/in-process.test.mjs`

**Step 1: Write failing storefront composition tests**

Prove:

- compiled registry includes both immutable packets/adapters;
- iyzico execution refuses when authority is absent;
- a synthetic exact-authority fixture can initialize and retrieve using real buyer fields;
- customer PII is passed only in-memory to the selected adapter and not persisted in safe metadata;
- PayTR behavior and route inventory remain unchanged.

**Step 2: Implement exact two-provider composition**

Generalize provider maps, compiled authority lookup, endpoint allowlists and credential decoding. Add the mandatory iyzico buyer fields to the checkout authority/input contract at the narrowest boundary. Reject older orders lacking them instead of inventing defaults.

**Step 3: Verify**

```bash
node --conditions=react-server --experimental-strip-types --test apps/storefront-shared/lib/payment-adapters/*.test.ts apps/storefront-shared/lib/storefront-app.test.ts
node --experimental-transform-types --test tests/saas-phase3/payment-adapter-runtime/in-process.test.mjs
```

Expected: PASS.

**Step 4: Commit**

```bash
git add apps/storefront-shared/lib/payment-adapters/default.ts apps/storefront-shared/lib/payment-adapters/default.test.ts apps/storefront-shared/lib/payment-adapters/runtime.ts apps/storefront-shared/lib/payment-adapters/runtime.test.ts apps/storefront-shared/lib/storefront-app.test.ts tests/saas-phase3/payment-adapter-runtime/in-process.test.mjs
git commit -m "feat(payments): wire iyzico hosted runtime"
```

### Task 9: Add sandbox-evidence workflow and operator runbook

**Files:**

- Create: `apps/owner/scripts/sql/saas/202607270057_iyzico_iframe_sandbox_evidence_history.up.sql`
- Create: `apps/owner/scripts/sql/saas/202607270057_iyzico_iframe_sandbox_evidence_history.down.sql`
- Create: `apps/owner/scripts/sql/saas/202607270057_iyzico_iframe_sandbox_evidence_history_assertions.sql`
- Create: `tests/saas-phase3/iyzico-sandbox-evidence-history/fixture.sql`
- Create: `tests/saas-phase3/iyzico-sandbox-evidence-history/postgres-harness.mjs`
- Create: `tests/saas-phase3/iyzico-sandbox-evidence-history/static-security.test.mjs`
- Create: `docs/ops/iyzico-checkout-form-sandbox-activation.md`
- Modify: `tests/saas-phase3/run-current-suite.mjs`

**Step 1: Write failing evidence tests**

Require immutable references to credential validation, signed initialize, success retrieve, decline retrieve, fraud-review result, callback replay, timeout/reconcile, and current status query. Reject evidence containing secrets, raw payloads, non-sandbox operations, mixed tenant/store/profile/credential versions, or incomplete operation sets.

**Step 2: Implement additive evidence history and runbook**

The function derives evidence from durable operations; it never accepts a caller-provided success boolean. The runbook uses official test cards only after a tenant supplies sandbox credentials, instructs operators not to paste card/secret data into logs, and records the exact evidence digest required for a later authority approval commit.

**Step 3: Verify**

```bash
node --test tests/saas-phase3/iyzico-sandbox-evidence-history/static-security.test.mjs
node tests/saas-phase3/iyzico-sandbox-evidence-history/postgres-harness.mjs
```

Expected: PASS. If no real sandbox credential exists, the evidence table stays empty and readiness remains `verification`.

**Step 4: Commit**

```bash
git add apps/owner/scripts/sql/saas/202607270057_iyzico_iframe_sandbox_evidence_history.up.sql apps/owner/scripts/sql/saas/202607270057_iyzico_iframe_sandbox_evidence_history.down.sql apps/owner/scripts/sql/saas/202607270057_iyzico_iframe_sandbox_evidence_history_assertions.sql tests/saas-phase3/iyzico-sandbox-evidence-history docs/ops/iyzico-checkout-form-sandbox-activation.md tests/saas-phase3/run-current-suite.mjs
git commit -m "feat(payments): add iyzico sandbox evidence gate"
```

## Phase D — Verification, review, and deployment

### Task 10: Run full regression and independent reviews

**Files:**

- Verify only unless a review identifies a concrete defect.

**Step 1: Run focused suites**

```bash
npm test --workspace @celebix/payment-adapters
npm run typecheck --workspace @celebix/payment-adapters
node --conditions=react-server --experimental-strip-types --test apps/customer-panel/lib/payment-provider-adapters/default.test.ts apps/owner/lib/merchant-provider-execution/*.test.ts apps/storefront-shared/lib/payment-adapters/*.test.ts
node --experimental-transform-types --test tests/saas-phase3/payment-adapter-runtime/in-process.test.mjs
```

**Step 2: Run cumulative phase suite and builds**

```bash
node tests/saas-phase3/run-current-suite.mjs
npm run build --workspace customer-panel
npm run build --workspace storefront-shared
npm run build --workspace owner
```

Use the actual workspace names/scripts printed by each `package.json` if a displayed alias differs; do not skip the build.

**Step 3: Verify repository hygiene and protected donors**

```bash
git diff --check
git status --short
git diff 69b126f26112c8d4b9be7ffb979f90d5a8b2a2ff -- apps/admin apps/storefront-base
git log --oneline --decorate -12
```

Expected: no whitespace errors; only `.codex-evidence/` remains untracked; zero diff in `apps/admin/**` and `apps/storefront-base/**`.

**Step 4: Obtain independent specification and security/code-quality reviews**

Give reviewers the design, this plan, commit list, test output, and explicit constraints. Fix every High/Critical and applicable Medium issue through new failing tests and a separate repair commit. Re-run the full verification after fixes.

### Task 11: Push and deploy through Coolify

**Files:**

- No source edits expected.

**Step 1: Push the exact branch**

```bash
git push origin codex/celebix-managed-umami-analytics
```

Confirm local `HEAD` equals the remote branch SHA.

**Step 2: Trigger the scoped Coolify deployment**

Use the existing authenticated Coolify session/API for project `fy34knkv8p3d73ksirgcsgg6`, environment `yv44k7b9mhn6edakw9nw6b32`. Never print API credentials. Confirm the deployed resource and branch before triggering.

**Step 3: Monitor to terminal health**

Wait for deployment completion, then confirm:

- deployed commit SHA equals pushed `HEAD`;
- application/container health is green;
- migration runner applied 055/056/057 once and assertions pass;
- customer-panel Iyzico card renders with its local logo;
- credential save/validation endpoint is available;
- iyzico checkout execution remains fail-closed without authority/evidence;
- PayTR and unrelated admin pages still load.

**Step 4: Report the truthful activation state**

If real tenant sandbox credentials and evidence were available and all live checks passed, report `sandbox_ready` with the evidence digest. Otherwise report adapter/panel/runtime deployed in `verification`, state exactly which real sandbox operations remain, and do not call the provider active.

## Completion criteria

- Iyzico Checkout Form native adapter, signed request/response handling, server-side retrieve, panel credential setup, owner validation path, provider-keyed durable lifecycle, shared storefront composition and evidence gate are committed and deployed.
- No code relies on the legacy iyzico subprocess or hard-coded buyer identity.
- PayTR tests and behavior remain green.
- No Iyzico execution authority exists without real, immutable sandbox evidence.
- The next provider is chosen only after the deployed Iyzico state and remaining credential/evidence boundary are documented.
