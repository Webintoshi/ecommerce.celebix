# Customer Panel Products Complete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete every audited Customer Panel product-management workflow and verify it on staging without changing the legacy admin or production.

**Architecture:** Extend the current catalog, onboarding, and media modules with focused immutable contracts and additive SQL functions. Share in-memory draft and dirty-state controllers across product UI surfaces, keep every durable mutation tenant-bound and idempotent, and preserve old-code/new-schema compatibility.

**Tech Stack:** TypeScript, React 19, Next.js 16 App Router, Node test runner, PostgreSQL 16, PL/pgSQL, existing R2 storage adapter, Coolify staging.

**Spec:** `docs/superpowers/specs/2026-08-30-customer-panel-products-complete-design.md`

## Global Constraints

- Base is `origin/codex/design-tabs-save-fix-live` at `c0c59d65076c9cfcae87f6aef26ffd4b41892a7e`.
- Branch is `codex/atlas-products-complete`; pull request base is `codex/design-tabs-save-fix-live`.
- Never modify `apps/admin/**`, production infrastructure, real customer products, or migrations 001 through 116.
- Browser inputs never carry store, tenant, principal, membership, plan, database-role, object-key, or signing-key authority.
- Mutation denials are 403; cross-tenant resource identifiers are indistinguishable from missing resources and return 404.
- Migrations are additive: 117 for atomic bulk/safe removal and 118 for media retention/restore/cleanup proof. Migration 119 is not needed because preview tokens are stateless.
- Every production behavior follows RED, verified RED, GREEN, verified GREEN, then refactor.
- Use logical commits with the exact Atlas-approved subjects.

---

### Task 1: Shared product draft, dirty navigation, conflict preservation, and merchandising state

**Files:**
- Create: `apps/customer-panel/lib/catalog-ui/product-draft-session.ts`
- Create: `apps/customer-panel/lib/catalog-ui/product-draft-session.test.ts`
- Create: `apps/customer-panel/lib/catalog-ui/dirty-navigation.ts`
- Create: `apps/customer-panel/lib/catalog-ui/dirty-navigation.test.ts`
- Modify: `apps/customer-panel/components/catalog/ProductCreateForm.tsx`
- Modify: `apps/customer-panel/components/catalog-onboarding/ProductQuickCreateDialog.tsx`
- Modify: `apps/customer-panel/components/catalog-onboarding/ProductAdvancedEditor.tsx`
- Modify: `apps/customer-panel/components/catalog/ProductDetailConsole.tsx`
- Modify: `apps/customer-panel/components/catalog/ProductMediaManager.tsx`
- Modify: `apps/customer-panel/lib/product-console.test.ts`
- Modify: `apps/customer-panel/lib/product-onboarding-console.test.ts`

**Interfaces:**
- Produces: `ProductDraftSession`, `createEmptyProductDraft()`, `mergeQuickDraft()`, `productDraftIsDirty()`, `createDirtyNavigationGuard()`.
- Produces: conflict state `{ localDraft, serverSnapshot, phase: "conflict" }` without closing the active form.
- Consumes: existing `CatalogAdvancedCreateIntent`, `VariantDraft`, `CatalogProductEditorProjection`, and selected `File` objects.

- [ ] **Step 1: Write failing draft-session tests**

  Assert with literal fixtures that title, price, stock, category, image `File` identity, alt text, and advanced fields survive quick-to-advanced conversion; an unchanged draft is clean; one changed nested variant or media field is dirty; resetting to the committed snapshot is clean.

- [ ] **Step 2: Run draft tests and verify RED**

  Run: `node --experimental-strip-types --test apps/customer-panel/lib/catalog-ui/product-draft-session.test.ts apps/customer-panel/lib/catalog-ui/dirty-navigation.test.ts`

  Expected: FAIL because both modules and exported functions are absent.

- [ ] **Step 3: Implement immutable draft and guard controllers**

  Use these finite public shapes:

  ```ts
  export type ProductDraftSession = Readonly<{
    initial: ProductDraft;
    current: ProductDraft;
    media: readonly Readonly<{ file: File; altText: string; preview: string }>[];
  }>;

  export function productDraftIsDirty(session: ProductDraftSession): boolean;
  export function createDirtyNavigationGuard(options: {
    isDirty(): boolean;
    confirm(message: string): boolean;
  }): Readonly<{ canLeave(): boolean; bindBeforeUnload(window: Window): () => void }>;
  ```

  Compare normalized value fields and `File` identity; never serialize files or write browser storage.

- [ ] **Step 4: Verify draft tests GREEN**

  Run the same focused command and require zero failures.

- [ ] **Step 5: Write failing component behavior tests**

  Cover quick-to-advanced field/media preservation, cancel/link/unload confirmation, successful-save guard reset, version-conflict local draft preservation, explicit server-snapshot replacement, independent merchandising loading/error/retry, and a still-visible base product detail during merchandising failure.

- [ ] **Step 6: Verify component tests RED**

  Run: `node --experimental-strip-types --test apps/customer-panel/lib/product-console.test.ts apps/customer-panel/lib/product-onboarding-console.test.ts`

  Expected: FAIL on the missing draft handoff, conflict controls, and retry state.

- [ ] **Step 7: Wire all product forms to the shared controllers**

  Lift the create draft into `ProductCreateForm`; pass value/onChange props to quick and advanced editors; preserve object URLs until the draft is committed or abandoned. Replace conflict reload/close branches with local/server snapshots and explicit commands. Split merchandising load errors from product detail errors and expose `Tekrar dene`.

- [ ] **Step 8: Verify focused and workspace tests GREEN**

  Run the focused command, then `npm run test --workspace @celebix/customer-panel`.

- [ ] **Step 9: Commit**

  ```bash
  git add apps/customer-panel docs/superpowers
  git commit -m "fix(customer-panel): unify product drafts and conflict handling"
  ```

### Task 2: Bidirectional server pagination and atomic bulk lifecycle

**Files:**
- Modify: `packages/saas-contracts/src/catalog/types.ts`
- Modify: `packages/saas-contracts/src/catalog/validation.ts`
- Modify: `packages/saas-contracts/src/catalog/catalog.test.ts`
- Modify: `packages/saas-contracts/src/authorization/actions.ts`
- Modify: `packages/saas-contracts/src/authorization/actions.test.ts`
- Modify: `packages/saas-data/src/catalog/types.ts`
- Modify: `packages/saas-data/src/catalog/validation.ts`
- Modify: `packages/saas-data/src/catalog/repository.ts`
- Modify: `packages/saas-data/src/catalog/repository.test.ts`
- Modify: `apps/customer-panel/lib/catalog-http/request-input.ts`
- Modify: `apps/customer-panel/lib/catalog-http/request-input.test.ts`
- Modify: `apps/customer-panel/lib/catalog-http/handler.ts`
- Modify: `apps/customer-panel/lib/catalog-http/handler.test.ts`
- Modify: `apps/customer-panel/lib/catalog-http/default.ts`
- Modify: `apps/customer-panel/lib/catalog-ui/client.ts`
- Modify: `apps/customer-panel/lib/catalog-ui/client.test.ts`
- Modify: `apps/customer-panel/lib/catalog-ui/product-list-query.ts`
- Modify: `apps/customer-panel/lib/catalog-ui/product-list-query.test.ts`
- Modify: `apps/customer-panel/components/catalog/ProductListConsole.tsx`
- Modify: `apps/customer-panel/lib/product-console.test.ts`
- Create: `apps/customer-panel/app/api/catalog/products/bulk/route.ts`
- Create: `apps/owner/scripts/sql/saas/202608300117_catalog_product_bulk_safe_removal.up.sql`
- Create: `apps/owner/scripts/sql/saas/202608300117_catalog_product_bulk_safe_removal.down.sql`
- Create: `apps/owner/scripts/sql/saas/202608300117_catalog_product_bulk_safe_removal_assertions.sql`

**Interfaces:**
- Produces: `CatalogProductPageSize = 20 | 50 | 100`, URL-safe current cursor, cursor stack navigation, and `CatalogBulkProductIntent`.
- Produces repository methods `bulkMutateProducts(input)` and `getProductRemovalEligibility(input)`.
- SQL functions return finite `committed`, `operation_replayed`, `operation_mismatch`, `version_conflict`, `membership_denied`, or `product_not_found` outcomes.

- [ ] **Step 1: Write failing contract tests**

  Parse only page sizes 20/50/100 and bulk payloads with 1..100 unique `{ productId, expectedVersion }` targets and actions `active|draft|archive`. Reject duplicate IDs, browser authority, invalid versions, and archive for an editor through the role policy.

- [ ] **Step 2: Verify contract RED**

  Run: `npm run test --workspace @celebix/saas-contracts`

- [ ] **Step 3: Implement and verify contract GREEN**

  Add immutable parsers and authorization operation mappings; rerun the contract suite.

- [ ] **Step 4: Write failing repository/HTTP tests**

  Assert exact parameter order, one transaction, one operation fingerprint, read-only recovery after unknown commit, 403 before repository access, 404 cross-tenant opacity, and no partial result when one target conflicts.

- [ ] **Step 5: Verify repository/HTTP RED**

  Run: `npm run test --workspace @celebix/saas-data && node --experimental-strip-types --test apps/customer-panel/lib/catalog-http/*.test.ts apps/customer-panel/lib/catalog-ui/client.test.ts`

- [ ] **Step 6: Implement migration 117 and runtime adapters**

  Create a SECURITY DEFINER bulk RPC that locks operation, store, and products in deterministic UUID order, rechecks membership and plan authority, validates every target before mutation, then updates all targets and stores one immutable replay result. Add a read-only eligibility RPC and a delete RPC that repeats eligibility under lock. Preserve all v1/v2/v3 list definitions and ACLs.

- [ ] **Step 7: Write and verify failing list UI tests**

  Test previous/next, page-size reset, cursor history, `popstate`, URL restoration, query-reset behavior, selection limited to the current page, and exactly one bulk HTTP request.

- [ ] **Step 8: Implement pagination and bulk UI then verify GREEN**

  Replace append-only load-more state with one-page state plus cursor stack. Keep search/filter/sort dimensions intact and reconcile from a fresh canonical page after mutation.

- [ ] **Step 9: Commit**

  ```bash
  git add packages/saas-contracts packages/saas-data apps/customer-panel apps/owner/scripts/sql/saas/202608300117_*
  git commit -m "feat(customer-panel): complete product pagination and bulk operations"
  ```

### Task 3: Media retention, restore, cleanup proof, and safe product removal

**Files:**
- Modify: `packages/saas-contracts/src/media/types.ts`
- Modify: `packages/saas-contracts/src/media/validation.ts`
- Modify: `packages/saas-contracts/src/media/media.test.ts`
- Modify: `packages/saas-data/src/media/types.ts`
- Modify: `packages/saas-data/src/media/repository.ts`
- Modify: `packages/saas-data/src/media/repository.test.ts`
- Modify: `apps/customer-panel/lib/media-http/handler.ts`
- Modify: `apps/customer-panel/lib/media-http/handler.test.ts`
- Modify: `apps/customer-panel/lib/media-http/default.ts`
- Modify: `apps/customer-panel/lib/catalog-ui/media-client.ts`
- Modify: `apps/customer-panel/lib/catalog-ui/media-client.test.ts`
- Modify: `apps/customer-panel/lib/server-media/r2-storage.ts`
- Modify: `apps/customer-panel/lib/server-media/r2-storage.test.ts`
- Create: `apps/customer-panel/lib/server-media/cleanup-service.ts`
- Create: `apps/customer-panel/lib/server-media/cleanup-service.test.ts`
- Modify: `apps/customer-panel/components/catalog/ProductMediaManager.tsx`
- Modify: `apps/customer-panel/components/catalog/ProductDetailConsole.tsx`
- Create: `apps/customer-panel/app/api/catalog/products/[productId]/media/[mediaId]/restore/route.ts`
- Create: `apps/customer-panel/app/api/catalog/products/[productId]/media/[mediaId]/cleanup/route.ts`
- Create: `apps/customer-panel/app/api/catalog/products/[productId]/removal-eligibility/route.ts`
- Create: `apps/customer-panel/app/api/catalog/products/[productId]/remove/route.ts`
- Create: `apps/owner/scripts/sql/saas/202608300118_catalog_media_retention_restore.up.sql`
- Create: `apps/owner/scripts/sql/saas/202608300118_catalog_media_retention_restore.down.sql`
- Create: `apps/owner/scripts/sql/saas/202608300118_catalog_media_retention_restore_assertions.sql`

**Interfaces:**
- Produces media status projection with `retentionExpiresAt` and `cleanupState` but never `objectKey` in browser responses.
- Produces `restoreProductMedia`, `getArchivedMediaCleanupCandidate`, and `recordArchivedMediaObjectDeleted` repository operations.
- Produces owner/admin-only removal eligibility and permanent removal commands.

- [ ] **Step 1: Write failing media contract/repository tests**

  Cover retention timestamps, restore before expiry, restore denial after proven deletion, stale versions, cross-store opacity, editor archive/restore denial, object-key confinement, and exact cleanup proof sequencing.

- [ ] **Step 2: Verify RED**

  Run media contract, data repository, media HTTP, and cleanup-service test files; require failures caused by missing behavior.

- [ ] **Step 3: Implement migration 118 and repository behavior**

  Archive only marks metadata and unpublishes the exact object; restore republishes and activates within retention; cleanup claim is read-only and exact; physical deletion happens outside SQL; final proof records `object_deleted` only after storage absence is verified. Keep old media functions callable for code-only rollback.

- [ ] **Step 4: Verify repository GREEN**

  Rerun the focused suites and the full contracts/data suites.

- [ ] **Step 5: Write failing UI/HTTP tests**

  Assert active/archived tabs, retention copy, restore control, cleanup error recovery, safe-removal eligibility reasons, confirmation text, role visibility, and no unexplained `Kullanılamıyor` state.

- [ ] **Step 6: Implement HTTP and UI behavior then verify GREEN**

  Include archived media only for authorized management views. Permanent removal stays hidden until eligibility is loaded and true; recheck eligibility on submit and preserve archive as the fallback.

- [ ] **Step 7: Commit**

  ```bash
  git add packages/saas-contracts packages/saas-data apps/customer-panel apps/owner/scripts/sql/saas/202608300118_*
  git commit -m "feat(customer-panel): add media restore and safe product removal"
  ```

### Task 4: Secure active and draft storefront preview

**Files:**
- Create: `apps/customer-panel/lib/product-preview/token.ts`
- Create: `apps/customer-panel/lib/product-preview/token.test.ts`
- Create: `apps/customer-panel/lib/product-preview/config.ts`
- Create: `apps/customer-panel/lib/product-preview/config.test.ts`
- Create: `apps/customer-panel/lib/product-preview/server.ts`
- Create: `apps/customer-panel/lib/product-preview/server.test.ts`
- Create: `apps/customer-panel/app/api/catalog/products/[productId]/preview/route.ts`
- Create: `apps/customer-panel/app/products/[productId]/preview/page.tsx`
- Create: `apps/customer-panel/components/catalog/ProductStorefrontPreview.tsx`
- Modify: `apps/customer-panel/components/catalog/ProductDetailConsole.tsx`
- Modify: `packages/saas-data/src/catalog/types.ts`
- Modify: `packages/saas-data/src/catalog/repository.ts`
- Modify: `packages/saas-data/src/catalog/repository.test.ts`
- Modify: `apps/owner/scripts/sql/saas/202608300117_catalog_product_bulk_safe_removal.up.sql`
- Modify: `apps/owner/scripts/sql/saas/202608300117_catalog_product_bulk_safe_removal_assertions.sql`

**Interfaces:**
- Produces `createProductPreviewTokenCodec({ keys, ttlSeconds: 300 })` with `issue(binding)` and `verify(token, binding, now)`.
- Produces catalog preview projection `{ canonicalStorefrontUrl, product, variants, media, merchandising }` from server-derived tenant authority.

- [ ] **Step 1: Write failing token/config tests**

  Use literal HMAC fixtures. Accept only a 32-byte-or-longer base64url keyring, an exact active key ID, five-minute maximum TTL, canonical token encoding, constant-time verification, and bindings for store/product/principal/version/expiry. Reject rotation ambiguity, malformed tokens, expired tokens, and every changed binding.

- [ ] **Step 2: Verify token RED**

  Run: `node --experimental-strip-types --test apps/customer-panel/lib/product-preview/*.test.ts`

- [ ] **Step 3: Implement codec and fail-closed environment config**

  Use HMAC-SHA-256 with preimage domain `celebix-product-preview-v1`; copy secret bytes; expose no secret material; never log tokens.

- [ ] **Step 4: Verify token GREEN**

  Rerun the focused command.

- [ ] **Step 5: Write failing preview repository/route tests**

  Assert canonical primary hostname resolution, active product direct URL, draft token issue, authenticated token redemption, current version recheck, principal/store/product binding, analyst read-only preview, and cross-tenant 404.

- [ ] **Step 6: Implement preview projection, endpoint, page, and control**

  Render a customer-facing preview from durable product, variant, media, and merchandising projections. The preview page remains no-store/noindex and does not expose private IDs or token material in rendered copy.

- [ ] **Step 7: Verify preview GREEN and commit**

  ```bash
  git add apps/customer-panel packages/saas-data apps/owner/scripts/sql/saas/202608300117_*
  git commit -m "feat(customer-panel): add secure storefront product preview"
  ```

### Task 5: PostgreSQL 16 compatibility rehearsal and complete workflow regression suite

**Files:**
- Create: `tests/saas-phase3/catalog-products-complete/postgres-harness.mjs`
- Create: `tests/saas-phase3/catalog-products-complete/static-security.test.mjs`
- Create: `tests/saas-phase3/catalog-products-complete/workflows.test.mjs`
- Modify: `tests/saas-phase3/run-current-suite.mjs`
- Create: `apps/owner/scripts/sql/saas/phase5e-catalog-products-complete-manifest.json`
- Modify: all focused test files introduced by Tasks 1 through 4 as required by discovered regressions.

**Interfaces:**
- Produces a disposable PostgreSQL 16 rehearsal applying `114 -> 115 -> 116 -> 117 -> 118`.
- Proves old application + new schema, new application + new schema, code-only rollback, tenant isolation, exact role matrix, atomic bulk, safe removal, media retention/restore/cleanup, and preserved v1/v2/v3 list definitions.

- [ ] **Step 1: Write the failing PostgreSQL harness and runner registration**

  The harness must fail before 117/118 artifacts are complete and must clean its disposable cluster in `finally`. Register it as mandatory in `run-current-suite.mjs` with an exact scenario total and completion line.

- [ ] **Step 2: Run the harness and verify RED**

  Run: `node tests/saas-phase3/catalog-products-complete/postgres-harness.mjs`

- [ ] **Step 3: Complete SQL assertions until the harness is GREEN**

  Verify exact owner, SECURITY DEFINER, search path, ACL, FORCE RLS, no app table DML, deterministic lock order, operation immutability, rollback guards, backup/restore, cross-store opacity, and old function byte preservation.

- [ ] **Step 4: Add end-to-end in-process workflow tests**

  Exercise quick/advanced create handoff, all edit surfaces, conflicts, pagination, bulk atomicity, media lifecycle, preview, role matrix, dirty navigation, refresh persistence, and error/retry states through real contracts, repositories, handlers, and clients with only external storage/network boundaries faked.

- [ ] **Step 5: Run every fresh verification**

  ```bash
  npm run test --workspace @celebix/saas-contracts
  npm run test --workspace @celebix/saas-data
  npm run test --workspace @celebix/customer-panel
  npm run typecheck --workspace @celebix/saas-contracts
  npm run typecheck --workspace @celebix/saas-data
  npm run typecheck --workspace @celebix/customer-panel
  npm run build --workspace @celebix/customer-panel
  npm run test:saas-phase3:current
  git diff --check
  ```

  Compare Phase 3 failures against the untouched-base run. Branch-only failures must be zero.

- [ ] **Step 6: Verify scope and commit**

  Confirm `git diff --name-only c0c59d65076c9cfcae87f6aef26ffd4b41892a7e...HEAD -- apps/admin` is empty and no historical migration changed.

  ```bash
  git add tests apps/owner/scripts/sql/saas/phase5e-catalog-products-complete-manifest.json apps/customer-panel packages/saas-contracts packages/saas-data docs/superpowers
  git commit -m "test(customer-panel): cover complete product management workflows"
  ```

### Task 6: Pull request, review, merge, and staging activation

**Files:**
- No new source files unless review finds a reproducible defect; every review fix starts with a failing test and a separate logical commit.

**Interfaces:**
- Produces PR `feat(customer-panel): complete product management workflows` and a merge commit on `codex/design-tabs-save-fix-live`.
- Produces exact staging evidence for backup, restore, migrations, deploy, SHA, health, QA, console/network, and cleanup.

- [ ] **Step 1: Push the branch and create the PR**

  Verify remote base drift first. Push normally, create one PR with migration-first compatibility, role matrix, test results, no `apps/admin` changes, and no production mutation.

- [ ] **Step 2: Review the complete diff**

  Run security, correctness, tenant-isolation, rollback, and UX review. Reproduce every Critical or Important issue with a failing test, fix it, rerun affected and full verification, and push a new commit. Do not squash or rewrite existing commits.

- [ ] **Step 3: Merge with a merge commit**

  Require unchanged reviewed head, mergeable PR, exact changed-file scope, zero `apps/admin` changes, and no Critical/Important finding. Preserve all logical commits.

- [ ] **Step 4: Verify merge ancestry and remote target SHA**

  Confirm PR merged state, both migration commits and all feature commits are ancestors, and the canonical remote branch equals the merge commit.

- [ ] **Step 5: Preflight and back up staging**

  Resolve the exact Customer Panel Coolify UUID, configured branch, running SHA, pending configuration, and payment build-digest blockers. Confirm required product-preview secret presence without printing values. Take a staging database backup and restore it into a disposable database; stop if either operation is untrustworthy.

- [ ] **Step 6: Apply migration-first and deploy exact merge SHA**

  Apply 117 then 118, run assertions/preflight, deploy the exact merge SHA, verify running SHA equality, and require `/api/health` HTTP 200.

- [ ] **Step 7: Run controlled staging QA and clean up**

  Create only `ATLAS-QA-PRODUCT-<timestamp>` products. Execute every workflow and owner/admin/editor/analyst plus cross-tenant matrix. Require zero console errors and zero failed unexpected network requests. Permanently remove only eligible QA products; otherwise archive them and report the retained IDs without customer data.

- [ ] **Step 8: Produce the Atlas final report**

  Return only the eleven numbered items required by the execution approval.
