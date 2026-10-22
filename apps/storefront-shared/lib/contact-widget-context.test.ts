import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as contracts from '@celebix/saas-contracts';
import * as commercePolicy from './commerce-policy.ts';
import { createDefaultContactWidgetConfig } from "@celebix/saas-contracts";

async function context(reader?: { getForHost(input: { hostname: string; now: Date }): Promise<unknown> }, ordering?: { getForHost(input: {hostname:string;now:Date}):Promise<unknown> }) {
  const calls: Array<{ hostname: string; now: Date }> = [];
  const source = readFileSync(new URL("./page-context.ts", import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const runtime = { content:{}, ...(ordering?{whatsappOrders:ordering}:{}), repository: { getPublicStorefrontDesign: async () => ({ schemaVersion: 3 }) }, analytics: null, analyticsCollector: null, ...(reader ? { contactWidgets: { getForHost: async (input: { hostname: string; now: Date }) => { calls.push(input); return reader.getForHost(input); } } } : {}) };
  const dependencies: Record<string, unknown> = { '@celebix/saas-contracts':contracts, './commerce-policy.ts':commercePolicy, "server-only": {}, react: { cache: (callback: () => Promise<unknown>) => { let selected: Promise<unknown> | undefined; return () => selected ??= callback(); } }, "next/headers": { headers: async () => new Headers({ host: "shop.example.test" }) }, "./default-runtime.ts": { resolveDefaultPublicStorefrontRuntime: async () => runtime }, "./campaign-page-resolution.ts": { resolveCampaignPageProjection: async () => ({ kind: "legacy" }), withCampaignPresentation: (value: unknown) => value }, "./public-storefront.ts": { resolvePublicStorefrontRequest: async () => ({ kind: "active", storefront: { id: "store-a", hostname: "shop.example.test" } }) } };
  const compiled: { exports: { resolveStorefrontPage?: () => Promise<{ kind: string; context: { contactWidget: unknown; commercePolicy: contracts.StorefrontCommercePolicy } }> } } = { exports: {} };
  new Function("require", "module", "exports", output)((name: string) => { if (!(name in dependencies)) throw new Error(`Unexpected dependency ${name}`); return dependencies[name]; }, compiled, compiled.exports);
  const resolve = compiled.exports.resolveStorefrontPage!;
  const [first, second] = await Promise.all([resolve(), resolve()]);
  assert.equal(first, second, "one page request shares its context read");
  return { selected: first, calls };
}
test("contact tools read through the resolved hostname, deduplicate and require matching store ownership", async () => {
  const config = createDefaultContactWidgetConfig();
  const good = await context({ getForHost: async () => ({ storeId: "store-a", config }) });
  assert.equal(good.selected.kind, "active"); assert.equal(good.selected.context.contactWidget, config);
  assert.equal(good.calls.length, 1); assert.equal(good.calls[0]?.hostname, "shop.example.test"); assert.ok(good.calls[0]?.now instanceof Date);
  const foreign = await context({ getForHost: async () => ({ storeId: "store-b", config }) });
  assert.equal(foreign.selected.kind, "active"); assert.equal(foreign.selected.context.contactWidget, null);
});
test("missing widget migration, optional runtime or read failure leaves the store usable without a bubble", async () => {
  for (const reader of [undefined, { getForHost: async () => { throw new Error("migration unavailable"); } }, { getForHost: async () => ({ storeId: "store-a", config: null }) }]) {
    const result = await context(reader); assert.equal(result.selected.kind, "active"); assert.equal(result.selected.context.contactWidget, null);
  }
});

test('WhatsApp commerce policy failure and foreign ownership stop the page instead of exposing prices', async()=>{
 const failed=await context(undefined,{getForHost:async()=>{throw new Error('policy_unavailable');}});assert.equal(failed.selected.kind,'unavailable');
 const foreign=await context(undefined,{getForHost:async()=>({storeId:'other-store',version:1,config:contracts.createDefaultWhatsAppOrderConfig()})});assert.equal(foreign.selected.kind,'unavailable');
});

test('an empty native tool entitlement projection keeps ordinary shopping available', async () => {
  let orderingReads = 0;
  const selected = await context({ getForHost: async () => ({ storeId: 'store-a', config: null }) }, {
    getForHost: async () => { orderingReads++; return null; },
  });
  assert.equal(selected.selected.kind, 'active');
  assert.equal(selected.selected.context.contactWidget, null);
  assert.equal(selected.selected.context.commercePolicy.enabled, false);
  assert.equal(selected.selected.context.commercePolicy.checkoutAllowed, true);
  assert.equal(selected.selected.context.commercePolicy.hidePrices, false);
  assert.equal(orderingReads, 1, 'license authority is part of the existing request-local read');
});

test('native store-bound tool projections work independently of subscription metadata', async () => {
  const widget = { ...createDefaultContactWidgetConfig(), enabled: true };
  const config = { ...contracts.createDefaultWhatsAppOrderConfig(), enabled: true, phone: '+905551112233', hidePrices: true };
  const selected = await context({ getForHost: async () => ({ storeId: 'store-a', config: widget }) }, {
    getForHost: async () => ({ storeId: 'store-a', version: 7, config }),
  });
  assert.equal(selected.selected.kind, 'active');
  assert.equal(selected.selected.context.contactWidget, widget);
  assert.equal(selected.selected.context.commercePolicy.version, 7);
  assert.equal(selected.selected.context.commercePolicy.enabled, true);
  assert.equal(selected.selected.context.commercePolicy.hidePrices, true);
  assert.equal(selected.selected.context.commercePolicy.checkoutAllowed, false);
});
