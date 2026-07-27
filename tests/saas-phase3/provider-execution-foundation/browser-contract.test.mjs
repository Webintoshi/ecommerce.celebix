import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROOT = new URL("../../../", import.meta.url);
const read = (file) => readFile(new URL(file, ROOT), "utf8");
const ROUTES = Object.freeze([
  Object.freeze(["/marketplaces", "marketplace_connection", "marketplace_sync"]),
  Object.freeze(["/accounting/invoicing-integration", "invoice_integration", "invoice_reconciliation"]),
  Object.freeze(["/marketing/email", "email_campaign", "email_delivery"]),
  Object.freeze(["/marketing/phone", "phone_campaign", "phone_delivery"]),
  Object.freeze(["/marketing/whatsapp", "whatsapp_campaign", "whatsapp_delivery"]),
  Object.freeze(["/seo/fast-indexing", "indexing_request", "indexing"]),
]);

test("browser evidence covers every exact provider-gated route and capability", async () => {
  const [acceptance, fixture, fixtureApi] = await Promise.all([
    read("tests/saas-phase3/hemenaku-admin-presentation/browser-acceptance.mjs"),
    read("tests/saas-phase3/hemenaku-admin-presentation/browser-fixture/app/full-parity-fixture.tsx"),
    read("tests/saas-phase3/hemenaku-admin-presentation/browser-fixture/app/api/merchant-admin/[...slug]/route.ts"),
  ]);
  assert.match(acceptance, /const PROVIDER_FOUNDATION_ROUTES = Object[.]freeze/u);
  for (const [route, kind, capability] of ROUTES) {
    assert.match(acceptance, new RegExp(JSON.stringify(route).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(acceptance, new RegExp(JSON.stringify(capability).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(fixture, new RegExp(`case ${JSON.stringify(route).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:\\s*return <MerchantModuleConsole kind=${JSON.stringify(kind).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    assert.match(fixtureApi, new RegExp(`\\b${kind}\\b`));
  }
});

test("browser evidence remains disabled, same-origin, responsive and credential-free", async () => {
  const [acceptance, panel, panelCss, defaultRuntime] = await Promise.all([
    read("tests/saas-phase3/hemenaku-admin-presentation/browser-acceptance.mjs"),
    read("apps/customer-panel/components/merchant-admin/ProviderConnectionPanel.tsx"),
    read("apps/customer-panel/components/merchant-admin/provider-connection-panel.module.css"),
    read("apps/customer-panel/lib/provider-execution-http/default.ts"),
  ]);
  assert.match(defaultRuntime, /providerCodes:\s*\(\)\s*=>\s*Object[.]freeze\(\[\]\)/u);
  assert.match(panel, /type="password"/u);
  assert.doesNotMatch(panel, /useState[^\n]*(?:credential|secret|token)/iu);
  assert.match(panelCss, /min-(?:height|block-size):48px/u);
  for (const width of [390, 1024, 1025]) assert.match(acceptance, new RegExp(`provider[^\\n]{0,200}${width}|${width}[^\\n]{0,200}provider`, "iu"));
  assert.match(acceptance, /Sağlayıcı adaptörü etkin değil/u);
  assert.match(acceptance, /externalRequests/u);
  assert.match(acceptance, /credential[^\n]{0,120}(?:DOM|RSC|network|console)/iu);
  assert.doesNotMatch(acceptance, /https?:\/\/(?:api|provider|sandbox)[.][a-z]/iu);
});
