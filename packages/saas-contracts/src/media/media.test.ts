import assert from "node:assert/strict";
import test from "node:test";

import { parseProductMedia, parseProductMediaLifecycle, parseProductMediaReservation } from "./validation.ts";

const STORE_ID = "10000000-0000-4000-8000-000000000001";
const PRODUCT_ID = "20000000-0000-4000-8000-000000000001";
const MEDIA_ID = "40000000-0000-4000-8000-000000000001";

test("merchant media contract requires tenant-namespaced immutable object authority", () => {
  const parsed = parseProductMedia({ id: MEDIA_ID, storeId: STORE_ID, productId: PRODUCT_ID, objectKey: `stores/${STORE_ID}/products/${PRODUCT_ID}/${MEDIA_ID}.png`, publicUrl: `https://media.saas-staging.celebix.site/stores/${STORE_ID}/products/${PRODUCT_ID}/${MEDIA_ID}.png`, mediaType: "image/png", altText: "Pilot product", width: 800, height: 600, byteSize: 1024, sortOrder: 0, status: "active", createdAt: "2026-07-18T10:00:00.000Z", updatedAt: "2026-07-18T10:00:00.000Z", version: 1 });
  assert.equal(Object.isFrozen(parsed), true);
  assert.throws(() => parseProductMedia({ ...parsed, objectKey: `products/${PRODUCT_ID}/${MEDIA_ID}.png` }));
  assert.throws(() => parseProductMedia({ ...parsed, mediaType: "image/svg+xml" }));
  assert.throws(() => parseProductMedia({ ...parsed, publicUrl: "http://media.example.test/file.png" }));
});

test("merchant media lifecycle projection exposes retention truth without storage authority", () => {
  const archived = parseProductMediaLifecycle({
    id: MEDIA_ID,
    productId: PRODUCT_ID,
    publicUrl: `https://media.saas-staging.celebix.site/stores/${STORE_ID}/products/${PRODUCT_ID}/${MEDIA_ID}.png`,
    mediaType: "image/png",
    altText: "Archived product",
    width: 800,
    height: 600,
    byteSize: 1024,
    sortOrder: 0,
    status: "archived",
    cleanupState: "retained",
    createdAt: "2026-07-18T10:00:00.000Z",
    updatedAt: "2026-08-30T10:00:00.000Z",
    archivedAt: "2026-08-30T10:00:00.000Z",
    retentionExpiresAt: "2026-09-29T10:00:00.000Z",
    version: 3,
  });
  assert.equal(Object.isFrozen(archived), true);
  assert.equal(archived.cleanupState, "retained");
  assert.equal("objectKey" in archived, false);
  assert.equal("storeId" in archived, false);
  assert.throws(() => parseProductMediaLifecycle({ ...archived, objectKey: `stores/${STORE_ID}/products/${PRODUCT_ID}/${MEDIA_ID}.png` }));
  assert.throws(() => parseProductMediaLifecycle({ ...archived, cleanupState: "object_deleted", publicUrl: archived.publicUrl }));
  assert.throws(() => parseProductMediaLifecycle({ ...archived, status: "active" }));
});

test("media reservation contract is exact, immutable, and tenant namespaced", () => {
  const reservation = parseProductMediaReservation({
    operationId: "50000000-0000-4000-8000-000000000001",
    mediaId: MEDIA_ID,
    productId: PRODUCT_ID,
    objectKey: `stores/${STORE_ID}/products/${PRODUCT_ID}/${MEDIA_ID}.webp`,
    publicUrl: `https://media.saas-staging.celebix.site/stores/${STORE_ID}/products/${PRODUCT_ID}/${MEDIA_ID}.webp`,
    mediaType: "image/webp",
    byteSize: 2048,
    payloadSha256: "a".repeat(64),
    state: "reserved",
    version: 1,
  }, STORE_ID);
  assert.equal(Object.isFrozen(reservation), true);
  assert.throws(() => parseProductMediaReservation({ ...reservation, objectKey: `stores/${STORE_ID}/exports/forged.webp` }, STORE_ID));
  assert.throws(() => parseProductMediaReservation({ ...reservation, payloadSha256: "A".repeat(64) }, STORE_ID));
  assert.throws(() => parseProductMediaReservation({ ...reservation, state: "pending" }, STORE_ID));
  assert.throws(() => parseProductMediaReservation({ ...reservation, bucket: "private" }, STORE_ID));
});
