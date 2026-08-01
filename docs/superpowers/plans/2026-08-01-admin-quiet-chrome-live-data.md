# Admin Quiet Chrome and Live Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove duplicate admin headings and filler descriptions, move truthful dashboard context into the shared top bar, and fix badge/search-control wrapping for every tenant.

**Architecture:** Extend the existing top-bar bridge with a context portal independent from action commands. Keep `PanelPageHeader` as the route-facing compatibility API while making it chrome-only, and derive dashboard context directly from the existing storefront and analytics runtime state.

**Tech Stack:** Next.js 16, React 19, TypeScript, CSS Modules, Node test runner, existing panel hook harness.

## Global Constraints

- The fixed top bar is the only visible route identity.
- Generic page descriptions must not render in the content body.
- Dashboard channel, freshness, period, and timestamp must come from current tenant/API state.
- No fake verification state, timestamp, or metric may be introduced.
- Existing tenant isolation, API authority, accessibility labels, focus rings, and 48-pixel targets must remain unchanged.
- Changes apply through shared components to every tenant, including Güzide Kuyumcu.

---

## File Map

- `apps/customer-panel/components/panel/PanelTopbarChrome.tsx`: top-bar state publication and independent context/action portals.
- `apps/customer-panel/components/panel/PanelLayoutClient.tsx`: shared context host in the fixed shell.
- `apps/customer-panel/components/panel/PanelPageShell.tsx`: chrome-only page-header compatibility primitive and shared badge markup.
- `apps/customer-panel/components/panel/panel-shell.module.css`: responsive top-bar context layout and non-wrapping badges.
- `apps/customer-panel/components/dashboard/PanelDashboardHomeView.tsx`: live dashboard context content and removal of the body toolbar.
- `apps/customer-panel/components/dashboard/panel-dashboard.module.css`: compact top-bar context styling and mobile behavior.
- `apps/customer-panel/components/orders/quick-order-links.module.css`: search icon/padding correction.
- `apps/customer-panel/lib/panel-shell.test.ts`: shell, bridge, dashboard-state, and shared-style regression coverage.
- `apps/customer-panel/lib/quick-link-ui/client.test.ts`: quick-order search-field source/style regression coverage.

---

### Task 1: Make Page Identity Chrome-Only

**Files:**
- Modify: `apps/customer-panel/components/panel/PanelPageShell.tsx`
- Modify: `apps/customer-panel/components/panel/panel-shell.module.css`
- Test: `apps/customer-panel/lib/panel-shell.test.ts`

**Interfaces:**
- Consumes: `PanelTopbarBridge({ title, subtitle, actions })`.
- Produces: `PanelPageHeader(props)` that publishes chrome but renders no visible content heading.

- [ ] **Step 1: Write the failing shell regression test**

Add a source assertion that the page header returns only the bridge and that the shared styles no longer rely on the broken desktop cascade:

```ts
test("page headers publish one route identity without duplicate content copy", async () => {
  const pageShell = await source("components/panel/PanelPageShell.tsx");
  assert.match(pageShell, /return <PanelTopbarBridge title=\{props[.]title\}/);
  assert.doesNotMatch(pageShell, /<header className=\{styles[.]pageHeader\}/);
  assert.doesNotMatch(pageShell, /<h1>\{props[.]title\}<\/h1>/);
  assert.doesNotMatch(pageShell, /<p>\{props[.]description\}<\/p>/);
});
```

- [ ] **Step 2: Run the targeted test and verify failure**

Run:

```bash
node --experimental-transform-types --test --test-name-pattern="page headers publish one route identity" apps/customer-panel/lib/panel-shell.test.ts
```

Expected: FAIL because `PanelPageHeader` still emits a visible `<header>`, `<h1>`, and description.

- [ ] **Step 3: Implement the chrome-only primitive**

Replace the fragment and content header in `PanelPageHeader` with:

```tsx
return (
  <PanelTopbarBridge
    title={props.title}
    subtitle={props.description}
    actions={props.actions}
  />
);
```

Remove unused `.pageHeader` and `.pageActions` rules after checking that no direct consumer remains.

- [ ] **Step 4: Run the targeted test and type check**

Run:

```bash
node --experimental-transform-types --test --test-name-pattern="page headers publish one route identity" apps/customer-panel/lib/panel-shell.test.ts
npm --prefix apps/customer-panel run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit the page-identity slice**

```bash
git add apps/customer-panel/components/panel/PanelPageShell.tsx apps/customer-panel/components/panel/panel-shell.module.css apps/customer-panel/lib/panel-shell.test.ts
git commit -m "fix(admin): keep page identity in shared topbar"
```

### Task 2: Add an Independent Responsive Top-Bar Context Portal

**Files:**
- Modify: `apps/customer-panel/components/panel/PanelTopbarChrome.tsx`
- Modify: `apps/customer-panel/components/panel/PanelLayoutClient.tsx`
- Modify: `apps/customer-panel/components/panel/panel-shell.module.css`
- Test: `apps/customer-panel/lib/panel-shell.test.ts`

**Interfaces:**
- Extends: `PanelTopbarChromeState` with `readonly context?: ReactNode`.
- Produces: DOM host `#panel-topbar-context` and independent portals for `context` and `actions`.
- Preserves: published snapshot `{ title, subtitle }`; React nodes never enter route-state storage.

- [ ] **Step 1: Write the failing portal and layout assertions**

Extend the top-bar test with:

```ts
assert.match(topbar, /readonly context[?]: ReactNode/);
assert.match(topbar, /panel-topbar-context/);
assert.match(layout, /id="panel-topbar-context"/);
assert.match(styles, /[.]desktopTopbarContext/);
```

Keep the existing assertion proving actions/context are not published inside the serializable chrome snapshot.

- [ ] **Step 2: Run the targeted top-bar tests and verify failure**

```bash
node --experimental-transform-types --test --test-name-pattern="topbar chrome|desktop topbar" apps/customer-panel/lib/panel-shell.test.ts
```

Expected: FAIL because the context host and property do not exist.

- [ ] **Step 3: Implement the context portal**

Add `context?: ReactNode` to `PanelTopbarChromeState`. Replace the action-specific target hook with a parameterized host lookup:

```tsx
function useTopbarTarget(id: "panel-topbar-actions" | "panel-topbar-context") {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    let frame = window.requestAnimationFrame(() => setTarget(document.getElementById(id)));
    const observer = new MutationObserver(() => setTarget(document.getElementById(id)));
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [id]);
  return target;
}
```

In `PanelTopbarBridge`, portal `state.context` to `panel-topbar-context` and actions to `panel-topbar-actions`, while continuing to publish only title/subtitle.

Add the context host between the heading and command regions:

```tsx
<div id="panel-topbar-context" className={styles.desktopTopbarContext} />
```

Update CSS so the top bar is a responsive grid with a flexible title, flexible context, and fixed command region. Below the wide breakpoint, context spans a second row and may horizontally scroll without overlapping utilities.

- [ ] **Step 4: Run route-transition and portal tests**

```bash
node --experimental-transform-types --test --test-name-pattern="topbar chrome|desktop topbar|route transitions" apps/customer-panel/lib/panel-shell.test.ts
npm --prefix apps/customer-panel run typecheck
```

Expected: PASS, with route title precedence unchanged.

- [ ] **Step 5: Commit the context-host slice**

```bash
git add apps/customer-panel/components/panel/PanelTopbarChrome.tsx apps/customer-panel/components/panel/PanelLayoutClient.tsx apps/customer-panel/components/panel/panel-shell.module.css apps/customer-panel/lib/panel-shell.test.ts
git commit -m "feat(admin): add live context to shared topbar"
```

### Task 3: Move Dashboard Runtime Context into the Top Bar

**Files:**
- Modify: `apps/customer-panel/components/dashboard/PanelDashboardHomeView.tsx`
- Modify: `apps/customer-panel/components/dashboard/panel-dashboard.module.css`
- Test: `apps/customer-panel/lib/panel-shell.test.ts`

**Interfaces:**
- Consumes: `analyticsState`, `analytics.generatedAt`, current `period`, `onPeriodChange`, and storefront status.
- Produces: a `context` React node passed to `PanelTopbarBridge`.

- [ ] **Step 1: Write failing dashboard-state assertions**

Update dashboard rendering tests to require the live labels:

```ts
assert.match(loading, /Güncelleniyor/);
assert.match(rendered, />Canlı</);
assert.match(failed, /Veri alınamadı/);
assert.match(rendered, /Son güncelleme/);
assert.doesNotMatch(rendered, /Kalıcı verilere göre/);
```

Add a source assertion that the body-level `summaryToolbar` is absent and `context={` is supplied to the bridge.

- [ ] **Step 2: Run dashboard tests and verify failure**

```bash
node --experimental-transform-types --test --test-name-pattern="dashboard presentation" apps/customer-panel/lib/panel-shell.test.ts
```

Expected: FAIL because the old fixed phrase and body toolbar remain.

- [ ] **Step 3: Derive honest freshness copy**

Use a local derivation with no stored duplicate state:

```ts
const freshness = analyticsState === "loaded" && analytics
  ? "Canlı"
  : analyticsState === "loading"
    ? "Güncelleniyor"
    : analyticsState === "error"
      ? "Veri alınamadı"
      : "Veri bekleniyor";
```

Move channel, period selector, freshness, and conditional `generatedAt` time into a compact context node passed to `PanelTopbarBridge`. Remove the old `summaryToolbar` from the page body. Preserve the existing period callback and accessible labels.

- [ ] **Step 4: Style context states and responsive density**

Rename the body-toolbar styles to context-specific classes. Use compact 36-40 pixel controls inside the top bar while keeping the select itself accessible and avoiding clipped text. Use `white-space: nowrap`; allow the surrounding host to scroll at narrow widths.

- [ ] **Step 5: Run dashboard tests and type check**

```bash
node --experimental-transform-types --test --test-name-pattern="dashboard presentation" apps/customer-panel/lib/panel-shell.test.ts
npm --prefix apps/customer-panel run typecheck
```

Expected: PASS for loading, ready, error, verified, and pending storefront states.

- [ ] **Step 6: Commit the live dashboard slice**

```bash
git add apps/customer-panel/components/dashboard/PanelDashboardHomeView.tsx apps/customer-panel/components/dashboard/panel-dashboard.module.css apps/customer-panel/lib/panel-shell.test.ts
git commit -m "feat(dashboard): move live state into topbar"
```

### Task 4: Fix Shared Badge and Search-Icon Geometry

**Files:**
- Modify: `apps/customer-panel/components/panel/panel-shell.module.css`
- Modify: `apps/customer-panel/components/orders/quick-order-links.module.css`
- Test: `apps/customer-panel/lib/panel-shell.test.ts`
- Test: `apps/customer-panel/lib/quick-link-ui/client.test.ts`

**Interfaces:**
- Produces: one-line shared status badges and an icon-safe quick-order search field.

- [ ] **Step 1: Write failing CSS-contract assertions**

```ts
assert.match(styles, /[.]status-success[\s\S]*?white-space:\s*nowrap/);
assert.match(quickOrderStyles, /[.]console [.]searchField input[\s\S]*?padding-left:\s*2[.]5rem/);
```

The second selector intentionally outranks the later generic `.console input` rule.

- [ ] **Step 2: Run targeted tests and verify failure**

```bash
node --experimental-transform-types --test --test-name-pattern="page shell|quick order" apps/customer-panel/lib/panel-shell.test.ts apps/customer-panel/lib/quick-link-ui/client.test.ts
```

Expected: FAIL because badges permit wrapping and generic input padding wins.

- [ ] **Step 3: Implement geometry fixes**

Add `line-height: 1; white-space: nowrap;` to the shared badge/status rule. Change the search padding rule to:

```css
.console .searchField input {
  padding-left: 2.5rem;
}
```

Keep the icon absolutely positioned, vertically centered, and pointer-inert.

- [ ] **Step 4: Run targeted tests and type check**

```bash
node --experimental-transform-types --test --test-name-pattern="page shell|quick order" apps/customer-panel/lib/panel-shell.test.ts apps/customer-panel/lib/quick-link-ui/client.test.ts
npm --prefix apps/customer-panel run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit the control-geometry slice**

```bash
git add apps/customer-panel/components/panel/panel-shell.module.css apps/customer-panel/components/orders/quick-order-links.module.css apps/customer-panel/lib/panel-shell.test.ts apps/customer-panel/lib/quick-link-ui/client.test.ts
git commit -m "fix(admin): prevent control text collisions"
```

### Task 5: Full Verification and Deployment

**Files:**
- Verify only; do not commit screenshots or temporary QA scripts.

**Interfaces:**
- Target admin: `https://guzide-kuyumcu-4.admin.saas-staging.celebix.site/`.
- Target flows: dashboard live context, orders status, quick-order product search, and a route previously showing a duplicate heading.

- [ ] **Step 1: Run the complete customer-panel suite**

```bash
npm --prefix apps/customer-panel test
npm --prefix apps/customer-panel run typecheck
npm --prefix apps/customer-panel run build
```

Expected: all tests pass, type checking succeeds, and Next.js build completes.

- [ ] **Step 2: Review the React changes**

Run the React best-practices review on the modified TSX files. Fix any actionable correctness, rendering, or performance issue and rerun the targeted tests.

- [ ] **Step 3: Browser verification before deployment**

Using the Browser plugin, verify page identity, non-blank content, no framework overlay, console health, desktop screenshot, mobile screenshot, and period-selector interaction. Confirm:

- no duplicated route heading or generic description;
- top-bar live context changes with period loading/ready state;
- no two-line `Teslim edildi` badge;
- no icon/text collision in `Ürün ara…`;
- no horizontal page overflow.

- [ ] **Step 4: Commit any final verified correction and push**

```bash
git status --short
git push origin codex/guzide-staging-integration
```

Expected: clean worktree and the remote branch contains the exact verified commit.

- [ ] **Step 5: Deploy the exact commit to customer and owner applications**

Queue both Coolify applications with the exact Git SHA rather than an unpinned branch deployment. Wait until both report the same image revision and HTTP 200 health.

- [ ] **Step 6: Browser verification after deployment**

Repeat the desktop/mobile flow on the live Güzide admin. Capture final screenshots outside the repository, inspect the user reference and final screenshots with `view_image`, and verify at least copy, page hierarchy, top-bar layout, badge wrapping, search alignment, responsive behavior, console health, and interaction state.
