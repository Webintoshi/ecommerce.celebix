import assert from "node:assert/strict";
import test from "node:test";

import { createDefaultStarterThemeComposition } from "@celebix/saas-contracts";
import { storefrontDesignPreviewDependencyKey } from "../storefront-design-preview-model.ts";
import { createStorefrontDesignPreviewApi, StorefrontDesignPreviewApiError } from "./client.ts";

function response(value: unknown, status = 200): Response { return Response.json(value, { status }); }

test("preview client sends only normalized composition and parses a bounded no-store response", async () => {
  const composition = createDefaultStarterThemeComposition(); let selected: { path: unknown; init: RequestInit } | null = null;
  const resources = { schemaVersion: 1, dependencyKey: storefrontDesignPreviewDependencyKey(composition), productSources: [], assets: [], hotspots: [], categoryShowcase: { status: "missing" } };
  const api = createStorefrontDesignPreviewApi(async (path, init) => { selected = { path, init: init ?? {} }; return response({ code: "ok", resources }); });
  assert.deepEqual(await api.preview(composition), resources);
  const captured = selected as unknown as { path: unknown; init: RequestInit };
  assert.equal(captured.path, "/api/storefront-design/preview");
  assert.deepEqual(JSON.parse(String(captured.init.body)), { composition });
  assert.equal(JSON.stringify(captured.init).includes("storeId"), false);
  assert.equal(captured.init.cache, "no-store");
});

test("preview client rejects foreign media and stale dependency responses", async () => {
  const composition = { ...createDefaultStarterThemeComposition(), sections: [{ sectionId: "home_story_test", kind: "brand_story", enabled: true, heading: "Hikâye", body: "Metin", assetId: "71000000-0000-4000-8000-000000000001" }] } as const;
  const base = { schemaVersion: 1, dependencyKey: storefrontDesignPreviewDependencyKey(composition as never), productSources: [], hotspots: [], categoryShowcase: { status: "missing" } };
  for (const resources of [
    { ...base, dependencyKey: "stale", assets: [] },
    { ...base, assets: [{ id: "71000000-0000-4000-8000-000000000001", status: "ready", image: { url: "https://evil.test/stores/x/image.webp", mediaType: "image/webp", altText: "x", width: 10, height: 10 } }] },
  ]) {
    const api = createStorefrontDesignPreviewApi(async () => response({ code: "ok", resources }));
    await assert.rejects(api.preview(composition as never), StorefrontDesignPreviewApiError);
  }
});

test("preview client preserves AbortError for versioned request cancellation", async () => {
  const api = createStorefrontDesignPreviewApi(async (_path, init) => await new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))));
  const controller = new AbortController(); const pending = api.preview(createDefaultStarterThemeComposition(), controller.signal); controller.abort();
  await assert.rejects(pending, (error) => error instanceof DOMException && error.name === "AbortError");
});

test("preview client accepts a free public product hotspot", async () => {
  const composition = createDefaultStarterThemeComposition();
  const resources = { schemaVersion: 1, dependencyKey: storefrontDesignPreviewDependencyKey(composition), productSources: [], assets: [], hotspots: [{ productId: "71000000-0000-4000-8000-000000000001", status: "ready", value: { productSlug: "ucretsiz-urun", title: "Ücretsiz ürün", priceCents: 0, currency: "TRY" } }], categoryShowcase: { status: "missing" } };
  const api = createStorefrontDesignPreviewApi(async () => response({ code: "ok", resources }));

  assert.equal((await api.preview(composition)).hotspots[0]?.value?.priceCents, 0);
});

test("preview client accepts only the bounded card product projection", async () => {
  const composition = createDefaultStarterThemeComposition();
  const key = storefrontDesignPreviewDependencyKey(composition);
  const product = { id: "71000000-0000-4000-8000-000000000010", slug: "dar-urun", title: "Dar ürün", currency: "TRY", priceCents: 100, available: true, media: [] };
  const resources = { schemaVersion: 1, dependencyKey: key, productSources: [{ key: "latest", status: "ready", items: [product] }], assets: [], hotspots: [], categoryShowcase: { status: "missing" } };
  const api = createStorefrontDesignPreviewApi(async () => response({ code: "ok", resources }));
  assert.equal((await api.preview(composition)).productSources[0]?.items[0]?.title, "Dar ürün");

  const broad = createStorefrontDesignPreviewApi(async () => response({ code: "ok", resources: { ...resources, productSources: [{ ...resources.productSources[0], items: [{ ...product, description: "unused" }] }] } }));
  await assert.rejects(broad.preview(composition), StorefrontDesignPreviewApiError);
});

test("preview accepts the full validated public product title length", async () => {
  const composition = createDefaultStarterThemeComposition();
  const title = "Ü".repeat(200);
  const product = { id: "71000000-0000-4000-8000-000000000010", slug: "uzun-urun", title, currency: "TRY", priceCents: 100, available: true, media: [] };
  const resources = { schemaVersion: 1, dependencyKey: storefrontDesignPreviewDependencyKey(composition), productSources: [{ key: "latest", status: "ready", items: [product] }], assets: [], hotspots: [], categoryShowcase: { status: "missing" } };
  const api = createStorefrontDesignPreviewApi(async () => response({ code: "ok", resources }));
  assert.equal((await api.preview(composition)).productSources[0]?.items[0]?.title, title);
});

test("preview client stops reading a response body as soon as the byte cap is exceeded", async () => {
  let readPastBound = false;
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new Uint8Array(1_048_577)); },
    pull() { readPastBound = true; throw new Error("read_past_bound"); },
    cancel() { cancelled = true; },
  }, { highWaterMark: 0 });
  const api = createStorefrontDesignPreviewApi(async () => new Response(body, { headers: { "content-type": "application/json" } }));

  await assert.rejects(api.preview(createDefaultStarterThemeComposition()), StorefrontDesignPreviewApiError);
  assert.equal(readPastBound, false);
  assert.equal(cancelled, true);
});
