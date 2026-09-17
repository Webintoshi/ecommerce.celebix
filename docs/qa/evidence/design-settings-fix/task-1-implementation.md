# Task 1 report — A01 lossless editor conversion and safe field opening

Preserved implementation evidence, moved from task-local scratch after the scoped review completed.

## Status

Implemented the frontend-only A01 fix in the isolated `codex/mira-design-settings-fix` worktree. No API, repository, SQL, auth, storefront runtime, deployment, live browser, or live store mutation was performed.

## Root cause and reproduction

`upgradeStarterThemeComposition` handled V3 as a V2 downgrade. It removed every `sectionId`, then passed the remaining object (which still contained `schemaVersion: 3`) to the V2 builder. The input spread overwrote the builder's `schemaVersion: 2`, so the strict V3 parser received identity-less sections and threw `storefront_contract_invalid` during the composer's first render. That render occurs even inside the closed advanced disclosure.

The audit's default V3 diagnostic was reviewed first. A mounted-component regression then reproduced the same production boundary with a richer valid V3 fixture.

### RED 1 — valid V3 field opening

Command:

```text
node --experimental-transform-types --test apps/customer-panel/components/settings/StarterThemeComposer.behavior.test.ts
```

Result before the adapter fix: exit 1; 0 pass / 1 fail. The actual mounted `StarterThemeComposer` threw `TypeError: storefront_contract_invalid` from `parseConfigSectionV3`, reached through `buildStarterThemeComposition` → `upgradeStarterThemeComposition` during `useMemo`.

### RED 2 — untouched cart preservation

After the V3 version/identity fix, the same full-payload regression was strengthened with stored `cart.showShippingProgress: true`.

Command:

```text
node --experimental-transform-types --test apps/customer-panel/components/settings/StarterThemeComposer.behavior.test.ts
```

Result before the lossless serializer adjustment: exit 1; 1 pass / 1 fail. The literal full-document comparison showed the unrelated header-width edit changed `showShippingProgress` from `true` to `false`. The session serializer was narrowed to validation plus the requested patch; the legacy/new-document V2 builder retains its existing normalization policy.

### RED 3 — recoverable field boundary

Command:

```text
node --experimental-transform-types --test apps/customer-panel/components/settings/design/DesignStepEditor.behavior.test.ts
```

Result before the boundary: exit 1; 0 pass / 1 fail. A child composer render error escaped `DesignStepEditor`. The added boundary now contains only the composer subtree; the authoritative `design` document and its callback remain in the parent. Retry does not initialize, replace, or write the draft.

## Minimal implementation

- Added a discriminated editor session that retains whether validated input is V2 or V3 and serializes back to that version.
- V3 is no longer downgraded and its validated section objects retain `sectionId`, order, visibility, media/product/category references, and untouched nested values.
- Existing V1 input still upgrades through the established V1→V2 path; V2 remains V2.
- Invalid input produces an explicit in-field alert and no callback rather than substituting defaults.
- Added a retryable composer-only React error boundary in `DesignStepEditor`; parent draft ownership is unchanged.
- Expanded the controlled composer callback from V2-only to the exact document-supported union V2 | V3. The outer callback still emits the complete `StorefrontDesignDocument`.
- Resource loading remains one-time for valid editor state and does not rerun for every controlled edit.

## GREEN verification

Focused command (final source):

```text
node --experimental-transform-types --test \
  apps/customer-panel/components/settings/StarterThemeComposer.behavior.test.ts \
  apps/customer-panel/components/settings/design/DesignStepEditor.behavior.test.ts \
  apps/customer-panel/components/settings/StarterThemeComposer.test.ts \
  apps/customer-panel/components/settings/design/DesignWorkspace.test.ts \
  apps/customer-panel/lib/starter-theme-composer-model.test.ts
```

Result: exit 0; **59 pass / 0 fail / 0 skipped**.

Behavior proven by the new mounted tests:

- A valid V3 fixture opens visual, navigation, home, product, cart, and footer panels with zero write callbacks.
- One header-width edit produces a payload accepted by the unchanged strict parser.
- The result remains schema V3 and has the literal section ID order `home_product_row_11111111_1111_4111_8111_111111111111`, `home_story_second`, `home_hero_third`.
- The supplied non-default footer is deeply equal after the edit; full-document equality proves untouched navigation, product, cart, ordering, visibility, and hero desktop/mobile/product media references remain unchanged.
- Valid default V3 round-trips exactly; V2 round-trips exactly; valid V1 uses the existing V2 upgrade.
- Invalid composition shows an explicit error and invokes no callback.
- A composer child render failure is contained; retry recovers and invokes no callback.

Targeted TypeScript program check (six changed implementation/test modules plus `next-env.d.ts`): exit 0, `targeted TypeScript check passed (6 changed files)`.

`git diff --check`: exit 0, no whitespace errors.

Per controller instruction, the full Customer Panel test, package typecheck, and production build were not duplicated here; they remain the controller's integrated final validation.

## Changed task-owned files

- `apps/customer-panel/lib/starter-theme-composer-model.ts`
- `apps/customer-panel/lib/starter-theme-composer-model.test.ts`
- `apps/customer-panel/components/settings/StarterThemeComposer.tsx`
- `apps/customer-panel/components/settings/StarterThemeComposer.test.ts`
- `apps/customer-panel/components/settings/StarterThemeComposer.behavior.test.ts`
- `apps/customer-panel/components/settings/design/DesignStepEditor.tsx`
- `apps/customer-panel/components/settings/design/DesignStepEditor.behavior.test.ts`
- `.superpowers/sdd/2026-09-14-design-settings-fix/task-1-report.md`

## Self-review

- No shared contract or validator was changed or relaxed.
- No `any`, production type assertion, default substitution, initialization write, autosave, or swallowed success path was added.
- Parsed invalid data stays invalid and visible; no callback fires.
- V3 output authority and stable IDs are retained; V1/V2 behavior is covered.
- Draft state lives above the recoverable boundary.
- Only an explicit user edit emits a full composition; merely opening or retrying emits nothing.
- The resource-fetch effect depends on valid/invalid availability, not the changing session object, avoiding reloads on each controlled edit.

## Concerns / downstream notes

- The legacy V2 builder still forces unsupported shipping progress off when creating/normalizing V2 editor state. The new existing-document session deliberately does not apply that normalization during unrelated edits, because A01 requires a lossless stored-document round trip. The UI control remains disabled and storefront behavior is unchanged.
- The component behavior harness uses real React + happy-dom and the real adapter/composer module, while catalog/assets/footer collaborators are isolated; it is not durable persistence or live-browser evidence.
- No full Panel test/build or live screenshot was run in this task, by explicit controller scope.

## Review fix round 1 — V3 section creation

Reviewer reproduction showed that the legacy composer's `makeSection` returns a V2 section without `sectionId`; `addSection` appended it unchanged to a V3 session, and the strict V3 serializer rejected the result. Existing edits were lossless, but V3 creation was not version-aware.

### RED

Command:

```text
node --experimental-transform-types --test apps/customer-panel/components/settings/StarterThemeComposer.behavior.test.ts
```

Result before the review fix: exit 1; **2 pass / 1 fail**. Clicking the mounted V3 composer's `Bölüm ekle` control produced zero callbacks (`0 !== 1`) because the strict serializer rejected the identity-less appended product row.

### Fix

- Added a version-aware `appendStarterThemeSection` adapter operation.
- V2 keeps its existing identity-less V2 section shape.
- V3 generates an ID with the existing `home_<kind>_<uuid>` convention. It compares against all current V3 IDs and adds deterministic `_2`, `_3`, and later suffixes when the generated stem collides.
- The append still passes through the unchanged strict parser before the callback.
- The mounted collision regression fixes `randomUUID` to an existing ID stem and asserts the literal new ID `home_product_row_11111111_1111_4111_8111_111111111111_2`, unchanged prior ID order, four unique IDs, exact new section fields, and a parseable V3 callback payload.
- The six panel-opening assertions now query each branch's own heading or fieldset legend (`Görsel sistem`, `Duyuru ve navigasyon`, `Ana sayfa bölümleri`, `Ürün detayı`, `Sepet deneyimi`, and `Footer ayarları`), rather than accepting the outer region's generic `aria-label`.

### GREEN

Command:

```text
node --experimental-transform-types --test apps/customer-panel/components/settings/StarterThemeComposer.behavior.test.ts
```

Result after the review fix: exit 0; **3 pass / 0 fail / 0 skipped**.

The review fix changes only:

- `apps/customer-panel/lib/starter-theme-composer-model.ts`
- `apps/customer-panel/components/settings/StarterThemeComposer.tsx`
- `apps/customer-panel/components/settings/StarterThemeComposer.behavior.test.ts`
- this report
