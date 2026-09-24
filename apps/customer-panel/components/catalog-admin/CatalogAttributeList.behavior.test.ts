import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as React from "react";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import * as jsxRuntime from "react/jsx-runtime";
import { Window } from "happy-dom";
import ts from "typescript";

async function withAttributeList(items: readonly unknown[], verify: (container: HTMLElement) => void) {
  const browser = new Window({ url: "https://panel.example.test/products/attributes" });
  const globals = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({
    window: browser, document: browser.document, navigator: browser.navigator,
    HTMLElement: browser.HTMLElement, Event: browser.Event, MouseEvent: browser.MouseEvent,
    MutationObserver: browser.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const source = await readFile(new URL("./CatalogResourceConsole.tsx", import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const styles = new Proxy({}, { get: (_target, key) => key === "__esModule" ? true : key === "default" ? styles : String(key) });
  const compiled: { exports: Record<string, unknown> } = { exports: {} };
  Function("require", "module", "exports", output)((name: string) => {
    if (name === "react") return React;
    if (name === "react/jsx-runtime") return jsxRuntime;
    if (name === "next/link") return ({ href, children, ...props }: { href: string; children: React.ReactNode }) => createElement("a", { href, ...props }, children);
    if (name === "@celebix/saas-contracts") return { parseStorefrontAsset: (asset: unknown) => asset };
    if (name === "lucide-react") return { ImageOff: () => null, Search: () => null };
    if (name === "@/components/panel/PanelPageShell") return {
      PanelPageShell: ({ children }: { children: React.ReactNode }) => children,
      PanelPageHeader: ({ title, actions }: { title: string; actions?: React.ReactNode }) => createElement("header", null, title, actions),
      PanelEmptyState: ({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) => createElement("div", null, title, description, action),
    };
    if (name === "@/lib/catalog-admin-ui/client") return { catalogAdminApi: { async resources() { return items; } }, CatalogAdminApiError: class extends Error {} };
    if (name === "@/lib/catalog-admin-ui/brand-product-directory") return { brandLogoAssetId: () => undefined, loadBrandProductDirectory: async () => [] };
    if (name === "@/lib/catalog-ui/client") return { catalogApi: {} };
    if (name === "@/lib/catalog-admin-ui/resource-route") return { getCatalogResourceRouteDefinitionForKind: () => ({ segment: "attributes" }) };
    if (name === "./catalog-admin-console.module.css") return styles;
    throw new Error(`unexpected_import:${name}`);
  }, compiled, compiled.exports);
  const Console = compiled.exports.CatalogResourceConsole as React.ComponentType<{ kind: "attribute"; canManage: boolean }>;
  const container = browser.document.createElement("div");
  browser.document.body.append(container);
  const root = createRoot(container as unknown as Parameters<typeof createRoot>[0]);
  try {
    await act(async () => { root.render(createElement(Console, { kind: "attribute", canManage: true })); await new Promise((resolve) => setTimeout(resolve, 0)); });
    verify(container as unknown as HTMLElement);
  } finally {
    await act(async () => root.unmount());
    for (const [key, descriptor] of globals) descriptor ? Object.defineProperty(globalThis, key, descriptor) : Reflect.deleteProperty(globalThis, key);
    await browser.happyDOM.close();
  }
}

test("saved attributes show their usable values without URL keys or version badges", async () => {
  await withAttributeList([{ id: "11111111-1111-4111-8111-111111111111", kind: "attribute", name: "Renk", slug: "renk", description: "Ürün rengi", config: { values: ["Siyah", "Beyaz"] }, productIds: [], productCount: 0, version: 1, status: "active" }], (container) => {
    assert.match(container.textContent ?? "", /Renk/);
    assert.match(container.textContent ?? "", /Siyah/);
    assert.match(container.textContent ?? "", /Beyaz/);
    assert.ok(!(container.textContent ?? "").includes("/renk"));
    assert.ok(!(container.textContent ?? "").includes("v1"));
  });
});

test("empty attribute list gives a direct first-step action", async () => {
  await withAttributeList([], (container) => {
    assert.match(container.textContent ?? "", /Renk veya beden ekleyerek başlayın/);
    assert.ok(container.querySelector('a[href="/products/attributes/new"]'));
  });
});
