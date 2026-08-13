import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

type Showcase = Readonly<{
  heading: string;
  layout: "duo" | "grid";
  items: readonly Readonly<{ id: string; name: string; slug: string; image: Readonly<{ url: string; altText: string; width: number; height: number }> }>[];
}>;

type RenderNode = Readonly<{ type: unknown; props: Readonly<Record<string, unknown>> }>;

function renderNode(type: unknown, props: Record<string, unknown>): RenderNode {
  return typeof type === "function" ? (type as (value: Record<string, unknown>) => RenderNode)(props) : Object.freeze({ type, props: Object.freeze(props) });
}

function findNode(value: unknown, predicate: (node: RenderNode) => boolean): RenderNode | null {
  if (!value || typeof value !== "object" || !("type" in value) || !("props" in value)) return null;
  const node = value as RenderNode;
  if (predicate(node)) return node;
  const children = node.props.children;
  for (const child of Array.isArray(children) ? children.flat(Infinity) : [children]) {
    const found = findNode(child, predicate);
    if (found) return found;
  }
  return null;
}

async function compileCategoryShowcase() {
  const source = await readFile(new URL("./CategoryShowcase.tsx", import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const runtime = { Fragment: Symbol("Fragment"), jsx: renderNode, jsxs: renderNode };
  const Link = (props: Record<string, unknown>) => renderNode("a", props);
  const compiledModule: { exports: { CategoryShowcase?: (props: { showcase: Showcase; locale: string }) => RenderNode } } = { exports: {} };
  Function("require", "module", "exports", output)((specifier: string) => {
    if (specifier === "react/jsx-runtime") return runtime;
    if (specifier === "next/link") return Link;
    if (specifier === "@/lib/storefront-routes.ts") return { categoryPath: (locale: string, slug: string) => locale.startsWith("tr") ? `/kategori/${slug}` : `/categories/${slug}` };
    throw new Error(`unexpected_category_showcase_import:${specifier}`);
  }, compiledModule, compiledModule.exports);
  assert.ok(compiledModule.exports.CategoryShowcase);
  return compiledModule.exports.CategoryShowcase;
}

test("the starter category showcase exposes its persisted responsive layout to the rendered grid", async () => {
  const CategoryShowcase = await compileCategoryShowcase();
  const tree = CategoryShowcase({ locale: "tr", showcase: {
    heading: "Kategorileri keşfedin",
    layout: "duo",
    items: [{ id: "81000000-0000-4000-8000-000000000001", name: "Bileklikler", slug: "bileklikler", image: { url: "https://media.example/bileklikler.webp", altText: "Bileklikler", width: 896, height: 1195 } }],
  } });
  const grid = findNode(tree, (node) => node.props.className === "category-showcase-grid");
  const link = findNode(tree, (node) => node.type === "a");
  assert.equal(grid?.props["data-layout"], "duo");
  assert.equal(link?.props.href, "/kategori/bileklikler");
});
