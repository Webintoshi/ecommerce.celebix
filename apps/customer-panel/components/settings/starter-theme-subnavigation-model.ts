export type ThemePanelKey = "visual" | "navigation" | "home" | "product" | "cart" | "footer";

export const DEFAULT_THEME_PANEL: ThemePanelKey = "visual";

const PANELS = Object.freeze([
  ["visual", "Genel görünüm"],
  ["navigation", "Menü ve duyuru"],
  ["home", "Ana sayfa"],
  ["product", "Ürün sayfası"],
  ["cart", "Sepet"],
  ["footer", "Footer"],
] as const);

export function themeSubnavigationItems(activePanel: ThemePanelKey) {
  return Object.freeze(PANELS.map(([key, label]) => Object.freeze({
    key,
    label,
    tabId: `starter-theme-tab-${key}`,
    panelId: `starter-theme-panel-${key}`,
    selected: activePanel === key,
  })));
}
