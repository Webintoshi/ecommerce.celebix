import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("./", import.meta.url);
const files = {
  up: "202608030081_storefront_design_workspace.up.sql",
  down: "202608030081_storefront_design_workspace.down.sql",
  assertions: "202608030081_storefront_design_workspace_assertions.sql",
  manifest: "phase3-storefront-design-workspace-manifest.json",
} as const;

function source(name: keyof typeof files): string {
  const url = new URL(files[name], root);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

const up = source("up");
const down = source("down");
const assertions = source("assertions");

test("081 owns one versioned design document per store", () => {
  assert.match(up, /CREATE TABLE saas[.]storefront_designs/);
  assert.match(up, /store_id uuid PRIMARY KEY REFERENCES saas[.]stores\(id\) ON DELETE RESTRICT/);
  assert.match(up, /draft_config jsonb NOT NULL/);
  assert.match(up, /published_config jsonb NOT NULL/);
  assert.match(up, /draft_version bigint NOT NULL DEFAULT 1/);
  assert.match(up, /published_version bigint NOT NULL DEFAULT 1/);
  assert.match(up, /CREATE TABLE saas[.]storefront_design_media/);
  assert.match(up, /stores\/['|][^\n]+\/design\//);
  assert.doesNotMatch(up, /GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE).*storefront_designs.*celebix_saas_(?:app|host_resolver)/is);
});

test("081 forces row security and append-only operation and publication evidence", () => {
  for (const table of ["storefront_designs", "storefront_design_media", "storefront_design_operations", "storefront_design_events"]) {
    assert.match(up, new RegExp(`ALTER TABLE saas[.]${table} ENABLE ROW LEVEL SECURITY`));
    assert.match(up, new RegExp(`ALTER TABLE saas[.]${table} FORCE ROW LEVEL SECURITY`));
  }
  assert.match(up, /guard_storefront_design_operation_immutability/);
  assert.match(up, /guard_storefront_design_event_immutability/);
  assert.match(up, /BEFORE UPDATE OR DELETE ON saas[.]storefront_design_operations/);
  assert.match(up, /BEFORE UPDATE OR DELETE ON saas[.]storefront_design_events/);
});

test("081 exposes only the five exact tenant-safe RPC signatures", () => {
  const signatures = [
    "storefront_design_get(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)",
    "storefront_design_save_draft(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,bigint,jsonb)",
    "storefront_design_publish(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,bigint,bigint)",
    "storefront_design_media_reserve(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,text,text,integer,integer,bigint,text)",
    "storefront_design_get_public(uuid,text,timestamp with time zone)",
  ];
  for (const signature of signatures) {
    const escaped = signature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(up, new RegExp(`GRANT EXECUTE ON FUNCTION saas[.]${escaped}`));
  }
  assert.match(up, /merchant_action_authority_error\([^;]+?'catalog','configuration[.]read'/s);
  assert.match(up, /merchant_action_authority_error\([^;]+?'catalog','configuration[.]manage'/s);
  assert.match(up, /operation_replayed/);
  assert.match(up, /operation_mismatch/);
  assert.match(up, /draft_version_conflict/);
  assert.match(up, /published_version_conflict/);
});

test("081 validates finite design JSON and prevents arbitrary admin URL writes", () => {
  assert.match(up, /storefront_design_document_valid\(p_store_id uuid,p_config jsonb,p_allow_legacy boolean\)/);
  assert.match(up, /primaryColor/);
  assert.match(up, /legacy_https/);
  assert.match(up, /p_allow_legacy/);
  assert.match(up, /catalog_categories/);
  assert.match(up, /merchant_admin_records/);
  assert.match(up, /storefront_design_media/);
  assert.doesNotMatch(up, /public_url\s*:=\s*p_/i);
  assert.match(up, /published_config=draft_config/);
});

test("081 artifacts are checksum pinned and rollback is guarded", () => {
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
    phase: "phase3-storefront-design-workspace",
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
  assert.match(down, /STORE_FRONT_DESIGN_WORKSPACE_DOWN_BLOCKED/);
  assert.match(assertions, /storefront_design_workspace_contract_invalid/);
  for (const sql of [up, down, assertions]) {
    assert.match(sql, /^BEGIN;\nSET LOCAL ROLE celebix_saas_owner;/);
    assert.match(sql, /COMMIT;\s*$/);
    assert.doesNotMatch(sql, /postgres(?:ql)?:\/\//i);
  }
});
