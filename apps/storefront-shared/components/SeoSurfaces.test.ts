import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import * as jsxRuntime from "react/jsx-runtime";
import { publicSeoPath, serializeStructuredData } from "../lib/public-seo.ts";

type Node = { type: unknown; props: Record<string, unknown> };
function nodes(value: unknown): Node[] {
  if (!value || typeof value !== "object" || !("props" in value) || !("type" in value)) return [];
  const node = value as Node;
  return [node, ...[node.props.children].flat(Infinity).flatMap(nodes)];
}
async function compile(filename: string, dependencies: Record<string, unknown>) {
  const source = await readFile(new URL(filename, import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const compiled: { exports: Record<string, (...args: never[]) => unknown> } = { exports: {} };
  Function("require", "module", "exports", output)((name: string) => {
    if (name === "react/jsx-runtime") return jsxRuntime;
    if (name in dependencies) return dependencies[name];
    throw new Error(`unexpected_dependency:${name}`);
  }, compiled, compiled.exports);
  return compiled.exports;
}

test("published source links render accessible anchors in saved order and reject private destinations", async () => {
  const { SeoRelatedLinks } = await compile("SeoRelatedLinks.tsx", { "next/link": "a", "../lib/public-seo.ts": { publicSeoPath } });
  const tree = SeoRelatedLinks!({ locale: "tr", links: [{ anchorText: "Care guide", path: "/pages/care?lang=en-US" }, { anchorText: "Related category", path: "/kategori/takilar" }, { anchorText: "Duplicate", path: "/kategori/takilar" }, { anchorText: "Private", path: "/account" }, { anchorText: "External", path: "https://other.test" }] } as never);
  assert.equal((tree as Node).props["aria-label"], "İlgili içerikler");
  const anchors = nodes(tree).filter(({ type }) => type === "a");
  assert.deepEqual(anchors.map(({ props }) => [props.href, props.children]), [["/pages/care?lang=en-US", "Care guide"], ["/kategori/takilar", "Related category"]]);
  assert.equal(SeoRelatedLinks!({ locale: "en", links: [] } as never), null);
});
test("JSON-LD render attaches the request nonce and suppresses scripts without CSP authority", async () => {
  const value = { headline: '</script><script>alert("x")</script>' };
  const compileScript = (nonce: string | null) => compile("SeoStructuredData.tsx", { "next/headers": { headers: async () => new Headers(nonce ? { "x-nonce": nonce } : {}) }, "../lib/public-seo.ts": { serializeStructuredData } });
  const component = (await compileScript("authorized-nonce")).SeoStructuredData!;
  const rendered = await component({ value } as never) as Node;
  assert.equal(rendered.type, "script");
  assert.equal(rendered.props.nonce, "authorized-nonce");
  assert.equal(rendered.props.type, "application/ld+json");
  const encoded = (rendered.props.dangerouslySetInnerHTML as { __html: string }).__html;
  assert.doesNotMatch(encoded, /<\/script>/);
  assert.deepEqual(JSON.parse(encoded), value);
  assert.equal(await (await compileScript(null)).SeoStructuredData!({ value } as never), null);
});
