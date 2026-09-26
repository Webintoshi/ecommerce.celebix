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

- [x] Independent review of tenant references, SQL migration/rollback, lifecycle and cross-app runtime compatibility; fix findings. Final combined source review found no remaining P1/P2; independent merged design behaviors passed 41/41.
- [x] Typecheck/contracts and focused regression suite; build shared customer-panel and storefront (owner if shared-contract gate requires). Final panel build on `89cc73218f2a7113f2fd593ca743e45e51621a98` exited 0 (compile 30.5s, TypeScript 33.1s, 90/90 pages, tracing complete). Storefront build passed under `ff563254`; storefront/packages trees exactly match the combined source. Owner dependency build passed. Mira focused gates passed 67/67, 42/42 and 13/13.
- [x] Test with representative isolated fixture data including older discounted product, ranked sold-out rows, category overrides and manual product order. The actual SQL165 QA copy passed all three current parsers for 10/10 stores; every workspace included assets and full publishedDraft, without live queries or writes. See `docs/qa/evidence/design-workspace-fixes/actual165-contracts.json`.
- [x] Browser screenshot/console/network/keyboard matrix at 1440/1024/390; independent visual review; fix material failures. Final Mira evidence contains 53 measurements and 52 PNGs, manual SKU/barcode/order and category-image checks at all three widths, 44px mobile controls and mobile dock hit checks. Final presentation uses seven inline steps; inner section Escape/focus remains preserved. Earlier outer-modal checks prove the prior presentation only. See `docs/qa/settings-approved-release-2026-09-27.md`.

## Task 6 — Live release and evidence

**Owner:** root only.

- [x] Verify latest NET/SITE source and concurrent project changes; integrate authorized completed changes. Final combined source and mobile dock CSS are committed at `89cc73218f2a7113f2fd593ca743e45e51621a98`.
- [x] Commit reviewed source and record completed pre-release test/build/browser/contract evidence in the two release reports.
- [x] Prepare all four targets by changing only the source branch/SHA and the three existing normal SOURCE_COMMIT/PayTR digest values; preserve every other application/settings/environment attribute and all preview rows.
- [x] Deploy all shared NET and SITE services from the exact reviewed source; inspect deployment logs and fresh health/runtime markers. All four jobs finished at `89cc73218f2a7113f2fd593ca743e45e51621a98`: NET panel `i118qvye36lonxaf94h7tkx2`, SITE panel `thlao99pmks8ndvotngykh9b`, SITE storefront `tq83nl29608yttypk4qgi67m`, NET storefront `purxjjnpyhpxja7aua2qlf52`. Every runtime source/image check and separate HTTP health check passed. See the deployment/runtime/health evidence table in the [release report](../../qa/design-workspace-fixes-release-2026-09-26.md).
- [x] After all new application code is deployed, take the final private backup of current design authority/functions and apply SQL165 once. The restricted backup/checksum record is retained; SQL165 up and assertions exited 0.
- [x] Verify live migration preservation and actual payload compatibility without customer mutations. All 10 stores preserved draft/version/visible announcement/category content; all 10 actual live workspace/public-design/public-presentation payloads passed final source parsers, including assets and full publishedDraft. See [preservation](../../qa/evidence/design-workspace-fixes/live165-preservation.json) and [live contracts](../../qa/evidence/design-workspace-fixes/live165-contracts.json).
- [x] Perform Mira's read-only Siora live UI acceptance: seven inline steps, 10 real product options and no console errors or customer/design mutation. The final UI report includes the read-only live metrics and screenshots; authenticated Güzide UI was not exercised.
- [x] Finish the final read-only merchant/public smoke probe and record remaining limits; QA draft save/publish behavior is evidenced by the isolated database rehearsal. All 22 checks passed, including the existing Next.js streaming not-found/redirect markers. See [live-final-smoke.json](../../qa/evidence/design-workspace-fixes/live-final-smoke.json).
- [x] Verify final cleanup and append precise final release closure. Only the owned inactive QA database and temporary Coolify helper directory were removed; protected backups and deployment receipts were retained and rechecked. [Cleanup](../../qa/evidence/design-workspace-fixes/cleanup-final.json) and all six [post-cleanup health checks](../../qa/evidence/design-workspace-fixes/health-after-cleanup.json) passed. Live source remains fixed at `89cc73218f2a7113f2fd593ca743e45e51621a98`; evidence commits do not repin or redeploy applications.
