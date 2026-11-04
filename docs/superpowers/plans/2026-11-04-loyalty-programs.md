# Loyalty Programs Implementation Plan

> **For agentic workers:** Use subagent-driven development with independent file ownership; steps use checkbox syntax.

**Goal:** Ship four configurable loyalty templates across shared panel, storefront and POS without changing existing financial facts.

**Architecture:** Native PostgreSQL owns tenant authority, immutable program versions, member/source ledgers, rewards and work queue. Reuse the promotion evaluator with one managed promotion per program version and owner-bound single-use reward codes. TypeScript contracts, repositories and authenticated APIs expose narrow commands to the existing admin and account interfaces.

**Tech Stack:** Next.js/React, TypeScript, PostgreSQL 16, existing native repositories and workers.

**Spec:** `docs/superpowers/specs/2026-11-04-loyalty-programs.md`

## Global Constraints

- No historical grants, phone-based identity merging, invented cash receipts or changes to old order prices.
- Repeat/carryover on; one reward/order, no stacking, no expiry by default.
- One shared implementation; use stable operation IDs, native authority and rule versions.
- Keep uncertain payment reservations until authoritative reconciliation.
- Follow AGENTS.md signup proof and exact-candidate publication requirements.

## Review Focus

- A fully forgiven debt must not count as a paid purchase.
- Another customer's or tenant's reward must not be spendable with a copied code.
- Concurrent tabs and late bank results must not spend the same reward twice.
- A return after reward use must preserve history without creating a cash debt.
- Gift-only zero-total orders must create stock/order effects without a bank request.

## Shared interface

Config: `schemaVersion:1; template:'product_gift'|'purchase_gift'|'spend_discount'|'purchase_shipping'; target:number; eligibleProductIds:string[]; reward:{kind:'gift',variantId:string,quantity:number}|{kind:'discount',amountMinor:number}|{kind:'shipping',shippingMethodIds:string[]}; minimumBasketMinor:number; rewardMinimumBasketMinor:number; channels:('storefront'|'in_store'|'manual')[]; startsAt:string|null; endsAt:string|null; timezone:string; repeat:boolean; maxOncePerDay:boolean; allowMultiplePrograms:boolean; allowCombination:boolean; progressExpiryDays:number|null; rewardExpiryDays:number|null`.

Admin native: `loyalty_admin_command_v1(store uuid,principal uuid,membership uuid,plan uuid,planCode text,planVersion bigint,now timestamptz,action text,operation uuid,payload jsonb) -> TABLE(outcome text,result_payload jsonb)`. Read actions `list`, `report`; write actions `save`, `pause`, `duplicate`, `adjust`, `approve-pos`, `recover`. Save payload `{programId?:uuid,expectedVersion?:number,name,enabled,config}`; pause/duplicate `{programId,expectedVersion}`; adjust `{programId,customerId,delta,reason}`. Report `{programId,limit?,cursor?}`. Stable operation payload/fingerprint enforced in native.

Customer native: `loyalty_customer_command_v1(hostname text,now timestamptz,credentials jsonb,action text,operation uuid,payload jsonb)` same envelope. Credentials match existing account digest candidates. Actions `list`, `prepare-reward` payload `{rewardId}`, `approve-pos` payload `{}` and `recover`. Customer mutations need existing CSRF/origin checks. Prepare returns owner-bound code plus gift variant/quantity or discount/shipping info, without consuming before payment.

Worker native: `loyalty_process_pending_v1(now timestamptz,limit integer) -> jsonb`, bounded 20/order locks/SKIP LOCKED. Public native eligibility independently revalidates account session. Runtime roles get execute only, no direct table access.

### Task 1: Native authority, earning and redemption

Files: new `apps/owner/scripts/sql/saas/202611040502_loyalty_programs.{up,down}.sql`, assertions, `loyalty502.native.test.mjs`; worker integration under native-loyalty.

- [ ] Write/run failing native tests for tenant isolation, stable replay, real paid units/purchases/spend, 7/5 carryover and 10/5 rewards, discount-only debt settlement, rule versions, returns and pause.
- [ ] Implement schema, commands, indexed transactional queue, append-only deltas and promotion code ownership/reservation/commit integration.
- [ ] Verify original financial records and ordinary promotion behavior unchanged; test repeat migration/rollback safety.

### Task 2: Contracts, repository, panel API

Files: new `packages/saas-contracts/src/loyalty/*`, `packages/saas-data/src/loyalty/*`, package exports; `apps/customer-panel/lib/{server-loyalty,loyalty-http}/*`, `/api/loyalty/*`, runtime registration.

- [ ] Write/run failing validation and repository/API tests: malformed bounds, wrong role/tenant/origin, replay/unknown commit, inaccessible rewardowner.
- [ ] Implement exact config/result parsers, authenticated commands and runtime registration using existing catalog/promotion authority.
- [ ] Run targeted tests and package typechecks; agree native envelope names with Task 1.

### Task 3: Shared panel program studio

Files: new `apps/customer-panel/components/loyalty/*`, `app/(panel)/discounts/loyalty/*`; promotion navigation and cashier permission integration.

- [ ] Implement four template cards and three-step editor, directly saving active/scheduled programs.
- [ ] Add list/edit/duplicate/pause/report/audited corrections with real API calls and useful loading/error states.
- [ ] Verify interaction, keyboard, layout and required build; no fake stats or duplicate page titles.

### Task 4: Customer, POS and zero-total redemption

Files: shared storefront account/cart/checkout, POS approval/permission interfaces; separate native503 integration if needed, without editing Task 1 migration.

- [ ] Write/run failing tests for copied rewardcode, multiple tabs, unknown bank result, stockout, zero-total gift and verified POS binding.
- [ ] Add progress/reward account UI and direct use action through existing cart/quote flow.
- [ ] Connect verified POS approval and zero-total order completion, preserving ordinary checkout contracts and physical receipt actions.
- [ ] Run targeted tests and affected app builds.

### Task 5: Review, proof and shared rollout

- [ ] Review complete implementation and resolve critical/important findings with reproducing tests.
- [ ] Run native suite, affected contracts/data checks and app builds; refresh source-bound signup proof on Node24/PG16 and verify exact candidate.
- [ ] Publish native migration then required shared apps sequentially with idle coordination and current-state backups.
- [ ] Verify running NET/SITE sources, Ezmeo program/account interactions and tenant isolation without charging a card; report measured cleanup and live scope honestly.
