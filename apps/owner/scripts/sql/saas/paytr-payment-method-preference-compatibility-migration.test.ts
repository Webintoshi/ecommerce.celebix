import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("./", import.meta.url);
const files = {
  up: "202608150111_paytr_payment_method_preference_compatibility.up.sql",
  down: "202608150111_paytr_payment_method_preference_compatibility.down.sql",
  assertions: "202608150111_paytr_payment_method_preference_compatibility_assertions.sql",
  manifest: "phase5b-paytr-payment-method-preference-compatibility-manifest.json",
} as const;

function source(name: keyof typeof files): string {
  const url = new URL(files[name], root);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

test("111 upgrades every PayTR method activation path to the exact preference config", () => {
  const up = source("up");
  for (const routine of [
    "paytr_iframe_test_payment_method_stage",
    "paytr_iframe_test_payment_method_activate_without_single_active_provider",
  ]) {
    assert.match(up, new RegExp(routine, "u"));
  }
  assert.match(up, /provider_payment_method_config_valid/u);
  assert.match(up, /PAYTR_PAYMENT_METHOD_PREFERENCE_RUNTIME_DRIFT/u);
  assert.match(up, /"environment":"test","locale":"tr","threeDSecure":"provider_managed","installmentMode":"all","maxInstallment":0/u);
  assert.doesNotMatch(up, /UPDATE saas[.]payment_methods/u);
});

test("111 verifies the upgraded routines and keeps rollback fail closed", () => {
  const down = source("down");
  const assertions = source("assertions");
  assert.match(assertions, /PAYTR_PAYMENT_METHOD_PREFERENCE_RUNTIME_INVALID/u);
  assert.match(assertions, /payment_methods_provider_preference_check/u);
  assert.match(assertions, /provider_payment_method_config_valid/u);
  assert.match(down, /allow_paytr_payment_method_preference_compatibility_down/u);
  assert.match(down, /PAYTR_PAYMENT_METHOD_PREFERENCE_DOWN_CONSTRAINT_PRESENT/u);
});

test("111 advances the PayTR activation attestation with the upgraded method routines", () => {
  const up = source("up");
  const down = source("down");
  const assertions = source("assertions");
  for (const artifact of [up, down, assertions]) {
    assert.match(artifact, /paytr_iframe_activation_preflight/u);
    assert.match(artifact, /01829110435e062c4913888205fa33a1/u);
    assert.match(artifact, /983bcbc4e737fa4b335fac93e7bf5188/u);
  }
  assert.match(assertions, /payment_provider_keyed_lifecycle_preflight/u);
});

test("111 keeps every dependent payment preflight pinned to the upgraded PayTR attestation", () => {
  const up = source("up");
  const down = source("down");
  const assertions = source("assertions");

  for (const artifact of [up, down, assertions]) {
    assert.match(artifact, /payment_method_single_active_provider_preflight/u);
    assert.match(artifact, /iyzico_iframe_tenant_evidence_preflight/u);
    assert.match(artifact, /iyzico_iframe_tenant_activation_runtime_preflight/u);
  }

  for (const upgradedHash of [
    "85a7339bdbcebd9c69ee5489f0481ce4",
    "37d62c7b91d55757f9b53647569c450b",
    "d8e63f02153e7eed8d18519f283b34d9",
  ]) {
    assert.match(up, new RegExp(upgradedHash, "u"));
    assert.match(assertions, new RegExp(upgradedHash, "u"));
  }

  assert.match(down, /4d2e4b456b88573c83de9bd47ce05f62/u);
  assert.match(down, /a37ea11ba2c517df0af952728ab2c7fb/u);
  assert.match(down, /e2fa7803e6d46741d33117e504436cf8/u);
});

test("111 artifacts are PostgreSQL 16 checksum pinned", () => {
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
    phase: "phase5b-paytr-payment-method-preference-compatibility",
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
});
