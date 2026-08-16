# Customer Panel Working-System Stabilization Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or inline TDD execution task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the customer-panel admin and storefront-facing operational areas to a truthful “Sistem OK” state without breaking already-working order detail, PayTR test checkout, abandoned-cart list visibility, storefront theme rendering, or tenant/session authority.

**Architecture:** Stabilize by feature slice, not by sweeping refactor. Each slice must start from an observed failing test or live symptom, repair only the root cause, then verify with focused tests, customer-panel regression, typecheck/build, and a targeted staging smoke when the change affects live UI. No production mutation is allowed.

**Tech Stack:** Next.js App Router, React server/client components, TypeScript, Node test runner, PostgreSQL-backed SaaS runtime, customer-panel same-origin admin APIs, existing Coolify staging deploy flow.

## Global Constraints

- Preserve all currently working flows: live order detail, PayTR iframe test token handoff, bank transfer order creation, abandoned-cart list rows, storefront add-to-cart/side-cart, design draft save, and panel login/session.
- Do not mutate production, production credentials, production deployment, or production DNS.
- Do not touch `apps/admin/**`.
- Do not introduce fake data as an operational substitute.
- Do not expose tenant/store authority in browser requests.
- Do not trust browser Host/Origin/Forwarded headers as tenant/store authority.
- Do not perform broad rewrites while fixing a single failing slice.
- Every production-code behavior change needs a failing or already-failing test first.
- Every commit must be small enough to review independently.

## “Sistem OK” Definition

For a feature area to be marked **OK**, all of these must be true:

1. Its route loads in the authenticated Güzide staging panel.
2. Its empty, loading, error, desktop, and mobile states are safe and readable.
3. Its main read API returns durable tenant-scoped data or a controlled empty state.
4. Its main mutation, if any, works with an idempotency key and exact same-origin authority.
5. Its UI does not expose UUIDs/slugs/secrets/private authority unless intentionally user-facing.
6. Its focused tests pass.
7. `npm run typecheck --workspace @celebix/customer-panel` passes.
8. `npm run build --workspace @celebix/customer-panel` passes before deploy.
9. Staging smoke verifies the original symptom is gone.

---

## Current Evidence Baseline

**Known green / preserve:**

- Live order detail page opened after commit `1640a718fea8433cd2227cb1b5ed8b50e67cb04d`.
- Abandoned cart list route shows totals and rows on Güzide staging.
- Focused catalog client tests for list, variant choices, and brand product directory pass.
- PayTR runtime now includes `paytr_iframe`; this is expected operationally but one stale test still expects only Iyzico.

**Known red / repair queue:**

- `npm test --workspace @celebix/customer-panel` exits `1`.
- Product create/navigation route coverage is failing.
- Customer route matrix is failing.
- Merchant route matrix is failing.
- Dashboard durable summary/presentation tests are failing.
- Category manager hierarchy/slug test is failing.
- Payment runtime/catalog tests are stale or misaligned with PayTR.
- Abandoned-cart preflight test fails around server-only authority.
- Shipping console visual/provider-authority contract is failing.
- Analytics/page-shell/admin-open-canvas tests are failing.

---

## Task 1: Freeze Baseline and Add Feature OK Checklist

**Files:**
- Modify: `apps/customer-panel/lib/panel-ui/functional-maturity.ts`
- Modify: `apps/customer-panel/lib/panel-ui/functional-maturity.test.ts`
- Optional docs-only notes inside this plan; no runtime UI copy change unless test requires it.

**Interfaces:**
- Consumes existing `PANEL_FUNCTIONAL_MATURITY`.
- Produces a truthful registry that separates `operational`, `provider_gated`, `partially_verified`, and `known_gaps`.

- [ ] **Step 1: Run current maturity test**

```bash
node --experimental-transform-types --test apps/customer-panel/lib/panel-ui/functional-maturity.test.ts
```

Expected: existing maturity test should pass or fail only where stale operational claims exist.

- [ ] **Step 2: Tighten any overclaims**

If a feature fails this stabilization plan, it must not be marked fully operational in `functional-maturity.ts`. Keep labels truthful; do not hide features that exist, but mark gaps.

- [ ] **Step 3: Verify**

```bash
node --experimental-transform-types --test apps/customer-panel/lib/panel-ui/functional-maturity.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/customer-panel/lib/panel-ui/functional-maturity.ts apps/customer-panel/lib/panel-ui/functional-maturity.test.ts
git commit -m "test(panel): define working-system readiness baseline"
```

---

## Task 2: Product Create Must Work End-to-End

**Files:**
- Modify: `apps/customer-panel/components/catalog/ProductCreateForm.tsx`
- Modify: `apps/customer-panel/components/catalog-onboarding/ProductAdvancedEditor.tsx`
- Modify: `apps/customer-panel/lib/catalog-onboarding-ui/client.ts`
- Modify or add focused tests near:
  - `apps/customer-panel/lib/catalog-onboarding-ui/client.test.ts`
  - `apps/customer-panel/lib/routes.test.ts`

**Interfaces:**
- `catalogOnboardingClient.createProduct(input)` must POST to `/api/catalog/onboarding/products`.
- The form must surface validation errors, create errors, media errors, and publish errors separately.
- No browser-supplied tenant/store ID may be sent.

- [ ] **Step 1: Capture current route/create failure**

```bash
npm test --workspace @celebix/customer-panel -- --test-name-pattern "create routes expose"
```

If the npm script ignores the pattern, run:

```bash
node --experimental-transform-types --test apps/customer-panel/lib/routes.test.ts
```

Expected: FAIL on create route/navigation contract.

- [ ] **Step 2: Add or strengthen create-product regression**

In `apps/customer-panel/lib/catalog-onboarding-ui/client.test.ts`, assert:

```ts
assert.equal(request.url, "/api/catalog/onboarding/products");
assert.equal(request.credentials, "same-origin");
assert.equal(request.headers.get("content-type"), "application/json");
assert.match(request.headers.get("idempotency-key") ?? "", UUID_REGEX);
assert.equal(JSON.parse(body).storeId, undefined);
assert.equal(JSON.parse(body).tenantId, undefined);
```

Expected failure before fix: missing route consistency, unsafe payload field, or missing idempotency/same-origin guarantee.

- [ ] **Step 3: Repair minimal create route/UI behavior**

Only change create form/client behavior needed for:

- validated payload;
- stable idempotency key per submit;
- separate error messages;
- successful redirect or success notice after create;
- no duplicate writes on retry ambiguity.

- [ ] **Step 4: Verify focused product create tests**

```bash
node --experimental-transform-types --test \
  apps/customer-panel/lib/catalog-onboarding-ui/client.test.ts \
  apps/customer-panel/lib/catalog-ui/client.test.ts \
  apps/customer-panel/lib/catalog-ui/variant-choices.test.ts \
  apps/customer-panel/lib/routes.test.ts
```

Expected: product/client/route create tests PASS.

- [ ] **Step 5: Live staging smoke**

Using Güzide staging admin, create one disposable draft product:

- title: `CELEBIX TEST DRAFT - DELETE`
- price: small non-production value;
- status: draft;
- no publish unless specifically verifying publish.

Then delete/archive it. Evidence must say only created/archived, no sensitive data.

- [ ] **Step 6: Commit**

```bash
git add apps/customer-panel/components/catalog apps/customer-panel/lib/catalog-onboarding-ui apps/customer-panel/lib/catalog-ui apps/customer-panel/lib/routes.test.ts
git commit -m "fix(panel): repair product creation workflow"
```

---

## Task 3: Category and Brand Admin Must Hide Technical Slugs and Show Real Product Names

**Files:**
- Modify: `apps/customer-panel/components/catalog-onboarding/CategoryManager.tsx`
- Modify: `apps/customer-panel/components/catalog-onboarding/category-management.module.css`
- Modify: `apps/customer-panel/components/catalog-admin/CatalogResourceConsole.tsx`
- Modify: `apps/customer-panel/components/catalog-admin/CatalogBrandLogoPicker.tsx`
- Modify: `apps/customer-panel/lib/catalog-admin-ui/brand-product-directory.ts`
- Modify tests:
  - `apps/customer-panel/lib/category-showcase-model.test.ts`
  - `apps/customer-panel/components/catalog-admin/CatalogBrandLogoPicker.test.ts`
  - `apps/customer-panel/lib/catalog-admin-ui/brand-product-directory.test.ts`
  - relevant category manager test currently failing.

**Interfaces:**
- Brand editor must display linked product titles/SKUs, not raw UUID-only labels.
- Brand list must support logo asset selection without blocking the base brand list.
- Category admin must show parent/child hierarchy and hide technical slug from primary visual list.

- [ ] **Step 1: Reproduce category failure**

```bash
npm test --workspace @celebix/customer-panel 2>&1 | rg "category manager presents hierarchy"
```

Expected: FAIL.

- [ ] **Step 2: Strengthen tests for category hierarchy**

Assert:

```ts
assert.doesNotMatch(renderedText, /\\/[a-z0-9-]{3,}/);
assert.match(renderedText, /Üst kategori|Alt kategori|Ana kategori/);
assert.match(renderedText, /Kolye|Bileklik|Yüzük|Küpe/);
```

- [ ] **Step 3: Strengthen tests for brand product names**

Assert brand editor renders:

```ts
assert.match(renderedText, /14 Ayar|Altın|SKU|ürün/);
assert.doesNotMatch(renderedText, /Mevcut bağlı ürün · [0-9a-f-]{36}/);
```

- [ ] **Step 4: Repair minimal UI/data composition**

Keep brand resource reads independent from heavy product-directory reads. If linked names are still loading, show a controlled loading label, not raw UUIDs.

- [ ] **Step 5: Verify**

```bash
node --experimental-transform-types --test \
  apps/customer-panel/lib/catalog-admin-ui/brand-product-directory.test.ts \
  apps/customer-panel/components/catalog-admin/CatalogBrandLogoPicker.test.ts \
  apps/customer-panel/lib/category-showcase-model.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/customer-panel/components/catalog-admin apps/customer-panel/components/catalog-onboarding apps/customer-panel/lib/catalog-admin-ui apps/customer-panel/lib/category-showcase-model.test.ts
git commit -m "fix(panel): repair category and brand management"
```

---

## Task 4: Abandoned Cart Must Show Product and Customer Identity Reliably

**Files:**
- Modify: `apps/customer-panel/components/orders/AbandonedCartConsole.tsx` if present, otherwise the abandoned-cart console component file found by test.
- Modify: `apps/customer-panel/components/orders/abandoned-cart-console.module.css`
- Modify: `apps/customer-panel/lib/abandoned-cart-http/handler.ts`
- Modify: `apps/customer-panel/lib/abandoned-cart-ui/client.ts`
- Modify: `apps/customer-panel/lib/server-abandoned-carts/postgres-runtime.ts`
- Tests:
  - `apps/customer-panel/lib/abandoned-cart-console.test.ts`
  - `apps/customer-panel/lib/abandoned-cart-ui/client.test.ts`
  - `apps/customer-panel/lib/abandoned-cart-http/handler.test.ts`
  - `apps/customer-panel/lib/server-abandoned-carts/postgres-runtime.test.ts`

**Interfaces:**
- List row must show product title, quantity, total, status, last activity.
- If customer identity exists, show customer name/email/phone safely.
- If no customer identity exists, show `Anonim sepet / İletişim bilgisi yok`.
- Preflight must require only session + abandoned-cart authority, not unrelated server-only imports from client test context.

- [ ] **Step 1: Reproduce preflight failure**

```bash
node --experimental-transform-types --test apps/customer-panel/lib/server-abandoned-carts/postgres-runtime.test.ts
```

Expected: FAIL with the current server-only/preflight issue.

- [ ] **Step 2: Add UI regression for product/customer text**

In `abandoned-cart-console.test.ts`, assert both:

```ts
assert.match(renderedText, /14 Ayar|Altın|ürün/i);
assert.match(renderedText, /Anonim sepet|@|telefon|müşteri/i);
assert.doesNotMatch(renderedText, /undefined|null|\\[object Object\\]/i);
```

- [ ] **Step 3: Repair preflight and projection boundaries**

Keep server-only code server-side. Client tests must import only UI/client-safe modules. Runtime projection should contain safe display fields, not raw secret/session data.

- [ ] **Step 4: Verify focused abandoned cart tests**

```bash
node --experimental-transform-types --test \
  apps/customer-panel/lib/abandoned-cart-console.test.ts \
  apps/customer-panel/lib/abandoned-cart-ui/client.test.ts \
  apps/customer-panel/lib/abandoned-cart-http/handler.test.ts \
  apps/customer-panel/lib/server-abandoned-carts/runtime.test.ts \
  apps/customer-panel/lib/server-abandoned-carts/resolver.test.ts \
  apps/customer-panel/lib/server-abandoned-carts/postgres-runtime.test.ts
```

Expected: PASS.

- [ ] **Step 5: Live staging smoke**

Create a new storefront cart, leave it, then verify admin shows:

- product name;
- quantity;
- amount;
- anonymous or customer identity according to whether visitor identified themselves.

- [ ] **Step 6: Commit**

```bash
git add apps/customer-panel/components/orders apps/customer-panel/lib/abandoned-cart-* apps/customer-panel/lib/server-abandoned-carts
git commit -m "fix(panel): stabilize abandoned cart visibility"
```

---

## Task 5: Payment Settings and PayTR Catalog Must Be Truthful

**Files:**
- Modify: `apps/customer-panel/lib/server-payment-methods/runtime.ts`
- Modify: `apps/customer-panel/lib/server-payment-methods/runtime.test.ts`
- Modify: `apps/customer-panel/lib/payment-providers/catalog.ts`
- Modify: `apps/customer-panel/lib/payment-providers/catalog.test.ts`
- Modify: `apps/customer-panel/lib/payment-settings-ui/model.ts`
- Modify: `apps/customer-panel/components/settings/payment/PaymentSettingsConsole.tsx`
- Modify: `apps/customer-panel/components/settings/payment/PaytrConnectionForm.tsx`

**Interfaces:**
- Runtime catalog may include `paytr_iframe` when configured.
- Test mode/live mode must be explicit and visible.
- Merchant credentials must never be rendered back to browser after save.
- Payment settings must distinguish configured, enabled, test, live, callback-valid, and checkout-ready states.

- [ ] **Step 1: Reproduce stale PayTR test**

```bash
node --experimental-transform-types --test apps/customer-panel/lib/server-payment-methods/runtime.test.ts
```

Expected: FAIL currently because actual is `[ "iyzico_iframe", "paytr_iframe" ]`.

- [ ] **Step 2: Update test to truthful catalog**

Expected assertion:

```ts
assert.deepEqual(methodCodes, ["iyzico_iframe", "paytr_iframe"]);
assert.equal(runtime.catalog.find((m) => m.code === "paytr_iframe")?.executionAuthority, undefined);
```

- [ ] **Step 3: Repair UI model if needed**

Make PayTR show only operational states:

- `Kurulu değil`
- `Test modu`
- `Canlıya hazır değil`
- `Canlı`
- `Hata`

- [ ] **Step 4: Verify payment tests**

```bash
node --experimental-transform-types --test \
  apps/customer-panel/lib/server-payment-methods/runtime.test.ts \
  apps/customer-panel/lib/payment-providers/catalog.test.ts \
  apps/customer-panel/lib/payment-settings-ui/model.test.ts \
  apps/customer-panel/lib/payment-settings-console.test.ts
```

Expected: PASS.

- [ ] **Step 5: Live smoke**

On Güzide staging:

- payment settings opens;
- PayTR appears configured/test or live according to current staging config;
- checkout opens PayTR iframe for card payment;
- bank transfer still creates an order.

- [ ] **Step 6: Commit**

```bash
git add apps/customer-panel/lib/server-payment-methods apps/customer-panel/lib/payment-providers apps/customer-panel/lib/payment-settings-ui apps/customer-panel/components/settings/payment
git commit -m "fix(panel): align payment settings with paytr runtime"
```

---

## Task 6: Dashboard Must Use Durable Live Facts

**Files:**
- Modify: `apps/customer-panel/components/dashboard/PanelDashboardHomeView.tsx`
- Modify: `apps/customer-panel/components/dashboard/panel-dashboard.module.css`
- Modify: `apps/customer-panel/lib/panel-ui/dashboard-model.ts`
- Modify: `apps/customer-panel/lib/panel-ui/dashboard-model.test.ts`
- Modify: `apps/customer-panel/lib/analytics-ui/presentation.ts`
- Modify: `apps/customer-panel/lib/analytics-ui/presentation.test.ts`
- Modify: `apps/customer-panel/lib/analytics-http/dashboard-handler.ts`

**Interfaces:**
- Dashboard summary must use durable catalog/order/customer facts.
- Analytics unavailable must not hide ready order/catalog slices.
- Mobile cards must not overflow.

- [ ] **Step 1: Reproduce dashboard failures**

```bash
npm test --workspace @celebix/customer-panel 2>&1 | rg "dashboard|analytics dashboard|metric tabs"
```

Expected: FAIL list of dashboard/presentation tests.

- [ ] **Step 2: Repair model before UI**

Make `dashboard-model.ts` normalize:

- active product count;
- newest order rows;
- total order amount;
- analytics unavailable state;
- retry state.

- [ ] **Step 3: Repair visual contracts**

Keep the existing ikas-like store summary anatomy, but remove stale ready data on retry/error states.

- [ ] **Step 4: Verify**

```bash
node --experimental-transform-types --test \
  apps/customer-panel/lib/panel-ui/dashboard-model.test.ts \
  apps/customer-panel/lib/analytics-ui/presentation.test.ts \
  apps/customer-panel/lib/analytics-http/handler.test.ts \
  apps/customer-panel/lib/analytics-console.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/customer-panel/components/dashboard apps/customer-panel/lib/panel-ui/dashboard-model* apps/customer-panel/lib/analytics-*
git commit -m "fix(panel): repair durable dashboard facts"
```

---

## Task 7: Customer Admin Must Support List, Detail, Edit, New, Tags, and Segments

**Files:**
- Modify: `apps/customer-panel/components/customers/CustomerListConsole.tsx`
- Modify: `apps/customer-panel/components/customers/CustomerDetailConsole.tsx`
- Modify: `apps/customer-panel/components/customers/CustomerEditConsole.tsx`
- Modify: `apps/customer-panel/components/customers/CustomerFormConsole.tsx`
- Modify: `apps/customer-panel/components/customers/CustomerTaxonomyConsole.tsx`
- Modify: `apps/customer-panel/lib/customer-ui/*.ts`
- Modify: `apps/customer-panel/lib/customer-http/*.ts`
- Modify: `apps/customer-panel/lib/server-customers/*.ts`

**Interfaces:**
- Customer list/detail/new/edit routes must invoke real same-origin clients and server handlers.
- Empty and error states must be truthful.
- Address book and order history may be visible only from durable projections.

- [ ] **Step 1: Reproduce customer failures**

```bash
npm test --workspace @celebix/customer-panel 2>&1 | rg "customer route|customer taxonomy|customer console"
```

Expected: FAIL.

- [ ] **Step 2: Repair route matrix expectations with production code**

Do not weaken tests. Make routes invoke actual page/client/handler paths.

- [ ] **Step 3: Verify customer tests**

```bash
node --experimental-transform-types --test \
  apps/customer-panel/lib/server-customers/*.test.ts \
  apps/customer-panel/lib/customer-http/*.test.ts \
  apps/customer-panel/lib/customer-ui/*.test.ts
```

Expected: PASS.

- [ ] **Step 4: Live smoke**

Open:

- `/customers`
- `/customers/new`
- one customer detail if present
- `/customers/tags`
- `/customers/segments`

Expected: no unavailable page, no raw authority, no fake data.

- [ ] **Step 5: Commit**

```bash
git add apps/customer-panel/components/customers apps/customer-panel/lib/customer-* apps/customer-panel/lib/server-customers
git commit -m "fix(panel): stabilize customer management routes"
```

---

## Task 8: Navigation, Route Matrix, and Header Identity

**Files:**
- Modify: `apps/customer-panel/lib/panel-ui/navigation.ts`
- Modify: `apps/customer-panel/lib/panel-ui/navigation.test.ts`
- Modify: `apps/customer-panel/lib/routes.test.ts`
- Modify any directly implicated route page under `apps/customer-panel/app/**/page.tsx`.

**Interfaces:**
- Navigation must expose literal destinations for every shipped route.
- Dropdown groups must be accessible and only active family should open initially.
- Page header must publish one route identity without duplicate copy.

- [ ] **Step 1: Reproduce route failures**

```bash
node --experimental-transform-types --test \
  apps/customer-panel/lib/routes.test.ts \
  apps/customer-panel/lib/panel-ui/navigation.test.ts
```

Expected: FAIL.

- [ ] **Step 2: Repair route/navigation source of truth**

Keep destination labels and `PanelNavigationHref` aligned. If a menu item exists, route must exist and render. If a route is not operational, label it controlled/unavailable rather than silent fake.

- [ ] **Step 3: Verify**

```bash
node --experimental-transform-types --test \
  apps/customer-panel/lib/routes.test.ts \
  apps/customer-panel/lib/panel-ui/navigation.test.ts \
  apps/customer-panel/lib/panel-ui/workspace-navigation.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/customer-panel/lib/panel-ui apps/customer-panel/lib/routes.test.ts apps/customer-panel/app
git commit -m "fix(panel): align admin navigation routes"
```

---

## Task 9: Storefront Design Builder Must Be Safe and Publish What It Edits

**Files:**
- Modify: `apps/customer-panel/components/settings/design/DesignWorkspace.tsx`
- Modify: `apps/customer-panel/components/settings/design/DesignInspector.tsx`
- Modify: `apps/customer-panel/components/settings/design/DesignPreview.tsx`
- Modify: `apps/customer-panel/components/settings/design/DesignStepEditor.tsx`
- Modify: `apps/customer-panel/lib/starter-theme-composer-model.ts`
- Modify: `apps/customer-panel/lib/category-showcase-model.ts`
- Modify storefront theme files already used for starter rendering.

**Interfaces:**
- One place owns homepage sections.
- Clearing all homepage sections must not crash storefront.
- Category showcase choice must publish to storefront.
- Quantity selector visibility must obey admin setting.
- Footer policies must render only published policies.

- [ ] **Step 1: Reproduce design failures**

Run focused tests:

```bash
node --experimental-transform-types --test \
  apps/customer-panel/components/settings/design/DesignWorkspace.test.ts \
  apps/customer-panel/lib/starter-theme-composer-model.test.ts \
  apps/customer-panel/lib/category-showcase-model.test.ts \
  apps/customer-panel/lib/store-policy-ui/client.test.ts
```

Expected: FAIL only on currently broken contracts.

- [ ] **Step 2: Add fail-safe empty homepage test**

Assert:

```ts
assert.doesNotThrow(() => composeStarterHomepage({ sections: [] }));
assert.match(renderedFallback, /Mağaza|Ürünler|Kategoriler|Henüz bölüm yok/);
```

- [ ] **Step 3: Repair model source of truth**

Make `category-showcase-model.ts` the single source for category cards, layout, images, and titles. Admin preview and storefront must consume the same normalized model.

- [ ] **Step 4: Verify focused design tests**

```bash
node --experimental-transform-types --test \
  apps/customer-panel/components/settings/design/DesignWorkspace.test.ts \
  apps/customer-panel/components/settings/CategoryShowcaseEditor.test.ts \
  apps/customer-panel/lib/starter-theme-composer-model.test.ts \
  apps/customer-panel/lib/category-showcase-model.test.ts
```

Expected: PASS.

- [ ] **Step 5: Live smoke**

In staging admin:

- remove all homepage sections;
- save/publish;
- storefront must not show 503/unavailable;
- add category showcase;
- publish;
- storefront category layout changes.

- [ ] **Step 6: Commit**

```bash
git add apps/customer-panel/components/settings apps/customer-panel/lib/starter-theme-composer-model* apps/customer-panel/lib/category-showcase-model*
git commit -m "fix(panel): make theme builder publish safe storefront sections"
```

---

## Task 10: Shipping Console Must Stop Leaking Provider Authority and Pass Responsive Contract

**Files:**
- Modify: `apps/customer-panel/components/shipping/OrderShipmentConsole.tsx`
- Modify: `apps/customer-panel/components/shipping/order-shipment.module.css`
- Modify: `apps/customer-panel/components/shipping/OrderShipmentConsole.test.ts`
- Modify relevant shipping runtime files only if the test proves data projection is wrong.

**Interfaces:**
- Shipping UI must show operational shipping facts, not provider authority fields.
- Responsive layout must match accepted panel tokens.

- [ ] **Step 1: Reproduce**

```bash
node --experimental-transform-types --test apps/customer-panel/components/shipping/OrderShipmentConsole.test.ts
```

Expected: FAIL.

- [ ] **Step 2: Repair CSS/data projection**

Remove decorative shadows/cards where open-canvas contract forbids them. Hide provider authority internals from UI.

- [ ] **Step 3: Verify**

```bash
node --experimental-transform-types --test \
  apps/customer-panel/components/shipping/OrderShipmentConsole.test.ts \
  apps/customer-panel/components/shipping/ShippingSettingsConsole.test.ts \
  apps/customer-panel/lib/server-shipping/*.test.ts \
  apps/customer-panel/lib/shipping-http/*.test.ts \
  apps/customer-panel/lib/shipping-ui/*.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/customer-panel/components/shipping apps/customer-panel/lib/server-shipping apps/customer-panel/lib/shipping-http apps/customer-panel/lib/shipping-ui
git commit -m "fix(panel): stabilize shipping console contracts"
```

---

## Task 11: Admin Open Canvas and Analytics Visual Contracts

**Files:**
- Modify: `apps/customer-panel/lib/admin-open-canvas.test.ts` only if stale.
- Modify implicated CSS/components, likely:
  - `apps/customer-panel/components/analytics/analytics-dashboard.module.css`
  - `apps/customer-panel/components/analytics/panel-analytics.module.css`
  - page frame components under `apps/customer-panel/components/**`.

**Interfaces:**
- Core admin workspaces should not use decorative outer cards where the open-canvas contract expects flat layout.
- Mobile metric tabs must stay readable inside viewport.

- [ ] **Step 1: Reproduce**

```bash
node --experimental-transform-types --test \
  apps/customer-panel/lib/admin-open-canvas.test.ts \
  apps/customer-panel/lib/analytics-console.test.ts \
  apps/customer-panel/lib/analytics-ui/presentation.test.ts
```

Expected: FAIL.

- [ ] **Step 2: Repair visual contracts without weakening tests**

Use flat page-shell layout, preserve 48px target sizes, no horizontal overflow, no duplicate headings.

- [ ] **Step 3: Verify**

```bash
node --experimental-transform-types --test \
  apps/customer-panel/lib/admin-open-canvas.test.ts \
  apps/customer-panel/lib/analytics-console.test.ts \
  apps/customer-panel/lib/analytics-ui/presentation.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/customer-panel/components apps/customer-panel/lib/admin-open-canvas.test.ts apps/customer-panel/lib/analytics-*
git commit -m "fix(panel): restore open admin canvas contracts"
```

---

## Task 12: Final Regression, Build, Staging Deploy, and Live Smoke

**Files:**
- No planned source edits. This is verification only unless a previous task leaves a failure.

- [ ] **Step 1: Full customer-panel tests**

```bash
npm test --workspace @celebix/customer-panel
```

Expected: PASS.

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck --workspace @celebix/customer-panel
```

Expected: PASS.

- [ ] **Step 3: Build**

```bash
npm run build --workspace @celebix/customer-panel
```

Expected: PASS.

- [ ] **Step 4: Diff hygiene**

```bash
git diff --check
git status --short
```

Expected: no whitespace errors; only intentional changed files.

- [ ] **Step 5: Secret/authority scan**

```bash
git diff --cached --name-only | xargs rg -n "password|secret|token|cookie|pb1|PAYTR|merchant_key|merchant_salt" || true
```

Expected: no raw credential exposure.

- [ ] **Step 6: Commit final verification notes only if needed**

No commit if no source changed after prior task commits.

- [ ] **Step 7: Push**

```bash
git push
```

Expected: remote branch updated without force push.

- [ ] **Step 8: Deploy staging customer-panel only**

Use the existing Coolify customer-panel staging app. Do not deploy production, Owner, or storefront unless the customer-panel service definition requires exact SHA parity for its bundled storefront.

- [ ] **Step 9: Live smoke checklist**

Open Güzide staging as an authenticated user:

- `/` dashboard loads durable product/order/customer counts.
- `/products` loads product images.
- `/products/new` creates and archives one disposable draft product.
- `/products/categories` shows hierarchy without primary slug noise.
- `/products/brands` shows logo controls and linked product names.
- `/orders` loads.
- order detail opens.
- `/orders/abandoned-carts` shows product/customer identity where available.
- `/customers`, `/customers/new`, `/customers/tags`, `/customers/segments` load.
- `/settings/payment` shows PayTR truthful state.
- `/settings/design` saves/publishes category showcase.
- storefront loads without 503 after empty homepage sections.
- side-cart quantity respects selected amount and admin quantity toggle.

Expected: all smoke checks OK.

---

## Commit Boundary Summary

1. `test(panel): define working-system readiness baseline`
2. `fix(panel): repair product creation workflow`
3. `fix(panel): repair category and brand management`
4. `fix(panel): stabilize abandoned cart visibility`
5. `fix(panel): align payment settings with paytr runtime`
6. `fix(panel): repair durable dashboard facts`
7. `fix(panel): stabilize customer management routes`
8. `fix(panel): align admin navigation routes`
9. `fix(panel): make theme builder publish safe storefront sections`
10. `fix(panel): stabilize shipping console contracts`
11. `fix(panel): restore open admin canvas contracts`

## First Execution Priority

Start with Task 2, Product Create. It is the highest customer-impact broken workflow and also exercises route matrix, catalog API, idempotency, product projection, and storefront product visibility.

## Completion Report Format

Final report must include:

- branch and final SHA;
- commit map;
- full customer-panel test result;
- typecheck result;
- build result;
- live smoke result per feature area;
- deploy status;
- production impact: `0`;
- remaining known gaps, if any.
