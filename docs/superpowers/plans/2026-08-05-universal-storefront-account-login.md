# Universal Storefront Account Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the approved low-copy adaptive-brand account login and verification experience once in the shared storefront so every existing and future store inherits it.

**Architecture:** Replace the ordinary storefront header/footer wrapper on authentication pages with one dedicated shared `AccountAuthShell`. The shell derives store branding from hostname-resolved `PublicStorefront` and `PublicStorefrontDesign`, while the existing client form and PostgreSQL-backed authentication routes retain all identity authority and security behavior.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.9, CSS Modules, `@celebix/saas-contracts`, Node test runner, Image Gen concepting, Browser/IAB QA, Coolify shared storefront deployment.

## Global Constraints

- The surface is category-neutral: no product imagery, store-specific campaign copy, sector language, galleries, benefit grids, or promotional claims.
- The visible initial copy is limited to store identity, `Hesabınız, alışverişiniz.`, `Giriş yap veya hesap oluştur`, `E-posta adresi`, `Bağlantı gönder`, `Şifre gerekmez`, and `Mağazaya dön`.
- Only the hostname-resolved store logo, display name, and published colors may vary by store.
- Guest checkout remains independent and must never redirect through account authentication.
- Existing CSP, exact-origin form authority, enumeration-safe response, `returnTo`, challenge, session, rate-limit, and cookie behavior must not weaken.
- The sent state shows a masked address; raw email must not enter logs, analytics, data attributes, or error envelopes.
- Desktop, 390 × 844, and 320 px layouts must remain usable without horizontal overflow.
- No new runtime dependency is allowed.
- Every behavior change starts with a failing test and ends with a focused commit.

---

## File Map

- Create `apps/storefront-shared/components/account/account-auth-branding.ts`: pure tenant-brand projection with logo fallback and safe theme metadata.
- Create `apps/storefront-shared/components/account/account-auth-branding.test.ts`: exact multi-store and fallback regression tests.
- Create `apps/storefront-shared/components/account/account-auth-view-model.ts`: presentation-only email masking.
- Create `apps/storefront-shared/components/account/account-auth-view-model.test.ts`: bounded masking cases.
- Create `apps/storefront-shared/components/account/AccountAuthShell.tsx`: dedicated category-neutral auth frame.
- Create `apps/storefront-shared/components/account/account-auth.module.css`: desktop/mobile/state presentation.
- Modify `apps/storefront-shared/components/account/AccountAuthForm.tsx`: low-copy email, sent, ticket, and code states.
- Modify `apps/storefront-shared/app/account/login/page.tsx`: render the shared auth shell without normal storefront header/footer.
- Modify `apps/storefront-shared/app/account/verify/page.tsx`: render ticket/code states in the same shell.
- Modify `apps/storefront-shared/components/account/account-ui.test.ts`: shared-shell, copy-budget, route, and responsive contracts.
- Modify `apps/storefront-shared/app/globals.css`: remove superseded global auth layout rules only.
- Modify `apps/storefront-shared/package.json`: include nested account component tests in the normal storefront test command.
- Add generated concept assets under `docs/superpowers/specs/assets/`: immutable desktop and mobile visual references used for fidelity QA.

---

### Task 1: Freeze the approved Image Gen production concept

**Files:**
- Create: `docs/superpowers/specs/assets/2026-08-05-universal-account-login-desktop.png`
- Create: `docs/superpowers/specs/assets/2026-08-05-universal-account-login-mobile.png`

**Interfaces:**
- Consumes: approved B direction in `.superpowers/brainstorm/44211-1785919066/content/adaptive-brand-complete-v3.html` and the copy reduction in the design spec.
- Produces: the exact desktop/mobile visual source of truth used by Tasks 3-6.

- [ ] **Step 1: Generate the complete desktop concept with Image Gen**

Use the installed `imagegen` skill and request one 1440 × 900 storefront account screen with this exact brief:

```text
Create a polished, production-feasible desktop e-commerce customer account login screen.
This is one universal white-label layout used by every store, not a jewelry or fashion page.
Use a 46/54 split: left is a flat adaptive store-primary-color brand panel, right is a true-white authentication panel.
Left panel contains only a generic sample logo mark, “MAĞAZA ADI”, “Hesabınız, alışverişiniz.” and “Mağazaya dön”.
Right panel contains only “Giriş yap veya hesap oluştur”, label “E-posta adresi”, one email input, primary button “Bağlantı gönder”, and “Şifre gerekmez”.
No product imagery, people, illustrations, gradients, cards, pills, badges, benefit lists, social login, promotional copy, campaign content, decorative dashboard chrome, or extra paragraphs.
Use a restrained abstract line/circle motif on the colored panel only.
Typography is modern sans-serif with excellent hierarchy and generous whitespace.
Controls and text are code-native; this image is the design reference, not a screenshot to ship.
```

- [ ] **Step 2: Generate the matching mobile concept**

Use the accepted desktop result as the reference and request an exact 390 × 844 continuation: a compact colored brand band above a white form, the same copy, and the primary input/action above the fold.

- [ ] **Step 3: Inspect both concept images**

Run `view_image` on both files. Reject and regenerate if either image introduces product imagery, excess copy, cards, non-white form background, clipped controls, unreadable text, or a different information order.

- [ ] **Step 4: Record design tokens in the implementation notes**

Extract: 46/54 desktop split, 36% maximum mobile brand band, 380 px maximum form width, 10 px control radius, 51 px desktop controls, 48 px mobile minimum controls, true-white form surface, published primary color brand surface, black-or-white contrast foreground, and 180-220 ms restrained transitions.

- [ ] **Step 5: Commit the approved reference assets**

```bash
git add docs/superpowers/specs/assets/2026-08-05-universal-account-login-desktop.png docs/superpowers/specs/assets/2026-08-05-universal-account-login-mobile.png
git commit -m "docs(storefront): add universal account login concept"
```

---

### Task 2: Add exact shared tenant-brand projection

**Files:**
- Create: `apps/storefront-shared/components/account/account-auth-branding.ts`
- Create: `apps/storefront-shared/components/account/account-auth-branding.test.ts`
- Modify: `apps/storefront-shared/package.json`

**Interfaces:**
- Consumes: `PublicStorefront` and `PublicStorefrontDesign` from `@celebix/saas-contracts`.
- Produces: `resolveAccountAuthBranding(storefront, design): AccountAuthBranding` with `{ displayName, logo, publicationVersion, primaryColor, brandForeground, accentColor, backgroundColor, textColor, fontFamily, themeClasses }`.

- [ ] **Step 1: Write failing multi-store branding tests**

```ts
test("account branding uses each resolved store without cross-store fallback", () => {
  const first = resolveAccountAuthBranding(storeA, designA);
  const second = resolveAccountAuthBranding(storeB, designB);
  assert.equal(first.displayName, "Mağaza A");
  assert.equal(first.primaryColor, "#2457D6");
  assert.equal(first.brandForeground, "#FFFFFF");
  assert.equal(first.logo?.url, "https://media.example/a.png");
  assert.equal(second.displayName, "Mağaza B");
  assert.equal(second.primaryColor, "#B42318");
  assert.equal(second.logo?.url, "https://media.example/b.png");
  assert.notDeepEqual(first, second);
});

test("account branding falls back from published logo to presentation logo and name", () => {
  assert.equal(resolveAccountAuthBranding(withPresentationLogo, designWithoutLogo).logo?.url, "https://media.example/presentation.png");
  assert.equal(resolveAccountAuthBranding(withoutAnyLogo, designWithoutLogo).logo, null);
});
```

- [ ] **Step 2: Run the focused test and confirm the missing module failure**

Run:

```bash
NODE_OPTIONS='--conditions=react-server' node --experimental-transform-types --test apps/storefront-shared/components/account/account-auth-branding.test.ts
```

Expected: FAIL because `account-auth-branding.ts` does not exist.

- [ ] **Step 3: Implement the immutable projection**

```ts
export type AccountAuthBranding = Readonly<{
  displayName: string;
  logo: Readonly<{ url: string; altText: string; width: number; height: number }> | null;
  publicationVersion: number;
  primaryColor: string;
  brandForeground: "#000000" | "#FFFFFF";
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  fontFamily: PublicStorefrontDesign["brand"]["fontFamily"];
  themeClasses: string;
}>;
```

Use `starterThemeTokens(storefront.presentation)` for fallback classes. When `publicationVersion > 1`, use the published design colors and logo; otherwise use presentation logo plus existing starter theme tokens. Compute `brandForeground` by parsing the bounded hex primary color, converting sRGB channels to relative luminance, comparing black and white WCAG contrast ratios, and selecting the higher-ratio color. Never read hostname, slug, ID, logo URL, or colors from search params, cookies, or client storage.

- [ ] **Step 4: Include nested account tests in the package test command**

Add `components/account/*.test.ts` after `components/*.test.ts` in `apps/storefront-shared/package.json` without changing dependencies.

- [ ] **Step 5: Run focused and package-script discovery tests**

Run:

```bash
NODE_OPTIONS='--conditions=react-server' node --experimental-transform-types --test apps/storefront-shared/components/account/account-auth-branding.test.ts
npm test --workspace @celebix/storefront-shared -- --test-name-pattern='account branding'
```

Expected: PASS and the nested test appears in the package run.

- [ ] **Step 6: Commit**

```bash
git add apps/storefront-shared/components/account/account-auth-branding.ts apps/storefront-shared/components/account/account-auth-branding.test.ts apps/storefront-shared/package.json
git commit -m "feat(storefront): resolve shared account branding"
```

---

### Task 3: Build the dedicated low-copy account shell

**Files:**
- Create: `apps/storefront-shared/components/account/AccountAuthShell.tsx`
- Modify: `apps/storefront-shared/app/account/login/page.tsx`
- Modify: `apps/storefront-shared/app/account/verify/page.tsx`
- Modify: `apps/storefront-shared/components/account/account-ui.test.ts`

**Interfaces:**
- Consumes: `resolveAccountAuthBranding`, hostname-resolved `storefront`, published `design`, a short `title`, and form children.
- Produces: `AccountAuthShell({ storefront, design, title, children }): JSX.Element` and identical shell semantics on login/verification pages.

- [ ] **Step 1: Rewrite the source contract as a failing test**

Replace the old benefits/480 px assertions with:

```ts
test("account entry uses one category-neutral adaptive brand shell", async () => {
  const shell = await source("components/account/AccountAuthShell.tsx");
  const login = await source("app/account/login/page.tsx");
  const verify = await source("app/account/verify/page.tsx");
  assert.match(shell, /resolveAccountAuthBranding/u);
  assert.match(shell, /Hesabınız, alışverişiniz[.]/u);
  assert.match(shell, /Mağazaya dön/u);
  assert.match(login, /Giriş yap veya hesap oluştur/u);
  assert.match(login, /AccountAuthShell/u);
  assert.match(verify, /AccountAuthShell/u);
  assert.doesNotMatch(login, /Siparişlerinizi takip edin|Adreslerinizi saklayın|Favorilerinize/u);
  assert.doesNotMatch(login, /StorefrontFrame/u);
  assert.doesNotMatch(shell, /product|campaign|gallery|kuyum|Güzide/iu);
});
```

- [ ] **Step 2: Run and confirm the contract fails**

Run:

```bash
NODE_OPTIONS='--conditions=react-server' node --experimental-transform-types --test apps/storefront-shared/components/account/account-ui.test.ts
```

Expected: FAIL because `AccountAuthShell.tsx` is missing and old copy is present.

- [ ] **Step 3: Implement `AccountAuthShell`**

The component must:

```tsx
<div className={`${styles.shell} starter-storefront ${branding.themeClasses}`} data-published-design={branding.publicationVersion > 1 ? "true" : "false"} style={style}>
  <section className={styles.brandPanel}>
    <StoreIdentity branding={branding} />
    <p className={styles.brandLine}>Hesabınız, alışverişiniz.</p>
    <Link href="/" className={styles.backLink}>Mağazaya dön</Link>
  </section>
  <main className={styles.formPanel}>
    <div className={styles.formContent}>
      <h1>{title}</h1>
      {children}
    </div>
  </main>
</div>
```

Set the exact existing `--store-primary`, `--store-accent`, `--store-background`, and `--store-text` CSS variables plus `--account-brand-ink` only from the resolved brand projection. Set `data-font` from the projection. Render the bounded logo with `object-fit: contain`; otherwise render the display name as text.

- [ ] **Step 4: Move both pages to the dedicated shell**

Login passes title `Giriş yap veya hesap oluştur` and the email form. Verification passes title `Güvenli giriş` and the existing ticket/code form. Remove permanent intro paragraphs, eyebrow labels, benefits, and footnotes. Keep `safeAccountReturnTo`, `resolveStorefrontPage`, metadata, and `force-dynamic` unchanged.

- [ ] **Step 5: Run the focused test and typecheck**

```bash
NODE_OPTIONS='--conditions=react-server' node --experimental-transform-types --test apps/storefront-shared/components/account/account-ui.test.ts
npm run typecheck --workspace @celebix/storefront-shared
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/storefront-shared/components/account/AccountAuthShell.tsx apps/storefront-shared/app/account/login/page.tsx apps/storefront-shared/app/account/verify/page.tsx apps/storefront-shared/components/account/account-ui.test.ts
git commit -m "feat(storefront): add adaptive account auth shell"
```

---

### Task 4: Compact and harden client authentication states

**Files:**
- Create: `apps/storefront-shared/components/account/account-auth-view-model.ts`
- Create: `apps/storefront-shared/components/account/account-auth-view-model.test.ts`
- Modify: `apps/storefront-shared/components/account/AccountAuthForm.tsx`
- Modify: `apps/storefront-shared/components/account/account-ui.test.ts`

**Interfaces:**
- Consumes: the existing `mode`, `returnTo`, ticket, start endpoint, and browser verification form route.
- Produces: `maskAccountEmail(value: string): string`, compact initial/sent/ticket/code states, and unchanged secure route semantics.

- [ ] **Step 1: Write failing masking tests**

```ts
test("account email masking never renders the complete address", () => {
  assert.equal(maskAccountEmail("ada@example.com"), "ad***@example.com");
  assert.equal(maskAccountEmail("a@example.com"), "a***@example.com");
  assert.equal(maskAccountEmail("invalid"), "***");
  assert.equal(maskAccountEmail(""), "***");
});
```

- [ ] **Step 2: Add failing source assertions for compact copy and unchanged routes**

```ts
assert.match(auth, /Bağlantı gönder/u);
assert.match(auth, /E-postanı kontrol et/u);
assert.match(auth, /Şifre gerekmez/u);
assert.match(auth, /maskAccountEmail/u);
assert.match(auth, /method="post" action="\/api\/account\/auth\/verify-browser"/u);
assert.doesNotMatch(auth, /Siparişlerinizi|Adreslerinizi|Favorilerinize|Güzide|kuyum/iu);
```

- [ ] **Step 3: Run and confirm both focused tests fail**

```bash
node --experimental-transform-types --test apps/storefront-shared/components/account/account-auth-view-model.test.ts
NODE_OPTIONS='--conditions=react-server' node --experimental-transform-types --test apps/storefront-shared/components/account/account-ui.test.ts
```

- [ ] **Step 4: Implement bounded masking and compact states**

`maskAccountEmail` trims, splits on the last `@`, preserves at most two local-part characters, never returns the complete source, and returns `***` for malformed values.

Update the form without changing the POST payload or routes:

- initial CTA: `Bağlantı gönder`;
- trust line: `Şifre gerekmez`;
- sent heading: `E-postanı kontrol et`;
- sent recipient: `maskAccountEmail(email)`;
- secondary actions: resend countdown and `E-postayı değiştir`;
- ticket CTA: `Devam et`;
- fallback summary: `Kod ile giriş`;
- code CTA: `Giriş yap`.

Keep email `type`, `autocomplete`, `inputMode`, one-time-code attributes, live status, busy guards, resend timer cleanup, exact hidden fields, and server-owned form POSTs.

- [ ] **Step 5: Run focused tests**

```bash
node --experimental-transform-types --test apps/storefront-shared/components/account/account-auth-view-model.test.ts
NODE_OPTIONS='--conditions=react-server' node --experimental-transform-types --test apps/storefront-shared/components/account/account-ui.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/storefront-shared/components/account/account-auth-view-model.ts apps/storefront-shared/components/account/account-auth-view-model.test.ts apps/storefront-shared/components/account/AccountAuthForm.tsx apps/storefront-shared/components/account/account-ui.test.ts
git commit -m "feat(storefront): compact account authentication states"
```

---

### Task 5: Implement faithful responsive styling

**Files:**
- Create: `apps/storefront-shared/components/account/account-auth.module.css`
- Modify: `apps/storefront-shared/components/account/AccountAuthShell.tsx`
- Modify: `apps/storefront-shared/components/account/AccountAuthForm.tsx`
- Modify: `apps/storefront-shared/app/globals.css`
- Modify: `apps/storefront-shared/components/account/account-ui.test.ts`

**Interfaces:**
- Consumes: accepted Image Gen concept, shared shell DOM, form states, existing design CSS variables.
- Produces: 46/54 desktop split, compact mobile band, accessible controls, sent/verify states, and reduced-motion support.

- [ ] **Step 1: Add failing CSS contract assertions**

```ts
const authCss = await source("components/account/account-auth.module.css");
assert.match(authCss, /grid-template-columns:\s*minmax\(0,\s*46fr\)\s+minmax\(0,\s*54fr\)/u);
assert.match(authCss, /var\(--store-primary/u);
assert.match(authCss, /min-height:\s*44px/u);
assert.match(authCss, /@media\s*\(max-width:\s*760px\)/u);
assert.match(authCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)/u);
assert.doesNotMatch(authCss, /url\(|product|gallery/iu);
```

- [ ] **Step 2: Run and confirm the missing CSS module failure**

```bash
NODE_OPTIONS='--conditions=react-server' node --experimental-transform-types --test apps/storefront-shared/components/account/account-ui.test.ts
```

- [ ] **Step 3: Implement the desktop system from the accepted concept**

Use a full-height `.shell`, `46fr 54fr` split, primary-color `.brandPanel`, true-white `.formPanel`, a maximum 380 px form column, code-native typography, 10 px controls, 51-56 px desktop field/button height, restrained line/circle decoration using pseudo-elements, and no nested card wrapper.

- [ ] **Step 4: Implement mobile and compact-height behavior**

At `max-width: 760px`, switch to rows with a brand band no taller than 36svh and a white form below. At 320 px width preserve 18 px side gutters. Add a short-height media query so the form aligns from the top instead of clipping. Keep every primary target at least 44 px.

- [ ] **Step 5: Implement state, focus, error, and reduced-motion styles**

Use `:focus-visible`, `aria-live` status spacing, disabled opacity without hiding labels, masked-address wrapping, six-code input stability, `--account-brand-ink` from the tested black/white contrast projection, and `prefers-reduced-motion: reduce` to remove transitions.

- [ ] **Step 6: Remove only superseded auth globals**

Delete `.account-auth-layout`, `.account-auth-intro`, `.account-auth-benefits`, `.account-auth-form`, `.account-auth-sent`, `.account-auth-verify`, and their mobile overrides from `globals.css`. Do not alter account dashboard, order, profile, address, security, checkout, header, or footer styles.

- [ ] **Step 7: Run focused tests, typecheck, and build**

```bash
NODE_OPTIONS='--conditions=react-server' node --experimental-transform-types --test apps/storefront-shared/components/account/*.test.ts
npm run typecheck --workspace @celebix/storefront-shared
npm run build --workspace @celebix/storefront-shared
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/storefront-shared/components/account/account-auth.module.css apps/storefront-shared/components/account/AccountAuthShell.tsx apps/storefront-shared/components/account/AccountAuthForm.tsx apps/storefront-shared/app/globals.css apps/storefront-shared/components/account/account-ui.test.ts
git commit -m "style(storefront): finish universal account login"
```

---

### Task 6: Full regression, visual fidelity, and interaction verification

**Files:**
- Modify only if a discovered regression requires an in-scope fix.
- Remove temporary QA files before commit/handoff.

**Interfaces:**
- Consumes: Tasks 1-5.
- Produces: full automated evidence, desktop/mobile screenshots, fidelity ledger, and verified login/logout behavior.

- [ ] **Step 1: Run the complete storefront gates**

```bash
npm test --workspace @celebix/storefront-shared
npm test --workspace @celebix/saas-contracts
npm run typecheck --workspace @celebix/storefront-shared
npm run typecheck --workspace @celebix/saas-contracts
npm run build --workspace @celebix/storefront-shared
git diff --check
```

Expected: all PASS.

- [ ] **Step 2: Audit security-sensitive diffs**

```bash
git diff 871217cc..HEAD -- apps/storefront-shared | rg 'unsafe-inline|form-action \*|https:|storeId|tenantId|localStorage|sessionStorage|window.location.assign|rawEmail|ticket.*console|code.*console' || true
```

Expected: no weakened CSP, client tenant authority, credential persistence, or sensitive logging.

- [ ] **Step 3: Start/inspect the production build with Browser/IAB first**

Open `/account/login`, inspect the current viewport, then test 1440 × 900, 390 × 844, and 320 px widths. Verify no overflow, clipped primary action, duplicated storefront header/footer, excess copy, product imagery, or unthemed control.

- [ ] **Step 4: Verify the complete authentication flow**

On `https://guzide-kuyumcu-4.saas-staging.celebix.site`:

1. submit a real permitted test email;
2. verify the compact sent state and masked address;
3. verify resend countdown and change-email action;
4. follow the newest email ticket;
5. confirm the ticket POST reaches `/account`;
6. log out and confirm `/account/login`;
7. sign in again using the six-digit fallback;
8. confirm the validated return path is honored;
9. open guest checkout and confirm it remains guest-capable.

- [ ] **Step 5: Compare concept and implementation directly**

Capture the latest browser render to an absolute PNG path. Use `view_image` on the accepted desktop concept, accepted mobile concept, desktop render, and mobile render. Write a fidelity ledger covering at least copy, split proportions, typography, palette, logo treatment, control geometry, whitespace, mobile order, and state transitions. Fix every non-intentional mismatch.

- [ ] **Step 6: Run above-the-fold copy and tenant-isolation checks**

Assert the initial page contains only the approved visible strings plus the resolved store identity. Render two fixture stores with different logo/color documents through `resolveAccountAuthBranding`; confirm outputs differ and neither includes the other's identity. Confirm unknown host remains fail-closed through the existing resolver suite.

- [ ] **Step 7: Commit any verification fixes**

```bash
git add apps/storefront-shared
git commit -m "fix(storefront): close account login visual regressions"
```

Skip the commit only when `git status --short` shows no in-scope changes.

---

### Task 7: Publish the shared storefront release

**Files:**
- No source file changes expected.

**Interfaces:**
- Consumes: the exact verified source SHA from Task 6.
- Produces: one healthy Coolify shared storefront deployment inherited by existing and future storefront hosts.

- [ ] **Step 1: Confirm exact publish scope**

```bash
git status --short
git log -8 --oneline
git diff 871217cc..HEAD --stat
```

Expected: only the approved spec/plan/concept and `apps/storefront-shared` account presentation changes; `.superpowers/` remains untracked and is not committed.

- [ ] **Step 2: Push the exact verified SHA to the staging integration refs**

Push without force to `codex/storefront-unified-theme-authority` and `codex/guzide-staging-integration`. Rebase only if the remote advanced, then rerun Task 6 gates on the rebased SHA.

- [ ] **Step 3: Deploy the shared storefront application**

Trigger Coolify application `vtc2aah63jbqnmtxmvykn6jl` using stored credentials without printing them. Record the deployment UUID and exact image/source SHA.

- [ ] **Step 4: Verify live health and shared inheritance**

Require healthy deployment state, `/health` 200, exact `/account/login` 200 on `guzide-kuyumcu-4.saas-staging.celebix.site`, unknown wildcard host fail-closed, and no relevant browser console/network errors.

- [ ] **Step 5: Repeat live desktop/mobile visual and login/logout acceptance**

Use Browser/IAB first. Capture final live desktop/mobile screenshots, compare with `view_image`, repeat the real ticket login, logout, and second login, and leave the live login page open for the user.

- [ ] **Step 6: Final evidence**

Report the accepted concept paths, final render paths, Browser/IAB method, tested viewport sizes, automated counts, exact commit SHA, deployment UUID, live URL, five-or-more fidelity checks, copy diff result, core interaction result, and any intentional deviations. State explicitly whether material mismatches remain.
