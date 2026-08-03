# Theme Composer Submenu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a simple horizontal second-level menu under `Tema düzeni` that exposes six focused settings panels without changing the theme data or persistence contract.

**Architecture:** A small presentational `StarterThemeSubnavigation` component owns accessible tab markup and labels. `StarterThemeComposer` owns the active panel state and conditionally renders the existing editor groups while preserving the single `StarterThemeEditorState`, preview, draft save, and publish flow.

**Tech Stack:** React 19, TypeScript 5.9, Next.js 16 App Router, CSS Modules, Node test runner, `react-dom/server`.

## Global Constraints

- Keep the existing `StarterThemeEditorState`, API calls, database schema, and composition format unchanged.
- Use these visible labels exactly: `Genel görünüm`, `Menü ve duyuru`, `Ana sayfa`, `Ürün sayfası`, `Sepet`, `Footer`.
- Default to `Genel görünüm`.
- Render only the selected settings group while preserving unsaved state in `StarterThemeComposer`.
- Keep preview, draft save, publish, loading, error, success, conflict, and read-only behavior unchanged.
- Use an open horizontal row, orange text and a thin orange underline; do not use boxes or cards for the submenu.
- Keep tabs on one row with horizontal scrolling on narrow screens.

---

### Task 1: Accessible Theme Subnavigation

**Files:**
- Create: `apps/customer-panel/components/settings/starter-theme-subnavigation-model.ts`
- Create: `apps/customer-panel/components/settings/starter-theme-subnavigation-model.test.ts`
- Create: `apps/customer-panel/components/settings/StarterThemeSubnavigation.tsx`
- Modify: `apps/customer-panel/components/settings/starter-theme-composer.module.css`

**Interfaces:**
- Produces: `ThemePanelKey`, `DEFAULT_THEME_PANEL`, `themeSubnavigationItems(activePanel)`, and `StarterThemeSubnavigation({ activePanel, onSelect })`.
- Consumes: the existing `starter-theme-composer.module.css` CSS module.

- [ ] **Step 1: Write the failing behavior test**

Create a Node test for a pure navigation model. It verifies the literal six labels and keys, stable tab/panel identifiers, and exactly one selected destination. The missing model must produce an assertion failure naming the missing submenu rather than an uncaught module error.

```ts
import assert from "node:assert/strict";
import test from "node:test";

test("theme submenu exposes six ordered destinations and one active panel", async () => {
  const module = await import("./starter-theme-subnavigation-model.ts").catch(() => null);
  assert.ok(module, "theme submenu model must exist");
  assert.deepEqual(module.themeSubnavigationItems("home"), [
    { key: "visual", label: "Genel görünüm", tabId: "starter-theme-tab-visual", panelId: "starter-theme-panel-visual", selected: false },
    { key: "navigation", label: "Menü ve duyuru", tabId: "starter-theme-tab-navigation", panelId: "starter-theme-panel-navigation", selected: false },
    { key: "home", label: "Ana sayfa", tabId: "starter-theme-tab-home", panelId: "starter-theme-panel-home", selected: true },
    { key: "product", label: "Ürün sayfası", tabId: "starter-theme-tab-product", panelId: "starter-theme-panel-product", selected: false },
    { key: "cart", label: "Sepet", tabId: "starter-theme-tab-cart", panelId: "starter-theme-panel-cart", selected: false },
    { key: "footer", label: "Footer", tabId: "starter-theme-tab-footer", panelId: "starter-theme-panel-footer", selected: false },
  ]);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
node --experimental-transform-types --test components/settings/starter-theme-subnavigation-model.test.ts
```

Expected: FAIL with `theme submenu model must exist` because the model file has not been created.

- [ ] **Step 3: Implement the minimal subnavigation**

Create the pure typed model in `starter-theme-subnavigation-model.ts`, then render native buttons from that model in `StarterThemeSubnavigation.tsx`:

```ts
export type ThemePanelKey = "visual" | "navigation" | "home" | "product" | "cart" | "footer";
export const DEFAULT_THEME_PANEL: ThemePanelKey = "visual";

const PANELS = Object.freeze([
  ["visual", "Genel görünüm"],
  ["navigation", "Menü ve duyuru"],
  ["home", "Ana sayfa"],
  ["product", "Ürün sayfası"],
  ["cart", "Sepet"],
  ["footer", "Footer"],
] as const);

export function themeSubnavigationItems(activePanel: ThemePanelKey) {
  return Object.freeze(PANELS.map(([key, label]) => Object.freeze({
    key,
    label,
    tabId: `starter-theme-tab-${key}`,
    panelId: `starter-theme-panel-${key}`,
    selected: activePanel === key,
  })));
}
```

```tsx
"use client";

import { themeSubnavigationItems, type ThemePanelKey } from "./starter-theme-subnavigation-model";
import styles from "./starter-theme-composer.module.css";

export function StarterThemeSubnavigation({ activePanel, onSelect }: Readonly<{
  activePanel: ThemePanelKey;
  onSelect: (panel: ThemePanelKey) => void;
}>) {
  return <nav className={styles.themeSubnav} aria-label="Tema düzeni bölümleri">
    <div role="tablist" aria-label="Tema düzeni alt menüsü">
      {themeSubnavigationItems(activePanel).map((item) => <button
        type="button"
        role="tab"
        id={item.tabId}
        aria-controls={item.panelId}
        aria-selected={item.selected}
        className={item.selected ? styles.themeSubnavActive : undefined}
        key={item.key}
        onClick={() => onSelect(item.key)}
      >{item.label}</button>)}
    </div>
  </nav>;
}
```

Add `themeSubnav` and `themeSubnavActive` CSS rules with `grid-column: 1 / -1`, `display:flex`, `flex-wrap:nowrap`, `overflow-x:auto`, transparent buttons, `border-bottom`, and orange active text/border.

- [ ] **Step 4: Run the test and verify GREEN**

Run the same Node test. Expected: PASS with one test and zero failures.

- [ ] **Step 5: Commit Task 1**

```bash
git add apps/customer-panel/components/settings/starter-theme-subnavigation-model.ts apps/customer-panel/components/settings/starter-theme-subnavigation-model.test.ts apps/customer-panel/components/settings/StarterThemeSubnavigation.tsx apps/customer-panel/components/settings/starter-theme-composer.module.css
git commit -m "feat(customer-panel): add theme submenu tabs"
```

### Task 2: Route Existing Theme Editors Through the Submenu

**Files:**
- Modify: `apps/customer-panel/components/settings/StarterThemeComposer.tsx`
- Modify: `apps/customer-panel/components/settings/StarterThemeComposer.test.ts`

**Interfaces:**
- Consumes: `ThemePanelKey`, `DEFAULT_THEME_PANEL`, and `StarterThemeSubnavigation` from Task 1.
- Preserves: `persist(status: SaveStatus)`, `StarterThemeEditorState`, `StarterThemePreview`, and all existing editor child component props.

- [ ] **Step 1: Write the failing integration contract test**

Add a focused test to `StarterThemeComposer.test.ts` that names the production break it catches: losing state ownership or rendering all long panels after adding the submenu. It must assert that the composer imports the submenu, owns `activePanel`, emits a `tabpanel` tied to the active tab, and guards each of the six existing groups by the corresponding panel key.

```ts
test("composer keeps one editor state while the submenu exposes one settings group", async () => {
  const value = await source("StarterThemeComposer.tsx");
  assert.match(value, /StarterThemeSubnavigation/);
  assert.match(value, /useState<ThemePanelKey>\(DEFAULT_THEME_PANEL\)/);
  assert.match(value, /role="tabpanel"/);
  for (const key of ["visual", "navigation", "home", "product", "cart", "footer"]) {
    assert.match(value, new RegExp(`activePanel === "${key}"`));
  }
  assert.equal((value.match(/useState<StarterThemeEditorState>/g) ?? []).length, 1);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
node --experimental-transform-types --test components/settings/StarterThemeComposer.test.ts
```

Expected: FAIL because `StarterThemeComposer` does not yet import or render the submenu.

- [ ] **Step 3: Implement panel routing without changing data flow**

In `StarterThemeComposer.tsx`:

1. Import `DEFAULT_THEME_PANEL`, `StarterThemeSubnavigation`, and `ThemePanelKey`.
2. Add `const [activePanel, setActivePanel] = useState<ThemePanelKey>(DEFAULT_THEME_PANEL);` next to existing local UI state.
3. Insert `<StarterThemeSubnavigation activePanel={activePanel} onSelect={setActivePanel} />` as the first child of the loaded form so it spans editor and preview columns.
4. Keep the notice, shared actions, state object, patch functions, and preview outside panel-specific ownership.
5. Render one `<section role="tabpanel" id={`starter-theme-panel-${activePanel}`} aria-labelledby={`starter-theme-tab-${activePanel}`}>` in the editor.
6. Move each unchanged editor group behind its exact key: visual system → `visual`; announcement/navigation → `navigation`; section list → `home`; product detail → `product`; cart → `cart`; footer → `footer`.
7. Do not add API calls to tab clicks and keep every submenu button `type="button"`.

- [ ] **Step 4: Run component tests and typecheck**

Run:

```bash
node --experimental-transform-types --test components/settings/starter-theme-subnavigation-model.test.ts components/settings/StarterThemeComposer.test.ts
npm run typecheck --workspace @celebix/customer-panel
```

Expected: all tests PASS and TypeScript exits 0.

- [ ] **Step 5: Commit Task 2**

```bash
git add apps/customer-panel/components/settings/StarterThemeComposer.tsx apps/customer-panel/components/settings/StarterThemeComposer.test.ts
git commit -m "feat(customer-panel): split theme settings into panels"
```

### Task 3: Production and Live Verification

**Files:**
- Modify only if verification finds a concrete defect in the files from Tasks 1-2.

**Interfaces:**
- Consumes: completed submenu and panel routing from Tasks 1-2.
- Produces: a deployed, visually verified theme submenu with no temporary QA data.

- [ ] **Step 1: Run repository checks**

```bash
git diff --check
node --experimental-transform-types --test apps/customer-panel/components/settings/starter-theme-subnavigation-model.test.ts apps/customer-panel/components/settings/StarterThemeComposer.test.ts
npm run build --workspace @celebix/customer-panel
```

Expected: all commands exit 0.

- [ ] **Step 2: Verify the UI locally or in the authenticated live panel**

Open `/settings/design?section=theme` and confirm:

- the six submenu labels are in one horizontal row;
- the active tab uses orange text and an underline without a surrounding card;
- only one settings group is visible;
- preview remains visible and sticky;
- desktop and narrow viewport layouts do not clip controls;
- changing an input, switching tabs, returning, saving, and reloading preserves the value.

- [ ] **Step 3: Deploy and verify the live commit**

Push the completed commits to `refs/heads/codex/guzide-staging-integration`, wait for Coolify deployment completion, verify the running container image tag matches the pushed commit, then repeat the authenticated live interaction test. Restore any reversible test value before handoff.

- [ ] **Step 4: Record final evidence**

Capture the final desktop implementation screenshot, inspect it with `view_image`, and record a five-point fidelity ledger covering submenu order, active state, open container model, editor/preview width, and narrow-screen overflow behavior.
