import assert from "node:assert/strict";
import test from "node:test";
import { StorefrontAssetRepositoryError } from "@celebix/saas-data";
import { createStorefrontAssetHttpHandlers } from "./handler.ts";

const STORE = "10000000-0000-4000-8000-000000000001", OP = "30000000-0000-4000-8000-000000000001", ASSET = OP, REQUEST = "40000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-07-30T12:00:00.000Z"), ORIGIN = "https://panel.saas-staging.celebix.site";
const CREDENTIAL = `v1.test.${"A".repeat(43)}`;
const tenantContext = { schemaVersion: 1, requestId: REQUEST, principal: { id: "50000000-0000-4000-8000-000000000001", issuer: "https://identity.example.test/oidc", subject: "merchant" }, store: { id: STORE, slug: "merchant", status: "active" }, membership: { id: "60000000-0000-4000-8000-000000000001", role: "store_owner", status: "active" }, entitlements: { schemaVersion: 1, planId: "00000000-0000-4000-8000-000000000001", planCode: "free_starter", version: 1, status: "active", features: ["catalog", "media"], limits: { products: 100, staff: 1, storageBytes: 1_000_000_000 }, validFrom: "2026-01-01T00:00:00.000Z" }, locale: "tr-TR" } as const;
const asset = Object.freeze({ id: ASSET, storeId: STORE, kind: "hero", objectKey: `stores/${STORE}/storefront/hero/${ASSET}.png`, publicUrl: `https://media.example.test/stores/${STORE}/storefront/hero/${ASSET}.png`, mediaType: "image/png", altText: "Hero", width: 1, height: 1, byteSize: 67, status: "active", createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), version: 1 });
const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000000020001e221bc330000000049454e44ae426082", "hex");

function multipart(configure?: (form: FormData) => void) {
  const form = new FormData(); form.set("kind", "hero"); form.set("altText", "Hero"); form.set("file", new File([png], "hero.png", { type: "image/png" }));
  configure?.(form);
  return new Request(`${ORIGIN}/api/storefront-assets`, { method: "POST", headers: { origin: ORIGIN, cookie: `__Host-celebix_panel=${CREDENTIAL}`, "idempotency-key": OP }, body: form });
}
function handlers(overrides: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const assets = { async createAsset(input: unknown) { calls.push("create"); assert.equal((input as { tenantContext: typeof tenantContext }).tenantContext.store.id, STORE); return { asset, replayed: false }; }, async listAssets() { calls.push("list"); return [asset]; }, async archiveAsset() { calls.push("archive"); return { asset: { ...asset, status: "archived", archivedAt: NOW.toISOString(), version: 2 }, replayed: false }; }, async recoverOperation() { calls.push("recover"); return { kind: "absent" }; }, ...overrides };
  const storage = { publicUrl(key: string) { return `https://media.example.test/${key}`; }, async put(input: { objectKey: string }) { calls.push(`put:${input.objectKey}`); }, async delete(key: string) { calls.push(`delete:${key}`); } };
  const access = { readiness: { mode: "approved_staging" }, panelOrigin: ORIGIN, async resolveCredential() { return { kind: "authenticated", tenantContext }; } };
  const value = createStorefrontAssetHttpHandlers({ async resolveRuntime() { return { access, assets, storage } as never; }, now: () => NOW, requestId: () => REQUEST });
  return { calls, value };
}

test("storefront asset upload derives the store-scoped key and never accepts browser authority", async () => {
  const selected = handlers(); const response = await selected.value.upload(multipart());
  assert.equal(response.status, 201); assert.deepEqual(selected.calls, ["recover", `put:${asset.objectKey}`, "create"]);
  const forged = new Request(`${ORIGIN}/api/storefront-assets`, { headers: { "x-store-id": STORE } });
  assert.equal((await selected.value.list(forged)).status, 400);
});

test("known persistence failure cleans the object while commit unknown performs one read-only recovery", async () => {
  const known = handlers({ async createAsset() { throw new StorefrontAssetRepositoryError("asset_limit_reached"); } });
  assert.equal((await known.value.upload(multipart())).status, 409); assert.deepEqual(known.calls.filter((entry) => entry.startsWith("delete:")), [`delete:${asset.objectKey}`]);
  let recoveries = 0;
  const unknown = handlers({ async createAsset() { throw new StorefrontAssetRepositoryError("commit_unknown"); }, async recoverOperation() { recoveries += 1; return recoveries === 1 ? { kind: "absent" } : { kind: "found", result: { asset, replayed: true } }; } });
  assert.equal((await unknown.value.upload(multipart())).status, 201); assert.equal(recoveries, 2); assert.equal(unknown.calls.some((entry) => entry.startsWith("delete:")), false);
});

test("unresolved commit retry reuses one operation-derived R2 object identity", async () => {
  const selected = handlers({
    async createAsset() { throw new StorefrontAssetRepositoryError("commit_unknown"); },
    async recoverOperation() { return { kind: "absent" }; },
  });
  assert.equal((await selected.value.upload(multipart())).status, 503);
  assert.equal((await selected.value.upload(multipart())).status, 503);
  const keys = selected.calls.filter((entry) => entry.startsWith("put:")).map((entry) => entry.slice(4));
  assert.deepEqual(keys, [
    `stores/${STORE}/storefront/hero/${OP}.png`,
    `stores/${STORE}/storefront/hero/${OP}.png`,
  ]);
});

test("an exact operation replay returns durable truth before a second object upload", async () => {
  const selected = handlers({ async recoverOperation() { return { kind: "found", result: { asset, replayed: true } }; } });
  const response = await selected.value.upload(multipart());
  assert.equal(response.status, 201);
  assert.equal(selected.calls.some((entry) => entry.startsWith("put:")), false);
  assert.equal(selected.calls.includes("create"), false);
});

test("multipart upload rejects duplicate authority fields before object storage", async () => {
  const selected = handlers();
  const response = await selected.value.upload(multipart((form) => form.append("kind", "social")));
  assert.equal(response.status, 400);
  assert.equal(selected.calls.some((entry) => entry.startsWith("put:")), false);
});

test("storefront asset list and archive remain session-derived and bounded", async () => {
  const selected = handlers();
  const list = await selected.value.list(new Request(`${ORIGIN}/api/storefront-assets`, { headers: { cookie: `__Host-celebix_panel=${CREDENTIAL}` } }));
  assert.equal(list.status, 200); assert.equal((await list.json()).assets.length, 1);
  const archive = await selected.value.archive(new Request(`${ORIGIN}/api/storefront-assets`, { method: "DELETE", headers: { origin: ORIGIN, cookie: `__Host-celebix_panel=${CREDENTIAL}`, "idempotency-key": OP, "content-type": "application/json" }, body: JSON.stringify({ assetId: ASSET, expectedVersion: 1 }) }));
  assert.equal(archive.status, 200);
});
