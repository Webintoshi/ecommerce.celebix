# Barcode and Label Studio V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build, secure, test, merge, and stage a scalable professional barcode and label studio for the shared Customer Panel.

**Architecture:** A dedicated barcode-label contract/repository domain exposes one server-side variant projection and store-bound template/job mutations. A single normalized `LabelDocument` feeds SVG preview, isolated print, PDF, and ZPL adapters, while a three-step React console holds only bounded query and selection state.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.9, PostgreSQL 16, `@bwip-js/browser`, `@bwip-js/node`, `pdfmake`, ZXing test decoder, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-02-barcode-label-studio-design.md`

## Global Constraints

- Start from exact remote canonical SHA `fbd076ec8f89f9dc74a086d186d48a9484099102` in isolated branch `codex/atlas-barcode-studio-v1`.
- Never edit `apps/admin/**`, another worktree, or user-owned dirty files.
- Write and observe failing behavioral tests before each production change.
- Use only session-derived `TenantContext`; browser store IDs are never authority.
- Mutations require same-origin, finite payload validation, idempotency, repository binding, and SQL authorization.
- Cross-tenant resources return 404; unauthorized mutations return 403.
- Do not deploy production, restart unrelated containers, expose secrets, or mutate genuine Güzide product data.
- Build and typecheck must not run concurrently against `.next`.

---

### Task 1: Freeze the public contract and barcode/document core

**Files:**
- Create: `packages/saas-contracts/src/barcode-labels/types.ts`
- Create: `packages/saas-contracts/src/barcode-labels/validation.ts`
- Create: `packages/saas-contracts/src/barcode-labels/barcode-labels.test.ts`
- Create: `packages/saas-contracts/src/barcode-labels/index.ts`
- Modify: `packages/saas-contracts/src/index.ts`
- Create: `apps/customer-panel/lib/barcode-labels/system-templates.ts`
- Create: `apps/customer-panel/lib/barcode-labels/document.ts`
- Create: `apps/customer-panel/lib/barcode-labels/barcodes.ts`
- Create: `apps/customer-panel/lib/barcode-labels/document.test.ts`
- Modify: `apps/customer-panel/package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Produces `BarcodeLabelListQuery`, `BarcodeLabelVariantRow`, `BarcodeLabelTemplate`, `BarcodePrintJob`, `BarcodePrintJobItem`, `LabelTemplateConfig`, `LabelDocument`, parsers, and canonical query binding/digest.
- Produces immutable system templates and `buildLabelDocument(...)`, `validateEan13(...)`, and SVG barcode rendering inputs consumed by every output adapter.

- [ ] Write contract RED tests for exact query/filter/sort/page bounds, deep-freeze, hidden authority rejection, exact projections, quantities, templates, jobs, and document shapes; run the targeted contract test and verify the missing API failure.
- [ ] Add exact immutable types/parsers and root exports; run targeted and full contracts tests green.
- [ ] Write Customer Panel RED tests for system templates, jewelry/apparel attribute normalization, field order/visibility, Turkish long-text overflow, integer quantities, Code 128 leading zero/quiet-zone fit, EAN-13 checksum, and zero-row exclusion.
- [ ] Install pinned barcode/PDF runtime dependencies and test-only decoder dependencies; record license, publication, SSR, and client/server bundle decisions in the spec and lockfile.
- [ ] Implement immutable system templates, canonical document construction, safe text normalization, money formatting, quantity totals, and barcode validation until targeted tests pass.
- [ ] Keep the spec, plan, contracts, document core, dependencies, and tests staged for the first functional commit after the PostgreSQL and HTTP boundaries are green.

### Task 2: Add migration 123 and the store-bound PostgreSQL repository

**Files:**
- Create: `apps/owner/scripts/sql/saas/202609020123_barcode_label_studio.up.sql`
- Create: `apps/owner/scripts/sql/saas/202609020123_barcode_label_studio.down.sql`
- Create: `apps/owner/scripts/sql/saas/202609020123_barcode_label_studio_assertions.sql`
- Create: `apps/owner/scripts/sql/saas/barcode-label-studio-migration.test.ts`
- Create: `apps/owner/scripts/sql/saas/phase5j-barcode-label-studio-manifest.json`
- Create: `packages/saas-data/src/barcode-labels/types.ts`
- Create: `packages/saas-data/src/barcode-labels/errors.ts`
- Create: `packages/saas-data/src/barcode-labels/canonical.ts`
- Create: `packages/saas-data/src/barcode-labels/cursor.ts`
- Create: `packages/saas-data/src/barcode-labels/repository.ts`
- Create: `packages/saas-data/src/barcode-labels/repository.test.ts`
- Create: `packages/saas-data/src/barcode-labels/index.ts`
- Modify: `packages/saas-data/src/index.ts`

**Interfaces:**
- Produces `PostgresBarcodeLabelRepository` with `listVariants`, `listTemplates`, `saveTemplate`, `archiveTemplate`, `createInternalBarcodes`, `listPrintJobs`, `createPrintJob`, and `getPrintJob`.
- Produces SQL functions with matching finite projections and stable outcome codes.

- [ ] Write repository RED tests that assert one list SQL call, no detail fan-out, exact parameter binding, query/page-size cursor binding, cross-store projection rejection, role denial, replay, and output parsing.
- [ ] Write migration static RED tests for four force-RLS tables, no table grants, exact function ACLs, reserved-prefix unique index, archive-only templates, data-loss down guard, and manifest checksums.
- [ ] Implement migration 123 tables, constraints, indexes, projection helpers, list function, template functions, internal barcode transaction, print-job functions, ACLs, assertions, and guarded down migration.
- [ ] Implement repository validation, canonical fingerprints, bound cursor, transaction handling, unknown-commit recovery, and exact projection parsing.
- [ ] Run targeted migration/contract/data tests until green; regenerate checksum manifest mechanically and re-run static tests.

### Task 3: Mount secure Customer Panel runtime, HTTP routes, and client

**Files:**
- Create: `apps/customer-panel/lib/server-barcode-labels/runtime.ts`
- Create: `apps/customer-panel/lib/server-barcode-labels/default.ts`
- Create: `apps/customer-panel/lib/server-barcode-labels/runtime.test.ts`
- Modify: `apps/customer-panel/lib/server-panel-access/postgres-runtime.ts`
- Create: `apps/customer-panel/lib/barcode-label-http/request-authority.ts`
- Create: `apps/customer-panel/lib/barcode-label-http/request-input.ts`
- Create: `apps/customer-panel/lib/barcode-label-http/handler.ts`
- Create: `apps/customer-panel/lib/barcode-label-http/default.ts`
- Create: `apps/customer-panel/lib/barcode-label-http/handler.test.ts`
- Create: `apps/customer-panel/lib/barcode-label-ui/client.ts`
- Create: `apps/customer-panel/lib/barcode-label-ui/client.test.ts`
- Create/modify: `apps/customer-panel/app/api/catalog/barcode-labels/**/route.ts`

**Interfaces:**
- Produces the exact list, internal barcode, template, print-job, PDF, and ZPL API surface.
- HTTP handlers accept only fixed paths/methods/query keys, reject private authority, resolve persistent panel session, enforce exact same-origin for mutations, and map stable errors.

- [ ] Write runtime RED tests requiring repository registration on the approved server runtime and a facade exposing only the finite barcode-label methods.
- [ ] Write handler RED tests for owner/admin/editor/analyst matrix, unauthenticated 401, cross-origin 403, private authority 400, cross-tenant 404, idempotency header, exact routes, and no repository call on denial.
- [ ] Write client RED tests for server-side list query serialization, selection-safe DTOs, same-origin credentials, idempotency keys, exact response parsing, binary PDF/ZPL downloads, abort propagation, and secret-free errors.
- [ ] Register the repository in `postgres-runtime`, mount all App Router handlers, and implement the strict client until targeted tests pass.
- [ ] Run Customer Panel, contracts, and data targeted suites green.
- [ ] Commit Tasks 1–3 with `feat(catalog): add scalable barcode label projection` only after the projection, persistence, runtime, HTTP, and client boundaries are green together.

### Task 4: Add common renderers and independently decode barcodes

**Files:**
- Create: `apps/customer-panel/lib/barcode-labels/svg.ts`
- Create: `apps/customer-panel/lib/barcode-labels/pdf.server.ts`
- Create: `apps/customer-panel/lib/barcode-labels/zpl.ts`
- Create: `apps/customer-panel/lib/barcode-labels/output.test.ts`
- Create: `apps/customer-panel/lib/barcode-labels/decoder.test.ts`
- Create: `apps/customer-panel/components/barcode-labels/BarcodeVector.tsx`
- Create: `apps/customer-panel/app/products/barcode-labels/print/page.tsx`
- Create: `apps/customer-panel/app/products/barcode-labels/print/PrintDocument.tsx`

**Interfaces:**
- Consumes only validated `LabelDocument`.
- Produces SVG preview fragments, isolated print markup, PDF bytes with real mm pages, and ZPL bytes for 203/300 DPI.

- [ ] Write output RED tests for preview/PDF/ZPL snapshot equality, real mm media boxes, multi-page A4, start-cell skip, no split labels, 203/300 DPI conversions, Turkish text policy, and isolated route chrome exclusion.
- [ ] Write decoder RED tests that render Code 128 and EAN-13 through the production encoder, decode bitmap output through ZXing, and compare exact leading-zero values; verify invalid EAN never reaches an adapter.
- [ ] Implement browser/Node SVG adapters, server-only PDFMake renderer, deterministic ZPL renderer, safe file names, and isolated authenticated print document.
- [ ] Run output/decoder tests green and verify PDF/ZPL responses expose safe content types and download names.
- [ ] Commit output production code and tests with `feat(printing): add pdf and zpl label outputs` when green.

### Task 5: Build the three-step Barcode Studio and product entry points

**Files:**
- Replace: `apps/customer-panel/components/catalog-admin/BarcodeLabelConsole.tsx`
- Replace: `apps/customer-panel/app/products/barcode-labels/page.tsx`
- Create: `apps/customer-panel/components/barcode-labels/BarcodeStudio.tsx`
- Create: `apps/customer-panel/components/barcode-labels/VariantSelectionTable.tsx`
- Create: `apps/customer-panel/components/barcode-labels/TemplateEditor.tsx`
- Create: `apps/customer-panel/components/barcode-labels/StudioSummary.tsx`
- Create: `apps/customer-panel/components/barcode-labels/PrintHistory.tsx`
- Create: `apps/customer-panel/lib/barcode-label-ui/selection.ts`
- Create: `apps/customer-panel/lib/barcode-label-ui/url-state.ts`
- Create: `apps/customer-panel/lib/barcode-label-ui/presentation.test.ts`
- Create: `apps/customer-panel/lib/barcode-label-ui/selection.test.ts`
- Create: `apps/customer-panel/lib/barcode-label-ui/url-state.test.ts`
- Modify: `apps/customer-panel/components/catalog/ProductListConsole.tsx`
- Modify: `apps/customer-panel/components/catalog/ProductDetailConsole.tsx`
- Modify: `apps/customer-panel/app/globals.css`

**Interfaces:**
- Consumes the barcode-label API client and system/custom template registry.
- Produces URL-stable server query state, variant-only cross-page selection, quantity modes, live document preview, safe output actions, template/history controls, and product preselection entry points.

- [ ] Write RED tests for search/filter/sort/cursor URL state, browser back/forward/refresh restoration, cross-page selection, hidden selected count, duplicate prevention, manual/stock/bulk quantities, zero exclusion, invalid quantity rejection, large-total confirmation, and stock-disabled behavior.
- [ ] Write presentation RED tests for the exact three steps, compact table columns, loading/error/retry, barcode-missing versus zero-results states, keyboard controls, screen-reader text, single primary action, sticky summary, and no `window.print`/500/detail-fan-out model.
- [ ] Implement the controller and focused components against existing Customer Panel typography, tokens, icons, and open/table container model; do not introduce a card wall or visible copy outside the approved inventory.
- [ ] Add product list/detail entry links that carry only opaque preselection hints and resolve actual rows through the list API.
- [ ] Add request-budget regression proving one list request, optional one metadata request, and zero row detail requests.
- [ ] Verify local rendered UI at 1440, 1024, and 390 pixels; record a five-point fidelity ledger against the approved text design and generated internal reference.
- [ ] Commit frontend code and tests with `feat(customer-panel): build barcode label studio` when green.

### Task 6: PostgreSQL 16 rehearsal and full technical verification

**Files:**
- Create: `tests/saas-phase3/barcode-label-studio/postgres-harness.mjs`
- Create: `tests/saas-phase3/barcode-label-studio/static-security.test.mjs`
- Modify: `tests/saas-phase3/run-current-suite.mjs`

**Interfaces:**
- Produces disposable PostgreSQL 16 evidence for migration 123 and runner registration with an exact scenario total/completion line.

- [ ] Write the PostgreSQL harness scenarios before migration implementation is considered complete: migrations through 122, 123 up/assertions, old app + new schema, new app + new schema, code-only rollback, global search beyond row 1600, stable pages/no duplicates, cursor tenant/query binding, role matrix, cross-tenant 404-equivalent outcomes, replay, existing-barcode preservation, internal uniqueness, templates, jobs, and guarded down.
- [ ] Register the harness in `run-current-suite.mjs` with its exact total and completion line; verify registration test fails before the harness is complete, then green.
- [ ] Run the dedicated PostgreSQL harness and migration static tests fresh.
- [ ] Run contracts, data, Customer Panel tests, and `npm run test:saas-phase3:current`; compare exact base and branch and require branch-only new failures = 0.
- [ ] Run contracts, data, and Customer Panel typechecks, then Customer Panel production build sequentially.
- [ ] Run `git diff --check`, dependency/license scan, secret scan, destructive SQL scan, and confirm `git diff --name-only <base>...HEAD -- apps/admin` is empty.
- [ ] Commit remaining regression/harness work with `test(barcodes): cover templates outputs and tenant isolation`.

### Task 7: Independent review, PR, merge, and staging-only rollout

**Files:**
- Review all branch changes and generated evidence; do not add unrelated scope.

**Interfaces:**
- Produces a merge commit on `codex/design-tabs-save-fix-live`, exact staging running SHA, browser evidence, and cleaned QA fixtures.

- [ ] Dispatch an independent reviewer to inspect barcode validity, request model, selection/quantity behavior, generic templates, output dimensions/DPI, common document model, tenant/role policy, no fake GTIN, no overwrite, genuine-product immutability, and `apps/admin/**` scope.
- [ ] For every Critical/Important finding, write a failing regression test, implement the minimal fix, and re-run impacted plus full gates; repeat review until none remain.
- [ ] Push `codex/atlas-barcode-studio-v1`, create the approved PR title/body, verify base/head/commit/file scope and mergeability, and merge by merge commit only.
- [ ] Record the merge SHA; if migration exists, take a staging SaaS database backup and prove restore readability before applying migration 123 and assertions.
- [ ] Deploy exact merge SHA only to Customer Panel staging UUID `yk1h6d97z7ex0h74ok3zrj5c`; verify running SHA equality and HTTP 200.
- [ ] Through the real browser, create only timestamped Atlas QA products, execute the 24-step barcode QA, inspect PDF/ZPL/decoder evidence, test 1440/1024/390 with zero horizontal overflow, and require console errors/warnings and unexpected 4xx/5xx = 0.
- [ ] Archive QA products/templates, remove policy-allowed temporary print jobs/files/logs, prove genuine Güzide product barcode/price/stock/variant values unchanged, and preserve the source branch.
- [ ] Use the exact 24-line Atlas final report format; report physical printer QA as `BLOCKED EXTERNAL — COMPATIBLE HARDWARE NOT AVAILABLE` when no compatible device exists.
