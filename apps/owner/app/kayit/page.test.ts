import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const rootLayoutSource = readFileSync(new URL("../layout.tsx", import.meta.url), "utf8");
const middlewareSource = readFileSync(new URL("../../middleware.ts", import.meta.url), "utf8");
const formSource = readFileSync(
  new URL("../../components/self-serve/SelfServeDirectRegistrationForm.tsx", import.meta.url),
  "utf8",
);

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
  assert.match(pageSource, /self-serve-register-promo/);
  assert.match(pageSource, /Ücretsiz/);
  assert.match(pageSource, /E-Ticaret Yolculuğunu Başlat/);
  assert.match(pageSource, /KOBİ(?:'|&apos;)lerin yanında/);
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
  for (const field of ["firstName", "lastName", "storeName", "phone", "email", "password"]) {
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
  assert.match(middlewareSource, /return withSecurity\(request, nextResponse\(request\)\)/);
});
