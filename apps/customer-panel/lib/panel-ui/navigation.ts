export type PanelNavigationHref = "/" | "/orders" | "/orders/quick-links" | "/orders/abandoned-carts" | "/products" | "/products/new" | "/setup";
export type PanelNavigationIcon = "home" | "orders" | "quick-orders" | "abandoned-carts" | "products" | "add-product" | "setup";

export interface PanelNavigationItem {
  readonly key: "summary" | "orders" | "all-orders" | "quick-orders" | "abandoned-carts" | "catalog" | "products" | "new-product" | "setup";
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
    | "Ürün kataloğu"
    | "Yeni ürün oluştur"
    | "Ürün ayrıntısı"
    | "Kurulum durumu";
}

export const PANEL_ROUTE_PRESENTATIONS = Object.freeze({
  summary: Object.freeze({ title: "Özet" as const }),
  orders: Object.freeze({ title: "Siparişler" as const }),
  quickOrders: Object.freeze({ title: "Hızlı Siparişler" as const }),
  abandonedCarts: Object.freeze({ title: "Terk Edilen Sepetler" as const }),
  abandonedCartDetail: Object.freeze({ title: "Sepet ayrıntısı" as const }),
  orderDetail: Object.freeze({ title: "Sipariş ayrıntısı" as const }),
  products: Object.freeze({ title: "Ürün kataloğu" as const }),
  newProduct: Object.freeze({ title: "Yeni ürün oluştur" as const }),
  productDetail: Object.freeze({ title: "Ürün ayrıntısı" as const }),
  setup: Object.freeze({ title: "Kurulum durumu" as const }),
});

const CATALOG_CHILDREN = Object.freeze<readonly PanelNavigationItem[]>([
  Object.freeze({ key: "products", label: "Tüm ürünler", href: "/products", icon: "products" }),
  Object.freeze({ key: "new-product", label: "Yeni ürün", href: "/products/new", icon: "add-product" }),
]);

const ORDER_CHILDREN = Object.freeze<readonly PanelNavigationItem[]>([
  Object.freeze({ key: "all-orders", label: "Tüm Siparişler", href: "/orders", icon: "orders" }),
  Object.freeze({ key: "quick-orders", label: "Hızlı Siparişler", href: "/orders/quick-links", icon: "quick-orders" }),
  Object.freeze({ key: "abandoned-carts", label: "Terk Edilen Sepetler", href: "/orders/abandoned-carts", icon: "abandoned-carts" }),
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
    key: "catalog",
    label: "Ürünler",
    href: "/products",
    icon: "products",
    children: CATALOG_CHILDREN,
  }),
  Object.freeze({ key: "setup", label: "Kurulum", href: "/setup", icon: "setup" }),
]);

export function isPanelNavigationPathActive(pathname: string, href: PanelNavigationHref): boolean {
  if (!pathname.startsWith("/") || pathname.includes("?") || pathname.includes("#") || pathname.includes("%") || pathname.includes("//")) {
    return false;
  }

  if (href === "/") return pathname === "/";
  if (href === "/orders/quick-links" || href === "/products/new" || href === "/setup") {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(href + "/");
}

export function getPanelRoutePresentation(pathname: string): PanelRoutePresentation {
  if (!pathname.startsWith("/") || pathname.includes("?") || pathname.includes("#") || pathname.includes("%") || pathname.includes("//")) {
    return PANEL_ROUTE_PRESENTATIONS.summary;
  }
  if (pathname === "/orders") return PANEL_ROUTE_PRESENTATIONS.orders;
  if (pathname === "/orders/quick-links") return PANEL_ROUTE_PRESENTATIONS.quickOrders;
  if (pathname === "/orders/abandoned-carts") return PANEL_ROUTE_PRESENTATIONS.abandonedCarts;
  if (pathname.startsWith("/orders/abandoned-carts/") && !pathname.slice("/orders/abandoned-carts/".length).includes("/")) return PANEL_ROUTE_PRESENTATIONS.abandonedCartDetail;
  if (pathname === "/products") return PANEL_ROUTE_PRESENTATIONS.products;
  if (pathname === "/products/new") return PANEL_ROUTE_PRESENTATIONS.newProduct;
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
