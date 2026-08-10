# Single-Authority Category Showcase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `category_showcase` the only content authority for the storefront category showcase and remove navigation-derived fallback cards.

**Architecture:** The durable `category_showcase` record owns heading, enabled state, layout, ordered category IDs, and ordered asset IDs. The public presentation carries that exact resolved projection; `CampaignHome` places it once in the home composition without reading category content from navigation or `category_grid`. The admin presents one category showcase editor under Home → Sections, while the generic starter composer no longer exposes competing category content controls.

**Tech Stack:** TypeScript, React, Next.js App Router, Node test runner, PostgreSQL 16 migrations, npm workspaces.

## Global Constraints

- Header navigation remains independent and must never generate homepage category cards.
- Invalid, incomplete, foreign-store, archived, or duplicate category/image mappings fail closed.
- An empty or disabled showcase renders nothing and never makes the storefront unavailable.
- Existing category showcase records default safely to `layout: "grid"` and preserve their ordered mappings.
- No production deployment, production data mutation, credential changes, or unrelated dependency changes.
- Existing untracked `.codex-artifacts/` and `.superpowers/` directories remain untouched.

---

### Task 1: Add layout to the single durable category showcase authority

**Files:**
- Modify: `apps/customer-panel/lib/category-showcase-model.ts:6-35`
- Modify: `apps/customer-panel/lib/category-showcase-model.test.ts:10-37`
- Modify: `packages/saas-data/src/merchant-admin/validation.ts:6,34`
- Modify: `packages/saas-data/src/merchant-admin/repository.test.ts:60-90`
- Create: `apps/owner/scripts/sql/saas/202608100099_single_authority_category_showcase.up.sql`
- Create: `apps/owner/scripts/sql/saas/202608100099_single_authority_category_showcase.down.sql`
- Create: `apps/owner/scripts/sql/saas/202608100099_single_authority_category_showcase_assertions.sql`
- Create: `apps/owner/scripts/sql/saas/phase4r-single-authority-category-showcase-manifest.json`
- Create: `tests/saas-phase3/single-authority-category-showcase/postgres-harness.mjs`
- Create: `tests/saas-phase3/single-authority-category-showcase/static-security.test.mjs`

**Interfaces:**
- Consumes: existing `category_showcase` records shaped as `{ heading, enabled, items }`.
- Produces: `buildCategoryShowcaseConfig(input): { heading: string; enabled: boolean; layout: "duo" | "grid"; items: readonly { categoryId: string; assetId: string }[] }`.
- Produces: PostgreSQL validation and public projection that accept only exact `duo|grid` layouts and backfill legacy rows to `grid`.

- [ ] **Step 1: Write failing model and repository tests**

```ts
const config = buildCategoryShowcaseConfig({
  heading: "Kategorileri keşfedin",
  enabled: true,
  layout: "duo",
  rows: [{ categoryId: CATEGORY_A, assetId: ASSET_A }],
});
assert.equal(config.layout, "duo");
assert.throws(() => buildCategoryShowcaseConfig({ ...input, layout: "carousel" as never }));
```

Add repository assertions that `layout: "duo"` and `layout: "grid"` pass while missing, unknown, or non-string layout values fail after migration 099.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
node --test apps/customer-panel/lib/category-showcase-model.test.ts
npm test --workspace @celebix/saas-data -- --test-name-pattern="category showcase"
```

Expected: FAIL because the model omits `layout` and the finite merchant validation does not recognize it.

- [ ] **Step 3: Implement the minimal TypeScript model and validation**

Add the finite layout parser:

```ts
export type CategoryShowcaseLayout = "duo" | "grid";

function layout(value: unknown): CategoryShowcaseLayout {
  if (value !== "duo" && value !== "grid") invalid();
  return value;
}
```

Return the parsed layout from `buildCategoryShowcaseConfig` and add `layout` to the exact merchant-admin config key list.

- [ ] **Step 4: Write migration 099 and its failing PostgreSQL harness**

The migration must:

```sql
UPDATE saas.merchant_admin_records
SET config = config || pg_catalog.jsonb_build_object('layout','grid')
WHERE record_kind='category_showcase' AND NOT (config ? 'layout');
```

It must replace the category-showcase validation branch with exact keys `heading`, `enabled`, `layout`, `items`, preserve same-store category/asset verification, and add `layout` to the public `categoryShowcase` projection. The down migration must refuse lossy rollback while any record uses `duo`, then remove default `grid` fields only under an explicit rollback guard.

- [ ] **Step 5: Run PostgreSQL harness and verify GREEN**

Run:

```bash
node tests/saas-phase3/single-authority-category-showcase/postgres-harness.mjs
node --test tests/saas-phase3/single-authority-category-showcase/static-security.test.mjs
```

Expected: all migration, validation, backup/restore, rollback/reapply, and cleanup scenarios pass; no external database is used.

- [ ] **Step 6: Re-run TypeScript tests and commit**

```bash
node --test apps/customer-panel/lib/category-showcase-model.test.ts
npm test --workspace @celebix/saas-data -- --test-name-pattern="category showcase"
git add apps/customer-panel/lib/category-showcase-model.ts apps/customer-panel/lib/category-showcase-model.test.ts packages/saas-data/src/merchant-admin/validation.ts packages/saas-data/src/merchant-admin/repository.test.ts apps/owner/scripts/sql/saas/202608100099_single_authority_category_showcase.up.sql apps/owner/scripts/sql/saas/202608100099_single_authority_category_showcase.down.sql apps/owner/scripts/sql/saas/202608100099_single_authority_category_showcase_assertions.sql apps/owner/scripts/sql/saas/phase4r-single-authority-category-showcase-manifest.json tests/saas-phase3/single-authority-category-showcase
git commit -m "feat(saas): centralize category showcase authority"
```

### Task 2: Project and render category showcase content from one source

**Files:**
- Modify: `packages/saas-contracts/src/storefront/types.ts:185-245`
- Modify: `packages/saas-contracts/src/storefront/validation.ts:183-205`
- Modify: `packages/saas-contracts/src/storefront/storefront.test.ts:20-75`
- Modify: `apps/storefront-shared/components/CampaignHome.tsx:23-120`
- Modify: `apps/storefront-shared/components/CampaignHome.test.ts:32-37`
- Delete: `apps/storefront-shared/components/JewelryCategoryPlaceholders.tsx`
- Delete: `apps/storefront-shared/components/jewelry-category-placeholders.ts`
- Delete: `apps/storefront-shared/components/jewelry-category-placeholders.test.ts`
- Modify: `apps/storefront-shared/components/campaign-home.module.css`

**Interfaces:**
- Consumes: `presentation.categoryShowcase` with exact `{ heading, layout, items }`.
- Produces: `categoryShowcaseSection(presentation): PublicStarterHomeSection | null`.
- Guarantees: no content is derived from `presentation.navigation`.

- [ ] **Step 1: Write failing contract and storefront tests**

```ts
assert.equal(parsed.categoryShowcase?.layout, "duo");
assert.equal(parsePublicStarterThemePresentation(legacyWithoutLayout).categoryShowcase?.layout, "grid");
assert.throws(() => parsePublicStarterThemePresentation({
  ...presentation,
  categoryShowcase: { ...presentation.categoryShowcase, layout: "carousel" },
}));
```

Add source-level and rendering assertions proving `CampaignHome` reads `presentation.categoryShowcase`, preserves its exact order, and contains no `deriveJewelryCategoryPlaceholders`, `PLACEHOLDER`, or navigation-derived category cards.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
node --test packages/saas-contracts/src/storefront/storefront.test.ts
node --test apps/storefront-shared/components/CampaignHome.test.ts
```

Expected: FAIL because public showcase layout is not parsed and `CampaignHome` still imports the navigation fallback.

- [ ] **Step 3: Implement the minimal contract and renderer**

Extend the public showcase contract with:

```ts
categoryShowcase?: Readonly<{
  heading: string;
  layout: "duo" | "grid";
  items: readonly CategoryShowcaseItem[];
}>;
```

`parseCategoryShowcase` must normalize an absent legacy layout to `grid`, while rejecting any present value other than `duo|grid`. In `CampaignHome`, build exactly one category section from `presentation.categoryShowcase`; mount it at the existing category slot when present, otherwise immediately before supporting value/review sections. Delete the navigation fallback implementation and its unused CSS.

- [ ] **Step 4: Run focused tests and verify GREEN**

```bash
node --test packages/saas-contracts/src/storefront/storefront.test.ts
node --test apps/storefront-shared/components/CampaignHome.test.ts
npm test --workspace @celebix/storefront
```

Expected: all contract and storefront tests pass with no fallback cards.

- [ ] **Step 5: Commit**

```bash
git add packages/saas-contracts/src/storefront apps/storefront-shared/components
git commit -m "fix(storefront): remove category navigation fallback"
```

### Task 3: Consolidate the admin into one category showcase editor

**Files:**
- Modify: `apps/customer-panel/components/settings/CategoryShowcaseEditor.tsx:19-140`
- Modify: `apps/customer-panel/components/settings/CategoryShowcaseEditor.test.ts:7-25`
- Modify: `apps/customer-panel/components/settings/category-showcase-editor.module.css`
- Modify: `apps/customer-panel/components/settings/StarterThemeComposer.tsx:39-70,250-290`
- Modify: `apps/customer-panel/components/settings/StarterThemeComposer.test.ts`
- Modify: `apps/customer-panel/components/settings/design/DesignStepEditor.tsx:85-95`
- Modify: `apps/customer-panel/components/settings/design/DesignWorkspace.test.ts`

**Interfaces:**
- Consumes: active categories and active `kind === "category"` assets from same-origin authenticated APIs.
- Produces: one accessible editor that persists `{ heading, enabled, layout, items }` through `merchantAdminApi.save("category_showcase", ...)`.

- [ ] **Step 1: Write failing admin tests**

Assert that the editor exposes both `duo` and `grid` visual choices, submits `layout`, and remains the only category-content control under Home → Sections. Assert that `StarterThemeComposer` no longer edits category heading, category IDs, or layout and no longer creates navigation-based category content.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
node --test apps/customer-panel/components/settings/CategoryShowcaseEditor.test.ts
node --test apps/customer-panel/components/settings/StarterThemeComposer.test.ts
node --test apps/customer-panel/components/settings/design/DesignWorkspace.test.ts
```

Expected: FAIL because layout and category content are still split across two editors.

- [ ] **Step 3: Implement the single editor**

Load legacy records using `layout: "grid"` when absent, display the existing two-card layout selector inside `CategoryShowcaseEditor`, and persist layout with the ordered category/image pairs. Replace the generic composition category controls with a non-editable placement marker so category content can only be changed in this editor.

- [ ] **Step 4: Run focused tests and verify GREEN**

```bash
node --test apps/customer-panel/components/settings/CategoryShowcaseEditor.test.ts
node --test apps/customer-panel/components/settings/StarterThemeComposer.test.ts
node --test apps/customer-panel/components/settings/design/DesignWorkspace.test.ts
npm test --workspace @celebix/customer-panel
```

Expected: all focused tests and the customer-panel workspace pass.

- [ ] **Step 5: Commit**

```bash
git add apps/customer-panel/components/settings apps/customer-panel/components/settings/design
git commit -m "fix(customer-panel): unify category showcase editor"
```

### Task 4: Full verification and staging handoff

**Files:**
- Verify only; no new source files expected.

**Interfaces:**
- Consumes: commits from Tasks 1–3.
- Produces: test, build, security, scope, and remote-parity evidence.

- [ ] **Step 1: Run complete local verification**

```bash
npm ci
npm test --workspace @celebix/saas-contracts
npm test --workspace @celebix/saas-data
npm test --workspace @celebix/customer-panel
npm test --workspace @celebix/storefront
npm run typecheck --workspace @celebix/customer-panel
npm run build --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/storefront
npm run build --workspace @celebix/storefront
node tests/saas-phase3/single-authority-category-showcase/postgres-harness.mjs
git diff --check
```

Expected: every command exits 0.

- [ ] **Step 2: Run authority and secret scans**

```bash
rg -n "deriveJewelryCategoryPlaceholders|JewelryCategoryPlaceholders|PLACEHOLDER [1-4]" apps/storefront-shared apps/customer-panel
git diff --name-only baa7d3e9...HEAD
git diff baa7d3e9...HEAD | rg -n "R2_SECRET|DATABASE_URL|BEGIN (RSA|OPENSSH|EC) PRIVATE KEY|__Host-celebix_panel="
```

Expected: fallback and secret scans produce no matches; changed files stay within the spec and plan.

- [ ] **Step 3: Push and verify remote parity**

```bash
git push origin codex/design-tabs-save-fix-live
git rev-parse HEAD
git rev-parse origin/codex/design-tabs-save-fix-live
git status --short
```

Expected: local and remote SHAs match; only pre-existing untracked artifact directories remain.

- [ ] **Step 4: Stop before staging deployment unless separately authorized**

Report the exact SHA, commits, test totals, changed files, migration status, and confirm production impact is zero. Deploy only after explicit authorization if the current task does not already include staging deployment authority.
