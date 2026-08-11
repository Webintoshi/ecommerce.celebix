import assert from "node:assert/strict";
import test from "node:test";

import {
  designWorkspaceAreas,
  designWorkspaceSteps,
  resolveDesignWorkspaceLocation,
} from "./workspace-navigation-model.ts";

test("design workspace exposes exactly two child-friendly areas", () => {
  assert.deepEqual(designWorkspaceAreas("site"), [
    { key: "site", label: "Tüm site", hint: "Her sayfada görünen alanlar", selected: true },
    { key: "home", label: "Ana sayfa", hint: "Vitrin ve ana sayfa bölümleri", selected: false },
  ]);
});

test("each design area exposes one ordered set of steps", () => {
  assert.deepEqual(designWorkspaceSteps("site", "navigation").map(({ key, label, selected }) => ({ key, label, selected })), [
    { key: "brand", label: "Marka", selected: false },
    { key: "style", label: "Renk ve yazı", selected: false },
    { key: "navigation", label: "Menü ve duyuru", selected: true },
    { key: "product", label: "Ürün sayfası", selected: false },
    { key: "cart", label: "Sepet", selected: false },
    { key: "footer", label: "Footer", selected: false },
  ]);
  assert.deepEqual(designWorkspaceSteps("home", "homepage").map(({ key, label }) => ({ key, label })), [
    { key: "homepage", label: "Ana sayfayı düzenle" },
  ]);
});

test("legacy section links resolve without creating a third workspace", () => {
  const cases = {
    theme: { area: "site", step: "style" },
    brand: { area: "site", step: "brand" },
    colors: { area: "site", step: "style" },
    typography: { area: "site", step: "style" },
    announcement: { area: "site", step: "navigation" },
    product: { area: "site", step: "product" },
    cart: { area: "site", step: "cart" },
    footer: { area: "site", step: "footer" },
    hero: { area: "home", step: "homepage" },
    assets: { area: "home", step: "homepage" },
    home: { area: "home", step: "homepage" },
    sections: { area: "home", step: "homepage" },
    promotion: { area: "home", step: "homepage" },
  } as const;
  for (const [section, expected] of Object.entries(cases)) assert.deepEqual(resolveDesignWorkspaceLocation(section), expected);
  assert.deepEqual(resolveDesignWorkspaceLocation(), { area: "site", step: "brand" });
  assert.deepEqual(resolveDesignWorkspaceLocation("unknown"), { area: "site", step: "brand" });
});
