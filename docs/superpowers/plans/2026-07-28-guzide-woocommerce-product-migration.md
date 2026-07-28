# Güzide WooCommerce Product Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import Güzide Kuyumcu's official WooCommerce product export into one authenticated Celebix staging store while preserving product identity, TRY pricing, stock, gram weight, taxonomy, brand, descriptions, and ordered images in the store's private R2 namespace.

**Architecture:** A pure WooCommerce migration compiler validates the full localized export and produces deterministic product batches plus media URL digests. A tenant-authorized PostgreSQL migration ledger creates taxonomy and products idempotently, returns durable source-to-product mappings, and records media progress without persisting raw source URLs. The authenticated panel resubmits the same source file to resume; a server-only SSRF-safe fetcher copies each validated image through the existing product-media saga into tenant-scoped R2.

**Tech Stack:** Next.js 16, React 19, TypeScript, Node test runner, PostgreSQL 16, Cloudflare R2 bindings, SHA-256, existing `TenantContext`, catalog onboarding and product-media authorities.

## Global Constraints

- Source authority is the merchant-selected official WooCommerce CSV; it is never committed to Git.
- The observed Güzide export is 2,129,575 bytes, 1,628 simple published products, 41 columns and 5,646 ordered image references.
- Products, customers and orders remain three independent migration workflows.
- Domain/DNS routing, production mutation and production credentials remain out of scope.
- Tenant/store authority comes only from the authenticated server `TenantContext`; browser store IDs, Host and forwarded headers are never authority.
- Raw source URLs are never logged and are not persisted after terminal media completion; only SHA-256 URL digests are durable.
- `apps/admin/**` remains byte-for-byte unchanged.
- All product writes, media writes and retries are idempotent and fail closed on operation mismatch.
- Red/green TDD is required for each production behavior.

---

### Task 1: Full WooCommerce export compiler

**Files:**
- Create: `apps/customer-panel/lib/catalog-import/woocommerce-migration.ts`
- Create: `apps/customer-panel/lib/catalog-import/woocommerce-migration.test.ts`
- Verify: `apps/customer-panel/lib/catalog-import/providers.test.ts:1-180`

**Interfaces:**
- Produces `compileWooCommerceMigration(source: string): Promise<WooCommerceMigrationManifest>` and uses browser-compatible Web Crypto SHA-256.
- `WooCommerceMigrationManifest` is frozen and contains `sourceDigest`, `products`, `categories`, `brands`, `batches`, `mediaCount`, and finite warning counts.
- Each product contains `sourceProductId`, deterministic `slug`, plain/Markdown-safe description, `categorySlugs`, ordered `brandSlugs`, one or more canonical variants, optional gram weight, and ordered canonical HTTPS `sourceImages`.

- [x] **Step 1: Write failing localized-export tests**

```ts
test("compiles localized WooCommerce rows without losing gram weight or image order", () => {
  const manifest = await compileWooCommerceMigration(LOCALIZED_WOO_CSV);
  assert.deepEqual(manifest.products[0], {
    sourceProductId: "30794",
    title: "14 Ayar Altın Ortası Taşlı Yüzük 1090",
    slug: "14-ayar-altin-ortasi-tasli-yuzuk-1090",
    status: "active",
    categorySlugs: ["tasli-yuzukler", "yuzukler"],
    brandSlugs: ["guzide-kuyumcu"],
    variants: [{ title: "Varsayılan", sku: "YZK-1090", barcode: "100000014581", priceCents: 1127100, stockQuantity: 1, attributes: { "Ağırlık (g)": "2.35" } }],
    sourceImages: ["https://guzidekuyumcu.com.tr/wp-content/uploads/front.png", "https://guzidekuyumcu.com.tr/wp-content/uploads/side.jpg"],
  });
});
```

- [x] **Step 2: Run RED**

Run: `node --experimental-transform-types --test apps/customer-panel/lib/catalog-import/woocommerce-migration.test.ts`

Expected: FAIL because `woocommerce-migration.ts` does not exist.

- [x] **Step 3: Implement strict compiler**

Implement exact localized/English WooCommerce header aliases, a 4 MiB/2,500-row bound, strict CSV quoting, source-ID validation, deterministic duplicate-title slug suffixing with the source ID, TRY money parsing, nonnegative stock, safe HTML-to-text Markdown, category/brand slugging, gram decimal validation, canonical HTTPS image validation, per-product 16-image bound and manifest SHA-256.

- [x] **Step 4: Add negative fixtures**

Reject duplicate source IDs/SKUs/barcodes, control characters, malformed quotes, non-HTTPS or credential-bearing images, more than 16 images, oversized inputs, non-simple rows in this first Güzide delivery, unsafe monetary values and invalid gram quantities. Missing prices become draft products with price 0 and the exact warning `missing_price_drafted`; missing images remain truthful with `missing_image`.

- [x] **Step 5: Run GREEN and existing provider regressions**

Run:

```bash
node --experimental-transform-types --test apps/customer-panel/lib/catalog-import/woocommerce-migration.test.ts
node --experimental-transform-types --test apps/customer-panel/lib/catalog-import/providers.test.ts
```

- [x] **Step 6: Commit**

```bash
git add apps/customer-panel/lib/catalog-import/woocommerce-migration.ts apps/customer-panel/lib/catalog-import/woocommerce-migration.test.ts apps/customer-panel/lib/catalog-import/providers.ts apps/customer-panel/lib/catalog-import/providers.test.ts
git commit -m "feat(catalog): compile woocommerce migration manifests"
```

### Task 2: Durable tenant-scoped migration ledger and product batch authority

**Files:**
- Create: `packages/saas-data/src/catalog-migration/types.ts`
- Create: `packages/saas-data/src/catalog-migration/validation.ts`
- Create: `packages/saas-data/src/catalog-migration/repository.ts`
- Create: `packages/saas-data/src/catalog-migration/repository.test.ts`
- Create: `packages/saas-data/src/catalog-migration/index.ts`
- Modify: `packages/saas-data/src/index.ts`
- Create: `apps/owner/scripts/sql/saas/202607280059_catalog_product_migrations.up.sql`
- Create: `apps/owner/scripts/sql/saas/202607280059_catalog_product_migrations.down.sql`
- Create: `apps/owner/scripts/sql/saas/202607280059_catalog_product_migrations_assertions.sql`
- Create: `apps/owner/scripts/sql/saas/phase3-guzide-catalog-migration-manifest.json`
- Create: `tests/saas-phase3/guzide-catalog-migration/postgres-harness.mjs`
- Create: `tests/saas-phase3/guzide-catalog-migration/static-security.test.mjs`

**Interfaces:**
- `CatalogMigrationRepository.begin(input)` returns a frozen durable job with exact source digest and taxonomy counts.
- `CatalogMigrationRepository.importBatch(input)` accepts at most 25 products and returns ordered `{ sourceProductId, productId }` mappings.
- `CatalogMigrationRepository.get(input)` is read-only recovery/progress authority.
- The SQL projection exposes counts/status only; raw source URLs and full `TenantContext` never leave server authority.

- [x] **Step 1: Write failing repository and PostgreSQL tests**

Prove begin/replay/mismatch, category/brand creation, duplicate-title slugs, exact weight attributes, 25-product batching, product-limit locking, mapping persistence, cross-store denial, operation collision, unknown-COMMIT read recovery, and zero direct app-table privileges.

- [x] **Step 2: Run RED**

Run the new repository test and harness; expect missing repository/migration failures.

- [x] **Step 3: Implement migration 059**

Create forced-RLS tables `catalog_product_migration_jobs`, `catalog_product_migration_items`, `catalog_product_migration_media_items`, and immutable operation proofs. Security-definer functions revalidate the full authority tuple and subscription/feature/limit state. Begin creates the 50-category/6-brand taxonomy idempotently. Import-batch atomically writes products, variants, product profiles, category/resource relations and source-to-product mappings; no partial row survives a conflict.

- [x] **Step 4: Implement repository validation and recovery**

Use existing PostgreSQL acquisition/transaction/unknown-commit conventions. A write with unknown COMMIT performs exactly one read-only operation recovery and never repeats the mutation.

- [x] **Step 5: Run GREEN, rollback/reapply and manifest checks**

Run repository tests, migration assertions, backup/restore, rollback/reapply, concurrency and cleanup scenarios on disposable PostgreSQL 16.

- [x] **Step 6: Commit**

```bash
git add packages/saas-data/src/catalog-migration packages/saas-data/src/index.ts apps/owner/scripts/sql/saas/202607280059_* apps/owner/scripts/sql/saas/phase3-guzide-catalog-migration-manifest.json tests/saas-phase3/guzide-catalog-migration
git commit -m "feat(saas): add durable catalog migration authority"
```

### Task 3: SSRF-safe remote image ingestion into tenant R2

**Files:**
- Create: `apps/customer-panel/lib/catalog-migration/remote-image-authority.ts`
- Create: `apps/customer-panel/lib/catalog-migration/remote-image-authority.test.ts`
- Create: `apps/customer-panel/lib/catalog-migration/remote-image-fetcher.ts`
- Create: `apps/customer-panel/lib/catalog-migration/remote-image-fetcher.test.ts`
- Create: `apps/customer-panel/lib/catalog-migration/media-ingestion.ts`
- Create: `apps/customer-panel/lib/catalog-migration/media-ingestion.test.ts`

**Interfaces:**
- `fetchMigrationImage(url, dependencies)` returns frozen validated JPEG/PNG/WebP bytes with MIME and dimensions.
- `ingestMigrationMediaItem(input)` verifies the URL digest against PostgreSQL, fetches without ambient headers, and invokes the existing reserve/upload/finalize product-media saga for the exact mapped product.

- [x] **Step 1: Write failing authority/fetch/saga tests**

Cover every private/loopback/link-local/metadata IPv4 and IPv6 class, DNS rebinding, every redirect hop, credentials, fragments, ports, wrong MIME/signature, SVG/HTML, byte/dimension/time limits, operation replay, partial image failure, wrong product/store substitution and unknown COMMIT recovery.

- [x] **Step 2: Run RED**

Expected: missing modules.

- [x] **Step 3: Implement minimal secure fetcher and ingestion orchestration**

Use manual redirects, DNS validation on every hop, no cookies/auth/referrer/forwarded headers, status 200 only, fatal streaming bounds and existing image signature/dimension validation. Persist only URL digest, order and safe terminal code. Do not log source URL or bytes.

- [x] **Step 4: Run GREEN and product-media regressions**

- [x] **Step 5: Commit**

```bash
git add apps/customer-panel/lib/catalog-migration
git commit -m "feat(catalog): ingest migration images into tenant r2"
```

### Task 4: Authenticated HTTP routes and resumable panel workflow

**Files:**
- Create: `apps/customer-panel/lib/catalog-migration-http/request-authority.ts`
- Create: `apps/customer-panel/lib/catalog-migration-http/request-authority.test.ts`
- Create: `apps/customer-panel/lib/catalog-migration-http/handler.ts`
- Create: `apps/customer-panel/lib/catalog-migration-http/handler.test.ts`
- Create: `apps/customer-panel/lib/catalog-migration-http/default.ts`
- Create: `apps/customer-panel/app/api/catalog/admin/migrations/woocommerce/route.ts`
- Create: `apps/customer-panel/app/api/catalog/admin/migrations/woocommerce/[jobId]/route.ts`
- Create: `apps/customer-panel/app/api/catalog/admin/migrations/woocommerce/[jobId]/batch/route.ts`
- Create: `apps/customer-panel/app/api/catalog/admin/migrations/woocommerce/[jobId]/media/route.ts`
- Modify: `apps/customer-panel/components/catalog-admin/CatalogBulkImportConsole.tsx`
- Modify: `apps/customer-panel/components/catalog-admin/catalog-admin-console.module.css`
- Modify: `apps/customer-panel/lib/catalog-admin-console.test.ts`

**Interfaces:**
- Exact panel-session routes support begin, status, product batch and one media item.
- The browser compiles the selected file, begins/reopens the same digest job, uploads product batches sequentially, ingests media with concurrency 2, and can resume only after the same file digest is selected again.

- [ ] **Step 1: Write failing request-authority and workflow tests**

Prove exact same Origin, genuine session/action, exact paths/methods, no browser tenant/store authority, no raw URL in responses, digest mismatch denial, deterministic operation IDs, resume after interruption, product/media progress separation and no automatic product republish after media failure.

- [ ] **Step 2: Run RED**

- [ ] **Step 3: Implement routes and workflow**

The UI reports `products imported/total` and `media committed/failed/total` independently. A failed image remains retryable without duplicating the product or attaching another product's image.

- [ ] **Step 4: Run GREEN, accessibility and mobile checks**

Verify keyboard operation, 48x48 targets, alert/status announcements, zero horizontal overflow at 320/390/1024/1025 px and reduced motion.

- [ ] **Step 5: Commit**

```bash
git add apps/customer-panel/lib/catalog-migration-http apps/customer-panel/app/api/catalog/admin/migrations apps/customer-panel/components/catalog-admin
git commit -m "feat(panel): add resumable woocommerce migration"
```

### Task 5: Real export audit and complete local verification

**Files:**
- Create: `tests/saas-phase3/guzide-catalog-migration/real-export-audit.mjs`
- Do not add the exported CSV to Git.

- [ ] **Step 1: Audit the user-authorized export outside Git**

Run:

```bash
GUZIDE_WOOCOMMERCE_EXPORT=/absolute/private/path.csv node tests/saas-phase3/guzide-catalog-migration/real-export-audit.mjs
```

Expected exact structural evidence: 1,628 products, 41 columns, 5,646 image references, all image origins HTTPS and source-scoped, and deterministic manifest/batch totals. Output contains no descriptions, product URLs or credentials.

- [ ] **Step 2: Run complete verification**

Run focused tests, customer-panel/Owner/saas-data/saas-contracts/typechecks/builds, PostgreSQL harnesses, `git diff --check`, tracked-diff secret scan and forbidden browser-authority scan.

- [ ] **Step 3: Independent review and fixes**

Repair and re-review every Critical/Important finding, then rerun affected and full regression suites.

- [ ] **Step 4: Commit audit harness and push**

```bash
git add tests/saas-phase3/guzide-catalog-migration/real-export-audit.mjs
git commit -m "test(catalog): verify guzide migration manifest"
git push origin codex/guzide-woocommerce-migration-foundation
```

### Task 6: Separately controlled staging execution

- [ ] **Step 1: Deploy exact SHA only to isolated customer-panel staging**

No Owner/storefront/production deploy and no domain/DNS change. Apply migration 059 only after backup and exact staging sentinels pass. Configure the existing private R2 binding without printing credentials.

- [ ] **Step 2: Register/recover one Güzide staging merchant through the genuine browser flow**

Use the user-authorized identity without reporting raw credentials. Confirm exactly one tenant/store/media namespace and a valid `TenantContext`.

- [ ] **Step 3: Execute the exported product migration**

Select the official CSV, review warnings, import all product batches, ingest all media, and preserve zero source-store mutations. Do not import customers/orders in this workflow.

- [ ] **Step 4: Acceptance**

Verify product/category/brand/weight/price/stock/media counts in PostgreSQL, R2 and panel projections; sample storefront rendering; retry/replay; cross-store denial; logs/secrets; and zero production/domain impact.

- [ ] **Step 5: Report outcome**

Only report full product-migration PASS if all 1,628 products and every accepted media item have durable matching authority. Otherwise report exact product/media progress and the stable blockers without claiming completion.
