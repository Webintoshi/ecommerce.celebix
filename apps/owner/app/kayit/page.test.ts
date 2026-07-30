import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const globalCssSource = readFileSync(new URL("../globals.css", import.meta.url), "utf8");
const rootLayoutSource = readFileSync(new URL("../layout.tsx", import.meta.url), "utf8");
const middlewareSource = readFileSync(new URL("../../middleware.ts", import.meta.url), "utf8");
const formSource = readFileSync(
  new URL("../../components/self-serve/SelfServeDirectRegistrationForm.tsx", import.meta.url),
  "utf8",
);
const promoUrl = new URL("../../components/self-serve/SelfServeRegistrationPromo.tsx", import.meta.url);
const promoSource = existsSync(promoUrl) ? readFileSync(promoUrl, "utf8") : "";
const mediaRoot = new URL("../../public/media/", import.meta.url);

test("/kayit is a single direct registration screen, not the old onboarding landing", () => {
  assert.match(pageSource, /E-Ticaret sitenizi açın!/);
  assert.match(pageSource, /Sanal POS, kargo ve yönetim paneliniz hazır\./);
  assert.match(pageSource, /Zaten hesabınız var mı\?/);
  assert.match(pageSource, /Giriş Yap/);

  assert.doesNotMatch(pageSource, /self-serve-direct-shell/);
  assert.doesNotMatch(pageSource, /self-serve-direct-copy/);
  assert.doesNotMatch(pageSource, /self-serve-trust-list/);
  assert.doesNotMatch(pageSource, /self-serve-direct-note/);
  assert.doesNotMatch(pageSource, /Komisyonsuz e-ticaret altyapısı/);
  assert.doesNotMatch(pageSource, /Kurulum sonrası/);
});

test("/kayit includes the approved Celebix promotional region", () => {
  assert.match(pageSource, /self-serve-register-shell/);
  assert.match(pageSource, /SelfServeRegistrationPromo/);
  assert.match(promoSource, /self-serve-register-promo/);
  assert.match(promoSource, /Ücretsiz mağazanı bugün aç/);
  assert.match(promoSource, /Mağazanı dakikalar içinde oluştur, ürünlerini eklemeye başla\./);
});

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

test("signup promo keeps a flat poster fallback across responsive and reduced-motion modes", () => {
  assert.match(globalCssSource, /\.self-serve-register-promo\s*\{[^}]*border-radius:\s*0;/s);
  assert.match(globalCssSource, /\.self-serve-register-promo\s*\{[^}]*box-shadow:\s*none;/s);
  assert.match(globalCssSource, /@media \(max-width: 1100px\)[\s\S]*aspect-ratio:\s*16\s*\/\s*9;/);
  assert.match(
    globalCssSource,
    /@media \(max-width: 640px\)[\s\S]*\.self-serve-register-promo-media video\s*\{[^}]*display:\s*none;/,
  );
  assert.match(
    globalCssSource,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.self-serve-register-promo-media video\s*\{[^}]*display:\s*none;/,
  );
  assert.doesNotMatch(globalCssSource, /self-serve-register-(?:promo-badge|visual|store-)/);
});

test("the direct form includes the approved unboxed legal and trust copy", () => {
  const legalMarkup = formSource.match(/<p className="self-serve-register-legal">([\s\S]*?)<\/p>/)?.[1] ?? "";
  const renderedLegalCopy = legalMarkup
    .replace(/<[^>]+>/g, "")
    .replaceAll("&apos;", "'")
    .replace(/\s+/g, " ")
    .trim();

  assert.equal(renderedLegalCopy, "E-Ticaret Sistemi Kur'a tıklayarak Kullanım sözleşmesi'ni onaylıyorum.");
  assert.match(legalMarkup, /<em>Kullanım sözleşmesi<\/em>/);
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

test("the direct form does not reintroduce Logto-first or onboarding explainer copy", () => {
  assert.match(formSource, /E-Ticaret Sistemi Kur/);
  assert.match(formSource, /\.\{domainSuffix\}/);

  assert.doesNotMatch(formSource, /self-serve-form-logo/);
  assert.doesNotMatch(formSource, /Tek ekranda basla/i);
  assert.doesNotMatch(formSource, /Magaza ve hesap bilgileri/i);
  assert.doesNotMatch(formSource, /Planlanan admin/i);
  assert.doesNotMatch(formSource, /handoff/i);
  assert.doesNotMatch(formSource, /Guvenlik/i);
  assert.doesNotMatch(formSource, /Logto ile/i);
  assert.doesNotMatch(formSource, /Supabase Auth/i);
  assert.doesNotMatch(formSource, /Celebix ekibi doğrulayacak/i);
  assert.doesNotMatch(formSource, /owner approval/i);
});

test("the direct form keeps only the requested six visible registration fields", () => {
  const visibleInputNames = ["firstName", "lastName", "storeName", "phone", "email", "password"];

  assert.equal((formSource.match(/<input\b/g) ?? []).length, visibleInputNames.length);
  for (const field of visibleInputNames) {
    assert.match(formSource, new RegExp(`name="${field}"`));
  }

  assert.match(formSource, /self-serve-store-name-field/);
  assert.match(formSource, /privacyConsent: true/);
  assert.doesNotMatch(formSource, /name="storeSlug"/);
  assert.doesNotMatch(formSource, /type="checkbox"/);
  assert.doesNotMatch(formSource, /self-serve-consent-stack/);
});

test("/kayit customer-facing copy is store creation language, not an application queue", () => {
  const customerFacingSource = `${pageSource}\n${formSource}`;

  assert.doesNotMatch(customerFacingSource, /basvuru/i);
  assert.doesNotMatch(customerFacingSource, /başvuru/i);
  assert.doesNotMatch(customerFacingSource, /admin incelemesi/i);
  assert.doesNotMatch(customerFacingSource, /owner ekibi/i);
  assert.doesNotMatch(customerFacingSource, /manual review/i);
});

test("/kayit and legacy public aliases bypass Owner admin shell chrome", () => {
  assert.match(rootLayoutSource, /PUBLIC_SELF_SERVE_PAGE_PATHS/);
  assert.match(rootLayoutSource, /"\/kayit"/);
  assert.match(rootLayoutSource, /"\/magaza-ac"/);
  assert.match(rootLayoutSource, /"\/onboarding"/);
  assert.match(rootLayoutSource, /"\/onboarding\/status"/);
  assert.match(rootLayoutSource, /isPublicSelfServePage\s*\?\s*null/);

  assert.match(middlewareSource, /SELF_SERVE_PUBLIC_PREFIXES/);
  assert.match(middlewareSource, /"\/media"/);
  assert.match(middlewareSource, /return withSecurity\(request, nextResponse\(request\)\)/);
});
