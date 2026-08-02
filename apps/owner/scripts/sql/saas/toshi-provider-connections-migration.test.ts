import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("./", import.meta.url);
const files = {
  up: "202608020080_toshi_provider_connections.up.sql",
  down: "202608020080_toshi_provider_connections.down.sql",
  assertions: "202608020080_toshi_provider_connections_assertions.sql",
  manifest: "phase3-toshi-provider-connections-manifest.json",
} as const;

function source(name: keyof typeof files): string {
  const url = new URL(files[name], root);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

const up = source("up");
const down = source("down");
const assertions = source("assertions");

test("Toshi provider migration artifacts are complete checksum-pinned and production inert", () => {
  for (const name of Object.values(files)) {
    assert.equal(existsSync(new URL(name, root)), true, `${name} missing`);
  }
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
    phase: "phase3-toshi-provider-connections",
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

test("Toshi provider vault stores only encrypted store-scoped credentials", () => {
  assert.match(up, /CREATE TABLE saas[.]toshi_provider_configs/);
  assert.match(up, /CREATE TABLE saas[.]toshi_provider_operations/);
  assert.match(up, /CREATE TABLE saas[.]toshi_provider_events/);
  assert.match(up, /sealed_credentials jsonb NOT NULL/);
  assert.match(up, /credential_digest text NOT NULL/);
  assert.doesNotMatch(up, /api_key\s+text/i);
  assert.match(up, /p_value \?& ARRAY\['algorithm','ciphertext','iv','keyId','tag','version'\]/);
  assert.match(up, /RETURN COALESCE\(/);
  assert.doesNotMatch(up, /pg_catalog[.]coalesce/i);
  assert.match(up, /REFERENCES saas[.]stores\(id\) ON DELETE CASCADE/);
  assert.match(up, /CREATE UNIQUE INDEX toshi_provider_one_live_provider/);
  assert.match(up, /CREATE UNIQUE INDEX toshi_provider_one_default/);
  assert.match(up, /status = 'active' AND is_default/);
  for (const table of ["toshi_provider_configs", "toshi_provider_operations", "toshi_provider_events"]) {
    assert.match(up, new RegExp(`ALTER TABLE saas[.]${table} ENABLE ROW LEVEL SECURITY`));
    assert.match(up, new RegExp(`ALTER TABLE saas[.]${table} FORCE ROW LEVEL SECURITY`));
  }
});

test("Toshi provider functions reauthorize reads and writes and keep public projections secret-free", () => {
  for (const name of [
    "toshi_provider_list",
    "toshi_provider_connection_identity",
    "toshi_provider_connect",
    "toshi_provider_select_model",
    "toshi_provider_set_default",
    "toshi_provider_revoke",
    "toshi_provider_get_authority",
    "toshi_provider_recover_operation",
  ]) assert.match(up, new RegExp(`CREATE FUNCTION saas[.]${name}\\(`), name);

  assert.match(up, /merchant_action_authority_error\([^;]+?'catalog','configuration[.]read'/s);
  assert.match(up, /merchant_action_authority_error\([^;]+?'catalog','configuration[.]manage'/s);
  assert.match(up, /CREATE FUNCTION saas[.]toshi_provider_public_payload/);
  const projection = /CREATE FUNCTION saas[.]toshi_provider_public_payload[\s\S]+?\$toshi_provider_public_payload\$;/.exec(up)?.[0] ?? "";
  assert.doesNotMatch(projection, /sealed_credentials|credential_digest/);
  assert.match(up, /'operation_replayed'/);
  assert.match(up, /'operation_mismatch'/);
  assert.match(up, /expected_version/);
});

test("Toshi provider vault has narrow role grants append-only audit and bounded rollback", () => {
  assert.match(up, /REVOKE ALL ON TABLE saas[.]toshi_provider_configs,saas[.]toshi_provider_operations,saas[.]toshi_provider_events FROM PUBLIC/);
  assert.match(up, /GRANT EXECUTE ON FUNCTION saas[.]toshi_provider_list/);
  assert.match(up, /TO celebix_saas_app/);
  assert.match(up, /guard_toshi_provider_event_immutability/);
  assert.match(up, /BEFORE UPDATE OR DELETE ON saas[.]toshi_provider_events/);
  assert.match(down, /DROP TABLE saas[.]toshi_provider_events/);
  assert.match(down, /DROP TABLE saas[.]toshi_provider_operations/);
  assert.match(down, /DROP TABLE saas[.]toshi_provider_configs/);
  assert.match(assertions, /toshi_provider_connections_contract_invalid/);
  assert.doesNotMatch(assertions, /pg_catalog[.]information_schema/);
  for (const value of [up, down, assertions]) {
    assert.match(value, /^BEGIN;\nSET LOCAL ROLE celebix_saas_owner;/);
    assert.match(value, /COMMIT;\s*$/);
    assert.doesNotMatch(value, /postgres(?:ql)?:\/\//i);
  }
});
