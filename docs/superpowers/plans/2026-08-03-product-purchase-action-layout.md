# Product Purchase Action Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the standalone stock label and place the bounded quantity stepper before the two purchase actions without degrading mobile usability.

**Architecture:** Keep stock authority in `ProductPurchasePanel`'s existing `allowed` calculation, but remove its standalone presentation. Move the existing accessible stepper into the purchase action grid, use a three-column desktop layout, and switch to a two-row mobile layout where the stepper is left-aligned above two equal CTA columns.

**Tech Stack:** React 19, Next.js 16 App Router, TypeScript, CSS, Node test runner

## Global Constraints

- `available` and selected variant availability remain the only product availability authority.
- Quantity remains bounded to integers from 1 through 99.
- Add-to-cart still opens the canonical side cart; buy-now still routes to `/checkout`.
- Every quantity button remains at least 48×48 px.
- Mobile width 390 px has zero horizontal overflow and two equal CTA columns.
- Product media keeps `object-fit: contain`.
- No database, migration, contract, cart API, payment, admin, Owner, customer-panel, or production change.

---

### Task 1: Compose quantity and purchase actions as one responsive group

**Files:**
- Modify: `apps/storefront-shared/components/ProductPurchasePanel.test.ts:25-33`
- Modify: `apps/storefront-shared/components/ProductDetailExperience.test.ts:99-105`
- Modify: `apps/storefront-shared/components/ProductPurchasePanel.tsx:38-49`
- Modify: `apps/storefront-shared/app/globals.css:194-210, 467-520`

**Interfaces:**
- Consumes: `decrementPurchaseQuantity(value: number): number` and `incrementPurchaseQuantity(value: number): number`
- Preserves: `ProductPurchasePanel({ product, mobileSticky?, available })`
- Produces: `.purchase-actions` containing `.purchase-quantity` followed by the two canonical CTA buttons

- [ ] **Step 1: Write failing component and responsive CSS contract tests**

Replace the stock/stepper test in `ProductPurchasePanel.test.ts` with:

```ts
test("purchase panel keeps availability authoritative while composing the bounded stepper with actions", () => {
  assert.match(source, /const allowed = available &&/u);
  assert.match(source, /className="purchase-actions"><div className="purchase-quantity"/u);
  assert.match(source, /aria-label="Adedi azalt"/u);
  assert.match(source, /aria-label="Adedi artır"/u);
  assert.match(source, /decrementPurchaseQuantity/u);
  assert.match(source, /incrementPurchaseQuantity/u);
  assert.doesNotMatch(source, /purchase-stock/u);
  assert.doesNotMatch(source, /type="number"/u);
});
```

Replace the purchase-action CSS assertions in `ProductDetailExperience.test.ts` with:

```ts
  assert.match(globalStyles, /[.]purchase-actions\s*\{[^}]*grid-template-columns:\s*140px\s+repeat\(2,\s*minmax\(0,\s*1fr\)\)/u);
  const mobilePurchaseStyles = globalStyles.slice(globalStyles.indexOf("@media (max-width: 640px)"));
  assert.match(mobilePurchaseStyles, /[.]purchase-actions\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/u);
  assert.match(mobilePurchaseStyles, /[.]purchase-quantity\s*\{[^}]*grid-column:\s*1\s*\/\s*-1[^}]*justify-self:\s*start/u);
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
NODE_OPTIONS='--conditions=react-server' node --experimental-transform-types --test \
  apps/storefront-shared/components/ProductPurchasePanel.test.ts \
  apps/storefront-shared/components/ProductDetailExperience.test.ts
```

Expected: FAIL because `purchase-stock` still exists, the stepper is outside `.purchase-actions`, and desktop CSS still has two columns.

- [ ] **Step 3: Implement the minimal component structure**

Replace the standalone control row and action group with:

```tsx
    <div className="purchase-actions">
      <div className="purchase-quantity" aria-label="Adet seçimi">
        <button type="button" aria-label="Adedi azalt" disabled={pending !== null || quantity <= 1} onClick={() => setQuantity(decrementPurchaseQuantity)}>−</button>
        <output aria-live="polite" aria-label="Adet">{quantity}</output>
        <button type="button" aria-label="Adedi artır" disabled={pending !== null || quantity >= 99} onClick={() => setQuantity(incrementPurchaseQuantity)}>+</button>
      </div>
      <button className="store-button" type="button" disabled={pending !== null || !allowed} onClick={(event) => void run("add", event.currentTarget)}>{pending === "add" ? "Ekleniyor…" : "Sepete ekle"}</button>
      <button className="store-button store-button-secondary" type="button" disabled={pending !== null || !allowed} onClick={(event) => void run("buy", event.currentTarget)}>{pending === "buy" ? "Hazırlanıyor…" : "Şimdi satın al"}</button>
    </div>
```

Do not change `allowed`, `run`, the stepper handlers, or status handling.

- [ ] **Step 4: Implement the desktop and mobile CSS contract**

Remove `.purchase-control-row` and all `.purchase-stock*` rules. Use:

```css
.purchase-actions { display: grid; grid-template-columns: 140px repeat(2, minmax(0, 1fr)); align-items: stretch; gap: 12px; border-top: 1px solid var(--line); padding-top: 14px; }
.purchase-quantity { display: grid; overflow: hidden; grid-template-columns: 48px 42px 48px; min-height: 58px; border: 1px solid var(--line); background: var(--white); color: var(--ink); }
.purchase-quantity button, .purchase-quantity output { display: grid; min-width: 0; min-height: 58px; place-items: center; border: 0; background: transparent; color: inherit; font: inherit; }
```

Inside the existing `@media (max-width: 640px)` block add:

```css
  .purchase-actions { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .purchase-quantity { grid-column: 1 / -1; justify-self: start; }
```

- [ ] **Step 5: Run focused tests and verify GREEN**

Run the focused command from Step 2.

Expected: `10/10 PASS` with no failures.

- [ ] **Step 6: Run quantity and side-cart regressions**

Run:

```bash
NODE_OPTIONS='--conditions=react-server' node --experimental-transform-types --test \
  apps/storefront-shared/components/product-purchase-quantity.test.ts \
  apps/storefront-shared/components/SideCartDrawer.test.ts
```

Expected: all bounded quantity and canonical side-cart tests PASS.

- [ ] **Step 7: Commit the implementation**

```bash
git add \
  apps/storefront-shared/components/ProductPurchasePanel.test.ts \
  apps/storefront-shared/components/ProductDetailExperience.test.ts \
  apps/storefront-shared/components/ProductPurchasePanel.tsx \
  apps/storefront-shared/app/globals.css
git commit -m "fix(storefront): align quantity with purchase actions"
```

### Task 2: Verify, publish, and stage the exact storefront commit

**Files:**
- Verify only: all files changed by Task 1

**Interfaces:**
- Consumes: the exact Task 1 commit
- Produces: a pushed branch and an isolated Güzide storefront staging deployment from that exact SHA

- [ ] **Step 1: Run the complete storefront matrix**

```bash
npm test --workspace @celebix/storefront-shared
npm run typecheck --workspace @celebix/storefront-shared
npm run build --workspace @celebix/storefront-shared
git diff --check
```

Expected: `332/332` or the updated exact total PASS; typecheck, production build, and diff check exit `0`.

- [ ] **Step 2: Verify scope and secret hygiene**

```bash
git diff --name-only 2728021625f2be69c2111d3804f1b9cf5031842d...HEAD
git diff 2728021625f2be69c2111d3804f1b9cf5031842d...HEAD -- \
  apps/storefront-shared | rg -n "tenantId|storeId|credential|secret|token" || true
```

Expected: only the spec, plan, four Task 1 application/test files; no new browser authority or secret material.

- [ ] **Step 3: Push without force**

```bash
git push -u origin codex/starter-theme-purchase-layout
```

- [ ] **Step 4: Deploy only Güzide storefront staging**

Deploy the exact final SHA to Coolify application `vtc2aah63jbqnmtxmvykn6jl`. Do not deploy Owner, customer-panel, admin, production, or another storefront.

- [ ] **Step 5: Run live desktop and mobile acceptance**

At the canonical product URL verify:

- desktop: quantity stepper is left of the two equal CTA buttons on one row;
- 390×844: quantity is left-aligned above two equal CTA buttons;
- visible `Stokta` / `Tükendi` label is absent;
- horizontal overflow is `0`;
- quantity transitions `1 → 2 → 1` and cannot go below `1`;
- add-to-cart opens the canonical side cart;
- buy-now reaches `/checkout` from a clean cart;
- first product image remains `object-fit: contain`.

- [ ] **Step 6: Report exact evidence**

Report branch, final SHA, commit map, changed files, test totals, typecheck/build, live viewport measurements, deployment scope, and the live URL. Production impacts remain `0`.
