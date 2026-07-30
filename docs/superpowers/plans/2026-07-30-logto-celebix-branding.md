# Celebix Logto Branding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply a reversible, responsive Celebix visual theme to the shared staging Logto authentication experience without changing authentication behavior.

**Architecture:** Keep Logto's built-in authentication UI and OIDC behavior. Store the reviewed CSS and its contract tests in the repository, then apply the same CSS plus supported logo/color/branding settings to the omni sign-in experience and verify the live target application in a real browser.

**Tech Stack:** Logto OSS sign-in experience, Logto custom CSS, SVG branding assets, Node.js test runner, Chrome browser verification, Coolify-hosted staging.

## Global Constraints

- Use Celebix orange `#FE6100`, pressed emphasis `#D95200`, primary text `#2B2B2B`, and canvas `#F4F4F8`.
- Apply the theme at omni level so sign-in, registration, recovery, verification, loading, and error screens share one fallback experience.
- Do not alter fields, sign-in methods, credential rules, callbacks, OIDC parameters, cookies, sessions, registration policy, or logout behavior.
- Do not inject JavaScript or HTML and do not expose credentials, tokens, tenant identifiers, or operational metadata.
- Preserve keyboard focus, native validation, loading, disabled, error, high-contrast, mobile, and compact-height behavior.
- Record the current live settings before mutation and keep rollback limited to the previous branding configuration.

---

## File map

- Create `deploy/logto/celebix-auth-theme.css`: source-controlled omni custom CSS applied verbatim to Logto.
- Create `tests/logto/celebix-auth-theme.test.mjs`: static contract for brand tokens, responsive behavior, focus visibility, selector scoping, and forbidden active content.
- Create `docs/operations/logto-celebix-branding.md`: supported apply, validation, and rollback runbook without secrets.
- Create `docs/operations/logto-celebix-branding-verification.md`: sanitized staging evidence and final outcome.

### Task 1: Source-controlled Celebix theme

**Files:**
- Create: `tests/logto/celebix-auth-theme.test.mjs`
- Create: `deploy/logto/celebix-auth-theme.css`

**Interfaces:**
- Consumes: Logto's `#app` root and structural/partial CSS-module class selectors.
- Produces: one standalone CSS string suitable for Logto's omni `customCss` value.

- [ ] **Step 1: Write the failing theme contract test**

Use `node:test` and `node:fs/promises` to load `deploy/logto/celebix-auth-theme.css`. Assert exact brand tokens, `#app` scoping, `:focus-visible`, `@media (max-width: 600px)`, minimum 48px controls, reduced-motion support, and the absence of `javascript:`, `<script`, `@import`, `data:`, credentials, or tenant/application identifiers.

- [ ] **Step 2: Run the contract and prove it fails before the CSS exists**

Run: `node --test tests/logto/celebix-auth-theme.test.mjs`  
Expected: FAIL with `ENOENT` for `deploy/logto/celebix-auth-theme.css`.

- [ ] **Step 3: Implement the standalone CSS**

Define Celebix variables under `#app`; style the page canvas, compact main surface, wordmark sizing, headings, controls, primary buttons, links, errors, disabled/loading states, focus-visible rings, mobile layout, compact-height layout, reduced motion, and forced-colors behavior. Use only structural selectors and partial class selectors supported by Logto CSS Modules.

- [ ] **Step 4: Run the contract and repository diff checks**

Run: `node --test tests/logto/celebix-auth-theme.test.mjs && git diff --check`  
Expected: PASS and no whitespace errors.

- [ ] **Step 5: Commit the theme**

```bash
git add deploy/logto/celebix-auth-theme.css tests/logto/celebix-auth-theme.test.mjs
git commit -m "feat(auth): add Celebix Logto theme"
```

### Task 2: Reversible staging operation

**Files:**
- Create: `docs/operations/logto-celebix-branding.md`

**Interfaces:**
- Consumes: `deploy/logto/celebix-auth-theme.css` and Logto's supported branding/custom CSS settings.
- Produces: an operator procedure that can apply or restore one complete branding configuration.

- [ ] **Step 1: Document the exact supported settings**

Record omni-level company logo, favicon, light brand color `#FE6100`, light-mode preference, hidden Logto branding, and the CSS source path. State that no container image, database schema, application callback, or authentication method is changed.

- [ ] **Step 2: Document rollback and redaction rules**

Require a pre-change read of the current branding values, in-memory or access-controlled snapshot handling, exact restoration of the previous configuration, and prohibition on committing tokens, credentials, raw configuration exports, user data, or secrets.

- [ ] **Step 3: Review the operation document**

Run: `rg -n "TODO|TBD|token|password|secret" docs/operations/logto-celebix-branding.md`  
Expected: only explicit redaction/prohibition language; no placeholder or secret value.

- [ ] **Step 4: Commit the runbook**

```bash
git add docs/operations/logto-celebix-branding.md
git commit -m "docs(auth): add Logto branding runbook"
```

### Task 3: Apply the approved theme to staging Logto

**Files:**
- Read: `deploy/logto/celebix-auth-theme.css`
- Read: `apps/customer-panel/public/Logo/celebix-koyu-logo.svg`
- Read: `docs/operations/logto-celebix-branding.md`

**Interfaces:**
- Consumes: the approved CSS and existing Celebix SVG asset.
- Produces: updated omni sign-in-experience branding for `auth.saas-staging.celebix.site` inherited by application `1n93icpphr11h4fmrup9w`.

- [ ] **Step 1: Capture the current branding configuration safely**

Read the current omni sign-in-experience values through the authenticated Logto Console or Management API. Keep the rollback snapshot out of terminal output, browser snapshots, logs, commits, and chat.

- [ ] **Step 2: Apply supported branding fields**

Set the existing Celebix dark SVG as the company logo, use a square Celebix favicon if already available, set brand color `#FE6100`, keep light mode, hide Logto branding, and set `customCss` to the exact repository CSS. Do not change any other field in the sign-in-experience payload.

- [ ] **Step 3: Confirm the public experience reflects the configuration**

Open `https://auth.saas-staging.celebix.site/sign-in?app_id=1n93icpphr11h4fmrup9w` in a fresh page and confirm the response is healthy and the visible UI uses the Celebix theme.

### Task 4: Browser verification and evidence

**Files:**
- Create: `docs/operations/logto-celebix-branding-verification.md`

**Interfaces:**
- Consumes: the live branded staging experience.
- Produces: sanitized verification evidence and a rollback decision.

- [ ] **Step 1: Verify desktop sign-in and registration presentation**

Check the target sign-in page and follow the public “Hesap Oluştur” link. Confirm logo, orange actions, form sizing, links, focus visibility, Turkish content, and absence of Logto branding without entering or submitting credentials.

- [ ] **Step 2: Verify responsive presentation**

Use browser viewport emulation for a narrow mobile width and a compact-height desktop. Confirm no horizontal overflow, full-width mobile controls, minimum touch sizes, readable errors, and no clipped actions.

- [ ] **Step 3: Verify the tenant redirect contract**

Open the existing Güzide tenant login and confirm its secure login action still redirects to the same Logto OIDC experience. Do not complete credential submission.

- [ ] **Step 4: Record sanitized evidence**

Write timestamp, tested public URLs, viewport classes, HTTP/DOM observations, and PASS/FAIL results. Do not record cookies, query state, nonce, PKCE, credentials, token values, or raw configuration.

- [ ] **Step 5: Run final checks and commit evidence**

Run: `node --test tests/logto/celebix-auth-theme.test.mjs && git diff --check && git status --short`  
Expected: theme test PASS, no diff errors, and only the verification document pending.

```bash
git add docs/operations/logto-celebix-branding-verification.md
git commit -m "docs(auth): verify Celebix Logto branding"
```
