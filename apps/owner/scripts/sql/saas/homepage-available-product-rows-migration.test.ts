import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("./", import.meta.url);
const files = {
  up: "202608210113_homepage_available_product_rows.up.sql",
  down: "202608210113_homepage_available_product_rows.down.sql",
  assertions: "202608210113_homepage_available_product_rows_assertions.sql",
  manifest: "phase5d-homepage-available-product-rows-manifest.json",
} as const;

function source(name: keyof typeof files): string {
  const url = new URL(files[name], root);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

test("113 filters sold-out products from public homepage product rows without static replacements", () => {
  const up = source("up");
  assert.match(up, /CREATE OR REPLACE FUNCTION saas[.]public_starter_retail_home/u);
  assert.match(up, /pg_catalog[.]jsonb_array_elements\(items\) WITH ORDINALITY AS filtered\(value,ordinality\)/u);
  assert.match(up, /WHERE COALESCE\(\(filtered[.]value->>'available'\)::boolean,false\)/u);
  assert.match(up, /pg_catalog[.]jsonb_agg\(filtered[.]value ORDER BY filtered[.]ordinality\)/u);
  assert.doesNotMatch(up, /INSERT\s+INTO|UPDATE\s+saas[.](?:products|product_variants)|DELETE\s+FROM/u);
});

test("113 keeps homepage resolver ACL restricted to host resolver", () => {
  const up = source("up");
  const assertions = source("assertions");
  assert.match(up, /REVOKE ALL ON FUNCTION saas[.]public_starter_retail_home\(uuid,text,timestamptz\) FROM PUBLIC/u);
  assert.match(up, /GRANT EXECUTE ON FUNCTION saas[.]public_starter_retail_home\(uuid,text,timestamptz\) TO celebix_saas_host_resolver/u);
  assert.match(assertions, /HOMEPAGE_AVAILABLE_PRODUCT_ROWS_ACL_INVALID/u);
  assert.match(assertions, /HOMEPAGE_AVAILABLE_PRODUCT_ROWS_UNEXPECTED_ACL/u);
});

test("113 rollback restores the previous projection shape", () => {
  const down = source("down");
  assert.match(down, /CREATE OR REPLACE FUNCTION saas[.]public_starter_retail_home/u);
  assert.doesNotMatch(down, /WITH ORDINALITY AS filtered\(value,ordinality\)/u);
  assert.match(down, /rows:=rows\|\|pg_catalog[.]jsonb_build_array/u);
});

test("113 artifacts are PostgreSQL 16 checksum pinned and production inert", () => {
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
    phase: "phase5d-homepage-available-product-rows",
    postgresqlMajor: 16,
    externalConnections: 0,
    productionMutations: 0,
  });
  assert.deepEqual(manifest.artifacts.map(({ file, direction }) => [file, direction]), [
    [files.up, "up"], [files.down, "down"], [files.assertions, "verify"],
  ]);
  for (const artifact of manifest.artifacts) {
    const bytes = readFileSync(new URL(artifact.file, root));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), artifact.sha256, artifact.file);
  }
  for (const sql of [source("up"), source("down"), source("assertions")]) {
    assert.match(sql, /^BEGIN;\nSET LOCAL ROLE celebix_saas_owner;/);
    assert.match(sql, /COMMIT;\s*$/);
    assert.doesNotMatch(sql, /postgres(?:ql)?:\/\//i);
  }
});
