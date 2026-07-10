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

test("/kayit renders the safe direct registration form while remaining disabled by default", () => {
  assert.match(pageSource, /SELF_SERVE_SAAS_REGISTRATION_ENABLED/);
  assert.match(pageSource, /Kayıt altyapısı hazırlanıyor/);
  assert.match(pageSource, /canlı mağaza oluşturmaz/);
  assert.match(pageSource, /SelfServeDirectRegistrationForm/);
  assert.match(formSource, /name="storeName"/);
  assert.match(formSource, /name="storeSlug"/);
  assert.match(formSource, /name="privacyConsent"/);
  assert.match(formSource, /name="marketingConsent"/);
  assert.match(formSource, /Kimliğimi doğrula ve mağazamı kur/);
  assert.match(formSource, /disabled/);
});

test("the direct form collects no browser identity credentials or authority IDs", () => {
  assert.match(formSource, /\.\{domainSuffix\}/);
  for (const prohibited of [
    /name="email"/,
    /name="password"/,
    /name="phone"/,
    /name="firstName"/,
    /name="lastName"/,
    /storeId/,
    /membershipId/,
    /localStorage/,
    /fetch\(/,
  ]) assert.doesNotMatch(formSource, prohibited);
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
