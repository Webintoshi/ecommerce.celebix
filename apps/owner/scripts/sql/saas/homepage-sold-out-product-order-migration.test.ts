import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("./", import.meta.url);
const files = {
  up: "202608220114_homepage_sold_out_product_order.up.sql",
  down: "202608220114_homepage_sold_out_product_order.down.sql",
  assertions: "202608220114_homepage_sold_out_product_order_assertions.sql",
  manifest: "phase5e-homepage-sold-out-product-order-manifest.json",
} as const;

function source(name: keyof typeof files): string {
  const url = new URL(files[name], root);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

test("114 keeps sold-out homepage products visible after available products", () => {
  const up = source("up");
  assert.match(up, /CREATE OR REPLACE FUNCTION saas[.]public_starter_retail_home/u);
  assert.match(up, /pg_catalog[.]jsonb_array_elements\(items\) WITH ORDINALITY AS ordered\(value,ordinality\)/u);
  assert.match(up, /pg_catalog[.]jsonb_agg\(ordered[.]value ORDER BY COALESCE\(\(ordered[.]value->>'available'\)::boolean,false\) DESC,ordered[.]ordinality\)/u);
  assert.doesNotMatch(up, /WHERE COALESCE\(\(ordered[.]value->>'available'\)::boolean,false\)/u);
  assert.doesNotMatch(up, /WHERE COALESCE\(\(filtered[.]value->>'available'\)::boolean,false\)/u);
  assert.doesNotMatch(up, /INSERT\s+INTO|UPDATE\s+saas[.](?:products|product_variants)|DELETE\s+FROM/u);
});

test("114 rollback restores the prior sold-out filter", () => {
  const down = source("down");
  assert.match(down, /CREATE OR REPLACE FUNCTION saas[.]public_starter_retail_home/u);
  assert.match(down, /pg_catalog[.]jsonb_array_elements\(items\) WITH ORDINALITY AS filtered\(value,ordinality\)/u);
  assert.match(down, /WHERE COALESCE\(\(filtered[.]value->>'available'\)::boolean,false\)/u);
  assert.match(down, /pg_catalog[.]jsonb_agg\(filtered[.]value ORDER BY filtered[.]ordinality\)/u);
});

test("114 keeps homepage resolver ACL restricted to host resolver", () => {
  const up = source("up");
  const assertions = source("assertions");
  assert.match(up, /REVOKE ALL ON FUNCTION saas[.]public_starter_retail_home\(uuid,text,timestamptz\) FROM PUBLIC/u);
  assert.match(up, /GRANT EXECUTE ON FUNCTION saas[.]public_starter_retail_home\(uuid,text,timestamptz\) TO celebix_saas_host_resolver/u);
  assert.match(assertions, /HOMEPAGE_SOLD_OUT_PRODUCT_ORDER_ACL_INVALID/u);
  assert.match(assertions, /HOMEPAGE_SOLD_OUT_PRODUCT_ORDER_UNEXPECTED_ACL/u);
});

test("114 artifacts are PostgreSQL 16 checksum pinned and production inert", () => {
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
    phase: "phase5e-homepage-sold-out-product-order",
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
