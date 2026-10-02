import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import * as jsxRuntime from "react/jsx-runtime";
import * as routes from "../lib/storefront-routes.ts";
import * as catalogQuery from "../lib/product-catalog-query.ts";
import * as seo from "../lib/public-seo.ts";
import * as seoRead from "../lib/public-seo-read.ts";
import * as guzide from "../themes/guzide/theme.ts";
import * as siora from "../themes/siora/theme.ts";
import * as alpler from "../themes/alpler/theme.ts";

const GUZIDE = "a828862c-4cc1-475a-89cc-5fbee31eb43f";
const navigation = { items: [{ name: "Admin Kolyeler", slug: "kolyeler", children: [] }] };
type Node = { type: unknown; props: Record<string, unknown> };
function nodes(value: unknown): Node[] {
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Node;
  return [node, ...[node.props.children].flat(Infinity).flatMap(nodes)];
}
class RepositoryError extends Error { constructor(readonly code: string) { super(code); } }
async function loadRoute(id: string, options: { queryAvailable?: boolean; queryError?: Error; savedSeo?: boolean } = {}, filename = "../app/categories/[slug]/render-category-page.tsx") {
  const listCalls: Record<string, unknown>[] = [], queryCalls: Record<string, unknown>[] = [];
  const storefront = { id, hostname: "guzide.example.test", canonicalUrl: "https://guzide.example.test/", locale: "tr", presentation: { displayName: "Güzide Kuyumcu", navigation, theme: { productCardStyle: "compact", productImageRatio: "portrait" }, seo: { allowIndex: true } } };
  const product = { id: "server-product" };
  const repository = {
    async listPublicProductsByCategory(input: Record<string, unknown>) { listCalls.push(input); return { category: { id: "real-category", slug: "kolyeler", name: "Admin Kolyeler" }, items: [product] }; },
    ...(options.queryAvailable === false ? {} : { async queryPublicCatalog(input: Record<string, unknown>) { queryCalls.push(input); if (options.queryError) throw options.queryError; return { items: [product], total: 61, nextOffset: 48 }; } }),
  };
  const settings = { version: 2, allowIndex: true, eligible: true, hostname: storefront.hostname, metaTitle: null, metaDescription: null, indexNowEnabled: false, socialTitle: null, socialDescription: null, socialImageUrl: null, googleVerification: null, bingVerification: null };
  const seoSelection = { resource: { id: "real-category", effectiveTitle: "Kayıtlı kategori", effectiveDescription: "Kayıtlı açıklama", effectiveCanonicalPath: "/kategori/ozel-kolyeler", allowIndex: false, imageUrl: null }, settings, links: [{ anchorText: "Bakım bilgileri", path: "/pages/bakim" }] };
  const context = { storefront, design: {}, runtime: { repository, ...(options.savedSeo ? { seo: { async get() { return seoSelection; } } } : {}) } };
  const dependencies: Record<string, unknown> = {
    "react/jsx-runtime": jsxRuntime, "next/link": "a", "next/navigation": { notFound() { throw new Error("not_found"); }, permanentRedirect(destination: string) { throw new Error(`redirect:${destination}`); } },
    "@celebix/saas-data": { PublicStorefrontRepositoryError: RepositoryError },
    "@/lib/public-seo.ts": seo, "@/lib/public-seo-read.ts": seoRead, "@/lib/storefront-routes.ts": routes, "@/lib/product-catalog-query.ts": catalogQuery,
    "@/lib/page-context.ts": { async resolveStorefrontPage() { return { kind: "active", context }; } }, "@/lib/page-resolution.ts": { requireStorefrontPage(value: { context: unknown }) { return value.context; } },
    "../../../themes/siora/theme.ts": siora, "../../../themes/alpler/theme.ts": alpler, "../../../themes/guzide/theme.ts": guzide,
    "../../themes/siora/theme.ts": siora, "../../themes/alpler/theme.ts": alpler, "../../themes/guzide/theme.ts": guzide,
    "../../../themes/guzide/guzide-product-explorer.module.css": { __esModule: true, default: { breadcrumb: "guzide-breadcrumb", section: "guzide-section" } },
    "../../themes/guzide/guzide-product-explorer.module.css": { __esModule: true, default: { section: "guzide-section" } },
  };
  const source = await readFile(new URL(filename, import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const module: { exports: Record<string, (...args: never[]) => Promise<unknown>> } = { exports: {} };
  Function("require", "module", "exports", output)((name: string) => {
    if (name in dependencies) return dependencies[name];
    if (name.startsWith("@/components/")) { const component = name.slice("@/components/".length); return { [component]: component }; }
    throw new Error(`unexpected_dependency:${name}`);
  }, module, module.exports);
  return { module: module.exports, listCalls, queryCalls, navigation, product };
}

test("Güzide category queries the real validated category and existing URL filters with 24-item paging", async () => {
  const { module, listCalls, queryCalls, product } = await loadRoute(GUZIDE);
  const tree = await module.renderCategoryPage!({ params: Promise.resolve({ slug: "kolyeler" }), routeVariant: "localized", searchParams: Promise.resolve({ q: "  taşlı  ", filter: "available", sort: "price-asc", offset: "24" }) } as never);
  const explorer = nodes(tree).find(({ type }) => type === "ProductExplorer");
  assert.ok(explorer, "approved Güzide catalog is selected");
  assert.equal(listCalls[0]?.slug, "kolyeler");
  assert.deepEqual(queryCalls.map(({ categorySlug, query, filter, order, offset, limit }) => ({ categorySlug, query, filter, order, offset, limit })), [{ categorySlug: "kolyeler", query: "taşlı", filter: "available", order: "price-asc", offset: 24, limit: 24 }]);
  assert.equal(explorer.props.visualTheme, "guzide-deniz");
  assert.deepEqual(explorer.props.catalog, { title: "Admin Kolyeler", slug: "kolyeler", navigation });
  assert.deepEqual(explorer.props.products, [product]);
  assert.equal(explorer.props.total, 61);
  assert.equal(explorer.props.nextOffset, 48);
  assert.equal(explorer.props.path, "/kategori/kolyeler");
});

test("Unrelated, Siora and Alpler category pages keep their original 48-item repository and grid behavior", async () => {
  for (const id of ["unrelated", "a828862c-4cc1-475a-89cc-5fbee31eb4400", siora.SIORA_STOREFRONT_ID, alpler.ALPLER_STOREFRONT_ID]) {
    const { module, listCalls, queryCalls } = await loadRoute(id);
    const tree = await module.renderCategoryPage!({ params: Promise.resolve({ slug: "kolyeler" }), routeVariant: "localized", searchParams: Promise.resolve({ filter: "available", offset: "24" }) } as never);
    assert.equal(listCalls[0]?.limit, 48);
    assert.equal(queryCalls.length, 0);
    assert.equal(nodes(tree).some(({ type }) => type === "ProductExplorer"), false);
    assert.equal(nodes(tree).some(({ type }) => type === "ProductGrid"), true);
  }
});

test("Güzide unsupported query inputs normalize before reaching the public repository", async () => {
  const { module, queryCalls } = await loadRoute(GUZIDE);
  await module.renderCategoryPage!({ params: Promise.resolve({ slug: "kolyeler" }), routeVariant: "localized", searchParams: Promise.resolve({ q: "bad\u0000input", filter: "gold-weight", sort: "stock-count", offset: "25" }) } as never);
  assert.deepEqual(queryCalls.map(({ query, filter, order, offset }) => ({ query, filter, order, offset })), [{ query: "", filter: "all", order: "featured", offset: 0 }]);
});

test("Güzide category query preserves unavailable and not-found semantics", async () => {
  const unavailable = await loadRoute(GUZIDE, { queryAvailable: false });
  await assert.rejects(unavailable.module.renderCategoryPage!({ params: Promise.resolve({ slug: "kolyeler" }), routeVariant: "localized" } as never), /public_catalog_query_unavailable/u);
  for (const code of ["not_found", "invalid_input", "unavailable"]) {
    const failing = await loadRoute(GUZIDE, { queryError: new RepositoryError(code) });
    await assert.rejects(failing.module.renderCategoryPage!({ params: Promise.resolve({ slug: "kolyeler" }), routeVariant: "localized" } as never), code === "unavailable" ? /unavailable/u : /not_found/u);
  }
});

test("Güzide product index selects the approved catalog while other tenants retain their visual themes", async () => {
  for (const id of [GUZIDE, "unrelated", siora.SIORA_STOREFRONT_ID, alpler.ALPLER_STOREFRONT_ID]) {
    const { module } = await loadRoute(id, {}, "../app/products/page.tsx");
    const tree = await module.renderProductsPage!("localized" as never, Promise.resolve({}) as never);
    const explorer = nodes(tree).find(({ type }) => type === "ProductExplorer");
    assert.ok(explorer);
    assert.equal(explorer.props.visualTheme, id === GUZIDE ? "guzide-deniz" : id === siora.SIORA_STOREFRONT_ID ? "siora-deniz" : id === alpler.ALPLER_STOREFRONT_ID ? "alpler-deniz" : undefined);
    assert.deepEqual(explorer.props.catalog, id === GUZIDE ? { title: "Ürünler", navigation } : undefined);
  }
});

test("Localized and legacy category wrappers both forward the original query promise", async () => {
  for (const [filename, variant] of [["../app/kategori/[slug]/page.tsx", "localized"], ["../app/categories/[slug]/page.tsx", "legacy"]]) {
    const source = await readFile(new URL(filename!, import.meta.url), "utf8");
    const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const params = Promise.resolve({ slug: "kolyeler" }), searchParams = Promise.resolve({ filter: "available", offset: "24" });
    const module: { exports: { default?: (value: unknown) => unknown } } = { exports: {} };
    Function("require", "module", "exports", output)(() => ({ renderCategoryPage: (value: unknown) => value }), module, module.exports);
    assert.deepEqual(module.exports.default?.({ params, searchParams }), { params, searchParams, routeVariant: variant });
  }
});

test("Güzide catalog and unchanged tenant categories retain saved canonical, robots and breadcrumb data", async () => {
  for (const id of [GUZIDE, "unrelated", siora.SIORA_STOREFRONT_ID, alpler.ALPLER_STOREFRONT_ID]) {
    const { module } = await loadRoute(id, { savedSeo: true });
    const params = Promise.resolve({ slug: "kolyeler" });
    const metadata = await module.generateCategoryMetadata!({ params } as never) as { title: unknown; description: string; alternates: unknown; robots: unknown };
    assert.deepEqual(metadata.title, { absolute: "Kayıtlı kategori | Güzide Kuyumcu" });
    assert.equal(metadata.description, "Kayıtlı açıklama");
    assert.deepEqual(metadata.alternates, { canonical: "https://guzide.example.test/kategori/ozel-kolyeler" });
    assert.deepEqual(metadata.robots, { index: false, follow: false });
    const tree = await module.renderCategoryPage!({ params, routeVariant: "localized", searchParams: Promise.resolve({ sort: "price-asc", offset: "24" }) } as never);
    const schema = nodes(tree).find(({ type }) => type === "SeoStructuredData")?.props.value as { itemListElement: Array<{ item: string }> };
    assert.equal(schema.itemListElement[1]?.item, "https://guzide.example.test/kategori/ozel-kolyeler");
    assert.deepEqual(nodes(tree).find(({ type }) => type === "SeoRelatedLinks")?.props.links, [{ anchorText: "Bakım bilgileri", path: "/pages/bakim" }]);
  }
});
