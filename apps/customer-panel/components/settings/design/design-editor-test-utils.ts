import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createDefaultStarterThemeComposition, type StorefrontDesignDocument } from "@celebix/saas-contracts";
import { Window } from "happy-dom";
import React from "react";
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
export const DESIGN: StorefrontDesignDocument = Object.freeze({
  schemaVersion: 3,
  brand: Object.freeze({ logo: null, favicon: null, primaryColor: "#FF5A00", accentColor: "#171717", backgroundColor: "#FFFFFF", textColor: "#171717", fontFamily: "manrope" }),
  typography: TYPOGRAPHY,
  hero: Object.freeze({ enabled: false, slides: Object.freeze([Object.freeze({ headline: "Fixture", body: "", desktopImage: null, mobileImage: null, destination: Object.freeze({ kind: "none" }), enabled: true })]) }),
  promotion: Object.freeze({ headline: "Fixture", body: "", destination: Object.freeze({ kind: "none" }), startsAt: null, endsAt: null, enabled: false }),
  announcement: Object.freeze({ items: Object.freeze(["Fixture"]), icon: "none", speed: "normal", direction: "left", animation: "continuous", enabled: false }),
  composition: createDefaultStarterThemeComposition(),
});


export function compile<T>(filename: URL, overrides: Record<string, unknown> = {}): T {
  const output = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  const load = (id: string): unknown => {
    if (id in overrides) return overrides[id];
    if (id.endsWith(".css")) return { __esModule: true, default: styles };
    if (id.startsWith(".")) {
      for (const extension of /\.tsx?$/.test(id) ? [""] : [".tsx", ".ts"]) { const path = new URL(id + extension, filename); if (existsSync(fileURLToPath(path))) return compile(path, overrides); }
    }
    return require(id);
  };
  new Function("require", "module", "exports", output)(load, module, module.exports);
  return module.exports as T;
}
export async function withEditor(run: (context: { window: Window; container: HTMLElement; render: (component: React.ReactNode) => Promise<void>; click: (element: Element) => Promise<void>; change: (element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string) => Promise<void> }) => Promise<void>) {
 const window = new Window({url:"https://fixture.invalid/settings/design"});
 const previousWindow=globalThis.window, previousDocument=globalThis.document;
 globalThis.window=window as unknown as Window & typeof globalThis.window; globalThis.document=window.document as unknown as Document;
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const { createRoot } = await import("react-dom/client");
 const container=window.document.createElement("div"); window.document.body.append(container); const root=createRoot(container as unknown as HTMLElement);
 try { await run({ window, container:container as unknown as HTMLElement,
 render: async component => { await React.act(async()=>root.render(component)); },
 click:async element => {await React.act(async()=>(element as unknown as HTMLElement).click());},
 change:async (element,value) => {await React.act(async()=>{ const setter=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element),"value")?.set; setter?.call(element,value); element.dispatchEvent(new window.Event(element.tagName === "SELECT" ? "change" : "input",{bubbles:true}) as unknown as Event); if(element.tagName!=="SELECT") element.dispatchEvent(new window.Event("change",{bubbles:true}) as unknown as Event); }); }
 }); } finally {await React.act(async()=>root.unmount()); await window.happyDOM.close(); globalThis.window=previousWindow; globalThis.document=previousDocument;}
}
