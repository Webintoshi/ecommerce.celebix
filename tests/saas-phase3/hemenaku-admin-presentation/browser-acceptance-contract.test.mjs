import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../");
const read = (file) => readFile(path.join(ROOT, file), "utf8");

test("cumulative browser acceptance executes the real shell and merchant console", async () => {
  const [runner, page, api] = await Promise.all([
    read("tests/saas-phase3/hemenaku-admin-presentation/browser-acceptance.mjs"),
    read("tests/saas-phase3/hemenaku-admin-presentation/browser-fixture/app/marketplaces/page.tsx"),
    read("tests/saas-phase3/hemenaku-admin-presentation/browser-fixture/app/api/merchant-admin/[...slug]/route.ts"),
  ]);
  assert.match(page, /<PanelShell/);
  assert.match(page, /<MerchantModuleConsole kind="marketplace_connection" canManage/);
  for (const contract of [
    "Emulation.setDeviceMetricsOverride",
    "Page.captureScreenshot",
    "1024", "1025", "390", "320",
    "scrollWidth", "48", "prefers-reduced-motion",
    "Senkronizasyon hazırlığı oluştur",
    "Sağlayıcı aktivasyonu bekleniyor",
    "Hazırlığı iptal et",
    "Panel menüsünü aç",
    "Escape",
  ]) assert.match(runner, new RegExp(contract));
  assert.match(api, /awaiting_provider_activation/);
  assert.match(api, /cancelled/);
  assert.doesNotMatch(api, /completed|success|sent|delivered|synchronized|reconciled|indexed/i);
});

test("browser acceptance is opt-in, local-only and dependency-free", async () => {
  const [runner, pkg] = await Promise.all([read("tests/saas-phase3/hemenaku-admin-presentation/browser-acceptance.mjs"), read("package.json")]);
  assert.equal(JSON.parse(pkg).scripts["test:saas-phase3:browser"], "node tests/saas-phase3/hemenaku-admin-presentation/browser-acceptance.mjs");
  assert.match(runner, /127\.0\.0\.1/);
  assert.doesNotMatch(runner, /https:\/\/|production|staging|playwright|puppeteer|shell\s*:\s*true/i);
});
