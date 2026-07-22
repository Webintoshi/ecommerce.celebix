export type PanelNavigationHref =
  | "/"
  | "/orders"
  | "/orders/quick-links"
  | "/orders/abandoned-carts"
  | "/customers"
  | "/customers/segments"
  | "/customers/tags"
  | "/customers/new"
  | "/products"
  | "/products/new"
  | "/products/collections"
  | "/products/brands"
  | "/products/attributes"
  | "/products/extras"
  | "/products/reviews"
  | "/products/definitions"
  | "/products/bulk-upload"
  | "/setup";
export type PanelNavigationIcon =
  | "home"
  | "orders"
  | "quick-orders"
  | "abandoned-carts"
  | "customers"
  | "segments"
  | "tags"
  | "add-customer"
  | "products"
  | "add-product"
  | "collections"
  | "brands"
  | "attributes"
  | "extras"
  | "reviews"
  | "definitions"
  | "bulk-upload"
  | "setup";

export interface PanelNavigationItem {
  readonly key:
    | "summary"
    | "orders"
    | "all-orders"
    | "quick-orders"
    | "abandoned-carts"
    | "customers"
    | "all-customers"
    | "customer-segments"
    | "customer-tags"
    | "new-customer"
    | "catalog"
    | "products"
    | "new-product"
    | "collections"
    | "brands"
    | "attributes"
    | "extras"
    | "reviews"
    | "definitions"
    | "bulk-upload"
    | "setup";
  readonly label: string;
  readonly href: PanelNavigationHref;
  readonly icon: PanelNavigationIcon;
  readonly children?: readonly PanelNavigationItem[];
}

export interface PanelRoutePresentation {
  readonly title:
    | "Özet"
    | "Siparişler"
    | "Hızlı Siparişler"
    | "Terk Edilen Sepetler"
    | "Sepet ayrıntısı"
    | "Sipariş ayrıntısı"
    | "Müşteriler"
    | "Segmentler"
    | "Etiketler"
    | "Yeni müşteri"
    | "Müşteri ayrıntısı"
    | "Ürün kataloğu"
    | "Yeni ürün oluştur"
    | "Ürün ayrıntısı"
    | "Koleksiyonlar"
    | "Markalar"
    | "Nitelikler"
    | "Ekstralar"
    | "Yorumlar"
    | "Tanımlamalar"
    | "Toplu Yükle"
    | "Kurulum durumu";
}

export const PANEL_ROUTE_PRESENTATIONS = Object.freeze({
  summary: Object.freeze({ title: "Özet" as const }),
  orders: Object.freeze({ title: "Siparişler" as const }),
  quickOrders: Object.freeze({ title: "Hızlı Siparişler" as const }),
  abandonedCarts: Object.freeze({ title: "Terk Edilen Sepetler" as const }),
  abandonedCartDetail: Object.freeze({ title: "Sepet ayrıntısı" as const }),
  orderDetail: Object.freeze({ title: "Sipariş ayrıntısı" as const }),
  customers: Object.freeze({ title: "Müşteriler" as const }),
  customerSegments: Object.freeze({ title: "Segmentler" as const }),
  customerTags: Object.freeze({ title: "Etiketler" as const }),
  newCustomer: Object.freeze({ title: "Yeni müşteri" as const }),
  customerDetail: Object.freeze({ title: "Müşteri ayrıntısı" as const }),
  products: Object.freeze({ title: "Ürün kataloğu" as const }),
  newProduct: Object.freeze({ title: "Yeni ürün oluştur" as const }),
  productDetail: Object.freeze({ title: "Ürün ayrıntısı" as const }),
  collections: Object.freeze({ title: "Koleksiyonlar" as const }),
  brands: Object.freeze({ title: "Markalar" as const }),
  attributes: Object.freeze({ title: "Nitelikler" as const }),
  extras: Object.freeze({ title: "Ekstralar" as const }),
  reviews: Object.freeze({ title: "Yorumlar" as const }),
  definitions: Object.freeze({ title: "Tanımlamalar" as const }),
  bulkUpload: Object.freeze({ title: "Toplu Yükle" as const }),
  setup: Object.freeze({ title: "Kurulum durumu" as const }),
});

const CATALOG_CHILDREN = Object.freeze<readonly PanelNavigationItem[]>([
  Object.freeze({
    key: "products",
    label: "Tüm ürünler",
    href: "/products",
    icon: "products",
  }),
  Object.freeze({
    key: "new-product",
    label: "Yeni ürün",
    href: "/products/new",
    icon: "add-product",
  }),
  Object.freeze({ key: "collections", label: "Koleksiyonlar", href: "/products/collections", icon: "collections" }),
  Object.freeze({ key: "brands", label: "Markalar", href: "/products/brands", icon: "brands" }),
  Object.freeze({ key: "attributes", label: "Nitelikler", href: "/products/attributes", icon: "attributes" }),
  Object.freeze({ key: "extras", label: "Ekstralar", href: "/products/extras", icon: "extras" }),
  Object.freeze({ key: "reviews", label: "Yorumlar", href: "/products/reviews", icon: "reviews" }),
  Object.freeze({ key: "definitions", label: "Tanımlamalar", href: "/products/definitions", icon: "definitions" }),
  Object.freeze({ key: "bulk-upload", label: "Toplu Yükle", href: "/products/bulk-upload", icon: "bulk-upload" }),
]);

const ORDER_CHILDREN = Object.freeze<readonly PanelNavigationItem[]>([
  Object.freeze({
    key: "all-orders",
    label: "Tüm Siparişler",
    href: "/orders",
    icon: "orders",
  }),
  Object.freeze({
    key: "quick-orders",
    label: "Hızlı Siparişler",
    href: "/orders/quick-links",
    icon: "quick-orders",
  }),
  Object.freeze({
    key: "abandoned-carts",
    label: "Terk Edilen Sepetler",
    href: "/orders/abandoned-carts",
    icon: "abandoned-carts",
  }),
]);

const CUSTOMER_CHILDREN = Object.freeze<readonly PanelNavigationItem[]>([
  Object.freeze({
    key: "all-customers",
    label: "Tüm Müşteriler",
    href: "/customers",
    icon: "customers",
  }),
  Object.freeze({
    key: "customer-segments",
    label: "Segmentler",
    href: "/customers/segments",
    icon: "segments",
  }),
  Object.freeze({
    key: "customer-tags",
    label: "Etiketler",
    href: "/customers/tags",
    icon: "tags",
  }),
  Object.freeze({
    key: "new-customer",
    label: "Yeni Müşteri",
    href: "/customers/new",
    icon: "add-customer",
  }),
]);

export const PANEL_NAVIGATION = Object.freeze<readonly PanelNavigationItem[]>([
  Object.freeze({ key: "summary", label: "Özet", href: "/", icon: "home" }),
  Object.freeze({
    key: "orders",
    label: "Siparişler",
    href: "/orders",
    icon: "orders",
    children: ORDER_CHILDREN,
  }),
  Object.freeze({
    key: "customers",
    label: "Müşteriler",
    href: "/customers",
    icon: "customers",
    children: CUSTOMER_CHILDREN,
  }),
  Object.freeze({
    key: "catalog",
    label: "Ürünler",
    href: "/products",
    icon: "products",
    children: CATALOG_CHILDREN,
  }),
  Object.freeze({
    key: "setup",
    label: "Kurulum",
    href: "/setup",
    icon: "setup",
  }),
]);

export function isPanelNavigationPathActive(
  pathname: string,
  href: PanelNavigationHref,
): boolean {
  if (
    !pathname.startsWith("/") ||
    pathname.includes("?") ||
    pathname.includes("#") ||
    pathname.includes("%") ||
    pathname.includes("//")
  ) {
    return false;
  }

  if (href === "/") return pathname === "/";
  if (
    href === "/orders/quick-links" ||
    href === "/customers/segments" ||
    href === "/customers/tags" ||
    href === "/customers/new" ||
    href === "/products/new" ||
    href === "/products/collections" ||
    href === "/products/brands" ||
    href === "/products/attributes" ||
    href === "/products/extras" ||
    href === "/products/reviews" ||
    href === "/products/definitions" ||
    href === "/products/bulk-upload" ||
    href === "/setup"
  ) {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(href + "/");
}

export function getPanelRoutePresentation(
  pathname: string,
): PanelRoutePresentation {
  if (
    !pathname.startsWith("/") ||
    pathname.includes("?") ||
    pathname.includes("#") ||
    pathname.includes("%") ||
    pathname.includes("//")
  ) {
    return PANEL_ROUTE_PRESENTATIONS.summary;
  }
  if (pathname === "/orders") return PANEL_ROUTE_PRESENTATIONS.orders;
  if (pathname === "/orders/quick-links")
    return PANEL_ROUTE_PRESENTATIONS.quickOrders;
  if (pathname === "/orders/abandoned-carts")
    return PANEL_ROUTE_PRESENTATIONS.abandonedCarts;
  if (
    pathname.startsWith("/orders/abandoned-carts/") &&
    !pathname.slice("/orders/abandoned-carts/".length).includes("/")
  )
    return PANEL_ROUTE_PRESENTATIONS.abandonedCartDetail;
  if (pathname === "/customers") return PANEL_ROUTE_PRESENTATIONS.customers;
  if (pathname === "/customers/segments")
    return PANEL_ROUTE_PRESENTATIONS.customerSegments;
  if (pathname === "/customers/tags")
    return PANEL_ROUTE_PRESENTATIONS.customerTags;
  if (pathname === "/customers/new")
    return PANEL_ROUTE_PRESENTATIONS.newCustomer;
  if (
    pathname.startsWith("/customers/") &&
    !pathname.slice("/customers/".length).includes("/")
  )
    return PANEL_ROUTE_PRESENTATIONS.customerDetail;
  if (pathname === "/products") return PANEL_ROUTE_PRESENTATIONS.products;
  if (pathname === "/products/new") return PANEL_ROUTE_PRESENTATIONS.newProduct;
  if (pathname === "/products/collections") return PANEL_ROUTE_PRESENTATIONS.collections;
  if (pathname === "/products/brands") return PANEL_ROUTE_PRESENTATIONS.brands;
  if (pathname === "/products/attributes") return PANEL_ROUTE_PRESENTATIONS.attributes;
  if (pathname === "/products/extras") return PANEL_ROUTE_PRESENTATIONS.extras;
  if (pathname === "/products/reviews") return PANEL_ROUTE_PRESENTATIONS.reviews;
  if (pathname === "/products/definitions") return PANEL_ROUTE_PRESENTATIONS.definitions;
  if (pathname === "/products/bulk-upload") return PANEL_ROUTE_PRESENTATIONS.bulkUpload;
  if (pathname === "/setup") return PANEL_ROUTE_PRESENTATIONS.setup;

  const productDetail = pathname.startsWith("/products/")
    ? pathname.slice("/products/".length)
    : "";
  if (productDetail.length > 0 && !productDetail.includes("/")) {
    return PANEL_ROUTE_PRESENTATIONS.productDetail;
  }

  const orderDetail = pathname.startsWith("/orders/")
    ? pathname.slice("/orders/".length)
    : "";
  if (orderDetail.length > 0 && !orderDetail.includes("/")) {
    return PANEL_ROUTE_PRESENTATIONS.orderDetail;
  }

  return PANEL_ROUTE_PRESENTATIONS.summary;
}

export function getPanelNavigationState(pathname: string) {
  return Object.freeze(
    PANEL_NAVIGATION.map((item) =>
      Object.freeze({
        key: item.key,
        active: isPanelNavigationPathActive(pathname, item.href),
        children: Object.freeze(
          (item.children ?? []).map((child) =>
            Object.freeze({
              key: child.key,
              active: isPanelNavigationPathActive(pathname, child.href),
            }),
          ),
        ),
      }),
    ),
  );
}
