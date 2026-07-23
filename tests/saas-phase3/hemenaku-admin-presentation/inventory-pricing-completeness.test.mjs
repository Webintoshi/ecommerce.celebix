import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const INVENTORY_BASE = "6cbbe8859c9ae01374ccd1488e24733e2256552c";
const DONOR = "fc6c5318b47f045a7cefcedc7612d5b10563ba32";
const ROOT = new URL("../../../", import.meta.url);
const read = (path) => readFile(new URL(path, ROOT), "utf8");
const git = (...args) => execFileSync("git", args, {
  cwd: ROOT,
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
}).trim();

const PAGE_GROUPS = Object.freeze({
  tags: Object.freeze([
    "apps/customer-panel/app/products/tags/page.tsx",
    "apps/customer-panel/app/products/tags/new/page.tsx",
    "apps/customer-panel/app/products/tags/[resourceId]/edit/page.tsx",
  ]),
  barcodeLabels: Object.freeze([
    "apps/customer-panel/app/products/barcode-labels/page.tsx",
  ]),
  purchasing: Object.freeze([
    "apps/customer-panel/app/products/purchasing/page.tsx",
    "apps/customer-panel/app/products/purchasing/[purchaseOrderId]/page.tsx",
  ]),
  inventoryCounts: Object.freeze([
    "apps/customer-panel/app/products/inventory-counts/page.tsx",
    "apps/customer-panel/app/products/inventory-counts/[countId]/page.tsx",
  ]),
  transfers: Object.freeze([
    "apps/customer-panel/app/products/transfers/page.tsx",
    "apps/customer-panel/app/products/transfers/[transferId]/page.tsx",
  ]),
  priceLists: Object.freeze([
    "apps/customer-panel/app/products/price-lists/page.tsx",
    "apps/customer-panel/app/products/price-lists/new/page.tsx",
    "apps/customer-panel/app/products/price-lists/[priceListId]/page.tsx",
  ]),
});

const MIGRATION_BUNDLES = Object.freeze(["042_catalog_product_tags", "043_inventory_purchasing", "044_inventory_counts_transfers", "045_price_lists"]);

const EXPECTED_ARTIFACTS = Object.freeze([
  ...Object.values(PAGE_GROUPS).flat(),
  ...MIGRATION_BUNDLES.flatMap((name) => [
    `apps/owner/scripts/sql/saas/202607220${name}.up.sql`,
    `apps/owner/scripts/sql/saas/202607220${name}.down.sql`,
    `apps/owner/scripts/sql/saas/202607220${name}_assertions.sql`,
  ]),
  "apps/owner/scripts/sql/saas/phase3h-merchant-completion-manifest.json",
  "packages/saas-contracts/src/catalog-admin/barcode-labels.ts",
  "packages/saas-contracts/src/inventory/index.ts",
  "packages/saas-contracts/src/inventory/inventory.test.ts",
  "packages/saas-contracts/src/inventory/types.ts",
  "packages/saas-contracts/src/inventory/validation.ts",
  "packages/saas-contracts/src/pricing/index.ts",
  "packages/saas-contracts/src/pricing/pricing.test.ts",
  "packages/saas-contracts/src/pricing/types.ts",
  "packages/saas-contracts/src/pricing/validation.ts",
  "packages/saas-data/src/inventory/canonical.ts",
  "packages/saas-data/src/inventory/errors.ts",
  "packages/saas-data/src/inventory/index.ts",
  "packages/saas-data/src/inventory/repository.test.ts",
  "packages/saas-data/src/inventory/repository.ts",
  "packages/saas-data/src/inventory/types.ts",
  "packages/saas-data/src/inventory/validation.ts",
  "packages/saas-data/src/pricing/canonical.ts",
  "packages/saas-data/src/pricing/errors.ts",
  "packages/saas-data/src/pricing/index.ts",
  "packages/saas-data/src/pricing/repository.test.ts",
  "packages/saas-data/src/pricing/repository.ts",
  "packages/saas-data/src/pricing/types.ts",
  "packages/saas-data/src/pricing/validation.ts",
  "apps/customer-panel/lib/server-inventory/runtime.ts",
  "apps/customer-panel/lib/server-inventory/runtime.test.ts",
  "apps/customer-panel/lib/server-pricing/runtime.ts",
  "apps/customer-panel/lib/server-pricing/runtime.test.ts",
  "apps/customer-panel/lib/server-panel-access/postgres-runtime.ts",
  "apps/customer-panel/lib/inventory-http/default.ts",
  "apps/customer-panel/lib/inventory-http/handler.ts",
  "apps/customer-panel/lib/inventory-http/handler.test.ts",
  "apps/customer-panel/lib/inventory-http/request-authority.ts",
  "apps/customer-panel/lib/inventory-http/request-input.ts",
  "apps/customer-panel/lib/inventory-ui/client.ts",
  "apps/customer-panel/lib/inventory-ui/client.test.ts",
  "apps/customer-panel/lib/inventory-ui/console-controller.ts",
  "apps/customer-panel/lib/pricing-http/default.ts",
  "apps/customer-panel/lib/pricing-http/handler.ts",
  "apps/customer-panel/lib/pricing-http/handler.test.ts",
  "apps/customer-panel/lib/pricing-ui/client.ts",
  "apps/customer-panel/lib/pricing-ui/client.test.ts",
  "apps/customer-panel/app/api/inventory/[...path]/route.ts",
  "apps/customer-panel/app/api/pricing/[...path]/route.ts",
  "apps/customer-panel/components/catalog-admin/BarcodeLabelConsole.tsx",
  "apps/customer-panel/components/inventory/PurchasingConsole.tsx",
  "apps/customer-panel/components/inventory/InventoryCountConsole.tsx",
  "apps/customer-panel/components/inventory/InventoryTransferConsole.tsx",
  "apps/customer-panel/components/inventory/InventoryListState.tsx",
  "apps/customer-panel/components/inventory/inventory-console.module.css",
  "apps/customer-panel/components/pricing/PriceListConsole.tsx",
  "apps/customer-panel/components/pricing/price-list-console.module.css",
  "tests/saas-phase3/catalog-product-tags/postgres-harness.mjs",
  "tests/saas-phase3/inventory-purchasing/postgres-harness.mjs",
  "tests/saas-phase3/inventory-counts-transfers/postgres-harness.mjs",
  "tests/saas-phase3/price-lists/postgres-harness.mjs",
].sort());

test("pins all six product-operation page families and their subpages", async () => {
  assert.equal(Object.keys(PAGE_GROUPS).length, 6);
  for (const [family, paths] of Object.entries(PAGE_GROUPS)) {
    assert.ok(paths.length > 0, `${family} has no routes`);
    for (const path of paths) await access(new URL(path, ROOT));
  }
});

test("pins four complete migration bundles and their disposable PostgreSQL proofs", async () => {
  assert.equal(MIGRATION_BUNDLES.length, 4);
  for (const name of MIGRATION_BUNDLES) {
    for (const suffix of [".up.sql", ".down.sql", "_assertions.sql"]) {
      await access(new URL(`apps/owner/scripts/sql/saas/202607220${name}${suffix}`, ROOT));
    }
  }
  for (const path of [
    "tests/saas-phase3/catalog-product-tags/postgres-harness.mjs",
    "tests/saas-phase3/inventory-purchasing/postgres-harness.mjs",
    "tests/saas-phase3/inventory-counts-transfers/postgres-harness.mjs",
    "tests/saas-phase3/price-lists/postgres-harness.mjs",
  ]) await access(new URL(path, ROOT));
});

test("keeps the cumulative artifact allowlist exact and reviewable", async () => {
  const securitySource = await read("tests/saas-phase3/hemenaku-admin-presentation/static-security.test.mjs");
  const serializedAllowlist = securitySource.match(
    /export const INVENTORY_PRICING_EXPECTED_ARTIFACTS = Object[.]freeze\((\[[\s\S]*?\])\);/,
  )?.[1];
  assert.ok(serializedAllowlist, "inventory/pricing cumulative artifact allowlist is stale or missing");
  assert.deepEqual(
    JSON.parse(serializedAllowlist),
    EXPECTED_ARTIFACTS,
    "inventory/pricing cumulative artifact allowlist is stale or missing",
  );
  for (const path of EXPECTED_ARTIFACTS) {
    assert.equal(git("ls-files", "--error-unmatch", path), path);
  }
});

test("registers exact inventory and pricing repositories behind server panel access", async () => {
  const runtime = await read("apps/customer-panel/lib/server-panel-access/postgres-runtime.ts");
  for (const proof of [
    /new PostgresInventoryRepository\(/,
    /new PostgresPricingRepository\(/,
    /registerServerInventoryRepository\(access, inventoryRepository\)/,
    /registerServerPricingRepository\(access, pricingRepository\)/,
    /row[.]inventory_relations !== true \|\| row[.]inventory_repository !== true/,
    /row[.]pricing_relations !== true \|\| row[.]pricing_repository !== true \|\| row[.]pricing_resolver !== true/,
    /saas[.]resolve_effective_variant_price\(uuid,uuid,text,timestamp with time zone,text\)/,
  ]) assert.match(runtime, proof);

  const inventoryRoute = await read("apps/customer-panel/app/api/inventory/[...path]/route.ts");
  assert.match(inventoryRoute, /prepareInventoryRouteRequest\(request\)/);
  assert.match(inventoryRoute, /export const GET = handle/);
  assert.match(inventoryRoute, /export const POST = handle/);

  const pricingRoute = await read("apps/customer-panel/app/api/pricing/[...path]/route.ts");
  assert.match(pricingRoute, /export const GET = handlePricingRequest/);
  assert.match(pricingRoute, /export const POST = handlePricingRequest/);
});

test("shares one effective price authority across every required consumer", async () => {
  const migration = await read("apps/owner/scripts/sql/saas/202607220045_price_lists.up.sql");
  for (const functionName of [
    "public_list_products",
    "public_get_product_by_slug",
    "quick_links_create",
    "quick_links_duplicate",
    "abandoned_carts_capture",
  ]) {
    assert.match(migration, new RegExp(`CREATE OR REPLACE FUNCTION saas[.]${functionName}\\b`));
  }
  assert.equal((migration.match(/saas[.]resolve_effective_variant_price\(/g) ?? []).length >= 6, true);
});

test("rejects donor runtime, legacy APIs, browser authority and fabricated commerce data", async () => {
  assert.equal(git("rev-parse", `${DONOR}^{commit}`), DONOR);
  assert.equal(git("diff", "--name-only", `${INVENTORY_BASE}...HEAD`, "--", "apps/admin"), "");

  const clientPaths = EXPECTED_ARTIFACTS.filter((path) =>
    path.startsWith("apps/customer-panel/") &&
    (path.includes("/app/products/") || path.includes("/components/") || path.includes("-ui/client.ts")),
  );
  const clientSource = (await Promise.all(clientPaths.map(read))).join("\n");
  assert.doesNotMatch(clientSource, /(?:from|import\s*\()[^\n]*apps\/admin|\/api\/admin\b/i);
  assert.doesNotMatch(clientSource, /@supabase|\bsupabase\b/i);
  assert.doesNotMatch(clientSource, /document[.]cookie|localStorage|sessionStorage|x-(?:tenant|store|principal|membership|plan)-id/i);
  assert.doesNotMatch(clientSource, /\b(?:storeId|tenantId|principalId|membershipId|planId|planCode|planVersion)\b/);
  assert.doesNotMatch(clientSource, /x-celebix-(?:price|stock)|searchParams[^\n]*(?:storeId|tenantId|priceCents|stockQuantity)/i);
  assert.doesNotMatch(clientSource, /\b(?:fake|fixture|mock)(?:Total|Price|Stock|Revenue|Quantity)\b/i);
  assert.doesNotMatch(clientSource, /DATABASE_URL|PGPASSWORD|SERVICE_ROLE|CLIENT_SECRET|PRIVATE_KEY/i);
  assert.doesNotMatch(clientSource, /https?:\/\//i);
});

test("keeps migration, repository, API and UI artifacts inside the pinned cumulative inventory", () => {
  const changed = git("diff", "--name-only", `${INVENTORY_BASE}...HEAD`).split("\n").filter(Boolean);
  const relevant = changed.filter((path) =>
    /2026072200(?:42|43|44|45)_/.test(path) ||
    /^packages\/saas-(?:contracts|data)\/src\/(?:inventory|pricing)\//.test(path) ||
    /^apps\/customer-panel\/(?:app\/(?:api\/(?:inventory|pricing)|products\/(?:tags|barcode-labels|purchasing|inventory-counts|transfers|price-lists))|components\/(?:inventory|pricing)|lib\/(?:server-inventory|server-pricing|inventory-http|inventory-ui|pricing-http|pricing-ui))\//.test(path),
  );
  const allowlist = new Set(EXPECTED_ARTIFACTS);
  assert.deepEqual(relevant.filter((path) => !allowlist.has(path)), []);
});
