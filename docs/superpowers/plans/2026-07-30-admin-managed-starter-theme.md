# Admin-managed Starter Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the shared starter storefront render a complete, safe default and consume only the active, durable merchant-controlled presentation projected by the verified storefront hostname authority.

**Architecture:** Extend the exact public storefront contract with a bounded presentation snapshot, produce that snapshot inside PostgreSQL from deterministic active singleton records, and map it through one pure starter-theme model shared by the customer-panel preview and storefront. Admin mutation continues through the existing merchant-admin repository; the browser never supplies store or tenant authority, and public rendering never reads generic admin records.

**Tech Stack:** TypeScript, React 19, Next.js App Router, Node test runner, PostgreSQL 16, `@celebix/saas-contracts`, `@celebix/saas-data`, CSS modules/global CSS.

## Global Constraints

- PostgreSQL and the verified exact storefront hostname remain the only durable/public tenant authority.
- `apps/admin/**` remains byte-for-byte unchanged.
- No Supabase, legacy admin API, iframe, reverse proxy, browser store ID, cookie, query, or forwarded header becomes storefront authority.
- No arbitrary merchant HTML, CSS, JavaScript, colors, font URLs, media origins, or executable configuration.
- Existing catalog, checkout, payment, analytics, session, Owner, and production activation behavior remains unchanged.
- Storefront CSP remains bounded to the configured Celebix media origin; merchant data never widens it.
- Production deployment, production credential mutation, production migration execution, merge, and customer-domain cutover remain zero.

---

### Task 1: Exact public presentation contract and pure starter-theme model

**Files:**
- Modify: `packages/saas-contracts/src/storefront/types.ts:1-54`
- Modify: `packages/saas-contracts/src/storefront/validation.ts:1-96`
- Modify: `packages/saas-contracts/src/storefront/storefront.test.ts:1-end`
- Create: `packages/saas-contracts/src/storefront/presentation.ts`
- Modify: `packages/saas-contracts/src/storefront/index.ts:1-end`

**Interfaces:**
- Produces: `PublicStorefrontAsset`, `PublicStarterThemePresentation`, and `PublicStorefront` with `schemaVersion: 2` and `presentation`.
- Produces: `buildDefaultStarterPresentation(storefront: Pick<PublicStorefront, "name">): PublicStarterThemePresentation`.
- Produces: `starterThemeTokens(presentation: PublicStarterThemePresentation): StarterThemeTokens`.
- Consumes: existing exact parsing helpers and canonical HTTPS/storefront path rules.

- [ ] **Step 1: Write failing contract tests**

Add literal schema-v2 fixtures proving a valid presentation parses and freezes, and mutations proving unknown keys, getters, exotic prototypes, overlong strings, unsafe destinations, invalid enum/home limit, partial assets, HTTP/noncanonical assets, and schema-v1 payloads throw `storefront_contract_invalid`.

```ts
const valid = {
  schemaVersion: 2,
  id: STORE_ID,
  name: "Güzide Kuyumcu",
  slug: "guzide-kuyumcu",
  hostname: "guzide.saas-staging.celebix.site",
  primaryHostname: "guzide.saas-staging.celebix.site",
  canonicalUrl: "https://guzide.saas-staging.celebix.site/",
  currency: "TRY",
  locale: "tr",
  themeKey: "starter",
  presentation: {
    schemaVersion: 1,
    displayName: "Güzide Kuyumcu",
    theme: { colorScheme: "neutral", headingStyle: "serif", productCardStyle: "editorial", productImageRatio: "portrait", homeProductLimit: 8, showBrandStory: true },
    hero: { enabled: true, headline: "Güzide Kuyumcu", body: "Özenle seçilmiş ürünleri keşfedin.", destination: "/products" },
    seo: { allowIndex: false },
  },
} as const;
assert.deepEqual(parsePublicStorefront(valid), valid);
```

- [ ] **Step 2: Run the contract test and verify RED**

Run: `npm test --workspace @celebix/saas-contracts -- --test-name-pattern="public storefront"`

Expected: FAIL because `schemaVersion: 2`, `presentation`, and model exports do not exist.

- [ ] **Step 3: Implement minimal exact types, parsing, defaults, and tokens**

Implement exact nested parsers. Restrict destinations to `/` or a canonical `/segment` path with no query, fragment, backslash, repeated slash, dot segment, or protocol-relative prefix. Assets require exact HTTPS URL, accepted media type, non-empty alt text, and complete dimensions in `1..8192`.

```ts
export type StarterThemeTokens = Readonly<{
  schemeClass: "theme-neutral" | "theme-warm" | "theme-dark" | "theme-ocean";
  headingClass: "heading-serif" | "heading-sans";
  cardClass: "cards-editorial" | "cards-compact";
  imageClass: "images-portrait" | "images-square";
}>;

export function starterThemeTokens(value: PublicStarterThemePresentation): StarterThemeTokens {
  return Object.freeze({
    schemeClass: `theme-${value.theme.colorScheme}`,
    headingClass: `heading-${value.theme.headingStyle}`,
    cardClass: `cards-${value.theme.productCardStyle}`,
    imageClass: `images-${value.theme.productImageRatio}`,
  } as StarterThemeTokens);
}
```

- [ ] **Step 4: Run the contract workspace GREEN**

Run: `npm test --workspace @celebix/saas-contracts && npm run typecheck --workspace @celebix/saas-contracts`

Expected: all contract tests and typecheck PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/saas-contracts/src/storefront
git commit -m "feat(storefront): define starter presentation contract"
```

### Task 2: Typed theme settings in the existing merchant-admin authority

**Files:**
- Modify: `packages/saas-contracts/src/merchant-admin/types.ts:1-13`
- Modify: `packages/saas-data/src/merchant-admin/validation.ts:4-35`
- Modify: `packages/saas-data/src/merchant-admin/repository.test.ts`
- Modify: `apps/customer-panel/lib/merchant-admin-ui/presentation.ts:80-140`
- Modify: `apps/customer-panel/lib/merchant-admin-ui/presentation.test.ts`
- Create: `apps/customer-panel/app/settings/theme/page.tsx`
- Modify: `apps/customer-panel/lib/merchant-admin-console.test.ts`

**Interfaces:**
- Produces: `MerchantAdminRecordKind` member `theme_setting`.
- Produces exact config keys: `colorScheme`, `headingStyle`, `productCardStyle`, `productImageRatio`, `homeProductLimit`, `showBrandStory`.
- Consumes: existing `MerchantModuleConsole`, `configuration.read`, and `configuration.manage` authority.

- [ ] **Step 1: Write failing repository and presentation tests**

Prove accepted enum combinations round-trip and reject unknown keys, arbitrary colors/CSS, invalid home limits, strings in boolean fields, and missing tenant permission. Prove `/settings/theme` maps to `theme_setting` and presents only bounded controls.

```ts
assert.deepEqual(merchantAdminConfig("theme_setting", {
  colorScheme: "warm",
  headingStyle: "sans",
  productCardStyle: "compact",
  productImageRatio: "square",
  homeProductLimit: 12,
  showBrandStory: false,
}), { colorScheme: "warm", headingStyle: "sans", productCardStyle: "compact", productImageRatio: "square", homeProductLimit: 12, showBrandStory: false });
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test --workspace @celebix/saas-data -- --test-name-pattern="theme_setting" && npm test --workspace @celebix/customer-panel -- --test-name-pattern="theme setting"`

Expected: FAIL because `theme_setting` is not a recognized record kind.

- [ ] **Step 3: Add the finite record kind and validators**

Add the kind to the frozen contract list, `CONFIG_KEYS`, typed validation, action mapping, module definition, and route.

```ts
definition({
  kind: "theme_setting",
  family: "settings",
  route: "/settings/theme",
  title: "Tema",
  singular: "tema profili",
  description: "Starter vitrinin görünüm ve ürün yerleşimini yönetin.",
  fields: [
    field("colorScheme", "Renk düzeni", "enum", undefined, ["neutral", "warm", "dark", "ocean"]),
    field("headingStyle", "Başlık stili", "enum", undefined, ["serif", "sans"]),
    field("productCardStyle", "Ürün kartı", "enum", undefined, ["editorial", "compact"]),
    field("productImageRatio", "Görsel oranı", "enum", undefined, ["portrait", "square"]),
    field("homeProductLimit", "Ana sayfa ürün sayısı", "enum", undefined, ["4", "8", "12"]),
    field("showBrandStory", "Marka hikâyesi", "boolean"),
  ],
})
```

- [ ] **Step 4: Run merchant-admin tests GREEN**

Run: `npm test --workspace @celebix/saas-data && npm test --workspace @celebix/customer-panel -- --test-name-pattern="merchant|theme"`

Expected: PASS with the new kind included in exhaustive finite-kind tests.

- [ ] **Step 5: Commit**

```bash
git add packages/saas-contracts/src/merchant-admin packages/saas-data/src/merchant-admin apps/customer-panel/app/settings/theme apps/customer-panel/lib/merchant-admin-ui apps/customer-panel/lib/merchant-admin-console.test.ts
git commit -m "feat(panel): add bounded starter theme settings"
```

### Task 3: PostgreSQL schema-v2 presentation projection

**Files:**
- Create: `apps/owner/scripts/sql/saas/202607300066_admin_managed_starter_theme.up.sql`
- Create: `apps/owner/scripts/sql/saas/202607300066_admin_managed_starter_theme.down.sql`
- Create: `apps/owner/scripts/sql/saas/202607300066_admin_managed_starter_theme_assertions.sql`
- Create: `apps/owner/scripts/sql/saas/phase3y-admin-managed-starter-theme-manifest.json`
- Create: `tests/saas-phase3/starter-theme/postgres-harness.mjs`
- Create: `tests/saas-phase3/starter-theme/static-security.test.mjs`

**Interfaces:**
- Produces: owner-only `saas.public_starter_presentation(uuid,timestamptz)`.
- Replaces: `saas.resolve_public_storefront(text,timestamptz)` output with exact schema version 2.
- Consumes: verified active domain/store selected by the existing resolver and `merchant_admin_records` rows only for that selected store.

- [ ] **Step 1: Write the disposable PostgreSQL harness first**

Create fixtures with two stores and overlapping settings. Assert safe defaults, deterministic `(updated_at,id)` winner, draft/archive/disabled invisibility, promotion start/end boundaries, cross-store isolation, schema-v2 exact JSON keys, and role ACLs. The harness must call the public resolver as `celebix_saas_host_resolver`; direct table/helper access must fail.

- [ ] **Step 2: Run harness and verify RED**

Run: `node tests/saas-phase3/starter-theme/postgres-harness.mjs`

Expected: FAIL because migration 066 and schema-v2 projection do not exist.

- [ ] **Step 3: Implement append-only migration**

Update merchant-admin finite-kind SQL with `theme_setting`, exact config validation, and `configuration.*` action mapping. Implement one owner-only helper that selects the active winner for each kind and builds only the allowlisted presentation JSON. Keep hero images absent until they are backed by a store-owned storefront asset; the runtime safely uses a real product-media fallback.

```sql
SELECT r.config INTO theme_config
FROM saas.merchant_admin_records r
WHERE r.store_id=p_store_id AND r.record_kind='theme_setting' AND r.status='active'
ORDER BY r.updated_at DESC,r.id DESC LIMIT 1;
```

Recreate the public resolver with `schemaVersion=2` and `presentation=saas.public_starter_presentation(resolved_store.id,p_now)`. Revoke helper access from all roles; preserve execute on the public resolver only for the host-resolver role.

- [ ] **Step 4: Add rollback, assertions, and checksum manifest**

Rollback restores the migration-065 resolver definition and prior merchant-admin functions. Assertions check function volatility/security definer/search path, exact grants, no table privileges for host resolver, and schema-v2 output. Generate checksums from exact bytes with `shasum -a 256`; do not hand-fabricate hashes.

- [ ] **Step 5: Run PostgreSQL GREEN**

Run: `node tests/saas-phase3/starter-theme/postgres-harness.mjs && node --test tests/saas-phase3/starter-theme/static-security.test.mjs`

Expected: migrations, tenant isolation, rollback/reapply, backup/restore, ACLs, and cleanup PASS with PostgreSQL 16.

- [ ] **Step 6: Commit**

```bash
git add apps/owner/scripts/sql/saas/202607300066_* apps/owner/scripts/sql/saas/phase3y-admin-managed-starter-theme-manifest.json tests/saas-phase3/starter-theme
git commit -m "feat(saas): project starter theme authority"
```

### Task 4: Customer-panel design control center and truthful preview

**Files:**
- Modify: `apps/customer-panel/components/settings/DesignSettingsHub.tsx:1-24`
- Modify: `apps/customer-panel/components/settings/design-settings.module.css:1-6`
- Create: `apps/customer-panel/components/settings/StarterThemePreview.tsx`
- Create: `apps/customer-panel/components/settings/StarterThemePreview.test.tsx`
- Modify: `apps/customer-panel/app/settings/design/page.tsx`
- Modify: `apps/customer-panel/lib/panel-shell.test.ts`

**Interfaces:**
- Consumes: pure `starterThemeTokens`, bounded safe defaults, `canManage`, and existing server-derived panel access.
- Produces: responsive desktop/mobile preview and cards for Theme, General, Hero, Promotion, Marquee, SEO, Social Preview, and Collections.
- Does not consume: `TenantContext` inside any client component.

- [ ] **Step 1: Write failing UI behavior tests**

Render the real hub/preview and assert accessible preview mode controls, all authorized routes, active-setting copy, disabled management behavior, no fake KPI/cart, and no serialized `storeId`, `principalId`, `membershipId`, cookie, or full `TenantContext`.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test --workspace @celebix/customer-panel -- --test-name-pattern="starter theme preview|design settings"`

Expected: FAIL because the control center and preview do not exist.

- [ ] **Step 3: Implement minimal control center**

Keep settings navigation server-derived. Build preview from an immutable presentation prop, use `aria-pressed` desktop/mobile controls, preserve 48px targets/focus rings, and render only truthful sample product placeholders labelled as preview—not merchant catalog data.

- [ ] **Step 4: Run customer-panel GREEN**

Run: `npm test --workspace @celebix/customer-panel && npm run typecheck --workspace @celebix/customer-panel && npm run build --workspace @celebix/customer-panel`

Expected: complete workspace tests, typecheck, and build PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/customer-panel/components/settings apps/customer-panel/app/settings/design apps/customer-panel/lib/panel-shell.test.ts
git commit -m "feat(panel): add starter theme control center"
```

### Task 5: Storefront consumes the presentation without fake controls

**Files:**
- Modify: `apps/storefront-shared/app/page.tsx:1-9`
- Modify: `apps/storefront-shared/app/products/page.tsx:1-8`
- Modify: `apps/storefront-shared/app/products/[slug]/page.tsx:16-55`
- Modify: `apps/storefront-shared/components/Header.tsx:1-6`
- Modify: `apps/storefront-shared/components/Footer.tsx:1-6`
- Modify: `apps/storefront-shared/components/StorefrontFrame.tsx:1-5`
- Modify: `apps/storefront-shared/components/ProductCard.tsx:1-8`
- Modify: `apps/storefront-shared/components/ProductGrid.tsx:1-4`
- Create: `apps/storefront-shared/components/ProductExplorer.tsx`
- Create: `apps/storefront-shared/lib/product-explorer.ts`
- Create: `apps/storefront-shared/lib/product-explorer.test.ts`
- Modify: `apps/storefront-shared/app/globals.css`
- Modify: `apps/storefront-shared/lib/storefront-app.test.ts`

**Interfaces:**
- Consumes: `storefront.presentation`, `starterThemeTokens`, and real `PublicProduct[]`.
- Produces: configured header/home/list/detail/footer, 4/8/12 home limit, real hero fallback media, search/filter/sort, metadata, and bounded CSS classes.

- [ ] **Step 1: Write failing pure explorer and storefront tests**

Prove locale-aware title search, all/available/discounted filters, title/price ordering without mutation, configured home limit, no inert bag, correct display name/support email, exact hero destination, configured theme classes, first-product-media fallback, empty-catalog layout, and robots noindex default.

```ts
assert.deepEqual(selectProducts(items, { query: "yüzük", filter: "available", order: "price-asc" }).map(({ id }) => id), ["p-low", "p-high"]);
assert.deepEqual(items.map(({ id }) => id), ["p-high", "p-low", "p-sold"]);
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test --workspace @celebix/storefront-shared -- --test-name-pattern="presentation|explorer|inert cart"`

Expected: FAIL because hardcoded copy, limit 8, and inert bag remain.

- [ ] **Step 3: Implement home/header/footer/detail integration**

Apply only bounded token classes at the frame. Use `presentation.displayName`, optional projected surfaces, safe internal links, actual product image fallback, and `homeProductLimit`. Preserve Buy Now, analytics, gallery, variants, stock, and Markdown paths unchanged.

- [ ] **Step 4: Implement client product explorer**

Pass only parsed public products and the four bounded view strings/classes. Use a real search input, three filter buttons, and a select for ordering; expose the current real result count and an honest empty state.

- [ ] **Step 5: Apply responsive/accessibility CSS**

Support desktop, 1025px desktop boundary, 1024px mobile boundary, 390x844, and 320x720 with zero horizontal overflow, 48px interactive targets, visible focus, reduced motion, readable contrast, and no content-obscuring dock.

- [ ] **Step 6: Run storefront GREEN**

Run: `npm test --workspace @celebix/storefront-shared && npm run typecheck --workspace @celebix/storefront-shared && npm run build --workspace @celebix/storefront-shared`

Expected: storefront tests, typecheck, and build PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/storefront-shared
git commit -m "feat(storefront): render admin managed starter theme"
```

### Task 6: Store-scoped R2 presentation assets

**Files:**
- Modify: `apps/owner/scripts/sql/saas/202607300066_admin_managed_starter_theme.up.sql`
- Modify: `apps/owner/scripts/sql/saas/202607300066_admin_managed_starter_theme.down.sql`
- Modify: `apps/owner/scripts/sql/saas/202607300066_admin_managed_starter_theme_assertions.sql`
- Create: `packages/saas-contracts/src/storefront-assets/types.ts`
- Create: `packages/saas-contracts/src/storefront-assets/validation.ts`
- Create: `packages/saas-contracts/src/storefront-assets/index.ts`
- Create: `packages/saas-data/src/storefront-assets/repository.ts`
- Create: `packages/saas-data/src/storefront-assets/repository.test.ts`
- Create: `packages/saas-data/src/storefront-assets/types.ts`
- Create: `packages/saas-data/src/storefront-assets/index.ts`
- Create: `apps/customer-panel/lib/server-storefront-assets/runtime.ts`
- Create: `apps/customer-panel/lib/server-storefront-assets/runtime.test.ts`
- Create: `apps/customer-panel/lib/storefront-assets-http/handler.ts`
- Create: `apps/customer-panel/lib/storefront-assets-http/handler.test.ts`
- Create: `apps/customer-panel/app/api/storefront-assets/route.ts`
- Create: `apps/customer-panel/components/settings/StorefrontAssetManager.tsx`
- Create: `apps/customer-panel/components/settings/StorefrontAssetManager.test.tsx`

**Interfaces:**
- Produces: store-scoped asset create/list/archive operations with key `stores/<storeId>/storefront/<kind>/<assetId>.<ext>`.
- Consumes: server-derived `TenantContext`, existing image decoder, R2 storage adapter, quota/error semantics, and operation IDs.
- Public projection emits an asset only when URL, store, kind, state, dimensions, media type, and configured media origin all match.

- [ ] **Step 1: Write failing contract/repository/runtime tests**

Prove exact input/output parsing, cross-store denial, immutable key binding, MIME/dimension/byte limits, list isolation, archive behavior, operation replay/mismatch, upload cleanup, and commit-unknown single read-only recovery.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test --workspace @celebix/saas-data -- --test-name-pattern="storefront asset" && npm test --workspace @celebix/customer-panel -- --test-name-pattern="storefront asset"`

Expected: FAIL because no storefront asset authority exists.

- [ ] **Step 3: Implement SQL authority and repository**

Add `saas.storefront_assets` with immutable store/key/kind identity, active/archived state, RLS, exact grants, operation evidence, and security-definer functions. The application role can call bounded functions but has no direct table DML.

- [ ] **Step 4: Implement server upload and HTTP surface**

Authorize first, decode and validate image, derive object key from server-owned store ID and asset ID, upload once, commit once, clean up on known failure, and perform one read-only recovery on commit unknown. Never accept object key, store ID, or public origin from the browser.

- [ ] **Step 5: Implement asset manager**

Show active store assets, upload/replace/archive controls, loading/error/empty states, focus restoration, and alt text. Persist selected asset IDs in the matching hero/social setting; never persist arbitrary external URLs.

- [ ] **Step 6: Run full asset and projection GREEN**

Run: `npm test --workspace @celebix/saas-contracts && npm test --workspace @celebix/saas-data && npm test --workspace @celebix/customer-panel && node tests/saas-phase3/starter-theme/postgres-harness.mjs`

Expected: all asset, admin, projection, isolation, rollback/reapply, and cleanup tests PASS.

- [ ] **Step 7: Refresh manifest checksums and commit**

```bash
git add apps/owner/scripts/sql/saas/202607300066_* apps/owner/scripts/sql/saas/phase3y-admin-managed-starter-theme-manifest.json packages/saas-contracts/src/storefront-assets packages/saas-data/src/storefront-assets apps/customer-panel
git commit -m "feat(saas): add store scoped storefront assets"
```

### Task 7: Whole-branch security, regression, and local visual verification

**Files:**
- Modify only test fixtures that fail because `PublicStorefront` legitimately moved from schema v1 to v2.
- Create untracked screenshots under `.codex-artifacts/starter-theme/`; do not commit them.

**Interfaces:**
- Consumes all prior tasks.
- Produces final verification evidence; no new runtime authority.

- [ ] **Step 1: Run exact workspaces and regressions**

```bash
npm test --workspace @celebix/saas-contracts
npm test --workspace @celebix/saas-data
npm test --workspace @celebix/customer-panel
npm test --workspace @celebix/storefront-shared
npm run typecheck --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/storefront-shared
npm run build --workspace @celebix/customer-panel
npm run build --workspace @celebix/storefront-shared
npm test --workspace @celebix/owner
npm run typecheck --workspace @celebix/owner
node tests/saas-phase3/starter-theme/postgres-harness.mjs
git diff --check
```

Expected: every command PASS.

- [ ] **Step 2: Run forbidden-authority and secret scans**

```bash
git diff --name-only 8d6b7897a04e406346c7f2ba18f4f67a600e6ec4...HEAD
git diff -- apps/admin
git diff 8d6b7897a04e406346c7f2ba18f4f67a600e6ec4...HEAD | rg -n 'SUPABASE|/api/admin/|x-forwarded|storeId.*searchParams|BEGIN (RSA|OPENSSH|EC) PRIVATE KEY|AKIA|sk_live'
```

Expected: `apps/admin` diff count 0 and forbidden/secret scan no findings.

- [ ] **Step 3: Verify responsive UI locally**

Run the customer panel and shared storefront with local non-production fixtures. Capture desktop 1440x900, boundary 1025x768 and 1024x768, mobile 390x844 and 320x720 for design preview, home, product list, and product detail. Measure horizontal overflow 0, targets >=48px, primary CTA contrast >=4.5:1, visible focus, and reduced-motion durations near 0.01ms.

- [ ] **Step 4: Final commit for fixture-only regression repairs if needed**

```bash
git add packages apps tests
git commit -m "test(storefront): verify starter theme integration"
```

Skip this commit when the worktree is already clean.

- [ ] **Step 5: Push normally and stop before deployment**

```bash
git push -u origin codex/starter-theme-admin-authority
git rev-parse HEAD
git rev-parse origin/codex/starter-theme-admin-authority
git status --short
```

Expected: local/remote SHAs match and worktree is clean. Staging deployments: 0. Production impacts: all 0.
