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
  "apps/customer-panel/app/content/policies/[policyKey]/edit/page.tsx",
  "apps/customer-panel/app/settings/payment/page.tsx",
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
  const firstRedirect = source.indexOf("redirect(", routeStart);
  const boundaries = [firstReturn, firstRedirect].filter((index) => index >= 0);
  const firstRenderOrRedirect = Math.min(...boundaries);
  const routeBeforeRendering = source.slice(routeStart, firstRenderOrRedirect);

  assert.ok(routeStart >= 0, `${file} must export an async server page`);
  assert.ok(boundaries.length > 0, `${file} must render or redirect`);
  assert.ok(accessCall > routeStart && accessCall < firstRenderOrRedirect, `${file} must call server access before rendering or redirecting`);
  assert.match(
    routeBeforeRendering,
    /await\s+(?:requireServerPanelAccess\(\)|Promise\.all\(\[[\s\S]*?requireServerPanelAccess\(\)[\s\S]*?\]\))/,
    `${file} must await server access before rendering`,
  );
}

test("route-depth pages remain authority-safe and server-gated", async () => {
  assert.equal(routeDepthPages.length, 25);

  for (const file of routeDepthPages) {
    const source = await read(file);
    if (file === "apps/customer-panel/app/content/policies/new/page.tsx") {
      assert.equal(
        source,
        'import { permanentRedirect } from "next/navigation";\n\nexport default async function NewPolicyPage() {\n  permanentRedirect("/content/policies");\n}\n',
        `${file} must remain a finite redirect to the protected fixed-policy console`,
      );
      continue;
    }
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
    ["apps/customer-panel/app/content/policies/[policyKey]/edit/page.tsx", "PolicyConsole", "content.manage"],
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

  const paymentPage = await read("apps/customer-panel/app/settings/payment/page.tsx");
  assert.match(paymentPage, /const \{ tenantContext \} = access;/);
  assert.match(paymentPage, /isMerchantActionAllowed\(tenantContext\.membership\.role, "configuration\.manage"\)/);
  assert.match(paymentPage, /isMerchantActionAllowed\(tenantContext\.membership\.role, "integrations\.manage"\)/);
  assert.match(paymentPage, /<PaymentSettingsConsole\b[^>]*\bcanManage=\{canManage\}/);

  for (const file of [
    "apps/customer-panel/app/settings/payment/new/page.tsx",
    "apps/customer-panel/app/settings/payment/[recordId]/edit/page.tsx",
  ]) {
    const source = await read(file);
    assert.match(source, /requireServerPanelAccess\(\)/, file);
    assert.match(source, /redirect\("\/settings\/payment/, file);
    assert.doesNotMatch(source, /MerchantRecordEditor|PaymentSettingsConsole/, file);
  }

  const customerEdit = await read("apps/customer-panel/app/customers/[customerId]/edit/page.tsx");
  assert.match(customerEdit, /const \[\{ customerId \}, access\] = await Promise\.all\(\[params, requireServerPanelAccess\(\)\]\);/);
  assert.match(customerEdit, /const canManage = isMerchantActionAllowed\(access\.tenantContext\.membership\.role, "customers\.manage"\);/);
  assert.match(customerEdit, /if \(!canManage\) return <p role="alert">/);
  assert.match(customerEdit, /return <CustomerEditConsole customerId=\{customerId\} \/>;/);
});

test("route-depth source keeps finite routes, exact record reads, and complete relationship authority", async () => {
  const [catalogRoutes, merchantRoutes, catalogEditor, merchantEditor] = await Promise.all([
    read("apps/customer-panel/lib/catalog-admin-ui/resource-route.ts"),
    read("apps/customer-panel/lib/merchant-admin-ui/record-route.ts"),
    read("apps/customer-panel/components/catalog-admin/CatalogResourceEditor.tsx"),
    read("apps/customer-panel/components/merchant-admin/MerchantRecordEditor.tsx"),
  ]);

  assert.match(catalogRoutes, /catalog_resource_route_invalid/);
  assert.match(merchantRoutes, /merchant_record_route_invalid/);
  assert.match(catalogEditor, /catalogAdminApi\.resource\(kind, resourceId\)/);
  assert.match(catalogEditor, /catalogApi\.listProducts\(\{ cursor \}\)/);
  assert.match(catalogEditor, /productIds:\s*selectedProductIds/);
  assert.match(catalogEditor, /unseenSelectedProductIds/);
  assert.match(catalogEditor, /expectedVersion:\s*resource\.version/);
  assert.match(merchantEditor, /merchantAdminApi\.record\(kind, recordId\)/);
  assert.match(merchantEditor, /expectedVersion:\s*record\.version/);
});

test("route-depth work leaves the pinned donor application unchanged", () => {
  assert.equal(git("diff", "--name-only", `${BASE}...HEAD`, "--", "apps/admin"), "");
});
