import type { PanelChromeModel } from "./chrome-model.ts";
import type { CatalogDashboardSummary } from "../catalog-ui/client.ts";
import type {
  AbandonedCartSummary,
  AnalyticsDashboard,
  CustomerSummary,
  OrderDashboardSummary,
} from "@celebix/saas-contracts";
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
  readonly href:
    | "/analytics"
    | "/orders"
    | "/orders/quick-links"
    | "/orders/abandoned-carts"
    | "/customers"
    | "/products"
    | "/products/new"
    | "/discounts"
    | "/marketing"
    | "/content/blog"
    | "/marketplaces"
    | "/settings/general"
    | "/accounting"
    | "/seo"
    | "/setup";
}

export interface PanelDashboardCatalogCard {
  readonly key:
    | "products"
    | "active-products"
    | "draft-products"
    | "stock-alerts";
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
  readonly title: "Özet";
  readonly description: string;
  readonly cards: readonly PanelDashboardCard[];
  readonly catalogCards: readonly PanelDashboardCatalogCard[];
  readonly catalogReadiness?: PanelDashboardCatalogReadiness;
  readonly actions: readonly PanelDashboardAction[];
}

export interface CatalogMetric {
  readonly key:
    | "products"
    | "active-products"
    | "draft-products"
    | "out-of-stock"
    | "active-media";
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
  readonly title: "Özet";
  readonly description: string;
  readonly chromeCards: readonly PanelDashboardCard[];
  readonly catalog: AuthoritySlice<CatalogDashboardViewModel>;
  readonly orders: AuthoritySlice<OrderDashboardViewModel>;
  readonly analytics: AuthoritySlice<AnalyticsDashboardViewModel>;
  readonly customers: AuthoritySlice<CustomerSummary>;
  readonly carts: AuthoritySlice<AbandonedCartSummary>;
  readonly actions: readonly PanelDashboardAction[];
}

export interface AnalyticsDashboardViewModel {
  readonly period: AnalyticsDashboard["period"];
  readonly currency: string;
  readonly revenueCents: number;
  readonly orders: Readonly<{
    total: number;
    paid: number;
    cancelled: number;
    refunded: number;
  }>;
  readonly customers: Readonly<{ total: number; newInPeriod: number }>;
  readonly catalog: Readonly<{
    activeProducts: number;
    lowStockVariants: number;
  }>;
  readonly series: readonly Readonly<{
    startsAt: string;
    orders: number;
    revenueCents: number;
  }>[];
}

export interface OrderDashboardViewModel {
  readonly totalOrders: number;
  readonly pendingOrders: number;
  readonly fulfilledOrders: number;
  readonly revenueCents: number;
  readonly currency: string;
  readonly asOf: string;
}

export type MerchantDashboardSlice = "catalog" | "orders" | "carts" | "customers" | "analytics";

export interface MerchantDashboardSliceLoaders {
  readonly catalog: () => Promise<CatalogDashboardSummary>;
  readonly orders: () => Promise<OrderDashboardSummary>;
  readonly carts: () => Promise<AbandonedCartSummary>;
  readonly customers: () => Promise<CustomerSummary>;
  readonly analytics: () => Promise<AnalyticsDashboard>;
}

export interface MerchantDashboardSlicePublisher {
  loading(slice: MerchantDashboardSlice): void;
  ready(slice: MerchantDashboardSlice, value: CatalogDashboardSummary | OrderDashboardSummary | AbandonedCartSummary | CustomerSummary | AnalyticsDashboard): void;
  unavailable(slice: MerchantDashboardSlice): void;
}

export function createMerchantDashboardSliceLoader(
  loaders: MerchantDashboardSliceLoaders,
  publisher: MerchantDashboardSlicePublisher,
) {
  let disposed = false;
  const generation: Record<MerchantDashboardSlice, number> = {
    catalog: 0, orders: 0, carts: 0, customers: 0, analytics: 0,
  };
  const reload = (slice: MerchantDashboardSlice) => {
    const current = ++generation[slice];
    publisher.loading(slice);
    void Promise.resolve()
      .then<unknown>(() => loaders[slice]())
      .then(
        (value) => {
          if (!disposed && generation[slice] === current) publisher.ready(slice, value as CatalogDashboardSummary | OrderDashboardSummary | AbandonedCartSummary | CustomerSummary | AnalyticsDashboard);
        },
        () => {
          if (!disposed && generation[slice] === current) publisher.unavailable(slice);
        },
      );
  };
  return Object.freeze({
    reload,
    reloadAll() {
      (Object.keys(generation) as MerchantDashboardSlice[]).forEach(reload);
    },
    dispose() {
      disposed = true;
      (Object.keys(generation) as MerchantDashboardSlice[]).forEach((slice) => {
        generation[slice] += 1;
      });
    },
  });
}

export async function loadMerchantDashboardSummaries(
  catalog: Readonly<{
    getDashboardSummary(): Promise<CatalogDashboardSummary>;
  }>,
  orders: Readonly<{ getDashboardSummary(): Promise<OrderDashboardSummary> }>,
): Promise<
  readonly [
    PromiseSettledResult<CatalogDashboardSummary>,
    PromiseSettledResult<OrderDashboardSummary>,
  ]
> {
  const [catalogResult, orderResult] = await Promise.allSettled([
    catalog.getDashboardSummary(),
    orders.getDashboardSummary(),
  ]);
  return Object.freeze([
    Object.freeze(catalogResult),
    Object.freeze(orderResult),
  ]);
}

export function createPanelDashboardModel(
  chrome: PanelChromeModel,
  summary?: CatalogDashboardSummary,
): PanelDashboardModel {
  const cards = Object.freeze([
    Object.freeze({
      key: "store" as const,
      label: "Etkin mağaza",
      value: chrome.storeSlug,
      status: "Etkin",
    }),
    Object.freeze({
      key: "membership" as const,
      label: "Üyelik",
      value: chrome.membershipLabel,
      status: "Etkin",
    }),
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
    Object.freeze({ label: "Ticari analitiği görüntüle", href: "/analytics" as const }),
    Object.freeze({ label: "Siparişleri yönet", href: "/orders" as const }),
    Object.freeze({
      label: "Hızlı sipariş oluştur",
      href: "/orders/quick-links" as const,
    }),
    Object.freeze({
      label: "Terk edilen sepetleri yönet",
      href: "/orders/abandoned-carts" as const,
    }),
    Object.freeze({ label: "Müşterileri yönet", href: "/customers" as const }),
    Object.freeze({ label: "Ürünleri yönet", href: "/products" as const }),
    Object.freeze({ label: "Yeni ürün ekle", href: "/products/new" as const }),
    Object.freeze({ label: "İndirimleri yönet", href: "/discounts" as const }),
    Object.freeze({ label: "Pazarlamayı yönet", href: "/marketing" as const }),
    Object.freeze({ label: "İçerikleri yönet", href: "/content/blog" as const }),
    Object.freeze({ label: "Pazar yerlerini yönet", href: "/marketplaces" as const }),
    Object.freeze({ label: "Mağaza ayarları", href: "/settings/general" as const }),
    Object.freeze({ label: "Muhasebeyi yönet", href: "/accounting" as const }),
    Object.freeze({ label: "SEO'yu yönet", href: "/seo" as const }),
    Object.freeze({ label: "Kurulumu gözden geçir", href: "/setup" as const }),
  ]);
  const catalogCards =
    summary === undefined
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
  const catalogReadiness =
    summary === undefined
      ? undefined
      : Object.freeze({
          productsWithoutMedia: summary.productsWithoutMedia,
          activeMedia: summary.activeMedia,
          detail: `${summary.productsWithoutMedia} üründe medya eksik · ${summary.activeMedia} etkin medya`,
        });
  return Object.freeze({
    title: "Özet" as const,
    description: "Mağazanızın doğrulanmış erişim, sipariş ve katalog özeti.",
    cards,
    catalogCards,
    ...(catalogReadiness === undefined ? {} : { catalogReadiness }),
    actions,
  });
}

function createCatalogDashboardViewModel(
  summary: CatalogDashboardSummary,
): CatalogDashboardViewModel {
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
  const chart = Object.freeze(
    metrics.map(({ label, value }) => Object.freeze({ label, value })),
  );
  return Object.freeze({
    metrics,
    chart,
    productsWithoutMedia: summary.productsWithoutMedia,
    productLimit: summary.productLimit,
  });
}

function createAnalyticsDashboardViewModel(
  dashboard: AnalyticsDashboard,
): AnalyticsDashboardViewModel {
  return Object.freeze({
    period: dashboard.period,
    currency: dashboard.currency,
    revenueCents: dashboard.revenueCents,
    orders: Object.freeze({ ...dashboard.orders }),
    customers: Object.freeze({ ...dashboard.customers }),
    catalog: Object.freeze({ ...dashboard.catalog }),
    series: Object.freeze(
      dashboard.series.map((point) => Object.freeze({ ...point })),
    ),
  });
}

export function createMerchantDashboardViewModel(
  chrome: PanelChromeModel,
  catalog: AuthoritySlice<CatalogDashboardSummary>,
  orders: AuthoritySlice<OrderDashboardSummary> = unsupportedAuthority(
    "orders",
  ),
  carts: AuthoritySlice<AbandonedCartSummary> = unsupportedAuthority("carts"),
  customers: AuthoritySlice<CustomerSummary> = unsupportedAuthority(
    "customers",
  ),
  analytics: AuthoritySlice<AnalyticsDashboard> = unsupportedAuthority(
    "analytics",
  ),
): MerchantDashboardViewModel {
  const legacy = createPanelDashboardModel(chrome);
  const catalogView =
    catalog.state === "ready"
      ? readyAuthority(
          createCatalogDashboardViewModel(catalog.value),
          catalog.asOf,
        )
      : catalog;
  const orderView =
    orders.state === "ready"
      ? readyAuthority(
          Object.freeze({
            totalOrders: orders.value.totalOrders,
            pendingOrders: orders.value.pendingOrders,
            fulfilledOrders: orders.value.fulfilledOrders,
            revenueCents: orders.value.revenueCents,
            currency: orders.value.currency,
            asOf: orders.value.asOf,
          }),
          orders.value.asOf,
        )
      : orders;
  return Object.freeze({
    title: legacy.title,
    description: legacy.description,
    chromeCards: legacy.cards,
    catalog: catalogView,
    orders: orderView,
    analytics:
      analytics.state === "ready"
        ? readyAuthority(
            createAnalyticsDashboardViewModel(analytics.value),
            analytics.asOf,
          )
        : analytics,
    customers:
      customers.state === "ready"
        ? readyAuthority(customers.value, customers.value.asOf)
        : customers,
    carts:
      carts.state === "ready"
        ? readyAuthority(carts.value, carts.value.asOf)
        : carts,
    actions: legacy.actions,
  });
}
