# Shared WhatsApp Ordering Implementation Plan

> **For agentic workers:** Use the executing-plans workflow with independent, explicitly owned implementation areas and a final fresh review.

**Goal:** Add shared WhatsApp product/cart requests and server-enforced catalog visibility in Store tools.

**Architecture:** A singleton merchant setting yields one host-bound commerce policy. Public projections redact hidden money before serialization; authoritative catalog, order and accounting money remains unchanged. Store tools and native writes enforce roles and package eligibility separately from manual sales.

**Tech Stack:** TypeScript, React/Next.js, native PostgreSQL migrations, existing merchant operation/idempotency infrastructure.

**Spec:** `docs/superpowers/specs/2026-10-21-whatsapp-ordering-design.md`

## Global Constraints

- Master switch defaults off. Do not enable or customize a real tenant without user instruction.
- Fiyatları gizle implies WhatsApp requests only and no new online checkout.
- Hide add-to-cart replaces new product purchase actions with WhatsApp and blocks new normal checkout; existing cart removal remains available.
- A WhatsApp click never commits an order, clears a cart, changes stock or records money/commission.
- Preserve phone-based login, existing payment callbacks and immutable historical tariff snapshots.
- Independent setting; contact bubble configuration is unrelated.
- No polling, no per-product setting reads, no arbitrary outbound URL or customer address/email in messages.
- All NET/SITE apps share the same compatible source. Run the exact source-bound signup release gate before any application rollout.
- Preserve the user's short focused test preference; broaden only for a concrete regression risk or required release gate.

## Review Focus

- Stale tabs/old carts must not leak price or bypass new checkout restrictions.
- Unavailable policy differs from no setting and must fail closed.
- Partial migrations/mixed versions cannot enable restrictions before all readers are compatible.
- All theme variants and public product API surfaces must honor the same policy.
- Old Merchant queue jobs must not republish offers after catalog-only mode.

## Shared Interfaces

- `WhatsAppOrderConfig`: `{schemaVersion:1, enabled:boolean, phone:string, hidePrices:boolean, hideAddToCart:boolean, messageIntro:string}`.
- `StorefrontCommercePolicy`: same fields plus `checkoutAllowed:boolean`, `version:number`; phone is canonical international format.
- `createDefaultWhatsAppOrderConfig`, `parseWhatsAppOrderConfig`, `resolveStorefrontCommercePolicy(config, version?)` exported from saas-contracts.
- `PublicWhatsAppOrderRepository.getForHost({hostname,now})` returns `{storeId,version,config}` or null; errors propagate.
- `PublicProduct`, public variants, cart money and hero hotspot prices accept explicit null for hidden projection; hidden responses carry `pricesHidden:true`. Native repository responses stay priced.
- Client provider `CommercePolicyProvider` / `useCommercePolicy` takes the policy from server page context; common `WhatsAppOrderButton` accepts product+variant+quantity or a cart.

### Task 1: Settings, authority and Store tools

**Files:** new `packages/saas-contracts/src/whatsapp-ordering/*`, new data reader, merchant-admin validation/kind/singleton; new native256 migration, Store tools card and route/card/API guards.

- [ ] Add focused tests for strict config, phone validation, all switch combinations and missing/disabled settings; run red.
- [ ] Implement shared config/policy helpers and dedicated reader.
- [ ] Add compatible singleton/native role/validation support without changing tariff snapshots; paid Başlangıç+ eligibility is additive and independent of manual orders.
- [ ] Open Store tools hub by configuration role, preserve each old growth tool's card and server guard; add WhatsApp card with normal save/retry/version behavior.
- [ ] Run contract, repository, native and panel checks; record commands/results.

### Task 2: Storefront presentation and requests

**Files:** public display contracts/parsers, shared product/cart/theme components, new commerce provider/button/message helper.

- [ ] Test hidden money parsing and WhatsApp variant/quantity/encoding/long-message behavior; run red.
- [ ] Add explicit nullable public money projection and adapt all product/theme/cart renderers without fabricating zero prices.
- [ ] Add the policy provider and common WhatsApp product/cart actions; allow variant selection and disable stockless orders.
- [ ] Hide price-based filtering/sorting, indirect prices, totals, checkout controls as required. Keep old cart removal.
- [ ] Run targeted tests and storefront typecheck; record coverage and results.

### Task 3: Public boundaries and checkout enforcement

**Files:** default runtime/page context; catalog/search/favorites/cart/recommendations/order-bumps routes; checkout initiation; SEO and monetary tracking.

- [ ] Test redaction, unavailable policy, cross-host selection, cart removal and direct checkout/add bypasses; run red.
- [ ] Read policy once per request; redact before RSC/JSON serialization. Preserve priced authoritative repository objects.
- [ ] Enforce new add/quantity increase, quote/complete/hosted payment initiation restrictions server-side, preserve existing callback/receipt/history flows.
- [ ] Remove hidden product Offers and monetary analytics; derive policy on fresh cart actions without polling.
- [ ] Run relevant boundary/runtime tests and typecheck.

### Task 4: Merchant compatibility

**Files:** separate native257 migration, Merchant eligibility/queue/worker tests and implementation.

- [ ] Test catalog-only withdrawal and stale upsert prevention; run red.
- [ ] Queue same-store policy reconciliation on change; delete existing offers and block ineligible upserts; normal mode restores stable IDs.
- [ ] Preserve 48-hour ordinary checks and existing targeted changes; document deployment compatibility.
- [ ] Run focused native queue tests.

### Task 5: Integration, review and rollout

**Files:** focused regression tests, release proof, operations/QA evidence.

- [ ] Integrate all areas, typecheck the affected packages/apps, run required native compatibility gate in disposable PostgreSQL16/Node24.
- [ ] Fresh reviewer checks complete diff against spec, especially hidden-price leaks, server gates, immutable entitlements and stale Merchant work. Fix material findings.
- [ ] Freeze candidate; refresh and commit source-bound signup proof; exact candidate passes `check:signup-release`.
- [ ] Publish compatible data and readers first; shared apps NET then SITE under one release owner; no tenant enabling.
- [ ] Verify live running source and Store tools/default-off normal commerce; report actual live state and remaining limitations.
