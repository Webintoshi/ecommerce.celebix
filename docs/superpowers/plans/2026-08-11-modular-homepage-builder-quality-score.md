# Modular Homepage Builder and Quality Score Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace duplicate homepage controls with one modular visual builder whose ordered sections, safe empty state, and deterministic 100-point quality score flow from draft to the shared storefront.

**Architecture:** `StorefrontDesignDocument` remains the sole draft authority. A versioned composition adds immutable section IDs; pure commands perform all edits; quality is derived and never persisted; the existing optimistic draft endpoint remains the only write path. Customer-panel preview and shared storefront consume the same ordered composition.

**Tech Stack:** TypeScript 5.9, React 19, Next.js 16 App Router, Node test runner, existing Celebix SaaS contracts/data repositories, CSS modules, shared storefront renderer.

## Global Constraints

- Preserve tenant/store authority and optimistic `draftVersion` conflict handling.
- Never accept tenant, store, media, category, product, page, publication, or score authority from browser fields.
- No new database table, migration, dependency, shadow settings document, or deployment.
- Legacy payloads normalize deterministically; an empty body-section array is valid and never causes 500/503.
- Hero is fixed first. At most 12 body sections; singleton sections remain unique; product rows may repeat at most four times.
- Every editor control is keyboard usable with a visible 48×48px target.
- Existing `.codex-artifacts/` and `.superpowers/` paths remain untracked and untouched.

---

### Task 1: Version canonical homepage section identity

**Files:**

- Modify: `packages/saas-contracts/src/storefront/types.ts:51-123`
- Modify: `packages/saas-contracts/src/storefront/validation.ts:270-425`
- Modify: `packages/saas-contracts/src/storefront-design/types.ts:84-180`
- Modify: `packages/saas-contracts/src/storefront-design/validation.ts:245-312`
- Modify: `packages/saas-contracts/src/storefront-design/defaults.ts:1-90`
- Modify: `packages/saas-contracts/src/storefront/index.ts:1-20`
- Modify: `packages/saas-contracts/src/index.ts:470-570`
- Test: `packages/saas-contracts/src/storefront-design/storefront-design.test.ts:150-230`
- Test: `packages/saas-contracts/src/storefront/retail-presentation.test.ts:1-160`

**Interfaces:**

```ts
export type HomepageSectionId = `home_${string}`;
export type StarterThemeSectionConfigV3 = StarterThemeSectionConfigV2 & Readonly<{ sectionId: HomepageSectionId }>;
export type StarterThemeCompositionConfigV3 = Readonly<{
  schemaVersion: 3;
  visual: StarterThemeVisualV2;
  announcement: StarterThemeCompositionConfig["announcement"];
  navigation: StarterThemeCompositionConfig["navigation"];
  sections: readonly StarterThemeSectionConfigV3[];
  productDetail: StarterProductDetailConfigV2;
  cart: StarterCartConfigV2;
  footer: StarterFooterConfig;
}>;
```

Legacy IDs are deterministic: `home_${kind}_${oneBasedOccurrence}`. New IDs are editor-generated and validated as 8-80 lower-case ASCII characters. Parsing returns frozen schema-version-4 design documents with schema-version-3 compositions.

- [ ] Add failing tests for V1/V2 normalization, V3 round-trip, empty sections, duplicate/malformed IDs, more than 12 sections, singleton rules, and four product-row maximum.

Run: `node --experimental-strip-types --test packages/saas-contracts/src/storefront-design/storefront-design.test.ts packages/saas-contracts/src/storefront/retail-presentation.test.ts`

Expected: FAIL because V3 identity and V4 design parsing do not exist.

- [ ] Implement types, parser, deterministic normalization, defaults, frozen arrays, and exports.
- [ ] Update typed fixtures only where literal schema versions require it; preserve all negative assertions.

Run: `npm test --workspace @celebix/saas-contracts && npm run typecheck --workspace @celebix/saas-contracts`

Expected: PASS.

- [ ] Commit: `feat(storefront): version homepage section authority`

---

### Task 2: Implement pure homepage commands and undo

**Files:**

- Create: `apps/customer-panel/components/settings/design/homepage-command-model.ts`
- Create: `apps/customer-panel/components/settings/design/homepage-command-model.test.ts`
- Modify: `apps/customer-panel/components/settings/design/workspace-model.ts:1-70`
- Modify: `apps/customer-panel/components/settings/design/workspace-model.test.ts:1-190`

**Interfaces:**

```ts
export type HomepageUndo = Readonly<{ label: string; composition: StarterThemeCompositionConfigV3 }>;
export function addHomepageSection(composition: StarterThemeCompositionConfigV3, kind: StarterThemeSectionConfigV3["kind"], sectionId: HomepageSectionId, insertAt?: number): StarterThemeCompositionConfigV3;
export function duplicateHomepageSection(composition: StarterThemeCompositionConfigV3, sectionId: HomepageSectionId, nextId: HomepageSectionId): StarterThemeCompositionConfigV3;
export function moveHomepageSection(composition: StarterThemeCompositionConfigV3, sectionId: HomepageSectionId, toIndex: number): StarterThemeCompositionConfigV3;
export function updateHomepageSection(composition: StarterThemeCompositionConfigV3, sectionId: HomepageSectionId, update: StarterThemeSectionConfigV3): StarterThemeCompositionConfigV3;
export function setHomepageSectionVisibility(composition: StarterThemeCompositionConfigV3, sectionId: HomepageSectionId, enabled: boolean): StarterThemeCompositionConfigV3;
export function removeHomepageSection(composition: StarterThemeCompositionConfigV3, sectionId: HomepageSectionId): Readonly<{ composition: StarterThemeCompositionConfigV3; undo: HomepageUndo }>;
export function restoreRemovedHomepageSection(undo: HomepageUndo): StarterThemeCompositionConfigV3;
```

- [ ] Add failing tests for add/insert/duplicate/move/update/visibility/remove/undo, unknown IDs, singleton/product-row/total limits, and input immutability.

Run: `node --experimental-transform-types --test apps/customer-panel/components/settings/design/homepage-command-model.test.ts apps/customer-panel/components/settings/design/workspace-model.test.ts`

Expected: FAIL because the command model does not exist.

- [ ] Implement immutable commands with safe section defaults and stable safe error codes.
- [ ] Extend editor state with one-level undo metadata that is not persisted.

Run: the same focused command. Expected: PASS.

- [ ] Commit: `feat(customer-panel): add homepage section commands`

---

### Task 3: Derive a deterministic 100-point quality score

**Files:**

- Create: `apps/customer-panel/components/settings/design/homepage-quality-model.ts`
- Create: `apps/customer-panel/components/settings/design/homepage-quality-model.test.ts`
- Modify: `apps/customer-panel/components/settings/design/DesignWorkspace.test.ts:1-190`

**Interfaces:**

```ts
export type HomepageQualityCategory = "hero" | "categories" | "shopping" | "trust" | "content" | "accessibility";
export type HomepageQualityResult = Readonly<{
  score: number;
  label: "Başlangıç" | "İyi gidiyor" | "Yayına hazır" | "Çok başarılı";
  categories: readonly Readonly<{ key: HomepageQualityCategory; earned: number; available: number }>[];
  recommendations: readonly Readonly<{ code: string; message: string; points: number; targetSectionId?: HomepageSectionId }>[];
}>;
export function scoreHomepageQuality(input: Readonly<{ design: StorefrontDesignDocument; media: readonly StorefrontDesignMediaOption[]; destinations: readonly StorefrontDesignDestinationOption[] }>): HomepageQualityResult;
```

Scoring is exact: hero 20, category 20, shopping 20, trust 15, content 15, mobile/accessibility 10. Recommendations are highest-points first, stable-code second, maximum five. The score is advisory and is never posted or stored.

- [ ] Add failing tests for 0/partial/100, hidden sections, missing media/destinations, empty composition, stable recommendation order, five-item cap, and immutability.

Run: `node --experimental-transform-types --test apps/customer-panel/components/settings/design/homepage-quality-model.test.ts`

Expected: FAIL because the model does not exist.

- [ ] Implement the pure scorer and static assertions that API payloads contain no `qualityScore`.

Run: focused score and `DesignWorkspace.test.ts`. Expected: PASS.

- [ ] Commit: `feat(customer-panel): score homepage quality`

---

### Task 4: Consolidate navigation to one homepage authority

**Files:**

- Modify: `apps/customer-panel/components/settings/design/workspace-navigation-model.ts:1-89`
- Modify: `apps/customer-panel/components/settings/design/workspace-navigation-model.test.ts:1-80`
- Modify: `apps/customer-panel/components/settings/design/design-surface-model.ts:1-100`
- Modify: `apps/customer-panel/components/settings/design/design-surface-model.test.ts:1-130`
- Modify: `apps/customer-panel/components/settings/design/DesignStepEditor.tsx:1-120`
- Modify: `apps/customer-panel/components/settings/design/DesignWorkspace.tsx:1-120`
- Modify: `apps/customer-panel/lib/design-settings.test.ts:1-80`

`Ana sayfa` becomes one visible `Ana sayfayı düzenle` entry and a single `homepage` step. Legacy queries `home`, `hero`, `assets`, `sections`, and `promotion` resolve there. Site-wide brand/style/navigation/product/cart/footer remain unchanged.

- [ ] Add failing tests for one visible homepage entry, legacy compatibility, no duplicate write surface, and unchanged site controls.

Run: `node --experimental-transform-types --test apps/customer-panel/components/settings/design/workspace-navigation-model.test.ts apps/customer-panel/components/settings/design/design-surface-model.test.ts apps/customer-panel/lib/design-settings.test.ts`

Expected: FAIL because four homepage steps exist.

- [ ] Implement the single location and route all homepage surfaces there.
- [ ] Ensure the design route never mounts `StarterThemeComposer` as a second authority.

Run: focused tests. Expected: PASS.

- [ ] Commit: `refactor(customer-panel): unify homepage design authority`

---

### Task 5: Build the visual library, ordered canvas, inspector, and score meter

**Files:**

- Create: `apps/customer-panel/components/settings/design/HomepageBuilder.tsx`
- Create: `apps/customer-panel/components/settings/design/HomepageSectionLibrary.tsx`
- Create: `apps/customer-panel/components/settings/design/HomepageSectionInspector.tsx`
- Create: `apps/customer-panel/components/settings/design/HomepageQualityMeter.tsx`
- Create: `apps/customer-panel/components/settings/design/HomepageBuilder.test.ts`
- Modify: `apps/customer-panel/components/settings/design/DesignWorkspace.tsx:26-116`
- Modify: `apps/customer-panel/components/settings/design/DesignPreview.tsx:1-40`
- Modify: `apps/customer-panel/components/settings/design/VisualStorefrontCanvas.tsx:1-118`
- Modify: `apps/customer-panel/components/settings/design/DesignSettingsDrawer.tsx:1-130`
- Modify: `apps/customer-panel/components/settings/design/design-settings.module.css:1-end`

**Component contract:**

```ts
export interface HomepageBuilderProps {
  readonly design: StorefrontDesignDocument;
  readonly media: readonly StorefrontDesignMediaOption[];
  readonly destinations: readonly StorefrontDesignDestinationOption[];
  readonly canManage: boolean;
  readonly previewMode: "desktop" | "mobile";
  readonly onChange: (design: StorefrontDesignDocument) => void;
}
```

Desktop uses section library, center preview, and modal inspector. Mobile uses `Bölüm ekle → Sırala → Düzenle`. Each section exposes edit, show/hide, permitted duplicate, drag metadata, up/down fallback, and remove/undo.

- [ ] Add failing tests for all six library kinds, click add, drag metadata, 48px controls, keyboard fallback, stable-ID selection, modal editing, duplicate rules, removal/undo, score/recommendations, permissions, and mobile steps.

Run: `node --experimental-transform-types --test apps/customer-panel/components/settings/design/HomepageBuilder.test.ts apps/customer-panel/components/settings/design/DesignWorkspace.test.ts`

Expected: FAIL because builder components do not exist.

- [ ] Implement the library and route every mutation through the pure command model.
- [ ] Render composition sections in exact order in `VisualStorefrontCanvas`; delete manually appended category/product duplicates.
- [ ] Add quality ring, breakdown, recommendation actions, focus return, Escape/backdrop close, `aria-live` feedback, reduced motion, and 320px overflow protection.

Run: focused tests and `npm run typecheck --workspace @celebix/customer-panel`. Expected: PASS.

- [ ] Commit: `feat(customer-panel): add visual homepage builder`

---

### Task 6: Enforce server-side composition references

**Files:**

- Modify: `apps/customer-panel/lib/storefront-design-http/handler.ts:150-230`
- Modify: `apps/customer-panel/lib/storefront-design-http/handler.test.ts:1-260`
- Modify: `apps/customer-panel/lib/server-storefront-design/runtime.ts:1-180`
- Modify: `packages/saas-data/src/storefront-design/repository.ts:130-180`
- Modify: `packages/saas-data/src/storefront-design/repository.test.ts:1-260`

On save and publish, parse the canonical document and validate references against already-authorized workspace media/destinations. Reject cross-store or missing references as safe `invalid_input`. Preserve conflict and commit-unknown behavior.

- [ ] Add failing tests for valid/missing/cross-store-shaped references, duplicate IDs, over-limit documents, empty sections, stale version, and absent score persistence.
- [ ] Implement server-only reference validation; never read store identity from the request.

Run: `node --experimental-transform-types --test apps/customer-panel/lib/storefront-design-http/handler.test.ts && npm test --workspace @celebix/saas-data`

Expected: PASS after the initially failing assertions are implemented.

- [ ] Commit: `fix(storefront): validate homepage composition authority`

---

### Task 7: Render exact order and safe empty homepages

**Files:**

- Modify: `apps/storefront-shared/components/campaign-home-sections.ts:1-90`
- Modify: `apps/storefront-shared/components/campaign-home-sections.test.ts:1-180`
- Modify: `apps/storefront-shared/components/CampaignHome.tsx:1-150`
- Modify: `apps/storefront-shared/components/CampaignHome.test.ts:1-150`
- Modify: `apps/storefront-shared/app/page.tsx:55-105`
- Modify: `apps/storefront-shared/lib/storefront-design-publication.test.ts:1-90`
- Modify: `packages/storefront-design-ui/src/StorefrontDesignRenderer.tsx:14-100`
- Modify: `packages/storefront-design-ui/src/StorefrontDesignRenderer.test.ts:80-180`

- [ ] Add failing tests for exact order, hidden omission, empty accessible shell rather than 500/503, missing-resource omission, repeat product-row isolation, and preview/storefront parity.
- [ ] Carry stable IDs into resolved public sections for React keys without exposing tenant/store authority.
- [ ] Render canonical order and a quiet empty home state; optional empty content must never throw.

Run: `npm test --workspace @celebix/storefront-design-ui && npm test --workspace @celebix/storefront-shared && npm run typecheck --workspace @celebix/storefront-shared`

Expected: PASS after initial RED.

- [ ] Commit: `fix(storefront): render modular homepage safely`

---

### Task 8: Verify user classes, accessibility, security, and regressions

**Files:**

- Create: `tests/saas-phase3/homepage-builder/user-class.test.mjs`
- Create: `tests/saas-phase3/homepage-builder/static-security.test.mjs`
- Modify: `apps/customer-panel/components/settings/design/DesignWorkspace.test.ts:1-220`
- Modify: `apps/customer-panel/lib/design-settings.test.ts:1-110`

**User classes:** A novice merchant completes a 100-point page; B a 1,000-product merchant uses authoritative sources; C a mobile merchant completes add/sort/edit at 390×844; D a restricted member can preview but cannot mutate; E a stale revision reloads authority without overwriting.

- [ ] Implement deterministic tests for all five classes, forbidden browser authority, secret patterns, visible raw IDs, and duplicate write surfaces.
- [ ] Run the full matrix:

```bash
node --experimental-transform-types --test apps/customer-panel/components/settings/design/*.test.ts
node --test tests/saas-phase3/homepage-builder/*.test.mjs
npm test --workspace @celebix/saas-contracts
npm test --workspace @celebix/saas-data
npm test --workspace @celebix/storefront-design-ui
npm test --workspace @celebix/customer-panel
npm test --workspace @celebix/storefront-shared
npm run typecheck --workspace @celebix/saas-contracts
npm run typecheck --workspace @celebix/saas-data
npm run typecheck --workspace @celebix/storefront-design-ui
npm run typecheck --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/storefront-shared
npm run build --workspace @celebix/customer-panel
npm run build --workspace @celebix/storefront-shared
git diff --check
git status --short
```

Expected: all tests, typechecks, and builds PASS; scans find no secret, migration, production, deployment, or browser authority change.

- [ ] Verify local viewports 1440×900, 1025×768, 1024×768, 390×844, and 320×720; 48px targets; focus restoration; Escape/backdrop close; reduced motion; no overlap; zero horizontal overflow.
- [ ] Commit: `test(storefront): verify homepage builder user classes`
- [ ] Push normally without force only after the matrix passes. Staging deploy remains a separate gate.

## Plan Self-Review

- [ ] Every approved requirement maps to a task and test.
- [ ] Every implementation decision and code contract is concrete and complete.
- [ ] New types use names exported by `@celebix/saas-contracts`.
- [ ] There is no second persistence authority and no deployment mutation.
