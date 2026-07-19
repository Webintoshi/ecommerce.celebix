import assert from "node:assert/strict";
import test from "node:test";

import { parseProductMedia } from "./validation.ts";

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
