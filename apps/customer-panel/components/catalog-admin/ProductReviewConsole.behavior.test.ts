import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as React from "react";
import { act, createElement } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { Window, type Element as TestElement } from "happy-dom";
import ts from "typescript";

test("review reply drafts survive search and status filters and preserve moderation payloads", async () => {
  const browser = new Window({ url: "https://panel.example.test/products/reviews" });
  const globals = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({
    window: browser, document: browser.document, navigator: browser.navigator,
    HTMLElement: browser.HTMLElement, Event: browser.Event, MouseEvent: browser.MouseEvent,
    MutationObserver: browser.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const { createRoot } = await import("react-dom/client");
  const source = await readFile(new URL("./ProductReviewConsole.tsx", import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const styles = new Proxy({}, { get: (_target, key) => key === "__esModule" ? true : key === "default" ? styles : String(key) });
  const items = [
    { id: "review-a", productTitle: "Mira Ceket", reviewerName: "Ada", title: "Başlık", body: "Ürün yorumu", rating: 5, status: "pending", merchantReply: "Kayıtlı yanıt", version: 3 },
    { id: "review-b", productTitle: "Mira Gömlek", reviewerName: "Deniz", body: "Diğer yorum", rating: 4, status: "approved", merchantReply: "Önceki yanıt", version: 7 },
  ];
  const saved: unknown[] = [];
  const compiled: { exports: Record<string, unknown> } = { exports: {} };
  Function("require", "module", "exports", output)((name: string) => {
    if (name === "react") return React;
    if (name === "react/jsx-runtime") return jsxRuntime;
    if (name === "lucide-react") return { Search: () => null };
    if (name === "@/components/panel/PanelPageShell") return {
      PanelPageShell: ({ children }: { children: React.ReactNode }) => children,
      PanelPageHeader: () => null,
      PanelEmptyState: ({ title }: { title: string }) => createElement("p", null, title),
    };
    if (name === "@/lib/catalog-admin-ui/client") return {
      catalogAdminApi: { async reviews() { return items; }, async moderateReview(id: string, input: unknown) { saved.push({ id, input }); } },
      CatalogAdminApiError: class extends Error {},
    };
    if (name === "./catalog-admin-console.module.css") return styles;
    throw new Error(`unexpected_import:${name}`);
  }, compiled, compiled.exports);
  const Console = compiled.exports.ProductReviewConsole as React.ComponentType<{ canModerate: boolean }>;
  const container = browser.document.createElement("div");
  browser.document.body.append(container);
  const root = createRoot(container as unknown as Parameters<typeof createRoot>[0]);
  async function edit(element: TestElement, value: string) {
    const prototype = element.tagName === "TEXTAREA" ? browser.HTMLTextAreaElement.prototype : element.tagName === "SELECT" ? browser.HTMLSelectElement.prototype : browser.HTMLInputElement.prototype;
    await act(async () => {
      Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
      element.dispatchEvent(new browser.Event(element.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
    });
  }
  function reply(id: string) {
    const textarea = container.querySelector(`#reply-${id}`);
    assert.ok(textarea instanceof browser.HTMLTextAreaElement);
    return textarea;
  }
  try {
    await act(async () => { root.render(createElement(Console, { canModerate: true })); await new Promise((resolve) => setTimeout(resolve, 0)); });
    assert.equal(reply("review-a").value, "Kayıtlı yanıt");
    await edit(reply("review-a"), "  Teşekkür ederiz, Ada.  ");
    const search = container.querySelector('input[type="search"]');
    const status = container.querySelector("select");
    assert.ok(search && status);
    await edit(search, "eşleşmeyen");
    assert.equal(container.querySelector("textarea"), null, "arama yorumu gerçekten gizlemeli");
    await edit(search, "");
    assert.equal(reply("review-a").value, "  Teşekkür ederiz, Ada.  ");
    await edit(status, "archived");
    assert.equal(container.querySelector("textarea"), null, "durum filtresi yorumu gerçekten gizlemeli");
    await edit(status, "");
    assert.equal(reply("review-a").value, "  Teşekkür ederiz, Ada.  ");
    assert.equal(reply("review-b").value, "Önceki yanıt", "başka yorumun kayıtlı yanıtı değişmemeli");
    await act(async () => { container.querySelectorAll("article")[0].querySelectorAll("button")[0].click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
    assert.deepEqual(saved[0], { id: "review-a", input: { expectedVersion: 3, status: "approved", reply: "Teşekkür ederiz, Ada." } });
    await act(async () => { container.querySelectorAll("article")[1].querySelectorAll("button")[1].click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
    assert.deepEqual(saved[1], { id: "review-b", input: { expectedVersion: 7, status: "rejected", reply: "Önceki yanıt" } });
  } finally {
    await act(async () => root.unmount());
    for (const [key, descriptor] of globals) descriptor ? Object.defineProperty(globalThis, key, descriptor) : Reflect.deleteProperty(globalThis, key);
    await browser.happyDOM.close();
  }
});
