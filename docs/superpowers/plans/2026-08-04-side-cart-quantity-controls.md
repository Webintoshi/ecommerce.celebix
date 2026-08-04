# Side Cart Quantity Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a modern side cart whose quantity mutations work reliably and whose quantity selector visibility is controlled by each store's published design authority.

**Architecture:** Extend the existing version-2 starter composition instead of introducing a second settings source. A PostgreSQL 16 migration normalizes existing records and tightens the exact-key validator; TypeScript contracts, customer-panel composition editing, public projection, and `SideCartDrawer` consume the same required boolean. Quantity writes continue through the existing replay-safe cart API, with a small testable mutation coordinator used by the drawer.

**Tech Stack:** PostgreSQL 16, TypeScript, React 19, Next.js App Router, Node test runner, CSS Modules/global storefront CSS.

## Global Constraints

- `cart.showQuantitySelector` is required for normalized schema-version-2 compositions and defaults to `true`.
- Existing and new stores preserve visible quantity controls unless the merchant publishes `false`.
- Disabled side-cart controls still show canonical `<n> adet` copy and preserve removal.
- The full `/cart` page quantity editor remains unchanged.
- Existing cookie, trusted-host, replay, optimistic-version, checkout-readiness, and fail-closed behavior remains unchanged.
- No browser header, query, cookie, local storage, tenant ID, or store ID may become design authority.
- No new dependency or API endpoint is permitted.
- No production deployment is permitted.

---

### Task 1: Version the durable quantity-selector authority

**Files:**
- Modify: `packages/saas-contracts/src/storefront/types.ts:88-107,196-235`
- Modify: `packages/saas-contracts/src/storefront/validation.ts:374-403,535-537`
- Modify: `packages/saas-contracts/src/storefront/presentation.ts:35-100`
- Modify: `packages/saas-contracts/src/storefront-design/defaults.ts:3-25`
- Modify: `packages/saas-contracts/src/storefront/campaign-starter.test.ts`
- Modify: `packages/saas-contracts/src/storefront/retail-presentation.test.ts`
- Modify: `packages/saas-contracts/src/storefront/storefront.test.ts`
- Modify: `packages/saas-contracts/src/storefront-design/storefront-design.test.ts`
- Create: `apps/owner/scripts/sql/saas/202608040086_side_cart_quantity_controls.up.sql`
- Create: `apps/owner/scripts/sql/saas/202608040086_side_cart_quantity_controls.down.sql`
- Create: `apps/owner/scripts/sql/saas/202608040086_side_cart_quantity_controls_assertions.sql`
- Create: `apps/owner/scripts/sql/saas/phase3-side-cart-quantity-controls-manifest.json`
- Create: `apps/owner/scripts/sql/saas/side-cart-quantity-controls-migration.test.ts`

**Interfaces:**
- Produces: `StarterThemeCompositionConfigV2["cart"]["showQuantitySelector"]: boolean`.
- Produces: `PublicStarterThemePresentationV2["cart"]["showQuantitySelector"]: boolean`.
- Preserves schema-version-1 input compatibility by upgrading it to `true`; normalized schema-version-2 values require the key.

- [ ] **Step 1: Write failing TypeScript contract tests**

Add assertions equivalent to:

```ts
const parsed = parseStarterThemeCompositionConfig({
  ...validV2,
  cart: { ...validV2.cart, showQuantitySelector: false },
});
assert.equal(parsed.cart.showQuantitySelector, false);

const missing = structuredClone(validV2);
delete missing.cart.showQuantitySelector;
assert.throws(() => parseStarterThemeCompositionConfig(missing), /storefront_contract_invalid/);
assert.throws(() => parseStarterThemeCompositionConfig({
  ...validV2,
  cart: { ...validV2.cart, showQuantitySelector: "true" },
}), /storefront_contract_invalid/);
```

Update every version-2 cart fixture with `showQuantitySelector: true`. Keep version-1 fixtures unchanged and assert their public/default adaptation produces `true`.

- [ ] **Step 2: Run the focused contracts test and verify RED**

Run:

```bash
npm test --workspace @celebix/saas-contracts
```

Expected: FAIL because `showQuantitySelector` is not a recognized required cart key.

- [ ] **Step 3: Write failing migration artifact tests**

Create a checksum/static test that proves the 084 migration:

```ts
assert.match(up, /showQuantitySelector/);
assert.match(up, /jsonb_set/);
assert.match(up, /campaign_starter_composition_valid/);
assert.match(assertions, /SIDE_CART_QUANTITY_SELECTOR_DEFAULT_INVALID/);
assert.match(down, /celebix[.]allow_side_cart_quantity_controls_down/);
```

Pin exact up/down/assertion SHA-256 values in the new manifest.

- [ ] **Step 4: Run the migration test and verify RED**

Run:

```bash
node --experimental-transform-types --test apps/owner/scripts/sql/saas/side-cart-quantity-controls-migration.test.ts
```

Expected: FAIL because the 086 artifacts do not exist.

- [ ] **Step 5: Implement the contract and migration**

Define separate cart contracts so v2 is exact:

```ts
export type StarterCartConfig = Readonly<{
  showCheckoutReadiness: boolean;
  showShippingProgress: boolean;
  trustMessage?: string;
}>;

export type StarterCartConfigV2 = Readonly<StarterCartConfig & {
  showQuantitySelector: boolean;
}>;
```

Parse v2/public v2 with:

```ts
const required = retail
  ? ["showCheckoutReadiness", "showShippingProgress", "showQuantitySelector"]
  : ["showCheckoutReadiness", "showShippingProgress"];
const cartValue = exact(parsed.cart, required, ["trustMessage"]);
```

The 084 up migration must:

1. Drop only constraints that depend on the composition validator.
2. Normalize `campaign_starter_publications.config` and both `storefront_designs` composition documents with `showQuantitySelector: true` when missing.
3. Replace `storefront_theme_default_composition`, `storefront_theme_composition_upgrade_v2`, and `campaign_starter_composition_valid` with the required boolean contract.
4. Restore all dropped checks and privileges exactly.
5. Include guarded rollback that refuses data-loss when any stored value is `false`, then removes the field and restores the prior functions.

- [ ] **Step 6: Refresh checksums and run focused tests GREEN**

Run:

```bash
shasum -a 256 \
  apps/owner/scripts/sql/saas/202608040086_side_cart_quantity_controls.up.sql \
  apps/owner/scripts/sql/saas/202608040086_side_cart_quantity_controls.down.sql \
  apps/owner/scripts/sql/saas/202608040086_side_cart_quantity_controls_assertions.sql
npm test --workspace @celebix/saas-contracts
node --experimental-transform-types --test apps/owner/scripts/sql/saas/side-cart-quantity-controls-migration.test.ts
```

Expected: all PASS and manifest checksums match.

- [ ] **Step 7: Commit Task 1**

```bash
git add packages/saas-contracts apps/owner/scripts/sql/saas/202608040084_* \
  apps/owner/scripts/sql/saas/phase3-side-cart-quantity-controls-manifest.json \
  apps/owner/scripts/sql/saas/side-cart-quantity-controls-migration.test.ts
git commit -m "feat(storefront): add quantity selector authority"
```

---

### Task 2: Add the merchant design control and truthful preview

**Files:**
- Modify: `apps/customer-panel/lib/starter-theme-composer-model.ts:10-20,138-150`
- Modify: `apps/customer-panel/lib/starter-theme-composer-model.test.ts:15-55`
- Modify: `apps/customer-panel/components/settings/StarterThemeComposer.tsx:258-260`
- Modify: `apps/customer-panel/components/settings/StarterThemeComposer.test.ts:25-80`
- Modify: `apps/customer-panel/components/settings/StarterThemePreview.tsx:150-170`
- Modify: `apps/customer-panel/components/settings/starter-theme-preview.module.css`
- Update version-2 composition fixtures in existing focused customer-panel/storefront-design tests when compilation requires the new exact field.

**Interfaces:**
- Consumes: required `StarterThemeCompositionConfigV2.cart.showQuantitySelector` from Task 1.
- Produces: controlled checkbox labelled `Miktar seçiciyi göster`.
- Produces: preview class `previewQuantity` and read-only state `N adet`.

- [ ] **Step 1: Write failing model and source tests**

Add tests equivalent to:

```ts
test("quantity-selector visibility is preserved by composer normalization", () => {
  const enabled = buildStarterThemeComposition(state());
  const disabled = buildStarterThemeComposition({
    ...state(),
    cart: { ...state().cart, showQuantitySelector: false },
  });
  assert.equal(enabled.cart.showQuantitySelector, true);
  assert.equal(disabled.cart.showQuantitySelector, false);
});
```

Static component tests must require `Miktar seçiciyi göster`, `state.cart.showQuantitySelector`, and preview rendering for both the selector and `adet` fallback.

- [ ] **Step 2: Run focused customer-panel tests and verify RED**

Run:

```bash
node --experimental-transform-types --test \
  apps/customer-panel/lib/starter-theme-composer-model.test.ts \
  apps/customer-panel/components/settings/StarterThemeComposer.test.ts
```

Expected: FAIL because the new field and control are absent.

- [ ] **Step 3: Implement the minimal controlled editor and preview**

Add the cart panel checkbox:

```tsx
<label className={styles.check}>
  <input
    type="checkbox"
    checked={state.cart.showQuantitySelector}
    onChange={(event) => patch({
      cart: { ...state.cart, showQuantitySelector: event.currentTarget.checked },
    })}
  />
  Miktar seçiciyi göster
</label>
```

Set `showQuantitySelector: true` in `createStarterThemeEditorState` and all v1-to-v2 upgrades. Render preview controls only when true; otherwise render `1 adet`.

- [ ] **Step 4: Run focused tests GREEN**

Run the same focused command. Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add apps/customer-panel packages/saas-contracts/src/storefront-design/defaults.ts
git commit -m "feat(customer-panel): configure side cart quantity"
```

---

### Task 3: Repair side-cart mutation behavior and modernize the drawer

**Files:**
- Create: `apps/storefront-shared/components/side-cart-mutation.ts`
- Create: `apps/storefront-shared/components/side-cart-mutation.test.ts`
- Modify: `apps/storefront-shared/components/campaign-ui-model.ts:18-26`
- Modify: `apps/storefront-shared/components/campaign-ui-model.test.ts:34-42`
- Modify: `apps/storefront-shared/components/SideCartDrawer.tsx:14-78`
- Modify: `apps/storefront-shared/components/SideCartDrawer.test.ts`
- Modify: `apps/storefront-shared/app/globals.css:230-290,525-540`
- Update version-2 storefront presentation fixtures under `apps/storefront-shared/**` and `tests/saas-phase3/**` when the exact contract requires it.

**Interfaces:**
- Consumes: `showQuantitySelector` from Task 1.
- Produces:

```ts
export async function mutateSideCartLine(input: Readonly<{
  line: PublicCartLine;
  cartVersion: number;
  quantity: number | null;
  client: Pick<StorefrontCartClient, "setQuantity" | "remove">;
  replaceCart(cart: PublicCart): void;
  refresh(): Promise<boolean>;
}>): Promise<string>;
```

- [ ] **Step 1: Write failing behavior tests for the mutation coordinator**

Use real fake functions with captured calls, not framework mocks:

```ts
test("increment sends one replay-safe quantity mutation and installs canonical cart", async () => {
  const calls: unknown[] = [];
  const status = await mutateSideCartLine({
    line,
    cartVersion: 4,
    quantity: 3,
    client: {
      async setQuantity(input) { calls.push(input); return nextCart; },
      async remove() { throw new Error("unexpected"); },
    },
    replaceCart(value) { calls.push(value); },
    async refresh() { throw new Error("unexpected"); },
  });
  assert.deepEqual(calls[0], { variantId: line.variantId, quantity: 3, expectedVersion: 4 });
  assert.equal(calls[1], nextCart);
  assert.match(status, /adedi güncellendi/);
});
```

Add separate failure and removal tests proving one refresh, no second write, and exact status.

- [ ] **Step 2: Run focused storefront tests and verify RED**

Run:

```bash
npm test --workspace @celebix/storefront-shared -- --test-name-pattern="side-cart|quantity"
```

If workspace forwarding does not filter, run:

```bash
NODE_OPTIONS='--conditions=react-server' node --experimental-transform-types --test \
  apps/storefront-shared/components/side-cart-mutation.test.ts \
  apps/storefront-shared/components/campaign-ui-model.test.ts \
  apps/storefront-shared/components/SideCartDrawer.test.ts
```

Expected: FAIL because the coordinator and visibility projection do not exist.

- [ ] **Step 3: Implement the mutation coordinator and visibility projection**

Return status from one write or one read-only recovery:

```ts
export async function mutateSideCartLine(input: SideCartMutationInput): Promise<string> {
  try {
    const next = input.quantity === null
      ? await input.client.remove({ variantId: input.line.variantId, expectedVersion: input.cartVersion })
      : await input.client.setQuantity({ variantId: input.line.variantId, quantity: input.quantity, expectedVersion: input.cartVersion });
    input.replaceCart(next);
    return input.quantity === null
      ? `${input.line.title} sepetten çıkarıldı.`
      : `${input.line.title} adedi güncellendi.`;
  } catch {
    return await input.refresh()
      ? "Sepet güncellenemedi. Güncel sepet yeniden yüklendi."
      : "Sepet güncellenemedi. Güncel durum doğrulanamadı.";
  }
}
```

`sideCartPresentation` must default missing legacy presentation to `showQuantitySelector: true`.

- [ ] **Step 4: Render the enabled and disabled quantity states**

Use:

```tsx
{campaignPresentation.showQuantitySelector
  ? <div className="side-cart-quantity" aria-label={`${line.title} adet`}>…</div>
  : <span className="side-cart-quantity-copy">{line.quantity} adet</span>}
```

Keep the line pending lock, 1/99 bounds, remove action, live status, focus trap, and exact checkout destinations.

- [ ] **Step 5: Apply the modern minimalist CSS**

Keep the drawer at `min(430px, 100%)`, reduce header and footer density, remove boxed summary styling, use one-pixel separators, preserve media aspect ratio with `object-fit: contain`, keep all buttons at least 48px, and collapse checkout actions to one column on narrow screens. Do not add external assets or fonts.

- [ ] **Step 6: Run focused tests GREEN**

Run the focused Node command. Expected: all PASS.

- [ ] **Step 7: Commit Task 3**

```bash
git add apps/storefront-shared tests/saas-phase3
git commit -m "fix(storefront): modernize side cart quantity controls"
```

---

### Task 4: Full verification and publication proof

**Files:**
- Modify only failing version-2 fixtures directly related to the required cart key.
- Do not modify production configuration or deployment files.

**Interfaces:**
- Consumes every artifact from Tasks 1-3.
- Produces a clean branch, exact remote parity, and verification evidence.

- [ ] **Step 1: Run contracts, customer-panel, and storefront tests**

```bash
npm test --workspace @celebix/saas-contracts
npm test --workspace @celebix/customer-panel
npm test --workspace @celebix/storefront-shared
```

Expected: all PASS.

- [ ] **Step 2: Run static and PostgreSQL verification**

```bash
node --experimental-transform-types --test apps/owner/scripts/sql/saas/side-cart-quantity-controls-migration.test.ts
node tests/saas-phase3/starter-theme-composition/in-process.test.mjs
node tests/saas-phase3/starter-theme-composition/static-security.test.mjs
node tests/saas-phase3/starter-retail-experience/in-process.test.mjs
```

Run the relevant disposable PostgreSQL 16 harness after including migration 084. Expected: all existing scenarios plus the new selector assertions PASS; rollback/reapply and cleanup PASS.

- [ ] **Step 3: Run typecheck and builds**

```bash
npm run typecheck --workspace @celebix/saas-contracts
npm run typecheck --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/storefront-shared
npm run build --workspace @celebix/customer-panel
npm run build --workspace @celebix/storefront-shared
```

Expected: all PASS.

- [ ] **Step 4: Run local browser acceptance**

At desktop and `390x844`, prove:

- modern drawer layout has zero horizontal overflow;
- open selector increments and decrements exactly once;
- disabled selector displays `N adet` with no `+` or `−` button;
- close button, backdrop, Escape, and focus restoration work;
- interactive targets are at least 48px;
- reduced-motion duration is approximately `.01ms`;
- no console, network, raw authority, or credential leak appears.

- [ ] **Step 5: Final repository checks**

```bash
git diff --check
git status --short
git diff --name-only febf370b0f0607e7140aa5bc419cbc2d676f71d3...HEAD
git log --oneline --decorate -8
```

Expected: only approved feature/docs/test/SQL files; worktree clean after final commit.

- [ ] **Step 6: Push without force**

```bash
git push origin codex/storefront-unified-theme-authority
git rev-parse HEAD
git rev-parse origin/codex/storefront-unified-theme-authority
```

Expected: local and remote SHAs match. Staging and production deployment count remains zero.
