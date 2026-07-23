import assert from "node:assert/strict";
import { access } from "node:fs/promises";
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
    evidenceTest: "apps/customer-panel/lib/panel-ui/parity-manifest.test.ts#every evidence reference and canonical target is executable",
    rejectionRationale: "typo spelling; accounting is the canonical safe target",
  });
  assert.equal(new Set(HEMENAKU_DONOR_PARITY.map(({ donorPath }) => donorPath)).size, 86);
});

test("every donor route has a final evidenced decision", () => {
  assert.equal(HEMENAKU_DONOR_PARITY.length, 86);
  assert.equal(HEMENAKU_DONOR_PARITY.some(({ status }) => status === "route_depth"), false);
  for (const entry of HEMENAKU_DONOR_PARITY) {
    assert.ok(entry.evidenceTest.length > 0);
    assert.ok(["complete", "provider_gated", "legacy_rejected"].includes(entry.status));
  }
});

test("provider-gated and legacy-rejected rows retain truthful canonical targets", () => {
  for (const entry of HEMENAKU_DONOR_PARITY) {
    if (entry.status === "provider_gated") {
      assert.match(entry.evidenceTest, /presentation[.]test/);
    }
    if (entry.status === "legacy_rejected") {
      assert.match(entry.rejectionRationale ?? "", /canonical safe target/);
      assert.notEqual(entry.donorPath, entry.targetPath);
    }
  }
});

const ROOT = new URL("../../../../", import.meta.url);
const targetPage = (targetPath: string) => new URL(
  targetPath === "/" ? "apps/customer-panel/app/(panel)/page.tsx" : `apps/customer-panel/app${targetPath}/page.tsx`,
  ROOT,
);

test("every evidence reference and canonical target is executable", async () => {
  for (const entry of HEMENAKU_DONOR_PARITY) {
    const [file] = entry.evidenceTest.split("#", 1);
    assert.ok(file && file.endsWith(".test.ts"), entry.donorPath);
    await access(new URL(`../../../../${file}`, import.meta.url));
    await access(targetPage(entry.targetPath));
  }
});

test("legacy rejections carry an explicit duplicate typo or unsafe rationale", () => {
  const rejected = HEMENAKU_DONOR_PARITY.filter(({ status }) => status === "legacy_rejected");
  assert.equal(rejected.length, 4);
  for (const entry of rejected) assert.match(entry.rejectionRationale ?? "", /duplicate|typo|unsafe/i);
});
