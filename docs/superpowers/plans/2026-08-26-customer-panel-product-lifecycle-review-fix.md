# Customer Panel Product Lifecycle Review Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve secure catalog authorization while making the lifecycle migration compatible with the base application, the new application, and a code-only rollback, and safely restore legacy product-driven archived variants.

**Architecture:** Keep the six original app-facing catalog mutation signatures as the stable contract. Rename their pre-migration implementations to owner-only implementation functions, recreate the original names as `SECURITY DEFINER` action-aware wrappers, and have both base and new repositories call those stable names; restore remains additive. Backfill `archived_by_product` only when tenant/product/status/non-null timestamp equality proves product-driven legacy archive provenance.

**Tech Stack:** PostgreSQL 16, PL/pgSQL `SECURITY DEFINER` functions, TypeScript repository, Node test runner, Next.js customer panel.

**Spec:** `/Users/Celebix/.codex/attachments/37f3b345-2d78-4eb6-b593-f1c4a66a878f/pasted-text.txt`

## Global Constraints

- Work only on `codex/atlas-products-lifecycle-auth` after commit `ca25d6d8ffd674a166ff919503ab41d8a5799475`.
- Do not rewrite or force-push the existing commit.
- Do not merge, deploy, apply staging/production migrations, or mutate Coolify environments.
- Base SHA `1f0c9b1f46e85b344153dc69e5b9f305354aa043` must work after migration up and after code-only rollback from the new application.
- Analyst mutations must fail in SQL; editor create/update must pass while archive/restore fails.
- Restore history may block data-losing down migration but must not block application code rollback.

---

### Task 1: Lock the stable catalog SQL contract with RED tests

**Files:**
- Modify: `apps/owner/scripts/sql/saas/catalog-product-lifecycle-authorization-migration.test.ts`
- Modify: `packages/saas-data/src/catalog/repository.test.ts`

**Interfaces:**
- Consumes: six original function signatures from migration `202607160018_product_catalog`.
- Produces: assertions that both the migration ACL and current repository use `catalog_create_product`, `catalog_update_product`, `catalog_archive_product`, `catalog_create_variant`, `catalog_update_variant`, and `catalog_archive_variant` without `_authorized` cutover names.

- [ ] Add a static migration test requiring grants on all six stable names, owner-only implementation functions, `catalog_admin.manage`/`catalog_admin.archive` checks, and no application grant on implementation functions.
- [ ] Add repository query assertions requiring the six stable names.
- [ ] Run `node --experimental-strip-types --test apps/owner/scripts/sql/saas/catalog-product-lifecycle-authorization-migration.test.ts` and the targeted `packages/saas-data` repository test; verify failure because `_authorized` names are still present.

### Task 2: Lock legacy provenance backfill with a RED test

**Files:**
- Modify: `apps/owner/scripts/sql/saas/catalog-product-lifecycle-authorization-migration.test.ts`
- Modify: `apps/owner/scripts/sql/saas/202608250114_catalog_product_lifecycle_authorization_assertions.sql`

**Interfaces:**
- Consumes: `products(id, store_id, status, archived_at)` and `product_variants(product_id, store_id, status, archived_at, archived_by_product)`.
- Produces: deterministic equality-based backfill and assertions rejecting missed or over-broad provenance.

- [ ] Add static expectations for `product.status='archived'`, `variant.status='archived'`, non-null product timestamp, exact timestamp equality, and both store/product joins.
- [ ] Require runtime assertions that all deterministically matching legacy rows are true and every true row still matches an archived product with the same tenant/product/timestamp.
- [ ] Run the migration static test and verify failure because no backfill exists.

### Task 3: Implement the expand/contract-compatible migration

**Files:**
- Modify: `apps/owner/scripts/sql/saas/202608250114_catalog_product_lifecycle_authorization.up.sql`
- Modify: `apps/owner/scripts/sql/saas/202608250114_catalog_product_lifecycle_authorization.down.sql`
- Modify: `apps/owner/scripts/sql/saas/202608250114_catalog_product_lifecycle_authorization_assertions.sql`

**Interfaces:**
- Consumes: original six mutation functions and `merchant_action_authority_error(...)`.
- Produces: the same six public signatures as secure wrappers plus private `*_implementation_v1` functions; additive `catalog_restore_product` remains unchanged in name.

- [ ] Rename each original mutation function to `*_implementation_v1`, revoke all application/public access from the implementation signature, and create the original name as a wrapper.
- [ ] In create/update wrappers require `catalog_admin.manage`; in product/variant archive wrappers require `catalog_admin.archive`.
- [ ] Keep product archive provenance marking in the stable `catalog_archive_product` wrapper and delegate the other five operations to private implementations.
- [ ] Grant `celebix_saas_app` only the six stable names and restore; remove `_authorized` functions and ACLs.
- [ ] Update down migration to drop wrappers, rename the six implementations back, and restore original grants when the rollback guard allows down.
- [ ] Run static migration tests until green.

### Task 4: Implement deterministic legacy provenance backfill

**Files:**
- Modify: `apps/owner/scripts/sql/saas/202608250114_catalog_product_lifecycle_authorization.up.sql`
- Modify: `apps/owner/scripts/sql/saas/202608250114_catalog_product_lifecycle_authorization_assertions.sql`

**Interfaces:**
- Consumes: legacy archived product/variant timestamps.
- Produces: `archived_by_product=true` only for same-store, same-product, archived rows where the non-null timestamps are exactly equal.

- [ ] Add the constrained `UPDATE ... FROM saas.products` immediately after the column is added.
- [ ] Add assertions for missed deterministic matches and invalid true provenance.
- [ ] Run static migration tests until green.

### Task 5: Return the new repository to the stable SQL contract

**Files:**
- Modify: `packages/saas-data/src/catalog/repository.ts`
- Modify: `packages/saas-data/src/catalog/repository.test.ts`

**Interfaces:**
- Consumes: stable safe SQL signatures from Task 3.
- Produces: new application calls identical mutation names to base application, while API/repository operation checks remain defense in depth.

- [ ] Replace all six `_authorized` query names with the stable originals; leave restore additive.
- [ ] Run targeted repository tests and verify green.

### Task 6: Prove PostgreSQL 16 rollout and legacy behavior

**Files:**
- Create or modify only disposable local rehearsal scripts outside committed production artifacts when needed.

**Interfaces:**
- Consumes: base migrations, migration up/down/assertions, stable and restore SQL signatures.
- Produces: recorded outcomes for scenarios A–E in the final report.

- [ ] Create a disposable PostgreSQL 16 database and apply the base schema.
- [ ] Before migration, create a legacy archived product with one earlier manually archived variant and one product-driven variant sharing the product timestamp.
- [ ] Apply migration up and assertions.
- [ ] As the application role, verify owner/admin create, editor create/update, editor archive denial, and analyst mutation denial through stable names.
- [ ] Verify the new repository contract and restore on the same schema.
- [ ] Verify code-only rollback by repeating stable-name base calls after restore ledger creation without down migration.
- [ ] Verify legacy backfill and restore preserve the manual archived variant while activating only the product-driven variant.
- [ ] Verify new archive/replay/restore/replay/version-conflict/cross-tenant scenarios.
- [ ] Verify down succeeds without restore ledger and is blocked with restore ledger while stable-name application calls continue working.

### Task 7: Full verification, independent review, commit, and push

**Files:**
- Verify all modified files.

**Interfaces:**
- Consumes: Tasks 1–6.
- Produces: one review-fix commit on the existing remote branch.

- [ ] Run `saas-contracts`, `saas-data`, customer-panel related tests, migration static tests, and all three typechecks.
- [ ] Run `npm run build --workspace @celebix/customer-panel`.
- [ ] Run `git diff --check`, scope scan, destructive SQL scan, and confirm no `apps/admin` changes.
- [ ] Dispatch the requested separate verification agent and resolve only evidence-backed findings.
- [ ] Commit with `fix(customer-panel): preserve catalog rollout and legacy restore compatibility` without amending the previous commit.
- [ ] Push normally to `origin/codex/atlas-products-lifecycle-auth` and verify local/remote SHA equality; do not merge or deploy.
