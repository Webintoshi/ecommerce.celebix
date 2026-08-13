import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("./", import.meta.url);
const files = {
  up: "202608130105_paytr_merchant_self_service.up.sql",
  down: "202608130105_paytr_merchant_self_service.down.sql",
  assertions: "202608130105_paytr_merchant_self_service_assertions.sql",
  manifest: "phase4v-paytr-merchant-self-service-manifest.json",
} as const;

function source(name: keyof typeof files): string {
  const url = new URL(files[name], root);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

test("105 finalizes validated PayTR credentials and method activation atomically", () => {
  const up = source("up");
  assert.match(up, /allows_verification_without_execution_authority=true/u);
  assert.match(up, /CREATE FUNCTION saas[.]paytr_merchant_self_service_mark_verification/u);
  assert.match(up, /merchant_provider_execution_authorities[\s\S]+FOR SHARE/u);
  assert.match(up, /payment_methods[\s\S]+ORDER BY method[.]id[\s\S]+FOR UPDATE/u);
  assert.match(up, /merchant_provider_profiles[\s\S]+FOR UPDATE/u);
  assert.match(up, /provider_code='paytr_iframe'/u);
  assert.match(up, /environment=p_environment/u);
  assert.match(up, /adapter_version=p_adapter_version/u);
  assert.match(up, /readiness=CASE p_environment/u);
  assert.match(up, /execution_evidence_digest=CASE[\s\S]+THEN authority[.]evidence_digest/u);
  assert.match(up, /state='disabled'[\s\S]+kind='provider'[\s\S]+state='active'/u);
  assert.match(up, /ON CONFLICT \(id\) DO UPDATE/u);
});

test("105 uses strict PayTR defaults and preserves emergency disablement", () => {
  const up = source("up");
  for (const field of ["environment", "locale", "threeDSecure", "installmentMode", "maxInstallment"]) {
    assert.match(up, new RegExp(field, "u"));
  }
  assert.match(up, /provider_managed/u);
  assert.match(up, /installmentMode','all'/u);
  assert.match(up, /maxInstallment',0/u);
  assert.match(up, /state='emergency_disabled'[\s\S]+THEN 'emergency_disabled'/u);
  assert.doesNotMatch(up, /merchantKey|merchantSalt|sealed_credentials/u);
});

test("105 keeps unavailable pending, rejects invalid credentials, and replays exactly", () => {
  const up = source("up");
  assert.match(up, /WHEN 'rejected' THEN 'rotation_required'[\s\S]+ELSE 'pending_validation'/u);
  assert.match(up, /operation_kind<>'validate'[\s\S]+operation_replayed/u);
  assert.match(up, /validation_lease_id=NULL,validation_lease_owner=NULL,validation_lease_expires_at=NULL/u);
  assert.match(up, /p_validation_outcome='validated'[\s\S]+authority[.]evidence_digest IS NOT NULL/u);
});

test("105 exposes only the exact workflow finalize boundary", () => {
  const up = source("up");
  const assertions = source("assertions");
  assert.match(up, /REVOKE ALL ON FUNCTION saas[.]paytr_merchant_self_service_mark_verification/u);
  assert.match(up, /GRANT EXECUTE ON FUNCTION saas[.]paytr_merchant_self_service_mark_verification[\s\S]+TO celebix_saas_workflow/u);
  assert.doesNotMatch(up, /TO celebix_saas_app/u);
  assert.doesNotMatch(up, /GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE)/iu);
  assert.match(assertions, /PAYTR_MERCHANT_SELF_SERVICE_FUNCTION_INVALID/u);
  assert.match(assertions, /PAYTR_MERCHANT_SELF_SERVICE_ACL_INVALID/u);
});

test("105 rollback is guarded and artifacts are PostgreSQL 16 checksum pinned", () => {
  const down = source("down");
  assert.match(down, /PAYTR_MERCHANT_SELF_SERVICE_DOWN_GUARD_REQUIRED/u);
  assert.match(down, /DROP FUNCTION saas[.]paytr_merchant_self_service_mark_verification/u);

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
    phase: "phase4v-paytr-merchant-self-service",
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
