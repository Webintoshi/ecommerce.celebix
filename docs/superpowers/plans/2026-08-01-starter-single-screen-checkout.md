# Starter Single-Screen Checkout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Starter theme's two-step checkout with a premium white single-screen checkout while preserving durable PostgreSQL cart and payment authority.

**Architecture:** `CheckoutForm` remains the only client coordinator and continues consuming `PublicCheckoutQuote` from the existing same-origin cart client. The redesign removes browser step authority, renders delivery and server-returned payment methods together, and keeps terminal submission guarded by exact quote readiness, form validity, selected returned method, cart version, and stable operation ID. `CheckoutSummary` stays a pure projection and the side cart keeps the finite blocker truthful.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.9, Node test runner, existing `@celebix/saas-contracts` public cart contracts, CSS.

## Global Constraints

- Exact `/checkout` uses `#ffffff`; the rest of the Starter theme keeps its current surface.
- Contact, delivery, shipping, payment, order summary, and terminal action render on one page.
- PostgreSQL quote and persisted store configuration remain the only price, stock, shipping, and payment authority.
- No card data is collected inside Celebix; hosted/3-D Secure provider boundaries remain unchanged.
- No legacy Supabase, old storefront API, local-storage cart authority, coupon implementation, dependency, migration, contract, repository, Owner, customer-panel, infrastructure, or production change.
- Missing payment remains `payment_unavailable`; it never creates a fake payment method or order.
- `apps/storefront-base/app/odeme/page.tsx` is a read-only visual donor.
- `apps/admin/**` remains unchanged.

---

## File Map

- `apps/storefront-shared/components/CheckoutForm.tsx` — single-screen form coordinator and terminal submission guard.
- `apps/storefront-shared/components/CheckoutForm.test.ts` — source-level contract regression for the existing test stack.
- `apps/storefront-shared/components/CheckoutSummary.tsx` — canonical product-media and totals projection.
- `apps/storefront-shared/components/SideCartDrawer.tsx` — compact truthful configuration notice.
- `apps/storefront-shared/app/checkout/page.tsx` — exact white checkout page shell.
- `apps/storefront-shared/app/globals.css` — checkout-scoped desktop/mobile/accessibility presentation.
- `apps/storefront-shared/components/SideCartDrawer.test.ts` — side-cart blocker and target regressions.
- `apps/storefront-shared/lib/storefront-app.test.ts` — public checkout shell/static-security regression when required by the changed markup.

### Task 1: Single-screen checkout behavior

**Files:**
- Modify: `apps/storefront-shared/components/CheckoutForm.test.ts:1-48`
- Modify: `apps/storefront-shared/components/CheckoutForm.tsx:1-75`

**Interfaces:**
- Consumes: `storefrontCartClient.quote(intentKind)`, `validateCheckoutFormDraft(draft)`, `PublicCheckoutQuote`, `checkoutBlockerMessage`, and the existing `/api/checkout/complete` contract.
- Produces: `CheckoutForm({ intentKind }: Readonly<{ intentKind: CheckoutIntentKind }>): JSX.Element` with no step switch and exactly one terminal submit.

- [ ] **Step 1: Replace the stale two-step test with a failing single-screen contract test**

Add literal assertions which would fail if delivery and payment become mutually exclusive again:

```ts
test("checkout renders delivery and server-projected payment on one screen", () => {
  for (const proof of [
    'className="checkout-section checkout-contact"',
    'className="checkout-section checkout-delivery"',
    'className="checkout-section checkout-shipping"',
    'className="checkout-section checkout-payment"',
    "paymentMethods",
    "validateCheckoutFormDraft",
    "Siparişi tamamla",
  ]) assert.match(form, new RegExp(proof, "u"));
  assert.doesNotMatch(form, /setStep|step ===|Teslimata dön|Ödemeye devam et/u);
  for (const field of ["name", "email", "phone", "addressLine1", "city", "district", "postalCode", "note"])
    assert.equal(form.includes(`name="${field}"`), true, field);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
cd apps/storefront-shared
node --experimental-transform-types --test components/CheckoutForm.test.ts
```

Expected: FAIL because the form still contains `step`, `setStep`, “Ödemeye devam et”, and no four simultaneous section classes.

- [ ] **Step 3: Remove step authority and make terminal submit validate the whole screen**

Delete `delivery` and `step` state. Add a form ref and one bounded focus helper:

```tsx
const formRef = useRef<HTMLFormElement>(null);

function focusFirstInvalidField(errors: Readonly<Record<string, string>>): void {
  const name = Object.keys(errors)[0];
  if (!name) return;
  requestAnimationFrame(() => {
    formRef.current?.querySelector<HTMLElement>(`[name="${CSS.escape(name)}"]`)?.focus();
  });
}
```

Replace the beginning of `submit` with one terminal guard:

```tsx
setAttemptedDelivery(true);
if (!validation.ok) {
  setStatus("Lütfen teslimat bilgilerini kontrol edin.");
  focusFirstInvalidField(validation.errors);
  return;
}
const selectedMethod = quote?.paymentMethods.find(({ kind }) => kind === paymentKind);
if (!quote?.cart.checkoutReady || !selectedMethod) {
  setStatus(checkoutBlockerMessage(quote?.cart.checkoutBlocker ?? null) ?? "Sipariş şu anda tamamlanamıyor.");
  return;
}
const delivery = validation.value;
```

Keep the existing exact request body, stable `operation.current`, response-origin/path validation, and success navigation unchanged.

- [ ] **Step 4: Render all sections and the final action together**

The returned structure must have one form and no conditional step branch:

```tsx
<form ref={formRef} className="checkout-form checkout-layout checkout-single-screen" onSubmit={(event) => void submit(event)} noValidate>
  <div className="checkout-form-main">
    <section className="checkout-section checkout-contact" aria-labelledby="checkout-contact-title">...</section>
    <section className="checkout-section checkout-delivery" aria-labelledby="checkout-delivery-title">...</section>
    <section className="checkout-section checkout-shipping" aria-labelledby="checkout-shipping-title">...</section>
    <section className="checkout-section checkout-payment" aria-labelledby="checkout-payment-title">
      <div className="payment-methods">{quote?.paymentMethods.map(/* existing exact returned method */)}</div>
      {quote?.paymentMethods.length ? null : <p className="checkout-unavailable">Etkin bir ödeme yöntemi bulunamadı.</p>}
    </section>
  </div>
  {quote ? <CheckoutSummary summary={quote.cart} /> : <aside className="checkout-summary" aria-busy="true">...</aside>}
  <footer className="checkout-terminal">
    <p className="checkout-status" aria-live="polite">{status}</p>
    <button className="store-button checkout-submit" type="submit"
      disabled={pending || !quote?.cart.checkoutReady || !paymentKind}>
      {pending ? "Oluşturuluyor…" : "Siparişi tamamla"}
    </button>
  </footer>
</form>
```

`checkout-shipping` labels the existing fixed `standard` command as “Standart teslimat” and displays only quote-projected shipping cost/readiness; it does not add a browser-authored method. The grid orders mobile content as form sections → canonical summary → terminal status/action.

- [ ] **Step 5: Run focused tests and typecheck for GREEN**

Run:

```bash
cd apps/storefront-shared
node --experimental-transform-types --test --test-name-pattern="checkout" components/CheckoutForm.test.ts
cd ../..
npm run typecheck --workspace @celebix/storefront-shared
```

Expected: checkout-focused tests PASS and TypeScript exits 0.

- [ ] **Step 6: Commit Task 1**

```bash
git add apps/storefront-shared/components/CheckoutForm.tsx apps/storefront-shared/components/CheckoutForm.test.ts
git commit -m "feat(storefront): unify starter checkout flow"
```

### Task 2: White premium checkout shell and canonical summary

**Files:**
- Modify: `apps/storefront-shared/components/CheckoutForm.test.ts:1-60`
- Modify: `apps/storefront-shared/components/CheckoutSummary.tsx:1-20`
- Modify: `apps/storefront-shared/components/SideCartDrawer.test.ts:39-55`
- Modify: `apps/storefront-shared/components/SideCartDrawer.tsx:55-75`
- Modify: `apps/storefront-shared/app/checkout/page.tsx:1-20`
- Modify: `apps/storefront-shared/app/globals.css:244-280, 325-395`

**Interfaces:**
- Consumes: `PublicCartLine.media`, immutable public totals, finite `checkoutBlocker`, and `StorefrontFrame`.
- Produces: `CheckoutSummary({ summary })`, an exact `.checkout-page` shell, and compact `.side-cart-notice.is-configuration` presentation.

- [ ] **Step 1: Write failing visual-contract and canonical-media assertions**

Add to `CheckoutForm.test.ts`:

```ts
test("checkout owns a white single-screen shell and canonical media summary", () => {
  assert.match(checkout, /className="checkout-page"/u);
  assert.match(summary, /item[.]media[.]url/u);
  assert.match(summary, /item[.]media[.]altText/u);
  for (const proof of ["checkout-page", "background: var(--white)", "checkout-section", "checkout-summary-line", "min-height: 48px"])
    assert.match(css, new RegExp(proof, "u"));
});
```

Extend the test setup to read `globals.css`. Add to `SideCartDrawer.test.ts`:

```ts
assert.match(drawer, /side-cart-notice is-configuration/u);
assert.match(css, /[.]side-cart-notice[.]is-configuration/u);
```

- [ ] **Step 2: Run both component tests and verify RED**

Run:

```bash
cd apps/storefront-shared
node --experimental-transform-types --test components/CheckoutForm.test.ts components/SideCartDrawer.test.ts
```

Expected: FAIL because `.checkout-page`, canonical summary media, and configuration notice class do not yet exist.

- [ ] **Step 3: Add the exact checkout page shell**

Replace the generic hero with a compact checkout header while retaining `StorefrontFrame` and intent parsing:

```tsx
return <StorefrontFrame storefront={storefront}>
  <main className="checkout-page">
    <header className="checkout-page-header store-container">
      <span>GÜVENLİ ÖDEME</span>
      <h1>Siparişinizi tamamlayın</h1>
      <p>Teslimat ve ödeme bilgilerinizi tek ekranda güvenle tamamlayın.</p>
    </header>
    <section className="checkout-page-body store-container">
      <CheckoutForm intentKind={intent((await searchParams).intent)} />
    </section>
  </main>
</StorefrontFrame>;
```

- [ ] **Step 4: Render canonical product media in the summary**

For every line, render only `item.media` from the public projection:

```tsx
<li className="checkout-summary-line" key={item.variantId}>
  <span className="checkout-summary-media">
    {item.media
      ? <img src={item.media.url} alt={item.media.altText || item.title}
          width={item.media.width ?? 72} height={item.media.height ?? 72} />
      : <span aria-hidden="true">◇</span>}
  </span>
  <span className="checkout-summary-copy">
    <b>{item.title}</b>
    <small>{item.variantTitle} · {item.quantity} adet</small>
  </span>
  <strong>{formatTry(item.lineTotalCents)}</strong>
</li>
```

- [ ] **Step 5: Apply checkout-scoped white responsive CSS**

Implement these concrete layout contracts, extending details without changing global theme tokens:

```css
.checkout-page { min-height: 100vh; background: var(--white); }
.checkout-page-header { display: grid; gap: 10px; padding-block: 48px 28px; border-bottom: 1px solid var(--line); }
.checkout-page-body { padding-block: 32px 80px; }
.checkout-layout { display: grid; grid-template-areas: "main summary" "terminal summary"; grid-template-columns: minmax(0, 1fr) minmax(340px, 420px); align-items: start; gap: 18px clamp(32px, 5vw, 72px); }
.checkout-single-screen { display: grid; gap: 18px; }
.checkout-form-main { grid-area: main; display: grid; gap: 18px; }
.checkout-terminal { grid-area: terminal; display: grid; gap: 12px; }
.checkout-summary { grid-area: summary; }
.checkout-section { display: grid; gap: 18px; border: 1px solid var(--line); background: var(--white); padding: clamp(20px, 3vw, 30px); }
.checkout-summary-line { display: grid; grid-template-columns: 64px minmax(0, 1fr) auto; align-items: center; gap: 12px; }
.checkout-summary-media { display: grid; width: 64px; height: 72px; overflow: hidden; place-items: center; background: var(--media-surface); }
.checkout-summary-media img { width: 100%; height: 100%; object-fit: cover; }
```

At `max-width: 880px`, set `grid-template-areas: "main" "summary" "terminal"`, use one column, and make the summary static. At `max-width: 560px`, use one-column fields and a three-column summary line that cannot exceed the viewport. Preserve the existing reduced-motion rule.

- [ ] **Step 6: Make the side-cart configuration notice compact but truthful**

Use the additional class only for payment/shipping configuration blockers:

```tsx
<p className="side-cart-notice is-configuration">Ödeme yöntemi henüz yapılandırılmadı.</p>
```

```css
.side-cart-notice.is-configuration { border: 1px solid #e8dfcf; background: #fffaf2; color: #5f4a29; }
```

Do not change the blocker value, safe `/checkout` link, or disabled stock behavior.

- [ ] **Step 7: Run focused tests, full workspace tests, typecheck, and build**

Run:

```bash
node --experimental-transform-types --test apps/storefront-shared/components/CheckoutForm.test.ts apps/storefront-shared/components/SideCartDrawer.test.ts
npm test --workspace @celebix/storefront-shared
npm run typecheck --workspace @celebix/storefront-shared
npm run build --workspace @celebix/storefront-shared
git diff --check
```

Expected: focused tests PASS, full storefront total remains at least 263 with 0 failures, typecheck/build exit 0, and diff check emits no output.

- [ ] **Step 8: Commit Task 2**

```bash
git add apps/storefront-shared/app/checkout/page.tsx apps/storefront-shared/app/globals.css apps/storefront-shared/components/CheckoutForm.test.ts apps/storefront-shared/components/CheckoutSummary.tsx apps/storefront-shared/components/SideCartDrawer.tsx apps/storefront-shared/components/SideCartDrawer.test.ts
git commit -m "style(storefront): deliver premium single screen checkout"
```

### Task 3: Security, accessibility, and branch verification

**Files:**
- Modify only if an existing assertion requires the new approved markup: `apps/storefront-shared/lib/storefront-app.test.ts`
- Modify only if an existing static assertion requires the new approved markup: `tests/saas-phase3/storefront-cart-checkout/static-security.test.mjs`

**Interfaces:**
- Consumes: the completed exact checkout shell and unchanged public checkout endpoint contract.
- Produces: final non-deployment branch evidence.

- [ ] **Step 1: Run cart/checkout integration and static-security suites**

```bash
node --test tests/saas-phase3/storefront-cart-checkout/in-process.test.mjs
node --test tests/saas-phase3/storefront-cart-checkout/static-security.test.mjs
```

Expected: existing scenario counts and labels remain unchanged; every scenario PASS.

- [ ] **Step 2: Run public-authority and secret scans**

```bash
git diff bfbf96ff...HEAD -- apps/storefront-shared | rg -n "supabase|localStorage|sessionStorage|document[.]cookie|tenantId|storeId|priceCents\s*:|shippingCents\s*:|cardNumber|cvv|api[_-]?key|secret" 
```

Expected: no new forbidden browser authority, legacy donor dependency, card credential field, or secret literal. Legitimate negative test literals must be individually reviewed rather than deleted.

- [ ] **Step 3: Run the complete local regression gate**

```bash
npm test --workspace @celebix/storefront-shared
npm run typecheck --workspace @celebix/storefront-shared
npm run build --workspace @celebix/storefront-shared
git diff --check
git diff --name-only bfbf96ff...HEAD
git diff --name-only bfbf96ff...HEAD -- apps/admin
git status --short
```

Expected: tests/typecheck/build PASS; changed paths stay inside the listed Starter checkout scope; `apps/admin` output is empty; worktree is clean after commits.

- [ ] **Step 4: Push without rewriting history**

```bash
git push origin codex/starter-theme-commerce-foundation
git rev-parse HEAD
git ls-remote origin refs/heads/codex/starter-theme-commerce-foundation
```

Expected: local HEAD and remote branch SHA are exact matches.

### Task 4: Güzide isolated staging acceptance

**Files:** None.

**Interfaces:**
- Consumes: exact pushed SHA and the existing isolated staging storefront service.
- Produces: observed desktop/mobile checkout evidence; no source or production mutation.

- [ ] **Step 1: Deploy only the existing storefront staging application at exact HEAD**

Update the existing Coolify storefront staging application to the exact pushed SHA and trigger one deployment. Do not deploy Owner, customer-panel, admin, or production services.

- [ ] **Step 2: Verify health and exact rendered behavior**

```bash
curl -fsS -o /dev/null -w '%{http_code}\n' https://guzide-kuyumcu-4.saas-staging.celebix.site/health
```

Expected: `200`.

In a clean browser context verify:

- `/checkout` computes to white;
- contact, address, shipping, payment, summary, and final action are present together;
- canonical Güzide product image, variant, quantity, and totals render;
- `payment_unavailable` remains truthful and terminal submit is disabled;
- no order or payment attempt is created;
- side cart stays coherent and its compact notice links to checkout;
- horizontal overflow is `0` at 320, 390, 768, 1024, and 1440px;
- primary controls are at least 48×48px;
- keyboard order, invalid-field focus, 4.5:1 CTA contrast, and reduced-motion behavior pass;
- console/runtime logs contain no unexpected error or secret-bearing value.

- [ ] **Step 3: Record final boundaries**

Report exact deployed SHA, screenshot/evidence paths, test totals, and the following impact counts:

```text
production deploys: 0
production mutations: 0
Owner deploys: 0
customer-panel deploys: 0
apps/admin changes: 0
migrations: 0
fake payment methods/orders: 0
```
