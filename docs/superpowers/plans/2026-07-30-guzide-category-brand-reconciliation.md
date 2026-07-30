# Güzide Category and Brand Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore Güzide Kuyumcu's 14-root/36-child WordPress category hierarchy, normalize its existing six brands, and remove merchant-facing product/category slug text without changing any product, media, product-category, or product-brand relationship.

**Architecture:** Merchant presentation changes stay in the existing customer-panel components and retain slugs inside API/URL contracts. The one-time staging data repair updates only `saas.catalog_categories.parent_id/name/depth/version/updated_at` and one `saas.catalog_admin_resources.name/version/updated_at` row inside one PostgreSQL transaction; invariant digests abort the transaction if products, media, category relations, or brand relations change.

**Tech Stack:** Next.js/React/TypeScript, Node test runner, PostgreSQL 16, existing Coolify isolated staging deployment.

## Global Constraints

- Target store is only staging `guzide-kuyumcu-4`.
- Do not re-import or rewrite any product, variant, price, stock, product status, media, or R2 object.
- Preserve all 1,628 product rows, 4,696 media rows, 3,177 product-category relations, and 1,587 product-brand relations.
- Preserve category IDs, brand resource IDs, and all internal slugs.
- WordPress source is read-only; Celebix becomes the sole taxonomy authority after reconciliation.
- Production, DNS, Owner, storefront, migrations, credentials, and merge are out of scope.
- Only customer-panel staging may be deployed, from the exact final SHA.

---

## File Map

- Modify `apps/customer-panel/components/catalog-onboarding/CategoryManager.tsx`: remove category slug text while retaining hierarchy metadata.
- Modify `apps/customer-panel/components/catalog/ProductListConsole.tsx`: remove product slug text from list rows.
- Modify `apps/customer-panel/components/catalog/ProductDetailConsole.tsx`: hide slug in heading/edit form and reuse the persisted slug in update payloads.
- Modify `apps/customer-panel/lib/product-console.test.ts`: behavior coverage for product-list slug omission and persisted-slug updates.
- Modify `apps/customer-panel/lib/product-onboarding-console.test.ts`: category merchant-presentation regression coverage.
- Modify `docs/superpowers/specs/2026-07-30-guzide-category-brand-reconciliation-design.md`: record written approval.
- Create `docs/superpowers/plans/2026-07-30-guzide-category-brand-reconciliation.md`: this execution plan.
- No tracked customer-specific SQL file is created; the exact SQL below is executed once against isolated staging and retained in the task report.

---

### Task 1: Hide Technical Slugs Without Changing Catalog Authority

**Files:**
- Modify: `apps/customer-panel/lib/product-console.test.ts:145-220,500-850`
- Modify: `apps/customer-panel/lib/product-onboarding-console.test.ts:65-95`
- Modify: `apps/customer-panel/components/catalog-onboarding/CategoryManager.tsx:74-80`
- Modify: `apps/customer-panel/components/catalog/ProductListConsole.tsx:536-550`
- Modify: `apps/customer-panel/components/catalog/ProductDetailConsole.tsx:170-185,240-275`

**Interfaces:**
- Consumes: existing `CatalogProduct.slug` and `CatalogCategory.slug` durable contract fields.
- Produces: unchanged mutation payload contract with `slug: detail.product.slug`; merchant presentation contains names and hierarchy only.

- [ ] **Step 1: Add failing product-list behavior coverage**

Extend the existing mounted `ProductListConsole` test using a product fixture whose title is `Güzide Yüzük` and slug is `gizli-teknik-slug`. Assert the title is rendered and the slug is absent from mounted text:

```ts
const text = tree.map(mountedText).join(" ");
assert.match(text, /Güzide Yüzük/);
assert.doesNotMatch(text, /gizli-teknik-slug/);
```

The production change this catches is reintroducing `product.slug` beneath a merchant-visible product title.

- [ ] **Step 2: Add failing product-detail persisted-slug coverage**

Extend the existing product-detail test harness so submitting title/status/currency/description without a slug field records the real `catalogApi.updateProduct` argument. Assert the payload contains the already-loaded slug:

```ts
assert.equal(updateInput.slug, "kalici-dahili-slug");
assert.doesNotMatch(renderedText, /kalici-dahili-slug|URL anahtarı/);
```

The production change this catches is either exposing the slug field again or replacing/emptying the persisted slug during a normal product edit.

- [ ] **Step 3: Add failing category-presentation coverage**

Add an assertion to the category manager presentation test that the hierarchy metadata is `Seviye {depth} · Sıra {position}` and no `/{category.slug}` merchant copy remains:

```ts
assert.match(manager, /Seviye \{depth\} · Sıra \{category\.position\}/);
assert.doesNotMatch(manager, /\/\{category\.slug\}/);
```

The later browser gate verifies the rendered `Kolyeler › Kolye Ucu` behavior against the real API response.

- [ ] **Step 4: Run the focused tests and verify RED**

Run:

```bash
npm test --workspace @celebix/customer-panel -- lib/product-console.test.ts lib/product-onboarding-console.test.ts
```

Expected: FAIL because product/category slug text and the editable `URL anahtarı` field are still rendered, and product update currently reads a missing `FormData` slug.

- [ ] **Step 5: Apply the minimal presentation implementation**

In `CategoryManager.tsx`, replace:

```tsx
<small>/{category.slug} · Seviye {depth} · Sıra {category.position}</small>
```

with:

```tsx
<small>Seviye {depth} · Sıra {category.position}</small>
```

In `ProductListConsole.tsx`, replace the product-title span with:

```tsx
<span><strong>{product.title}</strong></span>
```

In `ProductDetailConsole.tsx`, build the update payload using the loaded durable slug:

```ts
const parsed = buildProductUpdatePayload({
  title: value(data, "title"),
  slug: detail.product.slug,
  description: value(data, "description"),
  status: value(data, "status"),
  currency: value(data, "currency"),
}, detail.product.version);
```

Render heading metadata as currency only:

```tsx
<p>{product.currency}</p>
```

Remove the `URL anahtarı` label/input from the normal edit form. Do not remove `slug` from types, APIs, search matching, imports, SEO URLs, or PostgreSQL.

- [ ] **Step 6: Run the focused tests and verify GREEN**

Run the Step 4 command again.

Expected: all selected customer-panel tests PASS; mounted list/detail text contains no technical slug and update payload retains `kalici-dahili-slug`.

- [ ] **Step 7: Commit the presentation change**

```bash
git add apps/customer-panel/components/catalog-onboarding/CategoryManager.tsx \
  apps/customer-panel/components/catalog/ProductListConsole.tsx \
  apps/customer-panel/components/catalog/ProductDetailConsole.tsx \
  apps/customer-panel/lib/product-console.test.ts \
  apps/customer-panel/lib/product-onboarding-console.test.ts
git commit -m "fix(catalog): hide merchant taxonomy slugs"
```

---

### Task 2: Reconcile Only Staging Category and Brand Rows

**Files:**
- No tracked source file.
- Execute the exact transaction below in PostgreSQL database `celebix_saas_staging_auth01` only.

**Interfaces:**
- Consumes: existing staging rows for store slug `guzide-kuyumcu-4`.
- Produces: 14 active root categories, 36 active child categories, six active brands, unchanged relation/product/media digests.

- [ ] **Step 1: Reconfirm the WordPress read-only taxonomy shape**

Run:

```bash
curl -fsSL 'https://guzidekuyumcu.com.tr/wp-json/wp/v2/product_cat?per_page=100&orderby=id&order=asc' \
  | jq -e 'length == 50 and ([.[] | select(.parent == 0)] | length == 14) and ([.[] | select(.parent != 0)] | length == 36)'
curl -fsSL 'https://guzidekuyumcu.com.tr/wp-json/wp/v2/product_brand?per_page=100&orderby=id&order=asc' \
  | jq -e 'length == 6'
```

Expected: both commands exit `0`. Do not download product or media payloads.

- [ ] **Step 2: Execute a rollback rehearsal**

Execute the SQL below once with the final `COMMIT;` changed to `ROLLBACK;`. Expected query results before rollback:

- `category_updates = 36`
- `brand_updates = 1`
- invariant checks do not raise
- root/child counts inside the transaction are `14/36`

- [ ] **Step 3: Execute the exact committed transaction**

Run this SQL through `psql -v ON_ERROR_STOP=1` inside the isolated staging PostgreSQL 16 container:

```sql
BEGIN;

CREATE TEMP TABLE taxonomy_invariants(key text PRIMARY KEY, row_count bigint NOT NULL, digest text NOT NULL) ON COMMIT DROP;

INSERT INTO taxonomy_invariants
WITH target AS (SELECT id FROM saas.stores WHERE slug='guzide-kuyumcu-4' AND status='active'),
category_rel AS (SELECT pc.product_id::text||':'||pc.category_id::text value FROM saas.catalog_product_categories pc,target WHERE pc.store_id=target.id ORDER BY 1),
brand_rel AS (SELECT rp.product_id::text||':'||rp.resource_id::text value FROM saas.catalog_admin_resource_products rp JOIN saas.catalog_admin_resources r ON r.store_id=rp.store_id AND r.id=rp.resource_id,target WHERE rp.store_id=target.id AND r.resource_kind='brand' ORDER BY 1),
products AS (SELECT p.id::text||':'||p.version::text||':'||p.slug value FROM saas.products p,target WHERE p.store_id=target.id ORDER BY 1),
media AS (SELECT m.id::text||':'||m.product_id::text||':'||m.sort_order::text value FROM saas.product_media m,target WHERE m.store_id=target.id ORDER BY 1)
SELECT 'category_relations',count(*),md5(coalesce(string_agg(value,',' ORDER BY value),'')) FROM category_rel
UNION ALL SELECT 'brand_relations',count(*),md5(coalesce(string_agg(value,',' ORDER BY value),'')) FROM brand_rel
UNION ALL SELECT 'products',count(*),md5(coalesce(string_agg(value,',' ORDER BY value),'')) FROM products
UNION ALL SELECT 'media',count(*),md5(coalesce(string_agg(value,',' ORDER BY value),'')) FROM media;

DO $repair$
DECLARE target_store uuid; changed integer;
BEGIN
  SELECT id INTO STRICT target_store FROM saas.stores WHERE slug='guzide-kuyumcu-4' AND status='active' FOR UPDATE;

  IF (SELECT count(*) FROM saas.catalog_categories WHERE store_id=target_store AND status='active' AND parent_id IS NULL) <> 50
     OR (SELECT count(*) FROM saas.catalog_categories WHERE store_id=target_store AND status='active' AND name LIKE '% > %') <> 36 THEN
    RAISE EXCEPTION 'unexpected_category_source_shape';
  END IF;

  UPDATE saas.catalog_categories child
  SET parent_id=parent.id,
      name=split_part(child.name,' > ',2),
      depth=parent.depth+1,
      version=child.version+1,
      updated_at=statement_timestamp()
  FROM saas.catalog_categories parent
  WHERE child.store_id=target_store
    AND child.status='active'
    AND child.parent_id IS NULL
    AND child.name LIKE '% > %'
    AND parent.store_id=child.store_id
    AND parent.status='active'
    AND parent.parent_id IS NULL
    AND parent.name=split_part(child.name,' > ',1);
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed <> 36 THEN RAISE EXCEPTION 'category_update_count:%',changed; END IF;

  UPDATE saas.catalog_admin_resources
  SET name='Koçak İmperium Koleksiyon',version=version+1,updated_at=statement_timestamp()
  WHERE store_id=target_store
    AND resource_kind='brand'
    AND status='active'
    AND slug='kocak-kocak-imperium-koleksiyon'
    AND name='KOÇAK > Koçak İmperium Koleksiyon';
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed <> 1 THEN RAISE EXCEPTION 'brand_update_count:%',changed; END IF;

  IF (SELECT count(*) FROM saas.catalog_categories WHERE store_id=target_store AND status='active' AND parent_id IS NULL) <> 14
     OR (SELECT count(*) FROM saas.catalog_categories WHERE store_id=target_store AND status='active' AND parent_id IS NOT NULL AND depth=2) <> 36
     OR EXISTS (SELECT 1 FROM saas.catalog_categories child LEFT JOIN saas.catalog_categories parent ON parent.store_id=child.store_id AND parent.id=child.parent_id WHERE child.store_id=target_store AND child.parent_id IS NOT NULL AND parent.id IS NULL)
     OR EXISTS (WITH RECURSIVE walk AS (SELECT id,parent_id,ARRAY[id] path,false cycle FROM saas.catalog_categories WHERE store_id=target_store UNION ALL SELECT c.id,c.parent_id,w.path||c.id,c.id=ANY(w.path) FROM saas.catalog_categories c JOIN walk w ON c.id=w.parent_id WHERE c.store_id=target_store AND NOT w.cycle) SELECT 1 FROM walk WHERE cycle)
     OR (SELECT count(*) FROM saas.catalog_admin_resources WHERE store_id=target_store AND resource_kind='brand' AND status='active') <> 6 THEN
    RAISE EXCEPTION 'reconciled_taxonomy_invalid';
  END IF;
END
$repair$;

DO $invariants$
DECLARE mismatch_count integer;
BEGIN
  WITH target AS (SELECT id FROM saas.stores WHERE slug='guzide-kuyumcu-4' AND status='active'),
  current_values AS (
    SELECT 'category_relations' key,count(*) row_count,md5(coalesce(string_agg(value,',' ORDER BY value),'')) digest FROM (SELECT pc.product_id::text||':'||pc.category_id::text value FROM saas.catalog_product_categories pc,target WHERE pc.store_id=target.id) rows
    UNION ALL SELECT 'brand_relations',count(*),md5(coalesce(string_agg(value,',' ORDER BY value),'')) FROM (SELECT rp.product_id::text||':'||rp.resource_id::text value FROM saas.catalog_admin_resource_products rp JOIN saas.catalog_admin_resources r ON r.store_id=rp.store_id AND r.id=rp.resource_id,target WHERE rp.store_id=target.id AND r.resource_kind='brand') rows
    UNION ALL SELECT 'products',count(*),md5(coalesce(string_agg(value,',' ORDER BY value),'')) FROM (SELECT p.id::text||':'||p.version::text||':'||p.slug value FROM saas.products p,target WHERE p.store_id=target.id) rows
    UNION ALL SELECT 'media',count(*),md5(coalesce(string_agg(value,',' ORDER BY value),'')) FROM (SELECT m.id::text||':'||m.product_id::text||':'||m.sort_order::text value FROM saas.product_media m,target WHERE m.store_id=target.id) rows
  )
  SELECT count(*) INTO mismatch_count FROM taxonomy_invariants expected JOIN current_values actual USING(key) WHERE expected.row_count<>actual.row_count OR expected.digest<>actual.digest;
  IF mismatch_count <> 0 THEN RAISE EXCEPTION 'catalog_relation_invariant_changed'; END IF;
END
$invariants$;

COMMIT;
```

- [ ] **Step 4: Verify exact post-transaction invariants**

Expected durable results:

```text
roots=14
children=36
brands=6
category_relations=3177;digest=9e446647608cfcb7553aa30ddb2d1668
brand_relations=1587;digest=6b9b3cd1d3ba8adfb5bd9471880fccd3
products=1628;digest=29807482c0284aa5c29899c3884b81f7
media=4696;digest=abecdc474b148d4a4caa1816119335ad
```

Also verify `Kolyeler › Kolye Ucu`, `Yüzükler › Taşlı Yüzükler`, and `Saatler › Kadın Saat` through the category list API. A second dry-run classification must report zero rows needing repair.

---

### Task 3: Full Verification, Commit, Push, and Isolated Staging Acceptance

**Files:**
- Modify: `docs/superpowers/specs/2026-07-30-guzide-category-brand-reconciliation-design.md`
- Create: `docs/superpowers/plans/2026-07-30-guzide-category-brand-reconciliation.md`

**Interfaces:**
- Consumes: Task 1 UI commit and Task 2 verified staging rows.
- Produces: exact remote SHA and one customer-panel-only staging deployment.

- [ ] **Step 1: Run the complete local regression matrix**

```bash
npm test --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/customer-panel
npm run build --workspace @celebix/customer-panel
npm test --workspace @celebix/owner
npm run typecheck --workspace @celebix/owner
npm run build --workspace @celebix/owner
git diff --check
```

Expected: all tests/typechecks/builds PASS. Owner is regression-tested but not deployed.

- [ ] **Step 2: Run security and scope scans**

```bash
git diff --name-only 55dda5e8d6aeb8471b517fb2c1c787569ce8b4b1...HEAD
git diff 55dda5e8d6aeb8471b517fb2c1c787569ce8b4b1...HEAD -- \
  | rg -n '(BEGIN (RSA|OPENSSH|EC) PRIVATE KEY|password\s*=|secret\s*=|Bearer [A-Za-z0-9._~-]{20,}|__Host-celebix_panel=)'
```

Expected: only the documented customer-panel tests/components and design/plan files are changed; secret scan has no matches.

- [ ] **Step 3: Commit documentation and final verification state**

```bash
git add docs/superpowers/specs/2026-07-30-guzide-category-brand-reconciliation-design.md \
  docs/superpowers/plans/2026-07-30-guzide-category-brand-reconciliation.md
git commit -m "docs(catalog): plan guzide taxonomy reconciliation"
```

Do not amend or squash Task 1 or the existing approved history.

- [ ] **Step 4: Push without force**

```bash
git push origin codex/guzide-staging-integration
git ls-remote --heads origin refs/heads/codex/guzide-staging-integration
git rev-parse HEAD
```

Expected: remote SHA equals local HEAD.

- [ ] **Step 5: Deploy only customer-panel staging**

Deploy application UUID `yk1h6d97z7ex0h74ok3zrj5c` from the exact final SHA. Do not deploy Owner or storefront. Confirm Coolify reports `finished` and the exact commit.

- [ ] **Step 6: Perform authenticated browser acceptance**

Using the existing genuine Güzide staging session:

1. Open `/products/categories`; verify 14 root and 36 indented child categories.
2. Verify visible rows include `Kolyeler › Kolye Ucu`, `Yüzükler › Taşlı Yüzükler`, and `Saatler › Kadın Saat`.
3. Verify no `/category-slug` text appears.
4. Open `/products`; verify product names, images, SKUs, prices, stock, status, and actions remain present while `/product-slug` text is absent.
5. Open one product and enter edit mode; verify `URL anahtarı` is absent, save a no-op title edit only if needed, and verify the durable product slug remains unchanged.
6. Open `/products/brands`; verify six brands and normalized `Koçak İmperium Koleksiyon` label with existing product counts.
7. Verify browser console/runtime logs contain no raw cookie, token, state, code, credential, or internal hostname.

- [ ] **Step 7: Produce the completion report**

Report final branch/SHA, commit map, changed files, local test totals, PostgreSQL hierarchy counts, exact before/after invariant digests, customer-panel-only deployment proof, browser acceptance results, and these exact impact counts:

```text
products re-imported: 0
media/R2 writes: 0
product-category relationship changes: 0
product-brand relationship changes: 0
Owner deploys: 0
storefront deploys: 0
production impacts: 0
```
