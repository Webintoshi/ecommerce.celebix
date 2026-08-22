# Customer Panel Remaining Pages Visual Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the established Celebix merchant-admin visual language to the first package of remaining admin pages without changing behavior or data flow.

**Architecture:** Keep existing React ownership, handlers, API calls, permission checks, and routes intact. Implement the refresh through existing CSS modules; add no logic and no new controls.

**Tech Stack:** Next.js App Router, React, TypeScript, CSS Modules, Lucide React.

## Global Constraints

- Modify only presentation files under `apps/customer-panel/**`.
- Do not change backend, API, database, migrations, authentication, payment, order logic, or storefront code.
- Do not add features, fields, actions, filters, metrics, routes, fake data, or store-specific behavior.
- Preserve existing handlers, links, payloads, permission checks, and form fields.
- Use `#FE6100` as the primary accent with neutral white surfaces, 6-8px radii, and minimal elevation.
- Verify desktop, 768px tablet, and 390px mobile layouts.
- Do not deploy unless separately directed.

---

### Task 1: Generic Merchant Module Lists and Editors

**Files:**
- Modify: `apps/customer-panel/components/merchant-admin/merchant-module-console.module.css`
- Inspect only: `apps/customer-panel/components/merchant-admin/MerchantModuleConsole.tsx`
- Inspect only: `apps/customer-panel/components/merchant-admin/MerchantRecordEditor.tsx`
- Test: `apps/customer-panel/lib/merchant-admin-console.test.ts`

**Interfaces:**
- Consumes: Existing class names emitted by the two merchant-admin components.
- Produces: Consistent list, toolbar, drawer, form, state, and responsive presentation for generic modules.

- [ ] **Step 1: Capture the behavioral boundary**

```bash
shasum -a 256 apps/customer-panel/components/merchant-admin/MerchantModuleConsole.tsx apps/customer-panel/components/merchant-admin/MerchantRecordEditor.tsx
```

- [ ] **Step 2: Implement the visual system**

Update only the CSS module. Required contract:

```css
.surface { min-width: 0; }
.metrics { border-radius: 8px; box-shadow: 0 1px 2px rgb(16 24 40 / 4%); }
.button, .primary, .danger { min-height: 42px; border-radius: 7px; }
.editor { border-left: 1px solid #e1e6ef; }
.form input, .form textarea, .form select { border-radius: 7px; }
```

Keep destructive controls red, primary controls orange, tables dense, and the editor responsive without nested decorative cards.

- [ ] **Step 3: Verify behavior files are untouched**

Repeat Step 1 and require identical hashes.

- [ ] **Step 4: Run focused validation**

```bash
NODE_OPTIONS='--conditions=react-server' node --experimental-transform-types --test apps/customer-panel/lib/merchant-admin-console.test.ts
npm run typecheck --workspace @celebix/customer-panel
```

Expected: tests and typecheck pass.

### Task 2: Catalog Resource Lists and Editors

**Files:**
- Modify: `apps/customer-panel/components/catalog-admin/catalog-admin-console.module.css`
- Inspect only: `apps/customer-panel/components/catalog-admin/CatalogResourceConsole.tsx`
- Inspect only: `apps/customer-panel/components/catalog-admin/CatalogResourceEditor.tsx`
- Inspect only: `apps/customer-panel/components/catalog-admin/ProductReviewConsole.tsx`
- Inspect only: `apps/customer-panel/components/catalog-admin/BarcodeLabelConsole.tsx`

**Interfaces:**
- Consumes: Existing resource list/editor markup and state classes.
- Produces: Unified collection, brand, attribute, extra, definition, tag, review, barcode, and import presentation.

- [ ] **Step 1: Capture the behavioral boundary**

```bash
shasum -a 256 apps/customer-panel/components/catalog-admin/CatalogResourceConsole.tsx apps/customer-panel/components/catalog-admin/CatalogResourceEditor.tsx apps/customer-panel/components/catalog-admin/ProductReviewConsole.tsx apps/customer-panel/components/catalog-admin/BarcodeLabelConsole.tsx
```

- [ ] **Step 2: Implement the catalog visual pass**

Required presentation contract:

```css
.form { gap: 16px; border: 1px solid #e1e6ef; border-radius: 8px; background: #fff; }
.item { min-height: 72px; border-bottom: 1px solid #e8edf4; }
.brandCard { border-radius: 8px; box-shadow: 0 1px 2px rgb(16 24 40 / 4%); }
.brandSearch { min-height: 44px; border-radius: 7px; box-shadow: none; }
.importSection { border-radius: 8px; box-shadow: 0 1px 2px rgb(16 24 40 / 4%); }
```

Keep resource data, controls, selections, uploads, and links unchanged. Remove gradient decoration from operational surfaces and prevent action overflow at 390px.

- [ ] **Step 3: Verify behavior files are untouched**

Repeat Step 1 and require identical hashes.

- [ ] **Step 4: Run focused validation**

```bash
npm run typecheck --workspace @celebix/customer-panel
```

Expected: typecheck passes.

### Task 3: Inventory and Pricing Operations

**Files:**
- Modify: `apps/customer-panel/components/inventory/inventory-console.module.css`
- Modify: `apps/customer-panel/components/pricing/price-list-console.module.css`
- Inspect only: `apps/customer-panel/components/inventory/InventoryCountConsole.tsx`
- Inspect only: `apps/customer-panel/components/inventory/InventoryTransferConsole.tsx`
- Inspect only: `apps/customer-panel/components/inventory/PurchasingConsole.tsx`
- Inspect only: `apps/customer-panel/components/pricing/PriceListConsole.tsx`

**Interfaces:**
- Consumes: Existing inventory and price-list class names.
- Produces: Consistent list, detail, and form hierarchy for purchasing, counts, transfers, locations, and price lists.

- [ ] **Step 1: Capture the behavioral boundary**

```bash
shasum -a 256 apps/customer-panel/components/inventory/InventoryCountConsole.tsx apps/customer-panel/components/inventory/InventoryTransferConsole.tsx apps/customer-panel/components/inventory/PurchasingConsole.tsx apps/customer-panel/components/pricing/PriceListConsole.tsx
```

- [ ] **Step 2: Normalize operational surfaces**

Use existing markup to establish this contract:

```css
.surface, .section { border: 1px solid #e1e6ef; border-radius: 8px; background: #fff; }
.button, .primary, .danger { min-height: 42px; border-radius: 7px; }
input, select, textarea { min-height: 44px; border-radius: 7px; }
@media (max-width: 700px) { .actions { width: 100%; } }
```

Do not alter inventory transitions, totals, quantities, permissions, parsing, or save behavior.

- [ ] **Step 3: Verify behavior files are untouched**

Repeat Step 1 and require identical hashes.

- [ ] **Step 4: Run focused validation**

```bash
npm run typecheck --workspace @celebix/customer-panel
```

Expected: typecheck passes.

### Task 4: Responsive Browser Smoke and Scope Review

**Files:**
- Verify: CSS modules modified in Tasks 1-3.
- Verify: no other application files are included.

**Interfaces:**
- Consumes: The completed visual package.
- Produces: Browser evidence and a frontend-only diff ready for review.

- [ ] **Step 1: Start the customer panel locally**

```bash
npm run dev --workspace @celebix/customer-panel
```

Expected: the Next.js server starts on its configured local port.

- [ ] **Step 2: Inspect representative routes**

Inspect `/discounts`, `/marketplaces`, `/accounting/invoicing-integration`, `/seo/products`, `/products/collections`, `/products/reviews`, `/products/inventory-counts`, and `/products/price-lists` at desktop, 768px, and 390px. Protected routes may redirect to login; use available local authenticated state only and do not modify live data.

- [ ] **Step 3: Check visual safety**

Require no horizontal page overflow, clipped labels, colliding actions, blank states, fatal console errors, or broken redirects.

- [ ] **Step 4: Verify frontend-only scope**

```bash
git diff --check
git diff --name-only
```

Expected: task-owned changes are limited to the design/plan documents and customer-panel CSS. Unrelated worktree changes remain unstaged and untouched.

- [ ] **Step 5: Commit the visual package**

```bash
git add apps/customer-panel/components/merchant-admin/merchant-module-console.module.css apps/customer-panel/components/catalog-admin/catalog-admin-console.module.css apps/customer-panel/components/inventory/inventory-console.module.css apps/customer-panel/components/pricing/price-list-console.module.css
git commit -m "feat(customer-panel): refresh remaining admin workspaces"
```
