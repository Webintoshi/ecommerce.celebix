# Side Cart Luxury Minimal Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing visually sparse side cart with the approved compact Luxury Minimal drawer while preserving all canonical cart, mutation, checkout and accessibility behavior.

**Architecture:** Keep `SideCartDrawer` as the only drawer and retain `CartStatusProvider`, `mutateSideCartLine` and the public cart presentation as existing authorities. Restructure only the drawer markup needed for hierarchy, then replace its isolated CSS block and extend the existing static behavior tests to pin the new semantics and responsive contract.

**Tech Stack:** Next.js 16, React 19, TypeScript 5.9, CSS, Node test runner.

## Global Constraints

- No new endpoint, dependency, local-storage authority, client-computed total or second cart implementation.
- Preserve replay-safe quantity/remove mutations and the single read-only recovery after failure.
- Preserve `cart.showQuantitySelector`, canonical checkout blockers, `/cart`, `/checkout`, focus trapping, Escape/backdrop close and trigger focus restoration.
- All interactive targets remain at least 48×48px.
- No production deployment is part of this implementation plan.

---

### Task 1: Pin the Luxury Minimal markup contract

**Files:**
- Modify: `apps/storefront-shared/components/SideCartDrawer.test.ts:47-91`
- Modify: `apps/storefront-shared/components/SideCartDrawer.tsx:47-77`

**Interfaces:**
- Consumes: `useCartStatus(): { cart, loading, unavailable, drawerOpen, closeDrawer, replaceCart, refresh }`, `mutateSideCartLine(...)`, `sideCartPresentation(presentation)`.
- Produces: the existing `SideCartDrawer({ presentation })` component with `side-cart-header-count`, `side-cart-line-price`, `side-cart-line-utility`, `side-cart-view-link` and the existing `campaign-side-cart-checkout` hooks.

- [ ] **Step 1: Add failing source-contract tests**

Add these assertions to `SideCartDrawer.test.ts`:

```ts
test("luxury-minimal side-cart uses compact hierarchy and one dominant checkout action", () => {
  assert.match(drawer, /<h2 id="side-cart-title">Sepetim<\/h2>/u);
  assert.match(drawer, /side-cart-header-count/u);
  assert.match(drawer, /\{cart[.]itemCount\} ürün/u);
  assert.match(drawer, /side-cart-line-utility/u);
  assert.match(drawer, /side-cart-line-price/u);
  assert.match(drawer, /side-cart-view-link/u);
  assert.match(drawer, /line[.]quantity > 1/u);
  assert.match(drawer, /className="store-button campaign-side-cart-checkout"/u);
  assert.doesNotMatch(drawer, /<span>SEPETİNİZ<\/span>|<h2 id="side-cart-title">Sepet özeti<\/h2>/u);
  assert.doesNotMatch(drawer, /store-button store-button-secondary" href="\/cart/u);
});
```

Extend the canonical-line test so both price values remain present in source but are assigned distinct hierarchy hooks:

```ts
assert.match(drawer, /side-cart-line-price/u);
assert.match(drawer, /side-cart-line-total/u);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
NODE_OPTIONS='--conditions=react-server' node --experimental-transform-types --test apps/storefront-shared/components/SideCartDrawer.test.ts
```

Expected: FAIL because `Sepetim`, `side-cart-header-count`, `side-cart-line-utility`, `side-cart-line-price` and `side-cart-view-link` are absent.

- [ ] **Step 3: Implement the minimal markup restructure**

Change the populated-cart header to derive its copy from the canonical item count:

```tsx
<header className="side-cart-header">
  <div>
    <h2 id="side-cart-title">Sepetim</h2>
    {cart ? <span className="side-cart-header-count">{cart.itemCount} ürün</span> : null}
  </div>
  <button ref={closeRef} type="button" aria-label="Sepeti kapat" onClick={closeDrawer}>×</button>
</header>
```

Inside each product line, keep the existing media link and replace the copy/control grouping with:

```tsx
<div className="side-cart-line-copy">
  <Link href={`/products/${line.slug}`} onClick={closeDrawer}>{line.title}</Link>
  {line.variantTitle ? <span>{line.variantTitle}</span> : null}
  <strong className="side-cart-line-price">{formatTry(line.unitPriceCents)}</strong>
  {line.available ? null : <em>Stok veya fiyat bilgisi değişti</em>}
  <div className="side-cart-line-utility">
    {campaignPresentation.showQuantitySelector
      ? <div className="side-cart-quantity" aria-label={`${line.title} adet`}>
          <button type="button" aria-label={`${line.title} adet azalt`} disabled={pending || line.quantity <= 1} onClick={() => void mutate(line, line.quantity - 1)}>−</button>
          <span>{line.quantity}</span>
          <button type="button" aria-label={`${line.title} adet artır`} disabled={pending || line.quantity >= 99} onClick={() => void mutate(line, line.quantity + 1)}>+</button>
        </div>
      : <span className="side-cart-quantity-copy">{line.quantity} adet</span>}
    <button className="side-cart-remove" type="button" disabled={pending} onClick={() => void mutate(line, null)}>Kaldır</button>
  </div>
</div>
```

Keep the canonical line total for multi-quantity lines, while avoiding a duplicate competing price when quantity is one:

```tsx
{line.quantity > 1 ? <strong className="side-cart-line-total">{formatTry(line.lineTotalCents)}</strong> : null}
```

```tsx
<div className="side-cart-actions">
  {checkoutBlockedByStock
    ? <span className="store-button campaign-side-cart-checkout is-disabled" aria-disabled="true">Ödemeye geç</span>
    : <Link className="store-button campaign-side-cart-checkout" href="/checkout" onClick={closeDrawer}>{configurationBlocked ? "Ödeme durumunu görüntüle" : "Ödemeye geç"}</Link>}
  <Link className="side-cart-view-link" href="/cart" onClick={closeDrawer}>Sepeti görüntüle</Link>
</div>
```

- [ ] **Step 4: Run focused component and mutation tests and verify GREEN**

Run:

```bash
NODE_OPTIONS='--conditions=react-server' node --experimental-transform-types --test apps/storefront-shared/components/SideCartDrawer.test.ts apps/storefront-shared/components/side-cart-mutation.test.ts
```

Expected: all focused tests PASS; mutation call counts and recovery strings remain unchanged.

- [ ] **Step 5: Commit Task 1**

```bash
git add apps/storefront-shared/components/SideCartDrawer.tsx apps/storefront-shared/components/SideCartDrawer.test.ts
git commit -m "refactor(storefront): simplify side cart hierarchy"
```

---

### Task 2: Implement the responsive Luxury Minimal visual system

**Files:**
- Modify: `apps/storefront-shared/components/SideCartDrawer.test.ts:62-69`
- Modify: `apps/storefront-shared/app/globals.css:238-287`
- Modify: `apps/storefront-shared/app/globals.css:634-641`

**Interfaces:**
- Consumes: the Task 1 class hooks and existing CSS variables `--white`, `--ink`, `--muted`, `--line`, `--media-surface`.
- Produces: a maximum 456px drawer, compact line cards, two-line titles, same-row utility controls, sticky summary, full-width checkout action and secondary cart link.

- [ ] **Step 1: Add failing visual-contract assertions**

Extend the responsive test with exact invariants:

```ts
assert.match(css, /[.]campaign-side-cart \{[^}]*width:\s*min\(456px, 100%\)/u);
assert.match(css, /[.]side-cart-line-copy > a \{[^}]*-webkit-line-clamp:\s*2/u);
assert.match(css, /[.]side-cart-line-utility \{[^}]*display:\s*flex/u);
assert.match(css, /[.]side-cart-actions \{[^}]*grid-template-columns:\s*1fr/u);
assert.match(css, /[.]side-cart-view-link \{[^}]*min-height:\s*48px/u);
assert.match(css, /[.]side-cart-footer \{[^}]*env\(safe-area-inset-bottom\)/u);
assert.match(css, /@media \(max-width:\s*480px\)[\s\S]+[.]side-cart-line \{[^}]*grid-template-columns:\s*80px minmax\(0, 1fr\)/u);
```

Replace the obsolete assertion requiring the product-title link itself to have a 48px minimum height with assertions for actual interactive controls:

```ts
assert.match(css, /[.]side-cart-header button \{[^}]*min-height:\s*48px/u);
assert.match(css, /[.]side-cart-quantity button \{[^}]*min-height:\s*48px/u);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
NODE_OPTIONS='--conditions=react-server' node --experimental-transform-types --test apps/storefront-shared/components/SideCartDrawer.test.ts
```

Expected: FAIL because the drawer is 430px, the title is one-line clipped, actions are two columns and the new utility/view-link rules do not exist.

- [ ] **Step 3: Replace only the side-cart CSS block**

Implement these layout values while preserving existing animation names and reduced-motion override:

```css
.side-cart-dialog { display: grid; width: min(456px, 100%); height: 100dvh; grid-template-rows: auto minmax(0, 1fr) auto; overflow: hidden; background: var(--white); box-shadow: -18px 0 52px rgb(0 0 0 / 12%); animation: side-cart-enter .26s cubic-bezier(.2, .75, .2, 1) both; }
.campaign-side-cart { width: min(456px, 100%); }
.side-cart-header { display: flex; min-height: 72px; align-items: center; justify-content: space-between; gap: 16px; border-bottom: 1px solid color-mix(in srgb, var(--line) 72%, transparent); padding: 12px 24px; }
.side-cart-header > div { display: flex; align-items: baseline; gap: 10px; }
.side-cart-header h2 { margin: 0; font-family: inherit; font-size: 22px; font-weight: 700; letter-spacing: -.035em; }
.side-cart-header-count { color: var(--muted); font-size: 11px; font-weight: 600; }
.side-cart-lines { min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 0 24px 20px; }
.side-cart-line { display: grid; grid-template-columns: 96px minmax(0, 1fr) auto; align-items: start; gap: 16px; border-bottom: 1px solid var(--line); padding-block: 20px; }
.side-cart-media { display: grid; width: 96px; height: 112px; overflow: hidden; place-items: center; border-radius: 10px; background: var(--media-surface); color: var(--muted); }
.side-cart-line-copy { display: grid; min-width: 0; align-content: start; gap: 4px; }
.side-cart-line-copy > a { display: -webkit-box; overflow: hidden; font-size: 14px; font-weight: 700; line-height: 1.35; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.side-cart-line-price { font-size: 12px; }
.side-cart-line-total { padding-top: 2px; font-size: 13px; white-space: nowrap; }
.side-cart-line-utility { display: flex; min-width: 0; align-items: center; gap: 10px; margin-top: 8px; }
.side-cart-quantity { display: grid; width: 132px; min-height: 48px; grid-template-columns: 48px 36px 48px; align-items: center; margin: 0; border: 1px solid var(--line); border-radius: 999px; background: var(--white); text-align: center; }
.side-cart-remove { min-width: 48px; min-height: 48px; border: 0; background: transparent; padding: 0 4px; color: var(--muted); cursor: pointer; font-size: 11px; text-decoration: underline; text-underline-offset: 4px; }
.side-cart-footer { display: grid; gap: 12px; border-top: 1px solid var(--line); background: var(--white); padding: 18px 24px max(18px, env(safe-area-inset-bottom)); box-shadow: 0 -12px 30px rgb(0 0 0 / 4%); }
.side-cart-actions { display: grid; grid-template-columns: 1fr; gap: 2px; }
.side-cart-actions .store-button { width: 100%; min-height: 54px; }
.side-cart-view-link { display: flex; min-height: 48px; align-items: center; justify-content: center; color: var(--muted); font-size: 11px; font-weight: 700; text-decoration: underline; text-underline-offset: 4px; }
```

Add the narrow-screen adjustments without changing other storefront breakpoints:

```css
@media (max-width: 480px) {
  .side-cart-header, .side-cart-lines, .side-cart-footer { padding-inline: 18px; }
  .side-cart-line { grid-template-columns: 80px minmax(0, 1fr); gap: 13px; }
  .side-cart-media { width: 80px; height: 96px; }
  .side-cart-line-total { grid-column: 2; grid-row: 2; justify-self: start; }
  .side-cart-line-utility { flex-wrap: wrap; }
}
```

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
NODE_OPTIONS='--conditions=react-server' node --experimental-transform-types --test apps/storefront-shared/components/SideCartDrawer.test.ts apps/storefront-shared/components/side-cart-mutation.test.ts
```

Expected: all focused tests PASS, including 456px width, two-line titles, 48px controls, safe area and mobile grid.

- [ ] **Step 5: Run workspace verification**

Run:

```bash
npm test --workspace @celebix/storefront-shared
npm run typecheck --workspace @celebix/storefront-shared
npm run build --workspace @celebix/storefront-shared
git diff --check
```

Expected: storefront test suite PASS, typecheck PASS, production build PASS and `git diff --check` has no output.

- [ ] **Step 6: Commit Task 2**

```bash
git add apps/storefront-shared/app/globals.css apps/storefront-shared/components/SideCartDrawer.test.ts
git commit -m "style(storefront): modernize side cart drawer"
```

---

### Task 3: Local rendered acceptance

**Files:**
- Verify only: `apps/storefront-shared/components/SideCartDrawer.tsx`
- Verify only: `apps/storefront-shared/app/globals.css`

**Interfaces:**
- Consumes: the built storefront and an existing non-production cart flow.
- Produces: screenshot evidence and measurements; no tracked artifact or production mutation.

- [ ] **Step 1: Start the storefront locally with existing safe development inputs**

Run the repository's existing storefront development command without adding secrets or tracked environment files:

```bash
npm run dev --workspace @celebix/storefront-shared
```

Expected: Next.js reports the local storefront URL and no compile error.

- [ ] **Step 2: Verify desktop and mobile drawer behavior**

At 1440×900, 390×844 and 320×720 verify:

- the line starts directly below the compact header;
- the product title wraps to at most two lines;
- quantity and remove controls share the utility row;
- checkout is full-width and visually dominant;
- `Sepeti görüntüle` is secondary;
- the footer does not cover the final line;
- horizontal overflow is exactly zero;
- close, quantity and checkout targets are at least 48×48px.

- [ ] **Step 3: Verify interaction and accessibility**

Use the browser to verify one increment sends one mutation, canonical totals refresh, remove still works, Escape/backdrop closes, focus returns to the cart trigger, Tab remains trapped and reduced-motion uses the existing `.01ms` override.

- [ ] **Step 4: Record final repository proof**

Run:

```bash
git status --short
git log -3 --oneline
git diff --check HEAD~2...HEAD
```

Expected: only the pre-existing untracked `.superpowers/` remains; the two implementation commits follow the design/plan commits; diff check passes.
