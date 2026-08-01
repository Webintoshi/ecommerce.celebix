import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("./", import.meta.url);
const up = readFileSync(new URL("202608010079_manual_order_uuid_contract.up.sql", root), "utf8");
const down = readFileSync(new URL("202608010079_manual_order_uuid_contract.down.sql", root), "utf8");
const assertions = readFileSync(new URL("202608010079_manual_order_uuid_contract_assertions.sql", root), "utf8");
const manifest = JSON.parse(readFileSync(new URL("phase3-manual-order-uuid-contract-manifest.json", root), "utf8")) as {
  phase: string;
  postgresqlMajor: number;
  externalConnections: number;
  productionMutations: number;
  artifacts: Array<{ file: string; direction: string; sha256: string }>;
};

test("manual order UUID correction is checksum pinned and production inert", () => {
  assert.deepEqual({
    phase: manifest.phase,
    postgresqlMajor: manifest.postgresqlMajor,
    externalConnections: manifest.externalConnections,
    productionMutations: manifest.productionMutations,
  }, {
    phase: "phase3-manual-order-uuid-contract",
    postgresqlMajor: 16,
    externalConnections: 0,
    productionMutations: 0,
  });
  assert.deepEqual(manifest.artifacts.map(({ file, direction }) => [file, direction]), [
    ["202608010079_manual_order_uuid_contract.up.sql", "up"],
    ["202608010079_manual_order_uuid_contract.down.sql", "down"],
    ["202608010079_manual_order_uuid_contract_assertions.sql", "verify"],
  ]);
  for (const artifact of manifest.artifacts) {
    assert.equal(createHash("sha256").update(readFileSync(new URL(artifact.file, root))).digest("hex"), artifact.sha256, artifact.file);
  }
});

test("manual order and event identifiers use the existing deterministic canonical UUID authority", () => {
  for (const namespace of ["saas.manual-order", "saas.manual-order-item", "saas.manual-order-event", "saas.order.event"]) {
    assert.match(up, new RegExp(`inventory_deterministic_uuid\\(''${namespace.replaceAll(".", "[.]")}''`));
  }
  assert.match(up, /pg_get_functiondef/);
  assert.match(up, /MANUAL_ORDER_UUID_CONTRACT_SOURCE_MISMATCH/);
  assert.match(down, /MANUAL_ORDER_UUID_CONTRACT_ROLLBACK_SOURCE_MISMATCH/);
  assert.match(assertions, /\[1-8\]\[0-9a-f\]\{3\}-\[89ab\]/);
  assert.match(assertions, /unsafe identifier source/);
});

test("correction preserves security-definer ownership, grants, and transactional rollback", () => {
  for (const source of [up, down]) {
    assert.match(source, /ALTER FUNCTION saas[.]order_drafts_convert[^;]+OWNER TO celebix_saas_owner/);
    assert.match(source, /REVOKE ALL ON FUNCTION saas[.]order_drafts_convert[^;]+FROM PUBLIC/);
    assert.match(source, /GRANT EXECUTE ON FUNCTION saas[.]order_drafts_convert[^;]+TO celebix_saas_app/);
  }
  for (const source of [up, down, assertions]) {
    assert.match(source, /^BEGIN;\nSET LOCAL ROLE celebix_saas_owner;/m);
    assert.match(source, /COMMIT;\s*$/);
    assert.doesNotMatch(source, /postgres(?:ql)?:\/\//i);
  }
});
