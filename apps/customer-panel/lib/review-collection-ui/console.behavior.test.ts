import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as React from "react";
import { act, createElement } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { Window, type Element as TestElement } from "happy-dom";
import ts from "typescript";

test("review settings preserve failed drafts and retry keys; manual request refresh leaves unsaved settings intact", async () => {
  const browser = new Window({ url: "https://panel.example.test/products/reviews" });
  const globals = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ window: browser, document: browser.document, navigator: browser.navigator, HTMLElement: browser.HTMLElement, Event: browser.Event, MouseEvent: browser.MouseEvent, MutationObserver: browser.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true })) {
    globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const { createRoot } = await import("react-dom/client");
  const source = await readFile(new URL("../../components/catalog-admin/ReviewCollectionConsole.tsx", import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const styles = new Proxy({}, { get: (_target, key) => key === "__esModule" ? true : key === "default" ? styles : String(key) });
  let settings = { enabled: false, delayDays: 7, version: 0 };
  const saved: { input: typeof settings; key: string }[] = [], requested: { id: string; version: number; key: string }[] = [];
  class ApiError extends Error {}
  const compiled: { exports: Record<string, unknown> } = { exports: {} };
  Function("require", "module", "exports", output)((name: string) => {
    if (name === "react") return React;
    if (name === "react/jsx-runtime") return jsxRuntime;
    if (name === "./review-collection.module.css") return styles;
    if (name === "@/components/panel/PanelPageShell") return { PanelEmptyState: ({ title }: { title: string }) => createElement("p", null, title) };
    if (name === "@/lib/review-collection-ui/client") return { ReviewCollectionApiError: ApiError, reviewCollectionApi: {
      async overview() { return { settings, requests: [], eligibleOrders: [{ id: "order-a", orderNumber: "WEB-000001", customerName: "Ada", version: 3, deliveredAt: "2026-10-03T07:00:00Z", productCount: 1 }] }; },
      async saveSettings(input: typeof settings, key: string) { saved.push({ input, key }); if (saved.length === 1) throw new ApiError("Bağlantı kesildi."); settings = { ...input, version: 1 }; return settings; },
      async requestOrder(id: string, version: number, key: string) { requested.push({ id, version, key }); if (requested.length === 1) throw new ApiError("Bağlantı kesildi."); return { queuedCount: 1 }; },
    } };
    throw new Error(`unexpected_import:${name}`);
  }, compiled, compiled.exports);
  const Console = compiled.exports.ReviewCollectionConsole as React.ComponentType<{ canManage: boolean; view: "requests" | "settings" }>;
  const container = browser.document.createElement("div"); browser.document.body.append(container);
  const root = createRoot(container as unknown as Parameters<typeof createRoot>[0]);
  async function render(view: "requests" | "settings") { await act(async () => { root.render(createElement(Console, { canManage: true, view })); await new Promise(resolve => setTimeout(resolve, 0)); }); }
  async function click(label: string) { const button = [...container.querySelectorAll("button")].find(item => item.textContent === label); assert.ok(button); await act(async () => { button.click(); await new Promise(resolve => setTimeout(resolve, 0)); }); }
  async function input(element: TestElement, value: string) { await act(async () => { Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype, "value")?.set?.call(element, value); element.dispatchEvent(new browser.Event("input", { bubbles: true })); }); }
  try {
    await render("settings");
    const checkbox = container.querySelector('input[type="checkbox"]'); assert.ok(checkbox instanceof browser.HTMLInputElement);
    await act(async () => checkbox.click());
    await click("Uygula");
    assert.equal(container.querySelector('[role="alert"]')?.textContent?.includes("Bağlantı kesildi."), true);
    assert.equal((container.querySelector('input[type="checkbox"]') as typeof checkbox).checked, true);
    await click("Uygula");
    assert.equal(saved.length, 2); assert.equal(saved[0]?.key, saved[1]?.key); assert.deepEqual(saved[0]?.input, { enabled: true, delayDays: 7, version: 0 });
    const delay = container.querySelector('input[type="number"]'); assert.ok(delay instanceof browser.HTMLInputElement);
    await input(delay, "12"); await click("Vazgeç"); assert.equal(delay.value, "7");
    await input(delay, "10");
    await render("requests"); await click("Davet gönder"); await click("Davet gönder");
    assert.equal(requested.length, 2); assert.equal(requested[0]?.key, requested[1]?.key); assert.deepEqual({ id: requested[1]?.id, version: requested[1]?.version }, { id: "order-a", version: 3 });
    await render("settings"); assert.equal((container.querySelector('input[type="number"]') as typeof delay).value, "10");
  } finally {
    await act(async () => root.unmount());
    for (const [key, descriptor] of globals) descriptor ? Object.defineProperty(globalThis, key, descriptor) : Reflect.deleteProperty(globalThis, key);
    await browser.happyDOM.close();
  }
});
