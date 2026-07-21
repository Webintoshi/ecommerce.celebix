import type { PanelChromeModel } from "./chrome-model.ts";
import type { CatalogDashboardSummary } from "../catalog-ui/client.ts";
import type { OrderDashboardSummary } from "@celebix/saas-contracts";
import {
  readyAuthority,
  unsupportedAuthority,
  type AuthoritySlice,
} from "./authority-slice.ts";

export interface PanelDashboardCard {
  readonly key: "store" | "membership" | "plan" | "storefront";
  readonly label: string;
  readonly value: string;
  readonly status: string;
  readonly detail?: string;
}

export interface PanelDashboardAction {
  readonly label: string;
  readonly href: "/products" | "/products/new" | "/setup";
}

export interface PanelDashboardCatalogCard {
  readonly key: "products" | "active-products" | "draft-products" | "stock-alerts";
  readonly label: string;
  readonly value: string;
  readonly detail: string;
}

export interface PanelDashboardCatalogReadiness {
  readonly productsWithoutMedia: number;
  readonly activeMedia: number;
  readonly detail: string;
}

export interface PanelDashboardModel {
  readonly title: "Genel bakış";
  readonly description: string;
  readonly cards: readonly PanelDashboardCard[];
  readonly catalogCards: readonly PanelDashboardCatalogCard[];
  readonly catalogReadiness?: PanelDashboardCatalogReadiness;
  readonly actions: readonly PanelDashboardAction[];
}

export interface CatalogMetric {
  readonly key: "products" | "active-products" | "draft-products" | "out-of-stock" | "active-media";
  readonly label: string;
  readonly value: number;
  readonly detail: string;
}

export interface CatalogDashboardViewModel {
  readonly metrics: readonly CatalogMetric[];
  readonly chart: readonly Readonly<{ label: string; value: number }>[];
  readonly productsWithoutMedia: number;
  readonly productLimit: number;
}

export interface MerchantDashboardViewModel {
  readonly title: "Genel bakış";
  readonly description: string;
  readonly chromeCards: readonly PanelDashboardCard[];
  readonly catalog: AuthoritySlice<CatalogDashboardViewModel>;
  readonly orders: AuthoritySlice<OrderDashboardViewModel>;
  readonly analytics: AuthoritySlice<never>;
  readonly customers: AuthoritySlice<never>;
  readonly carts: AuthoritySlice<never>;
  readonly actions: readonly PanelDashboardAction[];
}

export interface OrderDashboardViewModel {
  readonly totalOrders: number;
  readonly pendingOrders: number;
  readonly fulfilledOrders: number;
  readonly revenueCents: number;
  readonly currency: string;
  readonly asOf: string;
}

export function createPanelDashboardModel(
  chrome: PanelChromeModel,
  summary?: CatalogDashboardSummary,
): PanelDashboardModel {
  const cards = Object.freeze([
    Object.freeze({ key: "store" as const, label: "Etkin mağaza", value: chrome.storeSlug, status: "Etkin" }),
    Object.freeze({ key: "membership" as const, label: "Üyelik", value: chrome.membershipLabel, status: "Etkin" }),
    Object.freeze({
      key: "plan" as const,
      label: "Plan",
      value: chrome.planCode + " · v" + String(chrome.planVersion),
      status: "Aktif",
    }),
    Object.freeze({
      key: "storefront" as const,
      label: "Mağaza adresi",
      value: chrome.storefrontHostname ?? "Henüz bağlı değil",
      status: chrome.storefrontHostname ? "Doğrulandı" : "Bekliyor",
    }),
  ]);
  const actions = Object.freeze([
    Object.freeze({ label: "Ürünleri yönet", href: "/products" as const }),
    Object.freeze({ label: "Yeni ürün ekle", href: "/products/new" as const }),
    Object.freeze({ label: "Kurulumu gözden geçir", href: "/setup" as const }),
  ]);
  const catalogCards = summary === undefined
    ? Object.freeze([])
    : Object.freeze([
      Object.freeze({
        key: "products" as const,
        label: "Toplam ürün",
        value: String(summary.totalProducts),
        detail: `${summary.productLimit} ürün limitinden`,
      }),
      Object.freeze({
        key: "active-products" as const,
        label: "Aktif ürün",
        value: String(summary.activeProducts),
        detail: "Storefront için etkin",
      }),
      Object.freeze({
        key: "draft-products" as const,
        label: "Taslak ürün",
        value: String(summary.draftProducts),
        detail: "Yayın öncesi çalışma",
      }),
      Object.freeze({
        key: "stock-alerts" as const,
        label: "Stok uyarısı",
        value: String(summary.outOfStockVariants),
        detail: `${summary.activeVariants} aktif varyant içinde`,
      }),
    ]);
  const catalogReadiness = summary === undefined
    ? undefined
    : Object.freeze({
      productsWithoutMedia: summary.productsWithoutMedia,
      activeMedia: summary.activeMedia,
      detail: `${summary.productsWithoutMedia} üründe medya eksik · ${summary.activeMedia} etkin medya`,
    });
  return Object.freeze({
    title: "Genel bakış" as const,
    description: "Mağazanızın doğrulanmış erişim, plan ve katalog başlangıç görünümü.",
    cards,
    catalogCards,
    ...(catalogReadiness === undefined ? {} : { catalogReadiness }),
    actions,
  });
}

function createCatalogDashboardViewModel(summary: CatalogDashboardSummary): CatalogDashboardViewModel {
  const metrics = Object.freeze([
    Object.freeze({
      key: "products" as const,
      label: "Toplam ürün",
      value: summary.totalProducts,
      detail: `${summary.productLimit} ürün limitinden`,
    }),
    Object.freeze({
      key: "active-products" as const,
      label: "Aktif ürün",
      value: summary.activeProducts,
      detail: "Storefront için etkin",
    }),
    Object.freeze({
      key: "draft-products" as const,
      label: "Taslak ürün",
      value: summary.draftProducts,
      detail: "Yayın öncesi çalışma",
    }),
    Object.freeze({
      key: "out-of-stock" as const,
      label: "Stokta olmayan",
      value: summary.outOfStockVariants,
      detail: `${summary.activeVariants} aktif varyant içinde`,
    }),
    Object.freeze({
      key: "active-media" as const,
      label: "Etkin medya",
      value: summary.activeMedia,
      detail: `${summary.productsWithoutMedia} üründe medya eksik`,
    }),
  ]);
  const chart = Object.freeze(metrics.map(({ label, value }) => Object.freeze({ label, value })));
  return Object.freeze({
    metrics,
    chart,
    productsWithoutMedia: summary.productsWithoutMedia,
    productLimit: summary.productLimit,
  });
}

export function createMerchantDashboardViewModel(
  chrome: PanelChromeModel,
  catalog: AuthoritySlice<CatalogDashboardSummary>,
  orders: AuthoritySlice<OrderDashboardSummary> = unsupportedAuthority("orders"),
): MerchantDashboardViewModel {
  const legacy = createPanelDashboardModel(chrome);
  const catalogView = catalog.state === "ready"
    ? readyAuthority(createCatalogDashboardViewModel(catalog.value), catalog.asOf)
    : catalog;
  const orderView = orders.state === "ready"
    ? readyAuthority(Object.freeze({
      totalOrders: orders.value.totalOrders,
      pendingOrders: orders.value.pendingOrders,
      fulfilledOrders: orders.value.fulfilledOrders,
      revenueCents: orders.value.revenueCents,
      currency: orders.value.currency,
      asOf: orders.value.asOf,
    }), orders.value.asOf)
    : orders;
  return Object.freeze({
    title: legacy.title,
    description: legacy.description,
    chromeCards: legacy.cards,
    catalog: catalogView,
    orders: orderView,
    analytics: unsupportedAuthority("analytics"),
    customers: unsupportedAuthority("customers"),
    carts: unsupportedAuthority("carts"),
    actions: legacy.actions,
  });
}
