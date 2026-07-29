# Celebix Registration Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the stretched `/kayit` presentation with a Celebix-branded, two-column, responsive registration page while preserving the existing registration behavior.

**Architecture:** Keep `SelfServeDirectRegistrationForm` as the sole owner of form state and submission behavior. Change the server-rendered page shell to introduce a semantic left registration region and right promotional `aside`, then scope all new layout and visual rules under `.self-serve-register-page` so other self-serve screens are unaffected.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, global CSS, Node test runner.

## Global Constraints

- Use the existing `/branding/celebix-logo.svg` production asset.
- The right-panel headline is exactly `Ücretsiz E-Ticaret Yolculuğunu Başlat`.
- Do not add monetary or unverified campaign claims.
- Preserve the existing registration API, validation, slug suggestion, password toggle, consent, error, and success behavior.
- Form-first document order must remain intact on mobile.
- Do not add new runtime dependencies.

---

### Task 1: Registration page structure and content

**Files:**
- Modify: `apps/owner/app/kayit/page.test.ts`
- Modify: `apps/owner/app/kayit/page.tsx`

**Interfaces:**
- Consumes: `SelfServeDirectRegistrationForm({ flags })`, `getSelfServeFeatureFlags()`, and `/branding/celebix-logo.svg`.
- Produces: `.self-serve-register-shell`, `.self-serve-register-main`, and `.self-serve-register-promo` DOM regions for the scoped CSS in Task 2.

- [ ] **Step 1: Write the failing page contract test**

Add a test that names the user-visible break it catches: removal of the approved Celebix promotional region from the registration page.

```ts
test("/kayit includes the approved Celebix promotional region", () => {
  assert.match(pageSource, /self-serve-register-shell/);
  assert.match(pageSource, /self-serve-register-promo/);
  assert.match(pageSource, /Ücretsiz/);
  assert.match(pageSource, /E-Ticaret Yolculuğunu Başlat/);
  assert.match(pageSource, /KOBİ(?:'|&apos;)lerin yanında/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test apps/owner/app/kayit/page.test.ts`

Expected: one failure in `/kayit includes the approved Celebix promotional region` because the new shell and promotional copy do not exist; the four existing tests remain green.

- [ ] **Step 3: Implement the semantic two-column page shell**

Keep the existing feature-flag decision and form invocation. Wrap the left content in `.self-serve-register-main`, and add this sibling promotional region after it:

```tsx
<aside className="self-serve-register-promo" aria-labelledby="self-serve-register-promo-title">
  <span className="self-serve-register-promo-badge">Celebix <i /> KOBİ&apos;lerin yanında</span>
  <div className="self-serve-register-visual" aria-hidden="true">
    <span className="self-serve-register-visual-orbit" />
    <div className="self-serve-register-store-card">
      <span className="self-serve-register-store-mark">C</span>
      <span className="self-serve-register-store-line is-wide" />
      <span className="self-serve-register-store-line" />
      <span className="self-serve-register-store-action">Mağazan hazır</span>
    </div>
  </div>
  <div className="self-serve-register-promo-copy">
    <p>Ücretsiz</p>
    <h2 id="self-serve-register-promo-title">E-Ticaret Yolculuğunu Başlat</h2>
    <span>Mağazanı dakikalar içinde oluştur, ürünlerini eklemeye başla.</span>
  </div>
</aside>
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --test apps/owner/app/kayit/page.test.ts`

Expected: five tests pass and zero fail.

- [ ] **Step 5: Commit the structural change**

```bash
git add apps/owner/app/kayit/page.test.ts apps/owner/app/kayit/page.tsx
git commit -m "feat(owner): add Celebix registration promo layout"
```

### Task 2: Scoped responsive visual system

**Files:**
- Modify: `apps/owner/app/globals.css:5591-5640`

**Interfaces:**
- Consumes: the class names produced by Task 1 and the existing `.self-serve-direct-*` form markup.
- Produces: desktop two-column layout at widths above `1100px`, single-column layout below `1100px`, and mobile form stacking below `640px`.

- [ ] **Step 1: Add scoped desktop layout styles**

Append a readable `/* Celebix registration page */` block after the current direct registration styles. The block must set:

```css
.self-serve-register-page {
  min-height: 100vh;
  padding: 16px;
  background: #fff;
}

.self-serve-register-shell {
  width: min(1560px, 100%);
  margin: 0 auto;
  display: grid;
  grid-template-columns: minmax(0, 0.98fr) minmax(440px, 1.02fr);
  gap: 18px;
  align-items: start;
}
```

Style the left region with a centered `680px` content width, compact header, typography, and form controls. Override only descendants of `.self-serve-register-page` so no other self-serve route changes.

- [ ] **Step 2: Add the Celebix promotional illustration and panel styles**

Use a pale warm surface, orange brand accents, one soft shadow, and CSS-only shapes. Keep the badge and copy readable, and set the promotional panel to `position: sticky; top: 16px; min-height: calc(100vh - 32px)` on desktop.

- [ ] **Step 3: Add responsive rules**

At `1100px`, switch `.self-serve-register-shell` to one column, remove sticky positioning, keep `.self-serve-register-main` first, and compact the promotional panel. At `640px`, reduce page padding, stack `.self-serve-direct-inline`, prevent domain suffix overflow, and keep every input/button at least `48px` high.

- [ ] **Step 4: Run focused automated verification**

Run:

```bash
node --test apps/owner/app/kayit/page.test.ts
npm run typecheck --workspace @celebix/owner
```

Expected: all `/kayit` tests pass and TypeScript exits with code 0.

- [ ] **Step 5: Run production and browser verification**

Run `npm run build --workspace @celebix/owner`, then open `/kayit` locally at desktop and mobile widths. Verify the logo, login link, form-first order, promotional headline, no horizontal overflow, visible keyboard focus, password toggle, and responsive single-column layout.

- [ ] **Step 6: Commit the visual change**

```bash
git add apps/owner/app/globals.css
git commit -m "style(owner): refine responsive registration experience"
```
