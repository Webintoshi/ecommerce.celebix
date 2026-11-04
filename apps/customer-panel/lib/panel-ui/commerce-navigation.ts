import type { PanelNavigationHref, PanelNavigationItem } from "./navigation.ts";

export interface CommerceNavigationSection {
  readonly key: string;
  readonly label: string;
  readonly subtitle?: string;
  readonly items: readonly PanelNavigationItem[];
}

export interface CommerceNavigationModel {
  readonly sections: readonly CommerceNavigationSection[];
  readonly quickSale?: PanelNavigationItem;
}

export function isCommerceNavigationStoreEnabled(
  trustedStoreSlug: string | undefined,
  configuredAllowlist: string | undefined,
): boolean {
  const slug = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
  if (typeof trustedStoreSlug !== "string" || !slug.test(trustedStoreSlug)) return false;
  if (typeof configuredAllowlist !== "string" || !configuredAllowlist || configuredAllowlist.length > 8192) return false;
  const allowed = configuredAllowlist.split(",").map(value => value.trim());
  if (allowed.length > 128 || allowed.some(value => !slug.test(value))) return false;
  return allowed.includes(trustedStoreSlug);
}

function flatten(items: readonly PanelNavigationItem[]): readonly PanelNavigationItem[] {
  return items.flatMap(item => [item, ...flatten(item.children ?? [])]);
}

function group(key: string, label: string, items: readonly (PanelNavigationItem | undefined)[]): PanelNavigationItem | undefined {
  const children = items.filter((item): item is PanelNavigationItem => Boolean(item));
  if (!children.length) return undefined;
  return Object.freeze({ ...children[0], key, label, children: Object.freeze(children) });
}

function rename(item: PanelNavigationItem | undefined, label: string): PanelNavigationItem | undefined {
  return item ? Object.freeze({ ...item, label }) : undefined;
}

function section(
  key: string,
  label: string,
  items: readonly (PanelNavigationItem | undefined)[],
  subtitle?: string,
): CommerceNavigationSection {
  return Object.freeze({ key, label, ...(subtitle ? { subtitle } : {}), items: Object.freeze(items.filter((item): item is PanelNavigationItem => Boolean(item))) });
}

export function createCommerceNavigation(
  navigation: readonly PanelNavigationItem[],
  input: Readonly<{ navigationMode?: "register" }> = {},
): CommerceNavigationModel {
  if (input.navigationMode === "register") {
    return Object.freeze({ sections: Object.freeze(navigation.length ? [Object.freeze({ key: "register", label: "Mağaza", items: navigation })] : []) });
  }

  const source = flatten(navigation);
  const byHref = new Map<PanelNavigationHref, PanelNavigationItem>();
  for (const item of source) {
    const existing = byHref.get(item.href);
    if (!existing || !item.children?.length) byHref.set(item.href, item);
  }
  const at = (href: PanelNavigationHref) => byHref.get(href);
  const root = (key: string) => navigation.find(item => item.key === key);

  const quickSale = rename(at("/orders/quick-links"), "Yeni satış");
  const catalog = group("catalog", "Ürünler", [
    group("catalog-list", "Tüm ürünler", [at("/products"), at("/products/new")]),
    group("catalog-grouping", "Gruplandırma", [at("/products/categories"), at("/products/collections"), at("/products/tags")]),
    group("catalog-features", "Ürün özellikleri", [at("/products/attributes"), at("/products/brands"), at("/products/extras"), at("/products/definitions")]),
    group("catalog-imports", "İçe / dışa aktarma", [at("/products/auto-import"), at("/products/bulk-upload"), at("/products/shopify-converter")]),
  ]);
  const inventory = group("inventory-pricing", "Stok ve fiyat", [
    rename(at("/products/stock"), "Stok ve depolar"),
    at("/products/price-lists"),
    rename(at("/settings/pricing"), "Kur ve altın referansları"),
    at("/products/barcode-labels"),
  ]);
  const website = group("website", "Web sitesi", [
    at("/settings/design"),
    root("content"),
    rename(at("/products/reviews"), "Ürün yorumları"),
    root("seo"),
  ]);
  const payments = group("carts-payments", "Sepetler ve ödemeler", [at("/orders/abandoned-carts"), at("/orders/payment-links")]);
  const originalSettings = root("settings");
  const settings = originalSettings ? Object.freeze({
    ...originalSettings,
    ...(originalSettings.children ? {
      children: Object.freeze(originalSettings.children.filter(item => item.href !== "/settings/design" && item.href !== "/settings/pricing")),
    } : {}),
  }) : undefined;
  const originalAccounting = root("accounting");
  const accounting = originalAccounting ? Object.freeze({
    ...originalAccounting,
    ...(originalAccounting.children ? {
      children: Object.freeze(originalAccounting.children.filter(item => item.href !== "/accounting/accounts")),
    } : {}),
  }) : undefined;

  let sections = [
    section("general", "Genel", [root("summary"), root("analytics")]),
    section("physical-commerce", "F-Ticaret", [at("/accounting/accounts")], "Fiziki satış"),
    section("online-commerce", "E-Ticaret", [rename(at("/orders"), "Tüm siparişler"), payments, root("marketplaces"), website], "İnternet satışı"),
    section("shared-commerce", "Ortak yönetim", [catalog, inventory, root("customers"), accounting]),
    section("growth", "Büyüme", [root("discounts"), root("marketing")]),
    section("management", "Yönetim", [settings]),
  ];

  const represented = new Set(flatten([...sections.flatMap(item => item.items), ...(quickSale ? [quickSale] : [])]).map(item => item.href));
  const remaining: PanelNavigationItem[] = [];
  for (const item of source) {
    if (represented.has(item.href)) continue;
    represented.add(item.href);
    const { children: _children, ...link } = item;
    remaining.push(Object.freeze(link));
  }
  if (remaining.length) {
    sections = sections.map(item => item.key === "management"
      ? section(item.key, item.label, [...item.items, ...remaining])
      : item);
  }

  return Object.freeze({
    sections: Object.freeze(sections.filter(item => item.items.length)),
    ...(quickSale ? { quickSale } : {}),
  });
}
