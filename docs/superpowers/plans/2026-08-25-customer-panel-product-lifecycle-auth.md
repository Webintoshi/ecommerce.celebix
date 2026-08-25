# Customer Panel Product Lifecycle Authorization Implementation Plan

> **Owner:** Atlas
> **Scope:** `apps/customer-panel` product flows plus their shared contracts, repository, additive owner-managed SaaS migration, and focused tests. `apps/admin` is excluded.

**Goal:** Enforce the existing merchant role matrix at every product boundary and add an idempotent archive/restore lifecycle that restores only variants archived with their product.

**Architecture:** A shared product-operation-to-`MerchantAction` mapping is the single application-layer policy. UI capability flags derive from it; HTTP and repositories reject forbidden operations before business work; SQL entry points repeat the action check. Restore is a new POST mutation backed by an additive schema marker and operation ledger entry, with optimistic concurrency and replay semantics matching archive.

**Stack:** Next.js App Router, React, TypeScript, Node test runner, PostgreSQL PL/pgSQL.

---

### Task 1: Lock the authorization contract

**Files:**
- Modify: `packages/saas-contracts/src/authorization/actions.ts`
- Modify: `packages/saas-contracts/src/authorization/actions.test.ts`

1. Add failing role-matrix tests for read/manage/archive/restore product operations.
2. Add the shared operation mapping and helper.
3. Run the focused contract test.

### Task 2: Secure and extend the catalog repository

**Files:**
- Modify: `packages/saas-data/src/catalog/types.ts`
- Modify: `packages/saas-data/src/catalog/repository.ts`
- Modify: `packages/saas-data/src/catalog/repository.test.ts`
- Modify: `packages/saas-data/src/catalog-onboarding/repository.ts`
- Modify: `packages/saas-data/src/catalog-onboarding/repository.test.ts`

1. Add failing tests proving editor archive and analyst mutations fail before pool checkout, archived detail is readable, and restore/replay use the correct SQL operation.
2. Add repository authorization guards and the restore contract.
3. Keep cross-tenant not-found and operation recovery semantics intact.
4. Run focused repository tests.

### Task 3: Add the additive SQL lifecycle migration

**Files:**
- Create: `apps/owner/scripts/sql/saas/202608250114_catalog_product_lifecycle_authorization.up.sql`
- Create: `apps/owner/scripts/sql/saas/202608250114_catalog_product_lifecycle_authorization.down.sql`
- Create/modify: focused migration assertion test under the existing SaaS SQL test structure
- Modify: `apps/customer-panel/lib/server-panel-access/postgres-runtime.ts`
- Modify: its focused runtime/preflight test

1. Add failing static/preflight assertions for authorized mutation entry points, restore, grants, and the variant provenance marker.
2. Add `archived_by_product`, widen catalog operation constraints for restore, and implement action-protected SQL mutations.
3. Archive only active variants while marking their provenance; restore only marked variants and return the product to draft.
4. Preserve operation idempotency, expected-version checks, tenant not-found behavior, and all unrelated rows/objects.
5. Update runtime preflight to require the secure function surface and execute privileges.
6. Run the focused SQL/preflight tests.

### Task 4: Enforce HTTP/API authorization and expose restore

**Files:**
- Modify: `apps/customer-panel/lib/catalog-http/{handler,request-authority,request-input,default}.ts`
- Modify: corresponding focused tests
- Create: `apps/customer-panel/app/api/catalog/products/[productId]/restore/route.ts`
- Modify: `apps/customer-panel/lib/catalog-onboarding-http/handler.ts`
- Modify: its focused test
- Modify: `apps/customer-panel/lib/server-catalog/runtime.ts`
- Modify: its focused test

1. Add failing owner/admin/editor/analyst, same-origin, restore, idempotency, and cross-tenant tests.
2. Pass product operations through the shared authorization helper after session/membership/tenant resolution.
3. Add POST-only restore parsing, handler, default facade, repository call, and runtime surface.
4. Run focused HTTP/runtime tests.

### Task 5: Complete client and UI lifecycle behavior

**Files:**
- Modify: `apps/customer-panel/lib/catalog-ui/client.ts`
- Modify: `apps/customer-panel/lib/catalog-ui/client.test.ts`
- Modify: `apps/customer-panel/app/products/page.tsx`
- Modify: `apps/customer-panel/app/products/new/page.tsx`
- Modify: `apps/customer-panel/app/products/[productId]/page.tsx`
- Modify: relevant product console/media components and tests under `apps/customer-panel`

1. Add failing client/UI tests for archived filtering/detail, exact archive confirmation, restore action, read-only analyst UI, editor-without-archive UI, and archived publish suppression.
2. Accept archived status in the client and add restore POST.
3. Derive UI capabilities server-side from the common helper.
4. Add the archived filter and row restore action; gate create/edit/publish/archive/restore by capability.
5. Load archived detail without editor-only data, show the archive banner, disable publishing, and make restore the primary action.
6. Hide media mutation controls when read-only or archived while preserving media display.
7. Run focused client/component tests.

### Task 6: Verify and deliver one branch commit

1. Run focused contract, repository, HTTP, client, component, SQL/preflight, and runtime tests.
2. Run the relevant customer-panel and touched-package typechecks.
3. Run the repository's existing customer-panel production build script.
4. Run `git diff --check` and inspect the final diff for scope violations and secrets.
5. Commit once as `fix(customer-panel): secure product lifecycle and add restore flow`.
6. Push `codex/atlas-products-lifecycle-auth`; do not merge or deploy.
