import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("./", import.meta.url);
const up = readFileSync(new URL("202608010078_manual_order_drafts.up.sql", root), "utf8");
const down = readFileSync(new URL("202608010078_manual_order_drafts.down.sql", root), "utf8");
const assertions = readFileSync(new URL("202608010078_manual_order_drafts_assertions.sql", root), "utf8");
const manifest = JSON.parse(readFileSync(new URL("phase3-manual-order-drafts-manifest.json", root), "utf8")) as {
  phase: string;
  postgresqlMajor: number;
  externalConnections: number;
  productionMutations: number;
  artifacts: Array<{ file: string; direction: string; sha256: string }>;
};

const signatures = [
  "saas.order_drafts_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,integer,timestamptz,uuid)",
  "saas.order_drafts_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid)",
  "saas.order_drafts_create(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,jsonb)",
  "saas.order_drafts_update(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,jsonb)",
  "saas.order_drafts_archive(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint)",
  "saas.order_drafts_convert(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint)",
  "saas.order_drafts_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text)",
];

test("manual order draft artifacts are checksum pinned and production inert", () => {
  assert.deepEqual({
    phase: manifest.phase,
    postgresqlMajor: manifest.postgresqlMajor,
    externalConnections: manifest.externalConnections,
    productionMutations: manifest.productionMutations,
  }, {
    phase: "phase3-manual-order-drafts",
    postgresqlMajor: 16,
    externalConnections: 0,
    productionMutations: 0,
  });
  assert.deepEqual(manifest.artifacts.map(({ file, direction }) => [file, direction]), [
    ["202608010078_manual_order_drafts.up.sql", "up"],
    ["202608010078_manual_order_drafts.down.sql", "down"],
    ["202608010078_manual_order_drafts_assertions.sql", "verify"],
  ]);
  for (const artifact of manifest.artifacts) {
    assert.equal(createHash("sha256").update(readFileSync(new URL(artifact.file, root))).digest("hex"), artifact.sha256, artifact.file);
  }
});

test("manual order drafts have tenant-prefixed immutable authority and finite commerce constraints", () => {
  for (const table of ["order_drafts", "order_draft_lines", "order_draft_operations", "manual_order_inventory_commitments"]) {
    assert.match(up, new RegExp(`CREATE TABLE saas[.]${table}`));
    assert.match(up, new RegExp(`ALTER TABLE saas[.]${table} ENABLE ROW LEVEL SECURITY`));
    assert.match(up, new RegExp(`ALTER TABLE saas[.]${table} FORCE ROW LEVEL SECURITY`));
  }
  assert.match(up, /UNIQUE \(store_id, id\)/g);
  assert.match(up, /order_draft_operations_immutable/);
  assert.match(up, /ORDER_DRAFT_OPERATION_IMMUTABLE/);
  assert.match(up, /manual_order_inventory_commitments/);
  assert.match(up, /pg_catalog[.]isfinite\(created_at\)/);
  assert.match(up, /9007199254740991/);
  assert.match(up, /source IN \('storefront','quick_link','marketplace','manual_import','manual'\)/);
  assert.doesNotMatch(up, /jsonb_object_length/);
});

test("every draft endpoint checks server authority and exposes only app execution", () => {
  for (const signature of signatures) {
    const escaped = signature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(up, new RegExp(`ALTER FUNCTION ${escaped} OWNER TO celebix_saas_owner`));
    assert.match(up, new RegExp(`REVOKE ALL ON FUNCTION ${escaped} FROM PUBLIC`));
    assert.match(up, new RegExp(`GRANT EXECUTE ON FUNCTION ${escaped} TO celebix_saas_app`));
  }
  assert.match(up, /merchant_action_authority_error\([^;]+?'orders','orders[.]read'/s);
  assert.match(up, /merchant_action_authority_error\([^;]+?'orders','orders[.]manage'/s);
  assert.match(up, /draft[.]store_id=p_store_id/g);
  assert.match(up, /variant[.]store_id=p_store_id/g);
  assert.match(up, /product[.]store_id=p_store_id/g);
  assert.doesNotMatch(up, /storeId|principalId|membershipId|planId/);
});

test("conversion and cancellation are durable, inventory-aware, and replay-safe", () => {
  const statusTransition = up.slice(up.indexOf("CREATE OR REPLACE FUNCTION saas.orders_transition_status"));
  assert.match(up, /CREATE FUNCTION saas[.]order_drafts_convert/);
  assert.match(up, /source_marker','checkout_sale'/);
  assert.match(up, /source_marker','catalog_adjustment'/);
  assert.match(up, /MAN-/);
  assert.match(up, /INSERT INTO saas[.]orders/);
  assert.match(up, /INSERT INTO saas[.]order_items/);
  assert.match(up, /INSERT INTO saas[.]order_events/);
  assert.match(up, /INSERT INTO saas[.]manual_order_inventory_commitments/);
  assert.match(statusTransition, /restoration_operation_id IS NULL/);
  assert.match(statusTransition, /existing[.]operation_kind='transition_status'/);
  assert.ok(statusTransition.indexOf("existing.operation_kind='transition_status'") < statusTransition.indexOf("restoration_operation_id IS NULL"));
});

test("rollback removes the complete 078 surface and restores the legacy order source", () => {
  for (const functionName of ["order_drafts_list", "order_drafts_get", "order_drafts_create", "order_drafts_update", "order_drafts_archive", "order_drafts_convert", "order_drafts_recover_operation"]) {
    assert.match(down, new RegExp(`DROP FUNCTION saas[.]${functionName}`));
  }
  assert.match(down, /source IN \('storefront','quick_link','marketplace','manual_import'\)/);
  assert.match(down, /DROP TABLE saas[.]manual_order_inventory_commitments/);
  assert.match(down, /DROP TABLE saas[.]order_draft_operations/);
  assert.match(down, /DROP TABLE saas[.]order_draft_lines/);
  assert.match(down, /DROP TABLE saas[.]order_drafts/);
  assert.match(assertions, /manual_order_drafts_contract_invalid/);
  for (const source of [up, down, assertions]) {
    assert.match(source, /^BEGIN;\nSET LOCAL ROLE celebix_saas_owner;/);
    assert.match(source, /COMMIT;\s*$/);
    assert.doesNotMatch(source, /postgres(?:ql)?:\/\//i);
  }
});
