# Promotions Studio V1 Design

**Status:** Approved for implementation by Atlas on 2026-09-05  
**Canonical base:** `fae6cb4f627f16360a332091f93cded5be7cf1a1`  
**Working branch:** `codex/atlas-promotions-studio-v1`

## Goal

Replace only the generic Customer Panel `/discounts` experience with an accessible, five-step Promotions Studio that lets a non-technical merchant create, test, publish, pause, analyse, and archive deterministic promotions. The same PostgreSQL evaluator is authoritative for the simulator, cart, checkout, hosted payment amount, order snapshots, usage accounting, and refund allocation.

`/discounts/lucky-wheel` and all non-discount generic merchant modules remain unchanged. `apps/admin/**` is excluded.

## Product language

The merchant UI asks five plain-language questions:

1. What should the customer receive?
2. Where should it apply?
3. Who may use it?
4. When should it run and what are its limits?
5. Is the result correct and ready to publish?

Terms such as evaluator, minor unit, stacking policy, rule tree, and reservation are internal only. Advanced settings are collapsed by default. Every empty state has a next action, every field has a concrete example, and the right-hand summary updates as the draft changes.

## Supported V1 catalogue

The Studio ships with these templates:

- First paid order percentage
- Basket threshold fixed amount
- Free shipping
- Buy X, receive Y free or discounted
- Quantity tiers
- Category percentage
- Bundle price
- Free gift
- Abandoned-cart audience
- VIP segment or tag
- Influencer/shareable code
- Custom campaign

Benefits are `percentage`, `fixed_amount`, `free_shipping`, `buy_x_get_y`, `quantity_tiers`, `bundle_price`, and `gift`. A campaign may be code-triggered or automatic. Fixed values use integer minor units and an exact currency.

Targets support include/exclude rows for products, variants, categories, brands, and collections. Audiences support everyone, first paid order, existing customer segments, existing customer tags, selected masked customers, and an abandoned-cart context. No parallel customer grouping system is introduced.

## Domain contract

### Promotion definition

Each promotion row owns a versioned `rule_document` with `schemaVersion: 1`. The document contains:

- benefit and its bounded, type-specific parameters;
- target mode plus include/exclude references;
- audience mode and safe opaque references;
- trigger (`automatic` or `code`);
- schedule with store timezone;
- nullable total/customer usage, budget, and order maximum limits;
- minimum basket/quantity/product quantity and optional payment, shipping, and sales-channel conditions;
- combination policy and integer priority;
- margin policy (`warn`, `floor_at_cost`, or bounded maximum percentage);
- customer progress-message policy.

The parser accepts exact keys, safe integers only, finite arrays, canonical uppercase coupon codes, UUID references, ISO timestamps, bounded IANA timezone names, and no secret/credential fields. Parsed values are deeply immutable.

### Lifecycle

Persisted states are `draft`, `scheduled`, `active`, `paused`, `archived`. `exhausted` and `ended` are deterministic effective states derived from committed usage/budget and time. Draft, scheduled-before-start, paused, ended, exhausted, and archived rules never apply.

Published rules are versioned. Editing a used or published promotion creates a new definition version without altering historical order snapshots.

### Evaluation context

The canonical evaluator receives store, customer reference and paid-order history, segments/tags, cart lines with product/category/brand/collection/cost snapshots, shipping and payment method, currency, store-local time, sales channel, normalized submitted codes, and optional abandoned-cart context.

The evaluator never accepts a client-calculated discount. It returns eligible, applied and safely rejected campaigns; line, shipping and gift effects; pre/post totals; customer progress messages; and a merchant explanation. Every monetary result is an integer minor unit.

### Evaluation rules

The PostgreSQL function `promotion_evaluate_v1` is the single runtime authority. It is called by thin typed repository methods and by checkout SQL wrappers. It evaluates in this order:

1. line-level percentage/fixed targeting;
2. bundle, quantity tier, and X/Y effects;
3. basket-level percentage/fixed effects;
4. shipping effects;
5. gift effects.

Non-combinable candidates in the same class are ordered by largest customer saving, higher priority, earlier creation timestamp, then stable promotion UUID. A promotion can allow no combinations, shipping-only combinations, or explicit benefit classes. The engine caps discounts at eligible value, optional order maximum, optional cost floor, and remaining budget. Grand totals never become negative.

The engine emits at most two reachable progress hints and never leaks campaigns for another audience.

### Deterministic allocation and refunds

Order-level discounts are allocated proportionally by eligible pre-discount line value. Integer remainders are assigned in stable line-position/UUID order. Shipping discounts remain separate. Refund calculations read the immutable order allocation and can never refund more than the paid net line amount. Gifts have a zero paid value; X/Y allocations follow the exact discounted units captured at order time.

## Persistence

Migration `126` adds additive, tenant-bound tables:

- `promotions`
- `promotion_versions`
- `promotion_targets`
- `promotion_codes`
- `promotion_code_batches`
- `promotion_usage_reservations`
- `promotion_redemptions`
- `promotion_audit_events`
- `promotion_operations`
- `order_promotion_snapshots`
- `order_discount_allocations`

All tenant child references use composite `(store_id, id)` keys where possible. RLS and FORCE RLS are enabled. Application and host roles receive no direct table writes. Security-definer RPCs pin `search_path`, validate the plan feature and exact merchant action, derive store identity from server session/hostname authority, lock operations and constrained rows, and expose only bounded JSON projections.

`promotion_operations` binds a UUID operation to store, operation kind, canonical fingerprint and result. A replay returns the same result; a different fingerprint yields `operation_mismatch`. Promotion version updates use optimistic `expectedVersion` checks.

## Legacy adoption

Existing `merchant_admin_records(kind='discount')` rows remain intact. Migration `126` idempotently creates at most one linked draft promotion per legacy record when the five-field config can be mapped without invention:

- `percent` becomes a percentage benefit;
- `fixed` becomes a TRY fixed-amount benefit;
- minimum basket and total usage become nullable limits;
- a valid code becomes a code-triggered promotion.

The adopted row stores `legacy_record_id` under a unique same-store constraint and is always `draft`. An unparseable legacy row is returned in a read-only legacy list with a safe reason and no fabricated rule. Running adoption again cannot duplicate rows. Legacy rows are not deleted or dual-written.

## Usage reservation

Usage follows `available → reserved → committed` or `released`.

- Reserve runs in the checkout transaction, locks the promotion/code/customer counter domain in stable order, checks total/customer usage and remaining budget, and binds one reservation to one source checkout/session and one idempotency operation.
- Hosted checkout holds the reservation for the hosted session and commits it only when the canonical payment settlement creates the order.
- Offline checkout reserves and commits in the same order transaction.
- Timeout, payment failure, cancellation policy, or explicit expiry releases held rows.
- Callback replay cannot create a second redemption. Two contenders cannot both acquire the last use or budget amount. Unknown commit is recovered through the operation ledger.

Reservations, redemptions and idempotency never use Redis.

## Checkout compatibility

Migration-first rollout preserves all old function signatures and old response shapes. New code uses additive V2 projections/RPC overloads carrying normalized coupon candidates, discount lines, applied promotion summaries, and progress messages. Old application plus new schema remains functional without promotion application; new application plus new schema enables promotions; code-only rollback leaves the additive schema safe.

Quote and simulator call the same evaluator. Offline completion re-evaluates and commits inside the order transaction. Hosted authority projection calculates the canonical discounted amount, freezes evaluator output and reservation references in the hosted session, and sends the discounted total and allocated basket amounts to the provider. Settlement consumes the frozen result rather than re-evaluating changed rules.

The immutable order snapshot includes promotion ID/version/name, normalized code where applicable, benefit, targets, line/shipping/gift effects, total discount, currency, and evaluation time.

## Repository and HTTP boundary

`@celebix/saas-contracts` owns strict public/request parsers. `@celebix/saas-data` owns PostgreSQL transaction/recovery adapters and a pure canonical fingerprint helper. Customer Panel and Storefront runtimes register narrow repository façades; browser code never imports a database pool.

Customer Panel endpoints live under `/api/promotions` and reject private authority headers, client store IDs, wrong content type/size, cross-origin mutation, missing session, malformed IDs, and unknown fields. Unauthorized mutation is 403; a resource from another store is indistinguishable from 404.

The role policy remains compatible with existing actions:

| Role | Read/simulate | Draft edit | Publish/pause | Export codes | Archive |
| --- | --- | --- | --- | --- | --- |
| store_owner | yes | yes | yes | yes | yes |
| admin | yes | yes | yes | yes | yes |
| editor | yes | no | no | no | no |
| analyst | yes | no | no | no | no |

V1 uses existing `promotions.read`, `promotions.manage`, and `promotions.archive`; draft/publish/export distinctions are enforced through operation-specific SQL checks while preserving the existing external action set. A later additive action split may be introduced without weakening V1.

## Customer Panel

The generic `MerchantModuleConsole` and `MerchantRecordEditor` stay untouched. Dedicated Promotions components provide:

- server-paginated list, search, filters, KPI range selector, desktop table and mobile cards;
- template chooser and five-step controlled wizard;
- collapsed advanced options, sticky natural-language summary and validation story;
- server-backed target/customer pickers that preserve selections across pages;
- conflict and margin checks before publish;
- simulator using the server evaluator and producing no reservation/redemption/analytics/stock mutation;
- view, edit, duplicate, pause/resume, codes, analytics and archive routes;
- cryptographically generated code batches up to 10,000, safe CSV export without PII, pause/revoke status, and shareable storefront link;
- dirty-state protection for internal links, browser unload, cancel and modal close.

Routes are `/discounts`, `/discounts/new`, `/discounts/[promotionId]`, `/discounts/[promotionId]/edit`, `/discounts/[promotionId]/codes`, and `/discounts/[promotionId]/analytics`. Historical edit links resolve the adopted promotion or show a read-only legacy warning. Lucky Wheel is unchanged.

## Storefront

Cart and checkout show server-returned automatic and code promotions, safe rejection messages, discount rows, gifts and at most two progress hints. Applying/removing a code always performs a server quote; success is shown only after the server response. A shareable `?coupon=` link normalizes and stores a same-host coupon candidate, then redirects to a query-free cart URL. Hostname/store authority is resolved server-side.

Promotion analytics use PostgreSQL orders/redemptions/snapshots for financial truth. Umami only contributes anonymous attribution dimensions. The UI never claims causality.

## Cache

`@celebix/saas-cache` gains a `promotions` namespace for validated compiled active-rule projections keyed by environment, store, currency, sales channel, evaluator schema version and namespace version. Publication/pause/archive rotates the namespace best-effort. A Redis error falls through to PostgreSQL and must not produce an unexpected 5xx or a wrong discount.

## Performance and safety budgets

- 100 active promotions, 20 cart lines and five codes: warm p95 at most 100 ms, cold p95 at most 250 ms on the verification host, or an evidence-backed bottleneck must be fixed.
- No per-promotion, per-product or per-customer repository fan-out.
- List/search/filter/pagination is server-side and works beyond 1,600 products and 200 promotions.
- Inputs and outputs are bounded; code CSV is protected from formula injection.
- Real customer/product/order data is never used in QA. Only `ATLAS-QA-PROMO-*` fixtures may be created and they are archived/revoked after certification.

## Rollout and rollback

After merge, take and restore-verify a SaaS PostgreSQL backup, apply migration `126` and assertions first, verify replay/idempotency, then deploy only changed staging services at the exact merge SHA. Production is untouched.

Standard rollback is code-only with the additive schema left in place. Down migration is emergency/pre-restore only and refuses to drop data-bearing promotion, reservation, redemption, or order snapshot state. Source branch is preserved.

## Acceptance

Completion requires the full Atlas prompt matrix: all seven benefit families; templates; target/audience/code/schedule/limit/combination/margin flows; same-evaluator simulator and checkout; safe reservation/replay/snapshot/refund; legacy preservation; analytics; Redis fail-open; role/tenant isolation; no `apps/admin/**`; fresh workspace tests/typechecks/builds/Phase 3; independent review with no Critical/Important finding; merge commit; migration-first staging; exact running SHA; real Chrome QA at 1440/1024/390 with no horizontal overflow, console error, unexpected 4xx/5xx or live QA residue.
