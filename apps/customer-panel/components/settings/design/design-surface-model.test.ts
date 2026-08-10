import assert from "node:assert/strict";
import test from "node:test";

import {
  DESIGN_CANVAS_SURFACES,
  designCanvasSurface,
  designCanvasSurfaceForLocation,
} from "./design-surface-model.ts";

test("every visual surface resolves to one existing workspace location", () => {
  assert.deepEqual(DESIGN_CANVAS_SURFACES.map(({ key, location }) => [key, location]), [
    ["brand", { area: "site", step: "brand" }],
    ["announcement", { area: "site", step: "navigation" }],
    ["navigation", { area: "site", step: "navigation" }],
    ["style", { area: "site", step: "style" }],
    ["hero", { area: "home", step: "hero" }],
    ["categories", { area: "home", step: "sections" }],
    ["products", { area: "home", step: "sections" }],
    ["promotion", { area: "home", step: "promotion" }],
    ["product", { area: "site", step: "product" }],
    ["cart", { area: "site", step: "cart" }],
    ["footer", { area: "site", step: "footer" }],
    ["assets", { area: "home", step: "assets" }],
  ]);
  assert.equal(new Set(DESIGN_CANVAS_SURFACES.map(({ key }) => key)).size, DESIGN_CANVAS_SURFACES.length);
});

test("surface lookup is immutable and location lookup chooses the first visual target", () => {
  assert.deepEqual(designCanvasSurface("hero"), {
    key: "hero",
    label: "Ana banner",
    hint: "Banner görsellerini ve bağlantılarını düzenleyin.",
    location: { area: "home", step: "hero" },
  });
  assert.equal(designCanvasSurfaceForLocation({ area: "site", step: "navigation" }).key, "announcement");
  assert.equal(designCanvasSurfaceForLocation({ area: "home", step: "sections" }).key, "categories");
  assert.equal(Object.isFrozen(DESIGN_CANVAS_SURFACES), true);
  assert.equal(Object.isFrozen(designCanvasSurface("brand")), true);
  assert.equal(Object.isFrozen(designCanvasSurface("brand").location), true);
});
