# Storefront Google Fonts Typography Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let each merchant choose independent Google Fonts, supported weights, and bounded pixel sizes for storefront headings and body copy from the durable customer-panel design workspace, while loading only the two published fonts needed by the storefront.

**Architecture:** Extend the existing schema-version-3 storefront design document additively with one exact `typography` authority. TypeScript parsers normalize legacy documents from `brand.fontFamily`; PostgreSQL accepts legacy rows but validates every new typography value and projects it into the public design. A same-origin customer-panel catalog route caches Google metadata for 24 hours and falls back to a fixed safe catalog. The editor writes only catalog-derived immutable font records. The preview and storefront share pure CSS-variable and stylesheet-URL builders so draft and published rendering cannot diverge.

**Tech Stack:** TypeScript 5.9, React 19, Next.js 16 App Router, Node test runner, PostgreSQL 16, CSS custom properties.

## Global constraints

- [ ] Keep `apps/admin/**` byte-for-byte unchanged; it is donor-only.
- [ ] Preserve `brand.fontFamily` for legacy readers while making `typography` authoritative when present.
- [ ] Never accept merchant-supplied stylesheet URLs, CSS fragments, credentials, tenant IDs, or browser authority.
- [ ] Fetch only Google metadata server-side; load only the selected heading/body families and weights with `display=swap`.
- [ ] Preserve draft/preview/publish version checks and exact-key validation.
- [ ] Deploy only Güzide isolated staging customer-panel and storefront after tests, commit, and push; production/Owner runtime/other stores remain untouched.

---

### Task 1: Define and validate the durable typography contract

**Files:**

- Modify: `packages/saas-contracts/src/storefront-design/types.ts:1-110`
- Modify: `packages/saas-contracts/src/storefront-design/validation.ts:1-337`
- Modify: `packages/saas-contracts/src/storefront-design/storefront-design.test.ts:1-210`

- [ ] Add failing tests proving legacy `fontFamily` normalizes to a frozen heading/body typography object, valid independent families/weights/sizes round-trip, and unknown fields, hostile families, unsupported/duplicate weights, weight mismatches, and sizes outside heading `24..72` / body `14..20` are rejected.

Run:

```bash
npm test --workspace @celebix/saas-contracts -- --test-name-pattern='typography'
```

Expected RED: parsed documents do not expose `typography` and hostile payloads are not checked by the missing parser.

- [ ] Add exact immutable contracts:

```ts
type StorefrontDesignFontCategory = "sans-serif" | "serif" | "display" | "handwriting" | "monospace";
type StorefrontDesignFontWeight = "400" | "500" | "600" | "700" | "800";
type StorefrontDesignFontOption = Readonly<{
  family: string;
  category: StorefrontDesignFontCategory;
  availableWeights: readonly StorefrontDesignFontWeight[];
  source: "google";
}>;
type StorefrontDesignTypography = Readonly<{
  headingFont: StorefrontDesignFontOption;
  bodyFont: StorefrontDesignFontOption;
  headingWeight: StorefrontDesignFontWeight;
  bodyWeight: StorefrontDesignFontWeight;
  headingSizePx: number;
  bodySizePx: number;
}>;
```

- [ ] Parse `typography` as an optional root input for legacy schema-version-3/public-version-2 documents, but always return a complete frozen normalized value. Derive the legacy fallback from `brand.fontFamily` and reject any extra key or unsafe family.

Run:

```bash
npm test --workspace @celebix/saas-contracts
npm run typecheck --workspace @celebix/saas-contracts
```

Expected GREEN: all contract tests pass; legacy fixtures still parse without data loss.

- [ ] Commit:

```bash
git add packages/saas-contracts/src/storefront-design
git commit -m "feat(storefront): define durable typography authority"
```

---

### Task 2: Persist and project typography in PostgreSQL

**Files:**

- Create: `apps/owner/scripts/sql/saas/202608070096_storefront_google_fonts_typography.up.sql`
- Create: `apps/owner/scripts/sql/saas/202608070096_storefront_google_fonts_typography.down.sql`
- Create: `apps/owner/scripts/sql/saas/202608070096_storefront_google_fonts_typography_assertions.sql`
- Create: `apps/owner/scripts/sql/saas/phase4o-storefront-google-fonts-typography-manifest.json`
- Create: `apps/owner/scripts/sql/saas/storefront-google-fonts-typography-migration.test.ts`

- [ ] Add a failing migration test that verifies artifact presence/checksums and a disposable PostgreSQL assertion suite that exercises legacy acceptance, exact valid typography persistence/public projection, malformed family/category/source/weights/size rejection, and rollback guard behavior.

Run:

```bash
node --experimental-strip-types --test apps/owner/scripts/sql/saas/storefront-google-fonts-typography-migration.test.ts
```

Expected RED: migration artifacts are absent.

- [ ] Add migration `096` that wraps the existing design validator and public payload function. New rows with `typography` must pass exact-key, bounded family/category/weight/size, and weight-membership checks; rows without it remain readable. Public payloads always contain normalized typography. Do not grant new table privileges.

- [ ] Guard the down migration against removing persisted typography, restore prior functions only when safe, and pin the manifest to PostgreSQL 16 with generated SHA-256 checksums.

Run:

```bash
node --experimental-strip-types --test apps/owner/scripts/sql/saas/storefront-google-fonts-typography-migration.test.ts
npm test --workspace @celebix/saas-data -- --test-name-pattern='storefront design'
```

Expected GREEN: static/checksum tests pass and repository fixtures remain compatible.

- [ ] Commit:

```bash
git add apps/owner/scripts/sql/saas/202608070096_* apps/owner/scripts/sql/saas/phase4o-storefront-google-fonts-typography-manifest.json apps/owner/scripts/sql/saas/storefront-google-fonts-typography-migration.test.ts
git commit -m "feat(storefront): persist google fonts typography"
```

---

### Task 3: Add the bounded cached Google Fonts catalog

**Files:**

- Create: `apps/customer-panel/lib/storefront-fonts/catalog.ts`
- Create: `apps/customer-panel/lib/storefront-fonts/catalog.test.ts`
- Create: `apps/customer-panel/app/api/storefront-design/fonts/route.ts`
- Modify: `apps/customer-panel/package.json` test script only if required to include the new test directory.

- [ ] Add failing tests against the real catalog parser for the Google metadata prefix, popularity ordering, supported-weight extraction, family/category sanitization, maximum result bound, malformed payload fallback, non-200 fallback, cache headers, and absence of secrets/tenant data.

Run:

```bash
node --experimental-transform-types --test apps/customer-panel/lib/storefront-fonts/catalog.test.ts
```

Expected RED: module and route do not exist.

- [ ] Implement an immutable featured fallback and a `loadStorefrontFontCatalog(fetcher)` boundary. Fetch `https://fonts.google.com/metadata/fonts` with a 24-hour Next cache; expose only `{family, category, availableWeights, source}` plus `degraded` through the same-origin route.

Run:

```bash
node --experimental-transform-types --test apps/customer-panel/lib/storefront-fonts/catalog.test.ts
```

Expected GREEN: live-network behavior is not required; controlled success/failure fixtures pass.

- [ ] Commit:

```bash
git add apps/customer-panel/lib/storefront-fonts apps/customer-panel/app/api/storefront-design/fonts apps/customer-panel/package.json
git commit -m "feat(customer-panel): serve google font catalog"
```

---

### Task 4: Build the customer-panel typography editor

**Files:**

- Create: `apps/customer-panel/components/settings/design/TypographyEditor.tsx`
- Create: `apps/customer-panel/components/settings/design/typography-model.ts`
- Create: `apps/customer-panel/components/settings/design/typography-model.test.ts`
- Modify: `apps/customer-panel/components/settings/design/DesignInspector.tsx:38-58`
- Modify: `apps/customer-panel/components/settings/design-settings.module.css:9-60`
- Modify: `apps/customer-panel/components/settings/design/DesignWorkspace.test.ts:1-120`

- [ ] Add failing model/component-contract tests proving independent heading/body choices, search normalization, selected-font pinning, available-weight filtering/reset, exact integer clamping, disabled mode, degraded fallback messaging, and no local/session storage.

Run:

```bash
node --experimental-transform-types --test apps/customer-panel/components/settings/design/typography-model.test.ts apps/customer-panel/components/settings/design/DesignWorkspace.test.ts
```

Expected RED: the existing single four-option selector cannot satisfy independent choices.

- [ ] Implement the searchable font editor with two selectors, weight controls limited to each selected family, numeric pixel controls (`24..72`, `14..20`), live samples, loading/error fallback, 48px targets, labels, keyboard focus, and no arbitrary value path. `DesignInspector` updates only `design.typography` through `onChange`.

Run:

```bash
node --experimental-transform-types --test apps/customer-panel/components/settings/design/typography-model.test.ts apps/customer-panel/components/settings/design/DesignWorkspace.test.ts
npm run typecheck --workspace @celebix/customer-panel
```

Expected GREEN: focused editor tests and typecheck pass.

- [ ] Commit:

```bash
git add apps/customer-panel/components/settings/design apps/customer-panel/components/settings/design-settings.module.css
git commit -m "feat(customer-panel): edit storefront typography"
```

---

### Task 5: Share preview and published storefront font rendering

**Files:**

- Create: `packages/storefront-design-ui/src/typography.ts`
- Modify: `packages/storefront-design-ui/src/index.ts:1-5`
- Modify: `packages/storefront-design-ui/src/model.ts:38-74`
- Modify: `packages/storefront-design-ui/src/StorefrontDesignRenderer.tsx:1-77`
- Modify: `packages/storefront-design-ui/src/storefront-design.css:1-120`
- Modify: `packages/storefront-design-ui/src/StorefrontDesignRenderer.test.ts:1-100`
- Modify: `apps/storefront-shared/components/StorefrontFrame.tsx:1-55`
- Modify: `apps/storefront-shared/app/globals.css:1-620`
- Modify: `apps/storefront-shared/lib/storefront-design-publication.test.ts:1-80`

- [ ] Add failing tests proving the preview copies typography, the URL builder emits exactly two deduplicated encoded Google families/selected weights with `display=swap`, CSS variables contain quoted safe stacks and exact px values, and malformed inputs cannot create URLs or CSS.

Run:

```bash
npm test --workspace @celebix/storefront-design-ui
node --experimental-transform-types --test apps/storefront-shared/lib/storefront-design-publication.test.ts
```

Expected RED: projection omits typography and runtime has no selected-font resource/variables.

- [ ] Implement pure typography resource builders. Add preconnect and one stylesheet resource to both design preview and `StorefrontFrame`; apply body family/weight/size at the storefront root and heading family/weight/size to the controlled heading hierarchy without overriding component layout widths.

- [ ] Ensure account, products, product detail, cart, checkout, and footer inherit the published variables; retain existing fallback stacks when Google is unavailable.

Run:

```bash
npm test --workspace @celebix/storefront-design-ui
npm run typecheck --workspace @celebix/storefront-design-ui
node --experimental-transform-types --test apps/storefront-shared/lib/storefront-design-publication.test.ts apps/storefront-shared/lib/storefront-app.test.ts
npm run typecheck --workspace @celebix/storefront-base
npm run build --workspace @celebix/storefront-base
```

Expected GREEN: preview/public rendering agree and the storefront builds.

- [ ] Commit:

```bash
git add packages/storefront-design-ui apps/storefront-shared
git commit -m "feat(storefront): render selected google typography"
```

---

### Task 6: Full verification, publish, and isolated staging gate

**Files:** Verification only; no new source unless a failing in-scope regression requires it.

- [ ] Run the complete non-production verification matrix:

```bash
npm test --workspace @celebix/saas-contracts
npm test --workspace @celebix/saas-data
npm test --workspace @celebix/storefront-design-ui
npm test --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/saas-contracts
npm run typecheck --workspace @celebix/saas-data
npm run typecheck --workspace @celebix/storefront-design-ui
npm run typecheck --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/storefront-base
npm run build --workspace @celebix/customer-panel
npm run build --workspace @celebix/storefront-base
git diff --check
```

- [ ] Run security/scope checks:

```bash
git diff --name-only origin/codex/design-tabs-save-fix-live...HEAD
git diff --name-only -- apps/admin
git diff --cached | rg -n '(BEGIN (RSA|OPENSSH|EC) PRIVATE KEY|postgres(?:ql)?://[^ ]+:[^ ]+@|pb1|__Host-celebix_panel|authorization_code)'
rg -n 'localStorage|sessionStorage|dangerouslySetInnerHTML|unsafe-inline' apps/customer-panel/components/settings/design apps/customer-panel/lib/storefront-fonts packages/storefront-design-ui/src
```

Expected: `apps/admin` diff count `0`; no secrets/browser tenant authority/unsafe CSS path.

- [ ] Run migration `096` plus assertions on disposable PostgreSQL 16, then rollback/reapply and verify cleanup. Apply the exact migration only to the isolated staging database before deploying consumers.

- [ ] Commit any final focused test fixture repair separately, push normally, and verify remote SHA parity.

- [ ] Deploy only Güzide staging customer-panel and storefront from the exact pushed SHA. Verify in a clean browser: full searchable catalog, independent preview, save/reload persistence, publish, selected two-font network request only, heading/body px values, fallback with Google blocked, no console errors, no horizontal overflow, and no production requests.

