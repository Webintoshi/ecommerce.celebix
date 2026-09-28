import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { Window } from "happy-dom";
import ts from "typescript";
import * as policyEditor from "./policy-body-editor.ts";

const require = createRequire(import.meta.url);

async function withBrowser(verify: (browser: Window) => Promise<void>) {
  const browser = new Window({ url: "https://panel.example.test/content/policies" });
  const previous = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({
    window: browser, document: browser.document, navigator: browser.navigator,
    Node: browser.Node, HTMLElement: browser.HTMLElement, HTMLInputElement: browser.HTMLInputElement,
    HTMLButtonElement: browser.HTMLButtonElement, DOMParser: browser.DOMParser,
    MutationObserver: browser.MutationObserver, getComputedStyle: browser.getComputedStyle.bind(browser),
    requestAnimationFrame: browser.requestAnimationFrame.bind(browser), cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser),
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  try {
    await verify(browser);
  } finally {
    for (const [key, descriptor] of previous) descriptor ? Object.defineProperty(globalThis, key, descriptor) : Reflect.deleteProperty(globalThis, key);
    await browser.happyDOM.close();
  }
}

function parseWith(browser: Window) {
  return (source: string) => new browser.DOMParser().parseFromString(source, "text/html") as unknown as Document;
}

test("unchanged or undone visual documents preserve the exact original source", async () => {
  await withBrowser(async (browser) => {
    const parse = parseWith(browser);
    for (const source of ["## Koşullar\r\n\r\n**Özgün**  metin.\r\n", "<h3>Koşullar</h3>\n<p><b>Özgün</b> metin.</p>", "", "  Metin\n\n"] ) {
      const html = policyEditor.policyBodyEditorHtml(source);
      assert.equal(policyEditor.policyBodyValueAfterEdit(source, html, html, parse), source);
    }
    const original = "## Koşullar\n\nÖzgün metin.";
    const html = policyEditor.policyBodyEditorHtml(original);
    assert.equal(policyEditor.policyBodyValueAfterEdit(original, html, "<h2>Koşullar</h2><p>Yeni metin.</p>", parse), "<h2>Koşullar</h2><p>Yeni metin.</p>");
    assert.equal(policyEditor.policyBodySourceFormat(original), "markdown");
    assert.equal(policyEditor.policyBodySourceFormat("<p>Metin</p>"), "html");
  });
});

test("semantic comparison preserves nested lists, headings, tables, links, code and marks through the real schema", async () => {
  await withBrowser(async (browser) => {
    const { Editor } = require("@tiptap/core") as typeof import("@tiptap/core");
    const StarterKit = (require("@tiptap/starter-kit") as typeof import("@tiptap/starter-kit")).default;
    const Underline = (require("@tiptap/extension-underline") as typeof import("@tiptap/extension-underline")).default;
    const Link = (require("@tiptap/extension-link") as typeof import("@tiptap/extension-link")).default;
    const { TableKit } = require("@tiptap/extension-table") as typeof import("@tiptap/extension-table");
    const parse = parseWith(browser);
    const sources = [
      "## Koşullar\n\nParagraf **kalın**, *italik* ve [bağlantı](/policies/kvkk).\n\n- İlk madde\n  - İç madde\n\n### Alt başlık\n\n> Açıklama\n\n#### Ayrıntı\n\n```\nkod();\n  girinti();\n```",
      '<h2>Koşullar</h2><h3>Ayrıntı</h3><h4>Alt bölüm</h4><p><strong><em>İç içe</em></strong> <u>altı çizili</u> <del>eski</del> <code>kod</code> <a href="https://example.test/">bağlantı</a>.</p><ol><li>İlk<ul><li>İç madde</li></ul></li><li>İkinci</li></ol><pre><code>satır 1\n  satır 2</code></pre>',
      "| Koşul | Ayrıntı |\n| --- | --- |\n| Teslimat | Metin |\n| İade | Diğer metin |",
      "<table><thead><tr><th>Koşul</th><th>Ayrıntı</th></tr></thead><tbody><tr><td><strong>İade</strong></td><td>Metin<br>devamı</td></tr></tbody></table>",
    ];
    for (const source of sources) {
      const editor = new Editor({
        element: browser.document.createElement("div") as unknown as HTMLElement,
        extensions: [StarterKit.configure({ heading: { levels: [2, 3, 4] }, link: false, underline: false }), Underline, Link.configure({ openOnClick: false }), TableKit],
        content: policyEditor.policyBodyEditorHtml(source),
      });
      try {
        assert.equal(policyEditor.policyBodyRoundTripSupported(source, editor.getHTML(), parse), true, `round trip failed for ${source}`);
      } finally { editor.destroy(); }
    }
  });
});

test("unsupported structure and meaningful round-trip differences use source editing", async () => {
  await withBrowser(async (browser) => {
    const parse = parseWith(browser);
    for (const source of [
      '<p>Metin<img src="/image.webp" alt="Belge"></p>',
      '<table><tr><td colspan="2">Birleşik hücre</td></tr></table>',
      '<ol start="5"><li>Beşinci</li></ol>',
      '<p style="text-align:right">Sağda</p>',
      '<h1>Ana başlık</h1>',
      '![Belge](/image.webp)',
    ]) {
      assert.equal(policyEditor.policyBodyHasUnsupportedStructure(source, parse), true, source);
      assert.equal(policyEditor.policyBodyRoundTripSupported(source, policyEditor.policyBodyEditorHtml(source), parse), false, source);
    }
    assert.equal(policyEditor.policyBodyRoundTripSupported("<h4>Başlık</h4><p>Özgün metin</p>", "<h3>Başlık</h3><p>Özgün metin</p>", parse), false);
    assert.equal(policyEditor.policyBodyRoundTripSupported("<p><strong>Altın</strong> <em>kolye</em></p>", "<p><strong>Altın</strong><em>kolye</em></p>", parse), false);
    assert.equal(policyEditor.policyBodyRoundTripSupported("<p>Bir</p><p>İki</p>", "<p>Birİki</p>", parse), false);
  });
});

test("new visual edits sanitize executable paste and restrict link protocols", async () => {
  await withBrowser(async (browser) => {
    const parse = parseWith(browser);
    const safe = policyEditor.sanitizePolicyBodyPaste('<script>alert(1)</script><iframe src="/unsafe"></iframe><p onclick="alert(1)">Metin <a href="javascript:alert(1)">bağlantı</a></p>', parse);
    assert.equal(safe, "<p>Metin <a>bağlantı</a></p>");
    for (const href of ["javascript:alert(1)", "data:text/html,unsafe", "//example.test", "/\\example.test", "https://example.test/\nunsafe", "mailto:a@b.test\r\nextra"]) assert.equal(policyEditor.safePolicyLinkHref(href), undefined, href);
    for (const href of ["https://example.test/", "http://example.test/", "/policies/kvkk", "#teslimat", "mailto:destek@example.test", "tel:+905551234567"]) assert.equal(policyEditor.safePolicyLinkHref(href), href);
    assert.equal(policyEditor.safePolicyLinkHref("example.test/kvkk"), "https://example.test/kvkk");
    assert.equal(policyEditor.safePolicyLinkHref(""), "");
  });
});

test("mounted controlled editor does not emit on loads, read-only changes or policy switches; actual edits and undo are lossless", async () => {
  await withBrowser(async (browser) => {
    const tiptap = require("@tiptap/react") as typeof import("@tiptap/react");
    let actualEditor: import("@tiptap/core").Editor | null = null;
    const source = await readFile(new URL("../components/content/PolicyBodyField.tsx", import.meta.url), "utf8");
    const output = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const compiled: { exports: Record<string, unknown> } = { exports: {} };
    Function("require", "module", "exports", output)((name: string) => {
      if (name === "react") return React;
      if (name === "react/jsx-runtime") return jsxRuntime;
      if (name === "lucide-react") return new Proxy({}, { get: () => () => React.createElement("svg", { "aria-hidden": true }) });
      if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) };
      if (name === "@/lib/policy-body-editor") return policyEditor;
      if (name === "@/components/catalog/ProductDescriptionPreview") return { ProductDescriptionPreview: ({ source: value }: { source: string }) => React.createElement("div", null, value) };
      if (name === "@tiptap/react") return { ...tiptap, useEditor: (...args: Parameters<typeof tiptap.useEditor>) => { const current = tiptap.useEditor(...args); actualEditor = current; return current; } };
      return require(name);
    }, compiled, compiled.exports);
    const Field = compiled.exports.PolicyBodyField as React.ComponentType<{ value: string; readOnly?: boolean; onValueChange(value: string): void }>;
    const { createRoot } = await import("react-dom/client");
    const container = browser.document.createElement("div"); browser.document.body.append(container);
    const root = createRoot(container as unknown as HTMLElement);
    const first = "## İlk metin\r\n\r\n**Özgün** metin.";
    const second = "### İkinci metin\n\nDiğer politika.";
    let value = first;
    let readOnly = false;
    const changes: string[] = [];
    const onValueChange = (next: string) => { changes.push(next); value = next; render(); };
    const render = () => root.render(React.createElement(Field, { value, readOnly, onValueChange }));
    const current = () => { assert.ok(actualEditor); return actualEditor as import("@tiptap/core").Editor; };
    try {
      await React.act(async () => { render(); });
      assert.deepEqual(changes, []);
      assert.equal(value, first);
      assert.equal(current().isEditable, true);
      assert.equal((container.querySelector('button[aria-label="Geri al"]') as unknown as HTMLButtonElement).disabled, true);
      await React.act(async () => { readOnly = true; render(); });
      assert.equal(current().isEditable, false);
      assert.deepEqual(changes, []);
      await React.act(async () => { readOnly = false; value = second; render(); });
      assert.deepEqual(changes, []);
      assert.match(current().getText(), /İkinci metin/);
      await React.act(async () => { current().commands.insertContentAt(current().state.doc.content.size - 1, " Eklendi."); });
      assert.equal(changes.length, 1);
      assert.match(value, /<h3>İkinci metin<\/h3>/);
      assert.match(value, /Eklendi/);
      await React.act(async () => { current().commands.undo(); });
      assert.equal(value, second);
      assert.equal((container.querySelector('button[aria-label="Geri al"]') as unknown as HTMLButtonElement).disabled, true);
      await React.act(async () => { value = "Metin ".repeat(2_500); render(); });
      assert.equal(current().isEditable, true);
      await React.act(async () => { current().commands.insertContentAt(current().state.doc.content.size - 1, "Son."); });
      assert.ok(String(value).length > 10_000, "policy editing must not inherit the product-description length limit");
      assert.match(value, /Son[.]/);
      await React.act(async () => { value = "<p>Belge<img src='/image.webp'></p>"; render(); });
      assert.match(container.textContent ?? "", /Kaynak sekmesinden düzenleyin/);
      assert.equal(current().isEditable, false);
      assert.equal(changes.length, 3);
      await React.act(async () => { value = "<p>Bağlantı metni</p>"; render(); });
      await React.act(async () => { current().commands.setTextSelection({ from: 1, to: 9 }); });
      const linkButton = container.querySelector('button[aria-label="Bağlantı ekle veya düzenle"]') as unknown as HTMLButtonElement;
      assert.ok(linkButton);
      await React.act(async () => linkButton.click());
      const linkInput = container.querySelector('input[placeholder="https://"]') as unknown as HTMLInputElement;
      assert.ok(linkInput);
      await React.act(async () => {
        Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype, "value")!.set!.call(linkInput, "javascript:alert(1)");
        linkInput.dispatchEvent(new browser.Event("input", { bubbles: true }) as unknown as Event);
      });
      await React.act(async () => { linkInput.dispatchEvent(new browser.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }) as unknown as Event); });
      assert.match(container.textContent ?? "", /Geçerli bir bağlantı adresi girin/);
      await React.act(async () => {
        Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype, "value")!.set!.call(linkInput, "https://example.test/detay");
        linkInput.dispatchEvent(new browser.Event("input", { bubbles: true }) as unknown as Event);
      });
      await React.act(async () => { linkInput.dispatchEvent(new browser.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }) as unknown as Event); });
      assert.match(value, /href="https:\/\/example.test\/detay"/);
      assert.equal(container.querySelector('input[placeholder="https://"]'), null);
      await React.act(async () => linkButton.click());
      const reopened = container.querySelector('input[placeholder="https://"]') as unknown as HTMLInputElement;
      await React.act(async () => { reopened.dispatchEvent(new browser.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }) as unknown as Event); });
      assert.equal(container.querySelector('input[placeholder="https://"]'), null);
    } finally {
      await React.act(async () => root.unmount());
      (actualEditor as import("@tiptap/core").Editor | null)?.destroy();
    }
  });
});
