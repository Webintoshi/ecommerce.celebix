import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

const BASE = "6563a1428434e1974f50af3ffb843eb4067f686a";
const DONOR = "fc6c5318b47f045a7cefcedc7612d5b10563ba32";
const NEXT_SECURITY_HEAD = "ce3a2e0a14d0ab15e10b98b33b4f5e7d0eeeb043";
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
  "apps/customer-panel/app/products/inventory-counts/new/page.tsx",
  "apps/customer-panel/app/products/inventory-counts/page.tsx",
  "apps/customer-panel/app/products/price-lists/[priceListId]/page.tsx",
  "apps/customer-panel/app/products/price-lists/new/page.tsx",
  "apps/customer-panel/app/products/price-lists/page.tsx",
  "apps/customer-panel/app/products/purchasing/[purchaseOrderId]/page.tsx",
  "apps/customer-panel/app/products/purchasing/new/page.tsx",
  "apps/customer-panel/app/products/purchasing/page.tsx",
  "apps/customer-panel/app/products/tags/[resourceId]/edit/page.tsx",
  "apps/customer-panel/app/products/tags/new/page.tsx",
  "apps/customer-panel/app/products/tags/page.tsx",
  "apps/customer-panel/app/products/transfers/[transferId]/page.tsx",
  "apps/customer-panel/app/products/transfers/new/page.tsx",
  "apps/customer-panel/app/products/transfers/page.tsx",
  "apps/customer-panel/components/catalog-admin/BarcodeLabelConsole.tsx",
  "apps/customer-panel/components/inventory/InventoryCountConsole.tsx",
  "apps/customer-panel/components/inventory/InventoryListState.tsx",
  "apps/customer-panel/components/inventory/InventoryLocationConsole.tsx",
  "apps/customer-panel/components/inventory/InventoryOperationForm.tsx",
  "apps/customer-panel/components/inventory/InventoryTransferConsole.tsx",
  "apps/customer-panel/components/inventory/PurchasingConsole.tsx",
  "apps/customer-panel/components/inventory/inventory-console.module.css",
  "apps/customer-panel/components/pricing/PriceListConsole.tsx",
  "apps/customer-panel/components/pricing/price-list-console.module.css",
  "apps/customer-panel/lib/catalog-ui/client.test.ts",
  "apps/customer-panel/lib/catalog-ui/client.ts",
  "apps/customer-panel/lib/catalog-ui/variant-choices.test.ts",
  "apps/customer-panel/lib/catalog-ui/variant-choices.ts",
  "apps/customer-panel/lib/inventory-http/default.ts",
  "apps/customer-panel/lib/inventory-http/handler.test.ts",
  "apps/customer-panel/lib/inventory-http/handler.ts",
  "apps/customer-panel/lib/inventory-http/request-authority.ts",
  "apps/customer-panel/lib/inventory-http/request-input.ts",
  "apps/customer-panel/lib/inventory-operation-forms.test.ts",
  "apps/customer-panel/lib/inventory-ui/client.test.ts",
  "apps/customer-panel/lib/inventory-ui/client.ts",
  "apps/customer-panel/lib/inventory-ui/console-controller.ts",
  "apps/customer-panel/lib/inventory-ui/form-choices.ts",
  "apps/customer-panel/lib/inventory-ui/form-intent.ts",
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
  "apps/owner/scripts/sql/saas/202607230046_inventory_locations.down.sql",
  "apps/owner/scripts/sql/saas/202607230046_inventory_locations.up.sql",
  "apps/owner/scripts/sql/saas/202607230046_inventory_locations_assertions.sql",
  "apps/owner/scripts/sql/saas/202607230047_pricing_preview.down.sql",
  "apps/owner/scripts/sql/saas/202607230047_pricing_preview.up.sql",
  "apps/owner/scripts/sql/saas/202607230047_pricing_preview_assertions.sql",
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
  "tests/saas-phase3/price-lists/postgres-harness.mjs",
  "apps/customer-panel/components/catalog-admin/CatalogResourceConsole.tsx",
  "apps/customer-panel/components/catalog-admin/CatalogResourceEditor.tsx",
  "apps/customer-panel/lib/catalog-admin-console.test.ts",
  "apps/customer-panel/lib/catalog-admin-ui/barcode-label-projection.test.ts",
  "apps/customer-panel/lib/catalog-admin-ui/barcode-label-projection.ts",
  "apps/customer-panel/lib/catalog-admin-ui/resource-route.ts",
  "apps/customer-panel/lib/catalog-page-access.test.ts",
  "apps/customer-panel/lib/catalog-page-access.ts",
  "apps/customer-panel/lib/catalog-page-guard.integration.test.ts",
  "apps/customer-panel/lib/inventory-console.test.ts",
  "apps/customer-panel/lib/inventory-form-choices.test.ts",
  "apps/customer-panel/lib/inventory-form-intent.test.ts",
  "apps/customer-panel/lib/panel-ui/navigation.test.ts",
  "apps/customer-panel/lib/panel-ui/navigation.ts",
  "apps/customer-panel/lib/price-list-console.test.ts",
  "apps/customer-panel/lib/routes.test.ts",
  "apps/customer-panel/lib/server-access.ts",
  "apps/customer-panel/lib/server-panel-access/decision-policy.ts",
  "apps/customer-panel/lib/server-panel-access/decision.ts",
  "packages/saas-contracts/src/authorization/actions.test.ts",
  "packages/saas-contracts/src/authorization/actions.ts",
  "packages/saas-contracts/src/catalog-admin/catalog-admin.test.ts",
  "packages/saas-contracts/src/catalog-admin/index.ts",
  "packages/saas-contracts/src/catalog-admin/types.ts",
  "packages/saas-contracts/src/contracts.test.ts",
  "packages/saas-contracts/src/index.ts",
  "packages/saas-data/src/index.ts",
  "tests/saas-phase3/advanced-seo/postgres-harness.mjs",
  "tests/saas-phase3/advanced-seo/static-security.test.mjs",
  "tests/saas-phase3/catalog-import-previews/postgres-harness.mjs",
  "tests/saas-phase3/catalog-import-previews/static-security.test.mjs",
  "tests/saas-phase3/catalog-product-tags/static-security.test.mjs",
  "tests/saas-phase3/hemenaku-admin-presentation/inventory-pricing-completeness.test.mjs",
  "tests/saas-phase3/hemenaku-admin-presentation/static-security.test.mjs",
  "tests/saas-phase3/inventory-counts-transfers/static-security.test.mjs",
  "tests/saas-phase3/inventory-locations/postgres-harness.mjs",
  "tests/saas-phase3/inventory-locations/static-security.test.mjs",
  "tests/saas-phase3/inventory-purchasing/static-security.test.mjs",
  "tests/saas-phase3/merchant-analytics/static-security.test.mjs",
  "tests/saas-phase3/price-lists/static-security.test.mjs",
  "tests/saas-phase3/pricing-preview/postgres-harness.mjs",
  "tests/saas-phase3/pricing-preview/static-security.test.mjs",
  "tests/saas-phase3/shared-merchant-catalog-dashboard/static-security.test.mjs",
  "tests/saas-phase3/typed-storefront-settings/postgres-harness.mjs",
  "tests/saas-phase3/typed-storefront-settings/static-security.test.mjs"
]);

test("pins the donor and leaves apps admin byte unchanged", () => {
  assert.equal(git("rev-parse", `${DONOR}^{commit}`), DONOR);
  assert.equal(git("rev-parse", `${NEXT_SECURITY_HEAD}^{commit}`), NEXT_SECURITY_HEAD);
  assert.equal(git("diff", "--name-only", `${BASE}...${NEXT_SECURITY_HEAD}`, "--", "apps/admin"), "apps/admin/package.json");
  assert.equal(git("diff", "--name-only", `${NEXT_SECURITY_HEAD}...HEAD`, "--", "apps/admin"), "");
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
  const protectedRoots = ["apps/admin", "deploy", "infra", "infrastructure"];
  assert.deepEqual(
    git("diff", "--name-only", `${BASE}...${NEXT_SECURITY_HEAD}`, "--", ...protectedRoots).split("\n").filter(Boolean),
    ["apps/admin/package.json"],
  );
  assert.equal(git("diff", "--name-only", `${NEXT_SECURITY_HEAD}...HEAD`, "--", ...protectedRoots), "");
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

test("browser acceptance serves both Celebix logos from immutable local target assets", async () => {
  for (const name of ["celebix-koyu-logo", "celebix-beyaz-logo"]) {
    const route = await read(`tests/saas-phase3/hemenaku-admin-presentation/browser-fixture/app/Logo/${name}.svg/route.ts`);
    assert.match(route, new RegExp(`apps/customer-panel/public/Logo/${name}[.]svg`));
    assert.match(route, /readFile/);
    assert.match(route, /resolve\(\s*process[.]cwd\(\)/);
    assert.doesNotMatch(route, /new URL|fileURLToPath/);
    assert.doesNotMatch(route, /https?:\/\//);
  }
});

test("browser acceptance mounts the real Toshi workspace behind the fixture panel shell", async () => {
  const page = await read("tests/saas-phase3/hemenaku-admin-presentation/browser-fixture/app/toshi/page.tsx");
  assert.match(page, /import \{ ToshiWorkspace \} from "@\/components\/toshi\/ToshiWorkspace"/);
  assert.match(page, /import \{ PanelShell \} from "@\/components\/panel\/PanelShell"/);
  assert.match(page, /<PanelShell model=\{MODEL\}>[\s\S]*?<ToshiWorkspace \/>[\s\S]*?<\/PanelShell>/);
  assert.match(page, /storeSlug:\s*"toshi-browser-test-store"/);
  assert.doesNotMatch(page, /fetch\(|document[.]cookie|localStorage|sessionStorage|x-(?:tenant|store)-id|\/api\/admin|https?:\/\//i);
});

test("Toshi source and fixture surfaces contain no secret or browser authority channel", async () => {
  const paths = [
    "apps/customer-panel/app/toshi/page.tsx",
    "apps/customer-panel/components/toshi/ToshiAssistant.tsx",
    "apps/customer-panel/components/toshi/ToshiDrawer.tsx",
    "apps/customer-panel/components/toshi/ToshiWorkspace.tsx",
    "apps/customer-panel/lib/toshi-local/client.ts",
    "apps/customer-panel/lib/toshi-local/intent.ts",
    "apps/customer-panel/lib/toshi-local/response.ts",
    "apps/customer-panel/lib/toshi-local/types.ts",
    "tests/saas-phase3/hemenaku-admin-presentation/browser-fixture/app/toshi/page.tsx",
    "tests/saas-phase3/hemenaku-admin-presentation/browser-fixture/app/api/[...slug]/route.ts",
  ];
  const combined = (await Promise.all(paths.map(read))).join("\n");
  assert.doesNotMatch(combined, /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|sk-[A-Za-z0-9_-]+|postgres(?:ql)?:\/\/|v1[.]panel[.]|pb1[.]|bs1[.]/i);
  assert.doesNotMatch(combined, /document[.]cookie|localStorage|sessionStorage|x-(?:tenant|store)-id|x-celebix|\/api\/admin|@supabase/i);
  assert.doesNotMatch(combined, /(?:authorization|cookie)\s*:/i);
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
  assert.match(dashboard, /<LineChart data=\{analytics[.]series\} accessibilityLayer margin=\{\{ left: 8, right: 12 \}\}>/);
  assert.match(dashboard, /<Line[\s\S]*?dataKey="revenueCents"[\s\S]*?stroke="#FE6100"/);
  assert.equal((dashboard.match(/aria-disabled="true"/g) ?? []).length, 0);
  assert.match(model, /function createAnalyticsDashboardViewModel/);
  assert.match(model, /dashboard[.]topProducts[.]map/);
  assert.match(model, /averageOrderValueCents:\s*dashboard[.]orders[.]paid === 0/);
  assert.match(model, /createMerchantDashboardSliceLoader/);
  assert.match(dashboard, /createMerchantDashboardSliceLoader\(/);
  assert.match(dashboard, /analyticsApi[.]dashboard\(analyticsPeriod[.]current\)/);
  assert.doesNotMatch(`${model}\n${dashboard}`, /\b(?:visitors?|visitorCount|devices?|deviceBreakdown|trafficSources?|trafficBreakdown)\b/i);
  assert.match(dashboard, /abandonedCartApi[.]getSummary/);
  assert.match(dashboard, /customerApi[.]summary/);
  assert.match(dashboard, /dashboard[.]orders[.]value[.]pendingOrders/);
  assert.match(dashboard, /analytics[.]topProducts[.]map/);
  assert.match(dashboard, /analytics[.]growth[.]lowStockVariants/);
  assert.doesNotMatch(dashboard, /conversion|sessions?|visitors?/i);
  assert.match(dashboard, /<PanelActionButton href="\/analytics">Analitiği görüntüle<\/PanelActionButton>/);
  assert.doesNotMatch(dashboard, /TenantContext|storeId|tenantId|principal|membershipId|planId|requestId/);
  assert.match(styles, /[.]kpiRail\s*\{[\s\S]*?grid-template-columns:\s*repeat\(5, minmax\(180px, 1fr\)\)/);
  assert.match(styles, /[.]insightGrid\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 2fr\) minmax\(280px, 1fr\)/);
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
