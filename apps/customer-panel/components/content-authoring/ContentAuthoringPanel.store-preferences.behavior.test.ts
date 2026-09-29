import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as React from "react";
import { act, createElement } from "react";
import * as jsx from "react/jsx-runtime";
import { Window } from "happy-dom";
import ts from "typescript";
import { createMerchantAdminApi } from "../../lib/merchant-admin-ui/client.ts";
import * as preferences from "../../lib/content-authoring-ui/store-writing-preferences.ts";
import * as state from "../../lib/content-authoring-ui/state.ts";
import * as client from "../../lib/content-authoring-ui/client.ts";
import * as render from "../../lib/server-content-authoring/render.ts";
const draftId = "10000000-0000-4000-8000-000000000001";
const setting = (config: unknown, status = "active") => ({ id: draftId, kind: "ai_setting", name: "Yazım", config, status, version: 1, createdAt: "2026-09-29T00:00:00.000Z", updatedAt: "2026-09-29T00:00:00.000Z" });
const features = { enabledFeatures: ["description_suggestions", "seo_suggestions"] };
async function withPanel(verify: (h: { container: HTMLElement; requests: any[]; reads: any[]; resolve(index: number, rows: unknown[]): Promise<void>; reject(index: number): Promise<void>; context(store: string, product: string | null): Promise<void>; choose(label: string, value: string): Promise<void>; click(text: string): Promise<void> }) => Promise<void>) {
 const browser = new Window({ url: "https://panel.fixture.test/products/new" });
 const old = new Map<string, PropertyDescriptor | undefined>();
 for (const [key, value] of Object.entries({ window: browser, document: browser.document, navigator: browser.navigator, HTMLElement: browser.HTMLElement, Event: browser.Event, IS_REACT_ACT_ENVIRONMENT: true })) { old.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value }); }
 let store = "current-store", product: string | null = null;
 const reads: any[] = [], requests: any[] = [], pending: { resolve(value: Response): void; reject(error: Error): void }[] = [];
 const api = createMerchantAdminApi(async (url, init) => { reads.push({ url: String(url), init }); return new Promise<Response>((resolve, reject) => pending.push({ resolve, reject })); });
 const authoring = client.createContentAuthoringClient(async (_url, init) => {
  const request = JSON.parse(String(init?.body)); requests.push(request);
  return Response.json({ generation: { id: "20000000-0000-4000-8000-000000000001", draftId: request.draftId, productId: request.productId, status: "completed", draft: { description: [{ type: "paragraph", children: [{ type: "text", text: "Generated" }] }], suggestions: [], claims: [], sourceFingerprint: "a".repeat(64) }, sourceFingerprint: "a".repeat(64), usage: null, safeCode: null, createdAt: "2026-09-29T00:00:00.000Z", updatedAt: "2026-09-29T00:00:00.000Z", finishedAt: "2026-09-29T00:00:00.000Z" } });
 });
 const imports: Record<string, unknown> = { "@/components/panel/PanelLayoutClient": { usePanelChromeModel: () => ({ activeStoreSelectionKey: store }) }, "@/lib/content-authoring-ui/store-writing-preferences": preferences, "@/lib/content-authoring-ui/client": client, "@/lib/content-authoring-ui/state": state, "@/lib/server-content-authoring/render": render };
 const source = await readFile(new URL("./ContentAuthoringPanel.tsx", import.meta.url), "utf8");
 const output = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
 const module = { exports: {} as Record<string, any> };
 Function("require", "module", "exports", output)((name: string) => name === "react" ? React : name === "react/jsx-runtime" ? jsx : name.endsWith(".css") ? { default: {} } : imports[name], module, module.exports);
 const container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as never);
 const bridge = { capture: () => ({ request: { draftId, productId: product, productVersion: product ? 1 : null, profileVersion: product ? 1 : null, currentDraft: { title: "Current", description: "Manual" }, action: "improve", fields: ["description"], locale: "tr-TR", tone: "neutral", length: "medium", note: "", selection: null }, lifecycle: { sessionId: "session", draftRevision: "revision", selection: null } }), apply: () => { container.dataset.applied = "true"; return true; } };
 const { createRoot } = await import("react-dom/client"); const root = createRoot(container);
 const mount = () => root.render(createElement("form", { onChange: () => { container.dataset.dirty = "true"; } }, createElement(module.exports.ContentAuthoringPanel, { bridge, api: authoring, preferencesApi: api, onClose() {} })));
 const button = (text: string) => { const found = [...container.querySelectorAll("button")].find(value => value.textContent === text); assert.ok(found, text); return found; };
 try {
  await act(async () => mount());
  await verify({ container, reads, requests, resolve: async (index, rows) => { await act(async () => pending[index].resolve(Response.json({ items: rows }))); }, reject: async index => { await act(async () => pending[index].reject(new Error("unavailable"))); }, context: async (nextStore, nextProduct) => { store = nextStore; product = nextProduct; await act(async () => mount()); }, choose: async (label, value) => { const found = [...container.querySelectorAll("label")].find(row => row.textContent?.startsWith(label)); assert.ok(found, label); const select = found.querySelector("select")!; await act(async () => { select.value = value; select.dispatchEvent(new browser.Event("change", { bubbles: true }) as unknown as Event); }); }, click: async text => { await act(async () => button(text).click()); } });
 } finally { await act(async () => root.unmount()); for (const [key, value] of old) value ? Object.defineProperty(globalThis, key, value) : Reflect.deleteProperty(globalThis, key); await browser.happyDOM.close(); }
}
const selected = (container: HTMLElement, label: string) => [...container.querySelectorAll("label")].find(row => row.textContent?.startsWith(label))!.querySelector("select")!.value;

test("actual safe settings read gates first generation and hydrates saved locale/tone without dirtying manual fields", async () => withPanel(async h => {
 assert.equal(h.reads.length, 1); assert.equal(h.reads[0].url, "/api/merchant-admin/records/ai_setting"); assert.equal(h.reads[0].init.credentials, "same-origin"); assert.equal(h.reads[0].init.cache, "no-store");
 await h.click("İçerik oluştur"); assert.equal(h.requests.length, 0); assert.match(h.container.textContent ?? "", /Yazım ayarları yükleniyor/);
 await h.resolve(0, [setting({ ...features, locale: "en", tone: "Samimi" })]);
 assert.equal(selected(h.container, "Dil"), "en"); assert.equal(selected(h.container, "Ton"), "friendly"); assert.equal(h.container.dataset.dirty, undefined);
 await h.click("İçerik oluştur"); assert.equal(h.requests[0].locale, "en"); assert.equal(h.requests[0].tone, "friendly"); assert.equal(h.container.dataset.dirty, undefined);
}));
test("late custom preference cannot replace explicit choices; store tone is visible and exact, manual presets clear it", async () => withPanel(async h => {
 await h.choose("Ton", "professional"); await h.choose("Dil", "en");
 const voice = "Kısa, sakin ve ayrıntılara sadık"; await h.resolve(0, [setting({ ...features, locale: "de-DE", tone: voice })]);
 assert.equal(selected(h.container, "Ton"), "professional"); assert.equal(selected(h.container, "Dil"), "en"); assert.match(h.container.textContent ?? "", /Mağaza tonu/);
 await h.click("İçerik oluştur"); assert.equal(h.requests[0].tone, "professional"); assert.equal(h.requests[0].brandVoice, null);
 await h.choose("Ton", "store"); await h.click("İçerik oluştur"); assert.equal(h.requests[1].tone, "neutral"); assert.equal(h.requests[1].brandVoice, voice);
 await h.choose("Ton", "friendly"); await h.click("İçerik oluştur"); assert.equal(h.requests[2].brandVoice, null); assert.equal(h.container.dataset.dirty, undefined);
}));
test("store/product switches ignore former reads and reset inherited choices; read error requires explicit choices or retry", async () => withPanel(async h => {
 await h.context("other-store", null); assert.equal(h.reads.length, 2);
 await h.resolve(0, [setting({ ...features, locale: "de-DE", tone: "Old store style" })]); assert.equal(selected(h.container, "Dil"), "tr-TR");
 await h.resolve(1, []); await h.click("İçerik oluştur"); assert.equal(h.requests[0].locale, "tr-TR");
 await h.context("other-store", "30000000-0000-4000-8000-000000000001"); assert.equal(h.reads.length, 3); assert.doesNotMatch(h.container.textContent ?? "", /AI içerik önizlemesi/);
 await h.reject(2); assert.match(h.container.textContent ?? "", /Yazım ayarları yüklenemedi/); await h.click("İçerik oluştur"); assert.equal(h.requests.length, 1);
 await h.choose("Ton", "neutral"); await h.choose("Dil", "en"); await h.click("İçerik oluştur"); assert.equal(h.requests[1].locale, "en"); assert.equal(h.requests[1].productId, "30000000-0000-4000-8000-000000000001"); assert.equal(h.container.dataset.dirty, undefined);
}));
test("saved extra locale and custom tone hydrate truthfully; a changed default context hides prior output", async () => withPanel(async h => {
 const voice = "Ürün ayrıntılarına odaklan"; await h.resolve(0, [setting({ ...features, locale: "de-DE", tone: voice })]); assert.equal(selected(h.container, "Dil"), "de-DE"); assert.equal(selected(h.container, "Ton"), "store"); assert.match(h.container.textContent ?? "", /Ürün ayrıntılarına odaklan/);
 await h.click("İçerik oluştur"); assert.equal(h.requests[0].locale, "de-DE"); assert.equal(h.requests[0].brandVoice, voice);
 await h.context("new-store", null); assert.equal(h.container.querySelector('[aria-label="AI içerik önizlemesi"]'), null); assert.equal(selected(h.container, "Ton"), "neutral");
}));
for (const voice of ["constructor", "__proto__"]) test(`saved prototype-name voice ${voice} is visible and reaches the strict generation request exactly`, async () => withPanel(async h => {
 await h.resolve(0, [setting({ ...features, locale: "en", tone: voice })]);
 assert.equal(selected(h.container, "Ton"), "store"); assert.equal(h.container.querySelector("small")?.textContent, voice);
 await h.click("İçerik oluştur"); assert.equal(h.requests.length, 1); assert.equal(h.requests[0].tone, "neutral"); assert.equal(h.requests[0].brandVoice, voice); assert.equal(h.container.dataset.dirty, undefined);
}));
for (const rows of [[setting(features, "draft")], [setting(features), setting(features)], [setting({ ...features, tone: "<b>bad</b>" })]]) test("inactive or malformed preferences never silently generate with fallback defaults: " + JSON.stringify(rows), async () => withPanel(async h => { await h.resolve(0, rows); assert.match(h.container.textContent ?? "", /Yazım ayarları yüklenemedi/); await h.click("İçerik oluştur"); assert.equal(h.requests.length, 0); assert.equal(h.container.dataset.dirty, undefined); }));


test("retry is a fresh read and retains deliberately selected locale and exact store voice",async()=>withPanel(async h=>{
 const original="Sade mağaza üslubu";await h.resolve(0,[setting({...features,tone:original,locale:"de-DE"})]);await h.choose("Ton","store");await h.choose("Dil","en");
 await h.click("İçerik oluştur");assert.equal(h.requests[0].brandVoice,original);
 // Changing context exercises the public retry after a failed new bootstrap.
 await h.context("retry-store",null);await h.reject(1);await h.click("Yazım ayarlarını yeniden yükle");assert.equal(h.reads.length,3);await h.choose("Ton","professional");await h.choose("Dil","en");await h.resolve(2,[setting({...features,tone:"A different saved voice",locale:"fr-FR"})]);
 assert.equal(selected(h.container,"Ton"),"professional");assert.equal(selected(h.container,"Dil"),"en");await h.click("İçerik oluştur");assert.equal(h.requests[1].brandVoice,null);assert.equal(h.container.dataset.dirty,undefined);
}));
