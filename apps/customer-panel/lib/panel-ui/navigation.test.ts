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

function activeLabels(pathname: string): string[] {
  return PANEL_NAVIGATION.flatMap((item) => [item, ...(item.children ?? [])])
    .filter((item) => isPanelNavigationPathActive(pathname, item.href))
    .map(({ label }) => label);
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
      "/products/categories",
      "/products/collections",
      "/products/brands",
      "/products/attributes",
      "/products/extras",
      "/products/reviews",
      "/products/definitions",
      "/products/tags",
      "/products/barcode-labels",
      "/products/purchasing",
      "/products/inventory-counts",
      "/products/transfers",
      "/products/price-lists",
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
      "/settings/design",
      "/settings/theme",
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
    ["Özet", "Analizler", "Siparişler", "Müşteriler", "Ürünler", "İndirimler", "Pazarlama", "İçerik", "Pazar Yerleri", "Ayarlar", "Muhasebe", "SEO", "Kurulum"],
  );
});

test("navigation exposes donor-approved create shortcuts but never edit, detail, preview, or print routes", () => {
  const hrefs = PANEL_NAVIGATION.flatMap((item) => [
    item.href,
    ...(item.children ?? []).map((child) => child.href),
  ]);
  for (const href of [
    "/analytics",
    "/customers/new",
    "/products/new",
    "/products/categories",
    "/discounts/new",
    "/products/tags",
    "/products/barcode-labels",
    "/products/purchasing",
    "/products/inventory-counts",
    "/products/transfers",
    "/products/price-lists",
    "/settings/design",
    "/marketing/email",
    "/marketplaces",
    "/accounting/invoicing-integration",
    "/seo/products",
  ] as const) assert.equal(hrefs.includes(href), true, href);
  for (const forbidden of [
    "/products/price-lists/new",
    "/products/extras/resource/edit",
    "/products/extras/resource/preview",
    "/orders/order/print",
  ]) assert.equal(hrefs.includes(forbidden as never), false, forbidden);
  assert.equal(hrefs.some((href) => /\/edit(?:\/|$)|\/preview(?:\/|$)|\/print(?:\/|$)|\[[^/]+\]/.test(href)), false);
});

test("legacy donor spellings stay inert while canonical safe targets remain navigable", () => {
  const hrefs = new Set(PANEL_NAVIGATION.flatMap((item) => [
    item.href,
    ...(item.children ?? []).map((child) => child.href),
  ]));
  const decisions = [
    { donor: "/ayarlar/ana-sayfa-vitrini", target: "/products/collections", title: "Koleksiyonlar" },
    { donor: "/muhasabe", target: "/accounting", title: "Muhasebe" },
    { donor: "/pazarlama/lucky-wheel", target: "/discounts/lucky-wheel", title: "Şans Çarkı" },
  ] as const;

  for (const { donor, target, title } of decisions) {
    assert.equal(hrefs.has(donor as never), false, donor);
    assert.deepEqual(activeLabels(donor), [], donor);
    assert.equal(hrefs.has(target), true, target);
    assert.equal(getPanelRoutePresentation(target).title, title, target);
  }
});

test("matches decoded-safe exact segments and rejects malformed or separator encodings", () => {
  assert.equal(isPanelNavigationPathActive("/%70roducts", "/products"), true);
  assert.equal(isPanelNavigationPathActive("/products/%70rice-lists", "/products/price-lists"), true);
  for (const pathname of [
    "/%",
    "/%GGproducts",
    "/%2fproducts",
    "/%2Fproducts",
    "/%5cproducts",
    "/%5Cproducts",
    "/products%2fprice-lists",
    "/products%5cprice-lists",
    "/products/%2e%2e/settings",
    "/products/./price-lists",
    "/products//price-lists",
    "/products\\price-lists",
  ]) {
    assert.equal(activeLabels(pathname).length, 0, pathname);
  }
});

for (const [path, forbidden] of [
  ["/products-evil", "Ürünler"],
  ["/seo/products-evil", "Ürün SEO"],
  ["/settings.evil", "Ayarlar"],
  ["/%2fproducts", "Ürünler"],
  ["/products/price-lists.evil", "Fiyat Listeleri"],
] as const) {
  test(`${path} does not activate ${forbidden}`, () => {
    assert.equal(activeLabels(path).includes(forbidden), false);
  });
}

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
  assert.deepEqual(catalog?.children?.map(({ label }) => label), ["Tüm ürünler", "Yeni ürün", "Kategoriler", "Koleksiyonlar", "Markalar", "Nitelikler", "Ekstralar", "Yorumlar", "Tanımlamalar", "Etiketler", "Barkod Etiketleri", "Satın Alma", "Stok Sayımları", "Stok Konumları ve Transferler", "Fiyat Listeleri", "Otomatik Yükle", "Shopify Dönüştürücü", "Toplu Yükle"]);
});

test("category navigation is exact and near matches stay inactive", () => {
  assert.equal(isPanelNavigationPathActive("/products/categories", "/products/categories"), true);
  for (const path of ["/products/categories-evil", "/products/categories/child", "/products/categories?x=1", "/products/categories#x"]) {
    assert.equal(isPanelNavigationPathActive(path, "/products/categories"), false);
  }
  assert.equal(getPanelRoutePresentation("/products/categories").title, "Kategoriler");
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
      "/products/categories",
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
      "Kategoriler",
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

test("presents every mounted create edit preview and print route truthfully on first paint", () => {
  const cases = [
    ["/customers/customer-123/edit", "Müşteriyi düzenle"],
    ["/products/collections/new", "Yeni koleksiyon"],
    ["/products/collections/collection-123/edit", "Koleksiyonu düzenle"],
    ["/products/brands/new", "Yeni marka"],
    ["/products/attributes/attribute-123/edit", "Niteliği düzenle"],
    ["/products/extras/extra-123/preview", "Ekstra önizlemesi"],
    ["/products/definitions/new", "Yeni tanımlama"],
    ["/products/tags/tag-123/edit", "Etiketi düzenle"],
    ["/products/purchasing/new", "Yeni satın alma"],
    ["/products/inventory-counts/new", "Yeni stok sayımı"],
    ["/products/transfers/new", "Yeni stok transferi"],
    ["/products/price-lists/new", "Yeni fiyat listesi"],
    ["/orders/order-123/print", "Siparişi yazdır"],
    ["/discounts/discount-123/edit", "İndirimi düzenle"],
    ["/content/blog/new", "Yeni blog yazısı"],
    ["/content/blog/post-123/edit", "Blog yazısını düzenle"],
    ["/content/pages/new", "Yeni sayfa"],
    ["/content/policies/policy-123/edit", "Politikayı düzenle"],
    ["/settings/payment/new", "Yeni ödeme ayarı"],
    ["/settings/payment/payment-123/edit", "Ödeme ayarını düzenle"],
  ] as const;

  for (const [pathname, title] of cases) {
    assert.equal(getPanelRoutePresentation(pathname).title, title, pathname);
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

test("resolves only the exact Toshi workspace route without adding sidebar navigation", () => {
  assert.equal(getPanelRoutePresentation("/toshi").title, "Toshi");
  assert.equal(
    getPanelRoutePresentation("/toshi-evil"),
    PANEL_ROUTE_PRESENTATIONS.summary,
  );

  const hrefs = PANEL_NAVIGATION.flatMap((item) => [
    item.href,
    ...(item.children ?? []).map((child) => child.href),
  ]);
  assert.equal(hrefs.includes("/toshi" as never), false);
});
