import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../");
const COMPLETION_SOURCES = Object.freeze([
  "apps/customer-panel/app/products/auto-import/page.tsx",
  "apps/customer-panel/app/products/shopify-converter/page.tsx",
  "apps/customer-panel/app/seo/categories/page.tsx",
  "apps/customer-panel/app/seo/content/page.tsx",
  "apps/customer-panel/app/seo/geo-optimization/page.tsx",
  "apps/customer-panel/app/seo/internal-linking/page.tsx",
  "apps/customer-panel/app/seo/pages/page.tsx",
  "apps/customer-panel/app/seo/products/page.tsx",
  "apps/customer-panel/app/settings/artificial-intelligence/page.tsx",
  "apps/customer-panel/components/catalog-admin/CatalogBulkImportConsole.tsx",
  "apps/customer-panel/components/catalog-admin/CatalogImportPreparationConsole.tsx",
  "apps/customer-panel/components/merchant-admin/MerchantModuleConsole.tsx",
  "apps/customer-panel/lib/catalog-admin-http/default.ts",
  "apps/customer-panel/lib/catalog-admin-http/handler.ts",
  "apps/customer-panel/lib/catalog-admin-ui/client.ts",
  "apps/customer-panel/lib/catalog-admin-ui/import-preparation-controller.ts",
  "apps/customer-panel/lib/catalog-import/csv.ts",
  "apps/customer-panel/lib/catalog-import/digest.ts",
  "apps/customer-panel/lib/merchant-admin-ui/presentation.ts",
  "apps/customer-panel/lib/server-catalog-admin/runtime.ts",
  "apps/owner/scripts/sql/saas/202607220040_advanced_seo_preferences.up.sql",
  "apps/owner/scripts/sql/saas/202607220041_catalog_import_previews.up.sql",
  "packages/saas-contracts/src/catalog-admin/types.ts",
  "packages/saas-contracts/src/catalog-admin/validation.ts",
  "packages/saas-contracts/src/merchant-admin/types.ts",
  "packages/saas-data/src/catalog-admin/repository.ts",
  "packages/saas-data/src/catalog-admin/types.ts",
  "packages/saas-data/src/catalog-admin/validation.ts",
  "packages/saas-data/src/merchant-admin/validation.ts",
]);

async function readCompletionSources() {
  return (await Promise.all(COMPLETION_SOURCES.map((file) => readFile(path.join(ROOT, file), "utf8")))).join("\n");
}

test("provider-gated tools remain local and secret-free", async () => {
  const source = await readCompletionSources();
  assert.doesNotMatch(source, /fetch\(["'`]https?:|shopify\.com|openai\.com|apiKey|clientSecret|accessToken|dangerouslySetInnerHTML|<iframe/i);
  assert.match(source, /awaiting_provider_activation|Sağlayıcı etkinleştirilmeden/);
});
