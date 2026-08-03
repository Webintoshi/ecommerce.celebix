import assert from "node:assert/strict";
import test from "node:test";

test("theme submenu exposes six ordered destinations and one active panel", async () => {
  const module = await import("./starter-theme-subnavigation-model.ts").catch(() => null);
  assert.ok(module, "theme submenu model must exist");
  assert.deepEqual(module.themeSubnavigationItems("home"), [
    { key: "visual", label: "Genel görünüm", tabId: "starter-theme-tab-visual", panelId: "starter-theme-panel-visual", selected: false },
    { key: "navigation", label: "Menü ve duyuru", tabId: "starter-theme-tab-navigation", panelId: "starter-theme-panel-navigation", selected: false },
    { key: "home", label: "Ana sayfa", tabId: "starter-theme-tab-home", panelId: "starter-theme-panel-home", selected: true },
    { key: "product", label: "Ürün sayfası", tabId: "starter-theme-tab-product", panelId: "starter-theme-panel-product", selected: false },
    { key: "cart", label: "Sepet", tabId: "starter-theme-tab-cart", panelId: "starter-theme-panel-cart", selected: false },
    { key: "footer", label: "Footer", tabId: "starter-theme-tab-footer", panelId: "starter-theme-panel-footer", selected: false },
  ]);
});
