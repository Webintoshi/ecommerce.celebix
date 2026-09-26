# In-store Sales Register Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Replace the shared Customer Panel `/orders/quick-links` working screen with the approved barcode-first store sales register, backed by durable, tenant-scoped orders and location inventory.

**Architecture:** Separate in-store sale contracts and PostgreSQL repository implement drafts, pricing, holds, payment attestations and idempotent completion. The Customer Panel exposes session-authorized same-origin APIs and the approved Mira React screen. Existing payment links retain separate access; bank POS payment remains manual.

**Tech Stack:** Next.js 16, React 19, TypeScript, PostgreSQL owner-controlled migrations, existing `pg`, Lucide and CSS modules. No new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-09-26-in-store-sales-register-design.md`; visual approval artifact `docs/prototypes/in-store-register-demo.html`.

**Authorization:** User approved the HTML demo and explicitly requested coding on 2026-09-26. Earlier session grants autonomous implementation/deployment. Execute this plan in the isolated managed worktree without another permission request. Existing unrelated product-editor changes in the original checkout must not enter this feature release.

## Global Constraints

- Shared route is exactly `/orders/quick-links`, all stores use the same implementation, no hardcoded store identity.
- No customer payment link or bank POS integration in the cashier workflow.
- One primary action per stage; scanner input, cart and total are the main hierarchy.
- TRY integer cents; percentage integer bps; `floor(base * bps / 10000)` using overflow-safe arithmetic.
- One cart discount, header deduction once, separate immutable line/unit allocation snapshots.
- Existing `pricing_variant_discount_allowed` protection overrides the generic all-paid-lines discount assumption: only eligible lines form the discount base. Reference-priced gold products cannot bypass this protection.
- Price authority is `resolve_effective_variant_price(...,'in_store',...)`; no stale cached-price fallback on unavailable reference pricing.
- Bank charge and database completion are separate. Commit payment attestation before attempting order/inventory completion.
- Payment-pending or payment-received holds do not expire automatically; completion retries keep the same sale and operation IDs.
- Online checkout, stock adjustment, counts and transfer see POS holds; location-specific stock is consumed once.
- Anonymous store purchase is modeled with nullable customer/address fields only for `source=in_store`. Do not fabricate customer emails/addresses.
- Cashier gets only in-store capabilities, assigned locations and configured discount limit; no general administrator permissions.
- Mutation origin, host, session cookie, server tenant authority, exact body validation and idempotency remain fail closed.
- Keep `QuickOrderLinksConsole` and sent links operational via `/orders/payment-links`.
- Verify 1440, 1024, 390 px, keyboard focus, loading/empty/error/recovery, no page horizontal overflow.

## Review Focus

1. Real barcode stored with leading zero, duplicate alias or a product beyond initial catalog pages: exact tenant-scoped lookup, never arbitrary choice.
2. Price changes and gold policy exclusions while a draft is open: show refreshed total and require a new preparation before charging.
3. External POS charged, attestation accepted, finalization fails or response disappears: preserve payment and reservation; retry only the same sale.
4. A transfer/count or online last-unit checkout races the store register: common locking and global/location availability prevent overselling.
5. Cashier revoked, another operator opens sale, or completed order deleted: owner recovery and durable tombstone prevent second order/stock deduction.

## Shared Interfaces

Types/parsers live in `packages/saas-contracts/src/in-store-sales/{types,validation,calculation,index}.ts` and are exported from the package root.

```ts
type InStoreSaleStatus = 'draft'|'held'|'payment_pending'|'payment_received'|'completed'|'cancelled';
type InStoreDiscount = {kind:'percentage';percentageBps:number}|{kind:'fixed_amount';amountCents:number};
type InStoreSaleIntent = {
  locationId:string;
  items:readonly {variantId:string;quantity:number}[];
  discount:InStoreDiscount|null;
  customerName:string|null;
  note:string|null;
};
type InStoreProduct = {
  productId:string;variantId:string;productName:string;variantName:string;
  sku:string|null;barcode:string|null;imageUrl:string|null;
  unitPriceCents:number|null;pricingUnavailable:boolean;
  availableQuantity:number;stockTracking:boolean;discountEligible:boolean;
};
type InStoreSaleLine = {
  productId:string;variantId:string;productName:string;variantName:string;
  sku:string|null;barcode:string|null;imageUrl:string|null;
  unitPriceCents:number;quantity:number;discountEligible:boolean;
  lineSubtotalCents:number;allocatedDiscountCents:number;lineNetCents:number;
};
type InStoreSaleTotals = {subtotalCents:number;eligibleSubtotalCents:number;discountCents:number;totalCents:number};
type InStoreSale = {
  id:string;saleNumber:string;status:InStoreSaleStatus;version:number;
  locationId:string;locationName:string;ownerMembershipId:string;ownerLabel:string;
  customerName:string|null;note:string|null;discount:InStoreDiscount|null;
  items:readonly InStoreSaleLine[];totals:InStoreSaleTotals;
  createdAt:string;updatedAt:string;paymentReceivedAt:string|null;
  completedAt:string|null;orderId:string|null;orderNumber:string|null;
};
type InStoreSaleResult = {sale:InStoreSale;replayed:boolean;priceChanged:boolean};
type InStorePermissions = {canSell:boolean;canDiscount:boolean;discountLimitBps:number;canResolve:boolean;canManageStaff:boolean};
type InStoreBootstrap = {
  scopeKey:string;
  locations:readonly {id:string;name:string;isDefault:boolean}[];
  permissions:InStorePermissions;activeDraft:InStoreSale|null;
  heldSales:readonly InStoreSale[];pendingSales:readonly InStoreSale[];recentSales:readonly InStoreSale[];
  summary:{completedCount:number;grossCents:number;discountCents:number;netCents:number;pendingPaymentCount:number};
};
type InStoreSalePage = {sales:readonly InStoreSale[];nextCursor:string|null};
type InStoreStaffGrant = {
  membershipId:string;label:string;role:string;enabled:boolean;
  locationIds:readonly string[];discountLimitBps:number;version:number;
};
```

Public endpoints under `/api/orders/in-store`:

| Verb/path | Request | Result |
| --- | --- | --- |
| GET `/bootstrap` | no query | `InStoreBootstrap` |
| GET `/products` | locationId + exactly one barcode/query, limit 1..20 | `{products:InStoreProduct[]}` |
| GET `/sales` | status=draft/held/pending/completed, pageSize 1..50, optional cursor | `InStoreSalePage` |
| GET `/sales/:saleId` | no query | `InStoreSale` |
| GET `/operations/:operationId` | no query | `InStoreSaleResult|null` |
| POST `/sales` | `{saleId, intent}` | `InStoreSaleResult` |
| PATCH `/sales/:saleId` | `{expectedVersion,intent}` | `InStoreSaleResult` |
| POST `/sales/:saleId/hold` | `{expectedVersion,held:boolean}` | `InStoreSaleResult` |
| POST `/sales/:saleId/prepare` | `{expectedVersion,expectedTotalCents}` | `InStoreSaleResult` |
| POST `/sales/:saleId/payment` | `{expectedVersion,slipReference:string|null}` | `InStoreSaleResult` |
| POST `/sales/:saleId/complete` | `{expectedVersion}` | `InStoreSaleResult` |
| POST `/sales/:saleId/cancel` | `{expectedVersion,confirmUnpaid:true}` | `InStoreSaleResult` (back to draft after releasing old hold) |
| POST `/sales/:saleId/takeover` | `{expectedVersion}` | `InStoreSaleResult` |
| GET `/staff` | no query; owner/admin only | `{staff:InStoreStaffGrant[]}` |
| POST `/staff/:membershipId` | `{expectedVersion,enabled,locationIds,discountLimitBps}` | `InStoreStaffGrant` |

Every mutation uses UUID `idempotency-key`. The UI generates the initial sale UUID before its create request; operation recovery and that UUID prevent lost create responses from producing a second draft. Public result parsers reject unknown fields. Supported safe codes: `invalid_input`, `unauthenticated`, `membership_denied`, `store_inactive`, `feature_not_enabled`, `origin_denied`, `not_found`, `ambiguous_barcode`, `version_conflict`, `operation_mismatch`, `invalid_transition`, `inventory_conflict`, `pricing_unavailable`, `discount_denied`, `discount_invalid`, `unavailable`.

Repository (`packages/saas-data/src/in-store-sales/types.ts`) uses authority `{tenantContext:TenantContext,now:Date}`. Methods mirror the routes: `bootstrap`, `searchProducts`, `listSales`, `getSale`, `getOperation`, `createSale`, `updateSale`, `holdSale`, `prepareSale`, `confirmPayment`, `completeSale`, `cancelSale`, `takeoverSale`, `listStaff`, `setStaffGrant`. All writes consume `operationId`; sale writes also consume `saleId` and, except create, `expectedVersion`. `PostgresInStoreSalesRepository` takes `{pool,role:'celebix_saas_app',timeouts}` and exports through saas-data root. SQL entrypoints return `{outcome,result_payload}`.

## Task 1: Strict contracts, calculations and anonymous order projection

**Files:** new in-store-sales contract directory; modify contracts root, orders types/validation, pricing channel types/validation. Root owns these plus shared order UI null guards.

**Produces:** Types above; `parseInStoreSaleIntent`, `parseInStoreProduct`, `parseInStoreSale`, `parseInStoreSaleResult`, `parseInStoreBootstrap`, `parseInStoreSalePage`, `parseInStoreStaffGrant`, `calculateInStoreTotals(lines,discount)`.

- [x] Write failing tests: 200000/%1000 ->180000, fixed15000->185000, excluded gold line not in base, excessive/negative/zero-pay discount rejected, unknown fields rejected, duplicate variant IDs rejected, null customer/address accepted only for in_store.
- [x] Run contract targeted tests and observe feature failures.
- [x] Implement exact parsers, immutable output and integer calculations. Add `in_store` pricing/order source; keep existing-source customer/address requirements.
- [x] Run full contracts tests/typecheck; adapt common order renderers for anonymous in-store customer and null delivery address.
- [x] Commit explicit owned files after review.

## Task 2: Cashier role and assignment boundaries

**Files:** contracts types and authorization actions; generic membership/session validators; owner membership role input/display; migration `202609260158_in_store_cashier_role.{up,down,assertions}.sql`. Role worker coordinates actions/index changes with root.

**Consumes:** new merchant actions `in_store.read`, `in_store.sell`, `in_store.discount`, `in_store.resolve`, `in_store.staff`.

**Produces:** `cashier` membership accepted by auth/session and owner assignment, only in-store read/sell/discount actions; SQL POS grant still determines exact location and discount ceiling. Owner/admin gets all; editor/analyst get no POS mutation implicitly.

- [x] Write failing tests: cashier resolves panel session; cashier cannot catalog/orders/payment/settings actions; owner can assign cashier; revoked membership cannot operate.
- [x] Run role-focused tests, implement narrow role additions without widening other operation guards.
- [x] Add reversible membership role CHECK changes; validate customer panel/owner role projection and assign UI.
- [x] Run affected suites/typechecks and commit only owned files.

## Task 3: Durable DB workflow and repository

**Files:** migration `202609260157_in_store_sales_register.{up,down,assertions}.sql`, migration behavioral test/manifest; new saas-data in-store-sales directory. Backend worker owns these, root coordinates exports.

**Consumes:** Task 1 interfaces and existing pricing/inventory/order authority patterns.

**Produces:** Repository methods and SQL `in_store_sales_*` functions matching Shared Interfaces.

- [x] Write failing repository/DB tests for exact barcode beyond first pages/leading zero, ambiguity, cross-tenant/cashier denial, unknown commit recovery.
- [x] Create tables for durable sale, immutable operation/event/payment attestation, membership grants and location holds. Validate subscription/plan/membership and assigned locations server-side.
- [x] Implement draft save/hold/get/list, indexed full-catalog lookup and authoritative in_store pricing. Preserve unsupported/reference pricing failures; calculate eligible discount base with existing policy helper.
- [x] Implement prepare under shared catalog-store lock: active selected location, global and location available stock, refreshed quote; changed price returns editable updated sale with `priceChanged:true`.
- [x] Implement standalone durable payment attestation; finalize uses the attestation, explicit location ledger and inventory_managed aggregate, anonymous fulfilled paid order, immutable discount line/unit capture, one transaction. Retry one operation never creates a second order/movement.
- [x] Update online/count/transfer/reconcile hold consumers using explicit shared aggregate view/helper. Guard both global and selected-location availability; preserve checkout hold cleanup tables/lifecycle.
- [x] Implement unpaid cancellation, privileged takeover and minimal tombstone after order deletion. Never release payment_received holds via timeout/unpaid path.
- [x] Adapt paid-order/product revenue inputs for completed manual attestation and POS line net allocation, excluding completion-pending payments.
- [x] Add regression assertions for old checkout and inventory operations, perform full migration rehearsal/rollback on an isolated database clone, run saas-data suite/typecheck.
- [x] Commit explicit owned files after independent DB review.

## Task 4: Session-authorized API and runtime

**Files:** new `lib/server-in-store-sales/runtime.ts`, `lib/in-store-sales-http/{handler,request-authority,request-input,default}.ts` with tests; exact API route files from interface table; modify server-panel-access/postgres-runtime.ts. Root owns.

**Consumes:** Task 1 parsers and Task 3 repository.

**Produces:** Same-origin APIs independent of quick-link/provider readiness, per-request server TenantContext, no-store safe JSON.

- [x] Write failing handlers for missing session, hostile Origin, foreign-store/custom admin host, caller authority headers/body, oversized body and malformed UUID/version.
- [x] Reuse current session cookie/origin authority; register new repository with approved PostgreSQL access runtime unconditionally when commerce runtime is available.
- [x] Route exact methods/query/body to repository, serialize only validated public results and finite errors; recover operation response safely.
- [x] Run focused and full Customer Panel suites/typecheck.
- [x] Commit explicit files.

## Task 5: React register and real API client

**Files:** new `components/orders/{InStoreSalesConsole.tsx,in-store-sales.module.css}`, `lib/in-store-sales-ui/{client,model}.ts` and behavior/client tests. UI worker owns these.

**Consumes:** Task 1 shared types and API table. Exports `InStoreSalesConsole`.

- [x] Write failing client/model tests for exact barcode, preserved leading zero, sequential save/scan intents, unknown response result and reused operation keys.
- [x] Build the approved layout with real bootstrap/search data; no demo products or local-storage cart authority. Preserve optional customer/note, location, %/TL discount and protected discount-base explanation.
- [x] Queue scans and versioned draft saves; do not discard local edits on failed save. Flush before hold/prepare, refresh/reconfirm when priceChanged.
- [x] Implement held/history/recoverable list, optional owner staff-grant management, narrow action visibility.
- [x] Payment is two server operations behind one user action: persist attestation then complete. Persist only actor-scoped recovery IDs/keys locally; after unknown result query operation/sale before retry. Block edit/cancel after attestation.
- [x] Verify native keyboard dialogs/focus, quantity button hit targets, one main action, mobile sticky checkout above existing panel dock, loading/empty/errors.
- [x] Run meaningful behavior/client tests and React typecheck; commit explicit owned files.

## Task 6: Page, navigation and compatibility

**Files:** `/orders/quick-links/page.tsx`, new `/orders/payment-links/page.tsx`, panel navigation/breadcrumb maps, order source/customer/address presentation and source filters. Root owns.

- [x] Write failing route/source tests pinning the requested route and legacy link access; in_store orders display manual POS and in-store fulfillment with no shipping workflow.
- [x] Install InStoreSalesConsole at exact shared route, label `Mağaza satışı`; retain legacy QuickOrderLinksConsole at separate route and keep existing public link URLs/APIs unchanged.
- [x] Run panel route, navigation and common order rendering tests; build affected panel, storefront-shared and owner.
- [x] Commit explicit owned files.

## Task 7: Whole-feature verification and release

**Files:** QA/ops report and release manifest; no unrelated product-editor changes.

- [x] Review plan/spec coverage, reconcile interfaces, independently review security, inventory, payment state and React flows.
- [x] Run complete contracts, saas-data and Customer Panel suites; report any existing failures by name. Run owner migration behavioral suite and affected production builds.
- [x] Local browser proof with service fixture/isolated DB: barcode actual products, discount 2000->1800/1850, last-unit race, wrong location/cashier, lost response, reload/operation retry, attestation-before-finalize failure, completed-order tombstone.
- [x] Inspect screenshots 1440/1024/390, keyboard focus and console/network; no real external payment needed for QA.
- [x] Verify deployment source identity and database backup; rehearse migrations on clone; apply reviewed migration/role changes in declared order and deploy one shared panel source for all tenant admin domains. Use existing source/build and payment digest controls without changing provider credentials.
- [x] Read-only live smoke: requested Siora route, other shared admin surface, search/locations/permissions readiness, existing links and storefront availability. Use isolated QA records for mutation proof rather than real merchant sales.
- [x] Record exact commit, migration and deployment identities and any material limitation. No claim of physical device test without a real scanner.

## Self-review

All spec sections map to contracts, role authority, durable DB, runtime, React register, common order/report projections or release verification tasks. Protected gold discount-base and create-response recovery were added from actual repository evidence. Normal bank POS integration remains manual. Execution uses independent workers for DB, UI and role scope; root owns contracts/integration and reviews their outputs before release.

## Completion evidence

Implemented and released source `1b6d3f0f82183c1445d2eb57b17f2a25a2f2c27e` to both shared panels. See [release report](../../qa/in-store-sales-register-release-2026-09-26.md). Initial staff identity enrollment and physical draft deletion are explicitly outside the committed V1 scope. UI flow/viewport proof uses the actual React component; inventory races, authority, durable payment failure and tombstone assertions use actual PG16 RPCs/repository calls. Physical scanner hardware remains untested.
