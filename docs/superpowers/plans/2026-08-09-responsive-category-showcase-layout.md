# Responsive Category Showcase Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add merchant-selectable `İki büyük` and `Grid` homepage category layouts whose saved PostgreSQL authority renders identically in customer-panel preview and the responsive storefront.

**Architecture:** Keep category image ownership in the existing R2/category-showcase record and add a finite `layout` field only to schema-v2 `category_grid` composition sections. Normalize legacy missing values to `grid`, project the exact value through PostgreSQL into the public presentation, and render it through finite React/CSS classes with no browser authority.

**Tech Stack:** TypeScript 5.9, React 19, Next.js 16 App Router, CSS Modules, Node test runner, PostgreSQL 16 migrations and disposable harnesses.

## Global Constraints

- `CategoryShowcaseLayout` is exactly `"duo" | "grid"`.
- Existing and new compositions default to `grid`.
- `duo`: two columns desktop/tablet, one mobile; `3 / 2` desktop and `4 / 3` mobile.
- `grid`: four columns desktop, two tablet/mobile, one below 340px; `1 / 1` media.
- Preview and public storefront consume the same persisted composition authority.
- Do not add layout to R2 asset records or category-showcase mappings.
- Do not use headers, query, cookies, local storage, image dimensions, or raw CSS values as layout authority.
- No dependency, external service, production configuration, credential, production deploy, or production mutation.
- Preserve category ordering, links, image bindings, tenant isolation, keyboard focus, reduced motion, and 48px interactive targets.

---

## File Structure

- `packages/saas-contracts/src/storefront/types.ts`: finite layout type and exact config/public contracts.
- `packages/saas-contracts/src/storefront/validation.ts`: strict schema-v2 parsing and legacy public normalization.
- `packages/saas-contracts/src/storefront/presentation.ts`: schema-v1 presentation adaptation to explicit `grid`.
- `packages/saas-contracts/src/index.ts` and `packages/saas-contracts/src/storefront/index.ts`: public type exports.
- `packages/saas-contracts/src/storefront/campaign-starter.test.ts`: contract red/green coverage.
- `apps/owner/scripts/sql/saas/202608090097_responsive_category_showcase_layout.{up,down}.sql`: durable upgrade, strict validation, public projection, guarded rollback.
- `apps/owner/scripts/sql/saas/202608090097_responsive_category_showcase_layout_assertions.sql`: catalog assertions.
- `apps/owner/scripts/sql/saas/phase4p-responsive-category-showcase-layout-manifest.json`: checksums.
- `tests/saas-phase3/responsive-category-showcase/postgres-harness.mjs`: PostgreSQL 16 migration, projection, rollback/reapply and cleanup proof.
- `apps/customer-panel/components/settings/StarterThemeComposer.tsx`: visual layout selector.
- `apps/customer-panel/components/settings/starter-theme-composer.module.css`: selector thumbnails and selected/focus states.
- `apps/customer-panel/components/settings/StarterThemePreview.tsx`: composition preview parity.
- `apps/customer-panel/components/settings/starter-theme-preview.module.css`: duo/grid preview geometry.
- `apps/customer-panel/components/settings/StarterThemeComposer.test.ts` and `apps/customer-panel/lib/starter-theme-composer-model.test.ts`: accessible UI/default/round-trip tests.
- `apps/storefront-shared/components/CampaignPanels.tsx`: finite public layout class.
- `apps/storefront-shared/components/campaign-home.module.css`: real responsive ratios and columns.
- `apps/storefront-shared/components/CampaignHome.test.ts`: renderer/static responsive assertions.
- Existing fixtures containing `category_grid`: add explicit `layout: "grid"` only where strict schema-v2/public fixtures require it.

---

### Task 1: Contract and Legacy Normalization

**Files:**
- Modify: `packages/saas-contracts/src/storefront/types.ts:11-15,50-61,132-137`
- Modify: `packages/saas-contracts/src/storefront/validation.ts:258-312,465-488`
- Modify: `packages/saas-contracts/src/storefront/presentation.ts:67-88`
- Modify: `packages/saas-contracts/src/storefront/index.ts:1-20`
- Modify: `packages/saas-contracts/src/index.ts:470-490`
- Test: `packages/saas-contracts/src/storefront/campaign-starter.test.ts:1-190`

**Interfaces:**
- Produces: `export type CategoryShowcaseLayout = "duo" | "grid"`.
- Produces: schema-v2 category config `{ kind, enabled, heading, categoryIds, layout }`.
- Produces: public category section `{ kind, heading, layout, items }`.
- Consumes: existing `exact`, `oneOf`, `uuidArray`, immutable parsing helpers.

- [ ] **Step 1: Write failing contract tests**

Add assertions equivalent to:

```ts
const grid = parseStarterThemeComposition({
  ...compositionV2,
  sections: [{ kind: "category_grid", enabled: true, heading: "Kategoriler", categoryIds: [CATEGORY], layout: "grid" }],
});
assert.equal(grid.sections[0]?.kind === "category_grid" && grid.sections[0].layout, "grid");

const duo = parsePublicStarterThemePresentation({
  ...presentationV3,
  sections: [{ kind: "category_grid", heading: "Kategoriler", layout: "duo", items: [{ name: "Takılar", slug: "takilar", image: HERO }] }],
});
assert.equal(duo.sections[0]?.kind === "category_grid" && duo.sections[0].layout, "duo");

assert.throws(() => parseStarterThemeComposition({
  ...compositionV2,
  sections: [{ kind: "category_grid", enabled: true, heading: "Kategoriler", categoryIds: [CATEGORY], layout: "masonry" }],
}), /storefront_contract_invalid/);

const legacyPublic = parsePublicStarterThemePresentation({
  ...presentationV3,
  sections: [{ kind: "category_grid", heading: "Kategoriler", items: [{ name: "Takılar", slug: "takilar", image: HERO }] }],
});
assert.equal(legacyPublic.sections[0]?.kind === "category_grid" && legacyPublic.sections[0].layout, "grid");
```

- [ ] **Step 2: Run the contract test and verify RED**

Run: `npm test --workspace @celebix/saas-contracts -- --test-name-pattern='category.*layout|legacy.*grid'`

Expected: FAIL because `layout` is not present in the category config/public types and the parser rejects or drops it.

- [ ] **Step 3: Add the finite types and minimal parsers**

Use the exact contracts:

```ts
export type CategoryShowcaseLayout = "duo" | "grid";

type StarterThemeCategoryGridConfigV2 = Readonly<{
  kind: "category_grid";
  enabled: boolean;
  heading: string;
  categoryIds: readonly string[];
  layout: CategoryShowcaseLayout;
}>;

export type StarterThemeSectionConfigV2 =
  | Exclude<StarterThemeSectionConfig, { kind: "category_grid" }>
  | StarterThemeCategoryGridConfigV2
  | Readonly<{ kind: "value_propositions"; enabled: boolean; items: readonly Readonly<{ icon: StarterValueIcon; heading: string; body: string }>[] }>
  | Readonly<{ kind: "testimonials"; enabled: boolean; heading: string; source: "approved_product_reviews"; limit: 3 | 6 | 9; minimumRating: 4 | 5 }>;
```

In `parseConfigSectionV2`, intercept the schema-v2 category section before the existing fall-through:

```ts
if (candidate.kind === "category_grid") {
  const parsed = exact(candidate, ["kind", "enabled", "heading", "categoryIds", "layout"]);
  return Object.freeze({
    kind: "category_grid",
    enabled: boolean(parsed.enabled),
    heading: string(parsed.heading, 1, 160),
    categoryIds: uuidArray(parsed.categoryIds, 1, 8),
    layout: oneOf(parsed.layout, Object.freeze(["duo", "grid"] as const)),
  });
}
```

In the public parser, make `layout` optional only for compatibility and always return it explicitly:

```ts
const parsed = exact(candidate, ["kind", "heading", "items"], ["layout"]);
const layout = Object.hasOwn(parsed, "layout")
  ? oneOf(parsed.layout, Object.freeze(["duo", "grid"] as const))
  : "grid";
return Object.freeze({ kind, heading: string(parsed.heading, 1, 160), layout, items });
```

Set `layout: "grid"` in `adaptStarterPresentationV1ToV2`.

- [ ] **Step 4: Run contract tests and typecheck GREEN**

Run:

```bash
npm test --workspace @celebix/saas-contracts
npm run typecheck --workspace @celebix/saas-contracts
```

Expected: all contract tests PASS; typecheck exits 0.

- [ ] **Step 5: Commit Task 1**

```bash
git add packages/saas-contracts/src/storefront packages/saas-contracts/src/index.ts
git commit -m "feat(storefront): define category showcase layouts"
```

---

### Task 2: PostgreSQL Layout Authority and Projection

**Files:**
- Create: `apps/owner/scripts/sql/saas/202608090097_responsive_category_showcase_layout.up.sql`
- Create: `apps/owner/scripts/sql/saas/202608090097_responsive_category_showcase_layout.down.sql`
- Create: `apps/owner/scripts/sql/saas/202608090097_responsive_category_showcase_layout_assertions.sql`
- Create: `apps/owner/scripts/sql/saas/phase4p-responsive-category-showcase-layout-manifest.json`
- Create: `tests/saas-phase3/responsive-category-showcase/postgres-harness.mjs`

**Interfaces:**
- Consumes: `saas.campaign_starter_composition_valid(jsonb)`, `saas.storefront_theme_composition_upgrade_v2(jsonb)`, `saas.storefront_design_document_valid(uuid,jsonb,boolean)`, `saas.public_starter_retail_presentation(uuid,timestamptz,boolean)`.
- Produces: required exact layout in every schema-v2 category section and exact public projection.

- [ ] **Step 1: Write the disposable PostgreSQL RED harness**

The harness must start isolated PostgreSQL 16, apply migrations through `096`, seed one schema-v2 category section without layout, apply `097`, and assert:

```js
assert.equal(categoryFromDraft.layout, "grid");
assert.equal(publicCategory.layout, "grid");
assert.equal(valid(withLayout("duo")), true);
assert.equal(valid(withLayout("grid")), true);
assert.equal(valid(withLayout("masonry")), false);
assert.equal(valid(withoutLayout()), false);
```

It must then save/publish `duo`, prove the public projection contains `duo`, verify another store cannot affect it, reject unguarded down, exercise loss guard, run guarded down/reapply, and prove the temporary PostgreSQL directory/process are removed.

- [ ] **Step 2: Run the harness and verify RED**

Run: `node tests/saas-phase3/responsive-category-showcase/postgres-harness.mjs`

Expected: FAIL because migration `097` does not exist.

- [ ] **Step 3: Implement migration `097`**

The up migration must:

1. Drop only the three composition/design check constraints.
2. Rename the current validator to `campaign_starter_composition_valid_without_category_layout`.
3. Add a helper that maps `sections` and removes `layout` only from category sections before delegating to the previous validator.
4. Require schema-v2 category sections to have exactly `kind`, `enabled`, `heading`, `categoryIds`, `layout`, with layout in `('duo','grid')`.
5. Upgrade every missing schema-v2 category layout in campaign publications and both design documents to `grid` using an immutable ordered `jsonb_agg` transform.
6. Extend `storefront_theme_composition_upgrade_v2` so schema-v1/v2 inputs return explicit `grid` on every category section.
7. Replace only the category projection expression so it builds:

```sql
pg_catalog.jsonb_build_object(
  'kind','category_grid',
  'heading',section->>'heading',
  'layout',section->>'layout',
  'items',categories
)
```

8. Restore the check constraints and revoke helper/validator execution from all runtime roles.

The guarded down migration must reject unless `celebix.allow_responsive_category_showcase_layout_down='on'`, reject data loss while any layout is `duo`, remove only `layout`, restore the previous validator/projection source, and permit reapply.

- [ ] **Step 4: Add assertions and exact checksums**

Assertions must verify defaults, migrated rows, exact `duo`/`grid`, missing/unknown rejection, public projection, no direct table privilege and function revocations. Generate artifact hashes with:

```bash
shasum -a 256 \
  apps/owner/scripts/sql/saas/202608090097_responsive_category_showcase_layout.up.sql \
  apps/owner/scripts/sql/saas/202608090097_responsive_category_showcase_layout.down.sql \
  apps/owner/scripts/sql/saas/202608090097_responsive_category_showcase_layout_assertions.sql
```

Write those exact values to `phase4p-responsive-category-showcase-layout-manifest.json` with `postgresqlMajor: 16`, `externalConnections: 0`, and `productionMutations: 0`.

- [ ] **Step 5: Run PostgreSQL GREEN**

Run: `node tests/saas-phase3/responsive-category-showcase/postgres-harness.mjs`

Expected: all named scenarios PASS, rollback/reapply PASS, cleanup PASS.

- [ ] **Step 6: Commit Task 2**

```bash
git add apps/owner/scripts/sql/saas/202608090097_responsive_category_showcase_layout* \
  apps/owner/scripts/sql/saas/phase4p-responsive-category-showcase-layout-manifest.json \
  tests/saas-phase3/responsive-category-showcase/postgres-harness.mjs
git commit -m "feat(storefront): persist category showcase layout"
```

---

### Task 3: Visual Merchant Selector and Preview Parity

**Files:**
- Modify: `apps/customer-panel/components/settings/StarterThemeComposer.tsx:62-70,250-262`
- Modify: `apps/customer-panel/components/settings/starter-theme-composer.module.css:110-190`
- Modify: `apps/customer-panel/components/settings/StarterThemePreview.tsx:55-130`
- Modify: `apps/customer-panel/components/settings/starter-theme-preview.module.css`
- Modify: `apps/customer-panel/lib/starter-theme-composer-model.test.ts:1-140`
- Modify: `apps/customer-panel/components/settings/StarterThemeComposer.test.ts:1-130`

**Interfaces:**
- Consumes: schema-v2 `category_grid.layout`.
- Produces: two accessible radio-card choices and preview classes `previewCategoriesDuo` / `previewCategoriesGrid`.

- [ ] **Step 1: Write failing selector and preview tests**

Add source/model assertions for:

```ts
assert.match(composer, /İki büyük/);
assert.match(composer, /Grid/);
assert.match(composer, /name=\{`category-layout-\$\{index\}`\}/);
assert.match(composer, /layout: "duo"/);
assert.match(composer, /layout: "grid"/);
assert.match(preview, /categorySection[.]layout/);
assert.match(previewCss, /[.]previewCategoriesDuo/);
assert.match(previewCss, /[.]previewCategoriesGrid/);
```

Update the composer model fixture so its schema-v2 category section includes `layout: "grid"`, and assert `buildStarterThemeComposition` preserves it immutably.

- [ ] **Step 2: Run focused customer-panel tests and verify RED**

Run:

```bash
node --experimental-transform-types --test \
  apps/customer-panel/components/settings/StarterThemeComposer.test.ts \
  apps/customer-panel/lib/starter-theme-composer-model.test.ts
```

Expected: FAIL for missing labels, radio authority and preview layout classes.

- [ ] **Step 3: Implement the minimal accessible layout picker**

Initialize new category sections with `layout: "grid"`.

Render one radio group inside the category section:

```tsx
<fieldset className={styles.layoutPicker}>
  <legend>Kategori görünümü</legend>
  {([
    { value: "duo", label: "İki büyük", help: "Masaüstünde yan yana, mobilde alt alta" },
    { value: "grid", label: "Grid", help: "Masaüstünde dört, mobilde iki sütun" },
  ] as const).map((option) => <label className={styles.layoutChoice} data-selected={section.layout === option.value} key={option.value}>
    <input
      checked={section.layout === option.value}
      disabled={disabled}
      name={`category-layout-${index}`}
      onChange={() => updateSection(index, { ...section, layout: option.value })}
      type="radio"
      value={option.value}
    />
    <span className={styles[`layoutDiagram-${option.value}`]} aria-hidden="true"><i /><i /><i /><i /></span>
    <strong>{option.label}</strong>
    <small>{option.help}</small>
  </label>)}
</fieldset>
```

Use CSS with a visible checked/selected state, `:focus-within`, 48px minimum targets and miniature duo/grid diagrams. Do not expose a free-text class name.

In preview, find the enabled category section, render up to four category labels, and choose the finite class from `categorySection.layout`; mobile preview must visibly collapse `duo` to one column.

- [ ] **Step 4: Run focused customer-panel GREEN**

Run:

```bash
node --experimental-transform-types --test \
  apps/customer-panel/components/settings/StarterThemeComposer.test.ts \
  apps/customer-panel/lib/starter-theme-composer-model.test.ts
npm run typecheck --workspace @celebix/customer-panel
```

Expected: focused tests PASS and typecheck exits 0.

- [ ] **Step 5: Commit Task 3**

```bash
git add apps/customer-panel/components/settings apps/customer-panel/lib/starter-theme-composer-model.test.ts
git commit -m "feat(customer-panel): choose category showcase layout"
```

---

### Task 4: Responsive Public Storefront Rendering

**Files:**
- Modify: `apps/storefront-shared/components/CampaignPanels.tsx:6-13`
- Modify: `apps/storefront-shared/components/campaign-home.module.css:66-78,141-160`
- Modify: `apps/storefront-shared/components/CampaignHome.test.ts:1-80`
- Modify: strict `category_grid` fixtures under `apps/storefront-shared/**` and `tests/saas-phase3/**`

**Interfaces:**
- Consumes: `section.layout: "duo" | "grid"` from the validated public presentation.
- Produces: only `categoryGridDuo` or `categoryGridGrid`; no arbitrary class injection.

- [ ] **Step 1: Write failing renderer and responsive CSS tests**

Add assertions:

```ts
assert.match(panelSource, /section[.]layout === "duo"/);
assert.match(panelSource, /categoryGridDuo/);
assert.match(panelSource, /categoryGridGrid/);
assert.match(css, /[.]categoryGridDuo\s*\{[^}]*repeat\(2,/s);
assert.match(css, /[.]categoryGridGrid\s*\{[^}]*repeat\(4,/s);
assert.match(css, /[.]categoryGridDuo img\s*\{[^}]*aspect-ratio:\s*3\s*\/\s*2/s);
assert.match(css, /[.]categoryGridGrid img\s*\{[^}]*aspect-ratio:\s*1\s*\/\s*1/s);
assert.match(css, /@media\(max-width:700px\)[\s\S]*[.]categoryGridDuo[\s\S]*grid-template-columns:\s*1fr/);
assert.match(css, /@media\(max-width:339px\)[\s\S]*[.]categoryGridGrid[\s\S]*grid-template-columns:\s*1fr/);
```

- [ ] **Step 2: Run focused storefront tests and verify RED**

Run: `node --conditions=react-server --experimental-transform-types --test apps/storefront-shared/components/CampaignHome.test.ts`

Expected: FAIL because the renderer and CSS still use the shared hardcoded `4 / 5` grid.

- [ ] **Step 3: Implement finite renderer classes and responsive geometry**

Select the class without browser input:

```tsx
const layoutClass = section.layout === "duo" ? styles.categoryGridDuo : styles.categoryGridGrid;
return <div className={`${styles.categoryGrid} ${layoutClass}`} data-layout={section.layout}>...</div>;
```

Use these CSS outcomes:

```css
.categoryGridGrid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.categoryGridDuo { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.categoryGridGrid img { aspect-ratio: 1 / 1; }
.categoryGridDuo img { aspect-ratio: 3 / 2; }

@media(max-width:900px) {
  .categoryGridGrid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media(max-width:700px) {
  .categoryGridDuo { grid-template-columns: 1fr; }
  .categoryGridDuo img { aspect-ratio: 4 / 3; }
}

@media(max-width:339px) {
  .categoryGridGrid { grid-template-columns: 1fr; }
}
```

Keep `object-fit: cover`, existing overlays, relative category destinations, focus behavior and reduced-motion rules.

- [ ] **Step 4: Run focused storefront GREEN**

Run:

```bash
node --conditions=react-server --experimental-transform-types --test apps/storefront-shared/components/CampaignHome.test.ts
npm run typecheck --workspace @celebix/storefront-shared
```

Expected: tests PASS and typecheck exits 0.

- [ ] **Step 5: Commit Task 4**

```bash
git add apps/storefront-shared tests/saas-phase3
git commit -m "feat(storefront): render responsive category layouts"
```

---

### Task 5: Whole-Branch Verification

**Files:**
- Modify only fixtures whose strict category-grid shape requires the new explicit layout.
- Do not modify application behavior during this task unless a failing test identifies a defect within this specification.

**Interfaces:**
- Consumes: completed Tasks 1–4.
- Produces: verified code-complete branch evidence.

- [ ] **Step 1: Run complete relevant regression matrix**

```bash
npm test --workspace @celebix/saas-contracts
npm test --workspace @celebix/customer-panel
npm test --workspace @celebix/storefront-shared
npm run typecheck --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/storefront-shared
npm run build --workspace @celebix/customer-panel
npm run build --workspace @celebix/storefront-shared
node tests/saas-phase3/responsive-category-showcase/postgres-harness.mjs
git diff --check
```

Expected: all commands exit 0; PostgreSQL reports all scenarios and cleanup PASS.

- [ ] **Step 2: Run authority, forbidden-pattern and secret scans**

```bash
git diff HEAD~4 -- . ':!package-lock.json' | rg -n 'tenantId|storeId|localStorage|sessionStorage|x-forwarded|BEGIN (RSA|OPENSSH|EC) PRIVATE KEY|password\s*=|secret\s*=' || true
rg -n 'https:|\*|unsafe-inline' apps/storefront-shared/components/CampaignPanels.tsx apps/customer-panel/components/settings/StarterThemeComposer.tsx
git diff --name-only HEAD~4
```

Expected: no browser tenant authority, secret material, arbitrary remote destination, or out-of-scope file; safe static `https:` matches must be absent in the touched renderer/editor.

- [ ] **Step 3: Verify repository state and remote-ready commit history**

```bash
git status --short
git log -5 --oneline
git diff --name-only 960c2ae70e1b79ef2ed1eb9c972324a34eeccbd8...HEAD
```

Expected: only pre-existing untracked `.codex-artifacts/` and `.superpowers/`; task commits are present; no production/deploy/config files changed.

- [ ] **Step 4: Record verification completion**

No empty verification commit is created. Push the existing commits normally only after all checks pass; do not force-push and do not deploy production.

---

## Self-Review

- Spec coverage: contract, compatibility normalization, durable PostgreSQL authority, public projection, visual merchant selection, preview parity, responsive storefront geometry, accessibility, security, rollback/reapply and cleanup all map to Tasks 1–5.
- Placeholder scan: no `TBD`, deferred implementation, or undefined interface remains.
- Type consistency: `CategoryShowcaseLayout`, `layout`, `categoryGridDuo`, and `categoryGridGrid` use identical names from contract through UI and renderer.
- Scope: image upload/category mapping remains unchanged; only composition owns layout.
