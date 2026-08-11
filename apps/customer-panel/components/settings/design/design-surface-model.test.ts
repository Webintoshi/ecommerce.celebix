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
    ["homepage", { area: "home", step: "homepage" }],
    ["product", { area: "site", step: "product" }],
    ["cart", { area: "site", step: "cart" }],
    ["footer", { area: "site", step: "footer" }],
  ]);
  assert.equal(new Set(DESIGN_CANVAS_SURFACES.map(({ key }) => key)).size, DESIGN_CANVAS_SURFACES.length);
});

test("surface lookup is immutable and location lookup chooses the first visual target", () => {
  assert.deepEqual(designCanvasSurface("homepage"), {
    key: "homepage",
    label: "Ana sayfayı düzenle",
    hint: "Bannerı ve sıralanabilir ana sayfa bölümlerini tek yerden yönetin.",
    location: { area: "home", step: "homepage" },
  });
  assert.equal(designCanvasSurfaceForLocation({ area: "site", step: "navigation" }).key, "announcement");
  assert.equal(designCanvasSurfaceForLocation({ area: "home", step: "homepage" }).key, "homepage");
  assert.equal(Object.isFrozen(DESIGN_CANVAS_SURFACES), true);
  assert.equal(Object.isFrozen(designCanvasSurface("brand")), true);
  assert.equal(Object.isFrozen(designCanvasSurface("brand").location), true);
});
