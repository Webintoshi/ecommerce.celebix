import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as React from "react";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import * as jsxRuntime from "react/jsx-runtime";
import { Window } from "happy-dom";
import ts from "typescript";

type Permissions = { canReadInventory: boolean; canManageInventory: boolean; canReadPurchasing: boolean; canManagePurchasing: boolean };
const FULL: Permissions = { canReadInventory: true, canManageInventory: true, canReadPurchasing: true, canManagePurchasing: true };
const RECORD = "11111111-1111-4111-8111-111111111111";
const LOCATION = "22222222-2222-4222-8222-222222222222";
const VARIANT = "33333333-3333-4333-8333-333333333333";

async function mounted(query: string, verify: (harness: {
  container: HTMLElement; browser: Window; navigate: (query: string, permissions?: Permissions) => Promise<void>;
  click: (text: string, within?: HTMLElement) => Promise<void>; keys: (key: string, shiftKey?: boolean) => Promise<void>;
  calls: { reloads: number; inventoryCanRead: boolean; detailMounts: number; detailUnmounts: number; locationMounts: number; locationUnmounts: number; urls: string[] };
}) => Promise<void>, initialPermissions: Permissions = FULL) {
  const browser = new Window({ url: `https://panel.example.test/products/stock${query ? `?${query}` : ""}` });
  const globals = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ window: browser, document: browser.document, navigator: browser.navigator, Node: browser.Node, HTMLElement: browser.HTMLElement, Event: browser.Event, IS_REACT_ACT_ENVIRONMENT: true })) {
    globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const container = browser.document.createElement("main"); browser.document.body.append(container);
  const sibling = browser.document.createElement("aside"); sibling.textContent = "Panel gezinmesi"; browser.document.body.append(sibling);
  const root = createRoot(container as unknown as HTMLElement);
  const calls = { reloads: 0, inventoryCanRead: false, detailMounts: 0, detailUnmounts: 0, locationMounts: 0, locationUnmounts: 0, urls: [] as string[] };
  let currentQuery = query, permissions = initialPermissions;
  let Component: React.ComponentType<Permissions>;
  const render = () => root.render(createElement(Component, permissions));
  const go = (href: string) => { calls.urls.push(href); currentQuery = new URL(href, "https://panel.example.test").search.slice(1); render(); };
  const router = { push: go, replace: go };
  const context = { reload: () => { calls.reloads += 1; } };
  const consoleStub = (kind: "count" | "purchase" | "transfer" | "location") => function Console(props: Record<string, unknown>) {
    const detail = props.mode === "new" || props.mode === "detail";
    React.useEffect(() => {
      if (detail) { calls.detailMounts += 1; return () => { calls.detailUnmounts += 1; }; }
      if (kind === "location") { calls.locationMounts += 1; return () => { calls.locationUnmounts += 1; }; }
    }, []);
    const onStateChange = props.onStateChange as ((state: { pending: boolean; locked: boolean; dirty: boolean }) => void) | undefined;
    const tab = kind === "count" ? "counts" : kind === "purchase" ? "purchases" : "transfers";
    return createElement("div", { "data-console": kind, "data-mode": detail ? props.mode : "list", "data-location": props.initialLocationId, "data-variant": props.initialVariantId, "data-embedded": String(props.embedded), "data-can-read": String(props.canRead), "data-can-manage": String(props.canManage) }, detail || kind === "location" ? [
      createElement("input", { key: "input", "aria-label": "Korunan taslak", defaultValue: "Taslak içeriği" }),
      ...["pending", "locked", "dirty", "idle"].map(state => createElement("button", { key: state, type: "button", onClick: () => onStateChange?.({ pending: state === "pending", locked: state === "pending" || state === "locked", dirty: state === "dirty" }) }, `${kind}-${state}`)),
    ] : createElement("a", { href: `/products/stock?tab=${tab}&kind=${kind}&id=${RECORD}`, onClick: (event: React.MouseEvent) => { event.preventDefault(); go(`/products/stock?tab=${tab}&kind=${kind}&id=${RECORD}`); } }, `${kind}-ayrıntı`));
  };
  const source = await readFile(new URL("./StockWorkspace.tsx", import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const compiled: { exports: Record<string, unknown> } = { exports: {} };
  const dependencies: Record<string, unknown> = {
    "react": React, "react/jsx-runtime": jsxRuntime,
    "lucide-react": { ChevronDown: () => createElement("svg", { "aria-hidden": true }), X: () => createElement("svg", { "aria-hidden": true }) },
    "next/navigation": { useRouter: () => router, useSearchParams: () => new URLSearchParams(currentQuery) },
    "@/components/panel/PanelPageShell": { PanelPageShell: ({ children }: { children: React.ReactNode }) => createElement("section", null, children), PanelPageHeader: () => null },
    "./InventoryCountConsole": { InventoryCountConsole: consoleStub("count") },
    "./InventoryTransferConsole": { InventoryTransferConsole: consoleStub("transfer") },
    "./InventoryLocationConsole": { InventoryLocationConsole: consoleStub("location") },
    "./PurchasingConsole": { PurchasingConsole: consoleStub("purchase") },
    "./InventoryWorkspaceContext": { InventoryWorkspaceProvider: ({ inventoryCanRead, children }: { inventoryCanRead: boolean; children: React.ReactNode }) => { calls.inventoryCanRead = inventoryCanRead; return children; }, useInventoryWorkspace: () => context },
    "./StockOverview": { StockOverview: (props: { canManage: boolean; canPurchase: boolean; onCorrect(selection: { locationId: string; variantId: string }): void; onPurchase(selection?: { locationId: string; variantId?: string }): void }) => createElement("div", { "data-overview": true }, props.canManage ? createElement("button", { type: "button", onClick: () => props.onCorrect({ locationId: LOCATION, variantId: VARIANT }) }, "Düzelt") : null, props.canPurchase ? createElement("button", { type: "button", onClick: () => props.onPurchase({ locationId: LOCATION, variantId: VARIANT }) }, "Stok ekle") : null, props.canPurchase ? createElement("button", { type: "button", onClick: () => props.onPurchase({ locationId: LOCATION }) }, "Satın alma oluştur") : null) },
    "./stock-workspace.module.css": { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) },
  };
  Function("require", "module", "exports", output)((name: string) => { if (name in dependencies) return dependencies[name]; throw new Error(`unexpected_import:${name}`); }, compiled, compiled.exports);
  Component = compiled.exports.StockWorkspace as React.ComponentType<Permissions>;
  const navigate = async (next: string, nextPermissions = permissions) => { currentQuery = next; permissions = nextPermissions; await act(async () => render()); };
  const click = async (text: string, within = container as unknown as HTMLElement) => {
    const target = [...within.querySelectorAll<HTMLElement>("button, a")].find(element => element.textContent === text);
    assert.ok(target, `control should exist: ${text}`);
    target.focus();
    await act(async () => target.click());
  };
  const keys = async (key: string, shiftKey = false) => {
    await act(async () => (browser.document.activeElement ?? browser.document.body).dispatchEvent(new browser.KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true })));
  };
  try { await act(async () => render()); await verify({ container: container as unknown as HTMLElement, browser, navigate, click, keys, calls }); }
  finally { await act(async () => root.unmount()); for (const [key, descriptor] of globals) descriptor ? Object.defineProperty(globalThis, key, descriptor) : Reflect.deleteProperty(globalThis, key); await browser.happyDOM.close(); }
}

test("five stock views keep selection in the URL and open a record in an embedded dialog", async () => {
  await mounted("tab=counts", async ({ container, click, calls }) => {
    assert.deepEqual([...container.querySelectorAll('[role="tab"]')].map(tab => tab.textContent), ["Ürünler", "Sayımlar", "Taşımalar", "Satın almalar", "Depolar"]);
    assert.equal(container.querySelectorAll("h1").length, 1);
    for (const tab of container.querySelectorAll('[role="tab"]')) assert.ok(container.querySelector(`#${tab.getAttribute("aria-controls")}`), "every tab should own an existing panel");
    assert.equal(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent, "Sayımlar");
    await click("count-ayrıntı");
    assert.equal(container.querySelector('[role="dialog"] h2')?.textContent, "Stok sayımı");
    assert.equal(container.querySelector('[role="dialog"] [data-console]')?.getAttribute("data-embedded"), "true");
    assert.match(calls.urls.at(-1)!, /tab=counts&kind=count&id=/);
    assert.equal(container.querySelector('[role="tabpanel"]:not([hidden]) [data-mode]')?.getAttribute("data-mode"), "list");
  });
});

test("inventory and purchasing read permissions remain independent, including new links", async () => {
  const purchasingOnly = { canReadInventory: false, canManageInventory: true, canReadPurchasing: true, canManagePurchasing: true };
  await mounted(`tab=counts&kind=count&id=${RECORD}`, async ({ container, calls, navigate, click }) => {
    assert.equal(calls.inventoryCanRead, false);
    assert.deepEqual([...container.querySelectorAll('[role="tab"]')].map(tab => tab.textContent), ["Satın almalar"]);
    assert.equal(container.querySelector('[role="dialog"]'), null);
    assert.match(container.textContent!, /yetkiniz yok/);
    await click("Stok işlemi");
    assert.deepEqual([...container.querySelectorAll('[role="menuitem"]')].map(item => item.textContent), ["Yeni satın alma"]);
    await click("Yeni satın alma");
    assert.equal(container.querySelector('[role="dialog"] [data-console]')?.getAttribute("data-console"), "purchase");
    await navigate("kind=purchase&new=1", { ...purchasingOnly, canReadPurchasing: false });
    assert.equal(container.querySelector('[role="dialog"]'), null);
    assert.equal(container.querySelector('[aria-haspopup="menu"]'), null);
  }, purchasingOnly);
});

test("inventory-only and read-only permissions pass unchanged to consoles and keep a keyboard return target", async () => {
  const inventoryOnly = { ...FULL, canReadPurchasing: false };
  await mounted("tab=overview", async ({ container, browser, click, keys, navigate }) => {
    assert.deepEqual([...container.querySelectorAll('[role="tab"]')].map(tab => tab.textContent), ["Ürünler", "Sayımlar", "Taşımalar", "Depolar"]);
    assert.equal([...container.querySelectorAll("button")].some(button => button.textContent === "Stok ekle"), false);
    await click("Stok işlemi");
    assert.deepEqual([...container.querySelectorAll('[role="menuitem"]')].map(item => item.textContent), ["Sayım yap", "Depolar arası taşı"]);
    await keys("Escape");
    const readOnly = { ...FULL, canManageInventory: false, canManagePurchasing: false };
    await navigate(`tab=counts&kind=count&id=${RECORD}`, readOnly);
    assert.equal(container.querySelector('[aria-haspopup="menu"]'), null);
    const detail = container.querySelector('[role="dialog"] [data-console]')!;
    assert.equal(detail.getAttribute("data-can-read"), "true");
    assert.equal(detail.getAttribute("data-can-manage"), "false");
    await keys("Escape");
    assert.equal(browser.document.activeElement?.getAttribute("id"), "stock-tab-counts");
    await navigate("tab=counts&kind=count&new=1", readOnly);
    assert.equal(container.querySelector('[role="dialog"]'), null);
    assert.match(container.textContent!, /yetkiniz yok/);
  }, inventoryOnly);
});

test("invalid query text never mounts a record controller and invalid preselection is ignored", async () => {
  await mounted("tab=unknown&kind=count&id=not-an-id", async ({ container, calls, navigate }) => {
    assert.equal(container.querySelector('[role="dialog"]'), null);
    assert.equal(calls.detailMounts, 0);
    assert.match(container.textContent!, /bağlantısı geçerli değil/);
    await navigate("tab=counts&kind=count&new=1&locationId=invalid&variantId=invalid");
    assert.ok(container.querySelector('[role="dialog"]'));
    assert.equal(container.querySelector('[role="dialog"] [data-console]')?.hasAttribute("data-location"), false);
    assert.equal(container.querySelector('[role="dialog"] [data-console]')?.hasAttribute("data-variant"), false);
  });
});

test("operation links enforce the same lowercase UUID version and variant contract as the inventory client", async () => {
  await mounted("tab=counts", async ({ container, calls, navigate }) => {
    for (const id of [
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa".toUpperCase(),
      "11111111-1111-0111-8111-111111111111",
      "11111111-1111-9111-8111-111111111111",
      "11111111-1111-4111-7111-111111111111",
      "11111111-1111-4111-c111-111111111111",
    ]) {
      await navigate(`tab=counts&kind=count&id=${id}`);
      assert.equal(container.querySelector('[role="dialog"]'), null);
      assert.match(container.textContent!, /bağlantısı geçerli değil/);
    }
    assert.equal(calls.detailMounts, 0, "invalid IDs must not reach a console or its API client");
    await navigate(`tab=counts&kind=count&new=1&locationId=11111111-1111-0111-8111-111111111111&variantId=11111111-1111-4111-7111-111111111111`);
    const form = container.querySelector('[role="dialog"] [data-console]')!;
    assert.equal(form.hasAttribute("data-location"), false);
    assert.equal(form.hasAttribute("data-variant"), false);
  });
});

test("stock actions use one menu and the dialog traps focus, makes the background inert, and restores focus", async () => {
  await mounted("tab=overview", async ({ container, browser, click, keys, calls }) => {
    const trigger = container.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')!;
    assert.equal(container.querySelectorAll('[aria-haspopup="menu"]').length, 1);
    await click("Stok işlemi");
    assert.equal(browser.document.activeElement?.textContent, "Yeni satın alma");
    await keys("End");
    assert.equal(browser.document.activeElement?.textContent, "Depolar arası taşı");
    await click("Sayım yap");
    const dialog = container.querySelector<HTMLElement>('[role="dialog"]')!;
    assert.ok(browser.document.activeElement as unknown === dialog);
    assert.equal(browser.document.querySelector("aside")?.getAttribute("aria-hidden"), "true");
    assert.equal((browser.document.querySelector("aside") as unknown as HTMLElement).inert, true);
    await keys("Tab");
    assert.equal(browser.document.activeElement?.getAttribute("aria-label"), "Stok işlemini kapat");
    await keys("Tab", true);
    assert.equal(browser.document.activeElement?.textContent, "count-idle");
    await keys("Tab");
    assert.equal(browser.document.activeElement?.getAttribute("aria-label"), "Stok işlemini kapat");
    await keys("Escape");
    assert.equal(container.querySelector('[role="dialog"]'), null);
    assert.ok(browser.document.activeElement as unknown === trigger);
    assert.equal(browser.document.querySelector("aside")?.getAttribute("aria-hidden"), null);
    assert.equal(calls.reloads, 1);
    assert.equal(calls.urls.at(-1), "/products/stock?tab=overview");
  });
});

test("Tab closes the action menu without losing keyboard focus", async () => {
  await mounted("tab=counts", async ({ container, browser, click, keys }) => {
    await click("Stok işlemi");
    await keys("Tab");
    assert.equal(container.querySelector('[role="menu"]'), null);
    assert.equal(browser.document.activeElement?.getAttribute("id"), "stock-panel-counts");
    await click("Stok işlemi");
    await keys("Tab", true);
    assert.equal(browser.document.activeElement?.getAttribute("aria-haspopup"), "menu");
  });
});

test("pending and ambiguous actions keep the same controller and inputs through close and URL navigation", async () => {
  await mounted(`tab=counts&kind=count&id=${RECORD}`, async ({ container, click, keys, navigate, calls }) => {
    const input = container.querySelector<HTMLInputElement>('[aria-label="Korunan taslak"]')!;
    input.value = "Korunacak değer";
    await click("count-pending");
    await keys("Escape");
    assert.ok(container.querySelector('[role="dialog"]'));
    assert.equal(container.querySelector<HTMLButtonElement>('[aria-label="Stok işlemini kapat"]')?.disabled, true);
    await navigate("tab=purchases");
    assert.equal(calls.detailUnmounts, 0);
    assert.equal(calls.detailMounts, 1);
    assert.equal(input.value, "Korunacak değer");
    assert.equal(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent, "Sayımlar");
    await click("count-locked");
    await keys("Escape");
    await navigate("tab=transfers&kind=transfer&new=1");
    assert.equal(calls.detailUnmounts, 0);
    assert.equal(container.querySelector('[role="dialog"] [data-console]')?.getAttribute("data-console"), "count");
    await click("count-idle");
    await keys("Escape");
    assert.equal(calls.detailUnmounts, 1);
    assert.equal(calls.reloads, 1);
  });
});

test("browser history cannot dispose a pending or ambiguous controller by leaving the stock route", async () => {
  await mounted(`tab=counts&kind=count&id=${RECORD}`, async ({ container, browser, click, calls }) => {
    const input = container.querySelector<HTMLInputElement>('[aria-label="Korunan taslak"]')!;
    input.value = "Belirsiz işlem girdisi";
    let routed = 0;
    const routerRestore = () => { routed += 1; };
    browser.addEventListener("popstate", routerRestore);
    for (const state of ["pending", "locked"]) {
      await click(`count-${state}`);
      browser.history.replaceState({}, "", "/products");
      await act(async () => browser.dispatchEvent(new browser.PopStateEvent("popstate", { state: {} })));
      assert.equal(routed, 0, "the router must not restore a different page while the operation is protected");
      assert.equal(browser.location.pathname, "/products/stock");
      assert.equal(new URLSearchParams(browser.location.search).get("id"), RECORD);
      assert.equal(calls.detailMounts, 1);
      assert.equal(calls.detailUnmounts, 0);
      assert.equal(input.value, "Belirsiz işlem girdisi");
    }
    await click("count-idle");
    await act(async () => browser.dispatchEvent(new browser.PopStateEvent("popstate", { state: {} })));
    assert.equal(routed, 1, "history navigation should resume once the controller releases the operation");
    browser.removeEventListener("popstate", routerRestore);
  });
});

test("location mutations and unsaved names survive tabs, operation actions, query navigation, and browser history", async () => {
  await mounted("tab=locations", async ({ container, browser, click, navigate, calls }) => {
    const input = container.querySelector<HTMLInputElement>('[aria-label="Korunan taslak"]')!;
    input.value = "Korunan depo adı";
    let routed = 0;
    const routerRestore = () => { routed += 1; };
    browser.addEventListener("popstate", routerRestore);
    for (const state of ["pending", "locked", "dirty"]) {
      await click(`location-${state}`);
      await click("Sayımlar");
      assert.equal(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent, "Depolar");
      await click("Stok işlemi");
      await click("Sayım yap");
      assert.equal(container.querySelector('[role="dialog"]'), null);
      assert.equal(browser.document.activeElement?.getAttribute("aria-haspopup"), "menu");
      await navigate("tab=purchases&kind=purchase&new=1");
      assert.equal(container.querySelector('[role="dialog"]'), null);
      const unload = new browser.Event("beforeunload", { cancelable: true });
      browser.dispatchEvent(unload);
      assert.equal(unload.defaultPrevented, true);
      browser.history.replaceState({}, "", "/products");
      await act(async () => browser.dispatchEvent(new browser.PopStateEvent("popstate", { state: {} })));
      assert.equal(routed, 0);
      assert.equal(browser.location.pathname, "/products/stock");
      assert.equal(new URLSearchParams(browser.location.search).get("tab"), "locations");
      assert.equal(calls.locationMounts, 1);
      assert.equal(calls.locationUnmounts, 0);
      assert.equal(input.value, "Korunan depo adı");
    }
    await click("location-idle");
    await click("Sayımlar");
    assert.equal(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent, "Sayımlar");
    assert.equal(calls.locationUnmounts, 1);
    browser.removeEventListener("popstate", routerRestore);
  });
});

test("an open location rename dialog prevents a second stock dialog and keeps its edit context", async () => {
  await mounted("tab=locations", async ({ container, browser, navigate, calls }) => {
    const rename = browser.document.createElement("div");
    rename.setAttribute("role", "dialog"); rename.setAttribute("aria-modal", "true"); rename.setAttribute("aria-labelledby", "inventory-location-rename-title");
    container.append(rename as unknown as Node);
    await navigate("tab=locations&kind=count&new=1");
    assert.equal(container.querySelectorAll('[role="dialog"]').length, 1);
    assert.equal(container.querySelector('[role="dialog"] [data-console]'), null);
    assert.equal(calls.locationUnmounts, 0);
    rename.remove();
    await navigate("tab=locations&kind=count&new=1");
    assert.equal(container.querySelector('[role="dialog"] [data-console]')?.getAttribute("data-console"), "count");
  });
});

test("an unsaved form asks before closing within the same dialog and cannot discard a running action", async () => {
  await mounted("tab=counts&kind=count&new=1", async ({ container, click, keys, calls }) => {
    await click("count-dirty");
    await keys("Escape");
    assert.equal(container.querySelectorAll('[role="dialog"]').length, 1);
    assert.ok(container.querySelector('[aria-label="Kaydedilmemiş değişiklikler"]'));
    assert.equal(calls.detailUnmounts, 0);
    await click("count-pending");
    const discard = [...container.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Değişiklikleri bırak")!;
    assert.equal(discard.disabled, true);
    await click("count-idle");
    await click("Düzenlemeye devam et");
    assert.equal(container.querySelector('[aria-label="Kaydedilmemiş değişiklikler"]'), null);
    await click("count-dirty");
    await keys("Escape");
    await click("Değişiklikleri bırak");
    assert.equal(container.querySelector('[role="dialog"]'), null);
    assert.equal(calls.detailUnmounts, 1);
    assert.equal(calls.reloads, 1);
  });
});

test("correcting a stock row preserves location and variant selection and returns focus to the row action", async () => {
  await mounted("tab=overview", async ({ container, click, keys, browser, calls }) => {
    const trigger = [...container.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Düzelt")!;
    await click("Düzelt");
    const form = container.querySelector('[role="dialog"] [data-console]')!;
    assert.equal(form.getAttribute("data-location"), LOCATION);
    assert.equal(form.getAttribute("data-variant"), VARIANT);
    assert.match(calls.urls.at(-1)!, new RegExp(`locationId=${LOCATION}&variantId=${VARIANT}`));
    await keys("Escape");
    assert.ok(browser.document.activeElement as unknown === trigger);
  });
});

test("adding stock from an overview row opens a permitted purchase with the selected depot and variant", async () => {
  await mounted("tab=overview", async ({ container, click, keys, browser, calls, navigate }) => {
    const trigger = [...container.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Stok ekle")!;
    await click("Stok ekle");
    const form = container.querySelector('[role="dialog"] [data-console]')!;
    assert.equal(form.getAttribute("data-console"), "purchase");
    assert.equal(form.getAttribute("data-location"), LOCATION);
    assert.equal(form.getAttribute("data-variant"), VARIANT);
    assert.match(calls.urls.at(-1)!, new RegExp(`kind=purchase&new=1&locationId=${LOCATION}&variantId=${VARIANT}`));
    await keys("Escape");
    assert.ok(browser.document.activeElement as unknown === trigger);
    await click("Satın alma oluştur");
    const depotOnly = container.querySelector('[role="dialog"] [data-console]')!;
    assert.equal(depotOnly.getAttribute("data-location"), LOCATION);
    assert.equal(depotOnly.hasAttribute("data-variant"), false);
    await keys("Escape");
    await navigate(`tab=overview&kind=purchase&new=1&locationId=${LOCATION}&variantId=${VARIANT}`, { ...FULL, canReadPurchasing: false });
    assert.equal(container.querySelector('[role="dialog"]'), null);
    assert.match(container.textContent!, /yetkiniz yok/);
  });
});
