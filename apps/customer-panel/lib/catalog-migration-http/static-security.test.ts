import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROOT = new URL("../../", import.meta.url);
async function source(path: string) { return readFile(new URL(path, ROOT), "utf8"); }

test("migration routes expose no environment database secret or browser tenant authority", async () => {
  const routes = (await Promise.all([
    "app/api/catalog/admin/migrations/woocommerce/route.ts",
    "app/api/catalog/admin/migrations/woocommerce/[jobId]/route.ts",
    "app/api/catalog/admin/migrations/woocommerce/[jobId]/batch/route.ts",
    "app/api/catalog/admin/migrations/woocommerce/[jobId]/media/route.ts",
  ].map(source))).join("\n");
  assert.doesNotMatch(routes, /process[.]env|postgres|\bpg\b|secret|storeId|tenantId|x-store|x-tenant/i);
  const publicSources = (await Promise.all(["lib/catalog-migration-http/handler.ts", "lib/catalog-migration-http/client.ts", "lib/catalog-migration-http/workflow.ts", "components/catalog-admin/CatalogBulkImportConsole.tsx"].map(source))).join("\n");
  assert.doesNotMatch(publicSources, /localStorage|sessionStorage|x-store-id|x-tenant-id|x-principal-id|x-membership-id|x-plan-id|supabase|\/api\/admin/);
  assert.doesNotMatch(publicSources, /console[.](?:log|info|warn|error)|JSON[.]stringify\([^)]*sourceUrl/);
});

test("remote image fetch is server-only bounded and sends no ambient authority", async () => {
  const fetcher = await source("lib/catalog-migration/remote-image-fetcher.ts");
  assert.match(fetcher, /MAX_BYTES = 5_242_880/);
  assert.match(fetcher, /MAX_REDIRECTS = 3/);
  assert.match(fetcher, /rejectUnauthorized: true/);
  assert.match(fetcher, /checkServerIdentity/);
  assert.doesNotMatch(fetcher, /cookie|authorization|referer|forwarded|console[.]/i);
});
