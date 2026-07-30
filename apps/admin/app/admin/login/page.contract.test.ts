import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageSource = await readFile(new URL("./page.tsx", import.meta.url), "utf8");
const runtimeRouteSource = await readFile(
  new URL("../../api/public/runtime/route.ts", import.meta.url),
  "utf8",
);

test("login page renders only parsed callback errors with typed recovery", () => {
  assert.match(pageSource, /parseAdminLoginErrorCode/);
  assert.match(pageSource, /getAdminLoginErrorPresentation/);
  assert.match(pageSource, /buildAdminSignInPath/);
  assert.match(pageSource, /forceAccountSelection/);
  assert.doesNotMatch(pageSource, /login_failed|unauthorized/);
});

test("login page loads and renders safe store branding", () => {
  assert.match(pageSource, /fetch\("\/api\/public\/runtime"/);
  assert.match(pageSource, /storeName/);
  assert.match(pageSource, /logoUrl/);
  assert.match(runtimeRouteSource, /getStoreInfo/);
  assert.match(runtimeRouteSource, /resolveAdminAssetUrl/);
  assert.match(runtimeRouteSource, /logoUrl/);
});

test("Logto UI is store-first with Celebix as secondary trust copy", () => {
  assert.match(pageSource, /Güvenli giriş yap/);
  assert.match(pageSource, /Başka hesapla giriş yap/);
  assert.match(pageSource, /Celebix altyapısıyla korunuyor/);
  assert.doesNotMatch(pageSource, /güvenli Logto oturumu|Celebix Auth ile Devam Et/);
});

test("legacy Supabase stores keep their email and password controls", () => {
  assert.match(pageSource, /type="email"/);
  assert.match(pageSource, /type="password"/);
  assert.match(pageSource, /handleLogin/);
});
