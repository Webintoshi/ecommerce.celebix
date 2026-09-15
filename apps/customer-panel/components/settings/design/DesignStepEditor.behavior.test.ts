import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createDefaultStarterThemeComposition,
  type StorefrontDesignDocument,
} from "@celebix/saas-contracts";
import { Window } from "happy-dom";
import React, { type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import ts from "typescript";

const require = createRequire(import.meta.url);
const styles = new Proxy({}, { get: (_target, key) => String(key) });
const FONT_WEIGHTS: readonly ("400" | "700")[] = Object.freeze(["400", "700"]);
const TYPOGRAPHY: StorefrontDesignDocument["typography"] = Object.freeze({
  headingFont: Object.freeze({ family: "Manrope", category: "sans-serif", availableWeights: FONT_WEIGHTS, source: "google" }),
  bodyFont: Object.freeze({ family: "Manrope", category: "sans-serif", availableWeights: FONT_WEIGHTS, source: "google" }),
  headingWeight: "700",
  bodyWeight: "400",
  headingSizePx: 40,
  bodySizePx: 16,
});
const DESIGN: StorefrontDesignDocument = Object.freeze({
  schemaVersion: 3,
  brand: Object.freeze({ logo: null, favicon: null, primaryColor: "#FF5A00", accentColor: "#171717", backgroundColor: "#FFFFFF", textColor: "#171717", fontFamily: "manrope" }),
  typography: TYPOGRAPHY,
  hero: Object.freeze({ enabled: false, slides: Object.freeze([Object.freeze({ headline: "Fixture", body: "", desktopImage: null, mobileImage: null, destination: Object.freeze({ kind: "none" }), enabled: true })]) }),
  promotion: Object.freeze({ headline: "Fixture", body: "", destination: Object.freeze({ kind: "none" }), startsAt: null, endsAt: null, enabled: false }),
  announcement: Object.freeze({ items: Object.freeze(["Fixture"]), icon: "none", speed: "normal", direction: "left", animation: "continuous", enabled: false }),
  composition: createDefaultStarterThemeComposition(),
});

type StepEditorModule = Readonly<{ DesignStepEditor: (props: Readonly<Record<string, unknown>>) => ReactNode }>;

function compileStepEditor(StarterThemeComposer: () => ReactNode): StepEditorModule {
  const filename = new URL("./DesignStepEditor.tsx", import.meta.url);
  const output = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  const load = (id: string): unknown => {
    if (id.endsWith(".css")) return { __esModule: true, default: styles };
    if (id === "@/components/settings/StarterThemeComposer") return { StarterThemeComposer };
    if (id === "@/components/settings/StorefrontAssetManager") return { StorefrontAssetManager: () => null };
    if (id === "./DesignInspector") return { DesignInspector: () => null };
    if (id === "./HomepageBuilder") return { HomepageBuilder: () => null };
    return require(id);
  };
  new Function("require", "module", "exports", output)(load, module, module.exports);
  return module.exports as StepEditorModule;
}

test("a composer render error stays inside a retryable field boundary without changing the draft", async () => {
  const window = new Window({ url: "https://fixture.invalid/settings/design" });
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousConsoleError = console.error;
  globalThis.window = window as unknown as Window & typeof globalThis.window;
  globalThis.document = window.document as unknown as Document;
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  console.error = () => undefined;

  let shouldThrow = true;
  const { DesignStepEditor } = compileStepEditor(() => {
    if (shouldThrow) throw new Error("fixture composer failure");
    return React.createElement("div", null, "Recovered editor");
  });
  const changes: StorefrontDesignDocument[] = [];
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container as unknown as Parameters<typeof createRoot>[0]);

  try {
    await React.act(async () => root.render(React.createElement(DesignStepEditor, {
      step: "navigation",
      design: DESIGN,
      storeName: "Fixture store",
      timezone: "UTC",
      media: [],
      destinations: [],
      canManage: true,
      previewMode: "desktop",
      onChange: (value: StorefrontDesignDocument) => changes.push(value),
      onUpload: async () => { throw new Error("unused"); },
    })));

    assert.match(container.textContent ?? "", /Tema düzenleyicisi açılamadı/);
    assert.equal(changes.length, 0);
    const retry = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Yeniden dene");
    assert.ok(retry);
    shouldThrow = false;
    await React.act(async () => retry.dispatchEvent(new window.Event("click", { bubbles: true })));
    assert.match(container.textContent ?? "", /Recovered editor/);
    assert.equal(changes.length, 0);
  } finally {
    await React.act(async () => root.unmount());
    await window.happyDOM.close();
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
    console.error = previousConsoleError;
  }
});
