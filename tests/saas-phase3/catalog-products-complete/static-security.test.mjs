import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const read = (relative) => readFileSync(path.join(ROOT, relative), "utf8");

test("catalog products complete manifest pins the additive migration artifacts", () => {
  const sql = path.join(ROOT, "apps/owner/scripts/sql/saas");
  const manifest = JSON.parse(readFileSync(path.join(sql, "phase5e-catalog-products-complete-manifest.json"), "utf8"));
  assert.equal(manifest.phase, "phase5e-catalog-products-complete");
  assert.equal(manifest.postgresqlMajor, 16);
  assert.equal(manifest.externalConnections, 0);
  assert.equal(manifest.productionMutations, 0);
  assert.equal(manifest.artifacts.length, 6);
  for (const artifact of manifest.artifacts) {
    assert.equal(createHash("sha256").update(readFileSync(path.join(sql, artifact.file))).digest("hex"), artifact.sha256, artifact.file);
  }
});

test("preview tokens are short lived, key rotated and bound to server authority", () => {
  const token = read("apps/customer-panel/lib/product-preview/token.ts");
  const config = read("apps/customer-panel/lib/product-preview/config.ts");
  const server = read("apps/customer-panel/lib/product-preview/server.ts");
  const route = read("apps/customer-panel/app/products/[productId]/preview/page.tsx");
  assert.match(token, /ttl=options[.]ttlSeconds[?][?]300/);
  assert.match(token, /ttl>300/);
  assert.match(token, /storeId.*productId.*principalId.*version/);
  assert.match(token, /timingSafeEqual/);
  assert.match(config, /CELEBIX_PRODUCT_PREVIEW_ACTIVE_KEY_ID/);
  assert.match(config, /CELEBIX_PRODUCT_PREVIEW_KEYS/);
  assert.match(server, /tenantContext[.]store[.]id/);
  assert.match(server, /tenantContext[.]principal[.]id/);
  assert.match(route, /robots:\{index:false,follow:false\}/);
  assert.doesNotMatch(`${server}\n${route}`, /NEXT_PUBLIC_|localStorage|sessionStorage/);
});

test("browser media projections exclude storage authority and cleanup verifies deletion", () => {
  const contracts = read("packages/saas-contracts/src/media/types.ts");
  const lifecycle = contracts.slice(
    contracts.indexOf("export type ProductMediaLifecycle"),
    contracts.indexOf("}>;", contracts.indexOf("export type ProductMediaLifecycle")) + 3,
  );
  const handler = read("apps/customer-panel/lib/media-http/handler.ts");
  const cleanup = read("apps/customer-panel/lib/server-media/cleanup-service.ts");
  assert.doesNotMatch(lifecycle, /objectKey|storeId/);
  assert.match(handler, /cleanupState/);
  assert.match(lifecycle, /retentionExpiresAt/);
  assert.match(handler, /listProductMediaLifecycle/);
  assert.match(cleanup, /storage[.]delete/);
  assert.match(cleanup, /storage[.]head/);
  assert.match(cleanup, /recordArchivedProductMediaObjectDeleted/);
});

test("bulk and permanent removal remain server-side authorization boundaries", () => {
  const handler = read("apps/customer-panel/lib/catalog-http/handler.ts");
  const migration = read("apps/owner/scripts/sql/saas/202608300117_catalog_product_bulk_safe_removal.up.sql");
  assert.match(handler, /async function authorize/);
  assert.match(handler, /createCatalogRequestAuthorityValidator/);
  assert.match(handler, /bulkMutateProducts/);
  assert.match(handler, /getProductRemovalEligibility/);
  assert.match(handler, /removeProduct/);
  assert.match(migration, /merchant_action_authority_error/);
  assert.match(migration, /FOR UPDATE OF product/);
  assert.match(migration, /pg_constraint/);
  assert.match(migration, /removal_not_eligible/);
  assert.doesNotMatch(`${handler}\n${migration}`, /apps\/admin/);
});
