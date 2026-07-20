import type { PanelChromeModel } from "./chrome-model.ts";
import type { CatalogDashboardSummary } from "../catalog-ui/client.ts";

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
