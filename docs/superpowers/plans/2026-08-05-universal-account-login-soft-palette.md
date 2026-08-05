# Universal Account Login Soft Palette Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Soften the universal storefront account login palette while preserving its approved layout and all passwordless behavior.

**Architecture:** Keep the existing tenant branding projection, React markup, and account routes unchanged. Implement the revision entirely inside the locally scoped account CSS module, with source assertions that lock the 14% brand surface, neutral CTA, quieter type scale, and unchanged responsive boundaries.

**Tech Stack:** Next.js 16, React 19, TypeScript, CSS Modules, Node test runner, Coolify shared storefront deployment

## Global Constraints

- Brand surface is exactly 14% published primary color mixed into `#f7f7f5`.
- Brand copy is neutral near-black.
- Primary action is `#171717` with white text.
- Direct tenant primary color is used only for motif lines, focus rings, trust mark, and confirmation state; the large surface uses only the 14% derived tint.
- Visible copy, markup, tenant resolution, account routes, cookies, tickets, sessions, and guest checkout do not change.
- Desktop remains 46/54; mobile remains stacked and safe at 390 × 844 and 320 × 568.

---

### Task 1: Soften the locally scoped authentication palette

**Files:**
- Modify: `apps/storefront-shared/components/account/account-ui.test.ts`
- Modify: `apps/storefront-shared/components/account/account-auth.module.css`

**Interfaces:**
- Consumes: existing CSS module classes imported by `AccountAuthShell.tsx` and `AccountAuthForm.tsx`
- Produces: the same CSS module class names with softer presentation; no TypeScript or route interface changes

- [ ] **Step 1: Write the failing palette assertions**

Add these assertions to the responsive account-auth CSS test:

```ts
assert.match(css, /--auth-brand-surface:\s*color-mix\(in srgb, var\(--store-primary\) 14%, #f7f7f5\)/u);
assert.match(css, /background:\s*var\(--auth-brand-surface\)/u);
assert.match(css, /\.primaryButton\s*\{[^}]*background:\s*#171717[^}]*color:\s*#fff/su);
assert.match(css, /font-size:\s*clamp\(46px, 6\.3vw, 88px\)/u);
assert.doesNotMatch(css, /\.brand\s*\{[^}]*background:\s*var\(--store-primary\)/su);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
NODE_OPTIONS='--conditions=react-server' node --experimental-transform-types --test --test-name-pattern='responsive accessible and locally scoped' apps/storefront-shared/components/account/account-ui.test.ts
```

Expected: FAIL because the current panel still uses the full primary color and the current CTA is tenant-colored.

- [ ] **Step 3: Implement the minimal CSS revision**

Make only these presentation changes in `account-auth.module.css`:

```css
.brand {
  --auth-brand-surface: color-mix(in srgb, var(--store-primary) 14%, #f7f7f5);
  background: var(--auth-brand-surface);
  color: #171717;
}

.brand::before,
.brand::after {
  border-color: color-mix(in srgb, var(--store-primary) 34%, transparent);
}

.brandMessage p {
  font-size: clamp(46px, 6.3vw, 88px);
}

.panelInner h1 {
  font-size: clamp(30px, 3.5vw, 40px);
}

.primaryButton {
  border-color: #171717;
  background: #171717;
  color: #fff;
}
```

Reduce the mobile brand statement maximum from `54px` to `48px`. Preserve the current breakpoints, dimensions, copy, class names, and focus-ring use of `--store-primary`.

- [ ] **Step 4: Run focused tests and typecheck**

Run:

```bash
NODE_OPTIONS='--conditions=react-server' node --experimental-transform-types --test apps/storefront-shared/components/account/account-ui.test.ts apps/storefront-shared/components/account/account-auth-branding.test.ts apps/storefront-shared/components/account/account-auth-view-model.test.ts
npm run typecheck --workspace @celebix/storefront-shared
git diff --check
```

Expected: all account tests pass, typecheck exits 0, and diff check reports nothing.

- [ ] **Step 5: Commit the presentation change**

```bash
git add apps/storefront-shared/components/account/account-ui.test.ts apps/storefront-shared/components/account/account-auth.module.css
git commit -m "style(storefront): soften account login palette"
```

### Task 2: Verify and publish the shared storefront revision

**Files:**
- Verify only: `apps/storefront-shared`
- Deploy: Coolify application `vtc2aah63jbqnmtxmvykn6jl`

**Interfaces:**
- Consumes: exact committed integration SHA from Task 1
- Produces: the same SHA on both staging branches and the healthy shared storefront deployment

- [ ] **Step 1: Run full automated verification**

```bash
npm test --workspace @celebix/storefront-shared
npm test --workspace @celebix/saas-contracts
npm run typecheck --workspace @celebix/storefront-shared
npm run typecheck --workspace @celebix/saas-contracts
npm run build --workspace @celebix/storefront-shared
git diff --check 86b52267..HEAD
```

Expected: zero test failures, both typechecks exit 0, build succeeds, and diff check reports nothing.

- [ ] **Step 2: Push the exact verified SHA without force**

```bash
git push origin HEAD:refs/heads/codex/storefront-unified-theme-authority HEAD:refs/heads/codex/guzide-staging-integration
```

Expected: both branches fast-forward to the same local `HEAD`.

- [ ] **Step 3: Deploy and verify live**

Redeploy Coolify application `vtc2aah63jbqnmtxmvykn6jl`, verify the running commit equals local `HEAD`, and confirm `/health` returns:

```json
{"status":"ok","service":"storefront-shared"}
```

- [ ] **Step 4: Complete visual and functional browser QA**

Verify the live `/account/login` page at desktop, 390 × 844, and 320 × 568. Confirm pale tenant-derived panel color, black CTA, unchanged copy, no horizontal overflow, no console errors, real magic-link login/logout, code login/second logout, and unauthenticated `/checkout` access.
