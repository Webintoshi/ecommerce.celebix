# Hemenaku Summary And Working Navigation Activation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every customer-panel “Genel bakış” presentation with “Özet” and expose every already-authority-backed merchant workflow—orders, quick orders, products, product creation, and setup—in one immutable desktop/drawer navigation model without exposing unsupported donor modules.

**Architecture:** `apps/customer-panel/lib/panel-ui/navigation.ts` remains the single immutable source for route labels, hrefs, icons, active-state selection, and topbar fallback titles. Desktop and drawer consume that model; the mobile dock retains its compact three-action geometry. The dashboard renders only PostgreSQL-backed catalog/order summaries and safe chrome data, removes unsupported-domain cards, and links only to real routes.

**Tech Stack:** Next.js App Router, React, TypeScript, Node test runner, lucide-react, existing customer-panel catalog/order/quick-link clients, PostgreSQL-backed TenantContext runtime.

## Global Constraints

- Approved design: `docs/superpowers/specs/2026-07-21-hemenaku-full-merchant-admin-parity-design.md`.
- Read-only donor: `apps/admin/**` at `fc6c5318b47f045a7cefcedc7612d5b10563ba32`; donor files remain byte-for-byte unchanged.
- Target application is only `apps/customer-panel`.
- No iframe, reverse proxy, `/api/admin/**`, Supabase, legacy auth, browser tenant/store authority, fake KPI, placeholder route, or unsupported navigation.
- Existing panel session, TenantContext, catalog, order, quick-link, setup, logout, and active-store behavior remain unchanged.
- No production deploy, credential mutation, merge, migration, or infrastructure change.
- Preserve and never stage the existing untracked `.codex-artifacts/` directory.

---

### Task 1: Activate the complete working navigation model and rename the root to Özet

**Files:**
- Modify: `apps/customer-panel/lib/panel-ui/navigation.ts:1-115`
- Modify: `apps/customer-panel/lib/panel-ui/navigation.test.ts:1-90`
- Modify: `apps/customer-panel/components/panel/PanelNavigation.tsx:1-100`
- Modify: `apps/customer-panel/components/panel/PanelMobileDock.tsx:1-60`
- Modify: `apps/customer-panel/lib/panel-shell.test.ts:610-690`
- Modify: `apps/customer-panel/lib/routes.test.ts:240-275`
- Modify: `tests/saas-phase3/quick-order-runtime/in-process.test.mjs:290-315`
- Modify: `tests/saas-phase3/quick-order-runtime/static-security.test.mjs:95-125`

**Interfaces:**
- Produces: `PanelNavigationHref = "/" | "/orders" | "/orders/quick-links" | "/products" | "/products/new" | "/setup"`.
- Produces: one `PANEL_NAVIGATION` tree in exact root order `Özet`, `Siparişler`, `Ürünler`, `Kurulum`.
- Produces: `PANEL_ROUTE_PRESENTATIONS.quickOrders.title === "Hızlı Siparişler"`.
- Consumes: strict `isPanelNavigationPathActive(pathname, href)` slash-boundary and malformed-path denial.

- [ ] **Step 1: Write focused failing navigation tests**

```ts
test("contains every and only currently working merchant destination", () => {
  const hrefs = PANEL_NAVIGATION.flatMap((item) => [
    item.href,
    ...(item.children ?? []).map((child) => child.href),
  ]);
  assert.deepEqual([...new Set(hrefs)], [
    "/", "/orders", "/orders/quick-links", "/products", "/products/new", "/setup",
  ]);
  assert.deepEqual(PANEL_NAVIGATION.map(({ label }) => label), [
    "Özet", "Siparişler", "Ürünler", "Kurulum",
  ]);
});

test("selects only the exact quick-order child", () => {
  assert.equal(isPanelNavigationPathActive("/orders/quick-links", "/orders/quick-links"), true);
  for (const pathname of [
    "/orders-evil", "/orders/quick-links-evil", "/orders/quick-links/child",
    "/orders%2Fquick-links", "/orders/quick-links?x=1",
    "/orders/quick-links#x", "/orders//quick-links",
  ]) assert.equal(isPanelNavigationPathActive(pathname, "/orders/quick-links"), false);
});
```

In `panel-shell.test.ts`, render `/orders/quick-links` and require its sole `aria-current="page"` link to be `{ href: "/orders/quick-links", label: "Hızlı Siparişler" }`. In route/runtime tests, replace only obsolete “hidden from navigation” assertions with the exact label and href; keep every unsupported-sibling and authority scan.

- [ ] **Step 2: Run RED**

```bash
node --experimental-transform-types --test \
  apps/customer-panel/lib/panel-ui/navigation.test.ts \
  apps/customer-panel/lib/panel-shell.test.ts \
  apps/customer-panel/lib/routes.test.ts \
  tests/saas-phase3/quick-order-runtime/in-process.test.mjs \
  tests/saas-phase3/quick-order-runtime/static-security.test.mjs
```

Expected: FAIL because the root is `Genel bakış`, quick links are excluded from `PanelNavigationHref`, and activation sentinels require the route to remain hidden.

- [ ] **Step 3: Implement the immutable navigation tree**

```ts
export type PanelNavigationHref =
  | "/" | "/orders" | "/orders/quick-links" | "/products" | "/products/new" | "/setup";

const ORDER_CHILDREN = Object.freeze<readonly PanelNavigationItem[]>([
  Object.freeze({ key: "all-orders", label: "Tüm Siparişler", href: "/orders", icon: "orders" }),
  Object.freeze({ key: "quick-orders", label: "Hızlı Siparişler", href: "/orders/quick-links", icon: "quick-orders" }),
]);

export const PANEL_NAVIGATION = Object.freeze<readonly PanelNavigationItem[]>([
  Object.freeze({ key: "summary", label: "Özet", href: "/", icon: "home" }),
  Object.freeze({ key: "orders", label: "Siparişler", href: "/orders", icon: "orders", children: ORDER_CHILDREN }),
  Object.freeze({ key: "catalog", label: "Ürünler", href: "/products", icon: "products", children: CATALOG_CHILDREN }),
  Object.freeze({ key: "setup", label: "Kurulum", href: "/setup", icon: "setup" }),
]);
```

Delete `PANEL_ORDER_NAVIGATION` and the dynamic splice. Add `quick-orders: Link2` to the icon map. Check exact `/orders/quick-links` before generic order-detail classification. Change the mobile root label from `Ana` to `Özet` and retain exactly `Özet`, `Ürünler`, `Menü`.

- [ ] **Step 4: Run GREEN**

Run Step 2. Expected: all focused tests PASS; unsupported donor siblings, private authority, secrets, and unsupported APIs remain absent.

- [ ] **Step 5: Commit**

```bash
git add apps/customer-panel/lib/panel-ui/navigation.ts \
  apps/customer-panel/lib/panel-ui/navigation.test.ts \
  apps/customer-panel/components/panel/PanelNavigation.tsx \
  apps/customer-panel/components/panel/PanelMobileDock.tsx \
  apps/customer-panel/lib/panel-shell.test.ts \
  apps/customer-panel/lib/routes.test.ts \
  tests/saas-phase3/quick-order-runtime/in-process.test.mjs \
  tests/saas-phase3/quick-order-runtime/static-security.test.mjs
git commit -m "feat(saas): activate complete working merchant navigation"
```

### Task 2: Make Özet truthful and remove unsupported dashboard placeholders

**Files:**
- Modify: `apps/customer-panel/lib/panel-ui/dashboard-model.ts:10-240`
- Modify: `apps/customer-panel/lib/panel-ui/dashboard-model.test.ts:1-150`
- Modify: `apps/customer-panel/components/dashboard/PanelDashboardHomeView.tsx:1-320`
- Modify: `apps/customer-panel/components/dashboard/panel-dashboard.module.css:45-195`
- Modify: `apps/customer-panel/lib/panel-shell.test.ts:1000-1140`
- Modify: `apps/customer-panel/components/PanelShell.tsx:1-35`

**Interfaces:**
- Produces: dashboard title literal `"Özet"`.
- Produces: action href union `"/orders" | "/orders/quick-links" | "/products" | "/products/new" | "/setup"`.
- Preserves: concurrent catalog/order summary loading and controlled unavailable states.
- Removes only unsupported analytics/customer/cart presentation; it does not claim those capabilities exist.

- [ ] **Step 1: Write failing Özet tests**

```ts
test("builds immutable Özet actions for real routes only", () => {
  const model = createMerchantDashboardViewModel(CHROME, readyAuthority(CATALOG, AS_OF), readyAuthority(ORDERS, AS_OF));
  assert.equal(model.title, "Özet");
  assert.deepEqual(model.actions, [
    { label: "Siparişleri yönet", href: "/orders" },
    { label: "Hızlı sipariş oluştur", href: "/orders/quick-links" },
    { label: "Ürünleri yönet", href: "/products" },
    { label: "Yeni ürün ekle", href: "/products/new" },
    { label: "Kurulumu gözden geçir", href: "/setup" },
  ]);
  assert.equal(Object.isFrozen(model.actions), true);
});
```

Update the rendered dashboard test to require persisted catalog/order metrics and all five action hrefs, while rejecting `unsupported-dashboard-title`, `Desteklenmiyor`, fabricated numeric fallbacks, `/api/admin`, tenant/store IDs, and raw credentials.

- [ ] **Step 2: Run RED**

```bash
node --experimental-transform-types --test \
  apps/customer-panel/lib/panel-ui/dashboard-model.test.ts \
  apps/customer-panel/lib/panel-shell.test.ts
```

Expected: FAIL because the title is `Genel bakış`, only three actions exist, and unsupported cards render.

- [ ] **Step 3: Implement truthful Özet**

```ts
const actions = Object.freeze([
  Object.freeze({ label: "Siparişleri yönet", href: "/orders" as const }),
  Object.freeze({ label: "Hızlı sipariş oluştur", href: "/orders/quick-links" as const }),
  Object.freeze({ label: "Ürünleri yönet", href: "/products" as const }),
  Object.freeze({ label: "Yeni ürün ekle", href: "/products/new" as const }),
  Object.freeze({ label: "Kurulumu gözden geçir", href: "/setup" as const }),
]);
```

Change dashboard title types and values to `Özet`. Remove `UNSUPPORTED_DOMAINS`, its dashboard section, and only the now-unused unsupported CSS. Preserve loading/error/ready behavior and never turn unavailable data into zero. Change the old source-only `PanelShell` root label to `Özet` without changing session/logout/store behavior.

- [ ] **Step 4: Run GREEN**

Run Step 2. Expected: PASS; every visible metric is catalog/order-backed and no unsupported placeholder or fake KPI remains.

- [ ] **Step 5: Commit**

```bash
git add apps/customer-panel/lib/panel-ui/dashboard-model.ts \
  apps/customer-panel/lib/panel-ui/dashboard-model.test.ts \
  apps/customer-panel/components/dashboard/PanelDashboardHomeView.tsx \
  apps/customer-panel/components/dashboard/panel-dashboard.module.css \
  apps/customer-panel/lib/panel-shell.test.ts \
  apps/customer-panel/components/PanelShell.tsx
git commit -m "feat(saas): replace overview with truthful summary"
```

### Task 3: Regression, security, accessibility, screenshot, and push gate

**Files:**
- Verify read-only: `apps/admin/**`
- Create untracked: `.codex-artifacts/hemenaku-working-navigation-summary-1440x1024.png`
- Create untracked: `.codex-artifacts/hemenaku-working-navigation-summary-390x844.png`

**Interfaces:**
- Consumes: Tasks 1-2.
- Produces: clean pushed branch plus untracked visual evidence; no deployment.

- [ ] **Step 1: Run regressions**

```bash
npm test --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/customer-panel
npm run build --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/owner
npm run build --workspace @celebix/owner
node --experimental-transform-types --test \
  tests/saas-phase3/order-management/in-process.test.mjs
node --experimental-transform-types --test \
  tests/saas-phase3/quick-order-runtime/in-process.test.mjs \
  tests/saas-phase3/quick-order-runtime/static-security.test.mjs \
  tests/saas-phase3/quick-order-runtime/isolated-staging-runner.test.mjs \
  tests/saas-phase3/quick-order-runtime/reconcile-cli.test.mjs
git diff --check
```

Expected: every suite PASS with no catalog, order, quick-link, session, TenantContext, Owner, or build regression.

- [ ] **Step 2: Run forbidden scans**

```bash
git diff --name-only HEAD~2..HEAD -- apps/admin
git diff HEAD~2..HEAD -- apps/customer-panel tests/saas-phase3 | rg -n \
  'TenantContext.*(?:prop|client)|storeId|tenantId|principalId|membershipId|/api/admin|supabase|localStorage|sessionStorage|document\.cookie|BEGIN (?:RSA|EC|OPENSSH) PRIVATE KEY|client_secret'
rg -n 'Genel bakış' apps/customer-panel
```

Expected: zero matches and `apps/admin/**` diff count 0.

- [ ] **Step 3: Verify local browser viewports**

Use the non-production local acceptance runtime at 1440×1024, 1025×768, 1024×768, 390×844, and 320×720. Expected: exact navigation, sole active child, zero horizontal overflow, minimum 48×48 targets, Escape/backdrop/button/swipe drawer closure, focus restoration, no dock overlap, CTA contrast at least 4.5:1, reduced-motion near `0.01ms`, and no console/network authority leak.

- [ ] **Step 4: Capture requested screenshots**

Capture the 1440×1024 Özet view and 390×844 open drawer under `.codex-artifacts/`; keep both untracked and show them using absolute paths.

- [ ] **Step 5: Push without rewriting history**

```bash
git status --short
git push origin codex/hemenaku-admin-presentation-transplant-implementation
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/codex/hemenaku-admin-presentation-transplant-implementation)"
```

Expected: only `.codex-artifacts/` is untracked; local/remote SHA parity exact; deployment and production impacts 0.

## Following Independent Subprojects

Continue the approved full-parity design with separate TDD plans in this exact order: abandoned carts; customers/segments; collections/attributes/reviews/extras/bulk import; discounts/lucky wheel; content; settings/administrators; marketing/analytics; marketplace/accounting/SEO; final navigation/dashboard parity. Each subproject creates persistent authority, repository, HTTP, UI, and security proof before its destination appears.
