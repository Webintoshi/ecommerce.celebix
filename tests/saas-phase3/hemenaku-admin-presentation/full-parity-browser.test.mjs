import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../");
const read = (file) => readFile(path.join(ROOT, file), "utf8");

const SCREENSHOTS = Object.freeze([
  "dashboard-desktop-1440x900.png",
  "analytics-desktop-1280x800.png",
  "orders-print-desktop-1280x800.png",
  "catalog-editor-desktop-1280x800.png",
  "settings-desktop-1280x800.png",
  "seo-desktop-1280x800.png",
  "boundary-desktop-1025x768.png",
  "boundary-mobile-1024x768.png",
  "dashboard-mobile-390x844.png",
  "drawer-mobile-390x844.png",
  "products-mobile-390x844.png",
  "inventory-count-mobile-390x844.png",
  "price-lists-mobile-390x844.png",
  "dashboard-mobile-320x720.png",
]);

test("declares exactly fourteen named full-parity screenshots and JSON output", async () => {
  const runner = await read("tests/saas-phase3/hemenaku-admin-presentation/browser-acceptance.mjs");
  assert.match(runner, /\.codex-artifacts\/hemenaku-admin-full-parity/);
  for (const screenshot of SCREENSHOTS) assert.equal(runner.split(screenshot).length - 1, 1, screenshot);
  assert.match(runner, /browser-acceptance\.json/);
});

test("measures every responsive and accessibility invariant", async () => {
  const runner = await read("tests/saas-phase3/hemenaku-admin-presentation/browser-acceptance.mjs");
  for (const marker of [
    "minimumTarget", "primaryContrast", "reducedMotionDuration", "workspaceBottomPadding",
    "focusedInputDockClearance", "horizontalOverflow", "boundaryMode", "productsEvilActive",
    "Escape", "backdrop", "close-button", "swipe", "focusRestored",
  ]) assert.match(runner, new RegExp(marker));
  assert.match(runner, /consoleErrors/);
  assert.match(runner, /runtimeExceptions/);
  assert.match(runner, /externalRequests/);
});

test("fixture exposes deterministic production transport records without external success claims", async () => {
  const fixture = [
    await read("tests/saas-phase3/hemenaku-admin-presentation/browser-fixture/app/api/[...slug]/route.ts"),
    await read("tests/saas-phase3/hemenaku-admin-presentation/browser-fixture/app/api/merchant-admin/[...slug]/route.ts"),
  ].join("\n");
  for (const marker of [
    "analytics/dashboard", "orders/", "customers/", "catalog/admin/resources/extra/",
    "catalog/products", "records/seo_product_entry", "records/general_setting",
    "replayed",
  ]) assert.match(fixture, new RegExp(marker));
  assert.doesNotMatch(fixture, /service_role|client_secret|access.?token|api.?key|synchronized|delivered|indexed/i);
  assert.doesNotMatch(fixture, /https?:\/\//i);
});

test("SEO replay fixture uses a canonical UUID and the production typed configuration validator", async () => {
  const [runner, api] = await Promise.all([
    read("tests/saas-phase3/hemenaku-admin-presentation/browser-acceptance.mjs"),
    read("tests/saas-phase3/hemenaku-admin-presentation/browser-fixture/app/api/merchant-admin/[...slug]/route.ts"),
  ]);
  const resourceId = "71000000-0000-4000-8000-000000000099";
  assert.ok(runner.includes(`resourceId:'${resourceId}'`));
  assert.ok(api.includes("resourceId: PRODUCT_RESOURCE"));
  assert.match(api, /merchantAdminConfig\(["']seo_product_entry["'],\s*body[.]config\)/u);
  assert.doesNotMatch(`${runner}\n${api}`, /resourceId:\s*["']keten-gomlek["']/u);
});

test("fixture delegates geometry contrast and reduced motion to production target components", async () => {
  const [component, css, config, runner] = await Promise.all([
    read("tests/saas-phase3/hemenaku-admin-presentation/browser-fixture/app/full-parity-fixture.tsx"),
    read("tests/saas-phase3/hemenaku-admin-presentation/browser-fixture/app/fixture.css"),
    read("tests/saas-phase3/hemenaku-admin-presentation/browser-fixture/next.config.mjs"),
    read("tests/saas-phase3/hemenaku-admin-presentation/browser-acceptance.mjs"),
  ]);
  assert.doesNotMatch(component, /FixtureDto|fixture-metrics|fixture-surface|PanelDataTable/);
  assert.match(component, /data-target-route/);
  assert.doesNotMatch(component, /data-primary-action/);
  assert.doesNotMatch(css, /data-primary-action|prefers-reduced-motion|transition-duration|animation-duration/);
  assert.match(runner, /targetPrimaryAction/);
  assert.match(runner, /targetReducedMotion/);
  assert.match(config, /devIndicators:\s*false/);
});

test("all eleven representative routes mount production components with deterministic client or state injection", async () => {
  const fixture = await read("tests/saas-phase3/hemenaku-admin-presentation/browser-fixture/app/full-parity-fixture.tsx");
  for (const component of [
    "PanelDashboardPresentation",
    "AnalyticsDashboard",
    "OrderPrintView",
    "CustomerEditConsole",
    "CatalogExtraPreview",
    "PurchasingConsole",
    "InventoryCountConsole",
    "InventoryTransferConsole",
    "PriceListConsole",
    "MerchantModuleConsole",
    "CatalogImportPreparationConsole",
  ]) assert.match(fixture, new RegExp(`<${component}\\b`), component);
  for (const route of [
    "/", "/analytics", "/orders/ORDER_ID/print", "/customers/CUSTOMER_ID/edit",
    "/products/extras/RESOURCE_ID/preview", "/products/purchasing",
    "/products/inventory-counts", "/products/transfers", "/products/price-lists",
    "/seo/products", "/products/shopify-converter",
  ]) assert.ok(fixture.includes(JSON.stringify(route)), route);
  assert.match(fixture, /initialItems=\{FIXTURE_PURCHASES\}/);
  assert.match(fixture, /initialItems=\{FIXTURE_COUNTS\}/);
  assert.match(fixture, /initialItems=\{FIXTURE_TRANSFERS\}/);
  assert.match(fixture, /initialItems=\{FIXTURE_PRICE_LISTS\}/);
  assert.match(fixture, /data-target-route=/);
  assert.doesNotMatch(fixture, /FixtureDto|PanelDataTable|fixture-surface/);
});

test("runner blocks external requests before dispatch and accounts for web sockets", async () => {
  const runner = await read("tests/saas-phase3/hemenaku-admin-presentation/browser-acceptance.mjs");
  for (const marker of ["Fetch.enable", "Fetch.requestPaused", "Fetch.failRequest", "Network.webSocketCreated", "externalWebSocketAttempts", "blockedExternalRequests"]) {
    assert.match(runner, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(runner, /--proxy-server=http:\/\/127\.0\.0\.1:9/);
  assert.match(runner, /--proxy-bypass-list=127\.0\.0\.1;localhost;\[::1\]/);
});

test("runner uses delivered pointer input and bounded resilient CDP commands", async () => {
  const runner = await read("tests/saas-phase3/hemenaku-admin-presentation/browser-acceptance.mjs");
  for (const marker of ["Input.dispatchMouseEvent", "Input.dispatchTouchEvent", "CDP_COMMAND_TIMEOUT", "rejectPending", "MAX_NEXT_LOG_BYTES"]) {
    assert.match(runner, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(runner, /new Event\(['"]touch|dispatchEvent\(event\)/);
});

test("runner validates exact decoded PNG and parsed JSON outputs", async () => {
  const runner = await read("tests/saas-phase3/hemenaku-admin-presentation/browser-acceptance.mjs");
  for (const marker of ["PNG_SIGNATURE", "IHDR", "readUInt32BE", "artifactFiles", "parsedResult", "expectedArtifactFiles", "15"]) {
    assert.match(runner, new RegExp(marker));
  }
});

test("browser fixture measures real production five-column merchant tables", async () => {
  const [fixture, runner] = await Promise.all([
    read("tests/saas-phase3/hemenaku-admin-presentation/browser-fixture/app/full-parity-fixture.tsx"),
    read("tests/saas-phase3/hemenaku-admin-presentation/browser-acceptance.mjs"),
  ]);
  assert.match(fixture, /<MerchantModuleConsole kind="seo_product_entry"/);
  assert.match(fixture, /<MerchantModuleConsole kind="general_setting"/);
  assert.doesNotMatch(fixture, /<table|<th|PanelDataTable/);
  for (const marker of ["fiveColumnTableMeasurements", "headerCells", "bodyCells", "contentWidth", "MIN_TABLE_CELL_CONTENT_WIDTH"]) {
    assert.match(runner, new RegExp(marker));
  }
});

test("runner exercises inventory truth states through the production presentation DOM", async () => {
  const runner = await read("tests/saas-phase3/hemenaku-admin-presentation/browser-acceptance.mjs");
  for (const marker of [
    "TARGET_ROUTE_ASSERTIONS", "data-target-route", "data-target-state",
    "empty", "loading", "error", "denied", "conflict", "replayed", "verification_unavailable",
  ]) assert.match(runner, new RegExp(marker));
  assert.doesNotMatch(runner, /fixture-surface|data-loaded/);
});
