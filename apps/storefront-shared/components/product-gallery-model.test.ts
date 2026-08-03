import assert from "node:assert/strict";
import test from "node:test";

import { galleryEscapeRequested, initialProductGalleryState, lockGalleryDocument, productGalleryReducer, scheduleGalleryFocus } from "./product-gallery-model.ts";

test("gallery select open close and Escape transitions are finite and immutable", () => {
  const selected = productGalleryReducer(initialProductGalleryState, { type: "select", index: 1, imageCount: 3 });
  assert.deepEqual(selected, { selected: 1, zoomed: false });
  const open = productGalleryReducer(selected, { type: "open", index: 2, imageCount: 3 });
  assert.deepEqual(open, { selected: 2, zoomed: true });
  assert.equal(galleryEscapeRequested("Tab"), false);
  assert.equal(galleryEscapeRequested("Escape"), true);
  assert.deepEqual(productGalleryReducer(open, { type: "close" }), { selected: 2, zoomed: false });
  assert.equal(productGalleryReducer(open, { type: "open", index: 4, imageCount: 3 }), open);
});

test("gallery body lock restores the exact prior overflow value", () => {
  const body = { style: { overflow: "clip" } };
  const restore = lockGalleryDocument(body);
  assert.equal(body.style.overflow, "hidden");
  restore();
  assert.equal(body.style.overflow, "clip");
});

test("gallery focus restoration uses the supplied animation boundary exactly once", () => {
  let focused = 0, scheduled = 0;
  scheduleGalleryFocus({ focus: () => { focused += 1; } }, (callback) => { scheduled += 1; callback(); });
  assert.equal(scheduled, 1);
  assert.equal(focused, 1);
});
