import assert from "node:assert/strict";
import test from "node:test";
import { createR2ProductMediaStorage } from "./r2-storage.ts";

const STORE = "10000000-0000-4000-8000-000000000001", PRODUCT = "20000000-0000-4000-8000-000000000001", MEDIA = "30000000-0000-4000-8000-000000000001";
const config = Object.freeze({ accountId: "0123456789abcdef0123456789abcdef", accessKeyId: "access-key-id", secretAccessKey: "secret-access-key-with-sufficient-entropy-123456", bucket: "celebix-product-media-staging", publicOrigin: "https://media.saas-staging.celebix.site" });

test("R2 storage signs an exact tenant object without exposing credentials in its public projection", async () => {
  let request: { url: string; init?: RequestInit } | undefined;
  const storage = createR2ProductMediaStorage(config, { async fetch(input, init) { request = { url: String(input), init }; return new Response(null, { status: 200 }); }, now: () => new Date("2026-07-18T10:00:00.000Z") });
  const objectKey = `stores/${STORE}/products/${PRODUCT}/${MEDIA}.webp`;
  await storage.put({ objectKey, mediaType: "image/webp", bytes: new Uint8Array(32) });
  assert.equal(storage.publicUrl(objectKey), `https://media.saas-staging.celebix.site/${objectKey}`);
  assert.equal(request?.init?.redirect, "manual");
  const headers = new Headers(request?.init?.headers);
  assert.match(headers.get("authorization") ?? "", /^AWS4-HMAC-SHA256 Credential=access-key-id\//);
  assert.equal(JSON.stringify(storage).includes(config.secretAccessKey), false);
});
