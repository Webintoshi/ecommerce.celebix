import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";
import { setTimeout as pause } from "node:timers/promises";
import { createDefaultStarterThemeComposition, type StorefrontDesignDocument, type StorefrontDesignWorkspace } from "@celebix/saas-contracts";
import { Window } from "happy-dom";
import React, { type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import ts from "typescript";
import { StorefrontDesignApiError, type StorefrontDesignApi } from "../../../lib/storefront-design-ui/client.ts";

const require = createRequire(import.meta.url);
const NOW = "2026-09-14T09:00:00.000Z";
const design: StorefrontDesignDocument = {
  schemaVersion: 3,
  brand: { logo: null, favicon: null, primaryColor: "#FF5A00", accentColor: "#171717", backgroundColor: "#FFFFFF", textColor: "#171717", fontFamily: "manrope" },
  typography: { headingFont: { family: "Manrope", category: "sans-serif", availableWeights: ["400", "700"], source: "google" }, bodyFont: { family: "Manrope", category: "sans-serif", availableWeights: ["400", "700"], source: "google" }, headingWeight: "700", bodyWeight: "400", headingSizePx: 40, bodySizePx: 16 },
  hero: { enabled: false, slides: [{ headline: "Fixture", body: "", desktopImage: { kind: "media", mediaId: "40000000-0000-4000-8000-000000000001" }, mobileImage: null, destination: { kind: "none" }, enabled: true }] },
  promotion: { headline: "Original", body: "", destination: { kind: "none" }, startsAt: null, endsAt: null, enabled: false },
  announcement: { items: ["Fixture"], icon: "none", speed: "normal", direction: "left", animation: "continuous", enabled: false },
  composition: createDefaultStarterThemeComposition(),
};
const workspace: StorefrontDesignWorkspace = {
  schemaVersion: 3, draftVersion: 1, publishedVersion: 1, draftUpdatedAt: NOW, publishedAt: NOW, draft: design,
  published: { schemaVersion: 2, publicationVersion: 1, publishedAt: NOW, brand: { ...design.brand, logo: null, favicon: null }, typography: design.typography, hero: { enabled: false, slides: [{ headline: "Fixture", body: "", desktopImage: null, mobileImage: null, destination: null }] }, promotion: { ...design.promotion, destination: null }, announcement: design.announcement },
  store: { name: "Fixture", timezone: "UTC" }, media: [], destinations: [],
};

// The real workspace, state model, navigation guard and modal are mounted. Only
// external API and heavyweight field/canvas presenters are controlled collaborators.
// This is in-memory fixture persistence, not durable server persistence evidence.
async function mount(canManage = true) {
  const window = new Window({ url: "https://fixture.invalid/settings/design" });
  const priorWindow = globalThis.window, priorDocument = globalThis.document;
  globalThis.window = window as unknown as Window & typeof globalThis.window;
  globalThis.document = window.document as unknown as Document;
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  let persisted = structuredClone(workspace);
  let failure: StorefrontDesignApiError | null = null;
  let publishFailure: StorefrontDesignApiError | null = null;
  let readFailure = false;
  let release: (() => void) | undefined;
  let hold: Promise<void> | undefined;
  let saves = 0, publications = 0;
  const api: StorefrontDesignApi = {
    async workspace() { if (readFailure) { readFailure = false; throw new StorefrontDesignApiError(); } return structuredClone(persisted); },
    async saveDraft(input, signal) {
      saves += 1;
      await hold;
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      if (failure) { const error = failure; failure = null; throw error; }
      if (input.expectedDraftVersion !== persisted.draftVersion) throw new StorefrontDesignApiError("version_conflict", 409);
      persisted = { ...persisted, draft: structuredClone(input.design), draftVersion: persisted.draftVersion + 1 };
      return { draft: persisted.draft, draftVersion: persisted.draftVersion, draftUpdatedAt: NOW };
    },
    async publish(input) {
      publications += 1;
      if (publishFailure) throw publishFailure;
      if (input.expectedDraftVersion !== persisted.draftVersion || input.expectedPublishedVersion !== persisted.publishedVersion) throw new StorefrontDesignApiError("version_conflict", 409);
      persisted = { ...persisted, publishedVersion: persisted.publishedVersion + 1, published: { ...persisted.published, publicationVersion: persisted.publishedVersion + 1, promotion: { ...persisted.draft.promotion, destination: null } } };
      return { draftVersion: persisted.draftVersion, publishedVersion: persisted.publishedVersion, publishedAt: NOW, published: persisted.published };
    },
    async uploadMedia() { throw new Error("Unused external upload"); },
  };
  function compile(path: URL): Record<string, unknown> {
    const output = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const module = { exports: {} };
    const load = (id: string): unknown => {
      if (id.endsWith(".css")) return { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) };
      if (id === "@/components/panel/PanelTopbarChrome") return { PanelTopbarBridge: ({ subtitle }: { subtitle: string }) => React.createElement("p", { role: "status" }, subtitle) };
      if (id.endsWith("storefront-design-ui/client")) return { StorefrontDesignApiError, storefrontDesignApi: api };
      if (id.endsWith("storefront-design-preview-ui/use-preview-resources")) return { useStorefrontDesignPreviewResources: (_composition: unknown, initial: unknown) => initial };
      if (id === "./DesignPreview") return { DesignPreview: ({ design, mode }: { design: StorefrontDesignDocument; mode: string }) => React.createElement("output", { "data-mode": mode }, design.promotion.headline) };
      if (id === "./DesignStepEditor") return { DesignStepEditor: ({ design, onChange, canManage }: { design: StorefrontDesignDocument; onChange: (design: StorefrontDesignDocument) => void; canManage: boolean }) => React.createElement("input", { "aria-label": "Fixture headline", value: design.promotion.headline, disabled: !canManage, onInput: (event: React.FormEvent<HTMLInputElement>) => onChange({ ...design, promotion: { ...design.promotion, headline: event.currentTarget.value } }) }) };
      if (id.startsWith("@/")) return compile(new URL(`../../../${id.slice(2)}.ts`, import.meta.url));
      if (id.startsWith(".")) return compile(new URL(/\.tsx?$/.test(id) ? id : `${id}${id === "./DesignSettingsDrawer" ? ".tsx" : ".ts"}`, path));
      return require(id);
    };
    new Function("require", "module", "exports", output)(load, module, module.exports);
    return module.exports;
  }
  const { DesignWorkspace } = compile(new URL("./DesignWorkspace.tsx", import.meta.url)) as { DesignWorkspace: (props: { workspace: StorefrontDesignWorkspace; canManage: boolean; recoveryScope: string }) => ReactNode };
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container as unknown as Element);
  let recoveryScope = "synthetic-session-store-a";
  window.history.replaceState({}, "", "/products");
  window.history.pushState({}, "", "/settings/design");
  // Minimal route host consumes real same-document popstate events. Navigation
  // unmounts/remounts the real workspace, as the client router does.
  function RouteHost() {
    const [path, setPath] = React.useState(window.location.pathname);
    React.useEffect(() => {
      const changed = () => setPath(window.location.pathname);
      window.addEventListener("popstate", changed);
      return () => window.removeEventListener("popstate", changed);
    }, []);
    return path === "/settings/design" ? React.createElement(DesignWorkspace, { key: recoveryScope, workspace: persisted, canManage, recoveryScope }) : React.createElement("p", null, "Products route");
  }
  await React.act(async () => root.render(React.createElement(React.StrictMode, null, React.createElement(RouteHost))));
  async function click(label: string) {
    const button = Array.from(container.querySelectorAll("button")).find((item) => item.textContent === label || item.querySelector("strong")?.textContent === label);
    assert.ok(button, `Missing button: ${label}; UI: ${container.textContent}`);
    await React.act(async () => button.dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
  }
  async function edit(value: string) {
    if (!container.querySelector("input")) await click("Logo ve marka");
    const input = container.querySelector("input");
    assert.ok(input);
    await React.act(async () => { input.value = value; input.dispatchEvent(new window.Event("input", { bubbles: true })); });
  }
  return {
    window, container, click, edit,
    get persisted() { return persisted; }, get saves() { return saves; }, get publications() { return publications; },
    failSave(code: "unavailable" | "version_conflict" = "unavailable") { failure = new StorefrontDesignApiError(code, code === "version_conflict" ? 409 : 503); },
    forbidPublish() { publishFailure = new StorefrontDesignApiError("membership_denied", 403); },
    failRead() { readFailure = true; },
    remoteEdit() { persisted = { ...persisted, draftVersion: persisted.draftVersion + 1, draft: { ...persisted.draft, promotion: { ...persisted.draft.promotion, headline: "Remote" } } }; },
    holdSave() { hold = new Promise<void>((resolve) => { release = resolve; }); },
    async releaseSave() { await React.act(async () => { release?.(); hold = undefined; }); },
    async debounce() { await React.act(async () => { await pause(760); }); },
    async back() { await React.act(async () => { window.history.back(); await pause(30); }); },
    async forward(scope = "synthetic-session-store-a") { recoveryScope = scope; await React.act(async () => { window.history.forward(); await pause(30); }); },
    unload() { const event = new window.Event("beforeunload", { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; },
    async leave(allowed: boolean) {
      Object.assign(window, { confirm: () => allowed });
      const anchor = window.document.createElement("a"); anchor.href = "/products"; window.document.body.append(anchor);
      const event = new window.MouseEvent("click", { bubbles: true, cancelable: true });
      await React.act(async () => anchor.dispatchEvent(event));
      anchor.remove(); return !event.defaultPrevented;
    },
    async close() { await React.act(async () => root.unmount()); await window.happyDOM.close(); globalThis.window = priorWindow; globalThis.document = priorDocument; },
  };
}

test("leaving before debounce warns, canceled navigation preserves input, deliberate discard cancels pending writes", async () => {
  const app = await mount();
  try {
    await app.edit("Local"); assert.equal(app.unload(), true);
    assert.equal(await app.leave(false), false);
    assert.equal(app.container.querySelector("input")?.value, "Local");
    assert.equal(await app.leave(true), true);
    await app.debounce();
    assert.equal(app.persisted.draft.promotion.headline, "Original"); assert.equal(app.saves, 0);
  } finally { await app.close(); }
});

test("same-document Back/Forward recovers a pre-debounce draft and requires comparison before any write", async () => {
  const app = await mount();
  try {
    await app.edit("History pending"); await app.back();
    assert.match(app.container.textContent ?? "", /Products route/);
    await app.forward();
    assert.equal(app.container.querySelector("output")?.textContent, "History pending");
    assert.match(app.container.textContent ?? "", /geri getirildi/);
    assert.doesNotMatch(app.container.querySelector('[role="status"]')?.textContent ?? "", /Başka bir oturumda/);
    await app.debounce(); assert.equal(app.saves, 0); assert.equal(app.persisted.draft.promotion.headline, "Original");
    await app.click("Güncel taslakla karşılaştır"); await app.click("Yerel değişikliklerle üzerine yaz");
    assert.equal(app.persisted.draft.promotion.headline, "History pending");
  } finally { await app.close(); }
});

test("same-document history retains failed input without silently overwriting a fresher remote draft", async () => {
  const app = await mount();
  try {
    app.failSave(); await app.edit("History failed"); await app.debounce();
    assert.match(app.container.textContent ?? "", /Kaydedilemedi/);
    await app.back(); app.remoteEdit(); await app.forward();
    assert.equal(app.container.querySelector("output")?.textContent, "History failed");
    await app.debounce(); assert.equal(app.persisted.draft.promotion.headline, "Remote"); assert.equal(app.saves, 1);
    await app.click("Güncel taslakla karşılaştır");
    assert.match(app.container.querySelector("table")?.textContent ?? "", /History failed/);
    assert.match(app.container.querySelector("table")?.textContent ?? "", /Remote/);
    await app.click("Yerel değişiklikleri bırak, günceli kullan");
    await app.back(); await app.forward();
    assert.equal(app.container.querySelector("output")?.textContent, "Remote");
    assert.doesNotMatch(app.container.textContent ?? "", /geri getirildi/);
  } finally { await app.close(); }
});

test("history recovery is isolated by frontend scope and deliberate navigation discard clears it", async () => {
  const app = await mount();
  try {
    await app.edit("Only scope A"); await app.back(); await app.forward("synthetic-session-store-b");
    assert.equal(app.container.querySelector("output")?.textContent, "Original");
    assert.doesNotMatch(app.container.textContent ?? "", /Only scope A/);
    await app.back(); await app.forward();
    assert.equal(app.container.querySelector("output")?.textContent, "Only scope A");
    assert.equal(await app.leave(true), true);
    await app.back(); await app.forward();
    assert.equal(app.container.querySelector("output")?.textContent, "Original");
    await app.debounce(); assert.equal(app.saves, 0);
  } finally { await app.close(); }
});

test("failed autosave preserves dirty input and explicit retry persists it", async () => {
  const app = await mount();
  try {
    app.failSave(); await app.edit("Retry me"); await app.debounce();
    assert.match(app.container.textContent ?? "", /Kaydedilemedi/); assert.equal(app.unload(), true);
    assert.equal(app.persisted.draft.promotion.headline, "Original");
    await app.click("Kaydetmeyi yeniden dene");
    assert.equal(app.persisted.draft.promotion.headline, "Retry me"); assert.equal(app.unload(), false);
    assert.match(app.container.textContent ?? "", /Taslak kaydedildi/);
  } finally { await app.close(); }
});

test("409 recovery reads latest for comparison and requires deliberate overwrite while preserving edits", async () => {
  const app = await mount();
  try {
    app.remoteEdit(); await app.edit("Local conflict"); await app.debounce();
    assert.match(app.container.textContent ?? "", /Başka bir oturumda değişti/);
    await app.edit("Local newer"); await app.debounce(); assert.equal(app.saves, 1);
    await app.click("Güncel taslakla karşılaştır");
    assert.ok(app.container.querySelector('table[aria-label="Taslak farkları"]'));
    assert.match(app.container.textContent ?? "", /Remote/); assert.match(app.container.textContent ?? "", /Local newer/);
    assert.equal(app.container.querySelector("input")?.value, "Local newer");
    assert.equal(app.persisted.draft.promotion.headline, "Remote");
    await app.click("Yerel değişikliklerle üzerine yaz");
    assert.equal(app.persisted.draft.promotion.headline, "Local newer"); assert.equal(app.persisted.draftVersion, 3);
    assert.equal(app.unload(), false);
  } finally { await app.close(); }
});

test("failed conflict reload keeps local input and a later remote edit still rejects deliberate overwrite", async () => {
  const app = await mount();
  try {
    app.remoteEdit(); await app.edit("Still local"); await app.debounce();
    app.failRead(); await app.click("Güncel taslakla karşılaştır");
    assert.match(app.container.textContent ?? "", /tamamlanamadı/);
    assert.equal(app.container.querySelector("input")?.value, "Still local"); assert.equal(app.unload(), true);
    await app.click("Güncel taslakla karşılaştır"); app.remoteEdit();
    await app.click("Yerel değişikliklerle üzerine yaz");
    assert.match(app.container.textContent ?? "", /Başka bir oturumda değişti/);
    assert.equal(app.persisted.draft.promotion.headline, "Remote"); assert.equal(app.persisted.draftVersion, 3);
    assert.equal(app.container.querySelector("input")?.value, "Still local");
  } finally { await app.close(); }
});

test("unmount cancels queued saves and ignores the old in-flight result", async () => {
  const app = await mount();
  app.holdSave(); await app.edit("In flight"); await app.debounce();
  await app.edit("Queued after unmount"); await app.debounce();
  await app.close(); await app.releaseSave();
  assert.equal(app.persisted.draft.promotion.headline, "Original"); assert.equal(app.saves, 1);
});

test("controlled conflict discard loads latest without writing the abandoned local draft", async () => {
  const app = await mount();
  try {
    app.remoteEdit(); await app.edit("Discard me"); await app.debounce();
    await app.click("Güncel taslakla karşılaştır"); await app.click("Yerel değişiklikleri bırak, günceli kullan");
    await app.debounce(); assert.equal(app.container.querySelector("input")?.value, "Remote");
    assert.equal(app.persisted.draftVersion, 2); assert.equal(app.unload(), false);
  } finally { await app.close(); }
});

test("queued edits survive older responses, section and device changes; draft save never publishes", async () => {
  const app = await mount();
  try {
    app.holdSave(); await app.edit("Older"); await app.debounce();
    await app.edit("Newest"); await app.click("Bitti"); await app.click("Mobil"); await app.click("Footer");
    await app.debounce(); assert.equal(app.unload(), true);
    await app.releaseSave();
    assert.equal(app.container.querySelector("input")?.value, "Newest");
    assert.equal(app.container.querySelector("output")?.getAttribute("data-mode"), "mobile");
    assert.equal(app.persisted.draft.promotion.headline, "Newest");
    assert.equal(app.persisted.published.promotion.headline, "Original"); assert.equal(app.unload(), false);
  } finally { await app.close(); }
});

test("publish-before-debounce flush failure stays handled and leaves a retryable dirty draft", async () => {
  const app = await mount();
  try {
    app.failSave(); await app.edit("Publish pending"); await app.click("Yayınla");
    assert.match(app.container.textContent ?? "", /Kaydedilemedi/);
    assert.equal(app.persisted.draft.promotion.headline, "Original"); assert.equal(app.publications, 0);
    assert.equal(app.unload(), true);
    await app.click("Kaydetmeyi yeniden dene"); await app.click("Yayınla");
    assert.equal(app.persisted.published.promotion.headline, "Publish pending");
    assert.match(app.container.textContent ?? "", /Yayınlandı/);
  } finally { await app.close(); }
});

test("forbidden publication reports permission failure without claiming a published draft", async () => {
  const app = await mount();
  try {
    app.forbidPublish(); await app.edit("Private draft"); await app.debounce(); await app.click("Yayınla");
    assert.match(app.container.textContent ?? "", /yetkiniz yok/);
    assert.match(app.container.textContent ?? "", /Yayınlanamadı/);
    assert.equal(app.persisted.draft.promotion.headline, "Private draft");
    assert.equal(app.persisted.published.promotion.headline, "Original");
  } finally { await app.close(); }
});

test("read-only workspace rejects field callbacks and publishing", async () => {
  const app = await mount(false);
  try {
    await app.edit("Unauthorized"); await app.debounce(); await app.click("Yayınla");
    assert.equal(app.container.querySelector("output")?.textContent, "Original");
    assert.equal(app.persisted.draftVersion, 1); assert.equal(app.publications, 0);
  } finally { await app.close(); }
});

test("in-flight flush locks publishing and blocks intentional navigation until settled", async () => {
  const app = await mount();
  try {
    app.holdSave(); await app.edit("Publish once"); await app.click("Yayınla"); await app.click("Yayınla");
    assert.equal(await app.leave(true), false);
    await app.releaseSave();
    assert.equal(app.publications, 1); assert.equal(app.persisted.published.promotion.headline, "Publish once");
  } finally { await app.close(); }
});
