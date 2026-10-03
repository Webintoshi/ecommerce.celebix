import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { createDefaultContactWidgetConfig } from "@celebix/saas-contracts";

async function context(reader?: { getForHost(input: { hostname: string; now: Date }): Promise<unknown> }) {
  const calls: Array<{ hostname: string; now: Date }> = [];
  const source = readFileSync(new URL("./page-context.ts", import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const runtime = { repository: { getPublicStorefrontDesign: async () => ({ schemaVersion: 3 }) }, analytics: null, analyticsCollector: null, ...(reader ? { contactWidgets: { getForHost: async (input: { hostname: string; now: Date }) => { calls.push(input); return reader.getForHost(input); } } } : {}) };
  const dependencies: Record<string, unknown> = { "server-only": {}, react: { cache: (callback: () => Promise<unknown>) => { let selected: Promise<unknown> | undefined; return () => selected ??= callback(); } }, "next/headers": { headers: async () => new Headers({ host: "shop.example.test" }) }, "./default-runtime.ts": { resolveDefaultPublicStorefrontRuntime: async () => runtime }, "./campaign-page-resolution.ts": { resolveCampaignPageProjection: async () => ({ kind: "legacy" }), withCampaignPresentation: (value: unknown) => value }, "./public-storefront.ts": { resolvePublicStorefrontRequest: async () => ({ kind: "active", storefront: { id: "store-a", hostname: "shop.example.test" } }) } };
  const compiled: { exports: { resolveStorefrontPage?: () => Promise<{ kind: string; context: { contactWidget: unknown } }> } } = { exports: {} };
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
