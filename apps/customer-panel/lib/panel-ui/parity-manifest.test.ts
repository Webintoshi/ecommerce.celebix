import assert from "node:assert/strict";
import test from "node:test";

import {
  HEMENAKU_DONOR_PARITY,
  getDonorParityEntry,
} from "./parity-manifest.ts";

test("maps every donor page to one canonical target decision", () => {
  assert.equal(HEMENAKU_DONOR_PARITY.length, 86);
  assert.deepEqual(getDonorParityEntry("/muhasabe"), {
    donorPath: "/muhasabe", targetPath: "/accounting",
    status: "legacy_rejected", authority: "merchant_admin",
  });
  assert.equal(new Set(HEMENAKU_DONOR_PARITY.map(({ donorPath }) => donorPath)).size, 86);
});
