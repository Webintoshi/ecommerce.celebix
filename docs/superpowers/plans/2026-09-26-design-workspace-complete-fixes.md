# Design Workspace Complete Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. User explicitly approved the audit, feature design, execution, and live rollout on 2026-09-26; continue without another permission gate.

**Goal:** Resolve every confirmed design-page defect and ship manual product selection plus truthful real-product preview to all shared merchant panels and storefronts.

**Architecture:** Retain the existing draft/publish lifecycle. Evolve its tenant-owned composition contract compatibly; use composition for category and announcement content, with legacy assets available as fallback. Reuse shared renderer primitives for draft/live presentation and keep all preview commerce actions inert.

**Tech Stack:** Next.js 16, React 19, TypeScript, PostgreSQL saas schema, existing npm workspaces and Coolify shared NET/SITE services.

**Spec:** `docs/qa/design-page-audit-2026-09-26.md`, especially D01–D13 and secondary findings; explicitly approved by the user.

## Global Constraints

- Preserve all existing actions, theme choices, tenant boundaries, and published appearance during migration.
- No unrelated auth/payment/inventory changes or new dependencies; no nested inaccessible dialogs.
- Keep automatic latest/sale/category sources; add manual source, ordered unique product IDs, at most 12 selected products per row.
- Keep three banner slides, four product rows, twelve sections, eight categories; banner remains optional.
- Panel uses existing Mira tokens; verify 1440, 1024, 390 px and keyboard flow.
- Database migrations use the next unused ordinal after current live 164; inspect existing files and live migration ledger first. Never reapply 164.
- Preview cannot add cart lines, place orders, modify products, or publish drafts.
- Avoid source ownership overlap between parallel workers; root owns integration, workspace lifecycle, review, release and evidence.

## Review Focus

- Foreign/inactive product or image IDs, duplicate product IDs, selection order surviving save/reopen/publish.
- Empty text while editing, first editing campaign card 2, hidden incomplete sections, maximum-limit duplicate action.
- Undo after other edits, concurrent save/publish, lost network response, reload of an unpublished saved draft.
- Category/image change and async response ordering; mobile image selection uses preview mode.
- Legacy divergent announcements/category showcase, banners intentionally off, sale products beyond 48 candidates, ranked out-of-stock products.

## Shared Interfaces

- Product row adds `source: "manual"`, `productIds?: readonly string[]`; manual IDs define order. Existing limit stays 4/8/12. Empty manual selection is a valid editable draft and explained before publication.
- Category grid adds optional `categoryImages: readonly { categoryId: string; assetId: string }[]`; heading/layout/categoryIds remain composition authority. Legacy category image mappings are fallback only.
- Workspace may expose optional `assets` (id,url,altText,mediaType,width,height,kind) and optional full `publishedDraft`; omitted fields remain accepted for existing fixtures/older responses.
- Product destination metadata may add optional `searchTerms`, `categoryIds`, `imageUrl`, `priceCents`, `available` for name/SKU/barcode selection; product identity is `resourceId`.
- Preview resources may add optional `productDetail: {status, value?: PublicProduct}`. Load input may add optional `previewProductId`; authorized workspace product identity must be checked. Manual source key is `manual:<sectionId>` and dependency includes ordered IDs, category IDs/images and preview product.
- Composition announcement items/enabled/destination are display authority; top-level announcement retains animation/icon settings. UI writes one content value through both legacy compatibility fields; migration preserves current published content.

## Task 1 — Contracts and PostgreSQL publication/query fixes

**Owner:** backend worker.
**Files:** `packages/saas-contracts/src/storefront/**`, `packages/saas-contracts/src/storefront-design/**`, relevant saas-data design parsing only if needed, new migration under `apps/owner/scripts/sql/saas/` and its regression evidence/tests.

- [x] Add failing contract tests for manual order/dedup/foreign reference boundaries, category image mapping, optional-banner publication, workspace extensions.
- [x] Add transactional SQL checks for draft/save/publish/manual row and compose-authoritative category selection, using fixture DB only.
- [x] Extend validation/projection/reference checks and workspace payload. Return actionable publication errors through existing safe outcomes.
- [x] Correct category/page destination routes; apply discounted and availability filters before limit while preserving category order.
- [x] Migrate legacy announcement/category presentation compatibly; preserve old persisted docs and rollback definitions.
- [x] Run affected contract/data/SQL tests and typecheck; no live migration or deploy by worker.

## Task 2 — Homepage and editor interaction fixes

**Owner:** editor worker.
**Files:** `HomepageBuilder.tsx`, extracted section/product-picker files, `homepage-command-model.ts`, `DesignInspector.tsx`, `DesignStepEditor.tsx`, `StarterThemeComposer.tsx`, targeted CSS and tests; `StorefrontAssetManager` callback if needed.

- [x] Add failing behavioral tests for undo after another edit, campaign metadata preservation/card 2 first, 9th category, duplicate at row limit, field error copy.
- [x] Add manual source with searchable/filterable picker, selected product order/removal/count and active loading/empty/error states.
- [x] Add category image selection, category order controls, asset refresh; use actual storefront assets for campaign fields.
- [x] Keep temporary input state separate from valid persisted composition; make actions preserve existing metadata and edits.
- [x] Synchronize simple/advanced announcement content, timezone-aware campaign conversion, truthful banner state.
- [x] Fix keyboard ownership/focus and value proposition item add/remove. Run targeted behavior/model tests.

## Task 3 — Real product and resource preview plus live renderer correctness

**Owner:** preview worker.
**Files:** `lib/storefront-design-preview-model*`, `lib/server-storefront-design-preview/**`, preview resource UI/HTTP, `VisualStorefrontCanvas*`, `DesignPreview*`, `packages/storefront-design-ui/**`, shared storefront components/routes and tests.

- [x] Add failing tests for category ID/image invalidation, manual order, real product settings, mobile image, sectionSpacing, category replacement and announcement visibility.
- [x] Load tenant-authorized representative real product and review data; expose read-only product preview selection callback through DesignPreview props.
- [x] Render real product details/settings and representative cart/header using shared reusable primitives; preview purchase actions inert.
- [x] Make category content and announcement composition-authoritative and consume sectionSpacing; handle legacy hero documents predictably.
- [x] Keep request identity/async stale-result guards; validate empty/unavailable resources and routes. Run focused renderer/storefront/preview tests.

## Task 4 — Workspace integration and saved-vs-published state

**Owner:** root.
**Files:** `DesignWorkspace*`, `workspace-model*`, page loader and any integration adapters not assigned above.

- [x] Add failing test for reopening an unpublished saved draft, published comparison/reset, preview selection without design mutation.
- [x] Integrate asset/product metadata and preview callbacks, full publishedDraft state and difference/restore affordance.
- [x] Present section-specific validation and preserve local draft on error/conflict.
- [x] Verify all D01–D13 and secondary findings have implementation and acceptance evidence; resolve worker integration issues.

## Task 5 — Fresh review and UI acceptance

**Owner:** root plus fresh reviewers.

- [ ] Independent review of tenant references, SQL migration/rollback, lifecycle and cross-app runtime compatibility; fix findings.
- [ ] Typecheck/contracts and focused regression suite; build shared customer-panel and storefront (owner if shared-contract gate requires).
- [ ] Test with representative isolated fixture data including older discounted product, ranked sold-out rows, category overrides and manual product order.
- [ ] Browser screenshot/console/network/keyboard matrix at 1440/1024/390; Atlas visual review; fix material failures.

## Task 6 — Live release and evidence

**Owner:** root only.

- [ ] Verify latest NET/SITE source and concurrent project changes; rebase/integrate authorized completed changes if needed.
- [ ] Commit reviewed source; backup current design authority/functions before applying the new SQL migration once.
- [ ] Deploy shared NET and SITE services from the exact reviewed source; inspect deployment logs and fresh health/runtime markers.
- [ ] Read-only merchant/public smoke checks across current stores; verify draft save/publish with isolated QA fixture, preserve merchant drafts.
- [ ] Record final source, migrations, test/build/browser/release evidence and precise remaining limitations (if any); finish only after required work is complete.
