# Product Brand Logo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an authenticated merchant upload and assign one store-scoped R2 logo to a catalog brand, then render only that validated logo in the product-detail brand slot.

**Architecture:** Reuse the existing `/api/storefront-assets` authority with `kind=logo`, persist only `logoAssetId` in the durable brand resource config, and extend the PostgreSQL public product projection with a same-store active-logo join. Extend the strict public contract with optional `brand.logo`; the storefront hides the complete brand surface when the logo is absent.

**Tech Stack:** TypeScript 5.9, React 19, Next.js 16, PostgreSQL 16, Node test runner, existing R2 storefront-asset storage.

## Global Constraints

- Base commit is `694c7f1603f7788bff539a687e6b34550b0e9dc9`; design commit is `6e37f6b889463b292cc479bdf4da086afd279c40`.
- JPEG, PNG, and WebP only; existing 5 MiB upload and 8192×8192 dimension ceilings remain unchanged.
- Store and tenant authority come only from the persistent panel session and `TenantContext`.
- Persist `logoAssetId`, never a browser-supplied R2 key, store ID, tenant ID, or public URL.
- Product detail is logo-only; absent/invalid/archived/wrong-kind/cross-store logo means no brand surface.
- Preserve website, product relationships, optimistic versions, title, SKU, price, quantity, cart, buy-now, gallery, and mobile behavior.
- No new dependency, `apps/admin/**` change, credential mutation, production access, production deploy, or migration outside the versioned SaaS SQL set.
- Staging deploy happens only after contracts, unit tests, PostgreSQL 16 rehearsal, typechecks, builds, security scans, and diff checks pass.

---

### Task 1: Extend the strict public product contract

**Files:**
- Modify: `packages/saas-contracts/src/storefront/types.ts:275-300`
- Modify: `packages/saas-contracts/src/storefront/validation.ts:653-668`
- Modify: `packages/saas-contracts/src/storefront/storefront.test.ts:120-150`
- Modify: `packages/saas-contracts/src/storefront/campaign-starter.test.ts:130-145`

**Interfaces:**
- Consumes: existing `PublicStorefrontAsset` and `parseStorefrontAsset` validation rules.
- Produces: `PublicProductBrand = { name: string; slug: string; logo?: PublicStorefrontAsset }` and strict `parsePublicProduct()` support.

- [ ] **Step 1: Write failing contract tests**

Add literal fixtures proving a canonical logo is accepted and projected unchanged:

```ts
const logo = {
  url: `https://media.saas-staging.celebix.site/stores/${STORE_ID}/storefront/logo/${MEDIA_ID}.webp`,
  mediaType: "image/webp",
  altText: "Güzide Kuyumcu",
  width: 480,
  height: 160,
};
const parsed = parsePublicProduct({ ...product, brand: { name: "Güzide Kuyumcu", slug: "guzide-kuyumcu", logo } });
assert.deepEqual(parsed.brand?.logo, logo);
```

Add independent negative fixtures for an HTTP URL, an unknown `objectKey`, a missing height, and an unknown brand field. Preserve a successful no-logo brand fixture.

- [ ] **Step 2: Run RED**

Run:

```bash
npm test --workspace @celebix/saas-contracts -- --test-name-pattern='product.*brand.*logo|public product'
```

Expected: FAIL because the current exact brand parser accepts only `name` and `slug`.

- [ ] **Step 3: Implement the minimal contract**

Change the type and strict parser:

```ts
export type PublicProductBrand = Readonly<{
  name: string;
  slug: string;
  logo?: PublicStorefrontAsset;
}>;

const value = exact(parsed.brand, ["name", "slug"], ["logo"]);
return Object.freeze({
  name: string(value.name, 1, 200),
  slug: string(value.slug, 1, 100, SLUG),
  ...(Object.hasOwn(value, "logo") ? { logo: parseStorefrontAsset(value.logo) } : {}),
});
```

- [ ] **Step 4: Run GREEN and contract regression**

```bash
npm test --workspace @celebix/saas-contracts
npm run typecheck --workspace @celebix/saas-contracts
```

Expected: all contract tests PASS and typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git add packages/saas-contracts/src/storefront
git commit -m "feat(storefront): expose validated product brand logos"
```

---

### Task 2: Add the tenant-isolated PostgreSQL logo projection

**Files:**
- Create: `apps/owner/scripts/sql/saas/202608030082_product_brand_logos.up.sql`
- Create: `apps/owner/scripts/sql/saas/202608030082_product_brand_logos.down.sql`
- Create: `apps/owner/scripts/sql/saas/202608030082_product_brand_logos_assertions.sql`
- Create: `apps/owner/scripts/sql/saas/phase4f-product-brand-logos-manifest.json`
- Create: `tests/saas-phase3/product-brand-logos/postgres-harness.mjs`
- Create: `tests/saas-phase3/product-brand-logos/static-security.test.mjs`

**Interfaces:**
- Consumes: `saas.storefront_assets`, `saas.catalog_admin_resources`, `saas.catalog_admin_resource_products`, and the current `saas.public_campaign_product_projection(uuid,uuid,timestamptz)` definition.
- Produces: `saas.public_product_brand_logo(uuid,jsonb)` and a public brand payload with optional bounded `logo`.

- [ ] **Step 1: Write the failing disposable PostgreSQL harness**

Build literal scenarios that apply migrations through `081`, seed two stores, create one active `logo` asset and one active product-brand relation, then apply `082` and assert:

```js
assert.deepEqual(product.brand, {
  name: "Güzide Kuyumcu",
  slug: "guzide-kuyumcu",
  logo: {
    url: `https://media.saas-staging.celebix.site/stores/${STORE}/storefront/logo/${LOGO}.webp`,
    mediaType: "image/webp",
    altText: "Güzide Kuyumcu",
    width: 480,
    height: 160,
  },
});
```

Add separate scenarios for missing config, malformed UUID, wrong store, wrong asset kind, archived asset, rollback, and reapply. Every negative scenario must assert that `brand.name` and `brand.slug` remain but `brand.logo` is absent.

- [ ] **Step 2: Run RED**

```bash
node tests/saas-phase3/product-brand-logos/postgres-harness.mjs
```

Expected: FAIL because migration `082` and `saas.public_product_brand_logo` do not exist.

- [ ] **Step 3: Implement the projection and migration assertions**

Create a stable function that never casts an unvalidated value:

```sql
CREATE FUNCTION saas.public_product_brand_logo(p_store_id uuid,p_config jsonb)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $f$
  SELECT CASE
    WHEN pg_catalog.jsonb_typeof(p_config)='object'
      AND p_config->>'logoAssetId'~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    THEN (
      SELECT pg_catalog.jsonb_build_object(
        'url',asset.public_url,'mediaType',asset.media_type,'altText',asset.alt_text,
        'width',asset.width,'height',asset.height
      )
      FROM saas.storefront_assets asset
      WHERE asset.store_id=p_store_id
        AND asset.id=(p_config->>'logoAssetId')::uuid
        AND asset.asset_kind='logo'
        AND asset.status='active'
    )
  END
$f$;
```

Replace only the `brand` CTE in `public_campaign_product_projection` so it uses `jsonb_strip_nulls(jsonb_build_object('name',resource.name,'slug',resource.slug,'logo',saas.public_product_brand_logo(resource.store_id,resource.config)))`. Pin owner, revoke `PUBLIC`, and grant only the same public storefront role authority used by the existing projection. Down migration restores the exact `081`-era projection and drops the helper.

- [ ] **Step 4: Generate manifest checksums and run GREEN**

```bash
shasum -a 256 \
  apps/owner/scripts/sql/saas/202608030082_product_brand_logos.up.sql \
  apps/owner/scripts/sql/saas/202608030082_product_brand_logos.down.sql \
  apps/owner/scripts/sql/saas/202608030082_product_brand_logos_assertions.sql
```

Use the actual `.up.sql`, `.down.sql`, and `_assertions.sql` filenames in the manifest; do not fabricate checksums. Then run:

```bash
node tests/saas-phase3/product-brand-logos/postgres-harness.mjs
node --test tests/saas-phase3/product-brand-logos/static-security.test.mjs
```

Expected: all focused scenarios PASS, including rollback/reapply and disposable cleanup.

- [ ] **Step 5: Commit**

```bash
git add apps/owner/scripts/sql/saas/202608030082_product_brand_logos.* apps/owner/scripts/sql/saas/phase4f-product-brand-logos-manifest.json tests/saas-phase3/product-brand-logos
git commit -m "feat(saas): project tenant brand logos"
```

---

### Task 3: Add a strict brand-logo client and state model

**Files:**
- Create: `apps/customer-panel/lib/catalog-admin-ui/brand-logo.ts`
- Create: `apps/customer-panel/lib/catalog-admin-ui/brand-logo.test.ts`
- Modify: `apps/customer-panel/lib/catalog-admin-ui/client.ts:30-38`

**Interfaces:**
- Consumes: `/api/storefront-assets`, `parseStorefrontAsset`, `CatalogAdminResource.config`.
- Produces:

```ts
export type BrandLogoSelection = Readonly<{ assets: readonly StorefrontAsset[]; selectedId?: string }>;
export function selectBrandLogoAssets(value: unknown, selectedId?: unknown): BrandLogoSelection;
export function withBrandLogoConfig(config: Readonly<Record<string, CatalogAdminJson>>, logoAssetId?: string): Readonly<Record<string, CatalogAdminJson>>;
export async function uploadBrandLogo(file: File, altText: string, operationId: string): Promise<StorefrontAsset>;
```

- [ ] **Step 1: Write failing model/client tests**

Assert with literal fixtures that only active `kind="logo"` assets survive, a selected ID must belong to that set, `withBrandLogoConfig` preserves `website` while adding/removing `logoAssetId`, and upload sends exactly `file`, `kind=logo`, and `altText` with same-origin credentials and one canonical idempotency key.

- [ ] **Step 2: Run RED**

```bash
node --experimental-transform-types --test apps/customer-panel/lib/catalog-admin-ui/brand-logo.test.ts
```

Expected: FAIL because `brand-logo.ts` does not exist.

- [ ] **Step 3: Implement the minimal strict boundary**

Parse the complete `/api/storefront-assets` response, cap the list at 64, filter only active logos, and use `parseStorefrontAsset` before exposing data. Throw `CatalogAdminApiError("unavailable", 503)` for malformed or failed responses. The upload request must be:

```ts
const body = new FormData();
body.set("kind", "logo");
body.set("altText", altText);
body.set("file", file);
const response = await fetch("/api/storefront-assets", {
  method: "POST",
  credentials: "same-origin",
  cache: "no-store",
  headers: { "idempotency-key": operationId },
  body,
});
```

- [ ] **Step 4: Run GREEN**

```bash
node --experimental-transform-types --test apps/customer-panel/lib/catalog-admin-ui/brand-logo.test.ts
npm run typecheck --workspace @celebix/customer-panel
```

Expected: focused tests and typecheck PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/customer-panel/lib/catalog-admin-ui
git commit -m "feat(admin): add brand logo asset boundary"
```

---

### Task 4: Wire upload, preview, replacement, removal, and list thumbnails

**Files:**
- Create: `apps/customer-panel/components/catalog-admin/BrandLogoField.tsx`
- Modify: `apps/customer-panel/components/catalog-admin/CatalogResourceEditor.tsx:20-190`
- Modify: `apps/customer-panel/components/catalog-admin/CatalogResourceConsole.tsx:20-65`
- Modify: `apps/customer-panel/components/catalog-admin/catalog-admin-console.module.css:1-35`
- Modify: `apps/customer-panel/lib/catalog-admin-ui/resource-route.test.ts:79-235`
- Modify: `apps/customer-panel/lib/catalog-admin-console.test.ts:70-100`

**Interfaces:**
- Consumes: Task 3 `selectBrandLogoAssets`, `uploadBrandLogo`, and `withBrandLogoConfig`.
- Produces: `BrandLogoField({ assets, selectedId, disabled, brandName, onChange, onUpload })` and brand-only editor/list behavior.

- [ ] **Step 1: Write failing rendered behavior tests**

Use the existing compiled-editor test harness plus a real `happy-dom` render for the new field. Prove:

```ts
assert.equal(screen.getByLabelText("Marka logosu").getAttribute("accept"), "image/jpeg,image/png,image/webp");
await user.upload(fileInput, file);
await user.click(screen.getByRole("button", { name: "Logoyu yükle" }));
assert.equal(selectedId, LOGO_ID);
await user.click(screen.getByRole("button", { name: "Logoyu kaldır" }));
assert.equal(selectedId, undefined);
```

Also prove non-brand editors have no logo control, the brand list uses only a parsed active-asset thumbnail, and missing assets leave no broken image.

- [ ] **Step 2: Run RED**

```bash
node --experimental-transform-types --test apps/customer-panel/lib/catalog-admin-ui/resource-route.test.ts apps/customer-panel/lib/catalog-admin-console.test.ts
```

Expected: FAIL because the brand logo field and thumbnail behavior are missing.

- [ ] **Step 3: Implement the minimal UI**

- Load assets only when `kind === "brand"`.
- Initialize selection from `resource.config.logoAssetId` only after strict asset parsing.
- On upload success, retain the selected asset ID in state even if a later catalog save fails.
- Build brand config as `{ website?, logoAssetId? }`; never include `publicUrl`.
- Render a contained preview with the persisted brand name as `alt`.
- Render an active logo thumbnail before the brand name in the list.
- Keep removal non-destructive: clear the resource reference without archiving the R2 asset.

- [ ] **Step 4: Run GREEN and customer-panel regression**

```bash
node --experimental-transform-types --test apps/customer-panel/lib/catalog-admin-ui/brand-logo.test.ts apps/customer-panel/lib/catalog-admin-ui/resource-route.test.ts apps/customer-panel/lib/catalog-admin-console.test.ts
npm test --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/customer-panel
npm run build --workspace @celebix/customer-panel
```

Expected: all customer-panel tests, typecheck, and build PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/customer-panel/components/catalog-admin apps/customer-panel/lib/catalog-admin-ui apps/customer-panel/lib/catalog-admin-console.test.ts
git commit -m "feat(admin): manage catalog brand logos"
```

---

### Task 5: Render a logo-only product-detail brand surface

**Files:**
- Modify: `apps/storefront-shared/components/ProductDetailExperience.tsx:15-30`
- Modify: `apps/storefront-shared/components/product-detail-experience.module.css:5-12`
- Modify: `apps/storefront-shared/components/ProductDetailExperience.test.ts:18-105`

**Interfaces:**
- Consumes: Task 1 `product.brand.logo`.
- Produces: a brand-search link containing only a bounded image; no visible text fallback.

- [ ] **Step 1: Write failing component tests**

Render a real product-detail tree with a logo and assert the brand link contains an image with `src=product.brand.logo.url`, `alt=product.brand.name`, intrinsic dimensions, and no brand-name text node. Render a no-logo product and assert there is no brand link or empty anchor.

- [ ] **Step 2: Run RED**

```bash
node --experimental-transform-types --test apps/storefront-shared/components/ProductDetailExperience.test.ts
```

Expected: FAIL because the component currently renders `{product.brand.name}`.

- [ ] **Step 3: Implement logo-only rendering and bounded CSS**

```tsx
{options.showBrand && product.brand?.logo ? (
  <Link className={styles.brand} href={`/search?q=${encodeURIComponent(product.brand.name)}`} aria-label={`${product.brand.name} ürünlerini ara`}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={product.brand.logo.url} alt={product.brand.name} width={product.brand.logo.width} height={product.brand.logo.height} />
  </Link>
) : null}
```

Use a maximum desktop box of `9rem × 3rem`, `object-fit: contain`, and right alignment. On mobile keep the same intrinsic ratio and cap width at `7.5rem`; do not change the summary grid, purchase-column width, or CTA layout.

- [ ] **Step 4: Run GREEN and storefront regression**

```bash
node --experimental-transform-types --test apps/storefront-shared/components/ProductDetailExperience.test.ts
npm test --workspace @celebix/storefront-shared
npm run typecheck --workspace @celebix/storefront-shared
npm run build --workspace @celebix/storefront-shared
```

Expected: all storefront tests, typecheck, and build PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/storefront-shared/components
git commit -m "feat(storefront): render product brand logos"
```

---

### Task 6: Whole-branch security, regression, and staging acceptance

**Files:**
- Verify only; update no source unless a failing test identifies an in-scope defect.

**Interfaces:**
- Consumes: Tasks 1-5.
- Produces: pushed exact SHA and, after all local gates pass, isolated customer-panel plus Güzide storefront staging evidence.

- [ ] **Step 1: Run the complete non-browser matrix**

```bash
npm test --workspace @celebix/saas-contracts
npm run typecheck --workspace @celebix/saas-contracts
npm test --workspace @celebix/saas-data
npm run typecheck --workspace @celebix/saas-data
npm test --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/customer-panel
npm run build --workspace @celebix/customer-panel
npm test --workspace @celebix/storefront-shared
npm run typecheck --workspace @celebix/storefront-shared
npm run build --workspace @celebix/storefront-shared
node tests/saas-phase3/product-brand-logos/postgres-harness.mjs
node --test tests/saas-phase3/product-brand-logos/static-security.test.mjs
git diff --check
```

Expected: every command exits 0 and the PostgreSQL harness proves cleanup.

- [ ] **Step 2: Run forbidden-authority and secret scans**

```bash
git diff 694c7f1603f7788bff539a687e6b34550b0e9dc9...HEAD -- . ':!docs/**' | rg -n 'x-store-id|x-tenant-id|localStorage|sessionStorage|supabase|BEGIN (RSA|OPENSSH|EC) PRIVATE KEY|sk-[A-Za-z0-9]'
git diff --name-only 694c7f1603f7788bff539a687e6b34550b0e9dc9...HEAD -- apps/admin
```

Expected: both scans produce no matches; `apps/admin/**` diff count is 0.

- [ ] **Step 3: Review, push, and verify remote parity**

```bash
git status --short
git push origin codex/starter-theme-purchase-layout
git rev-parse HEAD
git ls-remote --heads origin codex/starter-theme-purchase-layout
```

Expected: clean worktree and identical local/remote SHA.

- [ ] **Step 4: Deploy only isolated staging services**

Apply migration `082` to the disposable/staging PostgreSQL authority through the established migration mechanism. Deploy the customer-panel staging service and Güzide storefront staging service from the exact pushed SHA. Do not deploy Owner, admin donor, production storefront, or any production service.

- [ ] **Step 5: Perform Browser acceptance**

The flow under test is: authenticated `/products/brands` → upload/preview/save logo → fresh product-detail request → logo-only brand link.

At desktop and 390×844:

- verify page identity and non-blank content;
- verify no framework overlay or console error;
- verify uploaded logo preview and saved list thumbnail;
- verify storefront logo uses the R2 URL and canonical brand alt text;
- verify no visible `Güzide Kuyumcu` brand-name fallback in the product-detail brand slot;
- verify no-logo fixture has no empty brand link;
- verify product title, SKU, price, quantity, side cart, and checkout still work;
- verify horizontal overflow is 0.

- [ ] **Step 6: Final evidence**

Report exact branch/SHA, commit map, changed files, PostgreSQL scenario totals, test/typecheck/build totals, R2 object status without exposing credentials, desktop/mobile screenshot evidence, clean console, remote parity, and zero production impacts.
