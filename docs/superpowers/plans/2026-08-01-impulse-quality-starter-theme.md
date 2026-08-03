# Impulse-Quality Celebix Starter Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the existing `starter` storefront in place into an original, admin-managed, Impulse-quality campaign commerce experience for every newly provisioned Celebix store.

**Architecture:** A versioned `starter_theme_composition` singleton stores bounded tenant-owned references and publishes atomically. PostgreSQL resolves that authority into a public schema-v2 presentation, while `apps/storefront-shared` renders server-owned navigation, home sections, product detail, quick view, side cart, and existing checkout without accepting browser tenant, price, stock, media, or payment authority.

**Tech Stack:** TypeScript, React, Next.js App Router, PostgreSQL 16 SQL functions/RLS, Node test runner, existing `@celebix/saas-contracts`, `@celebix/saas-data`, customer-panel merchant-admin APIs, R2 storefront assets, and CSS modules/global storefront CSS.

## Global Constraints

- Keep the public theme key exactly `starter`; do not create another application, iframe, reverse proxy, or copied Shopify theme package.
- Shopify Impulse is a research reference only. Copy zero donor code, assets, copy, trademarks, identifiers, or proprietary packages.
- Every merchant value must come from authenticated customer-panel configuration, tenant-owned R2 media, or canonical public catalog/cart/checkout projections.
- Preserve hostname-selected store authority; browser headers, query parameters, cookies other than existing opaque commerce credentials, and local storage never select tenant/store authority.
- Preserve the existing canonical cart, single-screen checkout, payment-method authority, policy, search, favorite, and Markdown behavior.
- Add no theme-builder, carousel, animation, or UI dependency; implement with existing React/CSS primitives.
- New-store defaults must create no fake products, categories, discounts, reviews, shipping claims, social links, currencies, policies, or payment methods.
- Production deploy, production mutation, DNS, credential change, provider configuration, merge, and staging deployment are excluded.
- Append migration `074`; migrations `001–073` remain byte-for-byte unchanged.
- Use red/green TDD, run `git diff --check` before every commit, and do not amend or rewrite task commits.

---

### Task 1: Define the immutable public Campaign Starter contract

**Files:**
- Create: `packages/saas-contracts/src/storefront/campaign-starter.test.ts`
- Modify: `packages/saas-contracts/src/storefront/types.ts:1-71`
- Modify: `packages/saas-contracts/src/storefront/validation.ts:103-175`
- Modify: `packages/saas-contracts/src/storefront/presentation.ts:1-63`
- Modify: `packages/saas-contracts/src/storefront/index.ts:1-13`
- Modify: `packages/saas-contracts/src/index.ts:379-397`

**Interfaces:**
- Consumes: existing `PublicStorefrontAsset`, `PublicProduct`, canonical relative-route validation, and `buildDefaultStarterPresentation(displayName)`.
- Produces: `StarterThemeCompositionConfig`, `StarterThemeSectionConfig`, `PublicStarterNavigation`, `PublicStarterHomeSection`, `PublicStarterThemePresentation` schema v2, `parseStarterThemeCompositionConfig(value)`, `parsePublicStarterThemePresentation(value)`, and `adaptStarterPresentationV1(value)`.

- [ ] **Step 1: Write twelve failing contract tests**

```ts
test("campaign starter composition is exact bounded and deeply frozen", () => {
  const value = parseStarterThemeCompositionConfig(validComposition());
  assert.equal(value.schemaVersion, 1);
  assert.equal(Object.isFrozen(value.sections), true);
  assert.equal(Object.isFrozen(value.sections[0]), true);
});

test("public v2 presentation contains resolved routes and no private IDs", () => {
  const value = parsePublicStarterThemePresentation(validPublicPresentation());
  assert.equal(value.schemaVersion, 2);
  assert.equal(JSON.stringify(value).includes("assetId"), false);
  assert.equal(JSON.stringify(value).includes("categoryId"), false);
});
```

Cover exact keys, hostile accessors, duplicate singleton sections, maximum three hero slides, maximum eight navigation roots, maximum twelve sections, safe relative destinations, category-source requirements, tenant-reference UUID syntax, R2 public asset syntax, v1 compatibility, deterministic defaults, and deep freezing. The new file must contain exactly twelve top-level tests.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `node --experimental-strip-types --test packages/saas-contracts/src/storefront/campaign-starter.test.ts`

Expected: FAIL because `parseStarterThemeCompositionConfig`, the schema-v2 section types, and `adaptStarterPresentationV1` are not exported.

- [ ] **Step 3: Add the finite config and public unions**

```ts
export type StarterThemeSectionConfig =
  | Readonly<{ kind: "hero"; enabled: boolean; slides: readonly StarterHeroSlideConfig[] }>
  | Readonly<{ kind: "category_grid"; enabled: boolean; heading: string; categoryIds: readonly string[] }>
  | Readonly<{ kind: "product_row"; enabled: boolean; heading: string; source: "latest" | "sale" | "category"; categoryId?: string; limit: 4 | 8 | 12 }>
  | Readonly<{ kind: "split_campaign"; enabled: boolean; panels: readonly StarterCampaignPanelConfig[] }>
  | Readonly<{ kind: "brand_story"; enabled: boolean; eyebrow?: string; heading: string; body: string; assetId?: string; destination?: string }>;

export type PublicStarterThemePresentation = Readonly<{
  schemaVersion: 2;
  displayName: string;
  supportEmail?: string;
  logo?: PublicStorefrontAsset;
  visual: PublicStarterVisual;
  announcement?: PublicStarterAnnouncement;
  navigation: PublicStarterNavigation;
  sections: readonly PublicStarterHomeSection[];
  productDetail: PublicStarterProductDetailOptions;
  cart: PublicStarterCartOptions;
  seo: PublicStarterSeo;
}>;
```

Implement exact parsers with local helpers that copy input into frozen plain objects without invoking accessors. `adaptStarterPresentationV1` maps current theme/hero/promotion/marquee/category-showcase fields into v2 sections and never mutates the source.

- [ ] **Step 4: Run focused and full contract tests GREEN**

Run: `node --experimental-strip-types --test packages/saas-contracts/src/storefront/campaign-starter.test.ts`

Expected: 12/12 PASS.

Run: `npm test --workspace @celebix/saas-contracts && npm run typecheck --workspace @celebix/saas-contracts`

Expected: 198/198 PASS; typecheck PASS.

- [ ] **Step 5: Commit the contract boundary**

```bash
git add packages/saas-contracts/src/storefront packages/saas-contracts/src/index.ts
git diff --check
git commit -m "feat(storefront): define campaign starter contract"
```

---

### Task 2: Persist draft/publish authority and resolve public composition

**Files:**
- Create: `apps/owner/scripts/sql/saas/202608010074_campaign_starter_composition.up.sql`
- Create: `apps/owner/scripts/sql/saas/202608010074_campaign_starter_composition.down.sql`
- Create: `apps/owner/scripts/sql/saas/202608010074_campaign_starter_composition_assertions.sql`
- Create: `apps/owner/scripts/sql/saas/phase4d-campaign-starter-composition-manifest.json`
- Create: `tests/saas-phase3/starter-theme-composition/postgres-harness.mjs`
- Create: `tests/saas-phase3/starter-theme-composition/static-security.test.mjs`
- Create: `packages/saas-data/src/merchant-admin/starter-composition-repository.test.ts`
- Create: `packages/saas-data/src/storefront/campaign-home-repository.test.ts`
- Modify: `packages/saas-contracts/src/merchant-admin/types.ts:1-45`
- Modify: `packages/saas-contracts/src/merchant-admin/validation.ts:1-260`
- Modify: `packages/saas-contracts/src/merchant-admin/merchant-admin.test.ts:1-180`
- Modify: `packages/saas-data/src/merchant-admin/types.ts:1-180`
- Modify: `packages/saas-data/src/merchant-admin/validation.ts:1-260`
- Modify: `packages/saas-data/src/merchant-admin/repository.ts:1-39`
- Modify: `packages/saas-data/src/storefront/types.ts:1-160`
- Modify: `packages/saas-data/src/storefront/repository.ts:1-240`
- Modify: `tests/saas-phase3/run-current-suite.mjs:8-125`

**Interfaces:**
- Consumes: Task 1 config/public parsers, canonical `TenantContext`, current merchant-admin idempotency/recovery machinery, catalog category/media/product tables, and `celebix_saas_app`/`celebix_saas_host_resolver` roles.
- Produces: repository methods `getStarterThemeComposition(input)`, `saveStarterThemeComposition(input)`, and `resolveCampaignHome(input)`; SQL functions `saas.merchant_starter_composition_get`, `saas.merchant_starter_composition_save`, `saas.merchant_starter_composition_recover_operation`, and a schema-v2 `saas.public_starter_presentation`.

- [ ] **Step 1: Write twenty failing repository tests**

```ts
test("save binds every reference to the server TenantContext", async () => {
  const repository = new PostgresMerchantAdminRepository(options(pool));
  const saved = await repository.saveStarterThemeComposition({
    tenantContext: tenant(), now: NOW, operationId: OP,
    composition: validComposition(), expectedVersion: 3,
  });
  assert.deepEqual(pool.calls.at(-1)?.values.slice(0, 7), authorityTuple());
  assert.equal(saved.version, 4);
});

test("public campaign rows never accept a browser store selector", async () => {
  await assert.rejects(
    repository.resolveCampaignHome({ storefront, now: NOW, storeId: OTHER_STORE } as never),
    /invalid_input/,
  );
  assert.equal(pool.checkoutCount, 0);
});
```

Use ten tests in each new file. Cover input validation before checkout, exact SQL signatures, optimistic version conflict, commit-unknown single read-only recovery, cross-store output corruption, category hierarchy projection, latest/sale/category product sources, active-only references, exact bounded rows, and immutable output.

- [ ] **Step 2: Run repository tests and verify RED**

Run: `node --experimental-strip-types --test packages/saas-data/src/merchant-admin/starter-composition-repository.test.ts packages/saas-data/src/storefront/campaign-home-repository.test.ts`

Expected: 20 failures caused by missing methods/types.

- [ ] **Step 3: Implement minimal repository methods**

```ts
async saveStarterThemeComposition(input: SaveStarterThemeCompositionInput) {
  const { parsed, authority } = this.authority(input,
    ["tenantContext", "now", "operationId", "composition", "expectedVersion"]);
  const composition = parseStarterThemeCompositionConfig(parsed.composition);
  const fingerprint = merchantAdminFingerprint("save_starter_composition", authority.storeId, {
    expectedVersion: parsed.expectedVersion,
    composition,
  });
  return this.mutate(authority, merchantAdminUuid(parsed.operationId), fingerprint, "saved", {
    text: "SELECT outcome,result_payload FROM saas.merchant_starter_composition_save($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::bigint,$11::jsonb)",
    values: [...authorityValues(authority), parsed.operationId, fingerprint, parsed.expectedVersion, JSON.stringify(composition)],
  }, parseStarterCompositionMutation, "merchant_starter_composition_recover_operation");
}
```

The public repository calls one host-resolver SQL boundary and parses the exact v2 projection plus bounded product rows.

- [ ] **Step 4: Write migration 074 and its 32-scenario disposable PostgreSQL harness**

The up migration must:

- add `starter_theme_composition` to the finite merchant-admin kind validator;
- validate schema version, exact JSON shape, counts, destinations, and reference UUIDs;
- lock and validate every product/category/asset reference against the same active store;
- create idempotent versioned save/get/recovery functions;
- publish only complete active composition snapshots;
- replace public presentation resolution with schema-v2 output and a v1 compatibility path;
- grant only the existing narrow roles and revoke PUBLIC.

The 32 labeled harness scenarios must cover install, checksum, validation, cross-tenant product/category/asset denial, inactive reference denial, draft invisibility, active projection, exact v2 public shape, v1 compatibility, concurrent version conflict, replay, commit recovery evidence, RLS, ACL, resolver isolation, hostname isolation, no private IDs/object keys, backup/restore, rollback to 073 behavior, reapply, and cleanup.

- [ ] **Step 5: Run SQL/static tests and verify GREEN**

Run: `node tests/saas-phase3/starter-theme-composition/postgres-harness.mjs`

Expected: `32/32 PASS` on PostgreSQL 16 and disposable cluster cleanup PASS.

Run: `node --test tests/saas-phase3/starter-theme-composition/static-security.test.mjs`

Expected: all static-security assertions PASS.

Run: `npm test --workspace @celebix/saas-data && npm run typecheck --workspace @celebix/saas-data`

Expected: 428/428 PASS; typecheck PASS.

- [ ] **Step 6: Commit persistence authority**

```bash
git add apps/owner/scripts/sql/saas/202608010074_campaign_starter_composition.* apps/owner/scripts/sql/saas/phase4d-campaign-starter-composition-manifest.json packages/saas-contracts/src/merchant-admin packages/saas-data/src/merchant-admin packages/saas-data/src/storefront tests/saas-phase3/starter-theme-composition tests/saas-phase3/run-current-suite.mjs
git diff --check
git commit -m "feat(saas): persist campaign starter composition"
```

---

### Task 3: Build the customer-panel Campaign Starter composer

**Files:**
- Create: `apps/customer-panel/lib/starter-theme-composer-model.ts`
- Create: `apps/customer-panel/lib/starter-theme-composer-model.test.ts`
- Create: `apps/customer-panel/components/settings/StarterThemeComposer.tsx`
- Create: `apps/customer-panel/components/settings/StarterThemeComposer.test.ts`
- Create: `apps/customer-panel/components/settings/starter-theme-composer.module.css`
- Modify: `apps/customer-panel/app/settings/theme/page.tsx:1-10`
- Modify: `apps/customer-panel/components/settings/DesignSettingsHub.tsx:1-80`
- Modify: `apps/customer-panel/components/settings/StarterThemePreview.tsx:1-90`
- Modify: `apps/customer-panel/lib/merchant-admin-ui/client.ts:1-220`
- Modify: `apps/customer-panel/lib/merchant-admin-ui/presentation.ts:90-170`
- Modify: `apps/customer-panel/lib/panel-ui/navigation.ts:45-55,190-210,285-310`
- Modify: `apps/customer-panel/lib/routes.test.ts:1-100` only if the new server page export makes one existing route assertion stale

**Interfaces:**
- Consumes: Task 1 config parser/defaults, Task 2 generic singleton API/repository, `catalogOnboardingClient.listCategories()`, existing product list APIs, `/api/storefront-assets`, `TenantContext` authorization, and `MerchantAdminRecord.version`.
- Produces: `buildStarterThemeComposition(input)`, `moveStarterSection(sections, index, offset)`, `StarterThemeComposer({ canManage })`, and a preview that accepts only parsed public/config data.

- [ ] **Step 1: Write twenty failing model/presentation tests**

```ts
test("composer builds one immutable bounded composition", () => {
  const value = buildStarterThemeComposition(validEditorState());
  assert.equal(value.sections.length, 5);
  assert.equal(Object.isFrozen(value.sections), true);
});

test("composer source contains no raw store or tenant authority", async () => {
  const source = await read("components/settings/StarterThemeComposer.tsx");
  assert.doesNotMatch(source, /storeId|tenantId|x-forwarded|localStorage/);
  assert.match(source, /credentials: "same-origin"/);
});
```

Create ten model tests and ten component/static tests. Cover reorder boundaries, duplicate singleton rejection, category/product/asset picker IDs, disabled role, loading/empty/error/conflict/saved states, draft visibility, publish action, accessible labels, keyboard reorder, responsive preview, and absence of raw identifier inputs.

- [ ] **Step 2: Run the focused panel tests and verify RED**

Run: `node --experimental-transform-types --test apps/customer-panel/lib/starter-theme-composer-model.test.ts apps/customer-panel/components/settings/StarterThemeComposer.test.ts`

Expected: 20 failures because model/component files do not exist.

- [ ] **Step 3: Implement the pure composer model**

```ts
export function moveStarterSection(
  sections: readonly StarterThemeSectionConfig[],
  index: number,
  offset: -1 | 1,
): readonly StarterThemeSectionConfig[] {
  const destination = index + offset;
  if (destination < 0 || destination >= sections.length) return sections;
  const next = [...sections];
  [next[index], next[destination]] = [next[destination]!, next[index]!];
  return Object.freeze(next);
}

export function buildStarterThemeComposition(input: StarterThemeEditorState) {
  return parseStarterThemeCompositionConfig({ schemaVersion: 1, ...input });
}
```

- [ ] **Step 4: Implement the server-authorized composer and same-origin loading**

`page.tsx` obtains `TenantContext` server-side and passes only `canManage`. The client loads the active/draft composition, active categories, public product picker rows, and active R2 assets through existing same-origin APIs. It saves with `recordId` plus `expectedVersion`; stale conflicts remain visible and require reload. Pointer controls may supplement but never replace up/down keyboard controls.

```tsx
export default async function ThemeSettingsPage() {
  const { tenantContext } = await requireServerPanelAccess();
  return <StarterThemeComposer
    canManage={isMerchantActionAllowed(tenantContext.membership.role, "configuration.manage")}
  />;
}
```

- [ ] **Step 5: Run focused and full customer-panel verification GREEN**

Run: `node --experimental-transform-types --test apps/customer-panel/lib/starter-theme-composer-model.test.ts apps/customer-panel/components/settings/StarterThemeComposer.test.ts`

Expected: 20/20 PASS.

Run: `npm test --workspace @celebix/customer-panel && npm run typecheck --workspace @celebix/customer-panel && npm run build --workspace @celebix/customer-panel`

Expected: 868/868 tests PASS (one pre-existing skip remains reported separately); typecheck PASS; build PASS.

- [ ] **Step 6: Commit the composer**

```bash
git add apps/customer-panel/app/settings/theme apps/customer-panel/components/settings apps/customer-panel/lib/starter-theme-composer-model* apps/customer-panel/lib/merchant-admin-ui apps/customer-panel/lib/panel-ui/navigation.ts apps/customer-panel/lib/routes.test.ts
git diff --check
git commit -m "feat(panel): add campaign starter composer"
```

---

### Task 4: Render server-owned campaign navigation

**Files:**
- Create: `apps/storefront-shared/components/CampaignHeader.tsx`
- Create: `apps/storefront-shared/components/CampaignHeaderClient.tsx`
- Create: `apps/storefront-shared/components/CampaignHeader.test.ts`
- Create: `apps/storefront-shared/components/campaign-header.module.css`
- Modify: `apps/storefront-shared/components/Header.tsx:1-11`
- Modify: `apps/storefront-shared/components/StorefrontFrame.tsx:1-30`
- Modify: `apps/storefront-shared/app/globals.css:1-420`

**Interfaces:**
- Consumes: `PublicStarterNavigation`, `PublicStorefront`, existing `StoreUtilities`, and safe category slugs from Task 2.
- Produces: `CampaignHeader({ storefront })`, with desktop mega navigation and `CampaignHeaderClient({ navigation, displayName })` for bounded mobile/dialog behavior only.

- [ ] **Step 1: Write six failing navigation tests**

```ts
test("desktop navigation uses only public category slugs", async () => {
  const source = await read("components/CampaignHeader.tsx");
  assert.match(source, /`\/categories\/\$\{item[.]slug\}`/);
  assert.doesNotMatch(source, /item[.]id|storeId|tenantId/);
});

test("mobile menu restores focus and closes on Escape", async () => {
  const source = await read("components/CampaignHeaderClient.tsx");
  assert.match(source, /event[.]key === "Escape"/);
  assert.match(source, /triggerRef[.]current[?][.]focus/);
});
```

Cover exact active-path matching (`/products-evil` is not Products), nested disclosure, focus trap/restoration, backdrop, 48×48 controls, and no browser authority.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --experimental-transform-types --test apps/storefront-shared/components/CampaignHeader.test.ts`

Expected: 6 failures because the Campaign Header files do not exist.

- [ ] **Step 3: Implement server markup and bounded mobile behavior**

```tsx
export function CampaignHeader({ storefront }: { storefront: PublicStorefront }) {
  return <header className={styles.header} data-header-style={storefront.presentation.visual.headerStyle}>
    <CampaignHeaderClient
      displayName={storefront.presentation.displayName}
      logo={storefront.presentation.logo}
      navigation={storefront.presentation.navigation}
    />
  </header>;
}
```

Use an `IntersectionObserver` sentinel only to toggle opaque header styling; it must not affect authority or navigation destinations. Keep search/favorite/account/cart utilities connected to existing providers/routes.

- [ ] **Step 4: Run tests GREEN and commit**

Run: `node --experimental-transform-types --test apps/storefront-shared/components/CampaignHeader.test.ts`

Expected: 6/6 PASS.

```bash
git add apps/storefront-shared/components/CampaignHeader* apps/storefront-shared/components/campaign-header.module.css apps/storefront-shared/components/Header.tsx apps/storefront-shared/components/StorefrontFrame.tsx apps/storefront-shared/app/globals.css
git diff --check
git commit -m "feat(storefront): add campaign navigation"
```

---

### Task 5: Render the modular Campaign Starter home page

**Files:**
- Create: `apps/storefront-shared/components/CampaignHome.tsx`
- Create: `apps/storefront-shared/components/CampaignHero.tsx`
- Create: `apps/storefront-shared/components/CampaignHeroClient.tsx`
- Create: `apps/storefront-shared/components/CampaignProductRow.tsx`
- Create: `apps/storefront-shared/components/CampaignPanels.tsx`
- Create: `apps/storefront-shared/components/CampaignHome.test.ts`
- Create: `apps/storefront-shared/components/campaign-home.module.css`
- Modify: `apps/storefront-shared/app/page.tsx:1-55`
- Modify: `apps/storefront-shared/lib/page-context.ts:1-180`

**Interfaces:**
- Consumes: `PublicStarterHomeSection[]` and `CampaignHomeProjection` from Task 2, `ProductCard`, canonical public products, and public R2 assets.
- Produces: `CampaignHome({ storefront, projection })` and one exhaustive section renderer that returns `null` for unavailable optional sections.

- [ ] **Step 1: Write eight failing home composition tests**

```ts
test("home exhaustively renders the finite public section union", async () => {
  const source = await read("components/CampaignHome.tsx");
  for (const kind of ["hero", "category_grid", "product_row", "split_campaign", "brand_story"])
    assert.match(source, new RegExp(`case [\"']${kind}[\"']`));
  assert.match(source, /assertNever/);
});

test("empty optional sections do not create blank storefront bands", () => {
  assert.deepEqual(visibleCampaignSections(emptyProjection()), ["hero"]);
});
```

Cover hero desktop/mobile media, hotspot only for a resolved product, category hierarchy, latest/sale/category rows, split panels, brand story, stable dimensions, safe relative links, and empty/partial/full states.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --experimental-transform-types --test apps/storefront-shared/components/CampaignHome.test.ts`

Expected: 8 failures because the Campaign Home components do not exist.

- [ ] **Step 3: Implement the exhaustive server renderer**

```tsx
function Section({ section, projection }: CampaignSectionProps) {
  switch (section.kind) {
    case "hero": return <CampaignHero section={section} products={projection.hotspotProducts} />;
    case "category_grid": return <CategoryShowcase showcase={section} />;
    case "product_row": return <CampaignProductRow section={section} products={projection.productRows[section.key] ?? []} />;
    case "split_campaign": return <CampaignPanels panels={section.panels} />;
    case "brand_story": return <CampaignStory section={section} />;
    default: return assertNever(section);
  }
}
```

Keep noninteractive blocks server-rendered. Hero rotation uses CSS scroll-snap plus explicit previous/next controls; autoplay is off by default and pauses under reduced motion.

- [ ] **Step 4: Run tests GREEN and commit**

Run: `node --experimental-transform-types --test apps/storefront-shared/components/CampaignHome.test.ts`

Expected: 8/8 PASS.

```bash
git add apps/storefront-shared/app/page.tsx apps/storefront-shared/lib/page-context.ts apps/storefront-shared/components/Campaign* apps/storefront-shared/components/campaign-home.module.css
git diff --check
git commit -m "feat(storefront): render campaign home sections"
```

---

### Task 6: Upgrade product cards and add canonical quick view

**Files:**
- Create: `apps/storefront-shared/components/ProductQuickView.tsx`
- Create: `apps/storefront-shared/components/ProductQuickView.test.ts`
- Create: `apps/storefront-shared/components/product-quick-view.module.css`
- Modify: `apps/storefront-shared/components/ProductCard.tsx:1-160`
- Modify: `apps/storefront-shared/components/ProductCardCartButton.tsx:1-150`
- Modify: `apps/storefront-shared/components/ProductGrid.tsx:1-80`
- Modify: `apps/storefront-shared/app/globals.css:420-760`

**Interfaces:**
- Consumes: canonical `PublicProduct`, existing `FavoriteButton`, `ProductCardCartButton`, and `CartStatusProvider`.
- Produces: `ProductQuickView({ product, triggerRef, onClose })` and truth-derived `productBadge(product): "sale" | "unavailable" | null`.

- [ ] **Step 1: Write four failing quick-view/card tests**

```ts
test("product badge is derived only from canonical price and availability", () => {
  assert.equal(productBadge({ ...product(), compareAtCents: 2000, priceCents: 1500 }), "sale");
  assert.equal(productBadge({ ...product(), available: false }), "unavailable");
});

test("variant products require selection instead of an invented default", () => {
  assert.equal(cardAction(variantProduct()), "choose_options");
});
```

Also prove focus/Escape/restoration and that quick view renders canonical media/prices without internal IDs or browser-computed totals.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --experimental-transform-types --test apps/storefront-shared/components/ProductQuickView.test.ts`

Expected: 4 failures because quick-view functions/components do not exist.

- [ ] **Step 3: Implement cards and quick view**

Use first media as the stable image, second media only as a hover enhancement, and intrinsic dimensions/aspect ratio for both. “Hızlı ekle” calls the existing cart mutation only for a single unambiguous variant; otherwise “Seçenekleri seç” opens quick view. The dialog reuses `ProductPurchasePanel` and does not duplicate cart logic.

- [ ] **Step 4: Run tests GREEN and commit**

Run: `node --experimental-transform-types --test apps/storefront-shared/components/ProductQuickView.test.ts`

Expected: 4/4 PASS.

```bash
git add apps/storefront-shared/components/ProductCard* apps/storefront-shared/components/ProductGrid.tsx apps/storefront-shared/components/ProductQuickView* apps/storefront-shared/components/product-quick-view.module.css apps/storefront-shared/app/globals.css
git diff --check
git commit -m "feat(storefront): add canonical product quick view"
```

---

### Task 7: Upgrade product detail and server-owned recommendations

**Files:**
- Create: `apps/storefront-shared/components/ProductDetailExperience.tsx`
- Create: `apps/storefront-shared/components/ProductDetailExperience.test.ts`
- Create: `apps/storefront-shared/components/product-detail-experience.module.css`
- Modify: `apps/storefront-shared/app/products/[slug]/page.tsx:1-180`
- Modify: `apps/storefront-shared/components/ProductGallery.tsx:1-180`
- Modify: `apps/storefront-shared/components/ProductPurchasePanel.tsx:1-240`
- Modify: `apps/storefront-shared/components/ProductDescription.tsx:1-120`
- Modify: `packages/saas-contracts/src/storefront/types.ts:72-130`
- Modify: `packages/saas-contracts/src/storefront/validation.ts:176-260`
- Modify: `packages/saas-contracts/src/storefront/campaign-starter.test.ts:1-260`
- Modify: `packages/saas-data/src/storefront/repository.ts:1-300`
- Modify: `packages/saas-data/src/storefront/campaign-home-repository.test.ts:1-260`

**Interfaces:**
- Consumes: public product projection, public brand/category path added in this task, Task 1 `productDetail` options, existing safe Markdown renderer, cart mutation, and store-scoped repository context.
- Produces: optional public `brand`, immutable `categoryPath`, `listRelatedPublicProducts({ storefront, productSlug, limit })`, and `ProductDetailExperience`.

- [ ] **Step 1: Write four failing detail/recommendation tests**

```ts
test("related products derive the store and category from persisted authority", async () => {
  await repository.listRelatedPublicProducts({ storefront, productSlug: "yuzuk", limit: 4 });
  assert.equal(pool.calls[0]?.values.includes(storefront.id), false);
  assert.match(pool.calls[0]?.text ?? "", /public_storefront_related_products/);
});

test("buy now reuses canonical cart before checkout", async () => {
  const source = await read("components/ProductPurchasePanel.tsx");
  assert.match(source, /replaceCart/);
  assert.match(source, /router[.]push\("\/checkout"\)/);
});
```

Also extend the existing Task 1 and Task 2 test cases—without adding top-level test counts—to prove the public brand/category projection, ordered media with stable dimensions, same-store recommendation query, and policy accordions linking only to the seven real policy routes.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --experimental-transform-types --test apps/storefront-shared/components/ProductDetailExperience.test.ts`

Expected: 4 failures because detail experience and related repository functions do not exist.

- [ ] **Step 3: Implement detail composition**

Render gallery and a sticky purchase column on desktop, a swipe/thumbnail gallery and non-obscuring sticky purchase bar on mobile, Markdown description, real policy links, and same-category recommendations. The public resolver derives category membership from the selected product and falls back to latest products only within the same selected storefront.

- [ ] **Step 4: Run tests GREEN and commit**

Run: `node --experimental-transform-types --test apps/storefront-shared/components/ProductDetailExperience.test.ts`

Expected: 4/4 PASS.

```bash
git add apps/storefront-shared/app/products apps/storefront-shared/components/ProductDetailExperience* apps/storefront-shared/components/product-detail-experience.module.css apps/storefront-shared/components/ProductGallery.tsx apps/storefront-shared/components/ProductPurchasePanel.tsx apps/storefront-shared/components/ProductDescription.tsx packages/saas-contracts/src/storefront packages/saas-data/src/storefront
git diff --check
git commit -m "feat(storefront): upgrade campaign product detail"
```

---

### Task 8: Align side cart with the Campaign Starter experience

**Files:**
- Modify: `apps/storefront-shared/components/SideCartDrawer.tsx:1-260`
- Modify: `apps/storefront-shared/components/SideCartDrawer.test.ts:1-220`
- Modify: `apps/storefront-shared/components/CartStatusProvider.tsx:1-220`
- Modify: `apps/storefront-shared/app/globals.css:760-1200`

**Interfaces:**
- Consumes: existing `PublicCart`, `checkoutBlocker`, canonical mutation clients, and Task 1 cart options.
- Produces: the same `CartStatusProvider` interface and drawer routes; no new cart state or checkout endpoint.

- [ ] **Step 1: Add four failing side-cart tests**

```ts
test("drawer never claims free shipping without a canonical threshold", async () => {
  const source = await read("components/SideCartDrawer.tsx");
  assert.doesNotMatch(renderWithoutThreshold(source), /Ücretsiz kargo/);
});

test("drawer checkout button preserves the existing checkout route", async () => {
  const source = await read("components/SideCartDrawer.tsx");
  assert.match(source, /href="\/checkout"/);
});
```

Add assertions for Campaign visual classes, canonical first image, exact variant copy, and unchanged focus/Escape/backdrop/restoration semantics.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --experimental-transform-types --test apps/storefront-shared/components/SideCartDrawer.test.ts`

Expected: the four new assertions fail while the existing six tests remain green.

- [ ] **Step 3: Implement the Campaign side-cart presentation**

Restyle the existing dialog into a premium editorial drawer, preserve its state provider and mutation functions, show checkout readiness truthfully, and show shipping progress only when the canonical public cart supplies a real threshold. Do not add local subtotal/stock calculations.

- [ ] **Step 4: Run side-cart tests GREEN and commit**

Run: `node --experimental-transform-types --test apps/storefront-shared/components/SideCartDrawer.test.ts`

Expected: 10/10 PASS.

```bash
git add apps/storefront-shared/components/SideCartDrawer.tsx apps/storefront-shared/components/SideCartDrawer.test.ts apps/storefront-shared/components/CartStatusProvider.tsx apps/storefront-shared/app/globals.css
git diff --check
git commit -m "style(storefront): align campaign side cart"
```

---

### Task 9: Add integrated storefront security, accessibility, and responsive gates

**Files:**
- Create: `apps/storefront-shared/lib/campaign-starter.test.ts`
- Create: `tests/saas-phase3/starter-theme-composition/in-process.test.mjs`
- Modify: `tests/saas-phase3/starter-commerce/static-security.test.mjs:1-260`
- Modify: `tests/saas-phase3/starter-commerce/in-process.test.mjs:1-320`
- Modify: `tests/saas-phase3/current-test-matrix.json:1-200`

**Interfaces:**
- Consumes: all preceding tasks and their stable public interfaces.
- Produces: seven integrated storefront tests, current cumulative Phase 3 registration, and static forbidden-authority/secret/donor scans.

- [ ] **Step 1: Write seven failing integrated tests**

```ts
test("campaign starter keeps every destination same-store relative", async () => {
  for (const source of await campaignSources()) {
    assert.doesNotMatch(source, /https?:\/\/(?!media[.]saas-staging[.]celebix[.]site)/);
  }
});

test("responsive campaign controls preserve required touch and motion rules", async () => {
  const css = await read("app/globals.css");
  assert.match(css, /min-(?:width|height): 48px/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /0[.]01ms/);
});
```

Cover v1 store compatibility, v2 full composition, empty store, safe missing media, exact 320/1024/1025 breakpoints, no private identifiers, and no Shopify/Impulse donor identifiers or assets.

- [ ] **Step 2: Run integrated tests and verify RED**

Run: `NODE_OPTIONS='--conditions=react-server' node --experimental-transform-types --test apps/storefront-shared/lib/campaign-starter.test.ts tests/saas-phase3/starter-theme-composition/in-process.test.mjs`

Expected: seven failing assertions until all integrated surfaces and test matrix entries exist.

- [ ] **Step 3: Add the static and in-process gates**

The security test scans changed application sources for `tenantId`, browser `storeId`, internal object keys, arbitrary external media URLs, `dangerouslySetInnerHTML` outside the reviewed Markdown renderer, donor names/assets, secrets, iframe/proxy additions, and production activation. The in-process test invokes real page context/repository adapters with empty, v1, and v2 storefronts.

- [ ] **Step 4: Run the complete local green matrix**

Run:

```bash
npm test --workspace @celebix/saas-contracts
npm test --workspace @celebix/saas-data
npm test --workspace @celebix/customer-panel
npm test --workspace @celebix/storefront-shared
npm run typecheck --workspace @celebix/saas-contracts
npm run typecheck --workspace @celebix/saas-data
npm run typecheck --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/storefront-shared
npm run build --workspace @celebix/customer-panel
npm run build --workspace @celebix/storefront-shared
npm run typecheck --workspace @celebix/owner
npm run build --workspace @celebix/owner
node tests/saas-phase3/starter-theme-composition/postgres-harness.mjs
npm run test:saas-phase3:current
git diff --check
```

Expected: contracts 198/198; data 428/428; customer-panel 868/868 with the existing skip reported separately; storefront 300/300; PostgreSQL starter composition 32/32; cumulative Phase 3 PASS; all typechecks/builds PASS; diff check PASS.

- [ ] **Step 5: Run forbidden-ID and secret scans**

```bash
git diff --name-only 22664867f87d120d1a502143c591e4faa2111ad0...HEAD
git diff 22664867f87d120d1a502143c591e4faa2111ad0...HEAD | rg -n "(BEGIN (RSA|EC|OPENSSH) PRIVATE KEY|AWS_SECRET|R2_SECRET|DATABASE_URL|panel_session|pb1|shopify|archetype|impulse)"
git diff 22664867f87d120d1a502143c591e4faa2111ad0...HEAD | rg -n "(tenantId|storeId|x-forwarded|localStorage)"
```

Expected: first command lists only planned files; both scans return no unreviewed matches. Reviewed type/test references must be explained in the commit report rather than silently ignored.

- [ ] **Step 6: Commit the integrated gates**

```bash
git add apps/storefront-shared/lib/campaign-starter.test.ts tests/saas-phase3/starter-theme-composition tests/saas-phase3/starter-commerce tests/saas-phase3/current-test-matrix.json
git diff --check
git commit -m "test(storefront): gate campaign starter quality"
```

---

### Task 10: Perform local visual and accessibility acceptance

**Files:**
- No tracked source files.
- Create only untracked evidence under `.codex-evidence/campaign-starter/` and remove it before final worktree verification unless the user explicitly requests retention.

**Interfaces:**
- Consumes: exact branch HEAD after Task 9 and a local non-production fixture using canonical public projections.
- Produces: measured acceptance evidence; no deployment or external mutation.

- [ ] **Step 1: Start the exact local storefront build**

Run: `npm run build --workspace @celebix/storefront-shared && npm run start --workspace @celebix/storefront-shared`

Expected: build PASS and local server listens on port 3450.

- [ ] **Step 2: Capture the exact screenshot matrix**

Capture home at 1440×1000, 1025×768, 1024×768, 390×844, and 320×720; desktop mega navigation; mobile nested navigation; product detail at 1440×1000 and 390×844; quick view; side cart; cart; checkout; empty store; and missing-media states. Store temporary PNGs under `.codex-evidence/campaign-starter/`.

Expected: all required surfaces render, 1024 uses mobile navigation, 1025 uses desktop navigation, and no screenshot contains clipped text, blank configured sections, or horizontal scroll.

- [ ] **Step 3: Measure interaction and accessibility invariants**

Verify with browser evaluation:

- `document.documentElement.scrollWidth === document.documentElement.clientWidth` at every width;
- all visible touch controls are at least 48×48 px on 390×844 and 320×720;
- primary CTA contrast is at least 4.5:1;
- reduced-motion computed transition/animation duration is approximately `0.01ms`;
- mega menu, mobile menu, quick view, gallery, and side cart work by keyboard;
- Escape/backdrop/close restore focus;
- mobile sticky purchase and side-cart footer do not cover inputs/content;
- console and network failures are zero in the happy path.

- [ ] **Step 4: Record performance measurements**

Use the agreed local throttling profile and record representative mobile LCP and CLS. Expected: LCP at most 2.5 seconds and CLS at most 0.1. If local tooling cannot produce a stable network profile, report the measurement as local-only and do not claim staging performance.

- [ ] **Step 5: Verify git state and remote-ready history**

Run:

```bash
git status --short
git log --oneline 22664867f87d120d1a502143c591e4faa2111ad0..HEAD
git diff --check
```

Expected: only intentionally retained untracked evidence is present, all nine task commits are ordered and independently reviewable, and diff check PASS. Remove temporary evidence before push unless retention is explicitly requested.

No staging deploy occurs in this plan. A separately authorized exact-SHA staging gate must repeat the screenshot/accessibility/security checks against a genuine tenant before the full phase can be called complete.
