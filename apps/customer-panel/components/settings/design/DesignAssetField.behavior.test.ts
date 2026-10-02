import assert from "node:assert/strict";
import test from "node:test";
import React, { type ReactNode } from "react";
import type { DesignMediaReference, StorefrontAsset, StorefrontAssetKind, StorefrontDesignMediaOption } from "@celebix/saas-contracts";
import type { DesignImageFieldProps } from "./DesignImageField.tsx";
import { compile, withEditor } from "./design-editor-test-utils.ts";

const STORE = "10000000-0000-4000-8000-000000000001";
const OTHER = "20000000-0000-4000-8000-000000000001";
const NOW = "2026-10-02T12:00:00.000Z";
const MEDIA: StorefrontDesignMediaOption = { id: OTHER, url: "https://fixture.invalid/direct.webp", altText: "Direct image", mediaType: "image/webp", width: 1600, height: 900 };

function harness(name: "DesignAssetField" | "DesignMediaField") {
  let current!: DesignImageFieldProps;
  const module = compile<Record<string, (props: Record<string, unknown>) => ReactNode>>(new URL(`./${name}.tsx`, import.meta.url), {
    "./DesignImageField": { DesignImageField: (props: DesignImageFieldProps) => { current = props; return React.createElement("div", { "data-fixture-field": true }); } },
  });
  return { Component: module[name]!, get field() { assert.ok(current); return current; } };
}

type FetchRequest = Readonly<{ input: RequestInfo | URL; init: RequestInit }>;
async function withFetch(handler: (request: FetchRequest) => Promise<Response> | Response, run: () => Promise<void>) {
  const original = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init: RequestInit = {}) => Promise.resolve(handler({ input, init }))) as typeof fetch;
  try { await run(); } finally { globalThis.fetch = original; }
}

function operation(request: FetchRequest) {
  const id = new Headers(request.init.headers).get("idempotency-key");
  assert.ok(id);
  return id;
}

function asset(id: string, kind: StorefrontAssetKind = "logo", status: StorefrontAsset["status"] = "active"): StorefrontAsset {
  const objectKey = `stores/${STORE}/storefront/${kind}/${id}.webp`;
  return { id, storeId: STORE, kind, objectKey, publicUrl: `https://fixture.invalid/${objectKey}`, mediaType: "image/webp", altText: "Uploaded logo", width: 160, height: 80, byteSize: 1024, status, createdAt: NOW, updatedAt: NOW, ...(status === "archived" ? { archivedAt: NOW } : {}), version: 1 };
}

function response(value: unknown, status = 201) { return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } }); }
const file = () => new File(["image bytes"], "logo.webp", { type: "image/webp" });

test("asset upload uses its own endpoint and multipart contract and returns an unprefixed asset key", async () => {
  const app = harness("DesignAssetField"), requests: FetchRequest[] = [], uploaded: StorefrontAsset[] = [], writes: string[] = [];
  const busy = (_id: string, _busy: boolean) => {};
  await withFetch(request => { requests.push(request); return response({ asset: asset(operation(request)) }); }, async () => withEditor(async ({ render }) => {
    await render(React.createElement(app.Component, { label: "Logo", value: OTHER, assets: [{ id: OTHER, url: MEDIA.url, altText: "Existing", width: 160, height: 80 }], kind: "logo", frame: "logo", disabled: false, altText: "  Frozen logo  ", onChange: (value: string) => writes.push(value), onUploaded: (value: StorefrontAsset) => uploaded.push(value), onBusyChange: busy }));
    assert.equal(app.field.value, OTHER);
    assert.equal(app.field.options[0]?.key, OTHER);
    assert.equal(app.field.frame, "logo");
    assert.equal(app.field.onBusyChange, busy);
    assert.equal(app.field.onPendingChange, busy);
    const selected = file();
    const result = await app.field.onUpload!(selected);
    const request = requests[0]!;
    assert.equal(request.input, "/api/storefront-assets");
    assert.equal(request.init.method, "POST");
    assert.equal(request.init.credentials, "same-origin");
    assert.ok(request.init.body instanceof FormData);
    assert.equal(request.init.body.get("file"), selected);
    assert.equal(request.init.body.get("kind"), "logo");
    assert.equal(request.init.body.get("altText"), "Frozen logo");
    assert.ok(request.init.signal instanceof AbortSignal);
    assert.equal(uploaded.length, 1);
    assert.equal(uploaded[0]?.id, operation(request));
    assert.equal(result.key, operation(request));
    assert.equal(result.url, uploaded[0]?.publicUrl);
    assert.deepEqual(writes, [], "upload result is selected only by the generic field");
    app.field.onChange(result.key);
    assert.deepEqual(writes, [operation(request)]);
  }));
});

test("asset retry freezes file, operation id and metadata across a rerender after transient failure", async () => {
  const app = harness("DesignAssetField"), requests: FetchRequest[] = [], uploaded: StorefrontAsset[] = [];
  await withFetch(request => { requests.push(request); return requests.length === 1 ? response({ code: "unavailable" }, 503) : response({ asset: asset(operation(request), (request.init.body as FormData).get("kind") as StorefrontAssetKind) }); }, async () => withEditor(async ({ render }) => {
    const props = { label: "Logo", value: "", assets: [], kind: "logo", disabled: false, altText: "First metadata", onChange: () => {}, onUploaded: (value: StorefrontAsset) => uploaded.push(value) };
    await render(React.createElement(app.Component, props));
    const selected = file();
    await assert.rejects(app.field.onUpload!(selected));
    assert.deepEqual(uploaded, []);
    await render(React.createElement(app.Component, { ...props, label: "Changed label", kind: "hero", altText: "Changed metadata" }));
    const result = await app.field.onUpload!(selected);
    assert.equal(requests.length, 2);
    assert.equal(operation(requests[0]!), operation(requests[1]!));
    for (const request of requests) {
      const body = request.init.body as FormData;
      assert.equal(body.get("file"), selected);
      assert.equal(body.get("kind"), "logo");
      assert.equal(body.get("altText"), "First metadata");
    }
    assert.equal(result.key, operation(requests[0]!));
    assert.equal(uploaded.length, 1);
    const next = file();
    await app.field.onUpload!(next);
    assert.notEqual(operation(requests[1]!), operation(requests[2]!));
    assert.equal((requests[2]!.init.body as FormData).get("file"), next);
    assert.equal((requests[2]!.init.body as FormData).get("kind"), "hero");
    assert.equal((requests[2]!.init.body as FormData).get("altText"), "Changed metadata");
  }));
});

const invalidResponses: readonly [string, (request: FetchRequest) => unknown][] = [
  ["a mismatched operation id", () => asset(OTHER)],
  ["a mismatched asset kind", request => asset(operation(request), "hero")],
  ["an archived asset", request => asset(operation(request), "logo", "archived")],
  ["a malformed asset contract", request => ({ ...asset(operation(request)), byteSize: 0 })],
];
for (const [name, mutate] of invalidResponses) test(`asset upload rejects ${name} before notifying the consumer`, async () => {
  const app = harness("DesignAssetField"), uploaded: StorefrontAsset[] = [];
  await withFetch(request => response({ asset: mutate(request) }), async () => withEditor(async ({ render }) => {
    await render(React.createElement(app.Component, { label: "Logo", value: "", assets: [], kind: "logo", disabled: false, onChange: () => {}, onUploaded: (value: StorefrontAsset) => uploaded.push(value) }));
    await assert.rejects(app.field.onUpload!(file()));
    assert.deepEqual(uploaded, []);
  }));
});

test("unmount aborts an asset upload and an ignored-abort late response cannot notify onUploaded", async () => {
  const app = harness("DesignAssetField"), uploaded: StorefrontAsset[] = [];
  let selected!: FetchRequest, finish!: (response: Response) => void;
  await withFetch(request => { selected = request; return new Promise<Response>(resolve => { finish = resolve; }); }, async () => withEditor(async ({ render }) => {
    await render(React.createElement(app.Component, { label: "Logo", value: "", assets: [], kind: "logo", disabled: false, onChange: () => {}, onUploaded: (value: StorefrontAsset) => uploaded.push(value) }));
    const pending = app.field.onUpload!(file());
    const rejection = assert.rejects(pending);
    assert.equal(selected.init.signal?.aborted, false);
    await render(null);
    assert.equal(selected.init.signal?.aborted, true);
    finish(response({ asset: asset(operation(selected)) }));
    await rejection;
    assert.deepEqual(uploaded, []);
  }));
});

test("disabled asset adapter refuses upload even if a captured generic callback is invoked", async () => {
  const app = harness("DesignAssetField");
  let requests = 0;
  await withFetch(() => { requests += 1; throw new Error("should not fetch"); }, async () => withEditor(async ({ render }) => {
    await render(React.createElement(app.Component, { label: "Logo", value: "", assets: [], kind: "logo", disabled: true, onChange: () => {} }));
    await assert.rejects(app.field.onUpload!(file()));
    assert.equal(requests, 0);
  }));
});

test("direct media adapter delegates to the supplied callback and preserves media and legacy references", async () => {
  const app = harness("DesignMediaField"), uploads: [File, string][] = [], writes: DesignMediaReference[] = [];
  await withFetch(() => { throw new Error("direct media adapter must delegate to its supplied callback"); }, async () => withEditor(async ({ render }) => {
    const props = { label: "Masaüstü görseli", value: { kind: "media", mediaId: OTHER }, media: [MEDIA], storeName: "Fixture", disabled: false, onChange: (value: DesignMediaReference) => writes.push(value), onUpload: async (selected: File, altText: string) => { uploads.push([selected, altText]); return MEDIA; } };
    await render(React.createElement(app.Component, props));
    assert.equal(app.field.value, `media:${OTHER}`);
    assert.equal(app.field.options[0]?.key, `media:${OTHER}`);
    const selected = file();
    const result = await app.field.onUpload!(selected);
    assert.deepEqual(uploads, [[selected, "Fixture Masaüstü görseli"]]);
    assert.equal(result.key, `media:${OTHER}`);
    app.field.onChange(result.key);
    app.field.onChange("");
    assert.deepEqual(writes, [{ kind: "media", mediaId: OTHER }, null]);
    const legacy = { kind: "legacy_https" as const, url: "https://fixture.invalid/legacy.webp" };
    await render(React.createElement(app.Component, { ...props, value: legacy }));
    assert.equal(app.field.value, "legacy");
    assert.equal(app.field.options.find(option => option.key === "legacy")?.url, legacy.url);
    app.field.onChange("legacy");
    assert.deepEqual(writes[2], legacy);
  }));
});

test("direct media retry uses the same file and metadata after its supplied callback fails", async () => {
  const app = harness("DesignMediaField"), uploads: [File, string][] = [];
  await withEditor(async ({ render }) => {
    const props = { label: "Logo", value: null, media: [], storeName: "Fixture", disabled: false, onChange: () => {}, onUpload: async (selected: File, altText: string) => { uploads.push([selected, altText]); if (uploads.length === 1) throw new Error("unavailable"); return MEDIA; } };
    await render(React.createElement(app.Component, props));
    const selected = file();
    await assert.rejects(app.field.onUpload!(selected));
    await render(React.createElement(app.Component, { ...props, label: "Changed label", storeName: "Changed store" }));
    await app.field.onUpload!(selected);
    assert.deepEqual(uploads, [[selected, "Fixture Logo"], [selected, "Fixture Logo"]]);
    const next = file();
    await app.field.onUpload!(next);
    assert.deepEqual(uploads[2], [next, "Changed store Changed label"]);
  });
});
