import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { ProductMediaRepositoryError } from "@celebix/saas-data";
import { createProductMediaHttpHandlers } from "./handler.ts";

const STORE = "10000000-0000-4000-8000-000000000001", PRODUCT = "20000000-0000-4000-8000-000000000001", OPERATION = "40000000-0000-4000-8000-000000000001", REQUEST = "50000000-0000-4000-8000-000000000001";
const TENANT_ADMIN_ORIGIN = "https://pilot-store.admin.saas-staging.celebix.site";
const TENANT_ADMIN_HOST = "pilot-store.admin.saas-staging.celebix.site";
const mediaDigest = createHash("sha256").update("celebix-product-media-v1\0").update(STORE).update("\0").update(PRODUCT).update("\0").update(OPERATION).digest("hex");
const MEDIA = `${mediaDigest.slice(0, 8)}-${mediaDigest.slice(8, 12)}-8${mediaDigest.slice(13, 16)}-8${mediaDigest.slice(17, 20)}-${mediaDigest.slice(20, 32)}`;
const CREDENTIAL = `v1.panel.current.${Buffer.alloc(32, 0x61).toString("base64url")}`;
const tenantContext = { schemaVersion: 1, requestId: REQUEST, principal: { id: "60000000-0000-4000-8000-000000000001", issuer: "https://identity.example.test/oidc", subject: "pilot" }, store: { id: STORE, slug: "pilot-store", status: "active" }, membership: { id: "70000000-0000-4000-8000-000000000001", role: "store_owner", status: "active" }, entitlements: { schemaVersion: 1, planId: "00000000-0000-4000-8000-000000000001", planCode: "free_starter", version: 1, status: "active", features: ["catalog", "media"], limits: { products: 100, staff: 1, storageBytes: 1_000_000_000 }, validFrom: "2026-01-01T00:00:00.000Z" }, locale: "tr-TR" } as const;
function png() { const value = Buffer.alloc(33); Buffer.from("89504e470d0a1a0a", "hex").copy(value); value.writeUInt32BE(13, 8); value.write("IHDR", 12); value.writeUInt32BE(1200, 16); value.writeUInt32BE(800, 20); return value; }
function fixture(options: Readonly<{ failUnpublish?: boolean; reserveError?: Error; finalizeError?: Error; recoveryStatus?: "pending" | "archived" }> = {}) {
  const calls = { put: 0, attach: 0, list: 0, reserveArchive: 0, finalizeArchive: 0, recoverArchive: 0, publish: 0, unpublish: 0, delete: 0, archiveProof: 0 };
  const reservation = (input: any, state: string, version: number) => ({ operationId: input.operationId, mediaId: input.mediaId, productId: input.productId, objectKey: `stores/${STORE}/products/${PRODUCT}/${MEDIA}.png`, publicUrl: `https://media.saas-staging.celebix.site/stores/${STORE}/products/${PRODUCT}/${MEDIA}.png`, mediaType: "image/png", byteSize: png().byteLength, payloadSha256: input.payloadSha256, state, version });
  const durable = { id: MEDIA, storeId: STORE, productId: PRODUCT, objectKey: `stores/${STORE}/products/${PRODUCT}/${MEDIA}.png`, publicUrl: `https://media.saas-staging.celebix.site/stores/${STORE}/products/${PRODUCT}/${MEDIA}.png`, mediaType: "image/png", altText: "Pilot product front", width: 1200, height: 800, byteSize: png().byteLength, sortOrder: 0, status: "active", createdAt: "2026-07-18T10:00:00.000Z", updatedAt: "2026-07-18T10:00:00.002Z", version: 1 };
  const pending = { ...durable, status: "pending", version: 2 };
  const archived = { ...durable, status: "archived", archivedAt: "2026-07-18T10:00:00.000Z", version: 3 };
  const digest = createHash("sha256").update(png()).digest("hex");
  const runtime = { access: { readiness: { mode: "approved_staging" }, panelOrigin: "https://panel.saas-staging.celebix.site", async resolveCredential() { return { kind: "authenticated", tenantContext }; } }, media: { async reserveProductMedia(input: any) { calls.attach += 1; return reservation(input, "reserved", 1); }, async markProductMediaUploaded(input: any) { return reservation(input, "uploaded", 2); }, async finalizeProductMedia(input: any) { return reservation(input, "committed", 3); }, async recoverProductMediaOperation(input: any) { return reservation(input, "committed", 3); }, async requireProductMediaCleanup(input: any) { return reservation(input, "cleanup_required", 2); }, async markProductMediaDeleted(input: any) { return reservation(input, "deleted", 3); }, async listProductMedia() { calls.list += 1; return [durable]; }, async updateAltText() { throw new Error(); }, async reorderMedia() { throw new Error(); }, async reserveArchiveMedia() { calls.reserveArchive += 1; if (options.reserveError) throw options.reserveError; return { media: pending, replayed: false }; }, async finalizeArchiveMedia() { calls.finalizeArchive += 1; if (options.finalizeError) throw options.finalizeError; return { media: archived, replayed: false }; }, async recoverArchiveMedia() { calls.recoverArchive += 1; return { media: options.recoveryStatus === "archived" ? archived : pending, replayed: true }; }, async markArchivedProductMediaObjectDeleted() { calls.archiveProof += 1; return { media: archived, replayed: false }; } }, storage: { publicUrl(key: string) { return `https://media.saas-staging.celebix.site/${key}`; }, async put() { calls.put += 1; }, async head() { return { kind: "found", byteSize: png().byteLength, mediaType: "image/png", payloadSha256: digest, publication: "pending" }; }, async publish() { calls.publish += 1; }, async unpublish() { calls.unpublish += 1; if (options.failUnpublish) throw new Error("unpublish failed"); return { kind: "found", byteSize: png().byteLength, mediaType: "image/png", payloadSha256: digest, publication: "pending" }; }, async delete() { calls.delete += 1; } } } as any;
  return { calls, handlers: createProductMediaHttpHandlers({ async resolveRuntime() { return runtime; }, now: () => new Date("2026-07-18T10:00:00.000Z"), requestId: () => REQUEST }) };
}
function uploadRequest(origin = "https://panel.saas-staging.celebix.site", extraHeaders: HeadersInit = {}) { const form = new FormData(); form.set("file", new File([png()], "pilot.png", { type: "image/png" })); form.set("altText", "Pilot product front"); return new Request(`http://customer-panel:3400/api/catalog/products/${PRODUCT}/media`, { method: "POST", headers: { origin, cookie: `__Host-celebix_panel=${CREDENTIAL}`, "idempotency-key": OPERATION, "content-length": "1024", ...extraHeaders }, body: form }); }

test("media upload derives a retry-stable ID and returns only the complete durable media projection", async () => { const selected = fixture(); const response = await selected.handlers.upload(uploadRequest(), PRODUCT); assert.equal(response.status, 201); const body = await response.json(); assert.equal(body.media.id, MEDIA); assert.equal(body.media.status, "active"); assert.equal(body.media.payloadSha256, undefined); assert.equal(body.media.state, undefined); assert.deepEqual(selected.calls, { put: 0, attach: 1, list: 1, reserveArchive: 0, finalizeArchive: 0, recoverArchive: 0, publish: 1, unpublish: 0, delete: 0, archiveProof: 0 }); });
test("media upload accepts the exact tenant admin origin serving the authenticated panel", async () => { const selected = fixture(); const response = await selected.handlers.upload(uploadRequest(TENANT_ADMIN_ORIGIN, { host: TENANT_ADMIN_HOST }), PRODUCT); assert.equal(response.status, 201); assert.deepEqual(selected.calls, { put: 0, attach: 1, list: 1, reserveArchive: 0, finalizeArchive: 0, recoverArchive: 0, publish: 1, unpublish: 0, delete: 0, archiveProof: 0 }); });
test("wrong Origin and forged store authority fail before storage or repository", async () => { for (const request of [uploadRequest("https://attacker.example"), uploadRequest(undefined, { "x-store-id": STORE })]) { const selected = fixture(); const response = await selected.handlers.upload(request, PRODUCT); assert.ok([400, 403].includes(response.status)); assert.deepEqual(selected.calls, { put: 0, attach: 0, list: 0, reserveArchive: 0, finalizeArchive: 0, recoverArchive: 0, publish: 0, unpublish: 0, delete: 0, archiveProof: 0 }); } });
test("media upload rejects another tenant origin even when forwarded headers point at this tenant", async () => { const selected = fixture(); const response = await selected.handlers.upload(uploadRequest("https://other-store.admin.saas-staging.celebix.site", { host: TENANT_ADMIN_HOST, forwarded: `host=${TENANT_ADMIN_HOST};proto=https`, "x-forwarded-host": TENANT_ADMIN_HOST, "x-forwarded-proto": "https" }), PRODUCT); assert.equal(response.status, 403); assert.deepEqual(selected.calls, { put: 0, attach: 0, list: 0, reserveArchive: 0, finalizeArchive: 0, recoverArchive: 0, publish: 0, unpublish: 0, delete: 0, archiveProof: 0 }); });
test("archive succeeds only after the exact R2 object is deleted and durable deletion proof is recorded", async () => {
  const selected = fixture();
  const body = JSON.stringify({ expectedVersion: 1 });
  const request = new Request(`http://customer-panel:3400/api/catalog/products/${PRODUCT}/media/${MEDIA}/archive`, { method: "POST", headers: { origin: "https://panel.saas-staging.celebix.site", cookie: `__Host-celebix_panel=${CREDENTIAL}`, "idempotency-key": OPERATION, "content-type": "application/json", "content-length": String(Buffer.byteLength(body)) }, body });
  const response = await selected.handlers.archive(request, PRODUCT, MEDIA);
  assert.equal(response.status, 200);
  assert.deepEqual(selected.calls, { put: 0, attach: 0, list: 0, reserveArchive: 1, finalizeArchive: 1, recoverArchive: 0, publish: 0, unpublish: 1, delete: 1, archiveProof: 1 });
});

test("archive leaves its durable pending reservation without finalizing when R2 cannot be unpublished", async () => {
  const selected = fixture({ failUnpublish: true });
  const body = JSON.stringify({ expectedVersion: 1 });
  const request = new Request(`http://customer-panel:3400/api/catalog/products/${PRODUCT}/media/${MEDIA}/archive`, { method: "POST", headers: { origin: "https://panel.saas-staging.celebix.site", cookie: `__Host-celebix_panel=${CREDENTIAL}`, "idempotency-key": OPERATION, "content-type": "application/json", "content-length": String(Buffer.byteLength(body)) }, body });
  const response = await selected.handlers.archive(request, PRODUCT, MEDIA);
  assert.equal(response.status, 503);
  assert.deepEqual(selected.calls, { put: 0, attach: 0, list: 0, reserveArchive: 1, finalizeArchive: 0, recoverArchive: 0, publish: 0, unpublish: 1, delete: 0, archiveProof: 0 });
});

test("stale archive version is rejected by durable reservation before R2 publication changes", async () => {
  const selected = fixture({ reserveError: new ProductMediaRepositoryError("version_conflict") });
  const body = JSON.stringify({ expectedVersion: 1 });
  const request = new Request(`http://customer-panel:3400/api/catalog/products/${PRODUCT}/media/${MEDIA}/archive`, { method: "POST", headers: { origin: "https://panel.saas-staging.celebix.site", cookie: `__Host-celebix_panel=${CREDENTIAL}`, "idempotency-key": OPERATION, "content-type": "application/json", "content-length": String(Buffer.byteLength(body)) }, body });
  const response = await selected.handlers.archive(request, PRODUCT, MEDIA);
  assert.equal(response.status, 409);
  assert.deepEqual(selected.calls, { put: 0, attach: 0, list: 0, reserveArchive: 1, finalizeArchive: 0, recoverArchive: 0, publish: 0, unpublish: 0, delete: 0, archiveProof: 0 });
});

test("unknown archive finalization uses one read-only durable recovery and continues deletion", async () => {
  const selected = fixture({ finalizeError: new ProductMediaRepositoryError("unavailable"), recoveryStatus: "archived" });
  const body = JSON.stringify({ expectedVersion: 1 });
  const request = new Request(`http://customer-panel:3400/api/catalog/products/${PRODUCT}/media/${MEDIA}/archive`, { method: "POST", headers: { origin: "https://panel.saas-staging.celebix.site", cookie: `__Host-celebix_panel=${CREDENTIAL}`, "idempotency-key": OPERATION, "content-type": "application/json", "content-length": String(Buffer.byteLength(body)) }, body });
  const response = await selected.handlers.archive(request, PRODUCT, MEDIA);
  assert.equal(response.status, 200);
  assert.deepEqual(selected.calls, { put: 0, attach: 0, list: 0, reserveArchive: 1, finalizeArchive: 1, recoverArchive: 1, publish: 0, unpublish: 1, delete: 1, archiveProof: 1 });
});

test("unknown archive reservation performs one read-only recovery without a second reservation write", async () => {
  const selected = fixture({ reserveError: new ProductMediaRepositoryError("unavailable"), recoveryStatus: "pending" });
  const body = JSON.stringify({ expectedVersion: 1 });
  const request = new Request(`http://customer-panel:3400/api/catalog/products/${PRODUCT}/media/${MEDIA}/archive`, { method: "POST", headers: { origin: "https://panel.saas-staging.celebix.site", cookie: `__Host-celebix_panel=${CREDENTIAL}`, "idempotency-key": OPERATION, "content-type": "application/json", "content-length": String(Buffer.byteLength(body)) }, body });
  const response = await selected.handlers.archive(request, PRODUCT, MEDIA);
  assert.equal(response.status, 200);
  assert.deepEqual(selected.calls, { put: 0, attach: 0, list: 0, reserveArchive: 1, finalizeArchive: 1, recoverArchive: 1, publish: 0, unpublish: 1, delete: 1, archiveProof: 1 });
});
