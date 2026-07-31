import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("./", import.meta.url);
const up = readFileSync(new URL("202607310076_customer_workspace.up.sql", root), "utf8");
const down = readFileSync(new URL("202607310076_customer_workspace.down.sql", root), "utf8");
const assertions = readFileSync(new URL("202607310076_customer_workspace_assertions.sql", root), "utf8");
const manifest = JSON.parse(readFileSync(new URL("phase3-customer-workspace-manifest.json", root), "utf8")) as {
  phase: string;
  postgresqlMajor: number;
  externalConnections: number;
  productionMutations: number;
  artifacts: Array<{ file: string; direction: string; sha256: string }>;
};

const signature = "saas.customers_get_workspace(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid)";

test("customer workspace migration artifacts are checksum pinned and production inert", () => {
  assert.deepEqual({
    phase: manifest.phase,
    postgresqlMajor: manifest.postgresqlMajor,
    externalConnections: manifest.externalConnections,
    productionMutations: manifest.productionMutations,
  }, {
    phase: "phase3-customer-workspace",
    postgresqlMajor: 16,
    externalConnections: 0,
    productionMutations: 0,
  });
  assert.deepEqual(manifest.artifacts.map(({ file, direction }) => [file, direction]), [
    ["202607310076_customer_workspace.up.sql", "up"],
    ["202607310076_customer_workspace.down.sql", "down"],
    ["202607310076_customer_workspace_assertions.sql", "verify"],
  ]);
  for (const artifact of manifest.artifacts) {
    const source = readFileSync(new URL(artifact.file, root));
    assert.equal(createHash("sha256").update(source).digest("hex"), artifact.sha256, artifact.file);
  }
});

test("customer workspace reads only linked store-scoped orders and deterministic neighbors", () => {
  assert.match(up, /CREATE FUNCTION saas[.]customers_get_workspace/);
  assert.match(up, /merchant_action_authority_error\([^;]+?'customers','customers[.]read'/s);
  assert.match(up, /selected[.]store_id = p_store_id/);
  assert.match(up, /candidate[.]store_id = p_store_id/g);
  assert.match(up, /linked_order[.]store_id = p_store_id/);
  assert.match(up, /linked_order[.]customer_id = p_customer_id/);
  assert.match(up, /\(candidate[.]created_at,candidate[.]id\) > \(current_customer[.]created_at,current_customer[.]id\)/);
  assert.match(up, /\(candidate[.]created_at,candidate[.]id\) < \(current_customer[.]created_at,current_customer[.]id\)/);
  assert.match(up, /ORDER BY candidate[.]created_at ASC,candidate[.]id ASC/);
  assert.match(up, /ORDER BY candidate[.]created_at DESC,candidate[.]id DESC/);
  assert.match(up, /LIMIT 50/);
  assert.doesNotMatch(up, /customer_email\s*=/);
});

test("customer workspace function has a narrow role boundary and bounded rollback", () => {
  const escaped = signature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  assert.match(up, /^BEGIN;\nSET LOCAL ROLE celebix_saas_owner;/);
  assert.match(up, new RegExp(`ALTER FUNCTION ${escaped} OWNER TO celebix_saas_owner`));
  assert.match(up, new RegExp(`REVOKE ALL ON FUNCTION ${escaped} FROM PUBLIC`));
  assert.match(up, new RegExp(`GRANT EXECUTE ON FUNCTION ${escaped} TO celebix_saas_app`));
  assert.match(down, /DROP FUNCTION saas[.]customers_get_workspace\(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid\)/);
  assert.match(assertions, /customer_workspace_contract_invalid/);
  for (const source of [up, down, assertions]) {
    assert.match(source, /COMMIT;\s*$/);
    assert.doesNotMatch(source, /postgres(?:ql)?:\/\//i);
  }
});
