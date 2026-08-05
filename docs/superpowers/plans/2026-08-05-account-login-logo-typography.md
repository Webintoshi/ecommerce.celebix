# Account Login Logo and Typography Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the published tenant logo on the universal customer login and reduce the slogan and form-title scale without changing authentication behavior.

**Architecture:** Keep `AccountAuthShell` tenant-neutral and continue resolving branding through `resolveAccountAuthBranding`. Change only universal copy and CSS, then bind Güzide's existing store-scoped media through the established storefront-design publication path.

**Tech Stack:** Next.js, React, CSS Modules, Node test runner, PostgreSQL storefront-design authority, Cloudflare R2, Coolify.

## Global Constraints

- Never hard-code Güzide or any tenant asset in the shared component.
- Slogan is exactly `Alışverişiniz, kaldığınız yerden.`.
- Desktop left message is `clamp(38px, 5vw, 68px)` and mobile is `clamp(30px, 9vw, 40px)`.
- Desktop form title is `clamp(28px, 3vw, 36px)` and mobile is `clamp(27px, 8vw, 34px)`.
- Authentication routes, payloads, cookies, guest checkout, and passwordless behavior remain unchanged.

---

### Task 1: Universal copy and scale

**Files:**
- Modify: `apps/storefront-shared/components/account/account-ui.test.ts`
- Modify: `apps/storefront-shared/components/account/AccountAuthShell.tsx`
- Modify: `apps/storefront-shared/components/account/account-auth.module.css`

**Interfaces:**
- Consumes: `resolveAccountAuthBranding(storefront, design)`.
- Produces: the existing `AccountAuthShell` interface with new copy and responsive scale.

- [ ] **Step 1: Write the failing assertions**

Change the shell assertion to require `Alışverişiniz, kaldığınız yerden.` and the responsive CSS assertions to require the four exact clamps from Global Constraints.

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `npm test --workspace @celebix/storefront-shared -- --test-name-pattern="account entry|universal account auth layout"`

Expected: FAIL because the old slogan and clamps remain.

- [ ] **Step 3: Implement the minimal component and CSS changes**

Replace the slogan in `AccountAuthShell.tsx`. Replace the desktop, mobile, narrow, and short-height message sizes plus desktop/mobile form-heading sizes in `account-auth.module.css`. Do not change form routes or branding resolution.

- [ ] **Step 4: Run the focused tests**

Run: `npm test --workspace @celebix/storefront-shared -- --test-name-pattern="account entry|universal account auth layout|account branding"`

Expected: PASS.

### Task 2: Güzide published logo

**Files:**
- No repository source file; mutate only Güzide's existing storefront-design record through its current authority path.

**Interfaces:**
- Consumes: Güzide's active `storefront_design_media` record and current draft/publication versions.
- Produces: a published design whose `brand.logo.mediaId` references that same store-scoped active record.

- [ ] **Step 1: Inspect the live authority read-only**

Read Güzide's store id, current design versions, `brand.logo`, and active design media. Do not print credentials or unrelated tenant data.

- [ ] **Step 2: Select the exact Güzide logo**

Use the active media whose store id equals Güzide's id and whose metadata identifies the approved Güzide logo. Verify its public URL returns an image.

- [ ] **Step 3: Save and publish through the design authority**

Set only `draft_config.brand.logo` to `{ "kind": "media", "mediaId": "<guzide-logo-media-id>" }`, preserve all other draft fields, and publish with the current optimistic versions and a fresh operation id.

- [ ] **Step 4: Verify public projection**

Read `storefront_design_get_public` for the Güzide hostname and confirm `brand.logo.url` is non-null and points to the selected store-scoped asset.

### Task 3: Regression, deploy, and visual verification

**Files:**
- Verify only; no planned source changes beyond Task 1.

**Interfaces:**
- Consumes: the Task 1 commit and Task 2 published design.
- Produces: a healthy Coolify storefront deployment and visual evidence at desktop/mobile widths.

- [ ] **Step 1: Run storefront tests and typecheck**

Run: `npm test --workspace @celebix/storefront-shared`

Run: `npm run typecheck --workspace @celebix/storefront-shared`

Expected: both PASS.

- [ ] **Step 2: Build the storefront image**

Run: `npm run build:coolify:storefront-shared`

Expected: production build succeeds.

- [ ] **Step 3: Commit and push the exact SHA**

Stage only the spec, plan, test, component, and CSS files. Commit with `feat(storefront): refine account login branding`. Push the resulting SHA to the existing integration and storefront deployment branches.

- [ ] **Step 4: Deploy the storefront application**

Trigger Coolify application `vtc2aah63jbqnmtxmvykn6jl` and wait for a healthy successful deployment of the exact pushed SHA.

- [ ] **Step 5: Verify the complete live result**

Open `https://guzide-kuyumcu-4.saas-staging.celebix.site/account/login` at 1440 px, 390 px, and 320 px. Confirm the real logo image, exact slogan, smaller headings, no horizontal overflow, HTTP 200, and no relevant console or failed image requests.

