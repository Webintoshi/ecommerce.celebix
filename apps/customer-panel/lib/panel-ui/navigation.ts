export type PanelNavigationHref = "/" | "/products" | "/products/new" | "/setup";
export type PanelNavigationIcon = "home" | "products" | "add-product" | "setup";

export interface PanelNavigationItem {
  readonly key: "overview" | "catalog" | "products" | "new-product" | "setup";
  readonly label: string;
  readonly href: PanelNavigationHref;
  readonly icon: PanelNavigationIcon;
  readonly children?: readonly PanelNavigationItem[];
}

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
