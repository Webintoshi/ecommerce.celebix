import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import React, { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import * as jsxRuntime from "react/jsx-runtime";
import { Window } from "happy-dom";
import ts from "typescript";

const root = new URL("../", import.meta.url);
const RESOURCE_ID = "e356f25b-b8a3-43a7-bd70-58efc978e2aa";

async function compileCatalogResourceConsole(calls: string[]) {
  const source = await readFile(new URL("components/catalog-admin/CatalogResourceConsole.tsx", root), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const resource = Object.freeze({
    id: RESOURCE_ID,
    kind: "collection" as const,
    name: "ATLAS-QA-COLLECTION",
    slug: "atlas-qa-collection",
    description: "QA collection",
    config: Object.freeze({}),
    status: "active" as const,
    productIds: Object.freeze([]),
    productCount: 0,
    version: 3,
    createdAt: "2026-08-31T18:00:00.000Z",
    updatedAt: "2026-08-31T18:00:00.000Z",
  });
  const api = Object.freeze({
    async resources() { return Object.freeze([resource]); },
    async archiveResource(kind: string, id: string, version: number) {
      calls.push(`${kind}:${id}:${version}`);
      return Object.freeze({ id, version: version + 1, status: "archived", updatedAt: "2026-08-31T18:01:00.000Z" });
    },
  });
  class ApiError extends Error {}
  const styles = new Proxy({}, {
    get: (_target, property) => property === "__esModule" ? true : property === "default" ? styles : String(property),
  });
  const Icon = (props: Record<string, unknown>) => createElement("svg", props);
  const Shell = ({ children }: { children?: ReactNode }) => createElement("div", null, children);
  const Header = ({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) => createElement("header", null, title, description, actions);
  const Empty = ({ title, description }: { title: string; description: string }) => createElement("div", null, title, description);
  const Link = ({ href, children, ...props }: { href: string; children?: ReactNode }) => createElement("a", { ...props, href }, children);
  const compiled: { exports: Record<string, unknown> } = { exports: {} };
  const requireModule = (specifier: string): unknown => {
    if (specifier === "react") return React;
    if (specifier === "react/jsx-runtime") return jsxRuntime;
    if (specifier === "next/link") return { __esModule: true, default: Link };
    if (specifier === "lucide-react") return new Proxy({}, { get: () => Icon });
    if (specifier === "@celebix/saas-contracts") return { parseStorefrontAsset(value: unknown) { return value; } };
    if (specifier === "@/components/panel/PanelPageShell") return { PanelEmptyState: Empty, PanelPageHeader: Header, PanelPageShell: Shell };
    if (specifier === "@/lib/catalog-admin-ui/client") return { CatalogAdminApiError: ApiError, catalogAdminApi: api };
    if (specifier === "@/lib/catalog-admin-ui/brand-product-directory") return { brandLogoAssetId() { return null; }, async loadBrandProductDirectory() { return Object.freeze([]); } };
    if (specifier === "@/lib/catalog-ui/client") return { catalogApi: Object.freeze({}) };
    if (specifier === "@/lib/catalog-admin-ui/resource-route") return { getCatalogResourceRouteDefinitionForKind() { return Object.freeze({ segment: "collections" }); } };
    if (specifier === "./catalog-admin-console.module.css") return styles;
    throw new Error(`unexpected_catalog_resource_console_import:${specifier}`);
  };
  Function("require", "module", "exports", output)(requireModule, compiled, compiled.exports);
  const Console = compiled.exports.CatalogResourceConsole;
  assert.equal(typeof Console, "function");
  return Console as (props: Readonly<{ kind: "collection"; canManage: boolean }>) => ReactNode;
}

function installDomGlobals(window: Window): () => void {
  const replacements = {
    window,
    document: window.document,
    navigator: window.navigator,
    Node: window.Node,
    Element: window.Element,
    HTMLElement: window.HTMLElement,
    HTMLButtonElement: window.HTMLButtonElement,
    Event: window.Event,
    MouseEvent: window.MouseEvent,
    MutationObserver: window.MutationObserver,
    getComputedStyle: window.getComputedStyle.bind(window),
    requestAnimationFrame: window.requestAnimationFrame.bind(window),
    cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
    IS_REACT_ACT_ENVIRONMENT: true,
  } as const;
  const originals = new Map<PropertyKey, PropertyDescriptor | undefined>();
  for (const [name, value] of Object.entries(replacements)) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  return () => {
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  };
}

test("catalog resource archive stays an isolated button action inside a surrounding form", async () => {
  const window = new Window({ url: "https://panel.example.test/products/collections" });
  const restoreGlobals = installDomGlobals(window);
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const reactRoot = createRoot(container as unknown as Parameters<typeof createRoot>[0]);
  const archiveCalls: string[] = [];
  let formSubmissions = 0;
  try {
    const Console = await compileCatalogResourceConsole(archiveCalls);
    await act(async () => {
      reactRoot.render(createElement("form", {
        onSubmit(event) { event.preventDefault(); formSubmissions += 1; },
      }, createElement(Console, { kind: "collection", canManage: true })));
    });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    const archive = [...container.querySelectorAll("button")].find((button) => button.textContent === "Arşivle");
    assert.ok(archive);
    await act(async () => { archive.click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
    assert.deepEqual(archiveCalls, [`collection:${RESOURCE_ID}:3`]);
    assert.equal(formSubmissions, 0, "archive must not inherit submit behavior from an ancestor form");
  } finally {
    await act(async () => { reactRoot.unmount(); });
    restoreGlobals();
    await window.happyDOM.close();
  }
});
