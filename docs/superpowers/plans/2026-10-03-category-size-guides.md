# Category Size Guides Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Merchant-authored category size guides in Extras, automatically shown in the shared storefront product modal.

**Architecture:** Extend existing extra resources with a validated type discriminator and database category authority. Preserve the public sizeGuide projection and old direct-product fallback. Keep the guide editor independent of priced options and register both working Extras types.

**Tech Stack:** Next.js/React, existing Tiptap editor and rich-text sanitizer, shared TypeScript contracts/repository, PostgreSQL security-definer functions/RLS.

**Spec:** docs/superpowers/specs/2026-10-03-category-size-guides-design.md

## Global Constraints

- Guide config: schemaVersion1, type=size_guide, heading1–120, body1–10000, categoryIds1–64 unique tenant-active UUIDs, includeDescendants/ enabled booleans.
- No guide image/video upload; no product/media/price/stock changes.
- Existing resources/session/manage permission/CAS/idempotency authority; typed guide cannot become a priced option.
- Old public sizeGuide shape and direct-product definition fallback remain compatible.
- Shared Customer Panel visual rules, accessible heading, compact neutral controls, Uygula/Vazgeç, preserved error inputs.
- Reuse current attached modern worktree on codex/category-size-guides; preserve unrelated untracked files and latest common UI release.

## Review Focus

1. A category with descendants and a specific child guide resolves the closest matching category.
2. Two simultaneous active assignments to one category cannot silently pick different guides.
3. Long formatted Turkish content/table/newlines passes only the targeted guide boundary; unsafe markup is removed.
4. Old links/clients cannot erase typed guide config using the price-option editor.
5. Category/product archive and changes immediately remove stale public guides without altering checkout.

### Task 1: Contracts, repository and SQL authority

**Files:** shared catalog-admin validation/types; packages/saas-data/src/catalog-admin validation/repository; customer-panel catalog-admin HTTP/service; additive owner SQL migration/tests; storefront merchandising projection.

**Interfaces:** `CatalogSizeGuideConfig` and `parseCatalogSizeGuideConfig(value)` in shared contracts; existing `resources/saveResource/archiveResource`; unchanged public `sizeGuide={heading,body}`.

- [x] Add failing typed-config tests: long rich body, duplicate/foreign categories, unexpected config keys, nonempty productIds, old option preserved.
- [x] Implement targeted parser exceptions and HTTP/server content normalization. Preserve generic restrictions and authority.
- [x] Add failing native PostgreSQL tests for existing/new products inheriting category guide, disabled/archive, descendants, exact child precedence, source fallback, foreign-store and duplicate/concurrent assignments, replay and version conflict.
- [x] Implement guarded additive migration and rollback/assertions. Use actual current function definitions, not old migration assumptions.
- [x] Run focused contract/data/HTTP/SQL tests and record PASS. Commit only task files.

### Task 2: Extras console, guide form and preview

**Files:** new focused guide UI modules under customer-panel catalog-admin/extras; extras routes and protected generic extra editor routing; catalog-admin client optional operation ID; existing editor/preview reused.

**Interfaces:** same guide config and generic resource APIs; `catalogOnboardingClient.listCategories()` for actual category choices.

- [x] Add failing behavior tests for create/edit/preview, category search, Uygula/Vazgeç, toggle, retry key, conflict/error input retention and preserved priced-option actions.
- [x] Implement guide and option type entries, dedicated guide editor/preview and safe handling of old generic edit links.
- [x] Verify focused behavior tests, typecheck and production customer-panel build. Commit task files.

### Task 3: Product guide window and release acceptance

**Files:** storefront-shared product guide renderer/styles; shared product preview; guide behavior tests; QA receipt.

**Interfaces:** existing `product.merchandising.sizeGuide` and `options.showSizeGuide`; sanitized HTML passed to the modal.

- [x] Add failing modal tests for open/close/Escape/focus return, no-content and disabled design setting.
- [x] Implement reusable guide window preserving safe rich text and long mobile tables; adapt design preview consistently.
- [x] Run focused frontend tests and affected shared storefront build, then fresh whole-branch review.
- [x] Validate 1440/1024/390 px, keyboard focus, guide save and real product output in isolated test context. Do not publish invented measurement instructions in a merchant store.
- [x] Apply compatible data and shared readers first, then coordinated common NET→SITE admin deployments. Verify current build identities and truthful live acceptance; record final receipt in `docs/qa/category-size-guides.md`.
