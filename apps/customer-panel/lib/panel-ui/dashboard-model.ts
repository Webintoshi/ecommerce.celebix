import type { PanelChromeModel } from "./chrome-model.ts";

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

export interface PanelDashboardModel {
  readonly title: "Genel bakış";
  readonly description: string;
  readonly cards: readonly PanelDashboardCard[];
  readonly actions: readonly PanelDashboardAction[];
}

export function createPanelDashboardModel(chrome: PanelChromeModel): PanelDashboardModel {
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
  return Object.freeze({
    title: "Genel bakış" as const,
    description: "Mağazanızın doğrulanmış erişim, plan ve katalog başlangıç görünümü.",
    cards,
    actions,
  });
}
