import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
const pageRecord = { id: "82000000-0000-4000-8000-000000000001", kind: "page", name: "Bize ulaşın", config: { slug: "iletisim", locale: "tr", body: "Yerel örnek iletişim sayfası", published: true }, status: "active", version: 2, createdAt: NOW, updatedAt: NOW };
const languageRecord = { id: "83000000-0000-4000-8000-000000000001", kind: "language_setting", name: "Mağaza dili", config: { defaultLocale: "tr", enabledLocales: ["tr", "en"] }, status: "active", version: 1, createdAt: NOW, updatedAt: NOW };
class ApiError extends Error { constructor(readonly code: string) { super(code); } }

async function screen(options: { canManage?: boolean; workspace?: boolean; records?: () => Promise<any>; pageRecords?: () => Promise<any>; languageRecords?: () => Promise<any>; save?: (...args: any[]) => Promise<any> }, verify: (context: any) => Promise<void>) {
  const browser = new Window({ url: "https://panel.example.test/settings/store-tools" });
  const globals = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ window: browser, document: browser.document, navigator: browser.navigator, Element: browser.Element, HTMLElement: browser.HTMLElement, HTMLInputElement: browser.HTMLInputElement, HTMLTextAreaElement: browser.HTMLTextAreaElement, HTMLSelectElement: browser.HTMLSelectElement, Event: browser.Event, KeyboardEvent: browser.KeyboardEvent, IS_REACT_ACT_ENVIRONMENT: true })) {
    globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const pushes: string[] = [];
  const css: any = new Proxy({}, { get: (_target, key) => key === "__esModule" ? true : key === "default" ? css : String(key) });
  const compiledModules = new Map<string, Record<string, any>>();
  function compile(relativePath: string) {
    const cached = compiledModules.get(relativePath); if (cached) return cached;
    const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
    const output = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const compiled = { exports: {} as Record<string, any> }; compiledModules.set(relativePath, compiled.exports);
    Function("require", "module", "exports", output)(requireModule, compiled, compiled.exports);
    return compiled.exports;
  }
  const requireModule = (id: string) => {
    if (id === "./RestockTool") return { RestockTool: () => null };
    if (id === "react") return React;
    if (id === "react/jsx-runtime") return jsxRuntime;
    if (id === "lucide-react") return new Proxy({}, { get: () => () => null });
    if (id === "@celebix/saas-contracts") return contracts;
    if (id === "@/lib/merchant-admin-ui/client") return { MerchantAdminApiError: ApiError, merchantAdminApi: {
      records: async (kind: string) => {
        if (kind === "contact_widget") return options.records ? options.records() : [record];
        if (kind === "page") return options.pageRecords ? options.pageRecords() : [pageRecord];
        if (kind === "language_setting") return options.languageRecords ? options.languageRecords() : [languageRecord];
        throw new Error(`unexpected_record_kind:${kind}`);
      },
      save: options.save ?? (async () => ({ id: ID, kind: "contact_widget", status: "active", version: 4, updatedAt: NOW, replayed: false })),
    } };
    if (id === "@/components/panel/PanelPageShell") return { PanelPageShell: ({ children }: any) => children, PanelPageHeader: () => null };
    if (id === "@/components/panel/PanelTopbarChrome") return { PanelTopbarBridge: () => null };
    if (id === "next/link") return ({ children, href, ...props }: any) => createElement("a", { ...props, href }, children);
    if (id === "next/navigation") return { usePathname: () => "/settings/store-tools", useRouter: () => ({ push: (path: string) => pushes.push(path) }) };
    if (id === "./settings-navigation") return { SETTINGS_DESTINATIONS: [{ href: "/settings/store-tools", label: "Mağaza araçları" }] };
    if (id === "./design/DesignLinkField") return compile("./design/DesignLinkField.tsx");
    if (id === "./design-link-options") return compile("./design/design-link-options.ts");
    if (id === "../starter-footer-options.ts") return compile("./starter-footer-options.ts");
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
  const openChannel = async (type: string) => {
    const action = container.querySelector(`[data-channel-open="${type}"]`);
    assert.ok(action, `${type} channel must be available`);
    if (action.getAttribute("aria-expanded") !== "true") await click(`[data-channel-open="${type}"]`);
  };
  const addChannel = async (type: string) => { await click("[data-tool-add-channel]"); await click(`[data-channel-add="${type}"]`); };
  const input = async (selector: string, value: string) => {
    const field: any = container.querySelector(selector); assert.ok(field, selector);
    const prototype = field.tagName === "SELECT" ? browser.HTMLSelectElement.prototype : field.tagName === "TEXTAREA" ? browser.HTMLTextAreaElement.prototype : browser.HTMLInputElement.prototype;
    await act(async () => { Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(field, value); field.dispatchEvent(new browser.Event(field.tagName === "SELECT" ? "change" : "input", { bubbles: true })); });
  };
  const submit = async () => { const form = container.querySelector("form"); assert.ok(form); await act(async () => { form.dispatchEvent(new browser.Event("submit", { bubbles: true, cancelable: true })); await new Promise(resolve => setTimeout(resolve, 0)); }); };
  try { await act(async () => { const content = createElement(Component, { canManage: options.canManage ?? true }); root.render(Workspace ? createElement(Workspace, { children: content }) : content); await new Promise(resolve => setTimeout(resolve, 0)); }); await verify({ browser, container, settle, click, input, submit, openChannel, addChannel, pushes }); }
  finally { await act(async () => root.unmount()); for (const [key, descriptor] of globals) descriptor ? Object.defineProperty(globalThis, key, descriptor) : Reflect.deleteProperty(globalThis, key); await browser.happyDOM.close(); }
}

test("discarding a changed tool restores saved content and returns focus to its edit action", async () => {
  await screen({}, async ({ browser, container, click, input }: any) => {
    await click('[data-tool-edit="contact_widget"]');
    await input('[name="title"]', "Benim değişikliğim");
    await click('[data-tool-cancel]'); await click('[data-tool-discard]');
    assert.equal(container.querySelector('form'), null);
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
    assert.equal(reads, 1); assert.equal(container.querySelector('form'), null);
    await click('[data-tool-edit="contact_widget"]'); await input('[name="title"]', "Başka başlık"); await click('[data-tool-cancel]'); await click('[data-tool-discard]');
    await click('[data-tool-edit="contact_widget"]'); assert.equal(container.querySelector('[name="title"]').value, "Kaydedilen başlık");
    await input('[name="title"]', "Son başlık"); await submit(); assert.equal(calls[1][1].expectedVersion, 4);
  });
});

test("conflict blocks repeat apply and failed explicit reload preserves draft until a successful reload", async () => {
  let reads = 0; let saves = 0;
  await screen({ records: async () => { reads += 1; if (reads === 2) throw new ApiError("unavailable"); return [{ ...record, config: { ...config, title: reads > 2 ? "Güncel başlık" : config.title }, version: reads > 2 ? 8 : 3 }]; }, save: async () => { saves += 1; throw new ApiError("version_conflict"); } }, async ({ container, click, input, submit }: any) => {
    await click('[data-tool-edit="contact_widget"]'); await input('[name="title"]', "Benim taslağım"); await submit(); await submit();
    assert.equal(saves, 1); assert.equal(container.querySelector('[name="title"]').value, "Benim taslağım");
    await click('[data-tool-reload]'); await click('[data-tool-discard]'); assert.equal(container.querySelector('[name="title"]').value, "Benim taslağım");
    await click('[data-tool-reload]'); await click('[data-tool-discard]'); assert.equal(container.querySelector('[name="title"]').value, "Güncel başlık");
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

test("reordering active channels preserves disabled channel positions and saved values", async () => {
  const calls: any[] = [];
  const mixedRecord = { ...record, config: { ...config, channels: [
    config.channels[0],
    { type: "email", enabled: false, label: "Korunan e-posta", value: "saved@example.test" },
    config.channels[1],
    { type: "instagram", enabled: true, label: "Instagram", value: "magazam" },
  ] } };
  await screen({ records: async () => [mixedRecord], save: async (...args) => { calls.push(args); return { id: ID, kind: "contact_widget", status: "active", version: 4, updatedAt: NOW, replayed: false }; } }, async ({ container, click, submit }: any) => {
    await click('[data-tool-edit="contact_widget"]');
    assert.ok(container.querySelector('[data-tool-preview] button[data-preview-channel="whatsapp"]'));
    assert.equal(container.querySelector('[data-tool-preview] button[data-preview-channel="email"]'), null);
    await click('[data-channel-up="phone"]'); await submit();
    assert.deepEqual(calls[0][1].config.channels.slice(0, 4).map((channel: any) => channel.type), ["phone", "email", "whatsapp", "instagram"]);
    assert.deepEqual(calls[0][1].config.channels[1], { type: "email", enabled: false, label: "Korunan e-posta", value: "saved@example.test" });
    assert.equal(calls[0][1].config.channels[0].value, "+905551112234");
    assert.equal(calls[0][1].config.channels[2].value, "+905551112233");
  });
});

test("hours devices page choices and appearance are carried in one apply", async () => {
  const calls: any[] = [];
  await screen({ save: async (...args) => { calls.push(args); return { id: ID, kind: "contact_widget", status: "active", version: 4, updatedAt: NOW, replayed: false }; } }, async ({ click, input, submit }: any) => {
    await click('[data-tool-edit="contact_widget"]'); await click('[data-tool-tab="appearance"]');
    await click('[data-position-choice="bottom-left"]'); await click('[data-theme-choice="dark"]');
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

test("Escape asks before leaving a dirty editor and preview actions cannot navigate", async () => {
  await screen({}, async ({ browser, container, click, input }: any) => {
    await click('[data-tool-edit="contact_widget"]'); await input('[name="title"]', "Değişen başlık");
    await act(async () => container.querySelector('[data-preview-channel]').click());
    assert.equal(container.querySelectorAll('[data-tool-preview] a').length, 0);
    assert.equal(browser.location.pathname, "/settings/store-tools");
    const field = container.querySelector('[name="title"]');
    await act(async () => { field.focus(); field.dispatchEvent(new browser.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    assert.ok(container.querySelector('dialog[open]'));
    assert.equal(container.querySelector('[name="title"]').value, "Değişen başlık");
    await click('[data-tool-keep-editing]');
    assert.equal(container.querySelector('dialog[open]'), null);
    assert.equal(container.querySelector('[name="title"]').value, "Değişen başlık");
    await click('[data-tool-cancel]'); await click('[data-tool-discard]');
    assert.equal(container.querySelector('form'), null);
  });
});

test("dirty contact page preview cannot open the settings discard guard or navigate", async () => {
  await screen({ workspace: true }, async ({ browser, container, click, input, addChannel, pushes }: any) => {
    await click('[data-tool-edit="contact_widget"]'); await input('[name="title"]', "Kaydedilmemiş başlık");
    await addChannel("contact_page"); await input('#channel-value-contact_page', "page:82000000-0000-4000-8000-000000000001");
    const action = [...container.querySelectorAll('[data-tool-preview] a,[data-tool-preview] button')].find((element: any) => element.textContent.includes("İletişim sayfası")) as any;
    assert.ok(action);
    await act(async () => action.click());
    assert.equal(container.querySelector("dialog")?.open ?? false, false);
    await act(async () => action.dispatchEvent(new browser.MouseEvent("click", { button: 1, bubbles: true, cancelable: true })));
    assert.equal(container.querySelector("dialog")?.open ?? false, false); assert.deepEqual(pushes, []);
    assert.equal(action.hasAttribute("href"), false); assert.equal(action.type, "button");
  });
});

test("settings navigation preserves a dirty draft until the user explicitly chooses to leave", async () => {
  let saves = 0;
  await screen({ workspace: true, save: async () => { saves += 1; throw new Error("navigation must not save"); } }, async ({ container, click, input, pushes }: any) => {
    await click('[data-tool-edit="contact_widget"]'); await input('[name="title"]', "Korunan taslak");
    await click('a[href="/settings"]');
    const guard = container.querySelector('dialog[aria-labelledby="settings-discard-title"]');
    assert.ok(guard?.open);
    assert.equal(container.querySelector('[name="title"]').value, "Korunan taslak");
    assert.deepEqual(pushes, []);
    await click('dialog[aria-labelledby="settings-discard-title"] button');
    assert.equal(container.querySelector('dialog[aria-labelledby="settings-discard-title"]'), null);
    assert.equal(container.querySelector('[name="title"]').value, "Korunan taslak");
    await click('a[href="/settings"]');
    await click('dialog[aria-labelledby="settings-discard-title"] button:last-child');
    assert.deepEqual(pushes, ["/settings"]);
    assert.equal(saves, 0);
  });
});

test("dirty cancel keeps the entered draft until the user explicitly discards it", async () => {
  await screen({}, async ({ container, click, input }: any) => {
    await click('[data-tool-edit="contact_widget"]');
    await input('[name="title"]', "Kaybedilmemesi gereken başlık");
    await click('[data-tool-cancel]');
    assert.equal(container.querySelector('[name="title"]')?.value, "Kaybedilmemesi gereken başlık", "cancel must ask before discarding the draft");
    assert.ok(container.querySelector('dialog[open]'), "a discard decision must be visible");
  });
});

test("invalid disabled channel opens its correction field without enabling the channel", async () => {
  const calls: any[] = [];
  await screen({ save: async (...args) => { calls.push(args); return { id: ID, kind: "contact_widget", status: "active", version: 4, updatedAt: NOW, replayed: false }; } }, async ({ browser, container, click, input, submit, openChannel }: any) => {
    await click('[data-tool-edit="contact_widget"]');
    await openChannel("whatsapp");
    await input('[name="channel-value-whatsapp"]', "telefon-değil");
    await click('[data-channel-remove="whatsapp"]');
    await click('[data-tool-tab="appearance"]');
    await submit();
    assert.equal(calls.length, 0);
    assert.equal(container.querySelector('[data-tool-tab="content"]').getAttribute("aria-selected"), "true", "the affected channel must be revealed");
    const field = container.querySelector('[name="channel-value-whatsapp"]');
    assert.equal(field.closest('[hidden]'), null);
    assert.equal(browser.document.activeElement, field);
    await input('[name="channel-value-whatsapp"]', "0555 111 22 33");
    await submit();
    assert.equal(calls.length, 1);
    const saved = calls[0][1].config.channels.find((channel: any) => channel.type === "whatsapp");
    assert.equal(saved.enabled, false);
    assert.equal(saved.value, "+905551112233");
  });
});

test("invalid hidden hours are revealed for correction while working-hours visibility stays off", async () => {
  const calls: any[] = [];
  await screen({ save: async (...args) => { calls.push(args); return { id: ID, kind: "contact_widget", status: "active", version: 4, updatedAt: NOW, replayed: false }; } }, async ({ browser, container, click, input, submit }: any) => {
    await click('[data-tool-edit="contact_widget"]');
    await click('[data-tool-tab="visibility"]'); await click('[name="hours-enabled"]');
    await input('[name="opensAt"]', "18:00"); await click('[name="hours-enabled"]');
    await click('[data-tool-tab="appearance"]'); await submit();
    assert.equal(calls.length, 0);
    assert.equal(container.querySelector('[data-tool-tab="visibility"]').getAttribute("aria-selected"), "true", "the hidden invalid range must be revealed");
    const field = container.querySelector('[name="opensAt"]');
    assert.equal(field.closest('[hidden]'), null);
    assert.equal(browser.document.activeElement, field);
    assert.equal(container.querySelector('[name="hours-enabled"]').checked, false);
    await input('[name="opensAt"]', "10:00"); await submit();
    assert.equal(calls.length, 1);
    assert.equal(calls[0][1].config.hours.enabled, false);
    assert.equal(calls[0][1].config.hours.opensAt, "10:00");
  });
});

test("contact-page choices expose published default-language names and save the hidden canonical target", async () => {
  const calls: any[] = [];
  const pages = [
    pageRecord,
    { ...pageRecord, id: "82000000-0000-4000-8000-000000000002", name: "English contact", config: { ...pageRecord.config, slug: "english-contact", locale: "en" } },
    { ...pageRecord, id: "82000000-0000-4000-8000-000000000003", name: "Yayımlanmamış sayfa", config: { ...pageRecord.config, slug: "taslak", published: false } },
    { ...pageRecord, id: "82000000-0000-4000-8000-000000000004", name: "Taslak kayıt", status: "draft", config: { ...pageRecord.config, slug: "taslak-kayit" } },
    { ...pageRecord, id: "82000000-0000-4000-8000-000000000005", name: "Eski dil alanı olmayan sayfa", config: { slug: "eski-iletisim", body: "Eski örnek", published: true } },
  ];
  await screen({ pageRecords: async () => pages, save: async (...args) => { calls.push(args); return { id: ID, kind: "contact_widget", status: "active", version: 4, updatedAt: NOW, replayed: false }; } }, async ({ container, click, input, submit, addChannel }: any) => {
    await click('[data-tool-edit="contact_widget"]'); await addChannel("contact_page");
    const chooser = container.querySelector('#channel-value-contact_page');
    const labels = [...chooser.querySelectorAll("option")].map((option: any) => option.textContent);
    assert.ok(labels.includes("Bize ulaşın"), "the merchant can select the published page by name");
    assert.ok(labels.includes("Eski dil alanı olmayan sayfa"));
    assert.equal(labels.includes("English contact"), false);
    assert.equal(labels.includes("Yayımlanmamış sayfa"), false);
    assert.equal(labels.includes("Taslak kayıt"), false);
    assert.doesNotMatch(labels.join(" "), /\/pages\//u);
    await input('#channel-value-contact_page', "page:82000000-0000-4000-8000-000000000001"); await submit();
    assert.equal(calls.length, 1);
    assert.equal(calls[0][1].config.channels.find((channel: any) => channel.type === "contact_page").value, "/pages/iletisim");
  });
});

test("read-only users can expand channel details without changing or saving the settings", async () => {
  let saves = 0;
  await screen({ canManage: false, save: async () => { saves += 1; } }, async ({ container, click, input, submit, openChannel }: any) => {
    await click('[data-tool-edit="contact_widget"]');
    assert.equal(container.querySelector('[data-channel-open="whatsapp"]').disabled, false);
    await openChannel("whatsapp");
    const detail = container.querySelector('[name="channel-value-whatsapp"]');
    assert.equal(detail.closest('[hidden]'), null);
    assert.equal(detail.value, "+905551112233");
    assert.equal(detail.closest("fieldset").disabled, true);
    assert.equal(container.querySelector('[data-channel-remove="whatsapp"]').disabled, true);
    assert.equal(container.querySelector('[data-channel-up="phone"]').disabled, true);
    assert.equal(container.querySelector('[data-tool-add-channel]').disabled, true);
    assert.equal(container.querySelector('[data-tool-apply]'), null);
    await input('[name="channel-value-whatsapp"]', "0555 999 88 77");
    await click('[data-tool-tab="appearance"]'); await click('[data-tool-tab="content"]');
    assert.equal(container.querySelector('[name="channel-value-whatsapp"]').value, "+905551112233");
    await submit(); assert.equal(saves, 0);
    await click('[data-channel-done="whatsapp"]');
    assert.equal(container.querySelector('[data-channel-open="whatsapp"]').getAttribute("aria-expanded"), "false");
  });
});

test("an unavailable saved page stays hidden from labels and is preserved when its channel is disabled", async () => {
  const calls: any[] = [];
  const saved = { ...record, config: { ...config, channels: [...config.channels, { type: "contact_page", enabled: true, label: "İletişim sayfası", value: "/pages/artik-yayinda-degil" }] } };
  await screen({ records: async () => [saved], pageRecords: async () => [pageRecord], save: async (...args) => { calls.push(args); return { id: ID, kind: "contact_widget", status: "active", version: 4, updatedAt: NOW, replayed: false }; } }, async ({ container, click, input, submit, openChannel }: any) => {
    await click('[data-tool-edit="contact_widget"]'); await openChannel("contact_page");
    const chooser = container.querySelector('#channel-value-contact_page');
    assert.doesNotMatch(chooser.selectedOptions[0].textContent, /\/pages\//u);
    assert.doesNotMatch(container.textContent, /\/pages\/artik-yayinda-degil/u);
    await input('[name="title"]', "Güncellenen başlık"); await submit();
    assert.equal(calls.length, 0, "a missing published page must be corrected before saving an enabled channel");
    assert.ok(container.querySelector('[role="alert"]'));
    await click('[data-channel-remove="contact_page"]'); await submit();
    assert.equal(calls.length, 1);
    const channel = calls[0][1].config.channels.find((item: any) => item.type === "contact_page");
    assert.equal(channel.enabled, false);
    assert.equal(channel.value, "/pages/artik-yayinda-degil", "disabling a channel must retain its original target");
  });
});

test("loading failure exposes only retry and does not permit a settings mutation", async () => {
  let reads = 0; const calls: any[] = [];
  await screen({ records: async () => { reads += 1; if (reads === 1) throw new ApiError("unavailable"); return [record]; }, save: async (...args) => { calls.push(args); return { id: ID, kind: "contact_widget", status: "active", version: 4, updatedAt: NOW, replayed: false }; } }, async ({ container, click, submit }: any) => {
    assert.ok(container.querySelector('[role="alert"]'));
    assert.equal(container.querySelector('[data-tool-edit="contact_widget"]'), null);
    assert.equal(container.querySelector('[name="enabled"]')?.disabled ?? true, true);
    assert.equal(container.querySelector('[data-tool-apply]')?.disabled ?? true, true);
    assert.equal(calls.length, 0);
    await click("button");
    await click('[data-tool-edit="contact_widget"]'); await click('[name="enabled"]'); await submit();
    assert.equal(reads, 2);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][1].expectedVersion, 3);
    assert.equal(calls[0][1].config.enabled, false);
  });
});

test("initial loading cannot open an editor or save defaults over the stored configuration", async () => {
  let finishRead!: (value: any[]) => void;
  const pendingRead = new Promise<any[]>(resolve => { finishRead = resolve; });
  let saves = 0;
  await screen({ records: () => pendingRead, save: async () => { saves += 1; throw new Error("must not save while loading"); } }, async ({ container, click, settle }: any) => {
    assert.match(container.querySelector('[role="status"]').textContent, /yükleniyor/);
    assert.equal(container.querySelector('[data-tool-edit]'), null);
    assert.equal(container.querySelector('[name="enabled"]'), null);
    assert.equal(container.querySelector('[data-tool-apply]'), null);
    assert.equal(container.querySelector('form'), null);
    assert.equal(saves, 0);
    await act(async () => finishRead([record])); await settle();
    await click('[data-tool-edit="contact_widget"]');
    assert.equal(container.querySelector('[name="title"]').value, config.title);
    assert.equal(container.querySelector('[name="enabled"]').checked, config.enabled);
    assert.equal(saves, 0);
  });
});

test("named page choices follow a non-Turkish default locale rather than the panel language", async () => {
  const englishPage = { ...pageRecord, id: "82000000-0000-4000-8000-000000000002", name: "Contact us", config: { ...pageRecord.config, slug: "contact", locale: "en" } };
  const calls: any[] = [];
  await screen({
    pageRecords: async () => [pageRecord, englishPage],
    languageRecords: async () => [{ ...languageRecord, config: { ...languageRecord.config, defaultLocale: "en" } }],
    save: async (...args) => { calls.push(args); return { id: ID, kind: "contact_widget", status: "active", version: 4, updatedAt: NOW, replayed: false }; },
  }, async ({ container, click, addChannel, input, submit }: any) => {
    await click('[data-tool-edit="contact_widget"]'); await addChannel("contact_page");
    const field = container.querySelector('#channel-value-contact_page');
    const labels = [...field.options].map((option: any) => option.textContent);
    assert.ok(labels.includes("Contact us"));
    assert.ok(!labels.includes("Bize ulaşın"));
    await input('#channel-value-contact_page', `page:${englishPage.id}`); await submit();
    assert.equal(calls.length, 1);
    assert.equal(calls[0][1].config.channels.find((channel: any) => channel.type === "contact_page").value, "/pages/contact");
  });
});

test("all nine configured channels preview in saved order without links or navigation", async () => {
  const all = { ...record, config: { ...config, channels: [
    { type: "whatsapp", enabled: true, label: "WhatsApp", value: "+905551112233" },
    { type: "phone", enabled: true, label: "Telefon", value: "+905551112234" },
    { type: "sms", enabled: true, label: "SMS", value: "+905551112235" },
    { type: "email", enabled: true, label: "E-posta", value: "support@example.test" },
    { type: "instagram", enabled: true, label: "Instagram", value: "magazam" },
    { type: "telegram", enabled: true, label: "Telegram", value: "magazam" },
    { type: "messenger", enabled: true, label: "Messenger", value: "magazam" },
    { type: "maps", enabled: true, label: "Yol tarifi", value: "Kadıköy İstanbul" },
    { type: "contact_page", enabled: true, label: "İletişim sayfası", value: "/pages/iletisim" },
  ] } };
  await screen({ workspace: true, records: async () => [all] }, async ({ browser, container, click, input, pushes }: any) => {
    await click('[data-tool-edit="contact_widget"]'); await input('[name="title"]', "Kaydedilmemiş örnek");
    const actions = [...container.querySelectorAll('[data-tool-preview] [data-preview-channel]')] as any[];
    assert.deepEqual(actions.map(action => action.dataset.previewChannel), ["whatsapp", "phone", "sms", "email", "instagram", "telegram", "messenger", "maps", "contact_page"]);
    for (const action of actions) {
      assert.equal(action.type, "button"); assert.equal(action.hasAttribute("href"), false); assert.equal(action.hasAttribute("title"), false);
      await act(async () => { action.click(); action.dispatchEvent(new browser.MouseEvent("click", { button: 1, bubbles: true, cancelable: true })); });
    }
    assert.deepEqual(pushes, []);
    assert.equal(browser.location.pathname, "/settings/store-tools");
    assert.equal(container.querySelector("dialog")?.open ?? false, false);
    assert.equal(container.querySelector('[name="title"]').value, "Kaydedilmemiş örnek");
  });
});

test("keyboard tab switching and boundary reordering keep focus on visible controls", async () => {
  await screen({}, async ({ browser, container, click, input, addChannel }: any) => {
    await click('[data-tool-edit="contact_widget"]');
    const content = container.querySelector('[data-tool-tab="content"]');
    await act(async () => { content.focus(); content.dispatchEvent(new browser.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true })); });
    assert.equal(container.querySelector('[data-tool-tab="appearance"]').getAttribute("aria-selected"), "true");
    assert.equal(browser.document.activeElement, container.querySelector('[data-tool-tab="appearance"]'));
    await act(async () => browser.document.activeElement.dispatchEvent(new browser.KeyboardEvent("keydown", { key: "Home", bubbles: true, cancelable: true })));
    assert.equal(browser.document.activeElement, content);
    await addChannel("sms"); await input('[name="channel-value-sms"]', "0555 111 22 35");
    const appearance = container.querySelector('[data-tool-tab="appearance"]');
    await act(async () => { appearance.focus(); appearance.click(); });
    assert.equal(browser.document.activeElement, appearance, "a previous correction target must not pull focus into a hidden tab");
    await click('[data-tool-tab="content"]'); await click('[data-channel-up="phone"]');
    assert.equal(browser.document.activeElement, container.querySelector('[data-channel-open="phone"]'));
    assert.equal(container.querySelector('[data-channel-up="phone"]').disabled, true);
    const grip = container.querySelector('[data-channel-drag="phone"]');
    await act(async () => { grip.focus(); grip.dispatchEvent(new browser.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true })); });
    assert.equal(browser.document.activeElement, container.querySelector('[data-channel-open="phone"]'));
    assert.deepEqual([...container.querySelectorAll('[data-channel-row]')].map((row: any) => row.dataset.channelRow), ["whatsapp", "phone", "sms"]);
  });
});
