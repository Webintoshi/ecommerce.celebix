# Starter Theme Cart Drawer and Checkout Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Shopify-quality accessible side-cart and replace the starter cart’s false stock warning with a server-authoritative checkout blocker.

**Architecture:** PostgreSQL migration 073 adds one finite blocker to the existing canonical cart and buy-now projections. Contracts and client parsing enforce blocker/readiness consistency. One provider-owned drawer consumes only canonical cart responses and reuses the existing replay-safe mutation endpoints.

**Tech Stack:** PostgreSQL 16, TypeScript 5.9, React 19, Next.js 16 App Router, Node test runner, existing CSS starter-theme tokens.

## Global Constraints

- Base SHA is `43c5da913c542bc7b253c172173a712cc519ba0b` on `codex/starter-theme-commerce-foundation`.
- Production impact, production deployment, production credential mutation, merge and DNS changes are zero.
- No fake IBAN, bank account, COD method or provider activation is allowed.
- Trusted hostname and opaque cookie authority remain unchanged.
- Browser code never supplies tenant, store, price, stock, shipping, payment or readiness authority.
- No new dependency or lockfile churn.
- Existing cart, checkout, policy, search, favorites and account behavior remains intact.
- Final deployment is limited to the existing Güzide storefront staging service at the exact pushed SHA.
- Every application behavior is implemented red-green-refactor.

---

### Task 1: Canonical checkout blocker contract

**Files:**
- Modify: `packages/saas-contracts/src/storefront/commerce.ts:51-60,285-308`
- Modify: `packages/saas-contracts/src/storefront/commerce.test.ts:55-115`
- Modify fixtures in: `packages/saas-data/src/storefront-commerce/repository.test.ts`

**Interfaces:**
- Produces `PublicCartCheckoutBlocker` and required `PublicCart.checkoutBlocker`.
- `parsePublicCart(value)` rejects inconsistent blocker/readiness pairs.

- [ ] **Step 1: Write failing contract tests**

Add fixtures for all four blockers and assert:

```ts
assert.equal(parsePublicCart({ ...cart, checkoutReady: false, checkoutBlocker: "payment_unavailable" }).checkoutBlocker, "payment_unavailable");
assert.throws(() => parsePublicCart({ ...cart, checkoutReady: true, checkoutBlocker: "payment_unavailable" }));
assert.throws(() => parsePublicCart({ ...cart, checkoutReady: false, checkoutBlocker: null }));
```

- [ ] **Step 2: Prove RED**

Run: `npm test --workspace @celebix/saas-contracts -- --test-name-pattern='checkout blocker'`

Expected: FAIL because `checkoutBlocker` is not an accepted required cart key.

- [ ] **Step 3: Implement the minimal exact contract**

Add:

```ts
export type PublicCartCheckoutBlocker = "empty_cart" | "stock_unavailable" | "shipping_unavailable" | "payment_unavailable" | null;
```

Require the property in `parsePublicCart`, validate the enum, require `empty_cart` only for zero lines, require `stock_unavailable` when a line is unavailable, and enforce `checkoutReady === (checkoutBlocker === null)`.

- [ ] **Step 4: Prove GREEN**

Run: `npm test --workspace @celebix/saas-contracts && npm run typecheck --workspace @celebix/saas-contracts && npm test --workspace @celebix/saas-data`

Expected: all PASS after every typed fixture includes the field.

- [ ] **Step 5: Commit**

```bash
git add packages/saas-contracts/src/storefront/commerce.ts packages/saas-contracts/src/storefront/commerce.test.ts packages/saas-data/src/storefront-commerce/repository.test.ts
git commit -m "feat(storefront): define checkout readiness blockers"
```

### Task 2: PostgreSQL migration 073 projections

**Files:**
- Create: `apps/owner/scripts/sql/saas/202608010073_storefront_checkout_readiness.up.sql`
- Create: `apps/owner/scripts/sql/saas/202608010073_storefront_checkout_readiness.down.sql`
- Create: `apps/owner/scripts/sql/saas/202608010073_storefront_checkout_readiness_assertions.sql`
- Create: `apps/owner/scripts/sql/saas/phase4c-storefront-checkout-readiness-manifest.json`
- Modify: `tests/saas-phase3/storefront-cart-checkout/postgres-harness.mjs:190-250`
- Modify cumulative migration/runtime preflight lists that explicitly end at migration 072.

**Interfaces:**
- Replaces `saas.storefront_cart_projection(uuid,uuid,timestamptz)` and `saas.storefront_intent_projection(uuid,uuid,timestamptz)` without changing signatures.
- Returns required JSON key `checkoutBlocker` with finite values and `null` only for ready carts.

- [ ] **Step 1: Add failing SQL scenarios**

Extend the existing harness with assertions for empty, stock/price drift, missing shipping, missing payment and ready projections:

```js
assert.equal(resolveCart(box).result_payload.checkoutBlocker, "payment_unavailable");
assert.equal(resolveCart(box).result_payload.checkoutReady, false);
```

Assert precedence by disabling payment while a line is unavailable and expecting `stock_unavailable`.

- [ ] **Step 2: Prove RED**

Run: `node tests/saas-phase3/storefront-cart-checkout/postgres-harness.mjs`

Expected: FAIL because migration 072 projections do not include `checkoutBlocker`.

- [ ] **Step 3: Implement migration 073**

Copy the exact migration-072 projection definitions and add only:

```sql
'checkoutBlocker', CASE
  WHEN aggregate.item_count=0 THEN 'empty_cart'
  WHEN NOT aggregate.all_available THEN 'stock_unavailable'
  WHEN shipping.projection IS NULL THEN 'shipping_unavailable'
  WHEN pg_catalog.jsonb_array_length(payments.methods)=0 THEN 'payment_unavailable'
  ELSE NULL
END
```

Use the corresponding `selected.available` expression for buy-now intent. Preserve `SECURITY DEFINER`, `search_path`, owner, revokes and grants. The down file restores the byte-equivalent migration-072 definitions.

- [ ] **Step 4: Add behavioral assertions and checksum manifest**

Assertions execute both projections under their intended roles, reject inconsistent outcomes, verify no new table exists and verify ACLs. Compute SHA-256 checksums from exact file bytes; do not fabricate them.

- [ ] **Step 5: Prove GREEN and rollback/reapply**

Run: `node tests/saas-phase3/storefront-cart-checkout/postgres-harness.mjs && node --test tests/saas-phase3/storefront-cart-checkout/static-security.test.mjs`

Expected: all existing scenarios plus blocker assertions PASS; backup/restore and 073 rollback/reapply PASS; disposable PostgreSQL cleanup PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/owner/scripts/sql/saas/202608010073_storefront_checkout_readiness.* apps/owner/scripts/sql/saas/phase4c-storefront-checkout-readiness-manifest.json tests/saas-phase3/storefront-cart-checkout
git commit -m "feat(saas): expose storefront checkout blockers"
```

### Task 3: Typed public cart client errors

**Files:**
- Modify: `apps/storefront-shared/lib/cart/client.ts:9-33`
- Modify: `apps/storefront-shared/lib/cart/client.test.ts`
- Modify typed cart fixtures in `apps/storefront-shared/lib/cart/*.test.ts` and `tests/saas-phase3/starter-commerce/in-process.test.mjs`

**Interfaces:**
- `StorefrontCartClientError.code` becomes `invalid_response | request_failed | stock_unavailable | shipping_unavailable | payment_unavailable | cart_empty`.
- Non-2xx payloads accept only exact `{ code: knownPublicCode }` JSON.

- [ ] **Step 1: Write failing client tests**

Test a 409 JSON response containing `payment_unavailable`, an unknown code, extra keys, non-JSON, malformed UTF-8 and oversized content. The first must preserve the code; every malformed case must return `request_failed` or `invalid_response` without response details.

- [ ] **Step 2: Prove RED**

Run: `npm test --workspace @celebix/storefront-shared -- --test-name-pattern='public cart error'`

Expected: FAIL because every non-OK response is currently `request_failed`.

- [ ] **Step 3: Implement minimal finite parsing**

Parse the already bounded JSON payload before the status check. Match only exact `{code}` records and a frozen allowlist; never pass arbitrary strings into the error constructor.

- [ ] **Step 4: Prove GREEN**

Run: `npm test --workspace @celebix/storefront-shared -- --test-name-pattern='cart client|public cart error'`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/storefront-shared/lib/cart/client.ts apps/storefront-shared/lib/cart/client.test.ts apps/storefront-shared/lib/cart/*.test.ts tests/saas-phase3/starter-commerce/in-process.test.mjs
git commit -m "fix(storefront): preserve public checkout failures"
```

### Task 4: Accessible provider-owned side-cart

**Files:**
- Create: `apps/storefront-shared/components/SideCartDrawer.tsx`
- Create: `apps/storefront-shared/components/SideCartDrawer.test.ts`
- Modify: `apps/storefront-shared/components/CartStatusProvider.tsx:7-29`
- Modify: `apps/storefront-shared/components/StoreUtilities.tsx:1-23`
- Modify: `apps/storefront-shared/components/ProductCardCartButton.tsx:7-21`
- Modify: `apps/storefront-shared/components/ProductPurchasePanel.tsx:9-40`
- Modify: `apps/storefront-shared/app/globals.css:19-22,178-202,285-350`
- Modify: `apps/storefront-shared/package.json:8` so all component source tests run.

**Interfaces:**
- `replaceCart(cart, { openDrawer: true })` atomically installs canonical state and opens the drawer.
- `openDrawer(trigger)` and `closeDrawer()` own trigger focus restoration.
- `SideCartDrawer` consumes only `useCartStatus()` and `storefrontCartClient`.

- [ ] **Step 1: Write failing behavior/static tests**

Assert provider API, one mounted dialog, add-to-cart auto-open, header button semantics, Escape/backdrop/close paths, focus restoration, body lock, canonical media/amounts and absence of local price/tenant/store fields. Assert every drawer action has a 48px target and reduced-motion rule.

- [ ] **Step 2: Prove RED**

Run: `node --experimental-transform-types --test apps/storefront-shared/components/SideCartDrawer.test.ts apps/storefront-shared/components/CartPageClient.test.ts`

Expected: FAIL because the drawer and provider methods do not exist.

- [ ] **Step 3: Implement drawer state and mount**

Store `drawerOpen`, the invoking element and close-button ref. On open, save the trigger, lock document scrolling and focus the close control. On close/unmount, restore overflow and focus. Trap Tab between focusable drawer controls while open.

- [ ] **Step 4: Implement canonical drawer operations**

Render each `PublicCartLine` and call:

```ts
replaceCart(await storefrontCartClient.setQuantity({
  variantId: line.variantId,
  quantity: nextQuantity,
  expectedVersion: cart.version,
}));
```

Remove uses the same current version. Mutation failures call one `refresh()` and show a bounded Turkish status. Never retry a write.

- [ ] **Step 5: Wire add and header controls**

Both add surfaces pass `{ openDrawer: true }`. The cart utility becomes a button; search, favorite and account remain links. “Sepeti görüntüle” closes the drawer before navigation.

- [ ] **Step 6: Add responsive CSS**

Use a fixed full-viewport backdrop and a right sheet capped at 440px desktop and 100% width mobile. Preserve starter tokens, canonical images, scrollable line area and sticky total/action region. Add `@media (prefers-reduced-motion: reduce)` duration `0.01ms`.

- [ ] **Step 7: Prove GREEN**

Run: `npm test --workspace @celebix/storefront-shared && npm run typecheck --workspace @celebix/storefront-shared`

Expected: all component, library and script tests PASS; TypeScript PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/storefront-shared/components/SideCartDrawer.tsx apps/storefront-shared/components/SideCartDrawer.test.ts apps/storefront-shared/components/CartStatusProvider.tsx apps/storefront-shared/components/StoreUtilities.tsx apps/storefront-shared/components/ProductCardCartButton.tsx apps/storefront-shared/components/ProductPurchasePanel.tsx apps/storefront-shared/app/globals.css apps/storefront-shared/package.json
git commit -m "feat(storefront): add accessible side cart"
```

### Task 5: Truthful cart and checkout recovery UI

**Files:**
- Modify: `apps/storefront-shared/components/CartPageClient.tsx:20-27`
- Modify: `apps/storefront-shared/components/CartPageClient.test.ts`
- Modify: `apps/storefront-shared/components/CheckoutForm.tsx:25-70`
- Create or modify: `apps/storefront-shared/components/CheckoutForm.test.ts`
- Modify: `apps/storefront-shared/app/globals.css` blocker presentation rules

**Interfaces:**
- `checkoutBlockerMessage(blocker)` returns one fixed Turkish customer-safe message.
- Stock blocks navigation; shipping/payment blockers permit `/checkout` inspection but final submit stays disabled.

- [ ] **Step 1: Write failing UI source tests**

Assert exact stock, shipping and payment messages; ensure the old unconditional stock message is absent. Assert configuration blockers expose `/checkout`, stock blocker does not, and the checkout form maps `payment_unavailable` without creating an option.

- [ ] **Step 2: Prove RED**

Run: `node --experimental-transform-types --test apps/storefront-shared/components/CartPageClient.test.ts apps/storefront-shared/components/CheckoutForm.test.ts`

Expected: FAIL because the cart uses only `checkoutReady` and quote errors are generic.

- [ ] **Step 3: Implement minimal truthful presentation**

Use a shared finite mapper:

```ts
const CHECKOUT_BLOCKER_COPY = Object.freeze({
  empty_cart: "Sepetiniz boş.",
  stock_unavailable: "Sepetinizde stok veya fiyatı değişen bir ürün var.",
  shipping_unavailable: "Teslimat yöntemi henüz yapılandırılmadı.",
  payment_unavailable: "Ödeme yöntemi henüz yapılandırılmadı.",
});
```

Do not display internal error text. Keep complete-order disabled unless `quote.cart.checkoutReady` and a real selected method are both present.

- [ ] **Step 4: Prove GREEN**

Run: `npm test --workspace @celebix/storefront-shared && npm run typecheck --workspace @celebix/storefront-shared`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/storefront-shared/components/CartPageClient.tsx apps/storefront-shared/components/CartPageClient.test.ts apps/storefront-shared/components/CheckoutForm.tsx apps/storefront-shared/components/CheckoutForm.test.ts apps/storefront-shared/app/globals.css
git commit -m "fix(storefront): explain checkout blockers truthfully"
```

### Task 6: Full verification, publication and Güzide staging acceptance

**Files:**
- Modify only if an assertion discovered by the gates is wrong and the change belongs to Tasks 1-5.
- Create untracked screenshots outside the repository or under an already ignored evidence directory.

**Interfaces:**
- Produces one pushed exact SHA and one Güzide-only staging deployment.

- [ ] **Step 1: Run complete local/disposable gates**

```bash
npm test --workspace @celebix/saas-contracts
npm run typecheck --workspace @celebix/saas-contracts
npm test --workspace @celebix/saas-data
npm run typecheck --workspace @celebix/saas-data
npm test --workspace @celebix/storefront-shared
npm run typecheck --workspace @celebix/storefront-shared
npm run build --workspace @celebix/storefront-shared
node tests/saas-phase3/storefront-cart-checkout/postgres-harness.mjs
node tests/saas-phase3/starter-commerce/in-process.test.mjs
node --test tests/saas-phase3/starter-commerce/static-security.test.mjs
git diff --check
```

Expected: every command PASS; PostgreSQL 16 rollback/reapply and cleanup PASS.

- [ ] **Step 2: Run authority/secret scans**

Scan the tracked diff for raw cookies, credentials, IBANs, database URLs, `tenantId`, `storeId`, local totals, Supabase imports, `console.log`, production mutation and new dependency changes. Expected: zero unauthorized matches.

- [ ] **Step 3: Final commit and push**

If documentation-only changes remain, commit them with:

```bash
git add docs/superpowers/specs/2026-08-01-starter-theme-cart-drawer-readiness-design.md docs/superpowers/plans/2026-08-01-starter-theme-cart-drawer-readiness.md
git commit -m "docs(storefront): record cart drawer readiness design"
git push origin codex/starter-theme-commerce-foundation
```

Verify remote SHA equals local SHA and worktree is clean.

- [ ] **Step 4: Deploy exact SHA to Güzide storefront staging only**

Use the existing Coolify Güzide storefront service. Do not deploy Owner, customer-panel, another storefront or production. Confirm runtime health and migration 073 application without printing secrets.

- [ ] **Step 5: Clean-browser staging acceptance**

At desktop and 390×844:

1. add an available product and confirm the drawer opens;
2. verify image/title/variant/amount/count;
3. increment, decrement and remove through real endpoints;
4. close via Escape, backdrop and close button and verify focus restoration;
5. open from header and navigate to `/cart`;
6. confirm the Güzide cart reports `payment_unavailable`, not stock;
7. navigate to `/checkout` and confirm it shows no active payment method and creates no order;
8. confirm zero horizontal overflow, 48×48 targets, reduced motion and zero console/runtime secret leaks.

Expected: the side-cart and truthful recovery flow PASS; order completion remains intentionally unavailable until a real merchant payment method exists.

## Self-review

- Spec coverage: drawer behavior, authority, blocker precedence, truthful checkout, accessibility, PostgreSQL migration, tests, staging and no-fake-payment requirements each map to a task.
- Placeholder scan: no TODO/TBD or unspecified implementation steps remain.
- Type consistency: `PublicCartCheckoutBlocker`, `checkoutBlocker`, provider method names and public error codes are identical in every task.
