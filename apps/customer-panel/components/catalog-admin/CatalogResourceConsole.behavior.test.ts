import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as React from "react";
import { act, createElement } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { Window } from "happy-dom";
import ts from "typescript";

const BRAND = Object.freeze({
  id: "11111111-1111-4111-8111-111111111111", kind: "brand", name: "Arpaş", slug: "arpas",
  config: {}, productIds: ["22222222-2222-4222-8222-222222222222"], productCount: 1,
  version: 2, status: "active",
});
const OTHER_BRAND = Object.freeze({ ...BRAND, id: "44444444-4444-4444-8444-444444444444", name: "Cetaş", slug: "cetas", productIds: [], productCount: 0 });
const PRODUCT = Object.freeze({ id: BRAND.productIds[0], title: "Özel Altın Bileklik", representativeSku: "B-77", variantCount: 1, status: "active" });
type Kind = "brand" | "attribute";

async function withConsole(
  options: Readonly<{
    kind?: Kind;
    resources?: (kind: Kind) => Promise<readonly unknown[]>;
    logos?: (signal: AbortSignal) => Promise<unknown>;
    directory?: (signal: AbortSignal) => Promise<readonly unknown[]>;
  }>,
  verify: (context: Readonly<{ container: HTMLElement; browser: Window; render(kind: Kind): Promise<void>; settle(): Promise<void>; directoryCalls(): number }>) => Promise<void>,
) {
  const browser = new Window({ url: "https://panel.example.test/products/brands" });
  const globals = new Map<string, PropertyDescriptor | undefined>();
  let directoryCalls = 0;
  const fetchStub = (_url: unknown, init?: RequestInit) => options.logos
    ? options.logos(init?.signal as AbortSignal)
    : Promise.resolve({ ok: true, json: async () => ({ assets: [] }) });
  for (const [key, value] of Object.entries({
    window: browser, document: browser.document, navigator: browser.navigator,
    HTMLElement: browser.HTMLElement, HTMLInputElement: browser.HTMLInputElement,
    Event: browser.Event, MouseEvent: browser.MouseEvent, MutationObserver: browser.MutationObserver,
    fetch: fetchStub, IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const { createRoot } = await import("react-dom/client");
  const source = await readFile(new URL("./CatalogResourceConsole.tsx", import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const styles = new Proxy({}, { get: (_target, key) => key === "__esModule" ? true : key === "default" ? styles : String(key) });
  const compiled: { exports: Record<string, unknown> } = { exports: {} };
  Function("require", "module", "exports", output)((name: string) => {
    if (name === "react") return React;
    if (name === "react/jsx-runtime") return jsxRuntime;
    if (name === "next/link") return ({ href, children, ...props }: { href: string; children: React.ReactNode }) => createElement("a", { href, ...props }, children);
    if (name === "lucide-react") return { ImageOff: () => null, Search: () => null, Pencil: () => null, Archive: () => null };
    if (name === "@celebix/saas-contracts") return { parseStorefrontAsset: (asset: unknown) => asset };
    if (name === "@/components/panel/PanelPageShell") return {
      PanelPageShell: ({ children }: { children: React.ReactNode }) => children,
      PanelPageHeader: ({ title, actions }: { title: string; actions?: React.ReactNode }) => createElement("header", null, title, actions),
      PanelEmptyState: ({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) => createElement("div", null, title, description, action),
    };
    if (name === "@/lib/catalog-admin-ui/client") return { catalogAdminApi: { resources: options.resources ?? (async () => [BRAND]) }, CatalogAdminApiError: class extends Error {} };
    if (name === "@/lib/catalog-admin-ui/brand-product-directory") return {
      brandLogoAssetId: (config: Record<string, unknown>) => typeof config.logoAssetId === "string" ? config.logoAssetId : undefined,
      loadBrandProductDirectory: (_api: unknown, signal: AbortSignal) => { directoryCalls += 1; return options.directory?.(signal) ?? Promise.resolve([PRODUCT]); },
    };
    if (name === "@/lib/catalog-ui/client") return { catalogApi: {} };
    if (name === "@/lib/catalog-admin-ui/resource-route") return { getCatalogResourceRouteDefinitionForKind: (kind: Kind) => ({ segment: kind === "brand" ? "brands" : "attributes" }) };
    if (name === "./catalog-admin-console.module.css") return styles;
    throw new Error(`unexpected_import:${name}`);
  }, compiled, compiled.exports);
  const Console = compiled.exports.CatalogResourceConsole as React.ComponentType<{ kind: Kind; canManage: boolean }>;
  const container = browser.document.createElement("div");
  browser.document.body.append(container);
  const root = createRoot(container as unknown as Parameters<typeof createRoot>[0]);
  const settle = async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); };
  const render = async (kind: Kind) => { await act(async () => { root.render(createElement(Console, { kind, canManage: true })); await new Promise((resolve) => setTimeout(resolve, 0)); }); };
  try {
    await render(options.kind ?? "brand");
    await verify({ container: container as unknown as HTMLElement, browser, render, settle, directoryCalls: () => directoryCalls });
  } finally {
    await act(async () => root.unmount());
    for (const [key, descriptor] of globals) descriptor ? Object.defineProperty(globalThis, key, descriptor) : Reflect.deleteProperty(globalThis, key);
    await browser.happyDOM.close();
  }
}

test("brand rows render while logos are pending, without preloading the product directory", async () => {
  await withConsole({ logos: async () => new Promise(() => {}) }, async ({ container, directoryCalls }) => {
    assert.match(container.textContent ?? "", /Arpaş/);
    assert.match(container.textContent ?? "", /1 ürün/);
    assert.equal(directoryCalls(), 0);
    assert.equal(container.querySelector('button[aria-pressed="false"]:disabled')?.textContent, "Görselsiz");
    assert.ok(container.querySelector('[aria-label="Logo yükleniyor"]'));
    assert.doesNotMatch(container.textContent ?? "", /\/arpas/);
  });
  await withConsole({ logos: async () => { throw new Error("asset service offline"); } }, async ({ container, directoryCalls }) => {
    assert.match(container.textContent ?? "", /Arpaş/);
    assert.match(container.textContent ?? "", /Logolar yüklenemedi/);
    assert.equal(directoryCalls(), 0);
  });
});

test("linked products load on first details open, recover after a failed request, and search by SKU", async () => {
  let attempt = 0;
  await withConsole({ resources: async () => [BRAND, OTHER_BRAND], directory: async () => { if (++attempt === 1) throw new Error("offline"); return [PRODUCT]; } }, async ({ container, browser, settle, directoryCalls }) => {
    assert.equal(directoryCalls(), 0);
    assert.match(container.textContent ?? "", /2 \/ 2 marka/);
    const details = container.querySelector("details");
    assert.ok(details);
    await act(async () => { details.open = true; details.dispatchEvent(new browser.Event("toggle", { bubbles: true }) as unknown as Event); await new Promise((resolve) => setTimeout(resolve, 0)); });
    assert.equal(directoryCalls(), 1);
    assert.match(container.textContent ?? "", /Ürün adları yüklenemedi/);
    const retry = [...container.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Tekrar dene");
    assert.ok(retry);
    await act(async () => { retry.click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
    assert.equal(directoryCalls(), 2);
    assert.match(container.textContent ?? "", /Özel Altın Bileklik/);
    const search = container.querySelector('input[type="search"]') as HTMLInputElement | null;
    assert.ok(search);
    await act(async () => {
      Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype, "value")?.set?.call(search, "B-77");
      search.dispatchEvent(new browser.Event("input", { bubbles: true }) as unknown as Event);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await settle();
    assert.equal(search.value, "B-77");
    assert.match(container.textContent ?? "", /1 \/ 2 marka/);
    assert.doesNotMatch(container.textContent ?? "", /Cetaş/);
    assert.equal(directoryCalls(), 2, "search reuses the loaded directory");
  });
});

test("a late brand response and logo failure cannot replace a newer resource kind", async () => {
  let resolveBrands: ((resources: readonly unknown[]) => void) | undefined;
  let rejectLogos: ((error: Error) => void) | undefined;
  let firstSignal: AbortSignal | undefined;
  const brandResponse = new Promise<readonly unknown[]>((resolve) => { resolveBrands = resolve; });
  const logoResponse = new Promise<unknown>((_resolve, reject) => { rejectLogos = reject; });
  const attribute = { id: "33333333-3333-4333-8333-333333333333", kind: "attribute", name: "Renk", slug: "renk", config: { values: ["Siyah"] }, productIds: [], productCount: 0, version: 1, status: "active" };
  await withConsole({
    resources: async (kind) => kind === "brand" ? brandResponse : [attribute],
    logos: (signal) => { firstSignal = signal; return logoResponse; },
  }, async ({ container, render, settle, directoryCalls }) => {
    await render("attribute");
    assert.equal(firstSignal?.aborted, true);
    resolveBrands?.([BRAND]);
    rejectLogos?.(new Error("late logo failure"));
    await settle();
    assert.match(container.textContent ?? "", /Renk|Siyah/);
    assert.doesNotMatch(container.textContent ?? "", /Arpaş|Logolar yüklenemedi/);
    assert.equal(directoryCalls(), 0);
  });
});
