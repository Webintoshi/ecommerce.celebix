import assert from "node:assert/strict";
import test from "node:test";

import { CatalogAdminApiError } from "./client.ts";
import { selectBrandLogoAssets, uploadBrandLogo, withBrandLogoConfig } from "./brand-logo.ts";

const STORE = "10000000-0000-4000-8000-000000000001";
const LOGO = "20000000-0000-4000-8000-000000000001";
const HERO = "20000000-0000-4000-8000-000000000002";
const ARCHIVED = "20000000-0000-4000-8000-000000000003";
const NOW = "2026-08-03T12:00:00.000Z";

function asset(id: string, kind: "logo" | "hero", status: "active" | "archived" = "active") {
  const extension = "webp";
  const objectKey = `stores/${STORE}/storefront/${kind}/${id}.${extension}`;
  return {
    id,
    storeId: STORE,
    kind,
    objectKey,
    publicUrl: `https://media.saas-staging.celebix.site/${objectKey}`,
    mediaType: "image/webp",
    altText: kind === "logo" ? "Güzide Kuyumcu" : "Vitrin",
    width: kind === "logo" ? 480 : 1600,
    height: kind === "logo" ? 160 : 900,
    byteSize: 2048,
    status,
    createdAt: NOW,
    updatedAt: NOW,
    ...(status === "archived" ? { archivedAt: NOW } : {}),
    version: 1,
  };
}

test("brand logo selection parses the whole envelope and retains only active logos", () => {
  const selected = selectBrandLogoAssets({ code: "ok", assets: [asset(LOGO, "logo"), asset(HERO, "hero"), asset(ARCHIVED, "logo", "archived")] }, LOGO);
  assert.deepEqual(selected.assets.map(({ id }) => id), [LOGO]);
  assert.equal(selected.selectedId, LOGO);
  assert.equal(Object.isFrozen(selected), true);
  assert.equal(Object.isFrozen(selected.assets), true);
  assert.equal(selectBrandLogoAssets({ code: "ok", assets: [asset(LOGO, "logo")] }, HERO).selectedId, undefined);
});

test("brand logo selection rejects malformed and oversized asset envelopes", () => {
  assert.throws(() => selectBrandLogoAssets({ assets: [] }), (error: unknown) => error instanceof CatalogAdminApiError && error.code === "unavailable");
  assert.throws(() => selectBrandLogoAssets({ code: "ok", assets: [{ ...asset(LOGO, "logo"), objectKey: "private/logo.webp" }] }), /Katalog yönetimi şu anda kullanılamıyor/);
  assert.throws(() => selectBrandLogoAssets({ code: "ok", assets: Array.from({ length: 65 }, () => asset(LOGO, "logo")) }), /Katalog yönetimi şu anda kullanılamıyor/);
});

test("brand config preserves public website data while adding and removing only the logo reference", () => {
  const source = Object.freeze({ website: "https://guzide.example", logoAssetId: HERO });
  assert.deepEqual(withBrandLogoConfig(source, LOGO), { website: "https://guzide.example", logoAssetId: LOGO });
  assert.deepEqual(withBrandLogoConfig(source), { website: "https://guzide.example" });
  assert.deepEqual(source, { website: "https://guzide.example", logoAssetId: HERO });
  assert.throws(() => withBrandLogoConfig(source, "not-a-uuid"), /catalog_admin_brand_logo_invalid/);
});

test("brand logo upload sends one exact same-origin multipart request and parses durable truth", async (context) => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  context.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });
    return Response.json({ code: "created", asset: asset(LOGO, "logo"), replayed: false }, { status: 201 });
  });
  const file = new File([new Uint8Array([1, 2, 3])], "guzide-logo.webp", { type: "image/webp" });

  const uploaded = await uploadBrandLogo(file, "Güzide Kuyumcu", LOGO);
  assert.equal(uploaded.id, LOGO);
  assert.equal(calls.length, 1);
  assert.equal(String(calls[0]?.input), "/api/storefront-assets");
  assert.equal(calls[0]?.init?.method, "POST");
  assert.equal(calls[0]?.init?.credentials, "same-origin");
  assert.equal(calls[0]?.init?.cache, "no-store");
  assert.deepEqual([...new Headers(calls[0]?.init?.headers).entries()], [["idempotency-key", LOGO]]);
  const body = calls[0]?.init?.body;
  assert.ok(body instanceof FormData);
  assert.deepEqual([...body.keys()].sort(), ["altText", "file", "kind"]);
  assert.equal(body.get("kind"), "logo");
  assert.equal(body.get("altText"), "Güzide Kuyumcu");
  assert.equal(body.get("file"), file);
});

test("brand logo upload maps failed or malformed responses to one safe error", async (context) => {
  context.mock.method(globalThis, "fetch", async () => Response.json({ code: "unavailable" }, { status: 503 }));
  const file = new File([new Uint8Array([1])], "logo.webp", { type: "image/webp" });
  await assert.rejects(() => uploadBrandLogo(file, "Güzide Kuyumcu", LOGO), (error: unknown) => error instanceof CatalogAdminApiError && error.code === "unavailable" && error.status === 503);
});
