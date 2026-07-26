# Multichannel Catalog Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Hemenaku-style 12-platform file imports and a real, SSRF-safe manual CSV/JSON/XML feed import to the shared customer-panel catalog.

**Architecture:** A pure provider/parser module produces bounded rich product inputs. The existing authenticated catalog-admin HTTP and repository boundary persists products and variants atomically; a separate Node-only feed fetcher performs public-network validation before parsing. The client renders one four-step console for both source types.

**Tech Stack:** Next.js 16, React 19, TypeScript, Node test runner, PostgreSQL 16, `fast-xml-parser` 5.5.8.

## Global Constraints

- `apps/admin/**` is read-only and must have zero diff.
- Tenant/store authority comes only from the authenticated server `TenantContext`.
- Feed fetches are HTTPS-only, SSRF-safe, bounded, redirect-manual and server-side.
- No production deploy, credential change or infrastructure mutation.
- Red/green TDD is required for every behavior change.

---

### Task 1: Provider adapters and rich canonical input

**Files:**
- Create: `apps/customer-panel/lib/catalog-import/providers.ts`
- Create: `apps/customer-panel/lib/catalog-import/providers.test.ts`
- Modify: `apps/customer-panel/package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Produces: `CATALOG_IMPORT_PROVIDERS`, `buildCatalogImportTemplate(provider)`, `parseCatalogImportSource(text, { provider, format })`.
- Returns: frozen `{ products, warnings, skippedRows, totalRows }`, where each product has one or more variants.

- [ ] Write provider tests covering 12 fixtures, Shopify row grouping, delimiter/quote handling, JSON/XML, bounds, duplicates and malformed values.
- [ ] Run `node --experimental-transform-types --test apps/customer-panel/lib/catalog-import/providers.test.ts`; expect missing-module failure.
- [ ] Implement the bounded parser and direct `fast-xml-parser` dependency.
- [ ] Rerun the focused test; expect all provider cases PASS.
- [ ] Commit: `feat(catalog): add multichannel import adapters`.

### Task 2: Rich atomic PostgreSQL import

**Files:**
- Modify: `packages/saas-data/src/catalog-admin/types.ts`
- Modify: `packages/saas-data/src/catalog-admin/validation.ts`
- Modify: `packages/saas-data/src/catalog-admin/repository.ts`
- Modify: `packages/saas-data/src/catalog-admin/repository.test.ts`
- Modify: `apps/customer-panel/lib/catalog-admin-http/handler.ts`
- Modify: `apps/customer-panel/lib/catalog-admin-http/handler.test.ts`
- Create: `apps/owner/scripts/sql/saas/202607260038_catalog_rich_import.up.sql`
- Create: `apps/owner/scripts/sql/saas/202607260038_catalog_rich_import.down.sql`
- Create: `apps/owner/scripts/sql/saas/202607260038_catalog_rich_import_assertions.sql`
- Create: `apps/owner/scripts/sql/saas/phase3c2b-catalog-rich-import-manifest.json`
- Modify: `tests/saas-phase3/catalog-administration/postgres-harness.mjs`

**Interfaces:**
- `CatalogAdminImportProduct` contains `title`, `slug`, optional `description`, `status`, and `variants`.
- `CatalogAdminImportVariant` contains bounded title/SKU/barcode/pricing/stock/attributes.
- `CatalogAdminRepository.importProducts` remains the single mutation boundary.

- [ ] Add failing validation/repository/HTTP tests for rich variants and exact object shapes.
- [ ] Run focused package and HTTP tests; expect rejection/missing-field failures.
- [ ] Implement type, validation, repository ID generation and request validation.
- [ ] Add migration 038 so products, every variant, job and operation proof commit atomically under locked store authority.
- [ ] Extend the PostgreSQL harness for multi-variant import, replay, mismatch, duplicate SKU/slug, limit, tenant isolation and rollback/reapply.
- [ ] Run repository, HTTP and PostgreSQL tests; expect all PASS.
- [ ] Commit: `feat(catalog): persist rich bulk imports atomically`.

### Task 3: Proxy-safe feed preview

**Files:**
- Create: `apps/customer-panel/lib/catalog-import/feed-authority.ts`
- Create: `apps/customer-panel/lib/catalog-import/feed-authority.test.ts`
- Create: `apps/customer-panel/lib/catalog-import/feed-fetcher.ts`
- Create: `apps/customer-panel/lib/catalog-import/feed-fetcher.test.ts`
- Modify: `apps/customer-panel/lib/catalog-admin-http/handler.ts`
- Modify: `apps/customer-panel/lib/catalog-admin-http/handler.test.ts`
- Modify: `apps/customer-panel/lib/catalog-admin-http/default.ts`
- Create: `apps/customer-panel/app/api/catalog/admin/imports/feed/preview/route.ts`

**Interfaces:**
- `validateCatalogFeedUrl(value)` returns a canonical HTTPS URL or throws `catalog_feed_url_invalid`.
- `fetchCatalogFeed(url, deps)` returns a bounded `{ mediaType, body }` after public-address checks.
- `POST /api/catalog/admin/imports/feed/preview` returns only canonical products/warnings and never authority or secrets.

- [ ] Add failing tests for exact Origin/session/action authority and SSRF/redirect/MIME/timeout/body-size cases.
- [ ] Run focused tests; expect route/fetcher missing failures.
- [ ] Implement URL validation, public IP classification, pinned HTTPS request, redirect revalidation and bounded response reading.
- [ ] Connect the preview handler to the same provider parser without performing a mutation.
- [ ] Rerun focused tests; expect all PASS.
- [ ] Commit: `feat(catalog): add secure product feed preview`.

### Task 4: Hemenaku-style four-step console

**Files:**
- Rewrite: `apps/customer-panel/components/catalog-admin/CatalogBulkImportConsole.tsx`
- Modify: `apps/customer-panel/components/catalog-admin/catalog-admin-console.module.css`
- Modify: `apps/customer-panel/lib/catalog-admin-ui/client.ts`
- Modify: `apps/customer-panel/lib/catalog-admin-ui/client.test.ts`
- Modify: `apps/customer-panel/lib/catalog-admin-ui/csv.ts`
- Modify: `apps/customer-panel/lib/catalog-admin-ui/csv.test.ts`
- Modify: `apps/customer-panel/lib/catalog-admin-console.test.ts`

**Interfaces:**
- File and feed tabs both produce the same immutable preview model.
- Import remains one idempotent POST through `catalogAdminApi.importProducts`.

- [ ] Add failing UI/static/client tests for provider selection, template, preview, warnings, feed URL and one mutation only.
- [ ] Run focused tests; expect missing controls/contracts.
- [ ] Implement the four steps, provider cards, source tabs, template download, preview metrics, progress and history.
- [ ] Verify keyboard focus, 48 px controls, alert/status semantics, 320 px no-overflow and reduced motion.
- [ ] Rerun focused tests; expect all PASS.
- [ ] Commit: `feat(panel): add multichannel product import console`.

### Task 5: Whole-branch verification

**Files:**
- Modify only test allowlists proven necessary by the new authorized modules.

- [ ] Run customer-panel workspace tests, typecheck and build.
- [ ] Run saas-data and Owner tests/typechecks/builds.
- [ ] Run the complete PostgreSQL catalog-administration harness on PostgreSQL 16.
- [ ] Run static-security, `git diff --check`, forbidden import/API/browser-authority scan and tracked-diff secret scan.
- [ ] Confirm `git diff --name-only <base>...HEAD -- apps/admin` is empty.
- [ ] Perform local browser desktop/mobile workflow verification and record the screenshot paths.
- [ ] Request independent code review, repair Critical/Important findings and re-run affected tests.
- [ ] Push normally and report exact remote parity; do not deploy production.
