export type PanelNavigationHref = "/" | "/products" | "/products/new" | "/setup";
export type PanelNavigationIcon = "home" | "products" | "add-product" | "setup";

export interface PanelNavigationItem {
  readonly key: "overview" | "catalog" | "products" | "new-product" | "setup";
  readonly label: string;
  readonly href: PanelNavigationHref;
  readonly icon: PanelNavigationIcon;
  readonly children?: readonly PanelNavigationItem[];
}

export interface PanelRoutePresentation {
  readonly title:
    | "Genel bakış"
    | "Ürün kataloğu"
    | "Yeni ürün oluştur"
    | "Ürün ayrıntısı"
    | "Kurulum durumu";
}

export const PANEL_ROUTE_PRESENTATIONS = Object.freeze({
  overview: Object.freeze({ title: "Genel bakış" as const }),
  products: Object.freeze({ title: "Ürün kataloğu" as const }),
  newProduct: Object.freeze({ title: "Yeni ürün oluştur" as const }),
  productDetail: Object.freeze({ title: "Ürün ayrıntısı" as const }),
  setup: Object.freeze({ title: "Kurulum durumu" as const }),
});

const CATALOG_CHILDREN = Object.freeze<readonly PanelNavigationItem[]>([
  Object.freeze({ key: "products", label: "Tüm ürünler", href: "/products", icon: "products" }),
  Object.freeze({ key: "new-product", label: "Yeni ürün", href: "/products/new", icon: "add-product" }),
]);

export const PANEL_NAVIGATION = Object.freeze<readonly PanelNavigationItem[]>([
  Object.freeze({ key: "overview", label: "Genel bakış", href: "/", icon: "home" }),
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
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export function getPanelRoutePresentation(pathname: string): PanelRoutePresentation {
  if (pathname === "/products") return PANEL_ROUTE_PRESENTATIONS.products;
  if (pathname === "/products/new") return PANEL_ROUTE_PRESENTATIONS.newProduct;
  if (pathname === "/setup") return PANEL_ROUTE_PRESENTATIONS.setup;

  const productDetail = pathname.startsWith("/products/")
    ? pathname.slice("/products/".length)
    : "";
  if (productDetail.length > 0 && !productDetail.includes("/")) {
    return PANEL_ROUTE_PRESENTATIONS.productDetail;
  }

  return PANEL_ROUTE_PRESENTATIONS.overview;
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
