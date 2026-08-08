# Simple Storefront Media and Quantity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make storefront media upload understandable through visual usage/ratio choices and make the published quantity-selector decision remove the single-product stepper.

**Architecture:** Keep the existing R2/API/contract authority unchanged. Add a pure client model for allowed ratios and dimension matching, consume it from `StorefrontAssetManager`, and pass the existing published cart visibility boolean through the product page into `ProductPurchasePanel`.

**Tech Stack:** TypeScript 5.9, React 19, Next.js 16, CSS Modules, Node test runner, existing Chromium acceptance harness.

## Global Constraints

- Do not add dependencies, migrations, asset fields, browser tenant authority, or new upload form keys.
- Preserve exact upload form authority: `file`, `kind`, `altText`.
- Supported ratios are `1:1`, `3:4`, `4:5`, `16:9` with 2% matching tolerance.
- `showQuantitySelector` remains the only persisted quantity visibility authority.
- Do not deploy production.

---

### Task 1: Pure storefront media guidance model

**Files:**
- Create: `apps/customer-panel/lib/storefront-asset-upload-model.ts`
- Test: `apps/customer-panel/lib/storefront-asset-upload-model.test.ts`

**Interfaces:**
- Produces: `storefrontAssetRatioOptions(kind: StorefrontAssetKind): readonly StorefrontAssetRatioOption[]`
- Produces: `storefrontAssetRatioMatches(width: number, height: number, ratio: StorefrontAssetRatio): boolean`
- Produces: `storefrontAssetRatioLabel(width: number, height: number): string`

- [x] **Step 1: Write failing model tests**

Use literal expectations proving kind-specific choices, `896×1195 → 3:4`, correct tolerance, invalid dimensions, and `Özel oran` fallback.

- [x] **Step 2: Verify RED**

Run: `node --experimental-transform-types --test apps/customer-panel/lib/storefront-asset-upload-model.test.ts`

Expected: FAIL because the module does not exist.

- [x] **Step 3: Implement the immutable ratio model**

Define exact frozen options and compare `width / height` against the selected ratio's literal numeric value with `Math.abs(actual - expected) / expected <= 0.02`.

- [x] **Step 4: Verify GREEN**

Run the focused model test and expect all cases PASS.

### Task 2: Child-friendly storefront asset manager

**Files:**
- Modify: `apps/customer-panel/components/settings/StorefrontAssetManager.tsx`
- Modify: `apps/customer-panel/components/settings/storefront-asset-manager.module.css`
- Modify: `apps/customer-panel/components/settings/StorefrontAssetManager.test.ts`

**Interfaces:**
- Consumes: Task 1 ratio helpers.
- Preserves: POST `/api/storefront-assets` with exact three multipart keys.

- [x] **Step 1: Write failing UI behavior/static contract tests**

Require `Nerede kullanacaksınız?`, `Görsel şekli`, `Görseli seçin`, visual pressed buttons, preview state, ratio mismatch blocking, friendly alt copy, and natural-ratio asset cards.

- [x] **Step 2: Verify RED**

Run: `node --experimental-transform-types --test apps/customer-panel/components/settings/StorefrontAssetManager.test.ts`

Expected: FAIL on the old select/file-row UI.

- [x] **Step 3: Implement the three-step upload surface**

Use module-level frozen usage choices, controlled kind/ratio/file state, one object URL with effect cleanup, decoded image dimensions, and submit-time fail-closed ratio validation. Keep hidden named inputs for the exact existing multipart contract.

- [x] **Step 4: Implement responsive natural-ratio cards**

Use a visual option grid, ratio silhouettes, a custom 48px file target, inline `aspectRatio: width / height`, `object-fit: contain`, and a visible ratio badge. Preserve keyboard focus and reduced motion.

- [x] **Step 5: Verify GREEN**

Run focused model and component tests and expect PASS.

### Task 3: Published product quantity visibility

**Files:**
- Modify: `apps/customer-panel/components/settings/StarterThemeComposer.tsx`
- Modify: `apps/customer-panel/components/settings/StarterThemePreview.tsx`
- Modify: `apps/customer-panel/components/settings/StarterThemeComposer.test.ts`
- Modify: `apps/storefront-shared/app/products/[slug]/page.tsx`
- Modify: `apps/storefront-shared/components/ProductDetailExperience.tsx`
- Modify: `apps/storefront-shared/components/ProductPurchasePanel.tsx`
- Modify: `apps/storefront-shared/components/ProductPurchasePanel.test.ts`
- Modify: `apps/storefront-shared/app/globals.css`
- Modify: `tests/saas-phase3/starter-retail-experience/browser-acceptance.mjs`

**Interfaces:**
- `ProductDetailExperience(..., showQuantitySelector: boolean)`
- `ProductPurchasePanel({ ..., showQuantitySelector?: boolean })`

- [x] **Step 1: Extend the hidden-quantity acceptance and focused tests**

Before adding the hidden presentation product to cart, assert `document.querySelectorAll('.purchase-quantity').length === 0`; require the page to pass `presentation.cart.showQuantitySelector`; require the panel to conditionally render the stepper and retain quantity `1` when hidden.

- [x] **Step 2: Verify RED**

Run the focused storefront component tests. Expected: FAIL because the setting never reaches `ProductPurchasePanel`.

- [x] **Step 3: Wire the existing authority and simplify admin placement**

Pass the boolean from the published presentation through the page and experience. Render `purchase-quantity` only when enabled, add an `is-quantity-hidden` row class, move the single admin checkbox into the product panel, and remove the duplicate cart control.

- [x] **Step 4: Verify GREEN**

Run focused customer-panel/storefront tests and the starter retail browser acceptance harness; expect both enabled and disabled flows PASS.

### Task 4: Regression and commit

**Files:**
- Verify the files above plus the approved spec/plan only.

- [x] **Step 1: Run regressions**

```bash
npm test --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/customer-panel
npm run build --workspace @celebix/customer-panel
npm test --workspace @celebix/storefront-shared
npm run typecheck --workspace @celebix/storefront-shared
npm run build --workspace @celebix/storefront-shared
git diff --check
```

- [x] **Step 2: Run rendered QA**

Use the Browser plugin on the exact local design and product routes. Verify desktop and mobile layout, ratio selection/file mismatch, hidden quantity controls, no framework overlay, and clean relevant console output. If Browser invocation fails, report the blocker and use the already-authorized existing Chromium acceptance harness as fallback.

- [x] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-08-08-simple-storefront-media-and-quantity-design.md docs/superpowers/plans/2026-08-08-simple-storefront-media-and-quantity.md apps/customer-panel/lib/storefront-asset-upload-model.ts apps/customer-panel/lib/storefront-asset-upload-model.test.ts apps/customer-panel/components/settings/StorefrontAssetManager.tsx apps/customer-panel/components/settings/storefront-asset-manager.module.css apps/customer-panel/components/settings/StorefrontAssetManager.test.ts apps/customer-panel/components/settings/StarterThemeComposer.tsx apps/customer-panel/components/settings/StarterThemePreview.tsx apps/customer-panel/components/settings/StarterThemeComposer.test.ts apps/storefront-shared/app/products/[slug]/page.tsx apps/storefront-shared/components/ProductDetailExperience.tsx apps/storefront-shared/components/ProductPurchasePanel.tsx apps/storefront-shared/components/ProductPurchasePanel.test.ts apps/storefront-shared/app/globals.css tests/saas-phase3/starter-retail-experience/browser-acceptance.mjs
git commit -m "feat(storefront): simplify media and quantity controls"
```
