import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React, { act, createElement } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { Window } from "happy-dom";
import postcss from "postcss";
import ts from "typescript";

export const panelRoot = new URL("../", import.meta.url);
export const source = (path: string) => readFileSync(new URL(path, panelRoot), "utf8");
const nativeRequire = createRequire(import.meta.url);
const styles = new Proxy({}, { get: (_, key) => key === "__esModule" ? true : key === "default" ? styles : String(key) });
const passthrough = ({ children }: any) => createElement("div", null, children);

// Compile the actual consumer; only browser/framework chrome and explicitly supplied
// network boundaries are doubled. Unexpected dependencies still fail the test.
export function compile(path: string, overrides: Record<string, any> = {}): any {
  const cache = new Map<string, any>();
  function load(url: URL): any {
    if (cache.has(url.href)) return cache.get(url.href).exports;
    const module = { exports: {} };
    cache.set(url.href, module);
    const output = ts.transpileModule(readFileSync(url, "utf8"), { fileName: url.pathname, compilerOptions: { esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    Function("require", "module", "exports", output)((specifier: string) => {
      if (specifier in overrides) return overrides[specifier];
      if (specifier === "react") return React;
      if (specifier === "react/jsx-runtime") return jsxRuntime;
      if (specifier.endsWith(".css")) return styles;
      if (specifier === "next/link") return { __esModule: true, default: ({ children, ...props }: any) => createElement("a", props, children) };
      if (specifier === "next/image") return { __esModule: true, default: (props: any) => createElement("img", props) };
      if (specifier === "@/components/panel/PanelTopbarChrome") return { PanelTopbarBridge: () => null };
      if (specifier === "@/components/panel/PanelPageShell") return { PanelPageShell: passthrough, PanelStatusBadge: ({ children, tone }: any) => createElement("span", { "data-tone": tone }, children), PanelPageHeader: ({ title, actions }: any) => createElement("header", null, title, actions), PanelEmptyState: ({ title, description }: any) => createElement("p", null, title, description), PanelLoadingState: ({ label }: any) => createElement("p", null, label) };
      if (specifier.startsWith("@/") || specifier.startsWith(".")) {
        const base = specifier.startsWith("@/") ? new URL(specifier.slice(2), panelRoot) : new URL(specifier, url);
        for (const suffix of ["", ".ts", ".tsx", "/index.ts"]) {
          const candidate = new URL(base.href + suffix);
          try { readFileSync(candidate, "utf8"); } catch { continue; }
          return load(candidate);
        }
        throw new Error(`Unresolved test dependency ${specifier}`);
      }
      return nativeRequire(specifier);
    }, module, module.exports);
    return module.exports;
  }
  return load(new URL(path, panelRoot));
}

export async function mounted(Component: any, props: any, run: (host: any, window: Window) => Promise<void>, setup?: (window: Window) => void) {
  const window = new Window({ url: "https://panel.example.test/" });
  const replacements: Record<string, any> = { window, document: window.document, navigator: window.navigator, IS_REACT_ACT_ENVIRONMENT: true };
  const prior = new Map(Object.keys(replacements).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(replacements)) Object.defineProperty(globalThis, key, { configurable: true, value });
  setup?.(window);
  const { createRoot } = await import("react-dom/client");
  const host = window.document.createElement("div");
  window.document.body.append(host);
  const root = createRoot(host as any);
  try {
    await act(async () => { root.render(createElement(Component, props)); });
    await run(host, window);
  } finally {
    await act(async () => root.unmount());
    for (const [key, descriptor] of prior) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
    await window.happyDOM.close();
  }
}
export async function click(host: any, label: string) {
  const button = [...host.querySelectorAll("button")].find((item: any) => item.textContent === label || item.getAttribute("aria-label") === label) as any;
  assert.ok(button, `Missing button ${label}`);
  await act(async () => button.click());
}
export async function input(window: Window, element: any, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
    setter.call(element, value);
    element.dispatchEvent(new window.Event("input", { bubbles: true }));
    element.dispatchEvent(new window.Event("change", { bubbles: true }));
  });
}

// Happy DOM supplies selector specificity, inheritance and CSS-variable resolution.
// Resolve viewport queries first because its media-query evaluator does not implement
// CSS viewport widths. Layout/hit testing remains a separate browser acceptance gate.
export function effectiveCss(path: string, html: string, selector: string, width = 1440) {
  const parsed = postcss.parse(source(path));
  parsed.walkAtRules("media", rule => {
    const max = rule.params.match(/max-width:\s*(\d+)px/);
    const min = rule.params.match(/min-width:\s*(\d+)px/);
    if ((!max && !min) || (max && width > Number(max[1])) || (min && width < Number(min[1]))) rule.remove();
    else rule.replaceWith(...(rule.nodes ?? []));
  });
  parsed.walkRules(rule => { rule.selector = rule.selector.replace(/:global\(([^)]+)\)/g, "$1").replace(/:focus-visible|:focus-within|:focus\b/g, ".testFocus"); });
  const window = new Window();
  window.document.head.innerHTML = `<style>${parsed.toString()}</style>`;
  window.document.body.innerHTML = html;
  const element = window.document.querySelector(selector);
  assert.ok(element, selector);
  return window.getComputedStyle(element);
}
