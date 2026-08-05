# Storefront Header Layout Personalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four durable, merchant-selectable desktop header arrangements to the starter theme while retaining one canonical navigation tree and the fixed accessible mobile header.

**Architecture:** Extend the existing schema-v2 visual contract with a finite `headerLayout` value that defaults to `centered` for legacy inputs and is projected into public schema v3. The customer-panel editor patches that single immutable field and previews it, while `CampaignHeader` projects it to one `data-header-layout` attribute and CSS grid areas rearrange the existing semantic header tree.

**Tech Stack:** TypeScript 5.9, React 19, Next.js 16 App Router, CSS Modules, Node test runner, npm workspaces.

## Global Constraints

- Keep `apps/admin/**` byte-for-byte unchanged.
- Do not add dependencies, migrations, infrastructure, DNS, credentials, Owner changes, production changes, or a second header implementation.
- Preserve the canonical navigation tree, existing publication boundary, overlay/solid behavior, logo controls, utilities, mega menu, mobile drawer, focus handling, and the `1024px` mobile breakpoint.
- Do not derive header authority from request headers, hostname fragments, cookies, query parameters, local storage, breakpoints, or DOM input.
- Invalid explicit values fail closed; missing legacy values normalize to `centered`.
- Deploy only isolated staging customer-panel and shared storefront from one exact pushed SHA after local verification.

---

### Task 1: Version the finite header-layout contract

**Files:**
- Modify: `packages/saas-contracts/src/storefront/types.ts:11-32`
- Modify: `packages/saas-contracts/src/storefront/validation.ts:18-27,214-228`
- Modify: `packages/saas-contracts/src/storefront/presentation.ts:20-52,97-118`
- Modify: `packages/saas-contracts/src/storefront-design/defaults.ts:1-14`
- Modify: `packages/saas-contracts/src/storefront/index.ts:15`
- Modify: `packages/saas-contracts/src/index.ts:445-473`
- Modify: all existing `StarterThemeVisualV2` fixtures reported by TypeScript under `packages/saas-contracts/src/**/*.test.ts`
- Test: `packages/saas-contracts/src/storefront/campaign-starter.test.ts:93-115,185-205`
- Test: `packages/saas-contracts/src/storefront/retail-presentation.test.ts`

**Interfaces:**
- Produces: `StarterThemeHeaderLayout = "centered" | "logo_left" | "logo_top" | "menu_top"`.
- Produces: required `StarterThemeVisualV2.headerLayout: StarterThemeHeaderLayout` after parsing.
- Guarantees: missing legacy input becomes `centered`; an explicit unknown value throws `TypeError("storefront_contract_invalid")`.

- [ ] **Step 1: Write failing contract tests**

Add literal assertions that exercise the real parser and projection:

```ts
test("retail composition defaults legacy header layout and accepts four bounded selections", () => {
  const legacy = createDefaultStarterThemeComposition();
  const withoutLayout = { ...legacy, visual: { ...legacy.visual } };
  delete (withoutLayout.visual as { headerLayout?: string }).headerLayout;
  const parsedLegacy = campaignValidation.parseStarterThemeCompositionConfig(withoutLayout);
  assert.equal((parsedLegacy.visual as { headerLayout: string }).headerLayout, "centered");

  for (const headerLayout of ["centered", "logo_left", "logo_top", "menu_top"] as const) {
    const parsed = campaignValidation.parseStarterThemeCompositionConfig({
      ...legacy,
      visual: { ...legacy.visual, headerLayout },
    });
    assert.equal((parsed.visual as { headerLayout: string }).headerLayout, headerLayout);
  }

  for (const headerLayout of ["", "Logo_left", " logo_left", "logo-left", "freeform"]) {
    assert.throws(() => campaignValidation.parseStarterThemeCompositionConfig({
      ...legacy,
      visual: { ...legacy.visual, headerLayout },
    }), /storefront_contract_invalid/);
  }
});
```

Extend default and legacy-presentation assertions with the hand-derived literal `"centered"`.

- [ ] **Step 2: Run the focused contract tests and verify RED**

Run:

```bash
node --experimental-strip-types --test \
  packages/saas-contracts/src/storefront/campaign-starter.test.ts \
  packages/saas-contracts/src/storefront/retail-presentation.test.ts
```

Expected: FAIL because parsed visual values do not yet expose `headerLayout` and defaults do not contain it.

- [ ] **Step 3: Implement the minimal finite contract**

Add the type and field:

```ts
export type StarterThemeHeaderLayout =
  | "centered"
  | "logo_left"
  | "logo_top"
  | "menu_top";

export type StarterThemeVisualV2 = Readonly<StarterThemeVisual & {
  headerWidth: "contained" | "wide";
  sectionSpacing: "compact" | "balanced" | "airy";
  logoSize: StarterThemeLogoSize;
  logoAlignment: StarterThemeLogoAlignment;
  headerLayout: StarterThemeHeaderLayout;
}>;
```

Parse only the finite values and preserve legacy compatibility:

```ts
const HEADER_LAYOUTS = Object.freeze([
  "centered", "logo_left", "logo_top", "menu_top",
] as const);

const parsed = exact(value, REQUIRED_VISUAL_KEYS, [
  "logoSize", "logoAlignment", "headerLayout",
]);

headerLayout: Object.hasOwn(parsed, "headerLayout")
  ? oneOf(parsed.headerLayout, HEADER_LAYOUTS)
  : "centered",
```

Add `headerLayout: "centered"` to new-store defaults, V1/V2 adapters, and every typed fixture; export `StarterThemeHeaderLayout` from both public indices.

- [ ] **Step 4: Run focused and workspace contract tests and verify GREEN**

Run:

```bash
node --experimental-strip-types --test \
  packages/saas-contracts/src/storefront/campaign-starter.test.ts \
  packages/saas-contracts/src/storefront/retail-presentation.test.ts
npm test --workspace @celebix/saas-contracts
npm run typecheck --workspace @celebix/saas-contracts
```

Expected: all contract tests and typecheck PASS; no fixture omits the required canonical field.

- [ ] **Step 5: Commit the contract slice**

```bash
git add packages/saas-contracts
git commit -m "feat(storefront): add header layout contract"
```

---

### Task 2: Add the merchant control and truthful preview

**Files:**
- Modify: `apps/customer-panel/lib/starter-theme-composer-model.ts:39-55,139-148`
- Modify: `apps/customer-panel/lib/starter-theme-composer-model.test.ts:27-61,132-151,183-200`
- Modify: `apps/customer-panel/components/settings/StarterThemeComposer.tsx:215-229`
- Modify: `apps/customer-panel/components/settings/StarterThemePreview.tsx:72-119`
- Modify: `apps/customer-panel/components/settings/starter-theme-preview.module.css:182-225` and mobile rules near the end of the file
- Test: `apps/customer-panel/components/settings/StarterThemeComposer.test.ts:24-52,73-90`

**Interfaces:**
- Consumes: `StarterThemeEditorState["visual"]["headerLayout"]` from Task 1.
- Produces: one `Header yerleşimi` select that patches only `visual.headerLayout`.
- Produces: `data-header-layout={previewHeaderLayout}` on the existing preview header.

- [ ] **Step 1: Write failing model and UI tests**

Add real normalization assertions:

```ts
test("composer preserves every bounded header layout", () => {
  for (const headerLayout of ["centered", "logo_left", "logo_top", "menu_top"] as const) {
    const input = state();
    const value = buildStarterThemeComposition({
      ...input,
      visual: { ...input.visual, headerLayout },
    });
    assert.equal(value.visual.headerLayout, headerLayout);
  }
});
```

Extend the editor/preview source behavior test to require these exact labels and values:

```ts
for (const label of [
  "Header yerleşimi", "Ortalı klasik", "Logo solda",
  "Logo üstte, menü altta", "Menü üstte, logo altta",
]) assert.match(composer, new RegExp(label));

assert.match(preview, /data-header-layout=\{previewHeaderLayout\}/);
```

- [ ] **Step 2: Run focused customer-panel tests and verify RED**

Run:

```bash
node --experimental-transform-types --test \
  apps/customer-panel/lib/starter-theme-composer-model.test.ts \
  apps/customer-panel/components/settings/StarterThemeComposer.test.ts
```

Expected: FAIL because the editor state, selector, preview attribute, and layout CSS are absent.

- [ ] **Step 3: Implement the minimal editor and preview**

Default and upgrade with `headerLayout: "centered"`. Add the controlled select:

```tsx
<label>Header yerleşimi
  <select
    value={state.visual.headerLayout}
    onChange={(event) => patch({
      visual: {
        ...state.visual,
        headerLayout: event.currentTarget.value as StarterThemeEditorState["visual"]["headerLayout"],
      },
    })}
  >
    <option value="centered">Ortalı klasik</option>
    <option value="logo_left">Logo solda</option>
    <option value="logo_top">Logo üstte, menü altta</option>
    <option value="menu_top">Menü üstte, logo altta</option>
  </select>
</label>
```

Project the selection into the existing preview header:

```tsx
const previewHeaderLayout = composition.schemaVersion === 2
  ? composition.visual.headerLayout
  : "centered";

<header
  className={styles.previewNav}
  data-header-layout={previewHeaderLayout}
  data-logo-alignment={previewLogoAlignment}
  data-logo-size={previewLogoSize}
>
```

Use CSS grid areas on `.previewNav`; for `logo_top` and `menu_top` add a compact second row. In `.mobile .previewNav`, reset every layout to `"logo cart"`, hide the desktop preview nav, and prevent horizontal overflow.

- [ ] **Step 4: Run focused tests and customer-panel typecheck and verify GREEN**

Run:

```bash
node --experimental-transform-types --test \
  apps/customer-panel/lib/starter-theme-composer-model.test.ts \
  apps/customer-panel/components/settings/StarterThemeComposer.test.ts
npm run typecheck --workspace @celebix/customer-panel
```

Expected: focused tests and typecheck PASS; the disabled fieldset still controls the new select.

- [ ] **Step 5: Commit the customer-panel slice**

```bash
git add apps/customer-panel/lib/starter-theme-composer-model.ts \
  apps/customer-panel/lib/starter-theme-composer-model.test.ts \
  apps/customer-panel/components/settings/StarterThemeComposer.tsx \
  apps/customer-panel/components/settings/StarterThemePreview.tsx \
  apps/customer-panel/components/settings/starter-theme-preview.module.css \
  apps/customer-panel/components/settings/StarterThemeComposer.test.ts
git commit -m "feat(customer-panel): configure header layout"
```

---

### Task 3: Render four layouts with one storefront header tree

**Files:**
- Modify: `apps/storefront-shared/components/CampaignHeader.tsx:10-87`
- Modify: `apps/storefront-shared/components/CampaignHeaderClient.tsx:26-149`
- Modify: `apps/storefront-shared/components/campaign-header.module.css:1-9`
- Test: `apps/storefront-shared/components/CampaignHeader.test.ts:7-39`

**Interfaces:**
- Consumes: `StarterThemeHeaderLayout` and public schema-v3 `presentation.visual.headerLayout`.
- Produces: `headerLayout` prop on `CampaignHeaderClient` and `data-header-layout` on the existing `.container`.
- Guarantees: schema-v2 uses `centered`; mobile at `max-width:1024px` ignores desktop layout selection.

- [ ] **Step 1: Write failing storefront layout tests**

Add a focused behavior/security test:

```ts
test("published presentation selects four desktop layouts on one canonical header tree", async () => {
  const [server, client, css] = await Promise.all([
    read("CampaignHeader.tsx"),
    read("CampaignHeaderClient.tsx"),
    read("campaign-header.module.css"),
  ]);
  assert.match(server, /presentation[.]visual[.]headerLayout/);
  assert.match(server, /: "centered"/);
  assert.match(client, /data-header-layout=\{headerLayout\}/);
  assert.equal((client.match(/\{desktopNavigation\}/g) ?? []).length, 1);
  for (const layout of ["centered", "logo_left", "logo_top", "menu_top"]) {
    assert.match(css, new RegExp(`data-header-layout="${layout}"`));
  }
  assert.doesNotMatch(`${server}\n${client}`, /process[.]env|localStorage|sessionStorage|document[.]cookie|x-forwarded|storeId|tenantId/);
});
```

Extend the responsive test to require a `max-width:1024px` reset for layout-specific rows and the existing `48px` controls.

- [ ] **Step 2: Run the focused storefront test and verify RED**

Run:

```bash
NODE_OPTIONS='--conditions=react-server' node --experimental-transform-types --test \
  apps/storefront-shared/components/CampaignHeader.test.ts
```

Expected: FAIL because no `headerLayout` prop, data attribute, or four layout rules exist.

- [ ] **Step 3: Implement the minimal single-tree storefront projection**

Forward only the durable public value:

```tsx
<CampaignHeaderClient
  headerLayout={presentation.schemaVersion === 3
    ? presentation.visual.headerLayout
    : "centered"}
  // existing props remain unchanged
/>
```

Type and project it without branching the DOM:

```tsx
import type {
  PublicStarterNavigation,
  StarterThemeHeaderLayout,
} from "@celebix/saas-contracts";

<div className={styles.container} data-header-layout={headerLayout}>
  {desktopNavigation}
  <Link className={styles.wordmark} href="/">…</Link>
  <div className={styles.actions}>…</div>
</div>
```

Assign the existing nodes to grid areas and define all four arrangements:

```css
.desktopNav{grid-area:nav}
.wordmark{grid-area:logo}
.actions{grid-area:actions}
.container[data-header-layout="centered"]{grid-template-areas:"nav logo actions"}
.container[data-header-layout="logo_left"]{grid-template-areas:"logo nav actions"}
.container[data-header-layout="logo_top"]{grid-template-areas:". logo actions" "nav nav nav"}
.container[data-header-layout="menu_top"]{grid-template-areas:"nav nav actions" ". logo ."}
```

Bound two-row heights, anchor the mega menu below the complete bar, and reset all layouts inside the existing mobile media query to `grid-template-areas:"logo actions"`; keep the desktop nav hidden and targets at least `48x48px`.

- [ ] **Step 4: Run focused and workspace storefront tests and verify GREEN**

Run:

```bash
NODE_OPTIONS='--conditions=react-server' node --experimental-transform-types --test \
  apps/storefront-shared/components/CampaignHeader.test.ts
npm test --workspace @celebix/storefront-shared
npm run typecheck --workspace @celebix/storefront-shared
```

Expected: all storefront tests and typecheck PASS with one desktop navigation render and unchanged mobile drawer behavior.

- [ ] **Step 5: Commit the storefront slice**

```bash
git add apps/storefront-shared/components/CampaignHeader.tsx \
  apps/storefront-shared/components/CampaignHeaderClient.tsx \
  apps/storefront-shared/components/campaign-header.module.css \
  apps/storefront-shared/components/CampaignHeader.test.ts
git commit -m "feat(storefront): render configurable header layouts"
```

---

### Task 4: Complete regression, accessibility, scope, and release verification

**Files:**
- Modify only if a test exposes a defect: files already listed in Tasks 1-3.
- Verify: entire branch diff from `2ecc5c33734d3aa6b46b6649af05dfb34f702042`.

**Interfaces:**
- Consumes: completed finite contract, editor projection, and storefront CSS layout.
- Produces: a clean pushed branch suitable for isolated staging deployment.

- [ ] **Step 1: Run complete workspace verification**

Run:

```bash
npm test --workspace @celebix/saas-contracts
npm run typecheck --workspace @celebix/saas-contracts
npm test --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/customer-panel
npm run build --workspace @celebix/customer-panel
npm test --workspace @celebix/storefront-shared
npm run typecheck --workspace @celebix/storefront-shared
npm run build --workspace @celebix/storefront-shared
git diff --check
```

Expected: all commands PASS with pristine output.

- [ ] **Step 2: Run authority, dependency, scope, and secret scans**

Run:

```bash
test -z "$(git diff --name-only 2ecc5c33734d3aa6b46b6649af05dfb34f702042...HEAD -- apps/admin)"
git diff --name-only 2ecc5c33734d3aa6b46b6649af05dfb34f702042...HEAD
git diff 2ecc5c33734d3aa6b46b6649af05dfb34f702042...HEAD -- \
  packages/saas-contracts apps/customer-panel apps/storefront-shared | \
  rg -n 'process[.]env|localStorage|sessionStorage|document[.]cookie|x-forwarded|tenantId|storeId|BEGIN (RSA|OPENSSH|EC) PRIVATE KEY|api[_-]?key|client[_-]?secret' || true
git diff -- package.json package-lock.json
```

Expected: `apps/admin/**` diff count `0`; no dependency churn; no browser authority or secret introduced.

- [ ] **Step 3: Perform local visual acceptance**

Start the verified local storefront and inspect `1440x900`, `1025x768`, `1024x768`, `390x844`, and `320x720`. For each desktop value verify exact logo/nav/utility placement, one canonical navigation tree, mega-menu access, and overlay/solid behavior. At mobile widths verify the common compact header, drawer Escape/backdrop/close behavior, focus restoration, at least `48x48px` targets, zero horizontal overflow, and approximately `0.01ms` reduced-motion transitions.

- [ ] **Step 4: Run final branch verification and push normally**

Run:

```bash
git status --short
git log --oneline 2ecc5c33734d3aa6b46b6649af05dfb34f702042..HEAD
git push origin codex/customer-panel-storefront-shortcut
git rev-parse HEAD
git rev-parse origin/codex/customer-panel-storefront-shortcut
```

Expected: clean worktree and exact local/remote SHA parity; no force-push.

- [ ] **Step 5: Keep deployment as the final isolated gate**

Deploy only the isolated staging customer-panel and shared storefront from the exact pushed SHA. Repeat the viewport matrix against the durable published layout, restore the merchant's original layout after evidence collection, and confirm Owner/storefront production deploys, production mutations, migrations, and merges remain `0`.
