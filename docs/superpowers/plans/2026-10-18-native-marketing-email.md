# Native marketing email and cart reminders

> For agentic workers: execute the independent data, delivery and panel tasks with focused tests and independent integration review. The user approved the shared noreply design and explicitly requested implementation and live rollout on 2026-10-18.

**Goal:** Stores prepare branded campaigns and enable automatic cart reminders inside Celebix, using one central verified noreply sender without merchant DNS/API-key setup.

**Architecture:** Reuse the existing tenant authority, consent ledger, durable cart episodes and safe outbox patterns. Add a separate marketing purpose, encrypted delivery queue and Resend worker; preserve order emails, legacy integrations and storefront redemption. Brand, audience, consent, opt-out, quota and every operation remain tenant scoped.

**Stack:** Next.js shared customer panel and owner, TypeScript, native Postgres kernel, Resend HTTP API and Svix.

**Approved design:** Conversation decisions: common noreply; store display name/logo/colors/site; templates cart/new_products/offer/welcome; one-time cart automation toggle; event-based bounded delivery; no automatic campaigns without an explicit merchant send/schedule; all shared stores and future stores with the existing email_marketing capability.

## Constraints

- No customer list from the browser; resolve eligible recipients from existing store/email consent evidence. Ordinary order acceptance or WhatsApp login is not marketing consent.
- No sender secrets in the panel; no fallback to order-email credentials. Actual provider configuration must be verified before claiming working delivery.
- Default automatic cart reminders off. First reminder after 60 minutes of inactivity; optional second at 1440 minutes, with purchase/empty cart/new episode/consent/stock checks before every attempt.
- Ready campaign templates allow safe bounded content overrides and at most eight server-resolved products. Send/schedule/test is the effect action, with no additional publish step.
- Initial platform safety quota 1000/store/month, independently configurable; no commercial price or tariff-history changes. Account/provider limits are additionally enforced by configuration and bounded worker throughput.
- Unsubscribe GET confirms only; POST accepts human or RFC8058 one-click and revokes that store/email immediately. Provider complaints/bounces additionally suppress the address centrally.
- Durable job uniqueness survives the provider's 24-hour idempotency window. Freeze and encrypt the exact provider request before sending; never blindly reissue uncertain requests outside that window.
- Additive native252 migration preserves every existing function body, current records, payment authorities, native248/249/250/251 state, owner TOTP and storefront/customer cart contracts. Automatic tokens gain a truthful delivery issuer with an exactly-one-issuer constraint; existing manual tokens retain their membership issuer.
- Existing Brevo/Klaviyo connections stay available. New merchant experience contains no provider setup or infrastructure terminology.

## Tasks and file ownership

### 1. Data and native authority — design_inventory

- [ ] Define `packages/saas-data/src/native-marketing/types.ts`, strict repository and exports.
- [ ] Implement native252 settings/default templates, campaign/recipient snapshots, operation replay, quotas, leases, encrypted payload records, suppression and unsubscribe tokens.
- [ ] Authorize every admin action against existing store/membership/plan and `email_marketing` capability; all worker methods require the workflow role.
- [ ] Generate only relevant cart jobs from durable episode changes; use indexed due rows and bounded batches, avoiding repeated full cart scans.
- [ ] Test cross-tenant denial, consent loss, purchase cancellation, exactly-once operations, concurrent quota/claim, machine/manual recovery, unsubscribe isolation and uncertainty.

Interfaces: `NativeMarketingAdminRepository` overview/products/saveSettings/saveTemplate/queueCampaign/testCampaign/cancelCampaign; `NativeMarketingWorkflowRepository` claim/authorize/seal/finish/recordProviderEvent/unsubscribe. All exact signatures live in types.ts and are shared with the delivery and HTTP implementers.

### 2. Delivery and templates — design_global_research

- [ ] Add browser-safe `native-marketing/templates.ts` and a safe package subpath export; render HTML/text from canonical server projections with a visible unsubscribe link and sender identity/address.
- [ ] Implement separate owner config, encryption, Resend transport, worker, raw-body signed webhook and public unsubscribe route under `apps/owner/lib/native-marketing/`.
- [ ] Wire the bounded NET worker through owner instrumentation with explicit credentials, noreply sender, public origin, payload keyring and disabled-by-default rollout flags. SITE remains non-sending.
- [ ] Test brand/link escaping, canonical URLs, no Reply-To, one-click headers, failed/uncertain sends, sealed retries, signature replay and no order-email fallback.

### 3. HTTP and runtime — root

- [ ] Register a readiness-gated native marketing repository on the approved panel runtime.
- [ ] Add authenticated `/api/marketing/native-email` workspace/products and explicit preview/test/campaign send/schedule/cancel/cart-settings POST routes.
- [ ] Enforce host/session/Origin/commercial capability, exact bounded request schema and operation UUIDs before effects. Preview uses canonical branding/products; no remote image or HTML fetch.
- [ ] Test anonymous/stale/foreign tenant/foreign origin and lower-package denial, malformed oversized requests, effect replay keys, preview isolation and safe errors.

### 4. Merchant UI — design_local_research

- [ ] Implement Campaigns / Sepet hatırlatmaları / Bağlantılar in the existing email page and shared visual system.
- [ ] Add ready templates, product picker, safe preview, test, immediate/scheduled send, history and cancellation; automatic brand and quota display.
- [ ] Preserve form buffers and immutable pending operation across tab change/reload; recovery never resubmits without a click. Preserve existing external connection operation state.
- [ ] Add one cart reminder toggle and optional second reminder with one direct Apply action.
- [ ] Verify keyboard/mobile, empty audiences, missing mail, quota exhaustion, permission limits and error recovery.

### 5. Integration and rollout — root sole publisher

- [ ] Independently review cross-layer authority, recipient evidence, webhook mapping, opt-out and purchase races.
- [ ] Run affected typechecks, focused tests and a real isolated Postgres native harness; compare known baseline failures rather than changing unrelated tests.
- [ ] Verify actual Resend authority/domain before any real delivery; obtain only missing account handoff when unavoidable while continuing source work.
- [ ] Commit exact source; run source-bound panel/owner/storefront compatibility builds and restore generated payment metadata bytes.
- [ ] Capture fresh six-app/runtime/native/refs/aliases witnesses under the existing canonical publisher lock. Stage native252 atomically after reviewed SQL assertions.
- [ ] Publish compatible owner readers/runtime first, then panel NET and SITE, with separate acceptance gates. Preserve other applications/refs and all unrelated environment values.
- [ ] Check authenticated real merchant UX without sending customer campaigns; verify a controlled test to the user's own chosen address and isolated recovery/purchase tests. Enable the common capability for all entitled stores; cart automation remains opt-in.
- [ ] Verify actual running source, provider readiness, unchanged payment/Merchant/auth behavior and final shared publication before completion.

## Review focus

1. Same email in two stores: opting out of one must not unsubscribe the other; provider-level suppression stays broader.
2. Lost response after campaign creation/provider acceptance: no duplicate campaign or email, including after reload/24h expiry.
3. Purchase/permission/consent changes while a message waits: no further eligible send; no delayed old episode reminders.
4. Tenant-provided content/media/links: no cross-tenant data, unsafe sender/header, off-store recovery, script or external preview request.
5. Missing/invalid external credentials and quota: truthful unavailable states, bounded retries and no silent fallback to operational email keys.

## Implementation notes

For stores explicitly enabling cart reminders, a bounded locked scan evaluates real cart and checkout inactivity after one hour, reuses or creates the current consent-qualified episode, preserves analytics attribution/events, and promotes only eligible active carts. Existing analytics settings/evaluator, admin token issuer and public recovery implementation stay unchanged; native machine-issued tokens use a separate delivery FK.

The verified shared Resend account is on Free (100 emails/day, 3,000/month total across the team). A private global safety budget starts at 90 dispatch attempts/day and 2,900/month, counts sealed retries, defers before acquiring a lease when exhausted, and pauses on provider quota errors. Per-store quotas remain separate; no paid plan or pay-as-you-go setting is enabled by this work.

Verified locally: 69 panel email tests (including legacy connections), 65 owner native/order/middleware tests, 24 real isolated PostgreSQL scenarios, 6 repository tests; owner, data and panel typechecks. Desktop/mobile component QA passed at 1440, 1024 and 390 pixels. Deployment/provider readiness are tracked separately and are not implied by these local results.
