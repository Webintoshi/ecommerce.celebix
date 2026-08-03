# Product Detail Stock, Quantity, and Gallery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move product availability into a minimalist purchase row, replace the native quantity input with an accessible bounded stepper, and show the primary product image without cropping.

**Architecture:** `ProductDetailExperience` keeps product authority and passes availability into `ProductPurchasePanel`. A small pure quantity model owns the 1–99 boundary behavior; the client component renders the stepper and keeps canonical cart operations unchanged. Gallery selection and zoom logic stay untouched while storefront CSS changes only the detail-gallery fit mode.

**Tech Stack:** Next.js App Router, React, TypeScript, CSS, Node test runner.

## Global Constraints

- `PublicProduct`, canonical cart operations, variant authority, and TenantContext behavior remain unchanged.
- Stock is rendered only inside the purchase panel, left of the quantity stepper.
- Quantity remains bounded to integers from 1 through 99.
- The two purchase CTAs remain equal-width and side-by-side.
- Main and mobile detail-gallery images use `object-fit: contain`; product cards and thumbnails retain their current crop behavior.
- No database, migration, Owner, admin, payment, infrastructure, or production change.

---

### Task 1: Accessible bounded quantity stepper and stock row

**Files:**
- Create: `apps/storefront-shared/components/product-purchase-quantity.ts`
- Create: `apps/storefront-shared/components/product-purchase-quantity.test.ts`
- Modify: `apps/storefront-shared/components/ProductPurchasePanel.tsx:1-44`
- Modify: `apps/storefront-shared/components/ProductDetailExperience.tsx:9-24`
- Modify: `apps/storefront-shared/components/ProductPurchasePanel.test.ts:1-30`
- Modify: `apps/storefront-shared/app/globals.css:183-200`

**Interfaces:**
- Produces: `clampPurchaseQuantity(value: number): number`
- Produces: `incrementPurchaseQuantity(value: number): number`
- Produces: `decrementPurchaseQuantity(value: number): number`
- Changes: `ProductPurchasePanel({ product, mobileSticky, available })`
- Consumes: `available={product.available}` from `ProductDetailExperience`

- [ ] **Step 1: Write failing quantity-boundary tests**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { clampPurchaseQuantity, decrementPurchaseQuantity, incrementPurchaseQuantity } from "./product-purchase-quantity.ts";

test("purchase quantity stays inside the one-to-ninety-nine boundary", () => {
  assert.equal(clampPurchaseQuantity(0), 1);
  assert.equal(clampPurchaseQuantity(100), 99);
  assert.equal(decrementPurchaseQuantity(1), 1);
  assert.equal(incrementPurchaseQuantity(99), 99);
});
```

- [ ] **Step 2: Run the new test and verify RED**

Run: `node --experimental-transform-types --test apps/storefront-shared/components/product-purchase-quantity.test.ts`

Expected: FAIL because `product-purchase-quantity.ts` does not exist.

- [ ] **Step 3: Add focused presentation assertions and verify RED**

Add assertions proving that `ProductPurchasePanel` receives `available`, renders `Stokta` / `Tükendi`, exposes `Adedi azalt` / `Adedi artır`, and no longer renders `type="number"`. Add an assertion in `ProductDetailExperience.test.ts` proving the standalone `styles.stock` element is gone.

Run: `NODE_OPTIONS='--conditions=react-server' node --experimental-transform-types --test apps/storefront-shared/components/ProductPurchasePanel.test.ts apps/storefront-shared/components/ProductDetailExperience.test.ts`

Expected: FAIL because the current native number input and standalone stock element still exist.

- [ ] **Step 4: Implement the pure bounded quantity model**

```ts
export const clampPurchaseQuantity = (value: number) => Math.max(1, Math.min(99, Math.trunc(Number.isFinite(value) ? value : 1)));
export const decrementPurchaseQuantity = (value: number) => clampPurchaseQuantity(value - 1);
export const incrementPurchaseQuantity = (value: number) => clampPurchaseQuantity(value + 1);
```

- [ ] **Step 5: Implement the minimal stock/stepper UI**

Replace the native quantity label with this structure while preserving `run`, `allowed`, pending handling, cart calls, and checkout routing:

```tsx
<div className="purchase-control-row">
  <span className={`purchase-stock${available ? " is-available" : ""}`}><i aria-hidden="true" />{available ? "Stokta" : "Tükendi"}</span>
  <div className="purchase-quantity" aria-label="Adet seçimi">
    <button type="button" aria-label="Adedi azalt" disabled={pending !== null || quantity <= 1} onClick={() => setQuantity(decrementPurchaseQuantity)}>−</button>
    <output aria-live="polite" aria-label="Adet">{quantity}</output>
    <button type="button" aria-label="Adedi artır" disabled={pending !== null || quantity >= 99} onClick={() => setQuantity(incrementPurchaseQuantity)}>+</button>
  </div>
</div>
```

Delete the standalone stock element from `ProductDetailExperience` and pass `available={product.available}` to `ProductPurchasePanel`.

- [ ] **Step 6: Add minimalist CSS**

Implement a border-top purchase row, compact green/red status, and a single bordered 48px-high stepper whose three controls have visible focus states. Keep `.purchase-actions` at `repeat(2, minmax(0, 1fr))`.

- [ ] **Step 7: Run focused tests and verify GREEN**

Run:

```bash
node --experimental-transform-types --test apps/storefront-shared/components/product-purchase-quantity.test.ts
NODE_OPTIONS='--conditions=react-server' node --experimental-transform-types --test apps/storefront-shared/components/ProductPurchasePanel.test.ts apps/storefront-shared/components/ProductDetailExperience.test.ts
```

Expected: quantity model and focused presentation tests PASS.

- [ ] **Step 8: Commit the working stock and quantity slice**

```bash
git add apps/storefront-shared/components/product-purchase-quantity.ts apps/storefront-shared/components/product-purchase-quantity.test.ts apps/storefront-shared/components/ProductPurchasePanel.tsx apps/storefront-shared/components/ProductDetailExperience.tsx apps/storefront-shared/components/ProductPurchasePanel.test.ts apps/storefront-shared/components/ProductDetailExperience.test.ts apps/storefront-shared/app/globals.css
git commit -m "fix(storefront): refine product purchase controls"
```

### Task 2: Uncropped detail-gallery presentation

**Files:**
- Modify: `apps/storefront-shared/components/ProductDetailExperience.test.ts:35-65`
- Modify: `apps/storefront-shared/app/globals.css:118-139,450-456`

**Interfaces:**
- Preserves: `ProductGallery({ product, style })`
- Changes only CSS rendering for `.gallery-main img` and `.gallery-mobile-track img`

- [ ] **Step 1: Write the failing gallery-fit assertions**

Extend the existing gallery test to require `object-fit: contain` for `.gallery-main img` and the mobile `.gallery-mobile-track img`, while requiring `.gallery-thumbnails img` and `.product-image-shell img` to remain `cover`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `NODE_OPTIONS='--conditions=react-server' node --experimental-transform-types --test apps/storefront-shared/components/ProductDetailExperience.test.ts`

Expected: FAIL because main and mobile detail images currently use `cover`.

- [ ] **Step 3: Implement the minimal CSS change**

```css
.gallery-main img { width: 100%; height: 100%; object-fit: contain; }

@media (max-width: 1024px) {
  .gallery-mobile-track img { width: 100%; height: auto; aspect-ratio: 1; object-fit: contain; background: var(--media-surface); }
}
```

Do not change `.gallery-thumbnails img` or `.product-image-shell img`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `NODE_OPTIONS='--conditions=react-server' node --experimental-transform-types --test apps/storefront-shared/components/ProductDetailExperience.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the gallery slice**

```bash
git add apps/storefront-shared/components/ProductDetailExperience.test.ts apps/storefront-shared/app/globals.css
git commit -m "fix(storefront): show complete product media"
```

### Task 3: Regression, delivery, and staging acceptance

**Files:**
- Verification only; no new source files.

**Interfaces:**
- Delivers the two implementation commits on `codex/starter-theme-product-detail-controls`.

- [ ] **Step 1: Run the complete storefront verification**

```bash
npm test --workspace @celebix/storefront-shared
npm run typecheck --workspace @celebix/storefront-shared
npm run build --workspace @celebix/storefront-shared
git diff --check
```

Expected: all commands PASS with no changed lockfile.

- [ ] **Step 2: Verify scope and security invariants**

```bash
git diff --name-only 7a2f4d6fe649836454761e3081c7a05755de102b...HEAD
git diff 7a2f4d6fe649836454761e3081c7a05755de102b...HEAD -- apps/storefront-shared | rg 'tenantId|storeId|localStorage|sessionStorage|credential|secret' || true
```

Expected: only the spec, plan, and listed storefront files changed; no new browser authority or secret handling.

- [ ] **Step 3: Push the feature branch**

```bash
git push -u origin codex/starter-theme-product-detail-controls
```

- [ ] **Step 4: Integrate into the staging source branch without force-push**

Merge the feature branch into the latest `codex/guzide-staging-integration` only after confirming it still contains deployed SHA `7a2f4d6`. Resolve no unrelated concurrent changes by deletion or reset.

- [ ] **Step 5: Redeploy only Güzide storefront staging**

Deploy the exact resulting integration SHA in Coolify application `vtc2aah63jbqnmtxmvykn6jl`. Do not deploy Owner, customer-panel, admin, production, or migrations.

- [ ] **Step 6: Run live desktop and mobile acceptance**

At the Güzide product URL verify:

- full primary image is visible without crop;
- stock status is left of the quantity stepper;
- `− 1 +` controls enforce 1–99;
- both CTAs remain equal and side-by-side on desktop;
- mobile controls remain reachable without horizontal overflow;
- cart drawer and buy-now checkout behavior still work.
