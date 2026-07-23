import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { digestCatalogImport } from "./digest.ts";

test("binds the SHA-256 digest to format and exact content", () => {
  const content = "title,slug,priceCents,sku,stockQuantity\nKahve,kahve,25000,KHV-1,5";
  const expected = createHash("sha256").update("native_csv").update("\0").update(content, "utf8").digest("hex");
  assert.equal(digestCatalogImport("native_csv", content), expected);
  assert.notEqual(digestCatalogImport("shopify_csv", content), expected);
  assert.match(expected, /^[0-9a-f]{64}$/);
});
