import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import * as jsxRuntime from "react/jsx-runtime";
import * as seo from "./public-seo.ts";
import * as seoRead from "./public-seo-read.ts";
import * as routes from "./storefront-routes.ts";
import * as productSeo from "./product-seo.ts";
import * as contentSeo from "./blog-page.ts";
import * as contentPage from "./content-page.ts";
import * as locales from "./content-locale.ts";
import * as sioraTheme from "../themes/siora/theme.ts";
import * as sioraProductOptions from "../themes/siora/product-options.ts";
import * as alplerTheme from "../themes/alpler/theme.ts";
import * as guzideTheme from "../themes/guzide/theme.ts";
import * as lilyumTheme from "../themes/lilyum/theme.ts";
import * as catalogQuery from "./product-catalog-query.ts";

type Node = { type: unknown; props: Record<string, unknown> };
function nodes(value: unknown): Node[] {
  if (!value || typeof value !== "object" || !("props" in value) || !("type" in value)) return [];
  const node = value as Node;
  return [node, ...[node.props.children].flat(Infinity).flatMap(nodes)];
}
const storefront = { hostname: "shop.example.test", primaryHostname: "shop.example.test", canonicalUrl: "https://shop.example.test/", locale: "tr", presentation: { schemaVersion: 1, displayName: "Pilot", seo: { allowIndex: false, title: "Legacy title", description: "Legacy description" }, theme: {} } };
const settings = { version: 2, allowIndex: true, eligible: true, hostname: "shop.example.test", metaTitle: "New store title", metaDescription: "New store description", indexNowEnabled: true, socialTitle: null, socialDescription: null, socialImageUrl: null, googleVerification: null, bingVerification: null };
const resource = { id: "real-id", effectiveTitle: "Saved SEO", effectiveDescription: "Saved description", effectiveCanonicalPath: "/kategori/canonical", allowIndex: false, imageUrl: null };
const links = [{ anchorText: "Published care page", path: "/pages/care" }];
const content = { id: "real-id", slug: "news", locale: "en-US", title: "Visible news", body: "<p>Body</p>", bodyFormat: "normalized_html", excerpt: null, seoTitle: null, seoDescription: null, publishedAt: "2026-09-29T00:00:00.000Z", updatedAt: "2026-09-30T00:00:00.000Z" };
class RepositoryError extends Error { constructor(readonly code: string) { super(code); } }

async function pageModule(filename: string, kind: string, withSeo = true, storefrontId = "unrelated-store") {
  const calls: Array<{ kind: string; id: string; hostname: string }> = [];
  const seoReader = { settings: async () => settings, key: async () => ({ key: null }), get: async (input: { kind: string; id: string; hostname: string }) => { calls.push(input); return { resource: { ...resource, effectiveCanonicalPath: kind === "category" ? "/kategori/canonical" : kind === "product" ? "/urun/canonical" : `/${kind === "blog" ? "blog" : "pages"}/canonical?lang=en-US` }, settings, links }; } };
  const context = { storefront: { ...storefront, id: storefrontId }, design: { brand: { favicon: null } }, campaign: null, tracker: null, runtime: { ...(withSeo ? { seo: seoReader } : {}), repository: { listPublicProductsByCategory: async () => ({ category: { id: "real-id", slug: "rings", name: "Visible category" }, items: [] }), getPublicProductBySlug: async () => ({ id: "real-id", slug: "ring", title: "Visible ring", priceCents: 12500, currency: "TRY", available: true, media: [], variants: [{ id: "variant", priceCents: 12500, available: true }] }) }, content: { getLocales: async () => ({ defaultLocale: "tr", enabledLocales: ["tr", "en-US"] }), getPageV2: async () => ({ ...content, kind: "page" }), getBlogPost: async () => ({ ...content, kind: "blog_post" }) } } };
  const source = await readFile(new URL(filename, import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const compiled: { exports: Record<string, (...args: never[]) => Promise<unknown>> } = { exports: {} };
  const dependencies: Record<string, unknown> = {
    "react/jsx-runtime": jsxRuntime, "next/link": "a", "next/navigation": { notFound: () => { throw new Error("not_found"); }, permanentRedirect: () => { throw new Error("redirect"); } },
    "@/lib/public-seo.ts": seo, "@/lib/public-seo-read.ts": seoRead, "@/lib/storefront-routes.ts": routes, "@/lib/product-seo.ts": productSeo, "@/lib/blog-page.ts": contentSeo, "@/lib/content-page.ts": contentPage, "@/lib/content-locale.ts": locales, "@/lib/product-catalog-query.ts": catalogQuery,
    "@/lib/page-context.ts": { resolveStorefrontPage: async () => ({ kind: "active", context }) }, "@/lib/page-resolution.ts": { requireStorefrontPage: (value: { context: unknown }) => value.context, StorefrontUnavailableError: class extends Error {} },
    "@celebix/saas-data": { PublicStorefrontRepositoryError: RepositoryError, StorefrontContentRepositoryError: RepositoryError }, "@celebix/saas-contracts": {}, "@celebix/storefront-design-ui": {},
    "@/lib/policy-page.ts": { buildPublicPolicyPage: () => null }, "@/lib/analytics/events.ts": { productViewEvent: () => ({ name: "product_view" }) },
    "../../../themes/siora/theme.ts": sioraTheme,
    "../../../themes/siora/SioraProductDetailExperience": { SioraProductDetailExperience: "SioraProductDetailExperience" },
    "../../../themes/siora/product-options.ts": sioraProductOptions,
    "../../../themes/alpler/theme.ts": alplerTheme,
    "../../../themes/guzide/theme.ts": guzideTheme,
    "../../../themes/lilyum/theme.ts": lilyumTheme,
    "../../../themes/lilyum/LilyumProductDetailExperience": { LilyumProductDetailExperience: "LilyumProductDetailExperience" },
    "../../../themes/guzide/guzide-product-explorer.module.css": { __esModule: true, default: { breadcrumb: "guzide-breadcrumb", section: "guzide-section" } },
    "../../../themes/guzide/GuzideProductDetailExperience": { GuzideProductDetailExperience: "GuzideProductDetailExperience" },
  };
  Function("require", "module", "exports", output)((name: string) => {
    if (name in dependencies) return dependencies[name];
    if (name.startsWith("@/components/")) { const component = name.slice("@/components/".length); return { [component]: component }; }
    if (name === "../themes/lilyum/theme.ts") return { lilyumThemeFor: () => undefined };
    if (name === "../themes/lilyum/LilyumHome") return { LilyumHome: () => null };
    throw new Error(`unexpected_dependency:${name}`);
  }, compiled, compiled.exports);
  return { exports: compiled.exports, calls };
}

test("category route reads the actual category SEO record and renders its published links", async () => {
  const { exports, calls } = await pageModule("../app/categories/[slug]/render-category-page.tsx", "category");
  const params = Promise.resolve({ slug: "rings" });
  const metadata = await exports.generateCategoryMetadata!({ params } as never) as { title: unknown; description: string; alternates: unknown; robots: unknown };
  assert.deepEqual(metadata.title, { absolute: "Saved SEO | Pilot" });
  assert.equal(metadata.description, "Saved description");
  assert.deepEqual(metadata.alternates, { canonical: "https://shop.example.test/kategori/canonical" });
  assert.deepEqual(metadata.robots, { index: false, follow: false });
  assert.equal(calls[0]?.kind, "category");
  assert.equal(calls[0]?.id, "real-id");
  assert.equal(calls[0]?.hostname, "shop.example.test");
  const tree = await exports.renderCategoryPage!({ params, routeVariant: "localized" } as never);
  assert.deepEqual(nodes(tree).find(({ type }) => type === "SeoRelatedLinks")?.props.links, links);
});

test("product page and localized content use their saved canonical and indexing fields", async () => {
  for (const [filename, kind, slug, canonical] of [["../app/products/[slug]/page.tsx", "product", "ring", "https://shop.example.test/urun/canonical"], ["../app/pages/[slug]/page.tsx", "page", "news", "https://shop.example.test/pages/canonical?lang=en-US"], ["../app/blog/[slug]/page.tsx", "blog", "news", "https://shop.example.test/blog/canonical?lang=en-US"]]) {
    const { exports, calls } = await pageModule(filename!, kind!);
    const metadata = await exports.generateMetadata!({ params: Promise.resolve({ slug }), searchParams: Promise.resolve({ lang: "en-US" }) } as never) as { alternates: unknown; title: unknown; robots: unknown };
    assert.deepEqual(metadata.alternates, { canonical });
    assert.deepEqual(metadata.title, { absolute: "Saved SEO | Pilot" });
    assert.deepEqual(metadata.robots, { index: false, follow: false });
    assert.equal(calls[0]?.kind, kind);
    assert.equal(calls[0]?.id, "real-id");
  }
});

test("home metadata retains legacy SEO before reader registration and reads new store settings afterward", async () => {
  for (const enabled of [false, true]) {
    const { exports } = await pageModule("../app/page.tsx", "page", enabled);
    const metadata = await exports.generateMetadata!() as { title: unknown; description: string; robots: unknown };
    assert.deepEqual(metadata.title, { absolute: enabled ? "New store title" : "Legacy title" });
    assert.equal(metadata.description, enabled ? "New store description" : "Legacy description");
    assert.deepEqual(metadata.robots, { index: enabled, follow: enabled });
  }
});


test("tenant product experiences preserve published SEO while only the resolved Siora tenant is immersive", async () => {
  const guzideId = "a828862c-4cc1-475a-89cc-5fbee31eb43f";
  for (const id of [sioraTheme.SIORA_STOREFRONT_ID, alplerTheme.ALPLER_STOREFRONT_ID, guzideId, lilyumTheme.LILYUM_STOREFRONT_ID, "89e1e15f-8282-4e9b-ae3e-f417501bd54b", "a828862c-4cc1-475a-89cc-5fbee31eb4400", "unrelated-store"]) {
    const { exports } = await pageModule("../app/products/[slug]/page.tsx", "product", true, id);
    const tree = await exports.renderProductPage!({ params: Promise.resolve({ slug: "ring" }), routeVariant: "localized" } as never);
    const rendered = nodes(tree);
    assert.equal(rendered.some(({ type }) => type === "SioraProductDetailExperience"), id === sioraTheme.SIORA_STOREFRONT_ID);
    assert.equal(rendered.some(({ type }) => type === "GuzideProductDetailExperience"), id === guzideId);
    assert.equal(rendered.some(({ type }) => type === "LilyumProductDetailExperience"), id === lilyumTheme.LILYUM_STOREFRONT_ID);
    assert.equal(rendered.some(({ type }) => type === "ProductDetailExperience"), id !== sioraTheme.SIORA_STOREFRONT_ID && id !== guzideId && id !== lilyumTheme.LILYUM_STOREFRONT_ID);
    const experiences = rendered.filter(({ type }) => type === "SioraProductDetailExperience" || type === "GuzideProductDetailExperience" || type === "LilyumProductDetailExperience" || type === "ProductDetailExperience");
    assert.equal(experiences.length, 1);
    assert.equal((experiences[0]?.props.product as { id: string }).id, "real-id");
    assert.equal(experiences[0]?.props.locale, "tr");
    assert.equal(rendered.find(({ type }) => type === "StorefrontFrame")?.props.immersiveProduct, id === sioraTheme.SIORA_STOREFRONT_ID);
    assert.deepEqual(rendered.find(({ type }) => type === "SeoRelatedLinks")?.props.links, links);
    const schemas = rendered.filter(({ type }) => type === "SeoStructuredData").map(({ props }) => props.value as Record<string, unknown>);
    const productSchema = schemas.find((value) => value["@type"] === "Product");
    assert.equal(productSchema?.url, "https://shop.example.test/urun/canonical");
    assert.equal(productSchema?.["@id"], "https://shop.example.test/urun/canonical#product");
    assert.deepEqual((productSchema?.offers as { price: string; url: string }[]).map(({ price, url }) => ({ price, url })), [{ price: "125.00", url: "https://shop.example.test/urun/canonical" }]);
  }
});
