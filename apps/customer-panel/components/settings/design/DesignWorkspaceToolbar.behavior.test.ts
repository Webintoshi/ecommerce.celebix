import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";

import { Window } from "happy-dom";
import React, { type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import ts from "typescript";

const require = createRequire(import.meta.url);
const styles = new Proxy({}, { get: (_target, key) => String(key) });

type ToolbarModule = Readonly<{ DesignWorkspaceToolbar: (props: Readonly<Record<string, unknown>>) => ReactNode }>;

function compileToolbar(): ToolbarModule {
  const filename = new URL("./DesignWorkspace.tsx", import.meta.url);
  const output = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  const Icon = () => React.createElement("svg", { "aria-hidden": "true" });
  const load = (id: string): unknown => {
    if (id.endsWith(".css")) return { __esModule: true, default: styles };
    if (id === "lucide-react") return { Layers3: Icon, Monitor: Icon, Smartphone: Icon };
    if (id === "@celebix/saas-contracts") return { getStorefrontDesignPublishIssue: () => null };
    if (id === "@/components/panel/PanelTopbarChrome") return { PanelTopbarBridge: () => null };
    if (id === "@/lib/storefront-design-ui/client") return { StorefrontDesignApiError: class extends Error {}, storefrontDesignApi: {} };
    if (id === "@/lib/storefront-design-preview-ui/use-preview-resources") return { useStorefrontDesignPreviewResources: (_composition: unknown, initial: unknown) => initial };
    if (id === "./DesignPreview") return { DesignPreview: () => null };
    if (id === "./DesignSettingsDrawer") return { DesignSettingsModal: () => null };
    if (id === "./DesignStepEditor") return { DesignStepEditor: () => null };
    if (id === "./design-surface-model") return {
      DESIGN_CANVAS_SURFACES: Object.freeze([
        Object.freeze({ key: "homepage", label: "Ana sayfa", hint: "Homepage fixture" }),
        Object.freeze({ key: "footer", label: "Footer", hint: "Footer fixture" }),
      ]),
      designCanvasSurface: () => ({ location: { area: "site", step: "brand" } }),
      designCanvasSurfaceForLocation: () => ({ key: "homepage" }),
    };
    if (id === "./workspace-model") return { applyDesignEdit: () => undefined, beginDesignSave: () => undefined, completeDesignSave: () => undefined, createDesignEditorState: () => undefined };
    return require(id);
  };
  new Function("require", "module", "exports", output)(load, module, module.exports);
  return module.exports as ToolbarModule;
}

test("the real design toolbar keeps all primary controls keyboard reachable and preserves publish disabling", async () => {
  const window = new Window({ url: "https://fixture.invalid/settings/design" });
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  globalThis.window = window as unknown as Window & typeof globalThis.window;
  globalThis.document = window.document as unknown as Document;
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container as unknown as Parameters<typeof createRoot>[0]);
  const selected: string[] = [];
  const selectionTriggers: Element[] = [];
  const modes: string[] = [];
  let publishCount = 0;

  try {
    const { DesignWorkspaceToolbar } = compileToolbar();
    assert.equal(typeof DesignWorkspaceToolbar, "function");
    await React.act(async () => root.render(React.createElement(DesignWorkspaceToolbar, {
      selectedSurface: "homepage",
      previewMode: "desktop",
      publishDisabled: true,
      publishIssueLabel: "Fixture validation issue",
      onSelectSurface: (surface: string, trigger: Element) => { selected.push(surface); selectionTriggers.push(trigger); },
      onPreviewModeChange: (mode: string) => modes.push(mode),
      onPublish: () => { publishCount += 1; },
    })));

    const toolbar = container.querySelector('[role="toolbar"]');
    assert.ok(toolbar);
    assert.match(toolbar.textContent ?? "", /Alanlar/);
    assert.match(toolbar.textContent ?? "", /Masaüstü/);
    assert.match(toolbar.textContent ?? "", /Mobil/);
    assert.match(toolbar.textContent ?? "", /Yayınla/);
    const focusables = Array.from(toolbar.querySelectorAll("summary, button"));
    assert.equal(focusables.length, 6);
    assert.ok(focusables.filter((element) => !(element instanceof window.HTMLButtonElement && element.disabled)).every((element) => (element as unknown as HTMLElement).tabIndex >= 0));
    const publish = Array.from(toolbar.querySelectorAll("button")).find((button) => button.textContent === "Yayınla");
    assert.equal(publish?.disabled, true);
    assert.equal(publish?.title, "Fixture validation issue");
    await React.act(async () => publish?.dispatchEvent(new window.Event("click", { bubbles: true })));
    assert.equal(publishCount, 0);

    const mobile = Array.from(toolbar.querySelectorAll("button")).find((button) => button.textContent?.includes("Mobil"));
    await React.act(async () => mobile?.dispatchEvent(new window.Event("click", { bubbles: true })));
    assert.deepEqual(modes, ["mobile"]);
    await React.act(async () => root.render(React.createElement(DesignWorkspaceToolbar, {
      selectedSurface: "homepage",
      previewMode: "mobile",
      publishDisabled: true,
      publishIssueLabel: "Fixture validation issue",
      onSelectSurface: (surface: string, trigger: Element) => { selected.push(surface); selectionTriggers.push(trigger); },
      onPreviewModeChange: (mode: string) => modes.push(mode),
      onPublish: () => { publishCount += 1; },
    })));
    const updatedMobile = Array.from(toolbar.querySelectorAll("button")).find((button) => button.textContent?.includes("Mobil"));
    assert.equal(updatedMobile?.getAttribute("aria-pressed"), "true");
    assert.deepEqual(selected, []);

    const fields = toolbar.querySelector("details");
    fields?.setAttribute("open", "");
    const footer = Array.from(toolbar.querySelectorAll("button")).find((button) => button.textContent?.includes("Footer fixture"));
    await React.act(async () => footer?.dispatchEvent(new window.Event("click", { bubbles: true })));
    assert.deepEqual(selected, ["footer"]);
    assert.equal(selectionTriggers[0]?.tagName, "SUMMARY");
    assert.equal(fields?.hasAttribute("open"), false);
  } finally {
    await React.act(async () => root.unmount());
    await window.happyDOM.close();
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
  }
});
