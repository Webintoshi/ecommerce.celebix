import assert from "node:assert/strict";
import test from "node:test";

import { Window } from "happy-dom";
import React from "react";
import { createRoot } from "react-dom/client";
import { createDefaultStarterThemeComposition, type StarterThemeComposition } from "@celebix/saas-contracts";
import { storefrontDesignPreviewDependencyKey, type StorefrontDesignPreviewResources } from "../storefront-design-preview-model.ts";
import { createStorefrontDesignPreviewRequestCoordinator, useStorefrontDesignPreviewResources } from "./use-preview-resources.ts";

function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
const composition = {} as StarterThemeComposition;
const first = { dependencyKey: "first" } as StorefrontDesignPreviewResources;
const second = { dependencyKey: "second" } as StorefrontDesignPreviewResources;

test("coordinator aborts the prior request and ignores stale completion", async () => {
  const pending = [deferred<StorefrontDesignPreviewResources>(), deferred<StorefrontDesignPreviewResources>()]; const signals: AbortSignal[] = []; const applied: string[] = [];
  const coordinator = createStorefrontDesignPreviewRequestCoordinator({ request: async (_composition, signal) => { signals.push(signal); return pending[signals.length - 1]!.promise; }, apply: (value) => applied.push(value.dependencyKey), fail: () => applied.push("failed") });
  const old = coordinator.refresh(composition); const current = coordinator.refresh(composition);
  assert.equal(signals[0]?.aborted, true); pending[1]!.resolve(second); await current; pending[0]!.resolve(first); await old;
  assert.deepEqual(applied, ["second"]);
  coordinator.dispose(); assert.equal(signals[1]?.aborted, true);
});

test("coordinator can refresh after a StrictMode-style effect cleanup", async () => {
  const applied: string[] = [];
  const coordinator = createStorefrontDesignPreviewRequestCoordinator({ request: async () => second, apply: (value) => applied.push(value.dependencyKey), fail: () => applied.push("failed") });

  coordinator.dispose();
  await coordinator.refresh(createDefaultStarterThemeComposition());

  assert.deepEqual(applied, ["second"]);
});

test("returning to the already-applied dependency cancels an obsolete request", async () => {
  const pending = deferred<StorefrontDesignPreviewResources>();
  const signals: AbortSignal[] = [];
  const applied: string[] = [];
  const initial = createDefaultStarterThemeComposition();
  const changed = { ...initial, sections: [{ sectionId: "home_products", kind: "product_row", enabled: true, heading: "Products", source: "latest", limit: 4 }] } as StarterThemeComposition;
  const coordinator = createStorefrontDesignPreviewRequestCoordinator({ request: async (_composition, signal) => { signals.push(signal); return pending.promise; }, apply: (value) => applied.push(value.dependencyKey), fail: () => applied.push("failed") });

  const obsolete = coordinator.refresh(changed);
  coordinator.cancel();
  pending.resolve(second);
  await obsolete;

  assert.equal(signals[0]?.aborted, true);
  assert.deepEqual(applied, []);
});

test("hook exposes loading for a changed source and cancels it when dependencies revert", async () => {
  const initialComposition = createDefaultStarterThemeComposition();
  const changedComposition = { ...initialComposition, sections: [{ sectionId: "home_products", kind: "product_row", enabled: true, heading: "Products", source: "latest", limit: 4 }] } as StarterThemeComposition;
  const initialResources = { schemaVersion: 1, dependencyKey: storefrontDesignPreviewDependencyKey(initialComposition), productSources: [], assets: [], hotspots: [], categoryShowcase: { status: "missing" } } as StorefrontDesignPreviewResources;
  const pending = [deferred<StorefrontDesignPreviewResources>(), deferred<StorefrontDesignPreviewResources>()];
  const signals: AbortSignal[] = [];
  const api = { preview: async (_composition: StarterThemeComposition, signal?: AbortSignal) => { if (signal) signals.push(signal); return pending[signals.length - 1]!.promise; } };
  function Harness({ composition }: Readonly<{ composition: StarterThemeComposition }>) {
    const resources = useStorefrontDesignPreviewResources(composition, initialResources, api);
    return React.createElement("output", null, `${resources.dependencyKey}:${resources.productSources[0]?.status ?? resources.categoryShowcase.status}`);
  }
  const window = new Window({ url: "https://fixture.invalid/settings/design" });
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  globalThis.window = window as unknown as Window & typeof globalThis.window;
  globalThis.document = window.document as unknown as Document;
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container as unknown as Parameters<typeof createRoot>[0]);
  try {
    await React.act(async () => root.render(React.createElement(React.StrictMode, null, React.createElement(Harness, { composition: initialComposition }))));
    await React.act(async () => root.render(React.createElement(React.StrictMode, null, React.createElement(Harness, { composition: changedComposition }))));
    assert.match(container.textContent ?? "", /:loading$/);
    await React.act(async () => root.render(React.createElement(React.StrictMode, null, React.createElement(Harness, { composition: initialComposition }))));
    assert.equal(signals[0]?.aborted, true);
    pending[0]!.resolve(second);
    pending[1]!.resolve(initialResources);
    await React.act(async () => { await Promise.all(pending.map(({ promise }) => promise)); });
    assert.equal(container.textContent, `${initialResources.dependencyKey}:missing`);
  } finally {
    await React.act(async () => root.unmount());
    await window.happyDOM.close();
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
  }
});
