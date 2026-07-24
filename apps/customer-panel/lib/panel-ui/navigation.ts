export type PanelNavigationHref =
  | "/"
  | "/analytics"
  | "/orders"
  | "/orders/quick-links"
  | "/orders/abandoned-carts"
  | "/customers"
  | "/customers/segments"
  | "/customers/tags"
  | "/products"
  | "/products/collections"
  | "/products/brands"
  | "/products/attributes"
  | "/products/extras"
  | "/products/reviews"
  | "/products/definitions"
  | "/products/tags"
  | "/products/barcode-labels"
  | "/products/purchasing"
  | "/products/inventory-counts"
  | "/products/transfers"
  | "/products/price-lists"
  | "/products/auto-import"
  | "/products/shopify-converter"
  | "/products/bulk-upload"
  | "/discounts"
  | "/discounts/lucky-wheel"
  | "/marketing"
  | "/marketing/email"
  | "/marketing/phone"
  | "/marketing/whatsapp"
  | "/content"
  | "/content/blog"
  | "/content/pages"
  | "/content/policies"
  | "/marketplaces"
  | "/settings"
  | "/settings/design"
  | "/settings/general"
  | "/settings/language"
  | "/settings/payment"
  | "/settings/shipping"
  | "/settings/administrators"
  | "/settings/notifications"
  | "/settings/hero-banner"
  | "/settings/promotion-banner"
  | "/settings/marquee"
  | "/settings/artificial-intelligence"
  | "/accounting"
  | "/accounting/invoicing-integration"
  | "/seo"
  | "/seo/sitemap"
  | "/seo/social-preview"
  | "/seo/code-integrations"
  | "/seo/fast-indexing"
  | "/seo/geo-optimization"
  | "/seo/internal-linking"
  | "/seo/content"
  | "/seo/categories"
  | "/seo/pages"
  | "/seo/products"
  | "/setup";

export type PanelNavigationIcon =
  | "home"
  | "analytics"
  | "orders"
  | "quick-orders"
  | "abandoned-carts"
  | "customers"
  | "segments"
  | "tags"
  | "products"
  | "collections"
  | "brands"
  | "attributes"
  | "extras"
  | "reviews"
  | "definitions"
  | "barcode"
  | "purchasing"
  | "inventory"
  | "price-lists"
  | "bulk-upload"
  | "discounts"
  | "lucky-wheel"
  | "marketing"
  | "email"
  | "phone"
  | "whatsapp"
  | "content"
  | "blog"
  | "pages"
  | "policies"
  | "marketplaces"
  | "settings"
  | "design"
  | "language"
  | "payment"
  | "shipping"
  | "administrators"
  | "accounting"
  | "invoice"
  | "seo"
  | "sitemap"
  | "social-preview"
  | "code"
  | "indexing"
  | "setup";

export interface PanelNavigationItem {
  readonly key: string;
  readonly label: string;
  readonly href: PanelNavigationHref;
  readonly icon: PanelNavigationIcon;
  readonly children?: readonly PanelNavigationItem[];
}

export interface PanelRoutePresentation {
  readonly title: string;
}

function item(
  key: string,
  label: string,
  href: PanelNavigationHref,
  icon: PanelNavigationIcon,
  children?: readonly PanelNavigationItem[],
): PanelNavigationItem {
  return Object.freeze({ key, label, href, icon, ...(children ? { children } : {}) });
}

const ORDER_CHILDREN = Object.freeze([
  item("all-orders", "Tüm Siparişler", "/orders", "orders"),
  item("quick-orders", "Hızlı Siparişler", "/orders/quick-links", "quick-orders"),
  item("abandoned-carts", "Terk Edilen Sepetler", "/orders/abandoned-carts", "abandoned-carts"),
]);

const CUSTOMER_CHILDREN = Object.freeze([
  item("all-customers", "Tüm Müşteriler", "/customers", "customers"),
  item("customer-segments", "Segmentler", "/customers/segments", "segments"),
  item("customer-tags", "Etiketler", "/customers/tags", "tags"),
]);

const CATALOG_CHILDREN = Object.freeze([
  item("products", "Tüm ürünler", "/products", "products"),
  item("collections", "Koleksiyonlar", "/products/collections", "collections"),
  item("brands", "Markalar", "/products/brands", "brands"),
  item("attributes", "Nitelikler", "/products/attributes", "attributes"),
  item("extras", "Ekstralar", "/products/extras", "extras"),
  item("reviews", "Yorumlar", "/products/reviews", "reviews"),
  item("definitions", "Tanımlamalar", "/products/definitions", "definitions"),
  item("product-tags", "Etiketler", "/products/tags", "tags"),
  item("barcode-labels", "Barkod Etiketleri", "/products/barcode-labels", "barcode"),
  item("purchasing", "Satın Alma", "/products/purchasing", "purchasing"),
  item("inventory-counts", "Stok Sayımları", "/products/inventory-counts", "inventory"),
  item("transfers", "Stok Konumları ve Transferler", "/products/transfers", "inventory"),
  item("price-lists", "Fiyat Listeleri", "/products/price-lists", "price-lists"),
  item("auto-import", "Otomatik Yükle", "/products/auto-import", "bulk-upload"),
  item("shopify-converter", "Shopify Dönüştürücü", "/products/shopify-converter", "bulk-upload"),
  item("bulk-upload", "Toplu Yükle", "/products/bulk-upload", "bulk-upload"),
]);

const DISCOUNT_CHILDREN = Object.freeze([
  item("all-discounts", "Tüm İndirimler", "/discounts", "discounts"),
  item("lucky-wheel", "Şans Çarkı", "/discounts/lucky-wheel", "lucky-wheel"),
]);

const MARKETING_CHILDREN = Object.freeze([
  item("marketing-summary", "Pazarlama Özeti", "/marketing", "marketing"),
  item("email-marketing", "E-posta", "/marketing/email", "email"),
  item("phone-marketing", "Telefon", "/marketing/phone", "phone"),
  item("whatsapp-marketing", "WhatsApp", "/marketing/whatsapp", "whatsapp"),
]);

const CONTENT_CHILDREN = Object.freeze([
  item("blog", "Blog", "/content/blog", "blog"),
  item("pages", "Sayfalar", "/content/pages", "pages"),
  item("policies", "Politikalar", "/content/policies", "policies"),
]);

const SETTINGS_CHILDREN = Object.freeze([
  item("general-settings", "Genel", "/settings/general", "settings"),
  item("design-settings", "Tasarım", "/settings/design", "design"),
  item("language-settings", "Dil", "/settings/language", "language"),
  item("payment-settings", "Ödeme", "/settings/payment", "payment"),
  item("shipping-settings", "Kargo", "/settings/shipping", "shipping"),
  item("administrators", "Yöneticiler", "/settings/administrators", "administrators"),
  item("notifications", "Bildirimler", "/settings/notifications", "email"),
  item("hero-banner", "Hero Banner", "/settings/hero-banner", "content"),
  item("promotion-banner", "Promosyon Banner", "/settings/promotion-banner", "discounts"),
  item("marquee", "Kayan Duyuru", "/settings/marquee", "marketing"),
  item("artificial-intelligence", "Yapay Zeka", "/settings/artificial-intelligence", "settings"),
]);

const ACCOUNTING_CHILDREN = Object.freeze([
  item("accounting-summary", "Muhasebe Özeti", "/accounting", "accounting"),
  item("invoicing-integration", "Fatura Entegrasyonu", "/accounting/invoicing-integration", "invoice"),
]);

const SEO_CHILDREN = Object.freeze([
  item("seo-control", "SEO Kontrol", "/seo", "seo"),
  item("sitemap", "Site Haritası", "/seo/sitemap", "sitemap"),
  item("social-preview", "Sosyal Önizleme", "/seo/social-preview", "social-preview"),
  item("code-integrations", "Kod Entegrasyonları", "/seo/code-integrations", "code"),
  item("fast-indexing", "Hızlı İndeksleme", "/seo/fast-indexing", "indexing"),
  item("geo-optimization", "Coğrafi SEO", "/seo/geo-optimization", "seo"),
  item("internal-linking", "İç Bağlantılar", "/seo/internal-linking", "seo"),
  item("content-seo", "İçerik SEO", "/seo/content", "seo"),
  item("category-seo", "Kategori SEO", "/seo/categories", "seo"),
  item("page-seo", "Sayfa SEO", "/seo/pages", "seo"),
  item("product-seo", "Ürün SEO", "/seo/products", "seo"),
]);

export const PANEL_NAVIGATION = Object.freeze<readonly PanelNavigationItem[]>([
  item("summary", "Özet", "/", "home"),
  item("analytics", "Analizler", "/analytics", "analytics"),
  item("orders", "Siparişler", "/orders", "orders", ORDER_CHILDREN),
  item("customers", "Müşteriler", "/customers", "customers", CUSTOMER_CHILDREN),
  item("catalog", "Ürünler", "/products", "products", CATALOG_CHILDREN),
  item("discounts", "İndirimler", "/discounts", "discounts", DISCOUNT_CHILDREN),
  item("marketing", "Pazarlama", "/marketing", "marketing", MARKETING_CHILDREN),
  item("content", "İçerik", "/content", "content", CONTENT_CHILDREN),
  item("marketplaces", "Pazar Yerleri", "/marketplaces", "marketplaces"),
  item("settings", "Ayarlar", "/settings", "settings", SETTINGS_CHILDREN),
  item("accounting", "Muhasebe", "/accounting", "accounting", ACCOUNTING_CHILDREN),
  item("seo", "SEO", "/seo", "seo", SEO_CHILDREN),
  item("setup", "Kurulum", "/setup", "setup"),
]);

const presentation = (title: string): PanelRoutePresentation => Object.freeze({ title });

const TITLES = Object.freeze<Record<string, PanelRoutePresentation>>({
  "/": presentation("Özet"),
  "/analytics": presentation("Analizler"),
  "/orders": presentation("Siparişler"),
  "/orders/quick-links": presentation("Hızlı Siparişler"),
  "/orders/abandoned-carts": presentation("Terk Edilen Sepetler"),
  "/customers": presentation("Müşteriler"),
  "/customers/segments": presentation("Segmentler"),
  "/customers/tags": presentation("Etiketler"),
  "/customers/new": presentation("Yeni müşteri"),
  "/products": presentation("Ürün kataloğu"),
  "/products/new": presentation("Yeni ürün oluştur"),
  "/products/collections": presentation("Koleksiyonlar"),
  "/products/brands": presentation("Markalar"),
  "/products/attributes": presentation("Nitelikler"),
  "/products/extras": presentation("Ekstralar"),
  "/products/reviews": presentation("Yorumlar"),
  "/products/definitions": presentation("Tanımlamalar"),
  "/products/tags": presentation("Ürün etiketleri"),
  "/products/barcode-labels": presentation("Barkod etiketleri"),
  "/products/purchasing": presentation("Satın alma"),
  "/products/inventory-counts": presentation("Stok sayımları"),
  "/products/transfers": presentation("Stok transferleri"),
  "/products/price-lists": presentation("Fiyat listeleri"),
  "/products/auto-import": presentation("Otomatik Yükle"),
  "/products/shopify-converter": presentation("Shopify Dönüştürücü"),
  "/products/bulk-upload": presentation("Toplu Yükle"),
  "/discounts": presentation("İndirimler"),
  "/discounts/new": presentation("Yeni İndirim"),
  "/discounts/lucky-wheel": presentation("Şans Çarkı"),
  "/marketing": presentation("Pazarlama Özeti"),
  "/marketing/email": presentation("E-posta Kampanyaları"),
  "/marketing/phone": presentation("Telefon Kampanyaları"),
  "/marketing/whatsapp": presentation("WhatsApp Kampanyaları"),
  "/content": presentation("İçerik"),
  "/content/blog": presentation("Blog"),
  "/content/pages": presentation("Sayfalar"),
  "/content/policies": presentation("Politikalar"),
  "/marketplaces": presentation("Pazar Yerleri"),
  "/settings": presentation("Ayarlar"),
  "/settings/design": presentation("Tasarım Ayarları"),
  "/settings/general": presentation("Genel Ayarlar"),
  "/settings/language": presentation("Dil Ayarları"),
  "/settings/payment": presentation("Ödeme Ayarları"),
  "/settings/shipping": presentation("Kargo Ayarları"),
  "/settings/administrators": presentation("Yöneticiler"),
  "/settings/notifications": presentation("Bildirimler"),
  "/settings/hero-banner": presentation("Hero Banner"),
  "/settings/promotion-banner": presentation("Promosyon Banner"),
  "/settings/marquee": presentation("Kayan Duyuru"),
  "/settings/artificial-intelligence": presentation("Yapay Zeka"),
  "/accounting": presentation("Muhasebe"),
  "/accounting/invoicing-integration": presentation("Fatura Entegrasyonu"),
  "/seo": presentation("SEO Kontrol"),
  "/seo/sitemap": presentation("Site Haritası"),
  "/seo/social-preview": presentation("Sosyal Önizleme"),
  "/seo/code-integrations": presentation("Kod Entegrasyonları"),
  "/seo/fast-indexing": presentation("Hızlı İndeksleme"),
  "/seo/geo-optimization": presentation("Coğrafi SEO"),
  "/seo/internal-linking": presentation("İç Bağlantılar"),
  "/seo/content": presentation("İçerik SEO"),
  "/seo/categories": presentation("Kategori SEO"),
  "/seo/pages": presentation("Sayfa SEO"),
  "/seo/products": presentation("Ürün SEO"),
  "/setup": presentation("Kurulum durumu"),
});

export const PANEL_ROUTE_PRESENTATIONS = Object.freeze({
  summary: TITLES["/"]!,
  analytics: TITLES["/analytics"]!,
  orders: TITLES["/orders"]!,
  quickOrders: TITLES["/orders/quick-links"]!,
  abandonedCarts: TITLES["/orders/abandoned-carts"]!,
  abandonedCartDetail: presentation("Sepet ayrıntısı"),
  orderDetail: presentation("Sipariş ayrıntısı"),
  customers: TITLES["/customers"]!,
  customerSegments: TITLES["/customers/segments"]!,
  customerTags: TITLES["/customers/tags"]!,
  newCustomer: TITLES["/customers/new"]!,
  customerDetail: presentation("Müşteri ayrıntısı"),
  products: TITLES["/products"]!,
  newProduct: TITLES["/products/new"]!,
  productDetail: presentation("Ürün ayrıntısı"),
  collections: TITLES["/products/collections"]!,
  brands: TITLES["/products/brands"]!,
  attributes: TITLES["/products/attributes"]!,
  extras: TITLES["/products/extras"]!,
  reviews: TITLES["/products/reviews"]!,
  definitions: TITLES["/products/definitions"]!,
  productTags: TITLES["/products/tags"]!,
  barcodeLabels: TITLES["/products/barcode-labels"]!,
  purchasing: TITLES["/products/purchasing"]!,
  purchaseDetail: presentation("Satın alma ayrıntısı"),
  inventoryCounts: TITLES["/products/inventory-counts"]!,
  inventoryCountDetail: presentation("Stok sayımı ayrıntısı"),
  transfers: TITLES["/products/transfers"]!,
  transferDetail: presentation("Stok transferi ayrıntısı"),
  priceLists: TITLES["/products/price-lists"]!,
  priceListDetail: presentation("Fiyat listesi ayrıntısı"),
  bulkUpload: TITLES["/products/bulk-upload"]!,
  setup: TITLES["/setup"]!,
});

const MAX_PATH_LENGTH = 2048;
const MAX_SEGMENT_LENGTH = 200;
const SAFE_SEGMENT = /^[a-z0-9][a-z0-9_-]*$/i;

function decodedPathSegments(pathname: string): readonly string[] | null {
  if (
    !pathname.startsWith("/")
    || pathname.length > MAX_PATH_LENGTH
    || pathname.includes("?")
    || pathname.includes("#")
    || pathname.includes("\\")
  ) return null;

  if (pathname === "/") return Object.freeze([]);
  const encodedSegments = pathname.slice(1).split("/");
  if (encodedSegments.some((segment) => !segment)) return null;

  const segments: string[] = [];
  for (const encodedSegment of encodedSegments) {
    let segment: string;
    try {
      segment = decodeURIComponent(encodedSegment);
    } catch {
      return null;
    }
    if (
      !segment
      || segment.length > MAX_SEGMENT_LENGTH
      || segment === "."
      || segment === ".."
      || segment.includes("/")
      || segment.includes("\\")
      || !SAFE_SEGMENT.test(segment)
    ) return null;
    segments.push(segment);
  }
  return Object.freeze(segments);
}

function routeMatches(pathname: string, href: PanelNavigationHref): boolean {
  const pathnameSegments = decodedPathSegments(pathname);
  const hrefSegments = decodedPathSegments(href);
  if (!pathnameSegments || !hrefSegments) return false;
  if (!hrefSegments.length) return pathnameSegments.length === 0;
  return pathnameSegments.length >= hrefSegments.length
    && hrefSegments.every((segment, index) => pathnameSegments[index] === segment);
}

const FAMILY_HREFS = new Set<PanelNavigationHref>(
  PANEL_NAVIGATION.filter(({ children }) => children?.length).map(({ href }) => href),
);

const DETAIL_DEPTHS = new Map<PanelNavigationHref, number>([
  ["/orders/abandoned-carts", 1],
  ["/products/collections", 2],
  ["/products/brands", 2],
  ["/products/attributes", 2],
  ["/products/extras", 2],
  ["/products/definitions", 2],
  ["/products/tags", 2],
  ["/products/purchasing", 1],
  ["/products/inventory-counts", 1],
  ["/products/transfers", 1],
  ["/products/price-lists", 1],
  ["/content/blog", 2],
  ["/content/pages", 2],
  ["/content/policies", 2],
  ["/settings/payment", 2],
]);

function canonicalPath(pathname: string): string | null {
  const segments = decodedPathSegments(pathname);
  return segments ? `/${segments.join("/")}` : null;
}

export function isPanelNavigationPathActive(
  pathname: string,
  href: PanelNavigationHref,
): boolean {
  if (!routeMatches(pathname, href)) return false;
  const pathnameSegments = decodedPathSegments(pathname)!;
  const hrefSegments = decodedPathSegments(href)!;
  if (!hrefSegments.length || FAMILY_HREFS.has(href)) return true;
  const maximumDetailDepth = DETAIL_DEPTHS.get(href) ?? 0;
  return pathnameSegments.length - hrefSegments.length <= maximumDetailDepth;
}

function oneSegmentDescendant(pathname: string, base: string): string | null {
  if (!pathname.startsWith(`${base}/`)) return null;
  const detail = pathname.slice(base.length + 1);
  return detail && !detail.includes("/") ? detail : null;
}

export function getPanelRoutePresentation(pathname: string): PanelRoutePresentation {
  const path = canonicalPath(pathname);
  if (!path) return PANEL_ROUTE_PRESENTATIONS.summary;
  const exact = TITLES[path];
  if (exact) return exact;

  const operation = ([
    ["/products/purchasing", PANEL_ROUTE_PRESENTATIONS.purchaseDetail],
    ["/products/inventory-counts", PANEL_ROUTE_PRESENTATIONS.inventoryCountDetail],
    ["/products/transfers", PANEL_ROUTE_PRESENTATIONS.transferDetail],
    ["/products/price-lists", PANEL_ROUTE_PRESENTATIONS.priceListDetail],
  ] as const).find(([base]) => oneSegmentDescendant(path, base));
  if (operation) return operation[1];

  if (oneSegmentDescendant(path, "/orders/abandoned-carts")) {
    return PANEL_ROUTE_PRESENTATIONS.abandonedCartDetail;
  }
  if (oneSegmentDescendant(path, "/orders")) return PANEL_ROUTE_PRESENTATIONS.orderDetail;
  if (oneSegmentDescendant(path, "/customers")) return PANEL_ROUTE_PRESENTATIONS.customerDetail;
  if (oneSegmentDescendant(path, "/products")) return PANEL_ROUTE_PRESENTATIONS.productDetail;
  return PANEL_ROUTE_PRESENTATIONS.summary;
}

export function getPanelNavigationState(pathname: string) {
  return Object.freeze(PANEL_NAVIGATION.map((entry) => Object.freeze({
    key: entry.key,
    active: isPanelNavigationPathActive(pathname, entry.href),
    children: Object.freeze((entry.children ?? []).map((child) => Object.freeze({
      key: child.key,
      active: isPanelNavigationPathActive(pathname, child.href),
    }))),
  })));
}
