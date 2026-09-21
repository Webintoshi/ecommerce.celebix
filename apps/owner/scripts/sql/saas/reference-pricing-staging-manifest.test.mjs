import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("./", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("phase-reference-pricing-v1-staging-manifest.json", root), "utf8"));

test("reference pricing staging migration order and checksums are pinned", () => {
  assert.equal(manifest.phase, "reference-pricing-v1-staging");
  assert.equal(manifest.postgresqlMajor, 16);
  assert.equal(manifest.deploymentTier, "staging");
  assert.equal(manifest.dynamicActivation, "off");
  assert.deepEqual(manifest.migrations.map(({ number }) => number),
    [130, 131, 132, 133, 134, 135, 136, 137, 138, 139, 140, 141]);
  for (const migration of manifest.migrations) {
    assert.match(migration.file, new RegExp(`^202609200${migration.number}_reference_pricing(?:_[a-z_]+)?\\.up\\.sql$`, "u"));
    assert.equal(createHash("sha256").update(readFileSync(new URL(migration.file, root))).digest("hex"), migration.sha256);
    if (migration.assertions) {
      assert.equal(createHash("sha256").update(readFileSync(new URL(migration.assertions, root))).digest("hex"),
        migration.assertionsSha256);
    }
  }
});
