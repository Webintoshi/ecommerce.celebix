import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { PublicStorefrontRepositoryError, StorefrontContentRepositoryError } from "@celebix/saas-data";
import type { PublicStorefront } from "@celebix/saas-contracts";
import * as sitemap from "./sitemap.ts";
import * as seoRoutes from "./seo-public-routes.ts";
import * as seoRead from "./public-seo-read.ts";
import * as helpers from "./sitemap-public-routes.ts";

const HOST = "shop.example.test", TIME = "2026-10-25T12:00:00.000Z";
const TOKEN = Buffer.alloc(32, 0x42).toString("base64url");
const source = { CELEBIX_DEPLOYMENT_TIER: "staging", CELEBIX_STOREFRONT_PROXY_MODE: "approved_staging", CELEBIX_STOREFRONT_PROXY_TOKEN_B64URL: TOKEN };
const trusted = () => new Headers({ host: "untrusted.internal", "x-celebix-storefront-proxy": `p1.${TOKEN}`, "x-forwarded-host": HOST, "x-forwarded-proto": "https" });
const storefront: PublicStorefront = { schemaVersion: 2, id: "11000000-0000-4111-8111-000000000001", name: "Fixture", slug: "fixture", hostname: HOST, primaryHostname: HOST, canonicalUrl: `https://${HOST}/`, currency: "TRY", locale: "tr", themeKey: "starter", presentation: { schemaVersion: 1, displayName: "Fixture", theme: { colorScheme: "neutral", headingStyle: "serif", productCardStyle: "editorial", productImageRatio: "portrait", homeProductLimit: 8, showBrandStory: true }, hero: { enabled: true, headline: "Fixture", body: "Fixture", destination: "/products" }, seo: { allowIndex: true } } };
const settings = { allowIndex: true, eligible: true, hostname: HOST, indexNowEnabled: true, metaTitle: null, metaDescription: null, socialTitle: null, socialDescription: null, socialImageUrl: null, googleVerification: null, bingVerification: null };
const entries = [{ path: "/", updatedAt: TIME, changeFrequency: "weekly" }, { path: "/urun/ring", updatedAt: TIME, changeFrequency: "monthly" }] as const;
type Options = { headers?: Headers; runtime?: "missing"; seo?: "missing" | "unavailable" | "not_found"; allowIndex?: unknown; eligible?: unknown; seoHostname?: string; store?: Partial<PublicStorefront>; storeError?: "not_found" | "unavailable"; pageError?: "not_found" | "invalid_input" | "unavailable" };

async function route(file: "index" | "key" | "legacy", options: Options = {}) {
  const calls = { runtime: 0, forbidden: 0, store: 0, settings: 0, index: 0, page: 0 };
  const forbidden = async () => { calls.forbidden++; throw new Error("unrelated_theme_or_commerce_unavailable"); };
  const runtime = {
    repository: { getPublicStorefront: async (input: { hostname: string; now: Date }) => { calls.store++; assert.equal(input.hostname, options.headers?.get("x-forwarded-host") ?? HOST); assert.ok(Number.isFinite(input.now.getTime())); if (options.storeError) throw new PublicStorefrontRepositoryError(options.storeError); return { ...storefront, ...options.store }; }, getPublicStorefrontDesign: forbidden, resolveCampaignHome: forbidden },
    whatsappOrders: { getForHost: forbidden }, analytics: { getTrackerConfig: forbidden },
    content: {
      getSitemapIndex: async (input: { hostname: string; now: Date }) => { calls.index++; assert.equal(input.hostname, HOST); assert.ok(Number.isFinite(input.now.getTime())); return [{ kind: "products", page: 0 }, { kind: "content", page: 0 }]; },
      getSitemapPage: async (input: { hostname: string; now: Date; kind: string; page: number }) => { calls.page++; assert.equal(input.hostname, HOST); assert.ok(Number.isFinite(input.now.getTime())); assert.ok(input.kind === "products" || input.kind === "content"); assert.ok(Number.isSafeInteger(input.page)); if (options.pageError) throw new StorefrontContentRepositoryError(options.pageError); return entries; },
    },
    seo: options.seo === "missing" ? undefined : { get: forbidden, key: async () => ({ key: "a".repeat(32) }), settings: async () => { calls.settings++; if (options.seo === "unavailable" || options.seo === "not_found") throw Object.assign(new Error("seo_unavailable"), { code: options.seo }); return { ...settings, ...(Object.hasOwn(options, "allowIndex") ? { allowIndex: options.allowIndex } : {}), ...(Object.hasOwn(options, "eligible") ? { eligible: options.eligible } : {}), ...(options.seoHostname ? { hostname: options.seoHostname } : {}) }; } },
  };
  const files = { index: "../app/sitemap.xml/route.ts", key: "../app/[key]/route.ts", legacy: "../app/sitemaps/[kind]/[page]/route.ts" };
  const compiled = ts.transpileModule(await readFile(new URL(files[file], import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} as { GET: (request: Request, args: { params: Promise<Record<string, string>> }) => Promise<Response> } };
  const dependencies: Record<string, unknown> = {
    "next/headers": { headers: async () => options.headers ?? trusted() },
    "@celebix/saas-data": { StorefrontContentRepositoryError },
    "@/lib/default-runtime.ts": { resolveDefaultPublicStorefrontRuntime: async () => { calls.runtime++; return options.runtime === "missing" ? null : runtime; } },
    "@/lib/page-context.ts": { resolveStorefrontPage: forbidden },
    "@/lib/page-resolution.ts": { requireStorefrontPage: forbidden, StorefrontUnavailableError: Error },
    "@/lib/public-seo-read.ts": seoRead,
    "@/lib/sitemap.ts": sitemap,
    "@/lib/seo-public-routes.ts": { ...seoRoutes, createIndexNowKeyResponse: (input: Parameters<typeof seoRoutes.createIndexNowKeyResponse>[0]) => seoRoutes.createIndexNowKeyResponse({ ...input, source }) },
    "@/lib/sitemap-public-routes.ts": Object.fromEntries(Object.entries(helpers).map(([name, value]) => [name, name === "createSitemapIndexResponse" || name === "createSitemapPageResponse" ? (input: object) => (value as (input: object) => unknown)({ ...input, source }) : value])),
  };
  Function("require", "module", "exports", compiled)((name: string) => { if (name in dependencies) return dependencies[name]; throw new Error(`unexpected_import:${name}`); }, module, module.exports);
  return { get: (params: Record<string, string> = {}) => module.exports.GET(new Request("https://forged.example.test/"), { params: Promise.resolve(params) }), calls };
}

test("sitemap index GET serves root-level shard files without theme or commerce reads", async () => {
  const selected = await route("index");
  const response = await selected.get();
  assert.equal(response.status, 200); assert.equal(response.headers.get("content-type"), "application/xml; charset=utf-8");
  const body = await response.text(); assert.match(body, /<loc>https:\/\/shop\.example\.test\/sitemap-products-0\.xml<\/loc>/); assert.match(body, /<loc>https:\/\/shop\.example\.test\/sitemap-content-0\.xml<\/loc>/); assert.doesNotMatch(body, /forged|sitemaps\//); assert.equal(selected.calls.forbidden, 0); assert.equal(selected.calls.index, 1);
});
test("root shard GET emits canonical XML for a valid shard filename", async () => {
  const selected = await route("key"), response = await selected.get({ key: "sitemap-products-0.xml" });
  assert.equal(response.status, 200); assert.equal(response.headers.get("content-type"), "application/xml; charset=utf-8");
  const body = await response.text(); assert.match(body, /<loc>https:\/\/shop\.example\.test\/urun\/ring<\/loc>/); assert.match(body, /<lastmod>2026-10-25T12:00:00.000Z<\/lastmod>/); assert.doesNotMatch(body, /forged/); assert.equal(selected.calls.forbidden, 0); assert.equal(selected.calls.page, 1);
});
test("legacy shard URLs redirect only to a strict same-origin root file", async () => {
  const selected = await route("legacy"), response = await selected.get({ kind: "content", page: "12" });
  assert.equal(response.status, 308); assert.equal(response.headers.get("location"), "/sitemap-content-12.xml"); assert.equal(await response.text(), "");
  for (const params of [{ kind: "products", page: "01" }, { kind: "other", page: "0" }, { kind: "content", page: "10000" }, { kind: "//evil.test", page: "0" }]) assert.equal((await selected.get(params)).status, 404);
});
test("root sitemap filename dispatch rejects malformed names before runtime lookup", async () => {
  const selected = await route("key");
  for (const key of ["sitemap-products-00.xml", "sitemap-products-10000.xml", "sitemap-products--1.xml", "sitemap-products-0", "sitemap-other-0.xml", "Sitemap-products-0.xml", "sitemap-products-0.xml?host=evil", "../sitemap-products-0.xml", "about"]) assert.equal((await selected.get({ key })).status, 404, key);
  assert.equal(selected.calls.runtime, 0);
});
test("IndexNow file GET remains available alongside root sitemap dispatch", async () => {
  const selected = await route("key");
  const response = await selected.get({ key: `${"a".repeat(32)}.txt` }); assert.equal(response.status, 200); assert.equal(await response.text(), "a".repeat(32));
  assert.equal((await selected.get({ key: `${"b".repeat(32)}.txt` })).status, 404);
});
test("aliases noindex and mismatched SEO authority cannot publish sitemap entries", async () => {
  for (const options of [{ store: { primaryHostname: "primary.example.test", canonicalUrl: "https://primary.example.test/" }, eligible: false, seoHostname: "primary.example.test" }, { allowIndex: false }, { eligible: false }, { allowIndex: "true" }, { eligible: "true" }, { allowIndex: 1 }, { eligible: null }, { allowIndex: undefined }, { seoHostname: "other.example.test" }] satisfies Options[]) {
    const index = await route("index", options), response = await index.get(); assert.equal(response.status, 200); assert.doesNotMatch(await response.text(), /<sitemap>/); assert.equal(index.calls.index, 0);
    const page = await route("key", options); assert.equal((await page.get({ key: "sitemap-content-0.xml" })).status, 404); assert.equal(page.calls.page, 0);
  }
});
test("missing trusted host runtime SEO or unavailable SEO fails closed", async () => {
  for (const options of [{ headers: new Headers({ host: HOST }) }, { headers: new Headers({ ...Object.fromEntries(trusted()), "x-forwarded-proto": "http" }) }, { runtime: "missing" }, { seo: "missing" }, { seo: "unavailable" }, { seo: "not_found" }] satisfies Options[]) {
    for (const file of ["index", "key"] as const) { const selected = await route(file, options), response = await selected.get({ key: "sitemap-content-0.xml" }); assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /<loc>/); assert.equal(selected.calls.index + selected.calls.page, 0); }
  }
});
test("unknown hosts and inconsistent store canonicals fail before publishing a shard", async () => {
  for (const [options, status] of [[{ storeError: "not_found" }, 404], [{ storeError: "unavailable" }, 503], [{ store: { hostname: "other.example.test" } }, 503], [{ store: { canonicalUrl: "https://other.example.test/" } }, 503]] as const) {
    for (const file of ["index", "key"] as const) { const selected = await route(file, options), response = await selected.get({ key: "sitemap-content-0.xml" }); assert.equal(response.status, status); assert.equal(selected.calls.index + selected.calls.page, 0); }
  }
});
test("root shard GET preserves not-found and unavailable reader outcomes", async () => {
  for (const [pageError, status] of [["not_found", 404], ["invalid_input", 404], ["unavailable", 503]] as const) { const selected = await route("key", { pageError }); assert.equal((await selected.get({ key: "sitemap-content-9999.xml" })).status, status); }
});
