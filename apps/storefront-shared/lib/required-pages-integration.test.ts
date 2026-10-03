import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import * as jsxRuntime from "react/jsx-runtime";
import { StorefrontContentRepositoryError, type PublicContentV2 } from "@celebix/saas-data";
import * as contentPage from "./content-page.ts";
import * as blogPage from "./blog-page.ts";
import * as locales from "./content-locale.ts";
import * as seo from "./public-seo.ts";
import * as seoRead from "./public-seo-read.ts";

type Node = { type: unknown; props: Record<string, unknown> };
function nodes(value: unknown): Node[] {
  if (!value || typeof value !== "object" || !("props" in value) || !("type" in value)) return [];
  const node = value as Node;
  return [node, ...[node.props.children].flat(Infinity).flatMap(nodes)];
}
class Unavailable extends Error {}
class Redirect extends Error { constructor(readonly location: string) { super("redirect"); } }

const storefront = { hostname: "shop.example.test", primaryHostname: "shop.example.test", canonicalUrl: "https://shop.example.test/", locale: "tr", presentation: { displayName: "Pilot", seo: { allowIndex: true }, theme: {} } };
const settings = { allowIndex: true, eligible: true, socialTitle: null, socialDescription: null, socialImageUrl: null, googleVerification: null, bingVerification: null };
const landing: PublicContentV2 = { id: "11000000-0000-4000-8000-000000000001", kind: "page", requiredPageKey: "blog", slug: "magazadan-haberler", locale: "en-US", title: "Store stories", body: "<p>Meet our makers.</p><script>private()</script>", bodyFormat: "legacy", excerpt: null, seoTitle: "Stories for search", seoDescription: "Saved landing description", publishedAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-02T00:00:00.000Z" };
const post = { id: "11000000-0000-4000-8000-000000000002", kind: "blog_post", slug: "care-guide", locale: "en-US", title: "Jewellery care", bodyFormat: "normalized_html", excerpt: "Care tips", seoTitle: null, seoDescription: null, publishedAt: landing.publishedAt, updatedAt: landing.updatedAt };
type Mode = "published" | "draft" | "not_found" | "unavailable" | "missing" | "wrong_locale";
type Params = { searchParams: Promise<{ lang?: unknown; cursor?: unknown }>; params?: Promise<{ slug: string }> };

async function route(filename: "blog" | "page", options: { mode?: Mode; record?: PublicContentV2; withSeo?: boolean } = {}) {
  const mode = options.mode ?? "published";
  const record = options.record ?? landing;
  const calls: Array<{ name: string; input: Record<string, unknown> }> = [];
  const content = {
    getLocales: async () => ({ defaultLocale: "tr", enabledLocales: ["tr", "en-US"] }),
    listBlogPosts: async (input: Record<string, unknown>) => {
      calls.push({ name: "list", input });
      return { items: [{ ...post, locale: input.locale }], nextCursor: "next-page" };
    },
    getPageV2: async (input: Record<string, unknown>) => { calls.push({ name: "page", input }); return record; },
    ...(mode === "missing" ? {} : { getRequiredPage: async (input: Record<string, unknown>) => {
      calls.push({ name: "required", input });
      if (mode === "not_found" || mode === "unavailable") throw new StorefrontContentRepositoryError(mode);
      return mode === "draft" ? { ...record, publishedAt: null } : mode === "wrong_locale" ? { ...record, locale: "tr" } : record;
    } }),
  };
  const seoReader = options.withSeo === false ? undefined : {
    settings: async () => settings,
    get: async (input: Record<string, unknown>) => {
      calls.push({ name: "seo", input });
      return { settings, links: [], resource: { effectiveTitle: "Published landing SEO", effectiveDescription: "Published search description", effectiveCanonicalPath: "/blog?lang=en-US", allowIndex: false, imageUrl: null } };
    },
  };
  const context = { storefront, design: null, runtime: { content, seo: seoReader } };
  const file = filename === "blog" ? "../app/blog/page.tsx" : "../app/pages/[slug]/page.tsx";
  const source = await readFile(new URL(file, import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  const compiled = { exports: {} as Record<string, (params: Params) => Promise<unknown>> };
  const dependencies: Record<string, unknown> = {
    "react/jsx-runtime": jsxRuntime,
    "next/link": "a",
    "next/navigation": { notFound: () => { throw new Error("not_found"); }, permanentRedirect: (path: string) => { throw new Redirect(path); } },
    "@celebix/saas-data": { StorefrontContentRepositoryError },
    "@/lib/content-page.ts": contentPage,
    "@/lib/blog-page.ts": blogPage,
    "@/lib/content-locale.ts": locales,
    "@/lib/public-seo.ts": seo,
    "@/lib/public-seo-read.ts": seoRead,
    "@/lib/page-context.ts": { resolveStorefrontPage: async () => ({ kind: "active", context }) },
    "@/lib/page-resolution.ts": { requireStorefrontPage: (result: { context: unknown }) => result.context, StorefrontUnavailableError: Unavailable },
  };
  Function("require", "module", "exports", output)((name: string) => {
    if (name in dependencies) return dependencies[name];
    if (name.startsWith("@/components/")) { const component = name.slice("@/components/".length); return { [component]: component }; }
    throw new Error(`unexpected_dependency:${name}`);
  }, compiled, compiled.exports);
  return { exports: compiled.exports, calls };
}
const english = () => ({ searchParams: Promise.resolve({ lang: "en-US" }) });

test("Blog index renders the published editable landing together with existing posts and pagination", async () => {
  const { exports, calls } = await route("blog");
  const tree = nodes(await exports.default!(english()));
  assert.equal(tree.find(({ type }) => type === "h1")?.props.children, "Store stories");
  const html = tree.find(({ props }) => props.dangerouslySetInnerHTML)?.props.dangerouslySetInnerHTML as { __html: string };
  assert.match(html.__html, /Meet our makers/);
  assert.doesNotMatch(html.__html, /script|private/);
  assert.equal(tree.find(({ type }) => type === "h2")?.props.children !== undefined, true);
  assert.equal(tree.some(({ props }) => props.href === "/blog/care-guide?lang=en-US"), true);
  assert.equal(tree.some(({ props }) => props.href === "/blog?lang=en-US&cursor=next-page"), true);
  const request = calls.find(({ name }) => name === "required")?.input;
  assert.equal(request?.hostname, storefront.hostname);
  assert.equal(request?.key, "blog");
  assert.equal(request?.locale, "en-US");
  assert.ok(request?.now instanceof Date);
});

test("Blog index reads the mapped page's saved SEO and uses the blog canonical rather than its slug", async () => {
  const { exports, calls } = await route("blog");
  const metadata = await exports.generateMetadata!(english()) as { title: unknown; description: string; alternates: unknown; robots: unknown };
  assert.deepEqual(metadata.title, { absolute: "Published landing SEO | Pilot" });
  assert.equal(metadata.description, "Published search description");
  assert.deepEqual(metadata.alternates, { canonical: "https://shop.example.test/blog?lang=en-US" });
  assert.deepEqual(metadata.robots, { index: false, follow: false });
  const request = calls.find(({ name }) => name === "seo")?.input;
  assert.equal(request?.kind, "page");
  assert.equal(request?.id, landing.id);
  assert.equal(request?.hostname, storefront.hostname);
  const fallback = await route("blog", { withSeo: false });
  assert.deepEqual((await fallback.exports.generateMetadata!(english()) as { title: unknown }).title, { absolute: "Stories for search | Pilot" });
});

test("missing, unpublished and older readers retain the Blog index without exposing draft introduction", async () => {
  for (const mode of ["not_found", "draft", "missing"] as const) {
    const { exports, calls } = await route("blog", { mode, withSeo: false });
    const tree = nodes(await exports.default!(english()));
    assert.equal(tree.find(({ type }) => type === "h1")?.props.children, "Blog");
    assert.equal(tree.some(({ props }) => props.dangerouslySetInnerHTML), false);
    assert.equal(tree.some(({ props }) => props.href === "/blog/care-guide?lang=en-US"), true);
    assert.deepEqual((await exports.generateMetadata!(english()) as { title: unknown }).title, { absolute: "Blog | Pilot" });
    assert.equal(calls.some(({ name }) => name === "seo"), false);
    if (mode === "missing") assert.equal(calls.some(({ name }) => name === "required"), false);
  }
});

test("Blog landing failures and wrong-language responses remain unavailable instead of hiding reader faults", async () => {
  for (const mode of ["unavailable", "wrong_locale"] as const) {
    const { exports } = await route("blog", { mode });
    await assert.rejects(exports.default!(english()), Unavailable);
  }
  for (const lang of ["fr", ["tr", "en-US"]]) {
    const { exports, calls } = await route("blog");
    await assert.rejects(exports.default!({ searchParams: Promise.resolve({ lang }) }), /not_found/);
    assert.equal(calls.some(({ name }) => name === "required"), false);
  }
});

test("mapped Blog page aliases redirect before SEO lookup and preserve the requested locale", async () => {
  for (const locale of ["tr", "en-US"]) {
    const { exports, calls } = await route("page", { record: { ...landing, locale } });
    const params = { params: Promise.resolve({ slug: landing.slug }), searchParams: Promise.resolve(locale === "tr" ? {} : { lang: locale }) };
    const canonical = locale === "tr" ? "/blog" : "/blog?lang=en-US";
    for (const render of [exports.default!, exports.generateMetadata!]) {
      await assert.rejects(render(params), (error) => error instanceof Redirect && error.location === canonical);
    }
    assert.equal(calls.some(({ name }) => name === "seo"), false);
  }
});

test("ordinary custom pages named blog retain their own page route", async () => {
  const { requiredPageKey: _key, ...custom } = landing;
  const { exports } = await route("page", { record: { ...custom, slug: "blog" }, withSeo: false });
  const params = { params: Promise.resolve({ slug: "blog" }), searchParams: Promise.resolve({ lang: "en-US" }) };
  const metadata = await exports.generateMetadata!(params) as { alternates: unknown };
  assert.deepEqual(metadata.alternates, { canonical: "https://shop.example.test/pages/blog?lang=en-US" });
  assert.equal(nodes(await exports.default!(params)).find(({ type }) => type === "h1")?.props.children, landing.title);
});
