import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as React from "react";
import { act, createElement } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import * as contracts from "@celebix/saas-contracts";
import { Window } from "happy-dom";
import ts from "typescript";

const ID = "81000000-0000-4000-8000-000000000001";
const NOW = "2026-10-03T12:00:00.000Z";
const config = {
  schemaVersion: 1, enabled: true, title: "Bize ulaşın", greeting: "Nasıl yardımcı olabiliriz?", buttonLabel: "İletişim",
  position: "bottom-right", icon: "message", theme: "brand", devices: { desktop: true, mobile: true },
  pages: ["home", "products", "categories", "content", "cart", "search"], whatsappMessage: "Merhaba", includeProductLink: true,
  hours: { enabled: false, timeZone: "Europe/Istanbul", days: [1, 2, 3, 4, 5], opensAt: "09:00", closesAt: "18:00", outsideBehavior: "message", outsideMessage: "Mesai dışında mesaj bırakabilirsiniz." },
  channels: [
    { type: "whatsapp", enabled: true, label: "WhatsApp", value: "+905551112233" },
    { type: "phone", enabled: true, label: "Telefon", value: "+905551112234" },
  ],
};
const record = { id: ID, kind: "contact_widget", name: "İletişim balonu", status: "active", config, version: 3, createdAt: NOW, updatedAt: NOW };
class ApiError extends Error { constructor(readonly code: string) { super(code); } }

async function screen(options: { canManage?: boolean; workspace?: boolean; records?: () => Promise<any>; save?: (...args: any[]) => Promise<any> }, verify: (context: any) => Promise<void>) {
  const browser = new Window({ url: "https://panel.example.test/settings/store-tools" });
  const globals = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ window: browser, document: browser.document, navigator: browser.navigator, Element: browser.Element, HTMLElement: browser.HTMLElement, HTMLInputElement: browser.HTMLInputElement, HTMLTextAreaElement: browser.HTMLTextAreaElement, HTMLSelectElement: browser.HTMLSelectElement, Event: browser.Event, KeyboardEvent: browser.KeyboardEvent, IS_REACT_ACT_ENVIRONMENT: true })) {
    globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const pushes: string[] = [];
  const css: any = new Proxy({}, { get: (_target, key) => key === "__esModule" ? true : key === "default" ? css : String(key) });
  const requireModule = (id: string) => {
    if (id === "react") return React;
    if (id === "react/jsx-runtime") return jsxRuntime;
    if (id === "lucide-react") return new Proxy({}, { get: () => () => null });
    if (id === "@celebix/saas-contracts") return contracts;
    if (id === "@/lib/merchant-admin-ui/client") return { MerchantAdminApiError: ApiError, merchantAdminApi: { records: options.records ?? (async () => [record]), save: options.save ?? (async () => ({ id: ID, kind: "contact_widget", status: "active", version: 4, updatedAt: NOW, replayed: false })) } };
    if (id === "@/components/panel/PanelPageShell") return { PanelPageShell: ({ children }: any) => children, PanelPageHeader: () => null };
    if (id === "@/components/panel/PanelTopbarChrome") return { PanelTopbarBridge: () => null };
    if (id === "next/link") return ({ children, href, ...props }: any) => createElement("a", { ...props, href }, children);
    if (id === "next/navigation") return { usePathname: () => "/settings/store-tools", useRouter: () => ({ push: (path: string) => pushes.push(path) }) };
    if (id === "./settings-navigation") return { SETTINGS_DESTINATIONS: [{ href: "/settings/store-tools", label: "Mağaza araçları" }] };
    if (id.endsWith(".css")) return css;
    throw new Error(`unexpected_import:${id}`);
  };
  async function load(name: string) {
    const source = await readFile(new URL(`./${name}.tsx`, import.meta.url), "utf8");
    const output = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const compiled = { exports: {} as Record<string, any> };
    Function("require", "module", "exports", output)(requireModule, compiled, compiled.exports);
    return compiled.exports[name];
  }
  const Component = await load("StoreToolsConsole");
  const Workspace = options.workspace ? await load("SettingsWorkspace") : null;
  const { createRoot } = await import("react-dom/client");
  const container = browser.document.createElement("div"); browser.document.body.append(container);
  const root = createRoot(container as any);
  const settle = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); }); };
  const click = async (selector: string) => { const element: any = container.querySelector(selector); assert.ok(element, selector); await act(async () => element.click()); await settle(); };
  const input = async (selector: string, value: string) => {
    const field: any = container.querySelector(selector); assert.ok(field, selector);
    const prototype = field.tagName === "SELECT" ? browser.HTMLSelectElement.prototype : field.tagName === "TEXTAREA" ? browser.HTMLTextAreaElement.prototype : browser.HTMLInputElement.prototype;
    await act(async () => { Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(field, value); field.dispatchEvent(new browser.Event(field.tagName === "SELECT" ? "change" : "input", { bubbles: true })); });
  };
  const submit = async () => { const form = container.querySelector("form"); assert.ok(form); await act(async () => { form.dispatchEvent(new browser.Event("submit", { bubbles: true, cancelable: true })); await new Promise(resolve => setTimeout(resolve, 0)); }); };
  try { await act(async () => { const content = createElement(Component, { canManage: options.canManage ?? true }); root.render(Workspace ? createElement(Workspace, { children: content }) : content); await new Promise(resolve => setTimeout(resolve, 0)); }); await verify({ browser, container, settle, click, input, submit, pushes }); }
  finally { await act(async () => root.unmount()); for (const [key, descriptor] of globals) descriptor ? Object.defineProperty(globalThis, key, descriptor) : Reflect.deleteProperty(globalThis, key); await browser.happyDOM.close(); }
}

test("tool opens centrally and cancelling restores saved content and trigger focus", async () => {
  await screen({}, async ({ browser, container, click, input }: any) => {
    await click('[data-tool-edit="contact_widget"]');
    assert.equal(container.querySelector('[role="dialog"]').getAttribute("aria-modal"), "true");
    await input('[name="title"]', "Benim değişikliğim");
    await click('[data-tool-cancel]');
    assert.equal(container.querySelector('[role="dialog"]'), null);
    assert.equal(browser.document.activeElement, container.querySelector('[data-tool-edit="contact_widget"]'));
    await click('[data-tool-edit="contact_widget"]');
    assert.equal(container.querySelector('[name="title"]').value, "Bize ulaşın");
  });
});

test("same-content retries retain draft and operation key while a changed draft starts a new operation", async () => {
  const calls: any[] = [];
  await screen({ save: async (...args) => { calls.push(args); throw new ApiError("unavailable"); } }, async ({ container, click, input, submit }: any) => {
    await click('[data-tool-edit="contact_widget"]'); await input('[name="title"]', "Destek ekibi");
    await submit(); await submit();
    assert.equal(calls.length, 2); assert.equal(calls[0][0], "contact_widget");
    assert.equal(calls[0][1].recordId, ID); assert.equal(calls[0][1].expectedVersion, 3);
    assert.equal(calls[0][2], calls[1][2]); assert.equal(typeof calls[0][2], "string");
    assert.equal(container.querySelector('[name="title"]').value, "Destek ekibi");
    assert.match(container.querySelector('[role="alert"]').textContent, /korun/);
    await input('[name="title"]', "Yeni destek ekibi"); await submit(); assert.notEqual(calls[1][2], calls[2][2]);
  });
});

test("successful apply advances known version without a read and later cancel uses the saved baseline", async () => {
  let reads = 0; const calls: any[] = [];
  await screen({ records: async () => { reads += 1; if (reads > 1) throw new ApiError("unavailable"); return [record]; }, save: async (...args) => { calls.push(args); return { id: ID, kind: "contact_widget", status: "active", version: 4, updatedAt: NOW, replayed: false }; } }, async ({ container, click, input, submit }: any) => {
    await click('[data-tool-edit="contact_widget"]'); await input('[name="title"]', "Kaydedilen başlık"); await submit();
    assert.equal(reads, 1); assert.equal(container.querySelector('[role="dialog"]'), null);
    await click('[data-tool-edit="contact_widget"]'); await input('[name="title"]', "Başka başlık"); await click('[data-tool-cancel]');
    await click('[data-tool-edit="contact_widget"]'); assert.equal(container.querySelector('[name="title"]').value, "Kaydedilen başlık");
    await input('[name="title"]', "Son başlık"); await submit(); assert.equal(calls[1][1].expectedVersion, 4);
  });
});

test("conflict blocks repeat apply and failed explicit reload preserves draft until a successful reload", async () => {
  let reads = 0; let saves = 0;
  await screen({ records: async () => { reads += 1; if (reads === 2) throw new ApiError("unavailable"); return [{ ...record, config: { ...config, title: reads > 2 ? "Güncel başlık" : config.title }, version: reads > 2 ? 8 : 3 }]; }, save: async () => { saves += 1; throw new ApiError("version_conflict"); } }, async ({ container, click, input, submit }: any) => {
    await click('[data-tool-edit="contact_widget"]'); await input('[name="title"]', "Benim taslağım"); await submit(); await submit();
    assert.equal(saves, 1); assert.equal(container.querySelector('[name="title"]').value, "Benim taslağım");
    await click('[data-tool-reload]'); assert.equal(container.querySelector('[name="title"]').value, "Benim taslağım");
    await click('[data-tool-reload]'); assert.equal(container.querySelector('[name="title"]').value, "Güncel başlık");
  });
});

test("disabled widget can be saved with no channels but active invalid channel cannot submit", async () => {
  const calls: any[] = [];
  await screen({ records: async () => [], save: async (...args) => { calls.push(args); return { id: ID, kind: "contact_widget", status: "active", version: 1, updatedAt: NOW, replayed: false }; } }, async ({ container, click, submit }: any) => {
    await click('[data-tool-edit="contact_widget"]'); await submit();
    assert.equal(calls[0][1].config.enabled, false); assert.equal(calls[0][1].status, "active");
    await click('[data-tool-edit="contact_widget"]'); await click('[name="enabled"]'); await submit();
    assert.equal(calls.length, 1); assert.ok(container.querySelector('[role="alert"]'));
  });
});

test("channels reorder and disabled channel remains out of preview even with a configured value", async () => {
  const calls: any[] = [];
  await screen({ save: async (...args) => { calls.push(args); return { id: ID, kind: "contact_widget", status: "active", version: 4, updatedAt: NOW, replayed: false }; } }, async ({ container, click, submit }: any) => {
    await click('[data-tool-edit="contact_widget"]');
    assert.ok(container.querySelector('[data-tool-preview] button[data-preview-channel="whatsapp"]'));
    await click('[name="channel-enabled-whatsapp"]');
    assert.equal(container.querySelector('[data-tool-preview] button[data-preview-channel="whatsapp"]'), null);
    await click('[data-channel-up="phone"]'); await submit();
    assert.equal(calls[0][1].config.channels[0].type, "phone"); assert.equal(calls[0][1].config.channels[1].enabled, false);
  });
});

test("hours devices page choices and appearance are carried in one apply", async () => {
  const calls: any[] = [];
  await screen({ save: async (...args) => { calls.push(args); return { id: ID, kind: "contact_widget", status: "active", version: 4, updatedAt: NOW, replayed: false }; } }, async ({ click, input, submit }: any) => {
    await click('[data-tool-edit="contact_widget"]'); await click('[data-tool-tab="appearance"]');
    await input('[name="position"]', "bottom-left"); await input('[name="theme"]', "dark");
    await click('[data-tool-tab="visibility"]'); await click('[name="device-mobile"]'); await click('[name="page-cart"]');
    await click('[name="hours-enabled"]'); await input('[name="opensAt"]', "10:30"); await input('[name="closesAt"]', "17:45"); await click('[name="day-1"]'); await submit();
    assert.equal(calls[0][1].config.position, "bottom-left"); assert.equal(calls[0][1].config.theme, "dark");
    assert.equal(calls[0][1].config.devices.mobile, false); assert.equal(calls[0][1].config.pages.includes("cart"), false);
    assert.equal(calls[0][1].config.hours.enabled, true); assert.equal(calls[0][1].config.hours.opensAt, "10:30"); assert.equal(calls[0][1].config.hours.days.includes(1), false);
  });
});

test("invalid hours explain the affected choice and preserve the entered range", async () => {
  let saves = 0;
  await screen({ save: async () => { saves += 1; } }, async ({ container, click, input, submit }: any) => {
    await click('[data-tool-edit="contact_widget"]'); await click('[data-tool-tab="visibility"]'); await click('[name="hours-enabled"]');
    await input('[name="opensAt"]', "18:00"); await submit();
    assert.equal(saves, 0); assert.match(container.querySelector('[role="alert"]').textContent, /Açılış.*kapanış/);
    assert.equal(container.querySelector('[name="opensAt"]').value, "18:00");
  });
});

test("read-only editor exposes settings while hiding apply and busy apply locks changes and cancel", async () => {
  await screen({ canManage: false }, async ({ container, click }: any) => {
    await click('[data-tool-edit="contact_widget"]'); assert.equal(container.querySelector('[data-tool-apply]'), null);
    assert.equal(container.querySelector('[name="title"]').closest("fieldset").disabled, true);
  });
  let complete!: (value: any) => void;
  await screen({ save: () => new Promise(resolve => { complete = resolve; }) }, async ({ container, click, input, submit, settle }: any) => {
    await click('[data-tool-edit="contact_widget"]'); await input('[name="title"]', "Bekleyen değişiklik"); await submit();
    assert.equal(container.querySelector('[name="title"]').closest("fieldset").disabled, true); assert.equal(container.querySelector('[data-tool-cancel]').disabled, true);
    await act(async () => complete({ id: ID, kind: "contact_widget", status: "active", version: 4, updatedAt: NOW, replayed: false })); await settle();
    assert.equal(container.querySelector('[role="dialog"]'), null);
  });
});

test("Escape cancels and tab wraps inside the window while preview actions stay on the screen", async () => {
  await screen({}, async ({ browser, container, click, input }: any) => {
    await click('[data-tool-edit="contact_widget"]'); await input('[name="title"]', "Değişen başlık");
    const first = container.querySelector('[data-tool-close]'); const last = container.querySelector('[data-tool-apply]');
    await act(async () => { last.focus(); last.dispatchEvent(new browser.KeyboardEvent("keydown", { key: "Tab", bubbles: true })); });
    assert.equal(browser.document.activeElement, first);
    await act(async () => container.querySelector('[data-preview-channel]').click());
    assert.equal(container.querySelectorAll('[data-tool-preview] a').length, 0);
    assert.equal(browser.location.pathname, "/settings/store-tools");
    await act(async () => browser.dispatchEvent(new browser.KeyboardEvent("keydown", { key: "Escape", bubbles: true }))); assert.equal(container.querySelector('[role="dialog"]'), null);
  });
});

test("dirty contact page preview cannot open the settings discard guard or navigate", async () => {
  await screen({ workspace: true }, async ({ browser, container, click, input, pushes }: any) => {
    await click('[data-tool-edit="contact_widget"]'); await input('[name="title"]', "Kaydedilmemiş başlık");
    await click('[name="channel-enabled-contact_page"]'); await input('[name="channel-value-contact_page"]', "/pages/iletisim");
    const action = [...container.querySelectorAll('[data-tool-preview] a,[data-tool-preview] button')].find((element: any) => element.textContent.includes("İletişim sayfası")) as any;
    assert.ok(action);
    await act(async () => action.click());
    assert.equal(container.querySelector("dialog")?.open ?? false, false);
    await act(async () => action.dispatchEvent(new browser.MouseEvent("click", { button: 1, bubbles: true, cancelable: true })));
    assert.equal(container.querySelector("dialog")?.open ?? false, false); assert.deepEqual(pushes, []);
    assert.equal(action.hasAttribute("href"), false); assert.equal(action.type, "button");
  });
});
