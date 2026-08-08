# Visual Value Proposition Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the text-only value-proposition form with a visual six-icon picker while guaranteeing that merchant-authored headings and descriptions flow immutably into the existing starter-theme composition.

**Architecture:** Keep `StarterThemeSectionConfigV2` unchanged. Put immutable value-item mutations in the existing starter-theme composer model, consume them from the client editor, and render the existing Lucide icon set as an accessible visual radio-style grid. Preserve the current save, validation, preview, and storefront pipelines.

**Tech Stack:** TypeScript 5.9, React 19, Next.js 16, CSS Modules, Lucide React, Node test runner.

## Global Constraints

- Target application is `apps/customer-panel`.
- Keep the existing six `StarterValueIcon` values unchanged.
- Keep two to four value cards and the existing 1–120/1–300 text limits.
- Do not add dependencies, migrations, asset types, or storefront contract changes.
- Do not touch production or deploy as part of this plan.

---

### Task 1: Immutable merchant-authored value model

**Files:**
- Modify: `apps/customer-panel/lib/starter-theme-composer-model.ts:1-150`
- Test: `apps/customer-panel/lib/starter-theme-composer-model.test.ts`

**Interfaces:**
- Produces: `updateStarterValueProposition(section, index, patch): ValueSection`
- Produces: `addStarterValueProposition(section): ValueSection`
- Produces: `removeStarterValueProposition(section, index): ValueSection`
- Produces: `isStarterValuePropositionDraftPublishable(section): boolean`
- Guarantees: arbitrary merchant text is preserved exactly; inputs and existing items remain immutable; the 2–4 item boundary is enforced locally.

- [x] **Step 1: Write failing model tests**

Add tests that call `updateStarterValueProposition` with `{ heading: "Aynı gün kargo", body: "Saat 14.00'e kadar verilen siparişlerde." }`, assert exact text preservation, assert the original section is unchanged, and cover add/remove boundaries.

```ts
assert.equal(updated.items[0]?.heading, "Aynı gün kargo");
assert.equal(updated.items[0]?.body, "Saat 14.00'e kadar verilen siparişlerde.");
assert.equal(original.items[0]?.heading, "Eski başlık");
assert.equal(removeStarterValueProposition(twoItems, 0), twoItems);
assert.equal(addStarterValueProposition(fourItems), fourItems);
```

- [x] **Step 2: Run the focused test and verify RED**

Run: `node --experimental-transform-types --test apps/customer-panel/lib/starter-theme-composer-model.test.ts`

Expected: FAIL because the three value-proposition model exports do not exist.

- [x] **Step 3: Implement the minimal immutable helpers**

Define `ValueSection` from `StarterThemeSectionConfigV2`, patch exactly one item with an immutable copy, append a blank editable item with `sparkles`, remove only when more than two items remain, and recognize only drafts whose headings and bodies satisfy the existing non-empty bounded contract.

```ts
export function updateStarterValueProposition(section: ValueSection, index: number, patch: Partial<ValueSection["items"][number]>): ValueSection {
  if (index < 0 || index >= section.items.length) return section;
  return Object.freeze({ ...section, items: Object.freeze(section.items.map((item, position) => position === index ? Object.freeze({ ...item, ...patch }) : item)) });
}
```

- [x] **Step 4: Run the focused test and verify GREEN**

Run: `node --experimental-transform-types --test apps/customer-panel/lib/starter-theme-composer-model.test.ts`

Expected: all tests in the file PASS.

### Task 2: Visual icon picker and compact editable cards

**Files:**
- Modify: `apps/customer-panel/components/settings/StarterRetailSectionEditors.tsx:1-50`
- Modify: `apps/customer-panel/components/settings/starter-theme-composer.module.css:310-355`
- Test: `apps/customer-panel/components/settings/starter-retail-composer.test.mjs`

**Interfaces:**
- Consumes: the three immutable model helpers from Task 1.
- Produces: six labelled icon buttons with `aria-pressed`; controlled `Başlık` and `Açıklama` fields; compact preview cards; “Değer ekle” and per-card delete controls.

- [x] **Step 1: Write failing UI contract tests**

Assert the editor imports the six Lucide icons, renders icon buttons instead of the `Simge<select>` control, exposes `aria-pressed`, retains controlled heading/body `onChange` wiring through the model helper, uses the concise trust copy, and does not seed a marketing claim.

```js
for (const icon of ["Sparkles", "Leaf", "Heart", "ShieldCheck", "Truck", "RotateCcw"]) assert.match(source, new RegExp(icon));
assert.match(source, /aria-pressed/);
assert.doesNotMatch(source, /<label>Simge<select/);
assert.match(source, /Yalnızca mağazanızın gerçekten sunduğu avantajları yazın/);
```

- [x] **Step 2: Run the focused UI test and verify RED**

Run: `node --test apps/customer-panel/components/settings/starter-retail-composer.test.mjs`

Expected: FAIL because the editor still uses a text select and does not render Lucide icon choices.

- [x] **Step 3: Implement the minimal visual editor**

Import the existing Lucide icons and model helpers. Render a `<div role="group" aria-label="Simge seçimi">` containing six 44px-or-larger buttons. Each button shows the icon and its Turkish label, calls `updateStarterValueProposition`, and exposes its selected state through `aria-pressed` and a selected CSS class. Keep a local immutable value-section draft so fields can pass through an empty editing state; call the parent `update` only when `isStarterValuePropositionDraftPublishable` returns true.

- [x] **Step 4: Add responsive styling**

Create dedicated `valueCard`, `valuePreview`, `valueIconGrid`, `valueIconChoice`, `valueIconChoiceSelected`, `valueFields`, and `valueDelete` classes. Use a three-column icon grid on desktop, two columns on narrow widths, visible focus styles, and minimum 44×44 targets without changing unrelated editor styles.

- [x] **Step 5: Run focused tests and verify GREEN**

Run:

```bash
node --test apps/customer-panel/components/settings/starter-retail-composer.test.mjs
node --experimental-transform-types --test apps/customer-panel/lib/starter-theme-composer-model.test.ts
```

Expected: both focused suites PASS.

### Task 3: Regression verification

**Files:**
- Verify only; no new production files.

**Interfaces:**
- Consumes: completed model and visual editor.
- Produces: evidence that customer-panel and starter-theme composition remain valid.

- [x] **Step 1: Run customer-panel verification**

```bash
npm test --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/customer-panel
npm run build --workspace @celebix/customer-panel
```

Expected: all commands PASS.

- [x] **Step 2: Run repository hygiene checks**

```bash
git diff --check
git status --short
```

Expected: no whitespace errors; only the approved design/plan and value-editor implementation files are changed, plus the pre-existing untracked `.superpowers/` directory.

- [ ] **Step 3: Commit the independently reviewable feature**

```bash
git add docs/superpowers/specs/2026-08-08-visual-value-proposition-editor-design.md docs/superpowers/plans/2026-08-08-visual-value-proposition-editor.md apps/customer-panel/lib/starter-theme-composer-model.ts apps/customer-panel/lib/starter-theme-composer-model.test.ts apps/customer-panel/components/settings/StarterRetailSectionEditors.tsx apps/customer-panel/components/settings/starter-theme-composer.module.css apps/customer-panel/components/settings/starter-retail-composer.test.mjs
git commit -m "feat(storefront): simplify value proposition editor"
```
