import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("./", import.meta.url);
const files = {
  up: "202608140108_storefront_hosted_payment_execution_authority.up.sql",
  down: "202608140108_storefront_hosted_payment_execution_authority.down.sql",
  assertions: "202608140108_storefront_hosted_payment_execution_authority_assertions.sql",
  manifest: "phase4y-storefront-hosted-payment-execution-authority-manifest.json",
} as const;

function source(name: keyof typeof files): string {
  const url = new URL(files[name], root);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

test("108 exposes one exact hosted-payment authority check to the workflow role", () => {
  const up = source("up");
  assert.match(up, /CREATE OR REPLACE FUNCTION saas[.]storefront_hosted_payment_execution_authority_matches/u);
  assert.match(up, /SECURITY DEFINER/u);
  assert.match(up, /merchant_provider_execution_authority_visible/u);
  assert.match(up, /GRANT EXECUTE ON FUNCTION[\s\S]+TO celebix_saas_workflow/u);
  assert.doesNotMatch(up, /GRANT EXECUTE ON FUNCTION[\s\S]+merchant_provider_execution_authority_(?:matches|visible)[\s\S]+TO celebix_saas_workflow/u);
  assert.doesNotMatch(up, /CREATE OR REPLACE FUNCTION saas[.]merchant_provider_execution_authority_(?:matches|visible)/u);
});

test("108 pins the central guard and requires an owner-gated rollback", () => {
  const down = source("down");
  const assertions = source("assertions");
  assert.match(down, /STOREFRONT_HOSTED_PAYMENT_EXECUTION_AUTHORITY_DOWN_GUARD_REQUIRED/u);
  assert.match(down, /DROP FUNCTION saas[.]storefront_hosted_payment_execution_authority_matches/u);
  assert.match(assertions, /c89a8ab0d23d470a1603e6ceebf11b68/u);
  assert.match(assertions, /STOREFRONT_HOSTED_PAYMENT_EXECUTION_AUTHORITY_ACL_INVALID/u);
});

test("108 artifacts are PostgreSQL 16 checksum pinned", () => {
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
    phase: "phase4y-storefront-hosted-payment-execution-authority",
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
