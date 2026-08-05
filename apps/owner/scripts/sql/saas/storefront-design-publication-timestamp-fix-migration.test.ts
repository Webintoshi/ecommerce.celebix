import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("./", import.meta.url);
const files = {
  up: "202608050087_storefront_design_publication_timestamp_fix.up.sql",
  down: "202608050087_storefront_design_publication_timestamp_fix.down.sql",
  assertions: "202608050087_storefront_design_publication_timestamp_fix_assertions.sql",
  manifest: "phase3-storefront-design-publication-timestamp-fix-manifest.json",
} as const;

function source(name: keyof typeof files): string {
  const url = new URL(files[name], root);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

const up = source("up");
const down = source("down");
const assertions = source("assertions");

test("087 removes the impossible storefront design publication timestamp constraint", () => {
  assert.match(up, /ALTER TABLE saas[.]storefront_designs DROP CONSTRAINT storefront_designs_check2/);
  assert.doesNotMatch(up, /CREATE OR REPLACE FUNCTION saas[.]storefront_design_publish/);
  assert.doesNotMatch(up, /GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE).*storefront_designs.*celebix_saas_/is);
  assert.match(assertions, /storefront_design_publication_timestamp_fix_invalid/);
  assert.match(assertions, /pg_catalog[.]pg_constraint/);
});

test("087 rollback refuses to restore the constraint after a later publication", () => {
  assert.match(down, /STOREFRONT_DESIGN_PUBLICATION_TIMESTAMP_FIX_DOWN_BLOCKED/);
  assert.match(down, /draft_updated_at\s*<\s*design[.]published_at/);
  assert.match(down, /ADD CONSTRAINT storefront_designs_check2/);
  assert.match(down, /draft_updated_at>=published_at OR draft_version=1/);
});

test("087 artifacts are checksum pinned and production inert", () => {
  for (const name of Object.values(files)) assert.equal(existsSync(new URL(name, root)), true, `${name} missing`);
  const manifest = JSON.parse(source("manifest")) as {
    phase: string;
    postgresqlMajor: number;
    externalConnections: number;
    productionMutations: number;
    artifacts: Array<{ file: string; direction: string; sha256: string }>;
  };
  assert.deepEqual({
    phase: manifest.phase,
    postgresqlMajor: manifest.postgresqlMajor,
    externalConnections: manifest.externalConnections,
    productionMutations: manifest.productionMutations,
  }, {
    phase: "phase3-storefront-design-publication-timestamp-fix",
    postgresqlMajor: 16,
    externalConnections: 0,
    productionMutations: 0,
  });
  assert.deepEqual(manifest.artifacts.map(({ file, direction }) => [file, direction]), [
    [files.up, "up"],
    [files.down, "down"],
    [files.assertions, "verify"],
  ]);
  for (const artifact of manifest.artifacts) {
    const bytes = readFileSync(new URL(artifact.file, root));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), artifact.sha256, artifact.file);
  }
  for (const sql of [up, down, assertions]) {
    assert.match(sql, /^BEGIN;\nSET LOCAL ROLE celebix_saas_owner;/);
    assert.match(sql, /COMMIT;\s*$/);
    assert.doesNotMatch(sql, /postgres(?:ql)?:\/\//i);
  }
});
