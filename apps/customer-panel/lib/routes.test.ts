import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  renderPanelRoute,
  signedInRequest,
  signedOutRequest,
} from "./panel-route-test-harness.ts";

async function load(relativePath: string) {
  return import(new URL(relativePath, import.meta.url).href).catch(() => ({} as Record<string, unknown>));
}

test("exports the explicit public health route", async () => {
  const route = await load("../app/api/health/route.ts");
  assert.equal(typeof route.GET, "function");
});

test("exports the authenticated catalog dashboard summary route", async () => {
  const routeSource = await readFile(
    new URL("../app/api/catalog/summary/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(routeSource, /export const GET = handleDefaultCatalogGetDashboardSummary;/);
  assert.doesNotMatch(routeSource, /export const POST/);
});

test("analytics and typed storefront setting pages are server-authorized routes", async () => {
  const analytics = await readFile(new URL("../app/analytics/page.tsx", import.meta.url), "utf8");
  assert.match(analytics, /requireServerPanelAccess\(\)/);
  assert.match(analytics, /analytics[.]read/);
  for (const [path, kind] of [
    ["../app/settings/notifications/page.tsx", "notification_setting"],
    ["../app/settings/hero-banner/page.tsx", "hero_banner"],
    ["../app/settings/promotion-banner/page.tsx", "promotion_banner"],
    ["../app/settings/marquee/page.tsx", "marquee_setting"],
  ] as const) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.match(source, /requireServerPanelAccess\(\)/);
    assert.match(source, new RegExp(kind));
    assert.match(source, /configuration[.]manage/);
  }
});

test("advanced SEO and AI pages expose only fixed server-authorized kinds", async () => {
  const pages = [
    ["../app/seo/geo-optimization/page.tsx", "seo_geo_profile", "integrations.manage"],
    ["../app/seo/internal-linking/page.tsx", "seo_internal_link", "integrations.manage"],
    ["../app/seo/content/page.tsx", "seo_content_entry", "integrations.manage"],
    ["../app/seo/categories/page.tsx", "seo_category_entry", "integrations.manage"],
    ["../app/seo/pages/page.tsx", "seo_page_entry", "integrations.manage"],
    ["../app/seo/products/page.tsx", "seo_product_entry", "integrations.manage"],
    ["../app/settings/artificial-intelligence/page.tsx", "ai_setting", "configuration.manage"],
  ] as const;
  for (const [path, kind, capability] of pages) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.match(source, /requireServerPanelAccess\(\)/);
    assert.match(source, new RegExp(`kind=["']${kind}["']`));
    assert.match(source, new RegExp(capability.replace(".", "\\.")));
    assert.doesNotMatch(source, /searchParams|x-store-id|x-tenant-id|localStorage|sessionStorage/);
  }
});

test("product import preparation pages use fixed formats and server-owned capability", async () => {
  const pages = [
    ["../app/products/auto-import/page.tsx", "native_csv"],
    ["../app/products/shopify-converter/page.tsx", "shopify_csv"],
    ["../app/products/bulk-upload/page.tsx", "native_csv"],
  ] as const;
  for (const [path, format] of pages) {
    const page = await readFile(new URL(path, import.meta.url), "utf8");
    assert.match(page, /requireServerPanelAccess\(\)/);
    assert.match(page, /tenantContext[.]membership[.]role/);
    assert.match(page, /catalog_admin[.]import/);
    if (!path.endsWith("bulk-upload/page.tsx")) {
      assert.match(page, new RegExp(`format=["']${format}["']`));
      assert.match(page, /<CatalogImportPreparationConsole/);
    }
    assert.doesNotMatch(page, /searchParams|x-store-id|x-tenant-id|localStorage|sessionStorage|provider|credential|token/i);
  }
});

test("exports only the exact authenticated order route methods", async () => {
  const routes = [
    ["../app/api/orders/summary/route.ts", "GET", "handleDefaultOrderGetDashboardSummary"],
    ["../app/api/orders/route.ts", "GET", "handleDefaultOrderList"],
    ["../app/api/orders/[orderId]/route.ts", "GET", "handleDefaultOrderGet"],
    ["../app/api/orders/[orderId]/status/route.ts", "PATCH", "handleDefaultOrderTransitionStatus"],
    ["../app/api/orders/[orderId]/payment/route.ts", "PATCH", "handleDefaultOrderTransitionPayment"],
    ["../app/api/orders/[orderId]/shipping/route.ts", "PATCH", "handleDefaultOrderUpdateShipping"],
    ["../app/api/orders/[orderId]/notes/route.ts", "POST", "handleDefaultOrderAddNote"],
    ["../app/api/orders/[orderId]/notes/[noteId]/archive/route.ts", "POST", "handleDefaultOrderArchiveNote"],
  ] as const;
  for (const [path, method, handler] of routes) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.match(source, new RegExp(`export const ${method} = ${handler};`));
    for (const denied of ["GET", "POST", "PUT", "PATCH", "DELETE"].filter((candidate) => candidate !== method)) {
      assert.doesNotMatch(source, new RegExp(`export const ${denied}`));
    }
  }
});

test("exports only the exact authenticated abandoned-cart route methods", async () => {
  const routes = [
    ["../app/api/orders/abandoned-carts/summary/route.ts", "GET", "handleDefaultAbandonedCartSummary"],
    ["../app/api/orders/abandoned-carts/route.ts", "GET", "handleDefaultAbandonedCartList"],
    ["../app/api/orders/abandoned-carts/[cartId]/route.ts", "GET", "handleDefaultAbandonedCartGet"],
    ["../app/api/orders/abandoned-carts/[cartId]/recovered/route.ts", "POST", "handleDefaultAbandonedCartRecovered"],
    ["../app/api/orders/abandoned-carts/[cartId]/archive/route.ts", "POST", "handleDefaultAbandonedCartArchive"],
  ] as const;
  for (const [path, method, handler] of routes) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.match(source, new RegExp(`export const ${method} = ${handler};`));
    for (const denied of ["GET", "POST", "PUT", "PATCH", "DELETE"].filter((candidate) => candidate !== method)) assert.doesNotMatch(source, new RegExp(`export const ${denied}`));
  }
});

test("panel origin and fixed redirects derive from the single callback authority", async () => {
  const config = await load("./config.ts");
  const source = await readFile(new URL("./config.ts", import.meta.url), "utf8");
  assert.equal(config.PANEL_OIDC_CALLBACK_URL, "https://panel.celebix.site/auth/callback");
  assert.equal(config.PANEL_ORIGIN, new URL(String(config.PANEL_OIDC_CALLBACK_URL)).origin);
  assert.equal(config.PANEL_LOGOUT_REDIRECT, "https://panel.celebix.site/login");
  assert.match(source, /new URL\(PANEL_OIDC_CALLBACK_URL\)\.origin/);
});

test("health output is minimal and contains no configuration or secrets", async () => {
  const route = await load("../app/api/health/route.ts");
  if (typeof route.GET !== "function") return;
  const response = await route.GET();
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(body, { status: "ok", service: "customer-panel" });
  for (const prohibited of ["token", "secret", "database", "issuer", "clientId", "environment"]) {
    assert.equal(JSON.stringify(body).toLowerCase().includes(prohibited.toLowerCase()), false);
  }
});

test("unknown route handler returns 401 without a production session store", async () => {
  const route = await load("../app/api/[...path]/route.ts");
  assert.equal(typeof route.GET, "function");
  if (typeof route.GET !== "function") return;
  const response = await route.GET(new Request("https://panel.celebix.site/api/orders"));
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { code: "unauthenticated" });
});

test("active-store switch stays controlled unavailable without approved staging authority", async () => {
  const route = await load("../app/api/session/active-store/route.ts");
  const routeSource = await readFile(
    new URL("../app/api/session/active-store/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(routeSource, /export const POST = handleDefaultPanelActiveStore;/);
  if (typeof route.POST !== "function") return;
  const noOrigin = await route.POST(
    new Request("https://panel.celebix.site/api/session/active-store", {
      method: "POST",
      body: JSON.stringify({ storeId: "browser-store" }),
    }),
  );
  assert.equal(noOrigin.status, 503);
  assert.equal(noOrigin.headers.has("set-cookie"), false);
  const response = await route.POST(
    new Request("https://panel.celebix.site/api/session/active-store", {
      method: "POST",
      headers: { origin: "https://panel.celebix.site" },
      body: JSON.stringify({ storeId: "browser-store" }),
    }),
  );
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { code: "panel_session_retry_required" });
  assert.equal(response.headers.has("set-cookie"), false);
});

test("live auth callback remains disabled without setting a cookie", async () => {
  const route = await load("../app/auth/callback/route.ts");
  assert.equal(typeof route.GET, "function");
  if (typeof route.GET !== "function") return;
  const response = await route.GET(new Request("https://panel.celebix.site/auth/callback?code=unsafe"));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { code: "panel_auth_disabled" });
  assert.equal(response.headers.has("set-cookie"), false);
});

test("login and logout remain disabled without a persistent session adapter", async () => {
  const login = await load("../app/auth/login/route.ts");
  const logout = await load("../app/auth/logout/route.ts");
  const loginPageSource = await readFile(new URL("../app/login/page.tsx", import.meta.url), "utf8");
  const loginRouteSource = await readFile(new URL("../app/auth/login/route.ts", import.meta.url), "utf8");
  assert.equal(typeof login.GET, "function");
  assert.equal(typeof logout.POST, "function");
  assert.equal(typeof logout.GET, "undefined");
  if (typeof login.GET !== "function" || typeof logout.POST !== "function") return;

  assert.match(loginPageSource, /<Link[^>]+href="\/auth\/login"[^>]+prefetch=\{false\}/s);
  assert.doesNotMatch(loginRouteSource, /https:\/\/panel\.celebix\.site/);

  const loginResponse = await login.GET(new Request("https://panel.celebix.site/auth/login"));
  assert.equal(loginResponse.status, 303);
  assert.equal(loginResponse.headers.get("location"), "https://panel.celebix.site/login?auth=disabled");

  const rejected = await logout.POST(new Request("https://panel.celebix.site/auth/logout", { method: "POST" }));
  assert.equal(rejected.status, 403);
  assert.equal(rejected.headers.has("set-cookie"), false);

  const logoutResponse = await logout.POST(new Request("https://panel.celebix.site/auth/logout", {
    method: "POST",
    headers: { origin: "https://panel.celebix.site" },
  }));
  assert.equal(logoutResponse.status, 503);
  assert.deepEqual(await logoutResponse.json(), { code: "panel_auth_disabled" });
  assert.equal(logoutResponse.headers.has("location"), false);
  assert.equal(logoutResponse.headers.has("set-cookie"), false);
});

test("disabled login redirects use only a validated public panel origin", async () => {
  const login = await load("../app/auth/login/route.ts");
  assert.equal(typeof login.GET, "function");
  if (typeof login.GET !== "function") return;
  const originalPanelOrigin = process.env.CELEBIX_PANEL_ORIGIN;

  try {
    process.env.CELEBIX_PANEL_ORIGIN = "https://panel.saas-staging.celebix.site";
    const configured = await login.GET(new Request("http://customer-panel:3400/auth/login", {
      headers: {
        "x-forwarded-proto": "https",
        "x-forwarded-host": "attacker.example",
      },
    }));
    assert.equal(configured.status, 303);
    assert.equal(
      configured.headers.get("location"),
      "https://panel.saas-staging.celebix.site/login?auth=disabled",
    );

    process.env.CELEBIX_PANEL_ORIGIN = "http://panel.saas-staging.celebix.site";
    const forwarded = await login.GET(new Request("http://customer-panel:3400/auth/login", {
      headers: {
        "x-forwarded-proto": "https",
        "x-forwarded-host": "panel.saas-staging.celebix.site",
      },
    }));
    assert.equal(forwarded.status, 303);
    assert.equal(
      forwarded.headers.get("location"),
      "https://panel.saas-staging.celebix.site/login?auth=disabled",
    );

    delete process.env.CELEBIX_PANEL_ORIGIN;
    const requestOrigin = await login.GET(new Request("https://preview-panel.example.test/auth/login"));
    assert.equal(requestOrigin.status, 303);
    assert.equal(
      requestOrigin.headers.get("location"),
      "https://preview-panel.example.test/login?auth=disabled",
    );

    for (const request of [
      new Request("http://customer-panel:3400/auth/login"),
      new Request("https://localhost/auth/login"),
      new Request("https://0.0.0.0/auth/login"),
      new Request("https://127.0.0.1/auth/login"),
      new Request("https://panel.example.test:3000/auth/login"),
      new Request("https://panel.example.test:3400/auth/login"),
      new Request("http://customer-panel:3400/auth/login", {
        headers: {
          "x-forwarded-proto": "https",
          "x-forwarded-host": "panel.example.test:3000",
        },
      }),
      new Request("http://customer-panel:3400/auth/login", {
        headers: {
          "x-forwarded-proto": "https, http",
          "x-forwarded-host": "panel.saas-staging.celebix.site, attacker.example",
        },
      }),
    ]) {
      const denied = await login.GET(request);
      assert.equal(denied.status, 503);
      assert.equal(denied.headers.has("location"), false);
      assert.deepEqual(await denied.json(), { code: "panel_auth_origin_unavailable" });
    }
  } finally {
    if (originalPanelOrigin === undefined) delete process.env.CELEBIX_PANEL_ORIGIN;
    else process.env.CELEBIX_PANEL_ORIGIN = originalPanelOrigin;
  }
});

test("state-changing routes reject near-match and cross-site origins", async () => {
  const logout = await load("../app/auth/logout/route.ts");
  const switcher = await load("../app/api/session/active-store/route.ts");
  const switcherSource = await readFile(
    new URL("../app/api/session/active-store/route.ts", import.meta.url),
    "utf8",
  );
  for (const origin of [
    "https://attacker.example",
    "https://panel.celebix.site.attacker.example",
    "http://panel.celebix.site",
    "https://panel.celebix.site/path",
  ]) {
    for (const handler of [logout.POST, switcher.POST]) {
      if (handler === switcher.POST && typeof handler !== "function") {
        assert.match(switcherSource, /export const POST = handleDefaultPanelActiveStore;/);
        continue;
      }
      assert.equal(typeof handler, "function");
      const response = await (handler as (request: Request) => Promise<Response>)(
        new Request("https://panel.celebix.site/action", { method: "POST", headers: { origin } }),
      );
      assert.equal(response.status, handler === switcher.POST ? 503 : 403);
      assert.equal(response.headers.has("set-cookie"), false);
    }
  }
});

test("quick-order console is directly routable behind panel access and linked by exact navigation", async () => {
  const page = await readFile(new URL("../app/orders/quick-links/page.tsx", import.meta.url), "utf8");
  const navigation = await readFile(new URL("./panel-ui/navigation.ts", import.meta.url), "utf8");
  assert.match(page, /requireServerPanelAccess\(\)/);
  assert.match(page, /createPanelChromeModel\(access\.tenantContext\)/);
  assert.match(page, /<QuickOrderLinksConsole\s*\/>/);
  assert.doesNotMatch(page, /<QuickOrderLinksConsole[^>]+(?:tenant|store|membership|provider|token)/i);
  assert.match(navigation, /label:\s*"Hızlı Siparişler"[\s\S]{0,120}href:\s*"\/orders\/quick-links"/);
});

test("order print and customer edit pages remain server-authorized route depth", async () => {
  const printPage = await readFile(new URL("../app/orders/[orderId]/print/page.tsx", import.meta.url), "utf8");
  const customerEditPage = await readFile(new URL("../app/customers/[customerId]/edit/page.tsx", import.meta.url), "utf8");
  assert.match(printPage, /requireServerPanelAccess\(\)/);
  assert.match(printPage, /<OrderPrintView orderId=\{orderId\} \/>/);
  assert.match(customerEditPage, /requireServerPanelAccess\(\)/);
  assert.match(customerEditPage, /customers[.]manage/);
  assert.match(customerEditPage, /<CustomerEditConsole customerId=\{customerId\} \/>/);
});

test("catalog subresource pages lock resource kinds in server-authorized routes", async () => {
  const cases = [
    ["collections", "collection"], ["brands", "brand"], ["attributes", "attribute"],
    ["extras", "extra"], ["definitions", "definition"], ["tags", "tag"],
  ] as const;
  for (const [segment, kind] of cases) {
    for (const suffix of ["new/page.tsx", "[resourceId]/edit/page.tsx"]) {
      const page = await readFile(new URL(`../app/products/${segment}/${suffix}`, import.meta.url), "utf8");
      assert.match(page, /requireServerPanelAccess\(\)/);
      assert.match(page, new RegExp(`kind=["']${kind}["']`));
      assert.doesNotMatch(page, /searchParams|x-store-id|x-tenant-id|localStorage|sessionStorage/);
    }
  }
  const preview = await readFile(new URL("../app/products/extras/[resourceId]/preview/page.tsx", import.meta.url), "utf8");
  assert.match(preview, /requireServerPanelAccess\(\)/);
  assert.match(preview, /<CatalogExtraPreview resourceId=\{resourceId\}/);
});

test("tag and barcode routes remain panel-session guarded with fixed server authority", async () => {
  const tags = await readFile(new URL("../app/products/tags/page.tsx", import.meta.url), "utf8");
  const labels = await readFile(new URL("../app/products/barcode-labels/page.tsx", import.meta.url), "utf8");
  for (const source of [tags, labels]) {
    assert.match(source, /requireServerPanelAccess\(\)/);
    assert.match(source, /tenantContext/);
    assert.doesNotMatch(source, /searchParams|x-store-id|x-tenant-id|localStorage|sessionStorage/);
  }
  assert.match(tags, /catalog_admin[.]manage/);
  assert.match(labels, /catalog_admin[.]read/);
});

test("tag and barcode routes execute signed-out redirects and signed-in capabilities", async () => {
  for (const path of ["/products/tags", "/products/barcode-labels"] as const) {
    const response = await renderPanelRoute(path, signedOutRequest(path));
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), "/login");
  }

  const ownerTags = await renderPanelRoute(
    "/products/tags",
    signedInRequest("/products/tags", "store_owner"),
  );
  assert.equal(ownerTags.status, 200);
  assert.deepEqual(await ownerTags.json(), {
    action: "catalog_admin.manage",
    allowed: true,
  });

  const analystTags = await renderPanelRoute(
    "/products/tags",
    signedInRequest("/products/tags", "analyst"),
  );
  assert.equal(analystTags.status, 200);
  assert.deepEqual(await analystTags.json(), {
    action: "catalog_admin.manage",
    allowed: false,
  });

  const analystLabels = await renderPanelRoute(
    "/products/barcode-labels",
    signedInRequest("/products/barcode-labels", "analyst"),
  );
  assert.equal(analystLabels.status, 200);
  assert.deepEqual(await analystLabels.json(), {
    action: "catalog_admin.read",
    allowed: true,
  });
});

test("panel route execution rejects query and near-match paths before session authority", async () => {
  for (const [target, requestPath] of [
    ["/products/tags", "/products/tags/"],
    ["/products/tags", "/products/tags?store=attacker"],
    ["/products/tags", "/products/tags-new"],
    ["/products/barcode-labels", "/products/barcode-labels/"],
    ["/products/barcode-labels", "/products/barcode-labels?print=1"],
    ["/products/barcode-labels", "/products/barcode-labels-extra"],
  ] as const) {
    const response = await renderPanelRoute(target, signedOutRequest(requestPath));
    assert.equal(response.status, 404, `${target} must reject ${requestPath}`);
    assert.equal(response.headers.has("location"), false);
  }
});

test("merchant record route-depth pages expose only fixed server-authorized editor kinds", async () => {
  const cases = [
    ["../app/discounts/[recordId]/edit/page.tsx", "discount"],
    ["../app/content/blog/new/page.tsx", "blog_post"],
    ["../app/content/blog/[recordId]/edit/page.tsx", "blog_post"],
    ["../app/content/pages/new/page.tsx", "page"],
    ["../app/content/pages/[recordId]/edit/page.tsx", "page"],
    ["../app/content/policies/new/page.tsx", "policy"],
    ["../app/content/policies/[recordId]/edit/page.tsx", "policy"],
    ["../app/settings/payment/new/page.tsx", "payment_setting"],
    ["../app/settings/payment/[recordId]/edit/page.tsx", "payment_setting"],
  ] as const;
  for (const [path, kind] of cases) {
    const page = await readFile(new URL(path, import.meta.url), "utf8");
    assert.match(page, /requireServerPanelAccess\(\)/);
    assert.match(page, new RegExp(`kind=["']${kind}["']`));
    assert.doesNotMatch(page, /searchParams|x-store-id|x-tenant-id|localStorage|sessionStorage/);
  }
});

test("content and settings family hubs render behind server panel access", async () => {
  for (const file of ["../app/content/page.tsx", "../app/settings/page.tsx"]) {
    const page = await readFile(new URL(file, import.meta.url), "utf8");
    assert.match(page, /requireServerPanelAccess\(\)/);
    assert.match(page, /<MerchantFamilyOverview[^>]+family=[\"'][a-z]+[\"'][^>]+canManage=/);
  }
});

test("quick-order routes expose only the reviewed merchant methods and activate exact panel navigation", async () => {
  const routes = [
    ["../app/api/orders/quick-links/route.ts", ["GET", "POST"]],
    ["../app/api/orders/quick-links/[linkId]/route.ts", ["GET"]],
    ["../app/api/orders/quick-links/[linkId]/cancel/route.ts", ["POST"]],
    ["../app/api/orders/quick-links/[linkId]/duplicate/route.ts", ["POST"]],
    ["../app/api/orders/quick-links/[linkId]/url/route.ts", ["POST"]],
    ["../app/api/orders/quick-links/provider/activate/route.ts", ["POST"]],
    ["../app/api/orders/quick-links/provider/revoke/route.ts", ["POST"]],
  ] as const;
  for (const [file, methods] of routes) {
    const source = await readFile(new URL(file, import.meta.url), "utf8");
    for (const method of methods) assert.match(source, new RegExp(`export const ${method} = handleDefaultQuickLink`));
    for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"].filter((candidate) => !(methods as readonly string[]).includes(candidate))) {
      assert.doesNotMatch(source, new RegExp(`export const ${method} =`));
    }
  }
  const navigation = await readFile(new URL("./panel-ui/navigation.ts", import.meta.url), "utf8");
  assert.match(navigation, /label:\s*"Hızlı Siparişler"[\s\S]{0,120}href:\s*"\/orders\/quick-links"/);
  assert.doesNotMatch(navigation, /ödeme linki/i);
});
