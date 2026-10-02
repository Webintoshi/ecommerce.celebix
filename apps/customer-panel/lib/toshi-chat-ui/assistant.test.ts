import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import * as React from "react";
import { act, createElement } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { Window } from "happy-dom";
import ts from "typescript";
import { ToshiChatApiError, type ToshiChatApi } from "./client.ts";

const FILE = new URL("../../components/toshi/ToshiAssistant.tsx", import.meta.url);
const ID = "11111111-1111-4111-8111-111111111111";
const MSG = "22222222-2222-4222-8222-222222222222";
const NOW = "2026-09-26T12:00:00.000Z";
const summary = { id: ID, title: "Mağaza özeti", provider: "deepseek" as const, model: "deepseek-flash", version: 2, createdAt: NOW, updatedAt: NOW };
const conversation = { ...summary, messages: [{ id: MSG, role: "assistant" as const, text: "2 bekleyen sipariş var.", sources: [{ label: "Siparişler", href: "/orders" }], createdAt: NOW }] };
type Api = Pick<ToshiChatApi, "list" | "get" | "send">;
function hiddenOrInert(element: Element | null): boolean {
  for (let current = element; current; current = current.parentElement) {
    if (current.hasAttribute("hidden") || current.hasAttribute("inert")) return true;
  }
  return false;
}
function namedButton(container: HTMLElement, label: string) { return [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.getAttribute("aria-label") === label || button.textContent === label); }
const list = async () => ({ conversations: [], defaultProvider: { provider: "deepseek" as const, model: "deepseek-flash" } });

async function withAssistant(api: Api, verify: (container: HTMLElement, browser: Window, unmount: () => Promise<void>) => Promise<void>, localExecute?: (intent: unknown) => Promise<{ text: string; sources: [] }>, mode: "page" | "drawer" = "page") {
  const browser = new Window({ url: "https://panel.example.test/toshi" });
  const globals = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ window: browser, document: browser.document, navigator: browser.navigator, HTMLElement: browser.HTMLElement, HTMLInputElement: browser.HTMLInputElement, HTMLTextAreaElement: browser.HTMLTextAreaElement, HTMLSelectElement: browser.HTMLSelectElement, Event: browser.Event, MouseEvent: browser.MouseEvent, KeyboardEvent: browser.KeyboardEvent, IS_REACT_ACT_ENVIRONMENT: true })) {
    globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const packageRequire = createRequire(import.meta.url);
  const modules = new Map<string, { exports: Record<string, unknown> }>();
  function loadTsModule(file: URL): Record<string, unknown> {
    const cached = modules.get(file.href);
    if (cached) return cached.exports;
    const compiled: { exports: Record<string, unknown> } = { exports: {} };
    modules.set(file.href, compiled);
    const output = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    Function("require", "module", "exports", output)((name: string) => {
      if (name === "react") return React;
      if (name === "react/jsx-runtime") return jsxRuntime;
      if (name === "lucide-react") return new Proxy({}, { get: () => () => createElement("svg", { "aria-hidden": true }) });
      if (name === "next/link") return ({ children, ...props }: Record<string, unknown>) => createElement("a", props, children as React.ReactNode);
      if (name === "next/image") return ({ unoptimized: _unoptimized, priority: _priority, ...props }: Record<string, unknown>) => createElement("img", props);
      if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) };
      if (name === "@/lib/toshi-chat-ui/client") return { createToshiChatApi: () => api, ToshiChatApiError };
      if (name === "@/lib/toshi-local/client") return { createToshiLocalClient: () => ({ execute: localExecute ?? (async () => ({ text: "Yerel yanıt", sources: [] })) }) };
      if (name === "@/lib/toshi-local/intent") return { parseToshiLocalIntent: (command: string) => ({ command }) };
      if (name === "@celebix/saas-contracts") return { TOSHI_PROVIDER_LABELS: { deepseek: "DeepSeek", openai: "OpenAI", gemini: "Google Gemini", anthropic: "Anthropic Claude" } };
      if (name === "markdown-it") return packageRequire(name);
      // Render local children and their parser rather than mocking away message safety.
      if (name.startsWith(".") || name.startsWith("@/lib/toshi-chat-ui/")) {
        const target = name.startsWith("@/") ? new URL(`./${name.slice("@/lib/toshi-chat-ui/".length)}`, import.meta.url) : new URL(name, file);
        const source = [target, new URL(`${target.href}.tsx`), new URL(`${target.href}.ts`)].find((candidate) => existsSync(candidate));
        if (source) return loadTsModule(source);
      }
      throw Error(`unexpected_import:${name}`);
    }, compiled, compiled.exports);
    return compiled.exports;
  }
  const compiled = { exports: loadTsModule(FILE) };
  const { createRoot } = await import("react-dom/client");
  const container = browser.document.createElement("div");
  browser.document.body.append(container);
  const root = createRoot(container as unknown as Parameters<typeof createRoot>[0]);
  let live = true;
  const unmount = async () => { if (live) { live = false; await act(async () => root.unmount()); } };
  try {
    await act(async () => root.render(createElement(compiled.exports.ToshiAssistant as React.ComponentType<{ mode: "page" | "drawer" }>, { mode })));
    await verify(container as unknown as HTMLElement, browser, unmount);
  } finally {
    await unmount();
    for (const [key, descriptor] of globals) descriptor ? Object.defineProperty(globalThis, key, descriptor) : Reflect.deleteProperty(globalThis, key);
    await browser.happyDOM.close();
  }
}

async function type(container: HTMLElement, browser: Window, value: string) {
  const input = container.querySelector<HTMLInputElement | HTMLTextAreaElement>('[name="command"]')!;
  assert.ok(input);
  await act(async () => {
    const prototype = input.tagName === "TEXTAREA" ? browser.HTMLTextAreaElement.prototype : browser.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new browser.Event("input", { bubbles: true }) as unknown as Event);
  });
}
function submit(container: HTMLElement, browser: Window) { container.querySelector("form")!.dispatchEvent(new browser.Event("submit", { bubbles: true, cancelable: true }) as unknown as Event); }

test("real Toshi UI loads durable history and pinned model then sends natural-language follow-up", async () => {
  const calls: unknown[] = [];
  const api: Api = { list: async () => ({ conversations: [summary], defaultProvider: { provider: "openai", model: "gpt-4.1-mini" } }), get: async (id) => { calls.push(["get", id]); return conversation; }, send: async (input, op) => { calls.push(["send", input, op]); return { ...conversation, version: 3, messages: [...conversation.messages, { id: "33333333-3333-4333-8333-333333333333", role: "assistant", text: "# Özet\n**Gerçek yanıt**\n\n<script>unsafe()</script>\n<img src=x onerror=unsafe()>\n<iframe src=https://tracker.example></iframe>\n\n![izleme](https://tracker.example/pixel)\n[Çalıştır](javascript:unsafe())", sources: [], createdAt: NOW }] }; } };
  await withAssistant(api, async (container, browser) => {
    assert.deepEqual(calls, [["get", ID]]);
    assert.match(container.textContent ?? "", /DeepSeek.*deepseek-flash/);
    assert.match(container.textContent ?? "", /2 bekleyen sipariş/);
    assert.equal(container.querySelector('a[href="/orders"]')?.textContent?.includes("Siparişler"), true);
    await type(container, browser, "Bunlardan kaç tanesi bugün geldi?");
    await act(async () => submit(container, browser));
    assert.deepEqual((calls[1] as unknown[])[1], { conversationId: ID, expectedVersion: 2, text: "Bunlardan kaç tanesi bugün geldi?" });
    assert.match(String((calls[1] as unknown[])[2]), /^[0-9a-f-]{36}$/);
    assert.equal(container.querySelector("script"), null);
    assert.match(container.textContent ?? "", /<script>unsafe\(\)<\/script>/);
    const answer = [...container.querySelectorAll('[data-toshi-message-body]')].at(-1);
    assert.ok(answer, "actual message renderer formats the assistant response");
    assert.equal(answer.querySelector("h3")?.textContent, "Özet");
    assert.equal(answer.querySelector("strong")?.textContent, "Gerçek yanıt");
    assert.equal(answer.querySelector("script, img, iframe, a"), null, "response content cannot create active elements or external requests");
    assert.equal(container.querySelector<HTMLInputElement>('[name="command"]')!.value, "");
  });
});

test("real Toshi UI keeps question on quota failure and never silently calls local mode", async () => {
  let local = 0, sends = 0;
  await withAssistant({ list, get: async () => conversation, send: async () => { sends += 1; throw new ToshiChatApiError("quota_exceeded"); } }, async (container, browser) => {
    await type(container, browser, "Mağazamı nasıl geliştirebilirim?");
    await act(async () => submit(container, browser));
    assert.equal(sends, 1); assert.equal(local, 0);
    assert.match(container.querySelector('[role="alert"]')?.textContent ?? "", /bakiye/);
    assert.equal(container.querySelector<HTMLInputElement>('[name="command"]')!.value, "Mağazamı nasıl geliştirebilirim?");
  }, async () => { local += 1; return { text: "Wrong fallback", sources: [] }; });
});

test("real Toshi UI explicitly recovers unknown transport result with exactly the same operation and payload", async () => {
  const calls: Array<[unknown, string]> = [];
  await withAssistant({ list, get: async () => conversation, send: async (input, op) => { calls.push([input, op]); if (calls.length === 1) throw new ToshiChatApiError(); return conversation; } }, async (container, browser) => {
    await type(container, browser, "Bugünkü siparişlerimi özetler misin?");
    await act(async () => submit(container, browser));
    assert.equal(calls.length, 1);
    assert.equal(namedButton(container, "Konuşma geçmişi")?.disabled, true, "unresolved operation locks history switching");
    assert.equal(namedButton(container, "Yeni konuşma")?.disabled, true, "unresolved operation locks starting another conversation");
    assert.equal(namedButton(container, "Soruyu Toshi’ye gönder")?.disabled, true);
    const recover = [...container.querySelectorAll("button")].find((button) => button.textContent === "Yanıtı kontrol et");
    assert.ok(recover);
    await act(async () => recover.click());
    assert.deepEqual(calls[1], calls[0]);
    assert.equal(calls.length, 2);
  });
});

test("real Toshi UI uses explicit local mode only when server has no configured provider", async () => {
  let sends = 0, local = 0;
  await withAssistant({ list: async () => ({ conversations: [], defaultProvider: null }), get: async () => conversation, send: async () => { sends += 1; return conversation; } }, async (container, browser) => {
    assert.match(container.textContent ?? "", /Yerel mod/);
    await type(container, browser, "mağaza özeti");
    await act(async () => submit(container, browser));
    assert.equal(sends, 0); assert.equal(local, 1);
    assert.match(container.textContent ?? "", /Gerçek yerel özet/);
  }, async () => { local += 1; return { text: "Gerçek yerel özet", sources: [] }; });
});

test("real Toshi UI aborts one owned request on stop and unmount, preserves retry identity and rejects duplicate submit", async () => {
  const calls: Array<{ signal?: AbortSignal; op: string }> = [];
  let resolveFirst: ((value: typeof conversation) => void) | undefined;
  let resolveSecond: ((value: typeof conversation) => void) | undefined;
  const first = new Promise<typeof conversation>((done) => { resolveFirst = done; });
  const second = new Promise<typeof conversation>((done) => { resolveSecond = done; });
  await withAssistant({ list, get: async () => conversation, send: async (_input, op, signal) => { calls.push({ signal, op }); return calls.length === 1 ? first : second; } }, async (container, browser, unmount) => {
    await type(container, browser, "Stok durumunu açıkla");
    await act(async () => { submit(container, browser); submit(container, browser); });
    assert.equal(calls.length, 1);
    const stop = [...container.querySelectorAll("button")].find((button) => button.textContent === "Durdur");
    assert.ok(stop);
    await act(async () => stop.click());
    assert.equal(calls[0]?.signal?.aborted, true);
    assert.equal(container.querySelector<HTMLInputElement>('[name="command"]')!.value, "Stok durumunu açıkla");
    const recover = [...container.querySelectorAll("button")].find((button) => button.textContent === "Yanıtı kontrol et")!;
    await act(async () => recover.click());
    assert.equal(calls.length, 2); assert.equal(calls[1]?.op, calls[0]?.op);
    resolveFirst?.(conversation);
    await act(async () => { await first; });
    assert.ok(container.querySelector('[aria-busy="true"]'), "old completion cannot clear a newer pending recovery");
    await unmount();
    assert.equal(calls[1]?.signal?.aborted, true, "unmount aborts the actual active recovery");
    resolveSecond?.(conversation);
    await act(async () => { await second; });
  });
});

test("real Toshi UI starts a new conversation with the latest server default and never persists history in browser storage", async () => {
  const calls: unknown[] = [];
  let listCalls = 0;
  await withAssistant({ list: async () => { listCalls += 1; return { conversations: [summary], defaultProvider: { provider: listCalls === 1 ? "deepseek" : "openai", model: listCalls === 1 ? "deepseek-flash" : "gpt-4.1-mini" } }; }, get: async () => conversation, send: async (input, op) => { calls.push([input, op]); return conversation; } }, async (container, browser) => {
    const start = [...container.querySelectorAll("button")].find((button) => button.textContent === "Yeni konuşma")!;
    await act(async () => start.click());
    assert.match(container.textContent ?? "", /OpenAI.*gpt-4.1-mini/);
    assert.doesNotMatch(container.textContent ?? "", /2 bekleyen sipariş var/);
    await type(container, browser, "Yeni modelle mağaza özeti");
    await act(async () => submit(container, browser));
    assert.deepEqual((calls[0] as unknown[])[0], { conversationId: null, expectedVersion: null, text: "Yeni modelle mağaza özeti" });
    assert.equal(browser.localStorage.length, 0); assert.equal(browser.sessionStorage.length, 0);
  });
});

test("real Toshi UI fails explicitly on capability load denial instead of guessing local mode", async () => {
  let local = 0;
  await withAssistant({ list: async () => { throw new ToshiChatApiError("membership_denied"); }, get: async () => conversation, send: async () => conversation }, async (container, browser) => {
    assert.match(container.querySelector('[role="alert"]')?.textContent ?? "", /yetkiniz yok/);
    assert.equal(container.querySelector<HTMLInputElement>('[name="command"]')!.disabled, true);
    await act(async () => submit(container, browser));
    assert.equal(local, 0);
  }, async () => { local += 1; return { text: "Forbidden", sources: [] }; });
});

test("real Toshi UI resumes a reloaded version-zero conversation after the first generation failed", async () => {
  const empty = { ...conversation, version: 0, messages: [] };
  const calls: unknown[] = [];
  await withAssistant({ list: async () => ({ conversations: [{ ...summary, version: 0 }], defaultProvider: { provider: "deepseek", model: "deepseek-flash" } }), get: async () => empty, send: async (input) => { calls.push(input); return conversation; } }, async (container, browser) => {
    assert.match(container.textContent ?? "", /DeepSeek.*deepseek-flash/);
    await type(container, browser, "İlk yanıt başarısız olduktan sonra yeni soru");
    await act(async () => submit(container, browser));
    assert.deepEqual(calls[0], { conversationId: ID, expectedVersion: 0, text: "İlk yanıt başarısız olduktan sonra yeni soru" });
    assert.match(container.textContent ?? "", /2 bekleyen sipariş var/);
  });
});

test("real Toshi UI unlocks a failed operation replay and requires a fresh explicit submit", async () => {
  const calls: Array<[unknown, string]> = [];
  await withAssistant({ list, get: async () => conversation, send: async (input, op) => {
    calls.push([input, op]);
    if (calls.length === 1) throw new ToshiChatApiError();
    if (calls.length === 2) throw new ToshiChatApiError("operation_failed");
    return conversation;
  } }, async (container, browser) => {
    const question = "Mağazamda stok nasıl?";
    await type(container, browser, question);
    await act(async () => submit(container, browser));
    const recovery = [...container.querySelectorAll("button")].find((button) => button.textContent === "Yanıtı kontrol et")!;
    await act(async () => recovery.click());
    assert.equal(calls.length, 2); assert.deepEqual(calls[1], calls[0]);
    assert.match(container.querySelector('[role="alert"]')?.textContent ?? "", /tamamlanamadı/);
    assert.equal(container.querySelector<HTMLInputElement>('[name="command"]')!.disabled, false);
    assert.equal(container.querySelector<HTMLInputElement>('[name="command"]')!.value, question);
    assert.equal([...container.querySelectorAll("button")].find((button) => button.textContent === "Yeni konuşma")!.disabled, false);
    assert.equal([...container.querySelectorAll("button")].some((button) => button.textContent === "Yanıtı kontrol et"), false);
    await act(async () => submit(container, browser));
    assert.equal(calls.length, 3); assert.notEqual(calls[2]![1], calls[0]![1]);
  });
});

test("real Toshi UI handles sensitive-input rejection without local fallback or repeating the entered secret", async () => {
  let local = 0, sends = 0;
  await withAssistant({ list, get: async () => conversation, send: async () => { sends += 1; throw new ToshiChatApiError("sensitive_input"); } }, async (container, browser) => {
    const secret = "sk-synthetic-not-a-real-key";
    await type(container, browser, secret);
    await act(async () => submit(container, browser));
    assert.equal(sends, 1); assert.equal(local, 0);
    assert.match(container.querySelector('[role="alert"]')?.textContent ?? "", /API anahtarı veya parola yazmayın/);
    assert.equal(container.querySelector<HTMLInputElement>('[name="command"]')!.value, "");
    assert.ok(!container.textContent?.includes(secret));
  }, async () => { local += 1; return { text: "Forbidden fallback", sources: [] }; });
});


test("real Toshi composer uses bounded multiline input and submits Enter without sending Shift+Enter or composition", async () => {
  const sent: unknown[] = [];
  await withAssistant({ list, get: async () => conversation, send: async (input) => { sent.push(input); return conversation; } }, async (container, browser) => {
    const composer = container.querySelector<HTMLTextAreaElement>('textarea[name="command"]');
    assert.ok(composer, "approved composer is a multiline textarea");
    assert.equal(composer.maxLength, 4000);
    assert.equal(composer.getAttribute("aria-label") ?? container.querySelector(`label[for="${composer.id}"]`)?.textContent, "Toshi’ye sorun");
    await type(container, browser, "Stok durumu\nBekleyen siparişler");
    const shifted = new browser.KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true, cancelable: true });
    await act(async () => { composer.dispatchEvent(shifted as unknown as Event); });
    assert.equal(shifted.defaultPrevented, false, "Shift+Enter retains native newline behavior");
    const composing = new browser.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    Object.defineProperty(composing, "isComposing", { value: true });
    await act(async () => { composer.dispatchEvent(composing as unknown as Event); });
    assert.equal(composing.defaultPrevented, false, "IME acceptance is not a send action");
    assert.equal(sent.length, 0);
    assert.equal(composer.value, "Stok durumu\nBekleyen siparişler");
    const enter = new browser.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    await act(async () => { composer.dispatchEvent(enter as unknown as Event); });
    assert.equal(enter.defaultPrevented, true);
    assert.deepEqual(sent, [{ conversationId: null, expectedVersion: null, text: "Stok durumu\nBekleyen siparişler" }]);
    assert.equal(composer.value, "");
  });
});

test("real Toshi history searches in its own surface and keeps the selected conversation provider and sources", async () => {
  const secondId = "44444444-4444-4444-8444-444444444444";
  const second = { ...conversation, id: secondId, title: "Arpaş ürün bilgisi", provider: "anthropic" as const, model: "claude-sonnet-4", messages: [{ ...conversation.messages[0]!, text: "Ürün bilgisi hazır.", sources: [{ label: "Ürünler", href: "/products" }] }] };
  const gets: string[] = [];
  await withAssistant({ list: async () => ({ conversations: [summary, { ...summary, id: secondId, title: second.title, provider: second.provider, model: second.model }], defaultProvider: { provider: "openai", model: "gpt-4.1-mini" } }), get: async (id) => { gets.push(id); return id === secondId ? second : conversation; }, send: async () => second }, async (container, browser) => {
    assert.equal(container.querySelector('input[type="search"]'), null, "history starts collapsed");
    const history = namedButton(container, "Konuşma geçmişi");
    assert.ok(history);
    await act(async () => history.click());
    const search = container.querySelector<HTMLInputElement>('input[aria-label="Konuşmalarda ara"]') ?? [...container.querySelectorAll<HTMLInputElement>("input")].find((input) => (input.closest("label")?.textContent?.includes("Konuşmalarda ara") || container.querySelector(`label[for="${input.id}"]`)?.textContent === "Konuşmalarda ara"));
    assert.ok(search, "opened history has a labelled search field");
    assert.equal(container.querySelector("dialog"), null, "history does not open a nested modal");
    await act(async () => {
      Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype, "value")!.set!.call(search, "ARPAŞ");
      search.dispatchEvent(new browser.Event("input", { bubbles: true }) as unknown as Event);
    });
    const choice = [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes(second.title));
    assert.ok(choice, "search finds the saved Turkish title");
    assert.equal([...container.querySelectorAll<HTMLButtonElement>("button")].some((button) => button.textContent?.includes(summary.title)), false);
    await act(async () => choice.click());
    assert.deepEqual(gets, [ID, secondId]);
    assert.match(container.textContent ?? "", /Anthropic Claude.*claude-sonnet-4/);
    assert.match(container.textContent ?? "", /Ürün bilgisi hazır/);
    assert.ok(container.querySelector('a[href="/products"]')?.textContent?.includes("Ürünler"));
    assert.equal(container.querySelector('input[type="search"]'), null, "selection returns to the conversation");
  }, undefined, "drawer");
});

test("real Toshi keeps provider and data-sharing information in a compact disclosure", async () => {
  await withAssistant({ list, get: async () => conversation, send: async () => conversation }, async (container) => {
    const summaryElement = [...container.querySelectorAll("summary")].find((item) => (item.getAttribute("aria-label") === "Bağlantı ve veri paylaşımı" || item.textContent?.includes("Bağlantı ve veri paylaşımı")));
    assert.ok(summaryElement, "provider information has a named native disclosure");
    const disclosure = summaryElement.closest("details");
    assert.ok(disclosure);
    assert.equal(disclosure.open, false, "verbose connection information starts collapsed");
    assert.match(disclosure.textContent ?? "", /DeepSeek.*deepseek-flash/);
    assert.match(disclosure.textContent ?? "", /Sorularınız ve yanıt için gereken mağaza verileri/);
    assert.match(disclosure.textContent ?? "", /DeepSeek ile paylaşılır/);
  });
});


test("real Toshi drawer history removes covered chat controls from interaction and restores them on close", async () => {
  await withAssistant({ list: async () => ({ conversations: [summary], defaultProvider: { provider: "deepseek", model: "deepseek-flash" } }), get: async () => conversation, send: async () => conversation }, async (container) => {
    const history = namedButton(container, "Konuşma geçmişi")!;
    const coveredControls = () => [container.querySelector("form"), container.querySelector('[data-toshi-message-body]'), container.querySelector('summary[aria-label="Bağlantı ve veri paylaşımı"]')];
    assert.ok(coveredControls().every((element) => element && !hiddenOrInert(element)), "chat starts available");
    await act(async () => history.click());
    assert.equal(history.getAttribute("aria-expanded"), "true");
    assert.equal(history.disabled, false, "header can close history");
    assert.equal(hiddenOrInert(history), false, "header remains outside the covered chat area");
    const search = container.querySelector('input[type="search"]');
    assert.ok(search);
    assert.equal(hiddenOrInert(search), false, "history search remains usable");
    assert.ok(coveredControls().every((element) => !element || hiddenOrInert(element)), "covered connection, answer, and composer are hidden or inert");
    await act(async () => history.click());
    assert.equal(history.getAttribute("aria-expanded"), "false");
    assert.equal(container.querySelector('input[type="search"]'), null);
    assert.ok(coveredControls().every((element) => element && !hiddenOrInert(element)), "closing history restores chat interaction");
  }, undefined, "drawer");
});

test("real Toshi closes history after failed selection so its preserved question and recovery action remain reachable", async () => {
  const secondId = "44444444-4444-4444-8444-444444444444";
  const secondTitle = "Arpaş ürün bilgisi";
  const gets: string[] = [];
  await withAssistant({ list: async () => ({ conversations: [summary, { ...summary, id: secondId, title: secondTitle }], defaultProvider: { provider: "deepseek", model: "deepseek-flash" } }), get: async (id) => { gets.push(id); if (id === secondId) throw new ToshiChatApiError(); return conversation; }, send: async () => conversation }, async (container, browser) => {
    const question = "Kaybolmaması gereken stok sorusu";
    await type(container, browser, question);
    const history = namedButton(container, "Konuşma geçmişi")!;
    await act(async () => history.click());
    const choice = [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes(secondTitle));
    assert.ok(choice);
    await act(async () => choice.click());
    assert.equal(history.getAttribute("aria-expanded"), "false", "failed selection closes the covering history");
    assert.equal(container.querySelector('input[type="search"]'), null);
    const alert = container.querySelector('[role="alert"]');
    assert.match(alert?.textContent ?? "", /Konuşma yüklenemedi/);
    assert.equal(hiddenOrInert(alert), false, "load error is available in the visible chat");
    const composer = container.querySelector<HTMLTextAreaElement>('textarea[name="command"]')!;
    assert.equal(composer.value, question);
    assert.equal(composer.disabled, false);
    assert.equal(hiddenOrInert(composer), false);
    const retry = namedButton(container, "Geçmişi yenile");
    assert.ok(retry);
    assert.equal(retry.disabled, false);
    assert.equal(hiddenOrInert(retry), false, "retry can be reached without closing another view");
    await act(async () => retry.click());
    assert.deepEqual(gets, [ID, secondId, ID]);
    assert.equal(container.querySelector('[role="alert"]'), null);
    assert.equal(composer.value, question, "successful retry preserves the unsent question");
  }, undefined, "drawer");
});
