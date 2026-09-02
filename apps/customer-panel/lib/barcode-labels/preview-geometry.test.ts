import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizePaperTypeChange,
  previewPaddingPercentages,
} from "./preview-geometry.ts";
import { getSystemBarcodeLabelTemplate } from "./system-templates.ts";

test("live preview geometry changes with asymmetric template margins", () => {
  const initial = previewPaddingPercentages({
    widthMm: 50,
    heightMm: 30,
    marginsMm: { top: 1, right: 2, bottom: 3, left: 4 },
  });
  const edited = previewPaddingPercentages({
    widthMm: 50,
    heightMm: 30,
    marginsMm: { top: 2, right: 4, bottom: 6, left: 8 },
  });
  assert.deepEqual(initial, {
    paddingTop: "3.3333333333333335%",
    paddingRight: "4%",
    paddingBottom: "10%",
    paddingLeft: "8%",
  });
  assert.notDeepEqual(edited, initial);
  assert.equal(edited.paddingLeft, "16%");
});

test("leaving A4 normalizes disabled non-sheet geometry atomically", () => {
  const a4 = getSystemBarcodeLabelTemplate("a4-3x8")!;
  const landscape = { ...a4.config, orientation: "landscape" as const };
  const thermal = normalizePaperTypeChange(landscape, "thermal-roll");
  assert.equal(thermal.orientation, "portrait");
  assert.equal(thermal.rows, 1);
  assert.equal(thermal.columns, 1);
});
