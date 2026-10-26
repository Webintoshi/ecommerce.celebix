# Platform iyzico billing implementation plan

> **For agentic workers:** Use subagent-driven development for independent units and one root publisher. Preserve user changes and existing payment execution identities.

**Goal:** Sell Celebix's own new packages and one-time tools through its approved iyzico merchant on celebix.net.

**Architecture:** Add a separate platform purchase/payment ledger and constrained native fulfillment. Shared panels authorize purchase intent; the public site owns checkout presentation; an authenticated internal owner endpoint owns bank calls and settlement.

**Tech Stack:** Existing Next.js applications, TypeScript, Node crypto/fetch, PostgreSQL 16.

**Spec:** `docs/superpowers/specs/2026-10-26-platform-iyzico-billing-design.md`.

## Global constraints

- Existing paid packages and tool rights remain unchanged and are not charged.
- Prices come from immutable native catalogs; use integer kuruş and explicit VAT.
- No existing tenant payment adapter, credential, execution authority or callback is modified.
- No card storage, automatic recurring charge or real-money test by the agent.
- Never retry an ambiguous provider initialize automatically.
- Only the root may change live configuration, source pins or deployment queues.

## Review focus

1. Another store/actor or a forged price cannot select or fulfill a purchase.
2. Concurrent callbacks and uncertain responses cannot duplicate a charge or entitlement.
3. Existing paid/manual/grandfathered rights are preserved.
4. Late bank approval after an entitlement change remains reconcilable rather than silently losing a payment.
5. Multi-tab checkout credentials and results remain scoped to the actual order.

## Tasks

### 1. Platform-only iyzico protocol

- [x] Add failing tests in `apps/owner/lib/platform-commerce/iyzico.test.ts` for official HMAC signatures, VIRTUAL basket, strict provider URL, exact context/money matching, pending fraud and uncertain responses.
- [x] Implement `createPlatformIyzicoGateway` in adjacent `iyzico.ts` without modifying tenant adapters; run focused tests.

### 2. Native purchase ledger and fulfillment

- [x] Add additive native migration `202610260281_platform_commerce` with assertions/down guard and a disposable PostgreSQL harness.
- [x] Implement authenticated `platform_checkout_create` with the existing seven-field merchant authority, explicit operation/intent/handoff digest, immutable quote, paid-package exclusion and tool ownership checks.
- [x] Implement restricted machine commands for redeem/read/begin/initialized/lookup/finish, one active attempt, no automatic uncertain retry, unique provider receipts, and atomic package/tool fulfillment.
- [x] Prove cross-store denial, forged quote/term denial, duplicate callback replay, existing rights preservation, paid term, exact VAT and money, tool projection compatibility and rollback guards.

### 3. Authenticated owner gateway and panel purchase intent

- [x] Add bounded HTTP body/parser, authenticated internal HMAC bridge, encryption envelope and runtime/repository wiring under `apps/owner/lib/platform-commerce` and an internal API route.
- [x] Add an authorized panel purchase endpoint and reuse existing package/tool screens to body-post the handoff to the exact approved main-site origin. Keep manual operations usable until gateway readiness is verified.
- [x] Test expired/replayed handoff, origin denial, non-owner package purchase, untrusted headers, unchanged role boundaries and ambiguous persistence.

### 4. Main-site checkout presentation

- [x] In the isolated Celebix marketing-site checkout, add the handoff POST, order-scoped cookie, checkout/billing form, iyzico callback and result routes.
- [x] Add a narrow server-only bridge client, no provider secret or arbitrary destination forwarding. Keep locale middleware and unrelated marketing pages intact.
- [x] Show store, offer, billing term, net/VAT/total, and clear pending/failed/approved result. Test redirect/cookie/body handling and build the actual main app.

### 5. Verification and release

- [x] Independently review source and financial invariants; run focused native/service/UI tests and affected builds.
- [ ] Bind current source and signup proofs, inspect real credential readiness and main-site deployment configuration; keep exact candidate identities for all affected applications.
- [ ] Publish compatibility before buyer actions, verify runtime and safe checkout views, and hand the actual card payment to the user.
