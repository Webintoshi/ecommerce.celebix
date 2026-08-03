# Jewelry Starter Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Starter storefront’ı mevcut public authority sınırlarını koruyarak onaylı kuyumculuk konseptine taşımak ve medyası eksik kategorileri yönetilebilir sıralı placeholder alanlarıyla göstermek.

**Architecture:** Mevcut campaign section union, Header, ProductGrid, cart/favorites ve RetailFooter korunur. Yeni saf placeholder modeli public navigation ile resolved category sections arasındaki farkı çıkarır; yeni semantic component bu modeli render eder. Görsel dönüşüm component CSS’inde yapılır, yeni runtime veya veri kontratı oluşturulmaz.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, CSS Modules, Node test runner, existing `@celebix/saas-contracts` public projections.

## Global Constraints

- Donor logo, fotoğraf, metin, URL, API veya HTML/CSS kopyası kaynak koda girmeyecek.
- Tenant/store/browser authority eklenmeyecek; yalnız public presentation ve product projection kullanılacak.
- Cart, favorites, checkout, account, exact-host resolver, SQL ve migration davranışı değişmeyecek.
- `apps/admin/**` değişmeyecek.
- Kategori fallback etiketleri exact `PLACEHOLDER 1…N`, en fazla 4 ve sıralı olacak.
- Masaüstü gerçek beyaz, siyah/charcoal ve ince sıcak-altın vurgu kullanacak; cream, pill-card ve glassmorphism olmayacak.

---

### Task 1: Immutable category placeholder model

**Files:**
- Create: `apps/storefront-shared/components/jewelry-category-placeholders.ts`
- Create: `apps/storefront-shared/components/jewelry-category-placeholders.test.ts`

**Interfaces:**
- Consumes: `PublicStarterNavigation`, `readonly PublicStarterHomeSection[]`, optional numeric limit.
- Produces: `deriveJewelryCategoryPlaceholders(navigation, sections, limit = 4): readonly { name: string; slug: string; label: string; destination: string }[]`.

- [ ] **Step 1: Write the failing tests**

```ts
test("missing category media becomes stable editable placeholders", () => {
  assert.deepEqual(deriveJewelryCategoryPlaceholders(navigation, sections), [
    { name: "Bileklikler", slug: "bileklikler", label: "PLACEHOLDER 1", destination: "/categories/bileklikler" },
    { name: "Yüzükler", slug: "yuzukler", label: "PLACEHOLDER 2", destination: "/categories/yuzukler" },
  ]);
});

test("resolved category media is never duplicated as a placeholder", () => {
  assert.deepEqual(deriveJewelryCategoryPlaceholders(navigation, resolvedSections), [
    { name: "Yüzükler", slug: "yuzukler", label: "PLACEHOLDER 1", destination: "/categories/yuzukler" },
  ]);
});
```

- [ ] **Step 2: Run RED**

Run: `NODE_OPTIONS='--conditions=react-server' node --experimental-transform-types --test components/jewelry-category-placeholders.test.ts`

Expected: FAIL because `jewelry-category-placeholders.ts` does not exist.

- [ ] **Step 3: Implement the minimal model**

```ts
export function deriveJewelryCategoryPlaceholders(navigation, sections, limit = 4) {
  const resolved = new Set(sections.flatMap((section) => section.kind === "category_grid" ? section.items.map(({ slug }) => slug) : []));
  return Object.freeze(navigation.items.filter(({ slug }) => !resolved.has(slug)).slice(0, limit).map(({ name, slug }, index) => Object.freeze({ name, slug, label: `PLACEHOLDER ${index + 1}`, destination: `/categories/${slug}` })));
}
```

- [ ] **Step 4: Run GREEN**

Run the Step 2 command. Expected: all placeholder model tests PASS.

### Task 2: Semantic placeholder category surface

**Files:**
- Create: `apps/storefront-shared/components/JewelryCategoryPlaceholders.tsx`
- Modify: `apps/storefront-shared/components/CampaignHome.tsx:20-31`
- Modify: `apps/storefront-shared/components/campaign-home.module.css:1-30`
- Test: `apps/storefront-shared/components/CampaignHome.test.ts`

**Interfaces:**
- Consumes: immutable placeholder items derived from public presentation navigation and sections.
- Produces: `<JewelryCategoryPlaceholders items />`, accessible links to `/categories/<slug>`.

- [ ] **Step 1: Add a failing rendered-markup test**

Render the component with one resolved and two unresolved categories. Assert literal `PLACEHOLDER 1`, `PLACEHOLDER 2`, category names and safe relative destinations; assert the resolved category label is absent.

- [ ] **Step 2: Run RED**

Run: `NODE_OPTIONS='--conditions=react-server' node --experimental-transform-types --test components/jewelry-category-placeholders.test.ts components/CampaignHome.test.ts`

Expected: FAIL because the JSX component/fallback rendering is missing.

- [ ] **Step 3: Implement the semantic section**

Use one `<section aria-labelledby>`, a heading `Kategorileri keşfedin`, and `<Link>` items containing `.categoryPlaceholderMedia`, exact placeholder label, category name and `Keşfet` action. Mount it from `CampaignHome` only when the derived list is non-empty.

- [ ] **Step 4: Run GREEN**

Run the Step 2 command. Expected: all focused tests PASS.

### Task 3: Jewelry visual system and responsive layout

**Files:**
- Modify: `apps/storefront-shared/components/campaign-home.module.css:1-35`
- Modify: `apps/storefront-shared/components/campaign-header.module.css:1-30`
- Modify: `apps/storefront-shared/app/globals.css:1-90,342-377,404-485`
- Test: `apps/storefront-shared/components/CampaignHome.test.ts`
- Test: `apps/storefront-shared/components/CampaignHeader.test.ts`
- Test: `apps/storefront-shared/components/ProductQuickView.test.ts`

**Interfaces:**
- Consumes: existing CSS class names and `data-header-*`/`data-footer-tone` attributes.
- Produces: true-white jewelry layout, 1440px desktop rails, 1024px mobile header boundary, 390px product rail/placeholder grid, reduced-motion-safe interactions.

- [ ] **Step 1: Add failing visual-contract assertions**

Assert the jewelry palette tokens, five-column desktop product grid/rail, placeholder grid, 2-column mobile placeholders, 48px controls, `@media(max-width:1024px)` and `prefers-reduced-motion` declarations.

- [ ] **Step 2: Run RED**

Run: `NODE_OPTIONS='--conditions=react-server' node --experimental-transform-types --test components/CampaignHome.test.ts components/CampaignHeader.test.ts components/ProductQuickView.test.ts`

Expected: FAIL on the missing jewelry palette/placeholder/responsive contracts.

- [ ] **Step 3: Implement minimal CSS and component class changes**

Match the approved concepts: black announcement, centered wordmark, uppercase nav, full-width hero, horizontal five-card rail, square campaign panels, four placeholder tiles, four-column values, black newsletter strip and open footer columns. Keep all existing semantic markup and cart/favorite handlers.

- [ ] **Step 4: Run GREEN**

Run the Step 2 command. Expected: focused tests PASS.

### Task 4: Admin preview placeholder visibility

**Files:**
- Modify: `apps/customer-panel/components/settings/StarterThemePreview.tsx:15-67`
- Modify: `apps/customer-panel/components/settings/design-settings.module.css`
- Modify: `apps/customer-panel/lib/design-settings.test.ts`

**Interfaces:**
- Consumes: `StarterThemeComposition.navigation.rootCategoryIds` and `category_grid` section configuration.
- Produces: draft preview slots labelled `PLACEHOLDER 1…N` when category references exist without resolved preview media.

- [ ] **Step 1: Add failing preview behavior test**

Assert that the preview source exposes a labelled category placeholder region and derives its count from configured root category IDs without inventing IDs.

- [ ] **Step 2: Run RED**

Run: `npm test --workspace @celebix/customer-panel -- --test-name-pattern="StarterThemePreview|design settings"`

Expected: FAIL because preview placeholder markup is absent.

- [ ] **Step 3: Implement preview-only category slots**

Render at most four presentation-only slots after the product preview. Each slot uses its ordinal label and does not expose raw category UUIDs.

- [ ] **Step 4: Run GREEN**

Run the Step 2 command. Expected: focused customer-panel tests PASS.

### Task 5: Full verification and visual fidelity

**Files:**
- No production file additions.

**Interfaces:**
- Consumes: completed implementation and approved concept images.
- Produces: test/build/browser evidence and a five-point fidelity ledger.

- [ ] **Step 1: Run complete automated verification**

```bash
npm test --workspace @celebix/storefront-shared
npm run typecheck --workspace @celebix/storefront-shared
npm run build --workspace @celebix/storefront-shared
npm test --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/customer-panel
git diff --check
```

- [ ] **Step 2: Run Browser desktop QA**

Verify header/hero/product/category placeholder/value/footer DOM, product detail link, favorite control and `Sepete ekle` → side cart.

- [ ] **Step 3: Run mobile visual QA**

At 390×844 and 320×720 verify no page overflow, 48px controls, product rail, 2-column placeholders, mobile drawer and footer disclosures.

- [ ] **Step 4: Compare accepted concepts and latest screenshots**

Use `view_image` on both approved concepts and latest desktop/mobile render captures. Record at least palette, header, hero, product rail, placeholders, footer and responsive comparison points; repair every material mismatch.

- [ ] **Step 5: Commit and push**

```bash
git add docs/superpowers/specs/2026-08-03-jewelry-starter-theme-design.md docs/superpowers/plans/2026-08-03-jewelry-starter-theme.md apps/storefront-shared apps/customer-panel
git commit -m "feat(storefront): add jewelry starter theme"
git push origin codex/starter-theme-impulse-quality
```
