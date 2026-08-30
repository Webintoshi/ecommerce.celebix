import assert from "node:assert/strict";
import test from "node:test";

import { createProductMediaApiClient, ProductMediaApiError } from "./media-client.ts";

const PRODUCT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MEDIA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OPERATION = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ITEM = Object.freeze({
  id: MEDIA, productId: PRODUCT,
  publicUrl: `https://media.saas-staging.celebix.site/stores/dddddddd-dddd-4ddd-8ddd-dddddddddddd/products/${PRODUCT}/${MEDIA}.png`,
  mediaType: "image/png", altText: "Ön görünüm", width: 1200, height: 800, byteSize: 33,
  sortOrder: 0, status: "active", cleanupState: "active", createdAt: "2026-07-18T10:00:00.000Z",
  updatedAt: "2026-07-18T10:00:00.000Z", version: 1,
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("media reads and mutations preserve same-origin authority without browser tenant fields", async () => {
  const calls: Array<[string, RequestInit]> = [];
  const client = createProductMediaApiClient({
    randomUUID: () => OPERATION,
    fetch: async (input, init) => {
      calls.push([String(input), init ?? {}]);
      if ((init?.method ?? "GET") === "GET") return json({ media: [ITEM] });
      if (String(input).endsWith("/reorder")) return json({ media: [ITEM] });
      return json({ media: ITEM, replayed: false });
    },
    upload: async () => { throw new Error("unused"); },
  });

  assert.deepEqual(await client.list(PRODUCT), [ITEM]);
  await client.updateAlt(PRODUCT, MEDIA, { expectedVersion: 1, altText: "Yeni alt metin" });
  await client.reorder(PRODUCT, [MEDIA]);
  await client.archive(PRODUCT, MEDIA, 1);

  assert.equal(calls.length, 4);
  assert.deepEqual(calls[0], [`/api/catalog/products/${PRODUCT}/media`, { method: "GET", credentials: "same-origin", cache: "no-store" }]);
  for (const [, init] of calls.slice(1)) {
    assert.equal(init.credentials, "same-origin");
    const headers = new Headers(init.headers);
    assert.equal(headers.get("content-type"), "application/json");
    assert.equal(headers.get("idempotency-key"), OPERATION);
    assert.equal(String(init.body).includes("storeId"), false);
  }
});

test("upload receives the exact bounded file and reports transport progress", async () => {
  const progress: number[] = [];
  let selected: Readonly<{ path: string; operationId: string; form: FormData; onProgress(value: number): void }> | undefined;
  const client = createProductMediaApiClient({
    randomUUID: () => OPERATION,
    fetch: async () => { throw new Error("unused"); },
    upload: async (input) => {
      selected = input;
      input.onProgress(37);
      input.onProgress(99);
      return json({ media: ITEM, replayed: false }, 201);
    },
  });
  const file = new File([new Uint8Array([1, 2, 3])], "urun.png", { type: "image/png" });
  const result = await client.upload(PRODUCT, { file, altText: "Ön görünüm", onProgress: (value) => progress.push(value) });
  assert.equal(selected?.path, `/api/catalog/products/${PRODUCT}/media`);
  assert.equal(selected?.operationId, OPERATION);
  assert.equal(selected?.form.get("file"), file);
  assert.equal(selected?.form.get("altText"), "Ön görünüm");
  assert.equal(selected?.form.has("storeId"), false);
  assert.deepEqual(progress, [37, 99, 100]);
  assert.deepEqual(result.media, ITEM);
});

test("media failures expose only finite Turkish messages", async () => {
  const client = createProductMediaApiClient({
    randomUUID: () => OPERATION,
    fetch: async () => json({ code: "media_limit_reached", driver: "secret" }, 409),
    upload: async () => { throw new Error("unused"); },
  });
  await assert.rejects(() => client.list(PRODUCT), (error: unknown) => {
    assert.equal(error instanceof ProductMediaApiError, true);
    assert.equal((error as ProductMediaApiError).code, "media_limit_reached");
    assert.doesNotMatch((error as Error).message, /driver|secret/i);
    return true;
  });
});
