# Task 2 report — A02/A03/A07 accessible toolbar and faithful draft canvas

## Status

DONE

Commit: `7bdc8f18 fix(customer-panel): align design preview and toolbar`

## What changed

- Moved the single design toolbar into the design workspace so Panel shell rules cannot hide it at 1024px or 390px. Kept the original publish permission, validation, saving, publishing, and conflict disabled conditions unchanged.
- Added explicit toolbar semantics, pressed state for preview modes, visible focus rings, wrapping/no-overflow layout, and minimum 44px targets (rendered primary controls are 48px high).
- Restored modal focus to the always-visible `Alanlar` summary when a surface is selected from its disclosure, rather than the subsequently hidden menu item. The DOM typings expose `summary` as `HTMLElement`, so the internal trigger/ref contract was widened to `HTMLElement`; the public design document callback was not changed.
- Normalized the existing V2/V3 composition with the shared `normalizeStarterThemeCompositionV3` helper and rendered every enabled homepage section in stored order using stable `sectionId` keys.
- Preserved multiple product rows; removed automatic category/product sections from an intentionally empty homepage; and labeled catalog-only placeholders as examples.
- Rendered configured V3 footer tone, groups, newsletter, consent, and social options instead of schema-gated defaults.
- Kept draft brand colors and typography inside the existing `StorefrontDesignRenderer` and added a visible `Taslak önizlemesi` notice so draft output is not presented as the published store.
- Added preview-container and explicit mobile-mode breakpoints. A 390px canvas now uses mobile header/grid behavior even inside a 1440px outer viewport.
- Added a preview-scoped header stacking context so visible header/cart editor targets win over a following hero editor overlay. No shared storefront stylesheet/runtime behavior changed.

## TDD evidence

### RED — ordered canvas, empty home, V3 footer, toolbar

Command:

```text
node --experimental-transform-types --test apps/customer-panel/components/settings/design/VisualStorefrontCanvas.behavior.test.ts apps/customer-panel/components/settings/design/DesignWorkspaceToolbar.behavior.test.ts
```

Relevant result before implementation:

```text
tests 4; pass 0; fail 4
toolbar: actual typeof DesignWorkspaceToolbar 'undefined', expected 'function'
ordered sections: [true, true, false], expected [true, true, true] (THIRD_PRODUCTS absent)
empty home: data-empty-home="true" absent; fabricated category/product sections present
V3 footer: CUSTOM_HELP absent; schema-gated default headings rendered
```

These failures were expected because the old canvas used `.find()` for one category and one product row, always fabricated both sections, read footer only for schema V2, and mounted toolbar actions only into the shell-owned topbar portal.

### RED — focus target and isolated mobile breakpoint

Command:

```text
node --experimental-transform-types --test apps/customer-panel/components/settings/design/DesignWorkspaceToolbar.behavior.test.ts
```

Relevant result:

```text
tests 1; pass 0; fail 1
focus return trigger tag: actual BUTTON, expected SUMMARY
```

The configured menu item becomes hidden when the disclosure closes, which reproduced the browser result where Escape left focus on BODY.

The preview breakpoint regression also failed before the scoped rules because neither the explicit mobile-mode selector nor the 720px preview-container selector hid the storefront navigation. A final stacking regression failed before the scoped header rule because the preview header had no positioned stacking context.

### GREEN — focused render and nearby interface regressions

Command:

```text
node --experimental-transform-types --test apps/customer-panel/components/settings/design/VisualStorefrontCanvas.behavior.test.ts apps/customer-panel/components/settings/design/DesignWorkspaceToolbar.behavior.test.ts apps/customer-panel/components/settings/design/DesignWorkspace.test.ts apps/customer-panel/lib/design-settings.test.ts
```

Result:

```text
tests 16; pass 16; fail 0; cancelled 0; skipped 0
```

The only console noise was Node's expected `ExperimentalWarning` for `--experimental-transform-types`; no application warning or error was emitted.

### GREEN — affected interface typecheck

Command:

```text
npm run typecheck --workspace @celebix/customer-panel
```

Result: exit 0, no TypeScript diagnostics.

### GREEN — whitespace/ownership check

Command: `git diff --cached --check`

Result: exit 0. The staged/committed set contained only the eight Task 2 files listed below; controller-owned QA, fixture, and persistence files remained unstaged.

## Browser evidence from controller-owned real PanelLayout fixture

Fixture: `http://127.0.0.1:3427/design-settings-fix` (real Next/PanelLayoutClient/DesignWorkspace)

- 1440 / 1024 / 390: `[data-design-toolbar="true"]` present and visible; document `scrollWidth` equals viewport width.
- Primary toolbar controls render 48px high; at 390 the device buttons are 48×48. Native publish disabling remained present.
- Outer width 1440 with `Mobil`: preview width 390px, product grid columns 171px + 171px, and storefront nav `display:none` with width 0.
- At 390, `Alanlar → Header ve menü → Escape`: modal closes and `document.activeElement` is the visible `summary[aria-label="Tasarım alanlarını aç"]` (95.38×48), not BODY.
- At 390 mobile, the cart target center resolves to `Yan sepet alanını düzenle`; clicking opens `Yan sepet` with the `Sepet deneyimi` group, and Escape restores focus to the cart control. Before the scoped stacking fix the same point resolved to `Ana banner alanını düzenle`.

## Files changed

- `apps/customer-panel/components/settings/design/VisualStorefrontCanvas.tsx`
- `apps/customer-panel/components/settings/design/DesignPreview.tsx`
- `apps/customer-panel/components/settings/design/DesignWorkspace.tsx`
- `apps/customer-panel/components/settings/design/DesignSettingsDrawer.tsx`
- `apps/customer-panel/components/settings/design/design-surface-model.ts`
- `apps/customer-panel/components/settings/design-settings.module.css`
- `apps/customer-panel/components/settings/design/VisualStorefrontCanvas.behavior.test.ts`
- `apps/customer-panel/components/settings/design/DesignWorkspaceToolbar.behavior.test.ts`

## Self-review

- Requirements: ordered enabled sections, multiple product rows, empty homepage, V3 footer options, brand/typography, draft labeling, toolbar access, focus restoration, mobile canvas breakpoints, disabled publishing, and scoped CSS are all covered.
- Scope: no backend/API/repository/SQL/auth/shared storefront runtime/save-lifecycle changes; no controller fixture/QA files staged; no deployment, push, merge, or live mutation.
- React review: the section renderer is a top-level exhaustive component; normalization is delegated to the existing contract helper; no new effects, data waterfalls, global listeners, unsafe HTML, or storage authority were added.
- Mutation review: removing enabled filtering/order mapping, reverting to one `.find()`, fabricating an empty home, schema-gating the footer, dropping draft tokens/label, returning the hidden menu button, or removing mobile/header scoped rules is covered by the focused tests plus real browser checks.

## Concerns / remaining limits

- The controller fixture had no selected category records, so a computed category-grid column measurement was not available in that browser run. The real renderer regression does cover an enabled category between two product rows and literal ordered headings `FIRST_PRODUCTS`, `SECOND_CATEGORIES`, `THIRD_PRODUCTS`; the browser measured the same shared two-column rule on product grids.
- Browser interaction checked the fields-menu header path and direct cart canvas path, not every canvas surface pointer target.
- Product/category examples are intentionally labeled placeholders because the design workspace does not receive product-row projection data. No customer content is invented.
- Per the task brief, no full Customer Panel suite or production build was run; Task 2 ran only focused tests and the affected Customer Panel typecheck.

---

## Review fix round 1 — renderer authority and truthful projection limits

### Status

- A02 / A07: DONE.
- A03: PARTIAL. Draft order, enabled state, stable section identity, repeated product rows, category layout, footer link values, social URLs, top-level design hero precedence, brand, and typography are represented. Exact published homepage media/products/reviews remain unavailable without the server-resolved campaign projection described below.

### Review findings addressed

- Removed the canvas-local storefront implementations for each composition kind. Supported brand/header/top-level hero behavior remains owned by `StorefrontDesignRenderer`.
- Extracted and reused the existing Panel product-card and category-layout example scaffolds. Every fallback card is marked `Örnek içerik`; it is not presented as active catalogue or published-store fidelity.
- Represented the normalized private composition as one ordered configuration summary. Stored desktop/mobile asset IDs remain visible and are never interpreted as Design Workspace media IDs.
- Added an explicit notice that homepage images, catalogue records, and reviews are resolved server-side. Product/review content is not fabricated as successful projection output.
- Applied the existing storefront precedence: when the top-level design hero is enabled with a slide, stored composition heroes are omitted. A combined regression now proves only one hero owner.
- Category layout and resolved collection labels are retained; missing collection/page records disclose their private ID and server-resolution dependency.
- Footer groups now show each configured system, policy, collection, and page link instead of only a count. Social entries show both network and exact configured URL.
- Shared the existing Footer editor’s deterministic system/policy labels through a pure Panel helper so preview and editor cannot drift.
- Replaced the stale toolbar assertion with a controlled rerender using `previewMode="mobile"`, then asserted `aria-pressed="true"`.
- Removed the CSS-source regex breakpoint test. Responsive evidence is now provided by the controller-owned real-browser helper and result artifact; no competing browser helper was added here.
- Deleted the unused CSS for the removed canvas-local composition renderers.

### Exact remaining A03 dependency

The Design Workspace API supplies the private design draft, Design Workspace media options, and destination options. It does not supply the `CampaignHomeProjection` returned by the storefront-only `saas.public_starter_retail_home` server projection, including resolved legacy storefront assets, category images, product rows, and approved reviews. The public storefront section components consume that projection and storefront route/localization dependencies; importing them into the client editor would cross the server authority boundary. No API, repository, SQL, or storefront-runtime expansion was made in this task.

### RED

Command:

```text
node --experimental-transform-types --test apps/customer-panel/components/settings/design/VisualStorefrontCanvas.behavior.test.ts apps/customer-panel/components/settings/design/DesignWorkspaceToolbar.behavior.test.ts
```

Result before the fix:

```text
tests 6; pass 2; fail 4
ordered canvas: fabricated product-row catalogue placeholders still rendered
V3 footer: configured link labels/targets and social URL were absent
combined hero: TOP_LEVEL_HERO and COMPOSITION_HERO both rendered
stored section disclosure: mobile asset ID, category layout and projection-dependency text were absent
```

The toolbar rerender regression passed during RED because its production pressed-state behavior was already correct; the review problem was the old test’s stale assertion.

### GREEN

Command:

```text
node --experimental-transform-types --test apps/customer-panel/components/settings/design/VisualStorefrontCanvas.behavior.test.ts apps/customer-panel/components/settings/design/DesignWorkspaceToolbar.behavior.test.ts apps/customer-panel/components/settings/design/DesignWorkspace.test.ts apps/customer-panel/lib/design-settings.test.ts apps/customer-panel/components/settings/StarterThemeComposer.test.ts
```

Result:

```text
tests 37; pass 37; fail 0; cancelled 0; skipped 0
```

Node emitted only its known `ExperimentalWarning` for `--experimental-transform-types`; this is test-runner console noise, not an application error and no runtime/build setting was changed to hide it.

Affected interface check:

```text
npm run typecheck --workspace @celebix/customer-panel
```

Result: exit 0 with no TypeScript diagnostics.

Whitespace check: `git diff --check` exited 0.

### Final browser evidence (controller-owned real fixture)

- 1440 / 1024 / 390: all four primary toolbar controls are visible, 48px high, at least 48px wide, keyboard reachable, and their center hit-tests resolve to the same button/summary; document overflow is 0.
- Keyboard Enter activates the selected preview mode.
- Outer 1440 with mobile preview: canvas width is 390px, both example product grids have two columns, navigation is hidden, and the mobile button reports `aria-pressed="true"`.
- 390 modal path: keyboard opens `Alanlar`, selects `Header ve menü`, Escape closes the dialog and returns focus to the visible 95×48 summary with a solid 2px outline.
- The fixture still has no selected category; Task 4’s synthetic-category browser scenario owns the final real category-grid measurement.
- Controller artifacts are `tests/saas-phase3/hemenaku-admin-presentation/design-settings-browser-check.mjs` and `docs/qa/evidence/design-settings-fix/browser-layout-intermediate.json`; they are root-owned and intentionally not staged in the Task 2 commit.

### Fix-round files

- `apps/customer-panel/components/settings/design/VisualStorefrontCanvas.tsx`
- `apps/customer-panel/components/settings/design/VisualStorefrontCanvas.behavior.test.ts`
- `apps/customer-panel/components/settings/design/DesignWorkspaceToolbar.behavior.test.ts`
- `apps/customer-panel/components/settings/design-settings.module.css`
- `apps/customer-panel/components/settings/StarterThemePreview.tsx`
- `apps/customer-panel/components/settings/StarterThemePreviewScaffolds.tsx`
- `apps/customer-panel/components/settings/StarterFooterEditor.tsx`
- `apps/customer-panel/components/settings/starter-footer-options.ts`

### Fix-round concerns

- A03 is deliberately partial until an authorized, public server projection is available to the Design Workspace; this task does not claim exact storefront media, product, category-image, or review rendering.
- Example product/category visual scaffolds are editor-only layout aids and visibly identified as examples. Stored legacy asset IDs remain private configuration text, never converted into guessed URLs or Design Workspace media.
- No full suite or production build was run, per the fix-round constraint.

### Controller artifact supplement

The fix-round CUA result is `docs/qa/evidence/design-settings-fix/browser-layout-fix-round-1.json`, associated with application source `edb32df67d1807b1ab23dc25a8334fe90286bd5c`. `browser-layout-intermediate.json` intentionally remains the earlier `7bdc8f18` evidence. Driver additionally checks every main control's pointer center is not covered, and uses keyboard activation after resizing/DOM-state inspection. Full source integration remains pending Task3/4.
