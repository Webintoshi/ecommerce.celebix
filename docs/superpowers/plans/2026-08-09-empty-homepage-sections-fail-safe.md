# Empty Homepage Sections Fail-Safe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow a merchant to remove every optional homepage section without invalidating the saved design or crashing the public storefront.

**Architecture:** Treat `sections: []` as a valid, bounded composition at the TypeScript and PostgreSQL authority boundaries. Keep header, navigation, footer, and all non-homepage settings intact; render the public main region safely with no implicit homepage tiles when the section list is empty. The editor must permit deleting the last section and retain its existing add-section control.

**Tech Stack:** TypeScript, React/Next.js, Node test runner, PostgreSQL 16, versioned SQL migrations.

## Global Constraints

- Preserve tenant/store authority and all existing exact-key validation.
- Accept zero through twelve homepage sections; continue rejecting thirteen or more.
- Empty homepage sections must not invent placeholder content.
- Keep all existing header, navigation, product, cart, and footer behavior unchanged.
- Use one forward migration with guarded rollback and a disposable PostgreSQL 16 rehearsal.
- Do not deploy production.

---

### Task 1: Make the empty composition a valid immutable contract

**Files:**
- Modify: `packages/saas-contracts/src/storefront/validation.ts:389-430,574-625`
- Modify: `packages/saas-contracts/src/storefront/campaign-starter.test.ts`
- Modify: `packages/saas-contracts/src/storefront/retail-presentation.test.ts`
- Modify: `packages/saas-contracts/src/storefront-design/storefront-design.test.ts`

**Interfaces:**
- Consumes: `parseStarterThemeCompositionConfig(value)` and `parsePublicStarterThemePresentation(value)`.
- Produces: both parsers accept a deeply frozen `sections: []` while preserving the maximum of twelve.

- [x] Add tests asserting schema-v1/schema-v2 composition and schema-v2/schema-v3 public presentation accept exactly `sections: []`.
- [x] Run `npm test --workspace @celebix/saas-contracts` and verify the new tests fail with `storefront_contract_invalid`.
- [x] Change only the section-array lower bound from `1` to `0` in the three parser boundaries.
- [x] Rerun the workspace tests and typecheck; expect all tests to pass.
- [x] Commit as `fix(storefront): accept empty homepage compositions`.

### Task 2: Make editor deletion and storefront rendering safe

**Files:**
- Modify: `apps/customer-panel/lib/starter-theme-composer-model.ts`
- Modify: `apps/customer-panel/lib/starter-theme-composer-model.test.ts`
- Modify: `apps/customer-panel/components/settings/StarterThemeComposer.tsx`
- Modify: `apps/customer-panel/components/settings/StarterThemeComposer.test.ts`
- Modify: `apps/storefront-shared/components/CampaignHome.test.ts`
- Modify: `apps/storefront-shared/components/jewelry-category-placeholders.ts`
- Modify: `apps/storefront-shared/components/jewelry-category-placeholders.test.ts`

**Interfaces:**
- Produces: `removeStarterSection(sections, index): readonly StarterThemeSectionConfigV2[]`.
- Behavior: removing the final section returns a frozen empty list; an empty list renders no implicit homepage placeholders; the add-section selector stays available.

- [x] Add model and rendering tests for deleting the final section and rendering an empty main region without placeholder tiles.
- [x] Run focused customer-panel/storefront tests and verify the new expectations fail.
- [x] Implement `removeStarterSection`, use it from the delete control, remove the one-section disable rule, and show an explanatory empty state above the existing add control.
- [x] Suppress automatic jewelry placeholders only when `sections.length === 0`.
- [x] Rerun focused tests, both workspace tests, and typechecks; expect all to pass.
- [x] Commit as `fix(storefront): render an intentionally empty homepage`.

### Task 3: Persist and project empty homepage authority in PostgreSQL

**Files:**
- Create: `apps/owner/scripts/sql/saas/202608090098_empty_homepage_sections.up.sql`
- Create: `apps/owner/scripts/sql/saas/202608090098_empty_homepage_sections.down.sql`
- Create: `apps/owner/scripts/sql/saas/202608090098_empty_homepage_sections_assertions.sql`
- Create: `apps/owner/scripts/sql/saas/phase4q-empty-homepage-sections-manifest.json`
- Create: `tests/saas-phase3/empty-homepage-sections/postgres-harness.mjs`

**Interfaces:**
- Produces: `saas.campaign_starter_composition_valid(jsonb)` accepting zero to twelve sections while delegating all other validation to the previous immutable validator.

- [x] Write a PostgreSQL harness that applies migrations through 098 and expects empty save, publish, public projection, resolver, backup/restore, guarded rollback, reapply, and cleanup to pass.
- [x] Run the harness before migration 098 exists and verify the missing migration/empty-validation failure.
- [x] Implement the wrapper validator by inserting a valid in-memory sentinel product row only for validation when the real section array is empty; never persist the sentinel.
- [x] Rebuild publication/design constraints, add guarded rollback that refuses while empty rows exist, and add catalog assertions.
- [x] Generate exact SHA-256 manifest entries and rerun the PostgreSQL 16 harness plus the existing 097 and starter-theme composition harnesses.
- [x] Commit as `fix(saas): persist intentionally empty homepages`.

### Task 4: Whole-branch verification and publication

**Files:**
- Verify all files changed since `6c2d115f5f306bb324bc298600b5b145b466e431`.

**Interfaces:**
- Produces: a tested branch whose remote SHA exactly matches local HEAD.

- [x] Run customer-panel, storefront-shared, SaaS contracts/data, and Owner tests/typechecks/builds relevant to the change.
- [x] Run `git diff --check`, changed-production secret scans, and verify `apps/admin/**` diff count is zero.
- [ ] Confirm only `.codex-artifacts/` and `.superpowers/` remain untracked.
- [ ] Push `codex/design-tabs-save-fix-live` without force-push and verify remote SHA parity.
