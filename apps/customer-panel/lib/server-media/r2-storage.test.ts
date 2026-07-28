import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createR2ProductMediaStorage } from "./r2-storage.ts";

const STORE = "10000000-0000-4000-8000-000000000001", PRODUCT = "20000000-0000-4000-8000-000000000001", MEDIA = "30000000-0000-4000-8000-000000000001";
const config = Object.freeze({ accountId: "0123456789abcdef0123456789abcdef", accessKeyId: "access-key-id", secretAccessKey: "secret-access-key-with-sufficient-entropy-123456", bucket: "celebix-product-media-staging", publicOrigin: "https://media.saas-staging.celebix.site" });

test("R2 storage signs an exact tenant object without exposing credentials in its public projection", async () => {
  let request: { url: string; init?: RequestInit } | undefined;
  const storage = createR2ProductMediaStorage(config, { async fetch(input, init) { request = { url: String(input), init }; return new Response(null, { status: 200 }); }, now: () => new Date("2026-07-18T10:00:00.000Z") });
  const objectKey = `stores/${STORE}/products/${PRODUCT}/${MEDIA}.webp`;
  const bytes = new Uint8Array(32);
  const payloadSha256 = createHash("sha256").update(bytes).digest("hex");
  await storage.put({ objectKey, mediaType: "image/webp", bytes, payloadSha256 });
  assert.equal(storage.publicUrl(objectKey), `https://media.saas-staging.celebix.site/${objectKey}`);
  assert.equal(request?.init?.redirect, "manual");
  assert.equal(request?.init?.signal instanceof AbortSignal, true);
  const headers = new Headers(request?.init?.headers);
  assert.match(headers.get("authorization") ?? "", /^AWS4-HMAC-SHA256 Credential=access-key-id\//);
  assert.equal(headers.get("x-amz-meta-celebix-sha256"), payloadSha256);
  assert.equal(headers.get("x-amz-meta-celebix-publication"), "pending");
  assert.equal(JSON.stringify(storage).includes(config.secretAccessKey), false);
});

test("R2 HEAD verifies exact length media type and payload digest", async () => {
  const objectKey = `stores/${STORE}/products/${PRODUCT}/${MEDIA}.webp`;
  const payloadSha256 = "a".repeat(64);
  const storage = createR2ProductMediaStorage(config, {
    async fetch(_input, init) {
      assert.equal(init?.method, "HEAD");
      return new Response(null, { status: 200, headers: {
        "content-length": "2048",
        "content-type": "image/webp",
        "x-amz-meta-celebix-sha256": payloadSha256,
        "x-amz-meta-celebix-publication": "pending",
      } });
    },
    now: () => new Date("2026-07-18T10:00:00.000Z"),
  });
  assert.deepEqual(await storage.head(objectKey), {
    kind: "found",
    byteSize: 2048,
    mediaType: "image/webp",
    payloadSha256,
    publication: "pending",
  });
});

test("R2 publish performs one signed self-copy that replaces pending metadata with active", async () => {
  const objectKey = `stores/${STORE}/products/${PRODUCT}/${MEDIA}.webp`;
  const selected: RequestInit[] = [];
  const storage = createR2ProductMediaStorage(config, {
    async fetch(_input, init) {
      selected.push(init ?? {});
      if (init?.method === "HEAD") return new Response(null, { status: 200, headers: { "content-length": "2048", "content-type": "image/webp", "x-amz-meta-celebix-sha256": "a".repeat(64), "x-amz-meta-celebix-publication": selected.filter((call) => call.method === "HEAD").length === 1 ? "pending" : "active" } });
      return new Response(null, { status: 200 });
    },
    now: () => new Date("2026-07-18T10:00:00.000Z"),
  });
  await storage.publish({ objectKey, mediaType: "image/webp", byteSize: 2048, payloadSha256: "a".repeat(64) });
  assert.deepEqual(selected.map((call) => call.method), ["HEAD", "PUT", "HEAD"]);
  const headers = new Headers(selected[1]?.headers);
  assert.equal(selected[1]?.body, undefined);
  assert.equal(headers.get("x-amz-copy-source"), `/${config.bucket}/${objectKey}`);
  assert.equal(headers.get("x-amz-metadata-directive"), "REPLACE");
  assert.equal(headers.get("x-amz-meta-celebix-publication"), "active");
  assert.match(headers.get("authorization") ?? "", /^AWS4-HMAC-SHA256 /);
});

test("R2 unpublish performs an exact self-copy to pending before archival", async () => {
  const objectKey = `stores/${STORE}/products/${PRODUCT}/${MEDIA}.webp`;
  const selected: RequestInit[] = [];
  const storage = createR2ProductMediaStorage(config, {
    async fetch(_input, init) {
      selected.push(init ?? {});
      if (init?.method === "HEAD") return new Response(null, { status: 200, headers: { "content-length": "2048", "content-type": "image/webp", "x-amz-meta-celebix-sha256": "a".repeat(64), "x-amz-meta-celebix-publication": selected.filter((call) => call.method === "HEAD").length === 1 ? "active" : "pending" } });
      return new Response(null, { status: 200 });
    },
    now: () => new Date("2026-07-18T10:00:00.000Z"),
  });
  await storage.unpublish(objectKey);
  assert.deepEqual(selected.map((call) => call.method), ["HEAD", "PUT", "HEAD"]);
  const headers = new Headers(selected[1]?.headers);
  assert.equal(headers.get("x-amz-meta-celebix-publication"), "pending");
  assert.equal(headers.get("x-amz-copy-source"), `/${config.bucket}/${objectKey}`);
});

test("R2 classifies PUT network and 5xx outcomes as unknown and 4xx as known rejection", async () => {
  const objectKey = `stores/${STORE}/products/${PRODUCT}/${MEDIA}.webp`;
  const bytes = new Uint8Array([1]);
  const payloadSha256 = createHash("sha256").update(bytes).digest("hex");
  for (const [failure, code] of [
    [new Error("network"), "write_unknown"],
    [new Response(null, { status: 503 }), "write_unknown"],
    [new Response(null, { status: 403 }), "write_rejected"],
  ] as const) {
    const storage = createR2ProductMediaStorage(config, {
      async fetch() { if (failure instanceof Error) throw failure; return failure; },
      now: () => new Date("2026-07-18T10:00:00.000Z"),
    });
    await assert.rejects(storage.put({ objectKey, mediaType: "image/webp", bytes, payloadSha256 }), (error: any) => error?.code === code);
  }
});

test("R2 delete completes only after an exact signed HEAD proves the object absent", async () => {
  const objectKey = `stores/${STORE}/products/${PRODUCT}/${MEDIA}.webp`;
  const methods: string[] = [];
  const storage = createR2ProductMediaStorage(config, {
    async fetch(_input, init) { methods.push(init?.method ?? ""); return new Response(null, { status: init?.method === "DELETE" ? 204 : 404 }); },
    now: () => new Date("2026-07-18T10:00:00.000Z"),
  });
  await storage.delete(objectKey);
  assert.deepEqual(methods, ["DELETE", "HEAD"]);
});

test("R2 HEAD fails closed on redirects and malformed integrity metadata", async () => {
  const objectKey = `stores/${STORE}/products/${PRODUCT}/${MEDIA}.webp`;
  for (const response of [
    new Response(null, { status: 302, headers: { location: "https://attacker.example" } }),
    new Response(null, { status: 200, headers: { "content-length": "2048", "content-type": "text/plain", "x-amz-meta-celebix-sha256": "a".repeat(64) } }),
    new Response(null, { status: 200, headers: { "content-length": "2048", "content-type": "image/webp" } }),
  ]) {
    const storage = createR2ProductMediaStorage(config, { async fetch() { return response; }, now: () => new Date("2026-07-18T10:00:00.000Z") });
    await assert.rejects(storage.head(objectKey), /product_media_storage_unavailable/);
  }
});
