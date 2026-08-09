import assert from "node:assert/strict";
import test from "node:test";

test("theme panel model exposes only the controlled panel key contract", async () => {
  const module = await import("./starter-theme-subnavigation-model.ts").catch(() => null);
  assert.ok(module, "theme panel model must exist");
  assert.deepEqual(module.THEME_PANEL_KEYS, ["visual", "navigation", "home", "product", "cart", "footer"]);
  assert.equal("themeSubnavigationItems" in module, false);
  assert.equal("DEFAULT_THEME_PANEL" in module, false);
});
