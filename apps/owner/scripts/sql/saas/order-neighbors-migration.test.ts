import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("./", import.meta.url);
const up = readFileSync(new URL("202607310075_order_neighbors.up.sql", root), "utf8");
const down = readFileSync(new URL("202607310075_order_neighbors.down.sql", root), "utf8");
const assertions = readFileSync(new URL("202607310075_order_neighbors_assertions.sql", root), "utf8");
const manifest = JSON.parse(readFileSync(new URL("phase3-order-neighbors-manifest.json", root), "utf8")) as {
  phase: string;
  postgresqlMajor: number;
  externalConnections: number;
  productionMutations: number;
  artifacts: Array<{ file: string; direction: string; sha256: string }>;
};

const signature = "saas.orders_get_neighbors(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid)";

test("order neighbor migration artifacts are checksum pinned and production inert", () => {
  assert.deepEqual({
    phase: manifest.phase,
    postgresqlMajor: manifest.postgresqlMajor,
    externalConnections: manifest.externalConnections,
    productionMutations: manifest.productionMutations,
  }, {
    phase: "phase3-order-neighbors",
    postgresqlMajor: 16,
    externalConnections: 0,
    productionMutations: 0,
  });
  assert.deepEqual(manifest.artifacts.map(({ file, direction }) => [file, direction]), [
    ["202607310075_order_neighbors.up.sql", "up"],
    ["202607310075_order_neighbors.down.sql", "down"],
    ["202607310075_order_neighbors_assertions.sql", "verify"],
  ]);
  for (const artifact of manifest.artifacts) {
    const source = readFileSync(new URL(artifact.file, root));
    assert.equal(createHash("sha256").update(source).digest("hex"), artifact.sha256, artifact.file);
  }
});

test("order neighbors are store scoped, authority checked, and deterministically ordered", () => {
  assert.match(up, /CREATE FUNCTION saas[.]orders_get_neighbors/);
  assert.match(up, /merchant_action_authority_error\([^;]+?'orders','orders[.]read'/s);
  assert.match(up, /selected[.]store_id = p_store_id/);
  assert.match(up, /candidate[.]store_id = p_store_id/g);
  assert.match(up, /\(candidate[.]created_at,candidate[.]id\) > \(current_order[.]created_at,current_order[.]id\)/);
  assert.match(up, /\(candidate[.]created_at,candidate[.]id\) < \(current_order[.]created_at,current_order[.]id\)/);
  assert.match(up, /ORDER BY candidate[.]created_at ASC,candidate[.]id ASC/);
  assert.match(up, /ORDER BY candidate[.]created_at DESC,candidate[.]id DESC/);
  assert.match(up, /'previous'/);
  assert.match(up, /'next'/);
});

test("order neighbor function has a narrow role boundary and bounded rollback", () => {
  assert.match(up, /^BEGIN;\nSET LOCAL ROLE celebix_saas_owner;/);
  assert.match(up, new RegExp(`ALTER FUNCTION ${signature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} OWNER TO celebix_saas_owner`));
  assert.match(up, new RegExp(`REVOKE ALL ON FUNCTION ${signature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} FROM PUBLIC`));
  assert.match(up, new RegExp(`GRANT EXECUTE ON FUNCTION ${signature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} TO celebix_saas_app`));
  assert.match(down, /DROP FUNCTION saas[.]orders_get_neighbors\(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid\)/);
  assert.match(assertions, /order_neighbors_contract_invalid/);
  for (const source of [up, down, assertions]) {
    assert.match(source, /COMMIT;\s*$/);
    assert.doesNotMatch(source, /postgres(?:ql)?:\/\//i);
  }
});
