import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("./", import.meta.url);
const files = {
  up: "202608110100_modular_homepage_builder.up.sql",
  down: "202608110100_modular_homepage_builder.down.sql",
  assertions: "202608110100_modular_homepage_builder_assertions.sql",
  manifest: "phase4s-modular-homepage-builder-manifest.json",
} as const;

function source(name: keyof typeof files): string {
  const url = new URL(files[name], root);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

const up = source("up");
const down = source("down");
const assertions = source("assertions");

test("100 versions every homepage section with one durable canonical identity", () => {
  assert.match(up, /'schemaVersion',4/);
  assert.match(up, /ARRAY\['schemaVersion'\],'3'::jsonb/);
  assert.match(up, /'sectionId','home_'\|\|\(numbered[.]value->>'kind'\)\|\|'_'\|\|numbered[.]occurrence/);
  assert.match(up, /count\(DISTINCT section[.]value->>'sectionId'\)/);
  assert.match(up, /\^home_\[a-z0-9_\]\{3,75\}\$/);
  assert.match(up, /storefront_theme_composition_without_home_ids/);
  assert.match(up, /storefront_design_document_valid_without_home_ids/);
});

test("100 migrates documents atomically and projects section identity publicly", () => {
  assert.match(up, /LOCK TABLE saas[.]storefront_designs IN ACCESS EXCLUSIVE MODE/);
  assert.match(up, /UPDATE saas[.]storefront_designs/);
  assert.match(up, /schema_version=4/);
  assert.match(up, /MODULAR_HOMEPAGE_PUBLIC_PROJECTION_SOURCE_INVALID/);
  assert.match(up, /resolved:=resolved\|\|pg_catalog[.]jsonb_build_object\(''sectionId''/);
  assert.match(up, /storefront_design_publishable/);
  assert.doesNotMatch(up, /qualityScore|quality_score/);
});

test("100 keeps rollback guarded and assertions cover data and helper privilege", () => {
  assert.match(down, /MODULAR_HOMEPAGE_BUILDER_DOWN_BLOCKED/);
  assert.match(assertions, /MODULAR_HOMEPAGE_BUILDER_DATA_INVALID/);
  assert.match(assertions, /MODULAR_HOMEPAGE_BUILDER_ID_REJECTION_INVALID/);
  assert.match(assertions, /MODULAR_HOMEPAGE_BUILDER_HELPER_EXPOSED/);
  assert.match(assertions, /qualityScore/);
  for (const sql of [up, down, assertions]) {
    assert.match(sql, /^BEGIN;\nSET LOCAL ROLE celebix_saas_owner;/);
    assert.match(sql, /COMMIT;\s*$/);
    assert.doesNotMatch(sql, /postgres(?:ql)?:\/\//i);
  }
});

test("100 artifacts are checksum pinned", () => {
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
    phase: "phase4s-modular-homepage-builder",
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
});
