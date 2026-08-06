import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("./", import.meta.url);
const files = Object.freeze({
  up: "202608060093_shipping_provider_foundation.up.sql",
  down: "202608060093_shipping_provider_foundation.down.sql",
  assertions: "202608060093_shipping_provider_foundation_assertions.sql",
  manifest: "phase4m-shipping-provider-foundation-manifest.json",
});

function source(name: keyof typeof files): string {
  const selected = new URL(files[name], root);
  return existsSync(selected) ? readFileSync(selected, "utf8") : "";
}

test("093 is additive forced-RLS secret-safe and function-only", () => {
  const up = source("up");
  for (const table of [
    "shipping_provider_definitions",
    "shipping_provider_profiles",
    "shipping_provider_resources",
    "shipping_validation_jobs",
    "shipping_operations",
  ]) {
    assert.match(up, new RegExp(`CREATE TABLE saas[.]${table}`, "u"), table);
    assert.match(up, new RegExp(`ALTER TABLE saas[.]${table} FORCE ROW LEVEL SECURITY`, "u"), table);
  }
  assert.doesNotMatch(up, /GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE)[\s\S]*shipping_/iu);
  assert.doesNotMatch(up, /\b(?:raw_token|plaintext_token|api_token)\b/iu);
  assert.match(up, /credential_envelope jsonb NOT NULL/u);
  assert.match(up, /credential_digest char[(]64[)] NOT NULL/u);
  assert.match(up, /shipping_credential_envelope_valid/u);
});

test("093 exposes exact application connection commands", () => {
  const up = source("up");
  for (const name of [
    "shipping_connection_current",
    "shipping_connection_setup",
    "shipping_connection_save",
    "shipping_connection_select_resources",
    "shipping_connection_revoke",
    "shipping_connection_recover_operation",
  ]) assert.match(up, new RegExp(`CREATE FUNCTION saas[.]${name}[(]`, "u"), name);
  assert.match(up, /'shipping[.]read'/u);
  assert.match(up, /'shipping[.]manage'/u);
  const appGrant = up.match(/GRANT EXECUTE ON FUNCTION[\s\S]*?TO celebix_saas_app;/u)?.[0] ?? "";
  assert.match(appGrant, /shipping_connection_current/u);
  assert.match(appGrant, /shipping_connection_setup/u);
  assert.match(appGrant, /shipping_connection_save/u);
  assert.doesNotMatch(appGrant, /shipping_validation_claim|shipping_validation_complete/u);
});

test("093 gives workflow only fenced validation authority", () => {
  const up = source("up");
  for (const name of [
    "shipping_validation_claim",
    "shipping_validation_claim_job",
    "shipping_validation_open_credential",
    "shipping_validation_complete",
    "shipping_validation_fail",
  ]) assert.match(up, new RegExp(`CREATE FUNCTION saas[.]${name}[(]`, "u"), name);
  assert.match(up, /FOR UPDATE OF candidate SKIP LOCKED LIMIT 1/u);
  assert.match(up, /credential_version/u);
  assert.match(up, /lease_id/u);
  assert.match(up, /fence_token/u);
  const workflowGrant = [...up.matchAll(/GRANT EXECUTE ON FUNCTION[\s\S]*?TO (celebix_saas_(?:app|workflow));/gu)]
    .find((match) => match[1] === "celebix_saas_workflow")?.[0] ?? "";
  assert.match(workflowGrant, /shipping_validation_claim/u);
  assert.doesNotMatch(workflowGrant, /shipping_connection_save|shipping_connection_revoke/u);
});

test("093 is rollback guarded and every artifact is digest pinned", () => {
  for (const name of Object.values(files)) assert.equal(existsSync(new URL(name, root)), true, `${name} missing`);
  const down = source("down");
  const assertions = source("assertions");
  assert.match(down, /SHIPPING_PROVIDER_FOUNDATION_DOWN_BLOCKED/u);
  assert.match(assertions, /SHIPPING_PROVIDER_FOUNDATION_CONTRACT_INVALID/u);
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
    phase: "phase4m-shipping-provider-foundation",
    postgresqlMajor: 16,
    externalConnections: 0,
    productionMutations: 0,
  });
  assert.deepEqual(manifest.artifacts.map(({ file, direction }) => [file, direction]), [
    [files.up, "up"], [files.down, "down"], [files.assertions, "verify"],
  ]);
  for (const artifact of manifest.artifacts) {
    assert.equal(createHash("sha256").update(readFileSync(new URL(artifact.file, root))).digest("hex"), artifact.sha256, artifact.file);
  }
});
