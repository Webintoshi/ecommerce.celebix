# Human-Centered Signup Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/kayit` video promotion with a fast, static, human-centered Celebix customer-experience scene while preserving the working registration flow.

**Architecture:** Keep the existing Next.js page and client registration form intact. Convert `SelfServeRegistrationPromo` into a server-rendered, code-native customer-experience composition, backed by one generated lifestyle asset and shared page CSS. Update the existing route tests first so they fail on the current video implementation, then implement and verify desktop/mobile behavior in the browser.

**Tech Stack:** Next.js App Router, React, TypeScript, CSS, Node test runner, built-in Image Gen.

## Global Constraints

- Keep the six existing fields: Ad, Soyad, Mağazanızın Adı, Telefon, E-posta, Şifre.
- Keep the CTA text `E-Ticaret Sistemi Kur` and existing registration submission behavior.
- Keep the login link and the existing legal copy.
- Use Celebix orange `#fe6100`, true white, charcoal text, and neutral gray borders.
- Remove every video element and source from the rendered signup experience.
- Use one static, realistic scene of a small-business owner experiencing the moment her store becomes real; a product screen may appear naturally in the scene but must not be the main subject.
- Use the approved right-side copy `Fikrini mağazaya dönüştür.` and `Celebix ile teknik bilgiye ihtiyaç duymadan mağazanı oluştur, ürünlerini ekle ve ilk satışına hazırlan.`
- Do not use abstract illustration, fake metrics, decorative badge, giant rounded page wrapper, or nested card grid.
- Desktop is a two-column first viewport; mobile prioritizes the form and shows a compact static showcase after it.

---

### Task 1: Lock the static promo contract with a failing test

**Files:**
- Modify: `apps/owner/app/kayit/page.test.ts`

**Interfaces:**
- Consumes: `SelfServeRegistrationPromo` source and existing media directory.
- Produces: a regression contract that rejects video sources and requires the approved static showcase copy and semantics.

- [ ] **Step 1: Replace video-specific assertions with the static showcase contract**

Assert that the promo contains a static generated image, the heading `Fikrini mağazaya dönüştür.`, the copy `Celebix ile teknik bilgiye ihtiyaç duymadan mağazanı oluştur, ürünlerini ekle ve ilk satışına hazırlan.`, the proof text `Dakikalar içinde hazır`, and no `<video>`, `.webm`, `.mp4`, `autoPlay`, or React client-state hooks.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test apps/owner/app/kayit/page.test.ts`

Expected: failure because the current promo still mounts the video and does not contain the approved static composition.

### Task 2: Implement the human-centered Celebix signup experience

**Files:**
- Modify: `apps/owner/components/self-serve/SelfServeRegistrationPromo.tsx`
- Modify: `apps/owner/app/globals.css`
- Create: `apps/owner/public/media/signup-customer-experience.jpg`
- Delete: `apps/owner/public/media/signup-storefront-promo.webm`
- Delete: `apps/owner/public/media/signup-storefront-promo.mp4`
- Delete: `apps/owner/public/media/signup-storefront-promo-poster.webp`

**Interfaces:**
- Consumes: `/media/signup-customer-experience.jpg`.
- Produces: a server-rendered `<aside>` with one static lifestyle image, code-native title/body/proof content, and no runtime media logic.

- [ ] **Step 1: Generate and save the static showcase asset**

Use built-in Image Gen to create a realistic premium scene of a Turkish small-business owner seeing her new online store and first-order moment, with warm natural light, restrained Celebix-orange details, no readable UI text, and no external logos. Save the selected optimized JPEG as `apps/owner/public/media/signup-customer-experience.jpg`.

- [ ] **Step 2: Replace the promo component**

Remove `use client`, `useEffect`, `useState`, and `<video>`. Render the static image with code-native heading, supporting sentence, and `Dakikalar içinde hazır` proof item.

- [ ] **Step 3: Rebuild promo CSS from the approved design tokens**

Use true white and `#f7f7f5`, charcoal `#242424`, muted `#717580`, accent `#fe6100`, 12-18px radii only inside the product mockup, open page layout, subtle shadows, and stable desktop/mobile sizing. Remove video and reduced-motion rules.

- [ ] **Step 4: Remove unused video assets**

Delete the WebM, MP4, and old poster after confirming no source references remain.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `node --test apps/owner/app/kayit/page.test.ts`

Expected: all `/kayit` tests pass with no video contract remaining.

### Task 3: Verify implementation and publish

**Files:**
- Modify only if visual or responsive defects are found during QA.

**Interfaces:**
- Consumes: local production-like owner app.
- Produces: verified desktop/mobile screenshots and a deployed commit.

- [ ] **Step 1: Run static verification**

Run the focused tests, owner typecheck/build, `git diff --check`, and `rg` checks proving no signup video source remains.

- [ ] **Step 2: Verify in Browser/IAB**

Open `/kayit`, check the six-field form and login link, trigger empty validation without submitting network data, and capture desktop plus mobile screenshots.

- [ ] **Step 3: Compare concept and browser screenshots**

Use `view_image` on both images; audit copy, two-column balance, typography, palette, static asset framing, spacing, and mobile continuation. Fix all material mismatches and repeat verification.

- [ ] **Step 4: Commit, push, deploy, and verify live**

Create one focused commit, push the deployment branch, deploy the Coolify application, and confirm `https://ecommerce.celebix.co/kayit` serves the static design without video requests.
