import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("./", import.meta.url);
const files = {
  up: "202608040083_storefront_unified_theme_authority.up.sql",
  down: "202608040083_storefront_unified_theme_authority.down.sql",
  assertions: "202608040083_storefront_unified_theme_authority_assertions.sql",
  manifest: "phase3-storefront-unified-theme-authority-manifest.json",
} as const;

function source(name: keyof typeof files): string {
  const url = new URL(files[name], root);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

const up = source("up");
const down = source("down");
const assertions = source("assertions");

test("083 makes storefront_designs the only writable and public starter theme authority", () => {
  assert.match(up, /storefront_design_upgrade_v3/);
  assert.match(up, /storefront_theme_composition_references_valid/);
  assert.match(up, /published_config->''composition''/);
  assert.match(up, /schema_version=3/);
  assert.match(up, /'schemaVersion',3/);
  assert.match(up, /campaign_starter_publications/);
  assert.match(up, /STOREFRONT_UNIFIED_THEME_PUBLIC_RESOLVER_SOURCE_INVALID/);
  const publicRewrite = up.match(/DO \$storefront_unified_theme_public_resolver\$[\s\S]+?\$storefront_unified_theme_public_resolver\$;/)?.[0] ?? "";
  assert.match(publicRewrite, /published_config->''composition''/);
  assert.doesNotMatch(publicRewrite, /INSERT|UPDATE|DELETE/);
});

test("083 validates exact tenant references and preserves atomic publication", () => {
  for (const table of ["catalog_categories", "storefront_assets", "products", "merchant_admin_records"]) {
    assert.match(up, new RegExp(`saas[.]${table}`));
  }
  assert.match(up, /asset_kind='hero'/);
  assert.match(up, /asset_kind='category'/);
  assert.match(up, /storefront_design_publishable/);
  assert.match(up, /starter_retail_publication_references_valid/);
  assert.doesNotMatch(up, /CREATE OR REPLACE FUNCTION saas[.]storefront_design_publish\(/);
  assert.doesNotMatch(up, /GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE).*storefront_designs.*celebix_saas_/is);
});

test("083 rollback is explicit and loss guarded", () => {
  const namedResolverSignature = /CREATE OR REPLACE FUNCTION saas[.]public_starter_retail_presentation\(p_store_id uuid,p_now timestamptz,p_allow_index boolean\)/;
  assert.match(up, namedResolverSignature);
  assert.match(down, namedResolverSignature);
  assert.match(down, /STOREFRONT_UNIFIED_THEME_DOWN_BLOCKED/);
  assert.match(down, /STOREFRONT_UNIFIED_THEME_DOWN_DATA_LOSS/);
  assert.match(down, /published_config-'composition'/);
  assert.match(assertions, /storefront_unified_theme_contract_invalid/);
  assert.match(assertions, /campaign_starter_publications/);
});

test("083 artifacts are checksum pinned and production inert", () => {
  for (const name of Object.values(files)) assert.equal(existsSync(new URL(name, root)), true, `${name} missing`);
  const manifest = JSON.parse(source("manifest")) as {
    phase: string;
    postgresqlMajor: number;
    externalConnections: number;
    productionMutations: number;
    artifacts: Array<{ file: string; direction: string; sha256: string }>;
  };
  assert.deepEqual({ phase: manifest.phase, postgresqlMajor: manifest.postgresqlMajor, externalConnections: manifest.externalConnections, productionMutations: manifest.productionMutations }, {
    phase: "phase3-storefront-unified-theme-authority", postgresqlMajor: 16, externalConnections: 0, productionMutations: 0,
  });
  assert.deepEqual(manifest.artifacts.map(({ file, direction }) => [file, direction]), [[files.up, "up"], [files.down, "down"], [files.assertions, "verify"]]);
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
