import assert from "node:assert/strict";
import test from "node:test";
import { categoryImageFileError, categoryImageFrame } from "./category-image.ts";

test("category framing centers landscape images without exceeding the source", () => {
  const frame = categoryImageFrame(2400, 1600);
  assert.equal(frame.sourceX, 600);assert.equal(frame.sourceY, 0);
  assert.equal(frame.sourceWidth, 1200);assert.equal(frame.sourceHeight, 1600);
  assert.equal(frame.width / frame.height, 3 / 4);
});
test("portrait framing preserves full width and limits encoded resolution", () => {
  const frame = categoryImageFrame(4000, 8000);
  assert.equal(frame.sourceX, 0);assert.ok(frame.sourceY > 0);
  assert.equal(frame.width, 1536);assert.equal(frame.height, 2048);
  assert.ok(frame.sourceY + frame.sourceHeight <= 8000);
  assert.throws(() => categoryImageFrame(8193, 100), /dimensions_invalid/);
  assert.throws(() => categoryImageFrame(0, 100), /dimensions_invalid/);
});
test("category upload rejects unsupported and oversized files before decoding", () => {
  assert.ok(categoryImageFileError({ type: "image/svg+xml", size: 100 }));
  assert.ok(categoryImageFileError({ type: "image/jpeg", size: 5_242_881 }));
  assert.ok(categoryImageFileError({ type: "image/png", size: 0 }));
  assert.equal(categoryImageFileError({ type: "image/webp", size: 5_242_880 }), undefined);
});
