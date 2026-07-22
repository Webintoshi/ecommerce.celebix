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

test("route-depth pages remain authority-safe and server-gated", async () => {
  assert.equal(routeDepthPages.length, 23);

  for (const file of routeDepthPages) {
    const source = await read(file);
    assert.match(source, /requireServerPanelAccess/);
    assert.doesNotMatch(source, forbiddenBrowserAuthority);
    assert.doesNotMatch(source, /(?:tenantContext|access)\s*=\s*\{[^}]*\}/);
  }

  for (const file of clientWorkflowFiles) {
    const source = await read(file);
    assert.doesNotMatch(source, forbiddenBrowserAuthority);
    assert.doesNotMatch(source, /TenantContext|tenantContext|storeId|principalId|membershipId|planId/);
  }
});

test("route-depth mutations receive an explicit server-derived capability", async () => {
  const mutatingPages = routeDepthPages.filter((file) => !file.endsWith("/print/page.tsx") && !file.endsWith("/preview/page.tsx"));

  for (const file of mutatingPages) {
    const source = await read(file);
    const passesCapabilityToTheClient = /canManage=\{isMerchantActionAllowed\(/.test(source);
    const rejectsBeforeRenderingTheClient = /const canManage = isMerchantActionAllowed\([\s\S]*?if \(!canManage\) return <p role="alert">/.test(source);
    assert.equal(passesCapabilityToTheClient || rejectsBeforeRenderingTheClient, true, file);
  }
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
