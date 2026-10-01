import assert from "node:assert/strict";
import test from "node:test";
import { parseToshiMarkdown, type ToshiMarkdownNode } from "./markdown.ts";

function elements(nodes: readonly ToshiMarkdownNode[]): Extract<ToshiMarkdownNode, { kind: "element" }>[] {
  return nodes.flatMap((node) => node.kind === "text" ? [] : [node, ...elements(node.children)]);
}

function plainText(nodes: readonly ToshiMarkdownNode[]): string {
  return nodes.map((node) => node.kind === "text" ? node.text : plainText(node.children)).join("");
}

test("Toshi formats headings, emphasis, ordered lists, quotes and code without repeating the page h1", () => {
  const nodes = parseToshiMarkdown("# Ürün ayrıntıları\n\n## Fiyat\n\n**Önce** SKU ve *barkodu* girin.\n\n3. Fiyatı girin\n4. Kaydedin\n\n> Stok kontrolü\n\n`<button>`\n\n```html\n<script>alert('x')</script>\n```\n\n---");
  const content = elements(nodes);
  assert.deepEqual(content.filter((node) => /^h\d$/.test(node.tag)).map((node) => node.tag), ["h3", "h3"]);
  for (const tag of ["strong", "em", "ol", "li", "blockquote", "code", "pre", "hr"]) {
    assert.ok(content.some((node) => node.tag === tag), `${tag} is formatted`);
  }
  assert.equal(content.find((node) => node.tag === "ol")?.start, 3);
  assert.ok(plainText(nodes).includes("<script>alert('x')</script>"));
});

test("Toshi keeps Markdown links and images readable as text and creates no navigation or image elements", () => {
  const nodes = parseToshiMarkdown("[**Ürünler**](https://external.test/path?q=1) ve [ayar](/settings)\n\n![kapak](https://tracker.test/pixel.png)\n\n<https://external.test/auto>");
  const content = elements(nodes);
  assert.ok(content.every((node) => node.tag !== ("a" as unknown) && node.tag !== ("img" as unknown)));
  const text = plainText(nodes);
  for (const expected of ["Ürünler", "https://external.test/path?q=1", "/settings", "kapak", "https://tracker.test/pixel.png", "https://external.test/auto"]) {
    assert.ok(text.includes(expected), `${expected} is visible as text`);
  }
  assert.ok(content.some((node) => node.tag === "strong"));
});

test("hostile HTML, event handlers and unsafe Markdown protocols stay inert text", () => {
  const payload = '<script>alert(1)</script>\n\n<img src=x onerror="alert(2)">\n\n<iframe src="https://tracker.test"></iframe>\n\n[run](javascript:alert(3))\n\n![data](data:image/svg+xml;base64,PHN2Zz4=)';
  const nodes = parseToshiMarkdown(payload);
  assert.ok(plainText(nodes).includes("<script>alert(1)</script>"));
  assert.ok(plainText(nodes).includes('onerror="alert(2)"'));
  assert.ok(plainText(nodes).includes("javascript:alert(3)"));
  for (const node of elements(nodes)) {
    assert.ok(!["script", "iframe", "img", "a", "style", "button"].includes(node.tag));
    assert.ok(Object.keys(node).every((key) => ["kind", "tag", "children", "start", "align"].includes(key)));
  }
});

test("Toshi parses tables with safe alignment and keeps literal cell content", () => {
  const nodes = parseToshiMarkdown("| Ürün | Stok | Fiyat |\n| :--- | :---: | ---: |\n| **Kolye** | 3 | ₺990 |\n| `<img>` | 0 | ₺500 |");
  const content = elements(nodes);
  for (const tag of ["table", "thead", "tbody", "tr", "th", "td"]) assert.ok(content.some((node) => node.tag === tag));
  assert.deepEqual(content.filter((node) => node.tag === "th").map((node) => node.align), ["left", "center", "right"]);
  assert.ok(plainText(nodes).includes("<img>"));
});

test("Toshi renders paragraph line breaks and empty replies without losing text", () => {
  assert.deepEqual(parseToshiMarkdown(""), []);
  const nodes = parseToshiMarkdown("İlk satır\nİkinci satır\n\nSon paragraf");
  assert.equal(elements(nodes).filter((node) => node.tag === "p").length, 2);
  assert.equal(elements(nodes).filter((node) => node.tag === "br").length, 1);
  assert.equal(plainText(nodes), "İlk satırİkinci satırSon paragraf");
});
