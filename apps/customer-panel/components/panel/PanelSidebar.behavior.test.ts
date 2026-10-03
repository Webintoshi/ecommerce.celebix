import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as React from "react";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import * as jsxRuntime from "react/jsx-runtime";
import { Window } from "happy-dom";
import ts from "typescript";
import type { PanelClientChromeModel } from "../../lib/panel-ui/client-chrome-model.ts";

const MODEL = {
  storeSlug: "alpler-spor", storeDisplayName: "Alpler Spor", membershipLabel: "Mağaza sahibi",
  analyticsAvailable: false, planCode: "growth", planVersion: 1, entitlementStatus: "active" as const,
  locale: "tr-TR", storeLogoUrl: "https://media.example.test/stores/alpler/logo.png",
};

type SidebarOptions = { mode?: "desktop" | "drawer"; open?: boolean; onClose?: () => void };

async function mounted(verify: (container: HTMLElement, browser: Window, render: (model: PanelClientChromeModel, options?: SidebarOptions) => Promise<void>) => Promise<void>) {
  const browser = new Window({ url: "https://panel.example.test/" });
  const globals = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ window: browser, document: browser.document, navigator: browser.navigator, HTMLElement: browser.HTMLElement, Event: browser.Event, IS_REACT_ACT_ENVIRONMENT: true })) {
    globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const css = { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) };
  const icons = new Proxy({}, { get: () => () => createElement("svg", { "aria-hidden": true }) });
  const native = (tag: string) => ({ children, ...props }: Record<string, unknown>) => createElement(tag, props, children as React.ReactNode);
  const compile = async (file: string, dependencies: Record<string, unknown>) => {
    const source = await readFile(new URL(file, import.meta.url), "utf8");
    const output = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const compiled: { exports: Record<string, unknown> } = { exports: {} };
    Function("require", "module", "exports", output)((name: string) => {
      if (name === "react") return React;
      if (name === "react/jsx-runtime") return jsxRuntime;
      if (name === "lucide-react") return icons;
      if (name.endsWith(".module.css")) return css;
      if (name in dependencies) return dependencies[name];
      throw new Error(`unexpected_import:${name}`);
    }, compiled, compiled.exports);
    return compiled.exports;
  };
  const switcher = await compile("./StoreSwitcher.tsx", {});
  const motionTags = new Map<PropertyKey, React.ComponentType<Record<string, unknown>>>();
  const compiled = await compile("./PanelSidebar.tsx", {
    "next/link": { __esModule: true, default: native("a") },
    "next/image": { __esModule: true, default: ({ priority: _priority, ...props }: Record<string, unknown>) => createElement("img", props) },
    "framer-motion": {
      AnimatePresence: ({ onExitComplete: _exitComplete, ...props }: Record<string, unknown>) => createElement("div", props, props.children as React.ReactNode),
      motion: new Proxy({}, { get: (_target, tag) => {
        if (!motionTags.has(tag)) motionTags.set(tag, ({ initial: _initial, animate: _animate, exit: _exit, transition: _transition, ...props }: Record<string, unknown>) => createElement(String(tag), props, props.children as React.ReactNode));
        return motionTags.get(tag);
      } }),
      useReducedMotion: () => true,
    },
    "./StoreSwitcher": switcher,
    "./PanelNavigation": { PanelNavigation: () => createElement("nav", { "aria-label": "Panel menüsü" }) },
    "./LogoutButton": { LogoutButton: () => createElement("button", { type: "button" }, "Çıkış") },
  });
  const Component = compiled.PanelSidebar as React.ComponentType<{ model: PanelClientChromeModel } & SidebarOptions>;
  const container = browser.document.createElement("main"); browser.document.body.append(container);
  const root = createRoot(container as unknown as HTMLElement);
  const render = async (model: PanelClientChromeModel, options: SidebarOptions = {}) => { await act(async () => root.render(createElement(Component, { model, mode: "desktop", ...options }))); };
  try { await render(MODEL); await verify(container as unknown as HTMLElement, browser, render); }
  finally { await act(async () => root.unmount()); for (const [key, descriptor] of globals) descriptor ? Object.defineProperty(globalThis, key, descriptor) : Reflect.deleteProperty(globalThis, key); await browser.happyDOM.close(); }
}

test("a merchant sees their display name and logo rather than a slug avatar", async () => {
  await mounted(async (container) => {
    const identity = container.querySelector('[aria-label="Etkin mağaza"]')!;
    assert.equal(identity.querySelector("strong")?.textContent, "Alpler Spor");
    assert.equal(identity.querySelector("img")?.getAttribute("src"), "https://media.example.test/stores/alpler/logo.png");
    assert.equal(identity.querySelector("small")?.textContent, "Mağaza sahibi");
  });
});

test("an unavailable logo falls back to the merchant name and a different store can still show its logo", async () => {
  await mounted(async (container, browser, render) => {
    const image = container.querySelector('[aria-label="Etkin mağaza"] img')!;
    assert.ok(image, "the resolved logo should render first");
    await act(async () => image.dispatchEvent(new browser.Event("error") as unknown as Event));
    assert.equal(container.querySelector('[aria-label="Etkin mağaza"] img'), null);
    assert.equal(container.querySelector('[aria-label="Etkin mağaza"] strong')?.textContent, "Alpler Spor");
    await render({ ...MODEL, storeSlug: "butik-siora", storeDisplayName: "Butik Siora", storeLogoUrl: "https://media.example.test/stores/siora/logo.png" } as PanelClientChromeModel);
    assert.equal(container.querySelector('[aria-label="Etkin mağaza"] img')?.getAttribute("src"), "https://media.example.test/stores/siora/logo.png");
    assert.equal(container.querySelector('[aria-label="Etkin mağaza"] strong')?.textContent, "Butik Siora");
  });
});

test("a logo-free merchant keeps their role and the existing multi-store switch form", async () => {
  await mounted(async (container, _browser, render) => {
    await render({ ...MODEL, storeDisplayName: undefined, storeLogoUrl: null, membershipLabel: "Mağaza yöneticisi", activeStoreSelectionKey: "alpler", storeOptions: [{ selectionKey: "alpler", displayName: "Alpler Spor" }, { selectionKey: "siora", displayName: "Butik Siora" }] } as PanelClientChromeModel);
    const identity = container.querySelector('[aria-label="Etkin mağaza"]')!;
    assert.equal(identity.querySelector("img"), null);
    assert.equal(identity.querySelector("strong")?.textContent, "Alpler Spor");
    assert.match(identity.textContent ?? "", /Mağaza yöneticisi/);
    const form = identity.querySelector("form")!;
    assert.equal(form.getAttribute("action"), "/api/session/switch");
    assert.equal(form.getAttribute("method"), "post");
    assert.deepEqual(Array.from(form.querySelectorAll("option"), option => option.textContent), ["Alpler Spor", "Butik Siora"]);
  });
});

test("the multi-store drawer wraps keyboard focus through the visible store switcher", async () => {
  await mounted(async (container, browser, render) => {
    // happy-dom does not lay out elements; use a non-zero box, including for
    // closed details content as in the browser where this failure was observed.
    Object.defineProperty(browser.HTMLElement.prototype, "getClientRects", { configurable: true, value: () => [{ width: 48, height: 48 }] });
    let closed = 0;
    await render({ ...MODEL, activeStoreSelectionKey: "alpler", storeOptions: [{ selectionKey: "alpler", displayName: "Alpler Spor" }, { selectionKey: "siora", displayName: "Butik Siora" }] } as PanelClientChromeModel, { mode: "drawer", open: true, onClose: () => { closed += 1; } });
    const drawer = container.querySelector('[role="dialog"]')!;
    const summary = drawer.querySelector("summary") as HTMLElement;
    const logout = Array.from(drawer.querySelectorAll("button")).find(button => button.textContent === "Çıkış")!;
    assert.equal((browser.document.activeElement as unknown as HTMLElement).getAttribute("aria-label"), "Panel menüsünü kapat");
    logout.focus();
    await act(async () => browser.dispatchEvent(new browser.KeyboardEvent("keydown", { key: "Tab", cancelable: true })));
    assert.ok(browser.document.activeElement as unknown === summary, "the hidden destination selector must not take focus");
    await act(async () => browser.dispatchEvent(new browser.KeyboardEvent("keydown", { key: "Tab", shiftKey: true, cancelable: true })));
    assert.ok(browser.document.activeElement as unknown === logout, "reverse tab should wrap to logout");
    await act(async () => browser.dispatchEvent(new browser.KeyboardEvent("keydown", { key: "Escape", cancelable: true })));
    assert.equal(closed, 1);
  });
});
