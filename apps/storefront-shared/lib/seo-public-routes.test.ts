import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { createRobotsResponse, createIndexNowKeyResponse, isIndexNowKeyFile } from "./seo-public-routes.ts";
import type { PublicSeoReader } from "./public-seo-read.ts";

const TOKEN = Buffer.alloc(32, 0x42).toString("base64url");
const source = { CELEBIX_DEPLOYMENT_TIER: "staging", CELEBIX_STOREFRONT_PROXY_MODE: "approved_staging", CELEBIX_STOREFRONT_PROXY_TOKEN_B64URL: TOKEN };
const headers = new Headers({ host: "forged.example.test", "x-celebix-storefront-proxy": `p1.${TOKEN}`, "x-forwarded-host": "shop.example.test", "x-forwarded-proto": "https" });
const now = new Date("2026-09-30T12:00:00.000Z");
const settings = { allowIndex: true, eligible: true, hostname: "shop.example.test", indexNowEnabled: true, metaTitle: null, metaDescription: null, socialTitle: null, socialDescription: null, socialImageUrl: null, googleVerification: null, bingVerification: null };
function reader(overrides: Partial<PublicSeoReader> = {}): PublicSeoReader {
  return { get: async () => { throw new Error("unused"); }, settings: async () => settings, key: async () => ({ key: "a".repeat(32) }), ...overrides };
}
test("robots allows eligible primary public pages and keeps private flows out of crawl paths", async () => {
  const result = await createRobotsResponse({ headers, source, now, reader: reader() });
  assert.equal(result.status, 200);
  const body = await result.text();
  assert.match(body, /^User-agent: \*\nAllow: \/\n/);
  for (const path of ["/account", "/cart", "/checkout", "/favorites", "/search", "/api/", "/odeme/"]) assert.ok(body.includes(`Disallow: ${path}\n`));
  assert.match(body, /Sitemap: https:\/\/shop\.example\.test\/sitemap.xml/);
  assert.doesNotMatch(body, /forged/);
});
test("robots denies unknown temporary and disabled-index hosts and unavailable authority", async () => {
  for (const patch of [{ eligible: false }, { allowIndex: false }, { hostname: "different.example.test" }]) {
    const response = await createRobotsResponse({ headers, source, now, reader: reader({ settings: async () => ({ ...settings, ...patch }) }) });
    assert.equal(await response.text(), "User-agent: *\nDisallow: /\n");
  }
  const unavailable = await createRobotsResponse({ headers: new Headers({ host: "shop.example.test" }), source, now, reader: reader() });
  assert.equal(unavailable.status, 503);
  assert.match(await unavailable.text(), /Disallow: \/\n$/);
  const missing = await createRobotsResponse({ headers, source, now, reader: reader({ settings: async () => { throw Object.assign(new Error("not_found"), { code: "not_found" }); } }) });
  assert.equal(missing.status, 404);
});
test("IndexNow serves only the exact key file on its verified primary eligible host", async () => {
  const input = { headers, source, now, reader: reader(), keyFile: `${"a".repeat(32)}.txt` };
  const valid = await createIndexNowKeyResponse(input);
  assert.equal(valid.status, 200);
  assert.equal(valid.headers.get("content-type"), "text/plain; charset=utf-8");
  assert.equal(await valid.text(), "a".repeat(32));
  for (const keyFile of ["a".repeat(32), `${"b".repeat(32)}.txt`, "../secret.txt", "a.txt"]) assert.equal((await createIndexNowKeyResponse({ ...input, keyFile })).status, 404);
  for (const patch of [{ eligible: false }, { indexNowEnabled: false }, { hostname: "different.example.test" }]) assert.equal((await createIndexNowKeyResponse({ ...input, reader: reader({ settings: async () => ({ ...settings, ...patch }) }) })).status, 404);
  assert.equal((await createIndexNowKeyResponse({ ...input, headers: new Headers({ host: "shop.example.test" }) })).status, 503);
  assert.equal((await createIndexNowKeyResponse({ ...input, reader: reader({ key: async () => { throw new Error("database unavailable"); } }) })).status, 503);
});


test("root verification cannot intercept store slugs or differently shaped public keys", async () => {
  for (const keyFile of ["about", "urunler", "products", "robots.txt", `${"A".repeat(32)}.txt`, `${"a".repeat(64)}.txt`, "merchant-key.txt"]) {
    const response = await createIndexNowKeyResponse({ headers, source, now, keyFile, reader: reader({ key: async () => ({ key: keyFile.replace(/\.txt$/, "") }) }) });
    assert.equal(response.status, 404);
    assert.equal(await response.text(), "");
  }
});


test("the root key route serves the known file and returns unknown slugs before runtime lookup", async () => {
  const routeSource = await readFile(new URL("../app/[key]/route.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(routeSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  let runtimeLookups = 0;
  const route: { exports: { GET?: (request: Request, value: { params: Promise<{ key: string }> }) => Promise<Response> } } = { exports: {} };
  Function("require", "module", "exports", compiled)((name: string) => {
    if (name === "next/headers") return { headers: async () => headers };
    if (name === "@/lib/default-runtime.ts") return { resolveDefaultPublicStorefrontRuntime: async () => { runtimeLookups++; return { seo: reader() }; } };
    if (name === "@/lib/seo-public-routes.ts") return { isIndexNowKeyFile, createIndexNowKeyResponse: (input: Parameters<typeof createIndexNowKeyResponse>[0]) => createIndexNowKeyResponse({ ...input, source }) };
    throw new Error(`unexpected_import:${name}`);
  }, route, route.exports);
  const request = new Request("https://shop.example.test/");
  const unknown = await route.exports.GET!(request, { params: Promise.resolve({ key: "about" }) });
  assert.equal(unknown.status, 404);
  assert.equal(runtimeLookups, 0);
  const valid = await route.exports.GET!(request, { params: Promise.resolve({ key: `${"a".repeat(32)}.txt` }) });
  assert.equal(valid.status, 200);
  assert.equal(await valid.text(), "a".repeat(32));
  const otherTenantKey = await route.exports.GET!(request, { params: Promise.resolve({ key: `${"b".repeat(32)}.txt` }) });
  assert.equal(otherTenantKey.status, 404);
});
