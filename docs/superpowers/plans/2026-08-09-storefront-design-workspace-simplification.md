# Storefront Design Workspace Simplification Implementation Plan

> **Required subskill:** Execute this plan with `superpowers:executing-plans`, using `superpowers:test-driven-development` for every behavior change and `superpowers:verification-before-completion` before any completion claim.

**Goal:** Replace the crowded storefront design tab rail with two child-friendly workspaces (`Tüm site`, `Ana sayfa`), one visible step at a time, one live preview, and one publish action without changing durable storefront-design authority.

**Architecture:** `DesignWorkspace` remains the sole autosave/publish owner. A pure navigation model maps legacy `section` query values into a stable workspace/step location. `StarterThemeComposer` becomes a controlled step editor and no longer owns a second navigation bar. `StorefrontAssetManager` receives a presentation-only kind filter while retaining its existing tenant-scoped R2/API authority.

**Tech stack:** Next.js 16 App Router, React 19, TypeScript, CSS Modules, Node test runner, existing `@celebix/saas-contracts` storefront-design contracts.

**Global constraints:** No migration, schema, endpoint, tenant/store authority, production configuration, or `apps/admin/**` change. Preserve autosave ordering, conflict behavior, publish validation, and existing legacy redirects. Use no placeholder data.

---

## Task 1: Lock the two-level navigation contract

**Files:**
- Create: `apps/customer-panel/components/settings/design/workspace-navigation-model.ts`
- Create: `apps/customer-panel/components/settings/design/workspace-navigation-model.test.ts`
- Modify: `apps/customer-panel/app/settings/design/page.tsx:1-17`

- [ ] Add failing tests for exactly two areas, ordered child steps, one selected area/step, and every legacy query mapping.
- [ ] Run `node --experimental-transform-types --test apps/customer-panel/components/settings/design/workspace-navigation-model.test.ts`; expect module-not-found failure.
- [ ] Implement immutable contracts:

```ts
export type DesignWorkspaceArea = "site" | "home";
export type DesignWorkspaceStep = "brand" | "style" | "navigation" | "product" | "cart" | "footer" | "hero" | "assets" | "sections" | "promotion";
export interface DesignWorkspaceLocation { readonly area: DesignWorkspaceArea; readonly step: DesignWorkspaceStep; }
export function resolveDesignWorkspaceLocation(section?: string | null): DesignWorkspaceLocation;
export function designWorkspaceAreas(activeArea: DesignWorkspaceArea): readonly DesignWorkspaceAreaItem[];
export function designWorkspaceSteps(area: DesignWorkspaceArea, activeStep: DesignWorkspaceStep): readonly DesignWorkspaceStepItem[];
```

- [ ] Map `theme/brand/colors/typography/announcement/product/cart/footer` to `site`, `hero/assets/promotion/home/sections` to `home`, and unknown/missing values to `site/brand`.
- [ ] Update the server page to pass the resolved immutable location without reading browser authority.
- [ ] Re-run the focused model test; expect all tests PASS.
- [ ] Commit: `test(customer-panel): define simple design navigation`

## Task 2: Make the theme composer subordinate to the parent workspace

**Files:**
- Modify: `apps/customer-panel/components/settings/StarterThemeComposer.tsx:1-430`
- Modify: `apps/customer-panel/components/settings/StarterThemeComposer.test.ts:1-180`
- Modify: `apps/customer-panel/components/settings/starter-theme-composer.module.css:1-260`
- Delete: `apps/customer-panel/components/settings/StarterThemeSubnavigation.tsx`
- Delete: `apps/customer-panel/components/settings/StarterThemeSubnavigation.test.tsx` if present
- Modify: `apps/customer-panel/components/settings/starter-theme-subnavigation-model.ts:1-25`
- Modify: `apps/customer-panel/components/settings/starter-theme-subnavigation-model.test.ts:1-30`

- [ ] Change static tests first to require parent-controlled `activePanel`, optional preview rendering, no local panel state, and no nested tablist.
- [ ] Run `node --experimental-transform-types --test apps/customer-panel/components/settings/StarterThemeComposer.test.ts apps/customer-panel/components/settings/starter-theme-subnavigation-model.test.ts`; expect assertions about the old local submenu to fail.
- [ ] Implement:

```ts
export interface StarterThemeComposerProps {
  readonly activePanel: ThemePanelKey;
  readonly canManage: boolean;
  readonly showPreview?: boolean;
  readonly value: StarterThemeCompositionConfigV2;
  readonly onChange: (value: StarterThemeCompositionConfigV2) => void;
}
```

- [ ] Remove `StarterThemeSubnavigation` and `useState<ThemePanelKey>` while preserving all six editor panels, resource loading, quantity authority, and catalog/R2 pickers.
- [ ] Render the current editor as an accessible named region; render `StarterThemePreview` only when `showPreview !== false`.
- [ ] Re-run focused tests; expect PASS.
- [ ] Commit: `refactor(customer-panel): control theme editor steps`

## Task 3: Scope visual assets to the selected workspace

**Files:**
- Modify: `apps/customer-panel/components/settings/StorefrontAssetManager.tsx:1-190`
- Modify: `apps/customer-panel/components/settings/StorefrontAssetManager.test.ts:1-70`

- [ ] Add a failing test for `allowedKinds`, filtered upload choices, filtered asset cards, and a safe default when the selected kind changes.
- [ ] Run `node --experimental-transform-types --test apps/customer-panel/components/settings/StorefrontAssetManager.test.ts`; expect missing contract assertions to fail.
- [ ] Add `allowedKinds?: readonly StorefrontAssetKind[]`, optional title/description, and derive visible choices/assets without changing POST/DELETE payloads or R2 authority.
- [ ] Use only `hero/category` in the homepage media step; retain `logo/favicon/social` for global brand use.
- [ ] Re-run focused tests; expect PASS.
- [ ] Commit: `refactor(customer-panel): scope storefront media steps`

## Task 4: Build the child-friendly workspace shell

**Files:**
- Modify: `apps/customer-panel/components/settings/design/DesignWorkspace.tsx:1-110`
- Create: `apps/customer-panel/components/settings/design/DesignStepEditor.tsx`
- Modify: `apps/customer-panel/components/settings/design/DesignWorkspace.test.ts:1-160`
- Modify: `apps/customer-panel/components/settings/design-settings.module.css:1-75`

- [ ] Rewrite static tests first to require exactly `Tüm site` and `Ana sayfa` at the top level, one active child step, one preview, one publish action, no duplicate composer navigation, and legacy path compatibility.
- [ ] Run `node --experimental-transform-types --test apps/customer-panel/components/settings/design/DesignWorkspace.test.ts`; expect old eight-tab assertions to fail.
- [ ] Implement a two-button workspace switch and an accessible step list:
  - `Tüm site`: Marka, Stil, Menü ve duyuru, Ürün sayfası, Sepet, Footer.
  - `Ana sayfa`: Bannerlar, Görseller, Bölümler, Promosyon.
- [ ] Route step content through `DesignStepEditor`:
  - brand -> brand inspector;
  - style -> color + typography inspector, theme visual controls inside `details` named `Gelişmiş görünüm`;
  - navigation -> controlled navigation composer plus advanced announcement inspector;
  - product/cart/footer -> controlled composer panels;
  - hero/promotion -> existing inspectors;
  - assets -> filtered asset manager;
  - sections -> controlled homepage composer plus category showcase editor.
- [ ] Keep `DesignPreview` as the only shared preview and keep the existing autosave/publish code unchanged.
- [ ] Replace the crowded rail with desktop step sidebar and mobile horizontal step strip. Preserve 48×48 targets, focus visibility, keyboard navigation, zero horizontal overflow, and `prefers-reduced-motion: .01ms`.
- [ ] Re-run workspace/component tests; expect PASS.
- [ ] Commit: `feat(customer-panel): simplify storefront design workspace`

## Task 5: Verify behavior, security, visuals, and regressions

**Files:**
- Modify only test snapshots/assertions already named above if an exact intentional label changed.
- Create untracked screenshots under `.codex-artifacts/storefront-design-workspace/`.

- [ ] Run focused tests:

```bash
node --experimental-transform-types --test \
  apps/customer-panel/components/settings/design/workspace-navigation-model.test.ts \
  apps/customer-panel/components/settings/design/DesignWorkspace.test.ts \
  apps/customer-panel/components/settings/StarterThemeComposer.test.ts \
  apps/customer-panel/components/settings/StorefrontAssetManager.test.ts
```

Expected: all focused tests PASS with no skipped tests.

- [ ] Run `npm test --workspace @celebix/customer-panel`; expect full workspace PASS.
- [ ] Run `npm run typecheck --workspace @celebix/customer-panel`; expect exit 0.
- [ ] Run `npm run build --workspace @celebix/customer-panel`; expect exit 0.
- [ ] Run `npm run typecheck --workspace @celebix/owner` and `npm run build --workspace @celebix/owner`; expect exit 0.
- [ ] Run `git diff --check`; expect no output.
- [ ] Scan tracked diff for `tenantId|storeId|x-store-id|localStorage|sessionStorage|R2_SECRET|DATABASE_URL`; expect no new browser authority or secret.
- [ ] Start the customer-panel locally with approved non-production environment, inspect through the in-app browser at 1440×900, 1025×768, 1024×768, 390×844, and 320×720, and capture the selected final desktop/mobile states.
- [ ] Confirm: two top-level choices only; one child editor only; publish button appears once; preview remains usable; 1024 mobile/1025 desktop; no overflow; 48px targets; visible focus; reduced-motion duration about `.01ms`.
- [ ] Inspect final screenshots with `view_image` and compare at least: information hierarchy, navigation clarity, active state, editor density, preview dominance, and mobile overflow.
- [ ] Commit any final test/CSS repair as `fix(customer-panel): polish simple design workspace`.
- [ ] Push normally without force. Deploy only the already-authorized staging customer-panel when local verification is clean; do not touch production, Owner, storefront, migrations, or credentials.

## Self-review checklist

- [ ] Every approved spec requirement maps to a task above.
- [ ] No placeholder terms (`TODO`, `TBD`, `later`, `as needed`) remain.
- [ ] All component prop types match between callers and implementations.
- [ ] Legacy query redirects remain valid.
- [ ] Durable design, media, tenant, and publish authorities are unchanged.
