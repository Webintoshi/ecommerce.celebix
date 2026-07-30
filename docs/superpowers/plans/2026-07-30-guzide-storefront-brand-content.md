# Güzide Storefront Brand Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the starter storefront logo, hero and ordered category cards durable, store-scoped, admin-managed and backed by real public category routes.

**Architecture:** Append migration `067` to extend the existing merchant-admin and storefront-asset authorities without rewriting migration `066`. Strict contracts carry only public logo/category projections; the customer panel composes catalog and asset APIs while PostgreSQL remains the final same-store authority.

**Tech Stack:** PostgreSQL 16, TypeScript, React, Next.js App Router, Node test runner, R2-compatible storefront asset transport.

## Global Constraints

- Keep `apps/admin/**` byte-for-byte unchanged.
- Do not mutate production, production domains or production credentials.
- Do not modify migration `066`; add append-only migration `067`.
- Preserve tenant/store authority in PostgreSQL and server-owned TenantContext.
- Use only the six approved Güzide public source assets for staging content.

---

### Task 1: Extend strict contracts

**Files:**
- Modify: `packages/saas-contracts/src/storefront-assets/types.ts`
- Modify: `packages/saas-contracts/src/storefront/types.ts`
- Modify: `packages/saas-contracts/src/storefront/validation.ts`
- Modify: `packages/saas-contracts/src/merchant-admin/types.ts`
- Test: `packages/saas-contracts/src/storefront/storefront.test.ts`
- Test: `packages/saas-contracts/src/storefront-assets/validation.test.ts`
- Test: `packages/saas-contracts/src/merchant-admin/merchant-admin.test.ts`

**Interfaces:**
- Produces: `StorefrontAssetKind += "category"`, `MerchantAdminRecordKind += "category_showcase"`.
- Produces: `PublicStarterThemePresentation.logo?: PublicStorefrontAsset` and `categoryShowcase?: { heading: string; items: readonly { id: string; name: string; slug: string; image: PublicStorefrontAsset }[] }`.

- [ ] Write failing parser tests for exact logo/category projections, 1–8 item bounds, duplicate/hostile fields and deep freezing.
- [ ] Run `npm test --workspace @celebix/saas-contracts`; expect the new kinds/projection tests to fail.
- [ ] Add the minimal literal kinds, readonly types and exact parsers:
  ```ts
  categoryShowcase?: Readonly<{ heading: string; items: readonly Readonly<{ id: string; name: string; slug: string; image: PublicStorefrontAsset }>[] }>;
  ```
- [ ] Re-run the workspace tests; expect all contract tests to pass.
- [ ] Commit `feat(storefront): define category showcase authority`.

### Task 2: Add PostgreSQL 067 authority

**Files:**
- Create: `apps/owner/scripts/sql/saas/202607300067_storefront_category_showcase.up.sql`
- Create: `apps/owner/scripts/sql/saas/202607300067_storefront_category_showcase.down.sql`
- Create: `apps/owner/scripts/sql/saas/202607300067_storefront_category_showcase_assertions.sql`
- Create: `apps/owner/scripts/sql/saas/phase3z-storefront-category-showcase-manifest.json`
- Test: `tests/saas-phase3/storefront-category-showcase/postgres-harness.mjs`
- Test: `tests/saas-phase3/storefront-category-showcase/static-security.test.mjs`

**Interfaces:**
- Produces: extended `storefront_assets_kind_check`, finite `category_showcase` merchant kind, same-store config validation and public logo/category projections.
- Produces: `saas.public_list_products_by_category(uuid,text,timestamptz,text,integer)` returning `{category,items}`.

- [ ] Write the disposable PostgreSQL test covering migration, correct projection, wrong-store/archived/wrong-kind asset rejection, duplicate IDs, direct-DML denial, category product isolation, rollback and reapply.
- [ ] Run `node --test tests/saas-phase3/storefront-category-showcase/*.test.mjs`; expect missing migration/functions.
- [ ] Implement `067` by wrapping the current merchant functions, validating `items` under row locks, extending asset functions to `category`, and projecting only active same-store rows.
- [ ] Add assertions and SHA-256 manifest entries generated from the real files.
- [ ] Re-run the disposable harness and static test; expect all scenarios to pass.
- [ ] Commit `feat(saas): add storefront category showcase authority`.

### Task 3: Wire repository category reads

**Files:**
- Modify: `packages/saas-data/src/storefront/types.ts`
- Modify: `packages/saas-data/src/storefront/repository.ts`
- Test: `packages/saas-data/src/storefront/repository.test.ts`

**Interfaces:**
- Produces: `listPublicProductsByCategory({ storefront, now, slug, limit }): Promise<{ category: {id,name,slug}; items: readonly PublicProduct[] }>`.

- [ ] Add failing exact-query and hostile projection tests.
- [ ] Run `npm test --workspace @celebix/saas-data`; expect the method to be missing.
- [ ] Implement one read-only SQL call and strict parsing with no browser store authority.
- [ ] Re-run the data tests; expect all to pass.
- [ ] Commit `feat(storefront): read public category products`.

### Task 4: Add admin category showcase editor

**Files:**
- Modify: `packages/saas-data/src/merchant-admin/validation.ts`
- Modify: `apps/customer-panel/lib/merchant-admin-ui/presentation.ts`
- Modify: `apps/customer-panel/components/settings/StorefrontAssetManager.tsx`
- Create: `apps/customer-panel/components/settings/CategoryShowcaseEditor.tsx`
- Modify: `apps/customer-panel/components/settings/DesignSettingsHub.tsx`
- Create: `apps/customer-panel/app/settings/category-showcase/page.tsx`
- Test: corresponding focused `.test.ts` / `.test.tsx` files and `apps/customer-panel/lib/routes.test.ts`

**Interfaces:**
- Consumes: `catalogOnboardingClient.listCategories()`, `storefrontAssetApi.list("category")`, `merchantAdminApi.records/save("category_showcase")`.
- Produces: accessible ordered editor with `heading`, `enabled`, 1–8 `{categoryId,assetId}` pairs.

- [ ] Add failing validation, route, asset-action and editor model tests.
- [ ] Run focused customer-panel tests; expect missing kind/editor/route failures.
- [ ] Add strict config validation, `category` upload selection, logo binding and the category editor.
- [ ] Re-run focused and full customer-panel tests; expect all to pass.
- [ ] Commit `feat(panel): manage starter category showcase`.

### Task 5: Render logo and category routes

**Files:**
- Modify: `apps/storefront-shared/components/Header.tsx`
- Modify: `apps/storefront-shared/app/page.tsx`
- Create: `apps/storefront-shared/components/CategoryShowcase.tsx`
- Create: `apps/storefront-shared/app/categories/[slug]/page.tsx`
- Modify: `apps/storefront-shared/app/globals.css`
- Test: `apps/storefront-shared/lib/storefront-app.test.ts`

**Interfaces:**
- Consumes: strict `presentation.logo`, `presentation.categoryShowcase`, repository category method.
- Produces: accessible responsive cards and canonical category page.

- [ ] Add failing source/behavior tests for image logo fallback, ordered links, exact slugs, category page and no untrusted URL construction.
- [ ] Run `npm test --workspace @celebix/storefront-shared`; expect missing components/route.
- [ ] Implement semantic `<Link>` cards and responsive CSS matching the accepted Güzide source layout.
- [ ] Re-run storefront tests; expect all to pass.
- [ ] Commit `feat(storefront): render branded category showcase`.

### Task 6: Full verification

**Files:** no production source changes unless a failing test exposes an in-scope defect.

- [ ] Run contract, data, customer-panel, storefront and Owner test suites.
- [ ] Run typecheck for all affected workspaces and customer-panel/storefront builds.
- [ ] Run PostgreSQL 16 migration/rollback/reapply harness and `git diff --check`.
- [ ] Scan changed files for secrets, WordPress credentials, forbidden external image URLs, browser tenant authority and `apps/admin/**` changes.
- [ ] Commit only an in-scope verification repair if required.

### Task 7: Isolated Güzide staging content activation

**Files:** no source files; six downloaded files are temporary upload inputs and remain untracked.

- [ ] Deploy customer-panel and storefront staging only from the exact verified SHA.
- [ ] Upload logo, hero and four category assets through the authenticated admin UI.
- [ ] Bind logo, hero and ordered category cards to the matching active Güzide categories.
- [ ] Verify desktop/mobile screenshots, correct category product filtering, R2 URLs and zero WordPress asset URLs in the public response.
- [ ] Confirm production deploy/domain mutation count remains zero and remove temporary QA artifacts.
