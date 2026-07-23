import assert from "node:assert/strict";
import test from "node:test";
import {
  PANEL_NAVIGATION,
  PANEL_ROUTE_PRESENTATIONS,
  getPanelRoutePresentation,
  getPanelNavigationState,
  isPanelNavigationPathActive,
} from "./navigation.ts";

function findNavigationItem(key: string) {
  return PANEL_NAVIGATION.find((item) => item.key === key);
}

test("content and settings parents use truthful family hubs", () => {
  assert.equal(findNavigationItem("content")?.href, "/content");
  assert.equal(findNavigationItem("settings")?.href, "/settings");
  assert.equal(getPanelRoutePresentation("/content").title, "İçerik");
  assert.equal(getPanelRoutePresentation("/settings").title, "Ayarlar");
});

test("contains every and only currently working merchant destination", () => {
  const hrefs = PANEL_NAVIGATION.flatMap((item) => [
    item.href,
    ...(item.children ?? []).map((child) => child.href),
  ]);
  assert.deepEqual(
    [...new Set(hrefs)],
    [
      "/",
      "/analytics",
      "/orders",
      "/orders/quick-links",
      "/orders/abandoned-carts",
      "/customers",
      "/customers/segments",
      "/customers/tags",
      "/customers/new",
      "/products",
      "/products/new",
      "/products/collections",
      "/products/brands",
      "/products/attributes",
      "/products/extras",
      "/products/reviews",
      "/products/definitions",
      "/products/purchasing",
      "/products/inventory-counts",
      "/products/transfers",
      "/products/auto-import",
      "/products/shopify-converter",
      "/products/bulk-upload",
      "/discounts",
      "/discounts/new",
      "/discounts/lucky-wheel",
      "/marketing",
      "/marketing/email",
      "/marketing/phone",
      "/marketing/whatsapp",
      "/content",
      "/content/blog",
      "/content/pages",
      "/content/policies",
      "/marketplaces",
      "/settings",
      "/settings/general",
      "/settings/language",
      "/settings/payment",
      "/settings/shipping",
      "/settings/administrators",
      "/settings/notifications",
      "/settings/hero-banner",
      "/settings/promotion-banner",
      "/settings/marquee",
      "/settings/artificial-intelligence",
      "/accounting",
      "/accounting/invoicing-integration",
      "/seo",
      "/seo/sitemap",
      "/seo/social-preview",
      "/seo/code-integrations",
      "/seo/fast-indexing",
      "/seo/geo-optimization",
      "/seo/internal-linking",
      "/seo/content",
      "/seo/categories",
      "/seo/pages",
      "/seo/products",
      "/setup",
    ],
  );
  assert.deepEqual(
    PANEL_NAVIGATION.map(({ label }) => label),
    ["Özet", "Analitik", "Siparişler", "Müşteriler", "Ürünler", "İndirimler", "Pazarlama", "İçerik", "Pazar Yerleri", "Ayarlar", "Muhasebe", "SEO", "Kurulum"],
  );
});

test("keeps the catalog parent active on exact descendants", () => {
  assert.equal(isPanelNavigationPathActive("/products", "/products"), true);
  assert.equal(isPanelNavigationPathActive("/products/new", "/products"), true);
  assert.equal(
    isPanelNavigationPathActive("/products/uuid", "/products"),
    true,
  );
});

test("rejects near-match and alternate path spellings", () => {
  for (const path of [
    "/products-evil",
    "/product",
    "//products",
    "/Products",
  ]) {
    assert.equal(isPanelNavigationPathActive(path, "/products"), false);
  }
});

test("navigation never activates a query fragment or encoded near match", () => {
  for (const pathname of [
    "/products?next=/products",
    "/products#x",
    "/products%2Fevil",
    "/products//evil",
  ]) {
    assert.equal(isPanelNavigationPathActive(pathname, "/products"), false);
  }
});

test("navigation exposes every genuine catalog administration destination", () => {
  const catalog = PANEL_NAVIGATION.find(({ key }) => key === "catalog");
  assert.deepEqual(catalog?.children?.map(({ label }) => label), ["Tüm ürünler", "Yeni ürün", "Koleksiyonlar", "Markalar", "Nitelikler", "Ekstralar", "Yorumlar", "Tanımlamalar", "Satın Alma", "Stok Sayımları", "Stok Transferleri", "Otomatik Yükle", "Shopify Dönüştürücü", "Toplu Yükle"]);
});

test("inventory operations are exact catalog destinations with safe detail descendants", () => {
  const catalog = PANEL_NAVIGATION.find(({ key }) => key === "catalog");
  assert.deepEqual(
    catalog?.children?.filter(({ href }) => href.includes("purchasing") || href.includes("inventory-counts") || href.includes("transfers")).map(({ href }) => href),
    ["/products/purchasing", "/products/inventory-counts", "/products/transfers"],
  );
  for (const href of ["/products/purchasing", "/products/inventory-counts", "/products/transfers"] as const) {
    assert.equal(isPanelNavigationPathActive(href, href), true);
    assert.equal(isPanelNavigationPathActive(`${href}/11111111-1111-4111-8111-111111111111`, href), true);
    for (const unsafe of [`${href}-evil`, `${href}?next=${href}`, `${href}#status`, `${href}//evil`, `${href}%2Fevil`]) {
      assert.equal(isPanelNavigationPathActive(unsafe, href), false);
    }
  }
});

test("import preparation navigation is exact, near-match-safe, and query-safe", () => {
  for (const href of [
    "/products/auto-import",
    "/products/shopify-converter",
    "/products/bulk-upload",
  ] as const) {
    assert.equal(isPanelNavigationPathActive(href, href), true);
    assert.equal(isPanelNavigationPathActive(`${href}-evil`, href), false);
    assert.equal(isPanelNavigationPathActive(`${href}/child`, href), false);
    assert.equal(isPanelNavigationPathActive(`${href}?next=/products`, href), false);
    assert.equal(isPanelNavigationPathActive(`${href}#preview`, href), false);
  }
});

test("selects only the exact abandoned-cart child", () => {
  assert.equal(
    isPanelNavigationPathActive(
      "/orders/abandoned-carts",
      "/orders/abandoned-carts",
    ),
    true,
  );
  assert.equal(
    isPanelNavigationPathActive(
      "/orders/abandoned-carts/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "/orders/abandoned-carts",
    ),
    true,
  );
  for (const pathname of [
    "/orders/abandoned-carts-evil",
    "/orders%2Fabandoned-carts",
    "/orders/abandoned-carts?x=1",
    "/orders//abandoned-carts",
  ])
    assert.equal(
      isPanelNavigationPathActive(pathname, "/orders/abandoned-carts"),
      false,
    );
});

test("matches root only at root", () => {
  assert.equal(isPanelNavigationPathActive("/", "/"), true);
  assert.equal(isPanelNavigationPathActive("/setup", "/"), false);
});

test("contains every completed merchant administration family", () => {
  const labels = JSON.stringify(PANEL_NAVIGATION);
  for (const label of ["İndirimler", "Pazarlama", "İçerik", "Pazar Yerleri", "Ayarlar", "Muhasebe", "SEO"]) assert.match(labels, new RegExp(label));
});

test("SEO navigation exposes each advanced fixed-kind page without near-match activation", () => {
  const seo = PANEL_NAVIGATION.find(({ key }) => key === "seo");
  assert.deepEqual(
    seo?.children?.slice(-6).map(({ href }) => href),
    [
      "/seo/geo-optimization",
      "/seo/internal-linking",
      "/seo/content",
      "/seo/categories",
      "/seo/pages",
      "/seo/products",
    ],
  );
  for (const href of seo?.children?.slice(-6).map(({ href }) => href) ?? []) {
    assert.equal(isPanelNavigationPathActive(href, href), true);
    assert.equal(isPanelNavigationPathActive(`${href}-evil`, href), false);
    assert.equal(isPanelNavigationPathActive(`${href}?next=/seo/products`, href), false);
  }
});

test("AI settings navigation is exact and query-safe", () => {
  const settings = PANEL_NAVIGATION.find(({ key }) => key === "settings");
  const ai = settings?.children?.find(({ href }) => href === "/settings/artificial-intelligence");
  assert.equal(ai?.label, "Yapay Zeka");
  assert.equal(isPanelNavigationPathActive("/settings/artificial-intelligence", "/settings/artificial-intelligence"), true);
  assert.equal(isPanelNavigationPathActive("/settings/artificial-intelligence-evil", "/settings/artificial-intelligence"), false);
  assert.equal(isPanelNavigationPathActive("/settings/artificial-intelligence?tab=provider", "/settings/artificial-intelligence"), false);
});

test("selects only exact customer children and safe detail descendants", () => {
  for (const href of [
    "/customers/segments",
    "/customers/tags",
    "/customers/new",
  ] as const) {
    assert.equal(isPanelNavigationPathActive(href, href), true);
    assert.equal(isPanelNavigationPathActive(`${href}/child`, href), false);
  }
  assert.equal(
    isPanelNavigationPathActive(
      "/customers/11111111-1111-4111-8111-111111111111",
      "/customers",
    ),
    true,
  );
  for (const pathname of [
    "/customers-evil",
    "/Customers",
    "/customers//evil",
    "/customers?x=1",
  ]) {
    assert.equal(isPanelNavigationPathActive(pathname, "/customers"), false);
  }
});

test("selects only the exact quick-order child", () => {
  assert.equal(
    isPanelNavigationPathActive("/orders/quick-links", "/orders/quick-links"),
    true,
  );
  for (const pathname of [
    "/orders-evil",
    "/orders/quick-links-evil",
    "/orders/quick-links/child",
    "/orders%2Fquick-links",
    "/orders/quick-links?x=1",
    "/orders/quick-links#x",
    "/orders//quick-links",
  ]) {
    assert.equal(
      isPanelNavigationPathActive(pathname, "/orders/quick-links"),
      false,
    );
  }
});

test("returns immutable navigation and state", () => {
  assert.equal(Object.isFrozen(PANEL_NAVIGATION), true);
  assert.equal(Object.isFrozen(PANEL_NAVIGATION[1].children), true);
  assert.equal(Object.isFrozen(getPanelNavigationState("/products/new")), true);
});

test("maps every supported route to truthful fallback topbar chrome", () => {
  assert.deepEqual(
    [
      "/",
      "/orders",
      "/orders/quick-links",
      "/orders/abandoned-carts",
      "/orders/abandoned-carts/cart-123",
      "/orders/order-123",
      "/customers",
      "/customers/segments",
      "/customers/tags",
      "/customers/new",
      "/customers/customer-123",
      "/products",
      "/products/new",
      "/products/collections",
      "/products/brands",
      "/products/attributes",
      "/products/extras",
      "/products/reviews",
      "/products/definitions",
      "/products/auto-import",
      "/products/shopify-converter",
      "/products/bulk-upload",
      "/products/purchasing",
      "/products/inventory-counts",
      "/products/transfers",
      "/products/product-123",
      "/setup",
    ].map((pathname) => getPanelRoutePresentation(pathname).title),
    [
      "Özet",
      "Siparişler",
      "Hızlı Siparişler",
      "Terk Edilen Sepetler",
      "Sepet ayrıntısı",
      "Sipariş ayrıntısı",
      "Müşteriler",
      "Segmentler",
      "Etiketler",
      "Yeni müşteri",
      "Müşteri ayrıntısı",
      "Ürün kataloğu",
      "Yeni ürün oluştur",
      "Koleksiyonlar",
      "Markalar",
      "Nitelikler",
      "Ekstralar",
      "Yorumlar",
      "Tanımlamalar",
      "Otomatik Yükle",
      "Shopify Dönüştürücü",
      "Toplu Yükle",
      "Satın alma",
      "Stok sayımları",
      "Stok transferleri",
      "Ürün ayrıntısı",
      "Kurulum durumu",
    ],
  );
});

test("keeps product presentations behind exact routes and a single-segment slash boundary", () => {
  const productTitles = new Set<string>([
    PANEL_ROUTE_PRESENTATIONS.products.title,
    PANEL_ROUTE_PRESENTATIONS.newProduct.title,
    PANEL_ROUTE_PRESENTATIONS.productDetail.title,
  ]);
  for (const pathname of [
    "/products-evil",
    "/product",
    "//products/detail",
    "/Products/detail",
    "/products/",
    "/products/new/draft",
    "/products/product-123/history",
  ]) {
    assert.equal(
      productTitles.has(getPanelRoutePresentation(pathname).title),
      false,
    );
  }
});

test("returns shared immutable route presentation records", () => {
  assert.equal(Object.isFrozen(PANEL_ROUTE_PRESENTATIONS), true);
  assert.equal(
    Object.values(PANEL_ROUTE_PRESENTATIONS).every(Object.isFrozen),
    true,
  );
  assert.equal(
    getPanelRoutePresentation("/products"),
    PANEL_ROUTE_PRESENTATIONS.products,
  );
  assert.equal(
    getPanelRoutePresentation("/unknown"),
    PANEL_ROUTE_PRESENTATIONS.summary,
  );
});
