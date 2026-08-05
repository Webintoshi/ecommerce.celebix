# Customer-panel Storefront Shortcut Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fail-closed “Mağazayı Gör” action to the customer-panel desktop topbar that opens only the authenticated store’s server-verified canonical storefront.

**Architecture:** Reuse the existing `PanelClientChromeModel.storefrontHostname` projection, which is produced from durable `TenantContext.resolvedHost` authority. `PanelTopbarUtilities` will render one external HTTPS link only when that optional projection exists; no new API, runtime query, hostname inference, or authority validator is introduced.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, CSS Modules, Node test runner, existing hook test harness, lucide-react.

## Global Constraints

- Base exact SHA: `3ad0fb78752bfd1a004e45a313cb0ebb803419cf`.
- Target application: `apps/customer-panel` only, plus design/plan documentation.
- The URL authority is only `PanelClientChromeModel.storefrontHostname` projected from `TenantContext.resolvedHost`.
- Do not use `Host`, `Origin`, forwarded headers, cookies, query parameters, `window.location`, `process.env`, store slug inference, or a new API.
- When `storefrontHostname` is absent, render no storefront shortcut.
- The link must be `https://<canonical-hostname>/`, open in a new tab, and use `rel="noopener noreferrer"`.
- Preserve a minimum 48 × 48 pixel interactive target and compact safely at narrow desktop widths.
- Do not modify `apps/admin`, Owner, storefront source, PostgreSQL migrations, production configuration, or credentials.
- Deploy only the Güzide customer-panel staging service after all local checks pass.

---

### Task 1: Prove canonical storefront-link behavior

**Files:**
- Modify: `apps/customer-panel/lib/panel-shell.test.ts:663-686`
- Modify: `apps/customer-panel/components/panel/PanelTopbarUtilities.tsx:3-51`

**Interfaces:**
- Consumes: `usePanelChromeModel(): PanelClientChromeModel` from `@/components/panel/PanelLayoutClient`.
- Consumes: `PanelClientChromeModel.storefrontHostname?: string`, already validated by `createPanelChromeModel`.
- Produces: an external anchor with `href`, `target`, `rel`, accessible name, icon, and visible label; produces no anchor when the hostname is absent.

- [ ] **Step 1: Add the failing component behavior test**

Add a hook-harness test that compiles `PanelTopbarUtilities.tsx` twice: once with `storefrontHostname: "pilot-store.celebix.site"` and once without it. Assert the first render contains exactly one anchor with:

```ts
assert.equal(storefrontLink.props.href, "https://pilot-store.celebix.site/");
assert.equal(storefrontLink.props.target, "_blank");
assert.equal(storefrontLink.props.rel, "noopener noreferrer");
assert.equal(storefrontLink.props["aria-label"], "Mağazayı Gör");
```

Assert the second render contains no element with `aria-label === "Mağazayı Gör"`. Mock only `next/image`, `next/link`, `lucide-react`, `react`, the chrome hook, `ToshiDrawer`, and the CSS module using the existing `compileHookTestComponent`/`createPanelInteractionHarness` pattern.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --experimental-strip-types --test --test-name-pattern='topbar opens only the server-projected canonical storefront' apps/customer-panel/lib/panel-shell.test.ts
```

Expected: FAIL because `PanelTopbarUtilities` does not render an element labelled `Mağazayı Gör`.

- [ ] **Step 3: Implement the minimal topbar link**

Update imports and the component:

```tsx
import { Bell, ExternalLink } from "lucide-react";
import { usePanelChromeModel } from "./PanelLayoutClient";

export function PanelTopbarUtilities() {
  const model = usePanelChromeModel();
  const storefrontHref = model.storefrontHostname
    ? `https://${model.storefrontHostname}/`
    : undefined;

  return (
    <div className={styles.desktopTopbarUtilities}>
      {storefrontHref ? (
        <a
          className={styles.topbarStorefrontLink}
          href={storefrontHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Mağazayı Gör"
        >
          <ExternalLink aria-hidden="true" />
          <span>Mağazayı Gör</span>
        </a>
      ) : null}
    </div>
  );
}
```

Insert the conditional anchor immediately before the existing notification `Link`; leave that notification link, the Toshi launcher, and `ToshiDrawer` byte-for-byte unchanged apart from any formatter-required import ordering.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the Step 2 command again.

Expected: `1` matching test passes, `0` failures.

- [ ] **Step 5: Verify the existing authority projection tests**

Run:

```bash
node --experimental-strip-types --test apps/customer-panel/lib/panel-ui/chrome-model.test.ts
```

Expected: all tests pass, including absence behavior and rejection of mismatched/ported host authority.

---

### Task 2: Add responsive and accessible presentation

**Files:**
- Modify: `apps/customer-panel/lib/panel-shell.test.ts:663-686`
- Modify: `apps/customer-panel/components/panel/panel-shell.module.css:153-175`

**Interfaces:**
- Consumes: `.topbarStorefrontLink` from `PanelTopbarUtilities`.
- Produces: a wide labelled action, a 48-pixel compact desktop action, visible focus state, and an icon that remains decorative to assistive technology.

- [ ] **Step 1: Add failing style/security assertions**

Extend the topbar test with assertions that the CSS contains a `.topbarStorefrontLink` rule with `min-width: 48px`, `min-height: 48px`, inline-flex alignment, and a narrow-desktop media rule hiding only `.topbarStorefrontLink span`. Also assert the utility source does not contain:

```ts
/window[.]location|process[.]env|headers\(|cookies\(|storeSlug|x-forwarded|\/api\//i
```

- [ ] **Step 2: Run the focused topbar test and verify RED**

Run:

```bash
node --experimental-strip-types --test --test-name-pattern='desktop topbar matches|topbar opens only' apps/customer-panel/lib/panel-shell.test.ts
```

Expected: FAIL because `.topbarStorefrontLink` styling and compact media behavior do not exist.

- [ ] **Step 3: Implement minimal CSS**

Add:

```css
.topbarStorefrontLink {
  display: inline-flex;
  min-width: 48px;
  min-height: 48px;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  border: 1px solid #DDE4ED;
  border-radius: 0.875rem;
  background: #FFFFFF;
  padding: 0 1rem;
  color: #344054;
  font-size: 0.8125rem;
  font-weight: 700;
  text-decoration: none;
}

.topbarStorefrontLink:focus-visible {
  outline: 0;
  box-shadow: 0 0 0 3px rgb(255 101 0 / 24%);
}

@media (min-width: 1025px) and (max-width: 1280px) {
  .topbarStorefrontLink {
    width: 48px;
    padding: 0;
  }

  .topbarStorefrontLink span {
    display: none;
  }
}
```

Keep the existing notification and Toshi CSS unchanged.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the Step 2 command again.

Expected: both matching topbar tests pass with `0` failures.

- [ ] **Step 5: Commit the complete feature**

```bash
git add apps/customer-panel/components/panel/PanelTopbarUtilities.tsx \
  apps/customer-panel/components/panel/panel-shell.module.css \
  apps/customer-panel/lib/panel-shell.test.ts \
  docs/superpowers/plans/2026-08-05-panel-storefront-shortcut.md
git commit -m "feat(customer-panel): add storefront shortcut"
```

---

### Task 3: Regression, publish, and isolated staging acceptance

**Files:**
- Verify only; no additional source file is expected.

**Interfaces:**
- Consumes: committed branch `codex/customer-panel-storefront-shortcut`.
- Produces: pushed exact SHA and one customer-panel staging deployment.

- [ ] **Step 1: Run the complete local verification matrix**

```bash
npm ci
npm test --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/customer-panel
npm run build --workspace @celebix/customer-panel
git diff --check
git status --short
```

Expected: customer-panel tests, typecheck, and build pass; diff check is clean; worktree has no uncommitted files.

- [ ] **Step 2: Run forbidden-authority and secret scans**

```bash
git diff 3ad0fb78752bfd1a004e45a313cb0ebb803419cf...HEAD -- \
  apps/customer-panel/components/panel apps/customer-panel/lib/panel-shell.test.ts \
  | rg -n 'TenantContext|principal|issuer|subject|storeId|membershipId|planId|domainId|requestId|cookie|token|x-forwarded|process[.]env|BEGIN (RSA|EC|OPENSSH) PRIVATE KEY'
```

Expected: no forbidden authority or secret match in the added shortcut implementation. Expected safe existing test assertions must be reviewed rather than counted as a finding.

- [ ] **Step 3: Push without rewriting history**

```bash
git push -u origin codex/customer-panel-storefront-shortcut
```

Expected: remote branch resolves to local `HEAD`.

- [ ] **Step 4: Deploy only Güzide customer-panel staging**

Update Coolify application id `99` to branch `codex/customer-panel-storefront-shortcut` and exact committed SHA, then queue one force rebuild. Do not deploy Owner, storefront, or production.

- [ ] **Step 5: Browser acceptance**

In the authenticated Güzide panel verify:

- the desktop upper panel displays **Mağazayı Gör**;
- its `href` is the exact verified Güzide storefront HTTPS root;
- it opens a new tab and the storefront returns a non-error page;
- no production or other tenant hostname appears;
- at 1025 pixels the compact icon remains at least 48 × 48 pixels;
- existing notification, page actions, Toshi, and design controls still work;
- customer-panel runtime logs contain no new error.

- [ ] **Step 6: Final evidence**

Report branch, SHA, changed files, RED/GREEN evidence, test totals, typecheck/build, remote parity, customer-panel-only deploy, browser URL proof, and production impact `0`.
