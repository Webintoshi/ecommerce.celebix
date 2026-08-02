# Admin Open Canvas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace decorative page-sized cards throughout the customer admin with a shared, responsive open canvas while preserving every live-data workflow and interactive control.

**Architecture:** `PanelPageShell` and `PanelPanel` establish the shared open-surface contract. Route CSS modules remove only page-level frames and mobile record cards; inputs, menus, dialogs, alerts, previews, metrics, badges, and other functional boundaries remain contained. Source-level contract tests protect the visual rule and existing component tests protect behavior.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.9, CSS Modules, Node test runner, Coolify.

## Global Constraints

- The fixed top bar is the only page-level identity; redundant body titles are removed.
- No customer-admin route wraps its entire working area in a decorative rounded card.
- Toolbars and data regions use spacing and `#E8EDF4`-class horizontal dividers instead of outer borders, radii, or shadows.
- Inputs, buttons, menus, dialogs, alerts, previews, compact metrics, and semantic badges retain necessary functional boundaries.
- Desktop tables remain tables; mobile records become full-width divider-based rows rather than cards.
- Backend APIs, live-data authority, tenant isolation, permissions, navigation, and workflow behavior do not change.
- Interactive targets remain at least 48 pixels high and keep existing labels and focus indicators.

---

### Task 1: Establish the shared open-canvas contract

**Files:**
- Create: `apps/customer-panel/lib/admin-open-canvas.test.ts`
- Modify: `apps/customer-panel/components/panel/PanelPageShell.tsx`
- Modify: `apps/customer-panel/components/panel/panel-shell.module.css`
- Test: `apps/customer-panel/lib/admin-open-canvas.test.ts`

**Interfaces:**
- Consumes: existing `PanelPageShell({ children })` and `PanelPanel({ children, title })` APIs.
- Produces: `data-panel-layout="open-canvas"` on page shells and `data-panel-surface="open"` on shared sections; public TypeScript signatures stay unchanged.

- [ ] **Step 1: Write the failing shared-surface test**

```ts
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROOT = new URL("../", import.meta.url);
const source = (path: string) => readFile(new URL(path, ROOT), "utf8");

function rule(css: string, selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  assert.ok(match, `missing CSS rule: ${selector}`);
  return match[1];
}

test("shared panel pages publish the open-canvas contract", async () => {
  const component = await source("components/panel/PanelPageShell.tsx");
  const css = await source("components/panel/panel-shell.module.css");
  assert.match(component, /data-panel-layout="open-canvas"/);
  assert.match(component, /data-panel-surface="open"/);
  assert.match(rule(css, ".panel"), /border:\s*0/);
  assert.match(rule(css, ".panel"), /border-radius:\s*0/);
  assert.match(rule(css, ".panel"), /background:\s*transparent/);
  assert.match(rule(css, ".panel"), /box-shadow:\s*none/);
});
```

- [ ] **Step 2: Run the test and verify the expected failure**

Run: `node --experimental-transform-types --test apps/customer-panel/lib/admin-open-canvas.test.ts`

Expected: FAIL because the attributes are absent and `.panel` is still boxed.

- [ ] **Step 3: Publish the shared contract**

```tsx
export function PanelPageShell({ children }: { children: ReactNode }) {
  return <section className={styles.pageShell} data-panel-layout="open-canvas">{children}</section>;
}

export function PanelPanel({ children, title }: { children: ReactNode; title?: string }) {
  return <section className={styles.panel} data-panel-surface="open">{title ? <h2>{title}</h2> : null}{children}</section>;
}
```

```css
.panel {
  min-width: 0;
  overflow: visible;
  border: 0;
  border-radius: 0;
  background: transparent;
  padding: 0 0 1.5rem;
  box-shadow: none;
}

.panel + .panel {
  border-top: 1px solid #E8EDF4;
  padding-top: 1.5rem;
}
```

- [ ] **Step 4: Run shared tests**

Run: `node --experimental-transform-types --test apps/customer-panel/lib/admin-open-canvas.test.ts apps/customer-panel/lib/panel-shell.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/customer-panel/lib/admin-open-canvas.test.ts apps/customer-panel/components/panel/PanelPageShell.tsx apps/customer-panel/components/panel/panel-shell.module.css
git commit -m "feat: add open admin canvas primitive"
```

---

### Task 2: Make orders the reference open-canvas route

**Files:**
- Modify: `apps/customer-panel/lib/order-console.test.ts`
- Modify: `apps/customer-panel/lib/admin-open-canvas.test.ts`
- Modify: `apps/customer-panel/components/orders/OrderListConsole.tsx`
- Modify: `apps/customer-panel/components/orders/order-console.module.css`
- Test: `apps/customer-panel/lib/order-console.test.ts`
- Test: `apps/customer-panel/lib/admin-open-canvas.test.ts`

**Interfaces:**
- Consumes: Task 1's page contract and existing `OrderListPresentationProps`.
- Produces: a direct-on-canvas toolbar/table and divider-based mobile rows; filtering, sorting, column selection, CSV, pagination, and routes stay unchanged.

- [ ] **Step 1: Add failing assertions**

```ts
test("order list omits the duplicate body heading", async () => {
  const text = await source("components/orders/OrderListConsole.tsx");
  assert.doesNotMatch(text, />Tüm Siparişler</);
  assert.match(text, /aria-label="Sipariş çalışma alanı"/);
});

test("orders use a flat workspace and mobile rows", async () => {
  const css = await source("components/orders/order-console.module.css");
  for (const declaration of [/border:\s*0/, /border-radius:\s*0/, /background:\s*transparent/, /box-shadow:\s*none/]) {
    assert.match(rule(css, ".listSurface"), declaration);
  }
  assert.match(rule(css, ".orderCard"), /border-bottom:\s*1px solid #E8EDF4/i);
  assert.match(rule(css, ".orderCard"), /border-radius:\s*0/);
});
```

- [ ] **Step 2: Verify failure**

Run: `node --experimental-transform-types --test apps/customer-panel/lib/order-console.test.ts apps/customer-panel/lib/admin-open-canvas.test.ts`

Expected: FAIL because `Tüm Siparişler` and the outer card remain.

- [ ] **Step 3: Remove duplicate body identity**

Replace the section opening and delete `surfaceHeading`:

```tsx
<section className={styles.listSurface} aria-label="Sipariş çalışma alanı" data-panel-surface="open">
  <form className={styles.toolbar} role="search" onSubmit={(event) => {
    event.preventDefault();
    props.onSearchSubmit?.();
  }}>
```

- [ ] **Step 4: Flatten desktop and mobile styles**

```css
.listSurface {
  min-width: 0;
  overflow: visible;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}
.toolbar { border-bottom: 1px solid #E8EDF4; background: transparent; padding: 0 0 1rem; }
.filterToolbar { border-bottom: 1px solid #E8EDF4; padding: 1rem 0; }
.orderCard {
  display: grid;
  gap: 1rem;
  border: 0;
  border-bottom: 1px solid #E8EDF4;
  border-radius: 0;
  background: transparent;
  padding: 1rem 0;
  box-shadow: none;
}
```

Preserve borders on controls, the column menu, buttons, and status badges.

- [ ] **Step 5: Run targeted tests and typecheck**

Run: `node --experimental-transform-types --test apps/customer-panel/lib/order-console.test.ts apps/customer-panel/lib/admin-open-canvas.test.ts`

Run: `npm run typecheck --workspace @celebix/customer-panel`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/customer-panel/lib/order-console.test.ts apps/customer-panel/lib/admin-open-canvas.test.ts apps/customer-panel/components/orders/OrderListConsole.tsx apps/customer-panel/components/orders/order-console.module.css
git commit -m "feat: flatten admin order workspace"
```

---

### Task 3: Flatten list and data workspaces

**Files:**
- Modify: `apps/customer-panel/lib/admin-open-canvas.test.ts`
- Modify: `apps/customer-panel/components/customers/customer-console.module.css`
- Modify: `apps/customer-panel/components/catalog-admin/catalog-admin-console.module.css`
- Modify: `apps/customer-panel/components/inventory/inventory-console.module.css`
- Modify: `apps/customer-panel/components/orders/abandoned-cart-console.module.css`
- Modify: `apps/customer-panel/components/orders/order-drafts.module.css`
- Modify: `apps/customer-panel/components/orders/quick-order-links.module.css`
- Modify: `apps/customer-panel/components/pricing/price-list-console.module.css`
- Modify: `apps/customer-panel/components/merchant-admin/merchant-module-console.module.css`
- Test: `apps/customer-panel/lib/admin-open-canvas.test.ts`
- Test: the existing customer, catalog, inventory, abandoned-cart, merchant-admin, and pricing console tests.

**Interfaces:**
- Consumes: existing route markup and CSS-module class names.
- Produces: flat outer surfaces and mobile rows for core data consoles; no TypeScript or API changes.

- [ ] **Step 1: Add a failing selector matrix**

```ts
const OPEN_SURFACES = Object.freeze([
  ["components/customers/customer-console.module.css", ".surface"],
  ["components/catalog-admin/catalog-admin-console.module.css", ".surface"],
  ["components/orders/abandoned-cart-console.module.css", ".surface"],
  ["components/orders/order-drafts.module.css", ".listSurface"],
  ["components/orders/quick-order-links.module.css", ".panel"],
  ["components/merchant-admin/merchant-module-console.module.css", ".surface"],
] as const);

test("core admin workspaces do not use decorative outer cards", async () => {
  for (const [path, selector] of OPEN_SURFACES) {
    const body = rule(await source(path), selector);
    assert.match(body, /border:\s*0/, `${path} ${selector}`);
    assert.match(body, /border-radius:\s*0/, `${path} ${selector}`);
    assert.match(body, /background:\s*transparent/, `${path} ${selector}`);
    assert.match(body, /box-shadow:\s*none/, `${path} ${selector}`);
  }
});
```

- [ ] **Step 2: Verify failure**

Run: `node --experimental-transform-types --test apps/customer-panel/lib/admin-open-canvas.test.ts`

Expected: FAIL on still-boxed selectors.

- [ ] **Step 3: Normalize outer surfaces**

For each matrix selector, retain layout declarations and replace decorative framing with:

```css
overflow: visible;
border: 0;
border-radius: 0;
background: transparent;
box-shadow: none;
```

Move outer padding to toolbar/section rows and use `border-bottom: 1px solid #E8EDF4` between controls and data. Do not alter alerts, upload targets, provider choices, dropdowns, dialogs, or previews.

- [ ] **Step 4: Flatten table wrappers and mobile records**

```css
.desktopTable { overflow-x: auto; border: 0; border-radius: 0; background: transparent; }
.mobileCard,
.cartCard {
  border: 0;
  border-bottom: 1px solid #E8EDF4;
  border-radius: 0;
  background: transparent;
  padding: 1rem 0;
  box-shadow: none;
}
```

Apply the same divider-row properties to each module's mobile-only record selector, but leave metric and navigation tiles intact.

- [ ] **Step 5: Run regression tests**

Run:

```bash
node --experimental-transform-types --test apps/customer-panel/lib/admin-open-canvas.test.ts apps/customer-panel/lib/customer-console.test.ts apps/customer-panel/lib/catalog-admin-console.test.ts apps/customer-panel/lib/inventory-console.test.ts apps/customer-panel/lib/abandoned-cart-console.test.ts apps/customer-panel/lib/merchant-admin-console.test.ts apps/customer-panel/lib/price-list-console.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/customer-panel/lib/admin-open-canvas.test.ts apps/customer-panel/components/customers/customer-console.module.css apps/customer-panel/components/catalog-admin/catalog-admin-console.module.css apps/customer-panel/components/inventory/inventory-console.module.css apps/customer-panel/components/orders/abandoned-cart-console.module.css apps/customer-panel/components/orders/order-drafts.module.css apps/customer-panel/components/orders/quick-order-links.module.css apps/customer-panel/components/pricing/price-list-console.module.css apps/customer-panel/components/merchant-admin/merchant-module-console.module.css
git commit -m "feat: flatten admin data workspaces"
```

---

### Task 4: Flatten page-sized detail, form, settings, and analytics frames

**Files:**
- Modify: `apps/customer-panel/lib/admin-open-canvas.test.ts`
- Modify: `apps/customer-panel/components/orders/order-console.module.css`
- Modify: `apps/customer-panel/components/orders/order-drafts.module.css`
- Modify: `apps/customer-panel/components/customers/customer-console.module.css`
- Modify: `apps/customer-panel/components/catalog-admin/catalog-admin-console.module.css`
- Modify: `apps/customer-panel/components/catalog-onboarding/product-onboarding.module.css`
- Modify: `apps/customer-panel/components/inventory/inventory-console.module.css`
- Modify: `apps/customer-panel/components/merchant-admin/merchant-module-console.module.css`
- Modify: `apps/customer-panel/components/settings/payment/payment-settings.module.css`
- Modify: `apps/customer-panel/components/analytics/panel-analytics.module.css`
- Test: existing order, customer, product-onboarding, payment-settings, and analytics console tests.

**Interfaces:**
- Consumes: the open-canvas contract and existing detail/form route markup.
- Produces: divider-based detail/form sections while functional warnings, previews, uploads, dialogs, and credential boundaries remain contained.

- [ ] **Step 1: Add failing page-frame assertions**

```ts
const OPEN_PAGE_FRAMES = Object.freeze([
  ["components/orders/order-console.module.css", ".detailHero"],
  ["components/orders/order-drafts.module.css", ".editorPanel"],
  ["components/customers/customer-console.module.css", ".form"],
  ["components/catalog-onboarding/product-onboarding.module.css", ".page"],
  ["components/settings/payment/payment-settings.module.css", ".methodsPanel"],
  ["components/analytics/panel-analytics.module.css", ".chart"],
] as const);
```

Test each selector for `border: 0`, `border-radius: 0`, `background: transparent`, and `box-shadow: none` with the shared `rule()` helper.

- [ ] **Step 2: Verify failure**

Run: `node --experimental-transform-types --test apps/customer-panel/lib/admin-open-canvas.test.ts`

Expected: FAIL because page-sized form/detail frames remain boxed.

- [ ] **Step 3: Flatten only page-sized frames**

```css
border: 0;
border-radius: 0;
background: transparent;
box-shadow: none;
```

Set outer horizontal padding to zero, preserve vertical spacing, and use a single top divider between true sections. On order details, separate the operation rail using spacing and one left divider on desktop or top divider on mobile.

- [ ] **Step 4: Preserve functional containment**

Retain the current borders/backgrounds for `.error`, `.warning`, `.success`, `.readOnlyNotice`, `.upload`, `.preview`, `.columnPicker > div`, `.editorLayer`, `.dialog`, `.drawer`, `.providerCard`, `.availabilityCard`, and `.checkoutPreview`. Preserve focus-ring shadows even where decorative action shadows are removed.

- [ ] **Step 5: Run regression tests and typecheck**

Run:

```bash
node --experimental-transform-types --test apps/customer-panel/lib/admin-open-canvas.test.ts apps/customer-panel/lib/order-console.test.ts apps/customer-panel/lib/customer-console.test.ts apps/customer-panel/lib/product-onboarding-console.test.ts apps/customer-panel/lib/payment-settings-console.test.ts apps/customer-panel/lib/analytics-console.test.ts
npm run typecheck --workspace @celebix/customer-panel
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/customer-panel/lib/admin-open-canvas.test.ts apps/customer-panel/components/orders/order-console.module.css apps/customer-panel/components/orders/order-drafts.module.css apps/customer-panel/components/customers/customer-console.module.css apps/customer-panel/components/catalog-admin/catalog-admin-console.module.css apps/customer-panel/components/catalog-onboarding/product-onboarding.module.css apps/customer-panel/components/inventory/inventory-console.module.css apps/customer-panel/components/merchant-admin/merchant-module-console.module.css apps/customer-panel/components/settings/payment/payment-settings.module.css apps/customer-panel/components/analytics/panel-analytics.module.css
git commit -m "feat: flatten admin form and detail pages"
```

---

### Task 5: Verify, publish, deploy, and inspect

**Files:**
- Modify only the exact source or CSS module responsible if verification exposes a regression.
- Test: all `@celebix/customer-panel` tests and Güzide Kuyumcu live routes.

**Interfaces:**
- Consumes: Tasks 1-4.
- Produces: a pushed and deployed customer-admin build verified at desktop and mobile widths.

- [ ] **Step 1: Run the complete verification suite**

```bash
git diff --check
npm test --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/customer-panel
npm run build:coolify:customer-panel
```

Expected: every command exits 0; only the existing intentional skip remains skipped.

- [ ] **Step 2: Audit the final change scope**

```bash
git diff --stat 21b30cb741a4eaddde31ae5e116d3ac0354c66f2..HEAD
git diff -- apps/customer-panel/components apps/customer-panel/lib/admin-open-canvas.test.ts
```

Expected: no API, database, authentication, or tenant-authority code changed.

- [ ] **Step 3: Push the tested branch**

Run: `git push origin codex/guzide-staging-integration`

Expected: remote HEAD equals tested local HEAD.

- [ ] **Step 4: Deploy the customer panel**

Use the configured Coolify API credentials to deploy customer application UUID `yk1h6d97z7ex0h74ok3zrj5c`, then poll until the exact pushed commit reports `finished` and no customer deployment is active or failed.

- [ ] **Step 5: Verify orders in a fresh browser session**

Open `https://guzide-kuyumcu-4.admin.saas-staging.celebix.site/orders`. Confirm the top bar is the only page identity; there is no outer rounded order card or `Tüm Siparişler`; toolbars and table align to the canvas; all controls and order links work; console/network show no new relevant errors.

- [ ] **Step 6: Verify representative desktop and mobile routes**

At desktop and a viewport no wider than 430 pixels, inspect `/products`, `/customers`, `/orders/abandoned-carts`, `/orders/quick-links`, `/settings/payment`, and `/analytics`. Confirm open route frames, divider-based mobile records, unclipped controls, and retained dialog/notice/preview boundaries.

- [ ] **Step 7: Compare screenshots**

Capture live orders and inspect it beside the user's anti-reference with the image viewer. Confirm hierarchy comes from alignment, spacing, and dividers and that the large rounded outer card is absent.

- [ ] **Step 8: Correct and redeploy only if verification fails**

For a discovered regression, add a failing targeted test, implement the smallest correction, rerun Step 1, commit the exact corrected files with `git commit -m "fix: polish open admin canvas"`, push, redeploy, and repeat browser verification until running and tested commits match.
