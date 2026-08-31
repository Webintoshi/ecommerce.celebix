import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as React from "react";
import { createElement, type ReactNode } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import ts from "typescript";

const ROOT = new URL("../", import.meta.url);

async function source(path: string) {
  return readFile(new URL(path, ROOT), "utf8");
}

async function productionProductListModule() {
  const list = await source("components/catalog/ProductListConsole.tsx");
  const compiled = ts.transpileModule(list, {
    compilerOptions: {
      jsx: ts.JsxEmit.React,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const module = { exports: {} as Record<string, unknown> };
  const fakeReact = Object.freeze({
    createElement() { return null; },
    useCallback: (value: unknown) => value,
    useEffect() {},
    useMemo: (value: () => unknown) => value(),
    useRef: (value: unknown) => ({ current: value }),
    useState: (value: unknown) => [value, () => undefined],
  });
  const requireStub = (specifier: string) => {
    if (specifier === "react") return fakeReact;
    if (specifier === "next/link") return () => null;
    if (specifier === "lucide-react") return new Proxy({}, { get: () => () => null });
    if (specifier === "@/components/panel/PanelTopbarChrome") return { PanelTopbarBridge: () => null };
    if (specifier === "@/components/catalog-onboarding/ProductQuickCreateDialog") return { ProductQuickCreateDialog: () => null };
    if (specifier === "@/components/catalog-onboarding/ProductAdvancedEditor") return { ProductAdvancedEditor: () => null };
    if (specifier === "@/lib/catalog-onboarding-ui/client") return { catalogOnboardingClient: { async getOptions() { return { categories: [], resources: [], locations: [], channels: [] }; } } };
    if (specifier === "@/lib/catalog-ui/product-list-query") return {
      parseProductListUrlState: () => ({ query: { sort: "updated-desc" }, pageSize: 20 }),
      productListUrlStateQuery: () => "",
    };
    if (specifier === "@/lib/catalog-ui/product-draft-session") return {
      commitProductDraft: (session: unknown) => session,
      createEmptyProductDraftSession: () => ({ initial: {}, current: {} }),
      productDraftIsDirty: () => false,
    };
    if (specifier === "@/lib/catalog-ui/client") {
      class CatalogApiError extends Error {
        code = "unavailable";
      }
      return { CatalogApiError, catalogApi: {} };
    }
    return {};
  };
  Function("require", "module", "exports", compiled)(requireStub, module, module.exports);
  return module.exports;
}

type MountedNode = Readonly<{
  type: string;
  props: Record<string, unknown>;
  children: readonly (MountedNode | string)[];
}>;

function createHookRuntime() {
  const slots: unknown[] = [];
  let cursor = 0;
  let dirty = true;
  let latest: ReactNode;
  const same = (left: readonly unknown[] | undefined, right: readonly unknown[]) =>
    left !== undefined && left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
  const runtime = {
    ...React,
    useState<T>(initial: T | (() => T)) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? (initial as () => T)() : initial;
      const set = (next: T | ((current: T) => T)) => {
        slots[index] = typeof next === "function" ? (next as (current: T) => T)(slots[index] as T) : next;
        dirty = true;
      };
      return [slots[index] as T, set] as const;
    },
    useRef<T>(initial: T) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index] as { current: T };
    },
    useMemo<T>(factory: () => T, deps: readonly unknown[]) {
      const index = cursor++;
      const prior = slots[index] as { deps: readonly unknown[]; value: T } | undefined;
      if (!prior || !same(prior.deps, deps)) slots[index] = { deps: [...deps], value: factory() };
      return (slots[index] as { value: T }).value;
    },
    useCallback<T extends (...args: never[]) => unknown>(callback: T, deps: readonly unknown[]) {
      const index = cursor++;
      const prior = slots[index] as { deps: readonly unknown[]; value: T } | undefined;
      if (!prior || !same(prior.deps, deps)) slots[index] = { deps: [...deps], value: callback };
      return (slots[index] as { value: T }).value;
    },
    useEffect(effect: () => void | (() => void), deps: readonly unknown[]) {
      const index = cursor++;
      const prior = slots[index] as { deps: readonly unknown[]; cleanup?: () => void } | undefined;
      if (prior && same(prior.deps, deps)) return;
      prior?.cleanup?.();
      const cleanup = effect();
      slots[index] = { deps: [...deps], ...(typeof cleanup === "function" ? { cleanup } : {}) };
    },
  } as unknown as typeof React;
  return {
    runtime,
    async flush(component: () => ReactNode) {
      for (let pass = 0; pass < 40; pass += 1) {
        if (dirty || latest === undefined) {
          dirty = false;
          cursor = 0;
          latest = component();
        }
        await new Promise<void>((resolve) => setImmediate(resolve));
        if (!dirty) return latest;
      }
      throw new Error("product_console_hook_flush_exhausted");
    },
  };
}

function mount(node: ReactNode): readonly (MountedNode | string)[] {
  if (node === null || node === undefined || typeof node === "boolean") return [];
  if (typeof node === "string" || typeof node === "number") return [String(node)];
  if (Array.isArray(node)) return node.flatMap(mount);
  if (!React.isValidElement<Record<string, unknown>>(node)) return [];
  if (node.type === React.Fragment) return mount(node.props.children as ReactNode);
  if (typeof node.type === "function") {
    return mount((node.type as (props: Record<string, unknown>) => ReactNode)(node.props));
  }
  if (typeof node.type !== "string") return [];
  const target = { isConnected: true, focus() {}, querySelectorAll() { return []; } };
  const ref = (node.props as { ref?: unknown }).ref;
  if (typeof ref === "function") ref(target);
  else if (ref && typeof ref === "object" && "current" in ref) (ref as { current: unknown }).current = target;
  return [Object.freeze({ type: node.type, props: node.props, children: mount(node.props.children as ReactNode) })];
}

function mountedNodes(tree: readonly (MountedNode | string)[]): MountedNode[] {
  const nodes: MountedNode[] = [];
  for (const child of tree) {
    if (typeof child === "string") continue;
    nodes.push(child, ...mountedNodes(child.children));
  }
  return nodes;
}

function mountedText(node: MountedNode | string): string {
  return typeof node === "string" ? node : node.children.map(mountedText).join("");
}

function productFixture(id: string, status: "draft" | "active" | "archived", version: number, title = `Ürün ${id}`) {
  return Object.freeze({
    id,
    title,
    slug: title.toLocaleLowerCase("tr-TR").replaceAll(" ", "-"),
    status,
    currency: "TRY",
    createdAt: "2026-07-24T09:00:00.000Z",
    updatedAt: `2026-07-24T09:00:0${version}.000Z`,
    version,
  });
}

const catalogSummary = Object.freeze({
  totalProducts: 2,
  activeProducts: 1,
  draftProducts: 1,
  productLimit: 100,
  activeVariants: 2,
  outOfStockVariants: 0,
  productsWithoutMedia: 2,
  activeMedia: 0,
});

async function createMountedProductConsole(
  api: Record<string, unknown>,
  props: Readonly<{ canManage?: boolean; canArchive?: boolean; canImport?: boolean }> = { canManage: true, canArchive: true, canImport: true },
  onboarding: Record<string, unknown> = { async getOptions() { return { categories: [], resources: [], locations: [], channels: [] }; } },
) {
  const output = ts.transpileModule(await source("components/catalog/ProductListConsole.tsx"), {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const hooks = createHookRuntime();
  const Icon = (props: Record<string, unknown>) => createElement("svg", props);
  const Link = ({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) => createElement("a", props, children);
  class CompiledCatalogApiError extends Error {
    constructor(readonly code: string) { super(code); }
  }
  const compiled = { exports: {} as Record<string, unknown> };
  const requireModule = (specifier: string): unknown => {
    if (specifier === "react/jsx-runtime") return jsxRuntime;
    if (specifier === "react") return hooks.runtime;
    if (specifier === "next/link") return Link;
    if (specifier === "lucide-react") return new Proxy({}, { get: () => Icon });
    if (specifier === "@celebix/saas-contracts") return { catalogProductListQueryDigest: (value: unknown) => JSON.stringify(value) };
    if (specifier === "@/components/panel/PanelTopbarChrome") {
      return { PanelTopbarBridge: ({ actions }: { actions?: ReactNode }) => createElement("aside", { "data-topbar": true }, actions) };
    }
    if (specifier === "@/components/catalog-onboarding/ProductQuickCreateDialog") return { ProductQuickCreateDialog: () => null };
    if (specifier === "@/components/catalog-onboarding/ProductAdvancedEditor") return { ProductAdvancedEditor: () => null };
    if (specifier === "@/lib/catalog-onboarding-ui/client") return { catalogOnboardingClient: onboarding };
    if (specifier === "@/lib/catalog-ui/product-list-query") return {
      parseProductListUrlState: () => ({ query: { sort: "updated-desc" }, pageSize: 20 }),
      productListUrlStateQuery: () => "",
    };
    if (specifier === "@/lib/catalog-ui/product-draft-session") return {
      commitProductDraft: (session: unknown) => session,
      createEmptyProductDraftSession: () => ({ initial: {}, current: {} }),
      productDraftIsDirty: () => false,
    };
    if (specifier === "@/lib/catalog-ui/client") {
      return { CatalogApiError: CompiledCatalogApiError, catalogApi: Object.freeze(api) };
    }
    throw new Error(`unexpected_product_console_import:${specifier}`);
  };
  Function("require", "module", "exports", output)(requireModule, compiled, compiled.exports);
  const Console = compiled.exports.ProductListConsole as (value: typeof props) => ReactNode;
  assert.equal(typeof Console, "function");
  return {
    async render() { return mount(await hooks.flush(() => Console(props))); },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => { resolve = onResolve; reject = onReject; });
  return { promise, reject, resolve };
}

test("product routes stay behind the durable server panel access guard", async () => {
  const layout = await source("app/products/layout.tsx");
  assert.match(layout, /requireServerPanelAccess/);
  assert.match(layout, /tenantContext/);
  for (const path of [
    "app/products/page.tsx",
    "app/products/new/page.tsx",
    "app/products/[productId]/page.tsx",
  ]) {
    assert.ok((await source(path)).length > 0, path);
  }
});

test("catalog browser code is same-origin and contains no browser tenant or credential authority", async () => {
  const files = [
    "lib/catalog-ui/client.ts",
    "components/catalog/ProductListConsole.tsx",
    "components/catalog/ProductCreateForm.tsx",
    "components/catalog/ProductDetailConsole.tsx",
  ];
  const combined = (await Promise.all(files.map(source))).join("\n");
  assert.match(combined, /credentials:\s*["']same-origin["']/);
  assert.match(combined, /crypto\.randomUUID/);
  assert.doesNotMatch(combined, /document\.cookie|localStorage|sessionStorage|x-forwarded|\bstoreId\b/i);
  assert.doesNotMatch(combined, /postgres|repository|database/i);
});

test("authenticated shell shows store role and uses a top-level secure logout navigation", async () => {
  const layout = await source("app/(panel)/layout.tsx");
  const shell = await source("components/panel/PanelShell.tsx");
  const clientFiles = await Promise.all([
    "components/panel/PanelLayoutClient.tsx",
    "components/panel/PanelSidebar.tsx",
    "components/panel/PanelNavigation.tsx",
  ].map(source));
  const logout = await source("components/panel/LogoutButton.tsx");
  assert.match(layout, /PanelShell tenantContext=/);
  assert.match(shell, /PanelLayoutClient/);
  assert.match(shell, /createPanelChromeModel/);
  assert.match(shell, /SERVER_CONTEXT_PROP/);
  assert.doesNotMatch(clientFiles.join("\n"), /TenantContext|principal|issuer|subject|storeId|membershipId|planId|domainId|requestId/);
  assert.match(logout, /\/api\/session\/logout/);
  assert.match(logout, /method="post"/);
  assert.doesNotMatch(logout, /fetch\(|location\.assign/);
  assert.doesNotMatch(`${shell}\n${logout}`, /document\.cookie|localStorage|sessionStorage/);
});

test("product UI includes safe states and responsive catalog behavior without fake records", async () => {
  const list = await source("components/catalog/ProductListConsole.tsx");
  const detail = await source("components/catalog/ProductDetailConsole.tsx");
  const styles = await source("app/globals.css");
  assert.match(list, /Henüz ürün yok/);
  assert.match(list, /Önceki/);
  assert.match(list, /Sonraki/);
  assert.match(list, /<option value="20">20<\/option>/);
  assert.match(list, /<option value="50">50<\/option>/);
  assert.match(list, /<option value="100">100<\/option>/);
  assert.match(list, /history[.]pushState/);
  assert.match(list, /addEventListener\("popstate"/);
  assert.match(list, /setCursorHistory\(Object[.]freeze\(\[\]\)\)/);
  assert.match(list, /Arşivlemeyi onayla/);
  assert.match(detail, /version_conflict/);
  assert.match(detail, /Yerel alanlarınız korunuyor/);
  assert.match(styles, /@media[^]*max-width:\s*640px/);
  assert.doesNotMatch(`${list}\n${detail}`, /placeholder analytics|fake product|image upload/i);
});

test("product lifecycle UI exposes archived filter, exact warning, restore, and shared capability props", async () => {
  const listPage = await source("app/products/page.tsx");
  const detailPage = await source("app/products/[productId]/page.tsx");
  const newPage = await source("app/products/new/page.tsx");
  const list = await source("components/catalog/ProductListConsole.tsx");
  const detail = await source("components/catalog/ProductDetailConsole.tsx");
  for (const page of [listPage, detailPage, newPage]) {
    assert.match(page, /requireServerPanelAccess/);
    assert.match(page, /isCatalogProductOperationAllowed/);
  }
  assert.match(list, /"archived"/);
  assert.match(list, /Arşivlenmiş/);
  assert.match(list, /catalogApi[.]restoreProduct/);
  assert.match(list, /canManage/);
  assert.match(list, /canArchive/);
  assert.match(list, /canImport/);
  for (const warning of [
    "Bu ürün mağazada görünmez olacaktır.",
    "Sipariş geçmişi korunacaktır.",
    "Bu işlem daha sonra geri alınabilir.",
  ]) assert.match(`${list}\n${detail}`, new RegExp(warning.replace(/[.]/g, "[.]")));
  assert.match(detail, /Ürün arşivlenmiş/);
  assert.match(detail, /catalogApi[.]restoreProduct/);
  assert.match(detail, /product[.]status === "archived"/);
  assert.match(detail, /ProductMediaManager productId={productId} canManage=/);
});

test("mounted lifecycle UI hides mutations by capability and restores an archived row", async () => {
  const draft = productFixture("11111111-1111-4111-8111-111111111111", "draft", 1, "Salt okunur ürün");
  const analyst = await createMountedProductConsole({
    async listProducts() { return { items: [draft] }; },
    async getDashboardSummary() { return catalogSummary; },
    async getProduct() { return { product: draft, variants: [] }; },
  }, { canManage: false, canArchive: false });
  const analystTree = await analyst.render();
  const analystText = analystTree.map(mountedText).join(" ");
  assert.doesNotMatch(analystText, /Ürün Ekle|İçe Aktar|Arşivle/);
  assert.equal(mountedNodes(analystTree).some((node) => node.props.role === "switch"), false);

  const editor = await createMountedProductConsole({
    async listProducts() { return { items: [draft] }; },
    async getDashboardSummary() { return catalogSummary; },
    async getProduct() { return { product: draft, variants: [] }; },
  }, { canManage: true, canArchive: false, canImport: false });
  const editorText = (await editor.render()).map(mountedText).join(" ");
  assert.match(editorText, /Ürün Ekle/);
  assert.doesNotMatch(editorText, /İçe Aktar|Arşivle/);

  const archived = productFixture("22222222-2222-4222-8222-222222222222", "archived", 4, "Arşiv ürünü");
  const restores: Array<[string, number]> = [];
  const owner = await createMountedProductConsole({
    async listProducts() { return { items: [archived] }; },
    async getDashboardSummary() { return catalogSummary; },
    async getProduct() { return { product: archived, variants: [] }; },
    async restoreProduct(id: string, version: number) {
      restores.push([id, version]);
      return { product: { ...archived, status: "draft", version: 5 }, replayed: false };
    },
  }, { canManage: true, canArchive: true });
  let ownerTree = await owner.render();
  const restore = mountedNodes(ownerTree).find((node) => node.type === "button" && mountedText(node) === "Geri Yükle");
  assert.ok(restore);
  assert.equal(mountedNodes(ownerTree).some((node) => node.props.role === "switch"), false);
  (restore.props.onClick as () => void)();
  ownerTree = await owner.render();
  assert.deepEqual(restores, [[archived.id, 4]]);
});

test("product detail composes durable merchandising without overwriting conflicts", async () => {
  const detail = await source("components/catalog/ProductDetailConsole.tsx");
  const editor = await source("components/catalog-onboarding/ProductAdvancedEditor.tsx");
  assert.match(detail, /catalogOnboardingClient[.]getProductEditor/);
  assert.match(detail, /catalogOnboardingClient[.]getOptions/);
  assert.match(detail, /ProductAdvancedEditor/);
  assert.match(editor, /updateMerchandising/);
  assert.match(editor, /expectedProfileVersion/);
  assert.match(editor, /version_conflict/);
  assert.match(editor, /Sunucudaki sürümü yükle/);
  assert.doesNotMatch(editor, /version_conflict[^]*location[.]reload|version_conflict[^]*onConflictReload\(\)/);
});

test("merchant shell adopts the Hemenaku visual language without its dedicated authorities", async () => {
  const shell = await source("components/panel/PanelShell.tsx");
  const navigation = await source("components/panel/PanelNavigation.tsx");
  const styles = await source("components/panel/panel-shell.module.css");
  const globals = await source("app/globals.css");
  assert.match(shell, /PanelLayoutClient/);
  assert.match(navigation, /getPanelNavigation/);
  assert.match(navigation, /isPanelNavigationPathActive/);
  assert.match(styles, /#2A2A2A/i);
  assert.match(styles, /#F9F9F9/i);
  assert.match(styles, /#FF6A00/i);
  assert.match(styles, /min-width:\s*1025px/);
  assert.match(globals, /--hemenaku-orange:\s*#FF6A00/i);
  assert.match(globals, /--hemenaku-canvas:\s*#F9F9F9/i);
  assert.doesNotMatch(`${shell}\n${navigation}`, /apps\/admin|\/admin\/|supabase|STORE_RUNTIME|ToshiAssistant/);
});

test("catalog pages adapt Hemenaku list, form and detail surfaces without unsupported modules", async () => {
  const list = await source("components/catalog/ProductListConsole.tsx");
  const create = await source("components/catalog/ProductCreateForm.tsx");
  const onboarding = await source("components/catalog-onboarding/ProductQuickCreateDialog.tsx");
  const onboardingStyles = await source("components/catalog-onboarding/product-onboarding.module.css");
  const detail = await source("components/catalog/ProductDetailConsole.tsx");
  const styles = await source("app/globals.css");
  assert.match(list, /donor-product-page/);
  assert.match(list, /hemenaku-product-commandbar/);
  assert.match(list, /hemenaku-product-filters/);
  assert.match(list, /data-presentation="hemenaku-product-list"/);
  assert.match(list, /aria-label="Ürün durumu filtresi"/);
  assert.match(list, /PanelTopbarBridge title="Ürünler"/);
  assert.match(create, /ProductQuickCreateDialog/);
  assert.match(onboarding, /Ürün adı/);
  assert.match(onboarding, /Satış fiyatı/);
  assert.match(detail, /hemenaku-detail-hero/);
  assert.match(detail, /Ürün Bilgileri/);
  assert.match(styles, /\.hemenaku-product-hero[^}]*border-radius:\s*30px/s);
  assert.match(onboardingStyles, /\.dialog[^}]*border-radius:\s*30px/s);
  assert.doesNotMatch(`${list}\n${create}\n${onboarding}\n${detail}`, /\/api\/admin|\/admin\/urunler|supabase/i);
});

test("product list follows the approved dense donor toolbar and table contract", async () => {
  const list = await source("components/catalog/ProductListConsole.tsx");
  const styles = await source("app/globals.css");

  for (const label of [
    "Sırala",
    "İçe Aktar",
    "Dışa Aktar",
    "Ürün Ekle",
    "Tabloda arama yapın",
    "Filtre",
    "Tümünü seç",
    "Toplu İşlemler",
    "Uygula",
    "Satır sayısı",
    "SKU",
    "Fiyat",
    "Stok",
    "Durum",
    "İşlemler",
  ]) assert.match(list, new RegExp(label));

  assert.match(list, /PanelTopbarBridge/);
  assert.match(list, /catalogApi[.]getDashboardSummary/);
  assert.match(list, /result[.]variantSummaries/);
  assert.doesNotMatch(list, /catalogApi[.]getProduct/);
  assert.match(list, /catalogApi[.]updateProduct/);
  assert.match(list, /URL[.]createObjectURL/);
  assert.match(list, /aria-label="Ürün tablosunda ara"/);
  assert.match(list, /<input value={search} disabled={busy}/);
  assert.match(list, /catalogProductListQueryDigest/);
  assert.match(list, /Kategori, marka ve koleksiyon seçenekleri yüklenemedi/);
  assert.match(list, /aria-label="Görüntülenen tüm ürünleri seç"/);
  assert.match(styles, /[.]hemenaku-product-commandbar\s*\{/);
  assert.match(styles, /[.]hemenaku-product-filters\s*\{/);
  assert.match(styles, /[.]command-select select\s*\{[^}]*min-height:\s*48px/s);
  assert.match(styles, /[.]product-search input\s*\{[^}]*min-height:\s*48px/s);
  assert.match(styles, /[.]catalog-table th\s*\{[^}]*background:\s*#EEF2F6/s);
  assert.doesNotMatch(list, /Ürün kataloğu|KATALOG GÖRÜNÜMÜ|Ürünlerinizi yönetin/);
  assert.doesNotMatch(list, /\/api\/admin|\/admin\/urunler|document[.]cookie|localStorage|sessionStorage|supabase/i);
});

test("product list keeps every command available through the mobile fallback at the exact shell breakpoint", async () => {
  const production = await productionProductListModule() as {
    resolveProductActionPlacement: (viewportWidth: number) => "inline" | "topbar";
  };
  const list = await source("components/catalog/ProductListConsole.tsx");
  const styles = await source("app/globals.css");

  assert.equal(production.resolveProductActionPlacement(320), "inline");
  assert.equal(production.resolveProductActionPlacement(1024), "inline");
  assert.equal(production.resolveProductActionPlacement(1025), "topbar");
  assert.match(list, /className="product-mobile-commandbar"/);
  assert.match(styles, /@media \(max-width: 1024px\)[^]*[.]product-mobile-commandbar\s*\{[^}]*display:\s*flex/s);
  assert.match(styles, /[.]product-mobile-commandbar[^}]*[.]command-button[^}]*min-(?:width|height):\s*48px/s);
});

test("product operation coordinator suppresses stale reads and mutually excludes canonical mutations", async () => {
  const production = await productionProductListModule() as {
    createProductOperationCoordinator: () => {
      beginRead: () => number | null;
      beginMutation: () => number | null;
      beginCanonicalRead: (mutation: number) => number | null;
      endMutation: (mutation: number) => void;
      isCurrentRead: (read: number) => boolean;
    };
  };
  const coordinator = production.createProductOperationCoordinator();
  const oldRead = coordinator.beginRead();
  const currentRead = coordinator.beginRead();
  assert.equal(typeof oldRead, "number");
  assert.equal(typeof currentRead, "number");
  assert.equal(coordinator.isCurrentRead(oldRead!), false);
  assert.equal(coordinator.isCurrentRead(currentRead!), true);

  const mutation = coordinator.beginMutation();
  assert.equal(typeof mutation, "number");
  assert.equal(coordinator.isCurrentRead(currentRead!), false);
  assert.equal(coordinator.beginRead(), null);
  assert.equal(coordinator.beginMutation(), null);
  const canonicalRead = coordinator.beginCanonicalRead(mutation!);
  assert.equal(typeof canonicalRead, "number");
  assert.equal(coordinator.isCurrentRead(canonicalRead!), true);
  coordinator.endMutation(mutation!);
  assert.equal(typeof coordinator.beginRead(), "number");
});

test("bulk executor sends one atomic request with exact persisted versions and never reports partial completion", async () => {
  const production = await productionProductListModule() as {
    executeBulkProductAction: (
      targets: readonly { product: { id: string; version: number; status: string } }[],
      action: "active" | "draft" | "archive",
      api: { bulkMutateProducts: (intent: unknown) => Promise<unknown> },
    ) => Promise<{ completed: number; failed: number }>;
  };
  const targets = [
    { product: { id: "one", version: 7, status: "draft" } },
    { product: { id: "two", version: 11, status: "draft" } },
  ];
  const requests: unknown[] = [];
  const updateResult = await production.executeBulkProductAction(targets, "active", {
    bulkMutateProducts: async (intent) => { requests.push(intent); },
  });
  assert.deepEqual(requests, [{
    action: "active",
    targets: [
      { productId: "one", expectedVersion: 7 },
      { productId: "two", expectedVersion: 11 },
    ],
  }]);
  assert.deepEqual(updateResult, { completed: 2, failed: 0 });

  const failedResult = await production.executeBulkProductAction(targets, "archive", {
    bulkMutateProducts: async () => { throw new Error("atomic rejection"); },
  });
  assert.deepEqual(failedResult, { completed: 0, failed: 2 });
});

test("bulk archive is count-aware and requires confirmation before the destructive executor", async () => {
  const production = await productionProductListModule() as {
    bulkArchiveConfirmationMessage: (count: number) => string;
    requiresBulkConfirmation: (action: string) => boolean;
  };
  const list = await source("components/catalog/ProductListConsole.tsx");
  assert.equal(production.requiresBulkConfirmation("archive"), true);
  assert.equal(production.requiresBulkConfirmation("active"), false);
  assert.equal(production.bulkArchiveConfirmationMessage(3), "3 ürün arşivlenecek.");
  assert.match(list, /setBulkArchiveConfirmation\(true\)/);
  assert.match(list, /bulkArchiveConfirmationMessage\(selected\.length\)/);
});

test("CSV export neutralizes spreadsheet formulas and control-leading cells before quoting", async () => {
  const production = await productionProductListModule() as { csvCell: (value: string | number) => string };
  for (const dangerous of ["=2+3", "+cmd", "-10+20", "@SUM(A1:A2)", "\t=2+3", "\u0001payload", "  =2+3"]) {
    const escaped = production.csvCell(dangerous);
    assert.ok(escaped.startsWith('"\''), dangerous);
    assert.ok(escaped.endsWith('"'), dangerous);
  }
  assert.equal(production.csvCell('normal "ürün"'), '"normal ""ürün"""');
});

test("product summary exposes four honest fixed metrics", async () => {
  const production = await productionProductListModule() as {
    productSummaryMetrics?: (
      summaryState: "loading" | "ready" | "unavailable",
      summary?: typeof catalogSummary,
    ) => readonly Readonly<{ key: string; label: string; value: string; accessibleValue: string }>[];
  };
  const summaryMetrics = production.productSummaryMetrics;
  assert.equal(typeof summaryMetrics, "function");
  if (summaryMetrics === undefined) throw new Error("product_summary_metrics_missing");
  assert.deepEqual(
    summaryMetrics("ready", catalogSummary),
    [
      { key: "total", label: "Toplam", value: "2", accessibleValue: "Toplam 2" },
      { key: "active", label: "Aktif", value: "1", accessibleValue: "Aktif 1" },
      { key: "draft", label: "Taslak", value: "1", accessibleValue: "Taslak 1" },
      { key: "out-of-stock", label: "Stoksuz", value: "0", accessibleValue: "Stoksuz 0" },
    ],
  );
  assert.ok(summaryMetrics("loading").every(({ value }) => value === "—"));
  assert.ok(summaryMetrics("unavailable").every(({ accessibleValue }) => /kullanılamıyor/.test(accessibleValue)));
});

test("dense product controls expose a 48px hit area without enlarging their visual glyphs", async () => {
  const styles = await source("app/globals.css");
  assert.match(styles, /[.]product-filter-panel button\s*\{[^}]*min-height:\s*48px/s);
  assert.match(styles, /[.]catalog-checkbox-hit\s*\{[^}]*min-width:\s*48px[^}]*min-height:\s*48px/s);
  assert.match(styles, /[.]publish-switch\s*\{[^}]*min-width:\s*48px[^}]*min-height:\s*48px/s);
  assert.match(styles, /[.]icon-button\s*\{[^}]*width:\s*48px[^}]*height:\s*48px/s);
});

test("mounted product console renders all four commands in the <=1024 mobile fallback", async () => {
  const product = productFixture("11111111-1111-4111-8111-111111111111", "draft", 1);
  const mounted = await createMountedProductConsole({
    async listProducts() { return { items: [product] }; },
    async getDashboardSummary() { return catalogSummary; },
    async getProduct() { return { product, variants: [] }; },
    async updateProduct() { throw new Error("not used"); },
    async archiveProduct() { throw new Error("not used"); },
  });
  const tree = await mounted.render();
  const mobile = mountedNodes(tree).find((node) => node.props.className === "product-mobile-commandbar");
  assert.ok(mobile);
  for (const label of ["Sırala", "İçe Aktar", "Dışa Aktar", "Ürün Ekle"]) {
    assert.match(mountedText(mobile), new RegExp(label));
  }
  const styles = await source("app/globals.css");
  assert.match(styles, /@media \(max-width: 1024px\)[^]*[.]product-mobile-commandbar\s*\{[^}]*display:\s*flex/s);
  assert.match(styles, /@media \(max-width: 640px\)[^]*[.]product-mobile-commandbar [.]hemenaku-product-commandbar\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(styles, /@media \(max-width: 640px\)[^]*[.]product-mobile-commandbar [.]command-button[^}]*width:\s*100%[^}]*min-width:\s*0/s);
});

test("mounted product rows show the featured image and preserve the package fallback", async () => {
  const withImage = productFixture("11111111-1111-4111-8111-111111111111", "active", 1, "Görselli ürün");
  const withoutImage = productFixture("22222222-2222-4222-8222-222222222222", "draft", 2, "Görselsiz ürün");
  const featuredImage = Object.freeze({
    publicUrl: "https://media.celebix.site/stores/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/products/11111111-1111-4111-8111-111111111111/33333333-3333-4333-8333-333333333333.webp",
    altText: "Görselli ürün öne çıkan görseli",
  });
  const mounted = await createMountedProductConsole({
    async listProducts() {
      return {
        items: [withImage, withoutImage],
        featuredImages: { [withImage.id]: featuredImage },
      };
    },
    async getDashboardSummary() { return catalogSummary; },
    async getProduct(id: string) { return { product: id === withImage.id ? withImage : withoutImage, variants: [] }; },
    async updateProduct() { throw new Error("not used"); },
    async archiveProduct() { throw new Error("not used"); },
  });

  const nodes = mountedNodes(await mounted.render());
  const image = nodes.find((node) => node.type === "img" && node.props.src === featuredImage.publicUrl);
  assert.ok(image);
  assert.equal(image.props.alt, featuredImage.altText);
  assert.equal(image.props.loading, "lazy");
  assert.equal(image.props.decoding, "async");
  assert.equal(nodes.filter((node) => node.props.className === "product-placeholder").length, 1);

  const styles = await source("app/globals.css");
  assert.match(styles, /[.]product-thumbnail\s*\{[^}]*overflow:\s*hidden/s);
  assert.match(styles, /[.]product-thumbnail img\s*\{[^}]*object-fit:\s*cover/s);
}
);

test("mounted product rows keep technical slugs out of merchant presentation", async () => {
  const product = productFixture(
    "11111111-1111-4111-8111-111111111111",
    "active",
    1,
    "Gizli teknik slug",
  );
  const mounted = await createMountedProductConsole({
    async listProducts() { return { items: [product] }; },
    async getDashboardSummary() { return catalogSummary; },
    async getProduct() { return { product, variants: [] }; },
    async updateProduct() { throw new Error("not used"); },
    async archiveProduct() { throw new Error("not used"); },
  });

  const renderedText = (await mounted.render()).map(mountedText).join(" ");
  assert.match(renderedText, /Gizli teknik slug/);
  assert.doesNotMatch(renderedText, /gizli-teknik-slug/);
});

test("product list request budget stays at zero detail calls for 1, 20, and 100 rows", async () => {
  for (const size of [1, 20, 100]) {
    const products = Array.from({ length: size }, (_, index) => productFixture(
      `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      "active",
      1,
      `Bütçe ürünü ${index + 1}`,
    ));
    const variantSummaries = Object.fromEntries(products.map((product, index) => [product.id, {
      variantId: `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      sku: `BUDGET-${index + 1}`,
      priceCents: 10_000 + index,
      stockTracking: true,
      stockQuantity: index,
    }]));
    let listCalls = 0;
    let summaryCalls = 0;
    let detailCalls = 0;
    const mounted = await createMountedProductConsole({
      async listProducts() { listCalls += 1; return { items: products, variantSummaries }; },
      async getDashboardSummary() { summaryCalls += 1; return catalogSummary; },
      async getProduct() { detailCalls += 1; throw new Error("detail fan-out forbidden"); },
    }, { canManage: false, canArchive: false, canImport: false });

    const tree = await mounted.render();

    assert.equal(listCalls, 1, `size=${size}`);
    assert.equal(summaryCalls, 1, `size=${size}`);
    assert.equal(detailCalls, 0, `size=${size}`);
    assert.match(tree.map(mountedText).join(" "), /BUDGET-1/);
  }
});

test("product rows render the list summary and use dashes without a detail fallback", async () => {
  const withSummary = productFixture(
    "10000000-0000-4000-8000-000000000201",
    "active",
    1,
    "Özetli ürün",
  );
  const withoutSummary = productFixture(
    "10000000-0000-4000-8000-000000000202",
    "draft",
    1,
    "Varyantsız ürün",
  );
  let detailCalls = 0;
  const mounted = await createMountedProductConsole({
    async listProducts() {
      return {
        items: [withSummary, withoutSummary],
        variantSummaries: {
          [withSummary.id]: {
            variantId: "20000000-0000-4000-8000-000000000201",
            sku: "LIST-SUMMARY-201",
            priceCents: 12_000,
            compareAtCents: 15_000,
            stockTracking: true,
            stockQuantity: 7,
          },
        },
      };
    },
    async getDashboardSummary() { return catalogSummary; },
    async getProduct() { detailCalls += 1; throw new Error("detail fallback forbidden"); },
  }, { canManage: false, canArchive: false, canImport: false });

  const nodes = mountedNodes(await mounted.render());
  const summaryRow = nodes.find((node) => node.type === "tr" && mountedText(node).includes(withSummary.title));
  const variantlessRow = nodes.find((node) => node.type === "tr" && mountedText(node).includes(withoutSummary.title));

  assert.ok(summaryRow);
  assert.match(mountedText(summaryRow), /LIST-SUMMARY-201/);
  assert.match(mountedText(summaryRow), /7 adet/);
  assert.ok(variantlessRow);
  assert.match(mountedText(variantlessRow), /—/);
  assert.equal(detailCalls, 0);
});

test("next page replaces the current page with one list call and no detail or summary fan-out", async () => {
  const pages = [0, 1].map((page) => Array.from({ length: 20 }, (_, index) => productFixture(
    `30000000-0000-4000-8000-${String(page * 20 + index + 1).padStart(12, "0")}`,
    "draft",
    1,
    `Sayfa ${page + 1} ürün ${index + 1}`,
  )));
  const summaries = (products: readonly ReturnType<typeof productFixture>[]) => Object.fromEntries(products.map((product, index) => [product.id, {
    variantId: `40000000-0000-4000-8000-${product.id.slice(-12)}`,
    sku: `PAGE-${product.id.slice(-4)}`,
    priceCents: 20_000 + index,
    stockTracking: false,
    stockQuantity: 0,
  }]));
  let listCalls = 0;
  let summaryCalls = 0;
  let detailCalls = 0;
  const mounted = await createMountedProductConsole({
    async listProducts() {
      const page = listCalls++;
      return {
        items: pages[page]!,
        variantSummaries: summaries(pages[page]!),
        ...(page === 0 ? { nextCursor: "cursor_2" } : {}),
      };
    },
    async getDashboardSummary() { summaryCalls += 1; return catalogSummary; },
    async getProduct() { detailCalls += 1; throw new Error("detail fan-out forbidden"); },
  }, { canManage: false, canArchive: false, canImport: false });

  let tree = await mounted.render();
  const next = mountedNodes(tree).find((node) => node.type === "button" && mountedText(node) === "Sonraki");
  assert.ok(next);
  (next.props.onClick as () => void)();
  tree = await mounted.render();

  assert.equal(listCalls, 2);
  assert.equal(summaryCalls, 1);
  assert.equal(detailCalls, 0);
  assert.match(tree.map(mountedText).join(" "), /Sayfa 2 ürün 20/);
  assert.doesNotMatch(tree.map(mountedText).join(" "), /Sayfa 1 ürün 20/);
});

test("product detail hides the technical slug while preserving it in versioned edits", async () => {
  const detail = await source("components/catalog/ProductDetailConsole.tsx");

  assert.match(detail, /slug:\s*detail[.]product[.]slug/);
  assert.doesNotMatch(detail, /name="slug"|URL anahtarı|<p>\/{product[.]slug}/);
});

test("mounted store-wide metrics stay semantic and never duplicate loaded-row counts", async () => {
  const product = productFixture("11111111-1111-4111-8111-111111111111", "draft", 1);
  const summaryResult = deferred<typeof catalogSummary>();
  const mounted = await createMountedProductConsole({
    async listProducts() { return { items: [product] }; },
    getDashboardSummary() { return summaryResult.promise; },
    async getProduct() { return { product, variants: [] }; },
    async updateProduct() { throw new Error("not used"); },
    async archiveProduct() { throw new Error("not used"); },
  });
  let tree = await mounted.render();
  let text = tree.map(mountedText).join(" ");
  let nodes = mountedNodes(tree);
  assert.equal(nodes.filter((node) => node.type === "dt").length, 4);
  assert.equal(nodes.filter((node) => node.type === "dd").length, 4);
  assert.match(text, /Toplam—Aktif—Taslak—Stoksuz—/);
  assert.doesNotMatch(text, /görüntüleniyor|Mağaza toplamı yükleniyor/);
  assert.match(text, /0 - 0 \/ — sonuç/);
  summaryResult.reject(new Error("summary unavailable"));
  tree = await mounted.render();
  text = tree.map(mountedText).join(" ");
  nodes = mountedNodes(tree);
  assert.equal(nodes.filter((node) => node.type === "dt").length, 4);
  assert.ok(nodes.filter((node) => node.type === "dd").every((node) => mountedText(node) === "—"));
  assert.match(text, /Ürün 11111111/);
  assert.match(text, /1 - 1 \/ — sonuç/);
  assert.doesNotMatch(text, /görüntüleniyor|yüklendi|1 mağazada taslak|0 mağazada aktif/);
});

test("product create heading and dense controls use the compact balanced contract", async () => {
  const create = await source("components/catalog/ProductCreateForm.tsx");
  const list = await source("components/catalog/ProductListConsole.tsx");
  const styles = await source("app/globals.css");

  assert.match(create, /product-create-heading/);
  assert.doesNotMatch(create, /hemenaku-form-hero|YENİ KAYIT/);
  assert.match(list, /product-stat-grid/);
  assert.match(list, /product-bulk-actions/);
  assert.match(list, /product-list-status/);
  assert.match(styles, /[.]product-stat-grid\s*\{[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(styles, /@media \(max-width:\s*640px\)[^]*[.]product-stat-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(styles, /[.]product-bulk-actions[^}]*min-height:\s*48px/s);
});

test("mounted bulk archive opens count-aware confirmation before the first versioned mutation", async () => {
  const product = productFixture("11111111-1111-4111-8111-111111111111", "draft", 7);
  const requests: unknown[] = [];
  const mounted = await createMountedProductConsole({
    async listProducts() { return { items: [product] }; },
    async getDashboardSummary() { return catalogSummary; },
    async getProduct() { return { product, variants: [] }; },
    async bulkMutateProducts(intent: unknown) { requests.push(intent); return { products: [product] }; },
  });
  let tree = await mounted.render();
  let nodes = mountedNodes(tree);
  const rowCheckbox = nodes.find((node) => node.type === "input" && String(node.props["aria-label"]).includes("ürününü seç"));
  assert.ok(rowCheckbox);
  (rowCheckbox.props.onChange as (event: unknown) => void)({ target: { checked: true } });
  tree = await mounted.render();
  nodes = mountedNodes(tree);
  const action = nodes.find((node) => node.type === "select" && node.props["aria-label"] === "Toplu İşlemler");
  assert.ok(action);
  (action.props.onChange as (event: unknown) => void)({ target: { value: "archive" } });
  tree = await mounted.render();
  nodes = mountedNodes(tree);
  const apply = nodes.find((node) => node.type === "button" && mountedText(node) === "Uygula");
  assert.ok(apply);
  (apply.props.onClick as () => void)();
  tree = await mounted.render();
  assert.equal(requests.length, 0, "opening confirmation must not mutate");
  assert.match(tree.map(mountedText).join(" "), /1 ürün arşivlenecek/);
  nodes = mountedNodes(tree);
  const confirm = nodes.find((node) => node.type === "button" && mountedText(node) === "1 ürünü arşivle");
  assert.ok(confirm);
  (confirm.props.onClick as () => void)();
  await mounted.render();
  assert.deepEqual(requests, [{ action: "archive", targets: [{ productId: product.id, expectedVersion: 7 }] }]);
});

test("mounted list suppresses an old filter response and canonical reload uses the latest filter", async () => {
  const initial = productFixture("11111111-1111-4111-8111-111111111111", "draft", 1, "Başlangıç");
  const oldActive = productFixture("22222222-2222-4222-8222-222222222222", "active", 2, "Aktif Eski");
  const currentDraft = productFixture("33333333-3333-4333-8333-333333333333", "draft", 3, "Taslak Güncel");
  const activeResult = deferred<{ items: readonly unknown[] }>();
  const draftResult = deferred<{ items: readonly unknown[] }>();
  const listInputs: Array<Record<string, unknown>> = [];
  let draftCalls = 0;
  const mounted = await createMountedProductConsole({
    listProducts(input: Record<string, unknown>) {
      listInputs.push({ ...input });
      if (input.status === "active") return activeResult.promise;
      if (input.status === "draft" && draftCalls++ === 0) return draftResult.promise;
      if (input.status === "draft") return Promise.resolve({ items: [currentDraft] });
      return Promise.resolve({ items: [initial] });
    },
    async getDashboardSummary() { return catalogSummary; },
    async getProduct(id: string) {
      const product = [initial, oldActive, currentDraft].find((candidate) => candidate.id === id)!;
      return { product, variants: [] };
    },
    async updateProduct(_id: string, input: { product: { status: "draft" | "active" } }) {
      return { product: { ...currentDraft, status: input.product.status, version: 4 } };
    },
    async bulkMutateProducts() { return { products: [currentDraft] }; },
  });
  let tree = await mounted.render();
  let nodes = mountedNodes(tree);
  const filter = nodes.find((node) => node.type === "button" && mountedText(node) === "Filtre");
  assert.ok(filter);
  (filter.props.onClick as () => void)();
  tree = await mounted.render();
  nodes = mountedNodes(tree);
  const activeButton = nodes.find((node) => node.type === "button" && mountedText(node) === "Aktif");
  const draftButton = nodes.find((node) => node.type === "button" && mountedText(node) === "Taslak");
  assert.ok(activeButton && draftButton);
  (activeButton.props.onClick as () => void)();
  await mounted.render();
  (draftButton.props.onClick as () => void)();
  await mounted.render();
  draftResult.resolve({ items: [currentDraft] });
  tree = await mounted.render();
  assert.match(tree.map(mountedText).join(" "), /Taslak Güncel/);
  activeResult.resolve({ items: [oldActive] });
  tree = await mounted.render();
  assert.doesNotMatch(tree.map(mountedText).join(" "), /Aktif Eski/);

  nodes = mountedNodes(tree);
  const checkbox = nodes.find((node) => node.type === "input" && String(node.props["aria-label"]).includes("ürününü seç"));
  assert.ok(checkbox);
  (checkbox.props.onChange as (event: unknown) => void)({ target: { checked: true } });
  tree = await mounted.render();
  nodes = mountedNodes(tree);
  const action = nodes.find((node) => node.type === "select" && node.props["aria-label"] === "Toplu İşlemler")!;
  (action.props.onChange as (event: unknown) => void)({ target: { value: "active" } });
  tree = await mounted.render();
  const apply = mountedNodes(tree).find((node) => node.type === "button" && mountedText(node) === "Uygula")!;
  (apply.props.onClick as () => void)();
  await mounted.render();
  assert.deepEqual(listInputs.at(-1), { status: "draft", sort: "updated-desc", pageSize: 20 });
});

test("debounced global search clears selection immediately and stale search responses cannot overwrite the latest query", async () => {
  const initial = productFixture("11111111-1111-4111-8111-111111111111", "active", 1, "Başlangıç");
  const stale = productFixture("22222222-2222-4222-8222-222222222222", "active", 2, "Eski Arama");
  const current = productFixture("33333333-3333-4333-8333-333333333333", "active", 3, "Yeni Arama");
  const oldResult = deferred<{ items: readonly unknown[]; catalogTotal: number }>();
  const newResult = deferred<{ items: readonly unknown[]; catalogTotal: number }>();
  const listInputs: Array<Record<string, unknown>> = [];
  const mounted = await createMountedProductConsole({
    listProducts(input: Record<string, unknown>) {
      listInputs.push({ ...input });
      if (input.search === "old") return oldResult.promise;
      if (input.search === "new") return newResult.promise;
      return Promise.resolve({ items: [initial], catalogTotal: 3 });
    },
    async getDashboardSummary() { return { ...catalogSummary, totalProducts: 3, activeProducts: 2, draftProducts: 1 }; },
    async updateProduct() { throw new Error("not used"); },
    async archiveProduct() { throw new Error("not used"); },
  });
  let tree = await mounted.render();
  let nodes = mountedNodes(tree);
  const checkbox = nodes.find((node) => node.type === "input" && String(node.props["aria-label"]).includes("ürününü seç"))!;
  (checkbox.props.onChange as (event: unknown) => void)({ target: { checked: true } });
  tree = await mounted.render();
  assert.match(tree.map(mountedText).join(" "), /1 ürün seçildi/);

  let search = mountedNodes(tree).find((node) => node.type === "input" && node.props["aria-label"] === "Ürün tablosunda ara")!;
  (search.props.onChange as (event: unknown) => void)({ target: { value: "old" } });
  tree = await mounted.render();
  assert.match(tree.map(mountedText).join(" "), /0 ürün seçildi/);
  await new Promise((resolve) => setTimeout(resolve, 320));
  await mounted.render();

  search = mountedNodes(await mounted.render()).find((node) => node.type === "input" && node.props["aria-label"] === "Ürün tablosunda ara")!;
  (search.props.onChange as (event: unknown) => void)({ target: { value: "new" } });
  await mounted.render();
  await new Promise((resolve) => setTimeout(resolve, 320));
  await mounted.render();
  newResult.resolve({ items: [current], catalogTotal: 3 });
  tree = await mounted.render();
  assert.match(tree.map(mountedText).join(" "), /Yeni Arama/);
  oldResult.resolve({ items: [stale], catalogTotal: 3 });
  tree = await mounted.render();
  assert.doesNotMatch(tree.map(mountedText).join(" "), /Eski Arama/);
  assert.deepEqual(listInputs.filter((input) => input.search !== undefined).map((input) => input.search), ["old", "new"]);
});

test("a failed new global query never exposes old rows as interactive results for the new URL state", async () => {
  const initial = productFixture("11111111-1111-4111-8111-111111111111", "active", 1, "Eski Sorgu Satırı");
  const mounted = await createMountedProductConsole({
    async listProducts(input: Record<string, unknown>) {
      if (input.search === "missing") throw new Error("global query unavailable");
      return { items: [initial], catalogTotal: 1 };
    },
    async getDashboardSummary() { return catalogSummary; },
  }, { canManage: true });
  let tree = await mounted.render();
  assert.match(tree.map(mountedText).join(" "), /Eski Sorgu Satırı/);

  const search = mountedNodes(tree).find((node) => node.type === "input" && node.props["aria-label"] === "Ürün tablosunda ara")!;
  (search.props.onChange as (event: unknown) => void)({ target: { value: "missing" } });
  await mounted.render();
  await new Promise((resolve) => setTimeout(resolve, 320));
  tree = await mounted.render();

  const text = tree.map(mountedText).join(" ");
  assert.match(text, /Ürünler yüklenemedi/);
  assert.match(text, /Bu sorgunun ürünleri yüklenemedi/);
  assert.doesNotMatch(text, /Eski Sorgu Satırı/);
  assert.equal(mountedNodes(tree).some((node) => String(node.props["aria-label"]).includes("Eski Sorgu Satırı")), false);
});

test("mount and quick-create share one options request without poisoning ready filter options", async () => {
  const product = productFixture("11111111-1111-4111-8111-111111111111", "active", 1);
  const options = deferred<{ categories: readonly unknown[]; resources: readonly unknown[]; locations: readonly unknown[]; channels: readonly unknown[] }>();
  let optionCalls = 0;
  const mounted = await createMountedProductConsole({
    async listProducts() { return { items: [product], catalogTotal: 1 }; },
    async getDashboardSummary() { return catalogSummary; },
  }, { canManage: true }, {
    getOptions() { optionCalls += 1; return options.promise; },
  });
  let tree = await mounted.render();
  const add = mountedNodes(tree).find((node) => node.type === "button" && mountedText(node) === "Ürün Ekle")!;
  (add.props.onClick as () => void)();
  await mounted.render();
  assert.equal(optionCalls, 1);

  options.resolve({ categories: [], resources: [], locations: [], channels: [] });
  tree = await mounted.render();
  const filter = mountedNodes(tree).find((node) => node.type === "button" && mountedText(node) === "Filtre")!;
  (filter.props.onClick as () => void)();
  tree = await mounted.render();
  const category = mountedNodes(tree).find((node) => node.type === "select" && node.props["aria-label"] === "Kategori filtresi")!;
  assert.equal(category.props.disabled, false);
  assert.doesNotMatch(tree.map(mountedText).join(" "), /Seçenekler yüklenemedi/);
});

test("mounted empty catalog and global no-result states remain distinct", async () => {
  const empty = await createMountedProductConsole({
    async listProducts() { return { items: [], catalogTotal: 0 }; },
    async getDashboardSummary() { return { ...catalogSummary, totalProducts: 0, activeProducts: 0, draftProducts: 0, activeVariants: 0, productsWithoutMedia: 0 }; },
  }, { canManage: true });
  const emptyText = (await empty.render()).map(mountedText).join(" ");
  assert.match(emptyText, /Henüz ürün yok/);
  assert.doesNotMatch(emptyText, /Aramanızla eşleşen/);

  const noResult = await createMountedProductConsole({
    async listProducts() { return { items: [], catalogTotal: 2 }; },
    async getDashboardSummary() { return catalogSummary; },
  });
  const noResultText = (await noResult.render()).map(mountedText).join(" ");
  assert.match(noResultText, /Aramanızla eşleşen ürün bulunamadı/);
  assert.doesNotMatch(noResultText, /İlk ürünü oluştur/);
});

test("mounted canonical reload failure preserves atomic counts and never claims reconciliation", async () => {
  const first = productFixture("11111111-1111-4111-8111-111111111111", "draft", 5, "Başarısız ürün");
  const second = productFixture("22222222-2222-4222-8222-222222222222", "draft", 8, "Tamamlanan ürün");
  let reads = 0;
  const mounted = await createMountedProductConsole({
    async listProducts() {
      reads += 1;
      if (reads === 2) throw new Error("canonical unavailable");
      if (reads > 2) return { items: [productFixture("33333333-3333-4333-8333-333333333333", "draft", 1, "Eski cursor sayfası")] };
      return { items: [first, second], nextCursor: "cursor_2" };
    },
    async getDashboardSummary() { return catalogSummary; },
    async getProduct(id: string) { return { product: id === first.id ? first : second, variants: [] }; },
    async bulkMutateProducts() { return { products: [{ ...first, status: "active" }, { ...second, status: "active" }] }; },
  });
  let tree = await mounted.render();
  let nodes = mountedNodes(tree);
  const checkbox = nodes.find((node) => node.type === "input" && node.props["aria-label"] === "Görüntülenen tüm ürünleri seç")!;
  (checkbox.props.onChange as (event: unknown) => void)({ target: { checked: true } });
  tree = await mounted.render();
  nodes = mountedNodes(tree);
  const action = nodes.find((node) => node.type === "select" && node.props["aria-label"] === "Toplu İşlemler")!;
  (action.props.onChange as (event: unknown) => void)({ target: { value: "active" } });
  tree = await mounted.render();
  const apply = mountedNodes(tree).find((node) => node.type === "button" && mountedText(node) === "Uygula")!;
  (apply.props.onClick as () => void)();
  tree = await mounted.render();
  const text = tree.map(mountedText).join(" ");
  assert.match(text, /2 tamamlandı, 0 başarısız/);
  assert.match(text, /uzlaştırma başarısız/i);
  assert.match(text, /yeniden dene/i);
  assert.doesNotMatch(text, /kalıcı mağaza durumuyla uzlaştırıldı/i);
  assert.ok(mountedNodes(tree).some((node) => node.type === "button" && /yeniden dene/i.test(mountedText(node))));
  const next = mountedNodes(tree).find((node) => node.type === "button" && mountedText(node) === "Sonraki");
  assert.ok(next);
  assert.equal(next.props.disabled, true, "stale first page must lock cursor pagination");
  (next.props.onClick as () => void)();
  tree = await mounted.render();
  assert.equal(reads, 2, "stale cursor must not start another list request");
  assert.match(tree.map(mountedText).join(" "), /Ürün satırları doğrulanamadı/);
  assert.doesNotMatch(tree.map(mountedText).join(" "), /Eski cursor sayfası/);
});

test("detail and media surfaces retain versioned target commands", async () => {
  const detail = await source("components/catalog/ProductDetailConsole.tsx");
  const media = await source("components/catalog/ProductMediaManager.tsx");
  assert.match(detail, /data-presentation="hemenaku-product-detail"/);
  assert.match(detail, /updateProduct\(productId, parsed\.value\)/);
  assert.match(detail, /updateVariant\(productId, variant\.id, parsed\.value\)/);
  assert.match(
    detail,
    /buildVariantUpdatePayload\(\s*variantValues\(new FormData\(event\.currentTarget\)\),\s*variant\.version,\s*variant\.attributes,?\s*\)/,
  );
  assert.match(detail, /archiveVariant\(productId, archiveVariant\.id, archiveVariant\.version\)/);
  assert.match(detail, /failure\.code === "version_conflict"/);
  assert.match(media, /productMediaApi\.reorder/);
  assert.match(media, /productMediaApi\.archive/);
  assert.match(detail, /aria-modal="true"/);
  assert.match(detail, /onKeyDown=\{handleArchiveDialogKeyDown\}/);
  assert.match(media, /aria-modal="true"/);
  assert.match(media, /onKeyDown=\{handleArchiveDialogKeyDown\}/);
  assert.match(detail, /ref=\{variantsHeadingRef\}[^>]*tabIndex=\{-1\}[^>]*id="variants-title"/);
  assert.match(detail, /restoreArchiveFocus\(archiveTriggerRef\.current, variantsHeadingRef\.current\)/);
  assert.match(media, /ref=\{mediaUploadCardRef\}/);
  assert.match(media, /restoreArchiveFocus\(archiveTriggerRef\.current, mediaUploadCardRef\.current\)/);
  assert.match(media, /export function restoreArchiveFocus/);
  assert.match(media, /failure instanceof ProductMediaApiError && failure\.code === "version_conflict"\) \{\s*await load\(\);\s*setArchiveTarget\(undefined\);\s*\}/);
  assert.doesNotMatch(`${detail}\n${media}`, /storeId|tenantId|document\.cookie|\/api\/admin|supabase/i);
});

test("create and edit use one sanitized WYSIWYG description field", async () => {
  const field = await source("components/catalog/ProductDescriptionField.tsx").catch(() => "");
  const detail = await source("components/catalog/ProductDetailConsole.tsx");
  const advanced = await source("components/catalog-onboarding/ProductAdvancedEditor.tsx");

  assert.match(field, /normalizeProductDescriptionRichText/);
  assert.doesNotMatch(field, /dangerouslySetInnerHTML/);
  assert.match(field, /@tiptap\/react/);
  assert.match(field, /EditorContent/);
  assert.match(field, /normalizePastedProductDescriptionHtml/);
  assert.match(field, /name="description"/);
  assert.match(field, /MAX_DESCRIPTION_LENGTH = 10_000/);
  assert.doesNotMatch(field, /Markdown desteklenir|Markdown önizleme|<textarea/);
  assert.match(detail, /ProductDescriptionField/);
  assert.match(detail, /ProductDescriptionPreview/);
  assert.match(advanced, /ProductDescriptionField/);
  assert.doesNotMatch(detail, /<p>\{product[.]description/);
});

class FocusTarget {
  isConnected = true;
  focusCount = 0;

  focus() { this.focusCount += 1; }
}

async function productionFocusRestorer() {
  const media = await source("components/catalog/ProductMediaManager.tsx");
  const match = media.match(/export function restoreArchiveFocus[\s\S]*?\n\}/);
  assert.ok(match, "the production focus restorer must be exported from the media manager");
  const compiled = ts.transpileModule(match[0].replace("export function", "function"), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return Function(`${compiled}\nreturn restoreArchiveFocus;`)() as (trigger: HTMLElement | null, fallback: HTMLElement | null) => "trigger" | "fallback" | "none";
}

test("production archive focus restorer prefers a live trigger and safely falls back", async () => {
  const restoreArchiveFocus = await productionFocusRestorer();
  const trigger = new FocusTarget();
  const fallback = new FocusTarget();

  assert.equal(restoreArchiveFocus(trigger as unknown as HTMLElement, fallback as unknown as HTMLElement), "trigger");
  assert.equal(trigger.focusCount, 1);
  assert.equal(fallback.focusCount, 0);

  trigger.isConnected = false;
  assert.equal(restoreArchiveFocus(trigger as unknown as HTMLElement, fallback as unknown as HTMLElement), "fallback");
  assert.equal(fallback.focusCount, 1);

  fallback.isConnected = false;
  assert.equal(restoreArchiveFocus(trigger as unknown as HTMLElement, fallback as unknown as HTMLElement), "none");
});

test("quick creation remains bound to the durable onboarding and media workflow", async () => {
  const create = await source("components/catalog/ProductCreateForm.tsx");
  const dialog = await source("components/catalog-onboarding/ProductQuickCreateDialog.tsx");
  const advanced = await source("components/catalog-onboarding/ProductAdvancedEditor.tsx");
  assert.match(create, /data-presentation="hemenaku-product-create"/);
  assert.match(dialog, /buildQuickCreateIntent/);
  assert.match(dialog, /await api\.createProduct/);
  assert.match(dialog, /completeProductMedia/);
  assert.match(dialog, /mediaClient\.upload\(productId, input\)/);
  assert.match(dialog, /api\.publishAfterMedia/);
  assert.match(dialog, /api\.getProductEditor/);
  assert.match(dialog, /outcome\.kind === "draft_media_failed"[\s\S]*setRecovery[\s\S]*Ürün oluşturuldu, bazı görseller yüklenemedi[\s\S]*İkinci yazma yapılmadı/);
  assert.match(dialog, /Görselleri yeniden yükle/);
  assert.match(dialog, /Ürüne git/);
  assert.match(advanced, /function initialChannelIds/);
  assert.match(advanced, /channel\.kind === "storefront"/);
  assert.match(advanced, /draftSession\?\.current\.channelIds \?\? initialChannelIds\(options, editor\)/);
  assert.match(advanced, /outcome\.kind === "draft_media_failed"[\s\S]*onCreated\?\.\(outcome\.result\)/);
  assert.match(create, /finish\(`\/products\/\$\{result\.product\.id\}`\)/);
  assert.doesNotMatch(`${create}\n${dialog}\n${advanced}`, /nutrition|\/api\/admin|supabase/i);
});

test("create, archive, variant and conflict flows keep rendered versions and navigate safely", async () => {
  const create = await source("components/catalog/ProductCreateForm.tsx");
  const list = await source("components/catalog/ProductListConsole.tsx");
  const detail = await source("components/catalog/ProductDetailConsole.tsx");
  assert.match(create, /finish\(`\/products\/\$\{result\.product\.id\}`\)/);
  assert.match(list, /archiveProduct\(archiveCandidate\.id, archiveCandidate\.version\)/);
  assert.match(list, /filter\(\(item\) => item\.product\.id !== archiveCandidate\.id\)/);
  assert.match(detail, /updateProduct\(productId, parsed\.value\)/);
  assert.match(detail, /createVariant\(productId, parsed\.value\)/);
  assert.match(detail, /updateVariant\(productId, variant\.id, parsed\.value\)/);
  assert.match(detail, /archiveVariant\(productId, archiveVariant\.id, archiveVariant\.version\)/);
  assert.match(detail, /failure\.code === "version_conflict"/);
  assert.doesNotMatch(detail, /await load\(true\)/);
  assert.match(detail, /Yerel alanlarınız korunuyor/);
  assert.match(detail, /Sunucudaki sürümü yükle/);
});

test("product drafts survive quick-to-advanced handoff and navigation is guarded", async () => {
  const create = await source("components/catalog/ProductCreateForm.tsx");
  const list = await source("components/catalog/ProductListConsole.tsx");
  const quick = await source("components/catalog-onboarding/ProductQuickCreateDialog.tsx");
  const advanced = await source("components/catalog-onboarding/ProductAdvancedEditor.tsx");
  assert.match(create, /createEmptyProductDraftSession/);
  assert.match(create, /productDraftIsDirty/);
  assert.match(create, /bindBeforeUnload\(window\)/);
  assert.match(quick, /mergeQuickProductDraft/);
  assert.match(advanced, /updateProductDraft/);
  assert.match(advanced, /draftSession\?\.current\.media/);
  assert.match(list, /draftSession={draftSession}/);
  assert.match(list, /onAdvanced=\{\(\) => \{ setQuickCreateOpen\(false\); setAdvancedCreateOpen\(true\); \}\}/);
  assert.doesNotMatch(list, /location[.]assign\("\/products\/new\?mode=advanced"\)/);
  assert.doesNotMatch(`${create}\n${list}\n${quick}\n${advanced}`, /localStorage|sessionStorage/);
});

test("product detail and merchandising loading have independent recovery states", async () => {
  const detail = await source("components/catalog/ProductDetailConsole.tsx");
  assert.match(detail, /merchandisingState/);
  assert.match(detail, /setMerchandisingState\("error"\)/);
  assert.match(detail, /Satış ayarları yüklenemedi/);
  assert.match(detail, /onClick=\{\(\) => void reloadMerchandising\(\)\}>Tekrar dene/);
  assert.match(detail, /const current = await catalogApi\.getProduct\(productId\);\s*setDetail\(current\);\s*\} catch/);
});

test("functional launch exposes read-only sales settings and disables permanent product removal", async () => {
  const detail = await source("components/catalog/ProductDetailConsole.tsx");
  const removeRoute = await source("app/api/catalog/products/[productId]/remove/route.ts");

  for (const state of [
    "Yükleniyor…",
    "Satış ayarları",
    "Yüklenemedi — Tekrar dene",
    "Bu hesap yalnızca görüntüleme yetkisine sahiptir",
  ]) assert.match(detail, new RegExp(state));
  assert.match(detail, /readOnlySalesSettings/);
  assert.match(detail, /catalogOnboardingClient[.]getOptions\(\)/);
  assert.match(detail, /catalogOnboardingClient[.]getProductEditor\(productId\)/);
  assert.doesNotMatch(detail, /ProductRemovalEligibility|inspectRemoval|permanentlyRemoveProduct|Kalıcı kaldır/);
  assert.doesNotMatch(removeRoute, /handleDefaultCatalogRemoveProduct/);
  assert.match(removeRoute, /status:\s*404/);
});

test("basic variant and sales editors guard dirty browser and close navigation", async () => {
  const detail = await source("components/catalog/ProductDetailConsole.tsx");
  const advanced = await source("components/catalog-onboarding/ProductAdvancedEditor.tsx");

  assert.match(detail, /createDirtyNavigationGuard/);
  assert.match(detail, /bindBeforeUnload\(window\)/);
  assert.match(detail, /onChange=\{markDetailDirty\}/);
  assert.match(detail, /Kaydedilmemiş ürün değişiklikleriniz var/);
  assert.match(advanced, /createDirtyNavigationGuard/);
  assert.match(advanced, /bindBeforeUnload\(window\)/);
  assert.match(advanced, /onChange=\{markEditingDirty\}/);
  assert.match(advanced, /Kaydedilmemiş satış ayarı değişiklikleriniz var/);
});

test("store selection is omitted when no authorized server projection exists", async () => {
  const shell = await source("components/panel/PanelShell.tsx");
  const navigation = await source("components/panel/PanelNavigation.tsx");
  const client = await source("components/panel/PanelLayoutClient.tsx");
  const sidebar = await source("components/panel/PanelSidebar.tsx");
  assert.doesNotMatch(`${client}\n${sidebar}\n${navigation}`, /StoreSelector|active-store|storeId/);
  assert.match(sidebar, /model\.storeSlug/);
  assert.match(shell, /PanelChromeModel/);
});

test("server access remains the sole protected-page redirect authority", async () => {
  const access = await source("lib/server-access.ts");
  const layout = await source("app/products/layout.tsx");
  assert.match(access, /decideServerPanelAccess/);
  assert.match(access, /redirect\(decision\.destination\)/);
  assert.doesNotMatch(layout, /searchParams|headers\(|cookies\(/);
});
