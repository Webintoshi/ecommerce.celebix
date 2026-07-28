import assert from "node:assert/strict";
import test from "node:test";

import { createMediaGateway } from "./worker.ts";

const STORE = "10000000-0000-4000-8000-000000000001";
const PRODUCT = "20000000-0000-4000-8000-000000000001";
const MEDIA = "40000000-0000-4000-8000-000000000001";
const key = `stores/${STORE}/products/${PRODUCT}/${MEDIA}.webp`;

test("gateway serves one exact private R2 object with immutable public headers", async () => {
  const calls: string[] = [];
  const gateway = createMediaGateway();
  const response = await gateway.fetch(new Request(`https://media.example.test/${key}`), {
    MEDIA_BUCKET: {
      async get(selected: string) {
        calls.push(selected);
        return { body: new Uint8Array([1, 2, 3]), size: 3, etag: "etag-1", httpEtag: '"etag-1"', httpMetadata: { contentType: "image/webp" }, customMetadata: { "celebix-sha256": "a".repeat(64), "celebix-publication": "active" } };
      },
    },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(calls, [key]);
  assert.equal(response.headers.get("content-type"), "image/webp");
  assert.equal(response.headers.get("content-length"), "3");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.match(response.headers.get("cache-control") ?? "", /immutable/);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), new Uint8Array([1, 2, 3]));
});

test("gateway requires the exact S3 custom metadata key and Worker HTTP ETag", async () => {
  const gateway = createMediaGateway();
  const object = { body: new Uint8Array([1]), size: 1, etag: "etag-1", httpEtag: '"etag-1"', httpMetadata: { contentType: "image/webp" } };
  for (const candidate of [
    { ...object, customMetadata: { celebixSha256: "a".repeat(64), "celebix-publication": "active" } as Record<string, string> },
    { ...object, httpEtag: "etag-1", customMetadata: { "celebix-sha256": "a".repeat(64), "celebix-publication": "active" } as Record<string, string> },
  ]) {
    const response = await gateway.fetch(new Request(`https://media.example.test/${key}`), {
      MEDIA_BUCKET: { async get() { return candidate; } },
    });
    assert.equal(response.status, 503);
    assert.equal(await response.text(), "");
  }
});

test("gateway returns not found for reserved or otherwise unpublished objects", async () => {
  const gateway = createMediaGateway();
  for (const publication of [undefined, "pending"] as const) {
    const response = await gateway.fetch(new Request(`https://media.example.test/${key}`), {
      MEDIA_BUCKET: { async get() { return { body: new Uint8Array([1]), size: 1, etag: "etag-1", httpEtag: '"etag-1"', httpMetadata: { contentType: "image/webp" }, customMetadata: { "celebix-sha256": "a".repeat(64), ...(publication ? { "celebix-publication": publication } : {}) } }; } },
    });
    assert.equal(response.status, 404);
  }
});

test("gateway denies private paths headers queries and unsupported methods before R2", async () => {
  let gets = 0;
  const gateway = createMediaGateway();
  const env = { MEDIA_BUCKET: { async get() { gets += 1; return null; } } };
  const requests = [
    new Request(`https://media.example.test/stores/${STORE}/exports/private.zip`),
    new Request(`https://media.example.test/${key}?download=1`),
    new Request(`https://media.example.test/${key}`, { method: "POST" }),
    new Request(`https://media.example.test/${key}`, { headers: { authorization: "Bearer private" } }),
    new Request(`https://media.example.test/${key}`, { headers: { cookie: "private=1" } }),
    new Request(`https://media.example.test/${key}`, { headers: { range: "bytes=0-1" } }),
    new Request(`https://media.example.test/${key}`, { headers: { "x-forwarded-host": "attacker.example" } }),
  ];
  for (const request of requests) assert.ok([400, 403, 405].includes((await gateway.fetch(request, env)).status));
  assert.equal(gets, 0);
});
