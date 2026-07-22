import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

const BASE = "959de29d2ceb7a4ec8296f3f0b967fadbb3d1d61";
const ROOT = new URL("../../", import.meta.url);

const routeDepthPages = Object.freeze([
  "apps/customer-panel/app/content/page.tsx",
  "apps/customer-panel/app/settings/page.tsx",
  "apps/customer-panel/app/orders/[orderId]/print/page.tsx",
  "apps/customer-panel/app/customers/[customerId]/edit/page.tsx",
  "apps/customer-panel/app/products/collections/new/page.tsx",
  "apps/customer-panel/app/products/collections/[resourceId]/edit/page.tsx",
  "apps/customer-panel/app/products/brands/new/page.tsx",
  "apps/customer-panel/app/products/brands/[resourceId]/edit/page.tsx",
  "apps/customer-panel/app/products/attributes/new/page.tsx",
  "apps/customer-panel/app/products/attributes/[resourceId]/edit/page.tsx",
  "apps/customer-panel/app/products/extras/new/page.tsx",
  "apps/customer-panel/app/products/extras/[resourceId]/edit/page.tsx",
  "apps/customer-panel/app/products/extras/[resourceId]/preview/page.tsx",
  "apps/customer-panel/app/products/definitions/new/page.tsx",
  "apps/customer-panel/app/products/definitions/[resourceId]/edit/page.tsx",
  "apps/customer-panel/app/discounts/[recordId]/edit/page.tsx",
  "apps/customer-panel/app/content/blog/new/page.tsx",
  "apps/customer-panel/app/content/blog/[recordId]/edit/page.tsx",
  "apps/customer-panel/app/content/pages/new/page.tsx",
  "apps/customer-panel/app/content/pages/[recordId]/edit/page.tsx",
  "apps/customer-panel/app/content/policies/new/page.tsx",
  "apps/customer-panel/app/content/policies/[recordId]/edit/page.tsx",
  "apps/customer-panel/app/settings/payment/new/page.tsx",
  "apps/customer-panel/app/settings/payment/[recordId]/edit/page.tsx",
]);

const clientWorkflowFiles = Object.freeze([
  "apps/customer-panel/components/orders/OrderPrintView.tsx",
  "apps/customer-panel/components/customers/CustomerEditConsole.tsx",
  "apps/customer-panel/components/catalog-admin/CatalogResourceEditor.tsx",
  "apps/customer-panel/components/catalog-admin/CatalogExtraPreview.tsx",
  "apps/customer-panel/components/merchant-admin/MerchantRecordEditor.tsx",
  "apps/customer-panel/components/merchant-admin/MerchantFamilyOverview.tsx",
  "apps/customer-panel/lib/catalog-admin-ui/resource-route.ts",
  "apps/customer-panel/lib/merchant-admin-ui/record-route.ts",
]);

const forbiddenBrowserAuthority = /supabase|\/api\/admin\/|x-store-id|x-tenant-id|dangerouslySetInnerHTML|<iframe|document\.cookie|localStorage|sessionStorage/i;

function git(...args) {
  return execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  }).trim();
}

function read(path) {
  return readFile(new URL(path, ROOT), "utf8");
}

function assertExecutedServerAccess(source, file) {
  const routeStart = source.indexOf("export default async function");
  const accessCall = source.indexOf("requireServerPanelAccess()", routeStart);
  const firstReturn = source.indexOf("return ", routeStart);
  const routeBeforeRendering = source.slice(routeStart, firstReturn);

  assert.ok(routeStart >= 0, `${file} must export an async server page`);
  assert.ok(accessCall > routeStart && accessCall < firstReturn, `${file} must call server access before rendering`);
  assert.match(
    routeBeforeRendering,
    /await\s+(?:requireServerPanelAccess\(\)|Promise\.all\(\[[\s\S]*?requireServerPanelAccess\(\)[\s\S]*?\]\))/,
    `${file} must await server access before rendering`,
  );
}

test("route-depth pages remain authority-safe and server-gated", async () => {
  assert.equal(routeDepthPages.length, 24);

  for (const file of routeDepthPages) {
    const source = await read(file);
    assertExecutedServerAccess(source, file);
    assert.doesNotMatch(source, forbiddenBrowserAuthority);
    assert.doesNotMatch(source, /(?:tenantContext|access)\s*=\s*\{[^}]*\}/);
  }

  for (const file of clientWorkflowFiles) {
    const source = await read(file);
    assert.doesNotMatch(source, forbiddenBrowserAuthority);
    assert.doesNotMatch(source, /TenantContext|tenantContext|storeId|principalId|membershipId|planId/);
  }
});

test("route-depth mutations receive a concrete server-derived capability or server rejection", async () => {
  const capabilityBoundRoutes = [
    ["apps/customer-panel/app/content/page.tsx", "MerchantFamilyOverview", "content.manage"],
    ["apps/customer-panel/app/settings/page.tsx", "MerchantFamilyOverview", "configuration.manage"],
    ["apps/customer-panel/app/products/collections/new/page.tsx", "CatalogResourceEditor", "catalog_admin.manage"],
    ["apps/customer-panel/app/products/collections/[resourceId]/edit/page.tsx", "CatalogResourceEditor", "catalog_admin.manage"],
    ["apps/customer-panel/app/products/brands/new/page.tsx", "CatalogResourceEditor", "catalog_admin.manage"],
    ["apps/customer-panel/app/products/brands/[resourceId]/edit/page.tsx", "CatalogResourceEditor", "catalog_admin.manage"],
    ["apps/customer-panel/app/products/attributes/new/page.tsx", "CatalogResourceEditor", "catalog_admin.manage"],
    ["apps/customer-panel/app/products/attributes/[resourceId]/edit/page.tsx", "CatalogResourceEditor", "catalog_admin.manage"],
    ["apps/customer-panel/app/products/extras/new/page.tsx", "CatalogResourceEditor", "catalog_admin.manage"],
    ["apps/customer-panel/app/products/extras/[resourceId]/edit/page.tsx", "CatalogResourceEditor", "catalog_admin.manage"],
    ["apps/customer-panel/app/products/definitions/new/page.tsx", "CatalogResourceEditor", "catalog_admin.manage"],
    ["apps/customer-panel/app/products/definitions/[resourceId]/edit/page.tsx", "CatalogResourceEditor", "catalog_admin.manage"],
    ["apps/customer-panel/app/discounts/[recordId]/edit/page.tsx", "MerchantRecordEditor", "promotions.manage"],
    ["apps/customer-panel/app/content/blog/new/page.tsx", "MerchantRecordEditor", "content.manage"],
    ["apps/customer-panel/app/content/blog/[recordId]/edit/page.tsx", "MerchantRecordEditor", "content.manage"],
    ["apps/customer-panel/app/content/pages/new/page.tsx", "MerchantRecordEditor", "content.manage"],
    ["apps/customer-panel/app/content/pages/[recordId]/edit/page.tsx", "MerchantRecordEditor", "content.manage"],
    ["apps/customer-panel/app/content/policies/new/page.tsx", "MerchantRecordEditor", "content.manage"],
    ["apps/customer-panel/app/content/policies/[recordId]/edit/page.tsx", "MerchantRecordEditor", "content.manage"],
    ["apps/customer-panel/app/settings/payment/new/page.tsx", "MerchantRecordEditor", "configuration.manage"],
    ["apps/customer-panel/app/settings/payment/[recordId]/edit/page.tsx", "MerchantRecordEditor", "configuration.manage"],
  ];

  for (const [file, component, action] of capabilityBoundRoutes) {
    const source = await read(file);
    assert.match(source, /const \{ tenantContext \} = await requireServerPanelAccess\(\);/, file);
    assert.match(
      source,
      new RegExp(`<${component}\\b[^>]*\\bcanManage=\\{isMerchantActionAllowed\\(tenantContext\\.membership\\.role, "${action.replace(".", "\\.")}"\\)\\}`),
      file,
    );
  }

  const customerEdit = await read("apps/customer-panel/app/customers/[customerId]/edit/page.tsx");
  assert.match(customerEdit, /const \[\{ customerId \}, access\] = await Promise\.all\(\[params, requireServerPanelAccess\(\)\]\);/);
  assert.match(customerEdit, /const canManage = isMerchantActionAllowed\(access\.tenantContext\.membership\.role, "customers\.manage"\);/);
  assert.match(customerEdit, /if \(!canManage\) return <p role="alert">/);
  assert.match(customerEdit, /return <CustomerEditConsole customerId=\{customerId\} \/>;/);
});

test("route-depth source keeps finite route bindings and canonical editor targets", async () => {
  const [catalogRoutes, merchantRoutes, catalogEditor, merchantEditor] = await Promise.all([
    read("apps/customer-panel/lib/catalog-admin-ui/resource-route.ts"),
    read("apps/customer-panel/lib/merchant-admin-ui/record-route.ts"),
    read("apps/customer-panel/components/catalog-admin/CatalogResourceEditor.tsx"),
    read("apps/customer-panel/components/merchant-admin/MerchantRecordEditor.tsx"),
  ]);

  assert.match(catalogRoutes, /catalog_resource_route_invalid/);
  assert.match(merchantRoutes, /merchant_record_route_invalid/);
  assert.match(catalogEditor, /catalogAdminApi\.resources\(kind\)/);
  assert.match(catalogEditor, /expectedVersion:\s*resource\.version/);
  assert.match(merchantEditor, /merchantAdminApi\.records\(kind\)/);
  assert.match(merchantEditor, /expectedVersion:\s*record\.version/);
});

test("route-depth work leaves the pinned donor application unchanged", () => {
  assert.equal(git("diff", "--name-only", `${BASE}...HEAD`, "--", "apps/admin"), "");
});
