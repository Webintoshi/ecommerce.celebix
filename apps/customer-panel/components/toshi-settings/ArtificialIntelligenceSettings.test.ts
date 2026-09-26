import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as React from "react";
import { act, createElement } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { Window } from "happy-dom";
import ts from "typescript";

const COMPONENT = new URL("./ArtificialIntelligenceSettings.tsx", import.meta.url);
const PAGE = new URL("../../app/settings/artificial-intelligence/page.tsx", import.meta.url);
const CSS = new URL("./artificial-intelligence-settings.module.css", import.meta.url);

test("AI settings page uses the dedicated provider surface and removes old warning copy", async () => {
  const page = await readFile(PAGE, "utf8");
  assert.match(page, /ArtificialIntelligenceSettings/);
  assert.doesNotMatch(page, /MerchantModuleConsole|ai_setting|İlk yapılandırma|İşlem geçmişi/);
  assert.doesNotMatch(page, /Sağlayıcı etkinleştirilmeden içerik üretilmez/);
});

test("provider UI renders all brands and secure connection controls without a repeated page title", async () => {
  const source = await readFile(COMPONENT, "utf8");
  for (const label of ["OpenAI", "Google Gemini", "Anthropic Claude", "DeepSeek"]) assert.match(source, new RegExp(label));
  assert.match(source, /type="password"/);
  assert.match(source, /autoComplete="new-password"/);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /setDefault/);
  assert.match(source, /selectModel/);
  assert.match(source, /revoke/);
  assert.match(source, /window[.]confirm/);
  assert.match(source, /submissionActive[.]current/);
  assert.match(source, /setKeys\(.*""/s);
  assert.doesNotMatch(source, /<h1/);
  assert.doesNotMatch(source, /apiKey.*localStorage|localStorage.*apiKey/s);
});

async function withSettings(
  canManage: boolean,
  api: Record<string, unknown>,
  verify: (container: HTMLElement, browser: Window) => Promise<void>,
) {
  const browser = new Window({ url: "https://panel.example.test/settings/artificial-intelligence" });
  const globals = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({
    window: browser, document: browser.document, navigator: browser.navigator,
    HTMLElement: browser.HTMLElement, HTMLInputElement: browser.HTMLInputElement,
    HTMLSelectElement: browser.HTMLSelectElement, Event: browser.Event,
    MouseEvent: browser.MouseEvent, IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const output = ts.transpileModule(await readFile(COMPONENT, "utf8"), { compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText;
  const compiled: { exports: Record<string, unknown> } = { exports: {} };
  class ApiError extends Error {}
  Function("require", "module", "exports", output)((name: string) => {
    if (name === "react") return React;
    if (name === "react/jsx-runtime") return jsxRuntime;
    if (name === "lucide-react") return new Proxy({}, { get: () => () => createElement("svg", { "aria-hidden": true }) });
    if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) };
    if (name === "@/lib/toshi-provider-ui/client") return { ToshiProviderApiError: ApiError, createToshiProviderApi: () => api };
    throw new Error(`unexpected_import:${name}`);
  }, compiled, compiled.exports);
  const { createRoot } = await import("react-dom/client");
  const container = browser.document.createElement("div");
  browser.document.body.append(container);
  const root = createRoot(container as unknown as Parameters<typeof createRoot>[0]);
  try {
    const Component = compiled.exports.ArtificialIntelligenceSettings as React.ComponentType<{ canManage: boolean }>;
    await act(async () => { root.render(createElement(Component, { canManage })); });
    await verify(container as unknown as HTMLElement, browser);
  } finally {
    await act(async () => root.unmount());
    for (const [key, descriptor] of globals) descriptor
      ? Object.defineProperty(globalThis, key, descriptor)
      : Reflect.deleteProperty(globalThis, key);
    await browser.happyDOM.close();
  }
}

test("all four provider credentials are masked and disabled for read-only members", async () => {
  await withSettings(false, { list: async () => [] }, async (container) => {
    assert.equal(container.querySelectorAll("article").length, 4);
    const inputs = [...container.querySelectorAll<HTMLInputElement>('input[type="password"]')];
    assert.deepEqual(inputs.map((field) => field.id), ["toshi-key-openai", "toshi-key-gemini", "toshi-key-anthropic", "toshi-key-deepseek"]);
    for (const input of inputs) {
      assert.equal(input.disabled, true);
      assert.equal(input.value, "");
      assert.equal(input.autocomplete, "new-password");
    }
    assert.equal(container.querySelector('button[type="submit"]:not(:disabled)'), null);
  });
});

test("DeepSeek uses the existing versioned connect, model, default and revoke controls", async () => {
  let connection: Record<string, unknown> | undefined;
  const calls: unknown[] = [];
  const api = {
    list: async () => connection ? [connection] : [],
    connect: async (provider: string, input: Record<string, unknown>) => {
      calls.push(["connect", provider, input]);
      connection = { provider, status: "active", version: 1, maskedKey: "sk-••••test", verifiedAt: "2026-09-26T12:00:00Z", isDefault: false,
        selectedModel: "deepseek-chat", availableModels: [{ id: "deepseek-chat", label: "DeepSeek Chat" }, { id: "deepseek-reasoner", label: "DeepSeek Reasoner" }] };
      return connection;
    },
    selectModel: async (provider: string, input: Record<string, unknown>) => {
      calls.push(["model", provider, input]);
      connection = { ...connection, version: 2, selectedModel: input.model };
      return connection;
    },
    setDefault: async (provider: string, version: number) => {
      calls.push(["default", provider, version]);
      connection = { ...connection, version: 3, isDefault: true };
      return connection;
    },
    revoke: async (provider: string, version: number) => {
      calls.push(["revoke", provider, version]);
      connection = undefined;
    },
  };
  await withSettings(true, api, async (container, browser) => {
    const field = container.querySelector<HTMLInputElement>("#toshi-key-deepseek")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype, "value")!.set!.call(field, "sk-deepseek-fixture");
      field.dispatchEvent(new browser.Event("input", { bubbles: true }) as unknown as Event);
    });
    await act(async () => { field.closest("form")!.dispatchEvent(new browser.Event("submit", { bubbles: true, cancelable: true }) as unknown as Event); });
    assert.deepEqual(calls[0], ["connect", "deepseek", { apiKey: "sk-deepseek-fixture", expectedVersion: 0 }]);
    assert.equal(field.value, "");
    assert.match(field.placeholder, /sk-••••test/);
    const row = field.closest("article")!;
    const model = row.querySelector<HTMLSelectElement>("select")!;
    await act(async () => {
      model.value = "deepseek-reasoner";
      model.dispatchEvent(new browser.Event("change", { bubbles: true }) as unknown as Event);
    });
    assert.deepEqual(calls[1], ["model", "deepseek", { model: "deepseek-reasoner", expectedVersion: 1 }]);
    await act(async () => { [...row.querySelectorAll("button")].find((button) => button.textContent === "Varsayılan yap")!.click(); });
    assert.deepEqual(calls[2], ["default", "deepseek", 2]);
    assert.match(row.textContent ?? "", /Varsayılan/);
    (browser as unknown as { confirm: () => boolean }).confirm = () => true;
    await act(async () => { row.querySelector<HTMLButtonElement>('button[aria-label="DeepSeek bağlantısını kaldır"]')!.click(); });
    assert.deepEqual(calls[3], ["revoke", "deepseek", 3]);
    assert.equal(row.querySelector("select"), null);
    assert.match(row.textContent ?? "", /Bağlı değil/);
  });
});

test("provider styling stays flat responsive and does not reintroduce generic cards", async () => {
  const css = await readFile(CSS, "utf8");
  assert.match(css, /border-bottom/);
  assert.match(css, /@media/);
  assert.doesNotMatch(css, /box-shadow/);
  assert.doesNotMatch(css, /\.card\b/);
});
