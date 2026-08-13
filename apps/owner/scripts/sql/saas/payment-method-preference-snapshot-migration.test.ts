import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("./", import.meta.url);
const files = {
  up: "202608120104_payment_method_preference_snapshot.up.sql",
  down: "202608120104_payment_method_preference_snapshot.down.sql",
  assertions: "202608120104_payment_method_preference_snapshot_assertions.sql",
  manifest: "phase4u-payment-method-preference-snapshot-manifest.json",
} as const;

function source(name: keyof typeof files): string {
  const url = new URL(files[name], root);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

test("104 validates exact executable-provider preferences and upgrades legacy rows", () => {
  const up = source("up");
  assert.match(up, /CREATE FUNCTION saas[.]provider_payment_method_config_valid/u);
  assert.match(up, /paytr_iframe.*iyzico_iframe/su);
  for (const field of ["environment", "locale", "threeDSecure", "installmentMode", "maxInstallment"]) {
    assert.match(up, new RegExp(field, "u"));
  }
  assert.match(up, /jsonb_object_keys/u);
  assert.match(up, /provider_managed/u);
  assert.match(up, /single_payment/u);
  assert.match(up, /UPDATE saas[.]payment_methods/u);
  assert.match(up, /payment_methods_provider_preference_check/u);
  assert.doesNotMatch(up, /pg_catalog[.]greatest/iu);
});

test("104 keeps attested Iyzico activation compatible with the strict preference shape", () => {
  const up = source("up");
  const down = source("down");
  const assertions = source("assertions");
  for (const routine of [
    "iyzico_iframe_tenant_evidence_begin_current",
    "iyzico_iframe_tenant_evidence_current",
    "iyzico_iframe_tenant_evidence_activate_current",
    "iyzico_iframe_tenant_activation_runtime_preflight",
  ]) {
    assert.match(up, new RegExp(routine, "u"));
    assert.match(down, new RegExp(routine, "u"));
  }
  assert.match(up, /PAYMENT_METHOD_PREFERENCE_ACTIVATION_RUNTIME_DRIFT/u);
  assert.match(up, /provider_payment_method_config_valid/u);
  assert.match(assertions, /PAYMENT_METHOD_PREFERENCE_ACTIVATION_RUNTIME_INVALID/u);
});

test("104 rollback restores the exact legacy environment-only config authority", () => {
  const down = source("down");
  assert.match(down, /UPDATE saas[.]payment_methods AS method/u);
  assert.match(down, /jsonb_build_object\('environment',method[.]config->>'environment'\)/u);
  assert.match(down, /payment_methods_provider_preference_check[\s\S]+UPDATE saas[.]payment_methods/u);
  assert.match(down, /PAYMENT_METHOD_PREFERENCE_LEGACY_CONFIG_RESTORE_INVALID/u);
});

test("104 snapshots persisted payment-method preferences under one row lock", () => {
  const up = source("up");
  assert.match(up, /ADD COLUMN method_config_snapshot jsonb/u);
  assert.match(up, /payment_attempt_bind_method_config/u);
  assert.match(up, /FROM saas[.]payment_methods AS method[\s\S]+FOR SHARE OF method/u);
  assert.match(up, /NEW[.]method_config_snapshot:=selected_config/u);
  assert.match(up, /payment_attempt_method_config_immutable/u);
  assert.match(up, /IS DISTINCT FROM OLD[.]method_config_snapshot/u);
  assert.match(up, /ALTER COLUMN method_config_snapshot SET NOT NULL/u);
  assert.doesNotMatch(up, /p_method_config|p_preferences|current_setting.*method_config/iu);
});

test("104 exposes the immutable snapshot through every payment authority projection", () => {
  const up = source("up");
  const begin = up.match(/CREATE OR REPLACE FUNCTION saas[.]payment_attempt_begin_projection[\s\S]+?(?=\nCREATE|\nREVOKE|\nCOMMIT;)/u)?.[0] ?? "";
  const authority = up.match(/CREATE OR REPLACE FUNCTION saas[.]payment_attempt_authority_projection[\s\S]+?(?=\nCREATE|\nREVOKE|\nCOMMIT;)/u)?.[0] ?? "";
  assert.match(begin, /'methodConfig',attempt[.]method_config_snapshot/u);
  assert.match(authority, /'methodConfig',attempt[.]method_config_snapshot/u);
  assert.doesNotMatch(begin, /method[.]config/u);
  assert.doesNotMatch(authority, /method[.]config/u);
});

test("104 rollback is explicitly guarded and catalog assertions cover authority", () => {
  const down = source("down");
  const assertions = source("assertions");
  assert.match(down, /allow_payment_method_preference_snapshot_down/u);
  assert.match(assertions, /PAYMENT_METHOD_PREFERENCE_SNAPSHOT_COLUMN_INVALID/u);
  assert.match(assertions, /PAYMENT_METHOD_PREFERENCE_SNAPSHOT_TRIGGER_INVALID/u);
  assert.match(assertions, /PAYMENT_METHOD_PREFERENCE_SNAPSHOT_PROJECTION_INVALID/u);
  assert.match(assertions, /PAYMENT_METHOD_PREFERENCE_SNAPSHOT_PRIVILEGE_INVALID/u);
  assert.doesNotMatch(source("up"), /GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE)/iu);
});

test("104 artifacts are checksum pinned", () => {
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
    phase: "phase4u-payment-method-preference-snapshot",
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
