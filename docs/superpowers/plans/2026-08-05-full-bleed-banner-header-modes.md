# Full-Bleed Banner and Header Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render uploaded storefront banners as uncropped full-width artwork and apply the existing tenant-owned `overlay | solid` header selection consistently in the live storefront and admin preview.

**Architecture:** Reuse the existing tenant-owned header enum; do not add a contract, migration, or browser authority. Live storefront header placement remains owned by `CampaignHeader` through `presentation.visual.headerStyle`. `DesignPreview` passes its draft `design.composition.visual.headerStyle` explicitly to `StorefrontDesignRenderer`, which derives a fail-closed preview mode and renders image-backed slides without the legacy copy column. The admin composer keeps the same enum and its secondary composition preview uses matching layout classes.

**Tech Stack:** React 19, TypeScript 5.9, CSS/CSS Modules, Node test runner, Next.js 16 workspaces.

## Global Constraints

- Uploaded banner artwork must remain one complete responsive image; no split copy panel and no cropping.
- `composition.visual.headerStyle` is the only persisted authority and remains exactly `"overlay" | "solid"`.
- Overlay fails closed to solid when there is no visible image-backed home hero or when home surfaces are disabled.
- Existing slider navigation, autoplay, focus pause, responsive source, reduced-motion, announcement, logo, promotion, and tenant isolation behavior remains unchanged.
- No dependency, contract, PostgreSQL migration, production deployment, browser authority, unsafe HTML, or new theme data source.
- Staging deployment is limited to Güzide customer-panel and storefront after local verification.

---

### Task 1: Live storefront full-bleed hero and effective header mode

**Files:**
- Modify: `packages/storefront-design-ui/src/StorefrontDesignRenderer.test.ts:41-55`
- Modify: `packages/storefront-design-ui/src/StorefrontDesignRenderer.tsx:13-68`
- Modify: `packages/storefront-design-ui/src/storefront-design.css:23-71`

**Interfaces:**
- Consumes: explicit optional `headerStyle: "overlay" | "solid"`, `PublicStorefrontDesignHeroSlide.desktopImage`, `showHeader`, and `showHomeSurfaces`. Live storefront authority remains in `CampaignHeader`.
- Produces: `effectiveHeaderStyle: "overlay" | "solid"`, `.celebix-store-hero-shell[data-header-style]`, and image-backed slides without `.celebix-store-hero-copy`.

- [ ] **Step 1: Write failing renderer and stylesheet authority tests**

Extend the existing source-security test with assertions equivalent to:

```ts
assert.match(source, /headerStyle\s*=\s*"solid"/);
assert.match(source, /effectiveHeaderStyle/);
assert.match(source, /celebix-store-hero-shell/);
assert.match(source, /slide[.]desktopImage\s*[?]/);
```

Add a stylesheet test that reads `storefront-design.css` and proves:

```ts
assert.doesNotMatch(css, /data-has-image="true"[^}]*grid-template-columns/);
assert.match(css, /celebix-store-hero-shell\[data-header-style="overlay"\][\s\S]*position:\s*absolute/);
assert.match(css, /celebix-store-hero\[data-has-image="true"\][\s\S]*min-height:\s*0/);
assert.match(css, /celebix-store-hero\s*>\s*picture\s+img[\s\S]*height:\s*auto/);
assert.doesNotMatch(css, /celebix-store-hero\s*>\s*picture\s+img[\s\S]{0,180}object-fit:\s*cover/);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm test --workspace @celebix/storefront-design-ui
```

Expected: FAIL because `effectiveHeaderStyle`, the hero shell, overlay selector, and full-bleed no-crop rules do not exist while the split grid still exists.

- [ ] **Step 3: Implement one shared header and fail-closed effective mode**

In `StorefrontDesignRenderer`, derive:

```ts
const homeHeroVisible = showHomeSurfaces && design.hero.enabled && slides.length > 0;
const activeHeroHasImage = Boolean(slides[activeSlide]?.desktopImage);
const effectiveHeaderStyle = homeHeroVisible
  && activeHeroHasImage
  && headerStyle === "overlay"
  ? "overlay"
  : "solid";
```

Add `headerStyle?: "overlay" | "solid"` to the renderer props with the fail-closed default `"solid"`. `DesignPreview` passes `design.composition.visual.headerStyle`; the public design contract remains unchanged. Create one `header` JSX value. Render it before the hero only for `solid`; render the same value inside `.celebix-store-hero-shell[data-header-style="overlay"]` only for `overlay`. Preserve `showHeader=false` exactly.

Within each slide, use an image-or-fallback branch:

```tsx
{slide.desktopImage ? (
  <picture>
    <source media="(max-width: 720px)" srcSet={slide.mobileImage?.url ?? slide.desktopImage.url} />
    <img src={slide.desktopImage.url} alt={slide.desktopImage.altText} />
  </picture>
) : (
  <div className="celebix-store-hero-copy">
    <small>{storeName}</small>
    <h1>{slide.headline}</h1>
    {slide.body ? <p>{slide.body}</p> : null}
    {slide.destination ? <a href={slide.destination.path} tabIndex={index === activeSlide ? undefined : -1}>Keşfet</a> : null}
  </div>
)}
```

This keeps legacy text fallback but prevents duplicate text for designed artwork.

- [ ] **Step 4: Implement full-bleed and overlay CSS**

Replace the split-image selectors with rules equivalent to:

```css
.celebix-store-hero-shell { position: relative; }
.celebix-store-hero-shell[data-header-style="overlay"] > .celebix-store-header {
  position: absolute;
  z-index: 4;
  inset: 0 0 auto;
  color: #fff;
  background: linear-gradient(180deg, rgb(0 0 0 / 48%), transparent);
}
.celebix-store-hero[data-has-image="true"] { min-height: 0; display: block; }
.celebix-store-hero[data-has-image="true"] > picture { min-height: 0; }
.celebix-store-hero[data-has-image="true"] > picture img {
  width: 100%;
  height: auto;
  min-height: 0;
  object-fit: contain;
}
```

Keep a minimum height only for `data-has-image="false"`. Keep controls above the image and remove the mobile `max-height` crop.

- [ ] **Step 5: Run focused tests and typecheck for GREEN**

Run:

```bash
npm test --workspace @celebix/storefront-design-ui
npm run typecheck --workspace @celebix/storefront-design-ui
```

Expected: all storefront-design-ui tests PASS and TypeScript exits 0.

- [ ] **Step 6: Commit Task 1**

```bash
git add packages/storefront-design-ui/src/StorefrontDesignRenderer.tsx packages/storefront-design-ui/src/storefront-design.css packages/storefront-design-ui/src/StorefrontDesignRenderer.test.ts
git commit -m "feat(storefront): render full-bleed banner header modes"
```

---

### Task 2: Admin header labels and truthful composition preview

**Files:**
- Modify: `apps/customer-panel/components/settings/StarterThemeComposer.test.ts:23-85`
- Modify: `apps/customer-panel/components/settings/StarterThemeComposer.tsx:216-226`
- Modify: `apps/customer-panel/components/settings/StarterThemePreview.tsx:75-118`
- Modify: `apps/customer-panel/components/settings/starter-theme-preview.module.css:182-300`

**Interfaces:**
- Consumes: the existing strict `StarterThemeCompositionConfigV2.visual.headerStyle` enum.
- Produces: unambiguous labels `Banner üzerinde (şeffaf)` and `Banner dışında (düz zemin)`, plus `.previewHeroShell[data-header-style]` that demonstrates both choices without adding storage authority.

- [ ] **Step 1: Write failing composer and preview tests**

Add tests equivalent to:

```ts
test("composer exposes the two existing header modes with explicit placement labels", async () => {
  const value = await source("StarterThemeComposer.tsx");
  assert.match(value, /Banner üzerinde \(şeffaf\)/);
  assert.match(value, /Banner dışında \(düz zemin\)/);
  assert.doesNotMatch(value, /sticky|fixedHeader|headerPosition/);
});

test("composition preview applies the persisted header style", async () => {
  const value = await source("StarterThemePreview.tsx");
  assert.match(value, /composition[.]visual[.]headerStyle/);
  assert.match(value, /previewHeroShell/);
  assert.match(value, /data-header-style/);
});
```

Extend the CSS-module test expectations to cover an overlay nav rule with absolute positioning and a solid nav rule in normal flow.

- [ ] **Step 2: Run the focused customer-panel component test and verify RED**

Run:

```bash
node --experimental-transform-types --test apps/customer-panel/components/settings/StarterThemeComposer.test.ts
```

Expected: FAIL because the explicit labels, preview shell, and header-style data attribute do not exist.

- [ ] **Step 3: Update the existing control without changing persistence**

Change only the option copy:

```tsx
<option value="overlay">Banner üzerinde (şeffaf)</option>
<option value="solid">Banner dışında (düz zemin)</option>
```

Do not introduce state outside `state.visual.headerStyle`.

- [ ] **Step 4: Apply header mode to the preview**

Wrap the preview nav and hero:

```tsx
<div className={styles.previewHeroShell} data-header-style={composition.visual.headerStyle}>
  <header className={styles.previewNav}>...</header>
  {hero?.kind === "hero" && hero.enabled ? (
    <section className={styles.previewHero} aria-label="Tam genişlik banner önizlemesi">
      <div className={styles.previewMedia} aria-hidden="true"><i /><i /></div>
    </section>
  ) : null}
</div>
```

The preview intentionally represents banner artwork as one full visual surface and does not reproduce the legacy copy column.

- [ ] **Step 5: Add matching preview CSS**

Add rules equivalent to:

```css
.previewHeroShell { position: relative; }
.previewHeroShell[data-header-style="overlay"] .previewNav {
  position: absolute;
  z-index: 2;
  inset: 0 0 auto;
  color: #fff;
  background: linear-gradient(180deg, rgb(0 0 0 / 46%), transparent);
}
.previewHeroShell[data-header-style="solid"] .previewNav { position: relative; }
.previewHero { min-height: 250px; padding: 0; display: block; }
.previewHero .previewMedia { min-height: 250px; border-radius: 0; }
```

Retain the mobile preview and accessibility focus rules.

- [ ] **Step 6: Run focused tests and customer-panel typecheck for GREEN**

Run:

```bash
node --experimental-transform-types --test apps/customer-panel/components/settings/StarterThemeComposer.test.ts
npm run typecheck --workspace @celebix/customer-panel
```

Expected: component tests PASS and TypeScript exits 0.

- [ ] **Step 7: Commit Task 2**

```bash
git add apps/customer-panel/components/settings/StarterThemeComposer.tsx apps/customer-panel/components/settings/StarterThemePreview.tsx apps/customer-panel/components/settings/starter-theme-preview.module.css apps/customer-panel/components/settings/StarterThemeComposer.test.ts
git commit -m "feat(customer-panel): preview storefront header modes"
```

---

### Task 3: Whole-branch verification, publication, and isolated staging gate

**Files:**
- Verify only; no new production or migration files.

**Interfaces:**
- Consumes: commits from Tasks 1 and 2.
- Produces: local proof, clean diff, normal push, exact-SHA staging deployment, and responsive screenshots.

- [ ] **Step 1: Run focused and workspace regressions**

```bash
npm test --workspace @celebix/storefront-design-ui
npm run typecheck --workspace @celebix/storefront-design-ui
node --experimental-transform-types --test apps/customer-panel/components/settings/StarterThemeComposer.test.ts
npm test --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/customer-panel
npm run build --workspace @celebix/customer-panel
npm test --workspace @celebix/storefront-shared
npm run typecheck --workspace @celebix/storefront-shared
npm run build --workspace @celebix/storefront-shared
```

Expected: every command exits 0; no existing slider, theme publication, customer-panel, or storefront regression.

- [ ] **Step 2: Run hygiene and authority scans**

```bash
git diff --check
git status --short
git diff --name-only f62894bdec1e5bf542fd00153d3419c8136eb928...HEAD
git diff f62894bdec1e5bf542fd00153d3419c8136eb928...HEAD -- . ':!docs/**' | rg -n "tenantId|storeId|localStorage|sessionStorage|dangerouslySetInnerHTML|SUPABASE|DATABASE_URL" || true
```

Expected: only planned files plus docs are changed; no unsafe authority or secret-bearing addition.

- [ ] **Step 3: Push normally and prove remote parity**

```bash
git push origin codex/customer-panel-storefront-shortcut
git rev-parse HEAD
git rev-parse origin/codex/customer-panel-storefront-shortcut
```

Expected: local and remote SHAs are identical; no force-push.

- [ ] **Step 4: Deploy isolated staging from the exact SHA**

Deploy only the Güzide customer-panel staging service and Güzide storefront staging service from the exact pushed SHA. Do not deploy Owner, other storefronts, or production.

- [ ] **Step 5: Verify responsive storefront and admin behavior**

At desktop and mobile widths, verify:

- the uploaded Güzide banner occupies the full hero width without a left copy column;
- the complete banner composition remains visible without crop or distortion;
- admin selection `Banner üzerinde (şeffaf)` places header over the banner after publish;
- admin selection `Banner dışında (düz zemin)` places header before the banner after publish;
- logo, navigation, slider arrows/dots, mobile source, announcement, and content remain usable;
- no console error, horizontal overflow, cross-store media, raw identifier, or production request appears.

Expected: both modes pass and production impact remains zero.
