import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

const BASE = "6563a1428434e1974f50af3ffb843eb4067f686a";
const DONOR = "fc6c5318b47f045a7cefcedc7612d5b10563ba32";
const ROOT = new URL("../../../", import.meta.url);
const git = (...args) => execFileSync("git", args, {
  cwd: ROOT,
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
}).trim();
const read = (path) => readFile(new URL(path, ROOT), "utf8");
const readBytes = (path) => readFile(new URL(path, ROOT));

export const INVENTORY_PRICING_EXPECTED_ARTIFACTS = Object.freeze([
  "apps/customer-panel/app/api/inventory/[...path]/route.ts",
  "apps/customer-panel/app/api/pricing/[...path]/route.ts",
  "apps/customer-panel/app/products/barcode-labels/page.tsx",
  "apps/customer-panel/app/products/inventory-counts/[countId]/page.tsx",
  "apps/customer-panel/app/products/inventory-counts/page.tsx",
  "apps/customer-panel/app/products/price-lists/[priceListId]/page.tsx",
  "apps/customer-panel/app/products/price-lists/new/page.tsx",
  "apps/customer-panel/app/products/price-lists/page.tsx",
  "apps/customer-panel/app/products/purchasing/[purchaseOrderId]/page.tsx",
  "apps/customer-panel/app/products/purchasing/page.tsx",
  "apps/customer-panel/app/products/tags/[resourceId]/edit/page.tsx",
  "apps/customer-panel/app/products/tags/new/page.tsx",
  "apps/customer-panel/app/products/tags/page.tsx",
  "apps/customer-panel/app/products/transfers/[transferId]/page.tsx",
  "apps/customer-panel/app/products/transfers/page.tsx",
  "apps/customer-panel/components/catalog-admin/BarcodeLabelConsole.tsx",
  "apps/customer-panel/components/inventory/InventoryCountConsole.tsx",
  "apps/customer-panel/components/inventory/InventoryListState.tsx",
  "apps/customer-panel/components/inventory/InventoryTransferConsole.tsx",
  "apps/customer-panel/components/inventory/PurchasingConsole.tsx",
  "apps/customer-panel/components/inventory/inventory-console.module.css",
  "apps/customer-panel/components/pricing/PriceListConsole.tsx",
  "apps/customer-panel/components/pricing/price-list-console.module.css",
  "apps/customer-panel/lib/inventory-http/default.ts",
  "apps/customer-panel/lib/inventory-http/handler.test.ts",
  "apps/customer-panel/lib/inventory-http/handler.ts",
  "apps/customer-panel/lib/inventory-http/request-authority.ts",
  "apps/customer-panel/lib/inventory-http/request-input.ts",
  "apps/customer-panel/lib/inventory-ui/client.test.ts",
  "apps/customer-panel/lib/inventory-ui/client.ts",
  "apps/customer-panel/lib/inventory-ui/console-controller.ts",
  "apps/customer-panel/lib/pricing-http/default.ts",
  "apps/customer-panel/lib/pricing-http/handler.test.ts",
  "apps/customer-panel/lib/pricing-http/handler.ts",
  "apps/customer-panel/lib/pricing-ui/client.test.ts",
  "apps/customer-panel/lib/pricing-ui/client.ts",
  "apps/customer-panel/lib/server-inventory/runtime.test.ts",
  "apps/customer-panel/lib/server-inventory/runtime.ts",
  "apps/customer-panel/lib/server-panel-access/postgres-runtime.ts",
  "apps/customer-panel/lib/server-pricing/runtime.test.ts",
  "apps/customer-panel/lib/server-pricing/runtime.ts",
  "apps/owner/scripts/sql/saas/202607220042_catalog_product_tags.down.sql",
  "apps/owner/scripts/sql/saas/202607220042_catalog_product_tags.up.sql",
  "apps/owner/scripts/sql/saas/202607220042_catalog_product_tags_assertions.sql",
  "apps/owner/scripts/sql/saas/202607220043_inventory_purchasing.down.sql",
  "apps/owner/scripts/sql/saas/202607220043_inventory_purchasing.up.sql",
  "apps/owner/scripts/sql/saas/202607220043_inventory_purchasing_assertions.sql",
  "apps/owner/scripts/sql/saas/202607220044_inventory_counts_transfers.down.sql",
  "apps/owner/scripts/sql/saas/202607220044_inventory_counts_transfers.up.sql",
  "apps/owner/scripts/sql/saas/202607220044_inventory_counts_transfers_assertions.sql",
  "apps/owner/scripts/sql/saas/202607220045_price_lists.down.sql",
  "apps/owner/scripts/sql/saas/202607220045_price_lists.up.sql",
  "apps/owner/scripts/sql/saas/202607220045_price_lists_assertions.sql",
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
  "tests/saas-phase3/catalog-product-tags/postgres-harness.mjs",
  "tests/saas-phase3/inventory-counts-transfers/postgres-harness.mjs",
  "tests/saas-phase3/inventory-purchasing/postgres-harness.mjs",
  "tests/saas-phase3/price-lists/postgres-harness.mjs"
]);

test("pins the donor and leaves apps admin byte unchanged", () => {
  assert.equal(git("rev-parse", `${DONOR}^{commit}`), DONOR);
  assert.equal(git("diff", "--name-only", `${BASE}...HEAD`, "--", "apps/admin"), "");
});

test("declares only the approved presentation dependencies", async () => {
  const pkg = JSON.parse(await read("apps/customer-panel/package.json"));
  assert.equal(pkg.dependencies["framer-motion"], "^12.29.0");
  assert.equal(pkg.dependencies.recharts, "^3.7.0");
  assert.equal(pkg.dependencies.sonner, undefined);
  assert.equal(pkg.dependencies["@supabase/ssr"], undefined);
  assert.equal(pkg.dependencies["@supabase/supabase-js"], undefined);
});

test("keeps production deploy infrastructure and donor outside the diff", () => {
  const changed = git("diff", "--name-only", `${BASE}...HEAD`).split("\n").filter(Boolean);
  assert.equal(changed.some((path) => /^(apps\/admin|deploy|infra|infrastructure)\//.test(path)), false);
});

test("ports the exact donor brand asset and core visual tokens", async () => {
  const donorLogo = execFileSync("git", ["show", `${DONOR}:apps/admin/public/Logo/celebix-beyaz-logo.svg`], { cwd: ROOT });
  const targetLogo = await readBytes("apps/customer-panel/public/Logo/celebix-beyaz-logo.svg");
  assert.deepEqual(targetLogo, donorLogo);
  const css = await read("apps/customer-panel/app/globals.css");
  assert.match(css, /--hemenaku-orange:\s*#FF6A00/i);
  assert.match(css, /--hemenaku-sidebar:\s*#2A2A2A/i);
  assert.match(css, /--panel-touch-target:\s*48px/i);
});

test("exports donor-compatible page primitives and truthful dashboard geometry", async () => {
  const source = await read("apps/customer-panel/components/panel/PanelPageShell.tsx");
  for (const name of ["PanelPageShell", "PanelPageHeader", "PanelPanel", "PanelToolbar", "PanelBadge", "PanelStatusBadge", "PanelMetricCard", "PanelDataTable", "PanelLoadingState", "PanelActionButton", "PanelEmptyState", "PanelSkeletonBlock"]) {
    assert.match(source, new RegExp(`export function ${name}\\b`));
  }
  const dashboard = await read("apps/customer-panel/components/dashboard/PanelDashboardHomeView.tsx");
  const model = await read("apps/customer-panel/lib/panel-ui/dashboard-model.ts");
  const styles = await read("apps/customer-panel/components/dashboard/panel-dashboard.module.css");
  assert.match(dashboard, /createMerchantDashboardViewModel/);
  assert.match(dashboard, /<ResponsiveContainer width="100%" height=\{280\}>/);
  assert.match(dashboard, /<BarChart[\s\S]*?data=\{dashboard[.]catalog[.]value[.]chart\}[\s\S]*?accessibilityLayer/);
  assert.match(dashboard, /<YAxis allowDecimals=\{false\} \/>/);
  assert.match(dashboard, /<Bar dataKey="value" fill="#FF6A00" radius=\{\[8, 8, 0, 0\]\} \/>/);
  assert.equal((dashboard.match(/aria-disabled="true"/g) ?? []).length >= 2, true);
  assert.match(model, /analytics:\s*unsupportedAuthority\("analytics"\)/);
  assert.match(model, /loadMerchantDashboardSummaries/);
  assert.match(dashboard, /loadMerchantDashboardSummaries\(catalogApi, orderApi\)/);
  assert.match(dashboard, /abandonedCartApi[.]getSummary/);
  assert.match(dashboard, /customerApi[.]summary/);
  assert.match(dashboard, /dashboard\.orders\.value\.totalOrders/);
  assert.match(dashboard, /dashboard\.carts\.value\.abandoned/);
  assert.match(dashboard, /dashboard\.customers\.value\.active/);
  assert.doesNotMatch(dashboard, /LineChart|AreaChart|dataKey="(?:revenue|orders|customers|conversion)"/i);
  assert.equal((dashboard.match(/<PanelActionButton href="\/analytics">Ticari analitik<\/PanelActionButton>/g) ?? []).length, 1);
  assert.doesNotMatch(dashboard, /TenantContext|storeId|tenantId|principal|membershipId|planId|requestId/);
  assert.match(styles, /[.]metricTabs\s*\{[\s\S]*?grid-template-columns:\s*repeat\(5, minmax\(0, 1fr\)\)/);
});

test("product list ports donor presentation while preserving target commands", async () => {
  const source = await read("apps/customer-panel/components/catalog/ProductListConsole.tsx");
  assert.match(source, /catalogApi\.listProducts/);
  assert.match(source, /catalogApi\.archiveProduct\(archiveCandidate\.id, archiveCandidate\.version\)/);
  assert.match(source, /data-presentation="hemenaku-product-list"/);
  assert.match(source, /aria-label="Ürün durumu filtresi"/);
  assert.match(source, /role="alertdialog"[^>]*aria-modal="true"/);
  assert.match(source, /archiveCancelButtonRef[.]current[?][.]focus\(\)/);
  assert.match(source, /function handleArchiveDialogKeyDown/);
  assert.match(source, /event[.]key === "Escape"/);
  assert.match(source, /archiveTriggerRef[.]current = event[.]currentTarget/);
  assert.doesNotMatch(source, /\/api\/admin|storeId|tenantId|supabase|bulk-stock|homepage-curation/i);
});

test("client presentation contains no private authority or donor runtime", async () => {
  const files = git("diff", "--name-only", `${BASE}...HEAD`).split("\n").filter((path) =>
    /apps\/customer-panel\/.+\.(ts|tsx)$/.test(path) &&
    !/\.test\.[cm]?[jt]sx?$/.test(path) &&
    (path.includes("/components/") || path.includes("/catalog-ui/") || path.includes("/order-ui/") || path.includes("/panel-ui/") || path.includes("/merchant-admin-ui/")),
  );
  const source = (await Promise.all(files.map(read))).join("\n");
  assert.doesNotMatch(source, /@supabase|getAdminAuthContext|getBrowserSupabaseClient|STORE_RUNTIME|store-info-context|\/api\/admin\//i);
  assert.doesNotMatch(source, /document\.cookie|localStorage|sessionStorage|x-(?:tenant|store)-id/i);
});

test("presentation CSS preserves touch contrast overflow and reduced motion gates", async () => {
  const css = `${await read("apps/customer-panel/app/globals.css")}\n${await read("apps/customer-panel/components/panel/panel-shell.module.css")}\n${await read("apps/customer-panel/components/dashboard/panel-dashboard.module.css")}`;
  assert.match(css, /min-(?:width|height):\s*48px/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /\.01ms/);
  assert.doesNotMatch(css, /overflow-x:\s*visible/);
});

test("tracked production diff contains no secrets or forbidden identifiers", () => {
  const productionFiles = git("diff", "--name-only", `${BASE}...HEAD`).split("\n").filter((path) =>
    path && !/\.test\.[cm]?[jt]sx?$/.test(path) && !path.startsWith("tests/") && !path.startsWith("docs/") && path !== "package-lock.json",
  );
  const patch = productionFiles.length === 0 ? "" : git("diff", `${BASE}...HEAD`, "--", ...productionFiles);
  const forbiddenIds = [
    ["10000000", "0000", "4000", "8000", "000000000001"].join("-"),
    ["20000000", "0000", "4000", "8000", "000000000001"].join("-"),
  ];
  assert.doesNotMatch(patch, /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|postgres(?:ql)?:\/\/[^\s]+:[^\s]+@|v1\.panel\.|pb1\.|bs1\./i);
  assert.doesNotMatch(patch, new RegExp(forbiddenIds.join("|")));
});
