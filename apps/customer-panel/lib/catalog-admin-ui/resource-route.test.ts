import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import * as React from "react";
import { createElement, type ReactNode } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import ts from "typescript";

const root = new URL("../../", import.meta.url);

async function source(path: string) {
  return readFile(new URL(path, root), "utf8");
}

function createHookRuntime() {
  const slots: unknown[] = [];
  let cursor = 0;
  let dirty = true;
  let latest: ReactNode;
  const sameDeps = (left: readonly unknown[] | undefined, right: readonly unknown[]) =>
    left !== undefined && left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
  const runtime = {
    ...React,
    useState<T>(initial: T | (() => T)) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? (initial as () => T)() : initial;
      const set = (next: T | ((current: T) => T)) => { slots[index] = typeof next === "function" ? (next as (current: T) => T)(slots[index] as T) : next; dirty = true; };
      return [slots[index] as T, set] as const;
    },
    useRef<T>(initial: T) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index] as { current: T };
    },
    useCallback<T extends (...args: never[]) => unknown>(callback: T, deps: readonly unknown[]) {
      const index = cursor++;
      const prior = slots[index] as { deps: readonly unknown[]; value: T } | undefined;
      if (prior === undefined || !sameDeps(prior.deps, deps)) slots[index] = { deps: [...deps], value: callback };
      return (slots[index] as { value: T }).value;
    },
    useEffect(effect: () => void | (() => void), deps: readonly unknown[]) {
      const index = cursor++;
      const prior = slots[index] as { deps: readonly unknown[]; cleanup?: () => void } | undefined;
      if (prior !== undefined && sameDeps(prior.deps, deps)) return;
      prior?.cleanup?.();
      const cleanup = effect();
      slots[index] = { deps: [...deps], ...(typeof cleanup === "function" ? { cleanup } : {}) };
    },
  } as unknown as typeof React;
  return {
    runtime,
    async flush(component: () => ReactNode, force = false) {
      if (force) dirty = true;
      for (let pass = 0; pass < 20; pass += 1) {
        if (dirty || latest === undefined) { dirty = false; cursor = 0; latest = component(); }
        await new Promise<void>((resolve) => setImmediate(resolve));
        if (!dirty) return latest;
      }
      throw new Error("catalog_editor_hook_flush_exhausted");
    },
  };
}

function visitElements(node: ReactNode, visitor: (element: React.ReactElement<Record<string, unknown>>) => void) {
  React.Children.forEach(node, (child) => {
    if (!React.isValidElement<Record<string, unknown>>(child)) return;
    visitor(child);
    visitElements(child.props.children as ReactNode, visitor);
  });
}

function firstElement(node: ReactNode, type: string) {
  let result: React.ReactElement<Record<string, unknown>> | undefined;
  visitElements(node, (element) => { if (element.type === type && result === undefined) result = element; });
  assert.ok(result, `expected_${type}_element`);
  return result;
}

async function compileCatalogResourceEditor(overrides: Readonly<{
  react: typeof React;
  resource: (kind: string, resourceId: string) => Promise<Record<string, unknown>>;
  products?: (input?: Readonly<{ cursor?: string }>) => Promise<Readonly<{ items: readonly Record<string, unknown>[]; nextCursor?: string }>>;
  save: (kind: string, input: unknown) => Promise<unknown>;
  push: (path: string) => void;
}>) {
  const output = ts.transpileModule(await source("components/catalog-admin/CatalogResourceEditor.tsx"), {
    compilerOptions: { esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const styles = new Proxy({}, { get: (_target, property) => property === "__esModule" ? true : property === "default" ? styles : String(property) });
  class CompiledCatalogAdminApiError extends Error { }
  const route = await import("./resource-route.ts");
  const compiled: { exports: Record<string, unknown> } = { exports: {} };
  const requireModule = (specifier: string): unknown => {
    if (specifier === "react/jsx-runtime") return jsxRuntime;
    if (specifier === "react") return overrides.react;
    if (specifier === "next/navigation") return { useRouter: () => ({ push: overrides.push, refresh() {} }) };
    if (specifier === "@/components/panel/PanelPageShell") return {
      PanelPageShell: ({ children }: { children?: ReactNode }) => createElement("section", null, children),
      PanelPageHeader: ({ title, description }: { title: string; description: string }) => createElement("header", null, createElement("h1", null, title), createElement("p", null, description)),
    };
    if (specifier === "@/components/catalog-admin/CatalogBrandLogoPicker") return { CatalogBrandLogoPicker: () => createElement("div", { "data-brand-logo-picker": true }) };
    if (specifier === "@/lib/catalog-admin-ui/client") return { CatalogAdminApiError: CompiledCatalogAdminApiError, catalogAdminApi: Object.freeze({ resource: overrides.resource, saveResource: overrides.save }) };
    if (specifier === "@/lib/catalog-admin-ui/brand-product-directory") return { brandLogoAssetId: (config: Readonly<Record<string, unknown>>) => typeof config.logoAssetId === "string" ? config.logoAssetId : undefined, loadBrandProductDirectory: async () => [] };
    if (specifier === "@/lib/catalog-ui/client") return { catalogApi: Object.freeze({ listProducts: overrides.products ?? (async () => ({ items: [] })) }) };
    if (specifier === "@/lib/catalog-admin-ui/resource-route") return route;
    if (specifier === "./catalog-admin-console.module.css") return styles;
    if (specifier === "@celebix/saas-contracts") return {};
    throw new Error(`unexpected_catalog_resource_editor_import:${specifier}`);
  };
  Function("require", "module", "exports", output)(requireModule, compiled, compiled.exports);
  return compiled.exports.CatalogResourceEditor as (props: { kind: "collection" | "brand"; resourceId: string; canManage: boolean }) => ReactNode;
}

test("binds catalog route segments to fixed resource kinds", async () => {
  const route = await import("./resource-route.ts");

  assert.equal(route.getCatalogResourceRouteDefinition("collections").kind, "collection");
  assert.equal(route.getCatalogResourceRouteDefinition("brands").kind, "brand");
  assert.equal(route.getCatalogResourceRouteDefinition("attributes").kind, "attribute");
  assert.equal(route.getCatalogResourceRouteDefinition("extras").kind, "extra");
  assert.equal(route.getCatalogResourceRouteDefinition("definitions").kind, "definition");
  assert.throws(() => route.getCatalogResourceRouteDefinition("../brands"), /catalog_resource_route_invalid/);
  assert.throws(() => route.getCatalogResourceRouteDefinition("collection"), /catalog_resource_route_invalid/);
});

test("selects an editor resource only when its opaque ID and fixed kind match the scoped API list", async () => {
  const route = await import("./resource-route.ts");
  const collection = Object.freeze({ id: "collection-id", kind: "collection" });
  const brandWithTheSameId = Object.freeze({ id: "collection-id", kind: "brand" });
  const otherStoreOpaqueId = Object.freeze({ id: "other-store-id", kind: "collection" });

  assert.equal(route.selectCatalogResourceForEdit([collection, brandWithTheSameId], "collection", "collection-id"), collection);
  assert.equal(route.selectCatalogResourceForEdit([brandWithTheSameId, otherStoreOpaqueId], "collection", "collection-id"), undefined);
  assert.equal(route.selectCatalogResourceForEdit([collection], "collection", "other-store-id"), undefined);
});

test("catalog editor ignores a late A read after route B is loaded and submits only B's version", async () => {
  const hookRuntime = createHookRuntime();
  const saves: unknown[] = [];
  let resolveA: ((value: Record<string, unknown>) => void) | undefined;
  let calls = 0;
  const resourceA = Object.freeze({ id: "resource-a", kind: "collection", version: 7, name: "A", slug: "a", config: {}, productIds: [] });
  const resourceB = Object.freeze({ id: "resource-b", kind: "collection", version: 11, name: "B", slug: "b", config: {}, productIds: [] });
  const Editor = await compileCatalogResourceEditor({
    react: hookRuntime.runtime,
    resource: async () => {
      calls += 1;
      if (calls === 1) return new Promise<Record<string, unknown>>((resolve) => { resolveA = resolve; });
      return resourceB;
    },
    save: async (_kind, input) => { saves.push(input); return {}; },
    push() {},
  });
  let selectedId = "resource-a";
  const Console = () => Editor({ kind: "collection", resourceId: selectedId, canManage: true });
  await hookRuntime.flush(Console);

  selectedId = "resource-b";
  let view = await hookRuntime.flush(Console, true);
  assert.equal(firstElement(view, "form").props.children !== undefined, true);
  resolveA?.(resourceA);
  view = await hookRuntime.flush(Console);

  let name = "";
  visitElements(view, (element) => { if (element.type === "input" && element.props.name === "name") name = String(element.props.defaultValue); });
  assert.equal(name, "B");
  const form = firstElement(view, "form");
  const originalFormData = globalThis.FormData;
  class TestFormData {
    get(name: string) { return ({ name: "B", slug: "b", description: "" } as Record<string, string>)[name] ?? null; }
    getAll(name: string) { return name === "productId" ? [] : []; }
  }
  Object.defineProperty(globalThis, "FormData", { configurable: true, value: TestFormData });
  try {
    await (form.props.onSubmit as (event: { preventDefault(): void; currentTarget: unknown }) => Promise<void>)({ preventDefault() {}, currentTarget: {} });
  } finally {
    Object.defineProperty(globalThis, "FormData", { configurable: true, value: originalFormData });
  }
  assert.deepEqual(saves, [{ resourceId: "resource-b", expectedVersion: 11, name: "B", slug: "b", config: { featured: false }, productIds: [] }]);
});

test("catalog editor preserves an existing product relation outside the first page until explicitly removed", async () => {
  const hookRuntime = createHookRuntime();
  const saves: unknown[] = [];
  const unseen = "72000000-0000-4000-8000-000000000099";
  const firstPage = Array.from({ length: 20 }, (_, index) => ({
    id: `72000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    title: `Ürün ${index + 1}`,
  }));
  const Editor = await compileCatalogResourceEditor({
    react: hookRuntime.runtime,
    resource: async () => ({ id: "resource-a", kind: "collection", version: 7, name: "A", slug: "a", config: {}, productIds: [unseen] }),
    products: async () => ({ items: firstPage, nextCursor: "next-page" }),
    save: async (_kind, input) => { saves.push(input); return {}; },
    push() {},
  });
  const Console = () => Editor({ kind: "collection", resourceId: "resource-a", canManage: true });
  const view = await hookRuntime.flush(Console);
  let unseenCheckbox: React.ReactElement<Record<string, unknown>> | undefined;
  visitElements(view, (element) => {
    if (element.type === "input" && element.props.value === unseen) unseenCheckbox = element;
  });
  assert.ok(unseenCheckbox);
  assert.equal(unseenCheckbox.props.checked, true);
  const originalFormData = globalThis.FormData;
  class TestFormData {
    get(name: string) { return ({ name: "A", slug: "a", description: "" } as Record<string, string>)[name] ?? null; }
  }
  Object.defineProperty(globalThis, "FormData", { configurable: true, value: TestFormData });
  try {
    const form = firstElement(view, "form");
    await (form.props.onSubmit as (event: { preventDefault(): void; currentTarget: unknown }) => Promise<void>)({ preventDefault() {}, currentTarget: {} });
  } finally {
    Object.defineProperty(globalThis, "FormData", { configurable: true, value: originalFormData });
  }
  assert.deepEqual(saves, [{ resourceId: "resource-a", expectedVersion: 7, name: "A", slug: "a", config: { featured: false }, productIds: [unseen] }]);
});

test("brand editor binds an uploaded tenant logo to the saved brand configuration", async () => {
  const hookRuntime = createHookRuntime();
  const oldLogo = "74000000-0000-4000-8000-000000000001";
  const nextLogo = "74000000-0000-4000-8000-000000000002";
  const Editor = await compileCatalogResourceEditor({
    react: hookRuntime.runtime,
    resource: async () => ({ id: "brand-a", kind: "brand", version: 2, name: "Güzide", slug: "guzide", config: { logoAssetId: oldLogo }, productIds: [] }),
    save: async () => ({}),
    push() {},
  });
  const Console = () => Editor({ kind: "brand", resourceId: "brand-a", canManage: true });
  let view = await hookRuntime.flush(Console);
  let logoPicker: React.ReactElement<Record<string, unknown>> | undefined;
  visitElements(view, (element) => {
    if (element.props.brandName === "Güzide" && typeof element.props.onChange === "function") logoPicker = element;
  });
  assert.ok(logoPicker);
  assert.equal(logoPicker.props.value, oldLogo);
  (logoPicker.props.onChange as (value: string) => void)(nextLogo);
  view = await hookRuntime.flush(Console);
  let hiddenLogo = "";
  visitElements(view, (element) => {
    if (element.type === "input" && element.props.name === "logoAssetId") hiddenLogo = String(element.props.value);
  });
  assert.equal(hiddenLogo, nextLogo);
});

test("every catalog kind has fixed create and edit pages, with a preview only for extras", async () => {
  for (const segment of ["collections", "brands", "attributes", "extras", "definitions"]) {
    await access(new URL(`app/products/${segment}/new/page.tsx`, root));
    await access(new URL(`app/products/${segment}/[resourceId]/edit/page.tsx`, root));
    const create = await source(`app/products/${segment}/new/page.tsx`);
    const edit = await source(`app/products/${segment}/[resourceId]/edit/page.tsx`);
    assert.match(create, /requireServerPanelAccess/);
    assert.match(edit, /requireServerPanelAccess/);
  }
  await access(new URL("app/products/extras/[resourceId]/preview/page.tsx", root));
});

test("editor only writes an exact resource selected from the fixed-kind API result", async () => {
  const editor = await source("components/catalog-admin/CatalogResourceEditor.tsx");
  assert.match(editor, /catalogAdminApi\.resource\(kind, resourceId\)/);
  assert.match(editor, /productIds:\s*selectedProductIds/);
  assert.match(editor, /Daha fazla ürün yükle/);
  assert.match(editor, /Ürün adı veya SKU ile ara/);
  assert.match(editor, /resourceId: resource\.id, expectedVersion: resource\.version/);
  assert.doesNotMatch(editor, /searchParams|localStorage|sessionStorage|x-store-id|x-tenant-id|supabase|\/api\/admin/);
});

test("extra preview renders untrusted option text and minor-unit prices without unsafe HTML", async () => {
  const preview = await source("components/catalog-admin/CatalogExtraPreview.tsx");
  assert.match(preview, /catalogAdminApi\.resource\("extra", resourceId\)/);
  assert.match(preview, /options\.map/);
  assert.match(preview, /formatTry\(priceAdjustmentCents\)/);
  assert.match(preview, /styles\.previewHero/);
  assert.match(preview, /styles\.previewPrice/);
  assert.match(preview, /styles\.previewOptionGrid/);
  assert.match(preview, /Canlı müşteri görünümü/);
  assert.doesNotMatch(preview, /dangerouslySetInnerHTML|<iframe|eval\(|new Function|import\(/);
});
