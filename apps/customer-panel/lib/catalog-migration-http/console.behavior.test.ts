import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as React from "react";
import { act, createElement } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { Window } from "happy-dom";
import ts from "typescript";
import * as providers from "../catalog-import/providers.ts";
import * as wooCompiler from "../catalog-import/woocommerce-migration.ts";
import * as qukasoftCompiler from "../catalog-import/qukasoft-migration.ts";
import * as workflow from "./workflow.ts";
import { WooCommerceMigrationApiError } from "./client.ts";

async function withConsole(verify: (container: HTMLElement, browser: Window) => Promise<void>) {
  const browser = new Window({ url: "https://panel.example.test/products/bulk-upload" });
  const prior = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ window: browser, document: browser.document, navigator: browser.navigator, HTMLElement: browser.HTMLElement, HTMLInputElement: browser.HTMLInputElement, Event: browser.Event, IS_REACT_ACT_ENVIRONMENT: true })) {
    prior.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const source = await readFile(new URL("../../components/catalog-admin/CatalogBulkImportConsole.tsx", import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const compiled = { exports: {} as Record<string, unknown> };
  class CatalogAdminApiError extends Error {}
  const panel = ({ children }: { children: React.ReactNode }) => createElement("div", {}, children);
  const imports: Record<string, unknown> = {
    react: React, "react/jsx-runtime": jsxRuntime,
    "lucide-react": new Proxy({}, { get: () => () => createElement("svg", { "aria-hidden": true }) }),
    "@/components/panel/PanelPageShell": { PanelPageShell: panel, PanelPageHeader: () => null, PanelEmptyState: () => null },
    "@/lib/catalog-admin-ui/client": { CatalogAdminApiError, catalogAdminApi: { imports: async () => [] } },
    "@/lib/catalog-import/providers": providers,
    "@/lib/catalog-import/woocommerce-migration": wooCompiler,
    "@/lib/catalog-import/qukasoft-migration": qukasoftCompiler,
    "@/lib/catalog-migration-http/client": { WooCommerceMigrationApiError, wooCommerceMigrationApi: {}, qukasoftMigrationApi: {} },
    "@/lib/catalog-migration-http/workflow": workflow,
  };
  Function("require", "module", "exports", output)((name: string) => {
    if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) };
    if (Object.hasOwn(imports, name)) return imports[name];
    throw new Error(`unexpected_import:${name}`);
  }, compiled, compiled.exports);
  const { createRoot } = await import("react-dom/client");
  const container = browser.document.createElement("div");
  browser.document.body.append(container);
  const root = createRoot(container as never);
  try {
    await act(async () => { root.render(createElement(compiled.exports.CatalogBulkImportConsole as React.ComponentType<{ canImport: boolean }>, { canImport: true })); });
    await verify(container as unknown as HTMLElement, browser);
  } finally {
    await act(async () => { root.unmount(); });
    for (const [key, descriptor] of prior) descriptor ? Object.defineProperty(globalThis, key, descriptor) : Reflect.deleteProperty(globalThis, key);
    await browser.happyDOM.close();
  }
}

test("selecting Qukasoft replaces the feed form with XML-only upload", async () => {
  await withConsole(async (container) => {
    await act(async () => { (container.querySelector("#catalog-source-feed") as HTMLButtonElement).click(); });
    assert.ok(container.querySelector("#catalog-feed-url"));
    await act(async () => { (container.querySelector('input[value="qukasoft"]') as HTMLInputElement).click(); });
    assert.equal(container.querySelector("#catalog-feed-url") === null, true);
    assert.equal(container.querySelector('input[type="file"]')?.getAttribute("accept"), ".xml,application/xml,text/xml");
  });
});

test("Qukasoft preview counts native variants and shows excluded source rows as a clear warning", async () => {
  const source = '<products><product><id>1</id><name>Altın yüzük</name><productCode>YUZUK</productCode><currency>TRY</currency><active>1</active><image1>https://cdn.qukasoft.com/a.webp</image1><variants><variant><name1>Ölçü</name1><value1>12</value1><price>100</price><quantity>2</quantity><barcode>111</barcode></variant><variant><name1>Ölçü</name1><value1>14</value1><price>120</price><quantity>3</quantity><barcode>222</barcode></variant><variant><name1>Ölçü</name1><value1>16</value1><quantity>1</quantity></variant></variants></product></products>';
  await withConsole(async (container, browser) => {
    await act(async () => { (container.querySelector('input[value="qukasoft"]') as HTMLInputElement).click(); });
    const field = container.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      Object.defineProperty(field, "files", { configurable: true, value: [{ name: "products.xml", size: source.length, text: async () => source }] });
      field.dispatchEvent(new browser.Event("change", { bubbles: true }) as unknown as Event);
    });
    await act(async () => { container.querySelector("form")!.dispatchEvent(new browser.Event("submit", { bubbles: true, cancelable: true }) as unknown as Event); });
    const deadline = Date.now() + 3_000;
    while (!container.querySelector(".previewMetrics") && Date.now() < deadline) {
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
    }
    assert.deepEqual([...container.querySelectorAll(".previewMetrics strong")].slice(0, 3).map((item) => item.textContent), ["1", "2", "1"]);
    assert.match(container.querySelector(".warning")?.textContent ?? "", /1.*varyant/);
    assert.equal(container.querySelectorAll(".previewTable tbody tr").length, 2);
  });
});
