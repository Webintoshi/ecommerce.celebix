import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("the current staging build retains its deploy contract while exposing the durable Güzide migration surface", async () => {
  const packageJson = JSON.parse(await source("package.json"));
  assert.equal(
    packageJson.scripts["build:coolify:customer-panel"],
    "npm run generate:iyzico-sandbox-build && npm run build --workspace @celebix/customer-panel",
  );

  for (const path of [
    "apps/owner/scripts/sql/saas/202607280059_catalog_product_migrations.up.sql",
    "apps/customer-panel/app/api/catalog/admin/migrations/woocommerce/route.ts",
    "apps/customer-panel/lib/catalog-migration-http/workflow.ts",
    "apps/customer-panel/lib/catalog-import/woocommerce-migration.ts",
    "packages/saas-data/src/catalog-migration/repository.ts",
  ]) {
    await access(new URL(path, root));
  }

  const bulkUpload = await source("apps/customer-panel/app/products/bulk-upload/page.tsx");
  assert.match(bulkUpload, /WooCommerceMigrationConsole/);
});
