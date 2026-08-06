# Starter Header Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a durable merchant-selectable starter-theme header layout control under “Menü ve duyuru”.

**Architecture:** Extend the bounded schema-v2 visual contract with one enum, migrate existing PostgreSQL documents to the safe centered default, expose the control in the existing composer, and render the selection through a data attribute plus three isolated CSS layouts. Existing mobile navigation and browser-authority boundaries remain unchanged.

**Tech Stack:** TypeScript, React/Next.js, CSS Modules, PostgreSQL 16, Node test runner.

## Global Constraints

- No production deployment or credential mutation.
- Preserve the current mobile drawer, canonical navigation and storefront utilities.
- No custom CSS, browser tenant authority or unrelated dependency changes.
- Commit and push only after complete verification.

---

### Task 1: Contract and migration

**Files:**
- Modify: `packages/saas-contracts/src/storefront/types.ts`
- Modify: `packages/saas-contracts/src/storefront/validation.ts`
- Modify: `packages/saas-contracts/src/storefront/presentation.ts`
- Modify: `packages/saas-contracts/src/storefront-design/defaults.ts`
- Modify: `apps/customer-panel/lib/starter-theme-composer-model.ts`
- Create: `apps/owner/scripts/sql/saas/202608070095_starter_header_layouts.{up,down,assertions}.sql`
- Create: `apps/owner/scripts/sql/saas/phase3-starter-header-layouts-manifest.json`

- [x] Add failing tests proving the three literals, safe default and invalid-value rejection.
- [x] Run the contract/model/migration tests and verify the expected RED failures.
- [x] Add `headerLayout: "menu_logo_actions" | "logo_menu_actions" | "stacked"` and the reversible PostgreSQL upgrade.
- [x] Run the same tests and verify GREEN.

### Task 2: Admin control and storefront rendering

**Files:**
- Modify: `apps/customer-panel/components/settings/StarterThemeComposer.tsx`
- Modify: `apps/customer-panel/components/settings/design/DesignWorkspace.test.ts`
- Modify: `apps/storefront-shared/components/CampaignHeader.tsx`
- Modify: `apps/storefront-shared/components/campaign-header.module.css`
- Modify: `apps/storefront-shared/components/CampaignHeader.test.ts`

- [x] Add failing tests proving “Header düzeni” belongs to the navigation panel and all three CSS layouts are rendered.
- [x] Run focused tests and verify RED.
- [x] Move header style/width controls and add the three-option layout select.
- [x] Pass the enum to `data-header-layout` and implement three desktop CSS grids without changing mobile drawer behavior.
- [x] Run focused tests and verify GREEN.

### Task 3: Verification and publication

- [x] Run contract, data, customer-panel and storefront-shared tests.
- [x] Run customer-panel/storefront typechecks and builds.
- [x] Run `git diff --check`, forbidden-authority and secret scans.
- [ ] Review the exact diff, commit only intended files, and push the current branch without force.
