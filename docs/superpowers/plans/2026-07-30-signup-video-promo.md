# Celebix Signup Video Promo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the abstract `/kayit` promo illustration with a realistic, lightweight looping storefront video and add the approved legal/trust copy below the registration CTA.

**Architecture:** Author the deterministic 8-second product demo as a small HyperFrames project, render optimized WebM/MP4 outputs plus a poster, and serve those immutable files from `apps/owner/public/media/`. Isolate playback/fallback markup in a server component, keep the registration state/API untouched, and extend the existing source-contract tests with media, copy, fallback, and reduced-motion requirements.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, scoped global CSS, HyperFrames + GSAP, ImageGen asset generation, FFmpeg, Node test runner.

## Global Constraints

- Keep exactly six visible registration inputs: `firstName`, `lastName`, `storeName`, `phone`, `email`, and `password`.
- Keep `privacyConsent: true`, automatic `storeSlug` generation, validation, registration API behavior, success state, and disabled state unchanged.
- Use exact promo copy: `Ücretsiz mağazanı bugün aç` and `Mağazanı dakikalar içinde oluştur, ürünlerini eklemeye başla.`
- Use exact legal/trust copy: `E-Ticaret Sistemi Kur'a tıklayarak Kullanım sözleşmesi’ni onaylıyorum.`, `Ömür boyu ücretsiz`, and `Kredi kartı gerektirmez`.
- The legal phrase is orange underlined emphasis, not an interactive link, until the business supplies an approved legal URL.
- Video duration is 8 seconds, muted, autoplaying, looping, inline, control-free, deterministic, and audio-free.
- Use `#FE6100` for Celebix orange, `#242424` for charcoal, true white on the form side, and warm neutral tones on the media side.
- Remove the old badge, orbit, large `C` tile, placeholder browser lines, nested promo card, and oversized headline.
- Hide playback and retain the poster on mobile and under `prefers-reduced-motion: reduce`.
- Keep final WebM below 1.5 MB and final MP4 below 3 MB.

---

## File Structure

- Create `media/hyperframes/signup-storefront-promo/DESIGN.md` — video-specific palette, typography, motion, and anti-pattern contract.
- Create `media/hyperframes/signup-storefront-promo/index.html` — deterministic 1280×720 HyperFrames composition and GSAP timeline.
- Create `media/hyperframes/signup-storefront-promo/assets/studio-laptop.png` — realistic ImageGen background with an implementation-friendly laptop screen.
- Create `apps/owner/public/media/signup-storefront-promo.webm` — primary optimized browser video.
- Create `apps/owner/public/media/signup-storefront-promo.mp4` — compatibility video.
- Create `apps/owner/public/media/signup-storefront-promo-poster.webp` — static fallback and reduced-motion/mobile image.
- Create `apps/owner/components/self-serve/SelfServeRegistrationPromo.tsx` — semantic promo copy plus video/poster source selection.
- Modify `apps/owner/app/kayit/page.tsx:1-60` — replace inline promo illustration with the dedicated component.
- Modify `apps/owner/components/self-serve/SelfServeDirectRegistrationForm.tsx:328-335` — add approved legal emphasis and trust row without new form fields.
- Modify `apps/owner/app/globals.css:5896-6285` — legal/trust styling, realistic media layout, responsive fallback, and removal of obsolete illustration styles.
- Modify `apps/owner/app/kayit/page.test.ts:1-75` — source and binary media contracts.

---

### Task 1: Lock the Video and Trust Contracts

**Files:**
- Modify: `apps/owner/app/kayit/page.test.ts`
- Test: `apps/owner/app/kayit/page.test.ts`

**Interfaces:**
- Consumes: Existing `pageSource` and `formSource` fixtures.
- Produces: `promoSource` fixture and failing contracts that define the promo component, media filenames, legacy removal, exact legal/trust copy, six-input invariant, and media budgets.

- [ ] **Step 1: Add the promo source and media-stat fixtures**

```ts
import { statSync } from "node:fs";

const promoSource = readFileSync(
  new URL("../../components/self-serve/SelfServeRegistrationPromo.tsx", import.meta.url),
  "utf8",
);
const mediaRoot = new URL("../../public/media/", import.meta.url);
```

- [ ] **Step 2: Add the failing markup and legacy-removal test**

```ts
test("/kayit uses the realistic video promo and removes the abstract illustration", () => {
  assert.match(pageSource, /SelfServeRegistrationPromo/);
  assert.match(promoSource, /signup-storefront-promo\.webm/);
  assert.match(promoSource, /signup-storefront-promo\.mp4/);
  assert.match(promoSource, /signup-storefront-promo-poster\.webp/);
  assert.match(promoSource, /autoPlay/);
  assert.match(promoSource, /muted/);
  assert.match(promoSource, /loop/);
  assert.match(promoSource, /playsInline/);
  assert.match(promoSource, /Ücretsiz mağazanı bugün aç/);
  assert.match(promoSource, /Mağazanı dakikalar içinde oluştur, ürünlerini eklemeye başla\./);
  assert.doesNotMatch(pageSource, /self-serve-register-promo-badge/);
  assert.doesNotMatch(pageSource, /self-serve-register-visual-orbit/);
  assert.doesNotMatch(pageSource, /self-serve-register-store-card/);
});
```

- [ ] **Step 3: Add the failing trust-copy and media-budget tests**

```ts
test("the direct form includes the approved unboxed legal and trust copy", () => {
  assert.match(formSource, /Kullanım sözleşmesi/);
  assert.match(formSource, /Ömür boyu ücretsiz/);
  assert.match(formSource, /Kredi kartı gerektirmez/);
  assert.match(formSource, /self-serve-register-trust-row/);
  assert.doesNotMatch(formSource, /type="checkbox"/);
});

test("signup promo media stays inside the page performance budget", () => {
  assert.ok(statSync(new URL("signup-storefront-promo.webm", mediaRoot)).size < 1_500_000);
  assert.ok(statSync(new URL("signup-storefront-promo.mp4", mediaRoot)).size < 3_000_000);
  assert.ok(statSync(new URL("signup-storefront-promo-poster.webp", mediaRoot)).size < 350_000);
});
```

- [ ] **Step 4: Run the test and confirm RED**

Run: `node --test apps/owner/app/kayit/page.test.ts`

Expected: FAIL because `SelfServeRegistrationPromo.tsx` and the three media files do not exist yet.

- [ ] **Step 5: Commit the contract**

```bash
git add apps/owner/app/kayit/page.test.ts
git commit -m "test(owner): define signup video promo contract"
```

---

### Task 2: Produce the Realistic Storefront Video Assets

**Files:**
- Create: `media/hyperframes/signup-storefront-promo/DESIGN.md`
- Create: `media/hyperframes/signup-storefront-promo/index.html`
- Create: `media/hyperframes/signup-storefront-promo/assets/studio-laptop.png`
- Create: `apps/owner/public/media/signup-storefront-promo.webm`
- Create: `apps/owner/public/media/signup-storefront-promo.mp4`
- Create: `apps/owner/public/media/signup-storefront-promo-poster.webp`
- Test: `apps/owner/app/kayit/page.test.ts`

**Interfaces:**
- Consumes: Exact palette, copy, and narrative from the global constraints.
- Produces: Three stable public media URLs consumed by `SelfServeRegistrationPromo` in Task 3.

- [ ] **Step 1: Verify/install the rendering prerequisites and scaffold HyperFrames**

```bash
command -v ffmpeg >/dev/null || brew install ffmpeg
npx hyperframes doctor
npx hyperframes init media/hyperframes/signup-storefront-promo --example product-promo --non-interactive
```

Expected: Node ≥22, Chrome present, and FFmpeg present.

- [ ] **Step 2: Create the video visual identity**

Write `media/hyperframes/signup-storefront-promo/DESIGN.md` with this exact contract:

```md
# Celebix Storefront Promo

## Style Prompt
Warm, realistic editorial product demo on a true-light canvas. A believable laptop storefront is the hero; Celebix orange is used only for active commerce moments. Motion is confident, calm, and physically weighted.

## Colors
- `#FE6100` — commerce action and notification accent
- `#242424` — primary storefront type
- `#FFFFFF` — screen and card surfaces
- `#F3EEE8` — warm studio background
- `#777B85` — secondary storefront copy

## Typography
- `Manrope` 300/600/800 — storefront UI and short labels
- System serif fallback — one editorial product headline only

## Motion
- 8 seconds at 30fps
- 0.2s initial hold, 0.6–0.8s weighted entrances, one slow camera push
- Cart/order event is the fastest moment at 0.25–0.35s
- Entire frame resolves to the initial neutral state before the loop boundary

## What NOT to Do
- No badge, orbit, giant C tile, gradients, blue/purple, fake metrics, audio, controls, or jump cut
- No repeated floating cards or decorative particle fields
- No unreadable web-sized type below 20px in the rendered composition
```

- [ ] **Step 3: Generate the realistic studio-laptop source image**

Use the built-in ImageGen tool with this prompt and save the selected output as `media/hyperframes/signup-storefront-promo/assets/studio-laptop.png`:

```text
Use case: product-mockup
Asset type: 1280x720 HyperFrames video background
Primary request: photorealistic nearly front-facing dark graphite laptop on a warm limestone studio desk, with a clean blank warm-white screen suitable for an HTML storefront overlay
Scene/backdrop: soft warm off-white plaster wall, one restrained ceramic vase at far left and subtle plant shadow at far right
Composition/framing: laptop centered slightly above the vertical midpoint, entire screen and keyboard visible, screen perspective mild and rectangular, generous safe space around device
Lighting/mood: soft premium daylight, realistic contact shadow, calm editorial e-commerce campaign
Color palette: #F3EEE8, #FFFFFF, graphite, tiny #FE6100 accent only outside the blank screen
Constraints: blank unbranded screen, no text, no logos, no UI, no people, no watermark, no floating cards, no dramatic perspective, no cropped device
```

Inspect the output with `view_image`; reject any image whose screen is heavily skewed, cropped, reflective, or already contains UI/text.

- [ ] **Step 4: Author the deterministic 1280×720 composition**

Replace the scaffolded `index.html` with one root composition:

```html
<div id="signup-storefront-promo" data-composition-id="signup-storefront-promo"
  data-start="0" data-duration="8" data-track-index="0" data-width="1280" data-height="720">
  <img id="studio" src="assets/studio-laptop.png" alt="" />
  <section class="laptop-screen" aria-label="Celebix mağaza önizlemesi">
    <header class="store-nav"><b>LUMINA</b><span>Yeni Gelenler</span><span>Kadın</span><span>Aksesuar</span><i>2</i></header>
    <div class="store-hero">
      <div><small>YENİ KOLEKSİYON</small><h1>Zamansız seçimler.</h1><button>Alışverişe Başla</button></div>
      <div class="hero-product" aria-hidden="true"></div>
    </div>
    <div class="product-row">
      <article><div class="product-photo is-bag"></div><b>Luna Omuz Çantası</b><span>1.299,00 TL</span></article>
      <article><div class="product-photo is-shirt"></div><b>Keten Gömlek</b><span>799,00 TL</span></article>
      <article><div class="product-photo is-watch"></div><b>Minimal Saat</b><span>1.099,00 TL</span></article>
      <article><div class="product-photo is-wallet"></div><b>Deri Cüzdan</b><span>499,00 TL</span></article>
    </div>
  </section>
  <div class="order-toast"><i>✓</i><div><b>Sipariş alındı</b><span>#1024 numaralı sipariş başarıyla alındı.</span></div></div>
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
  <script>
    window.__timelines = window.__timelines || {};
    const tl = gsap.timeline({ paused: true });
    tl.from("#studio", { opacity: 0, scale: 1.025, duration: 0.8, ease: "sine.out" }, 0.2)
      .from(".laptop-screen", { opacity: 0, scale: 0.985, duration: 0.65, ease: "power3.out" }, 0.35)
      .from(".store-nav > *", { opacity: 0, y: -10, stagger: 0.06, duration: 0.35, ease: "expo.out" }, 0.65)
      .from(".store-hero > div", { opacity: 0, x: -20, stagger: 0.12, duration: 0.55, ease: "power2.out" }, 0.9)
      .from(".product-row article", { opacity: 0, y: 24, stagger: 0.09, duration: 0.5, ease: "back.out(1.2)" }, 1.6)
      .to(".product-row", { x: -24, duration: 2.2, ease: "sine.inOut" }, 2.5)
      .from(".store-nav i", { scale: 0, duration: 0.28, ease: "back.out(2)" }, 4.2)
      .from(".order-toast", { opacity: 0, x: 90, scale: 0.96, duration: 0.42, ease: "expo.out" }, 4.45)
      .to(".order-toast", { opacity: 0, x: 40, duration: 0.3, ease: "power3.in" }, 7.15)
      .to(".laptop-screen", { opacity: 0, duration: 0.45, ease: "sine.in" }, 7.3)
      .to("#studio", { opacity: 0, scale: 1.025, duration: 0.5, ease: "power1.in" }, 7.35);
    window.__timelines["signup-storefront-promo"] = tl;
  </script>
</div>
```

Implement the complete final-state CSS before the timeline. The screen overlay must stay within the generated laptop display at all inspected timestamps; all animated elements must use transforms/opacity only.

- [ ] **Step 5: Lint, inspect, map, and preview the composition**

Use `media/hyperframes/signup-storefront-promo` as the working directory, then run:

```bash
npx hyperframes lint
npx hyperframes validate
npx hyperframes inspect --samples 15 --strict
node /Users/Celebix/.codex/plugins/cache/openai-curated-remote/hyperframes/0.1.2/skills/hyperframes/scripts/animation-map.mjs \
  . --out .hyperframes/anim-map
npx hyperframes preview --port 3017
```

Inspect hero frames at 0.8s, 2.5s, 4.8s, and 7.4s. Fix every unintentional overflow, collision, invisible end state, repeated ease, and abrupt loop boundary before rendering.

- [ ] **Step 6: Render and optimize the public assets**

Use `media/hyperframes/signup-storefront-promo` as the working directory for the render command:

```bash
npx hyperframes render \
  --output /tmp/signup-storefront-promo-master.mp4 --fps 30 --quality high --strict
```

Return to the repository root, then optimize the three public assets:

```bash
ffmpeg -y -i /tmp/signup-storefront-promo-master.mp4 -an -vf "scale=960:-2:flags=lanczos" \
  -c:v libvpx-vp9 -b:v 0 -crf 36 -row-mt 1 \
  apps/owner/public/media/signup-storefront-promo.webm
ffmpeg -y -i /tmp/signup-storefront-promo-master.mp4 -an -vf "scale=960:-2:flags=lanczos" \
  -c:v libx264 -profile:v high -level 4.0 -crf 25 -preset slow -movflags +faststart \
  apps/owner/public/media/signup-storefront-promo.mp4
ffmpeg -y -ss 0.8 -i /tmp/signup-storefront-promo-master.mp4 -frames:v 1 \
  -vf "scale=960:-2:flags=lanczos" -c:v libwebp -quality 82 \
  apps/owner/public/media/signup-storefront-promo-poster.webp
```

Run `ls -lh apps/owner/public/media/signup-storefront-promo*` and lower the WebM/MP4 bitrate or CRF only if a budget is exceeded.

- [ ] **Step 7: Run the asset-budget test and commit the video deliverable**

Run: `node --test apps/owner/app/kayit/page.test.ts`

Expected: The media-budget assertions pass; markup assertions remain red until Task 3.

```bash
git add media/hyperframes/signup-storefront-promo apps/owner/public/media/signup-storefront-promo.webm apps/owner/public/media/signup-storefront-promo.mp4 apps/owner/public/media/signup-storefront-promo-poster.webp
git commit -m "feat(owner): add signup storefront promo video"
```

---

### Task 3: Integrate the Video Promo and Trust Row

**Files:**
- Create: `apps/owner/components/self-serve/SelfServeRegistrationPromo.tsx`
- Modify: `apps/owner/app/kayit/page.tsx:1-60`
- Modify: `apps/owner/components/self-serve/SelfServeDirectRegistrationForm.tsx:328-335`
- Modify: `apps/owner/app/globals.css:5896-6285`
- Test: `apps/owner/app/kayit/page.test.ts`

**Interfaces:**
- Consumes: `/media/signup-storefront-promo.webm`, `.mp4`, and `-poster.webp` from Task 2.
- Produces: `SelfServeRegistrationPromo(): JSX.Element` and `.self-serve-register-trust-row` markup.

- [ ] **Step 1: Create the isolated promo component**

Create `SelfServeRegistrationPromo.tsx`:

```tsx
export function SelfServeRegistrationPromo() {
  return (
    <aside className="self-serve-register-promo" aria-labelledby="self-serve-register-promo-title">
      <div className="self-serve-register-promo-media" aria-hidden="true">
        <img src="/media/signup-storefront-promo-poster.webp" alt="" />
        <video
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          poster="/media/signup-storefront-promo-poster.webp"
          tabIndex={-1}
        >
          <source src="/media/signup-storefront-promo.webm" type="video/webm" />
          <source src="/media/signup-storefront-promo.mp4" type="video/mp4" />
        </video>
      </div>
      <div className="self-serve-register-promo-copy">
        <h2 id="self-serve-register-promo-title">Ücretsiz mağazanı bugün aç</h2>
        <p>Mağazanı dakikalar içinde oluştur, ürünlerini eklemeye başla.</p>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Replace the inline abstract promo**

In `apps/owner/app/kayit/page.tsx`, import `SelfServeRegistrationPromo` and replace the existing `<aside>…</aside>` with:

```tsx
<SelfServeRegistrationPromo />
```

- [ ] **Step 3: Add the legal emphasis and trust row**

Replace the current legal paragraph in `SelfServeDirectRegistrationForm.tsx` with:

```tsx
<p className="self-serve-register-legal">
  E-Ticaret Sistemi Kur&apos;a tıklayarak <em>Kullanım sözleşmesi</em>&apos;ni onaylıyorum.
</p>
<div className="self-serve-register-trust-row" aria-label="Kayıt avantajları">
  <span>
    <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 2.8 14 4l2.3-.1 1.1 2 2.1 1 .1 2.3 1.3 1.8-1.3 1.8-.1 2.3-2.1 1-1.1 2L14 20l-2 1.2L10 20l-2.3.1-1.1-2-2.1-1-.1-2.3L3.1 13l1.3-1.8.1-2.3 2.1-1 1.1-2L10 4l2-1.2Z"/><path d="m8.7 12.1 2.1 2.1 4.5-4.7"/></svg>
    Ömür boyu ücretsiz
  </span>
  <i aria-hidden="true" />
  <span>
    <svg aria-hidden="true" viewBox="0 0 24 24"><rect x="2.8" y="5.2" width="18.4" height="12.5" rx="2"/><path d="M3 9h18M16.8 14.2l4.4 4.4m0-4.4-4.4 4.4"/></svg>
    Kredi kartı gerektirmez
  </span>
</div>
```

Keep `initialForm.privacyConsent` set to `true`; add no checkbox or input.

- [ ] **Step 4: Replace obsolete promo CSS and style the trust row**

Delete selectors for `.self-serve-register-promo-badge`, `.self-serve-register-visual*`, `.self-serve-register-store-*`, and pseudo-element orbit decoration. Implement these container rules:

```css
.self-serve-register-promo {
  position: sticky;
  top: 16px;
  min-height: calc(100vh - 32px);
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  overflow: hidden;
  background: #f3eee8;
}
.self-serve-register-promo-media { position: relative; min-height: 0; overflow: hidden; }
.self-serve-register-promo-media img,
.self-serve-register-promo-media video { width: 100%; height: 100%; object-fit: cover; }
.self-serve-register-promo-media video { position: absolute; inset: 0; }
.self-serve-register-promo-copy { padding: 24px clamp(24px, 4vw, 56px) 42px; text-align: left; }
.self-serve-register-promo-copy h2 { max-width: 620px; font-size: clamp(34px, 4vw, 58px); }
.self-serve-register-promo-copy p { margin-top: 12px; color: #717580; font-size: 15px; }

.self-serve-register-legal em { color: #fe6100; font-style: normal; text-decoration: underline; text-underline-offset: 3px; }
.self-serve-register-trust-row { display: flex; justify-content: center; align-items: center; gap: 18px; color: #697180; }
.self-serve-register-trust-row span { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 650; }
.self-serve-register-trust-row svg { width: 21px; height: 21px; fill: none; stroke: currentColor; stroke-width: 1.8; }
.self-serve-register-trust-row > i { width: 1px; height: 24px; background: #dfe2e7; }
```

At `max-width: 1100px`, keep the promo below the form with a 16:9 media region. At `max-width: 640px`, hide the `<video>`, show the poster, and allow the trust row to wrap. Add `@media (prefers-reduced-motion: reduce) { .self-serve-register-promo-media video { display: none; } }`. Add a desktop `max-height: 820px` compression rule so the trust row remains visible without shrinking text below 11px or controls below 50px.

- [ ] **Step 5: Run tests and typecheck until GREEN**

```bash
node --test apps/owner/app/kayit/page.test.ts
npm run typecheck --workspace @celebix/owner
git diff --check
```

Expected: 7+ page tests pass, TypeScript exits 0, and no whitespace errors are reported.

- [ ] **Step 6: Commit the integration**

```bash
git add apps/owner/components/self-serve/SelfServeRegistrationPromo.tsx apps/owner/app/kayit/page.tsx apps/owner/components/self-serve/SelfServeDirectRegistrationForm.tsx apps/owner/app/globals.css
git commit -m "feat(owner): integrate signup video promo"
```

---

### Task 4: Production and Visual Verification

**Files:**
- Modify only if verification finds a concrete mismatch: files from Task 3.
- Test: `apps/owner/app/kayit/page.test.ts`

**Interfaces:**
- Consumes: Completed media assets and UI integration.
- Produces: Verified desktop/mobile/reduced-motion behavior and deployable commit history.

- [ ] **Step 1: Run the complete local verification suite**

```bash
node --test apps/owner/app/kayit/page.test.ts
npm run typecheck --workspace @celebix/owner
npm run build --workspace @celebix/owner
git diff --check
```

Expected: All commands exit 0. Restore only the generated `apps/owner/next-env.d.ts` route-import drift with `apply_patch` if Next changes it from `.next/types/routes.d.ts` to `.next/dev/types/routes.d.ts`.

- [ ] **Step 2: Verify desktop, mobile, poster, and media behavior in Browser**

Run the owner app, open `/kayit`, and verify:

```text
Desktop 1440×900: six inputs; trust row visible; video playing; no controls; no horizontal overflow.
Desktop 1280×800: CTA, legal line, and trust row remain visible; promo headline does not dominate.
Mobile 390×844: six inputs stack; video hidden; poster visible; trust items wrap cleanly.
Reduced motion: video hidden; poster visible; no visual gap.
Console: no media, hydration, or React errors.
```

Do not submit a completed registration because that creates an external store/provisioning side effect. Exercise only empty-form validation and the password visibility button.

- [ ] **Step 3: Perform the concept fidelity ledger**

Use `view_image` on the accepted concept `/Users/Celebix/.codex/generated_images/019f9eb3-ae28-7333-8bc6-4de04aac19e1/exec-314eda0a-4674-4fd8-827b-084c65252e94.png` and on fresh desktop/mobile screenshots. Check at least these points:

```text
1. Exact six-field left form and merged domain suffix.
2. Exact legal and two trust strings, with no cards or checkboxes.
3. Realistic storefront/device asset replacing the abstract C/orbit artwork.
4. Smaller, left-aligned right-side headline and warm neutral palette.
5. Video/poster crop, depth, and asset blending at desktop and mobile.
6. Celebix logo, orange CTA, and no unapproved above-the-fold copy.
```

Fix every material mismatch, re-capture screenshots, and repeat `view_image` comparison.

- [ ] **Step 4: Commit verification fixes if any**

```bash
git add apps/owner/app/kayit/page.test.ts apps/owner/app/kayit/page.tsx apps/owner/app/globals.css apps/owner/components/self-serve/SelfServeDirectRegistrationForm.tsx apps/owner/components/self-serve/SelfServeRegistrationPromo.tsx
git commit -m "style(owner): refine signup video experience"
```

Skip this commit only when `git status --short` is empty after verification.

- [ ] **Step 5: Push and deploy the verified branch**

```bash
git push origin HEAD:deploy/owner
```

Queue the exact pushed commit for Coolify application `oo08g4wso080w44oc0s04ws0`. Poll deployment UUID state until `finished`; if it fails, inspect the stored deployment log before retrying.

- [ ] **Step 6: Verify the live release**

```bash
curl -fsS https://ecommerce.celebix.co/kayit > /tmp/celebix-kayit-live.html
rg -F "Ücretsiz mağazanı bugün aç" /tmp/celebix-kayit-live.html
curl -fsSI https://ecommerce.celebix.co/media/signup-storefront-promo.webm
curl -fsSI https://ecommerce.celebix.co/media/signup-storefront-promo.mp4
curl -fsSI https://ecommerce.celebix.co/media/signup-storefront-promo-poster.webp
```

Open `https://ecommerce.celebix.co/kayit` in a deliverable browser tab, confirm six inputs, zero consent cards, zero console errors, and leave that tab open for the user.
