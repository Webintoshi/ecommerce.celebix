# Barcode and Label Studio V1 Design

## Status

Approved for implementation by Atlas in `ATLAS-BARCODE-STUDIO-V1`.

## Goal

Replace the current 500-row, detail-fan-out barcode page with a scalable,
tenant-safe Barcode and Label Studio for the shared merchant application at
`apps/customer-panel`. The studio must support variant selection across
cursor pages, per-variant quantities, reusable sector templates, live vector
preview, isolated browser print, real-size PDF, 203/300 DPI ZPL, store-owned
templates, replay-safe internal barcode creation, and print history.

## Source of truth and scope

- Base branch: `codex/design-tabs-save-fix-live`
- Approved starting SHA: `fbd076ec8f89f9dc74a086d186d48a9484099102`
- Feature branch: `codex/atlas-barcode-studio-v1`
- Product application: `apps/customer-panel`
- Shared contracts: `packages/saas-contracts`
- Shared persistence: `packages/saas-data`
- Additive migration: next discovered migration, `123`
- `apps/admin/**` is out of scope and must remain unchanged.
- Production deployment is out of scope. The completed merge is deployed only
  to the named Customer Panel staging application after backup and migration.

## Existing problem

The current server page walks product pages, calls `getProductDetails` once
per product, projects only variants with an existing barcode, stops at 500
rows, and sends the entire result to a client-only search/card surface. It
prints the whole Customer Panel DOM through `window.print()` and does not
provide variant selection, quantities, templates, measured output, PDF, ZPL,
history, or safe internal barcode assignment.

## Architecture

### 1. Dedicated bounded domain

Create a `barcode-labels` domain in `saas-contracts` and `saas-data`. It owns:

- exact list query and cursor binding types;
- list row, template, print job, and mutation projections;
- template configuration and output-document validation;
- a store-bound PostgreSQL repository;
- finite public error codes and replay-aware mutations.

The existing catalog repository remains the source of product lifecycle
behavior. The new domain reads catalog rows and creates only barcode-label
templates, barcode print jobs, and internal barcodes.

### 2. One-query variant projection

Migration 123 adds `saas.barcode_label_list_variants(...)`. One invocation
returns a page of variant rows plus a bound cursor anchor. The projection joins
products, active variants, category and brand resources in SQL and returns the
minimum safe fields required by the studio. It never calls a row-detail
function.

The query supports `q`, product status, stock state, category, brand,
`hasBarcode`, sort, cursor, and page size. Global search matches product title,
variant title, SKU, and barcode. The repository cursor contains a version,
store ID, canonical query digest including page size, and a stable sort key +
variant ID anchor. Reuse with a different tenant or query fails closed.

### 3. Durable store-owned records

Migration 123 creates:

- `saas.barcode_label_templates`
- `saas.barcode_print_jobs`
- `saas.barcode_print_job_items`
- `saas.barcode_label_operations`

All tables are store-bound, force RLS, have no public/application table grants,
and are reachable only through `SECURITY DEFINER` functions with fixed search
paths. Custom template names are unique per active store. Templates use
archive semantics. A print job stores a template snapshot plus server-derived
variant snapshots and quantities, never PDF/ZPL binaries. Operation rows bind
idempotency IDs to canonical payload fingerprints.

System templates remain immutable TypeScript constants and are never stored as
merchant rows. Custom templates store the same validated finite configuration.

### 4. Internal barcode safety

Internal identifiers use the reserved Code 128-compatible `CXI-` prefix. They
are not presented as EAN, UPC, GTIN, or GS1 values. SQL locks the store and
target variants, changes only rows whose barcode is null, verifies target
tenant and expected version, and records the result under an idempotency key.
A partial store/barcode unique index for `CXI-%` values prevents duplicate
internal identifiers. Existing non-null barcodes are reported as failures and
never overwritten. Cross-tenant IDs are indistinguishable from not found.

### 5. One label-document model

`LabelDocument` is the only normalized print model. It contains:

- template snapshot and real millimetre dimensions;
- paper/printer profile and optional A4 starting cell;
- normalized ordered visible fields;
- server-derived variant snapshot;
- quantity and validated barcode format/value;
- explicit overflow and barcode-fit validation results.

Preview, isolated browser print, PDF, and ZPL consume this model. They may have
format-specific drawing adapters but may not independently recalculate product
text, price, quantities, barcode source, or template fields.

### 6. Barcode and output libraries

- `@bwip-js/browser` and `@bwip-js/node` 4.11.4: MIT, actively published in
  August 2026, SVG/bitmap support in browser and Node. Browser use is isolated
  to the preview renderer and Node use to server output/decoder fixtures.
- `pdfmake` 0.2.23: MIT and actively published in June 2026. It remains
  server-only, supplies embedded Unicode-capable fonts, supports SVG vectors,
  custom point sizes, and multi-page documents. It does not enter the client
  bundle.
- `@zxing/library` 0.23.0: Apache-2.0 and `pngjs` 7.0.0: MIT. Both are
  development-only decoder-test dependencies and do not enter production
  bundles.

Code 128 and EAN-13 retain leading zeroes as strings. EAN-13 accepts exactly
13 digits with a valid checksum. Invalid symbology or insufficient quiet-zone
fit blocks preview finalization and every output route.

### 7. Authorization and request boundaries

Every request resolves session, membership, tenant, plan, and store on the
server. Browser store IDs and private authority headers are rejected.

| Capability | store_owner | admin | editor | analyst |
| --- | --- | --- | --- | --- |
| List and preview | allow | allow | allow | allow |
| Create print job / PDF / ZPL / browser print | allow | allow | allow through `catalog_admin.manage` | deny |
| Custom template mutation | allow | allow | allow through `catalog_admin.manage` | deny |
| Internal barcode creation | allow | allow | allow through `catalog_admin.manage` | deny |

Mutations require exact same-origin and `Idempotency-Key`. Cross-tenant
variant, template, or job identifiers return 404; disallowed roles return 403.
The same policy is enforced in HTTP, repository, and SQL.

### 8. Three-step UI

The studio uses one compact work surface:

1. `Ürünleri seç`: server-side toolbar, selectable variant table, per-row
   quantity, cursor navigation, and cross-page selection summary.
2. `Etiketi düzenle`: system/custom template selection and deterministic
   show/hide, move-up/down, alignment, font, dimensions, barcode, paper, and
   printer controls.
3. `Önizle ve yazdır`: live document preview, overflow/barcode errors, A4
   start cell, print-job creation, isolated print, PDF, and ZPL actions.

Desktop uses a wide work area and sticky summary/preview rail. Mobile turns the
steps into a compact tab flow with a collapsible summary and table-contained
scrolling. The document itself must have zero horizontal overflow at 1440,
1024, and 390 pixels.

Selection state stores only `variantId`, `variantVersion`, and integer
quantity. Zero excludes a row. Negative, fractional, non-safe, and excessive
values fail before a request. Large totals require explicit confirmation.

### 9. Entry points and print route

The product list row menu and product detail page link to the studio with
validated product/variant preselection query parameters. The studio resolves
the actual row server-side; query values never become authority.

`/products/barcode-labels/print?jobId=...` is an authenticated server route
that loads one store-bound job, checks output permission, and renders only the
label document. It contains no Customer Panel header, sidebar, or bot chrome.

### 10. Rollout and rollback

Migration 123 is additive and leaves all prior application contracts intact.
Old application + new schema, new application + new schema, and code-only
rollback + new schema must pass. Standard rollback is code-only. Down migration
is emergency/pre-restore only and fails closed while any custom template,
operation, or print history would be lost.

Staging rollout is migration-first: exact merge SHA, database backup and
restore-readiness evidence, migration 123 + assertions, Customer Panel deploy,
exact running SHA check, browser QA, then fixture cleanup. Production is never
deployed by this task.

## Verification

- Contract, repository, HTTP, document, barcode, PDF, ZPL, UI, and route tests
  are written RED before production implementation.
- A PostgreSQL 16 harness applies migrations through 122, then 123 and its
  assertions, and covers tenant isolation, role matrix, replay, migration-first
  compatibility, and code-only rollback.
- Code 128 and EAN-13 bitmap fixtures are decoded by ZXing independently of
  the encoder.
- Request-budget tests prove one list request, optional one metadata request,
  and zero detail fan-out.
- Fresh contracts/data/Customer Panel tests, three typechecks, Customer Panel
  production build, migration static tests, current Phase 3 comparison, and
  `git diff --check` are required before merge.
- Browser QA verifies the real staging workflow, downloaded PDF/ZPL, responsive
  widths, console/network cleanliness, and QA-only fixture cleanup.
