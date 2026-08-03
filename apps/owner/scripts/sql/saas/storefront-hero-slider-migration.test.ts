import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("./", import.meta.url);
const files = {
  up: "202608030082_storefront_hero_slider.up.sql",
  down: "202608030082_storefront_hero_slider.down.sql",
  assertions: "202608030082_storefront_hero_slider_assertions.sql",
  manifest: "phase3-storefront-hero-slider-manifest.json",
} as const;

function source(name: keyof typeof files): string {
  const url = new URL(files[name], root);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

const up = source("up");
const down = source("down");
const assertions = source("assertions");

test("082 migrates only the storefront hero contract to bounded version two slides", () => {
  assert.match(up, /storefront_design_upgrade_v2/);
  assert.match(up, /storefront_design_publishable/);
  assert.match(up, /jsonb_array_length\(p_config->'hero'->'slides'\) NOT BETWEEN 1 AND 3/);
  assert.match(up, /'schemaVersion',2/);
  assert.match(up, /published_config=draft_config/);
  assert.match(up, /WITH ORDINALITY/);
  const conversion = up.match(/UPDATE saas[.]storefront_designs\s+SET schema_version=2,[\s\S]+?published_config=saas[.]storefront_design_upgrade_v2\(published_config,false\);/)?.[0] ?? "";
  assert.ok(conversion);
  assert.doesNotMatch(conversion, /(?:draft_version|published_version|draft_updated_at|published_at)\s*=/);
});

test("082 keeps runtime privileges narrow and rollback data-loss guarded", () => {
  assert.match(up, /REVOKE ALL ON FUNCTION[\s\S]+storefront_design_publishable/);
  assert.match(up, /GRANT EXECUTE ON FUNCTION saas[.]storefront_design_publish/);
  assert.doesNotMatch(up, /GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE).*storefront_designs.*celebix_saas_/is);
  assert.match(down, /STOREFRONT_HERO_SLIDER_DOWN_BLOCKED/);
  assert.match(down, /STOREFRONT_HERO_SLIDER_DOWN_DATA_LOSS/);
  assert.match(assertions, /storefront_hero_slider_contract_invalid/);
});

test("082 artifacts are checksum pinned and production inert", () => {
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
    phase: "phase3-storefront-hero-slider",
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
