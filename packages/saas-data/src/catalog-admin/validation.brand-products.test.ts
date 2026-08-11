import assert from "node:assert/strict";
import test from "node:test";

import { uniqueCatalogIds } from "./validation.ts";

function productId(index: number) {
  return `72000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
}

test("catalog resources preserve up to ten thousand imported product relations", () => {
  assert.equal(uniqueCatalogIds(Array.from({ length: 101 }, (_, index) => productId(index))).length, 101);
  assert.throws(() => uniqueCatalogIds(Array.from({ length: 10_001 }, (_, index) => productId(index))));
});
