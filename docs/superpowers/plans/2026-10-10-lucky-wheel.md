# Shared Lucky Wheel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Ship the approved contact-first, coupon-backed wheel to the shared tenant admin and storefront without disrupting existing coupons, popups, checkout or payments.

**Architecture:** A new typed V1 wheel boundary owns campaign revisions and atomic participation. The existing promotion evaluator/reservation engine handles narrow database-proven wheel codes for anonymous WEB carts. Admin and storefront consume the same contracts; issued reward rules remain immutable.

**Tech Stack:** Existing TypeScript, Next.js/React, PostgreSQL private `saas` schema, shared contracts/data packages; SVG/CSS wheel, no new product dependency.

**Spec:** `docs/superpowers/specs/2026-10-10-lucky-wheel-design.md`

## Global Constraints

- Email or phone before spin; membership not required; marketing opt-in separately unchecked.
- One design; 4–8 prizes; default 6, repeatDays=7, couponHours=24; repeat 1–90 days, coupon 1–720 hours.
- Positive integer weights sum to 10,000; server chooses and persists outcome before animation.
- One enabled campaign per store; Save applies directly; timeout retries retain operation identity.
- Coupon rules frozen by reward revision; unique bearer code, one redemption, WEB only, audience everyone and perCustomerUsage=null.
- Do not broaden ordinary batch-code authorization. No automatic marketing sync/messages or new auth account.
- No live fixtures, customer messages or real prize claims during acceptance; isolate test data.
- Coordinate one release owner; compatible SQL/readers first, shared admins NET → SITE, verify running sources on all affected apps.

## Review Focus

- Two simultaneous different operation IDs from one visitor produce one award in a participation window.
- A copied wheel code can be applied by a guest but only one owned cart can redeem it; normal batch codes retain customer rules.
- Editing/deleting source/campaign cannot mutate previously promised rules or silently revoke codes.
- A modal reopened after an uncertain network result retrieves the old award and does not spin again.
- Existing legacy wheel records/history remain visible without converting text prizes into real awards automatically.

## File boundaries and shared interface

Task 1 owns `packages/saas-contracts/src/lucky-wheel/*`, `packages/saas-data/src/lucky-wheel/*`, their package exports, native SQL and migration registration/tests. Publish types early to Tasks 2/3 without changing them silently.

Required contract exports: `LuckyWheelConfig`, `LuckyWheelCampaign`, `LuckyWheelPublicCampaign`, `LuckyWheelPublicSettings`, `LuckyWheelSpinRequest`, `LuckyWheelSpinResult`, `LuckyWheelDeleteResult`; strict `parseLuckyWheel*` parsers, `createDefaultLuckyWheelConfig()`, reward-label/conditions helpers. Config includes appearance, contact/display rules, immutable-id prize inputs (`promotionId`, `weightBps`, `issuanceLimit`) and optional schedule. Campaign includes version, rule-derived prize details, blocked reason and aggregate stats. Public settings exclude contacts, unissued codes and operator data. Spin request includes campaign ID/version, operation ID, contact and consent; result includes award/prize ID, real code, fixed expiry/conditions and repeat eligibility. Admin save/create consume the same config; operation keys stay outside config.

Required repository exports: `PostgresLuckyWheelAdminRepository` with `list`, `save`, `deleteCampaign`, `history`, `revokeCoupons`; `PostgresPublicLuckyWheelRepository` with `publicSettings`, `spin`, `result`. Admin inputs use `tenantContext`, `now`, `operationId`, `campaignId`/`expectedVersion`; public inputs use trusted `hostname`, server-derived `visitorDigest`, `now`. Admin mutations use existing catalog authority; public methods use host-resolver role. Agree exact return shapes in Task 1's exported types before consumers write implementation.

### Task 1: Typed campaigns, durable awards and coupon engine

**Files:** Create shared lucky-wheel contract/data directories with unit tests; native lucky-wheel `.up.sql`/`.down.sql` and migration acceptance test under `apps/owner/scripts/sql/saas`; modify migration registry/readiness only where necessary. Follow repository-native sequential migration workflow (next available native number; coordinate before allocation).

- [ ] Write contract tests rejecting invalid weights/counts/colors/contact, unknown fields and inconsistent outputs; run RED, implement parsers/defaults/label helpers, run GREEN.
- [ ] Write repository tests for role/authority, fingerprints, timeout recovery, method result validation and no PII in safe errors; run RED then implement bounded transaction calls and verify GREEN.
- [ ] Create private/RLS-protected campaign/reward/award/code/operation records, strict authority/grants and indexes. Save freezes eligible source rules; preserves legacy merchant records and direct Save semantics; no implicit text-to-reward conversion.
- [ ] Implement atomic spin/recovery, cryptographic unbiased weighted choice, visitor-window locks, quotas and unique code issuance. Contact capture and opt-in proof commit with the award; no cart required.
- [ ] Connect only issued wheel codes to the existing evaluator/reserve/commit/release path; freeze source rules with no shared source usage/budget pool. Preserve issued codes after campaign/source removal. Explicit coupon revocation coordinates with live holds.
- [ ] Isolated SQL acceptance proves the five Review Focus boundaries, tenant isolation, quota concurrency, replay, pause/delete, earlier source expiry and unchanged legacy batch behavior. Test rollback and safe forward restoration; never run destructive SQL on production.
- [ ] Commit only owned files; report exact types/signatures, migration number and RED/GREEN evidence.

### Task 2: Admin studio and authenticated routes

**Files:** Create `apps/customer-panel/lib/{lucky-wheel-http,server-lucky-wheel,lucky-wheel-ui}/*`, `components/promotions/LuckyWheelStudio.tsx` and supporting wheel rendering/form files; replace lucky-wheel list/new/detail page adapters; add `/api/discounts/lucky-wheel` routes. Own admin runtime registration and test-script additions for new suites.

- [ ] Consume Task 1's exact exports/repository methods. Write HTTP tests for session/origin/role/version/idempotency checks and strict responses, then implement routes/runtime binding with required methods preserved in the facade.
- [ ] Write client recovery and behavior tests: retain form, Save applies directly, delete confirmation with truthful issued-code effect, separate revoke, legacy rows/history and conflicts.
- [ ] Build list/search/status/history and editor sections from the approved spec; use existing promotion picker/create API in a modal, no private secondary coupon engine. Automatic reward labels; valid source restrictions clear before Save.
- [ ] Render one configurable SVG wheel preview, no coupon/PII records from preview. Preserve admin visual tokens, semantic heading, keyboard/focus and mobile controls.
- [ ] Run new scoped suites, admin typecheck/build and neighboring promotions/engagement regressions; commit only owned files and report evidence.

### Task 3: Storefront contact-first wheel

**Files:** Create `apps/storefront-shared/lib/lucky-wheel/*`, public route adapters under `app/api/lucky-wheel`, wheel components; own storefront default-runtime binding and existing `StoreEngagement` modal coordination. Integrate with existing cart pending-coupon/quote bridge.

- [ ] Consume Task 1's public methods and exact contracts; write trusted-host/origin/body-limit/forged-source/cookie tests then implement route/runtime. Use a scoped HttpOnly Secure visitor credential independent of cart; server digest, no email-based recovery.
- [ ] Write client/behavior tests for contact-first, double click, uncertain reply/reopen, expiry, invalid input, no automatic messages and empty-cart application; run RED then GREEN.
- [ ] Lazy load one SVG/CSS wheel with fixed pointer and server-selected final angle; display actual odds, source-derived conditions, expiry and result. Reduced motion still announces the correct result.
- [ ] Coordinate launcher/optional scroll opening with popup/cart capture; exclude checkout/account; preserve pending code when cart conditions are not yet met. No interval polling or on-load fullscreen overlay.
- [ ] Run scoped storefront/engagement/cart regressions, storefront typecheck/build; commit only owned files and report evidence.

### Task 4: Integrated acceptance, independent review and shared release

**Files:** QA receipt/evidence under `docs/qa`; minimal integration fixes in owner/shared readers and bindings as review proves necessary. One release owner coordinates refs/pins/native numbers.

- [ ] Review each task for spec compliance and security; fix concrete findings with reproducing tests. Verify contracts/API consumers agree and legacy V1 engagement remains unchanged.
- [ ] Complete isolated end-to-end campaign Save → contact → award → guest cart → reserve → redemption, including concurrency, rollback, source edit/delete, revocation and marketing consent selection.
- [ ] Verify rendered admin/storefront at 1440/1024/390 and keyboard/error recovery using browser tools. Real production data only read; fixture actions stay isolated.
- [ ] Build every affected application; document any unrelated baseline failure precisely. Independent whole-branch review gates release.
- [ ] Recheck current shared source/native migration and other release owners; apply compatible data support with backup/isolated rollback evidence, deploy readers then NET → SITE admin and remaining affected storefronts.
- [ ] Confirm runtime sources, health, all tenant aliases and disabled-by-default behavior on real stores. Keep issued-code readers through rollback. Record final acceptance; completion requires all intended live readers.

## Execution authorization

User approved the written design and explicitly instructed “kodla” on 10 October 2026. Execute in this session with independent parallel workers for separated file boundaries, then integration/review by root. No additional permission to begin coding or routine shared rollout is required by this plan. Destructive customer actions and external messages beyond existing authorizations require their own explicit instruction.
