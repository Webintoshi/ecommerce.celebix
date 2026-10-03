import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import * as jsxRuntime from "react/jsx-runtime";
import { isCatalogSearchCursor } from "../../../packages/saas-data/src/catalog-search/common.ts";
import * as guzide from "../themes/guzide/theme.ts";

const GUZIDE = "a828862c-4cc1-475a-89cc-5fbee31eb43f";
const cursor = `m1.${"a".repeat(64)}.48`;
type Node = { type: unknown; props: Record<string, unknown> };
function nodes(value: unknown): Node[] {
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Node;
  return [node, ...[node.props.children].flat(Infinity).flatMap(nodes)];
}

async function loadSearch(id: string) {
  const calls: Record<string, unknown>[] = [];
  const products = [{ id: "real-search-product" }];
  const context = { storefront: { id, hostname: "guzide.example.test", locale: "tr", presentation: { theme: { productCardStyle: "compact", productImageRatio: "portrait" } } }, design: {}, runtime: { content: { async search(input: Record<string, unknown>) { calls.push(input); return { items: products, nextCursor: cursor }; } } } };
  const dependencies: Record<string, unknown> = {
    "react/jsx-runtime": jsxRuntime, "next/link": "a", "@celebix/saas-data": { isCatalogSearchCursor },
    "@/lib/page-context.ts": { async resolveStorefrontPage() { return { kind: "active", context }; } }, "@/lib/page-resolution.ts": { requireStorefrontPage(value: { context: unknown }) { return value.context; } },
    "../../themes/guzide/theme.ts": guzide,
    "../../themes/guzide/guzide-product-explorer.module.css": { __esModule: true, default: { catalog: "guzide-catalog", products: "guzide-products" } },
  };
  const source = await readFile(new URL("../app/search/page.tsx", import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const module: { exports: { default?: (value: unknown) => Promise<unknown>; metadata?: unknown } } = { exports: {} };
  Function("require", "module", "exports", output)((name: string) => {
    if (name in dependencies) return dependencies[name];
    if (name.startsWith("@/components/")) { const component = name.slice("@/components/".length); return { [component]: component }; }
    throw new Error(`unexpected_dependency:${name}`);
  }, module, module.exports);
  return { module: module.exports, calls, products };
}

test("Only exact Güzide search uses client suggestion navigation and its approved catalog card styling", async () => {
  for (const id of [GUZIDE, "a828862c-4cc1-475a-89cc-5fbee31eb4400", "unrelated"]) {
    const { module } = await loadSearch(id);
    const tree = await module.default!({ searchParams: Promise.resolve({ q: "altın kolye" }) });
    const rendered = nodes(tree);
    assert.equal(rendered.find(({ type }) => type === "StorefrontSearchForm")?.props.clientNavigation, id === GUZIDE);
    assert.equal(rendered.some(({ props }) => typeof props.className === "string" && props.className.includes("guzide-products")), id === GUZIDE);
    assert.deepEqual(module.metadata, { title: "Arama", robots: { index: false, follow: false } });
  }
});

test("Güzide search retains 48-result cursor queries, exact returned products and next-results URL", async () => {
  const { module, calls, products } = await loadSearch(GUZIDE);
  const tree = await module.default!({ searchParams: Promise.resolve({ q: "altın kolye", cursor }) });
  const rendered = nodes(tree);
  assert.deepEqual(calls.map(({ hostname, query, limit, cursor: value }) => ({ hostname, query, limit, cursor: value })), [{ hostname: "guzide.example.test", query: "altın kolye", limit: 48, cursor }]);
  const grid = rendered.find(({ type }) => type === "ProductGrid");
  assert.deepEqual(grid?.props.products, products);
  assert.equal(grid?.props.preserveOrder, true);
  assert.equal(rendered.filter(({ type }) => type === "ProductGrid").length, 1);
  assert.equal(rendered.find(({ props }) => props.className === "store-button search-next")?.props.href, `/search?q=alt%C4%B1n%20kolye&cursor=${encodeURIComponent(cursor)}`);
  assert.equal(rendered.some(({ type }) => type === "ProductExplorer"), false);
});

test("Güzide search keeps invalid query and cursor handling without requesting fabricated results", async () => {
  for (const parameters of [{ q: " padded " }, { q: "altın", cursor: "invalid" }]) {
    const { module, calls } = await loadSearch(GUZIDE);
    const tree = await module.default!({ searchParams: Promise.resolve(parameters) });
    assert.equal(calls.length, 0);
    assert.deepEqual(nodes(tree).find(({ type }) => type === "ProductGrid")?.props.products, []);
    assert.equal(nodes(tree).find(({ props }) => props.className === "store-button search-next"), undefined);
  }
});
